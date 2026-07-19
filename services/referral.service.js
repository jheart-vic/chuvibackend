const crypto = require('crypto')
const ReferralModel = require('../models/referral.model')
const ReferralStatsModel = require('../models/referralStats.model')
const UserModel = require('../models/user.model')
const CrmProfileModel = require('../models/crmProfile.model')
const WalletCreditService = require('./walletCredit.service')
const CommunicationService = require('./communication.service')
const { offerOnTrigger } = require('../util/offerHooks')
const {
    REFERRAL_STATUS,
    REFERRAL_SOURCE,
    REFERRAL_REWARD_STATUS,
    REFERRAL_LEVEL,
    CREDIT_TYPE,
    CREDIT_SOURCE,
    COMM_SOURCE_SYSTEM,
} = require('../util/constants')

// The "smart recommendation tracker": permanent per-customer codes, referral
// records tracked to the referred customer's first completed order, then a
// percentage reward to the referrer (computed here and paid as wallet credit).
class ReferralService {
    // ─── codes ───────────────────────────────────────────────────────────────

    generateCode() {
        // CHUVI + 6 uppercase base36 chars
        const raw = crypto.randomBytes(4).toString('hex')
        return 'CHUVI' + parseInt(raw, 16).toString(36).toUpperCase().slice(0, 6).padStart(6, '0')
    }

    // Assigns a unique code if the user has none. Safe to call repeatedly.
    async ensureCode(user) {
        if (!user) return null
        if (user.referralCode) return user.referralCode
        for (let i = 0; i < 6; i++) {
            const code = this.generateCode()
            const clash = await UserModel.findOne({ referralCode: code })
            if (clash) continue
            try {
                await UserModel.updateOne(
                    { _id: user._id, referralCode: { $in: [null, undefined] } },
                    { $set: { referralCode: code } },
                )
            } catch (err) {
                if (err.code === 11000) continue // raced — try again
                throw err
            }
            const fresh = await UserModel.findById(user._id).lean()
            if (fresh?.referralCode) return fresh.referralCode
        }
        throw new Error('Could not generate a unique referral code')
    }

    async getOrCreateCode(userId) {
        const user = await UserModel.findById(userId)
        if (!user) throw new Error('User not found')
        return this.ensureCode(user)
    }

    buildLink(code) {
        const base = process.env.REFERRAL_BASE_URL || 'https://www.chuvilaundry.com/join'
        return `${base}?ref=${code}`
    }

    // ─── capture (registration) ──────────────────────────────────────────────

    // Links a newly-registered customer to the referrer who owns `code`.
    // Rejects self-referral and duplicate referrals. Grants the welcome reward.
    async captureReferral({ referredUserId, code, source = REFERRAL_SOURCE.CODE }) {
        if (!referredUserId || !code) return null
        const normalized = String(code).trim().toUpperCase()

        const referrer = await UserModel.findOne({ referralCode: normalized }).lean()
        if (!referrer) return null // unknown code — ignore silently
        if (String(referrer._id) === String(referredUserId)) return null // no self-referral

        const already = await ReferralModel.findOne({ referredUserId })
        if (already) return null // one referrer per referred customer

        let referral
        try {
            referral = await ReferralModel.create({
                referrerId: referrer._id,
                referredUserId,
                code: normalized,
                source,
                status: REFERRAL_STATUS.REGISTERED,
            })
        } catch (err) {
            if (err.code === 11000) return null // raced
            throw err
        }

        // welcome reward for the referred customer (configurable, 0 = off)
        const settings = await WalletCreditService.getSettings()
        const welcome = Math.round(settings.referralWelcomeAmount || 0)
        if (welcome > 0) {
            const { credit } = await WalletCreditService.grantCredit({
                userId: referredUserId,
                type: CREDIT_TYPE.PROMOTIONAL,
                amount: welcome,
                sourceSystem: CREDIT_SOURCE.REFERRAL,
                sourceRef: `referral-welcome-${referral._id}`,
                relatedReferralId: referral._id,
                note: 'Welcome reward — referred by a friend',
            })
            referral.welcomeCreditId = credit._id
            await referral.save()
        }

        return referral
    }

