const BaseService = require('./base.service')
const validateData = require('../util/validate')
const FeedbackModel = require('../models/feedback.model')
const BookOrderModel = require('../models/bookOrder.model')
const RecoveryService = require('./recovery.service')
const paginate = require('../util/paginate')
const { getObjectId } = require('../util/helper')
const {
    FEEDBACK_TYPE,
    FEEDBACK_STATUS,
    ORDER_STATUS,
} = require('../util/constants')

// Customer-facing feedback surface. The Feedback Page posts here after a
// delivered order. "Satisfied" completes and opens the door to referrals;
// "complaint" spawns a ComplaintCase via the recovery engine.
class FeedbackService extends BaseService {
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

            // complaint needs the complaint form fields
            if (post.type === FEEDBACK_TYPE.COMPLAINT) {
                if (!post.complaintTypeId || !post.description) {
                    return BaseService.sendFailedResponse({
                        error: 'A complaint needs complaintTypeId and description',
                    })
                }
            }

            const feedback = await FeedbackModel.create({
                userId,
                orderId: order._id,
                type: post.type,
                rating: post.rating,
                comment: post.comment,
                status: FEEDBACK_STATUS.COMPLETED,
            })

            let complaint = null
            if (post.type === FEEDBACK_TYPE.COMPLAINT) {
                complaint = await RecoveryService.openCase({
                    userId,
                    orderId: order._id,
                    feedbackId: feedback._id,
                    complaintTypeId: post.complaintTypeId,
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
                orderId: req.params.orderId,
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
