const BaseService = require('./base.service')
const validateData = require('../util/validate')
const UserModel = require('../models/user.model')
const ReferralModel = require('../models/referral.model')
const ReferralService = require('./referral.service')
const createAuditLog = require('../util/createAuditLog')
const { getObjectId } = require('../util/helper')
const {
    REFERRAL_SOURCE,
    REFERRAL_STATUS,
    AUDIT_LOG_CATEGORIES,
} = require('../util/constants')

// Request-facing surface of the Referral System: the customer Referral Page,
// applying a code post-registration, and staff code reset.
class ReferralApiService extends BaseService {
    async getMyReferralPage(req) {
        try {
            const page = await ReferralService.getReferralPage(req.user.id)
            return BaseService.sendSuccessResponse({ message: page })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load referral page' })
        }
    }

    // Apply a referral code after registration (e.g. entered at first booking).
    async applyCode(req) {
        try {
            const validateResult = validateData(
                req.body,
                { code: 'string|required' },
                { required: ':attribute is required' },
            )
            if (!validateResult.success) {
                return BaseService.sendFailedResponse({ error: validateResult.data })
            }

            const existing = await ReferralModel.findOne({ referredUserId: req.user.id })
            if (existing) {
                return BaseService.sendFailedResponse({
                    error: 'You already have a referrer on record',
                })
            }

            const referral = await ReferralService.captureReferral({
                referredUserId: req.user.id,
                code: req.body.code,
                source: REFERRAL_SOURCE.CODE,
            })
            if (!referral) {
                return BaseService.sendFailedResponse({
                    error: 'That referral code could not be applied (unknown code, your own code, or already referred)',
                })
            }
            return BaseService.sendSuccessResponse({
                message: { applied: true, referralId: referral._id },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to apply referral code' })
        }
    }

    async getMyHistory(req) {
        try {
            const referrals = await ReferralModel.find({ referrerId: req.user.id })
                .sort({ createdAt: -1 })
                .populate('referredUserId', 'fullName')
                .lean()
            const history = referrals.map((r) => ({
                referredName: r.referredUserId?.fullName || 'A friend',
                referralDate: r.createdAt,
                status: r.status,
                rewardStatus: r.rewardStatus,
                rewardAmount: r.rewardAmount || 0,
            }))
            return BaseService.sendSuccessResponse({ message: history })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load referral history' })
        }
    }

    // staff: reset a customer's referral code (rarely needed)
    async resetCode(req) {
        try {
            const { userId } = req.body
            if (!userId) {
                return BaseService.sendFailedResponse({ error: 'userId is required' })
            }
            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const newCode = await ReferralService.resetCode(userId)
            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.SYSTEM,
                action: `Reset referral code for user ${userId}`,
            })
            return BaseService.sendSuccessResponse({ message: { referralCode: newCode } })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to reset referral code' })
        }
    }
}

module.exports = ReferralApiService
