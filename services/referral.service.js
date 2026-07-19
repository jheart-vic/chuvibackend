const crypto = require('crypto')
const ReferralModel = require('../models/referral.model')
const UserModel = require('../models/user.model')
const CrmProfileModel = require('../models/crmProfile.model')
const WalletCreditService = require('./walletCredit.service')
const CommunicationService = require('./communication.service')
const {
    REFERRAL_STATUS,
    REFERRAL_SOURCE,
    REFERRAL_REWARD_STATUS,
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

    async computeReward(orderValue, settings) {
        const percent = settings.referralRewardPercent || 0
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
        let amount = await this.computeReward(referral.firstOrderValue, settings)
        if (amount <= 0) {
            referral.rewardAmount = 0
            referral.rewardStatus = REFERRAL_REWARD_STATUS.GRANTED
            referral.status = REFERRAL_STATUS.REWARDED
            await referral.save()
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

        return {
            referralCode: code,
            referralLink: this.buildLink(code),
            totalSuccessfulReferrals: successful,
            pendingReferrals: pending,
            totalRewardsEarned: totalEarned,
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