    // ─── order lifecycle ─────────────────────────────────────────────────────

    async handleReferredOrderCreated(order) {
        if (!order?.userId) return null
        const referral = await ReferralModel.findOne({ referredUserId: order.userId })
        if (!referral) return null
        if (referral.status === REFERRAL_STATUS.REGISTERED) {
            referral.status = REFERRAL_STATUS.FIRST_ORDER
            referral.firstOrderId = order._id
            referral.firstOrderDate = new Date()
            await referral.save()
        }
        return referral
    }

    // Referred customer's first COMPLETED (delivered) order → reward the referrer.
    async handleReferredOrderDelivered(order) {
        if (!order?.userId) return null
        const referral = await ReferralModel.findOne({ referredUserId: order.userId })
        if (!referral) return null
        // only the first qualifying completion, and never reward twice
        if (
            referral.status === REFERRAL_STATUS.COMPLETED ||
            referral.status === REFERRAL_STATUS.REWARDED
        ) {
            return referral
        }

        referral.status = REFERRAL_STATUS.COMPLETED
        referral.firstOrderId = referral.firstOrderId || order._id
        referral.firstOrderDate = referral.firstOrderDate || new Date()
        referral.firstOrderValue = order.amount || 0
        await referral.save()

        await this.grantReferrerReward(referral)
        return referral
    }

    // ─── reward computation + grant ──────────────────────────────────────────

    // percentOverride comes from the referrer's permanent level; falls back to
    // the base RewardSetting percent (Member) when not supplied.
    async computeReward(orderValue, settings, percentOverride) {
        const percent =
            percentOverride != null ? percentOverride : settings.referralRewardPercent || 0
        let amount = Math.round((orderValue || 0) * (percent / 100))
        if (settings.referralRewardMax != null) {
            amount = Math.min(amount, settings.referralRewardMax)
        }
        return amount
    }

    // How much referral reward the referrer has already earned this calendar month.
    async rewardsThisMonth(referrerId) {
        const start = new Date()
        start.setDate(1)
        start.setHours(0, 0, 0, 0)
        const rows = await ReferralModel.aggregate([
            {
                $match: {
                    referrerId,
                    rewardStatus: REFERRAL_REWARD_STATUS.GRANTED,
                    updatedAt: { $gte: start },
                },
            },
            { $group: { _id: null, total: { $sum: '$rewardAmount' } } },
        ])
        return rows[0]?.total || 0
    }

