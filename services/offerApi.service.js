const BaseService = require('./base.service')
const validateData = require('../util/validate')
const OfferModel = require('../models/offer.model')
const CustomerOfferModel = require('../models/customerOffer.model')
const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const OfferService = require('./offer.service')
const createAuditLog = require('../util/createAuditLog')
const paginate = require('../util/paginate')
const { getObjectId } = require('../util/helper')
const {
    OFFER_TYPE,
    OFFER_STATUS,
    OFFER_TRIGGER,
    OFFER_BENEFIT_TYPE,
    CUSTOMER_OFFER_STATUS,
    AUDIT_LOG_CATEGORIES,
} = require('../util/constants')

// Request-facing surface of the Offer System: the admin Offer Builder and the
// customer Offer Page endpoints. The linking/pricing engine is offer.service.
class OfferApiService extends BaseService {
    // ─── Offer Builder (admin) ───────────────────────────────────────────────

    async listOffers(req) {
        try {
            const { type, status, page, limit } = req.query
            const query = {}
            if (type) query.type = type
            if (status) query.status = status
            const { data, pagination } = await paginate(OfferModel, query, {
                page,
                limit,
                sort: { createdAt: -1 },
                lean: true,
            })
            return BaseService.sendSuccessResponse({ message: { data, pagination } })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to list offers' })
        }
    }

    validateOfferPayload(post, { isCreate }) {
        if (isCreate) {
            const validateResult = validateData(
                post,
                {
                    name: 'string|required',
                    headline: 'string|required',
                    type: 'string|required',
                },
                { required: ':attribute is required' },
            )
            if (!validateResult.success) return validateResult.data
        }
        if (post.type && !Object.values(OFFER_TYPE).includes(post.type)) {
            return `type must be one of: ${Object.values(OFFER_TYPE).join(', ')}`
        }
        if (post.trigger && !Object.values(OFFER_TRIGGER).includes(post.trigger)) {
            return `trigger must be one of: ${Object.values(OFFER_TRIGGER).join(', ')}`
        }
        if (post.status && !Object.values(OFFER_STATUS).includes(post.status)) {
            return `status must be one of: ${Object.values(OFFER_STATUS).join(', ')}`
        }
        if (post.benefits !== undefined) {
            if (!Array.isArray(post.benefits) || post.benefits.length === 0) {
                return 'benefits must be a non-empty array'
            }
            for (const b of post.benefits) {
                if (!Object.values(OFFER_BENEFIT_TYPE).includes(b.benefitType)) {
                    return `benefitType must be one of: ${Object.values(OFFER_BENEFIT_TYPE).join(', ')}`
                }
            }
        }
        if (
            isCreate &&
            post.type === OFFER_TYPE.PERSONAL &&
            !post.trigger
        ) {
            return 'Personal offers need a trigger (use "manual" for staff-assigned offers)'
        }
        return null
    }

    async createOffer(req) {
        try {
            const post = req.body
            const invalid = this.validateOfferPayload(post, { isCreate: true })
            if (invalid) return BaseService.sendFailedResponse({ error: invalid })
            if (!Array.isArray(post.benefits) || !post.benefits.length) {
                return BaseService.sendFailedResponse({
                    error: 'benefits must be a non-empty array',
                })
            }

            const offer = await OfferModel.create({
                name: post.name,
                headline: post.headline,
                description: post.description,
                type: post.type,
                trigger: post.type === OFFER_TYPE.PERSONAL ? post.trigger : undefined,
                benefits: post.benefits,
                rules: post.rules || {},
                startDate: post.startDate,
                expiryDate: post.expiryDate,
                customerWindowDays: post.customerWindowDays,
                usageLimit: post.usageLimit,
                status: post.status || OFFER_STATUS.DRAFT,
                stackableWithPersonal: !!post.stackableWithPersonal,
                creditExpiryDays: post.creditExpiryDays,
                createdBy: getObjectId(req.user.id),
            })

            await createAuditLog({
                userId: getObjectId(req.user.id),
                action: `Created offer "${offer.name}" (${offer.type}, ${offer.status})`,
                category: AUDIT_LOG_CATEGORIES.OFFER,
            })
            return BaseService.sendSuccessResponse({ message: offer })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to create offer' })
        }
    }

