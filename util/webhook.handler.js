const SubscriptionModel = require('../models/subscription.model')
const UserModel = require('../models/user.model')
const PaymentModel = require('../models/payment.model')
const { addMonths } = require('./helper')
const BookOrderModel = require('../models/bookOrder.model')
const { NOTIFICATION_TYPE } = require('./constants')
const PlanModel = require('../models/plan.model')
const WalletModel = require('../models/wallet.model')
const WalletTransactionModel = require('../models/walletTransaction.model')
const createNotification = require('./createNotification')
const notifyBot = require('./notifyBot')
const { markProductionClearedIfReady } = require('./productionClock')

// Subscriber loyalty rewards (client confirmed 2026-08-29): payment NEVER changes
// (same price, same monthly schedule) — only that month's ITEM BUNDLE grows, scaled
// to plan size and ALWAYS rounded down:
//   month 3  → +25% of the monthly item bundle
//   month 6  → +50% of the monthly item bundle
//   month 12 → +100% of the monthly item bundle (double)
// (The earlier "free month by moving the billing period" idea was dropped — no
// Paystack interaction; this is purely extra items for that cycle.)
// Mutates `subscription` (caller saves). loyaltyRewardsApplied guards double-apply.
const LOYALTY_BONUS_PCT = { 3: 0.25, 6: 0.5, 12: 1.0 }

async function applySubscriberLoyalty(subscription, plan, month) {
    if (!plan || !Number.isFinite(plan.monthlyLimits)) return
    const pct = LOYALTY_BONUS_PCT[month]
    if (!pct) return
    const already = subscription.loyaltyRewardsApplied || []
    if (already.includes(month)) return

    const bonus = Math.floor(plan.monthlyLimits * pct)
    subscription.remainingItems = (subscription.remainingItems || 0) + bonus
    subscription.loyaltyRewardsApplied = [...already, month]

    if (subscription.userId && bonus > 0) {
        try {
            await createNotification({
                userId: subscription.userId,
                title: 'Loyalty reward unlocked 🎉',
                body: `Thanks for ${month} months with Chuvi Laundry! We've added ${bonus} extra item(s) to this month's plan — same price.`,
                subBody: `${month}-month subscriber reward`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })
        } catch (e) {
            console.warn('subscriber-loyalty notify failed:', e.message)
        }
    }
}

// async function handleChargeSuccess(data) {
//     try {
//         // console.log({ data }, "handleChargeSuccess");
//         const metadata = data.metadata || {}
//         const reference = data.reference
//         const userEmail = data.customer?.email

//         if (!userEmail) {
//             console.log('No user email in charge.success')
//             return
//         }

//         // 1️⃣ Find user
//         const user = await UserModel.findOne({ email: userEmail })
//         if (!user) {
//             console.log('User not found for email:', userEmail)
//             return
//         }

//         // 2️⃣ Prevent duplicate payments
//         const existingPayment = await PaymentModel.findOne({ reference })
//         // if (existingPayment) {
//         //     console.log('Payment already recorded:', reference)
//         //     return
//         // }

//         // 3️⃣ Save payment
//         console.log(metadata, 'metadata')
//         if (!metadata.transactionType) {
//             console.warn(
//                 'No transaction type in metadata, cannot process payment',
//             )
//             return
//         }

//         if (existingPayment && existingPayment.status == 'success') {
//             console.log('Payment already made')
//             return
//         }

//         existingPayment.paidAt = new Date(data.paid_at)
//         existingPayment.metadata = metadata
//         existingPayment.status = 'success'
//         existingPayment.amount = metadata.amount
//         existingPayment.channel = data.channel
//         await existingPayment.save()

//         // ==========================
//         // 🛒 ORDER PAYMENT FLOW
//         // ==========================
//         if (metadata.transactionType === 'order') {
//             await handleOrderPayment(metadata, reference)
//             return
//         }

//         if (metadata.transactionType === 'wallet-top-up') {
//             await handleWalletTopUp(metadata, reference)
//             return
//         }

//         if (metadata.transactionType === 'subscription') {
//             if (!data.subscription) {
//                 await handleNormalSubscription(data, user)
//                 return
//             }

//             const subscriptionCode = data.subscription.subscription_code

