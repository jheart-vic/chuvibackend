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

const FeedbackModel = mongoose.model('Feedback', feedbackSchema)
module.exports = FeedbackModel
