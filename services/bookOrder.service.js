const BaseService = require('./base.service')
const UserModel = require('../models/user.model')
const validateData = require('../util/validate')
const { normalizeAddress, enrichFromSavedAddresses } = require('../util/address')
const { buildPricingFallback, presentOrder, presentOrders } = require('../util/orderView')
const { explodeItemsToPieces } = require('../util/explodeItems')
const {
    applyWeeklyReset,
    computeLogisticsCharge,
} = require('../util/logisticsAllowance')
const BookOrderModel = require('../models/bookOrder.model')
const ItemSetModel = require('../models/itemSet.model')
const AdminOrderDetailsModel = require('../models/adminOrderDetails.model')
const {
    generateOscNumber,
    generateReferenceId,
    roundToNearestHundred,
    calculateDueDate,
    getObjectId,
    normalizePhone,
} = require('../util/helper')
const { priceItems } = require('../util/itemPricing')
const SubscriptionModel = require('../models/subscription.model')
const { v4: uuidv4 } = require('uuid')
const {
    NOTIFICATION_TYPE,
    ORDER_STATUS,
    DELIVERY_SPEED,
    BILLING_TYPE,
    STANDARD_ITEMS_ENUM_TYPES,
    ACTIVITY_TYPE,
    STATION_STATUS,
    PAYMENT_ORDER_STATUS,
    SERVICE_TIERS,
    PICKUP_STATUS,
    WALLET_TX_TYPE,
    AUDIT_LOG_CATEGORIES,
    CANCELLATION_REQUEST_STATUS,
    ROLE,
    BOOKING_TIMING,
    DISPATCH_LEG,
} = require('../util/constants')
// Window booking (client D1–D8). The service does the fetching/counting; the
// pure engine owns every rule, so nothing here re-decides a cutoff or a price.
const BookingWindowService = require('./bookingWindow.service')
const {
    legFee,
    sameDayLegPlan,
    startOfDay: startOfLagosDay,
} = require('../util/bookingWindow')
// N1: cancellation is refused once tagging begins, and the fees after pickup
// are flat charges that ignore a free-pickup offer (the trip was still made).
const { taggingBegun, cancellationOutcome } = require('../util/cancellationFees')
// Client item #7: re-pricing after an item edit reuses the payment hold rather
// than growing a second dunning flow, and the ONE wallet-refund implementation.
const PaymentHoldService = require('./paymentHold.service')
const { refundToWallet } = require('../util/walletRefund')
const { countPieces } = require('../util/itemSummary')
// The customer is told the new bill by SMS as well as in-app (client item #7).
const sendSms = require('../util/sendSms')
const CancellationRequestModel = require('../models/cancellationRequest.model')
const ActivityModel = require('../models/activity.model')
const createNotification = require('../util/createNotification')
const { notifyAdminEvent, ADMIN_EVENT } = require('../util/notifyPolicy')
const WalletModel = require('../models/wallet.model')
const AdminSettingModel = require('../models/adminSetting.model')
const WalletTransactionModel = require('../models/walletTransaction.model')
const PaymentModel = require('../models/payment.model')
const createAuditLog = require('../util/createAuditLog')
const OrderItemModel = require('../models/orderItem.model')
const {
    crmOnOrderCreated,
    crmOnOrderDelivered,
    crmOnOrderCancelled,
} = require('../util/crmHooks')
const { offerOnOrderDelivered, offerOnOrderCancelled } = require('../util/offerHooks')
const WalletCreditService = require('./walletCredit.service')
const OfferService = require('./offer.service')
const WalletService = require('./wallet.service')
const PaystackService = require('./paystack.service')
const {
    referralOnOrderCreated,
    referralOnOrderRefunded,
    referralOnOrderDelivered,
} = require('../util/referralHooks')
const { recoveryOnOrderDelivered } = require('../util/recoveryHooks')

class BookOrderService extends BaseService {
    // Decide which cancellation window an order is in (client policy 2026-07-20):
    //   green  → customer self-cancels immediately (or inside the grace period)
    //   amber  → items in transit / with us, not processed → needs a request (Phase 2)
    //   red    → processing started → no cancellation, route to complaints
    _cancelTier(order, graceMinutes) {
        const status = order.stage?.status
        if (status === ORDER_STATUS.CANCELLED) {
            return { tier: 'none', allowed: false, reason: 'This order is already cancelled.' }
        }

        // N1 (client spec 2026-10-07): "any time BEFORE TAGGING BEGINS; once
        // tagged, never." This is STRICTER than the RED stage list below and
        // has to be checked first — a tag can be generated while the order is
        // still sitting in the tagging QUEUE, which the list below treats as
        // Amber (cancellable on request). Without this, an order whose labels
        // were already printed could still be cancelled by raising a request.
        if (taggingBegun(order)) {
            return {
                tier: 'red',
                allowed: false,
                reason: 'Tagging has already started on this order, so it can no longer be cancelled. Please contact support to raise a complaint.',
            }
        }

        // Any stage where work has physically begun — cannot be undone here.
        const RED = [
            ORDER_STATUS.SORT_AND_PRETREAT,
            ORDER_STATUS.WASHING,
            ORDER_STATUS.DRYING,
            ORDER_STATUS.IRONING,
            ORDER_STATUS.QC,
            ORDER_STATUS.READY,
            ORDER_STATUS.OUT_FOR_DELIVERY,
            ORDER_STATUS.DELIVERED,
        ]
        // With us / in transit but not yet processed.
        const AMBER = [ORDER_STATUS.RECEIVED, ORDER_STATUS.QUEUE, ORDER_STATUS.HOLD]

        const pickup = order.dispatchDetails?.pickup?.status
        const pickupStarted = [
            PICKUP_STATUS.PICKUP_IN_PROGRESS,
            PICKUP_STATUS.PICKED_UP,
        ].includes(pickup)

        const createdMs = order.createdAt ? new Date(order.createdAt).getTime() : Date.now()
        const withinGrace = Date.now() - createdMs <= graceMinutes * 60 * 1000

        // Real work done always wins — the grace period cannot revive it.
        if (RED.includes(status)) {
            return {
                tier: 'red',
                allowed: false,
                reason: 'Processing has already started, so this order can no longer be cancelled. Please contact support to raise a complaint.',
            }
        }

        // Grace window: free cancel even if a pickup was auto-scheduled.
        if (withinGrace) return { tier: 'green', allowed: true }

        // Fresh order, rider not yet dispatched.
        if (status === ORDER_STATUS.PENDING && !pickupStarted) {
            return { tier: 'green', allowed: true }
        }

        if (pickupStarted || AMBER.includes(status)) {
            return {
                tier: 'amber',
                allowed: false,
                reason: 'Your items are already on the way to us or with us. Please contact support to request a cancellation.',
            }
        }

        return {
            tier: 'amber',
            allowed: false,
            reason: 'Please contact support to request a cancellation.',
        }
    }

