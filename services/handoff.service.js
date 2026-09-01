const BaseService = require('./base.service')
const BookOrderModel = require('../models/bookOrder.model')
const ActivityModel = require('../models/activity.model')
const createNotification = require('../util/createNotification')
const { getObjectId } = require('../util/helper')
const {
    STATION_STATUS,
    ORDER_STATUS,
    ROLE,
    ACTIVITY_TYPE,
    NOTIFICATION_TYPE,
} = require('../util/constants')

// Customer notification fired when the order's computed summary ENTERS a stage
// (ported from the old whole-order advance actions so the messages aren't lost).
const STAGE_ENTRY_NOTICE = {
    [ORDER_STATUS.SORT_AND_PRETREAT]: {
        title: 'Order in Sort & Pretreat',
        body: (osc) => `Order ${osc} is now in the Sort & Pretreat station.`,
        type: NOTIFICATION_TYPE.ORDER_UPDATED,
    },
    [ORDER_STATUS.WASHING]: {
        title: 'Your order is being washed',
        body: (osc) => `Order ${osc} is now being washed.`,
        type: NOTIFICATION_TYPE.ORDER_WASHING,
    },
    [ORDER_STATUS.IRONING]: {
        title: 'Your order is being ironed',
        body: (osc) => `Order ${osc} is now being ironed.`,
        type: NOTIFICATION_TYPE.ORDER_IRONING,
    },
    [ORDER_STATUS.QC]: {
        title: 'Your order is in final checks',
        body: (osc) => `Order ${osc} is now in quality control.`,
        type: NOTIFICATION_TYPE.ORDER_UPDATED,
    },
}

const SEQ = BookOrderModel.STATION_SEQUENCE
const STATION_TO_ORDER_STATUS = BookOrderModel.STATION_TO_ORDER_STATUS

// Which item status marks an item DONE at a given station (gate for leaving it).
function itemCompleteAt(item, station) {
    switch (station) {
        case STATION_STATUS.INTAKE_AND_TAG_STATION:
            return item.tagStatus === 'complete'
        case STATION_STATUS.SORT_AND_PRETREAT_STATION:
            return (
                ['complete', 'not_required'].includes(item.sortStatus) &&
                ['complete', 'not_required'].includes(item.pretreatStatus)
            )
        case STATION_STATUS.WASH_AND_DRY_STATION:
            return item.washStatus === 'complete'
        case STATION_STATUS.PRESSING_AND_IRONING_STATION:
            return item.pressStatus === 'complete'
        case STATION_STATUS.QC_STATION:
            return item.qcStatus === 'passed'
        default:
            return true
    }
}

const STATION_TO_ROLE = {
    [STATION_STATUS.INTAKE_AND_TAG_STATION]: ROLE.INTAKE_AND_TAG,
    [STATION_STATUS.SORT_AND_PRETREAT_STATION]: ROLE.SORT_AND_PRETREAT,
    [STATION_STATUS.WASH_AND_DRY_STATION]: ROLE.WASH_AND_DRY,
    [STATION_STATUS.PRESSING_AND_IRONING_STATION]: ROLE.PRESS,
    [STATION_STATUS.QC_STATION]: ROLE.QC,
}

// Readable item helpers (items are per-piece: one physical item = one record).
// Works for both Mongoose subdoc arrays and lean plain arrays.
function itemBrief(items, id) {
    const it = (items || []).find((i) => String(i._id) === String(id))
    if (!it) return { itemId: String(id), name: 'Item', quantity: 1 }
    return {
        itemId: String(it._id),
        tagId: it.tagId || '',
        name: it.type,
        quantity: it.quantity || 1,
    }
}

function briefsForIds(items, ids) {
    return (ids || []).map((id) => itemBrief(items, id))
}

// "5 Shirts, 3 Trousers" — groups briefs by name, sums the piece counts, and
// capitalises each name for display (types are often stored lower-case).
function summarize(briefs) {
    const counts = {}
    for (const b of briefs || []) {
        const name = b.name || 'Item'
        counts[name] = (counts[name] || 0) + (b.quantity || 1)
    }
    return Object.entries(counts)
        .map(([name, c]) => {
            const label = name.charAt(0).toUpperCase() + name.slice(1)
            return `${c} ${c > 1 && !/s$/i.test(label) ? `${label}s` : label}`
        })
        .join(', ')
}

// Hard gates: S1→S2 and S4→S5 move the WHOLE order; the stretch zone
// (S2↔S3↔S4) allows partial pushes.
function isWholeOrderGate(fromIdx, toIdx) {
    return fromIdx === 0 || toIdx === SEQ.length - 1
}

