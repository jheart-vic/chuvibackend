const PlanModel = require('../models/plan.model')
const UserModel = require('../models/user.model')
const SubscriptionModel = require('../models/subscription.model')
const validateData = require('../util/validate')
const BaseService = require('./base.service')
const paystackAxios = require('./paystack.client.service')
const createAuditLog = require('../util/createAuditLog')
const { getObjectId } = require('../util/helper')
const { AUDIT_LOG_CATEGORIES } = require('../util/constants')
const { findUsableSubscription, PAYSTACK_STATUS_MAP, GRACE_MS, renewalFailedBanner } = require('../util/subscriptionAccess')

// Brief 2.5 — "cannot create plan" when the plan was actually created.
// createAuditLog RETHROWS, and every plan write logs AFTER the data is already
// saved, so any audit-log problem turned a completed action into a generic
// failure (and the retry then hit "Plan title already exists"). The audit trail
// must never be able to reverse the outcome the operator is shown.
// Shared with intake-user (3.1) and communication (4.1) via util/safeLog.js.
const { logSafely } = require('../util/safeLog')
const auditSafely = (payload) => logSafely('Audit log', createAuditLog(payload))

// Turn a Mongoose write error into a sentence that names the field, instead of
// the catch-all "Something went wrong" that hid 2.5 for so long.
const describeDbError = (error, fallback) => {
    if (error?.code === 11000) {
        const field = Object.keys(error.keyPattern || error.keyValue || {})[0]
        if (field === 'title') return 'Plan title already exists'
        return field
            ? `A plan with this ${field} already exists`
            : 'A plan with these details already exists'
    }
    if (error?.name === 'ValidationError') {
        const first = Object.values(error.errors || {})[0]
        if (first) {
            return first.kind === 'required'
                ? `${first.path} is required`
                : first.message
        }
    }
    if (error?.name === 'CastError' && error.path) {
        return `${error.path} must be a valid ${error.kind}`
    }
    return fallback
}

