// THE CLIENT'S STATUS WORDS (V1 launch batch 3c, client word list 15 Oct):
// "Booked, Needs rider, Rider on the way, Picked up, Waiting for payment, At
// Intake, Sorting, Washing, Pressing, Quality check, Ready, Out for delivery,
// Ready waiting redelivery, Delivered, Collected, Returned unwashed, Cancelled.
// Hold words: On hold, Waiting for admin, Customer informed."
// One function so every screen shows the same word for the same order. The raw
// `stage.status` still travels beside it; screens show `statusLabel`.
const STATUS_WORDS = {
    booked: 'Booked',
    needsRider: 'Needs rider',
    riderOnTheWay: 'Rider on the way',
    pickedUp: 'Picked up',
    waitingForPayment: 'Waiting for payment',
    atIntake: 'At Intake',
    sorting: 'Sorting',
    washing: 'Washing',
    pressing: 'Pressing',
    qualityCheck: 'Quality check',
    ready: 'Ready',
    outForDelivery: 'Out for delivery',
    readyWaitingRedelivery: 'Ready waiting redelivery',
    delivered: 'Delivered',
    collected: 'Collected',
    returnedUnwashed: 'Returned unwashed',
    cancelled: 'Cancelled',
    onHold: 'On hold',
    waitingForAdmin: 'Waiting for admin',
    customerInformed: 'Customer informed',
}

const ADMIN_HOLD_KEYS = ['count_differs_from_rider']

function orderStatusLabel(order) {
    if (!order) return null
    const W = STATUS_WORDS
    const status = order.stage?.status
    const pickup = order.dispatchDetails?.pickup || {}
    const delivery = order.dispatchDetails?.delivery || {}
    const payHold = order.paymentHold?.raisedAt && !order.paymentHold?.clearedAt

    switch (status) {
        case 'cancelled':
            return W.cancelled
        case 'returned-unwashed':
            return W.returnedUnwashed
        case 'delivered':
            return W.delivered
        case 'collected':
            return W.collected
        case 'out-for-delivery':
            return W.outForDelivery
        case 'ready':
            if (delivery.status === 'failed' && !delivery.rider) return W.readyWaitingRedelivery
            if (delivery.status === 'out-for-delivery') return W.outForDelivery
            return W.ready
        case 'qc':
            return W.qualityCheck
        case 'ironing':
            return W.pressing
        case 'washing':
        case 'drying':
            return W.washing
        case 'sort-and-pretreat':
            return W.sorting
        case 'hold':
            if (payHold) return W.waitingForPayment
            if (ADMIN_HOLD_KEYS.includes(order.orderHold?.holdTypeKey)) return W.waitingForAdmin
            return W.onHold
        default:
            break
    }
    if (payHold) return W.waitingForPayment
    if (status === 'received' || status === 'queue') {
        // In the Intake queue once the clothes are in; before that, the pickup leg.
        if (pickup.status === 'picked-up' || !order.isPickUp) return W.atIntake
    }
    if (status === 'picked-up' || pickup.status === 'picked-up') return W.pickedUp
    if (order.isPickUp !== false) {
        if (pickup.status === 'pickup-in-progress') return W.riderOnTheWay
        if (!pickup.rider) return W.needsRider
    }
    return W.booked
}

module.exports = { STATUS_WORDS, orderStatusLabel }
