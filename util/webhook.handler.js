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
const sendEmail = require('./emailService')
const { markProductionClearedIfReady } = require('./productionClock')
const { carriedItems, renewalFailedSms, PAYSTACK_STATUS_MAP } = require('./subscriptionAccess')
const sendSms = require('./sendSms')

// Subscriber loyalty rewards (client confirmed 2026-08-29): payment NEVER changes
// (same price, same monthly schedule) — only that month's ITEM BUNDLE grows, scaled
// to plan size and ALWAYS rounded down:
//   month 3  → +25% of the monthly item bundle
//   month 6  → +50% of the monthly item bundle
//   month 12 → +100% of the monthly item bundle (double)
// (The earlier "free month by moving the billing period" idea was dropped — no
// Paystack interaction; this is purely extra items for that cycle.)
// Mutates `subscription` (caller saves) and returns the bonus added (0 if none).
// loyaltyRewardsApplied guards double-apply. The customer is told only by
// notifySubscriberLoyalty, AFTER the save succeeds (review F-48).
const LOYALTY_BONUS_PCT = { 3: 0.25, 6: 0.5, 12: 1.0 }

function applySubscriberLoyalty(subscription, plan, month) {
    if (!plan || !Number.isFinite(plan.monthlyLimits)) return 0
    const pct = LOYALTY_BONUS_PCT[month]
    if (!pct) return 0
    const already = subscription.loyaltyRewardsApplied || []
    if (already.includes(month)) return 0

    const bonus = Math.floor(plan.monthlyLimits * pct)
    subscription.remainingItems = (subscription.remainingItems || 0) + bonus
    subscription.loyaltyRewardsApplied = [...already, month]
    return bonus
}

// Never throws: the renewal is already saved, so a failed notice must not be
// reported as an unapplied renewal.
async function notifySubscriberLoyalty(subscription, month, bonus) {
    if (!subscription.userId || !(bonus > 0)) return
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

        // ♻️ RENEWAL (review F-40). Paystack creates each recurring charge
        // itself, so there is no checkout row of ours and usually no custom
        // metadata. It is identified by Paystack's own subscription code
        // (part of the signed event) matched to OUR subscription for this
        // payer — never by anything the payer could have typed.
        if (data.subscription?.subscription_code && !(await PaymentModel.exists({ reference }))) {
            await handleRenewal(data, user, reference)
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
        // (A row merely marked `failed` by a charge.failed event is still a real
        // checkout — a retry on it is honoured; only one Paystack REFUSED at
        // initialisation is not, review F-44.)
        const mismatch =
            existing.metadata?.initRefused === true
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

        // A first subscription charge activates only the plan this checkout
        // was opened for, and only when the money covers what the checkout
        // ASKED for (the plan price at that moment, not a later edit). Checked
        // BEFORE the claim, so a refusal leaves the row pending for an admin
        // to settle rather than recording money against nothing (F-38, F-42).
        let verifiedPlan = null
        if (metadata.transactionType === 'subscription' && !data.subscription) {
            const planId = expectedPlanId || metadata.planId
            const plan = planId ? await PlanModel.findById(planId).lean() : null
            const planMismatch =
                expectedPlanId && metadata.planId && String(expectedPlanId) !== String(metadata.planId)
            const price =
                Number.isFinite(expected) && expected > 0 ? expected : Number(plan?.price || 0)
            if (!plan || planMismatch || collected + 0.5 < price) {
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
            verifiedPlan = plan
        }

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
                // Verified above, before the claim (F-38/F-42); the plan
                // activated is the verified one, not the event's (F-43).
                await handleNormalSubscription(data, user, verifiedPlan)
                return
            }

            // ♻️ RECURRING RENEWAL that came through one of our checkout rows
            // (already claimed above).
            await handleRenewal(data, user, reference, { claimed: true })
            return
        }
    } catch (error) {
        console.error('Error in handleChargeSuccess:', error)
    }
}