//             let subscription = await SubscriptionModel.findOne({
//                 subscriptionCode,
//             })
//         }
//     } catch (error) {
//         console.error('Error in handleChargeSuccess:', error)
//     }
// }

async function handleChargeSuccess(data) {
    try {
        const metadata = data.metadata || {}
        const reference = data.reference
        const userEmail = data.customer?.email

        if (!userEmail) {
            console.log('No user email in charge.success')
            return
        }

        // 1️⃣ Find user
        const user = await UserModel.findOne({ email: userEmail })
        if (!user) {
            console.log('User not found for email:', userEmail)
            return
        }

        if (!metadata.transactionType) {
            console.warn('No transaction type in metadata, cannot process payment')
            return
        }

        // 2️⃣ Only a payment THIS server started is processed. Every checkout
        //    we open writes a pending Payment row first (initializePayment /
        //    wallet top-up). A signed event with no such row was started
        //    elsewhere — e.g. with the public key and made-up metadata
        //    ({ transactionType: 'wallet-top-up', amount: 1000000 }) — so it
        //    is never acted on; an admin is told to look (review F-35).
        const existing = await PaymentModel.findOne({ reference }).lean()
        if (!existing) {
            console.error('Paystack payment with no matching checkout — not processed:', reference)
            try {
                const { notifyRoles } = require('./notifyRoles')
                const { ROLE } = require('./constants')
                await notifyRoles({
                    roles: [ROLE.ADMIN],
                    title: 'Unmatched Paystack payment',
                    body: `A payment of ₦${(Number(data.amount) / 100).toLocaleString('en-NG')} (reference ${reference}) from ${userEmail} did not match any checkout we started, so nothing was credited. Check it in Paystack.`,
                    type: NOTIFICATION_TYPE.SYSTEM,
                })
            } catch (err) {
                console.error('unmatched payment alert failed:', err?.message)
            }
            return
        }

        // 2b. The event must match the checkout WE recorded (review F-38). The
        //     event's metadata is whatever the checkout was opened with, so a
        //     reference could be re-used with made-up metadata: our row's type,
        //     owner and order are the truth. A bank-transfer proof row, or a
        //     checkout Paystack refused, was never a card checkout at all.
        const mismatch =
            existing.status === 'failed'
                ? 'a checkout Paystack refused'
                : existing.paymentMethod === 'bank-transfer' || /^BT-/.test(String(reference))
                  ? 'a bank-transfer proof, not a card checkout'
                  : existing.type !== metadata.transactionType
                    ? `a ${existing.type} checkout, not ${metadata.transactionType}`
                    : String(existing.userId) !== String(user._id)
                      ? 'a checkout opened by another customer'
                      : metadata.transactionType === 'order' &&
                          String(existing.order || '') !== String(metadata.orderId || '')
                        ? 'a checkout for a different order'
                        : null
        if (mismatch && existing.status !== 'success') {
            console.error(`Paystack payment ${reference} does not match our checkout (${mismatch}) — not processed`)
            try {
                const { notifyRoles } = require('./notifyRoles')
                const { ROLE } = require('./constants')
                await notifyRoles({
                    roles: [ROLE.ADMIN],
                    title: 'Paystack payment did not match its checkout',
                    body: `A payment of ₦${(Number(data.amount) / 100).toLocaleString('en-NG')} (reference ${reference}) from ${userEmail} was ${mismatch}, so nothing was credited. Check it in Paystack.`,
                    type: NOTIFICATION_TYPE.SYSTEM,
                })
            } catch (err) {
                console.error('mismatched payment alert failed:', err?.message)
            }
            return
        }

        // What Paystack collected, never more than this checkout asked for:
        // `data.amount` may include a fee the customer bore (review F-39).
        const collected = Number(data.amount) / 100
        const expected = Number(existing.metadata?.expectedAmount)
        const paidNaira =
            Number.isFinite(expected) && expected > 0 ? Math.min(collected, expected) : collected
        const expectedPlanId = existing.metadata?.planId || null

        // 3️⃣ Claim the reference ATOMICALLY, so two copies of one event (or a
        //    retry racing the first) cannot both be processed (review F-36).
        const payment = await PaymentModel.findOneAndUpdate(
            { reference, status: { $ne: 'success' } },
            {
                $set: {
                    paidAt: new Date(data.paid_at),
                    metadata: { ...metadata, expectedAmount: existing.metadata?.expectedAmount },
                    status: 'success',
                    amount: paidNaira,
                    channel: data.channel,
                },
            },
            { new: true },
        )
        if (!payment) {
            console.log('Payment already made:', reference)
            return
        }

        // ==========================
        // 🛒 ORDER PAYMENT FLOW
        // ==========================
        if (metadata.transactionType === 'order') {
            // What Paystack actually collected (kobo → naira), so the order is
            // settled against the money received, not the link's old figure.
            await handleOrderPayment(metadata, reference, paidNaira)
            return
        }

        if (metadata.transactionType === 'wallet-top-up') {
            // Credit what Paystack COLLECTED, to the person who PAID (F-35).
            await handleWalletTopUp(metadata, reference, {
                paidNaira,
                payerId: user._id,
            })
            return
        }

        if (metadata.transactionType === 'subscription') {
            // First charge (no subscription object yet) — creates/activates it.
            // Only for the plan this checkout was opened for, and only when the
            // money covers that plan's price (review F-38).
            if (!data.subscription) {
                const planId = expectedPlanId || metadata.planId
                const plan = planId ? await PlanModel.findById(planId).lean() : null
                const planMismatch = expectedPlanId && metadata.planId && String(expectedPlanId) !== String(metadata.planId)
                if (!plan || planMismatch || collected + 0.5 < Number(plan.price || 0)) {
                    console.error(`Subscription payment ${reference} does not cover its plan — not activated`)
                    try {
                        const { notifyRoles } = require('./notifyRoles')
                        const { ROLE } = require('./constants')
                        await notifyRoles({
                            roles: [ROLE.ADMIN],
                            title: 'Subscription payment did not match its plan',
                            body: `A subscription payment of ₦${collected.toLocaleString('en-NG')} (reference ${reference}) from ${userEmail} did not cover its plan, so nothing was activated. Check it in Paystack.`,
                            type: NOTIFICATION_TYPE.SYSTEM,
                        })
                    } catch (err) {
                        console.error('subscription mismatch alert failed:', err?.message)
                    }
                    return
                }
                await handleNormalSubscription(data, user)
                return
            }

            // ♻️ RECURRING RENEWAL — previously found the subscription and did
            // nothing; renewals never updated status, limits, or the customer.
            const subscriptionCode = data.subscription.subscription_code

            const subscription = await SubscriptionModel.findOne({
                subscriptionCode,
            })
            if (!subscription) {
                console.warn('Renewal for unknown subscription:', subscriptionCode)
                return
            }

            const plan = await PlanModel.findById(subscription.planId)

            subscription.status = 'active'
            subscription.lastPaymentAt = new Date(data.paid_at)
            if (data.subscription.next_payment_date) {
                subscription.nextPaymentDate = new Date(
                    data.subscription.next_payment_date,
                )
            }
            if (plan?.monthlyLimits != null) {
                // fresh month, fresh item allowance
                subscription.remainingItems = plan.monthlyLimits
            }
            // Subscriber loyalty: this renewal is one more consecutive month.
            subscription.consecutiveMonths =
                (subscription.consecutiveMonths || 0) + 1
            await applySubscriberLoyalty(
                subscription,
                plan,
                subscription.consecutiveMonths,
            )
            await subscription.save()

            // 🔔 Tell the customer their renewal went through
            await notifyBot({
                event: 'subscription-active',
                chuviUserId: String(user._id),
                email: userEmail,
                planName: plan?.name,
                amount: metadata.amount || plan?.price,
            })
            return
        }
    } catch (error) {
        console.error('Error in handleChargeSuccess:', error)
    }
}

