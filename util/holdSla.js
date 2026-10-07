// Hold SLA — ONE definition of "this hold has breached its SLA", shared by the
// Active card, the Overdue card and the Holds Management list.
//
// Client brief 6 Oct 2026, item 4.4: Active and Overdue showed the SAME three
// orders. The cause was that Active counted EVERY hold while Overdue counted the
// breached ones — a strict SUBSET of Active, so a breached hold was always in
// both, and Active + Overdue never equalled the number of orders on hold.
//
// The rule the client asked for: Active = on hold and still inside its SLA,
// Overdue = on hold and past it, no order in both, and the two add up to all
// holds. That only stays true if both cards read the SAME clause, which is why
// it lives here instead of being spelled out at each call site (it was
// previously duplicated in two places in admin.service.js and could drift).

const { ORDER_STATUS, DELIVERY_SPEED } = require('./constants')

// How long an order may sit on hold before it has breached, by delivery speed.
const HOLD_SLA_HOURS = {
    [DELIVERY_SPEED.SAME_DAY]: 2,
    [DELIVERY_SPEED.EXPRESS]: 4,
    [DELIVERY_SPEED.STANDARD]: 6,
}

const HOUR = 60 * 60 * 1000

// The breach clause on its own, as an array of $or branches: held longer than
// its speed allows, OR already past its promised delivery date.
const breachBranches = (now = new Date()) => [
    ...Object.entries(HOLD_SLA_HOURS).map(([speed, hours]) => ({
        deliverySpeed: speed,
        'stage.updatedAt': { $lt: new Date(now.getTime() - hours * HOUR) },
    })),
    { deliveryDate: { $lt: now } },
]

// Holds that have breached their SLA.
const overdueHoldsFilter = (now = new Date()) => ({
    'stage.status': ORDER_STATUS.HOLD,
    $or: breachBranches(now),
})

// Holds that have NOT breached. $nor is the exact complement of the $or above,
// so activeHoldsFilter and overdueHoldsFilter partition the holds between them:
// every order on hold matches exactly one, and the two counts always sum to the
// total. That is the property item 4.4 asks for.
const activeHoldsFilter = (now = new Date()) => ({
    'stage.status': ORDER_STATUS.HOLD,
    $nor: breachBranches(now),
})

// Is this already-loaded order a breached hold? Used where a document is in
// hand rather than a query (list rows flagging "SLA Breached").
const isHoldBreached = (order, now = new Date()) => {
    if (!order || order.stage?.status !== ORDER_STATUS.HOLD) return false
    if (order.deliveryDate && new Date(order.deliveryDate) < now) return true
    const hours = HOLD_SLA_HOURS[order.deliverySpeed]
    if (!hours || !order.stage?.updatedAt) return false
    return new Date(order.stage.updatedAt) < new Date(now.getTime() - hours * HOUR)
}

module.exports = {
    HOLD_SLA_HOURS,
    breachBranches,
    overdueHoldsFilter,
    activeHoldsFilter,
    isHoldBreached,
}