/**
 * A subscription renewal charge (review F-40). Identified by Paystack's
 * subscription code from the signed event, matched to OUR subscription for
 * this payer. The reference is claimed atomically (a Payment row with a unique
 * reference), so a repeated event renews once.
 */
async function handleRenewal(data, user, reference, { claimed = false } = {}) {
    const subscriptionCode = data.subscription?.subscription_code
    let rowWritten = claimed
    try {
        let subscription = await SubscriptionModel.findOne({ subscriptionCode })
        // Risk fix B (2026-10-14): a code we don't know may belong to the
        // customer's own plan whose code never arrived (subscription.create came
        // before charge.success). If exactly ONE of this customer's plans has no
        // code yet — and, when Paystack names the plan, it's that plan — adopt
        // the code and apply the renewal instead of reporting it unapplied.
        if (!subscription && subscriptionCode) {
            const planCode = data.plan?.plan_code
            const candidates = await SubscriptionModel.find({
                userId: user._id,
                subscriptionCode: { $in: [null, ''] },
                status: { $in: ['active', 'cancelled', 'failed'] },
                ...(planCode && { paystackSubscriptionId: planCode }),
            }).select('_id').lean()
            if (candidates.length === 1) {
                const adopted = await SubscriptionModel.updateOne(
                    { _id: candidates[0]._id, subscriptionCode: { $in: [null, ''] } },
                    { $set: { subscriptionCode } },
                )
                if (adopted.modifiedCount) subscription = await SubscriptionModel.findById(candidates[0]._id)
            }
        }
        if (!subscription) {
            await reportUnappliedRenewal(data, user, reference, 'no subscription of ours has this Paystack code', { rowWritten })
            return
        }
        if (String(subscription.userId) !== String(user._id)) {
            await reportUnappliedRenewal(data, user, reference, 'the subscription with this Paystack code belongs to another customer', { rowWritten })
            return
        }
        // Review F-90: a plan that was replaced or ended is never revived by a
        // late charge on its old Paystack subscription — that would leave the
        // customer with two active plans. The money is reported for an admin.
        if (subscription.status === 'expired') {
            await reportUnappliedRenewal(data, user, reference, 'the plan was already replaced or had expired', { rowWritten })
            return
        }

        if (!claimed) {
            try {
                await PaymentModel.create({
                    userId: user._id,
                    reference,
                    amount: Number(data.amount) / 100,
                    status: 'success',
                    type: 'subscription',
                    subscription: subscription._id,
                    paidAt: new Date(data.paid_at),
                    channel: data.channel,
                    metadata: { renewal: true, subscriptionCode },
                })
                rowWritten = true
            } catch (err) {
                if (err?.code === 11000) {
                    console.log('Renewal already applied:', reference)
                    return
                }
                throw err
            }
        }

        const plan = await PlanModel.findById(subscription.planId)

        // Feature 21 (client rules 2026-10-11): carry the items left over,
        // capped at half the plan (rounded down) — or nothing if a failed
        // renewal is paid more than a week after it failed. Worked out from the
        // status BEFORE it is set back to active, and BEFORE the loyalty bonus,
        // so the cap never cuts the bonus.
        const carried =
            plan?.monthlyLimits != null
                ? carriedItems({
                    remainingItems: subscription.remainingItems,
                    monthlyLimits: plan.monthlyLimits,
                    status: subscription.status,
                    failedAt: subscription.failedAt,
                    paidAt: data.paid_at,
                })
                : 0

        subscription.status = 'active'
        subscription.failedAt = undefined
        subscription.renewalReminderSentAt = undefined
        subscription.lastPaymentAt = new Date(data.paid_at)
        if (data.subscription.next_payment_date) {
            subscription.nextPaymentDate = new Date(data.subscription.next_payment_date)
            // The paid month now runs to the next payment date: a cancelled
            // plan stays usable until then (feature 21, rule 4).
            subscription.currentPeriodEnd = subscription.nextPaymentDate
        }
        if (plan?.monthlyLimits != null) {
            // fresh month, plus what carried over
            subscription.remainingItems = plan.monthlyLimits + carried
            subscription.rolledOverItems = carried
        }
        // Subscriber loyalty: this renewal is one more consecutive month.
        subscription.consecutiveMonths = (subscription.consecutiveMonths || 0) + 1
        const loyaltyBonus = applySubscriberLoyalty(subscription, plan, subscription.consecutiveMonths)
        await subscription.save()
        await notifySubscriberLoyalty(subscription, subscription.consecutiveMonths, loyaltyBonus)

        // 🔔 Tell the customer their renewal went through. The renewal is
        // already applied, so a failed push must not be reported as unapplied.
        await notifyBot({
            event: 'subscription-active',
            chuviUserId: String(user._id),
            email: user.email,
            planName: plan?.name,
            amount: plan?.price,
        }).catch((err) => console.error('renewal notify failed:', err?.message))
    } catch (error) {
        console.error('Error in handleRenewal:', error)
        await reportUnappliedRenewal(data, user, reference, 'updating the plan failed', { rowWritten })
    }
}