    async grantReferrerReward(referral) {
        // already granted?
        if (referral.rewardStatus === REFERRAL_REWARD_STATUS.GRANTED) return referral

        const settings = await WalletCreditService.getSettings()
        // reward % follows the referrer's PERMANENT level, counting the referral
        // being completed now so the one that lifts them into a new tier already
        // earns the boosted rate.
        const levels = this.getLevelConfig(settings)
        const lifetimeSoFar = await this.countLifetimeSuccessful(referral.referrerId)
        const rewardLevel = this.levelForLifetime(levels, lifetimeSoFar + 1)
        let amount = await this.computeReward(
            referral.firstOrderValue,
            settings,
            rewardLevel.rewardPercent,
        )
        if (amount <= 0) {
            referral.rewardAmount = 0
            referral.rewardStatus = REFERRAL_REWARD_STATUS.GRANTED
            referral.status = REFERRAL_STATUS.REWARDED
            referral.rewardedAt = new Date()
            await referral.save()
            await this.recomputeLevel(referral.referrerId)
            return referral
        }

        // monthly cap (optional)
        if (settings.referralMonthlyCap != null) {
            const used = await this.rewardsThisMonth(referral.referrerId)
            const remaining = Math.max(settings.referralMonthlyCap - used, 0)
            if (remaining <= 0) {
                referral.rewardAmount = 0
                referral.rewardStatus = REFERRAL_REWARD_STATUS.DEFERRED
                await referral.save()
                return referral // capped out this month
            }
            amount = Math.min(amount, remaining)
        }

        // pause gate: referrer with an unresolved complaint → defer
        const profile = await CrmProfileModel.findOne({
            userId: referral.referrerId,
        }).lean()
        if (profile?.referralPaused) {
            referral.rewardAmount = amount
            referral.rewardStatus = REFERRAL_REWARD_STATUS.DEFERRED
            await referral.save()
            return referral
        }

        const { credit } = await WalletCreditService.grantCredit({
            userId: referral.referrerId,
            type: CREDIT_TYPE.REFERRAL,
            amount,
            sourceSystem: CREDIT_SOURCE.REFERRAL,
            sourceRef: `referral-${referral._id}`,
            relatedReferralId: referral._id,
            note: 'Referral reward — your friend completed their first order',
        })
        referral.rewardAmount = amount
        referral.rewardCreditId = credit._id
        referral.rewardStatus = REFERRAL_REWARD_STATUS.GRANTED
        referral.status = REFERRAL_STATUS.REWARDED
        referral.rewardedAt = new Date()
        await referral.save()

        await CommunicationService.send({
            userId: referral.referrerId,
            templateKey: 'referral-reward',
            data: {
                amount: amount.toLocaleString('en-NG'),
                referredName: 'your friend',
            },
            sourceSystem: COMM_SOURCE_SYSTEM.REFERRAL,
            messageType: 'referral-reward',
            relatedRef: referral._id,
            relatedModel: 'Referral',
            page: 'wallet',
        })

        // recompute the referrer's advocacy level → notify + activate perks
        await this.recomputeLevel(referral.referrerId)
        return referral
    }

    // Called when a referrer's referral eligibility is restored (complaint
    // resolved) — grants any rewards that were deferred while paused.
    async processDeferredRewards(referrerUserId) {
        if (!referrerUserId) return 0
        const deferred = await ReferralModel.find({
            referrerId: referrerUserId,
            rewardStatus: REFERRAL_REWARD_STATUS.DEFERRED,
        })
        let granted = 0
        for (const referral of deferred) {
            // reset to recompute cleanly against current caps
            referral.rewardStatus = REFERRAL_REWARD_STATUS.NONE
            await referral.save()
            const result = await this.grantReferrerReward(referral)
            if (result.rewardStatus === REFERRAL_REWARD_STATUS.GRANTED) granted += 1
        }
        return granted
    }

    // ─── advocacy levels ─────────────────────────────────────────────────────
    // Levels are PERMANENT (earned by lifetime successful referrals, never lost);
    // higher levels permanently raise the referral % and unlock an exclusive
    // offer. The monthly free-laundry perk is activity-gated: granted only in a
    // month the monthly target is met, paused otherwise, auto-restored on requalify.

    monthKeyFor(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    }

    monthStartFor(date = new Date()) {
        return new Date(date.getFullYear(), date.getMonth(), 1)
    }

    // Level ladder sorted ascending by lifetimeTarget, as plain objects. Falls
    // back to a single Member level if settings somehow carry none.
    getLevelConfig(settings) {
        const raw = settings?.referralLevels?.length
            ? settings.referralLevels.map((l) => (l.toObject ? l.toObject() : l))
            : [
                  {
                      key: REFERRAL_LEVEL.MEMBER,
                      name: 'Member',
                      lifetimeTarget: 0,
                      monthlyTarget: 0,
                      rewardPercent: settings?.referralRewardPercent || 0,
                      monthlyFreeLaundryAmount: 0,
                      offerTrigger: null,
                  },
              ]
        return [...raw].sort((a, b) => a.lifetimeTarget - b.lifetimeTarget)
    }

    // Highest level whose lifetime unlock threshold is satisfied.
    levelForLifetime(levels, lifetime) {
        let chosen = levels[0]
        for (const lvl of levels) if (lifetime >= lvl.lifetimeTarget) chosen = lvl
        return chosen
    }

    levelRank(levels, key) {
        const i = levels.findIndex((l) => l.key === key)
        return i < 0 ? 0 : i
    }

