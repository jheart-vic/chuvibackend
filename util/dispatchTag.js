// CHUVI dispatch tag — ONE tag per order, printed only for an order leaving the
// office by rider delivery.
//
// This is NOT the per-piece intake item tag (`items[].tagId`) and not a reprint
// of it. The item tag tracks a garment through the office; this one gives the
// rider positive identification at the customer's door — someone they have never
// met, somewhere they don't control.
//
// Client decisions this encodes (2026-09-24):
//  - S1 (intake-and-tag) prints it, at the moment they hand the bagged order to
//    the rider. Not QC, never the rider.
//  - Printing does NOT mark the order ready (pack & seal still does that). It
//    gates RIDER ASSIGNMENT instead, so customer messaging is never delayed and
//    an untagged order simply isn't assignable.
//  - The amount line is a FLAG, not a collection instruction: laundry is always
//    prepaid, so an outstanding figure means "ask the customer to settle in the
//    app", never "collect cash".
//  - No barcode/QR yet (no scanners at any station). `ref` is what one would
//    encode in V2, so adding it needs no backend change.
//
// Pure functions over a plain order document, so the gate and the payload have
// ONE definition shared by the read endpoint, the print endpoint and the
// rider-assignment guard.
const { PAYMENT_ORDER_STATUS } = require('./constants')
const { normalizeAddress } = require('./address')
const { briefsForAll, summarize, countPieces } = require('./itemSummary')

// A tag printed this many times is surfaced for review — client asked that "five
// reprints should be visible and flaggable on our side".
const REPRINT_REVIEW_THRESHOLD = 3

// May this order have a dispatch tag at all? Returns { ok } or { ok:false, error }.
// Takes an already-loaded order so callers control the query.
function dispatchTagGate(order) {
    if (!order) return { ok: false, error: 'Order not found' }

    // A customer collecting from the office identifies themselves in person, so
    // there is nothing for a tag to prove. Refuse with the reason rather than
    // returning an empty tag.
    //
    // NOTE the vocabulary trap: `isPickUp` means WE collect FROM the customer;
    // `isDelivery` means we deliver TO them. Only the latter earns a tag.
    if (!order.isDelivery) {
        return {
            ok: false,
            error: 'This order is not going out for delivery, so it has no dispatch tag. Only rider deliveries are tagged.',
        }
    }

    // The tag prints at the point the order is packed, confirmed and ready to
    // leave — not before.
    if (!order.qcDetails?.packCompletedAt) {
        return {
            ok: false,
            error: 'Order has not completed Pack & Seal yet, so it is not ready to leave the office.',
        }
    }

    return { ok: true }
}

// Has this order been tagged for dispatch? The single definition, shared by the
// print endpoint and the rider-assignment guard.
function isTagPrinted(order) {
    return !!order?.dispatchTag?.printedAt
}

// What the rider must flag at the door, if anything.
//
// Branches on paymentStatus, NEVER on `amount > 0`: a subscription order has an
// amount but is already covered by the plan. `amount` is already the FULL billed
// total (bookOrder.service: items + pickup/delivery/speed − discount) and on a
// subscriber-overflow order it IS the logistics fee — so adding `deliveryAmount`
// or `logisticsFee` would double-count.
//
// Returns null when there is nothing outstanding, so the tag prints no figure at
// all rather than a "₦0" a rider could read as "collect zero".
function amountDue(order) {
    if (order.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS) return null
    const outstanding = Number(order.amount) || 0
    return outstanding > 0 ? outstanding : null
}

function buildDispatchTagPayload(order) {
    const briefs = briefsForAll(order.items)
    const due = amountDue(order)
    const printCount = order.dispatchTag?.printCount || 0

    return {
        orderId: String(order._id),
        // The order reference IS the tag reference — a second numbering scheme
        // would only be one more thing to reconcile. Also what a future barcode
        // would encode.
        ref: order.dispatchTag?.ref || order.oscNumber,
        orderReference: order.oscNumber,
        customerName: order.fullName,
        customerPhone: order.phoneNumber,
        // Structured {label,address,landmark}; tolerant of legacy string orders.
        deliveryAddress: normalizeAddress(order.deliveryAddress) || null,
        contents: summarize(briefs),
        itemCount: countPieces(briefs),
        items: briefs,
        // Prepaid is the norm, so state the payment situation in words the rider
        // can act on. `amountDue` stays a number/null for display; the notice is
        // what stops a figure reading as a cash-collection instruction.
        paymentState: due == null ? 'paid' : 'unpaid',
        amountDue: due,
        paymentNotice:
            due == null
                ? 'Paid in full — nothing to collect.'
                : 'Payment did not go through. Ask the customer to settle it in the app — do NOT collect cash.',
        deliveryNote: order.dispatchDetails?.delivery?.note || '',
        printedAt: order.dispatchTag?.printedAt || null,
        printCount,
        reprintFlagged: printCount > REPRINT_REVIEW_THRESHOLD,
    }
}

module.exports = {
    REPRINT_REVIEW_THRESHOLD,
    dispatchTagGate,
    isTagPrinted,
    amountDue,
    buildDispatchTagPayload,
}
