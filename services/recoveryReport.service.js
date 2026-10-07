const BaseService = require('./base.service')
const FeedbackModel = require('../models/feedback.model')
const ComplaintCaseModel = require('../models/complaintCase.model')
const ComplaintTypeModel = require('../models/complaintType.model')
const CustomerOfferModel = require('../models/customerOffer.model')
const OfferModel = require('../models/offer.model')
const BookOrderModel = require('../models/bookOrder.model')
const { monthRange, monthKey } = require('../util/lagosDay')
const {
    ORDER_STATUS,
    OFFER_TRIGGER,
    RECOVERY_CREDIT_STATUS,
    RECOVERY_COMPENSATION_TYPE,
} = require('../util/constants')

// §2 N2 (client brief 6 Oct 2026) — "Recovery, Complaints and Feedback"
// dashboard. One admin screen beside the CRM Dashboard, built like the Monthly
// Lead Report: a month picker and a set of cards.
//
// Three rules this file follows, all of them learned the hard way elsewhere in
// this codebase:
//
//  1. Months are LAGOS months (`util/lagosDay.monthRange`), half-open [from,to).
//     Chuvi operates only in Lagos; a UTC month boundary moves ~25 figures by an
//     hour and the error is invisible on a dev machine in Nigeria.
//  2. "Delivered in the month" is read off the DELIVERED entry in `stageHistory`,
//     never off the order's `updatedAt`. The dashboard's existing average-
//     processing-time figure uses `updatedAt` and we flagged it to the client as
//     a flaw (§3 Q1): editing an old delivered order drags it into today's
//     numbers. Not repeating it here.
//  3. A score of 0 is a real NPS answer (the angriest detractor). Everything here
//     tests `!= null`, never falsiness.
class RecoveryReportService extends BaseService {
    // Share as a whole number, 0 when there is nothing to divide by. Returning 0
    // rather than null keeps the cards printable; `*Count` fields beside each
    // figure tell the admin whether it rests on any data at all.
    _pct(part, whole) {
        if (!whole) return 0
        return Math.round((part / whole) * 100)
    }

    _round1(n) {
        return Math.round(n * 10) / 10
    }