/**
 * Paystack took a renewal payment we could not apply (review F-46). The money
 * is recorded (once per reference) as unapplied, an admin is alerted to fix the
 * plan by hand, and the customer is told the payment arrived and is being
 * confirmed — never that the plan renewed. Never throws.
 */
async function reportUnappliedRenewal(data, user, reference, reason, { rowWritten = false } = {}) {
    const subscriptionCode = data.subscription?.subscription_code
    const paid = Number(data.amount) / 100
    console.error(`Renewal ${reference} not applied (${reason})`)
    try {
        if (rowWritten) {
            await PaymentModel.updateOne(
                { reference },
                { $set: { 'metadata.renewal': true, 'metadata.unapplied': true, 'metadata.unappliedReason': reason } },
            )
        } else {
            try {
                await PaymentModel.create({
                    userId: user._id,
                    reference,
                    amount: paid,
                    status: 'success',
                    type: 'subscription',
                    paidAt: new Date(data.paid_at),
                    channel: data.channel,
                    metadata: { renewal: true, unapplied: true, unappliedReason: reason, subscriptionCode },
                })
            } catch (err) {
                // Already recorded: this event was reported before.
                if (err?.code === 11000) return
                throw err
            }
        }
    } catch (err) {
        console.error('unapplied renewal record failed:', err?.message)
    }

    try {
        const { notifyRoles } = require('./notifyRoles')
        const { ROLE } = require('./constants')
        await notifyRoles({
            roles: [ROLE.ADMIN],
            title: 'Plan renewal payment not applied',
            body: `Paystack took a plan renewal payment of ₦${paid.toLocaleString('en-NG')} (reference ${reference}, subscription ${subscriptionCode}) from ${user.email}, but ${reason}, so the plan was not renewed. Update the customer's plan by hand.`,
            type: NOTIFICATION_TYPE.SYSTEM,
        })
    } catch (err) {
        console.error('unapplied renewal alert failed:', err?.message)
    }

    try {
        await createNotification({
            userId: user._id,
            title: 'Plan renewal payment received',
            body: `We've received your plan renewal payment of ₦${paid.toLocaleString('en-NG')} and our team is confirming it. Your plan will be updated shortly.`,
            subBody: 'Plan renewal',
            type: NOTIFICATION_TYPE.PAYMENT_UPDATE,
        })
    } catch (err) {
        console.error('unapplied renewal customer notice failed:', err?.message)
    }
}

