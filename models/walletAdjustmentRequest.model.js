const mongoose = require('mongoose')
const { WALLET_ADJUSTMENT_REQUEST_STATUS } = require('../util/constants')

// A staff wallet adjustment that exceeded the operator's role limit and is
// waiting for an admin (client brief 6 Oct 2026, item 2.4: "Above the limit,
// the adjustment becomes a request on the admin dashboard... Nothing changes in
// the wallet until the admin approves").
//
// Nothing here moves money. The wallet is only touched when an admin approves,
// and that approval goes through the SAME code path as a within-limit
// adjustment, so an approved request produces an identical ledger line.
const walletAdjustmentRequestSchema = new mongoose.Schema(
    {
        // Whose wallet would move.
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        amount: { type: Number, required: true, min: 1 }, // always positive
        type: { type: String, enum: ['credit', 'debit'], required: true },
        reason: { type: String, required: true }, // client: must give a reason

        // Who asked, in what capacity, and what their limit was AT THE TIME —
        // stored rather than looked up later, so changing the setting never
        // rewrites the history of why a request was needed (item 2.4.5:
        // "recorded with who, when and why").
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        requestedByRole: { type: String },
        roleLimitAtRequest: { type: Number },

        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookOrder' },

        status: {
            type: String,
            enum: Object.values(WALLET_ADJUSTMENT_REQUEST_STATUS),
            default: WALLET_ADJUSTMENT_REQUEST_STATUS.PENDING,
            index: true,
        },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        decidedAt: { type: Date },
        decisionNote: { type: String },

        // The ledger line the approval produced — the audit trail from request
        // to money moved.
        walletTransactionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WalletTransaction',
        },
        balanceAfter: { type: Number },
    },
    { timestamps: true },
)

walletAdjustmentRequestSchema.index({ status: 1, createdAt: -1 })

module.exports = mongoose.model(
    'WalletAdjustmentRequest',
    walletAdjustmentRequestSchema,
)
