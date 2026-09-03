// One outward shape for an order whatever era it was written in: `pricing` always
// present, addresses always the structured object or null (never a legacy string).

const { normalizeAddress } = require('./address')
const { BILLING_TYPE } = require('./constants')

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

// Mutates and returns a lean order — call before sending one back.
function presentOrder(order) {
    if (!order) return order
    if (!order.pricing) order.pricing = buildPricingFallback(order)
    normalizeOrderAddresses(order)
    return order
}

function presentOrders(orders) {
    return (orders || []).map(presentOrder)
}

module.exports = {
    buildPricingFallback,
    normalizeOrderAddresses,
    presentOrder,
    presentOrders,
}