    // Orders DELIVERED inside the window, by the timestamp on the DELIVERED
    // stage-history entry. Used as the denominator of "feedback received".
    async _deliveredInRange(from, to) {
        const rows = await BookOrderModel.aggregate([
            { $match: { 'stage.status': ORDER_STATUS.DELIVERED } },
            {
                $project: {
                    deliveredAt: {
                        $let: {
                            vars: {
                                entry: {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: '$stageHistory',
                                                as: 'h',
                                                cond: {
                                                    $eq: [
                                                        '$$h.status',
                                                        ORDER_STATUS.DELIVERED,
                                                    ],
                                                },
                                            },
                                        },
                                        0,
                                    ],
                                },
                            },
                            in: '$$entry.updatedAt',
                        },
                    },
                },
            },
            { $match: { deliveredAt: { $gte: from, $lt: to } } },
            { $count: 'total' },
        ])
        return rows[0]?.total || 0
    }

    // ── Feedback cards ────────────────────────────────────────────────────────
    async _feedbackCards(from, to) {
        const feedback = await FeedbackModel.find({
            createdAt: { $gte: from, $lt: to },
        })
            .select('rating npsScore npsAnsweredAt orderId userId type comment createdAt')
            .lean()

        const ratings = feedback
            .map((f) => f.rating)
            .filter((r) => typeof r === 'number')
        const averageRating = ratings.length
            ? this._round1(ratings.reduce((a, b) => a + b, 0) / ratings.length)
            : 0

        // The NPS question is asked at most once per customer per 30 days, so the
        // number of SCORES is deliberately NOT the number of feedback responses.
        // Bucketed on npsAnsweredAt, the moment the score itself arrived.
        const scores = feedback
            .filter(
                (f) =>
                    f.npsScore != null &&
                    f.npsAnsweredAt &&
                    f.npsAnsweredAt >= from &&
                    f.npsAnsweredAt < to,
            )
            .map((f) => f.npsScore)

        const promoters = scores.filter((s) => s >= 9).length
        const passives = scores.filter((s) => s >= 7 && s <= 8).length
        const detractors = scores.filter((s) => s <= 6).length
        const npsScore = scores.length
            ? Math.round(
                  (promoters / scores.length) * 100 -
                      (detractors / scores.length) * 100,
              )
            : 0

        const deliveredOrders = await this._deliveredInRange(from, to)

        return {
            cards: {
                npsScore, // -100 .. +100
                npsResponses: scores.length,
                npsBreakdown: { promoters, passives, detractors },
                averageRating, // out of 5
                ratingResponses: ratings.length,
                feedbackReceived: feedback.length,
                deliveredOrders,
                feedbackSharePct: this._pct(feedback.length, deliveredOrders),
            },
            feedback,
        }
    }

    // ── Complaint cards ───────────────────────────────────────────────────────
    async _complaintCards(from, to) {
        const [opened, resolved, stillOpen, resolveAgg] = await Promise.all([
            ComplaintCaseModel.countDocuments({
                createdAt: { $gte: from, $lt: to },
            }),
            ComplaintCaseModel.countDocuments({
                closedAt: { $gte: from, $lt: to },
            }),
            // Open AT THE END of the chosen month, not "open right now" — the
            // month picker has to describe that month, including past ones.
            ComplaintCaseModel.countDocuments({
                createdAt: { $lt: to },
                $or: [{ closedAt: null }, { closedAt: { $gte: to } }],
            }),
            ComplaintCaseModel.aggregate([
                { $match: { closedAt: { $gte: from, $lt: to } } },
                {
                    $project: {
                        ms: { $subtract: ['$closedAt', '$createdAt'] },
                    },
                },
                { $group: { _id: null, avgMs: { $avg: '$ms' }, n: { $sum: 1 } } },
            ]),
        ])

        const avgMs = resolveAgg[0]?.avgMs || 0
        const avgHours = avgMs ? this._round1(avgMs / (1000 * 60 * 60)) : 0

        return {
            complaintsOpened: opened,
            resolved,
            stillOpen,
            averageTimeToResolveHours: avgHours,
            averageTimeToResolveLabel: avgHours
                ? avgHours >= 24
                    ? `${this._round1(avgHours / 24)} days`
                    : `${avgHours} hours`
                : null,
        }
    }

    // ── Recovery cards ────────────────────────────────────────────────────────
    // "The number of recovery offers, credits and refunds given" — three
    // distinct things, counted separately and then summed, so the admin can see
    // which lever was actually pulled. Only APPROVED compensations count: a
    // request awaiting approval has given the customer nothing.
    async _recoveryCards(from, to) {
        const approvedInMonth = {
            'compensations.status': RECOVERY_CREDIT_STATUS.APPROVED,
            'compensations.decidedAt': { $gte: from, $lt: to },
        }

        const [compAgg, legacyAgg, recoveryOfferIds] = await Promise.all([
            ComplaintCaseModel.aggregate([
                { $match: approvedInMonth },
                { $unwind: '$compensations' },
                {
                    $match: {
                        'compensations.status': RECOVERY_CREDIT_STATUS.APPROVED,
                        'compensations.decidedAt': { $gte: from, $lt: to },
                    },
                },
                {
                    $group: {
                        _id: '$compensations.type',
                        count: { $sum: 1 },
                        amount: { $sum: '$compensations.amount' },
                        users: { $addToSet: '$userId' },
                        firstAt: { $min: '$compensations.decidedAt' },
                    },
                },
            ]),
            // Pre-§7 cases carry a single `recoveryCredit` instead of the
            // compensations array. Ignoring it would under-report old months.
            ComplaintCaseModel.aggregate([
                {
                    $match: {
                        'recoveryCredit.status': RECOVERY_CREDIT_STATUS.APPROVED,
                        'recoveryCredit.decidedAt': { $gte: from, $lt: to },
                    },
                },
                {
                    $group: {
                        _id: null,
                        count: { $sum: 1 },
                        amount: { $sum: '$recoveryCredit.amount' },
                        users: { $addToSet: '$userId' },
                    },
                },
            ]),
            OfferModel.find({
                $or: [
                    { triggers: OFFER_TRIGGER.RECOVERY },
                    { trigger: OFFER_TRIGGER.RECOVERY },
                ],
            })
                .select('_id')
                .lean(),
        ])

        const byType = (t) => compAgg.find((r) => r._id === t) || { count: 0, amount: 0, users: [] }
        const credit = byType(RECOVERY_COMPENSATION_TYPE.WALLET_CREDIT)
        const cash = byType(RECOVERY_COMPENSATION_TYPE.CASH)
        const legacy = legacyAgg[0] || { count: 0, amount: 0, users: [] }

        const recoveryOffers = await CustomerOfferModel.find({
            offerId: { $in: recoveryOfferIds.map((o) => o._id) },
            createdAt: { $gte: from, $lt: to },
        })
            .select('userId createdAt')
            .lean()

        const creditsGiven = credit.count + legacy.count
        const creditsAmount = credit.amount + legacy.amount

        // ── Ordered again after recovery ──────────────────────────────────────
        // Everyone who received something this month, with the EARLIEST moment
        // they received it, then: did they place a real order after that? A
        // recovery order is excluded — it is the recovery itself, not a return.
        const recoveredAt = new Map()
        const note = (userId, at) => {
            if (!userId || !at) return
            const key = String(userId)
            const prev = recoveredAt.get(key)
            if (!prev || at < prev) recoveredAt.set(key, at)
        }
        for (const row of [credit, cash]) {
            for (const u of row.users || []) note(u, row.firstAt)
        }
        for (const u of legacy.users || []) note(u, from)
        for (const o of recoveryOffers) note(o.userId, o.createdAt)

        let orderedAgain = 0
        if (recoveredAt.size) {
            const laterOrders = await BookOrderModel.find({
                userId: { $in: [...recoveredAt.keys()] },
                createdAt: { $gte: from },
                'stage.status': { $ne: ORDER_STATUS.CANCELLED },
                isRecoveryOrder: { $ne: true },
            })
                .select('userId createdAt')
                .lean()
            const returned = new Set()
            for (const o of laterOrders) {
                const at = recoveredAt.get(String(o.userId))
                if (at && o.createdAt > at) returned.add(String(o.userId))
            }
            orderedAgain = returned.size
        }

        return {
            recoveriesGiven: creditsGiven + cash.count + recoveryOffers.length,
            recoveryBreakdown: {
                offers: recoveryOffers.length,
                credits: creditsGiven,
                refunds: cash.count,
            },
            // Offers carry no cash value until they are redeemed on an order, so
            // they are deliberately absent from the cost — counting a percentage
            // discount as naira here would invent money that was never spent.
            recoveryCost: creditsAmount + cash.amount,
            recoveryCostBreakdown: {
                credits: creditsAmount,
                refunds: cash.amount,
            },
            customersRecovered: recoveredAt.size,
            orderedAgainAfterRecovery: orderedAgain,
        }
    }

    // ── Below the cards ───────────────────────────────────────────────────────
    async _complaintsByType(from, to) {
        const rows = await ComplaintCaseModel.aggregate([
            { $match: { createdAt: { $gte: from, $lt: to } } },
            { $group: { _id: '$complaintTypeId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ])
        const types = await ComplaintTypeModel.find({
            _id: { $in: rows.map((r) => r._id).filter(Boolean) },
        })
            .select('name')
            .lean()
        const nameOf = new Map(types.map((t) => [String(t._id), t.name]))
        return rows.map((r) => ({
            complaintTypeId: r._id ? String(r._id) : null,
            name: (r._id && nameOf.get(String(r._id))) || 'Uncategorised',
            count: r.count,
        }))
    }

    // "a list of the orders rated 1 or 2 stars so we can call those customers" —
    // so it carries the phone number, not just the order id.
    async _lowRatedOrders(feedback) {
        const low = feedback.filter((f) => f.rating === 1 || f.rating === 2)
        if (!low.length) return []
        const orders = await BookOrderModel.find({
            _id: { $in: low.map((f) => f.orderId) },
        })
            .select('oscNumber fullName phoneNumber amount')
            .lean()
        const byId = new Map(orders.map((o) => [String(o._id), o]))
        return low
            .map((f) => {
                const order = byId.get(String(f.orderId)) || {}
                return {
                    bookOrderId: String(f.orderId),
                    oscNumber: order.oscNumber || null,
                    customerName: order.fullName || null,
                    phoneNumber: order.phoneNumber || null,
                    rating: f.rating,
                    comment: f.comment || null,
                    ratedAt: f.createdAt,
                    hasComplaint: Boolean(f.complaintCaseId),
                }
            })
            .sort((a, b) => a.rating - b.rating || b.ratedAt - a.ratedAt)
    }

    async monthlyReport(req) {
        try {
            const month = (req.query?.month || '').trim() || monthKey()
            const range = monthRange(month)
            if (!range) {
                return BaseService.sendFailedResponse({
                    error: 'month must be in YYYY-MM format, e.g. 2026-10',
                })
            }
            const { from, to } = range

            const feedbackPart = await this._feedbackCards(from, to)
            const [complaints, recovery, complaintsByType, lowRated] =
                await Promise.all([
                    this._complaintCards(from, to),
                    this._recoveryCards(from, to),
                    this._complaintsByType(from, to),
                    this._lowRatedOrders(feedbackPart.feedback),
                ])

            return BaseService.sendSuccessResponse({
                message: {
                    month,
                    from,
                    to, // exclusive
                    feedback: feedbackPart.cards,
                    complaints,
                    recovery,
                    complaintsByType,
                    lowRatedOrders: lowRated,
                },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: error.message || 'Failed to build the recovery report',
            })
        }
    }
}

module.exports = RecoveryReportService