class HandoffService extends BaseService {
    // Push items from one station to the next (creates a pending handoff record).
    async push(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id
            const { fromStation, toStation, itemIds, note = '' } = req.body

            const fromIdx = SEQ.indexOf(fromStation)
            const toIdx = SEQ.indexOf(toStation)
            if (fromIdx === -1 || toIdx === -1) {
                return BaseService.sendFailedResponse({
                    error: 'fromStation and toStation must be valid pipeline stations',
                })
            }
            if (toIdx <= fromIdx) {
                return BaseService.sendFailedResponse({
                    error: 'A handoff must move items forward to a later station',
                })
            }

            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }
            if (order.stage.status === ORDER_STATUS.CANCELLED) {
                return BaseService.sendFailedResponse({
                    error: 'Order is cancelled',
                })
            }

            // Items currently sitting at the source station.
            const atFrom = order.items.filter(
                (i) => (i.currentStation || SEQ[0]) === fromStation,
            )
            if (!atFrom.length) {
                return BaseService.sendFailedResponse({
                    error: `No items are currently at ${fromStation}`,
                })
            }

            // Resolve the target items (explicit ids, else all items at source).
            let targets
            if (Array.isArray(itemIds) && itemIds.length) {
                const wanted = itemIds.map(String)
                targets = order.items.filter((i) =>
                    wanted.includes(String(i._id)),
                )
                const bad = targets.find(
                    (i) => (i.currentStation || SEQ[0]) !== fromStation,
                )
                if (targets.length !== wanted.length || bad) {
                    return BaseService.sendFailedResponse({
                        error: 'Some itemIds are not valid items currently at the source station',
                    })
                }
            } else {
                targets = atFrom
            }

            // Completion gate — every pushed item must be done at the source.
            const incomplete = targets.filter(
                (i) => !itemCompleteAt(i, fromStation),
            )
            if (incomplete.length) {
                return BaseService.sendFailedResponse({
                    error: `${incomplete.length} item(s) are not yet completed at ${fromStation} and cannot be pushed`,
                })
            }

            // Whole-order gate for S1→S2 and S4→S5.
            if (isWholeOrderGate(fromIdx, toIdx)) {
                if (!order.isWholeAt(fromStation)) {
                    return BaseService.sendFailedResponse({
                        error: `${fromStation} → ${toStation} must move the whole order — all items must be at ${fromStation} first`,
                    })
                }
                if (targets.length !== order.items.length) {
                    return BaseService.sendFailedResponse({
                        error: `${fromStation} → ${toStation} must include every item in the order`,
                    })
                }
            }

            const targetIds = targets.map((i) => i._id)

            // Repeat-delivery merge: fold into an existing pending handoff for the
            // same from→to instead of creating a duplicate.
            const existing = order.handoffs.find(
                (h) =>
                    h.status === 'pending' &&
                    h.fromStation === fromStation &&
                    h.toStation === toStation,
            )
            let handoff
            if (existing) {
                const have = new Set(existing.itemIds.map(String))
                for (const id of targetIds) {
                    if (!have.has(String(id))) existing.itemIds.push(id)
                }
                existing.count = existing.itemIds.length
                existing.pushedBy = getObjectId(userId)
                existing.pushedAt = new Date()
                if (note) existing.note = note
                handoff = existing
            } else {
                order.handoffs.push({
                    fromStation,
                    toStation,
                    itemIds: targetIds,
                    count: targetIds.length,
                    status: 'pending',
                    pushedBy: getObjectId(userId),
                    pushedAt: new Date(),
                    note,
                })
                handoff = order.handoffs[order.handoffs.length - 1]
            }

            await order.save({ validateBeforeSave: false })

