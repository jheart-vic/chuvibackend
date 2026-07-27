const mongoose = require('mongoose')
const OfferModel = require('../models/offer.model')
const CustomerOfferModel = require('../models/customerOffer.model')
const CrmProfileModel = require('../models/crmProfile.model')
const WalletCreditService = require('./walletCredit.service')
const CommunicationService = require('./communication.service')
const {
    OFFER_TYPE,
    OFFER_STATUS,
    CUSTOMER_OFFER_STATUS,
    OFFER_BENEFIT_TYPE,
    CREDIT_TYPE,
    CREDIT_SOURCE,
    COMM_SOURCE_SYSTEM,
} = require('../util/constants')

const DAY = 24 * 60 * 60 * 1000

// linkage statuses that still "hold" the offer for the customer
const LIVE_LINKAGE_STATUSES = [
    CUSTOMER_OFFER_STATUS.ASSIGNED,
    CUSTOMER_OFFER_STATUS.VIEWED,
    CUSTOMER_OFFER_STATUS.ATTACHED,
]

// A linkage that can still be freshly applied to an order. ATTACHED/REDEEMED are
// deliberately excluded — those are already committed to an order, so re-applying
// them (or a one-use offer again) would be a double-use.
const APPLICABLE_LINKAGE_STATUSES = [
    CUSTOMER_OFFER_STATUS.ASSIGNED,
    CUSTOMER_OFFER_STATUS.VIEWED,
]

// A linkage that has been committed to an order (used up for one-use purposes),
// whether or not the order has been delivered/redeemed yet.
const COMMITTED_LINKAGE_STATUSES = [
    CUSTOMER_OFFER_STATUS.ATTACHED,
    CUSTOMER_OFFER_STATUS.REDEEMED,
]

// The "smart offer linker". Staff create offers once in the Offer Builder;
// this engine finds the matching ACTIVE offer when an event fires, checks
// eligibility, links it (customerOffer), prices benefits at booking, redeems
// on delivery and releases on cancellation. It never creates offers.
class OfferService {
    // ─── lookups ─────────────────────────────────────────────────────────────

    isWithinWindow(offer, now = new Date()) {
        if (offer.startDate && offer.startDate > now) return false
        if (offer.expiryDate && offer.expiryDate < now) return false
        return true
    }

    hasGlobalCapacity(offer) {
        return offer.usageLimit == null || offer.usedCount < offer.usageLimit
    }

    async getActiveOfferForTrigger(trigger) {
        const offers = await OfferModel.find({
            type: OFFER_TYPE.PERSONAL,
            trigger,
            status: OFFER_STATUS.ACTIVE,
        }).sort({ createdAt: -1 })
        return (
            offers.find((o) => this.isWithinWindow(o) && this.hasGlobalCapacity(o)) ||
            null
        )
    }

    // customer history for rule checks — CRM profile when it exists,
    // zero-history defaults otherwise (brand-new account)
    async getCustomerStats(userId) {
        const profile = await CrmProfileModel.findOne({ userId }).lean()
        return {
            stage: profile?.stage || null,
            tags: profile?.tags || [],
            totalOrders: profile?.totalOrders || 0,
            lastOrderAt: profile?.lastOrderAt || null,
        }
    }

    // profile-level eligibility (assignment time AND re-checked at booking)
    checkProfileRules(offer, stats) {
        const r = offer.rules || {}
        if (r.stages?.length && !r.stages.includes(stats.stage)) {
            return { ok: false, reason: 'Customer stage not eligible' }
        }
        if (r.tags?.length && !r.tags.some((t) => stats.tags.includes(t))) {
            return { ok: false, reason: 'Customer tags not eligible' }
        }
        if (r.minOrders != null && stats.totalOrders < r.minOrders) {
            return { ok: false, reason: 'Not enough completed orders' }
        }
        if (r.maxOrders != null && stats.totalOrders > r.maxOrders) {
            return { ok: false, reason: 'Too many completed orders' }
        }
        if (r.firstOrderOnly && stats.totalOrders > 0) {
            return { ok: false, reason: 'First order only' }
        }
        if (r.daysSinceLastOrder != null) {
            if (!stats.lastOrderAt) {
                return { ok: false, reason: 'No previous order' }
            }
            const days = (Date.now() - new Date(stats.lastOrderAt).getTime()) / DAY
            if (days < r.daysSinceLastOrder) {
                return { ok: false, reason: 'Last order too recent' }
            }
        }
        return { ok: true }
    }

