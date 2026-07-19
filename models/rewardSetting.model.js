const mongoose = require('mongoose')

// Single admin-editable document (like AdminSetting / CrmSetting) holding the
// reward-economy defaults agreed with the client. Per-offer overrides live on
// the offer itself; these are the fallbacks and global guards.
const rewardSettingSchema = new mongoose.Schema(
    {
        // default credit lifetimes in days, by credit type
        creditExpiryDays: {
            referral: { type: Number, default: 45 },
            recovery: { type: Number, default: 90 },
            promotional: { type: Number, default: 30 },
            laundry: { type: Number, default: 90 },
        },
        // recovery compensation above this needs Ops Manager / Founder approval
        recoveryApprovalThreshold: { type: Number, default: 10000 },
        // complaint SLA (hours): first review + target resolution
        complaintReviewHours: { type: Number, default: 24 },
        complaintResolutionHours: { type: Number, default: 72 },
        // referrer reward as % of the referred customer's first completed order
        referralRewardPercent: { type: Number, default: 5 },
        // optional per-referral reward ceiling in naira (null = no ceiling)
        referralRewardMax: { type: Number, default: null },
        // optional monthly cap on total referral rewards per customer
        // (client decision: off by default, available if abuse appears)
        referralMonthlyCap: { type: Number, default: null },
        // welcome reward (wallet credit) for a referred customer on signup
        // (0 = disabled)
        referralWelcomeAmount: { type: Number, default: 0 },
    },
    { timestamps: true },
)

const RewardSettingModel = mongoose.model('RewardSetting', rewardSettingSchema)
module.exports = RewardSettingModel
