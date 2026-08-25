// Phase C structured feedback — rate a delivered order (1–5 + optional comment).
// A positive/neutral rating is recorded via FeedbackService.submitFeedback; a
// poor rating (≤2) offers to open a complaint (routing into complaintFlow) rather
// than silently filing one. Extracted verbatim and mixed onto the orchestrator
// prototype (this._parseRating, isAffirmative, and this.complaintFlow resolve there).
const FeedbackService = require('../feedback.service')
const BookOrderModel = require('../../models/bookOrder.model')
const createAuditLog = require('../../util/createAuditLog')
const {
    BOT_INTENT,
    ORDER_STATUS,
    FEEDBACK_TYPE,
    AUDIT_LOG_CATEGORIES,
} = require('../../util/constants')

module.exports = {
    async feedbackFlow({ convo, userId, text, slots, step }) {
        if (step === 'offer-complaint') {
            if (this.isAffirmative(text)) {
                const desc = slots.fComment || text
                return await this.complaintFlow({
                    convo, userId, text: desc, slots: {}, attachments: [], step: undefined,
                })
            }
            return {
                replies: ["Okay — thanks for the honest feedback, I've noted it. Anything else I can help with?"],
            }
        }

        if (step === 'collect-rating') {
            const rating = this._parseRating(text)
            const comment = String(text || '').trim()
            if (!rating) {
                return {
                    replies: ['Please give a rating from 1 to 5 (5 = great), and a comment if you like.'],
                    state: { intent: BOT_INTENT.SUBMIT_FEEDBACK, step: 'collect-rating', slots },
                }
            }
            if (rating <= 2) {
                return {
                    replies: [
                        `Sorry it wasn't good (${rating}/5). Would you like me to log a complaint so our team can make it right? (yes/no)`,
                    ],
                    state: {
                        intent: BOT_INTENT.SUBMIT_FEEDBACK,
                        step: 'offer-complaint',
                        slots: { fOrderId: slots.fOrderId, fOsc: slots.fOsc, fComment: comment },
                    },
                }
            }
            const type = rating >= 4 ? FEEDBACK_TYPE.SATISFIED : FEEDBACK_TYPE.NEUTRAL
            let result
            try {
                result = await new FeedbackService().submitFeedback({
                    body: { bookOrderId: slots.fOrderId, type, rating, comment },
                    user: { id: userId },
                })
            } catch (e) {
                result = { success: false, data: { error: e.message } }
            }
            if (result?.success) {
                try {
                    await createAuditLog({
                        userId,
                        action: `Bot recorded ${rating}/5 feedback for order ${slots.fOsc}`,
                        category: AUDIT_LOG_CATEGORIES.SYSTEM,
                        orderId: slots.fOrderId,
                    })
                } catch (_) {
                    /* best-effort */
                }
                return {
                    replies: [`Thank you! I've recorded your ${rating}/5 rating for order ${slots.fOsc}. We appreciate it. 🙏`],
                }
            }
            const err = (result && result.data && result.data.error) || 'I could not save that'
            return { replies: [`Thanks for the feedback. (${err})`] }
        }

        // start: find a delivered order to review
        const order = await BookOrderModel.findOne({
            userId,
            'stage.status': ORDER_STATUS.DELIVERED,
        })
            .sort({ createdAt: -1 })
            .lean()
        if (!order) {
            return {
                replies: [
                    "I don't see a delivered order to review yet — once your laundry is delivered you can rate it here. Anything else?",
                ],
            }
        }
        return {
            replies: [`How was order ${order.oscNumber}? Give it 1–5 (5 = great), and add a comment if you'd like.`],
            state: {
                intent: BOT_INTENT.SUBMIT_FEEDBACK,
                step: 'collect-rating',
                slots: { fOrderId: String(order._id), fOsc: order.oscNumber },
            },
        }
    },
}