    // order-level eligibility (booking time only)
    checkBookingRules(offer, draft) {
        const r = offer.rules || {}
        if (r.minOrderValue != null && (draft.amount || 0) < r.minOrderValue) {
            return { ok: false, reason: `Minimum order value ₦${r.minOrderValue}` }
        }
        // Item count: honour an explicit draft.itemCount, otherwise derive it
        // from the items array (sum of quantities) — callers (booking + the
        // /offers/validate quote) send `items`, not `itemCount`.
        const itemCount =
            draft.itemCount != null
                ? draft.itemCount
                : Array.isArray(draft.items)
                  ? draft.items.reduce((n, i) => n + (Number(i.quantity) || 0), 0)
                  : 0
        if (r.minItems != null && itemCount < r.minItems) {
            return { ok: false, reason: `Minimum ${r.minItems} items` }
        }
        if (
            r.serviceTypes?.length &&
            draft.serviceType &&
            !r.serviceTypes.includes(draft.serviceType)
        ) {
            return { ok: false, reason: 'Service type not eligible' }
        }
        return { ok: true }
    }

    // ─── trigger → linkage ───────────────────────────────────────────────────

    // Called (fire-and-forget via util/offerHooks.js) when a connected system
    // reports an event. Finds the configured offer, checks everything, links.
    async handleTrigger(trigger, { userId, milestoneKey, assignedBy, note } = {}) {
        if (!userId) return null // account-less leads can't hold linkages

        const offer = await this.getActiveOfferForTrigger(trigger)
        if (!offer) return null

        // duplicate guards: same event never rewards twice; one live/used
        // linkage per customer when the offer is one-use
        if (milestoneKey) {
            const dupe = await CustomerOfferModel.findOne({
                offerId: offer._id,
                userId,
                milestoneKey,
            })
            if (dupe) return null
        }
        if (offer.rules?.oneUsePerCustomer && !milestoneKey) {
            const existing = await CustomerOfferModel.findOne({
                offerId: offer._id,
                userId,
                status: {
                    $in: [...LIVE_LINKAGE_STATUSES, CUSTOMER_OFFER_STATUS.REDEEMED],
                },
            })
            if (existing) return null
        }

        const stats = await this.getCustomerStats(userId)
        const eligible = this.checkProfileRules(offer, stats)
        if (!eligible.ok) return null

        const now = Date.now()
        let expiresAt = new Date(now + (offer.customerWindowDays || 14) * DAY)
        if (offer.expiryDate && offer.expiryDate < expiresAt) {
            expiresAt = offer.expiryDate
        }

        let linkage
        try {
            linkage = await CustomerOfferModel.create({
                userId,
                offerId: offer._id,
                milestoneKey,
                expiresAt,
                assignedBy,
                note,
            })
        } catch (err) {
            if (err.code === 11000) return null // milestone raced — already assigned
            throw err
        }

        await CommunicationService.send({
            userId,
            templateKey: 'offer-available',
            data: { offerName: offer.name },
            sourceSystem: COMM_SOURCE_SYSTEM.OFFER,
            messageType: 'offer-available',
            relatedRef: linkage._id,
            relatedModel: 'CustomerOffer',
        })

        return linkage
    }