    // Shared unwind for BOTH Green self-cancel and Amber-request approval.
    // Reverses reward credits, refunds any cash paid to the wallet (minus an
    // optional Amber fee), releases the attached offer, frees a scheduled
    // pickup, flips the order to cancelled, and notifies + audits (non-fatal).
    // Assumes the caller has already authorised the cancellation.
    async _performCancellation(order, { reason, performedBy, tier, feeApplied = 0, skipRequestId = null }) {
        const cleanReason = (reason || '').trim()
        const cancelReason = cleanReason
            ? `Order cancelled: ${cleanReason}`
            : 'Order cancelled'

        // 1) Reverse any reward credits the order consumed.
        const { restored: creditsReversed } =
            await WalletCreditService.reverseOrderCredits(order._id, {
                reason: cancelReason,
                performedBy,
            })

        // 2) Refund cash actually paid (order total minus the credit portion),
        //    less any staff fee, back to the wallet balance. Never card/bank.
        let cashRefunded = 0
        let feeCharged = 0
        if (order.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS) {
            const cashPaid = Math.max(0, (order.amount || 0) - creditsReversed)
            feeCharged = Math.min(Math.max(0, Math.round(feeApplied) || 0), cashPaid)
            cashRefunded = Math.max(0, cashPaid - feeCharged)
            if (cashRefunded > 0) {
                // Delegated to the ONE wallet-refund implementation. It does
                // the same three writes this block always did — atomic $inc,
                // the WalletTransaction ledger line, and the mirrored Payment
                // row that the customer's own history actually reads (2.3).
                // Extracted when client item #7 needed the identical thing;
                // a second copy is how the basket maths and the hold-SLA table
                // each ended up as three that had drifted.
                await refundToWallet({
                    userId: order.userId,
                    amount: cashRefunded,
                    orderId: order._id,
                    description: `Refund for cancelled order ${order.oscNumber || order._id}`,
                })
            }
        }

        // 2b) CLIENT 2026-10-08 §4.3: if this order was a referred customer's
        //     FIRST order and it is being refunded in full, take the referrer's
        //     reward back. A cancellation refunds the whole order, which is the
        //     "whole order is refunded" case — a partial refund keeps the
        //     reward, and there is no partial-refund path that reaches here.
        //     The staff cancellation fee does not make it partial: the order
        //     itself is gone, so the referral it generated is not a sale.
        //     Fire-and-forget — a reward correction must never fail a refund
        //     the customer is already being told about.
        referralOnOrderRefunded(order, { fullRefund: true, performedBy })

        // 3) Free a scheduled/pending pickup so the rider is released.
        if (
            order.dispatchDetails?.pickup &&
            [PICKUP_STATUS.PENDING, PICKUP_STATUS.SCHEDULED].includes(
                order.dispatchDetails.pickup.status,
            )
        ) {
            order.dispatchDetails.pickup.rider = undefined
            order.dispatchDetails.pickup.status = PICKUP_STATUS.PENDING
            order.dispatchDetails.pickup.updatedAt = new Date()
        }

        // 4) Flip the order to cancelled + record the audit trail on the doc.
        const now = new Date()
        order.stage = { status: ORDER_STATUS.CANCELLED, note: cancelReason, updatedAt: now }
        order.stageHistory.push({
            status: ORDER_STATUS.CANCELLED,
            note: cancelReason,
            updatedAt: now,
        })
        order.cancellation = {
            cancelledAt: now,
            reason: cleanReason,
            cancelledBy: performedBy,
            tier,
            cashRefunded,
            creditsReversed,
            feeApplied: feeCharged,
        }
        await order.save()

        // 4b) Auto-close any OTHER pending cancellation request for this order —
        //     the order is now cancelled, so a queued request is moot. The Amber
        //     approve flow passes skipRequestId for the request it resolves itself.
        try {
            const staleFilter = {
                orderId: order._id,
                status: CANCELLATION_REQUEST_STATUS.PENDING,
            }
            if (skipRequestId) staleFilter._id = { $ne: skipRequestId }
            await CancellationRequestModel.updateMany(staleFilter, {
                $set: {
                    status: CANCELLATION_REQUEST_STATUS.SUPERSEDED,
                    reviewedAt: new Date(),
                    decisionNote: 'Order was cancelled through another path.',
                },
            })
        } catch (e) {
            console.warn('Auto-close of pending cancellation requests failed (non-fatal):', e.message)
        }

        // 5) Release the attached offer + CRM (fire-and-forget).
        offerOnOrderCancelled(order, cancelReason)
        crmOnOrderCancelled(order)

        // 6) Notify + audit — non-fatal: the cancellation & refund are already
        //    committed above, so a messaging/logging failure must not report
        //    the whole operation as failed.
        try {
            const parts = []
            if (cashRefunded > 0)
                parts.push(` ₦${cashRefunded.toLocaleString('en-NG')} has been refunded to your wallet.`)
            if (creditsReversed > 0)
                parts.push(` ₦${creditsReversed.toLocaleString('en-NG')} in reward credit was returned.`)
            if (feeCharged > 0)
                parts.push(` A cancellation fee of ₦${feeCharged.toLocaleString('en-NG')} was applied.`)
            await createNotification({
                userId: order.userId,
                title: 'Order Cancelled',
                body: `Your order ${order.oscNumber || order._id} has been cancelled.${parts.join('')}`,
                type: NOTIFICATION_TYPE.ORDER_CANCELLED,
            })
            // ADDED for admin (client section 10). A cancellation moves money —
            // refunds, reversed credit, a fee — so an admin should see it as it
            // happens rather than finding it in a report.
            await notifyAdminEvent({
                event: ADMIN_EVENT.ORDER_CANCELLED,
                title: 'Order Cancelled',
                body: `Order ${order.oscNumber || order._id} was cancelled (${tier}).${parts.join('')}`,
                subBody: `Order ID: ${order.oscNumber || order._id}`,
                type: NOTIFICATION_TYPE.ORDER_CANCELLED,
                recordId: order._id,
            })
            await createAuditLog({
                userId: performedBy,
                action: `Cancelled order ${order.oscNumber || order._id} (${tier}); refunded ₦${cashRefunded} cash, ₦${creditsReversed} credit, fee ₦${feeCharged}`,
                category: AUDIT_LOG_CATEGORIES.ORDER,
            })
        } catch (sideEffectErr) {
            console.warn(
                'Order-cancel side effects failed (non-fatal):',
                sideEffectErr.message,
            )
        }

        return { cashRefunded, creditsReversed, feeCharged }
    }

    // Customer-initiated cancellation (Green window). Runs the shared unwind
    // with no fee. Amber/Red orders are refused here and go through requests.
    async cancelOrder(req) {
        try {
            const userId = req.user.id
            const orderId = req.params.id
            const reason = (req.body?.reason || '').trim()

            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }
            if (String(order.userId) !== String(userId)) {
                return BaseService.sendFailedResponse({
                    error: 'You can only cancel your own order',
                })
            }

            const settings = await AdminSettingModel.findOne({})
            const graceMinutes = settings?.orderCancellationGraceMinutes ?? 15

            const decision = this._cancelTier(order, graceMinutes)
            if (!decision.allowed) {
                return BaseService.sendFailedResponse({ error: decision.reason })
            }

            const result = await this._performCancellation(order, {
                reason,
                performedBy: getObjectId(userId),
                tier: decision.tier,
                feeApplied: 0,
            })

            return BaseService.sendSuccessResponse({
                message: {
                    orderId: order._id,
                    status: order.stage.status,
                    cashRefunded: result.cashRefunded,
                    creditsReversed: result.creditsReversed,
                    refundedTo: 'wallet',
                },
            })
        } catch (error) {
            console.error('Error cancelling order:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to cancel order',
            })
        }
    }

    // Staff-initiated cancellation. Admin may cancel at ANY stage (including
    // orders already in processing); intake-and-tag may only cancel while the
    // order has not yet entered processing (i.e. not a Red stage). Both reuse
    // the shared unwind (credits + cash refund + offer release + pickup).
    async staffCancelOrder(req) {
        try {
            const staffId = req.user.id
            const role = req.user.userType || req.user.role
            const orderId = req.params.id
            const reason = (req.body?.reason || '').trim()
            const feeAmount = Math.max(0, Math.round(req.body?.feeAmount) || 0)
            if (!reason) {
                return BaseService.sendFailedResponse({
                    error: 'A reason is required to cancel an order',
                })
            }

            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }
            if (order.stage?.status === ORDER_STATUS.CANCELLED) {
                return BaseService.sendFailedResponse({
                    error: 'Order is already cancelled',
                })
            }

            const settings = await AdminSettingModel.findOne({})
            const graceMinutes = settings?.orderCancellationGraceMinutes ?? 15
            const decision = this._cancelTier(order, graceMinutes)

            // Intake-and-tag is scoped to pre-processing only.
            if (role === ROLE.INTAKE_AND_TAG && decision.tier === 'red') {
                return BaseService.sendFailedResponse({
                    error: 'This order is already in processing — only an admin can cancel it now.',
                })
            }

            // N1: the fee is COMPUTED, not typed. The client set it out exactly
            // — free before pickup, ₦1,000 + ₦1,000 once the items have been
            // collected (even under a free-pickup offer), and after payment the
            // laundry fee returns to the wallet while both trips are kept. An
            // explicit `feeAmount` is still honoured as a deliberate override
            // so existing callers and admin discretion both keep working.
            const outcome = cancellationOutcome({ order, settings })
            const resolvedFee =
                req.body?.feeAmount === undefined || req.body?.feeAmount === null
                    ? outcome.feeApplied
                    : feeAmount

            const result = await this._performCancellation(order, {
                reason,
                performedBy: getObjectId(staffId),
                tier: role === ROLE.ADMIN ? 'admin' : 'intake-and-tag',
                feeApplied: resolvedFee,
            })

            return BaseService.sendSuccessResponse({
                message: {
                    orderId: order._id,
                    status: order.stage.status,
                    cancelledBy: role,
                    cashRefunded: result.cashRefunded,
                    creditsReversed: result.creditsReversed,
                    feeApplied: result.feeCharged,
                    refundedTo: 'wallet',
                },
            })
        } catch (error) {
            console.error('Error in staff cancel:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to cancel order',
            })
        }
    }

    // Customer submits a cancellation request for an Amber-window order (items
    // in transit / with us, not yet processed). Green orders should self-cancel;
    // Red orders cannot be cancelled.
    async requestCancellation(req) {
        try {
            const userId = req.user.id
            const orderId = req.params.id
            const reason = (req.body?.reason || '').trim()
            if (!reason) {
                return BaseService.sendFailedResponse({
                    error: 'A reason is required to request a cancellation',
                })
            }

            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }
            if (String(order.userId) !== String(userId)) {
                return BaseService.sendFailedResponse({
                    error: 'You can only cancel your own order',
                })
            }

            const settings = await AdminSettingModel.findOne({})
            const graceMinutes = settings?.orderCancellationGraceMinutes ?? 15
            const decision = this._cancelTier(order, graceMinutes)

            if (decision.tier === 'green') {
                return BaseService.sendFailedResponse({
                    error: 'This order can be cancelled directly — no request needed.',
                })
            }
            if (decision.tier !== 'amber') {
                // red / already cancelled
                return BaseService.sendFailedResponse({ error: decision.reason })
            }

            const existing = await CancellationRequestModel.findOne({
                orderId: order._id,
                status: CANCELLATION_REQUEST_STATUS.PENDING,
            })
            if (existing) {
                return BaseService.sendFailedResponse({
                    error: 'A cancellation request for this order is already awaiting review.',
                })
            }

            const request = await CancellationRequestModel.create({
                orderId: order._id,
                userId: order.userId,
                reason,
                status: CANCELLATION_REQUEST_STATUS.PENDING,
                tierAtRequest: decision.tier,
            })

            try {
                await createNotification({
                    userId: order.userId,
                    title: 'Cancellation Requested',
                    body: `We received your request to cancel order ${order.oscNumber || order._id}. Our team will review it shortly.`,
                    type: NOTIFICATION_TYPE.ORDER_CANCELLED,
                })
                // ADDED for admin (client section 10). The customer is told we
                // will "review it shortly" — which only happens if somebody is
                // actually told there is something to review.
                await notifyAdminEvent({
                    event: ADMIN_EVENT.CANCELLATION_REQUESTED,
                    title: 'Cancellation Requested',
                    body: `${order.fullName || 'A customer'} asked to cancel order ${order.oscNumber || order._id} and is waiting on a decision.`,
                    subBody: `Order ID: ${order.oscNumber || order._id}`,
                    type: NOTIFICATION_TYPE.ORDER_CANCELLED,
                    recordId: order._id,
                })
            } catch (e) {
                console.warn('request-cancellation notify failed (non-fatal):', e.message)
            }

            return BaseService.sendSuccessResponse({
                message: {
                    requestId: request._id,
                    orderId: order._id,
                    status: request.status,
                },
            })
        } catch (error) {
            // duplicate-key (race on the partial unique index) → already pending
            if (error?.code === 11000) {
                return BaseService.sendFailedResponse({
                    error: 'A cancellation request for this order is already awaiting review.',
                })
            }
            console.error('Error requesting cancellation:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to submit cancellation request',
            })
        }
    }

    // CX queue of cancellation requests (default: pending).
    async getCancellationRequests(req) {
        try {
            const status = req.query?.status || CANCELLATION_REQUEST_STATUS.PENDING
            const page = parseInt(req.query?.page) || 1
            const limit = parseInt(req.query?.limit) || 20
            const filter =
                status === 'all' ? {} : { status }

            const requests = await CancellationRequestModel.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('orderId', 'oscNumber amount stage paymentStatus')
                .populate('userId', 'firstName lastName email phone')
                .lean()
            const total = await CancellationRequestModel.countDocuments(filter)

            return BaseService.sendSuccessResponse({
                message: {
                    data: requests,
                    pagination: {
                        total,
                        page,
                        limit,
                        pages: Math.ceil(total / limit),
                    },
                },
            })
        } catch (error) {
            console.error('Error listing cancellation requests:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to list cancellation requests',
            })
        }
    }

    // CX approves a request → runs the shared unwind, optionally withholding a
    // fee from the cash refund. Re-checks the order hasn't since entered Red.
    async approveCancellationRequest(req) {
        try {
            const staffId = req.user.id
            const requestId = req.params.id
            const feeAmount = Math.max(0, Math.round(req.body?.feeAmount) || 0)
            const note = (req.body?.note || '').trim()

            const request = await CancellationRequestModel.findById(requestId)
            if (!request) {
                return BaseService.sendFailedResponse({ error: 'Request not found' })
            }
            if (request.status !== CANCELLATION_REQUEST_STATUS.PENDING) {
                return BaseService.sendFailedResponse({
                    error: `Request already ${request.status}`,
                })
            }

            const order = await BookOrderModel.findById(request.orderId)
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }

            // Guard: work may have started while the request sat in the queue.
            const settings = await AdminSettingModel.findOne({})
            const graceMinutes = settings?.orderCancellationGraceMinutes ?? 15
            const decision = this._cancelTier(order, graceMinutes)
            if (order.stage?.status === ORDER_STATUS.CANCELLED) {
                return BaseService.sendFailedResponse({ error: 'Order is already cancelled' })
            }
            if (decision.tier === 'red') {
                return BaseService.sendFailedResponse({
                    error: 'Processing has already started on this order — it can no longer be cancelled.',
                })
            }

            // N1: same computed fee as the staff-cancel path above, so the two
            // routes to a cancellation cannot charge different amounts for the
            // same order.
            const outcome = cancellationOutcome({ order, settings })
            const resolvedFee =
                req.body?.feeAmount === undefined || req.body?.feeAmount === null
                    ? outcome.feeApplied
                    : feeAmount

            const result = await this._performCancellation(order, {
                reason: request.reason,
                performedBy: getObjectId(staffId),
                tier: 'amber',
                feeApplied: resolvedFee,
                skipRequestId: request._id, // this request is resolved as 'approved' below
            })

            request.status = CANCELLATION_REQUEST_STATUS.APPROVED
            request.reviewedBy = getObjectId(staffId)
            request.reviewedAt = new Date()
            request.decisionNote = note
            request.feeApplied = result.feeCharged
            request.cashRefunded = result.cashRefunded
            request.creditsReversed = result.creditsReversed
            await request.save()

            return BaseService.sendSuccessResponse({
                message: {
                    requestId: request._id,
                    orderId: order._id,
                    status: request.status,
                    cashRefunded: result.cashRefunded,
                    creditsReversed: result.creditsReversed,
                    feeApplied: result.feeCharged,
                    refundedTo: 'wallet',
                },
            })
        } catch (error) {
            console.error('Error approving cancellation request:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to approve cancellation request',
            })
        }
    }

    // CX rejects a request → order continues, customer notified.
    async rejectCancellationRequest(req) {
        try {
            const staffId = req.user.id
            const requestId = req.params.id
            const note = (req.body?.note || '').trim()

            const request = await CancellationRequestModel.findById(requestId)
            if (!request) {
                return BaseService.sendFailedResponse({ error: 'Request not found' })
            }
            if (request.status !== CANCELLATION_REQUEST_STATUS.PENDING) {
                return BaseService.sendFailedResponse({
                    error: `Request already ${request.status}`,
                })
            }

            request.status = CANCELLATION_REQUEST_STATUS.REJECTED
            request.reviewedBy = getObjectId(staffId)
            request.reviewedAt = new Date()
            request.decisionNote = note
            await request.save()

            try {
                await createNotification({
                    userId: request.userId,
                    title: 'Cancellation Request Declined',
                    body: `Your request to cancel the order could not be approved.${note ? ` Reason: ${note}` : ''} Please contact support if you have questions.`,
                    type: NOTIFICATION_TYPE.ORDER_CANCELLED,
                })
                await createAuditLog({
                    userId: getObjectId(staffId),
                    action: `Rejected cancellation request ${request._id} for order ${request.orderId}${note ? `: ${note}` : ''}`,
                    category: AUDIT_LOG_CATEGORIES.ORDER,
                })
            } catch (e) {
                console.warn('reject-cancellation side effects failed (non-fatal):', e.message)
            }

            return BaseService.sendSuccessResponse({
                message: {
                    requestId: request._id,
                    orderId: request.orderId,
                    status: request.status,
                },
            })
        } catch (error) {
            console.error('Error rejecting cancellation request:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to reject cancellation request',
            })
        }
    }

