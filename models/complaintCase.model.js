const mongoose = require('mongoose')
const {
    COMPLAINT_STATUS,
    RECOVERY_ACTION,
    RECOVERY_CREDIT_STATUS,
    RECOVERY_COMPENSATION_TYPE,
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

// §7: one compensation on a case — wallet credit OR cash (manual transfer).
// A case may have SEVERAL (each a separate action with its own amount, reason,
// evidence and approval). Cumulative approved value drives the approval gate.
const compensationSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: Object.values(RECOVERY_COMPENSATION_TYPE),
            default: RECOVERY_COMPENSATION_TYPE.WALLET_CREDIT,
        },
        amount: { type: Number, required: true, min: 1 },
        reason: { type: String, required: true },
        evidence: [{ type: String }], // URLs / references supporting the request
        status: {
            type: String,
            enum: Object.values(RECOVERY_CREDIT_STATUS),
            default: RECOVERY_CREDIT_STATUS.PENDING_APPROVAL,
        },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        decidedAt: { type: Date },
        rejectionReason: { type: String },
        // wallet-credit only: the granted credit (creates a visible wallet tx)
        walletCreditId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletCredit' },
        // cash only: where the manual transfer goes (no in-system payout)
        bankDetails: {
            accountName: { type: String },
            accountNumber: { type: String },
            bankName: { type: String },
        },
        // cash only: manual-transfer settlement. Cash has no in-system payout, so
        // "approved" ≠ "paid" — these record that the external transfer happened.
        paidOut: { type: Boolean, default: false },
        paidOutAt: { type: Date },
        paidOutBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        paidOutReference: { type: String }, // bank transfer ref / note
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
        // §5: a complaint can cite MULTIPLE types. complaintTypeId is kept as the
        // primary (first) type for backward compatibility; complaintTypeIds is the
        // full set — always read the array when present.
        complaintTypeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ComplaintType',
            required: true,
        },
        complaintTypeIds: [
            { type: mongoose.Schema.Types.ObjectId, ref: 'ComplaintType' },
        ],
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
        // §6: free recovery orders spawned for this case (rewash/rework/repair/
        // replace), flowing through the normal production pipeline.
        recoveryOrderIds: [
            { type: mongoose.Schema.Types.ObjectId, ref: 'BookOrder' },
        ],
        // §7: full compensation history (wallet credit + cash). recoveryCredit is
        // the deprecated single-credit field kept only for pre-§7 cases.
        compensations: [compensationSchema],
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
        // §5 confirmation window: customer has until confirmationDueAt to confirm
        // a resolved case; after that CX may close it. Reminder fired once.
        confirmationDueAt: { type: Date },
        confirmationReminderSentAt: { type: Date },
        // §5 final close: reached by customer confirmation or CX close after 48h
        // silence. `confirmed` distinguishes the two.
        closedAt: { type: Date },
        closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        closeReason: { type: String },
        confirmed: { type: Boolean, default: false },
        // §5 post-recovery satisfaction (1–5★ + optional comment), captured on
        // confirmation. Stored here (Feedback is unique-per-order, already taken).
        recoveryRating: { type: Number, min: 1, max: 5 },
        recoveryRatingComment: { type: String },
        // §5 reopen: customer may reopen a closed case within the admin window.
        reopenedAt: { type: Date },
        reopenCount: { type: Number, default: 0 },
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