    // Staff manual assignment — bypasses profile eligibility (staff judgment
    // call) but still respects one-use dedupe, status and capacity.
    async assignManual({ userId, offerId, assignedBy, note }) {
        const offer = await OfferModel.findById(offerId)
        if (!offer) throw new Error('Offer not found')
        if (offer.status !== OFFER_STATUS.ACTIVE) {
            throw new Error('Only active offers can be assigned')
        }
        if (!this.isWithinWindow(offer)) throw new Error('Offer is outside its date window')
        if (!this.hasGlobalCapacity(offer)) throw new Error('Offer usage limit reached')
        if (offer.rules?.oneUsePerCustomer) {
            const existing = await CustomerOfferModel.findOne({
                offerId,
                userId,
                status: {
                    $in: [...LIVE_LINKAGE_STATUSES, CUSTOMER_OFFER_STATUS.REDEEMED],
                },
            })
            if (existing) throw new Error('Customer already has this offer')
        }

        const now = Date.now()
        let expiresAt = new Date(now + (offer.customerWindowDays || 14) * DAY)
        if (offer.expiryDate && offer.expiryDate < expiresAt) expiresAt = offer.expiryDate

        const linkage = await CustomerOfferModel.create({
            userId,
            offerId,
            expiresAt,
            assignedBy,
            note,
        })

        await CommunicationService.send({
            userId,
            templateKey: 'offer-available',
            data: { offerName: offer.name },
            sourceSystem: COMM_SOURCE_SYSTEM.OFFER,
            messageType: 'offer-available',
            relatedRef: linkage._id,
            relatedModel: 'CustomerOffer',
        })
        return linkage
    }

    // ─── customer offer page ─────────────────────────────────────────────────

    async getCustomerOffers(userId) {
        const now = new Date()

        // Your Rewards: live personal linkages
        const rewards = await CustomerOfferModel.find({
            userId,
            status: { $in: LIVE_LINKAGE_STATUSES },
            expiresAt: { $gt: now },
        })
            .sort({ expiresAt: 1 })
            .populate('offerId')
            .lean()

        // Current Promotions: active promos this customer qualifies for
        const stats = await this.getCustomerStats(userId)
        const promos = await OfferModel.find({
            type: OFFER_TYPE.PROMOTIONAL,
            status: OFFER_STATUS.ACTIVE,
        }).lean()
        const promotions = []
        for (const promo of promos) {
            if (!this.isWithinWindow(promo, now) || !this.hasGlobalCapacity(promo)) {
                continue
            }
            if (!this.checkProfileRules(promo, stats).ok) continue

            // One-use promos the customer has already committed to (attached or
            // redeemed) stay in the list but flagged disabled with a reason, so
            // the frontend can show a greyed-out entry instead of it vanishing.
            let used = false
            if (promo.rules?.oneUsePerCustomer) {
                const u = await CustomerOfferModel.findOne({
                    offerId: promo._id,
                    userId,
                    status: { $in: COMMITTED_LINKAGE_STATUSES },
                })
                used = !!u
            }
            promotions.push({
                ...promo,
                used,
                disabled: used,
                disabledReason: used ? 'You have already used this promotion' : null,
            })
        }

        // Always Available: active baseline policies
        const baseline = await OfferModel.find({
            type: OFFER_TYPE.BASELINE,
            status: OFFER_STATUS.ACTIVE,
        }).lean()

        return {
            rewards: rewards.filter((r) => r.offerId), // guard vs deleted offers
            promotions,
            baseline: baseline.filter((b) => this.isWithinWindow(b, now)),
        }
    }

    // Admin: every offer linkage for a customer (all statuses by default), so
    // staff can find the linkage id to cancel. Includes history (redeemed /
    // cancelled / expired), newest first.
    async listCustomerLinkages(userId, { status } = {}) {
        const q = { userId }
        if (status && status !== 'all') q.status = status
        return CustomerOfferModel.find(q)
            .sort({ createdAt: -1 })
            .populate('offerId')
            .lean()
    }

