const mongoose = require('mongoose')
const {
    COMPLAINT_STATUS,
    RECOVERY_ACTION,
    RECOVERY_CREDIT_STATUS,
    ESCALATION_REASON,
} = require('../util/constants')

// A recovery action taken on the case (a case may have several).
const recoveryActionSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: Object.values(RECOVERY_ACTION),
            required: true,
        },
        note: { type: String },
        completed: { type: Boolean, default: false },
        completedAt: { type: Date },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
)

// Recovery credit (compensation) with its approval gate.
const recoveryCreditSchema = new mongoose.Schema(
    {
        amount: { type: Number, required: true, min: 1 },
        reason: { type: String },
        status: {
            type: String,
            enum: Object.values(RECOVERY_CREDIT_STATUS),
            default: RECOVERY_CREDIT_STATUS.PENDING_APPROVAL,
        },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        decidedAt: { type: Date },
        walletCreditId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletCredit' },
    },
    { _id: false },
)

const complaintCaseSchema = new mongoose.Schema(
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
            index: true,
        },
        feedbackId: { type: mongoose.Schema.Types.ObjectId, ref: 'Feedback' },
        complaintTypeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ComplaintType',
            required: true,
        },
        // affected items, referencing item labels/ids on the order
        affectedItems: [{ type: String }],
        description: { type: String, required: true },
        photos: [{ type: String }], // URLs
        status: {
            type: String,
            enum: Object.values(COMPLAINT_STATUS),
            default: COMPLAINT_STATUS.SUBMITTED,
            index: true,
        },
        // CX officer who owns this case
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        recoveryActions: [recoveryActionSchema],
        recoveryCredit: recoveryCreditSchema,
        recoveryOfferTriggered: { type: Boolean, default: false },
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation',
        },
        // SLA
        firstReviewDueAt: { type: Date },
        resolutionDueAt: { type: Date },
        reviewedAt: { type: Date },
        resolvedAt: { type: Date },
        confirmedAt: { type: Date },
        // escalation
        escalated: { type: Boolean, default: false },
        escalationReason: {
            type: String,
            enum: Object.values(ESCALATION_REASON),
        },
        escalatedAt: { type: Date },
        // audit of every status change
        statusHistory: [
            {
                from: { type: String },
                to: { type: String },
                note: { type: String },
                changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                changedAt: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true },
)

complaintCaseSchema.index({ status: 1, firstReviewDueAt: 1 })
complaintCaseSchema.index({ status: 1, resolutionDueAt: 1 })

const ComplaintCaseModel = mongoose.model('ComplaintCase', complaintCaseSchema)
module.exports = ComplaintCaseModel
