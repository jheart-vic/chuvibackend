const mongoose = require('mongoose')
const { CANCELLATION_REQUEST_STATUS } = require('../util/constants')

// A customer's request to cancel an order that is already in the Amber window
// (items in transit / with us but not yet processed). Customer Experience
// reviews and approves or rejects it. Approval runs the same unwind as a Green
// self-cancel, optionally withholding a staff-set fee from the cash refund.
const cancellationRequestSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BookOrder',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        reason: { type: String, required: true },
        status: {
            type: String,
            enum: Object.values(CANCELLATION_REQUEST_STATUS),
            default: CANCELLATION_REQUEST_STATUS.PENDING,
            index: true,
        },
        tierAtRequest: { type: String }, // snapshot, e.g. 'amber'

        // CX decision
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: { type: Date },
        decisionNote: { type: String },

        // Filled on approval
        feeApplied: { type: Number, default: 0 },
        cashRefunded: { type: Number, default: 0 },
        creditsReversed: { type: Number, default: 0 },
    },
    { timestamps: true },
)

// At most one OPEN (pending) request per order; approved/rejected ones are
// history, so a customer may resubmit after a rejection if still eligible.
cancellationRequestSchema.index(
    { orderId: 1, status: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: CANCELLATION_REQUEST_STATUS.PENDING,
        },
    },
)

module.exports = mongoose.model('CancellationRequest', cancellationRequestSchema)
