// IRON ONLY "LOOKS DIRTY" (V1 batch 3 part 2, R8 / T4.03–T4.08; switch
// `ironOnlyUpgrade`).
//
// "At S2 each piece has its own 'Looks dirty, suggest washing' option. The
// suggestion appears for S1. S1 calls the customer ... If the customer agrees, S1
// changes that piece to Wash and Iron and a payment link goes for the full
// difference. Paying is the approval. If the link is not paid within the time
// limit (setting, 3 hours), the link is cancelled, the piece is pressed as booked,
// a note is saved and the customer is messaged. The other pieces carry on."
//
// Money follows the redelivery-fee pattern (util/redeliveryFee.js): the order's
// amount and balanceDue go up by the difference and it reads unpaid; the normal
// Pay link / webhook settles it. No payment hold, so the other pieces keep moving.
// No recount cover (R17: never on a service change the customer accepts).
//
// Switch rule: the switch gates only S2 STARTING a suggestion. S1's change,
// decline, the payment and the expiry always work, so nothing is left waiting.
const BaseService = require('../services/base.service')
const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const ActivityModel = require('../models/activity.model')
const { STATION_STATUS, ROLE, ORDER_SERVICE_TYPE, ACTIVITY_TYPE, NOTIFICATION_TYPE } = require('./constants')
const { isOn, OFF_MESSAGE } = require('./switches')
const { serviceOf } = require('./routes')
const { isItemOnHold } = require('./itemHold')

const OPEN = ['suggested', 'link-sent']
const tagOf = (item) => item?.tagId || item?.type || 'A piece'
const nameOf = async (id) => (id ? (await UserModel.findById(id).select('fullName').lean())?.fullName || null : null)
const firstName = (order) => String(order?.fullName || '').trim().split(/\s+/)[0] || 'Hello'
const isOpen = (item) => OPEN.includes(item?.dirtySuggestion?.status)
// The client's texts (16 Oct) name the piece as "{item}": e.g. "shirt (TAG 03)".
const itemWords = (item) => {
    const name = String(item?.type || 'item').replace(/[-_]+/g, ' ').trim().toLowerCase()
    return item?.tagId ? `${name} (${item.tagId})` : name
}
// "{time}": the clock in Lagos, with the day when it is not today.
const timeWords = (d, now = new Date()) => {
    const t = new Date(d)
    let h = t.getHours()
    const m = String(t.getMinutes()).padStart(2, '0')
    const ap = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    const clock = `${h}:${m} ${ap}`
    return t.toDateString() === now.toDateString() ? clock : `${clock} ${t.toLocaleDateString('en-GB', { weekday: 'short' })}`
}
const SMS_TEXT = {
    // Client 16 Oct, verbatim.
    paymentLink: (order, item, amount, link, until) =>
        `${firstName(order)}, your ${itemWords(item)} looks dirty, and pressing it without washing will not look good. Pay N${Number(amount).toLocaleString('en-NG')} to wash and iron it: ${link || 'open the CHUVI app, go to Orders and tap Pay.'} If it is not paid by ${timeWords(until)}, we will press it as you booked.`,
    pressedAsBooked: (order, items) =>
        `${firstName(order)}, we pressed your ${items.map(itemWords).join(', ')} as you booked, without washing. The rest of your order carries on. Questions? Call or WhatsApp 07073254943.`,
}

/** Refusal for pushing a piece that is waiting for the customer's answer. */
function waitingRefusal(items) {
    const w = (items || []).filter(isOpen)
    if (!w.length) return null
    return {
        error: `${w.map(tagOf).join(', ')} is waiting for the customer's answer on washing. S1 changes it or marks the answer first.`,
        waitingForCustomer: true,
    }
}

async function log(order, userId, title, description) {
    try {
        await ActivityModel.create({ title, description, type: ACTIVITY_TYPE.ORDER_UPDATED, orderId: order._id, userId, reference: order.oscNumber })
    } catch (e) {
        console.error('looks dirty activity failed:', e?.message)
    }
}

