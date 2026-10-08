// When does an order's processing clock start?
//
// CLIENT CORRECTION (2026-10-08), replacing their own earlier answer:
//
//   "The clock should not start at tagging. It starts when the order is CLEARED
//    FOR PRODUCTION. That means the clothes are at Intake and the money is
//    complete (payment cleared or an admin credit applied), whichever happens
//    last."
//
// Their three cases, and why one definition covers all three:
//   (a) paid in the app, count matches  → the money was already complete, so
//       the clock starts when the clothes arrive and Intake confirms them;
//   (b) extra items arrived, S1 sent a top-up request → the clothes were
//       already here, so the clock starts when the top-up is paid;
//   (c) Quick Booking → the clothes were collected first, so the clock starts
//       when payment clears.
// In every case it is the LATER of the two events. That is why this is a
// recompute called from BOTH sides rather than a stamp written at one place:
// neither side knows whether it is the second one to happen.
//
// It stops at `qcDetails.packCompletedAt` (S5 marking the order Ready), which
// already existed.
//
// Stamped ONCE. A later payment correction or a re-confirmed count must never
// restart a clock that is already running, or the figure silently improves
// every time someone touches the order.

const { PAYMENT_ORDER_STATUS, ORDER_STATUS } = require('./constants')

// "The clothes are at Intake": the order has physically reached us. PENDING is
// the one status that means the opposite — booked in the app, nothing collected
// yet — and CANCELLED obviously never clears.
const NOT_YET_WITH_US = [ORDER_STATUS.PENDING, ORDER_STATUS.CANCELLED]

function clothesAreWithUs(order) {
    const status = order?.stage?.status
    if (!status) return false
    return !NOT_YET_WITH_US.includes(status)
}

// "The money is complete": payment cleared, or an admin waived/credited it.
// A waived payment hold counts deliberately — the client's rule is that such an
// order DOES go into production, it is just stopped again at dispatch.
function moneyIsComplete(order) {
    if (order?.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS) return true
    if (order?.paymentWaivedAt) return true
    return false
}

// Both true → the order is cleared for production.
function isClearedForProduction(order) {
    return clothesAreWithUs(order) && moneyIsComplete(order)
}

// Call this from EITHER side whenever one of the two conditions may have just
// become true. Returns the Date it stamped, or null if nothing changed.
//
// Fire-and-forget by design: a measurement must never be able to fail the
// action that triggered it. The caller wraps it in logSafely.
async function markProductionClearedIfReady(orderId, BookOrderModel) {
    const Model = BookOrderModel || require('../models/bookOrder.model')
    const order = await Model.findById(orderId)
        .select('stage.status paymentStatus paymentWaivedAt productionStartedAt')
        .lean()
    if (!order) return null
    if (order.productionStartedAt) return null // already running — never restart
    if (!isClearedForProduction(order)) return null

    const now = new Date()
    // Guarded on the field being absent, so two concurrent triggers (a payment
    // webhook and an intake confirmation landing together) cannot both stamp it.
    const res = await Model.updateOne(
        {
            _id: orderId,
            $or: [
                { productionStartedAt: { $exists: false } },
                { productionStartedAt: null },
            ],
        },
        { $set: { productionStartedAt: now } },
    )
    return res.modifiedCount ? now : null
}

module.exports = {
    clothesAreWithUs,
    moneyIsComplete,
    isClearedForProduction,
    markProductionClearedIfReady,
}
