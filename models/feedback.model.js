const mongoose = require('mongoose')
const { FEEDBACK_TYPE, FEEDBACK_STATUS } = require('../util/constants')

// One feedback record per satisfaction response on a DELIVERED order.
// "Satisfied" closes it; "complaint" spawns a ComplaintCase (see recovery).
const feedbackSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BookOrder',
            required: true,
        },
        type: {
            type: String,
            enum: Object.values(FEEDBACK_TYPE),
            required: true,
        },
        rating: { type: Number, min: 1, max: 5 }, // star scale
        // §2 N2 (client brief 6 Oct 2026): "How likely are you to recommend CHUVI
        // to a friend?", 0-10. A SEPARATE question from the star rating and on a
        // different cadence — stars are asked after every delivered order, the NPS
        // question at most once every 30 days per customer. So a feedback record
        // may carry stars with no score, and `npsScore` has NO default: 0 is a
        // real answer (a detractor) and must never be confused with "not asked".
        npsScore: { type: Number, min: 0, max: 10 },
        npsAskedAt: { type: Date }, // set when this order's prompt INCLUDED the question
        npsAnsweredAt: { type: Date }, // set only when a score actually came back
        comment: { type: String }, // customer's exact words
        status: {
            type: String,
            enum: Object.values(FEEDBACK_STATUS),
            default: FEEDBACK_STATUS.COMPLETED,
        },
        complaintCaseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ComplaintCase',
        },
    },
    { timestamps: true },
)

// one satisfaction response per order
feedbackSchema.index({ orderId: 1 }, { unique: true })
// the NPS throttle asks "has this customer been asked in the last 30 days", and
// the monthly dashboard asks "which scores landed in this month"
feedbackSchema.index({ userId: 1, npsAskedAt: -1 })
feedbackSchema.index({ npsAnsweredAt: -1 })

const FeedbackModel = mongoose.model('Feedback', feedbackSchema)
module.exports = FeedbackModel
