const mongoose = require('mongoose')
const { CREDIT_TYPE, CREDIT_STATUS, CREDIT_SOURCE } = require('../util/constants')

// One document per credit grant inside the customer's existing wallet.
// Cash stays on Wallet.balance; credits are service value with their own
// expiry and source, and are never withdrawable as cash. `usedBy` records
// per-order consumption so a cancelled order can be reversed precisely.
const walletCreditSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: Object.values(CREDIT_TYPE),
            required: true,
        },
        amount: { type: Number, required: true, min: 1 }, // original value
        remaining: { type: Number, required: true, min: 0 },
        sourceSystem: {
            type: String,
            enum: Object.values(CREDIT_SOURCE),
            required: true,
        },
        // dedupe key: same sourceSystem+sourceRef never credits twice
        sourceRef: { type: String },
        relatedOfferId: { type: mongoose.Schema.Types.ObjectId },
        relatedComplaintId: { type: mongoose.Schema.Types.ObjectId },
        relatedReferralId: { type: mongoose.Schema.Types.ObjectId },
        note: { type: String },
        grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // staff, for manual grants
        expiresAt: { type: Date, required: true, index: true },
        status: {
            type: String,
            enum: Object.values(CREDIT_STATUS),
            default: CREDIT_STATUS.ACTIVE,
            index: true,
        },
        // per-order consumption, so reversals restore the exact amounts
        usedBy: [
            {
                orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookOrder' },
                amount: { type: Number, required: true },
                usedAt: { type: Date, default: Date.now },
                reversed: { type: Boolean, default: false },
            },
        ],
    },
    { timestamps: true },
)

walletCreditSchema.index(
    { sourceSystem: 1, sourceRef: 1 },
    { unique: true, partialFilterExpression: { sourceRef: { $type: 'string' } } },
)
walletCreditSchema.index({ userId: 1, status: 1, expiresAt: 1 })

const WalletCreditModel = mongoose.model('WalletCredit', walletCreditSchema)
module.exports = WalletCreditModel