    async countLifetimeSuccessful(referrerId) {
        return ReferralModel.countDocuments({
            referrerId,
            rewardStatus: REFERRAL_REWARD_STATUS.GRANTED,
        })
    }

    async countMonthlySuccessful(referrerId, monthStart) {
        return ReferralModel.countDocuments({
            referrerId,
            rewardStatus: REFERRAL_REWARD_STATUS.GRANTED,
            rewardedAt: { $gte: monthStart },
        })
    }

    // Reconciles a referrer's stored level snapshot with reality (Referral rows
    // are the source of truth), fires a one-time level-up notification + perks on
    // a climb, and grants this month's free-laundry perk if the target is met.
    // Idempotent and safe to call on every referral event and every page load.
    async recomputeLevel(userId) {
        if (!userId) return null
        const settings = await WalletCreditService.getSettings()
        const levels = this.getLevelConfig(settings)
        if (!levels.length) return null

        const now = new Date()
        const monthKey = this.monthKeyFor(now)
        const monthStart = this.monthStartFor(now)
        const lifetime = await this.countLifetimeSuccessful(userId)
        const monthly = await this.countMonthlySuccessful(userId, monthStart)

        let stats = await ReferralStatsModel.findOne({ userId })
        if (!stats) stats = new ReferralStatsModel({ userId })

        const prevLevelKey = stats.currentLevel
        const newLevel = this.levelForLifetime(levels, lifetime)
        const leveledUp =
            this.levelRank(levels, newLevel.key) > this.levelRank(levels, prevLevelKey)

        stats.lifetimeSuccessful = lifetime
        stats.monthlySuccessful = monthly
        stats.monthKey = monthKey
        if (leveledUp) {
            stats.currentLevel = newLevel.key
            stats.levelSince = now
            if (
                this.levelRank(levels, newLevel.key) >
                this.levelRank(levels, stats.highestLevelReached)
            ) {
                stats.highestLevelReached = newLevel.key
            }
        }
        await stats.save()

        if (leveledUp) await this.onLevelUp(userId, newLevel)
        await this.maybeGrantMonthlyPerk(userId, newLevel, monthly, monthKey, stats)

        return stats
    }

    // Permanent perks on reaching a new level: link the exclusive offer (once
    // ever) + congratulate the customer.
    async onLevelUp(userId, level) {
        if (level.offerTrigger) {
            offerOnTrigger(level.offerTrigger, {
                userId,
                milestoneKey: `level-${level.key}`,
            })
        }
        const benefitsLine =
            level.monthlyFreeLaundryAmount > 0
                ? ` and unlock up to ₦${Number(
                      level.monthlyFreeLaundryAmount,
                  ).toLocaleString('en-NG')} free-laundry credit in any month you hit your target`
                : ''
        await CommunicationService.send({
            userId,
            templateKey: 'referral-level-up',
            data: {
                levelName: level.name,
                rewardPercent: level.rewardPercent,
                benefitsLine,
            },
            sourceSystem: COMM_SOURCE_SYSTEM.REFERRAL,
            messageType: 'referral-level-up',
            page: 'referral',
        })
    }

    // Activity-gated monthly perk: one free-laundry credit per user/level/month
    // when the monthly target is met. Deduped by stored key AND by the credit
    // sourceRef, so it never double-grants; simply not granted in a missed month.
    async maybeGrantMonthlyPerk(userId, level, monthly, monthKey, stats) {
        if (!level || (level.monthlyFreeLaundryAmount || 0) <= 0) return
        if (monthly < level.monthlyTarget) return // target not met → paused this month
        const perkKey = `${level.key}-${monthKey}`
        if (stats.lastMonthlyPerkKey === perkKey) return

        const { duplicate } = await WalletCreditService.grantCredit({
            userId,
            type: CREDIT_TYPE.LAUNDRY,
            amount: level.monthlyFreeLaundryAmount,
            sourceSystem: CREDIT_SOURCE.REFERRAL,
            sourceRef: `referral-level-laundry-${level.key}-${monthKey}`,
            note: `${level.name} monthly free-laundry perk (${monthKey})`,
            notify: false,
        })
        stats.lastMonthlyPerkKey = perkKey
        await stats.save()

        if (!duplicate) {
            await CommunicationService.send({
                userId,
                templateKey: 'referral-monthly-benefit',
                data: {
                    levelName: level.name,
                    amount: Number(level.monthlyFreeLaundryAmount).toLocaleString('en-NG'),
                },
                sourceSystem: COMM_SOURCE_SYSTEM.REFERRAL,
                messageType: 'referral-monthly-benefit',
                page: 'wallet',
            })
        }
    }