    // Customer: their own offer/promotion usage history — linkages already
    // committed to an order (attached or redeemed), newest first. This is what
    // the frontend shows as "promotions you've used".
    async getCustomerUsage(userId) {
        return CustomerOfferModel.find({
            userId,
            status: { $in: COMMITTED_LINKAGE_STATUSES },
        })
            .sort({ createdAt: -1 })
            .populate('offerId')
            .lean()
    }

    async markViewed(userId, customerOfferId) {
        const linkage = await CustomerOfferModel.findOne({
            _id: customerOfferId,
            userId,
        })
        if (!linkage) throw new Error('Offer not found')
        if (linkage.status === CUSTOMER_OFFER_STATUS.ASSIGNED) {
            linkage.status = CUSTOMER_OFFER_STATUS.VIEWED
            linkage.viewedAt = new Date()
            await linkage.save()
        }
        return linkage
    }

    // ─── pricing ─────────────────────────────────────────────────────────────

    // Computes what one offer's benefits are worth against an order draft:
    // { amount, itemCount, serviceType, deliveryAmount, pickupAmount, items[] }
    computeBenefits(offer, draft) {
        const result = {
            discount: 0,
            freePickup: false,
            freeDelivery: false,
            creditPromised: 0,
            notes: [],
        }
        for (const b of offer.benefits || []) {
            switch (b.benefitType) {
                case OFFER_BENEFIT_TYPE.ORDER_DISCOUNT: {
                    if (b.percent) {
                        result.discount += Math.round((draft.amount || 0) * (b.percent / 100))
                    } else if (b.amount) {
                        result.discount += b.amount
                    }
                    break
                }
                case OFFER_BENEFIT_TYPE.FREE_PICKUP:
                    result.freePickup = true
                    break
                case OFFER_BENEFIT_TYPE.FREE_DELIVERY:
                    result.freeDelivery = true
                    break
                case OFFER_BENEFIT_TYPE.FREE_ITEMS: {
                    const items = draft.items || []
                    if (!items.length) {
                        result.notes.push('free-items skipped: no item breakdown given')
                        break
                    }
                    const eligible = items
                        .flatMap((it) =>
                            Array(it.quantity || 1).fill({ type: it.type, price: it.price || 0 }),
                        )
                        .filter(
                            (it) =>
                                !b.eligibleItemTypes?.length ||
                                b.eligibleItemTypes.includes(it.type),
                        )
                        .sort((a, z) => a.price - z.price)
                    const paidNeeded = b.minPaidItems || 0
                    if (eligible.length <= paidNeeded) {
                        result.notes.push('free-items skipped: not enough eligible items')
                        break
                    }
                    const freeCount = Math.min(
                        b.freeItemCount || 0,
                        eligible.length - paidNeeded,
                    )
                    let freeValue = eligible
                        .slice(0, freeCount)
                        .reduce((s, it) => s + it.price, 0)
                    if (b.maxFreeValue != null) freeValue = Math.min(freeValue, b.maxFreeValue)
                    result.discount += freeValue
                    break
                }
                case OFFER_BENEFIT_TYPE.EXTRA_LAUNDRY_CREDIT: {
                    if (b.minOrderValue != null && (draft.amount || 0) < b.minOrderValue) {
                        result.notes.push(
                            `extra credit needs a minimum order of ₦${b.minOrderValue}`,
                        )
                        break
                    }
                    result.creditPromised += b.creditAmount || 0
                    break
                }
                default:
                    break
            }
        }
        return result
    }