async function handleChargeFailed(data) {
    try {
        const reference = data.reference
        const metadata = data.metadata || {}
        const reason = data.gateway_response || 'The payment was not completed'

        // Mark our payment record as failed (idempotent)
        const payment = await PaymentModel.findOneAndUpdate(
            { reference, status: { $ne: 'success' } },
            { status: 'failed' },
            { new: true },
        )

        const userId = metadata.userId || payment?.userId
        const email = data.customer?.email

        // 🔔 Tell the customer on WhatsApp (fire-and-forget)
        await notifyBot({
            event: 'payment-failed',
            ...(userId && { chuviUserId: String(userId) }),
            ...(email && { email }),
            reason,
            reference,
            ...(metadata.orderId && { orderId: String(metadata.orderId) }),
        })
    } catch (error) {
        console.error('Error in handleChargeFailed:', error)
        return
    }
}

async function handlePaymentFailed(data) {
    try {
        if (!data.subscription) return

        // A missed payment breaks the consecutive-month loyalty streak.
        await SubscriptionModel.findOneAndUpdate(
            { subscriptionCode: data.subscription.subscription_code },
            { status: 'failed', consecutiveMonths: 0, loyaltyRewardsApplied: [] },
        )
    } catch (error) {
        console.error('Error in handlePaymentFailed:', error)
        return
    }
}

