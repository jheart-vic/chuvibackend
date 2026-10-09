// Releasing a PIECE from hold — one implementation, six callers.
//
// WHY THIS FILE EXISTS (FE report 2026-10-09: "a hold on a single item can't be
// cleared from Admin or the station screens").
//
// After the client's 2026-10-08 ruling that S2–S5 holds park the PIECE and not
// the order, three things were left broken:
//
//  1. **Some holds were unreleasable by anyone.** Every station's `sendToHold`
//     offers `assignTo: ADMIN` — it is the first option on all four — but there
//     is no admin station service, and `admin.service.js` never touched
//     `items.holdDetails`. Admin's own `resolveOrderHold` could not help either:
//     it finds the order with `{'stage.status': HOLD}`, which per-piece holds
//     deliberately no longer set. So an item hold assigned to Admin had no door.
//  2. **Release was all-or-nothing.** Each station's `releaseFromHold` takes an
//     order id and clears EVERY piece assigned to that role. Two pieces held on
//     one order for different reasons could not be separated.
//  3. Each release wrote the three release fields by hand, so a sixth caller
//     would have invented a fourth shape of "released".
//
// The rule for the optional `itemId`, which every caller shares:
//   - **omitted** → today's behaviour exactly: release every piece this caller
//     owns, and let the caller also rewind the order-level station progress.
//   - **given** → release that ONE piece and leave the order alone. Its siblings
//     are still mid-station, so rewinding `washDetails.startedAt` (or the press
//     equivalent) for the whole order would undo work that was never on hold.
//
// Nothing here writes to the database. Callers stamp, then save with their own
// station-specific resets, because what "workable again" means differs per
// station (washStatus, pressStatus, sortStatus, qcStatus, the tag fields).

const { isItemOnHold } = require('./itemHold')

/**
 * The held pieces this release may touch.
 *
 * `isItemOnHold` (heldAt && !releasedAt) is the gate rather than a bare
 * `assignTo` test, so a piece released earlier can never be released twice —
 * releasing nulls `assignTo` but LEAVES `heldAt` in place, which is the same
 * trap the `$elemMatch` filters in `util/itemHold.js` exist for.
 *
 * @param {object}   order   hydrated BookOrder document
 * @param {string?}  itemId  optional — restrict to this one piece
 * @param {function} isMine  (item) => boolean, the caller's ownership test
 */
function selectHeldItems({ order, itemId = null, isMine }) {
    const held = (order?.items || []).filter(
        (item) => isItemOnHold(item) && isMine(item),
    )
    if (!itemId) return held
    return held.filter((item) => String(item._id) === String(itemId))
}

/**
 * Stamp the release on one piece — the ONE place these three fields are written.
 * Mutates and returns the item; the caller saves.
 */
function stampRelease(item, { userId, now = new Date() }) {
    if (!item.holdDetails) return item
    item.holdDetails.releasedAt = now
    item.holdDetails.releasedByOperatorId = userId
    item.holdDetails.assignTo = null
    return item
}

/**
 * The refusal sentence when nothing matched, written so the operator knows
 * which of the two reasons applies rather than reading a bare "not found".
 */
function nothingToRelease({ itemId, where }) {
    return itemId
        ? 'That piece is not currently on hold, or it is not assigned to you to release.'
        : `No pieces are currently on hold ${where}.`
}

module.exports = { selectHeldItems, stampRelease, nothingToRelease }
