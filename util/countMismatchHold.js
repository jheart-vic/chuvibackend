/**
 * "If INTAKE's count differs from the RIDER's, the order STOPS and goes on hold
 * — admin-only approval." (Client spec, locked 2026-10-07. They OVERRULED our
 * proposal never to block here.)
 *
 * Why a helper rather than inline: the hold has to look EXACTLY like every
 * other order-level hold or it drops out of the machinery that already exists —
 * Holds Management's Active/Overdue partition reads `stage.status: HOLD`, the
 * SLA clock reads `stage.updatedAt`, the escalation cron reads
 * `orderHold.holdTypeKey` and latches on `orderHold.escalatedAt`, and
 * `stageHistory` is what the order timeline renders. Writing four of those five
 * from memory at a new call site is how a hold ends up invisible on the screen
 * that exists to show it.
 *
 * The hold TYPE (`count_differs_from_rider`) is already seeded with
 * `requiresAdminApproval: true`, so "admin-only approval" needs no new
 * permission logic — the existing release path enforces it.
 */

const {
    ORDER_STATUS,
    STATION_STATUS,
    ACTIVITY_TYPE,
    NOTIFICATION_TYPE,
    ROLE,
} = require('./constants')

const COUNT_MISMATCH_HOLD_KEY = 'count_differs_from_rider'

/**
 * Raises the hold on an already-loaded order. Returns true when the hold was
 * written.
 *
 * ⚠️ Writes with `updateOne`, NOT by mutating and saving the caller's document.
 * The caller (`proceedToTag`) has its own pending edits to `counts`, and a
 * `save()` there would race this write; doing it as one atomic `$set` means the
 * hold is either fully recorded or not at all.
 *
 * It deliberately does NOT swallow its own failure: unlike an audit row or a
 * notification, this hold IS the outcome — if it cannot be written the order
 * must not be reported as held.
 */
async function raiseCountMismatchHold({
    order,
    riderCount,
    intakeCount,
    actorId,
    BookOrderModel,
    ActivityModel,
    notifyRoles,
}) {
    const Model = BookOrderModel || require('../models/bookOrder.model')
    const Activity = ActivityModel || require('../models/activity.model')
    const notify = notifyRoles || require('./notifyRoles').notifyRoles

    const now = new Date()
    const note = `Count differs from rider: rider recorded ${riderCount}, Intake counted ${intakeCount}. Needs admin approval.`

    await Model.updateOne(
        { _id: order._id },
        {
            $set: {
                'stage.status': ORDER_STATUS.HOLD,
                'stage.note': note,
                'stage.updatedAt': now,
                // The hold is assigned to Intake, which is where the clothes
                // and the disagreement physically are.
                stationStatus: STATION_STATUS.INTAKE_AND_TAG_STATION,
                'orderHold.holdTypeKey': COUNT_MISMATCH_HOLD_KEY,
                // Keep the counts that caused it, written in the same atomic
                // update as the hold itself so the two can never disagree.
                'counts.intake': intakeCount,
                'counts.intakeConfirmedAt': now,
                ...(actorId ? { 'counts.intakeConfirmedBy': actorId } : {}),
                flaggedForReview: true,
                flagMessage: note,
            },
            // A fresh hold has not escalated yet — same reasoning as the admin
            // hold path: clearing the latch lets a re-held order escalate again
            // on its own merits instead of being silently suppressed.
            $unset: { 'orderHold.escalatedAt': '' },
            $push: {
                stageHistory: {
                    status: ORDER_STATUS.HOLD,
                    note,
                    updatedAt: now,
                },
            },
        },
        { runValidators: false },
    )

    // The record and the alert are both non-fatal: the hold is already written,
    // and a record of the work must never reverse the work.
    try {
        await Activity.create({
            title: 'Order held — count differs from rider',
            description: `Order ${order.oscNumber}: rider ${riderCount}, Intake ${intakeCount}.`,
            type: ACTIVITY_TYPE.ORDER_UPDATED,
            orderId: order._id,
            userId: actorId || null,
            reference: order.oscNumber,
        })
    } catch (error) {
        console.error('count-mismatch activity failed:', error?.message)
    }

    try {
        // Admin-only approval, so the admins are the ones who must hear about
        // it — the order cannot move until one of them acts.
        await notify({
            roles: [ROLE.ADMIN],
            title: 'Order on hold: count differs from rider',
            body: `Order ${order.oscNumber} — rider recorded ${riderCount}, Intake counted ${intakeCount}.`,
            subBody: 'Only an admin can approve this order to continue.',
            type: NOTIFICATION_TYPE.ORDER_UPDATED,
        })
    } catch (error) {
        console.error('count-mismatch notify failed:', error?.message)
    }

    return true
}

module.exports = {
    COUNT_MISMATCH_HOLD_KEY,
    raiseCountMismatchHold,
}