// Server-side offer pricing. Re-validates the selected offer id(s) against the
    // live rules (never trusts a client-sent price/discount), applies the discount
    // to the item subtotal and waives pickup/delivery fees the offer covers.
    // Returns the authoritative charge total plus the validated breakdown.
    async _priceWithOffers({ userId, post, itemsSubtotal, extraDeliveryCost, adminOrderSetting }) {
        // This used to return early unless the customer had SELECTED an offer:
        //     if (!post.customerOfferId && !post.promoOfferId) return ...
        // BASELINE offers (what the client calls "General") are applied BY RULE
        // and have no linkage and no id for the customer to send — so that
        // early return skipped them entirely and "Always Free at ₦8,000" never
        // waived anything, while the app still advertised it. That is client
        // brief 6 Oct 2026 item 2.2: free pickup and delivery offered, ₦2,000
        // still charged.
        //
        // validateAndPrice already evaluates baselines first and tolerates
        // having no personal/promo selection (offer.service.js:729), so the
        // correct behaviour is simply to always ask it.
        const deliveryFee = post.isDelivery ? adminOrderSetting.deliveryFee || 0 : 0
        const pickupFee = post.isPickUp ? adminOrderSetting.pickupFee || 0 : 0

        const breakdown = await OfferService.validateAndPrice(userId, {
            ...post,
            amount: itemsSubtotal, // discount is capped at the item subtotal
            deliveryAmount: deliveryFee,
            pickupAmount: pickupFee,
        })

        let finalTotal = itemsSubtotal + extraDeliveryCost - (breakdown.totalDiscount || 0)
        if (breakdown.freeDelivery) finalTotal -= deliveryFee
        if (breakdown.freePickup) finalTotal -= pickupFee
        finalTotal = Math.max(Math.round(finalTotal), 0)
        return { finalTotal, breakdown }
    }

    /**
     * RE-PRICE AN ORDER AFTER ITS ITEMS CHANGE — client item #7 / N1 Phase 4.
     *
     * Their spec: "Intake confirms the real count and enters the actual items;
     * the bill is RECALCULATED through the same pricing + offers; total up →
     * the difference becomes a payment hold (same SMS + Paystack link), total
     * down → the difference goes to the wallet; every change records who and
     * why + an SMS with the new bill; after tagging only an admin may edit."
     *
     * ⚠️ IT LIVES ON THIS CLASS DELIBERATELY. "Through the same pricing +
     * offers" is not a figure of speech — this method calls the identical three
     * steps the booking branches call (`priceItems` → `_priceWithOffers` →
     * `_buildPricing`) on the same instance. A separate re-pricing service
     * would be a fourth copy of the basket maths, and there were already THREE
     * that had silently drifted before `util/itemPricing.js` unified them
     * (brief 1.6): two defaulted a missing tier charge to 1, the third to
     * 1.5/2, so the same basket priced differently per screen.
     *
     * Returns the diff rather than acting on it; `applyItemEdit` below decides
     * what the difference means. Writes nothing.
     */
    async _repriceForItems({ order, items, adminOrderSetting }) {
        // The shape the pricing path expects. Taken from the ORDER, not from
        // the request, so an edit cannot quietly change the service type, the
        // tier or the speed while pretending to change only the items.
        const post = {
            serviceType: order.serviceType,
            serviceTier: order.serviceTier,
            deliverySpeed: order.deliverySpeed,
            isPickUp: order.isPickUp,
            isDelivery: order.isDelivery,
            items,
            // The offer already attached to the order, so re-pricing re-applies
            // the customer's own offer instead of silently dropping it.
            customerOfferId: order.customerOfferId || undefined,
            promoOfferId: order.promoOfferId || undefined,
        }

        const matchedService = adminOrderSetting.serviceTypes.find(
            (service) => service.name === post.serviceType,
        )
        const serviceTypeMultiplier = matchedService
            ? matchedService.pricePerPiece
            : 1

        const priced = priceItems({
            items,
            serviceTypeMultiplier,
            orderTier: post.serviceTier,
            adminOrderSetting,
        })

        let speedCharge = 0
        if (post.deliverySpeed === DELIVERY_SPEED.EXPRESS) {
            speedCharge = adminOrderSetting.expressCharge
        } else if (post.deliverySpeed === DELIVERY_SPEED.SAME_DAY) {
            speedCharge = adminOrderSetting.sameDayCharge
        }
        // The window/Anytime price the customer actually chose, when there is
        // one — otherwise the flat fee. Without this, re-pricing a windowed
        // order would quietly reset its logistics to the default.
        const pickupFee = post.isPickUp
            ? order.scheduling?.pickup?.fee ?? adminOrderSetting.pickupFee ?? 0
            : 0
        const deliveryFee = post.isDelivery
            ? order.scheduling?.delivery?.fee ?? adminOrderSetting.deliveryFee ?? 0
            : 0
        const extraDeliveryCost = speedCharge + pickupFee + deliveryFee

        const { finalTotal, breakdown } = await this._priceWithOffers({
            userId: order.userId,
            post,
            itemsSubtotal: priced.total,
            extraDeliveryCost,
            adminOrderSetting,
        })

        // Mapped exactly as the booking branches map it. `priceItems` returns
        // `lines` (not `tierLines`) and no order-level `tierMultiplier` — that
        // comes off the first line, and is null when the basket mixes tiers
        // because one multiplier then says nothing (brief 1.6).
        const pricing = this._buildPricing({
            serviceTier: post.serviceTier,
            itemsBase: priced.itemsBase,
            tierMultiplier: priced.isMixedTier
                ? null
                : priced.lines[0]?.tierMultiplier ?? 1,
            tierLines: priced.lines,
            tiersUsed: priced.tiersUsed,
            isMixedTier: priced.isMixedTier,
            itemsSubtotal: priced.total,
            speedCharge,
            pickupFee,
            deliveryFee,
            breakdown,
            orderTotal: finalTotal,
        })

        return { newTotal: finalTotal, pricing, breakdown, extraDeliveryCost }
    }

    /**
     * EDIT AN ORDER'S ITEMS AND SETTLE THE DIFFERENCE — client item #7.
     *
     * Applies to BOTH booking types, which is why it lives here rather than on
     * the intake service: a normal booking whose real contents differ follows
     * exactly the same rule as a Quick Booking.
     *
     * The client's four rules, and where each is enforced:
     *   * the bill is recalculated through the same pricing + offers
     *     → `_repriceForItems`, which calls the identical three steps;
     *   * total UP → the difference becomes a payment hold (same SMS + link)
     *     → `PaymentHoldService.raise`, reused, so there is one payment-hold
     *       implementation and one reminder schedule;
     *   * total DOWN → the difference goes to the wallet;
     *   * every change records WHO and WHY, and the customer gets the new bill;
     *   * after tagging, only an admin may edit.
     *
     * ⚠️ A REASON IS REQUIRED. This moves money in both directions, and
     * "the bill changed" with no explanation is unreviewable — the same
     * reasoning as the waiver and the rider's count.
     */
    async applyItemEdit(req) {
        try {
            const orderId = req.params.id
            const actorId = req.user?.id
            const actorRole = req.user?.userType
            const items = req.body?.items
            const reason = String(req.body?.reason || '').trim()

            if (!Array.isArray(items) || items.length === 0) {
                return BaseService.sendFailedResponse({
                    error: 'items is required and must list the actual pieces received.',
                })
            }
            if (!reason) {
                return BaseService.sendFailedResponse({
                    error: 'A reason is required — the bill is changing and the customer will be told why.',
                })
            }
            const badItem = items.find(
                (i) =>
                    !i?.type ||
                    !Number.isFinite(Number(i?.price)) ||
                    !Number.isFinite(Number(i?.quantity)) ||
                    Number(i.quantity) <= 0,
            )
            if (badItem) {
                return BaseService.sendFailedResponse({
                    error: 'Every item needs a type, a price and a quantity of at least 1.',
                })
            }

            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }
            if (order.stage?.status === ORDER_STATUS.CANCELLED) {
                return BaseService.sendFailedResponse({
                    error: 'This order is cancelled and cannot be edited.',
                })
            }

            // "After tagging only an ADMIN may edit." Read off the items, for
            // the same reason the cancellation rule is: a tag exists while the
            // order still sits in the tagging queue, so a stage check would let
            // a tagged order through.
            if (taggingBegun(order) && actorRole !== ROLE.ADMIN) {
                return BaseService.sendFailedResponse({
                    error: 'Tagging has already started on this order, so only an admin can change its items now.',
                    requiresAdmin: true,
                })
            }

            const adminOrderSetting = await AdminSettingModel.findOne({})
            if (!adminOrderSetting) {
                return BaseService.sendFailedResponse({
                    error: 'Admin settings not found',
                })
            }

            const previousTotal = Number(order.amount || 0)
            // What the customer has actually handed over. A waiver is NOT money
            // — it is permission to proceed — so it must not be treated as a
            // payment here, or reducing a waived order's bill would refund cash
            // that was never received.
            const amountPaid =
                order.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS
                    ? previousTotal
                    : 0

            const { newTotal, pricing } = await this._repriceForItems({
                order,
                items,
                adminOrderSetting,
            })

            const difference = newTotal - previousTotal
            const outstanding = Math.max(0, newTotal - amountPaid)
            const refundDue = Math.max(0, amountPaid - newTotal)

            // Explode to pieces exactly as a booking does, so the stations see
            // the same per-piece records they always do.
            const explodedItems = explodeItemsToPieces(items)

            const now = new Date()
            await BookOrderModel.updateOne(
                { _id: order._id },
                {
                    $set: {
                        items: explodedItems,
                        amount: newTotal,
                        pricing,
                    },
                    $push: {
                        itemEdits: {
                            at: now,
                            by: actorId,
                            byRole: actorRole,
                            reason,
                            previousTotal,
                            newTotal,
                            difference,
                            previousPieceCount: countPieces(order.items || []),
                            newPieceCount: countPieces(explodedItems),
                        },
                    },
                },
                { runValidators: false },
            )

            const result = {
                previousTotal,
                newTotal,
                difference,
                pieceCount: countPieces(explodedItems),
                paymentHold: null,
                walletRefund: null,
            }

            // TOTAL UP → a payment hold for what is still owed. Reusing
            // PaymentHoldService means one SMS wording, one Paystack link
            // builder and one reminder schedule, rather than a second
            // almost-identical dunning flow.
            if (outstanding > 0) {
                const held = await PaymentHoldService.raise({
                    orderId: order._id,
                    actorId,
                    reason: `Bill updated to ₦${newTotal.toLocaleString('en-NG')} after the items were checked (${reason}).`,
                })
                result.paymentHold = held.success
                    ? held.data?.message || null
                    : { error: held.data?.error || 'Could not raise the payment hold.' }
            }

            // TOTAL DOWN → the difference goes back to the wallet.
            if (refundDue > 0) {
                try {
                    await refundToWallet({
                        userId: order.userId,
                        amount: refundDue,
                        orderId: order._id,
                        description: `Order ${order.oscNumber} bill reduced after the items were checked (${reason})`,
                    })
                    result.walletRefund = refundDue
                } catch (error) {
                    // Reported, never swallowed silently: the customer is owed
                    // this money and somebody has to settle it by hand.
                    console.error('item-edit wallet refund failed:', error?.message)
                    result.walletRefund = {
                        error: `₦${refundDue.toLocaleString('en-NG')} could not be returned automatically — settle it manually.`,
                        amount: refundDue,
                    }
                }
            }

            // The customer is told the new bill either way — "every change
            // records who and why + an SMS with the new bill".
            try {
                const line =
                    difference === 0
                        ? `Chuvi: order ${order.oscNumber} has been checked and your bill is unchanged at ₦${newTotal.toLocaleString('en-NG')}.`
                        : difference > 0
                          ? `Chuvi: after checking your items, order ${order.oscNumber} comes to ₦${newTotal.toLocaleString('en-NG')} (was ₦${previousTotal.toLocaleString('en-NG')}).${outstanding > 0 ? ` ₦${outstanding.toLocaleString('en-NG')} is outstanding.` : ''}`
                          : `Chuvi: after checking your items, order ${order.oscNumber} comes to ₦${newTotal.toLocaleString('en-NG')} (was ₦${previousTotal.toLocaleString('en-NG')}).${refundDue > 0 ? ` ₦${refundDue.toLocaleString('en-NG')} has gone back to your wallet.` : ''}`
                if (order.phoneNumber) await sendSms(order.phoneNumber, line)
                if (order.userId) {
                    await createNotification({
                        userId: order.userId,
                        title: 'Your bill has been updated',
                        body: line,
                        subBody: `Order ID: ${order.oscNumber}`,
                        type: NOTIFICATION_TYPE.ORDER_UPDATED,
                    })
                }
            } catch (error) {
                console.error('item-edit customer message failed:', error?.message)
            }

            try {
                await createAuditLog({
                    userId: getObjectId(actorId),
                    action: `Edited items on order ${order.oscNumber}: ₦${previousTotal.toLocaleString('en-NG')} → ₦${newTotal.toLocaleString('en-NG')} (${reason})`,
                    category: AUDIT_LOG_CATEGORIES.ORDER,
                    orderId: order._id,
                })
            } catch (error) {
                console.error('item-edit audit failed:', error?.message)
            }

            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Could not update this order’s items.',
            })
        }
    }

    // Build the frozen price receipt from the components already computed in a
    // billing branch. Pure/synchronous — every figure is passed in.
    _buildPricing({
        serviceTier,
        itemsBase,
        tierMultiplier = 1,
        // Per-item care tiers (brief 1.6). When the order mixes tiers a single
        // order-level multiplier is meaningless, so callers send null for it
        // and the receipt shows the per-piece lines instead.
        tierLines = null,
        tiersUsed = null,
        isMixedTier = false,
        itemsSubtotal,
        speedCharge = 0,
        pickupFee = 0,
        deliveryFee = 0,
        breakdown = null,
        creditApplied = 0,
        orderTotal,
        coveredBySubscription = false,
    }) {
        const feesTotal = speedCharge + pickupFee + deliveryFee
        const grossTotal = itemsSubtotal + feesTotal
        const offerDiscount = breakdown?.totalDiscount || 0
        const freeDeliveryWaived = breakdown?.freeDelivery ? deliveryFee : 0
        const freePickupWaived = breakdown?.freePickup ? pickupFee : 0
        const appliedOffers = []
        // Baselines come first and are the ones most likely to have waived the
        // fees. They were missing here, so a summary could show "Pickup: Free"
        // with no offer name to explain it (brief 2.2 asks for the name).
        for (const b of breakdown?.baseline || []) {
            appliedOffers.push({
                offerId: b.offerId,
                name: b.name,
                type: 'baseline',
            })
        }
        if (breakdown?.personal)
            appliedOffers.push({
                offerId: breakdown.personal.offerId,
                name: breakdown.personal.name,
                type: 'personal',
            })
        if (breakdown?.promotion)
            appliedOffers.push({
                offerId: breakdown.promotion.offerId,
                name: breakdown.promotion.name,
                type: 'promotion',
            })
        return {
            itemsBase,
            serviceTier,
            tierMultiplier,
            tierLines,
            tiersUsed,
            isMixedTier,
            tierUplift: itemsSubtotal - itemsBase,
            itemsSubtotal,
            speedCharge,
            pickupFee,
            deliveryFee,
            feesTotal,
            grossTotal,
            offerDiscount,
            freePickupWaived,
            freeDeliveryWaived,
            appliedOffers,
            creditApplied,
            orderTotal,
            youSaved:
                offerDiscount +
                freeDeliveryWaived +
                freePickupWaived +
                creditApplied,
            coveredBySubscription,
            reconstructed: false,
        }
    }

    // Delegates to util/orderView.js — kept for existing call sites.
    _buildPricingFallback(order) {
        return buildPricingFallback(order)
    }

    // After the order is saved, attach the validated offer linkage(s) so they
    // redeem on delivery / release on cancel. Non-fatal — the order already exists.
    async _attachOffersToOrder(userId, breakdown, orderId) {
        if (!breakdown) return
        if (breakdown.personal?.customerOfferId) {
            try {
                await OfferService.attachToOrder(userId, breakdown.personal.customerOfferId, orderId)
            } catch (e) {
                console.warn('Attach personal offer failed (non-fatal):', e.message)
            }
        }
        if (breakdown.promotion?.offerId) {
            try {
                await OfferService.attachPromoToOrder(userId, breakdown.promotion.offerId, orderId)
            } catch (e) {
                console.warn('Attach promo offer failed (non-fatal):', e.message)
            }
        }
    }

