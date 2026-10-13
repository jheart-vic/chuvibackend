// Launch item 4 (D2a): an Urgent pickup (stored `anytime`) alerts Intake at once
// and goes to the TOP of the pickup list — but only once it is a real job.
//
// A card order is created BEFORE the customer pays on Paystack. Alerting at
// creation meant every abandoned checkout alerted Intake and sat at the top of
// the pickup list with nobody paying for it. So the order is marked only when
// it is paid (card, wallet, plan, bank transfer) — or at once for a Quick
// Booking, which is never paid before pickup (we count, then bill).
//
// Called at booking and from every place that marks an order paid. The
// `urgentPickup: { $ne: true }` latch makes it alert exactly once.
const BookOrderModel = require('../models/bookOrder.model')
const { notifyRoles } = require('./notifyRoles')
const { BOOKING_TIMING, ROLE, NOTIFICATION_TYPE, PAYMENT_ORDER_STATUS } = require('./constants')

async function markUrgentPickupIfReady(order) {
    try {
        if (!order || order.scheduling?.pickup?.timing !== BOOKING_TIMING.ANYTIME) return false
        if (order.urgentPickup === true) return false
        const ready = order.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS || order.quickBooking === true
        if (!ready) return false

        const res = await BookOrderModel.updateOne(
            { _id: order._id, urgentPickup: { $ne: true } },
            { $set: { urgentPickup: true } },
        )
        if (!res.modifiedCount) return false
        order.urgentPickup = true

        const addr = (order.pickupAddress && typeof order.pickupAddress === 'object' ? order.pickupAddress.address : order.pickupAddress) || ''
        await notifyRoles({
            roles: [ROLE.INTAKE_AND_TAG, ROLE.ADMIN],
            title: 'Urgent pickup booked',
            body: `${order.oscNumber}${addr ? ` — ${addr}` : ''}. Assign a rider now: it is at the top of the pickup list.`,
            subBody: `Order ID: ${order.oscNumber}`,
            type: NOTIFICATION_TYPE.ORDER_CREATED,
        })
        return true
    } catch (err) {
        // Never fails the booking or the payment that called it.
        console.error('urgent pickup mark failed:', err?.message)
        return false
    }
}

module.exports = { markUrgentPickupIfReady }