async function handleChargeFailed(data) {
    try {
        const reference = data.reference
        const reason = data.gateway_response || 'The payment was not completed'

        // Mark OUR pending card checkout as failed. Only `pending` → `failed`,
        // so a resent event finds nothing and the customer is told once; a
        // bank-transfer proof awaiting approval is never a card checkout. A
        // failed row still accepts a paid retry (F-44).
        const payment = await PaymentModel.findOneAndUpdate(
            { reference, status: 'pending', paymentMethod: { $ne: 'bank-transfer' } },
            { status: 'failed' },
            { new: true },
        )

        // Only a checkout WE started is reported, and only to the customer on
        // our row: the event's metadata is whatever the checkout was opened
        // with, so it could name someone else (review F-49).
        if (!payment) return

        // 🔔 Tell the customer on WhatsApp (fire-and-forget)
        await notifyBot({
            event: 'payment-failed',
            chuviUserId: String(payment.userId),
            reason,
            reference,
            ...(payment.order && { orderId: String(payment.order) }),
        })

        // …and in the app and by email. A payment message, so it goes now,
        // outside the follow-up send windows. Each step is non-fatal.
        await notifyPaymentFailed(payment, data, reason)
    } catch (error) {
        console.error('Error in handleChargeFailed:', error)
        return
    }
}

/**
 * In-app notice + email for a failed card payment on OUR checkout row. The
 * customer and the order come from our row, never the event. Never throws.
 */
async function notifyPaymentFailed(payment, data, reason) {
    try {
        const user = await UserModel.findById(payment.userId).select('email fullName').lean()
        const amount = Number(data.amount) > 0 ? Number(data.amount) / 100 : Number(payment.metadata?.expectedAmount) || 0
        let what = 'your payment'
        if (payment.type === 'order' && payment.order) {
            const order = await BookOrderModel.findById(payment.order).select('oscNumber').lean()
            what = order?.oscNumber ? `your payment for order ${order.oscNumber}` : 'your order payment'
        } else if (payment.type === 'wallet-top-up') {
            what = 'your wallet top-up'
        } else if (payment.type === 'subscription') {
            what = 'your plan payment'
        }
        const naira = amount > 0 ? ` of ₦${amount.toLocaleString('en-NG')}` : ''
        const text = `We couldn't complete ${what}${naira} (${reason}). Please try again from the app, or choose another payment method.`

        try {
            await createNotification({
                userId: payment.userId,
                title: 'Payment not completed',
                body: text,
                subBody: `Reference ${payment.reference}`,
                type: NOTIFICATION_TYPE.PAYMENT_UPDATE,
            })
        } catch (err) {
            console.error('payment-failed notice failed:', err?.message)
        }

        if (user?.email) {
            const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
            await sendEmail({
                to: user.email,
                subject: 'Your Chuvi Laundry payment was not completed',
                html: `<p>Hi ${esc(user.fullName || 'there')},</p><p>${esc(text)}</p><p>Reference: ${esc(payment.reference)}</p><p>Chuvi Laundry</p>`,
            })
        }
    } catch (err) {
        console.error('payment-failed customer messages failed:', err?.message)
    }
}

async function handlePaymentFailed(data) {
    try {
        if (!data.subscription) return

        // A missed payment breaks the consecutive-month loyalty streak. Never
        // on an expired (replaced) plan (review F-97).
        const touched = await SubscriptionModel.findOneAndUpdate(
            { subscriptionCode: data.subscription.subscription_code, status: { $ne: 'expired' } },
            { status: 'failed', consecutiveMonths: 0, loyaltyRewardsApplied: [] },
        )
        if (touched) await markFirstFailure(data.subscription.subscription_code)
    } catch (error) {
        console.error('Error in handlePaymentFailed:', error)
        return
    }
}

