const mongoose = require('mongoose')
const { REFERRAL_LEVEL } = require('../util/constants')

// One per customer: the durable snapshot of their advocacy standing. Counts are
// kept in sync from Referral records (source of truth) by ReferralService; the
// stored level lets us detect level-UP transitions to notify + activate perks,
// and `lastMonthlyPerkKey` dedupes the monthly free-laundry grant.
const referralStatsSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        lifetimeSuccessful: { type: Number, default: 0 }, // rewarded referrals, ever
        monthlySuccessful: { type: Number, default: 0 }, // rewarded referrals this month
        monthKey: { type: String, default: null }, // 'YYYY-MM' the monthly count belongs to
        currentLevel: {
            type: String,
            enum: Object.values(REFERRAL_LEVEL),
            default: REFERRAL_LEVEL.MEMBER,
            index: true,
        },
        highestLevelReached: {
            type: String,
            enum: Object.values(REFERRAL_LEVEL),
            default: REFERRAL_LEVEL.MEMBER,
        },
        levelSince: { type: Date, default: Date.now },
        // e.g. 'champion-2026-07' — last month a monthly free-laundry perk was granted
        lastMonthlyPerkKey: { type: String, default: null },
    },
    { timestamps: true },
)

const ReferralStatsModel = mongoose.model('ReferralStats', referralStatsSchema)
module.exports = ReferralStatsModel
