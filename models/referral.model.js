const mongoose = require('mongoose')
const {
    REFERRAL_STATUS,
    REFERRAL_SOURCE,
    REFERRAL_REWARD_STATUS,
} = require('../util/constants')

// One record per referred customer. A referred customer can have exactly one
// referrer (unique index), so self-referral and duplicate referrals are
// impossible at the data layer.
const referralSchema = new mongoose.Schema(
    {
        referrerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        referredUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true, // one referrer per referred customer
        },
        code: { type: String, required: true }, // referrer's code used
        source: {
            type: String,
            enum: Object.values(REFERRAL_SOURCE),
            default: REFERRAL_SOURCE.CODE,
        },
        status: {
            type: String,
            enum: Object.values(REFERRAL_STATUS),
            default: REFERRAL_STATUS.REGISTERED,
            index: true,
        },
        firstOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookOrder' },
        firstOrderDate: { type: Date },
        firstOrderValue: { type: Number },
        // referrer reward
        rewardStatus: {
            type: String,
            enum: Object.values(REFERRAL_REWARD_STATUS),
            default: REFERRAL_REWARD_STATUS.NONE,
        },
        rewardAmount: { type: Number },
        rewardCreditId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletCredit' },
        // when the referrer reward was actually granted — the authoritative
        // timestamp for counting successful referrals per month (level engine)
        rewardedAt: { type: Date },
        // Reversal, client 2026-10-08 §4.3: a FULL refund of the referred
        // customer's first order takes the reward back. The referral record
        // itself survives — the relationship happened, only the money is
        // pulled. `rewardShortfall` is the part the referrer had already spent,
        // which is deliberately NOT clawed into their cash balance (the wallet
        // may never go below zero) and is reported to an admin instead.
        rewardReversedAt: { type: Date },
        rewardReversedAmount: { type: Number },
        rewardShortfall: { type: Number },
        rewardReversalNote: { type: String },
        // welcome reward for the referred customer
        welcomeCreditId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletCredit' },
    },
    { timestamps: true },
)

const ReferralModel = mongoose.model('Referral', referralSchema)
module.exports = ReferralModel