class SubscriptionService extends BaseService {
    async createPlan(req) {
        try {
            const post = req.body
            const userId = req.user.id

            const validateRule = {
                title: 'string|required',
                description: 'string|required',
                duration: 'string|required',
                price: 'integer|required',
                monthlyLimits: 'integer|required',
                features: 'array|required',
                // Required on the model, so leaving it out used to fail with the
                // generic server error instead of naming the missing field.
                paystackPlanCode: 'string|required',
                // NOT required: `itemPerMonth` is commented out on plan.model.js
                // (monthlyLimits replaced it), so demanding it made the screen
                // reject a plan over a field the backend then threw away.
                itemPerMonth: 'integer',
                freePickupDeliveryPerWeek: 'integer|min:0',
            }

            const validateMessage = {
                required: ':attribute is required',
                integer: ':attribute must be an integer.',
                array: ':attribute must be an array.',
                min: ':attribute cannot be negative.',
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

            const planExist = await PlanModel.findOne({
                title: { $regex: `^${post.title}$`, $options: 'i' },
            })

            if (planExist) {
                return BaseService.sendFailedResponse({
                    error: 'Plan title already exists',
                })
            }

            let newPlan
            try {
                newPlan = await PlanModel.create(post)
            } catch (error) {
                // The title index can also reject here (two admins, same title,
                // same moment) — the pre-check above is a read, not a lock.
                console.log('Create plan write failed:', error)
                return BaseService.sendFailedResponse({
                    error: describeDbError(error, 'Could not create the plan'),
                })
            }

            // Past this point the plan EXISTS. Nothing below may report failure.
            await auditSafely({
                userId: getObjectId(userId),
                action: `Created a new plan with title ${newPlan.title}`,
                category: AUDIT_LOG_CATEGORIES.SUBSCRIPTION,
            })

            return BaseService.sendSuccessResponse({
                message: 'Plan created successfully',
                data: newPlan,
            })
        } catch (error) {
            console.log('Error in:', error)
            return BaseService.sendFailedResponse({
                error: this.server_error_message,
            })
        }
    }

    async updatePlan(req) {
        try {
            const planId = req.params.id
            const post = req.body
            const userId = req.user.id

            const plan = await PlanModel.findById(planId)

            if (!plan) {
                return BaseService.sendFailedResponse({
                    error: 'Plan not found',
                })
            }

            let updatedPlan
            try {
                updatedPlan = await PlanModel.findByIdAndUpdate(planId, post, {
                    new: true,
                    // Without this an invalid edit (negative price, renaming a
                    // plan onto an existing title) saved silently or failed with
                    // the generic message.
                    runValidators: true,
                })
            } catch (error) {
                console.log('Update plan write failed:', error)
                return BaseService.sendFailedResponse({
                    error: describeDbError(error, 'Could not update the plan'),
                })
            }

            // The plan is already updated — an audit problem must not undo that.
            await auditSafely({
                userId: getObjectId(userId),
                category: AUDIT_LOG_CATEGORIES.SUBSCRIPTION,
                action: `Updated plan with title ${updatedPlan.title}`,
            })
            return BaseService.sendSuccessResponse({
                message: 'Plan updated successfully',
                // Returned so an edit screen can reload the authoritative row
                // instead of keeping whatever it had on screen.
                data: updatedPlan,
            })
        } catch (error) {
            console.log('Error in:', error)
            return BaseService.sendFailedResponse({
                error: this.server_error_message,
            })
        }
    }
    async deletePlan(req) {
        try {
            const planId = req.params.id
            const plan = await PlanModel.findById(planId)

            if (!plan) {
                return BaseService.sendFailedResponse({
                    error: 'Plan not found',
                })
            }

            await PlanModel.findByIdAndDelete(planId)
            // The plan is gone — an audit problem must not report a failure the
            // operator would act on by deleting again.
            await auditSafely({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.SUBSCRIPTION,
                action: `Deleted plan with title ${plan.title}`,
            })
            return BaseService.sendSuccessResponse({
                message: 'Plan deleted successfully',
            })
        } catch (error) {
            console.log('Error in:', error)
            return BaseService.sendFailedResponse({
                error: this.server_error_message,
            })
        }
    }
    async getPlans(req) {
        try {
            const plans = await PlanModel.find({})
            return BaseService.sendSuccessResponse({ message: plans })
        } catch (error) {
            console.log('Error in:', error)
            return BaseService.sendFailedResponse({
                error: this.server_error_message,
            })
        }
    }
    async getPlan(req) {
        try {
            const planId = req.params.id
            const plan = await PlanModel.findById(planId)

            if (!plan) {
                return BaseService.sendFailedResponse({
                    error: 'Plan not found',
                })
            }

            return BaseService.sendSuccessResponse({ message: plan })
        } catch (error) {
            console.log('Error in:', error)
            return BaseService.sendFailedResponse({
                error: this.server_error_message,
            })
        }
    }
    //subscription
    // Switched off (review F-45): it saved an ACTIVE subscription with the
    // plan's full allowance and no payment, so any signed-in customer could
    // book a month of laundry for nothing. A plan starts only through the
    // Paystack checkout (POST /user/initialize-payment, transactionType
    // `subscription`); the webhook creates the subscription once paid.
    async subscribePlan() {
        return BaseService.sendFailedResponse({
            error: 'Please subscribe to a plan through checkout.',
        })
    }
    async cancelSubscription(req) {
        try {
            const userId = req.user.id

            // A FAILED plan can be cancelled too (review F-94), so a customer
            // whose renewal failed can stop Paystack retrying the card.
            const subscription = await SubscriptionModel.findOne({
                userId: userId,
                status: { $in: ['active', 'failed'] },
            }).sort({ createdAt: -1 })

            if (!subscription) {
                return BaseService.sendFailedResponse({
                    error: 'No active subscription found',
                })
            }

            const sub_code = subscription.subscriptionCode
            const token = subscription.paystackEmailToken
            let subscriptionStatus = ''

            try {
                const response = await paystackAxios.get(
                    `/subscription/${sub_code}`,
                )
                const isSubActive = response.data.data.status

                subscriptionStatus = isSubActive

                // Review F-93: stop it on Paystack whenever Paystack would still
                // charge it — `active`, but also `attention` (a failed charge we
                // haven't heard about yet) — not only when it says `active`.
                if (!['cancelled', 'complete', 'completed', 'non-renewing'].includes(isSubActive)) {
                    const response = await paystackAxios.post(
                        '/subscription/disable',
                        {
                            code: sub_code,
                            token: token,
                        },
                    )
                }
            } catch (error) {
                // `error.response` is absent on a network/timeout failure, and
                // reading through it threw into the outer catch, which then said
                // "Failed to cancel plan" — the wrong reason entirely.
                const message = error?.response?.data?.message
                console.log(message || error?.message, 'error from paystack')
                return BaseService.sendFailedResponse({
                    error:
                        message ||
                        'Something went wrong disabling this subscription',
                })
            }

            // A failed plan stays `failed` (not usable): its leftovers still carry
            // if the customer re-subscribes to the same plan within 7 days of the
            // failure (review F-94); Paystack has now stopped retrying the card.
            if (subscription.status === 'failed') {
                await SubscriptionModel.updateOne({ _id: subscription._id }, { $set: { cancelledAt: new Date() } })
                await auditSafely({
                    userId: getObjectId(userId),
                    category: AUDIT_LOG_CATEGORIES.SUBSCRIPTION,
                    action: `Stopped failed subscription with code ${sub_code}`,
                })
                const keepBy = subscription.failedAt ? new Date(new Date(subscription.failedAt).getTime() + GRACE_MS) : null
                const left = Math.max(Number(subscription.remainingItems) || 0, 0)
                return BaseService.sendSuccessResponse({
                    message: keepBy && left > 0 && keepBy > new Date()
                        ? `Your plan is stopped, because the last renewal payment didn't go through. To keep your leftover items, subscribe to the same plan again by ${keepBy.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.`
                        : "Your plan is stopped, because the last renewal payment didn't go through.",
                    currentPeriodEnd: null,
                })
            }

            // Feature 21 (rule 4): keep the record. The plan stays usable until
            // the month the customer paid for ends; the nightly reconcile then
            // marks it expired with nothing carried.
            const paidUntil = subscription.currentPeriodEnd || subscription.nextPaymentDate || null
            await SubscriptionModel.updateOne(
                { _id: subscription._id },
                { $set: { status: 'cancelled', cancelledAt: new Date(), ...(paidUntil && { currentPeriodEnd: paidUntil }) } },
            )
            // Paystack has already been told; an audit problem must not report
            // this as a failed cancellation.
            await auditSafely({
                userId: getObjectId(userId),
                category: AUDIT_LOG_CATEGORIES.SUBSCRIPTION,
                action: `Cancelled subscription with code ${sub_code}`,
            })

            const until = paidUntil
                ? new Date(paidUntil).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
                : null
            return BaseService.sendSuccessResponse({
                message:
                    !['cancelled', 'complete', 'completed', 'non-renewing'].includes(subscriptionStatus)
                        ? `Your plan is cancelled. ${until ? `You can keep using your items until ${until}.` : 'You can keep using your items until your paid month ends.'}`
                        : 'You have already cancelled your subscription',
                currentPeriodEnd: paidUntil,
            })
        } catch (error) {
            console.error('Cancel subscription error:', error)
            return BaseService.sendFailedResponse({
                error: 'Failed to cancel the subscription',
            })
        }
    }
    async getCurrentSubscription(req) {
        try {
            const userId = req.user.id
            console.log(userId)

            const user = await UserModel.findById(userId)
            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            // Feature 21: the one usable-plan rule — active, or cancelled with
            // its paid month not over (the app shows "Cancelled — usable until").
            let subscription = await findUsableSubscription(userId, { populate: true })

            if (!subscription) {
                // Client 2026-10-14: a failed renewal shows a banner on My Plan —
                // "Your plan renewal didn't go through. Subscribe again by <date>
                // to keep your <X> unused items." — whose button opens the normal
                // checkout for the same plan (`renewalFailed.planId`).
                const failed = await SubscriptionModel.findOne({ userId, status: 'failed' })
                    .sort({ failedAt: -1 })
                    .populate('planId', 'monthlyLimits')
                    .lean()
                return BaseService.sendSuccessResponse({
                    message: 'No active subscription1',
                    subscription: null,
                    // The count is what re-subscribing keeps: capped at half the plan (F-100).
                    renewalFailed: renewalFailedBanner(failed, new Date(), failed?.planId?.monthlyLimits),
                })
            }

            let subscriptionList = []

            if (user.customerCode) {
                try {
                    const paystackSub = await paystackAxios.get(
                        `/customer/${user.customerCode}`,
                    )
                    subscriptionList = paystackSub.data.data.subscriptions || []
                } catch (error) {
                    console.log('Error from paystack customer check', error)

                    if (error.response?.status === 404) {
                        subscriptionList = []
                    } else {
                        return BaseService.sendFailedResponse({
                            error: 'Error occured in getting the subscription status',
                        })
                    }
                }
            }

            // ✅ Optimized: Parallel fetching instead of sequential loop

            if (subscriptionList.length) {
                const fetchedSubscriptions = await Promise.all(
                    subscriptionList.map(async (sub) => {
                        try {
                            const res = await paystackAxios.get(
                                `/subscription/${sub.subscription_code}`,
                            )
                            return res.data.data
                        } catch (err) {
                            console.log('Error fetching subscription:', err)
                            return null
                        }
                    }),
                )

                // Review F-99: after a same-plan re-subscribe the customer has TWO
                // Paystack subscriptions on that plan code (the old, switched-off
                // one and the new one), so the plan code alone isn't enough. Match
                // the record's own subscription code first; otherwise take the
                // newest one on that plan that Paystack hasn't ended.
                const ENDED = ['cancelled', 'complete', 'completed', 'non-renewing']
                const valid = fetchedSubscriptions.filter(Boolean)
                const matchedSub =
                    (subscription.subscriptionCode &&
                        valid.find((sub) => sub.subscription_code === subscription.subscriptionCode)) ||
                    valid
                        .filter((sub) => sub.plan?.plan_code === subscription.paystackSubscriptionId && !ENDED.includes(sub.status))
                        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] ||
                    null

                // A cancelled plan is non-renewing on Paystack but still usable
                // until its paid month ends (feature 21), so only an ACTIVE
                // record is refused when Paystack says it stopped.
                if (
                    matchedSub &&
                    subscription.status !== 'cancelled' &&
                    (PAYSTACK_STATUS_MAP[matchedSub.status] || matchedSub.status) !== 'active'
                ) {
                    return BaseService.sendFailedResponse({
                        error: 'Your subscription is no longer active, please subscribe again to continue enjoying our services',
                    })
                }

                if (matchedSub) {
                    if (!subscription.subscriptionCode) {
                        subscription.subscriptionCode =
                            matchedSub.subscription_code
                    }
                    if (!subscription.paystackSubscriptionId) {
                        subscription.nextPaymentDate =
                            matchedSub.next_payment_date
                    }
                    if (!subscription.paystackEmailToken) {
                        subscription.paystackEmailToken = matchedSub.email_token
                    }
                    // Mapped (feature 21): Paystack's `non-renewing` etc. are not in
                    // our enum, and a cancelled record stays cancelled.
                    if (subscription.status !== 'cancelled') {
                        subscription.status = PAYSTACK_STATUS_MAP[matchedSub.status] || subscription.status
                    }

                    await subscription.save() // ✅ single save
                    subscription = subscription.toObject()
                }
                //  else {
                //   return BaseService.sendFailedResponse({
                //     error:
                //       "Your subscription is no longer active, please subscribe again to continue enjoying our services",
                //   });
                // }
            }
            // else{
            //   // await SubscriptionModel.findByIdAndDelete(subscription._id);
            //   // return BaseService.sendSuccessResponse({
            //   //     message: "Your subscription is no longer active, please subscribe again to continue enjoying our services",
            //   //     subscription,
            //   //   });
            // }

            return BaseService.sendSuccessResponse({
                message: 'Subscription state retrieved successfully',
                subscription,
            })
        } catch (error) {
            console.log('Error in:', error)
            return BaseService.sendFailedResponse({
                error: this.server_error_message,
            })
        }
    }

