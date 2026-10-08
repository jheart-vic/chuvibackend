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

module.exports = { isItemOnHold, heldItems, describeHeld }