            await ActivityModel.create({
                title: 'Items Pushed to Next Station',
                description: `${handoff.count} item(s) on order ${order.oscNumber} pushed from ${fromStation} to ${toStation}.`,
                type: ACTIVITY_TYPE.ORDER_STATUS_UPDATED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            const pushedBriefs = briefsForIds(order.items, handoff.itemIds)
            return BaseService.sendSuccessResponse({
                message: {
                    handoffId: handoff._id,
                    fromStation,
                    toStation,
                    count: handoff.count,
                    status: handoff.status,
                    itemIds: handoff.itemIds,
                    items: pushedBriefs,
                    summary: summarize(pushedBriefs),
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    // Receiving station confirms a pending handoff. Accepted items advance to the
    // toStation; rejected items go to Hold and stay at the fromStation.
    async confirm(req) {
        try {
            const orderId = req.params.id
            const handoffId = req.params.hid
            const userId = req.user.id
            const { rejectedItems = [], note = '' } = req.body

            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }

            const handoff = order.handoffs.id(handoffId)
            if (!handoff) {
                return BaseService.sendFailedResponse({
                    error: 'Handoff not found',
                })
            }
            if (handoff.status !== 'pending') {
                return BaseService.sendFailedResponse({
                    error: 'This handoff has already been confirmed',
                })
            }

            const handoffIds = handoff.itemIds.map(String)
            const rejected = (rejectedItems || []).map(String)
            const badReject = rejected.find((id) => !handoffIds.includes(id))
            if (badReject) {
                return BaseService.sendFailedResponse({
                    error: 'rejectedItems must be a subset of the handoff items',
                })
            }
            const accepted = handoffIds.filter((id) => !rejected.includes(id))

            // Hard gates (S1→S2, S4→S5) move the WHOLE order. The push already
            // enforced that; enforce it HERE too, or a partial CONFIRM would
            // still split the order — e.g. QC accepting 8 of 10 items, which is
            // exactly what "nothing partial reaches S5" forbids.
            const fromIdx = SEQ.indexOf(handoff.fromStation)
            const toIdx = SEQ.indexOf(handoff.toStation)
            if (isWholeOrderGate(fromIdx, toIdx)) {
                if (rejected.length && accepted.length) {
                    return BaseService.sendFailedResponse({
                        error: `${handoff.fromStation} → ${handoff.toStation} moves the whole order — accept every item or reject every item`,
                    })
                }
                if (!order.isWholeAt(handoff.fromStation)) {
                    return BaseService.sendFailedResponse({
                        error: `${handoff.fromStation} → ${handoff.toStation} must move the whole order — all items must still be at ${handoff.fromStation}`,
                    })
                }
            }

            const now = new Date()
            const finalStatus = accepted.length ? 'confirmed' : 'rejected'

            // Atomic claim: flip this handoff pending → its final status so ONLY
            // ONE concurrent confirm proceeds to move items (no split-write race).
            const claim = await BookOrderModel.updateOne(
                {
                    _id: orderId,
                    handoffs: {
                        $elemMatch: {
                            _id: getObjectId(handoffId),
                            status: 'pending',
                        },
                    },
                },
                {
                    $set: {
                        'handoffs.$.status': finalStatus,
                        'handoffs.$.confirmedBy': getObjectId(userId),
                        'handoffs.$.confirmedAt': now,
                        'handoffs.$.confirmedCount': accepted.length,
                        'handoffs.$.rejectedItemIds': rejected,
                        ...(note ? { 'handoffs.$.note': note } : {}),
                    },
                },
            )
            if (claim.modifiedCount !== 1) {
                return BaseService.sendFailedResponse({
                    error: 'This handoff has already been confirmed',
                })
            }

            // Accepted items advance to the receiving station (+ per-item log so
            // the item timeline shows every station hop).
            for (const id of accepted) {
                const item = order.items.id(id)
                if (!item) continue
                item.currentStation = handoff.toStation
                item.actionLog.push({
                    action: 'handoff_received',
                    note: `${handoff.fromStation} → ${handoff.toStation}`,
                    timestamp: now,
                })
            }
            // Rejected items → Hold, assigned back to the source station.
            for (const id of rejected) {
                const item = order.items.id(id)
                if (!item) continue
                item.flaggedForReview = true
                item.holdDetails = {
                    reason: 'handoff-rejected',
                    note,
                    assignTo: STATION_TO_ROLE[handoff.fromStation],
                    heldAt: now,
                    heldByOperatorId: getObjectId(userId),
                    heldByStation: handoff.toStation,
                }
                item.actionLog.push({
                    action: 'handoff_rejected',
                    note,
                    timestamp: now,
                })
            }

            // (handoff status/confirmed fields were set atomically by the claim
            // above — do NOT mutate them in memory or the save would overwrite.)

            // Recompute the order summary from where items now sit. Only push a
            // stageHistory entry when the stage actually CHANGES, so partial
            // pushes don't spam the timeline with duplicate stage markers.
            const prevStatus = order.stage.status
            const summary = order.summaryStatus()
            let enteredStage = null
            if (summary) {
                order.stage.updatedAt = now
                order.stationStatus = this._minStation(order)
                if (summary !== prevStatus) {
                    order.stage.status = summary
                    order.stage.note = ''
                    order.stageHistory.push({
                        status: summary,
                        note: `Handoff ${handoff.fromStation} → ${handoff.toStation} confirmed`,
                        updatedAt: now,
                    })
                    enteredStage = summary
                }
            }

            await order.save({ validateBeforeSave: false })

            // Port the old advance-action customer notification (fire once, on entry).
            if (enteredStage && order.userId && STAGE_ENTRY_NOTICE[enteredStage]) {
                const n = STAGE_ENTRY_NOTICE[enteredStage]
                await createNotification({
                    userId: order.userId,
                    title: n.title,
                    body: n.body(order.oscNumber),
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: n.type,
                })
            }

            await ActivityModel.create({
                title: 'Handoff Confirmed',
                description: `Order ${order.oscNumber}: ${accepted.length} item(s) received at ${handoff.toStation}${rejected.length ? `, ${rejected.length} rejected to hold` : ''}.`,
                type: ACTIVITY_TYPE.ORDER_STATUS_UPDATED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            const acceptedBriefs = briefsForIds(order.items, accepted)
            const rejectedBriefs = briefsForIds(order.items, rejected)
            return BaseService.sendSuccessResponse({
                message: {
                    handoffId: handoff._id,
                    status: finalStatus,
                    confirmedCount: accepted.length,
                    rejectedItemIds: rejected,
                    accepted: acceptedBriefs,
                    rejected: rejectedBriefs,
                    summary: summarize(acceptedBriefs),
                    stageStatus: order.stage.status,
                    stationStatus: order.stationStatus,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    // Inbound queue: pending handoffs, optionally filtered to one receiving station.
    async pendingQueue(req) {
        try {
            const { toStation } = req.query
            const match = { 'handoffs.status': 'pending' }
            if (toStation) match['handoffs.toStation'] = toStation

            const orders = await BookOrderModel.find(match)
                .select('oscNumber fullName serviceType serviceTier handoffs items stage createdAt')
                .lean()

            const queue = []
            for (const o of orders) {
                for (const h of o.handoffs || []) {
                    if (h.status !== 'pending') continue
                    if (toStation && h.toStation !== toStation) continue
                    const briefs = briefsForIds(o.items, h.itemIds)
                    queue.push({
                        orderId: o._id,
                        oscNumber: o.oscNumber,
                        fullName: o.fullName,
                        handoffId: h._id,
                        fromStation: h.fromStation,
                        toStation: h.toStation,
                        count: h.count,
                        itemIds: h.itemIds,
                        items: briefs,
                        summary: summarize(briefs),
                        pushedAt: h.pushedAt,
                    })
                }
            }
            queue.sort((a, b) => new Date(a.pushedAt) - new Date(b.pushedAt))

            return BaseService.sendSuccessResponse({ message: queue })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    // Per-station breakdown for one order + its pending handoffs.
    async splitState(req) {
        try {
            const orderId = req.params.id
            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }

            const stations = SEQ.map((station) => {
                const items = order.items
                    .filter((i) => (i.currentStation || SEQ[0]) === station)
                    .map((i) => ({
                        itemId: i._id,
                        tagId: i.tagId || '',
                        name: i.type,
                        quantity: i.quantity || 1,
                        onHold: !!i.flaggedForReview,
                    }))
                return {
                    station,
                    items,
                    count: items.length,
                    summary: summarize(items),
                }
            })

            const pendingHandoffs = (order.handoffs || [])
                .filter((h) => h.status === 'pending')
                .map((h) => {
                    const briefs = briefsForIds(order.items, h.itemIds)
                    return {
                        handoffId: h._id,
                        fromStation: h.fromStation,
                        toStation: h.toStation,
                        count: h.count,
                        itemIds: h.itemIds,
                        items: briefs,
                        summary: summarize(briefs),
                        pushedAt: h.pushedAt,
                    }
                })

            return BaseService.sendSuccessResponse({
                message: {
                    orderId: order._id,
                    oscNumber: order.oscNumber,
                    stageStatus: order.stage.status,
                    stationStatus: order.stationStatus,
                    countByStation: order.countByStation(),
                    stations,
                    pendingHandoffs,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    // Order-level station = the least-advanced station any item sits at.
    _minStation(order) {
        let minIdx = SEQ.length
        for (const item of order.items || []) {
            const idx = SEQ.indexOf(item.currentStation || SEQ[0])
            if (idx !== -1 && idx < minIdx) minIdx = idx
        }
        return SEQ[Math.min(minIdx, SEQ.length - 1)]
    }
}

module.exports = HandoffService
