// Subscriber free pickup/delivery allowance (per rolling 7-day week anchored to
// the subscription start). Pickup and delivery are separate legs; the pickup is
// freed before the delivery when the remaining allowance can't cover both.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Lazy weekly reset: advance logisticsWeekStart in 7-day steps until it covers
// `now`, resetting the counter to the plan's weekly grant on each new window.
// Mutates the subscription; returns it.
function applyWeeklyReset(subscription, plan, now = new Date()) {
    const grant = Number(plan?.freePickupDeliveryPerWeek) || 0
    let start = subscription.logisticsWeekStart
        ? new Date(subscription.logisticsWeekStart)
        : new Date(subscription.startDate || now)

    if (!subscription.logisticsWeekStart) {
        subscription.logisticsWeekStart = start
        subscription.remainingPickupDeliveries = grant
    }
    while (now.getTime() >= start.getTime() + WEEK_MS) {
        start = new Date(start.getTime() + WEEK_MS)
        subscription.remainingPickupDeliveries = grant
    }
    subscription.logisticsWeekStart = start
    return subscription
}

// Given the order's requested legs, the current remaining allowance and the
// fees, work out which legs are free vs charged (pickup freed first).
// Returns { freeUsed, fee, chargedPickup, chargedDelivery }.
function computeLogisticsCharge({
    isPickUp,
    isDelivery,
    remaining = 0,
    pickupFee = 0,
    deliveryFee = 0,
}) {
    const legs = []
    if (isPickUp) legs.push({ kind: 'pickup', fee: pickupFee })
    if (isDelivery) legs.push({ kind: 'delivery', fee: deliveryFee })

    let free = Math.max(0, Number(remaining) || 0)
    const result = {
        freeUsed: 0,
        fee: 0,
        chargedPickup: false,
        chargedDelivery: false,
    }
    for (const leg of legs) {
        if (free > 0) {
            free -= 1
            result.freeUsed += 1
        } else {
            result.fee += Number(leg.fee) || 0
            if (leg.kind === 'pickup') result.chargedPickup = true
            else result.chargedDelivery = true
        }
    }
    return result
}

module.exports = { applyWeeklyReset, computeLogisticsCharge, WEEK_MS }