async function handleSubscriptionDisable(data) {
    console.log(data, 'handleSubscriptionDisable')
    try {
        await SubscriptionModel.findOneAndDelete({
            subscriptionCode: data.subscription_code,
        })
    } catch (error) {
        console.error('Error in handleSubscriptionDisable:', error)
        return
    }
}

async function handleSubscriptionCreate(data) {
    try {
        const email = data.customer.email
        const planCode = data.plan.plan_code
        const authorizationCode = data.authorization.authorization_code
        const customerCode = data.customer.customer_code || ''
        // console.log(data, "handle subscription create");

        const user = await UserModel.findOne({ email })
        if (!user) {
            console.warn(
                'User not found for subscription.create, cannot create subscription',
                data.customer.email,
            )
            return
        }

        const filter = {
            userId: user._id,
            paystackAuthorizationToken: authorizationCode,
            paystackSubscriptionId: planCode,
        }
        user.customerCode = customerCode
        await user.save()

        const subscription = await SubscriptionModel.findOne(filter)
        console.log(
            { paystackSubscriptionCode: planCode, subscription },
            'handleSubscriptionCreate',
        )

        if (subscription) {
            subscription.subscriptionCode = data.subscription_code
            subscription.paystackSubscriptionId = planCode
            subscription.paystackEmailToken = data.email_token | ''
            subscription.status = data.status || 'active'
            subscription.nextPaymentDate = data.next_payment_date
                ? new Date(data.next_payment_date)
                : null
            subscription.paystackAuthorizationToken = authorizationCode

            await subscription.save()
            console.log(
                '✅ Subscription updated with Paystack subscription_code:',
                subscription.subscriptionCode,
            )
        } else {
            // console.log(new Date(), "Creating create subscription with start date");
            // await SubscriptionModel.create({
            //   nextPaymentDate: data.next_payment_date,
            //   status: "active",
            //   subscriptionCode: data.subscription_code,
            //   paystackSubscriptionId: data.plan.plan_code,
            //   paystackAuthorizationToken: authorizationCode,
            //   user: user._id,
            //   currentPeriodEnd: new Date(data.next_payment_date),
            // });
        }
    } catch (error) {
        console.error('Error in handleSubscriptionCreate:', error)
    }
}

async function handleInvoiceFailed(data) {
    try {
        if (!data.subscription) return

        await SubscriptionModel.findOneAndUpdate(
            { subscriptionCode: data.subscription.subscription_code },
            { status: 'failed' },
        )

        // 🔔 Tell the customer their subscription renewal failed (fire-and-forget)
        if (data.customer?.email) {
          await  notifyBot({
                event: 'payment-failed',
                email: data.customer.email,
                reason: 'Your subscription renewal payment did not go through',
            })
        }
    } catch (error) {
        console.error('Error in handleInvoiceFailed:', error)
        return
    }
}