    // Full booking-time quote. Enforces the agreed stacking rules:
    // baseline always; max ONE personal offer; promo only alongside personal
    // when the promo is flagged stackableWithPersonal; one promo per order.
    async validateAndPrice(userId, draft = {}) {
        const now = new Date()
        const breakdown = {
            baseline: [],
            personal: null,
            promotion: null,
            totalDiscount: 0,
            freePickup: false,
            freeDelivery: false,
            creditPromised: 0,
            rejected: [],
        }

        // 1. baseline policies — apply by rule, no linkage needed
        const baselines = await OfferModel.find({
            type: OFFER_TYPE.BASELINE,
            status: OFFER_STATUS.ACTIVE,
        })
        for (const b of baselines) {
            if (!this.isWithinWindow(b, now)) continue
            if (!this.checkBookingRules(b, draft).ok) continue
            const value = this.computeBenefits(b, draft)
            breakdown.baseline.push({ offerId: b._id, name: b.name, ...value })
            breakdown.totalDiscount += value.discount
            breakdown.freePickup = breakdown.freePickup || value.freePickup
            breakdown.freeDelivery = breakdown.freeDelivery || value.freeDelivery
            breakdown.creditPromised += value.creditPromised
        }

        const stats = await this.getCustomerStats(userId)

        // 2. one personal offer via its linkage
        if (draft.customerOfferId) {
            const linkage = await CustomerOfferModel.findOne({
                _id: draft.customerOfferId,
                userId,
            }).populate('offerId')
            const offer = linkage?.offerId
            let reason = null
            if (!linkage || !offer) reason = 'Offer not found'
            else if (COMMITTED_LINKAGE_STATUSES.includes(linkage.status))
                reason = 'Offer already applied to an order'
            else if (!APPLICABLE_LINKAGE_STATUSES.includes(linkage.status))
                reason = 'Offer already used or no longer available'
            else if (linkage.expiresAt && linkage.expiresAt < now)
                reason = 'Offer has expired'
            else if (offer.status !== OFFER_STATUS.ACTIVE || !this.isWithinWindow(offer, now))
                reason = 'Offer is no longer active'
            else if (!this.hasGlobalCapacity(offer)) reason = 'Offer fully redeemed'
            else {
                const p = this.checkProfileRules(offer, stats)
                const bk = this.checkBookingRules(offer, draft)
                if (!p.ok) reason = p.reason
                else if (!bk.ok) reason = bk.reason
            }
            if (reason) {
                breakdown.rejected.push({ which: 'personal', reason })
            } else {
                const value = this.computeBenefits(offer, draft)
                breakdown.personal = {
                    customerOfferId: linkage._id,
                    offerId: offer._id,
                    name: offer.name,
                    ...value,
                }
                breakdown.totalDiscount += value.discount
                breakdown.freePickup = breakdown.freePickup || value.freePickup
                breakdown.freeDelivery = breakdown.freeDelivery || value.freeDelivery
                breakdown.creditPromised += value.creditPromised
            }
        }

        // 3. one promotional campaign, if stacking allows
        if (draft.promoOfferId) {
            const promo = await OfferModel.findById(draft.promoOfferId)
            let reason = null
            if (!promo || promo.type !== OFFER_TYPE.PROMOTIONAL) reason = 'Promotion not found'
            else if (promo.status !== OFFER_STATUS.ACTIVE || !this.isWithinWindow(promo, now))
                reason = 'Promotion is no longer active'
            else if (!this.hasGlobalCapacity(promo)) reason = 'Promotion fully redeemed'
            else if (breakdown.personal && !promo.stackableWithPersonal)
                reason = 'This promotion cannot be combined with a personal reward'
            else {
                const p = this.checkProfileRules(promo, stats)
                const bk = this.checkBookingRules(promo, draft)
                if (!p.ok) reason = p.reason
                else if (!bk.ok) reason = bk.reason
                else if (promo.rules?.oneUsePerCustomer) {
                    // "Used" = already committed to any order (attached or
                    // redeemed), so a second booking can't stack it before the
                    // first order is delivered.
                    const used = await CustomerOfferModel.findOne({
                        offerId: promo._id,
                        userId,
                        status: { $in: COMMITTED_LINKAGE_STATUSES },
                    })
                    if (used) reason = 'Promotion already used'
                }
            }
            if (reason) {
                breakdown.rejected.push({ which: 'promotion', reason })
            } else {
                const value = this.computeBenefits(promo, draft)
                breakdown.promotion = { offerId: promo._id, name: promo.name, ...value }
                breakdown.totalDiscount += value.discount
                breakdown.freePickup = breakdown.freePickup || value.freePickup
                breakdown.freeDelivery = breakdown.freeDelivery || value.freeDelivery
                breakdown.creditPromised += value.creditPromised
            }
        }

        // final numbers — discount never exceeds the order amount
        const amount = draft.amount || 0
        breakdown.totalDiscount = Math.min(breakdown.totalDiscount, amount)
        const deliverySaved = breakdown.freeDelivery ? draft.deliveryAmount || 0 : 0
        const pickupSaved = breakdown.freePickup ? draft.pickupAmount || 0 : 0
        breakdown.payable = Math.max(
            amount - breakdown.totalDiscount +
                (draft.deliveryAmount || 0) - deliverySaved +
                (draft.pickupAmount || 0) - pickupSaved,
            0,
        )
        return breakdown
    }

