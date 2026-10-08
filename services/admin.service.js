const ActivityModel = require('../models/activity.model')
const AdminOrderDetailsModel = require('../models/adminOrderDetails.model')
const AdminSettingModel = require('../models/adminSetting.model')
const AuditLogModel = require('../models/audit.log.model')
const BookOrderModel = require('../models/bookOrder.model')
const NotificationModel = require('../models/notification.model')
const OrderItemModel = require('../models/orderItem.model')
const ItemSetModel = require('../models/itemSet.model')
const PaymentModel = require('../models/payment.model')
const SubscriptionModel = require('../models/subscription.model')
const UpdateFundModel = require('../models/updateFund.model')
const UserModel = require('../models/user.model')
const WalletModel = require('../models/wallet.model')
const WalletTransactionModel = require('../models/walletTransaction.model')
const WalletAdjustmentRequestModel = require('../models/walletAdjustmentRequest.model')
const WalletAdjustmentService = require('./walletAdjustment.service')
const { logSafely } = require('../util/safeLog')
const {
    ORDER_STATUS,
    PAYMENT_ORDER_STATUS,
    DELIVERY_STATUS,
    PICKUP_STATUS,
    STATION_STATUS,
    NOTIFICATION_TYPE,
    DELIVERY_SPEED,
    ROLE,
    ACTIVITY_TYPE,
    WALLET_ADJUSTMENT_REQUEST_STATUS,
    WALLET_TX_TYPE,
    GENERAL_STATUS,
} = require('../util/constants')
const { startOfDay, endOfDay } = require('../util/lagosDay')
const { presentOrder } = require('../util/orderView')
const {
    activeHoldsFilter,
    overdueHoldsFilter,
    isHoldBreached,
    holdLimitHours,
    loadHoldRules,
    checkStationMayRaise,
    HOLD_SLA_HOURS,
} = require('../util/holdSla')
const createAuditLog = require('../util/createAuditLog')
const createNotification = require('../util/createNotification')
const {
    notifyAffectedStation,
    notifyAdminEvent,
    ADMIN_EVENT,
} = require('../util/notifyPolicy')
const { getObjectId } = require('../util/helper')
const paginate = require('../util/paginate')
const BaseService = require('./base.service')

class AdminService extends BaseService {
    async getDashboardStats(req, res) {
        try {
            const now = new Date()
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)

            const todayEnd = new Date()
            todayEnd.setHours(23, 59, 59, 999)

            const yesterdayStart = new Date(todayStart)
            yesterdayStart.setDate(yesterdayStart.getDate() - 1)

            const yesterdayEnd = new Date(todayEnd)
            yesterdayEnd.setDate(yesterdayEnd.getDate() - 1)

            const sevenDaysAgo = new Date()
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
            sevenDaysAgo.setHours(0, 0, 0, 0)

            const twelveHoursAgo = new Date()
            twelveHoursAgo.setHours(now.getHours() - 12)

            // ── Active orders ───────────────────────────────────────────────
            const totalActiveOrders = await BookOrderModel.countDocuments({
                'stage.status': {
                    $nin: [ORDER_STATUS.READY, ORDER_STATUS.DELIVERED],
                },
            })

            // ── Overdue & due today ─────────────────────────────────────────
            const overdueOrders = await BookOrderModel.countDocuments({
                deliveryDate: { $lt: now },
                'stage.status': { $ne: ORDER_STATUS.DELIVERED },
                $nor: [
                    {
                        'stage.status': ORDER_STATUS.READY,
                        'dispatchDetails.delivery.status':
                            DELIVERY_STATUS.DELIVERED,
                    },
                ],
            })

            const dueToday = await BookOrderModel.countDocuments({
                deliveryDate: { $gte: now, $lte: todayEnd },
                'stage.status': { $ne: ORDER_STATUS.DELIVERED },
                $nor: [
                    {
                        'stage.status': ORDER_STATUS.READY,
                        'dispatchDetails.delivery.status':
                            DELIVERY_STATUS.DELIVERED,
                    },
                ],
            })

            const revenueTodayAgg = await PaymentModel.aggregate([
                {
                    $match: {
                        status: 'success',
                        type: { $in: ['order', 'subscription'] },
                        createdAt: { $gte: todayStart, $lte: todayEnd },
                    },
                },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ])
            const revenueTodayVerified = revenueTodayAgg[0]?.total || 0

            const revenueYesterdayAgg = await PaymentModel.aggregate([
                {
                    $match: {
                        status: 'success',
                        type: { $in: ['order', 'subscription'] },
                        createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd },
                    },
                },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ])
            const revenueYesterday = revenueYesterdayAgg[0]?.total || 0

            const revenueTodayChange =
                revenueYesterday === 0
                    ? revenueTodayVerified > 0
                        ? 100
                        : 0
                    : Number(
                          (
                              ((revenueTodayVerified - revenueYesterday) /
                                  revenueYesterday) *
                              100
                          ).toFixed(2),
                      )