async function markLooksDirty({ orderId, itemId, note, user }) {
    try {
        if (!(await isOn('ironOnlyUpgrade'))) {
            return BaseService.sendFailedResponse({ error: `"Looks dirty, suggest washing" ${OFF_MESSAGE.toLowerCase()}`, switchOff: true })
        }
        const order = await BookOrderModel.findById(orderId)
        if (!order) return BaseService.sendFailedResponse({ error: 'Order not found' })
        const item = order.items.id(itemId)
        if (!item) return BaseService.sendFailedResponse({ error: 'Item not found in order' })
        if (user.userType !== ROLE.ADMIN && user.userType !== ROLE.SORT_AND_PRETREAT) {
            return BaseService.sendFailedResponse({ error: 'Sort and Pretreat marks a piece that looks dirty.' })
        }
        if ((item.currentStation || STATION_STATUS.INTAKE_AND_TAG_STATION) !== STATION_STATUS.SORT_AND_PRETREAT_STATION) {
            return BaseService.sendFailedResponse({ error: 'The piece must be at Sort and Pretreat.' })
        }
        if (serviceOf(item, order) !== ORDER_SERVICE_TYPE.IRONING_ONLY) {
            return BaseService.sendFailedResponse({ error: 'Only an Iron Only piece can be suggested for washing.' })
        }
        if (isOpen(item)) return BaseService.sendFailedResponse({ error: 'This piece is already waiting for the customer.' })
        if (isItemOnHold(item)) return BaseService.sendFailedResponse({ error: 'This piece is on hold.' })

        const now = new Date()
        const byName = await nameOf(user.id)
        item.dirtySuggestion = { status: 'suggested', note: String(note || '').trim(), suggestedAt: now, suggestedBy: user.id, suggestedByName: byName }
        item.actionLog.push({ action: 'looks_dirty', note: String(note || '').trim(), timestamp: now })
        order.markModified('items')
        await order.save({ validateBeforeSave: false })

        try {
            const { notifyRoles } = require('./notifyRoles')
            await notifyRoles({
                roles: [ROLE.INTAKE_AND_TAG, ROLE.CUSTOMER_EXPERIENCE],
                title: 'Looks dirty: call the customer',
                body: `${tagOf(item)} on order ${order.oscNumber} (Iron Only) looks dirty. Ask the customer if it should be washed first.${item.dirtySuggestion.note ? ` S2: ${item.dirtySuggestion.note}` : ''}`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })
        } catch (e) {
            console.error('looks dirty notify failed:', e?.message)
        }
        await log(order, user.id, 'Looks dirty, suggest washing', `${tagOf(item)} on order ${order.oscNumber} marked looks dirty by ${byName || 'S2'}`)
        return BaseService.sendSuccessResponse({ message: { itemId: item._id, tagId: item.tagId || null, dirtySuggestion: item.dirtySuggestion } })
    } catch (error) {
        console.error('looks dirty failed:', error)
        return BaseService.sendFailedResponse({ error: 'Could not save the suggestion. Please try again.' })
    }
}

async function listSuggestions() {
    const orders = await BookOrderModel.find({ 'items.dirtySuggestion.status': { $in: OPEN } })
        .select('oscNumber fullName phoneNumber items._id items.tagId items.type items.dirtySuggestion items.currentStation')
        .lean()
    const rows = []
    for (const o of orders) {
        for (const i of o.items || []) {
            if (!OPEN.includes(i.dirtySuggestion?.status)) continue
            rows.push({
                orderId: o._id,
                oscNumber: o.oscNumber,
                customerName: o.fullName,
                phoneNumber: o.phoneNumber,
                itemId: i._id,
                tagId: i.tagId || null,
                type: i.type,
                status: i.dirtySuggestion.status,
                note: i.dirtySuggestion.note || '',
                suggestedAt: i.dirtySuggestion.suggestedAt,
                suggestedByName: i.dirtySuggestion.suggestedByName || null,
                difference: i.dirtySuggestion.difference ?? null,
                expiresAt: i.dirtySuggestion.expiresAt || null,
            })
        }
    }
    return rows.sort((a, b) => new Date(a.suggestedAt) - new Date(b.suggestedAt))
}

/** The full difference for one piece between Iron Only and Wash and Iron. */
async function differenceFor(order, item) {
    const AdminSettingModel = require('../models/adminSetting.model')
    const { priceItems } = require('./itemPricing')
    const s = await AdminSettingModel.findOne({}).lean()
    const mult = (name) => (s?.serviceTypes || []).find((x) => x.name === name)?.pricePerPiece ?? 1
    const one = [{ type: item.type, price: item.price, quantity: 1, serviceTier: item.serviceTier }]
    const wi = priceItems({ items: one, serviceTypeMultiplier: mult(ORDER_SERVICE_TYPE.WASH_AND_IRON), orderTier: order.serviceTier, adminOrderSetting: s || {} }).total
    const io = priceItems({ items: one, serviceTypeMultiplier: mult(ORDER_SERVICE_TYPE.IRONING_ONLY), orderTier: order.serviceTier, adminOrderSetting: s || {} }).total
    return { difference: Math.max(0, Math.round(wi - io)), answerMinutes: Number(s?.ironOnlyAnswerMinutes) || 180 }
}

