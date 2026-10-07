const PlanModel = require('../models/plan.model')
const UserModel = require('../models/user.model')
const SubscriptionModel = require('../models/subscription.model')
const validateData = require('../util/validate')
const BaseService = require('./base.service')
const paystackAxios = require('./paystack.client.service')
const createAuditLog = require('../util/createAuditLog')
const { getObjectId } = require('../util/helper')
const { AUDIT_LOG_CATEGORIES } = require('../util/constants')

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
    async subscribePlan(req) {
        const userId = req.user.id
        const planId = req.body.planId
        if (!planId) {
            return BaseService.sendFailedResponse({
                error: 'Please provide a plan id',
            })
        }
        const plan = await PlanModel.findById(planId)
        const user = await UserModel.findById(userId)

        if (!plan) {
            return BaseService.sendFailedResponse({ error: 'Plan not found' })
        }

        if (!user) {
            return BaseService.sendFailedResponse({ error: 'User not found' })
        }

        const subscription = new SubscriptionModel({
            userId: userId,
            planId: planId,
            email: user.email,
            remainingItems: plan.monthlyLimits,
            remainingPickupDeliveries: plan.freePickupDeliveryPerWeek || 0,
            logisticsWeekStart: new Date(),

            startDate: new Date(),
            // expiresAt: addMonths(new Date(), 1),
        })

        await subscription.save()
        return BaseService.sendSuccessResponse(subscription)
    }
    async cancelSubscription(req) {
        try {
            const userId = req.user.id

            const subscription = await SubscriptionModel.findOne({
                userId: userId,
                status: 'active',
            })

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

                if (isSubActive == 'active') {
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

            await SubscriptionModel.findByIdAndDelete(subscription._id)
            // Paystack has already been told and the record is gone; an audit
            // problem must not report this as a failed cancellation.
            await auditSafely({
                userId: getObjectId(userId),
                category: AUDIT_LOG_CATEGORIES.SUBSCRIPTION,
                action: `Cancelled subscription with code ${sub_code}`,
            })

            return BaseService.sendSuccessResponse({
                message:
                    subscriptionStatus === 'active'
                        ? 'Subscription cancelled Successfully'
                        : 'You have already cancelled your subscription',
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

            const filter = {
                userId: userId,
                status: 'active',
                $or: [
                    { currentPeriodEnd: { $gt: new Date() } },
                    { currentPeriodEnd: { $exists: false } },
                ],
            }

            let subscription =
                await SubscriptionModel.findOne(filter).populate('planId')

            if (!subscription) {
                return BaseService.sendSuccessResponse({
                    message: 'No active subscription1',
                    subscription: null,
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

                const matchedSub = fetchedSubscriptions.find(
                    (sub) =>
                        sub &&
                        sub.plan?.plan_code ===
                            subscription.paystackSubscriptionId,
                )

                if (matchedSub && matchedSub.status !== 'active') {
                    // await SubscriptionModel.findByIdAndDelete(subscription._id);
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
                    subscription.status = matchedSub.status

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
