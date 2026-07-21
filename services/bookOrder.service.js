const BaseService = require('./base.service')
const UserModel = require('../models/user.model')
const validateData = require('../util/validate')
const BookOrderModel = require('../models/bookOrder.model')
const AdminOrderDetailsModel = require('../models/adminOrderDetails.model')
const {
    generateOscNumber,
    generateReferenceId,
    roundToNearestHundred,
    calculateDueDate,
    getObjectId,
} = require('../util/helper')
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
} = require('../util/constants')
const CancellationRequestModel = require('../models/cancellationRequest.model')
const ActivityModel = require('../models/activity.model')
const createNotification = require('../util/createNotification')
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
const {
    referralOnOrderCreated,
    referralOnOrderDelivered,
} = require('../util/referralHooks')

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
    async _performCancellation(order, { reason, performedBy, tier, feeApplied = 0 }) {
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
                const wallet = await WalletModel.findOneAndUpdate(
                    { userId: order.userId },
                    {
                        $inc: { balance: cashRefunded },
                        $setOnInsert: { currency: 'NGN' },
                    },
                    { new: true, upsert: true },
                )
                const refundRef = generateReferenceId()
                await WalletTransactionModel.create({
                    userId: order.userId,
                    walletId: wallet._id,
                    type: WALLET_TX_TYPE.CREDIT,
                    amount: cashRefunded,
                    reference: refundRef,
                    status: 'success',
                    description: `Refund for cancelled order ${order.oscNumber || order._id}`,
                    relatedOrderId: order._id,
                    balanceAfter: wallet.balance,
                })
                // Mirror it as a Payment (credit) so it shows in the customer's
                // transaction history (fetch-user-transactions reads Payment).
                await PaymentModel.create({
                    userId: order.userId,
                    amount: cashRefunded,
                    reference: refundRef,
                    status: 'success',
                    type: 'refund',
                    order: order._id,
                    alertType: 'credit',
                    paymentMethod: 'wallet',
                    adminNote: `Refund for cancelled order ${order.oscNumber || order._id}`,
                })
            }
        }

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

            const result = await this._performCancellation(order, {
                reason,
                performedBy: getObjectId(staffId),
                tier: role === ROLE.ADMIN ? 'admin' : 'intake-and-tag',
                feeApplied: feeAmount,
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

            const result = await this._performCancellation(order, {
                reason: request.reason,
                performedBy: getObjectId(staffId),
                tier: 'amber',
                feeApplied: feeAmount,
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
            const deliveryDate = calculateDueDate(post.deliverySpeed)
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

            const oscNumber = generateOscNumber()
            let newOrder = null

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

                // ← fetch all heavy items from DB
                const heavyItems = await OrderItemModel.find({
                    isHeavy: true,
                }).lean()
                const heavyItemNames = heavyItems.map((i) =>
                    i.name.toLowerCase(),
                )

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

                let totalPrice = post.items.reduce((sum, item) => {
                    const price = Number(item.price)
                    const quantity = Number(item.quantity)

                    return sum + price * quantity
                }, 0)

                let extraDeliveryCost = 0

                totalPrice += extraDeliveryCost
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
                    stationStatus: STATION_STATUS.PENDING,
                    paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                    paymentDate: new Date(),
                    ...post,
                    deliveryDate,
                }

                newOrder = new BookOrderModel(newOrderItem)
                await newOrder.save()

                await createNotification({
                    userId: userId,
                    title: 'Order Created Successfully',
                    body: `Your laundry order has been received. We will pick it up shortly.`,
                    subBody: `Order ID: ${oscNumber}.`,
                    type: NOTIFICATION_TYPE.ORDER_CREATED,
                })

                // update the subscription usage
                subscription.remainingItems -= post.items.length
                await subscription.save()
            } else if (post.billingType === BILLING_TYPE.PAY_PER_ITEM) {
                let serviceTypeMultiplier = 1
                const matchedService = adminOrderSetting.serviceTypes.find(
                    (service) => service.name === post.serviceType,
                )

                serviceTypeMultiplier = matchedService
                    ? matchedService.pricePerPiece
                    : 1

                const PREMIUM = adminOrderSetting.premiumServiceTierCharge || 1
                const VIP = adminOrderSetting.vipServiceTierCharge || 1

                let multiplier = 1
                if (post.serviceTier === SERVICE_TIERS.PREMIUM)
                    multiplier = PREMIUM
                if (post.serviceTier === SERVICE_TIERS.VIP) multiplier = VIP

                let totalPrice = post.items.reduce((sum, item) => {
                    const price = Number(item.price)
                    const quantity = Number(item.quantity)

                    // Multiply the item subtotal by the selected tier multiplier
                    return (
                        sum +
                        roundToNearestHundred(price * serviceTypeMultiplier) *
                            quantity *
                            multiplier
                    )
                }, 0)

                let extraDeliveryCost = 0

                if (post.deliverySpeed === DELIVERY_SPEED.EXPRESS) {
                    extraDeliveryCost += adminOrderSetting.expressCharge
                } else if (post.deliverySpeed === DELIVERY_SPEED.SAME_DAY) {
                    extraDeliveryCost += adminOrderSetting.sameDayCharge
                }

                if (post.isPickUp) {
                    extraDeliveryCost += adminOrderSetting.pickupFee || 0
                }
                if (post.isDelivery) {
                    extraDeliveryCost += adminOrderSetting.deliveryFee || 0
                }

                totalPrice += extraDeliveryCost

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
                await newOrder.save()

                await createNotification({
                    userId: userId,
                    title: 'Order Created Successfully',
                    body: `Your laundry order has been received. We will pick it up shortly.`,
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

                const PREMIUM =
                    adminOrderSetting.premiumServiceTierCharge || 1.5
                const VIP = adminOrderSetting.vipServiceTierCharge || 2

                let multiplier = 1
                if (post.serviceTier === SERVICE_TIERS.PREMIUM)
                    multiplier = PREMIUM
                if (post.serviceTier === SERVICE_TIERS.VIP) multiplier = VIP

                let totalPrice = post.items.reduce((sum, item) => {
                    const price = Number(item.price)
                    const quantity = Number(item.quantity)

                    // Multiply the item subtotal by the selected tier multiplier
                    return (
                        sum +
                        roundToNearestHundred(price * serviceTypeMultiplier) *
                            quantity *
                            multiplier
                    )
                }, 0)

                let extraDeliveryCost = 0
                if (post.deliverySpeed === DELIVERY_SPEED.EXPRESS) {
                    extraDeliveryCost += adminOrderSetting.expressCharge
                } else if (post.deliverySpeed === DELIVERY_SPEED.SAME_DAY) {
                    extraDeliveryCost += adminOrderSetting.sameDayCharge
                }

                if (post.isPickUp) {
                    extraDeliveryCost += adminOrderSetting.pickupFee || 0
                }
                if (post.isDelivery) {
                    extraDeliveryCost += adminOrderSetting.deliveryFee || 0
                }

                totalPrice += extraDeliveryCost

                if (totalPrice > wallet.balance) {
                    return BaseService.sendFailedResponse({
                        error: 'Insufficient balance in your wallet. Please try funding your account to continue',
                    })
                }

                wallet.balance -= totalPrice
                await wallet.save()

                const referencee = uuidv4()
                await WalletTransactionModel.create({
                    userId,
                    walletId: wallet._id,
                    type: 'debit',
                    amount: totalPrice,
                    reference: referencee,
                    status: 'success',
                    description: 'Order Payment',
                })

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
                await newOrder.save()

                const reference = generateReferenceId()
                await PaymentModel.create({
                    userId: userId,
                    amount: totalPrice,
                    reference: reference,
                    status: 'success',
                    order: newOrder._id,
                    type: 'order',
                    alertType: 'debit',
                })

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
            return BaseService.sendSuccessResponse({
                message: finalMessage,
                order: newOrder,
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
            const scope = req.query.scope || 'all' // default to user scope "user | all"

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
            if (scope === 'user') {
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
            const bookOrder = await BookOrderModel.findById(bookOrderId)

            if (!bookOrder) {
                return BaseService.sendFailedResponse({
                    error: 'Book order not found',
                })
            }

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