    async seedPlans(req) {
        try {
            const plans = [
                {
                    title: 'Student plan',
                    description:
                        'Perfect for students who want affordable stress-free laundry every week.',
                    duration: 'monthly',
                    price: 12000,
                    monthlyLimits: 28,
                    interval: 'monthly',
                    paystackPlanCode: 'PLN_ji8eaz56uuog89e',
                    features: [
                        '28 - 48 hours turnaround',
                        'Up to 1 items washed and folded',
                        'Eco-friendly detergents',
                        'Neatly folder and packaged',
                    ],
                },
                {
                    title: 'Standard plan',
                    description:
                        'Perfect for individuals and small households who need consistent laundary care.',
                    duration: 'monthly',
                    price: 18000,
                    monthlyLimits: 40,
                    interval: 'monthly',
                    paystackPlanCode: 'PLN_oj8mwjwivp0txhe',
                    features: [
                        'Wash, fold and basic ironing',
                        'Fresh scent and stain care',
                        'Flexible pickup times',
                        'Weekly pickup and delivery',
                    ],
                },
                {
                    title: 'Premium plan',
                    description:
                        'Great for professional, couples and families who want maximum convenience.',
                    duration: 'monthly',
                    price: 12000,
                    monthlyLimits: 60,
                    interval: 'monthly',
                    paystackPlanCode: 'PLN_ai0qlsa3hnrajzc',
                    features: [
                        'Full wash and iron service',
                        'Express service on request',
                        'Priority packaging and handling',
                        'Free hanger and delivery shirts',
                    ],
                },
                {
                    title: 'VIP plan',
                    description:
                        'ideal for executives, large families and customers wh want full premium care.',
                    duration: 'monthly',
                    price: 18000,
                    monthlyLimits: 100,
                    interval: 'monthly',
                    paystackPlanCode: 'PLN_hds1da4kwf6fhct',
                    features: [
                        'Flexible unlimited pickups (for very high item limit)',
                        'Premium wash and iron for all items',
                        'Same-day or next-day delivery',
                        'Special handling for delicate fabrics',
                    ],
                },
            ]

            // Prevent duplicates
            for (const plan of plans) {
                await PlanModel.updateOne(
                    { title: plan.title },
                    { $setOnInsert: plan },
                    { upsert: true },
                )
            }

            return BaseService.sendSuccessResponse({
                success: true,
                message: 'Plans seeded successfully',
            })
        } catch (error) {
            return BaseService.sendFailedResponse({
                error: 'Failed to seed plans',
            })
        }
    }
}

module.exports = SubscriptionService
