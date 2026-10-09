// Count-only booking — the customer says HOW MANY, not WHAT.
//
// CLIENT SPEC, locked 2026-10-07 (they overruled our proposal #2):
//   "Booking captures service type AND delivery speed AND landmark AND pickup
//    window AND the count. Same capacity gates as a normal booking, using the
//    customer's count. Copy on screen: every piece counts as one item; bill by
//    SMS before washing."
// and for Intake:
//   "confirm rider count → enter items (system computes total, intake CANNOT
//    type an amount) → payment hold with SMS + Paystack link → on payment, tags
//    print and the order goes to S2."
//
// So a Quick Booking is NOT a cheaper or a different order. It is an ordinary
// order whose CONTENTS are not known yet, and whose laundry bill therefore
// arrives later — which is precisely what `BookOrderService.applyItemEdit`
// already does ("applies to BOTH booking types... a normal booking whose real
// contents differ follows exactly the same rule as a Quick Booking").
//
// ── WHY THIS IS A NORMALISER AND NOT A SECOND BOOKING PATH ──────────────────
//
// `postBookOrder` has three billing branches, each with its own capacity gates,
// pricing, offer resolution, credit handling and per-piece explosion. A parallel
// "quick" path would be a FOURTH copy of the basket maths — and this codebase
// has already had three copies drift apart before 1.6, and a separate pricing
// service was explicitly rejected for item #7 for the same reason.
//
// Instead we translate the count into the shape the existing path already
// understands, at the very top, and then change nothing downstream.
//
// ── WHY N LINES OF QUANTITY 1, NOT ONE LINE OF QUANTITY N ───────────────────
//
// The capacity gates and the subscription monthly limit are all written against
// `post.items.length` — the number of LINES, not the sum of quantities. One
// line of quantity 50 therefore counts as 1 against capacity today. That is
// existing behaviour for normal bookings and is not this change's business to
// alter, but the client asked for "the same capacity gates, USING THE
// CUSTOMER'S COUNT". N lines of quantity 1 is the shape that makes those gates
// read the count, with no edit to any gate.
//
// It also means `explodeItemsToPieces` produces exactly N piece records, so the
// stations see N taggable pieces from the moment the order exists.
//
// ── WHY THE PLACEHOLDER PRICE IS ZERO ───────────────────────────────────────
//
// Because the client said the bill goes out by SMS before washing, and Intake —
// not the customer, and not us — establishes it. Inventing an "estimated price
// per piece" would quote the customer a number nobody approved, and would make
// the ₦4,000 offer threshold resolve against a guess. The spec is explicit that
// "the amount is checked ON THE BILL", and the real bill is computed at Intake
// by `_repriceForItems`, which re-runs pricing AND offers. So the laundry
// portion is 0 at booking and the logistics fees — which do NOT depend on the
// contents — are charged normally.

const QUICK_BOOKING_ITEM_TYPE = 'unspecified-item'

// A typo guard, not a business rule. Someone fat-fingering 500 pieces should be
// told, not quietly booked — the capacity gates would refuse it anyway, but
// with a message about delivery speed rather than about the number.
const MAX_QUICK_BOOKING_PIECES = 200

/**
 * Is this request a count-only booking?
 *
 * Deliberately narrow: `itemCount` present AND no usable `items`. A caller that
 * sends both is booking normally with a stray field, and the real items win —
 * guessing the other way would silently discard a priced basket.
 */
function isCountOnlyBooking(post) {
    if (!post) return false
    const hasItems = Array.isArray(post.items) && post.items.length > 0
    const hasCount =
        post.itemCount !== undefined &&
        post.itemCount !== null &&
        post.itemCount !== ''
    return hasCount && !hasItems
}

/**
 * Turn `{ itemCount: 10 }` into the `items[]` the existing booking path expects.
 *
 * Returns `{ ok: false, error }` for a count that cannot be honoured, so the
 * caller answers with a sentence rather than creating a nonsense order.
 * Mutates `post` on success — it is the request body being normalised.
 */
function applyCountOnlyBooking(post) {
    const raw = Number(post.itemCount)
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1) {
        return {
            ok: false,
            error: 'itemCount must be a whole number of pieces, at least 1.',
        }
    }
    if (raw > MAX_QUICK_BOOKING_PIECES) {
        return {
            ok: false,
            error: `That is more than ${MAX_QUICK_BOOKING_PIECES} pieces. Please check the number, or contact us to arrange a large order.`,
        }
    }

    // The bill does not exist yet, so nothing can be taken from a wallet or
    // counted against a plan at booking. Both are settled at Intake, where the
    // real total is computed and the payment hold is raised. Forcing this here
    // rather than refusing a wallet/subscription request keeps the customer's
    // booking working; what they chose is honoured when there is a bill.
    post.billingType = 'pay-per-item'
    // Credit opt-in likewise cannot apply to a zero basket. Carried on the
    // order so Intake's re-price can honour the customer's choice later.
    post.quickBooking = true
    post.itemsPending = true

    post.items = Array.from({ length: raw }, () => ({
        type: QUICK_BOOKING_ITEM_TYPE,
        price: 0,
        quantity: 1,
    }))

    // The customer's own count, kept as the first of the three counts the
    // rider and Intake later disagree with (`counts.rider`, `counts.intake`).
    // Without this the rider's mismatch check has nothing to compare against —
    // it falls back to counting `items`, which is right here by construction but
    // would stop being right the moment Intake replaces them.
    post.counts = { ...(post.counts || {}), customer: raw }

    return { ok: true, count: raw }
}

/** Is this stored order still waiting for its real contents? */
function awaitingRealItems(order) {
    if (!order) return false
    if (order.itemsPending === false) return false
    return (order.items || []).some(
        (i) => i?.type === QUICK_BOOKING_ITEM_TYPE,
    )
}

module.exports = {
    QUICK_BOOKING_ITEM_TYPE,
    MAX_QUICK_BOOKING_PIECES,
    isCountOnlyBooking,
    applyCountOnlyBooking,
    awaitingRealItems,
}