    async updateOffer(req) {
        try {
            const { id } = req.params
            const post = req.body
            const offer = await OfferModel.findById(id)
            if (!offer) return BaseService.sendFailedResponse({ error: 'Offer not found' })

            const invalid = this.validateOfferPayload(post, { isCreate: false })
            if (invalid) return BaseService.sendFailedResponse({ error: invalid })

            const editable = [
                'name', 'headline', 'description', 'trigger', 'benefits', 'rules',
                'startDate', 'expiryDate', 'customerWindowDays', 'usageLimit',
                'status', 'stackableWithPersonal', 'creditExpiryDays',
            ]
            for (const field of editable) {
                if (post[field] !== undefined) offer[field] = post[field]
            }
            offer.updatedBy = getObjectId(req.user.id)
            await offer.save()

            await createAuditLog({
                userId: getObjectId(req.user.id),
                action: `Updated offer "${offer.name}" (status: ${offer.status})`,
                category: AUDIT_LOG_CATEGORIES.OFFER,
            })
            return BaseService.sendSuccessResponse({ message: offer })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to update offer' })
        }
    }

    async getOfferPerformance(req) {
        try {
            const { id } = req.params
            const offer = await OfferModel.findById(id).lean()
            if (!offer) return BaseService.sendFailedResponse({ error: 'Offer not found' })
            const performance = await OfferService.getPerformance(offer._id)
            return BaseService.sendSuccessResponse({
                message: { offer, performance },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load performance' })
        }
    }

    async assignOffer(req) {
        try {
            const post = req.body
            const validateResult = validateData(
                post,
                { userId: 'string|required', offerId: 'string|required' },
                { required: ':attribute is required' },
            )
            if (!validateResult.success) {
                return BaseService.sendFailedResponse({ error: validateResult.data })
            }
            const targetUser = await UserModel.findById(post.userId)
            if (!targetUser) {
                return BaseService.sendFailedResponse({ error: 'User not found' })
            }

            const linkage = await OfferService.assignManual({
                userId: post.userId,
                offerId: post.offerId,
                assignedBy: getObjectId(req.user.id),
                note: post.note,
            })

            await createAuditLog({
                userId: getObjectId(req.user.id),
                action: `Manually assigned offer ${post.offerId} to user ${post.userId}`,
                category: AUDIT_LOG_CATEGORIES.OFFER,
            })
            return BaseService.sendSuccessResponse({ message: linkage })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: error.message || 'Failed to assign offer',
            })
        }
    }

    async cancelLinkage(req) {
        try {
            const { id } = req.params
            const { reason } = req.body
            if (!reason || !String(reason).trim()) {
                return BaseService.sendFailedResponse({
                    error: 'A reason is required to cancel a customer offer',
                })
            }
            const linkage = await CustomerOfferModel.findById(id)
            if (!linkage) {
                return BaseService.sendFailedResponse({ error: 'Customer offer not found' })
            }
            if (linkage.status === CUSTOMER_OFFER_STATUS.REDEEMED) {
                return BaseService.sendFailedResponse({
                    error: 'Redeemed offers cannot be cancelled — use the order correction flow',
                })
            }
            linkage.status = CUSTOMER_OFFER_STATUS.CANCELLED
            linkage.note = [linkage.note, `Cancelled: ${reason}`].filter(Boolean).join(' | ')
            await linkage.save()

            await createAuditLog({
                userId: getObjectId(req.user.id),
                action: `Cancelled customer offer ${id}: ${reason}`,
                category: AUDIT_LOG_CATEGORIES.OFFER,
            })
            return BaseService.sendSuccessResponse({ message: linkage })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to cancel customer offer' })
        }
    }

    // ─── Customer Offer Page (user) ──────────────────────────────────────────

    async myOffers(req) {
        try {
            const result = await OfferService.getCustomerOffers(req.user.id)
            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load offers' })
        }
    }

    async viewOffer(req) {
        try {
            const linkage = await OfferService.markViewed(req.user.id, req.params.id)
            return BaseService.sendSuccessResponse({ message: linkage })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: error.message || 'Failed to mark offer viewed',
            })
        }
    }

    async validateOffer(req) {
        try {
            const breakdown = await OfferService.validateAndPrice(
                req.user.id,
                req.body || {},
            )
            return BaseService.sendSuccessResponse({ message: breakdown })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to price offers' })
        }
    }

    async attachOffer(req) {
        try {
            const post = req.body
            const validateResult = validateData(
                post,
                {
                    customerOfferId: 'string|required',
                    bookOrderId: 'string|required',
                },
                { required: ':attribute is required' },
            )
            if (!validateResult.success) {
                return BaseService.sendFailedResponse({ error: validateResult.data })
            }

            const order = await BookOrderModel.findOne({
                _id: post.bookOrderId,
                userId: req.user.id,
            })
            if (!order) {
                return BaseService.sendFailedResponse({ error: 'Order not found' })
            }

            const linkage = await OfferService.attachToOrder(
                req.user.id,
                post.customerOfferId,
                order._id,
            )
            return BaseService.sendSuccessResponse({ message: linkage })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: error.message || 'Failed to attach offer',
            })
        }
    }
}

module.exports = OfferApiService
