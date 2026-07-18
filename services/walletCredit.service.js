const WalletCreditModel = require('../models/walletCredit.model')
const WalletTransactionModel = require('../models/walletTransaction.model')
const RewardSettingModel = require('../models/rewardSetting.model')
const createNotification = require('../util/createNotification')
const {
    CREDIT_TYPE,
    CREDIT_STATUS,
    CREDIT_SOURCE,
    WALLET_TX_TYPE,
    NOTIFICATION_TYPE,
} = require('../util/constants')

const DAY = 24 * 60 * 60 * 1000

// Engine for reward credits inside the customer's existing wallet.
// Cash stays on Wallet.balance and is handled by wallet.service; this service
// owns the credit sub-balances (laundry/referral/recovery/promotional):
// granting, spending during payment, reversing on cancellation/correction and
// expiring. No mongo transactions are used anywhere in this codebase, so
// multi-step flows use per-document atomic guards plus compensating updates.
class WalletCreditService {
    async getSettings() {
        let settings = await RewardSettingModel.findOne({})
        if (!settings) {
            settings = await RewardSettingModel.create({})
        }
        return settings
    }

    async defaultExpiryFor(type) {
        const settings = await this.getSettings()
        const days =
            settings.creditExpiryDays?.[type] ??
            settings.creditExpiryDays?.promotional ??
            30
        return new Date(Date.now() + days * DAY)
    }

    // Adds a credit to the wallet. Idempotent when sourceRef is provided —
    // the same sourceSystem+sourceRef never credits twice (client rule:
    // "duplicate credits must be prevented").
    async grantCredit({
        userId,
        type,
        amount,
        sourceSystem,
        sourceRef,
        note,
        grantedBy,
        expiresAt,
        relatedOfferId,
        relatedComplaintId,
        relatedReferralId,
        notify = true,
    }) {
        if (!userId) throw new Error('userId is required')
        if (!Object.values(CREDIT_TYPE).includes(type)) {
            throw new Error(`Invalid credit type "${type}"`)
        }
        amount = Math.round(Number(amount))
        if (!amount || amount <= 0) {
            throw new Error('Credit amount must be a positive number')
        }

        if (sourceRef) {
            const existing = await WalletCreditModel.findOne({
                sourceSystem,
                sourceRef,
            })
            if (existing) return { credit: existing, duplicate: true }
        }

        const credit = await WalletCreditModel.create({
            userId,
            type,
            amount,
            remaining: amount,
            sourceSystem: sourceSystem || CREDIT_SOURCE.ADMIN,
            sourceRef,
            note,
            grantedBy,
            relatedOfferId,
            relatedComplaintId,
            relatedReferralId,
            expiresAt: expiresAt || (await this.defaultExpiryFor(type)),
        })

        await WalletTransactionModel.create({
            userId,
            type: WALLET_TX_TYPE.CREDIT,
            amount,
            status: 'success',
            description: note || `${type} credit added to wallet`,
            sourceSystem: credit.sourceSystem,
            creditType: type,
            relatedCreditId: credit._id,
            performedBy: grantedBy,
        })

        if (notify) {
            await createNotification({
                userId,
                title: 'Wallet Credit Added',
                body: `₦${amount.toLocaleString('en-NG')} ${type} credit has been added to your wallet. It expires on ${credit.expiresAt.toDateString()}.`,
                type: NOTIFICATION_TYPE.WALLET_UPDATE,
            })
        }

        return { credit, duplicate: false }
    }

    // Cash + credit picture for the wallet page.
    async getCreditBalances(userId) {
        const now = new Date()
        const credits = await WalletCreditModel.find({
            userId,
            status: CREDIT_STATUS.ACTIVE,
            remaining: { $gt: 0 },
            expiresAt: { $gt: now },
        })
            .sort({ expiresAt: 1 })
            .lean()

        const byType = {}
        for (const t of Object.values(CREDIT_TYPE)) byType[t] = 0
        let total = 0
        let expiringSoon = 0
        const soonCutoff = new Date(Date.now() + 7 * DAY)
        for (const c of credits) {
            byType[c.type] += c.remaining
            total += c.remaining
            if (c.expiresAt <= soonCutoff) expiringSoon += c.remaining
        }

        return { total, byType, expiringSoon, credits }
    }

    // Spends up to `amount` from the customer's usable credits, oldest expiry
    // first. Each decrement is atomic (remaining >= x guard), so concurrent
    // spends can never take a credit below zero. Returns what was actually
    // applied plus a breakdown the caller can roll back if the cash leg fails.
    async applyCreditsToAmount(userId, orderId, amount, description = 'Order Payment') {
        const now = new Date()
        const usable = await WalletCreditModel.find({
            userId,
            status: CREDIT_STATUS.ACTIVE,
            remaining: { $gt: 0 },
            expiresAt: { $gt: now },
        }).sort({ expiresAt: 1 })

        let outstanding = amount
        const breakdown = []

        for (const credit of usable) {
            if (outstanding <= 0) break
            const take = Math.min(credit.remaining, outstanding)

            const updated = await WalletCreditModel.findOneAndUpdate(
                { _id: credit._id, remaining: { $gte: take } },
                {
                    $inc: { remaining: -take },
                    $push: { usedBy: { orderId, amount: take } },
                },
                { new: true },
            )
            if (!updated) continue // consumed concurrently — skip it

            if (updated.remaining === 0) {
                updated.status = CREDIT_STATUS.EXHAUSTED
                await updated.save()
            }

            await WalletTransactionModel.create({
                userId,
                type: WALLET_TX_TYPE.DEBIT,
                amount: take,
                status: 'success',
                description: `${description} (${updated.type} credit)`,
                sourceSystem: CREDIT_SOURCE.ORDER,
                creditType: updated.type,
                relatedOrderId: orderId,
                relatedCreditId: updated._id,
            })

            outstanding -= take
            breakdown.push({ creditId: updated._id, type: updated.type, amount: take })
        }

        return { applied: amount - outstanding, breakdown }
    }