    // ─── booking lifecycle ───────────────────────────────────────────────────

    // Attach a personal offer to a created order (re-checks the essentials).
    async attachToOrder(userId, customerOfferId, orderId) {
        const now = new Date()
        const linkage = await CustomerOfferModel.findOne({
            _id: customerOfferId,
            userId,
        }).populate('offerId')
        if (!linkage || !linkage.offerId) throw new Error('Offer not found')
        if (COMMITTED_LINKAGE_STATUSES.includes(linkage.status)) {
            throw new Error('Offer already applied to an order')
        }
        if (!APPLICABLE_LINKAGE_STATUSES.includes(linkage.status)) {
            throw new Error('Offer already used or no longer available')
        }
        if (linkage.expiresAt && linkage.expiresAt < now) {
            throw new Error('Offer has expired')
        }
        if (linkage.offerId.status !== OFFER_STATUS.ACTIVE) {
            throw new Error('Offer is no longer active')
        }
        const alreadyOnOrder = await CustomerOfferModel.findOne({
            orderId,
            status: CUSTOMER_OFFER_STATUS.ATTACHED,
            _id: { $ne: linkage._id },
        })
        if (alreadyOnOrder) {
            throw new Error('Only one personal reward may be used per order')
        }

        linkage.status = CUSTOMER_OFFER_STATUS.ATTACHED
        linkage.orderId = orderId
        linkage.attachedAt = now
        await linkage.save()
        return linkage
    }

    // Attach a promotional offer to a created order. Promos have no standing
    // per-customer linkage, so we create an ATTACHED CustomerOffer record here —
    // then redeem/release treat it exactly like a personal one.
    async attachPromoToOrder(userId, promoOfferId, orderId) {
        const promo = await OfferModel.findById(promoOfferId)
        if (!promo || promo.type !== OFFER_TYPE.PROMOTIONAL) {
            throw new Error('Promotion not found')
        }
        const existing = await CustomerOfferModel.findOne({
            orderId,
            offerId: promoOfferId,
        })
        if (existing) return existing
        return CustomerOfferModel.create({
            userId,
            offerId: promoOfferId,
            status: CUSTOMER_OFFER_STATUS.ATTACHED,
            orderId,
            attachedAt: new Date(),
            expiresAt: promo.expiryDate || undefined,
        })
    }

