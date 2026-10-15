const BaseService = require('./base.service')
const ReferralModel = require('../models/referral.model')
const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const { getObjectId } = require('../util/helper')
const { PAYMENT_ORDER_STATUS, ORDER_STATUS } = require('../util/constants')

/**
 * REP TRACKING REPORT — V1 launch batch 1, client 15 Oct (test plan T1.01):
 * "for each rep link, who signed up, who paid and how much."
 *
 * A rep link is a referral link, so the report reads the Referral records
 * (one per referred customer, written at sign-up). "Paid" means the customer
 * has at least one order that was actually paid (paymentStatus success) and
 * not cancelled; "how much" is the total of those orders. A waived order is
 * not money and is not counted.
 */
class RepReportService {
    static async repLinks({ from, to, referrerId } = {}) {
        try {
            const match = {}
            if (from || to) {
                match.createdAt = {}
                if (from) match.createdAt.$gte = new Date(from)
                if (to) match.createdAt.$lt = new Date(to)
                if (Object.values(match.createdAt).some((d) => isNaN(d))) {
                    return BaseService.sendFailedResponse({
                        error: 'from and to must be dates, for example 2026-10-01.',
                    })
                }
            }
            if (referrerId) {
                const id = getObjectId(referrerId)
                if (!id) return BaseService.sendFailedResponse({ error: 'referrerId is not valid.' })
                match.referrerId = id
            }

            const referrals = await ReferralModel.find(match)
                .select('referrerId referredUserId code createdAt')
                .sort({ createdAt: -1 })
                .lean()

            const referredIds = referrals.map((r) => r.referredUserId)
            const referrerIds = [...new Set(referrals.map((r) => String(r.referrerId)))]

            const [paidRows, users] = await Promise.all([
                BookOrderModel.aggregate([
                    {
                        $match: {
                            userId: { $in: referredIds },
                            paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                            'stage.status': { $ne: ORDER_STATUS.CANCELLED },
                        },
                    },
                    {
                        $group: {
                            _id: '$userId',
                            paidOrders: { $sum: 1 },
                            totalPaid: { $sum: '$amount' },
                            firstPaidAt: { $min: '$paymentDate' },
                        },
                    },
                ]),
                UserModel.find({ _id: { $in: [...referredIds, ...referrerIds.map(getObjectId)] } })
                    .select('fullName phoneNumber email referralCode userType')
                    .lean(),
            ])

            const paidBy = new Map(paidRows.map((r) => [String(r._id), r]))
            const userBy = new Map(users.map((u) => [String(u._id), u]))

            const reps = new Map()
            for (const r of referrals) {
                const key = String(r.referrerId)
                if (!reps.has(key)) {
                    const u = userBy.get(key) || {}
                    reps.set(key, {
                        referrer: {
                            id: key,
                            fullName: u.fullName || null,
                            phoneNumber: u.phoneNumber || null,
                            code: u.referralCode || r.code,
                            role: u.userType || null,
                        },
                        signups: 0,
                        paidCustomers: 0,
                        paidOrders: 0,
                        totalPaid: 0,
                        customers: [],
                    })
                }
                const rep = reps.get(key)
                const cust = userBy.get(String(r.referredUserId)) || {}
                const paid = paidBy.get(String(r.referredUserId))
                rep.signups += 1
                if (paid) {
                    rep.paidCustomers += 1
                    rep.paidOrders += paid.paidOrders
                    rep.totalPaid += paid.totalPaid
                }
                rep.customers.push({
                    userId: String(r.referredUserId),
                    fullName: cust.fullName || null,
                    phoneNumber: cust.phoneNumber || null,
                    signedUpAt: r.createdAt,
                    paid: Boolean(paid),
                    paidOrders: paid?.paidOrders || 0,
                    totalPaid: paid?.totalPaid || 0,
                    firstPaidAt: paid?.firstPaidAt || null,
                })
            }

            const rows = [...reps.values()].sort((a, b) => b.signups - a.signups)
            return BaseService.sendSuccessResponse({
                message: {
                    from: from || null,
                    to: to || null,
                    totals: {
                        reps: rows.length,
                        signups: rows.reduce((n, r) => n + r.signups, 0),
                        paidCustomers: rows.reduce((n, r) => n + r.paidCustomers, 0),
                        totalPaid: rows.reduce((n, r) => n + r.totalPaid, 0),
                    },
                    reps: rows,
                },
            })
        } catch (error) {
            console.error('rep link report failed:', error)
            return BaseService.sendFailedResponse({ error: 'Could not load the rep link report.' })
        }
    }
}

/**
 * Refused sign-ups (V1 launch batch 1): a phone or email already in use, with
 * the referral code that was used, newest first.
 */
RepReportService.signupAttempts = async function ({ page = 1, limit = 20 } = {}) {
    try {
        const SignupAttemptModel = require('../models/signupAttempt.model')
        const p = Math.max(1, Number(page) || 1)
        const l = Math.min(100, Math.max(1, Number(limit) || 20))
        const [rows, total] = await Promise.all([
            SignupAttemptModel.find({})
                .sort({ createdAt: -1 })
                .skip((p - 1) * l)
                .limit(l)
                .populate('existingUserId', 'fullName email phoneNumber')
                .lean(),
            SignupAttemptModel.countDocuments({}),
        ])
        return BaseService.sendSuccessResponse({
            message: {
                data: rows.map((r) => ({
                    id: r._id,
                    reason: r.reason,
                    method: r.method,
                    email: r.email || null,
                    phoneNumber: r.phoneNumber || null,
                    fullName: r.fullName || null,
                    referralCode: r.referralCode || null,
                    existingAccount: r.existingUserId
                        ? {
                              id: r.existingUserId._id,
                              fullName: r.existingUserId.fullName || null,
                              email: r.existingUserId.email || null,
                              phoneNumber: r.existingUserId.phoneNumber || null,
                          }
                        : null,
                    at: r.createdAt,
                })),
                pagination: { total, page: p, limit: l, pages: Math.ceil(total / l) },
            },
        })
    } catch (error) {
        console.error('sign-up attempts failed:', error)
        return BaseService.sendFailedResponse({ error: 'Could not load the refused sign-ups.' })
    }
}

module.exports = RepReportService