function applyUpgrade(item, now) {
    item.serviceType = ORDER_SERVICE_TYPE.WASH_AND_IRON
    item.dirtySuggestion.status = 'paid'
    item.dirtySuggestion.paidAt = now
    item.dirtySuggestion.closedAt = now
    item.actionLog.push({ action: 'service_changed', note: 'Changed to Wash and Iron (customer paid)', timestamp: now })
}

/** S1 changes the piece to Wash and Iron; a payment link goes for the difference. */
async function upgradeService({ orderId, itemId, user }) {
    try {
        if (user.userType !== ROLE.ADMIN && user.userType !== ROLE.INTAKE_AND_TAG) {
            return BaseService.sendFailedResponse({ error: 'Intake and Tag changes the service after calling the customer.' })
        }
        const order = await BookOrderModel.findById(orderId)
        if (!order) return BaseService.sendFailedResponse({ error: 'Order not found' })
        const item = order.items.id(itemId)
        if (!item || item.dirtySuggestion?.status !== 'suggested') {
            return BaseService.sendFailedResponse({ error: 'This piece has no open "looks dirty" suggestion.' })
        }
        const { difference, answerMinutes } = await differenceFor(order, item)
        const now = new Date()
        if (difference <= 0) {
            applyUpgrade(item, now)
            order.markModified('items')
            await order.save({ validateBeforeSave: false })
            await log(order, user.id, 'Service changed', `${tagOf(item)} on order ${order.oscNumber} changed to Wash and Iron (no difference to pay)`)
            return BaseService.sendSuccessResponse({ message: { itemId: item._id, tagId: item.tagId || null, difference: 0, paid: true, dirtySuggestion: item.dirtySuggestion } })
        }

        const wasPaid = order.paymentStatus === 'success'
        const owed = wasPaid ? 0 : Number(order.balanceDue || 0) || Number(order.amount || 0)
        item.dirtySuggestion.status = 'link-sent'
        item.dirtySuggestion.difference = difference
        item.dirtySuggestion.linkSentAt = now
        item.dirtySuggestion.linkSentBy = user.id
        item.dirtySuggestion.expiresAt = new Date(now.getTime() + answerMinutes * 60000)
        item.actionLog.push({ action: 'service_change_link', note: `Wash and Iron: N${difference.toLocaleString('en-NG')} to pay`, timestamp: now })
        order.amount = Number(order.amount || 0) + difference
        order.balanceDue = owed + difference
        order.paymentStatus = 'pending'
        if (order.pricing) {
            order.pricing.serviceChange = Number(order.pricing.serviceChange || 0) + difference
            order.pricing.orderTotal = order.amount
        }
        order.markModified('items')
        await order.save({ validateBeforeSave: false })

        const PaymentHoldService = require('../services/paymentHold.service')
        const link = await PaymentHoldService._buildPaymentLink(order)
        if (link) {
            await BookOrderModel.updateOne({ _id: order._id, 'items._id': item._id }, { $set: { 'items.$.dirtySuggestion.paymentUrl': link } })
        }
        const text = SMS_TEXT.paymentLink(order, item, difference, link, item.dirtySuggestion.expiresAt)
        try {
            const sendSms = require('./sendSms')
            if (order.phoneNumber) await sendSms(order.phoneNumber, text)
        } catch (e) {
            console.error('upgrade link SMS failed:', e?.message)
        }
        await log(order, user.id, 'Service change: link sent', `${tagOf(item)} on order ${order.oscNumber}: Wash and Iron for N${difference}; link sent by ${(await nameOf(user.id)) || 'S1'}`)
        return BaseService.sendSuccessResponse({
            message: { itemId: item._id, tagId: item.tagId || null, difference, paymentUrl: link || null, expiresAt: item.dirtySuggestion.expiresAt, wasPaid },
        })
    } catch (error) {
        console.error('upgrade service failed:', error)
        return BaseService.sendFailedResponse({ error: 'Could not change the service. Please try again.' })
    }
}

/** Undo the money of an open link (decline or expiry). */
function revertMoney(order, item) {
    const diff = Number(item.dirtySuggestion?.difference || 0)
    if (item.dirtySuggestion?.status !== 'link-sent' || diff <= 0) return
    order.amount = Math.max(0, Number(order.amount || 0) - diff)
    const left = Math.max(0, Number(order.balanceDue || 0) - diff)
    if (left > 0) order.balanceDue = left
    else {
        order.balanceDue = undefined
        order.paymentStatus = 'success'
    }
    if (order.pricing) {
        order.pricing.serviceChange = Math.max(0, Number(order.pricing.serviceChange || 0) - diff)
        order.pricing.orderTotal = order.amount
    }
}