    // Order delivered → linkage consumed for good; credit benefits granted.
    async redeemForOrder(order) {
        const orderId = order._id || order
        const linkages = await CustomerOfferModel.find({
            orderId,
            status: CUSTOMER_OFFER_STATUS.ATTACHED,
        }).populate('offerId')

        for (const linkage of linkages) {
            linkage.status = CUSTOMER_OFFER_STATUS.REDEEMED
            linkage.redeemedAt = new Date()
            await linkage.save()

            const offer = linkage.offerId
            if (!offer) continue
            await OfferModel.updateOne({ _id: offer._id }, { $inc: { usedCount: 1 } })

            // grant promised extra laundry credit now that the order completed
            for (const b of offer.benefits || []) {
                if (b.benefitType !== OFFER_BENEFIT_TYPE.EXTRA_LAUNDRY_CREDIT) continue
                if (
                    b.minOrderValue != null &&
                    (order.amount || 0) < b.minOrderValue
                ) continue
                if (!b.creditAmount) continue
                const expiresAt = offer.creditExpiryDays
                    ? new Date(Date.now() + offer.creditExpiryDays * DAY)
                    : undefined // WalletCreditService falls back to RewardSetting
                await WalletCreditService.grantCredit({
                    userId: linkage.userId,
                    type: CREDIT_TYPE.LAUNDRY,
                    amount: b.creditAmount,
                    sourceSystem: CREDIT_SOURCE.OFFER,
                    sourceRef: `offer-${linkage._id}`,
                    relatedOfferId: offer._id,
                    note: `${offer.name} reward`,
                    expiresAt,
                })
            }
        }
        return linkages.length
    }

    // Order cancelled/corrected → the offer must not be consumed.
    async releaseForOrder(orderId, { reason = 'Order cancelled' } = {}) {
        const linkages = await CustomerOfferModel.find({
            orderId,
            status: {
                $in: [CUSTOMER_OFFER_STATUS.ATTACHED, CUSTOMER_OFFER_STATUS.REDEEMED],
            },
        })
        for (const linkage of linkages) {
            const wasRedeemed = linkage.status === CUSTOMER_OFFER_STATUS.REDEEMED
            linkage.status =
                linkage.expiresAt && linkage.expiresAt < new Date()
                    ? CUSTOMER_OFFER_STATUS.EXPIRED
                    : CUSTOMER_OFFER_STATUS.ASSIGNED
            linkage.orderId = undefined
            linkage.attachedAt = undefined
            linkage.redeemedAt = undefined
            linkage.note = [linkage.note, reason].filter(Boolean).join(' | ')
            await linkage.save()
            if (wasRedeemed) {
                await OfferModel.updateOne(
                    { _id: linkage.offerId },
                    { $inc: { usedCount: -1 } },
                )
            }
        }
        return linkages.length
    }

    // ─── maintenance (cron) ──────────────────────────────────────────────────

    async expireDue() {
        const now = new Date()
        const offers = await OfferModel.updateMany(
            {
                status: { $in: [OFFER_STATUS.ACTIVE, OFFER_STATUS.PAUSED] },
                expiryDate: { $lte: now },
            },
            { $set: { status: OFFER_STATUS.EXPIRED } },
        )
        const linkages = await CustomerOfferModel.updateMany(
            {
                status: {
                    $in: [CUSTOMER_OFFER_STATUS.ASSIGNED, CUSTOMER_OFFER_STATUS.VIEWED],
                },
                expiresAt: { $lte: now },
            },
            { $set: { status: CUSTOMER_OFFER_STATUS.EXPIRED } },
        )
        return {
            offersExpired: offers.modifiedCount,
            linkagesExpired: linkages.modifiedCount,
        }
    }

    // ─── reporting ───────────────────────────────────────────────────────────

    async getPerformance(offerId) {
        const counts = await CustomerOfferModel.aggregate([
            {
                $match: {
                    offerId:
                        typeof offerId === 'string'
                            ? new mongoose.Types.ObjectId(offerId)
                            : offerId,
                },
            },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        const byStatus = {}
        for (const s of Object.values(CUSTOMER_OFFER_STATUS)) byStatus[s] = 0
        for (const c of counts) byStatus[c._id] = c.count
        const assignedTotal = Object.values(byStatus).reduce((a, b) => a + b, 0)
        return {
            byStatus,
            assignedTotal,
            redemptionRate: assignedTotal
                ? Math.round((byStatus.redeemed / assignedTotal) * 100)
                : 0,
        }
    }
}

module.exports = new OfferService()
