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
        // welcome reward for the referred customer
        welcomeCreditId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletCredit' },
    },
    { timestamps: true },
)

const ReferralModel = mongoose.model('Referral', referralSchema)
module.exports = ReferralModel
