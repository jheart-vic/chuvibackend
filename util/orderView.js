// One outward shape for an order whatever era it was written in: `pricing` always
// present, addresses always the structured object or null (never a legacy string).

const { normalizeAddress } = require('./address')
const { BILLING_TYPE } = require('./constants')
const { deliveryPromise } = require('./bookingWindow')

// Best-effort receipt for orders placed before `pricing` was captured.
function buildPricingFallback(order) {
    const itemsBase = (order.items || []).reduce(
        (sum, item) =>
            sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
        0,
    )
    const feesTotal = Number(order.deliveryAmount) || 0
    const orderTotal = Number(order.amount) || 0
    return {
        itemsBase,
        serviceTier: order.serviceTier,
        tierMultiplier: null,
        tierUplift: null,
        itemsSubtotal: Math.max(orderTotal - feesTotal, 0),
        speedCharge: null,
        pickupFee: null,
        deliveryFee: null,
        feesTotal,
        grossTotal: null,
        offerDiscount: null,
        freePickupWaived: null,
        freeDeliveryWaived: null,
        appliedOffers: [],
        creditApplied: null,
        orderTotal,
        youSaved: null,
        coveredBySubscription:
            order.billingType === BILLING_TYPE.PAY_FROM_SUBSCRIPTION,
        reconstructed: true,
        note: 'Approximate — this order predates itemized pricing capture.',
    }
}

function normalizeOrderAddresses(order) {
    order.pickupAddress = normalizeAddress(order.pickupAddress) || null
    order.deliveryAddress = normalizeAddress(order.deliveryAddress) || null
    return order
}

/**
 * The customer-facing delivery promise (client D1, 2026-10-08: the window
 * replaces the old "by 7pm").
 *
 * Derived HERE, in the one outward shape, so every read path gets the same
 * sentence and no screen has to assemble it — the "filter added at 13 sites is
 * the one the 14th forgets" lesson from the archived CRM cards.
 *
 * It is a SEPARATE field from `deliveryDate` on purpose. `deliveryDate` is the
 * internal deadline and its time is an end-of-day sentinel (19:00) that ~10
 * readers compare as an instant — overdue, due-today, the hold breach branch.
 * Showing it to a customer is what made "by 7pm" collide with a window ending
 * at 18:30. **The FE should render `deliveryPromise.text` and must not format
 * `deliveryDate` as a time.**
 *
 * The window's hours are denormalised onto `scheduling.delivery` at booking, so
 * this needs no lookup and a renamed or deleted window cannot rewrite what the
 * customer was told.
 */
function addDeliveryPromise(order) {
    const leg = order.scheduling?.delivery
    const confirmed = Boolean(leg?.confirmedAt)
    // Once D7 confirms the window at READY the leg carries the real day;
    // before that the deadline date is the best estimate available.
    const date = (confirmed && leg?.date) || order.deliveryDate || leg?.date
    if (!date) {
        order.deliveryPromise = null
        return order
    }
    order.deliveryPromise = deliveryPromise({
        date,
        timing: leg?.timing || null,
        window: leg?.windowStart
            ? {
                  _id: leg.windowId,
                  name: leg.windowName,
                  startTime: leg.windowStart,
                  endTime: leg.windowEnd,
              }
            : null,
        confirmed,
    })
    return order
}

// Mutates and returns a lean order — call before sending one back.
function presentOrder(order) {
    if (!order) return order
    if (!order.pricing) order.pricing = buildPricingFallback(order)
    normalizeOrderAddresses(order)
    addDeliveryPromise(order)
    addPayBy(order)
    // V1 batch 3c: the client's status word for this order.
    if (order.stage) order.statusLabel = require('./statusLabel').orderStatusLabel(order)
    return order
}

// V1 batch 3b (FE F5): a Quick Booking waiting for payment carries its pay-by
// time, the same one its bill SMS gives (12 noon the day after the bill).
function addPayBy(order) {
    const hold = order?.paymentHold
    if (order?.quickBooking && hold?.raisedAt && !hold.clearedAt) {
        const { payByDate } = require('./orderSms')
        order.payBy = payByDate(hold.raisedAt)
    } else if (order) {
        order.payBy = null
    }
    return order
}

// V1 (FE 16 Oct): station screens show "Ready by Wed 4 PM" — the order's ready
// time (deliveryDate, Lagos) with day and time — not the customer's delivery
// promise sentence. Null when there is no ready date.
function readyByOf(order) {
    if (!order?.deliveryDate) return null
    const d = new Date(order.deliveryDate)
    if (isNaN(d)) return null
    const day = d.toLocaleDateString('en-GB', { weekday: 'short' })
    let h = d.getHours()
    const m = d.getMinutes()
    const ap = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    const clock = m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`
    return { text: `Ready by ${day} ${clock}`, at: d }
}

/** Everything a station screen shows about timing and words, on one lean order. */
async function decorateStationOrder(order, displayNames) {
    if (!order) return order
    if (displayNames === undefined) {
        const AdminSettingModel = require('../models/adminSetting.model')
        displayNames = (await AdminSettingModel.findOne().select('displayNames').lean())?.displayNames
    }
    const { resolveLabel } = require('./displayName')
    addDeliveryPromise(order)
    order.readyBy = readyByOf(order)
    order.speedLabel = order.deliverySpeed ? resolveLabel('deliverySpeeds', order.deliverySpeed, displayNames).label : null
    if (order.stage) order.statusLabel = require('./statusLabel').orderStatusLabel(order)
    return order
}

function presentOrders(orders) {
    return (orders || []).map(presentOrder)
}

module.exports = {
    buildPricingFallback,
    normalizeOrderAddresses,
    addDeliveryPromise,
    addPayBy,
    readyByOf,
    decorateStationOrder,
    presentOrder,
    presentOrders,
}