// Feature 21 (rule 6): a plan change starts fresh. When a plan activates, the
// customer's OTHER plan (e.g. the one they cancelled to "upgrade") is closed
// with nothing carried, so exactly one plan is usable.
async function closeOtherPlans(userId, keepId) {
    const others = await SubscriptionModel.find({
        userId, _id: { $ne: keepId }, status: { $in: ['active', 'cancelled', 'failed'] },
    }).select('subscriptionCode paystackEmailToken status').lean()
    if (!others.length) return
    // Closed HERE first (review F-98), so a slow Paystack can't leave two
    // usable plans. `expiryReminderSentAt` set so the "your plan expired,
    // renew" email never goes to a customer who just changed plan (F-91).
    await SubscriptionModel.updateMany(
        { _id: { $in: others.map((o) => o._id) } },
        { $set: { status: 'expired', remainingItems: 0, expiryReminderSentAt: new Date() } },
    )
    // Review F-90: then stop each old plan ON PAYSTACK, or it would keep
    // charging the card. This only runs after the NEW payment succeeded (the
    // charge.success path, client correction 2026-10-14). Best effort, 10 s per
    // call: a Paystack hiccup is logged and never undoes the new plan; a late
    // charge on the old one is refused by handleRenewal.
    const paystackAxios = require('../services/paystack.client.service')
    for (const o of others) {
        if (!o.subscriptionCode || o.status === 'cancelled') continue
        try {
            const res = await paystackAxios.get(`/subscription/${o.subscriptionCode}`, { timeout: 10000 })
            const ps = res.data?.data
            if (ps && !['cancelled', 'complete', 'completed', 'non-renewing'].includes(ps.status)) {
                await paystackAxios.post('/subscription/disable', {
                    code: o.subscriptionCode,
                    token: o.paystackEmailToken || ps.email_token,
                }, { timeout: 10000 })
            }
        } catch (err) {
            console.error(`Could not disable replaced plan ${o._id} on Paystack:`, err?.response?.data?.message || err?.message)
            // Risk fix C (2026-10-14): the nightly reconcile retries until
            // Paystack confirms the old plan is stopped.
            await SubscriptionModel.updateOne({ _id: o._id }, { $set: { paystackDisablePending: true } }).catch(() => {})
        }
    }
}

// Risk fix A (2026-10-14): Paystack can send `subscription.create` (which carries
// the new plan's Paystack code) BEFORE the payment's `charge.success`, when our
// record doesn't exist yet — so nothing stored the code and the first renewal
// was reported unapplied. When a plan activates without a code, ask Paystack
// for the customer's subscriptions and take the newest one on this plan that
// hasn't ended and isn't already on another of our records. Best effort, 10 s
// per call; renewal adoption (fix B) is the safety net.
async function attachPaystackCode(subscriptionId, user, planCode, customerCode) {
    try {
        const sub = await SubscriptionModel.findById(subscriptionId).select('subscriptionCode').lean()
        if (!sub || sub.subscriptionCode || !planCode) return
        const code = customerCode || user.customerCode
        if (!code) return
        const paystackAxios = require('../services/paystack.client.service')
        const cust = await paystackAxios.get(`/customer/${code}`, { timeout: 10000 })
        const codes = (cust.data?.data?.subscriptions || []).map((s) => s.subscription_code).filter(Boolean)
        if (!codes.length) return
        const taken = new Set(
            (await SubscriptionModel.find({ subscriptionCode: { $in: codes } }).select('subscriptionCode').lean())
                .map((r) => r.subscriptionCode),
        )
        const ENDED = ['cancelled', 'complete', 'completed', 'non-renewing']
        const found = []
        for (const c of codes) {
            if (taken.has(c)) continue
            try {
                const r = await paystackAxios.get(`/subscription/${c}`, { timeout: 10000 })
                const ps = r.data?.data
                if (ps && ps.plan?.plan_code === planCode && !ENDED.includes(ps.status)) found.push(ps)
            } catch (err) {
                console.error(`attachPaystackCode: could not read ${c}:`, err?.message)
            }
        }
        const best = found.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0]
        if (!best) return
        await SubscriptionModel.updateOne(
            { _id: subscriptionId, subscriptionCode: { $in: [null, ''] } },
            {
                $set: {
                    subscriptionCode: best.subscription_code,
                    ...(best.email_token && { paystackEmailToken: best.email_token }),
                    ...(best.next_payment_date && { nextPaymentDate: new Date(best.next_payment_date) }),
                },
            },
        )
    } catch (err) {
        console.error('attachPaystackCode failed:', err?.response?.data?.message || err?.message)
    }
}