    // Compensating action for applyCreditsToAmount — used when the cash debit
    // fails afterwards, and by order-cancellation reversals.
    async rollbackApplications(breakdown, orderId, reason = 'Payment rolled back') {
        for (const item of breakdown) {
            const credit = await WalletCreditModel.findById(item.creditId)
            if (!credit) continue

            const usage = credit.usedBy.find(
                (u) =>
                    String(u.orderId) === String(orderId) &&
                    u.amount === item.amount &&
                    !u.reversed,
            )
            if (!usage) continue

            usage.reversed = true
            credit.remaining += item.amount
            if (
                credit.status === CREDIT_STATUS.EXHAUSTED &&
                credit.expiresAt > new Date()
            ) {
                credit.status = CREDIT_STATUS.ACTIVE
            }
            await credit.save()

            await WalletTransactionModel.create({
                userId: credit.userId,
                type: WALLET_TX_TYPE.REVERSAL,
                amount: item.amount,
                status: 'success',
                description: reason,
                sourceSystem: CREDIT_SOURCE.ORDER,
                creditType: credit.type,
                relatedOrderId: orderId,
                relatedCreditId: credit._id,
            })
        }
    }

    // Returns every non-reversed credit consumption for an order (client rule:
    // "a cancelled order must not consume the offer/credit"). The original
    // expiry date is kept — an expired credit stays expired unless staff
    // intervene, exactly per the agreed cancellation policy.
    async reverseOrderCredits(orderId, { reason = 'Order cancelled', performedBy } = {}) {
        const credits = await WalletCreditModel.find({
            'usedBy.orderId': orderId,
        })

        let restored = 0
        for (const credit of credits) {
            for (const usage of credit.usedBy) {
                if (String(usage.orderId) !== String(orderId) || usage.reversed) {
                    continue
                }
                usage.reversed = true
                credit.remaining += usage.amount
                restored += usage.amount
                if (
                    credit.status === CREDIT_STATUS.EXHAUSTED &&
                    credit.expiresAt > new Date()
                ) {
                    credit.status = CREDIT_STATUS.ACTIVE
                }

                await WalletTransactionModel.create({
                    userId: credit.userId,
                    type: WALLET_TX_TYPE.REVERSAL,
                    amount: usage.amount,
                    status: 'success',
                    description: reason,
                    sourceSystem: CREDIT_SOURCE.ORDER,
                    creditType: credit.type,
                    relatedOrderId: orderId,
                    relatedCreditId: credit._id,
                    performedBy,
                })
            }
            await credit.save()
        }

        return { restored, creditsTouched: credits.length }
    }

    // Marks overdue credits expired and logs the lost value. Run by the
    // creditExpiry cron.
    async expireDueCredits() {
        const now = new Date()
        const due = await WalletCreditModel.find({
            status: CREDIT_STATUS.ACTIVE,
            expiresAt: { $lte: now },
        })

        for (const credit of due) {
            credit.status =
                credit.remaining > 0 ? CREDIT_STATUS.EXPIRED : CREDIT_STATUS.EXHAUSTED
            await credit.save()

            if (credit.remaining > 0) {
                await WalletTransactionModel.create({
                    userId: credit.userId,
                    type: WALLET_TX_TYPE.EXPIRY,
                    amount: credit.remaining,
                    status: 'success',
                    description: `${credit.type} credit expired unused`,
                    sourceSystem: credit.sourceSystem,
                    creditType: credit.type,
                    relatedCreditId: credit._id,
                })
            }
        }

        return due.length
    }

    // Staff correction path. Adding value creates a fresh admin credit;
    // removing value pulls from a specific credit. A reason is mandatory
    // (client rule: "every manual adjustment must include a reason").
    async manualAdjust({ userId, creditId, type, amount, direction, reason, performedBy }) {
        if (!reason || !String(reason).trim()) {
            throw new Error('A reason is required for manual adjustments')
        }
        amount = Math.round(Number(amount))
        if (!amount || amount <= 0) {
            throw new Error('Adjustment amount must be a positive number')
        }

        if (direction === 'add') {
            const { credit } = await this.grantCredit({
                userId,
                type: type || CREDIT_TYPE.LAUNDRY,
                amount,
                sourceSystem: CREDIT_SOURCE.ADMIN,
                note: reason,
                grantedBy: performedBy,
            })
            return { credit, adjusted: amount }
        }

        if (direction === 'remove') {
            if (!creditId) {
                throw new Error('creditId is required when removing credit value')
            }
            const updated = await WalletCreditModel.findOneAndUpdate(
                { _id: creditId, userId, remaining: { $gte: amount } },
                { $inc: { remaining: -amount } },
                { new: true },
            )
            if (!updated) {
                throw new Error('Credit not found or has insufficient remaining value')
            }
            if (updated.remaining === 0) {
                updated.status = CREDIT_STATUS.EXHAUSTED
                await updated.save()
            }

            await WalletTransactionModel.create({
                userId,
                type: WALLET_TX_TYPE.MANUAL_ADJUSTMENT,
                amount: -amount,
                status: 'success',
                description: reason,
                reason,
                sourceSystem: CREDIT_SOURCE.ADMIN,
                creditType: updated.type,
                relatedCreditId: updated._id,
                performedBy,
            })

            return { credit: updated, adjusted: -amount }
        }

        throw new Error('direction must be "add" or "remove"')
    }
}

module.exports = new WalletCreditService()
