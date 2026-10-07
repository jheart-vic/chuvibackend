const BaseService = require('./base.service')
const WalletModel = require('../models/wallet.model')
const WalletTransactionModel = require('../models/walletTransaction.model')
const WalletAdjustmentRequestModel = require('../models/walletAdjustmentRequest.model')
const AdminSettingModel = require('../models/adminSetting.model')
const UserModel = require('../models/user.model')
const ActivityModel = require('../models/activity.model')
const createNotification = require('../util/createNotification')
const createAuditLog = require('../util/createAuditLog')
const { getObjectId } = require('../util/helper')
const {
    ROLE,
    WALLET_TX_TYPE,
    WALLET_ADJUSTMENT_REQUEST_STATUS,
    NOTIFICATION_TYPE,
    ACTIVITY_TYPE,
} = require('../util/constants')

/**
 * Staff wallet adjustments — client brief 6 Oct 2026, items 2.3 and 2.4.
 *
 * One place owns moving a customer's cash balance by hand, because the two
 * routes to it must behave identically: an operator adjusting WITHIN their role
 * limit, and an admin APPROVING a request that was over it. If approval had its
 * own copy of the money code, an approved ₦10,000 could end up recorded
 * differently from an allowed ₦3,000 — and the ledger is the whole point of 2.3.
 *
 * Rules enforced here:
 *   - a reason is mandatory (2.4.3)
 *   - the limit comes from settings, per role, never from code (2.4.1)
 *   - over the limit NOTHING moves until an admin approves (2.4.4)
 *   - every movement writes a ledger line, and every request is recorded with
 *     who, when and why (2.3, 2.4.5)
 */
class WalletAdjustmentService extends BaseService {
    // Admin is deliberately absent: admins are not limited, and are never
    // checked against this map.
    async getRoleLimit(role) {
        if (role === ROLE.ADMIN) return Infinity
        const settings = await AdminSettingModel.findOne().lean()
        const limits = settings?.walletAdjustmentLimits
        if (!limits) return 0
        // A lean() read turns the Map into a plain object; a hydrated doc keeps
        // it a Map. Handle both so callers don't have to care.
        const raw =
            typeof limits.get === 'function' ? limits.get(role) : limits[role]
        const value = Number(raw)
        // No entry for this role = no self-service allowance, so everything it
        // does becomes a request. Safer than inventing a default.
        return Number.isFinite(value) && value >= 0 ? value : 0
    }

    /**
     * Move the balance and write the ledger line. The ONLY place that does.
     * Throws on failure so callers can't half-apply it.
     */
    async applyAdjustment({
        userId,
        amount,
        type,
        reason,
        performedBy,
        performedByName = 'staff',
        orderId = null,
        orderRef = null,
        viaRequestId = null,
    }) {
        if (!reason || !String(reason).trim()) {
            throw new Error('A reason is required for a wallet adjustment')
        }
        const value = Math.round(Number(amount))
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error('Adjustment amount must be greater than zero')
        }
        if (!['credit', 'debit'].includes(type)) {
            throw new Error('Adjustment type must be credit or debit')
        }

        const wallet = await WalletModel.findOne({ userId })
        if (!wallet) throw new Error('Wallet not found')

        const delta = type === 'credit' ? value : -value
        const guard = { userId: wallet.userId }
        // A debit may not overdraw, and the guard is part of the update so two
        // concurrent debits cannot both pass it.
        if (delta < 0) guard.balance = { $gte: value }

        const updated = await WalletModel.findOneAndUpdate(
            guard,
            { $inc: { balance: delta } },
            { new: true },
        )
        if (!updated) throw new Error('Insufficient balance')

        let ledgerEntry
        try {
            ledgerEntry = await WalletTransactionModel.create({
                userId: getObjectId(userId),
                type: WALLET_TX_TYPE.MANUAL_ADJUSTMENT,
                amount: delta, // signed, so the ledger sums to the balance
                status: 'success',
                description: `Wallet ${type} by ${performedByName}${orderRef ? ` (order ${orderRef})` : ''}${viaRequestId ? ' — approved request' : ''}`,
                reason,
                performedBy: performedBy ? getObjectId(performedBy) : undefined,
                relatedOrderId: orderId || undefined,
                balanceAfter: updated.balance,
                reference: orderRef || undefined,
            })
        } catch (ledgerError) {
            // The ledger IS the record. Rather than leave money moved with no
            // line explaining it, put it back.
            console.log(ledgerError)
            await WalletModel.updateOne(
                { userId: wallet.userId },
                { $inc: { balance: -delta } },
            )
            throw new Error(
                'Could not record the adjustment in the ledger — no money was moved',
            )
        }

