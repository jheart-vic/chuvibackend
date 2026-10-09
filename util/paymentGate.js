/**
 * "TAGS NEVER PRINT BEFORE PAYMENT" — N1 Phase 3 (client spec, locked
 * 2026-10-07/08).
 *
 * The client's words: Intake's four steps are *confirm the rider's count →
 * enter the items (the system computes the total, Intake cannot type an amount)
 * → a payment hold with an SMS and a Paystack link → on payment, the tags print
 * and the order goes to S2*. And: **"A normal unpaid booking follows the same
 * rule: intake yes, tag no."** So the rule is not about Quick Booking — it is
 * about every order.
 *
 * ONE GATE, SHARED, for exactly the reason `dispatchTagGate` is shared by
 * reading, printing and rider assignment: the tag surface has three doors
 * (generate the tags, confirm a tag on a piece, complete tagging) and three
 * separate guards would drift. A single definition means an unpaid order cannot
 * get through any of them.
 *
 * ⚠️ `moneyIsComplete` is deliberately IMPORTED from `util/productionClock.js`
 * rather than re-stated here. That function already answers "is the money
 * complete?" for the processing clock, and the client's rules tie the two
 * together: the same event that clears an order for production is the one that
 * releases its tags. Two copies of this predicate would eventually disagree
 * about a waived order, and then an order would be in production with no tags —
 * or tagged while still unpaid.
 */

const { moneyIsComplete } = require('./productionClock')

/**
 * May this order's item tags be produced yet?
 *
 * A WAIVED payment counts as complete here ON PURPOSE. The client's rule is
 * that an admin waiver lets the order *process* unpaid — it is stopped again at
 * dispatch instead (see `dispatchPaymentGate`). So a waiver opens the tags and
 * closes the door at the other end.
 */
function itemTagGate(order) {
    if (!order) return { ok: false, error: 'Order not found' }

    if (moneyIsComplete(order)) return { ok: true }

    // Written for the operator standing at the station, naming the next action
    // rather than just refusing. The amount is included because the first
    // question is always "how much?".
    const amount = Number(order.amount || 0)
    return {
        ok: false,
        error:
            'Tags cannot be printed until this order is paid. ' +
            (amount > 0
                ? `₦${amount.toLocaleString('en-NG')} is outstanding. `
                : '') +
            'The customer has been sent a payment link; an admin can waive the payment hold if the order must go ahead.',
        requiresPayment: true,
        outstandingAmount: amount,
        paymentStatus: order.paymentStatus || null,
    }
}

/**
 * A WAIVED order is **STOPPED AT DISPATCH** (client's words). It processes, it
 * gets tagged, it is washed and packed — and then it may not leave.
 *
 * Kept separate from `itemTagGate` because the two answers are deliberately
 * OPPOSITE for the same order: a waiver opens tagging and closes dispatch. One
 * combined "is this order OK?" helper would have to pick one, and whichever it
 * picked would be wrong at the other end.
 *
 * ⚠️ SCOPED TO A WAIVER ONLY, AND THAT NARROWNESS IS THE POINT.
 *
 * The first cut of this refused EVERY unpaid order at dispatch, which looked
 * like a faithful reading of "tags never print before payment". It is not:
 * `dispatchTagStaging` caught it immediately, because the dispatch tag has
 * deliberately supported an unpaid order since 2026-09-24 — it carries
 * `paymentState: 'unpaid'`, the outstanding figure, and a notice telling the
 * rider to have the customer *settle it in the app* and to **never collect
 * cash**. That is shipped, client-approved behaviour with its own assertions.
 *
 * So the client's rule is specifically about the WAIVER: an admin overrode a
 * payment hold to get the clothes washed, and that override must not also buy
 * the customer a delivery. An ordinary unpaid order still goes out with its
 * "settle in the app" tag, as it always has.
 */
function dispatchPaymentGate(order) {
    if (!order) return { ok: false, error: 'Order not found' }

    // Genuinely paid → nothing to stop.
    if (order.paymentStatus === 'success') return { ok: true }

    // Waived and still unpaid → processed on an override, but it cannot go out.
    if (order.paymentWaivedAt) {
        const amount = Number(order.amount || 0)
        return {
            ok: false,
            error:
                'This order was processed on a waived payment and cannot be dispatched until it is paid. ' +
                (amount > 0
                    ? `₦${amount.toLocaleString('en-NG')} is outstanding.`
                    : ''),
            requiresPayment: true,
            paymentWaived: true,
            outstandingAmount: amount,
        }
    }

    // Unpaid but never waived: the existing dispatch-tag flow owns this case
    // and prints the "settle it in the app, do not collect cash" notice. Not
    // our call to block.
    return { ok: true }
}

module.exports = {
    itemTagGate,
    dispatchPaymentGate,
    // Re-exported so a caller never reaches for a second definition.
    moneyIsComplete,
}
