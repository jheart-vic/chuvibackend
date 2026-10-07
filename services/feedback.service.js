const BaseService = require('./base.service')
const validateData = require('../util/validate')
const FeedbackModel = require('../models/feedback.model')
const BookOrderModel = require('../models/bookOrder.model')
const CrmProfileModel = require('../models/crmProfile.model')
const CrmSettingModel = require('../models/crmSetting.model')
const RecoveryService = require('./recovery.service')
const paginate = require('../util/paginate')
const { getObjectId } = require('../util/helper')
const {
    FEEDBACK_TYPE,
    FEEDBACK_STATUS,
    ORDER_STATUS,
} = require('../util/constants')

// §2 N2: the exact wording the client specified for the recommend question.
const NPS_QUESTION = 'How likely are you to recommend CHUVI to a friend?'
const NPS_FALLBACK_INTERVAL_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

// Customer-facing feedback surface. The Feedback Page posts here after a
// delivered order. "Satisfied" completes and opens the door to referrals;
// "complaint" spawns a ComplaintCase via the recovery engine.
class FeedbackService extends BaseService {
    // How many days must pass before the same customer sees the NPS question
    // again. Admin-editable like every other CRM cadence; falls back to the
    // brief's 30 if the settings document has not been seeded.
    async _npsIntervalDays() {
        try {
            const setting = await CrmSettingModel.findOne()
                .select('thresholds.npsAskIntervalDays')
                .lean()
            const days = Number(setting?.thresholds?.npsAskIntervalDays)
            return Number.isFinite(days) && days > 0
                ? days
                : NPS_FALLBACK_INTERVAL_DAYS
        } catch (error) {
            console.error('nps interval lookup failed', error)
            return NPS_FALLBACK_INTERVAL_DAYS
        }
    }

    // The throttle has TWO clocks and they are deliberately different:
    //   asked    — governs whether we SHOW the question (the brief's rule)
    //   answered — governs whether we STORE a score
    // Separating them means a customer who ignores the question is not asked
    // again next week, while one who does answer can never be double-counted in
    // the month's NPS. `asked` is also tracked on the CRM profile, because a
    // prompt that is never answered leaves no Feedback record to stamp.
    async _npsWindow(userId) {
        const intervalDays = await this._npsIntervalDays()
        const since = new Date(Date.now() - intervalDays * DAY_MS)

        const [lastAskedDoc, lastAnsweredDoc, profile] = await Promise.all([
            FeedbackModel.findOne({ userId, npsAskedAt: { $gte: since } })
                .select('npsAskedAt')
                .sort({ npsAskedAt: -1 })
                .lean(),
            FeedbackModel.findOne({ userId, npsAnsweredAt: { $gte: since } })
                .select('npsAnsweredAt')
                .sort({ npsAnsweredAt: -1 })
                .lean(),
            CrmProfileModel.findOne({ userId })
                .select('lastNpsAskedAt')
                .lean()
                .catch(() => null),
        ])

        const askedAt = [
            lastAskedDoc?.npsAskedAt,
            profile?.lastNpsAskedAt,
        ]
            .filter((d) => d && new Date(d) >= since)
            .sort((a, b) => new Date(b) - new Date(a))[0] || null

        return {
            intervalDays,
            since,
            lastAskedAt: askedAt,
            lastAnsweredAt: lastAnsweredDoc?.npsAnsweredAt || null,
            mayAsk: !askedAt,
            mayAnswer: !lastAnsweredDoc,
        }
    }

    // Fire-and-forget: a failed stamp must never cost us the prompt. Worst case
    // the customer sees the question once more than the interval allows.
    async _stampNpsAsked(userId) {
        try {
            await CrmProfileModel.updateOne(
                { userId },
                { $set: { lastNpsAskedAt: new Date() } },
            )
        } catch (error) {
            console.error('nps ask stamp failed', error)
        }
    }

