const BaseService = require('./base.service')
const BookOrderModel = require('../models/bookOrder.model')
const HoldTypeModel = require('../models/holdType.model')
const ActivityModel = require('../models/activity.model')
const UserModel = require('../models/user.model')
const createAuditLog = require('../util/createAuditLog')
const sendSms = require('../util/sendSms')
const createNotification = require('../util/createNotification')
const { notifyRoles } = require('../util/notifyRoles')
const { markProductionClearedIfReady } = require('../util/productionClock')
const {
    ORDER_STATUS,
    STATION_STATUS,
    ACTIVITY_TYPE,
    NOTIFICATION_TYPE,
    PAYMENT_ORDER_STATUS,
    AUDIT_LOG_CATEGORIES,
    ROLE,
} = require('../util/constants')

/**
 * THE PAYMENT HOLD — N1 Phase 3 (client spec, locked 2026-10-07/08).
 *
 * "Intake's four steps: confirm the rider count → enter the items (the system
 * computes the total, Intake CANNOT type an amount) → a payment hold in the
 * Holds section with an SMS and an in-app Paystack link → on payment, the tags
 * print and the order goes to S2. Reminders at 6h and 24h, admin alerted at
 * 48h. Paystack clears the hold automatically; a bank transfer is approved by
 * Intake OR admin, and every Intake approval notifies an admin and lands on a
 * daily bank-check list. A normal unpaid booking follows the same rule: intake
 * yes, tag no. An admin can WAIVE the hold with a reason → the order processes
 * unpaid but is STOPPED AT DISPATCH."
 *
 * THE HOLD IS AN ORDINARY ORDER-LEVEL HOLD. It writes `stage.status: HOLD` plus
 * `orderHold.holdTypeKey: 'payment'`, so the Holds Management screen, the SLA
 * partition, the 48h limit (`judgeByOwnLimitOnly`, already seeded) and the
 * escalation cron all pick it up with no special-casing. The only thing this
 * service adds is the lifecycle the other hold types do not have: the payment
 * link, and the reminder latches.
 *
 * ⚠️ IT NEVER COMPUTES AN AMOUNT. The bill is whatever the pricing pipeline
 * already put on the order — the client's "staff can never type an amount" is
 * enforced by this service having no way to accept one.
 */
class PaymentHoldService {
    /** Reminder latch names. Names, not counts — see the model comment. */
    static REMINDERS = Object.freeze({
        SIX_HOURS: '6h',
        TWENTY_FOUR_HOURS: '24h',
        ADMIN_48: 'admin-48h',
    })

    static SCHEDULE = Object.freeze([
        { latch: '6h', afterHours: 6, audience: 'customer' },
        { latch: '24h', afterHours: 24, audience: 'customer' },
        { latch: 'admin-48h', afterHours: 48, audience: 'admin' },
    ])

    /** Is this order's payment hold currently open? */
    static isOnPaymentHold(order) {
        return Boolean(
            order?.paymentHold?.raisedAt && !order?.paymentHold?.clearedAt,
        )
    }

    /**
     * Raise the hold and tell the customer.
     *
     * Returns `{ ok, amount, paymentUrl }`. Idempotent: raising it twice does
     * not re-send the link or reset the 48h clock, because a second Intake tap
     * would otherwise give the customer a fresh deadline.
     */
    static async raise({ orderId, actorId, reason = null }) {
        try {
            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }

            if (order.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS) {
                return BaseService.sendFailedResponse({
                    error: 'This order is already paid, so there is nothing to hold it for.',
                })
            }
            if (this.isOnPaymentHold(order)) {
                // Not an error — the operator pressed it twice, or two screens
                // did. Report the existing hold rather than restarting it.
                return BaseService.sendSuccessResponse({
                    message: {
                        alreadyOnHold: true,
                        amount: order.paymentHold.amount,
                        paymentUrl: order.paymentHold.paymentUrl || null,
                        raisedAt: order.paymentHold.raisedAt,
                    },
                })
            }

            // The amount comes from the order. There is deliberately no
            // parameter for it.
            const amount = Number(order.amount || 0)
            if (amount <= 0) {
                return BaseService.sendFailedResponse({
                    error: 'This order has no outstanding amount, so no payment hold is needed.',
                })
            }

            const paymentUrl = await this._buildPaymentLink(order)

            const now = new Date()
            const note =
                reason ||
                `Awaiting payment of ₦${amount.toLocaleString('en-NG')}. Nothing is tagged until it clears.`

            await BookOrderModel.updateOne(
                { _id: order._id },
                {
                    $set: {
                        'stage.status': ORDER_STATUS.HOLD,
                        'stage.note': note,
                        'stage.updatedAt': now,
                        stationStatus: STATION_STATUS.INTAKE_AND_TAG_STATION,
                        'orderHold.holdTypeKey': HoldTypeModel.PAYMENT_HOLD_KEY,
                        paymentHold: {
                            raisedAt: now,
                            raisedBy: actorId || undefined,
                            amount,
                            paymentUrl: paymentUrl || undefined,
                        },
                    },
                    // A fresh hold has not escalated — same reasoning as every
                    // other hold path: a re-held order must be able to escalate
                    // again on its own merits.
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

            await this._tellCustomer({
                order,
                amount,
                paymentUrl,
                body: `Chuvi: your order ${order.oscNumber} comes to ₦${amount.toLocaleString('en-NG')}. Please pay to start processing${paymentUrl ? `: ${paymentUrl}` : ' in the app'}.`,
                title: 'Payment needed to start your order',
            })

            await this._log(
                actorId,
                `Raised payment hold on order ${order.oscNumber} for ₦${amount.toLocaleString('en-NG')}`,
                order._id,
            )

            return BaseService.sendSuccessResponse({
                message: {
                    held: true,
                    amount,
                    paymentUrl: paymentUrl || null,
                    raisedAt: now,
                },
            })
        } catch (error) {
            console.error('raise payment hold failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Could not put this order on a payment hold.',
            })
        }
    }

