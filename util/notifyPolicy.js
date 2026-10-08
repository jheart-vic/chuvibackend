// WHO GETS NOTIFIED — client reply #2 section 10, and their confirmation of our
// recommendation on 2026-10-08.
//
// Before this, 31 of the 87 notification call sites were OPERATOR SELF-RECEIPTS:
// a message telling the person who just pressed the button that they had pressed
// the button. Every station screen already confirms the action and the order
// history already records it, so the notification bell was filling with noise
// and burying the messages that matter.
//
// THE RULES, in the client's words:
//   * switch OFF the operator self-receipts, EXCEPT
//       - "order in tagging queue"               (work has ARRIVED for you)
//       - "adjustment request approved/rejected" (an answer you were waiting for)
//   * for "hold reassigned" and the two "released from hold": send to the station
//     that is AFFECTED and NEVER to the person who performed the action.
//   * switch off for customers: "handoff confirmed between stations" and
//     "order flagged".
//   * ADD to admin: order cancelled · cancellation requested · order flagged ·
//     item flagged for review · item placed on hold (any station) · payment proof
//     uploaded · new complaint opened · payment approved/rejected by Intake.
//   * on-screen confirmation and order history MUST survive the switch-off.
//
// WHY A WRAPPER RATHER THAN DELETING THE CALLS: the suppressed sites still read
// as "this is where the operator would be told", with one function to flip if the
// client changes their mind, instead of 31 deletions whose reason is lost. The
// kept exceptions pass `keep: true` and name themselves, so the exception list is
// visible in the code and not just in this comment.

const createNotification = require('./createNotification')
const { notifyRoles } = require('./notifyRoles')
const { ROLE } = require('./constants')

// The events the client explicitly listed as "add to admin". Named so the audit
// of "which events reach an admin" can never drift from what is actually sent —
// our first inventory of that was wrong by two events.
const ADMIN_EVENT = {
    ORDER_CANCELLED: 'order-cancelled',
    CANCELLATION_REQUESTED: 'cancellation-requested',
    ORDER_FLAGGED: 'order-flagged',
    ITEM_FLAGGED: 'item-flagged',
    ITEM_ON_HOLD: 'item-on-hold',
    PAYMENT_PROOF_UPLOADED: 'payment-proof-uploaded',
    COMPLAINT_OPENED: 'complaint-opened',
    PAYMENT_DECIDED_BY_INTAKE: 'payment-decided-by-intake',
}

// An operator receipt. Suppressed unless the call site names itself as one of
// the client's two exceptions.
//
// `keep` must be the exception's own name, not `true`, so a new call site cannot
// quietly opt itself back in by copying a flag it does not understand.
const KEPT_RECEIPTS = ['order-in-tagging-queue', 'adjustment-request-decided']

async function notifyOperator({ keep, ...payload }) {
    if (!keep) return 0 // switched off by client policy
    if (!KEPT_RECEIPTS.includes(keep)) {
        // A typo in the exception name would otherwise silently SEND, which is
        // the opposite of the safe failure. Refuse to send and say so.
        console.error(
            `notifyOperator: "${keep}" is not a kept receipt. Allowed: ${KEPT_RECEIPTS.join(', ')}. Not sent.`,
        )
        return 0
    }
    try {
        await createNotification(payload)
        return 1
    } catch (error) {
        console.error('notifyOperator failed (non-fatal):', error?.message || error)
        return 0
    }
}

// The three hold messages. These are NOT receipts — they are the only way a
// station learns that work has arrived or been freed. Everyone at the affected
// station is told; the actor never is, even when they work at that station.
async function notifyAffectedStation({ role, actorId, title, body, subBody, type, recordId }) {
    if (!role) return 0
    return notifyRoles({
        roles: role,
        exceptUserId: actorId,
        title,
        body,
        subBody,
        type,
        recordId,
    })
}

// One of the eight events the client wants an admin to see. `event` is recorded
// only to keep the list honest; the message itself is what reaches them.
async function notifyAdminEvent({ event, title, body, subBody, type, recordId }) {
    if (!Object.values(ADMIN_EVENT).includes(event)) {
        console.error(`notifyAdminEvent: unknown event "${event}" — sending anyway.`)
    }
    return notifyRoles({
        roles: ROLE.ADMIN,
        title,
        body,
        subBody,
        type,
        recordId,
    })
}

module.exports = {
    ADMIN_EVENT,
    KEPT_RECEIPTS,
    notifyOperator,
    notifyAffectedStation,
    notifyAdminEvent,
}