        return { wallet: updated, ledgerEntry, delta }
    }

    /**
     * Record an over-limit adjustment for an admin to decide on. Moves nothing.
     */
    async createRequest({
        userId,
        amount,
        type,
        reason,
        requestedBy,
        requestedByRole,
        roleLimit,
        orderId = null,
        orderRef = null,
        customerName = 'the customer',
        requestedByName = 'A staff member',
    }) {
        const request = await WalletAdjustmentRequestModel.create({
            userId: getObjectId(userId),
            amount: Math.round(Number(amount)),
            type,
            reason,
            requestedBy: getObjectId(requestedBy),
            requestedByRole,
            roleLimitAtRequest: roleLimit,
            orderId: orderId || undefined,
        })

        await ActivityModel.create({
            title: 'Wallet Adjustment Requested',
            description: `${requestedByName} requested a ${type} of ₦${amount} for ${customerName}${orderRef ? ` on order ${orderRef}` : ''} — above the ₦${roleLimit} limit for ${requestedByRole}. Reason: ${reason}`,
            type: ACTIVITY_TYPE.WALLET_ADJUSTMENT,
            orderId: orderId || undefined,
            userId: getObjectId(requestedBy),
            reference: orderRef || undefined,
        })

        await createAuditLog({
            userId: getObjectId(requestedBy),
            action: `Requested wallet ${type} of ₦${amount} for ${customerName} (over the ₦${roleLimit} ${requestedByRole} limit). Reason: ${reason}`,
            category: 'wallet',
            orderId: orderId || undefined,
        })

        await this.notifyAdmins({
            title: 'Wallet adjustment needs approval',
            body: `${requestedByName} requested a ${type} of ₦${amount} for ${customerName}. Reason: ${reason}`,
            subBody: orderRef ? `Order ID: ${orderRef}` : undefined,
            type: NOTIFICATION_TYPE.WALLET_ADJUSTMENT,
        })

        return request
    }

    // Brief 4.3 also asks for this: the admin must actually hear about wallet
    // adjustments and requests. Fire-and-forget — a notification failure must
    // never break the money flow.
    async notifyAdmins({ title, body, subBody, type }) {
        try {
            const admins = await UserModel.find({ userType: ROLE.ADMIN })
                .select('_id')
                .lean()
            await Promise.all(
                admins.map((a) =>
                    createNotification({
                        userId: a._id,
                        title,
                        body,
                        subBody,
                        type,
                    }),
                ),
            )
            return admins.length
        } catch (error) {
            console.log(error)
            return 0
        }
    }

    /**
     * Decide a pending request. Approving runs the SAME applyAdjustment the
     * within-limit path uses, so the resulting ledger line is identical.
     */
    async decideRequest({ requestId, approve, adminId, note = '' }) {
        const request = await WalletAdjustmentRequestModel.findById(requestId)
        if (!request) {
            return BaseService.sendFailedResponse({ error: 'Request not found' })
        }
        if (request.status !== WALLET_ADJUSTMENT_REQUEST_STATUS.PENDING) {
            return BaseService.sendFailedResponse({
                error: `This request was already ${request.status}.`,
                status: request.status,
            })
        }

        const admin = await UserModel.findById(adminId).select('fullName').lean()
        const customer = await UserModel.findById(request.userId)
            .select('fullName')
            .lean()
        const now = new Date()

        if (!approve) {
            // Claim it atomically so two admins can't both decide it.
            const claimed = await WalletAdjustmentRequestModel.findOneAndUpdate(
                {
                    _id: request._id,
                    status: WALLET_ADJUSTMENT_REQUEST_STATUS.PENDING,
                },
                {
                    $set: {
                        status: WALLET_ADJUSTMENT_REQUEST_STATUS.REJECTED,
                        decidedBy: getObjectId(adminId),
                        decidedAt: now,
                        decisionNote: note,
                    },
                },
                { new: true },
            )
            if (!claimed) {
                return BaseService.sendFailedResponse({
                    error: 'This request was already decided.',
                })
            }
            await createAuditLog({
                userId: getObjectId(adminId),
                action: `Rejected wallet ${request.type} of ₦${request.amount} for ${customer?.fullName || 'customer'}${note ? `. Note: ${note}` : ''}`,
                category: 'wallet',
                orderId: request.orderId || undefined,
            })
            await createNotification({
                userId: request.requestedBy,
                title: 'Wallet adjustment rejected',
                body: `Your request to ${request.type} ₦${request.amount} was not approved.${note ? ` Note: ${note}` : ''}`,
                type: NOTIFICATION_TYPE.WALLET_ADJUSTMENT,
            })
            return BaseService.sendSuccessResponse({ message: claimed })
        }

        // Claim BEFORE moving money, so a double approval cannot pay twice.
        const claimed = await WalletAdjustmentRequestModel.findOneAndUpdate(
            { _id: request._id, status: WALLET_ADJUSTMENT_REQUEST_STATUS.PENDING },
            {
                $set: {
                    status: WALLET_ADJUSTMENT_REQUEST_STATUS.APPROVED,
                    decidedBy: getObjectId(adminId),
                    decidedAt: now,
                    decisionNote: note,
                },
            },
            { new: true },
        )
        if (!claimed) {
            return BaseService.sendFailedResponse({
                error: 'This request was already decided.',
            })
        }

        let applied
        try {
            applied = await this.applyAdjustment({
                userId: request.userId,
                amount: request.amount,
                type: request.type,
                reason: request.reason,
                performedBy: adminId,
                performedByName: admin?.fullName || 'admin',
                orderId: request.orderId,
                viaRequestId: request._id,
            })
        } catch (error) {
            // Put the request back so it can be decided again — an approval
            // that failed to move money must not read as approved.
            await WalletAdjustmentRequestModel.updateOne(
                { _id: request._id },
                {
                    $set: { status: WALLET_ADJUSTMENT_REQUEST_STATUS.PENDING },
                    $unset: { decidedBy: '', decidedAt: '', decisionNote: '' },
                },
            )
            return BaseService.sendFailedResponse({
                error: error.message || 'Could not apply the adjustment',
            })
        }

        claimed.walletTransactionId = applied.ledgerEntry._id
        claimed.balanceAfter = applied.wallet.balance
        await claimed.save()

        await ActivityModel.create({
            title: 'Wallet Adjustment Approved',
            description: `${admin?.fullName || 'Admin'} approved a ${request.type} of ₦${request.amount} for ${customer?.fullName || 'a customer'}. Reason: ${request.reason}`,
            type: ACTIVITY_TYPE.WALLET_ADJUSTMENT,
            orderId: request.orderId || undefined,
            userId: getObjectId(adminId),
        })
        await createAuditLog({
            userId: getObjectId(adminId),
            action: `Approved wallet ${request.type} of ₦${request.amount} for ${customer?.fullName || 'customer'}. Reason: ${request.reason}. New balance: ₦${applied.wallet.balance}`,
            category: 'wallet',
            orderId: request.orderId || undefined,
        })
        await createNotification({
            userId: request.requestedBy,
            title: 'Wallet adjustment approved',
            body: `Your request to ${request.type} ₦${request.amount} was approved.`,
            type: NOTIFICATION_TYPE.WALLET_ADJUSTMENT,
        })
        await createNotification({
            userId: request.userId,
            title: `Wallet ${request.type === 'credit' ? 'Credit' : 'Debit'} Notification`,
            body: `Your wallet has been ${request.type === 'credit' ? 'credited' : 'debited'} with ₦${request.amount}.`,
            subBody: `Reason: ${request.reason}`,
            type: NOTIFICATION_TYPE.WALLET_ADJUSTMENT,
        })

        return BaseService.sendSuccessResponse({
            message: {
                request: claimed,
                balance: applied.wallet.balance,
                transaction: applied.ledgerEntry,
            },
        })
    }
}

module.exports = new WalletAdjustmentService()