            // ── 7-day average revenue (running average with zero-fill) ──────
            const revenue7DayAgg = await PaymentModel.aggregate([
                {
                    $match: {
                        status: 'success',
                        type: { $in: ['order', 'subscription'] },
                        createdAt: { $gte: sevenDaysAgo, $lte: todayEnd },
                    },
                },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$createdAt',
                            },
                        },
                        dailyTotal: { $sum: '$amount' },
                    },
                },
            ])

            // fill in missing days as 0 for the breakdown chart
            const allRevenueDays = []
            for (let i = 6; i >= 0; i--) {
                const d = new Date()
                d.setDate(d.getDate() - i)
                const key = d.toISOString().split('T')[0]
                const found = revenue7DayAgg.find((r) => r._id === key)
                allRevenueDays.push({
                    _id: key,
                    dailyTotal: found?.dailyTotal || 0,
                })
            }

            // CLIENT DECISION A2 (2026-10-07): "Divide by all 7 days of the week."
            // It used to divide only by the days that actually took money, which
            // made the card "an average TRADING day" rather than an average day —
            // we flagged that in §3 Q1 and they chose the plain reading.
            // Expect the number to DROP: on 3 trading days in 7 it is now 3/7ths
            // of what the card used to show.
            const revenueRunningSum = allRevenueDays.reduce(
                (t, d) => t + d.dailyTotal,
                0,
            )
            const daysWithRevenue = allRevenueDays.filter(
                (d) => d.dailyTotal > 0,
            ).length
            const avgDailyRevenue7Days = Math.round(
                revenueRunningSum / allRevenueDays.length,
            )

            // ── Total all-time revenue ──────────────────────────────────────
            const totalRevenueAgg = await PaymentModel.aggregate([
                {
                    $match: {
                        status: 'success',
                        type: { $in: ['order', 'subscription'] },
                    },
                },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ])
            const totalRevenue = totalRevenueAgg[0]?.total || 0

            // ── Avg processing time ─────────────────────────────────────────
            // CLIENT DECISION A4, as CORRECTED by them on 2026-10-08:
            //   start  = when the order was CLEARED FOR PRODUCTION — clothes at
            //            Intake AND the money complete, whichever came LAST
            //            (`productionStartedAt`, see util/productionClock.js).
            //            Their first answer said "at tagging"; they changed it,
            //            because an order can sit tagged-but-unpaid for days.
            //   stop   = when S5 marked it Ready (`qcDetails.packCompletedAt`)
            //   window = orders that became READY TODAY
            //
            // What it used to do, and why they changed it: it measured from the
            // order being CREATED to it being DELIVERED, over orders whose
            // RECORD was last modified today. That meant a customer who booked
            // on Monday for a Thursday pickup added three idle days to the
            // "processing" figure, and editing any old delivered order dragged
            // it into today's average. We flagged the second as a flaw in §3 Q1.
            //
            // Orders tagged before this shipped have no `productionStartedAt`
            // and are EXCLUDED, not guessed at — so the card reads 0 on day one
            // and fills up from there. That is deliberate: a fabricated start
            // time would look like data.
            const avgProcessingTimeAgg = await BookOrderModel.aggregate([
                {
                    $match: {
                        productionStartedAt: { $exists: true, $ne: null },
                        'qcDetails.packCompletedAt': {
                            $gte: todayStart,
                            $lte: todayEnd,
                        },
                    },
                },
                {
                    $project: {
                        processingTime: {
                            $subtract: [
                                '$qcDetails.packCompletedAt',
                                '$productionStartedAt',
                            ],
                        },
                    },
                },
                // A negative gap would mean the two stamps are out of order —
                // never average it in, it would silently drag the figure down.
                { $match: { processingTime: { $gte: 0 } } },
                {
                    $group: {
                        _id: null,
                        avgTime: { $avg: '$processingTime' },
                        count: { $sum: 1 },
                    },
                },
            ])
            const ordersProcessedToday = avgProcessingTimeAgg[0]?.count || 0
            // CLIENT (2026-10-08): "let the card show 'Not enough data yet'
            // instead of 0 until there are orders to measure." A zero here is
            // indistinguishable from an instant turnaround, and on day one
            // EVERY order is unmeasurable — so send null plus a reason the
            // screen can print, rather than a number that is not one.
            const avgProcessingTime = ordersProcessedToday
                ? avgProcessingTimeAgg[0].avgTime
                : null
            const processingTimeNote = ordersProcessedToday
                ? null
                : 'Not enough data yet'
            // So the screen can say "based on 4 orders" instead of implying the
            // whole day's work sits behind a figure built from one order.
            const ordersReadyTodayAwaitingStamp =
                await BookOrderModel.countDocuments({
                    'qcDetails.packCompletedAt': {
                        $gte: todayStart,
                        $lte: todayEnd,
                    },
                    $or: [
                        { productionStartedAt: { $exists: false } },
                        { productionStartedAt: null },
                    ],
                })

            // ── Avg cost per item 7-day (running average with zero-fill) ────
            const avgCostPerItem7DaysAgg = await BookOrderModel.aggregate([
                {
                    $match: {
                        paymentDate: { $gte: sevenDaysAgo, $lte: todayEnd },
                        paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                    },
                },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$paymentDate',
                            },
                        },
                        // ← sum amount once per order, not per item
                        dailyRevenue: { $sum: '$amount' },
                        // ← sum all item quantities across all orders that day
                        dailyItems: {
                            $sum: {
                                $reduce: {
                                    input: '$items',
                                    initialValue: 0,
                                    in: {
                                        $add: ['$$value', '$$this.quantity'],
                                    },
                                },
                            },
                        },
                    },
                },
                {
                    $project: {
                        dailyCostPerItem: {
                            $cond: [
                                { $eq: ['$dailyItems', 0] },
                                0,
                                { $divide: ['$dailyRevenue', '$dailyItems'] },
                            ],
                        },
                    },
                },
                { $sort: { _id: 1 } },
            ])

            // fill in missing days as 0
            const allCostDays = []
            for (let i = 6; i >= 0; i--) {
                const d = new Date()
                d.setDate(d.getDate() - i)
                const key = d.toISOString().split('T')[0]
                const found = avgCostPerItem7DaysAgg.find((r) => r._id === key)
                allCostDays.push({
                    _id: key,
                    dailyCostPerItem: found?.dailyCostPerItem || 0,
                })
            }

            // CLIENT DECISION A3 (2026-10-07): "Total money divided by total
            // items." It used to average the DAILY per-item rates, which gives
            // a quiet day the same weight as a busy one — ₦1,500/garment on 40
            // garments and ₦2,000/garment on 15 averaged to ₦1,750, where the
            // true rate across all 55 garments is ₦1,636. Both readings are
            // defensible; they picked the plain one. Flagged in §3 Q1.
            const sevenDayTotals = await BookOrderModel.aggregate([
                {
                    $match: {
                        paymentDate: { $gte: sevenDaysAgo, $lte: todayEnd },
                        paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                    },
                },
                {
                    $group: {
                        _id: null,
                        revenue: { $sum: '$amount' },
                        items: {
                            $sum: {
                                $reduce: {
                                    input: '$items',
                                    initialValue: 0,
                                    in: { $add: ['$$value', '$$this.quantity'] },
                                },
                            },
                        },
                    },
                },
            ])
            const totalItems7Days = sevenDayTotals[0]?.items || 0
            const totalRevenue7Days = sevenDayTotals[0]?.revenue || 0
            const avgCostPerItem7Days = totalItems7Days
                ? Math.round(totalRevenue7Days / totalItems7Days)
                : 0
            const costDaysWithData = allCostDays.filter(
                (d) => d.dailyCostPerItem > 0,
            ).length
            // cost trend — compare last 3 days vs prior 4 days
            const recent3 = allCostDays.slice(-3)
            const prior4 = allCostDays.slice(0, 4)
            const avgRecent =
                recent3.length > 0
                    ? recent3.reduce((s, d) => s + d.dailyCostPerItem, 0) /
                      recent3.length
                    : 0
            const avgPrior =
                prior4.length > 0
                    ? prior4.reduce((s, d) => s + d.dailyCostPerItem, 0) /
                      prior4.length
                    : 0
            const costTrend =
                avgPrior === 0
                    ? 'neutral'
                    : avgRecent > avgPrior
                      ? 'up_bad'
                      : avgRecent < avgPrior
                        ? 'down_good'
                        : 'neutral'

            // ── Pending payments ────────────────────────────────────────────
            const pendingVerification = await PaymentModel.countDocuments({
                status: PAYMENT_ORDER_STATUS.PENDING,
                type: { $in: ['order', 'wallet-top-up'] },
                paymentMethod: 'bank-transfer',
            })

            const pendingPayment = await PaymentModel.countDocuments({
                status: PAYMENT_ORDER_STATUS.PENDING,
                type: { $in: ['order', 'wallet-top-up'] },
                paymentMethod: 'bank-transfer',
            })

            // ── Holds ───────────────────────────────────────────────────────
            // Active = on hold and still inside its SLA; Overdue = on hold and
            // past it. The two filters are exact complements ($nor vs $or over
            // the same branches), so no order is in both and the counts sum to
            // all holds — client brief 4.4, where both cards showed the same 3.
            // The limit now comes from the hold's TYPE where the admin has set
            // one, and falls back to the delivery-speed table where they have
            // not (client section B). Loaded once and handed to both filters so
            // the two cards cannot be computed against different rules.
            const holdRules = await loadHoldRules()

            const activeHolds = await BookOrderModel.countDocuments(
                activeHoldsFilter(now, holdRules),
            )

            const overdueHolds = await BookOrderModel.countDocuments(
                overdueHoldsFilter(now, holdRules),
            )

            const expiringTodayHolds = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.HOLD,
                deliveryDate: { $gte: todayStart, $lte: todayEnd },
            })

            // ── Bottleneck station (press & iron) ───────────────────────────
            const [bottleneckOrderCount, bottleneckItemCount] =
                await Promise.all([
                    BookOrderModel.countDocuments({
                        'stage.status': ORDER_STATUS.IRONING,
                    }),
                    BookOrderModel.aggregate([
                        { $match: { 'stage.status': ORDER_STATUS.IRONING } },
                        { $unwind: '$items' },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$items.quantity' },
                            },
                        },
                    ]).then((r) => r[0]?.total || 0),
                ])

            const bottleNeckStation = {
                station: ORDER_STATUS.IRONING,
                orderCount: bottleneckOrderCount,
                itemCount: bottleneckItemCount,
            }

            // ── Ready & waiting, delivery issues ────────────────────────────
            const readyAndWaiting = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.READY,
                'qcDetails.packCompletedAt': { $exists: true }, // ← passed QC and packed
                'dispatchDetails.delivery.status': {
                    $ne: DELIVERY_STATUS.DELIVERED,
                },
            })

            const deliveryIssues = await BookOrderModel.countDocuments({
                'dispatchDetails.delivery.status': DELIVERY_STATUS.FAILED,
            })

            // ── Priority alerts ─────────────────────────────────────────────
            const priorityAlerts = {
                overdueOrders,
                dueToday,
                overdueHolds,
                expiringTodayHolds,
                pendingVerification,
                deliveryIssues,
                activeHolds,
            }

            // ── Total subscribers (only with valid plan) ────────────────────
            const totalSubscribersAgg = await SubscriptionModel.aggregate([
                { $match: { status: 'active' } },
                {
                    $lookup: {
                        from: 'plans',
                        localField: 'planId',
                        foreignField: '_id',
                        as: 'plan',
                    },
                },
                { $match: { 'plan.0': { $exists: true } } },
                { $count: 'total' },
            ])
            const totalSubscribers = totalSubscribersAgg[0]?.total || 0

            // ── Monthly order revenue ───────────────────────────────────────
            const monthlyOrderRevenueAgg = await PaymentModel.aggregate([
                {
                    $match: {
                        status: 'success',
                        type: 'order',
                    },
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' },
                        },
                        totalRevenue: { $sum: '$amount' },
                        orderCount: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': -1, '_id.month': -1 } },
                { $limit: 12 },
                {
                    $project: {
                        _id: 0,
                        year: '$_id.year',
                        month: '$_id.month',
                        totalRevenue: 1,
                        orderCount: 1,
                        label: {
                            $concat: [
                                {
                                    $arrayElemAt: [
                                        [
                                            '',
                                            'Jan',
                                            'Feb',
                                            'Mar',
                                            'Apr',
                                            'May',
                                            'Jun',
                                            'Jul',
                                            'Aug',
                                            'Sep',
                                            'Oct',
                                            'Nov',
                                            'Dec',
                                        ],
                                        '$_id.month',
                                    ],
                                },
                                ' ',
                                { $toString: '$_id.year' },
                            ],
                        },
                    },
                },
            ])

            // ── Monthly subscription revenue ────────────────────────────────
            const monthlySubscriptionRevenueAgg =
                await SubscriptionModel.aggregate([
                    {
                        $match: {
                            lastPaymentAt: { $exists: true, $ne: null },
                        },
                    },
                    {
                        $lookup: {
                            from: 'plans',
                            localField: 'planId',
                            foreignField: '_id',
                            as: 'plan',
                        },
                    },
                    { $match: { 'plan.0': { $exists: true } } },
                    { $unwind: '$plan' },
                    {
                        $group: {
                            _id: {
                                year: { $year: '$lastPaymentAt' },
                                month: { $month: '$lastPaymentAt' },
                            },
                            totalRevenue: { $sum: '$plan.price' },
                            subscriptionCount: { $sum: 1 },
                        },
                    },
                    { $sort: { '_id.year': -1, '_id.month': -1 } },
                    { $limit: 12 },
                    {
                        $project: {
                            _id: 0,
                            year: '$_id.year',
                            month: '$_id.month',
                            totalRevenue: 1,
                            subscriptionCount: 1,
                            label: {
                                $concat: [
                                    {
                                        $arrayElemAt: [
                                            [
                                                '',
                                                'Jan',
                                                'Feb',
                                                'Mar',
                                                'Apr',
                                                'May',
                                                'Jun',
                                                'Jul',
                                                'Aug',
                                                'Sep',
                                                'Oct',
                                                'Nov',
                                                'Dec',
                                            ],
                                            '$_id.month',
                                        ],
                                    },
                                    ' ',
                                    { $toString: '$_id.year' },
                                ],
                            },
                        },
                    },
                ])

            // ── Plan distribution ───────────────────────────────────────────
            const planDistributionAgg = await SubscriptionModel.aggregate([
                { $match: { status: 'active' } },
                {
                    $lookup: {
                        from: 'plans',
                        localField: 'planId',
                        foreignField: '_id',
                        as: 'plan',
                    },
                },
                { $match: { 'plan.0': { $exists: true } } },
                { $group: { _id: '$planId', count: { $sum: 1 } } },
                {
                    $lookup: {
                        from: 'plans',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'plan',
                    },
                },
                { $unwind: '$plan' },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$count' },
                        plans: {
                            $push: {
                                planId: '$_id',
                                title: '$plan.title',
                                count: '$count',
                            },
                        },
                    },
                },
                { $unwind: '$plans' },
                {
                    $project: {
                        _id: 0,
                        planId: '$plans.planId',
                        title: '$plans.title',
                        count: '$plans.count',
                        percentage: {
                            $multiply: [
                                { $divide: ['$plans.count', '$total'] },
                                100,
                            ],
                        },
                    },
                },
                { $sort: { percentage: -1 } },
            ])

            // ── Subscription analytics ──────────────────────────────────────
            const subscriptionAnalytics = await SubscriptionModel.aggregate([
                { $match: { status: 'active' } },
                {
                    $lookup: {
                        from: 'plans',
                        localField: 'planId',
                        foreignField: '_id',
                        as: 'plan',
                    },
                },
                { $match: { 'plan.0': { $exists: true } } },
                { $unwind: '$plan' },
                {
                    $group: {
                        _id: {
                            planId: '$planId',
                            title: '$plan.title',
                            price: '$plan.price',
                        },
                        subscriberCount: { $sum: 1 },
                        planRevenue: { $sum: '$plan.price' },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: '$planRevenue' },
                        totalSubscribers: { $sum: '$subscriberCount' },
                        plans: {
                            $push: {
                                planId: '$_id.planId',
                                title: '$_id.title',
                                pricePerMonth: '$_id.price',
                                subscriberCount: '$subscriberCount',
                                planRevenue: '$planRevenue',
                            },
                        },
                    },
                },
                { $unwind: '$plans' },
                {
                    $project: {
                        _id: 0,
                        planId: '$plans.planId',
                        title: '$plans.title',
                        pricePerMonth: '$plans.pricePerMonth',
                        subscriberCount: '$plans.subscriberCount',
                        planRevenue: '$plans.planRevenue',
                        totalSubscribers: 1,
                        totalRevenue: 1,
                        percentageOfSubscribers: {
                            $multiply: [
                                {
                                    $divide: [
                                        '$plans.subscriberCount',
                                        '$totalSubscribers',
                                    ],
                                },
                                100,
                            ],
                        },
                        percentageOfRevenue: {
                            $multiply: [
                                {
                                    $divide: [
                                        '$plans.planRevenue',
                                        '$totalRevenue',
                                    ],
                                },
                                100,
                            ],
                        },
                    },
                },
                { $sort: { planRevenue: -1 } },
            ])

            // ── Orders graph (12hr) ─────────────────────────────────────────
            const ordersGraphAgg = await BookOrderModel.aggregate([
                {
                    $facet: {
                        newOrders: [
                            {
                                $match: {
                                    createdAt: {
                                        $gte: twelveHoursAgo,
                                        $lte: now,
                                    },
                                },
                            },
                            {
                                $group: {
                                    _id: {
                                        $dateTrunc: {
                                            date: '$createdAt',
                                            unit: 'hour',
                                            binSize: 2,
                                        },
                                    },
                                    count: { $sum: 1 },
                                },
                            },
                        ],
                        completedOrders: [
                            { $unwind: '$stageHistory' },
                            {
                                $match: {
                                    'stageHistory.status':
                                        ORDER_STATUS.DELIVERED,
                                    'stageHistory.updatedAt': {
                                        $gte: twelveHoursAgo,
                                        $lte: now,
                                    },
                                },
                            },
                            {
                                $group: {
                                    _id: {
                                        $dateTrunc: {
                                            date: '$stageHistory.updatedAt',
                                            unit: 'hour',
                                            binSize: 2,
                                        },
                                    },
                                    count: { $sum: 1 },
                                },
                            },
                        ],
                    },
                },
            ])

            const newOrdersMap = {}
            const completedOrdersMap = {}

            ordersGraphAgg[0].newOrders.forEach((item) => {
                newOrdersMap[new Date(item._id).toISOString()] = item.count
            })
            ordersGraphAgg[0].completedOrders.forEach((item) => {
                completedOrdersMap[new Date(item._id).toISOString()] =
                    item.count
            })

            const graphResult = []
            for (let i = 0; i < 12; i += 2) {
                const bucketTime = new Date(twelveHoursAgo)
                bucketTime.setHours(bucketTime.getHours() + i)
                const key = new Date(
                    bucketTime.setMinutes(0, 0, 0),
                ).toISOString()
                graphResult.push({
                    time: bucketTime.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                    }),
                    newOrders: newOrdersMap[key] || 0,
                    completedOrders: completedOrdersMap[key] || 0,
                })
            }

            // ── Recent activity ─────────────────────────────────────────────
            const activities = await ActivityModel.find()
                .sort({ createdAt: -1 })
                .limit(10)

            return BaseService.sendSuccessResponse({
                message: {
                    totalActiveOrders,
                    overdueOrders,
                    dueToday,
                    totalRevenue,
                    revenueTodayVerified,
                    revenueYesterday,
                    revenueTodayChange,
                    avgDailyRevenue7Days,
                    avgDailyRevenue7DayBreakdown: allRevenueDays,
                    // A2: the divisor is now all 7 days. Sent so the screen can
                    // say "3 of 7 days took money" rather than leaving a figure
                    // that halved overnight looking like a bug.
                    revenueDaysWithSales: daysWithRevenue,
                    revenueDaysCounted: allRevenueDays.length,
                    // null when nothing is measurable yet — print
                    // `processingTimeNote` instead of rendering a 0.
                    avgProcessingTime,
                    processingTimeNote,
                    ordersProcessedToday,
                    // Orders that became Ready today but started production
                    // before this measurement existed, so they cannot be
                    // included. Published so the card can explain itself.
                    ordersReadyTodayAwaitingStamp,
                    // A3: the client asked us to correct the naming — this is
                    // REVENUE per garment, not cost. `avgCostPerItem7Days` is
                    // kept as a duplicate for one release so the existing screen
                    // does not go blank on deploy; drop it once the FE reads the
                    // new key.
                    avgRevenuePerItem7Days: avgCostPerItem7Days,
                    avgCostPerItem7Days,
                    totalItems7Days,
                    costTrend,
                    revenuePerItemTrend: costTrend,
                    avgCostPerItem7DayBreakdown: allCostDays,
                    avgRevenuePerItem7DayBreakdown: allCostDays,
                    pendingVerification,
                    pendingPayment,
                    activeHolds,
                    overdueHolds,
                    expiringTodayHolds,
                    bottleNeckStation,
                    readyAndWaiting,
                    deliveryIssues,
                    priorityAlerts,
                    totalSubscribers,
                    subscriptionAnalytics,
                    planDistributionAgg,
                    monthlyOrderRevenueAgg,
                    monthlySubscriptionRevenueAgg,
                    graphResult,
                    activities,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }
    async orderManagement(req, res) {
        try {
            const { type, page = 1, limit = 10 } = req.query

            if (!type) {
                return BaseService.sendFailedResponse({
                    error: 'Type query parameter is required',
                })
            }

            const skip = (page - 1) * limit

            const now = new Date()

            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)

            const todayEnd = new Date()
            todayEnd.setHours(23, 59, 59, 999)

            let filter = {}

            switch (type) {
                case 'active':
                    filter = {
                        'stage.status': {
                            $nin: [ORDER_STATUS.DELIVERED, ORDER_STATUS.HOLD],
                        },
                    }
                    break

                case 'overdue':
                    filter = {
                        deliveryDate: { $lt: now },
                        'stage.status': { $ne: ORDER_STATUS.DELIVERED },
                        $nor: [
                            {
                                'stage.status': ORDER_STATUS.READY,
                                'dispatchDetails.delivery.status':
                                    DELIVERY_STATUS.DELIVERED,
                            },
                        ],
                    }
                    break

                case 'dueToday':
                    filter = {
                        deliveryDate: { $gte: now, $lte: todayEnd },
                        'stage.status': { $ne: ORDER_STATUS.DELIVERED },
                        $nor: [
                            {
                                'stage.status': ORDER_STATUS.READY,
                                'dispatchDetails.delivery.status':
                                    DELIVERY_STATUS.DELIVERED,
                            },
                        ],
                    }
                    break

                case 'holds':
                    filter = {
                        'stage.status': ORDER_STATUS.HOLD,
                    }
                    break

                case 'assignedForDelivery':
                    filter = {
                            $or: [
                                {
                                    isPickUp: true,
                                    'dispatchDetails.pickup.rider': { $ne: null },
                                    'dispatchDetails.pickup.status': PICKUP_STATUS.SCHEDULED, // ← assigned, not started
                                },
                                {
                                    isDelivery: true,
                                    'dispatchDetails.delivery.rider': { $ne: null },
                                    'dispatchDetails.delivery.status': DELIVERY_STATUS.READY, // ← assigned, not started
                                },
                            ],
                        }
                    break
                case 'ready':
                    filter = {
                        'stage.status': ORDER_STATUS.READY,
                    }
                    break
                case 'pendingPayment':
                    filter = {
                        paymentStatus: PAYMENT_ORDER_STATUS.PENDING,
                    }
                    break

                default:
                    return BaseService.sendFailedResponse({
                        error: 'Invalid type supplied',
                    })
            }
            const p = await PaymentModel.findOne({
                status: PAYMENT_ORDER_STATUS.PENDING,
            })
            console.log('payment type:', p?.type)
            console.log('payment paymentMethod:', p?.paymentMethod)

            const [orders, total] = await Promise.all([
                BookOrderModel.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit)),

                BookOrderModel.countDocuments(filter),
            ])

            const response = {
                data: orders,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit),
                },
            }

            return BaseService.sendSuccessResponse({ message: response })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }
    async getOrderDetails(req, res) {
        try {
            const { id } = req.params
            if (!id)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })

            const order = await BookOrderModel.findById(id)
                .populate('userId', 'fullName email phoneNumber')
                .populate('intakeStaffId', 'fullName')
                .populate('washDetails.operatorId', 'fullName')
                .populate('pressDetails.operatorId', 'fullName')
                .populate('qcDetails.operatorId', 'fullName')
                .populate('qcDetails.packOperatorId', 'fullName')
                .populate(
                    'dispatchDetails.pickup.rider',
                    'fullName phoneNumber',
                )
                .populate(
                    'dispatchDetails.delivery.rider',
                    'fullName phoneNumber',
                )
                .lean()

            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            // Backfill pricing + normalise addresses so older orders render.
            presentOrder(order)

            const payments = await PaymentModel.find({ order: id })
                .populate('verifiedBy', 'fullName')
                .lean()

            const walletTransactions =
                order.billingType === 'pay-from-wallet'
                    ? await WalletTransactionModel.find({
                          userId: order.userId?._id || order.userId,
                          type: 'debit',
                          description: 'Order Payment',
                      })
                          .sort({ createdAt: -1 })
                          .limit(1)
                          .lean()
                    : []

            let holdMeta = null
            if (order.stage?.status === ORDER_STATUS.HOLD) {
                const now = new Date()
                const heldSince = order.stage?.updatedAt
                const heldMinutes = heldSince
                    ? Math.floor((now - new Date(heldSince)) / 60000)
                    : null
                // Third copy of the SLA table, found by the harness that asserts
                // there is only one. The order-detail screen said "SLA Breached"
                // from its own thresholds, so it could disagree with both the
                // Holds list and the dashboard cards on the SAME order.
                const holdRules = await loadHoldRules()
                const limit = holdLimitHours(order, holdRules)
                const slaThresholdMinutes = limit.hours * 60
                holdMeta = {
                    heldSince,
                    heldMinutes,
                    slaThresholdMinutes,
                    slaBreached: isHoldBreached(order, now, holdRules),
                    // so the screen can say "Awaiting payment — 48h" rather than
                    // leaving staff to guess why this hold has a longer clock
                    holdTypeKey: order.orderHold?.holdTypeKey || null,
                    holdTypeName: limit.typeName,
                    slaSource: limit.source,
                    stationStatus: order.stationStatus,
                    holdNote: order.stage?.note,
                }
            }

            const flaggedItems = (order.items || [])
                .filter((i) => i.flaggedForReview)
                .map((i) => ({
                    itemId: i._id,
                    type: i.type,
                    tagId: i.tagId,
                    flagNote: i.flagNote,
                    holdDetails: i.holdDetails,
                    flagHistory: (i.actionLog || []).filter(
                        (log) => log.action === 'item_held',
                    ),
                }))

            const paymentSummary = {
                billingType: order.billingType,
                paymentMethod: order.paymentMethod,
                paymentStatus: order.paymentStatus,
                amount: order.amount,
                deliveryAmount: order.deliveryAmount,
                // Paystack — auto verified
                isPaystack: order.paymentMethod === 'paystack',
                // bank transfer — needs admin verification
                isBankTransfer: order.paymentMethod === 'bank-transfer',
                // wallet — no payment record
                isWallet: order.billingType === 'pay-from-wallet',
                // subscription — covered by plan
                isSubscription: order.billingType === 'pay-from-subscription',
                records: payments.map((p) => ({
                    _id: p._id,
                    amount: p.amount,
                    status: p.status,
                    type: p.type,
                    paymentMethod: p.paymentMethod,
                    reference: p.reference,
                    proofOfPayment: p.proofOfPayment,
                    verifiedBy: p.verifiedBy?.fullName || null,
                    verifiedAt: p.verifiedAt,
                    createdAt: p.createdAt,
                    requiresVerification:
                        p.paymentMethod === 'bank-transfer' &&
                        p.status === 'pending',
                })),
                walletTransactions,
            }

            // dispatch summary for drawer
            const dispatchSummary = {
                isPickUp: order.isPickUp,
                isDelivery: order.isDelivery,
                pickupAddress: order.pickupAddress,
                deliveryAddress: order.deliveryAddress,
                pickup: order.isPickUp
                    ? {
                          status: order.dispatchDetails?.pickup?.status,
                          rider: order.dispatchDetails?.pickup?.rider,
                          isVerified: order.dispatchDetails?.pickup?.isVerified,
                          updatedAt: order.dispatchDetails?.pickup?.updatedAt,
                      }
                    : null,
                delivery: order.isDelivery
                    ? {
                          status: order.dispatchDetails?.delivery?.status,
                          rider: order.dispatchDetails?.delivery?.rider,
                          note: order.dispatchDetails?.delivery?.note,
                          startedAt: order.dispatchDetails?.delivery?.startedAt,
                          updatedAt: order.dispatchDetails?.delivery?.updatedAt,
                      }
                    : null,
            }

            return BaseService.sendSuccessResponse({
                message: {
                    order,
                    paymentSummary,
                    dispatchSummary,
                    holdMeta,
                    flaggedItems,
                    meta: {
                        isOnHold: order.stage?.status === ORDER_STATUS.HOLD,
                        hasDispatch: order.isPickUp || order.isDelivery,
                        hasPayments: payments.length > 0,
                        hasFlaggedItems: flaggedItems.length > 0,
                        paymentMethod: order.paymentMethod,
                        billingType: order.billingType,
                        requiresPaymentVerification: payments.some(
                            (p) =>
                                p.paymentMethod === 'bank-transfer' &&
                                p.status === 'pending',
                        ),
                    },
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }
    // async getAdminOrderDetails(req) {
    //     try {
    //         const [adminOrderDetails, adminSetting] = await Promise.all([
    //             AdminOrderDetailsModel.findOne().lean(),
    //             AdminSettingModel.findOne().lean(),
    //         ])

    //         const activeServiceTypes = adminSetting?.serviceTypes || []

    //         return BaseService.sendSuccessResponse({
    //             message: {
    //                 ...adminOrderDetails,
    //                 serviceTypes: activeServiceTypes,
    //                 serviceType: activeServiceTypes.map((s) => s.name),
    //                 pickupTime: adminSetting?.pickupTimeSlots || [
    //                     '10am-12pm',
    //                     '4pm-6pm',
    //                 ],
    //                 standardCapacity: adminSetting?.standardCapacity ?? 100,
    //                 sameDayCapacity: adminSetting?.sameDayCapacity ?? 50,
    //                 expressCapacity: adminSetting?.expressCapacity ?? 30,
    //                 standardDeliveryPeriod:
    //                     adminSetting?.standardDeliveryPeriod ?? 2,
    //                 sameDayCharge: adminSetting?.sameDayCharge ?? 300,
    //                 expressCharge: adminSetting?.expressCharge ?? 100,
    //                 premiumServiceTierCharge:
    //                     adminSetting?.premiumServiceTierCharge ?? 1.5,
    //                 vipServiceTierCharge:
    //                     adminSetting?.vipServiceTierCharge ?? 2,
    //                 deliveryFee: adminSetting?.deliveryFee ?? 500,
    //                 pickupFee: adminSetting?.pickupFee ?? 500,
    //                 bankDetails: adminSetting?.bankDetails,
    //             },
    //         })
    //     } catch (error) {
    //         console.log(error)
    //         return BaseService.sendFailedResponse({ error })
    //     }
    // }

    async getAdminOrderDetails(req) {
        try {
            const [adminOrderDetails, adminSetting, orderItems] =
                await Promise.all([
                    AdminOrderDetailsModel.findOne().lean(),
                    AdminSettingModel.findOne().lean(),
                    OrderItemModel.find({}).lean(), // ← fetch all items
                ])

            const activeServiceTypes = adminSetting?.serviceTypes || []

            return BaseService.sendSuccessResponse({
                message: {
                    ...adminOrderDetails,
                    serviceTypes: activeServiceTypes,
                    serviceType: activeServiceTypes.map((s) => s.name),
                    orderItems, // ← includes name, price, isHeavy
                    heavyItems: orderItems
                        .filter((i) => i.isHeavy)
                        .map((i) => i.name), // ← convenience list for frontend
                    pickupTime: adminSetting?.pickupTimeSlots || [
                        '10am-12pm',
                        '4pm-6pm',
                    ],
                    standardCapacity: adminSetting?.standardCapacity ?? 100,
                    sameDayCapacity: adminSetting?.sameDayCapacity ?? 50,
                    expressCapacity: adminSetting?.expressCapacity ?? 30,
                    standardDeliveryPeriod:
                        adminSetting?.standardDeliveryPeriod ?? 2,
                    sameDayCharge: adminSetting?.sameDayCharge ?? 300,
                    expressCharge: adminSetting?.expressCharge ?? 100,
                    premiumServiceTierCharge:
                        adminSetting?.premiumServiceTierCharge ?? 1.5,
                    vipServiceTierCharge:
                        adminSetting?.vipServiceTierCharge ?? 2,
                    deliveryFee: adminSetting?.deliveryFee ?? 500,
                    pickupFee: adminSetting?.pickupFee ?? 500,
                    bankDetails: adminSetting?.bankDetails,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }

    async getAdminSetting(req, res) {
        try {
            const adminSetting = await AdminSettingModel.findOne().lean()

            return BaseService.sendSuccessResponse({
                message: adminSetting,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
    async updateOrderDetails(req) {
        try {
            const updateData = req.body

            // Find the single configuration document
            const adminOrderDetail = await AdminOrderDetailsModel.findOne()

            if (!adminOrderDetail) {
                return BaseService.sendFailedResponse({
                    error: 'Order details configuration not found.',
                })
            }

            // Dynamically update the document fields
            await AdminOrderDetailsModel.findOneAndUpdate(
                { _id: adminOrderDetail._id },
                { $set: updateData },
                { new: true },
            )

            return BaseService.sendSuccessResponse({
                message: 'Setting has been updated',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }
    async updateAdminSettings(req) {
        try {
            const updateData = req.body

            const adminSetting = await AdminSettingModel.findOne()

            if (!adminSetting) {
                return BaseService.sendFailedResponse({
                    error: 'Order details configuration not found.',
                })
            }

            const updated = await AdminSettingModel.findOneAndUpdate(
                { _id: adminSetting._id },
                { $set: updateData },
                {
                    new: true,
                    runValidators: false, // ← prevents required field validation on subdocuments
                },
            )

            return BaseService.sendSuccessResponse({
                message: updated, // ← return updated doc so frontend can confirm what was saved
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }
    // ── Wallet adjustment approvals (client brief 2.4) ──────────────────────
    // Staff adjustments above their role's limit land here and move no money
    // until an admin decides. Mirrors how top-up requests reach the dashboard.
    async getWalletAdjustmentRequests(req) {
        try {
            const { status, page, limit } = req.query
            const filter = {}
            // Default to what needs a decision — the dashboard's job.
            filter.status = status || WALLET_ADJUSTMENT_REQUEST_STATUS.PENDING
            if (status === 'all') delete filter.status

            const result = await paginate(
                WalletAdjustmentRequestModel,
                filter,
                {
                    page,
                    limit,
                    sort: { createdAt: -1 },
                    populate: [
                        { path: 'userId', select: 'fullName email phoneNumber' },
                        { path: 'requestedBy', select: 'fullName userType' },
                        { path: 'decidedBy', select: 'fullName' },
                        { path: 'orderId', select: 'oscNumber' },
                    ],
                    lean: true,
                },
            )
            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch wallet adjustment requests',
            })
        }
    }

    async approveWalletAdjustment(req) {
        return WalletAdjustmentService.decideRequest({
            requestId: req.params.id,
            approve: true,
            adminId: req.user.id,
            note: req.body?.note || '',
        })
    }

    async rejectWalletAdjustment(req) {
        const note = req.body?.note || ''
        if (!note.trim()) {
            return BaseService.sendFailedResponse({
                error: 'A note is required when rejecting a wallet adjustment, so the operator knows why.',
            })
        }
        return WalletAdjustmentService.decideRequest({
            requestId: req.params.id,
            approve: false,
            adminId: req.user.id,
            note,
        })
    }

    async getPaymentVerificationQueue(req, res) {
        try {
            const result = await paginate(
                PaymentModel,
                {
                    status: PAYMENT_ORDER_STATUS.PENDING,
                    type: { $in: ['order', 'wallet-top-up'] },
                    paymentMethod: 'bank-transfer',
                },
                {
                    page: req.query.page,
                    limit: req.query.limit,
                    sort: { createdAt: -1 },
                    populate: [{ path: 'userId' }, { path: 'order' }],
                },
            )

            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }
    async acceptPaymentVerification(req, res) {
        try {
            const { id } = req.params
            const adminId = req.user.id

            if (!id)
                return BaseService.sendFailedResponse({
                    error: 'Payment ID is required',
                })

            const payment = await PaymentModel.findById(id)
            if (!payment)
                return BaseService.sendFailedResponse({
                    error: 'Payment not found',
                })

            // ← correct guard
            if (payment.status === PAYMENT_ORDER_STATUS.SUCCESS)
                return BaseService.sendFailedResponse({
                    error: 'Payment already resolved as successful',
                })

            payment.status = PAYMENT_ORDER_STATUS.SUCCESS
            payment.verifiedBy = adminId
            payment.verifiedAt = new Date()
            await payment.save()

            if (payment.type === 'wallet-top-up') {
                await WalletTransactionModel.create({
                    userId: payment.userId,
                    type: 'credit',
                    amount: payment.amount,
                    status: 'success',
                })
                // ← actually update the balance
                await WalletModel.findOneAndUpdate(
                    { userId: payment.userId },
                    { $inc: { balance: payment.amount } },
                )
            }

            if (payment.type === 'order' && payment.order) {
                await BookOrderModel.findByIdAndUpdate(payment.order, {
                    paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                })
            }

            await createNotification({
                userId: payment.userId,
                title: 'Payment Approved',
                body: `Your payment of ₦${payment.amount} has been approved.`,
                type: NOTIFICATION_TYPE.PAYMENT_UPDATE,
            })

            return BaseService.sendSuccessResponse({
                message: 'Payment verified successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }
    async rejectPaymentVerification(req, res) {
        try {
            const { id } = req.params
            const adminId = req.user.id
            if (!id) {
                return BaseService.sendFailedResponse({
                    error: 'Payment ID is required',
                })
            }

            const payment = await PaymentModel.findById(id)

            if (!payment) {
                return BaseService.sendFailedResponse({
                    error: 'Payment not found',
                })
            }

            if (payment.status === PAYMENT_ORDER_STATUS.FAILED) {
                return BaseService.sendSuccessResponse({
                    error: 'Payment already resolved as failed',
                })
            }

            payment.status = PAYMENT_ORDER_STATUS.FAILED
            payment.verifiedBy = adminId
            payment.verifiedAt = new Date()
            await payment.save()

            // If it's an order payment, update the order's payment status
            if (payment.type === 'order' && payment.order) {
                await BookOrderModel.findByIdAndUpdate(payment.order, {
                    paymentStatus: PAYMENT_ORDER_STATUS.FAILED,
                })
            }

            await createNotification({
                userId: payment.userId,
                title: 'Payment Rejected',
                body: `Your payment of ${payment.amount} has been rejected. Please contact support for more details.`,
                type: NOTIFICATION_TYPE.PAYMENT_UPDATE,
            })
            return BaseService.sendSuccessResponse({
                message: 'Payment rejected successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }
    async getOrdersByState(req, res) {
        try {
            const { type, startDate, endDate } = req.query

            if (!type)
                return BaseService.sendFailedResponse({
                    error: 'Type query parameter is required',
                })

            // build date range if provided
            let dateFilter = null
            if (startDate || endDate) {
                dateFilter = {}
                if (startDate)
                    dateFilter.$gte = new Date(
                        new Date(startDate).setHours(0, 0, 0, 0),
                    )
                if (endDate)
                    dateFilter.$lte = new Date(
                        new Date(endDate).setHours(23, 59, 59, 999),
                    )
            }

            let filter = {}

            switch (type) {
                case 'all':
                    filter = {
                        $or: [{ isPickUp: true }, { isDelivery: true }],
                    }
                    break

                case 'delivery':
                    filter = {
                        $or: [
                            { 'stage.status': ORDER_STATUS.OUT_FOR_DELIVERY },
                            {
                                isDelivery: true,
                                'dispatchDetails.delivery.status':
                                    DELIVERY_STATUS.OUT_FOR_DELIVERY,
                            },
                        ],
                    }
                    break
                case 'pendingPickup':
                    filter = {
                        isPickUp: true,
                        'dispatchDetails.pickup.status': PICKUP_STATUS.PENDING,
                    }
                    break

                case 'assigned':
                    filter = {
                        $or: [
                            {
                                isPickUp: true,
                                'dispatchDetails.pickup.rider': { $ne: null },
                                'dispatchDetails.pickup.status': PICKUP_STATUS.SCHEDULED, // ← assigned, not started
                            },
                            {
                                isDelivery: true,
                                'dispatchDetails.delivery.rider': { $ne: null },
                                'dispatchDetails.delivery.status': DELIVERY_STATUS.READY, // ← assigned, not started
                            },
                        ],
                    }
                    break
                case 'delivered':
                    filter = {
                            $or: [
                                { 'stage.status': ORDER_STATUS.DELIVERED },
                                {
                                    isDelivery: true,
                                    'dispatchDetails.delivery.status': DELIVERY_STATUS.DELIVERED,
                                },
                            ],
                        }
                    break

                default:
                    return BaseService.sendFailedResponse({
                        error: 'Invalid type',
                    })
            }

            // apply date range to createdAt if provided
            if (dateFilter) {
                filter.createdAt = dateFilter
            }

            const result = await paginate(BookOrderModel, filter, {
                page: req.query.page,
                limit: req.query.limit,
                sort: { createdAt: -1 },
                populate: [{ path: 'userId' }],
            })

            return BaseService.sendSuccessResponse({
                message: result,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong',
            })
        }
    }
    async getDispatchAdminDataCount(req, res) {
        try {
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)

            const tomorrowStart = new Date(todayStart)
            tomorrowStart.setDate(tomorrowStart.getDate() + 1)

            const todayRange = {
                $gte: todayStart,
                $lt: tomorrowStart,
            }

            const [
                pendingPickupOrders,
                scheduledPickups,
                inProgressPickups,
                pickedUpToday,
                outForDelivery,
                deliveredToday,
                deliveryFailed,
            ] = await Promise.all([
                // pending today
                // pending — current state, no date filter
                BookOrderModel.countDocuments({
                    isPickUp: true,
                    'dispatchDetails.pickup.status': PICKUP_STATUS.PENDING,
                }),

                // scheduled — current state, no date filter
                BookOrderModel.countDocuments({
                    $or: [
                        {
                            isPickUp: true,
                            'dispatchDetails.pickup.status':
                                PICKUP_STATUS.SCHEDULED,
                        },
                        {
                            isDelivery: true,
                            'dispatchDetails.delivery.status':
                                DELIVERY_STATUS.READY,
                        },
                    ],
                }),
                // BookOrderModel.countDocuments({
                //     isPickUp: true,
                //     'dispatchDetails.pickup.status': PICKUP_STATUS.SCHEDULED,
                //     'dispatchDetails.delivery.status': DELIVERY_STATUS.READY,
                // }),

                // in progress — current state, no date filter
                BookOrderModel.countDocuments({
                    isPickUp: true,
                    'dispatchDetails.pickup.status':
                        PICKUP_STATUS.PICKUP_IN_PROGRESS,
                }),

                // picked up today — date filter makes sense here
                BookOrderModel.countDocuments({
                    isPickUp: true,
                    'dispatchDetails.pickup.status': PICKUP_STATUS.PICKED_UP,
                    $or: [
                        { 'dispatchDetails.pickup.updatedAt': todayRange },
                        {
                            'dispatchDetails.pickup.updatedAt': {
                                $exists: false,
                            },
                            'stage.updatedAt': todayRange,
                        },
                    ],
                }),

                // out for delivery — current state, no date filter
                BookOrderModel.countDocuments({
                    isDelivery: true,
                    $or: [
                        { 'stage.status': ORDER_STATUS.OUT_FOR_DELIVERY },
                        { 'dispatchDetails.delivery.status': DELIVERY_STATUS.OUT_FOR_DELIVERY },
                    ],
                }),

                // delivered today — date filter makes sense here
                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.DELIVERED,
                    $or: [
                        { 'dispatchDetails.delivery.updatedAt': todayRange },
                        {
                            'dispatchDetails.delivery.updatedAt': {
                                $exists: false,
                            },
                            'stage.updatedAt': todayRange, // ← fallback for older orders
                        },
                    ],
                }),

                // failed — current state, no date filter
                BookOrderModel.countDocuments({
                    $or: [
                        {
                            'dispatchDetails.delivery.status':
                                DELIVERY_STATUS.FAILED,
                        },
                        {
                            'dispatchDetails.pickup.status':
                                PICKUP_STATUS.FAILED,
                        },
                    ],
                }),
            ])

            return BaseService.sendSuccessResponse({
                message: {
                    pendingPickupOrders,
                    scheduledPickups,
                    inProgressPickups,
                    pickedUpToday,
                    outForDelivery,
                    deliveredToday,
                    deliveryFailed,
                },
            })
        } catch (error) {
            console.log(error)

            return BaseService.sendFailedResponse({
                error: 'Something went wrong',
            })
        }
    }
    async getHoldOrders(req, res) {
        try {
            const { type, page = 1, limit = 10 } = req.query
            const now = new Date()

            if (!type)
                return BaseService.sendFailedResponse({
                    error: 'Type query parameter is required',
                })

            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)

            const todayEnd = new Date()
            todayEnd.setHours(23, 59, 59, 999)

            let filter = {}

            switch (type) {
                // Same two filters the dashboard cards count with, so the list
                // behind each card always matches the number on it (brief 4.4).
                case 'activeHolds':
                    filter = activeHoldsFilter(now, await loadHoldRules())
                    break

                case 'overdueHolds':
                    filter = overdueHoldsFilter(now, await loadHoldRules())
                    break

                case 'expiringToday':
                    filter = {
                        deliveryDate: { $gte: todayStart, $lte: todayEnd },
                        'stage.status': ORDER_STATUS.HOLD,
                    }
                    break

                default:
                    return BaseService.sendFailedResponse({
                        error: 'Invalid type. Must be one of: activeHolds, overdueHolds, expiringToday',
                    })
            }

            const result = await paginate(BookOrderModel, filter, {
                page,
                limit,
                sort: { 'stage.updatedAt': 1 },
                populate: [{ path: 'userId' }],
                lean: true,
            })

            // One read for the whole page — the rows must be judged by exactly
            // the same rules as the filter that selected them.
            const listHoldRules = await loadHoldRules()

            const enriched = result.data.map((order) => {
                const heldSince = order.stage?.updatedAt
                const heldMinutes = heldSince
                    ? Math.floor((now - new Date(heldSince)) / 60000)
                    : null

                // Brief 4.4 — this row badge used to carry its OWN hardcoded copy
                // of the SLA (120/240/360 minutes) which also ignored the
                // past-delivery-date branch. So a hold counted as Overdue could
                // still render "not breached" on its row, and the thresholds could
                // drift from the filters the cards count with. Both now come from
                // the single definition in util/holdSla.js.
                // …and now the limit itself comes from the hold's TYPE where one
                // is set, through the same resolver the filters use, so a
                // 48-hour payment hold cannot render against a 6-hour badge.
                const limit = holdLimitHours(order, listHoldRules)
                const slaThresholdMinutes = limit.hours * 60

                const slaBreached = isHoldBreached(order, now, listHoldRules)

                return {
                    ...order,
                    holdMeta: {
                        heldSince,
                        heldMinutes,
                        slaThresholdMinutes,
                        slaBreached,
                        holdTypeKey: order.orderHold?.holdTypeKey || null,
                        holdTypeName: limit.typeName,
                        slaSource: limit.source,
                    },
                }
            })

            return BaseService.sendSuccessResponse({
                message: { data: enriched, pagination: result.pagination },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }
    async reAssignOrderStation(req) {
        try {
            const { type } = req.query
            const { note } = req.body
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!note)
                return BaseService.sendFailedResponse({
                    error: 'Note is required to reassign order station',
                })

            const stationMap = {
                'intake-and-tag-station': {
                    stationStatus: STATION_STATUS.INTAKE_AND_TAG_STATION,
                    role: ROLE.INTAKE_AND_TAG,
                },
                'sort-and-pretreat-station': {
                    stationStatus: STATION_STATUS.SORT_AND_PRETREAT_STATION,
                    role: ROLE.SORT_AND_PRETREAT,
                },
                'wash-and-dry-station': {
                    stationStatus: STATION_STATUS.WASH_AND_DRY_STATION,
                    role: ROLE.WASH_AND_DRY,
                },
                'pressing-and-ironing-station': {
                    stationStatus: STATION_STATUS.PRESSING_AND_IRONING_STATION,
                    role: ROLE.PRESS,
                },
                'qc-station': {
                    stationStatus: STATION_STATUS.QC_STATION,
                    role: ROLE.QC,
                },
            }

            if (!type || !stationMap[type])
                return BaseService.sendFailedResponse({
                    error: `Invalid station. Must be one of: ${Object.keys(stationMap).join(', ')}`,
                })
            const target = stationMap[type]
            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.HOLD,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not currently on hold',
                })
            if (order.stationStatus === target.stationStatus)
                return BaseService.sendFailedResponse({
                    error: `Order is already assigned to ${type}. Choose a different station to reassign to.`,
                })

            await BookOrderModel.findByIdAndUpdate(
                orderId,
                {
                    $set: {
                        stationStatus: target.stationStatus,
                        'stage.note': note,
                        'stage.updatedAt': new Date(),
                    },
                    $push: {
                        stageHistory: {
                            status: ORDER_STATUS.HOLD,
                            note: `Reassigned to ${type}: ${note}`,
                            updatedAt: new Date(),
                        },
                    },
                },
                { runValidators: false },
            )

            await ActivityModel.create({
                title: 'Hold Reassigned',
                description: `Order ${order.oscNumber} hold reassigned to ${type}. Note: ${note}`,
                type: ACTIVITY_TYPE.ORDER_ON_HOLD,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            // CLIENT SECTION 10: the receipt to the person who performed the
            // action is switched off — they already know, the screen confirmed
            // it, and the audit line below is the lasting record. Only the
            // AFFECTED station is told (just after the audit log).
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'system',
                action: `Order ${order.oscNumber}  has been assigned to ${type} ${note ? ` Note: ${note}.` : ''}`,
            })

            // The AFFECTED station is told — this is the only way they learn a
            // held order is now their problem. `actorId` excludes whoever
            // performed the reassignment, even if they work at that station.
            await notifyAffectedStation({
                role: target.role,
                actorId: userId,
                title: 'Hold Order Assigned to Your Station',
                body: `Order ${order.oscNumber} has been reassigned to your station for resolution. Note: ${note}`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })

            return BaseService.sendSuccessResponse({
                message: `Order ${order.oscNumber} hold reassigned to ${type}`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to reassign order station',
            })
        }
    }

    async resolveOrderHold(req) {
        try {
            const { type } = req.query
            const { note } = req.body
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!note)
                return BaseService.sendFailedResponse({
                    error: 'Resolution note is required',
                })

            const stationOrderStatusMap = {
                'intake-and-tag-station': {
                    stationStatus: STATION_STATUS.INTAKE_AND_TAG_STATION,
                    orderStatus: ORDER_STATUS.QUEUE,
                    role: ROLE.INTAKE_AND_TAG,
                },
                'sort-and-pretreat-station': {
                    stationStatus: STATION_STATUS.SORT_AND_PRETREAT_STATION,
                    orderStatus: ORDER_STATUS.SORT_AND_PRETREAT,
                    role: ROLE.SORT_AND_PRETREAT,
                },
                'wash-and-dry-station': {
                    stationStatus: STATION_STATUS.WASH_AND_DRY_STATION,
                    orderStatus: ORDER_STATUS.WASHING,
                    role: ROLE.WASH_AND_DRY,
                },
                'pressing-and-ironing-station': {
                    stationStatus: STATION_STATUS.PRESSING_AND_IRONING_STATION,
                    orderStatus: ORDER_STATUS.IRONING,
                    role: ROLE.PRESS,
                },
                'qc-station': {
                    stationStatus: STATION_STATUS.QC_STATION,
                    orderStatus: ORDER_STATUS.QC,
                    role: ROLE.QC,
                },
            }

            if (!type || !stationOrderStatusMap[type])
                return BaseService.sendFailedResponse({
                    error: `Invalid station. Must be one of: ${Object.keys(stationOrderStatusMap).join(', ')}`,
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.HOLD,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not currently on hold',
                })

            const target = stationOrderStatusMap[type]
            const now = new Date()

            // if returning to intake reset all tags so order lands in
            // tagging queue not drafts — staff re-tags from scratch
            const extraUpdates =
                type === 'intake-and-tag-station'
                    ? {
                          'items.$[].tagStatus': 'pending',
                          'items.$[].tagId': '',
                          'items.$[].tagState': [],
                          'items.$[].tagColor': null,
                      }
                    : {}

            await BookOrderModel.findByIdAndUpdate(
                orderId,
                {
                    $set: {
                        'stage.status': target.orderStatus,
                        'stage.note': note,
                        'stage.updatedAt': now,
                        stationStatus: target.stationStatus,
                        ...extraUpdates,
                    },
                    $push: {
                        stageHistory: {
                            status: target.orderStatus,
                            note: `Hold resolved. Returned to ${type}: ${note}`,
                            updatedAt: now,
                        },
                    },
                },
                { runValidators: false },
            )

            await ActivityModel.create({
                title: 'Hold Resolved',
                description: `Order ${order.oscNumber} hold resolved by admin. Returned to ${type}. Note: ${note}`,
                type: ACTIVITY_TYPE.ORDER_RELEASED_FROM_HOLD,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            // CLIENT SECTION 10: no receipt to whoever resolved it. Only the
            // station the order RETURNS to is told, because that is the only
            // way they learn a job they could not touch is live again — and
            // never the actor, even if they work at that station.
            await notifyAffectedStation({
                role: target.role,
                actorId: userId,
                title: 'Order Returned to Your Station',
                body: `Order ${order.oscNumber} hold has been resolved and returned to your station. Note: ${note}`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })

            // notify customer if linked account exists
            if (order.userId) {
                await createNotification({
                    userId: order.userId,
                    title: 'Order Update',
                    body: `Your order ${order.oscNumber} is back in processing after a hold.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.ORDER_UPDATED,
                })
            }
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'system',
                action: `Order ${order.oscNumber}  has been resolved from hold and returned to ${type} ${note ? ` Note: ${note}.` : ''}`,
            })

            return BaseService.sendSuccessResponse({
                message: `Order ${order.oscNumber} hold resolved. Returned to ${type}`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to resolve order hold',
            })
        }
    }

    async addFund(req) {
        try {
            const message = req.body.message
            const userId = req.params.id
            const amount = req.body.amount

            if (!amount) {
                return BaseService.sendFailedResponse({
                    error: 'Amount is required to add fund to wallet',
                })
            }

            if (amount <= 0) {
                return BaseService.sendFailedResponse({
                    error: 'Amount must be greater than zero',
                })
            }

            if (!userId) {
                return BaseService.sendFailedResponse({
                    error: 'User ID is required to add fund to wallet',
                })
            }

            // Brief 2.3/2.4 (found while answering 4.3): this admin path kept its
            // OWN copy of the money code — a non-atomic `balance += amount` after a
            // separate read, and a ledger line with no performedBy, no balanceAfter
            // and no rollback. That is exactly what 2.3 fixed on the intake path, so
            // route it through the one shared mover: an admin's adjustment and an
            // operator's now produce identical ledger lines.
            let ledger
            try {
                ledger = await WalletAdjustmentService.applyAdjustment({
                    userId,
                    amount,
                    type: 'credit',
                    reason: message || 'Admin added fund to wallet',
                    performedBy: req.user?.id,
                    performedByName: 'Admin',
                })
            } catch (error) {
                return BaseService.sendFailedResponse({
                    error: error.message || 'Failed to add fund to wallet',
                })
            }

            // Kept: the existing UpdateFund row other screens read.
            await logSafely(
                'Admin fund-add record',
                UpdateFundModel.create({
                    userId,
                    amount,
                    type: 'credit',
                    ...(message && { message }),
                }),
            )

            // The money has moved — telling the customer must not be able to
            // report the move as a failure (brief 2.5 / 3.1 / 4.1, same shape).
            await logSafely(
                'Wallet addition notification',
                createNotification({
                    userId: userId,
                    title: 'Wallet addition',
                    body: `₦${amount} has been added to your wallet`,
                    type: NOTIFICATION_TYPE.WALLET_UPDATE,
                }),
            )

            return BaseService.sendSuccessResponse({
                message: 'Fund added to wallet successfully',
                balance: ledger?.wallet?.balance ?? null,
                transaction: ledger?.ledgerEntry ?? null,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to add fund to wallet',
            })
        }
    }
    async deductFund(req) {
        try {
            const message = req.body.message
            const userId = req.params.id
            const amount = req.body.amount

            if (!amount)
                return BaseService.sendFailedResponse({
                    error: 'Amount is required to remove fund from wallet',
                })
            if (amount <= 0)
                return BaseService.sendFailedResponse({
                    error: 'Amount must be greater than zero',
                })
            if (!userId)
                return BaseService.sendFailedResponse({
                    error: 'User ID is required to deduct fund from wallet',
                })

            // Same as addFund: the shared mover owns the money. Its overdraw guard
            // is part of the update itself, so two concurrent deductions cannot
            // both pass it — the read-then-subtract here could.
            let ledger
            try {
                ledger = await WalletAdjustmentService.applyAdjustment({
                    userId,
                    amount,
                    type: 'debit',
                    reason: message || 'Admin deducted fund from wallet',
                    performedBy: req.user?.id,
                    performedByName: 'Admin',
                })
            } catch (error) {
                return BaseService.sendFailedResponse({
                    error:
                        /insufficient/i.test(error.message || '')
                            ? 'Insufficient balance in wallet'
                            : error.message || 'Failed to deduct fund from wallet',
                })
            }

            await logSafely(
                'Admin fund-deduct record',
                UpdateFundModel.create({
                    userId,
                    amount,
                    type: 'debit',
                    ...(message && { message }),
                }),
            )

            await logSafely(
                'Wallet deduction notification',
                createNotification({
                    userId,
                    title: 'Wallet deduction',
                    body: `₦${amount} has been deducted from your wallet`,
                    type: NOTIFICATION_TYPE.WALLET_UPDATE,
                }),
            )

            return BaseService.sendSuccessResponse({
                message: 'Fund deducted from wallet successfully',
                balance: ledger?.wallet?.balance ?? null,
                transaction: ledger?.ledgerEntry ?? null,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to deduct fund from wallet',
            })
        }
    }
    async getAuditLite(req) {
        try {
            const {
                page = 1,
                limit = 10,
                search = '',
                type = '', // filter by event type
                startDate,
                endDate,
            } = req.query

            const query = {}

            if (type) {
                query.type = type
            }

            if (search) {
                query.$or = [
                    { reference: { $regex: search, $options: 'i' } },
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                ]
            }

            if (startDate || endDate) {
                query.createdAt = {}
                if (startDate) query.createdAt.$gte = new Date(startDate)
                if (endDate) query.createdAt.$lte = new Date(endDate)
            }

            const { data, pagination } = await paginate(ActivityModel, query, {
                page,
                limit,
                sort: { createdAt: -1 },
                populate: [
                    { path: 'userId', select: 'fullName email' },
                    { path: 'orderId', select: 'oscNumber' },
                ],
                lean: true,
            })

            const formatted = data.map((activity) => ({
                _id: activity._id,
                timestamp: activity.createdAt,
                event: activity.title,
                type: activity.type,
                reference:
                    activity.orderId?.oscNumber || activity.reference || null,
                by: activity.userId?.fullName || null,
                notes: activity.description,
            }))

            // Available filter types for the dropdown
            const eventTypes = Object.values(
                require('../util/constants').ACTIVITY_TYPE,
            )

            return BaseService.sendSuccessResponse({
                message: { data: formatted, pagination, eventTypes },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch audit log',
            })
        }
    }

    async searchWallet(req) {
        try {
            const search = req.query.search

            if (!search || !search.trim()) {
                return BaseService.sendFailedResponse({
                    error: 'Search query is required',
                })
            }

            const keyword = search.trim()

            const users = await UserModel.find({
                $or: [
                    { fullName: { $regex: keyword, $options: 'i' } },
                    { phoneNumber: { $regex: keyword, $options: 'i' } },
                ],
            }).select('_id fullName phoneNumber')

            if (!users.length) {
                return BaseService.sendSuccessResponse({ message: [] })
            }

            const userIds = users.map((user) => user._id)

            const wallets = await WalletModel.find({
                userId: { $in: userIds },
            }).populate('userId', 'fullName phoneNumber')

            return BaseService.sendSuccessResponse({ message: wallets })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to search wallet',
            })
        }
    }

    // ── Hold types (client section B, 2026-10-07) ────────────────────────────
    // "The admin can create hold types and choose which stations can raise each
    // type. Each hold type has one time limit, and the admin can edit it."
    async listHoldTypes(req) {
        try {
            const HoldTypeModel = require('../models/holdType.model')
            const { includeInactive } = req.query || {}
            const query = includeInactive === 'true' ? {} : { active: true }
            const types = await HoldTypeModel.find(query)
                .sort({ isSystem: -1, name: 1 })
                .lean()

            // How many holds are sitting on each type right now, so the admin
            // can see what a limit change will actually affect before saving.
            const counts = await BookOrderModel.aggregate([
                { $match: { 'stage.status': ORDER_STATUS.HOLD } },
                { $group: { _id: '$orderHold.holdTypeKey', total: { $sum: 1 } } },
            ])
            const onHold = new Map(counts.map((c) => [c._id, c.total]))

            return BaseService.sendSuccessResponse({
                message: types.map((t) => ({
                    ...t,
                    // null is not "no limit" — it means this type still follows
                    // the order's delivery speed, which is what every seeded
                    // operational type does until an admin sets a number.
                    effectiveLimit:
                        t.slaHours > 0
                            ? `${t.slaHours} hours`
                            : `Follows the order's delivery speed (${HOLD_SLA_HOURS[DELIVERY_SPEED.SAME_DAY]}h same-day / ${HOLD_SLA_HOURS[DELIVERY_SPEED.EXPRESS]}h express / ${HOLD_SLA_HOURS[DELIVERY_SPEED.STANDARD]}h standard)`,
                    ordersOnHoldNow: onHold.get(t.key) || 0,
                })),
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to list hold types',
            })
        }
    }

    async createHoldType(req) {
        try {
            const HoldTypeModel = require('../models/holdType.model')
            const { name, description, slaHours, stations, escalateToAdmin } =
                req.body || {}

            if (!String(name || '').trim()) {
                return BaseService.sendFailedResponse({
                    error: 'A hold type needs a name.',
                })
            }
            const check = this._validateHoldTypeFields({ slaHours, stations })
            if (check) return BaseService.sendFailedResponse({ error: check })

            // Derived from the name, so the admin never has to invent an id —
            // and immutable afterwards, because orders store the key.
            const key = String(name)
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
            if (!key) {
                return BaseService.sendFailedResponse({
                    error: 'That name has no letters or numbers in it.',
                })
            }
            if (await HoldTypeModel.findOne({ key })) {
                return BaseService.sendFailedResponse({
                    error: `A hold type called "${name}" already exists.`,
                })
            }

            const created = await HoldTypeModel.create({
                key,
                name: String(name).trim(),
                description,
                slaHours: slaHours == null || slaHours === '' ? null : Number(slaHours),
                stations: stations || [],
                escalateToAdmin: escalateToAdmin !== false,
            })
            await logSafely('hold type audit', () =>
                createAuditLog({
                    userId: getObjectId(req.user?.id),
                    action: `created hold type "${created.name}" (limit: ${created.slaHours ? created.slaHours + 'h' : "the order's delivery speed"})`,
                    category: 'order',
                }),
            )
            return BaseService.sendSuccessResponse({ message: created })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to create that hold type',
            })
        }
    }

    async updateHoldType(req) {
        try {
            const HoldTypeModel = require('../models/holdType.model')
            const type = await HoldTypeModel.findById(req.params?.id)
            if (!type) {
                return BaseService.sendFailedResponse({
                    error: 'That hold type no longer exists.',
                })
            }
            const { name, description, slaHours, stations, escalateToAdmin, active } =
                req.body || {}

            const check = this._validateHoldTypeFields({ slaHours, stations })
            if (check) return BaseService.sendFailedResponse({ error: check })

            // A system type may have its limit and stations tuned but must not
            // be renamed out of recognition or switched off — the payment flow
            // looks it up by key and would have nowhere to put a payment hold.
            if (type.isSystem && active === false) {
                return BaseService.sendFailedResponse({
                    error: `"${type.name}" is used by the system and cannot be switched off. You can change its limit instead.`,
                })
            }

            const before = type.slaHours
            if (name !== undefined && !type.isSystem) type.name = String(name).trim()
            if (description !== undefined) type.description = description
            if (slaHours !== undefined)
                type.slaHours =
                    slaHours === null || slaHours === '' ? null : Number(slaHours)
            if (stations !== undefined) type.stations = stations || []
            if (escalateToAdmin !== undefined)
                type.escalateToAdmin = escalateToAdmin !== false
            if (active !== undefined && !type.isSystem) type.active = active !== false
            await type.save()

            await logSafely('hold type audit', () =>
                createAuditLog({
                    userId: getObjectId(req.user?.id),
                    action: `updated hold type "${type.name}" — limit ${before ? before + 'h' : "delivery speed"} → ${type.slaHours ? type.slaHours + 'h' : "delivery speed"}`,
                    category: 'order',
                }),
            )
            return BaseService.sendSuccessResponse({ message: type })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to update that hold type',
            })
        }
    }

    async deleteHoldType(req) {
        try {
            const HoldTypeModel = require('../models/holdType.model')
            const type = await HoldTypeModel.findById(req.params?.id)
            if (!type) {
                return BaseService.sendFailedResponse({
                    error: 'That hold type no longer exists.',
                })
            }
            if (type.isSystem) {
                return BaseService.sendFailedResponse({
                    error: `"${type.name}" is used by the system and cannot be deleted.`,
                })
            }
            // Deleting a type that orders are sitting on would silently move
            // them back onto the delivery-speed clock, which for a long hold
            // means instantly Overdue. Deactivate instead — it stops new holds
            // using it while the existing ones keep their limit.
            const inUse = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.HOLD,
                'orderHold.holdTypeKey': type.key,
            })
            if (inUse > 0) {
                type.active = false
                await type.save()
                return BaseService.sendSuccessResponse({
                    message: {
                        deleted: false,
                        deactivated: true,
                        ordersOnHoldNow: inUse,
                        note: `${inUse} order(s) are on hold under "${type.name}", so it has been switched off for new holds instead of deleted. Those orders keep their current limit.`,
                    },
                })
            }
            await HoldTypeModel.deleteOne({ _id: type._id })
            await logSafely('hold type audit', () =>
                createAuditLog({
                    userId: getObjectId(req.user?.id),
                    action: `deleted hold type "${type.name}"`,
                    category: 'order',
                }),
            )
            return BaseService.sendSuccessResponse({
                message: { deleted: true, deactivated: false },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to delete that hold type',
            })
        }
    }

    // Client B.3: an overdue hold is escalated to the admin. Driven by
    // crons/holdSlaScan.js every 20 minutes.
    //
    // ONCE per breach, never per sweep: `orderHold.escalatedAt` is the latch,
    // and it is cleared when the hold is raised, so the same order escalating
    // again after a release and a fresh hold is correct rather than suppressed.
    async escalateOverdueHolds() {
        const { notifyRoles } = require('../util/notifyRoles')
        const now = new Date()
        const rules = await loadHoldRules()

        const overdue = await BookOrderModel.find({
            ...overdueHoldsFilter(now, rules),
            'orderHold.escalatedAt': { $exists: false },
        })
            .select('oscNumber stage holdDetails deliverySpeed deliveryDate')
            .lean()

        let escalated = 0
        for (const order of overdue) {
            const key = order.orderHold?.holdTypeKey
            const type = key ? rules.byKey[key] : null
            // A type the admin switched escalation off for is still Overdue on
            // the card — it just does not interrupt anyone.
            if (type && type.escalateToAdmin === false) continue

            const { hours, typeName } = holdLimitHours(order, rules)
            const heldHours = order.stage?.updatedAt
                ? Math.floor((now - new Date(order.stage.updatedAt)) / 3600000)
                : null

            await logSafely('hold escalation notice', () =>
                notifyRoles({
                    roles: [ROLE.ADMIN],
                    title: 'Hold is overdue',
                    body: `${order.oscNumber} has been on hold${typeName ? ` (${typeName})` : ''} for ${heldHours ?? '?'} hours, past its ${hours}-hour limit.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.ORDER_ON_HOLD,
                }),
            )
            await BookOrderModel.updateOne(
                { _id: order._id },
                { $set: { 'orderHold.escalatedAt': now } },
            )
            escalated++
        }
        return escalated
    }

    _validateHoldTypeFields({ slaHours, stations }) {
        if (slaHours !== undefined && slaHours !== null && slaHours !== '') {
            const n = Number(slaHours)
            if (!Number.isFinite(n) || n < 0.25) {
                return 'The time limit must be a number of hours, at least 0.25 (15 minutes). Leave it empty to follow the order\'s delivery speed.'
            }
        }
        if (stations !== undefined && stations !== null) {
            if (!Array.isArray(stations)) {
                return 'stations must be a list of roles.'
            }
            const allowed = Object.values(ROLE).filter((r) => r !== ROLE.USER)
            const bad = stations.filter((s) => !allowed.includes(s))
            if (bad.length) {
                return `Unknown station(s): ${bad.join(', ')}. Valid: ${allowed.join(', ')}`
            }
        }
        return null
    }

    // ── Staff status: suspend / reinstate ────────────────────────────────────
    // Raised by the FE 2026-10-07: "there is no endpoint to suspend a rider."
    // Correct, and the gap was narrower and worse than it looked. `User.status`
    // already has active|inactive|suspended; `resolveRider` already refuses a
    // non-active rider both places a rider can be assigned; `getRiders` already
    // hides them; `notifyRoles` already skips them. Every READER was built.
    // NOTHING COULD EVER WRITE THE FIELD — it was 'active' from signup forever,
    // so the whole suspension path was unreachable. These two methods are the
    // missing write, plus the login check in auth.service.
    async listStaff(req) {
        try {
            const { role, status, search, page = 1, limit = 50 } = req.query || {}

            // Customers are deliberately out of reach here. Suspending a paying
            // customer is a different decision with different consequences, and
            // a staff screen must not be able to do it by accident.
            const staffRoles = Object.values(ROLE).filter((r) => r !== ROLE.USER)

            const query = { userType: { $in: staffRoles } }
            if (role) {
                if (!staffRoles.includes(role)) {
                    return BaseService.sendFailedResponse({
                        error: `role must be one of: ${staffRoles.join(', ')}`,
                    })
                }
                query.userType = role
            }
            if (status) {
                if (!Object.values(GENERAL_STATUS).includes(status)) {
                    return BaseService.sendFailedResponse({
                        error: `status must be one of: ${Object.values(GENERAL_STATUS).join(', ')}`,
                    })
                }
                query.status = status
            }
            if (search && search.trim()) {
                const keyword = search.trim()
                query.$or = [
                    { fullName: { $regex: keyword, $options: 'i' } },
                    { phoneNumber: { $regex: keyword, $options: 'i' } },
                    { email: { $regex: keyword, $options: 'i' } },
                ]
            }

            const { data, pagination } = await paginate(UserModel, query, {
                page,
                limit,
                sort: { userType: 1, fullName: 1 },
                select: 'fullName email phoneNumber userType status image statusReason statusChangedAt createdAt',
                lean: true,
            })

            const rows = data.map((u) => ({
                ...u,
                role: u.userType,
                // the one thing the screen needs to know before it offers the
                // button: can this person still work?
                canWork: u.status === GENERAL_STATUS.ACTIVE,
            }))

            const counts = await UserModel.aggregate([
                { $match: { userType: { $in: staffRoles } } },
                { $group: { _id: '$status', total: { $sum: 1 } } },
            ])

            return BaseService.sendSuccessResponse({
                message: {
                    data: rows,
                    pagination,
                    counts: Object.values(GENERAL_STATUS).reduce(
                        (acc, s) => ({
                            ...acc,
                            [s]: counts.find((c) => c._id === s)?.total || 0,
                        }),
                        {},
                    ),
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to list staff',
            })
        }
    }

    async setStaffStatus(req) {
        try {
            const actorId = req.user?.id
            const { status, reason } = req.body || {}
            const targetId = getObjectId(req.params?.id)

            if (!targetId) {
                return BaseService.sendFailedResponse({
                    error: 'That staff id is not valid.',
                })
            }
            if (!Object.values(GENERAL_STATUS).includes(status)) {
                return BaseService.sendFailedResponse({
                    error: `status must be one of: ${Object.values(GENERAL_STATUS).join(', ')}`,
                })
            }

            const target = await UserModel.findById(targetId).select(
                'fullName userType status',
            )
            if (!target) {
                return BaseService.sendFailedResponse({
                    error: 'That staff member no longer exists.',
                })
            }
            if (target.userType === ROLE.USER) {
                return BaseService.sendFailedResponse({
                    error: `${target.fullName || 'That account'} is a customer, not a staff member. Customer accounts are not suspended from here.`,
                })
            }

            // Locking yourself out is never what you meant.
            if (
                String(targetId) === String(actorId) &&
                status !== GENERAL_STATUS.ACTIVE
            ) {
                return BaseService.sendFailedResponse({
                    error: 'You cannot suspend or deactivate your own account.',
                })
            }

            // …and neither is locking EVERYONE out. Without this, suspending the
            // last admin leaves nobody who can reinstate anyone, and the only
            // way back is a database edit.
            if (
                target.userType === ROLE.ADMIN &&
                status !== GENERAL_STATUS.ACTIVE
            ) {
                const otherActiveAdmins = await UserModel.countDocuments({
                    _id: { $ne: targetId },
                    userType: ROLE.ADMIN,
                    status: GENERAL_STATUS.ACTIVE,
                })
                if (otherActiveAdmins === 0) {
                    return BaseService.sendFailedResponse({
                        error: 'This is the only active admin. Make another account an active admin first, or nobody will be able to undo this.',
                    })
                }
            }

            // A reason is the whole point of the record — "why is this rider
            // suspended" must be answerable six weeks later.
            if (status !== GENERAL_STATUS.ACTIVE && !String(reason || '').trim()) {
                return BaseService.sendFailedResponse({
                    error: 'Please give a reason. It is shown to the staff member and kept on the record.',
                })
            }

            if (target.status === status) {
                // Idempotent on purpose: a double-tap must not write a second
                // audit line implying it happened twice.
                return BaseService.sendSuccessResponse({
                    message: {
                        staff: {
                            _id: target._id,
                            fullName: target.fullName,
                            role: target.userType,
                            status: target.status,
                        },
                        changed: false,
                        note: `${target.fullName || 'They'} is already ${status}.`,
                    },
                })
            }

            const previousStatus = target.status
            target.status = status
            target.statusReason = status === GENERAL_STATUS.ACTIVE ? null : String(reason).trim()
            target.statusChangedAt = new Date()
            target.statusChangedBy = getObjectId(actorId)
            await target.save()

            // Everything below is RECORD-KEEPING. It runs after the status is
            // already saved and must never be able to report the change as
            // failed — the 2.5 / 4.1 / 3.1 false-failure shape. See util/safeLog.
            const verb =
                status === GENERAL_STATUS.ACTIVE
                    ? 'reinstated'
                    : status === GENERAL_STATUS.SUSPENDED
                      ? 'suspended'
                      : 'deactivated'

            await logSafely('staff status audit', () =>
                createAuditLog({
                    userId: getObjectId(actorId),
                    action: `${verb} ${target.fullName || 'a staff member'} (${target.userType}) — was ${previousStatus}${target.statusReason ? `. Reason: ${target.statusReason}` : ''}`,
                    category: 'auth',
                }),
            )
            await logSafely('staff status notice', () =>
                createNotification({
                    userId: target._id,
                    title:
                        status === GENERAL_STATUS.ACTIVE
                            ? 'Your account has been reinstated'
                            : `Your account has been ${verb}`,
                    body:
                        status === GENERAL_STATUS.ACTIVE
                            ? 'You can sign in and pick up work again.'
                            : `${target.statusReason} — you will not be able to sign in until this is lifted.`,
                    type: NOTIFICATION_TYPE.SYSTEM,
                }),
            )

            return BaseService.sendSuccessResponse({
                message: {
                    staff: {
                        _id: target._id,
                        fullName: target.fullName,
                        role: target.userType,
                        status: target.status,
                        statusReason: target.statusReason,
                        statusChangedAt: target.statusChangedAt,
                    },
                    changed: true,
                    previousStatus,
                    // what this actually does, in the caller's words
                    effect:
                        status === GENERAL_STATUS.ACTIVE
                            ? 'They can sign in and be assigned work again.'
                            : 'They can no longer sign in, and cannot be assigned a pickup or a delivery. Work already assigned to them is NOT moved — reassign it.',
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to update that staff member',
            })
        }
    }

    // Admin-side wallet ledger (brief item 2.3). The customer could already see
    // their own lines (`/wallet/fetch-user-transactions`, scoped to req.user),
    // but NOTHING on the admin side listed wallet movements — so the client's own
    // test for 2.3 ("both lines show in the customer app AND in admin") could not
    // be satisfied, and the admin Money page had no source to read.
    //
    // Every movement in the system writes a WalletTransaction, so this is the
    // whole ledger: top-ups, order payments, reversals, credit expiry and manual
    // adjustments, each with who did it and the balance it left behind.
    async listWalletTransactions(req) {
        try {
            const {
                userId,
                type,
                status,
                search,
                from,
                to,
                page = 1,
                limit = 20,
            } = req.query || {}

            const query = {}

            if (type) {
                if (!Object.values(WALLET_TX_TYPE).includes(type)) {
                    return BaseService.sendFailedResponse({
                        error: `type must be one of: ${Object.values(WALLET_TX_TYPE).join(', ')}`,
                    })
                }
                query.type = type
            }
            if (status) query.status = status

            if (userId) {
                const id = getObjectId(userId)
                if (!id) {
                    return BaseService.sendFailedResponse({
                        error: 'userId is not a valid id',
                    })
                }
                query.userId = id
            } else if (search && search.trim()) {
                // same name/phone search as the wallet search above, so the two
                // admin screens find the same person by the same text
                const keyword = search.trim()
                const users = await UserModel.find({
                    $or: [
                        { fullName: { $regex: keyword, $options: 'i' } },
                        { phoneNumber: { $regex: keyword, $options: 'i' } },
                    ],
                })
                    .select('_id')
                    .lean()
                if (!users.length) {
                    return BaseService.sendSuccessResponse({
                        message: {
                            data: [],
                            pagination: { total: 0, page: Number(page), limit: Number(limit), pages: 0 },
                            totals: { credit: 0, debit: 0, net: 0 },
                        },
                    })
                }
                query.userId = { $in: users.map((u) => u._id) }
            }

            // Lagos day boundaries, and the upper bound is EXCLUSIVE — `to` means
            // "through the end of that day", so a transaction at 23:59 is in.
            if (from || to) {
                query.createdAt = {}
                if (from) query.createdAt.$gte = startOfDay(new Date(from))
                if (to) query.createdAt.$lt = endOfDay(new Date(to))
            }

            const { data, pagination } = await paginate(
                WalletTransactionModel,
                query,
                {
                    page,
                    limit,
                    sort: { createdAt: -1 },
                    populate: [
                        { path: 'userId', select: 'fullName phoneNumber' },
                        // the role field on User is `userType`, NOT `role` —
                        // selecting `role` returns a populated doc with the name
                        // filled in and the role silently undefined, which is
                        // exactly how this shipped the first time
                        { path: 'performedBy', select: 'fullName userType' },
                    ],
                    lean: true,
                },
            )

            // Money in / money out across the WHOLE filtered set, not just this
            // page — a page total would be meaningless on a ledger.
            const totalsAgg = await WalletTransactionModel.aggregate([
                { $match: query },
                { $group: { _id: '$type', total: { $sum: '$amount' } } },
            ])
            const sumOf = (t) =>
                totalsAgg.find((r) => r._id === t)?.total || 0
            // A manual adjustment stores a SIGNED amount (2.3), so it lands on
            // whichever side its sign says — never assume the type alone.
            const manual = await WalletTransactionModel.aggregate([
                { $match: { ...query, type: WALLET_TX_TYPE.MANUAL_ADJUSTMENT } },
                {
                    $group: {
                        _id: null,
                        up: {
                            $sum: {
                                $cond: [{ $gt: ['$amount', 0] }, '$amount', 0],
                            },
                        },
                        down: {
                            $sum: {
                                $cond: [{ $lt: ['$amount', 0] }, '$amount', 0],
                            },
                        },
                    },
                },
            ])
            const credit =
                sumOf(WALLET_TX_TYPE.CREDIT) + (manual[0]?.up || 0)
            const debit =
                sumOf(WALLET_TX_TYPE.DEBIT) +
                Math.abs(manual[0]?.down || 0) +
                sumOf(WALLET_TX_TYPE.EXPIRY)

            const rows = data.map((t) => ({
                ...t,
                customer: t.userId
                    ? {
                          _id: t.userId._id,
                          fullName: t.userId.fullName,
                          phoneNumber: t.userId.phoneNumber,
                      }
                    : null,
                // who moved the money — null for system/automatic movements
                operator: t.performedBy
                    ? {
                          _id: t.performedBy._id,
                          fullName: t.performedBy.fullName,
                          role: t.performedBy.userType,
                      }
                    : null,
                userId: t.userId?._id || t.userId,
                performedBy: t.performedBy?._id || t.performedBy || null,
            }))

            return BaseService.sendSuccessResponse({
                message: {
                    data: rows,
                    pagination,
                    totals: { credit, debit, net: credit - debit },
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to load wallet transactions',
            })
        }
    }
    // async addItem(req) {
    //     try {
    //         const name = req.body.name
    //         const price = req.body.price
    //         if (!name) {
    //             return BaseService.sendFailedResponse({
    //                 error: 'Please enter a name for the item',
    //             })
    //         }
    //         if (!price) {
    //             return BaseService.sendFailedResponse({
    //                 error: 'Please enter a price for the item',
    //             })
    //         }

    //         await OrderItemModel.create({ name, price })

    //         return BaseService.sendSuccessResponse({
    //             message: 'Item added successfully',
    //         })
    //     } catch (error) {
    //         console.log(error)
    //         return BaseService.sendFailedResponse({
    //             error: 'Something went wrong. Please try again later',
    //         })
    //     }
    // }
    async addItem(req) {
        try {
            const { name, price, isHeavy = false } = req.body

            if (!name)
                return BaseService.sendFailedResponse({
                    error: 'Please enter a name for the item',
                })
            if (!price)
                return BaseService.sendFailedResponse({
                    error: 'Please enter a price for the item',
                })

            await OrderItemModel.create({ name, price, isHeavy })

            return BaseService.sendSuccessResponse({
                message: 'Item added successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }
    async updateItem(req) {
        try {
            const orderItemId = req.params.id
            if (!orderItemId) {
                return BaseService.sendFailedResponse({
                    error: 'Please enter an order item ID',
                })
            }

            const orderItem = await OrderItemModel.findById(orderItemId)

            if (!orderItem) {
                return BaseService.sendFailedResponse({
                    error: 'Order item not found',
                })
            }

            await OrderItemModel.findOneAndUpdate(
                { _id: orderItemId },
                { $set: req.body },
                { new: true },
            )
            return BaseService.sendSuccessResponse({
                message: 'Item updated successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }
    async getItems(req) {
        try {
            // Catalog browse: single items plus active sets, each tagged `kind`
            // so the client can render sets (pick pieces) vs individual items.
            const [orderItems, sets] = await Promise.all([
                OrderItemModel.find({}).lean(),
                ItemSetModel.find({ active: true }).lean(),
            ])
            const items = orderItems.map((i) => ({ ...i, kind: 'item' }))
            const setEntries = sets.map((s) => ({ ...s, kind: 'set' }))

            return BaseService.sendSuccessResponse({
                message: [...items, ...setEntries],
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }
    async getItem(req) {
        try {
            const orderItemId = req.params.id
            if (!orderItemId) {
                return BaseService.sendFailedResponse({
                    error: 'Please enter an order item ID',
                })
            }

            const orderItem = await OrderItemModel.findById(orderItemId)

            if (!orderItem) {
                return BaseService.sendFailedResponse({
                    error: 'Order item not found',
                })
            }

            return BaseService.sendSuccessResponse({ message: orderItem })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }
    async deleteItem(req) {
        try {
            const orderItemId = req.params.id
            if (!orderItemId) {
                return BaseService.sendFailedResponse({
                    error: 'Please enter an order item ID',
                })
            }

            const orderItem = await OrderItemModel.findById(orderItemId)

            if (!orderItem) {
                return BaseService.sendFailedResponse({
                    error: 'Order item not found',
                })
            }

            await OrderItemModel.findOneAndDelete({
                _id: orderItemId,
            })

            return BaseService.sendSuccessResponse({
                message: 'Order item deleted successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    // ── Item Sets ──────────────────────────────────────────────
    async addOrderSet(req) {
        try {
            const { name, pieces, active = true } = req.body
            const check = this._validateSetPayload({ name, pieces })
            if (!check.ok) {
                return BaseService.sendFailedResponse({ error: check.error })
            }

            await ItemSetModel.create({ name, pieces: check.pieces, active })

            return BaseService.sendSuccessResponse({
                message: 'Set added successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async updateOrderSet(req) {
        try {
            const setId = req.params.id
            if (!setId) {
                return BaseService.sendFailedResponse({
                    error: 'Please enter a set ID',
                })
            }

            const set = await ItemSetModel.findById(setId)
            if (!set) {
                return BaseService.sendFailedResponse({ error: 'Set not found' })
            }

            const update = { ...req.body }
            // If pieces are being updated, validate the same rules.
            if (update.pieces !== undefined) {
                const check = this._validateSetPayload({
                    name: update.name ?? set.name,
                    pieces: update.pieces,
                })
                if (!check.ok) {
                    return BaseService.sendFailedResponse({ error: check.error })
                }
                update.pieces = check.pieces
            }

            await ItemSetModel.findOneAndUpdate(
                { _id: setId },
                { $set: update },
                { new: true },
            )
            return BaseService.sendSuccessResponse({
                message: 'Set updated successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getOrderSets(req) {
        try {
            const sets = await ItemSetModel.find({})
            return BaseService.sendSuccessResponse({ message: sets })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getOrderSet(req) {
        try {
            const setId = req.params.id
            if (!setId) {
                return BaseService.sendFailedResponse({
                    error: 'Please enter a set ID',
                })
            }

            const set = await ItemSetModel.findById(setId)
            if (!set) {
                return BaseService.sendFailedResponse({ error: 'Set not found' })
            }

            return BaseService.sendSuccessResponse({ message: set })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async deleteOrderSet(req) {
        try {
            const setId = req.params.id
            if (!setId) {
                return BaseService.sendFailedResponse({
                    error: 'Please enter a set ID',
                })
            }

            const set = await ItemSetModel.findById(setId)
            if (!set) {
                return BaseService.sendFailedResponse({ error: 'Set not found' })
            }

            await ItemSetModel.findOneAndDelete({ _id: setId })
            return BaseService.sendSuccessResponse({
                message: 'Set deleted successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    // Shared validation: a Set needs a name and ≥1 priced piece (no set price).
    _validateSetPayload({ name, pieces }) {
        if (!name) return { ok: false, error: 'Please enter a name for the set' }
        if (!Array.isArray(pieces) || pieces.length === 0) {
            return { ok: false, error: 'A set must have at least one piece' }
        }
        const clean = []
        for (const p of pieces) {
            if (!p || !p.name) {
                return { ok: false, error: 'Each piece must have a name' }
            }
            if (p.price === undefined || p.price === null || Number(p.price) <= 0) {
                return {
                    ok: false,
                    error: `Each piece must have a price ("${p.name}")`,
                }
            }
            clean.push({
                name: p.name,
                price: Number(p.price),
                isHeavy: !!p.isHeavy,
            })
        }
        return { ok: true, pieces: clean }
    }

    async adminSendToHold(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id
            const { reason, assignTo, note = '' } = req.body

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!reason || !reason.trim())
                return BaseService.sendFailedResponse({
                    error: 'A reason is required',
                })
            if (!assignTo)
                return BaseService.sendFailedResponse({
                    error: 'An assignee is required',
                })

            const stationMap = {
                // [ROLE.ADMIN]: STATION_STATUS.ADMIN_STATION,
                [ROLE.INTAKE_AND_TAG]: STATION_STATUS.INTAKE_AND_TAG_STATION,
                [ROLE.SORT_AND_PRETREAT]:
                    STATION_STATUS.SORT_AND_PRETREAT_STATION,
                [ROLE.WASH_AND_DRY]: STATION_STATUS.WASH_AND_DRY_STATION,
                [ROLE.PRESS]: STATION_STATUS.PRESSING_AND_IRONING_STATION,
                [ROLE.QC]: STATION_STATUS.QC_STATION,
            }

            if (!stationMap[assignTo])
                return BaseService.sendFailedResponse({
                    error: `assignTo must be one of: ${Object.keys(stationMap).join(', ')}`,
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findById(orderId)
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            const holdNote = note ? `${reason}: ${note}` : reason
            const now = new Date()

            // Client 2026-10-08 §3.4: a station may only raise its own reasons.
            // Admin is exempt (they are the escalation path), but the check
            // still runs so a typo or a retired reason is refused with a
            // sentence rather than silently stored as an unknown type.
            const holdTypeKey = req.body?.holdTypeKey || reason
            const refusal = await checkStationMayRaise(
                holdTypeKey,
                user.userType,
            )
            if (refusal) {
                return BaseService.sendFailedResponse({ error: refusal })
            }

            await BookOrderModel.findByIdAndUpdate(
                orderId,
                {
                    $set: {
                        'stage.status': ORDER_STATUS.HOLD,
                        'stage.note': holdNote,
                        'stage.updatedAt': now,
                        stationStatus: stationMap[assignTo],
                        // The reason doubles as the hold type's key — the seeded
                        // types come straight from the reasons these screens
                        // already send, so an existing client keeps working and
                        // the hold immediately picks up that type's limit.
                        'orderHold.holdTypeKey': holdTypeKey,
                    },
                    // A fresh hold has not been escalated yet. Clearing the latch
                    // means a released-then-re-held order can escalate again on
                    // its own merits instead of being silently suppressed.
                    $unset: { 'orderHold.escalatedAt': '' },
                    $push: {
                        stageHistory: {
                            status: ORDER_STATUS.HOLD,
                            note: holdNote,
                            updatedAt: now,
                        },
                    },
                },
                { runValidators: false },
            )

            await ActivityModel.create({
                title: 'Order Placed on Hold by Admin',
                description: `Order ${order.oscNumber} placed on hold by admin ${user.fullName}. Reason: ${reason}.${note ? ` Note: ${note}.` : ''} Assigned to: ${assignTo}`,
                type: ACTIVITY_TYPE.ORDER_ON_HOLD,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            if (order.userId) {
                await createNotification({
                    userId: order.userId,
                    title: 'Order Placed on Hold',
                    body: `Your order ${order.oscNumber} has been placed on hold. Reason: ${reason}.${note ? ` Note: ${note}.` : ''}`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.ORDER_ON_HOLD,
                })
            }
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'system',
                action: `Order ${order.oscNumber} has been placed on hold for reason: ${reason}, assigned to ${assignTo} ${note ? ` Note: ${note}.` : ''}`,
            })

            // Affected station only, never the actor (client section 10).
            await notifyAffectedStation({
                role: assignTo,
                actorId: userId,
                title: 'Hold Order Assigned to Your Station',
                body: `Order ${order.oscNumber} has been placed on hold by admin and assigned to your station for resolution. Reason: ${reason}.${note ? ` Note: ${note}.` : ''}`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.ORDER_ON_HOLD,
            })

            return BaseService.sendSuccessResponse({
                message: 'Order placed on hold successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to place order on hold',
            })
        }
    }

    async getAuditLogs(req) {
        try {
            // 1. Permanently migrate any legacy String userIds to ObjectIds in the database
            // await AuditLogModel.updateMany(
            //     { userId: { $type: "string" } },
            //     [
            //         {
            //             $set: {
            //                 userId: { $toObjectId: "$userId" }
            //             }
            //         }
            //     ]
            // );

            // 2. Fetch the clean, paginated data with populate working perfectly
            const result = await paginate(
                AuditLogModel,
                {},
                {
                    page: req.query.page,
                    limit: req.query.limit,
                    sort: { createdAt: -1 },
                    populate: [{ path: 'userId' }, { path: 'orderId' }],
                },
            )

            // 3. Return the actual paginated result instead of the raw auditLogs array
            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error('Error fetching audit logs:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong fetching the audit logs',
            })
        }
    }
}

module.exports = AdminService
