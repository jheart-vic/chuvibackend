// DAMAGE CASE (V1 batch 3 part 2, R6 / T3.08–T3.10; switch `damageCase`).
//
// "Damage holds the piece. 'Report problem: Damaged' at S2, S3 or S4 holds that
// piece and opens a damage case for the customer experience officer, with admin
// copied; the rest move on. The officer talks to the customer and marks
// 'Customer informed'. Only then can admin release the piece. If the hold will be
// long, the officer can approve partial delivery of the ready pieces; the second
// trip is free when the hold was our fault."
//
// Switch rule: the switch gates STARTING a damage report and a partial delivery.
// "Customer informed" and the admin release always work, so a case opened while
// the switch was on can always be finished with it off.
const BaseService = require('../services/base.service')
const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const ActivityModel = require('../models/activity.model')
const { STATION_STATUS, ROLE, TAG_STATE, ACTIVITY_TYPE, NOTIFICATION_TYPE, ORDER_STATUS, PAYMENT_ORDER_STATUS } = require('./constants')
const { isOn, OFF_MESSAGE } = require('./switches')
const { stationLabel } = require('./displayName')
const { isItemOnHold } = require('./itemHold')

const DAMAGE_STATIONS = {
    [STATION_STATUS.SORT_AND_PRETREAT_STATION]: ROLE.SORT_AND_PRETREAT,
    [STATION_STATUS.WASH_AND_DRY_STATION]: ROLE.WASH_AND_DRY,
    [STATION_STATUS.PRESSING_AND_IRONING_STATION]: ROLE.PRESS,
}
const taskKey = (order, item) => `damage-${order._id}-${item._id}`
const tagOf = (item) => item.tagId || item.type || 'A piece'
const nameOf = async (id) => (id ? (await UserModel.findById(id).select('fullName').lean())?.fullName || null : null)

async function reportDamage({ orderId, itemId, note, user }) {
    try {
        if (!(await isOn('damageCase'))) {
            return BaseService.sendFailedResponse({ error: `Reporting damage on its own ${OFF_MESSAGE.toLowerCase()} Use a hold with a reason.`, switchOff: true })
        }
        const text = String(note || '').trim()
        if (!text) return BaseService.sendFailedResponse({ error: 'Say what the damage is.' })
        const order = await BookOrderModel.findById(orderId)
        if (!order) return BaseService.sendFailedResponse({ error: 'Order not found' })
        const item = order.items.id(itemId)
        if (!item) return BaseService.sendFailedResponse({ error: 'Item not found in order' })
        const station = item.currentStation
        const stationRole = DAMAGE_STATIONS[station]
        if (!stationRole) {
            return BaseService.sendFailedResponse({ error: 'Damage is reported at Sort and Pretreat, Wash and Dry or Press, where the piece is.' })
        }
        if (user.userType !== ROLE.ADMIN && user.userType !== stationRole) {
            return BaseService.sendFailedResponse({ error: `This piece is at ${stationLabel(station)}. Only that station can report it.` })
        }
        if (isItemOnHold(item)) return BaseService.sendFailedResponse({ error: 'This piece is already on hold.' })

        const now = new Date()
        const byName = await nameOf(user.id)
        item.flaggedForReview = true
        item.holdDetails = {
            reason: 'damaged',
            note: text,
            assignTo: ROLE.ADMIN,
            heldAt: now,
            heldByOperatorId: user.id,
            heldByStation: station,
        }
        if (!(item.tagState || []).includes(TAG_STATE.DAMAGED)) item.tagState = [...(item.tagState || []), TAG_STATE.DAMAGED]
        item.damageCase = { status: 'open', note: text, station, openedAt: now, openedBy: user.id, openedByName: byName }
        item.actionLog.push({ action: 'damage_reported', note: text, timestamp: now })
        order.markModified('items')
        await order.save({ validateBeforeSave: false })

        const { openTask } = require('./careTasks')
        await openTask({
            key: taskKey(order, item),
            type: 'damage',
            title: 'Damage case: call the customer',
            detail: `${tagOf(item)} on order ${order.oscNumber} was reported damaged at ${stationLabel(station)}: ${text}. Call the customer, then mark Customer informed.`,
            order,
        })
        await ActivityModel.create({
            title: 'Damage reported',
            description: `${tagOf(item)} on order ${order.oscNumber} reported damaged at ${stationLabel(station)} by ${byName || 'staff'}: ${text}`,
            type: ACTIVITY_TYPE.ORDER_UPDATED,
            orderId: order._id,
            userId: user.id,
            reference: order.oscNumber,
        })
        return BaseService.sendSuccessResponse({
            message: { held: true, itemId: item._id, tagId: item.tagId || null, damageCase: item.damageCase },
        })
    } catch (error) {
        console.error('report damage failed:', error)
        return BaseService.sendFailedResponse({ error: 'Could not report the damage. Please try again.' })
    }
}

