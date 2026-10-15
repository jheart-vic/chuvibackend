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
function stampRelease(item, { userId, now = new Date(), note = null }) {
    if (!item.holdDetails) return item
    item.holdDetails.releasedAt = now
    item.holdDetails.releasedByOperatorId = userId
    item.holdDetails.assignTo = null
    // V1 batch 3b (FE F28): the note sent with "Fixed, send again" is kept on
    // the hold and in the piece's history.
    const text = typeof note === 'string' ? note.trim() : ''
    if (text) {
        item.holdDetails.releaseNote = text
        if (Array.isArray(item.actionLog)) {
            item.actionLog.push({ action: 'hold_released', note: text, timestamp: now })
        }
    }
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

// R15 (client V1 test plan, 14 Oct 2026): "Only the roles allowed for a hold
// type can release it; admin can release all. Anyone else gets 'Only admin can
// release this' instead of an error."
//
// `HoldType.requiresAdminApproval` was seeded on the count-mismatch hold from
// the start, but no release path ever read it, so Intake could wave through the
// very discrepancy it was party to (T3.04). This is the one place it is read.
const ADMIN_ONLY_MESSAGE = 'Only admin can release this.'

/**
 * Returns a refusal `{ error, requiresAdmin }` when a non-admin is about to
 * release a hold whose type needs an admin, else null.
 *
 * @param {object}   order        the order being released
 * @param {object[]} items        the pieces this release would clear
 * @param {string}   role         the caller's role
 * @param {boolean}  orderLevel   true when the release also clears the
 *                                order-level hold (`orderHold.holdTypeKey`)
 */
async function adminOnlyRefusal({ order, items = [], role, orderLevel = false }) {
    const { ROLE } = require('./constants')
    if (role === ROLE.ADMIN) return null

    const keys = new Set(
        items.map((i) => i?.holdDetails?.reason).filter(Boolean),
    )
    if (orderLevel && order?.orderHold?.holdTypeKey) {
        keys.add(order.orderHold.holdTypeKey)
    }
    if (!keys.size) return null

    const HoldTypeModel = require('../models/holdType.model')
    const adminOnly = await HoldTypeModel.exists({
        key: { $in: [...keys] },
        requiresAdminApproval: true,
    })
    return adminOnly ? { error: ADMIN_ONLY_MESSAGE, requiresAdmin: true } : null
}

/**
 * V1 batch 3 (R5, T5.08): a piece rejected twice is assigned to ADMIN. When a
 * station tries to release it, the answer is the client's sentence, not "no
 * pieces on hold". Returns the refusal, or null.
 */
function adminAssignedRefusal({ order, itemId = null, role }) {
    const { ROLE } = require('./constants')
    const { isItemOnHold } = require('./itemHold')
    if (role === ROLE.ADMIN) return null
    const adminHeld = (order?.items || []).some(
        (i) =>
            isItemOnHold(i) &&
            i.holdDetails?.assignTo === ROLE.ADMIN &&
            (!itemId || String(i._id) === String(itemId)),
    )
    return adminHeld ? { error: ADMIN_ONLY_MESSAGE, requiresAdmin: true } : null
}

module.exports = {
    adminAssignedRefusal,
    selectHeldItems,
    stampRelease,
    nothingToRelease,
    adminOnlyRefusal,
    ADMIN_ONLY_MESSAGE,
}
