// Quick Booking ready-date rules (V1 launch batch 2, client confirmed 15 Oct, R21):
//   "Paying by 12 noon the day after the bill keeps the ready date; later, the
//    ready date is worked out again from the payment time. A real count more
//    than twice the booking works out the ready date again with the daily limit."
//
// Both recompute through the same rows booking uses (BookingWindowService
// .speedOptionsFor: Tue–Sat 1, Sunday ½, Monday 0, ready by 19:00, the daily
// floor limit), so the new date is one the floor can actually keep. The order's
// own floor share is taken off first so it is not counted twice.
const BookOrderModel = require('../models/bookOrder.model')
const { payByDate } = require('./orderSms')


/**
 * Work the ready date out again. `from`:
 *   'payment' — counted from the payment time (paid after the pay-by time);
 *   'pickup'  — counted from the order's own pickup (count more than 2×).
 * Returns { changed, previous, readyDate } and never throws.
 */
async function recalcReadyDate(orderId, { from = 'pickup', at = new Date() } = {}) {
    try {
        const order = await BookOrderModel.findById(orderId).lean()
        if (!order) return { changed: false }
        const BookingWindowService = require('../services/bookingWindow.service')
        const pieces = (order.items || []).reduce((n, i) => n + (Number(i.quantity) || 1), 0)
        // From the payment: counted as if the clothes arrived at that moment.
        const pickup =
            from === 'payment'
                ? {}
                : { leg: order.scheduling?.pickup || null, pickupDate: order.pickupDate, pickupTime: order.pickupTime }

        // Take this order's own pieces off the floor before asking for room;
        // put them back if anything fails (review 15 Oct).
        await BookOrderModel.updateOne({ _id: orderId }, { $unset: { floorAllocation: '' } })
        const restore = () =>
            order.floorAllocation?.length
                ? BookOrderModel.updateOne({ _id: orderId }, { $set: { floorAllocation: order.floorAllocation } })
                : null
        let speeds
        try {
            ;({ speeds } = await BookingWindowService.speedOptionsFor({ pickup, pieces, quickBooking: order.quickBooking === true, ...(from === 'payment' && { now: at }) }))
        } catch (e) {
            await restore()
            throw e
        }
        const row =
            speeds.find((s) => s.speed === order.deliverySpeed && s.available) ||
            speeds.find((s) => s.speed === 'standard')
        if (!row?.readyDate || !row.allocation?.length) {
            await restore()
            if (!row?.readyDate) return { changed: false }
        }
        const previous = order.deliveryDate || null
        await BookOrderModel.updateOne(
            { _id: orderId },
            {
                $set: {
                    deliveryDate: row.readyDate,
                    ...(row.allocation?.length && { floorAllocation: row.allocation }),
                    readyDateRecalc: { at: new Date(), from, previous },
                },
            },
            { runValidators: false },
        )
        return { changed: String(previous) !== String(row.readyDate), previous, readyDate: row.readyDate }
    } catch (err) {
        console.error('ready date recalc failed:', err?.message)
        return { changed: false }
    }
}

/** After a Quick Booking is paid: a new date if it was paid after the pay-by time. */
async function afterQuickBookingPaid(orderId, paidAt = new Date()) {
    try {
        const order = await BookOrderModel.findById(orderId).select('quickBooking paymentHold userId oscNumber stage').lean()
        if (!order?.quickBooking || !order.paymentHold?.raisedAt) return null
        if (order.stage?.status === 'cancelled') return null
        if (paidAt <= payByDate(order.paymentHold.raisedAt)) return null
        const res = await recalcReadyDate(orderId, { from: 'payment', at: paidAt })
        if (res.changed && order.userId) {
            try {
                const createNotification = require('./createNotification')
                const when = new Date(res.readyDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
                await createNotification({
                    userId: order.userId,
                    title: 'New ready date',
                    body: `Your payment came after the pay-by time, so order ${order.oscNumber} will now be ready by 7 PM on ${when}.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: 'order-updated',
                })
            } catch {}
        }
        return res
    } catch (err) {
        console.error('late payment ready date failed:', err?.message)
        return null
    }
}

module.exports = { recalcReadyDate, afterQuickBookingPaid }