async function handleNormalSubscription(data) {
    try {
        const email = data.customer.email
        const planCode = data.plan.plan_code
        const authorizationCode = data.authorization.authorization_code
        const metadata = data.metadata || {}

        const user = await UserModel.findOne({ email })

        if (!user) {
            console.warn(
                'User not found for subscription.create, cannot create subscription',
                data.customer.email,
            )
            return
        }

        const filter = {
            user: user._id,
            paystackSubscriptionId: planCode,
            paystackAuthorizationToken: authorizationCode,
        }

        let subscription = await SubscriptionModel.findOne(filter)
        console.log(
            { paystackSubscriptionCode: planCode, subscription },
            'handleNormalSubscription',
        )

        const planId = metadata.planId
        const paystackId = metadata.paystackPlan

        if (!planId || !paystackId) {
            console.warn(
                'No planId in metadata for normal subscription, cannot set limits',
            )
            return
        }

        const plan = await PlanModel.findOne({ paystackPlanCode: paystackId })

        if (!subscription) {
            console.log(
                'Subscription does not exist, creating new subscription from webhook',
            )

            // Optional: fallback values if you have a mapping table or default plan/coach
            console.log(
                new Date(),
                'Creating handle normal subscription with start date',
            )

            const nextPaymentDate = generateNextPaymentDate('monthly')

            subscription = await SubscriptionModel.create({
                email: email,
                paystackSubscriptionId: paystackId || null,
                startDate: new Date(data.paid_at),
                planId: planId,
                lastPaymentAt: new Date(data.paid_at),
                userId: user._id,
                paystackAuthorizationToken: authorizationCode,
                status: 'active',
                currentPeriodEnd: nextPaymentDate,
                nextPaymentDate: nextPaymentDate,
                remainingItems: plan.monthlyLimits,
                // first paid month starts the loyalty streak
                consecutiveMonths: 1,
                loyaltyRewardsApplied: [],
                // seed the weekly pickup/delivery allowance + week anchor
                remainingPickupDeliveries: plan.freePickupDeliveryPerWeek || 0,
                logisticsWeekStart: new Date(data.paid_at),
            })

            return
        } else {
            subscription.status = 'active'
            subscription.email = email
            ;((subscription.paystackSubscriptionId = paystackPlan || null),
                (subscription.startDate = new Date(data.paid_at)),
                (subscription.planId = planId),
                (subscription.monthlyLimits = plan.monthlyLimits),
                (subscription.userId = user._id),
                (subscription.lastPaymentAt = new Date(data.paid_at)))
            // (re)subscribing restarts the consecutive-month loyalty streak
            subscription.consecutiveMonths = 1
            subscription.loyaltyRewardsApplied = []
            // re-anchor the weekly logistics allowance
            subscription.remainingPickupDeliveries =
                plan.freePickupDeliveryPerWeek || 0
            subscription.logisticsWeekStart = new Date(data.paid_at)
            await subscription.save()
        }

        await notifyBot({
            event: 'subscription-active',
            chuviUserId: String(user._id),
            email,
            planName: plan?.name,
            amount: plan?.price,
        })
    } catch (error) {
        console.error('Error in handleNormalSubscription:', error)
    }
}