    // What to put in front of the customer for one delivered order: always the
    // stars, the recommend question only when the 30-day window is clear. The FE
    // renders exactly what comes back, so the throttle lives in one place.
    async getFeedbackPrompt(req) {
        try {
            const userId = req.user.id
            const order = await BookOrderModel.findOne({
                _id: req.params.bookOrderId,
                userId,
            })
                .select('oscNumber stage.status')
                .lean()
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }
            if (order.stage?.status !== ORDER_STATUS.DELIVERED) {
                return BaseService.sendFailedResponse({
                    error: 'Feedback can only be given on a delivered order',
                })
            }

            const existing = await FeedbackModel.findOne({ orderId: order._id })
                .select('_id')
                .lean()
            if (existing) {
                return BaseService.sendFailedResponse({
                    error: 'Feedback has already been submitted for this order',
                })
            }

            const window = await this._npsWindow(userId)
            if (window.mayAsk) await this._stampNpsAsked(userId)

            return BaseService.sendSuccessResponse({
                message: {
                    bookOrderId: String(order._id),
                    oscNumber: order.oscNumber,
                    askRating: true,
                    ratingScale: { min: 1, max: 5 },
                    askNps: window.mayAsk,
                    npsQuestion: window.mayAsk ? NPS_QUESTION : null,
                    npsScale: window.mayAsk ? { min: 0, max: 10 } : null,
                    // so the FE can explain the absence instead of guessing
                    npsSkippedReason: window.mayAsk
                        ? null
                        : `Already asked within the last ${window.intervalDays} days`,
                    askComment: true,
                },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to load the feedback questions',
            })
        }
    }

    async submitFeedback(req) {
        try {
            const userId = req.user.id
            const post = req.body
            const validateResult = validateData(
                post,
                { bookOrderId: 'string|required', type: 'string|required' },
                { required: ':attribute is required' },
            )
            if (!validateResult.success) {
                return BaseService.sendFailedResponse({ error: validateResult.data })
            }
            if (!Object.values(FEEDBACK_TYPE).includes(post.type)) {
                return BaseService.sendFailedResponse({
                    error: `type must be one of: ${Object.values(FEEDBACK_TYPE).join(', ')}`,
                })
            }

            const order = await BookOrderModel.findOne({
                _id: post.bookOrderId,
                userId,
            })
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }
            if (order.stage?.status !== ORDER_STATUS.DELIVERED) {
                return BaseService.sendFailedResponse({
                    error: 'Feedback can only be given on a delivered order',
                })
            }

            const existing = await FeedbackModel.findOne({ orderId: order._id })
            if (existing) {
                return BaseService.sendFailedResponse({
                    error: 'Feedback has already been submitted for this order',
                })
            }

            // complaint needs the complaint form fields. §5: one OR many types.
            if (post.type === FEEDBACK_TYPE.COMPLAINT) {
                const hasType =
                    (Array.isArray(post.complaintTypeIds) && post.complaintTypeIds.length) ||
                    post.complaintTypeId
                if (!hasType || !post.description) {
                    return BaseService.sendFailedResponse({
                        error: 'A complaint needs at least one complaintTypeId (or complaintTypeIds[]) and a description',
                    })
                }
            }

            // §2 N2: the recommend score rides along with the stars but is a
            // separate question on a separate clock. A score outside the window
            // is DROPPED, not rejected — the stars and any complaint must still
            // save, and failing the whole submission over a throttled extra
            // answer would lose the part we actually asked for.
            let npsScore
            let npsThrottled = false
            const hasNps =
                post.npsScore !== undefined &&
                post.npsScore !== null &&
                post.npsScore !== ''
            if (hasNps) {
                const score = Number(post.npsScore)
                if (!Number.isInteger(score) || score < 0 || score > 10) {
                    return BaseService.sendFailedResponse({
                        error: 'npsScore must be a whole number from 0 to 10',
                    })
                }
                const window = await this._npsWindow(userId)
                if (window.mayAnswer) {
                    npsScore = score
                } else {
                    npsThrottled = true
                }
            }

            const now = new Date()
            const feedback = await FeedbackModel.create({
                userId,
                orderId: order._id,
                type: post.type,
                rating: post.rating,
                // 0 is a valid score, so test for undefined, never falsiness
                npsScore,
                npsAskedAt: hasNps ? now : undefined,
                npsAnsweredAt: npsScore === undefined ? undefined : now,
                comment: post.comment,
                status: FEEDBACK_STATUS.COMPLETED,
            })
            if (npsScore !== undefined) await this._stampNpsAsked(userId)

            let complaint = null
            if (post.type === FEEDBACK_TYPE.COMPLAINT) {
                complaint = await RecoveryService.openCase({
                    userId,
                    orderId: order._id,
                    feedbackId: feedback._id,
                    complaintTypeId: post.complaintTypeId,
                    complaintTypeIds: post.complaintTypeIds,
                    affectedItems: post.affectedItems || [],
                    description: post.description,
                    photos: post.photos || [],
                })
                feedback.complaintCaseId = complaint._id
                await feedback.save()
            }

            return BaseService.sendSuccessResponse({
                message: {
                    feedback,
                    complaint,
                    // satisfied customers are eligible to be asked for referrals
                    referralEligible: post.type === FEEDBACK_TYPE.SATISFIED,
                    // true when a score was sent but the 30-day window had
                    // already been used — the stars still saved
                    npsThrottled,
                },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: error.message || 'Failed to submit feedback',
            })
        }
    }

    async getFeedbackForOrder(req) {
        try {
            const feedback = await FeedbackModel.findOne({
                orderId: req.params.bookOrderId,
                userId: req.user.id,
            }).lean()
            return BaseService.sendSuccessResponse({ message: feedback })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load feedback' })
        }
    }

    // staff/admin view with filters (type, rating, date)
    async listFeedback(req) {
        try {
            const { type, rating, page, limit } = req.query
            const query = {}
            if (type) query.type = type
            if (rating) query.rating = parseInt(rating)
            const { data, pagination } = await paginate(FeedbackModel, query, {
                page,
                limit,
                sort: { createdAt: -1 },
                lean: true,
            })
            return BaseService.sendSuccessResponse({ message: { data, pagination } })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to list feedback' })
        }
    }
}

module.exports = FeedbackService