// Reusable booking entry so callers other than the HTTP route (the in-app
    // assistant) can place an order through the EXACT same pricing / validation /
    // credit / notification path. postBookOrder only reads req.body + req.user.id
    // and never touches res, so we drive it with a synthetic request and return
    // its plain envelope { success, data }. No money logic is duplicated.
    async createOrder({ userId, payload }) {
        return this.postBookOrder({ body: payload || {}, user: { id: userId } })
    }

    async postBookOrder(req, res) {
        try {
            const post = req.body
            const userId = req.user.id

            const user = await UserModel.findById(userId)

            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            // CLIENT DECISION A7 (2026-10-07): the "Delivery address is the same
            // as pickup" tick box. Applied BEFORE validation, because
            // `isDelivery` is a required field — defaulting it after the
            // validator runs is too late, and a customer who ticks the box and
            // sends nothing else would be refused with "isDelivery is required".
            if (
                post.deliverySameAsPickup === true ||
                post.deliverySameAsPickup === 'true'
            ) {
                if (post.isDelivery === undefined) post.isDelivery = true
            }

            const validateRule = {
                fullName: 'string|required',
                phoneNumber: 'string|required',
                // pickupAddress: 'string|required',
                // pickupDate: "date|required",
                // pickupTime: "string|required",
                serviceType: 'string|required',
                serviceTier: 'string|required|in:classic,premium,vip',
                billingType:
                    'string|required|in:pay-per-item,pay-from-subscription,pay-from-wallet',
                deliverySpeed: 'string|required|in:express,standard,same-day',
                isDelivery: 'boolean|required',
                isPickUp: 'boolean|required',
                items: 'array|required',
                'items.*.type': 'string|required',
                'items.*.price': 'integer|required',
                'items.*.quantity': 'integer|required',
                // Per-item care tier (brief 1.6). OPTIONAL — omit it and the
                // piece is priced at the order's tier, exactly as before.
                'items.*.serviceTier': 'string|in:classic,premium,vip',
                // Window booking (client D1–D5). OPTIONAL on purpose: an app
                // build that sends nothing keeps booking exactly as it does
                // today at the flat pickup/delivery fee, so this is not a
                // breaking change. Sending a timing switches the order onto the
                // window rules.
                pickupTiming: 'string|in:window,anytime',
                deliveryTiming: 'string|in:window,anytime',
            }

            const validateMessage = {
                required: ':attribute is required',
                int: ':attribute must be an integer.',
                array: ':attribute must be an array.',
                in: ':attribute must be valid.',
            }

            const validateResult = validateData(
                post,
                validateRule,
                validateMessage,
            )
            if (!validateResult.success) {
                return BaseService.sendFailedResponse({
                    error: validateResult.data,
                })
            }

            // Structure addresses (tolerant: accepts a plain string or object).
            // Require an address to be PRESENT when pickup/delivery is requested;
            // label/landmark stay optional on the customer path (back-compat).
            // Brief 4.6 — store ONE phone format. The same customer appeared with
            // and without the leading 0 on two different orders, and because CRM
            // links identity by normalised phone that splits one person into two
            // profiles.
            if (post.phoneNumber) post.phoneNumber = normalizePhone(post.phoneNumber)

            // A7, second half: copy the address itself. Done HERE rather than in
            // the app so the two can never drift apart, and BEFORE enrichment so
            // the copy still gets the saved-address landmark treatment — which
            // is what satisfies the delivery-landmark rule below without asking
            // the customer for the same landmark twice.
            if (
                post.deliverySameAsPickup === true ||
                post.deliverySameAsPickup === 'true'
            ) {
                post.deliveryAddress = post.pickupAddress
            }

            // 3.3: when the customer sends an address they already have saved,
            // borrow its landmark/label — the rider needs the "how do I find the
            // door" line and the app does not ask for it yet.
            post.pickupAddress = enrichFromSavedAddresses(
                post.pickupAddress,
                user.addresses,
            )
            post.deliveryAddress = enrichFromSavedAddresses(
                post.deliveryAddress,
                user.addresses,
            )
            if (post.isPickUp && !post.pickupAddress?.address) {
                return BaseService.sendFailedResponse({
                    error: 'pickupAddress is required when isPickUp is true',
                })
            }
            if (post.isDelivery && !post.deliveryAddress?.address) {
                return BaseService.sendFailedResponse({
                    error: 'deliveryAddress is required when isDelivery is true',
                })
            }
            // Brief 3.3 (client decision 2026-10-07): the LANDMARK is now required
            // on both legs, because the rider navigates by it — they are going to
            // an address they have never seen, and a street line alone is not
            // enough. Staff intake has always demanded it; the customer path used
            // to let it through empty, which is how orders reached riders with no
            // directions. Checked AFTER enrichFromSavedAddresses, so a customer
            // reusing a saved address is never asked twice.
            if (post.isPickUp && !post.pickupAddress?.landmark) {
                return BaseService.sendFailedResponse({
                    error: 'pickupAddress.landmark is required — the rider needs a landmark to find the pickup address.',
                    field: 'pickupAddress.landmark',
                })
            }
            if (post.isDelivery && !post.deliveryAddress?.landmark) {
                return BaseService.sendFailedResponse({
                    error: 'deliveryAddress.landmark is required — the rider needs a landmark to find the delivery address.',
                    field: 'deliveryAddress.landmark',
                })
            }

            let finalMessage = 'Order booked successfully'
            const adminOrderDetails = await AdminOrderDetailsModel.findOne({})
            const adminOrderSetting = await AdminSettingModel.findOne({})

            if (!adminOrderDetails) {
                return BaseService.sendFailedResponse({
                    error: 'Admin order details not found',
                })
            }
            if (!adminOrderSetting) {
                return BaseService.sendFailedResponse({
                    error: 'Admin settings not found',
                })
            }

            // ⏰ Booking time cutoff check — same-day before 10am, express before 2pm.
            // calculateDueDate returns null when the cutoff has passed.
            // D6(b): the promised date skips days the business is closed —
            // without the working days a Saturday standard order is due Monday,
            // and with Monday unticked it reads OVERDUE on a day nobody worked
            // and trips the past-delivery-date hold breach.
            const deliveryDate = calculateDueDate(
                post.deliverySpeed,
                adminOrderSetting.workingDays,
            )
            if (deliveryDate === null) {
                if (post.deliverySpeed === DELIVERY_SPEED.SAME_DAY) {
                    return BaseService.sendFailedResponse({
                        error: 'Same-day orders must be placed before 10am. Please select express or standard delivery.',
                    })
                }
                if (post.deliverySpeed === DELIVERY_SPEED.EXPRESS) {
                    return BaseService.sendFailedResponse({
                        error: 'Express orders must be placed before 2pm. Please select standard delivery.',
                    })
                }
            }

            // ───────── WINDOW BOOKING (client D1–D8, 2026-10-08) ─────────
            //
            // Resolved HERE, before any order is created, for the same reason
            // `planCounterPayment` plans before it settles: a refusal must
            // leave nothing behind. A window that filled while the customer was
            // on the screen produces a sentence, not an order parked in a
            // window that cannot serve it.
            //
            // Scope note: only the PICKUP leg is fully resolved at booking.
            // D7 (pre-approved) confirms the DELIVERY window when the order is
            // marked READY — a standard order's delivery day is +2 and is not
            // known yet, and under D6 it might not even be a working day. So
            // the delivery side records the INTENT (timing + fee) only, and
            // `deliveryDate` keeps coming from `calculateDueDate` so the queue
            // sort, the SLA clocks and capacity are untouched by this change.
            let scheduling = null
            if (post.pickupTiming || post.deliveryTiming) {
                const schedSettings =
                    await BookingWindowService.getSchedulingSettings()
                const schedWindows = await BookingWindowService.getActiveWindows()
                const schedFrom = startOfLagosDay(new Date())
                const bookedCounts = await BookingWindowService.getBookedCounts({
                    from: schedFrom,
                    to: new Date(schedFrom.getTime() + 32 * 86400000),
                })

                scheduling = {}

                if (post.isPickUp) {
                    // CLIENT RULING (2026-10-08): a SAME-DAY order's pickup is
                    // an Anytime trip and pays the Anytime price — "a morning
                    // pickup is a special trip and the customer chose speed".
                    // Forced here rather than trusted from the client, so an
                    // app build cannot sell same-day at the window price.
                    const pickupTiming =
                        post.deliverySpeed === DELIVERY_SPEED.SAME_DAY &&
                        !BookingWindowService._findMorningWindow(schedWindows)
                            ? BOOKING_TIMING.ANYTIME
                            : post.pickupTiming
                    const resolved = BookingWindowService.resolveLeg({
                        leg: DISPATCH_LEG.PICKUP,
                        timing: pickupTiming,
                        windowId: post.pickupWindowId,
                        date: post.pickupDate,
                        windows: schedWindows,
                        settings: schedSettings,
                        bookedCounts,
                    })
                    if (!resolved.ok) {
                        return BaseService.sendFailedResponse({
                            error: resolved.error,
                            ...(resolved.requiresChoice && { requiresChoice: true }),
                        })
                    }
                    scheduling.pickup = resolved.leg
                    // The chosen timing now OWNS the pickup fee, replacing the
                    // flat `pickupFee` setting. Overridden on the in-memory
                    // settings document so all five downstream billing branches
                    // price the leg the customer actually chose — the doc is
                    // never saved (only `adminOrderDetails` is), and editing
                    // one value here is safer than five parallel edits that
                    // could drift, which is the hold-SLA lesson.
                    adminOrderSetting.pickupFee = resolved.leg.fee
                }

                if (post.isDelivery) {
                    const timing = post.deliveryTiming || BOOKING_TIMING.WINDOW
                    scheduling.delivery = {
                        timing,
                        fee: legFee({
                            timing,
                            leg: DISPATCH_LEG.DELIVERY,
                            settings: schedSettings,
                        }),
                    }
                    adminOrderSetting.deliveryFee = scheduling.delivery.fee
                }

                // The same-day disclosure the client requires to be shown
                // BEFORE confirming. Stored as shown, so a later price change
                // cannot rewrite what the customer agreed to.
                if (post.deliverySpeed === DELIVERY_SPEED.SAME_DAY) {
                    scheduling.disclosure = sameDayLegPlan({
                        settings: schedSettings,
                        morningWindow:
                            BookingWindowService._findMorningWindow(schedWindows),
                    }).disclosure
                    if (post.disclosureAccepted) {
                        scheduling.disclosureAcceptedAt = new Date()
                    }
                }
            }

            const oscNumber = generateOscNumber()
            let newOrder = null
            let offerBreakdown = null // set by the offer-eligible billing branches
            let logisticsPaymentUrl = null // set when a subscriber pays an overflow fee by card

            if (post.billingType === BILLING_TYPE.PAY_FROM_SUBSCRIPTION) {
                const subscription = await SubscriptionModel.findOne({
                    userId,
                }).populate('planId')
                if (!subscription) {
                    return BaseService.sendFailedResponse({
                        error: 'No active subscription found for user',
                    })
                }

                if (subscription.status !== 'active') {
                    return BaseService.sendFailedResponse({
                        error: 'Subscription is not active',
                    })
                }

                // ← fetch all heavy items from DB (single items + set pieces)
                const [heavyItems, sets] = await Promise.all([
                    OrderItemModel.find({ isHeavy: true }).lean(),
                    ItemSetModel.find({ 'pieces.isHeavy': true }).lean(),
                ])
                const heavyItemNames = heavyItems.map((i) =>
                    i.name.toLowerCase(),
                )
                for (const s of sets) {
                    for (const p of s.pieces || []) {
                        if (p.isHeavy) heavyItemNames.push(p.name.toLowerCase())
                    }
                }

                // ← block if any submitted item is heavy
                const heavyItemFound = post.items.find((item) =>
                    heavyItemNames.includes(item.type.toLowerCase()),
                )

                if (heavyItemFound) {
                    return BaseService.sendFailedResponse({
                        error: `Your subscription plan does not cover heavy items. "${heavyItemFound.type}" is not allowed. Please remove it or switch to pay-per-item.`,
                    })
                }

                if (
                    post.deliverySpeed === DELIVERY_SPEED.SAME_DAY &&
                    post.items.length > adminOrderDetails.sameDayCapacity
                ) {
                    return BaseService.sendFailedResponse({
                        error: `Same day delivery is currently at full capacity. Please reduce your items or choose the express delivery speed.`,
                    })
                }

                if (
                    post.deliverySpeed === DELIVERY_SPEED.EXPRESS &&
                    post.items.length > adminOrderDetails.expressCapacity
                ) {
                    return BaseService.sendFailedResponse({
                        error: `Express delivery is currently at full capacity. Please reduce your items or choose the standard delivery speed.`,
                    })
                }

                if (
                    post.deliverySpeed === DELIVERY_SPEED.STANDARD &&
                    post.items.length > adminOrderDetails.standardCapacity
                ) {
                    finalMessage += ` We expect this to take ${adminOrderDetails.standardDeliveryPeriod} days. We appreciate your patience and understanding.`
                }

                const subscriptionPlanMonthlyLimits =
                    subscription.planId.monthlyLimits
                if (post.items.length > subscriptionPlanMonthlyLimits) {
                    return BaseService.sendFailedResponse({
                        error: 'You selected items has exceeded your currently subscription limit. Consider upgrading or reducing your items',
                    })
                }

                const totalPrice = post.items.reduce((sum, item) => {
                    const price = Number(item.price)
                    const quantity = Number(item.quantity)
                    return sum + price * quantity
                }, 0)

                // Weekly free pickup/delivery allowance (rolling 7-day window).
                // Speed surcharge stays free for subscribers regardless.
                applyWeeklyReset(subscription, subscription.planId, new Date())
                const logistics = computeLogisticsCharge({
                    isPickUp: post.isPickUp,
                    isDelivery: post.isDelivery,
                    remaining: subscription.remainingPickupDeliveries,
                    pickupFee: adminOrderSetting.pickupFee || 0,
                    deliveryFee: adminOrderSetting.deliveryFee || 0,
                })
                const logisticsFee = logistics.fee
                const feeDue = logisticsFee > 0
                const method = post.overflowPaymentMethod
                if (feeDue && !['wallet', 'card'].includes(method)) {
                    return BaseService.sendFailedResponse({
                        error: `Your free pickup/delivery is used up for this week. A ₦${logisticsFee.toLocaleString('en-NG')} fee applies — set overflowPaymentMethod to "wallet" or "card".`,
                        needsLogisticsPayment: true,
                        logisticsFee,
                    })
                }

                const stage = { status: ORDER_STATUS.PENDING, updatedAt: new Date() }
                const stageHistory = {
                    status: ORDER_STATUS.PENDING,
                    note: 'Order created',
                    updatedAt: new Date(),
                }

                const newOrderItem = {
                    userId,
                    oscNumber,
                    // covered order (no fee) keeps the item value as amount; an
                    // overflow order's payable amount IS the fee (items covered).
                    amount: feeDue ? logisticsFee : totalPrice,
                    deliveryAmount: logisticsFee,
                    logisticsFee,
                    logisticsPaymentMethod: feeDue ? method : null,
                    stage,
                    stageHistory: [stageHistory],
                    stationStatus: STATION_STATUS.PENDING,
                    paymentStatus: feeDue
                        ? PAYMENT_ORDER_STATUS.PENDING
                        : PAYMENT_ORDER_STATUS.SUCCESS,
                    paymentDate: new Date(),
                    ...post,
                    deliveryDate,
                }

                newOrder = new BookOrderModel(newOrderItem)
                newOrder.items = explodeItemsToPieces(post.items)
                newOrder.pricing = this._buildPricing({
                    serviceTier: post.serviceTier,
                    itemsBase: totalPrice,
                    tierMultiplier: 1,
                    itemsSubtotal: totalPrice,
                    pickupFee: logistics.chargedPickup ? adminOrderSetting.pickupFee : 0,
                    deliveryFee: logistics.chargedDelivery ? adminOrderSetting.deliveryFee : 0,
                    orderTotal: feeDue ? logisticsFee : totalPrice,
                    coveredBySubscription: true,
                })
                await newOrder.save()

                // consume this week's free legs + the monthly item allowance
                subscription.remainingPickupDeliveries = Math.max(
                    0,
                    (subscription.remainingPickupDeliveries || 0) - logistics.freeUsed,
                )
                subscription.remainingItems -= post.items.length
                await subscription.save()

                if (feeDue && method === 'wallet') {
                    const charge = await WalletService.chargeWalletForOrder({
                        userId,
                        orderId: newOrder._id,
                        amount: logisticsFee,
                        description: 'Pickup/Delivery fee',
                    })
                    if (!charge.success) {
                        // roll back allowance + order — the fee was not collected
                        subscription.remainingPickupDeliveries += logistics.freeUsed
                        subscription.remainingItems += post.items.length
                        await subscription.save()
                        await BookOrderModel.deleteOne({ _id: newOrder._id })
                        newOrder = null
                        return BaseService.sendFailedResponse({
                            error: `Your wallet can't cover the ₦${logisticsFee.toLocaleString('en-NG')} pickup/delivery fee. Top up or pay by card.`,
                            needsLogisticsPayment: true,
                            logisticsFee,
                        })
                    }
                    newOrder.paymentStatus = PAYMENT_ORDER_STATUS.SUCCESS
                    await newOrder.save()
                } else if (feeDue && method === 'card') {
                    // order stays PENDING until the Paystack webhook confirms the fee
                    const pay = await new PaystackService().initializePayment({
                        body: { transactionType: 'order', orderId: String(newOrder._id) },
                        user: { id: userId },
                    })
                    logisticsPaymentUrl =
                        (pay?.success &&
                            pay.data?.message?.data?.authorization_url) ||
                        null
                }

                finalMessage = feeDue
                    ? method === 'wallet'
                        ? `Order placed. ₦${logisticsFee.toLocaleString('en-NG')} pickup/delivery fee paid from your wallet.`
                        : `Order placed — please complete the ₦${logisticsFee.toLocaleString('en-NG')} pickup/delivery fee payment to confirm.`
                    : finalMessage

                await createNotification({
                    userId: userId,
                    title: 'Order Created Successfully',
                    body: `Your laundry order has been received. We will pick it up shortly.`,
                    subBody: `Order ID: ${oscNumber}.`,
                    type: NOTIFICATION_TYPE.ORDER_CREATED,
                })
            } else if (post.billingType === BILLING_TYPE.PAY_PER_ITEM) {
                let serviceTypeMultiplier = 1
                const matchedService = adminOrderSetting.serviceTypes.find(
                    (service) => service.name === post.serviceType,
                )

                serviceTypeMultiplier = matchedService
                    ? matchedService.pricePerPiece
                    : 1

                // Per-item care tier (brief 1.6) via the shared helper, so this
                // branch, the pay-from-wallet branch and the staff intake path
                // can never price the same basket differently again.
                const priced = priceItems({
                    items: post.items,
                    serviceTypeMultiplier,
                    orderTier: post.serviceTier,
                    adminOrderSetting,
                })
                let totalPrice = priced.total
                // Same items at CLASSIC — lets the receipt show the tier uplift.
                const itemsBase = priced.itemsBase

                let speedCharge = 0
                if (post.deliverySpeed === DELIVERY_SPEED.EXPRESS) {
                    speedCharge = adminOrderSetting.expressCharge
                } else if (post.deliverySpeed === DELIVERY_SPEED.SAME_DAY) {
                    speedCharge = adminOrderSetting.sameDayCharge
                }
                const pickupFee = post.isPickUp
                    ? adminOrderSetting.pickupFee || 0
                    : 0
                const deliveryFee = post.isDelivery
                    ? adminOrderSetting.deliveryFee || 0
                    : 0
                let extraDeliveryCost = speedCharge + pickupFee + deliveryFee

                // Apply any selected offer(s) server-side (authoritative price).
                const itemsSubtotal = totalPrice
                const { finalTotal, breakdown } =
                    await this._priceWithOffers({
                        userId,
                        post,
                        itemsSubtotal,
                        extraDeliveryCost,
                        adminOrderSetting,
                    })
                offerBreakdown = breakdown
                totalPrice = finalTotal

                const stage = {
                    status: ORDER_STATUS.PENDING,
                    updatedAt: new Date(),
                }
                const stageHistory = {
                    status: ORDER_STATUS.PENDING,
                    note: 'Order created',
                    updatedAt: new Date(),
                }

                const newOrderItem = {
                    userId,
                    oscNumber,
                    amount: totalPrice,
                    deliveryAmount: extraDeliveryCost,
                    stage,
                    stageHistory: [stageHistory],
                    ...post,
                    deliveryDate,
                }
                newOrder = new BookOrderModel(newOrderItem)
                // per-piece: store each physical item individually
                newOrder.items = explodeItemsToPieces(post.items)
                await newOrder.save()

                // Credit is opt-in: reward credits can offset a per-item order
                // at booking (credits-first, oldest expiry). The remaining
                // balance is still settled through the normal per-item payment
                // flow (Paystack), so we lower the order's payable amount by the
                // credit applied; a fully-covered order needs no further payment.
                // Committing at booking matches how offers are counted.
                const useCredit =
                    post.useCredit === true || post.useCredit === 'true'
                let creditApplied = 0
                if (useCredit) {
                    const creditResult =
                        await WalletCreditService.applyCreditsToAmount(
                            userId,
                            newOrder._id,
                            totalPrice,
                            'Order Payment',
                        )
                    creditApplied = creditResult.applied
                    if (creditApplied > 0) {
                        newOrder.amount = Math.max(totalPrice - creditApplied, 0)
                        if (newOrder.amount === 0) {
                            newOrder.paymentStatus =
                                PAYMENT_ORDER_STATUS.SUCCESS
                            newOrder.paymentDate = new Date()
                        }
                    }
                }

                newOrder.pricing = this._buildPricing({
                    serviceTier: post.serviceTier,
                    itemsBase,
                    tierMultiplier: priced.isMixedTier
                        ? null
                        : priced.lines[0]?.tierMultiplier ?? 1,
                    tierLines: priced.lines,
                    tiersUsed: priced.tiersUsed,
                    isMixedTier: priced.isMixedTier,
                    itemsSubtotal,
                    speedCharge,
                    pickupFee,
                    deliveryFee,
                    breakdown: offerBreakdown,
                    creditApplied,
                    orderTotal: newOrder.amount,
                })
                await newOrder.save()

                await this._attachOffersToOrder(userId, offerBreakdown, newOrder._id)

                const creditNote =
                    creditApplied > 0
                        ? ` ₦${creditApplied.toLocaleString('en-NG')} was covered by your wallet credit.`
                        : ''
                await createNotification({
                    userId: userId,
                    title: 'Order Created Successfully',
                    body: `Your laundry order has been received. We will pick it up shortly.${creditNote}`,
                    subBody: `Order ID: ${oscNumber}.`,
                    type: NOTIFICATION_TYPE.ORDER_CREATED,
                })
            } else if (post.billingType === BILLING_TYPE.PAY_FROM_WALLET) {
                const wallet = await WalletModel.findOne({ userId })
                if (!wallet) {
                    return BaseService.sendFailedResponse({
                        error: 'Wallet not found. Please try again later',
                    })
                }

                let serviceTypeMultiplier = 1
                const matchedService = adminOrderSetting.serviceTypes.find(
                    (service) => service.name === post.serviceType,
                )

                serviceTypeMultiplier = matchedService
                    ? matchedService.pricePerPiece
                    : 1

                // Shared per-item tier pricing (brief 1.6). NOTE: this branch
                // used to default a missing tier charge to 1.5/2 while the two
                // other pricing sites used 1 — the same basket priced
                // differently depending on which screen created the order. The
                // helper defaults to 1 (no uplift) everywhere.
                const priced = priceItems({
                    items: post.items,
                    serviceTypeMultiplier,
                    orderTier: post.serviceTier,
                    adminOrderSetting,
                })
                let totalPrice = priced.total
                // CLASSIC-tier subtotal for the receipt's tier-uplift line.
                const itemsBase = priced.itemsBase

                let speedCharge = 0
                if (post.deliverySpeed === DELIVERY_SPEED.EXPRESS) {
                    speedCharge = adminOrderSetting.expressCharge
                } else if (post.deliverySpeed === DELIVERY_SPEED.SAME_DAY) {
                    speedCharge = adminOrderSetting.sameDayCharge
                }
                const pickupFee = post.isPickUp
                    ? adminOrderSetting.pickupFee || 0
                    : 0
                const deliveryFee = post.isDelivery
                    ? adminOrderSetting.deliveryFee || 0
                    : 0
                let extraDeliveryCost = speedCharge + pickupFee + deliveryFee

                // Apply any selected offer(s) server-side BEFORE charging the wallet.
                const itemsSubtotal = totalPrice
                const { finalTotal, breakdown } =
                    await this._priceWithOffers({
                        userId,
                        post,
                        itemsSubtotal,
                        extraDeliveryCost,
                        adminOrderSetting,
                    })
                offerBreakdown = breakdown
                totalPrice = finalTotal

                // Credit is opt-in: only spend reward credits when the customer
                // toggles it on; otherwise pay entirely from cash.
                const useCredit =
                    post.useCredit === true || post.useCredit === 'true'
                const usableCredit = useCredit
                    ? (await WalletCreditService.getCreditBalances(userId)).total
                    : 0
                if (totalPrice > wallet.balance + usableCredit) {
                    return BaseService.sendFailedResponse({
                        error: 'Insufficient balance in your wallet. Please try funding your account to continue',
                    })
                }

                const stage = {
                    status: ORDER_STATUS.PENDING,
                    updatedAt: new Date(),
                }
                const stageHistory = {
                    status: ORDER_STATUS.PENDING,
                    note: 'Order created',
                    updatedAt: new Date(),
                }

                const newOrderItem = {
                    userId,
                    oscNumber,
                    amount: totalPrice,
                    deliveryAmount: extraDeliveryCost,
                    stage,
                    stageHistory: [stageHistory],
                    paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                    paymentDate: new Date(),
                    ...post,
                    deliveryDate,
                }
                newOrder = new BookOrderModel(newOrderItem)
                // per-piece: store each physical item individually
                newOrder.items = explodeItemsToPieces(post.items)
                await newOrder.save()

                // Charge the wallet (credits first if opted in, then cash),
                // keyed to the order so a cancellation can reverse it precisely.
                const charge = await WalletService.chargeWalletForOrder({
                    userId,
                    orderId: newOrder._id,
                    amount: totalPrice,
                    description: 'Order Payment',
                    useCredit,
                })
                if (!charge.success) {
                    // roll back the order we just created — payment did not happen
                    await BookOrderModel.deleteOne({ _id: newOrder._id })
                    newOrder = null
                    return BaseService.sendFailedResponse({ error: charge.error })
                }

                newOrder.pricing = this._buildPricing({
                    serviceTier: post.serviceTier,
                    itemsBase,
                    tierMultiplier: priced.isMixedTier
                        ? null
                        : priced.lines[0]?.tierMultiplier ?? 1,
                    tierLines: priced.lines,
                    tiersUsed: priced.tiersUsed,
                    isMixedTier: priced.isMixedTier,
                    itemsSubtotal,
                    speedCharge,
                    pickupFee,
                    deliveryFee,
                    breakdown: offerBreakdown,
                    creditApplied: charge.creditApplied || 0,
                    orderTotal: newOrder.amount,
                })
                await newOrder.save()

                await this._attachOffersToOrder(userId, offerBreakdown, newOrder._id)

                // Record the cash portion as a Payment (credit portion is already
                // logged as credit WalletTransactions by the charge helper).
                if (charge.cashPaid > 0) {
                    await PaymentModel.create({
                        userId: userId,
                        amount: charge.cashPaid,
                        reference: generateReferenceId(),
                        status: 'success',
                        order: newOrder._id,
                        type: 'order',
                        alertType: 'debit',
                    })
                }

                await createNotification({
                    userId: userId,
                    title: 'Order Created Successfully',
                    body: `Your laundry order has been received. We will pick it up shortly.`,
                    subBody: `Order ID: ${oscNumber}.`,
                    type: NOTIFICATION_TYPE.ORDER_CREATED,
                })
            }

            // safety: if no branch created an order, stop before referencing newOrder
            if (!newOrder) {
                return BaseService.sendFailedResponse({
                    error: 'Order could not be created. Please try again.',
                })
            }

            // Stamp the resolved windows. Done once here rather than in each
            // billing branch's `create({...})`, so the three branches cannot
                // drift apart on it — and after the `if (!newOrder)` guard
            // above, so it can never run against a failed creation.
            if (scheduling) {
                await BookOrderModel.updateOne(
                    { _id: newOrder._id },
                    { $set: { scheduling } },
                )
                // Also on the in-memory document, or the response would omit
                // the times the customer just chose.
                newOrder.scheduling = scheduling
            }

            crmOnOrderCreated(newOrder)
            referralOnOrderCreated(newOrder)

            // update the capacity in admin order settings
            if (
                post.deliverySpeed === DELIVERY_SPEED.SAME_DAY &&
                adminOrderDetails.sameDayCapacity > 0
            ) {
                adminOrderDetails.sameDayCapacity -= post.items.length
            } else if (
                post.deliverySpeed === DELIVERY_SPEED.EXPRESS &&
                adminOrderDetails.expressCapacity > 0
            ) {
                adminOrderDetails.expressCapacity -= post.items.length
            } else if (
                post.deliverySpeed === DELIVERY_SPEED.STANDARD &&
                adminOrderDetails.standardCapacity > 0
            ) {
                adminOrderDetails.standardCapacity -= post.items.length
            }
            await adminOrderDetails.save()
            await ActivityModel.create({
                title: 'New Order Registered',
                description: `Order ${oscNumber} created for a customer ${post.fullName}.`,
                type: ACTIVITY_TYPE.ORDER_CREATED,
                orderId: newOrder._id,
                userId: userId || null,
                reference: oscNumber,
            })

            await createAuditLog({
                userId: userId,
                action: `Created order ${oscNumber} with id ${newOrder._id}`,
                category: 'order',
                orderId: newOrder._id,
            })
            // Offer outcome so the client can show the applied discount OR the
            // reason an offer was not applied (instead of a silent full charge).
            let offer = null
            if (offerBreakdown) {
                offer = {
                    applied:
                        (offerBreakdown.totalDiscount || 0) > 0 ||
                        offerBreakdown.freeDelivery ||
                        offerBreakdown.freePickup,
                    totalDiscount: offerBreakdown.totalDiscount || 0,
                    freeDelivery: !!offerBreakdown.freeDelivery,
                    freePickup: !!offerBreakdown.freePickup,
                    rejected: offerBreakdown.rejected || [],
                }
            }

            return BaseService.sendSuccessResponse({
                message: finalMessage,
                order: newOrder,
                offer,
                ...(logisticsPaymentUrl && { logisticsPaymentUrl }),
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
    async updateBookOrderPaymentStatus(req, res) {
        try {
            const status = req.body.paymentStatus
            const bookOrderId = req.params.id

            if (!status) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a payment status for the book order',
                })
            }

            if (!bookOrderId) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a book order id',
                })
            }

            const bookOrder = await BookOrderModel.findById(bookOrderId)
            if (!bookOrder) {
                return BaseService.sendFailedResponse({
                    error: 'Book order not found!',
                })
            }

            if (status === 'success') {
                await createNotification({
                    userId: bookOrder.userId,
                    title: 'Payment Successful Approved',
                    body: `Your payment of ${bookOrder.amount} has been successfully approved.`,
                    subBody: `Order ID: ${bookOrder.oscNumber}`,
                    type: NOTIFICATION_TYPE.PAYMENT_APPROVED,
                })
            }
            bookOrder.paymentStatus = status
            await bookOrder.save()

            return BaseService.sendSuccessResponse({
                message: 'Book order updated successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
    async updateBookOrderStage(req, res) {
        try {
            const stage = req.body.stage
            const note = req.body.note
            const bookOrderId = req.params.id

            if (!stage) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a stage for the book order',
                })
            }

            if (
                ![
                    ORDER_STATUS.DELIVERED,
                    ORDER_STATUS.IRONING,
                    ORDER_STATUS.OUT_FOR_DELIVERY,
                    ORDER_STATUS.PICKED_UP,
                    ORDER_STATUS.READY,
                    ORDER_STATUS.RECEIVED,
                ].includes(stage)
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a valid stage for the book order',
                })
            }
            if (!bookOrderId) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a book order id',
                })
            }

            const bookOrder = await BookOrderModel.findById(bookOrderId)
            if (!bookOrder) {
                return BaseService.sendFailedResponse({
                    error: 'Book order not found!',
                })
            }
            bookOrder.stage.status = stage
            bookOrder.stage.note = note
            await bookOrder.save()

            if (stage === ORDER_STATUS.DELIVERED) {
                crmOnOrderDelivered(bookOrder)
                offerOnOrderDelivered(bookOrder)
                referralOnOrderDelivered(bookOrder)
                recoveryOnOrderDelivered(bookOrder)
            }

            let message = ''
            let title = ''

            switch (stage) {
                case ORDER_STATUS.PICKED_UP:
                    message = 'Your laundry has been picked up successfully'
                    title = 'Picked Up'
                    break
                case ORDER_STATUS.WASHING:
                    message = 'Your laundry is being washed'
                    title = 'Washing'
                    break
                case ORDER_STATUS.IRONING:
                    message = 'Your laundry is being ironed'
                    title = 'Ironing'
                    break
                case ORDER_STATUS.DELIVERED:
                    message = 'Your order has been delivered successfully'
                    title = 'Delivered'
                    break
                case ORDER_STATUS.OUT_FOR_DELIVERY:
                    message = 'Your order is out for delivery'
                    title = 'Delivered'
                case ORDER_STATUS.RECEIVED:
                    message = 'Your order has been received'
                    title = 'Received'
                case ORDER_STATUS.READY:
                    message = 'Your order is ready for pickup'
                    title = 'Ready'
                    break
                default:
                    message = 'Status updated'
            }

            await createNotification({
                userId: bookOrder.userId,
                title: title,
                body: message,
                subBody: note || '',
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })

            await createAuditLog({
                userId: req.user.id,
                action: `Updated order ${bookOrder.oscNumber} to stage ${stage}`,
                category: 'order',
                orderId: bookOrder._id,
            })

            return BaseService.sendSuccessResponse({
                message: 'Book order stage updated successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
    async getBookOrderHistory(req, res) {
        try {
            const page = parseInt(req.query.page) || 1 // default to page 1
            const limit = parseInt(req.query.limit) || 10 // default 10 per page
            const skip = (page - 1) * limit
            const userId = req.user.id
            const isAdmin = req.user.userType === ROLE.ADMIN

            // 2️⃣ Optional filters
            const filter = {}
            if (req.query.status) {
                // Explicit exact stage filter (backward compatible) — wins if given.
                filter['stage.status'] = req.query.status
            } else if (req.query.view && req.query.view !== 'all') {
                // Semantic bucket for the customer app:
                //   active    → every real order except cancelled (delivered stays)
                //   completed → delivered
                //   cancelled → cancelled only
                //   all       → no stage filter (default)
                const view = req.query.view
                if (view === 'active') {
                    filter['stage.status'] = { $ne: ORDER_STATUS.CANCELLED }
                } else if (view === 'completed') {
                    filter['stage.status'] = ORDER_STATUS.DELIVERED
                } else if (view === 'cancelled') {
                    filter['stage.status'] = ORDER_STATUS.CANCELLED
                }
            }
            if (req.query.paymentStatus) {
                filter.paymentStatus = req.query.paymentStatus
            }

            // 🔒 Scope guard: never trust the client. A non-admin can ONLY ever
            // see their own orders. Only an admin may look across users — either
            // a specific ?userId or (with scope=all) everyone.
            if (!isAdmin) {
                filter.userId = userId
            } else if (req.query.userId) {
                filter.userId = req.query.userId
            } else if (req.query.scope !== 'all') {
                // admin default is their own unless they explicitly ask for all
                filter.userId = userId
            }

            // 3️⃣ Fetch orders with pagination
            const orders = await BookOrderModel.find(filter)
                .sort({ createdAt: -1 }) // latest first
                .skip(skip)
                .limit(limit)
                .lean()

            // 4️⃣ Count total for pagination meta
            const total = await BookOrderModel.countDocuments(filter)

            presentOrders(orders)

            // 5️⃣ Send response
            return BaseService.sendSuccessResponse({
                message: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    data: orders,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
    async getBookOrder(req, res) {
        try {
            const bookOrderId = req.params.id

            if (!bookOrderId) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a valid book order id',
                })
            }
            const bookOrder = await BookOrderModel.findById(bookOrderId).lean()

            if (!bookOrder) {
                return BaseService.sendFailedResponse({
                    error: 'Book order not found',
                })
            }

            presentOrder(bookOrder)

            // 5️⃣ Send response
            return BaseService.sendSuccessResponse({
                message: bookOrder,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
}

module.exports = BookOrderService