async function handleOrderPayment(metadata, reference, paidNaira = null) {
    try {
        const { orderId } = metadata

        if (!orderId) {
            console.warn('Order payment missing orderId in metadata')
            return
        }

        const order = await BookOrderModel.findById(orderId)
        if (!order) {
            console.warn(`Order ${orderId} not found`)
            return
        }

        const { amountDue } = require('./paymentGate')
        const { refundToWallet } = require('./walletRefund')
        const paid = Number.isFinite(paidNaira) && paidNaira > 0 ? paidNaira : null

        // 🔒 Already paid. The same reference never reaches here twice (it is
        // claimed atomically above), but this can still be the SAME money
        // seen twice — a delayed Paystack retry after staff marked the order
        // paid from the customer's receipt — or a genuine second checkout.
        // The two cannot be told apart here, so nothing is credited
        // automatically: an admin is told to check and refund if it is a
        // real second payment (review F-36).
        if (order.paymentStatus === 'success') {
            if (paid) {
                console.error(`Order ${order.oscNumber} was already paid; payment ${reference} of ₦${paid} needs review`)
                try {
                    const { notifyRoles } = require('./notifyRoles')
                    const { ROLE } = require('./constants')
                    await notifyRoles({
                        roles: [ROLE.ADMIN],
                        title: 'Payment on an order already paid',
                        body: `Order ${order.oscNumber} was already marked paid when a card payment of ₦${paid.toLocaleString('en-NG')} (reference ${reference}) arrived. If it is a genuine second payment, refund it to the customer's wallet.`,
                        type: NOTIFICATION_TYPE.SYSTEM,
                    })
                } catch (err) {
                    console.error('already-paid alert failed:', err?.message)
                }
            }
            return
        }

        // Settle against what was actually COLLECTED (review F-33): a link
        // opened before Intake raised the bill pays the old figure.
        const due = amountDue(order)
        if (paid !== null && paid + 0.5 < due) {
            // Underpaid: keep it unpaid with the rest as its balance, and send
            // a fresh hold (and link) for exactly that remainder.
            const remaining = Math.round(due - paid)
            const replacedHold = order.paymentHold?.raisedAt && !order.paymentHold?.clearedAt
                ? { raisedAt: order.paymentHold.raisedAt, remindersSent: order.paymentHold.remindersSent || [] }
                : null
            order.balanceDue = remaining
            order.reference = reference
            await order.save()
            try {
                const PaymentHoldService = require('../services/paymentHold.service')
                await PaymentHoldService.clear({ orderId: order._id, source: 'paystack-partial', quiet: true })
                await PaymentHoldService.raise({
                    orderId: order._id,
                    reason: `₦${paid.toLocaleString('en-NG')} received; ₦${remaining.toLocaleString('en-NG')} is still due.`,
                    keepClockFrom: replacedHold,
                })
            } catch (err) {
                console.error('re-raising the hold for an underpaid order failed:', err?.message)
            }
            return
        }

        order.paymentStatus = 'success'
        order.reference = reference
        order.paymentDate = new Date()
        order.paymentMethod = 'paystack'
        // The outstanding balance (if this paid one) is settled (F-30).
        order.balanceDue = undefined

        await order.save()

        // Overpaid (a link opened before the bill went DOWN): the excess goes
        // back to the wallet (review F-33).
        if (paid !== null && paid - 0.5 > due && order.userId) {
            try {
                await refundToWallet({
                    userId: order.userId,
                    amount: Math.round(paid - due),
                    orderId: order._id,
                    description: `Order ${order.oscNumber} overpaid after its bill changed — excess returned`,
                })
            } catch (err) {
                console.error('order overpayment refund failed — settle manually:', err?.message)
            }
        }

        // Processing clock (client correction 2026-10-08): the money is now
        // complete. If the clothes are already with us this is the LATER of the
        // two events, so the clock starts here — the Quick Booking case, and
        // the "S1 sent a top-up request" case. Non-fatal: a measurement must
        // never be able to fail a payment.
        try {
            await markProductionClearedIfReady(order._id)
        } catch (err) {
            console.error('production clock (order payment) failed:', err?.message)
        }

        // N1 Phase 3: "Paystack clears the hold automatically." This is that
        // automatic release — the order goes back to the tagging queue and the
        // tags can finally print. Non-fatal and AFTER the payment is saved, so
        // a failure here can never lose a confirmed payment; the order would
        // simply sit on its hold until someone released it.
        try {
            const PaymentHoldService = require('../services/paymentHold.service')
            await PaymentHoldService.clear({
                orderId: order._id,
                source: 'paystack',
            })
        } catch (err) {
            console.error('payment hold release (webhook) failed:', err?.message)
        }

       await notifyBot({
            event: 'order-paid',
            chuviUserId: String(order.userId),
            amount: order.amount,
            orderId: String(order._id),
            oscNumber: order.oscNumber,
            reference,
        })

        // 🔔 Optional notification
        await createNotification({
            userId: order.userId,
            title: 'Payment Successful',
            body: 'Your order payment was successful and is being processed.',
            subBody:
                'Your order payment was successful and is being processed.',
            type: NOTIFICATION_TYPE.PAYMENT_APPROVED,
        })
    } catch (error) {
        console.error('Error in handleOrderPayment:', error)
        return
    }
}