function closeAsBooked(order, item, status, note, now) {
    revertMoney(order, item)
    item.dirtySuggestion.status = status
    item.dirtySuggestion.closedAt = now
    item.dirtySuggestion.closeNote = note
    item.actionLog.push({ action: 'pressed_as_booked', note, timestamp: now })
}

/** S1: the customer said no (or changed their mind) — press it as booked. */
async function declineSuggestion({ orderId, itemId, note, user }) {
    try {
        if (user.userType !== ROLE.ADMIN && user.userType !== ROLE.INTAKE_AND_TAG) {
            return BaseService.sendFailedResponse({ error: 'Intake and Tag records the customer\'s answer.' })
        }
        const order = await BookOrderModel.findById(orderId)
        if (!order) return BaseService.sendFailedResponse({ error: 'Order not found' })
        const item = order.items.id(itemId)
        if (!item || !isOpen(item)) return BaseService.sendFailedResponse({ error: 'This piece has no open "looks dirty" suggestion.' })
        const now = new Date()
        const text = String(note || '').trim() || 'Customer said no to washing'
        closeAsBooked(order, item, 'declined', text, now)
        order.markModified('items')
        await order.save({ validateBeforeSave: false })
        await log(order, user.id, 'Pressed as booked', `${tagOf(item)} on order ${order.oscNumber}: ${text}`)
        return BaseService.sendSuccessResponse({ message: { itemId: item._id, tagId: item.tagId || null, dirtySuggestion: item.dirtySuggestion } })
    } catch (error) {
        console.error('decline suggestion failed:', error)
        return BaseService.sendFailedResponse({ error: 'Could not save the answer. Please try again.' })
    }
}

/** After a payment on the order: a paid link changes the piece to Wash and Iron. */
async function settleIfPaid(orderId) {
    try {
        const order = await BookOrderModel.findById(orderId)
        if (!order) return 0
        const paid = order.paymentStatus === 'success' && !(Number(order.balanceDue) > 0)
        if (!paid) return 0
        const now = new Date()
        const done = []
        for (const item of order.items) {
            if (item.dirtySuggestion?.status === 'link-sent') {
                applyUpgrade(item, now)
                done.push(item)
            }
        }
        if (!done.length) return 0
        order.markModified('items')
        await order.save({ validateBeforeSave: false })
        try {
            const { notifyRoles } = require('./notifyRoles')
            await notifyRoles({
                roles: [ROLE.SORT_AND_PRETREAT, ROLE.INTAKE_AND_TAG],
                title: 'Paid: send to washing',
                body: `${done.map(tagOf).join(', ')} on order ${order.oscNumber} is now Wash and Iron. Send it to Wash and Dry.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })
        } catch (e) {
            console.error('upgrade paid notify failed:', e?.message)
        }
        await log(order, null, 'Service changed', `${done.map(tagOf).join(', ')} on order ${order.oscNumber} changed to Wash and Iron (paid)`)
        return done.length
    } catch (error) {
        console.error('settle upgrade failed:', error?.message)
        return 0
    }
}

/** Cron: unpaid links past their time are cancelled and the piece pressed as booked. */
async function expireDue(now = new Date()) {
    const orders = await BookOrderModel.find({ 'items.dirtySuggestion.status': 'link-sent' })
    let expired = 0
    for (const order of orders) {
        if (order.paymentStatus === 'success' && !(Number(order.balanceDue) > 0)) {
            await settleIfPaid(order._id)
            continue
        }
        const due = order.items.filter((i) => i.dirtySuggestion?.status === 'link-sent' && i.dirtySuggestion.expiresAt && new Date(i.dirtySuggestion.expiresAt) <= now)
        if (!due.length) continue
        for (const item of due) closeAsBooked(order, item, 'expired', 'customer did not pay for washing', now)
        order.markModified('items')
        await order.save({ validateBeforeSave: false })
        expired += due.length
        try {
            const sendSms = require('./sendSms')
            if (order.phoneNumber) {
                await sendSms(order.phoneNumber, SMS_TEXT.pressedAsBooked(order, due))
            }
        } catch (e) {
            console.error('upgrade expiry SMS failed:', e?.message)
        }
        await log(order, null, 'Pressed as booked', `${due.map(tagOf).join(', ')} on order ${order.oscNumber}: customer did not pay for washing`)
    }
    return { expired }
}

module.exports = { SMS_TEXT, markLooksDirty, listSuggestions, upgradeService, declineSuggestion, settleIfPaid, expireDue, waitingRefusal, differenceFor }