    /**
     * Clear the hold because the money arrived. Called from the Paystack
     * webhook, a wallet settlement, and an Intake/admin bank-transfer approval.
     *
     * `source` records WHICH of those it was, because "who confirmed this?" is
     * the first question asked about a bank transfer.
     *
     * ⚠️ This does NOT set `paymentStatus` — the caller owns that, because each
     * path proves payment differently (a webhook signature, a wallet debit, a
     * human looking at a bank app). Clearing a hold on an order this function
     * had also marked paid would hide which one actually happened.
     */
    static async clear({ orderId, source, actorId = null }) {
        try {
            const order = await BookOrderModel.findById(orderId)
            if (!order) return { ok: false, reason: 'not-found' }
            if (!this.isOnPaymentHold(order)) {
                return { ok: false, reason: 'not-on-payment-hold' }
            }

            const now = new Date()
            await BookOrderModel.updateOne(
                { _id: order._id },
                {
                    $set: {
                        // Back to the tagging queue — this is the client's
                        // "on payment, tags print and the order goes to S2".
                        'stage.status': ORDER_STATUS.QUEUE,
                        'stage.note': '',
                        'stage.updatedAt': now,
                        'paymentHold.clearedAt': now,
                        'paymentHold.clearedBy': source,
                        ...(actorId ? { 'paymentHold.clearedByUser': actorId } : {}),
                    },
                    $unset: {
                        'orderHold.holdTypeKey': '',
                        'orderHold.escalatedAt': '',
                    },
                    $push: {
                        stageHistory: {
                            status: ORDER_STATUS.QUEUE,
                            note: `Payment confirmed (${source}) — released from payment hold.`,
                            updatedAt: now,
                        },
                    },
                },
                { runValidators: false },
            )

            // The money may have been the LATER of the two events that clear an
            // order for production, so recompute. Non-fatal by design.
            try {
                await markProductionClearedIfReady(order._id)
            } catch (error) {
                console.error('production clock (payment hold cleared):', error?.message)
            }

            try {
                await createNotification({
                    userId: order.userId,
                    title: 'Payment received',
                    body: `Thank you — payment for order ${order.oscNumber} has been received and we have started work.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.ORDER_UPDATED,
                })
            } catch (error) {
                console.error('payment cleared notification failed:', error?.message)
            }

            await this._log(
                actorId,
                `Payment hold cleared on order ${order.oscNumber} (${source})`,
                order._id,
            )

            return { ok: true }
        } catch (error) {
            console.error('clear payment hold failed:', error)
            return { ok: false, reason: 'error' }
        }
    }

    /**
     * ADMIN WAIVER. "An admin can WAIVE a payment hold with a reason → the
     * order processes unpaid but is STOPPED AT DISPATCH."
     *
     * The stop at the other end is NOT implemented here — it lives in
     * `dispatchPaymentGate`, which `dispatchTagGate` calls, so reading the
     * tag, printing it and assigning a rider are all refused by one check.
     * This function only opens the production door.
     *
     * A reason is REQUIRED. A waiver is somebody deciding to process unpaid
     * work; without a reason there is no way to review that decision later.
     */
    static async waive({ orderId, reason, actorId }) {
        try {
            const clean = String(reason || '').trim()
            if (!clean) {
                return BaseService.sendFailedResponse({
                    error: 'A reason is required to waive a payment hold.',
                })
            }

            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }
            if (order.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS) {
                return BaseService.sendFailedResponse({
                    error: 'This order is already paid — there is nothing to waive.',
                })
            }
            if (order.paymentWaivedAt) {
                return BaseService.sendFailedResponse({
                    error: 'This order’s payment has already been waived.',
                })
            }

            const now = new Date()
            await BookOrderModel.updateOne(
                { _id: order._id },
                {
                    $set: {
                        paymentWaivedAt: now,
                        paymentWaivedBy: actorId,
                        paymentWaiverReason: clean,
                        'stage.status': ORDER_STATUS.QUEUE,
                        'stage.note': '',
                        'stage.updatedAt': now,
                        'paymentHold.clearedAt': now,
                        'paymentHold.clearedBy': 'waiver',
                        'paymentHold.clearedByUser': actorId,
                    },
                    $unset: {
                        'orderHold.holdTypeKey': '',
                        'orderHold.escalatedAt': '',
                    },
                    $push: {
                        stageHistory: {
                            status: ORDER_STATUS.QUEUE,
                            note: `Payment waived by an admin: ${clean}. Order will be stopped at dispatch until paid.`,
                            updatedAt: now,
                        },
                    },
                },
                { runValidators: false },
            )

            // A waiver counts as money-complete for the processing clock — the
            // client's rule is that such an order DOES go into production.
            try {
                await markProductionClearedIfReady(order._id)
            } catch (error) {
                console.error('production clock (waiver):', error?.message)
            }

            try {
                await notifyRoles({
                    roles: [ROLE.ADMIN, ROLE.INTAKE_AND_TAG],
                    title: 'Payment waived',
                    body: `Order ${order.oscNumber} will be processed unpaid (₦${Number(order.amount || 0).toLocaleString('en-NG')} outstanding).`,
                    subBody: `Reason: ${clean}. It cannot be dispatched until it is paid.`,
                    type: NOTIFICATION_TYPE.ORDER_UPDATED,
                })
            } catch (error) {
                console.error('waiver notify failed:', error?.message)
            }

            await this._log(
                actorId,
                `Waived payment hold on order ${order.oscNumber}: ${clean}`,
                order._id,
            )

            return BaseService.sendSuccessResponse({
                message: {
                    waived: true,
                    waivedAt: now,
                    reason: clean,
                    outstandingAmount: Number(order.amount || 0),
                    note: 'The order will process unpaid but cannot be dispatched until it is paid.',
                },
            })
        } catch (error) {
            console.error('waive payment hold failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Could not waive this payment hold.',
            })
        }
    }

    /**
     * The reminder sweep, called by the cron. Returns a tally.
     *
     * Each reminder is latched BY NAME in `paymentHold.remindersSent`, and the
     * latch is written with `$addToSet` in the same update as the send, so a
     * sweep that overlaps another cannot double-send and a missed sweep sends
     * late rather than never.
     */
    static async runReminderSweep({ now = new Date() } = {}) {
        const tally = { considered: 0, sent: 0, byLatch: {} }
        try {
            const open = await BookOrderModel.find({
                'paymentHold.raisedAt': { $exists: true },
                'paymentHold.clearedAt': { $exists: false },
                paymentStatus: { $ne: PAYMENT_ORDER_STATUS.SUCCESS },
                paymentWaivedAt: { $exists: false },
                'cancellation.cancelledAt': { $exists: false },
            }).limit(500)

            tally.considered = open.length

            for (const order of open) {
                const raisedAt = new Date(order.paymentHold.raisedAt)
                const hours = (now - raisedAt) / 3600000
                const sent = order.paymentHold.remindersSent || []

                for (const step of this.SCHEDULE) {
                    if (hours < step.afterHours) continue
                    if (sent.includes(step.latch)) continue

                    // Claim the latch FIRST. If the send then fails we lose one
                    // reminder; if we sent first and the latch write failed we
                    // would message the customer on every sweep, which is worse.
                    const claimed = await BookOrderModel.updateOne(
                        {
                            _id: order._id,
                            'paymentHold.remindersSent': { $ne: step.latch },
                            'paymentHold.clearedAt': { $exists: false },
                        },
                        { $addToSet: { 'paymentHold.remindersSent': step.latch } },
                    )
                    if (!claimed.modifiedCount) continue

                    const amount = Number(
                        order.paymentHold.amount || order.amount || 0,
                    )
                    try {
                        if (step.audience === 'admin') {
                            await notifyRoles({
                                roles: [ROLE.ADMIN],
                                title: 'Payment hold unpaid after 48 hours',
                                body: `Order ${order.oscNumber} has been awaiting payment for 48 hours (₦${amount.toLocaleString('en-NG')}).`,
                                subBody: 'Decide whether to waive it, chase the customer, or cancel.',
                                type: NOTIFICATION_TYPE.ORDER_UPDATED,
                            })
                        } else {
                            await this._tellCustomer({
                                order,
                                amount,
                                paymentUrl: order.paymentHold.paymentUrl,
                                body: `Chuvi: a reminder that order ${order.oscNumber} is waiting for payment of ₦${amount.toLocaleString('en-NG')}${order.paymentHold.paymentUrl ? `: ${order.paymentHold.paymentUrl}` : ''}. We start as soon as it clears.`,
                                title: 'Your order is waiting for payment',
                            })
                        }
                        tally.sent += 1
                        tally.byLatch[step.latch] =
                            (tally.byLatch[step.latch] || 0) + 1
                    } catch (error) {
                        console.error(
                            `payment reminder ${step.latch} for ${order.oscNumber} failed:`,
                            error?.message,
                        )
                    }
                }
            }
        } catch (error) {
            console.error('payment reminder sweep failed:', error)
        }
        return tally
    }

    /**
     * BANK TRANSFER APPROVED BY INTAKE (or an admin).
     *
     * Client spec: "a bank transfer is approved by Intake OR admin, every
     * Intake approval notifies an admin + lands on a daily bank-check list."
     *
     * The notification is not decoration — it is the control. Intake is being
     * trusted to say "the money arrived", which is a claim nobody else has
     * verified at the moment it is made, so an admin is told immediately and
     * the claim is queued for a daily reconciliation against the bank
     * statement. `approvedByRole` is stored for exactly that review.
     *
     * A REFERENCE is required: without the sender's name or the transfer
     * reference, the daily check has nothing to match against the statement and
     * the list is unusable.
     */
    static async approveTransfer({ orderId, reference, note, actor }) {
        try {
            const cleanRef = String(reference || '').trim()
            if (!cleanRef) {
                return BaseService.sendFailedResponse({
                    error: 'A transfer reference or the sender’s name is required, so this can be matched against the bank statement.',
                })
            }

            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }
            if (order.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS) {
                return BaseService.sendFailedResponse({
                    error: 'This order is already marked paid.',
                })
            }

            const now = new Date()
            const amount = Number(
                order.paymentHold?.amount || order.amount || 0,
            )

            // The order is marked paid HERE, by a human, which is exactly why
            // the review trail below exists.
            await BookOrderModel.updateOne(
                { _id: order._id },
                {
                    $set: {
                        paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                        paymentMethod: 'bank-transfer',
                        paymentDate: now,
                        reference: cleanRef,
                        bankTransferApproval: {
                            approvedAt: now,
                            approvedBy: actor?.id,
                            approvedByRole: actor?.userType,
                            reference: cleanRef,
                            note: String(note || '').trim() || undefined,
                            amount,
                        },
                    },
                },
                { runValidators: false },
            )

            await this.clear({
                orderId: order._id,
                source: 'bank-transfer',
                actorId: actor?.id,
            })

            // Every approval tells an admin. An Intake approval says so
            // explicitly, because that is the one the client wants reviewed.
            const byIntake = actor?.userType === ROLE.INTAKE_AND_TAG
            try {
                await notifyRoles({
                    roles: [ROLE.ADMIN],
                    title: byIntake
                        ? 'Bank transfer approved by Intake & Tag'
                        : 'Bank transfer approved',
                    body: `Order ${order.oscNumber}: ₦${amount.toLocaleString('en-NG')} marked paid by transfer (ref ${cleanRef}).`,
                    subBody: byIntake
                        ? 'On today’s bank-check list for confirmation against the statement.'
                        : undefined,
                    type: NOTIFICATION_TYPE.ORDER_UPDATED,
                })
            } catch (error) {
                console.error('transfer approval notify failed:', error?.message)
            }

            await this._log(
                actor?.id,
                `Approved bank transfer of ₦${amount.toLocaleString('en-NG')} for order ${order.oscNumber} (ref ${cleanRef})`,
                order._id,
            )

            return BaseService.sendSuccessResponse({
                message: {
                    approved: true,
                    amount,
                    reference: cleanRef,
                    approvedAt: now,
                    onBankCheckList: true,
                    note: 'An admin has been notified and this is on today’s bank-check list.',
                },
            })
        } catch (error) {
            console.error('approveTransfer failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Could not approve this transfer.',
            })
        }
    }

    /**
     * THE DAILY BANK-CHECK LIST. Every transfer approved in the window, so an
     * admin can tick them off against the bank statement.
     *
     * Defaults to TODAY in Lagos (the process is pinned, so a plain
     * `setHours(0,0,0,0)` is Lagos midnight). The upper bound is EXCLUSIVE, per
     * the `util/lagosDay` convention — `23:59:59.999` drops the final
     * millisecond.
     */
    static async bankCheckList({ from, to } = {}) {
        try {
            const { startOfDay, endOfDay } = require('../util/lagosDay')
            const start = from ? new Date(from) : startOfDay(new Date())
            const end = to ? new Date(to) : endOfDay(new Date())

            const rows = await BookOrderModel.find({
                'bankTransferApproval.approvedAt': { $gte: start, $lt: end },
            })
                .select(
                    'oscNumber fullName phoneNumber amount bankTransferApproval paymentStatus',
                )
                .populate('bankTransferApproval.approvedBy', 'fullName userType')
                .sort({ 'bankTransferApproval.approvedAt': 1 })
                .lean()

            const total = rows.reduce(
                (sum, r) => sum + Number(r.bankTransferApproval?.amount || 0),
                0,
            )

            return BaseService.sendSuccessResponse({
                message: {
                    from: start,
                    to: end,
                    count: rows.length,
                    totalApproved: total,
                    // Separated because the client's concern is specifically
                    // the approvals made by Intake, not by an admin.
                    byIntakeCount: rows.filter(
                        (r) =>
                            r.bankTransferApproval?.approvedByRole ===
                            ROLE.INTAKE_AND_TAG,
                    ).length,
                    rows,
                    note: 'Match each reference against the bank statement. The upper bound is exclusive.',
                },
            })
        } catch (error) {
            console.error('bankCheckList failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Could not load the bank-check list.',
            })
        }
    }

    // ───────────────────────────── internals ─────────────────────────────

    /**
     * An in-app Paystack link for the outstanding amount, reusing the existing
     * `initializePayment` rather than talking to Paystack again — it already
     * owns the reference, the Payment row and the amount conversion, and the
     * webhook that clears this hold recognises what it creates.
     *
     * Driven with a synthetic `{ body, user }` request, the same way the bot
     * drives controller-style services. Returns null on failure: a missing link
     * must not stop the hold being raised, because the SMS can still tell the
     * customer to pay in the app.
     */
    static async _buildPaymentLink(order) {
        try {
            if (!order.userId) return null // walk-in with no account
            const PaystackService = require('./paystack.service')
            const svc = new PaystackService()
            const res = await svc.initializePayment({
                body: { transactionType: 'order', orderId: String(order._id) },
                user: { id: String(order.userId) },
            })
            if (!res?.success) return null
            const d = res.data || {}
            return (
                d.authorization_url ||
                d.message?.authorization_url ||
                d.data?.authorization_url ||
                null
            )
        } catch (error) {
            console.error('payment link build failed:', error?.message)
            return null
        }
    }

    /** SMS + in-app, both non-fatal. The hold stands either way. */
    static async _tellCustomer({ order, amount, paymentUrl, body, title }) {
        try {
            if (order.phoneNumber) await sendSms(order.phoneNumber, body)
        } catch (error) {
            console.error('payment hold SMS failed:', error?.message)
        }
        try {
            if (order.userId) {
                await createNotification({
                    userId: order.userId,
                    title,
                    body,
                    subBody: paymentUrl
                        ? 'Tap to pay now.'
                        : `₦${Number(amount || 0).toLocaleString('en-NG')} outstanding.`,
                    type: NOTIFICATION_TYPE.ORDER_UPDATED,
                })
            }
        } catch (error) {
            console.error('payment hold notification failed:', error?.message)
        }
    }

    /** Activity + audit, never fatal. */
    static async _log(actorId, action, orderId) {
        try {
            await ActivityModel.create({
                title: 'Payment hold',
                description: action,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId,
                userId: actorId || null,
            })
        } catch (error) {
            console.error('payment hold activity failed:', error?.message)
        }
        try {
            if (actorId) {
                await createAuditLog({
                    userId: actorId,
                    action,
                    category: AUDIT_LOG_CATEGORIES.PAYMENT,
                    orderId,
                })
            }
        } catch (error) {
            console.error('payment hold audit failed:', error?.message)
        }
    }
}

module.exports = PaymentHoldService