async function handleWalletTopUp(metadata, reference, { paidNaira = null, payerId = null } = {}) {
    try {
        const { userId } = metadata

        if (!userId) {
            console.warn('User Id missing in metadata')
            return
        }
        // A top-up is for the person who paid. Metadata naming someone else is
        // not trusted (review F-35).
        if (payerId && String(payerId) !== String(userId)) {
            console.error(`Wallet top-up ${reference}: metadata user ${userId} is not the payer ${payerId} — not credited`)
            return
        }

        const user = await UserModel.findById(userId)
        if (!user) {
            console.warn(`User ${userId} not found`)
            return
        }

        // Credit what Paystack COLLECTED, never the metadata's figure (F-35).
        const amount = Number(paidNaira)
        if (!Number.isFinite(amount) || amount <= 0) {
            console.error(`Wallet top-up ${reference}: no collected amount — not credited`)
            return
        }

        // Credit the wallet (capture the result so we can report the new balance)
        const updatedWallet = await WalletModel.findOneAndUpdate(
            { userId },
            { $inc: { balance: amount } },
            { upsert: true, new: true },
        )
        await WalletTransactionModel.create({
            userId,
            type: 'credit',
            amount,
            status: 'success',
        })

        // 🔔 WhatsApp confirmation via chatbot
        await notifyBot({
            event: 'wallet-top-up',
            chuviUserId: String(userId),
            email: user.email,
            amount,
            balance: updatedWallet?.balance,
            reference: reference || metadata.reference,
        })

        // 🔔 In-app notification
        await createNotification({
            userId: userId,
            title: 'Wallet top up Successful',
            body: 'Your wallet top up is successful.',
            subBody: 'Your wallet top up is successful.',
            type: NOTIFICATION_TYPE.WALLET_TOP_UP,
        })
    } catch (error) {
        console.error('Error in handleWalletTopUp:', error)
        return
    }
}

// async function handleWalletTopUp(metadata) {
//     try {
//         const { userId } = metadata

//         if (!userId) {
//             console.warn('User Id missing in metadata')
//             return
//         }

//         const user = await UserModel.findById(userId)
//         if (!user) {
//             console.warn(`User ${userId} not found`)
//             return
//         }

//         // const wallet = await WalletModel.findOne({userId})

//         // if(wallet){
//         //   wallet.balance += metadata.amount / 100;
//         //   await wallet.save()
//         // }

//         // await WalletModel.findOneAndUpdate(
//         //   { userId },
//         //   { $set: { balance: metadata.amount / 100 } }, // Updates if exists
//         //   {
//         //     upsert: true, // Creates if doesn't exist
//         //     new: true     // Returns the updated document
//         //   }
//         // );

//         await WalletModel.findOneAndUpdate(
//             { userId },
//             { $inc: { balance: metadata.amount } },
//             { upsert: true, new: true },
//         )
//         await WalletTransactionModel.create({
//             userId,
//             type: 'credit',
//             amount: metadata.amount,
//             status: 'success',
//         })

//         // await PaymentModel.create({
//         //     userId: userId,
//         //     amount: metadata.amount / 100,
//         //     reference: metadata.reference,
//         //     status: 'pending',
//         //     type: 'wallet-top-up',
//         //     alertType: 'credit',
//         // })
//         await notifyBot({
//             event: 'wallet-top-up',
//             chuviUserId: String(userId),
//             email: user.email,
//             amount: metadata.amount,
//             balance: updatedWallet?.balance,
//             reference: reference || metadata.reference,
//         })

//         // 🔔 Optional notification
//         await createNotification({
//             userId: userId,
//             title: 'Wallet top up Successful',
//             body: 'Your wallet top up is successful.',
//             subBody: 'Your wallet top up is successful.',
//             type: NOTIFICATION_TYPE.WALLET_TOP_UP,
//         })
//     } catch (error) {
//         console.error('Error in handleOrderPayment:', error)
//         return
//     }
// }

function generateNextPaymentDate(duration, startDate = new Date()) {
    const next = new Date(startDate)

    if (duration === 'monthly') next.setMonth(next.getMonth() + 1)
    if (duration === 'yearly') next.setFullYear(next.getFullYear() + 1)

    return next.toISOString().replace('Z', '+00:00')
}

module.exports = {
    handleChargeSuccess,
    handlePaymentFailed,
    handleSubscriptionDisable,
    handleSubscriptionCreate,
    handleInvoiceFailed,
    handleChargeFailed,
}
