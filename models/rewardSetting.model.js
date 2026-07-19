const mongoose = require('mongoose')
const { REFERRAL_LEVEL, OFFER_TRIGGER } = require('../util/constants')

// One entry per advocacy tier. `lifetimeTarget` is the permanent unlock (once
// lifetimeSuccessful reaches it the level is held for life); `rewardPercent` and
// `offerTrigger` are the permanent perks; `monthlyTarget` + `monthlyFreeLaundryAmount`
// are the activity-gated monthly perk (granted only in months the target is met).
const referralLevelSchema = new mongoose.Schema(
    {
        key: { type: String, enum: Object.values(REFERRAL_LEVEL), required: true },
        name: { type: String, required: true },
        lifetimeTarget: { type: Number, default: 0 },
        monthlyTarget: { type: Number, default: 0 },
        rewardPercent: { type: Number, default: 0 },
        monthlyFreeLaundryAmount: { type: Number, default: 0 },
        offerTrigger: { type: String, default: null }, // OFFER_TRIGGER for the exclusive offer (null = none)
    },
    { _id: false },
)

// Default advocacy ladder (client-approved placeholders; admin-editable).
const DEFAULT_REFERRAL_LEVELS = [
    { key: REFERRAL_LEVEL.MEMBER, name: 'Member', lifetimeTarget: 0, monthlyTarget: 0, rewardPercent: 5, monthlyFreeLaundryAmount: 0, offerTrigger: null },
    { key: REFERRAL_LEVEL.PROMOTER, name: 'Promoter', lifetimeTarget: 3, monthlyTarget: 2, rewardPercent: 7, monthlyFreeLaundryAmount: 2000, offerTrigger: OFFER_TRIGGER.LEVEL_PROMOTER },
    { key: REFERRAL_LEVEL.AMBASSADOR, name: 'Ambassador', lifetimeTarget: 8, monthlyTarget: 3, rewardPercent: 10, monthlyFreeLaundryAmount: 5000, offerTrigger: OFFER_TRIGGER.LEVEL_AMBASSADOR },
    { key: REFERRAL_LEVEL.CHAMPION, name: 'Champion', lifetimeTarget: 15, monthlyTarget: 5, rewardPercent: 15, monthlyFreeLaundryAmount: 10000, offerTrigger: OFFER_TRIGGER.LEVEL_CHAMPION },
]

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
        // permanent advocacy ladder — see referralLevelSchema
        referralLevels: { type: [referralLevelSchema], default: DEFAULT_REFERRAL_LEVELS },
    },
    { timestamps: true },
)

const RewardSettingModel = mongoose.model('RewardSetting', rewardSettingSchema)
module.exports = RewardSettingModel
