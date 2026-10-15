// The client's order SMS texts (V1 launch batch 1, client 15 Oct 2026,
// "CHUVI V1: SMS TEXTS"). Words in braces in their sheet are the placeholders
// filled here. N, no dashes (util/sendSms.js also cleans every message).
//
// One file so the wording lives in one place and every caller uses the same
// sentence. Sending is always non-fatal: a message must never undo the work it
// reports.
const SUPPORT_PHONE = '07073254943'

const firstName = (order) => {
    const n = String(order?.fullName || '').trim().split(/\s+/)[0]
    return n || 'Hello'
}
const naira = (n) => `N${Math.round(Number(n) || 0).toLocaleString('en-NG')}`
const countPieces = (items = []) => items.reduce((n, i) => n + (Number(i?.quantity) || 1), 0)

/** "15:00" → "3 PM", "18:30" → "6:30 PM". */
function clock(hhmm) {
    const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/)
    if (!m) return ''
    const h = Number(m[1])
    const min = m[2]
    const suffix = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return min === '00' ? `${h12} ${suffix}` : `${h12}:${min} ${suffix}`
}
const clockOf = (d) => clock(`${new Date(d).getHours()}:${String(new Date(d).getMinutes()).padStart(2, '0')}`)
/** "Thu 16 Oct" in Lagos time (the process is pinned to Africa/Lagos). */
const dayText = (d) =>
    new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
const weekday = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short' })

/** How a pickup or delivery leg is described: "on Thu 16 Oct between 3 PM and 6:30 PM". */
function legText(leg, fallbackDate = null) {
    const date = leg?.date || fallbackDate
    if (leg?.timing === 'window' && leg.windowStart && date) {
        return `on ${dayText(date)} between ${clock(leg.windowStart)} and ${clock(leg.windowEnd)}`
    }
    if (leg?.timing === 'anytime' && date) return `on ${dayText(date)}, as soon as we can`
    if (date) return `on ${dayText(date)}`
    return 'soon'
}

/** R21: pay by 12 noon on the day after the bill. */
function payByDate(billAt = new Date()) {
    const d = new Date(billAt)
    d.setDate(d.getDate() + 1)
    d.setHours(12, 0, 0, 0)
    return d
}
const payByText = (billAt) => `12 noon ${weekday(payByDate(billAt))}`
const readyByText = (order) => (order?.deliveryDate ? `${weekday(order.deliveryDate)} ${clockOf(order.deliveryDate)}` : 'your ready date')

const TEXTS = {
    bookingReceived: (order) =>
        `Hi ${firstName(order)}, we have your CHUVI booking ${order.oscNumber}. Our rider comes ${legText(order.scheduling?.pickup, order.pickupDate)}. Questions? Call or WhatsApp ${SUPPORT_PHONE}.`,
    quickBookingBill: (order, { amount, link, billAt }) =>
        `${firstName(order)}, your CHUVI bill is ${naira(amount)} for ${countPieces(order.items)} pieces plus pickup and delivery. Pay by ${payByText(billAt)} to keep your ready date of ${readyByText(order)}: ${link || 'open the CHUVI app'} If this link has expired, open the CHUVI app, go to Orders and tap Pay.`,
    recountLink: (order, { toPay, link }) =>
        `${firstName(order)}, we counted ${countPieces(order.items)} pieces in your bag, so ${naira(toPay)} is left to pay: ${link || 'open the CHUVI app, go to Orders and tap Pay.'} We start washing once it is paid.`,
    paymentReminder: (order, { amount, link, billAt }) =>
        `${firstName(order)}, your CHUVI order is waiting for payment of ${naira(amount)}. Pay by ${payByText(billAt)} to keep your ready date: ${link || 'open the CHUVI app, go to Orders and tap Pay.'}`,
    riderCount: (order, { pieces }) =>
        `${firstName(order)}, our rider collected ${pieces} pieces. Reply or call ${SUPPORT_PHONE} if this is wrong.`,
    walletRefund: (order, { amount }) =>
        `${firstName(order)}, we counted fewer pieces than you booked, so ${naira(amount)} is back in your CHUVI wallet for your next order.`,
    readyDelivery: (order) =>
        `${firstName(order)}, your CHUVI order ${order.oscNumber} is ready. We deliver ${legText(order.scheduling?.delivery, order.deliveryDate)}. Questions? Call or WhatsApp ${SUPPORT_PHONE}.`,
    readyCollection: (order) =>
        `${firstName(order)}, your CHUVI order ${order.oscNumber} is ready. Collect it at our Agulu office before 7 PM, Tuesday to Sunday (Sunday from 12:30 PM).`,
    delivered: (order) =>
        `${firstName(order)}, your CHUVI order ${order.oscNumber} has been delivered. Thank you for choosing CHUVI. Anything not right? Call or WhatsApp ${SUPPORT_PHONE}.`,
    notAvailable: (order, { leg }) =>
        `${firstName(order)}, our rider came for your CHUVI ${leg === 'delivery' ? 'delivery' : 'pickup'} but could not reach you. Reply or call ${SUPPORT_PHONE} to pick a new time.`,
}

async function send(phone, text) {
    if (!phone) return false
    try {
        const sendSms = require('./sendSms')
        await sendSms(phone, text)
        return true
    } catch (err) {
        console.error('order SMS failed:', err?.message)
        return false
    }
}

/**
 * Send one of the once-per-order messages (booking received, ready,
 * delivered). The latch `smsLog.<key>` is claimed atomically first, so two
 * callers (a webhook retry, two screens) can never send it twice.
 */
async function sendOnce(order, key, text) {
    if (!order?._id || !order.phoneNumber) return false
    try {
        const BookOrderModel = require('../models/bookOrder.model')
        const claim = await BookOrderModel.updateOne(
            { _id: order._id, [`smsLog.${key}`]: { $exists: false } },
            { $set: { [`smsLog.${key}`]: new Date() } },
        )
        if (!claim.modifiedCount) return false
        return send(order.phoneNumber, text)
    } catch (err) {
        console.error(`order SMS ${key} failed:`, err?.message)
        return false
    }
}

/**
 * "Booking received" goes out when the booking is confirmed: at once for an
 * order that needs nothing more (a Quick Booking, or one already paid), and
 * from the payment webhook for one waiting on its card payment. Only orders
 * with a rider pickup get it — the text promises the rider.
 */
async function bookingReceived(order) {
    if (!order?.isPickUp) return false
    return sendOnce(order, 'bookingReceived', TEXTS.bookingReceived(order))
}
const bookingConfirmedAtCreation = (order) =>
    order?.quickBooking === true || order?.paymentStatus === 'success'

async function ready(order) {
    const text = order?.isDelivery ? TEXTS.readyDelivery(order) : TEXTS.readyCollection(order)
    return sendOnce(order, 'ready', text)
}
async function delivered(order) {
    return sendOnce(order, 'delivered', TEXTS.delivered(order))
}
async function notAvailable(order, leg) {
    return send(order?.phoneNumber, TEXTS.notAvailable(order, { leg }))
}

module.exports = {
    SUPPORT_PHONE,
    TEXTS,
    send,
    sendOnce,
    bookingReceived,
    bookingConfirmedAtCreation,
    ready,
    delivered,
    notAvailable,
    payByDate,
    payByText,
    readyByText,
    legText,
    clock,
    countPieces,
}