// Feature 21 (rule 3): the failed-payment week counts from the FIRST failed
// payment, so a later retry failing again doesn't restart it.
async function markFirstFailure(subscriptionCode) {
    const res = await SubscriptionModel.updateOne(
        { subscriptionCode, status: 'failed', failedAt: null },
        { $set: { failedAt: new Date() } },
    )
    // Client 2026-10-14: tell the customer the moment a renewal fails, by SMS,
    // once per failure (a later retry failing again sends nothing). Never fails
    // the webhook.
    if (res.modifiedCount) {
        try {
            const sub = await SubscriptionModel.findOne({ subscriptionCode }).lean()
            const owner = sub && (await UserModel.findById(sub.userId).select('phoneNumber').lean())
            // The number they'd keep: unused, capped at half the plan (F-100).
            const plan = sub && (await PlanModel.findById(sub.planId).select('monthlyLimits').lean())
            if (owner?.phoneNumber) await sendSms(owner.phoneNumber, renewalFailedSms(sub, plan?.monthlyLimits))
        } catch (err) {
            console.error('renewal-failed SMS failed:', err?.message)
        }
    }
}

async function handleSubscriptionDisable(data) {
    try {
        // Feature 21 (rule 4): never delete. A disabled active plan is
        // cancelled but stays usable until its paid month ends; a failed one
        // keeps `failed`, so its one-week grace still applies.
        const sub = await SubscriptionModel.findOne({ subscriptionCode: data.subscription_code, status: 'active' })
        if (sub) {
            sub.status = 'cancelled'
            sub.cancelledAt = new Date()
            if (!sub.currentPeriodEnd && sub.nextPaymentDate) sub.currentPeriodEnd = sub.nextPaymentDate
            await sub.save()
        }
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
            // Review F-90: the new Paystack code belongs on the NEW plan, never on
            // an old failed/expired record (that revived it and lost the old code
            // we need to switch it off).
            status: { $nin: ['failed', 'expired'] },
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
            // `||`, not `|`: the bitwise OR stored the number 0, so cancel had no
            // email token to switch the plan off on Paystack with.
            subscription.paystackEmailToken = data.email_token || ''
            // Mapped: Paystack's own statuses aren't all in our enum (feature 21).
            subscription.status = PAYSTACK_STATUS_MAP[data.status] || 'active'
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

        // A missed payment breaks the consecutive-month loyalty streak (the
        // model's rule). `handlePaymentFailed` carried that reset but no webhook
        // event reaches it; this is the handler Paystack's failure calls.
        // Review F-97: a replaced or ended (`expired`) plan is never turned back
        // into `failed` — its customer may already be on a new plan.
        const touched = await SubscriptionModel.findOneAndUpdate(
            { subscriptionCode: data.subscription.subscription_code, status: { $ne: 'expired' } },
            { status: 'failed', consecutiveMonths: 0, loyaltyRewardsApplied: [] },
        )
        if (!touched) return
        await markFirstFailure(data.subscription.subscription_code)

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

// `verifiedPlan`: the plan handleChargeSuccess checked against our checkout and
// the money collected. It — not the event's metadata — decides the plan and its
// limits (review F-43).
async function handleNormalSubscription(data, _user = null, verifiedPlan = null) {
    try {
        const email = data.customer.email
        const planCode = data.plan?.plan_code
        const authorizationCode = data.authorization?.authorization_code

        const user = await UserModel.findOne({ email })

        if (!user) {
            console.warn(
                'User not found for subscription.create, cannot create subscription',
                data.customer.email,
            )
            return
        }

        // F-47: the schema field is `userId`. Filtering on `user` (not in the
        // schema) never matched, so every first charge created a new document
        // and a re-subscriber could hold two. Re-subscribe rules: launch item 9.
        const filter = {
            userId: user._id,
            paystackSubscriptionId: planCode,
            paystackAuthorizationToken: authorizationCode,
            // Review F-90: never reuse a FAILED or EXPIRED record. A re-subscribe
            // to the same plan with the same card would otherwise take over the
            // failed record, its old Paystack subscription would never be
            // switched off, and the customer would be billed twice. A new record
            // is created instead, and closeOtherPlans switches the old one off.
            status: { $nin: ['failed', 'expired'] },
        }

        let subscription = await SubscriptionModel.findOne(filter)
        console.log(
            { paystackSubscriptionCode: planCode, subscription },
            'handleNormalSubscription',
        )

        const plan = verifiedPlan
        if (!plan) {
            console.warn('No verified plan for this subscription payment, cannot activate')
            return
        }
        const planId = plan._id
        const paystackId = plan.paystackPlanCode || null

        // Review F-94 (user decision 2026-10-14): a failed renewal is paid by
        // RE-SUBSCRIBING to the same plan. Within 7 days of the failure the
        // leftover items still carry over (capped at half, rule 1); later, or
        // on a different plan, it starts fresh (rules 3 and 6).
        const prevFailed = await SubscriptionModel.findOne({ userId: user._id, planId, status: 'failed' })
            .sort({ failedAt: -1 })
            .lean()
        const carried = prevFailed
            ? carriedItems({
                remainingItems: prevFailed.remainingItems,
                monthlyLimits: plan.monthlyLimits,
                status: 'failed',
                failedAt: prevFailed.failedAt,
                paidAt: data.paid_at,
            })
            : 0

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
                // plus what a failed same-plan renewal carries (F-94)
                remainingItems: plan.monthlyLimits + carried,
                rolledOverItems: carried,
                // first paid month starts the loyalty streak
                consecutiveMonths: 1,
                loyaltyRewardsApplied: [],
                // seed the weekly pickup/delivery allowance + week anchor
                remainingPickupDeliveries: plan.freePickupDeliveryPerWeek || 0,
                logisticsWeekStart: new Date(data.paid_at),
            })
            await closeOtherPlans(user._id, subscription._id)
            await attachPaystackCode(subscription._id, user, planCode || plan.paystackPlanCode, data.customer?.customer_code)

            return
        } else {
            subscription.status = 'active'
            subscription.email = email
            subscription.paystackSubscriptionId = paystackId
            subscription.startDate = new Date(data.paid_at)
            subscription.planId = planId
            subscription.monthlyLimits = plan.monthlyLimits
            // a (re)subscription starts with the plan's full allowance, plus
            // what a failed same-plan renewal carries within its week (F-94)
            subscription.remainingItems = plan.monthlyLimits + carried
            subscription.userId = user._id
            subscription.lastPaymentAt = new Date(data.paid_at)
            // (re)subscribing restarts the consecutive-month loyalty streak
            subscription.consecutiveMonths = 1
            subscription.loyaltyRewardsApplied = []
            // re-anchor the weekly logistics allowance
            subscription.remainingPickupDeliveries =
                plan.freePickupDeliveryPerWeek || 0
            subscription.logisticsWeekStart = new Date(data.paid_at)
            // Feature 21: a (re)subscription is a fresh paid month — no leftover
            // failure or cancellation (only the F-94 carry above).
            const nextPaymentDate = generateNextPaymentDate('monthly')
            subscription.currentPeriodEnd = nextPaymentDate
            subscription.nextPaymentDate = nextPaymentDate
            subscription.rolledOverItems = carried
            subscription.failedAt = undefined
            subscription.renewalReminderSentAt = undefined
            subscription.cancelledAt = undefined
            await subscription.save()
            await closeOtherPlans(user._id, subscription._id)
            await attachPaystackCode(subscription._id, user, planCode || plan.paystackPlanCode, data.customer?.customer_code)
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
        // Launch item 4: a paid Urgent pickup now alerts Intake and goes to the
        // top of the pickup list (once; never for an abandoned checkout).
        await require('./urgentPickup').markUrgentPickupIfReady(order)
        // V1 launch batch 1: the booking is confirmed now that it is paid
        // (sent once; a Quick Booking already had it at booking).
        await require('./orderSms').bookingReceived(order)
        // V1 batch 2: a redelivery fee in this balance is now paid.
        await require('./redeliveryFee').markRedeliveryFeesPaid(order._id).catch(() => {})
        // V1 batch 2 (R21): paid after the pay-by time → a new ready date.
        await require('./readyDateRecalc').afterQuickBookingPaid(order._id)

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