async function customerInformed({ orderId, itemId, note, user }) {
    try {
        const order = await BookOrderModel.findById(orderId)
        if (!order) return BaseService.sendFailedResponse({ error: 'Order not found' })
        const item = order.items.id(itemId)
        if (!item || !item.damageCase?.status) return BaseService.sendFailedResponse({ error: 'This piece has no damage case.' })
        if (item.damageCase.status !== 'open') {
            return BaseService.sendFailedResponse({ error: 'Customer informed was already marked for this piece.' })
        }
        const now = new Date()
        const byName = await nameOf(user.id)
        item.damageCase.status = 'customer-informed'
        item.damageCase.customerInformedAt = now
        item.damageCase.customerInformedBy = user.id
        item.damageCase.customerInformedByName = byName
        if (note) item.damageCase.customerInformedNote = String(note).trim()
        item.actionLog.push({ action: 'customer_informed', note: String(note || '').trim(), timestamp: now })
        order.markModified('items')
        await order.save({ validateBeforeSave: false })

        const CareTaskModel = require('../models/careTask.model')
        await CareTaskModel.updateOne(
            { key: taskKey(order, item), status: 'open' },
            { $set: { status: 'closed', closedAt: now, closedBy: user.id, closeReason: 'Customer informed' } },
        )
        try {
            const { notifyRoles } = require('./notifyRoles')
            await notifyRoles({
                roles: [ROLE.ADMIN],
                title: 'Customer informed: piece can be released',
                body: `${tagOf(item)} on order ${order.oscNumber}: customer care has told the customer about the damage. Admin can release it now.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })
        } catch (e) {
            console.error('customer informed notify failed:', e?.message)
        }
        await ActivityModel.create({
            title: 'Customer informed',
            description: `${tagOf(item)} on order ${order.oscNumber}: customer informed of the damage by ${byName || 'customer care'}`,
            type: ACTIVITY_TYPE.ORDER_UPDATED,
            orderId: order._id,
            userId: user.id,
            reference: order.oscNumber,
        })
        return BaseService.sendSuccessResponse({ message: { itemId: item._id, tagId: item.tagId || null, damageCase: item.damageCase } })
    } catch (error) {
        console.error('customer informed failed:', error)
        return BaseService.sendFailedResponse({ error: 'Could not save Customer informed. Please try again.' })
    }
}

/** Admin release gate: a damaged piece needs "Customer informed" first. */
function damageReleaseRefusal(items) {
    const blocked = (items || []).filter((i) => i.damageCase?.status === 'open')
    if (!blocked.length) return null
    return {
        error: `Customer care must mark "Customer informed" before ${blocked.map(tagOf).join(', ')} can be released.`,
        customerInformedRequired: true,
    }
}

/** Called after an admin release: the damage case is done. */
function markDamageReleased(item, now = new Date()) {
    if (item?.damageCase?.status && item.damageCase.status !== 'released') {
        item.damageCase.status = 'released'
        item.damageCase.releasedAt = now
    }
}

// PARTIAL DELIVERY: the held damaged piece(s) move to a follow-on order (its own
// OSC number, linked both ways) so the ready pieces can reach QC and go out. The
// follow-on order's delivery is free when the hold was our fault; otherwise it
// carries the delivery fee and cannot be dispatched until paid (the normal gate).
async function approvePartialDelivery({ orderId, reason, ourFault, user }) {
    try {
        if (!(await isOn('damageCase'))) {
            return BaseService.sendFailedResponse({ error: `Partial delivery ${OFF_MESSAGE.toLowerCase()}`, switchOff: true })
        }
        const text = String(reason || '').trim()
        if (!text) return BaseService.sendFailedResponse({ error: 'Give a reason for the partial delivery.' })
        if (typeof ourFault !== 'boolean') {
            return BaseService.sendFailedResponse({ error: 'Say whether the hold was our fault (ourFault true or false): the second trip is free when it was.' })
        }
        const order = await BookOrderModel.findById(orderId)
        if (!order) return BaseService.sendFailedResponse({ error: 'Order not found' })
        const done = [ORDER_STATUS.DELIVERED, ORDER_STATUS.COLLECTED, ORDER_STATUS.CANCELLED, ORDER_STATUS.RETURNED_UNWASHED, ORDER_STATUS.READY, ORDER_STATUS.OUT_FOR_DELIVERY]
        if (done.includes(order.stage?.status)) {
            return BaseService.sendFailedResponse({ error: 'Partial delivery is approved while the order is still on the floor.' })
        }
        if (order.partialDelivery?.childOrderId) {
            return BaseService.sendFailedResponse({ error: `Partial delivery was already approved (follow-on order ${order.partialDelivery.childOscNumber}).` })
        }
        const held = order.items.filter((i) => isItemOnHold(i) && ['open', 'customer-informed'].includes(i.damageCase?.status))
        if (!held.length) return BaseService.sendFailedResponse({ error: 'Partial delivery is for an order with a damaged piece on hold.' })
        if (held.length === order.items.length) {
            return BaseService.sendFailedResponse({ error: 'Every piece on this order is held, so there is nothing ready to deliver.' })
        }

        const { nextOscNumber } = require('./orderNumber')
        const AdminSettingModel = require('../models/adminSetting.model')
        const s = await AdminSettingModel.findOne().select('deliveryFee').lean()
        const fee = ourFault || !order.isDelivery ? 0 : Number(s?.deliveryFee ?? 500)
        const now = new Date()
        const byName = await nameOf(user.id)
        const heldIds = new Set(held.map((i) => String(i._id)))
        const moved = held.map((i) => i.toObject())
        const minStation = moved.map((i) => i.currentStation).sort((a, b) => BookOrderModel.STATION_SEQUENCE.indexOf(a) - BookOrderModel.STATION_SEQUENCE.indexOf(b))[0]
        const child = await BookOrderModel.create({
            userId: order.userId,
            fullName: order.fullName,
            phoneNumber: order.phoneNumber,
            pickupAddress: order.pickupAddress,
            deliveryAddress: order.deliveryAddress,
            serviceType: order.serviceType,
            serviceTier: order.serviceTier,
            deliverySpeed: order.deliverySpeed,
            deliveryDate: order.deliveryDate,
            scheduling: order.scheduling,
            channel: order.channel,
            isPickUp: false,
            isDelivery: order.isDelivery,
            billingType: order.billingType,
            amount: fee,
            deliveryAmount: fee,
            paymentStatus: fee > 0 ? PAYMENT_ORDER_STATUS.PENDING : PAYMENT_ORDER_STATUS.SUCCESS,
            ...(fee > 0 ? {} : { paymentDate: now }),
            oscNumber: await nextOscNumber(),
            items: moved,
            extraNote: `Rest of order ${order.oscNumber} (partial delivery: ${text})${fee ? '' : '. Second trip free.'}`,
            stage: { status: ORDER_STATUS.WASHING, note: `Rest of order ${order.oscNumber}`, updatedAt: now },
            stageHistory: [{ status: ORDER_STATUS.WASHING, note: `Partial delivery of ${order.oscNumber}: held piece(s) moved here`, updatedAt: now }],
            stationStatus: minStation,
            dispatchDetails: { pickup: { status: 'picked-up' } },
            parentOrderId: order._id,
            parentOscNumber: order.oscNumber,
        })
        const summary = child.summaryStatus && child.summaryStatus()
        if (summary) await BookOrderModel.updateOne({ _id: child._id }, { $set: { 'stage.status': summary, 'stageHistory.0.status': summary } })

        // The parent keeps only the ready pieces; pending handoffs stop claiming the moved ones.
        order.items = order.items.filter((i) => !heldIds.has(String(i._id)))
        for (const h of order.handoffs || []) {
            if (h.status !== 'pending') continue
            h.itemIds = (h.itemIds || []).filter((id) => !heldIds.has(String(id)))
            h.count = h.itemIds.length
            if (!h.count) h.status = 'superseded'
        }
        order.partialDelivery = {
            approvedAt: now,
            approvedBy: user.id,
            approvedByName: byName,
            reason: text,
            ourFault,
            childOrderId: child._id,
            childOscNumber: child.oscNumber,
            tagIds: held.map(tagOf),
        }
        const sum = order.summaryStatus()
        if (sum && sum !== order.stage.status) {
            order.stage.status = sum
            order.stage.updatedAt = now
            order.stageHistory.push({ status: sum, note: `Partial delivery approved: ${held.map(tagOf).join(', ')} moved to ${child.oscNumber}`, updatedAt: now })
        }
        order.markModified('items')
        await order.save({ validateBeforeSave: false })

        await ActivityModel.create({
            title: 'Partial delivery approved',
            description: `Order ${order.oscNumber}: ${held.map(tagOf).join(', ')} moved to ${child.oscNumber} by ${byName || 'customer care'}${fee ? `; second trip N${fee}` : '; second trip free'}. ${text}`,
            type: ACTIVITY_TYPE.ORDER_UPDATED,
            orderId: order._id,
            userId: user.id,
            reference: order.oscNumber,
        })
        return BaseService.sendSuccessResponse({
            message: {
                orderId: order._id,
                oscNumber: order.oscNumber,
                remainingPieces: order.items.length,
                followOnOrderId: child._id,
                followOnOscNumber: child.oscNumber,
                movedTagIds: held.map(tagOf),
                secondTripFee: fee,
                secondTripFree: fee === 0,
            },
        })
    } catch (error) {
        console.error('partial delivery failed:', error)
        return BaseService.sendFailedResponse({ error: 'Could not approve the partial delivery. Please try again.' })
    }
}

module.exports = { reportDamage, customerInformed, damageReleaseRefusal, markDamageReleased, approvePartialDelivery, DAMAGE_STATIONS }
