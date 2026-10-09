// Is this PIECE currently on hold?
//
// Why this exists (client confirmation request, 2026-10-08): they asked us to
// confirm that "pieces on hold do not move until the hold is released". They
// did not — and the reason is that a hold and a station's completion were two
// unrelated facts.
//
// Putting a piece on hold writes `flaggedForReview` and `holdDetails` and
// NOTHING ELSE. It does not touch `sortStatus`, `pretreatStatus`, `washStatus`,
// `pressStatus` or `qcStatus`. The handoff's completion gate (`itemCompleteAt`)
// only ever looked at those statuses. So a piece that had already finished its
// station work and was THEN placed on hold still satisfied every gate and could
// be pushed to the next station with its hold still open — at any station, not
// just Sort & Pretreat. The hold stayed on the piece and travelled with it.
//
// Both ways a piece goes on hold agree on the shape — a station hold
// (`sendToHold` in each station service) and a handoff rejection
// (`handoff.service.js`, "rejected items → Hold") each set `holdDetails.heldAt`
// and `holdDetails.assignTo`. All five release paths set `holdDetails.releasedAt`
// and null `assignTo`. So "still held" is heldAt without releasedAt, which is
// true for both and survives a release written either way.
//
// `flaggedForReview` is deliberately NOT part of the test: a piece can be
// flagged for review without being held (brief item 1.4 keeps those separate),
// and a flag must not stop work moving.

function isItemOnHold(item) {
    if (!item) return false
    const h = item.holdDetails
    if (!h) return false
    return !!h.heldAt && !h.releasedAt
}

// The held subset of a list, for a gate that wants to name what it refused.
function heldItems(items = []) {
    return items.filter(isItemOnHold)
}

// One sentence naming the pieces that are blocking a push, so staff are told
// what to release rather than just being refused.
function describeHeld(items = []) {
    const held = heldItems(items)
    if (!held.length) return null
    const names = held
        .map((i) => i.tagId || i.type || String(i._id))
        .slice(0, 5)
        .join(', ')
    return `${held.length} item(s) are on hold and cannot be moved until the hold is released: ${names}${
        held.length > 5 ? ', …' : ''
    }`
}

// ── CLIENT RULING 2026-10-08: a hold stops only what it is about ────────────
// "At Intake & Tag, and for payment holds, the hold stops the whole order. At
//  Sort & Pretreat, Wash & Dry, Press & Iron and QC & Pack, the hold stops only
//  that piece. The other pieces keep moving. The order cannot be packed or
//  dispatched until every held piece is released. The order still shows in Holds
//  Management, with the number of pieces on hold."
//
// Before this, every station's sendToHold also wrote the ORDER's stage to
// `hold`, which is what parked the siblings — the station guards then refused
// all further work on that order. The four production stations no longer do
// that, so these filters are how a held PIECE stays visible.
//
// THE TRAP, and the reason every query below uses $elemMatch: releasing a hold
// sets `releasedAt` and nulls `assignTo` but LEAVES `heldAt` in place. A bare
// `{'items.holdDetails.heldAt': {$exists: true}}` therefore matches every order
// that has ever had a hold, forever. Each clause must pin heldAt and the absence
// of releasedAt TO THE SAME ARRAY ELEMENT.

// Orders with at least one piece still held.
const anyItemHeldFilter = () => ({
    items: {
        $elemMatch: {
            'holdDetails.heldAt': { $exists: true, $ne: null },
            'holdDetails.releasedAt': { $exists: false },
        },
    },
})

// Pieces still held AND assigned to this station to resolve. Used by each
// station's hold queue and its release endpoint.
const itemHeldForStationFilter = (role) => ({
    items: {
        $elemMatch: {
            'holdDetails.heldAt': { $exists: true, $ne: null },
            'holdDetails.releasedAt': { $exists: false },
            'holdDetails.assignTo': role,
        },
    },
})

// "This order is on hold" for Holds Management: the ORDER is parked (Intake or a
// payment hold) OR any piece is held. Both filters that partition the holds must
// use this IDENTICAL clause, or the 4.4 Active/Overdue complement breaks.
const onHoldScope = (orderStatusHold) => ({
    $or: [{ 'stage.status': orderStatusHold }, anyItemHeldFilter()],
})

// How many pieces are still held — the count the client asked Holds Management
// to show. Works on a loaded document.
const heldItemCount = (order) => heldItems(order?.items || []).length

module.exports = {
    isItemOnHold,
    heldItems,
    describeHeld,
    anyItemHeldFilter,
    itemHeldForStationFilter,
    onHoldScope,
    heldItemCount,
}