    // Level block for the referral page (also refreshes the snapshot so monthly
    // counters/perks are current even if no referral event happened this month).
    async getLevelSummary(userId) {
        const stats = (await this.recomputeLevel(userId)) || {
            currentLevel: REFERRAL_LEVEL.MEMBER,
            lifetimeSuccessful: 0,
            monthlySuccessful: 0,
        }
        const settings = await WalletCreditService.getSettings()
        const levels = this.getLevelConfig(settings)
        const current =
            levels.find((l) => l.key === stats.currentLevel) || levels[0]
        const rank = this.levelRank(levels, current.key)
        const next = levels[rank + 1] || null
        const monthlyPerkActive =
            (current.monthlyFreeLaundryAmount || 0) > 0 &&
            stats.monthlySuccessful >= current.monthlyTarget

        return {
            current: current.key,
            name: current.name,
            lifetimeReferrals: stats.lifetimeSuccessful,
            monthlyReferrals: stats.monthlySuccessful,
            rewardPercent: current.rewardPercent,
            benefits: {
                rewardPercent: current.rewardPercent,
                exclusiveOffer: !!current.offerTrigger,
                monthlyFreeLaundry: current.monthlyFreeLaundryAmount || 0,
                monthlyTarget: current.monthlyTarget,
                monthlyPerkActive,
            },
            nextLevel: next
                ? {
                      key: next.key,
                      name: next.name,
                      lifetimeTarget: next.lifetimeTarget,
                      referralsToGo: Math.max(
                          next.lifetimeTarget - stats.lifetimeSuccessful,
                          0,
                      ),
                      monthlyTarget: next.monthlyTarget,
                      rewardPercent: next.rewardPercent,
                  }
                : null,
            progressPercent: next
                ? Math.min(
                      Math.round(
                          (stats.lifetimeSuccessful / next.lifetimeTarget) * 100,
                      ),
                      100,
                  )
                : 100,
        }
    }

    // ─── referral page ───────────────────────────────────────────────────────

    async getReferralPage(userId) {
        const code = await this.getOrCreateCode(userId)
        const referrals = await ReferralModel.find({ referrerId: userId })
            .sort({ createdAt: -1 })
            .populate('referredUserId', 'fullName')
            .lean()

        const successful = referrals.filter(
            (r) => r.status === REFERRAL_STATUS.REWARDED,
        ).length
        const pending = referrals.filter(
            (r) => r.status !== REFERRAL_STATUS.REWARDED,
        ).length
        const totalEarned = referrals.reduce(
            (s, r) => s + (r.rewardStatus === REFERRAL_REWARD_STATUS.GRANTED ? r.rewardAmount || 0 : 0),
            0,
        )

        const history = referrals.map((r) => ({
            referredName: r.referredUserId?.fullName || 'A friend',
            referralDate: r.createdAt,
            status: r.status,
            rewardStatus: r.rewardStatus,
            rewardAmount: r.rewardAmount || 0,
        }))

        const level = await this.getLevelSummary(userId)

        return {
            referralCode: code,
            referralLink: this.buildLink(code),
            totalSuccessfulReferrals: successful,
            pendingReferrals: pending,
            totalRewardsEarned: totalEarned,
            level,
            history,
        }
    }

    // ─── staff ───────────────────────────────────────────────────────────────

    async resetCode(userId) {
        const user = await UserModel.findById(userId)
        if (!user) throw new Error('User not found')
        user.referralCode = undefined
        await user.save()
        return this.ensureCode(user)
    }
}

module.exports = new ReferralService()
