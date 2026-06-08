const ActivityModel = require('../models/activity.model')
const AdminOrderDetailsModel = require('../models/adminOrderDetails.model')
const AdminSettingModel = require('../models/adminSetting.model')
const AuditLogModel = require('../models/audit.log.model')
const BookOrderModel = require('../models/bookOrder.model')
const NotificationModel = require('../models/notification.model')
const OrderItemModel = require('../models/orderItem.model')
const PaymentModel = require('../models/payment.model')
const SubscriptionModel = require('../models/subscription.model')
const UpdateFundModel = require('../models/updateFund.model')
const UserModel = require('../models/user.model')
const WalletModel = require('../models/wallet.model')
const WalletTransactionModel = require('../models/walletTransaction.model')
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
} = require('../util/constants')
const createNotification = require('../util/createNotification')
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

            const totalActiveOrders = await BookOrderModel.countDocuments({
                'stage.status': {
                    $nin: [ORDER_STATUS.READY, ORDER_STATUS.DELIVERED],
                },
            })

            const overdueOrders = await BookOrderModel.countDocuments({
                deliveryDate: { $lt: now },
                'stage.status': { $ne: ORDER_STATUS.DELIVERED },
                // READY orders are overdue if not yet delivered
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
                        verifiedAt: { $gte: todayStart, $lte: todayEnd },
                    },
                },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ])
            const revenueTodayVerified = revenueTodayAgg[0]?.total || 0

            const revenueYesterdayAgg = await PaymentModel.aggregate([
                {
                    $match: {
                        status: 'success',
                        verifiedAt: {
                            $gte: yesterdayStart,
                            $lte: yesterdayEnd,
                        },
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

            const revenue7DayAgg = await PaymentModel.aggregate([
                {
                    $match: {
                        status: 'success',
                        verifiedAt: { $gte: sevenDaysAgo, $lte: todayEnd },
                    },
                },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$verifiedAt',
                            },
                        },
                        dailyTotal: { $sum: '$amount' },
                    },
                },
            ])
            const avgDailyRevenue7Days =
                revenue7DayAgg.length > 0
                    ? Math.round(
                          revenue7DayAgg.reduce((s, d) => s + d.dailyTotal, 0) /
                              7,
                      )
                    : 0

            const totalRevenueAgg = await PaymentModel.aggregate([
                { $match: { status: 'success' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ])
            const totalRevenue = totalRevenueAgg[0]?.total || 0

            const avgProcessingTimeAgg = await BookOrderModel.aggregate([
                {
                    $match: {
                        'stage.status': ORDER_STATUS.DELIVERED,
                        updatedAt: { $gte: todayStart, $lte: todayEnd },
                    },
                },
                {
                    $project: {
                        processingTime: {
                            $subtract: [
                                // ← get the updatedAt from the DELIVERED stageHistory entry
                                {
                                    $let: {
                                        vars: {
                                            deliveredEntry: {
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
                                                    0, // ← take the first match
                                                ],
                                            },
                                        },
                                        in: '$$deliveredEntry.updatedAt', // ← now access the field
                                    },
                                },
                                '$createdAt',
                            ],
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        avgTime: { $avg: '$processingTime' },
                        count: { $sum: 1 },
                    },
                },
            ])
            const avgProcessingTime = avgProcessingTimeAgg[0]?.avgTime || 0
            const ordersProcessedToday = avgProcessingTimeAgg[0]?.count || 0

            const avgCostPerItem7DaysAgg = await BookOrderModel.aggregate([
                {
                    $match: {
                        paymentDate: { $gte: sevenDaysAgo, $lte: todayEnd },
                        paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                    },
                },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$paymentDate',
                            },
                        },
                        dailyRevenue: { $sum: '$amount' },
                        dailyItems: { $sum: '$items.quantity' },
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

            const avgCostPerItem7Days =
                avgCostPerItem7DaysAgg.length > 0
                    ? Math.round(
                          avgCostPerItem7DaysAgg.reduce(
                              (s, d) => s + d.dailyCostPerItem,
                              0,
                          ) / avgCostPerItem7DaysAgg.length,
                      )
                    : 0

            const recent3 = avgCostPerItem7DaysAgg.slice(-3)
            const prior4 = avgCostPerItem7DaysAgg.slice(0, 4)
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

            const pendingVerification = await PaymentModel.countDocuments({
                status: PAYMENT_ORDER_STATUS.PENDING,
                type: { $in: ['order', 'wallet-top-up'] },
                paymentMethod: 'bank-transfer',
            })

            // ALL: total pending (for reference section)
            const pendingPayment = await PaymentModel.countDocuments({
                status: PAYMENT_ORDER_STATUS.PENDING,
            })

            const activeHolds = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.HOLD,
            })

            const overdueHolds = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.HOLD,
                deliveryDate: { $lt: now },
            })

            const expiringTodayHolds = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.HOLD,
                deliveryDate: { $gte: todayStart, $lte: todayEnd },
            })

            // const bottleneckAgg = await BookOrderModel.aggregate([
            //     {
            //         $match: {
            //             'stage.status': {
            //                 $nin: [ORDER_STATUS.READY, ORDER_STATUS.DELIVERED],
            //             },
            //         },
            //     },
            //     { $group: { _id: '$stage.status', count: { $sum: 1 } } },
            //     { $sort: { count: -1 } },
            //     { $limit: 1 },
            // ])
            // const bottleNeckStation = bottleneckAgg[0] || null

            const [bottleneckOrderCount, bottleneckItemCount] =
                await Promise.all([
                    BookOrderModel.countDocuments({
                        'stage.status': ORDER_STATUS.IRONING,
                    }),
                    BookOrderModel.aggregate([
                        { $match: { 'stage.status': ORDER_STATUS.IRONING } },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: { $size: '$items' } },
                            },
                        },
                    ]).then((r) => r[0]?.total || 0),
                ])

            const bottleNeckStation = {
                station: ORDER_STATUS.IRONING,
                orderCount: bottleneckOrderCount,
                itemCount: bottleneckItemCount,
            }

            const readyAndWaiting = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.READY,
                'dispatchDetails.delivery.status': {
                    $ne: DELIVERY_STATUS.DELIVERED,
                },
            })

            const deliveryIssues = await BookOrderModel.countDocuments({
                'dispatchDetails.delivery.status': DELIVERY_STATUS.FAILED,
            })

            const priorityAlerts = {
                overdueOrders,
                dueToday,
                overdueHolds,
                expiringTodayHolds,
                pendingVerification,
                deliveryIssues,
                activeHolds,
            }

            const totalSubscribers = await SubscriptionModel.countDocuments({
                status: 'active',
            })

            const monthlyRevenueAgg = await PaymentModel.aggregate([
                {
                    $match: {
                        status: 'success',
                        verifiedAt: { $exists: true, $ne: null },
                    },
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$verifiedAt' },
                            month: { $month: '$verifiedAt' },
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

            const planDistributionAgg = await SubscriptionModel.aggregate([
                { $match: { status: 'active' } },
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
                    avgProcessingTime,
                    ordersProcessedToday,
                    avgCostPerItem7Days,
                    costTrend,
                    avgCostPerItem7DayBreakdown: avgCostPerItem7DaysAgg,
                    pendingVerification,
                    pendingPayment,
                    activeHolds,
                    overdueHolds,
                    expiringTodayHolds,
                    bottleNeckStation,
                    readyAndWaiting,
                    deliveryIssues,
                    priorityAlerts,
                    subscriptionAnalytics,
                    totalSubscribers,
                    planDistributionAgg,
                    monthlyRevenueAgg,
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
                        'stage.status': {
                            $in: [ORDER_STATUS.OUT_FOR_DELIVERY],
                        },
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
    // async getOrderDetails(req, res) {
    //     try {
    //         const { id } = req.params
    //         if (!id) {
    //             return BaseService.sendFailedResponse({
    //                 error: 'Order ID is required',
    //             })
    //         }

    //         const order = await BookOrderModel.findById(id)

    //         if (!order) {
    //             return BaseService.sendFailedResponse({
    //                 error: 'Order not found',
    //             })
    //         }

    //         return BaseService.sendSuccessResponse({ message: order })
    //     } catch (error) {
    //         console.log(error)
    //         return BaseService.sendFailedResponse({
    //             error: 'Something went wrong. Please try again later.',
    //         })
    //     }
    // }

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
                const slaThresholdMinutes =
                    order.deliverySpeed === DELIVERY_SPEED.SAME_DAY
                        ? 120
                        : order.deliverySpeed === DELIVERY_SPEED.EXPRESS
                          ? 240
                          : 360
                holdMeta = {
                    heldSince,
                    heldMinutes,
                    slaThresholdMinutes,
                    slaBreached:
                        heldMinutes !== null
                            ? heldMinutes > slaThresholdMinutes
                            : false,
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
    async getAdminOrderDetails(req) {
        try {
            const [adminOrderDetails, adminSetting] = await Promise.all([
                AdminOrderDetailsModel.findOne().lean(),
                AdminSettingModel.findOne().lean(),
            ])

            const activeServiceTypes = adminSetting?.serviceTypes || []

            return BaseService.sendSuccessResponse({
                message: {
                    ...adminOrderDetails,
                    serviceTypes: activeServiceTypes,
                    serviceType: activeServiceTypes.map((s) => s.name),
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
                                'dispatchDetails.delivery.status': {
                                    $in: [
                                        DELIVERY_STATUS.IN_PROGRESS,
                                        DELIVERY_STATUS.DISPATCHED,
                                    ],
                                },
                            },
                        ],
                    }
                    break

                case 'pendingPickup':
                    filter = {
                        'dispatchDetails.pickup.status': PICKUP_STATUS.PENDING,
                    }
                    break

                case 'assigned':
                    filter = {
                        $or: [
                            {
                                'dispatchDetails.pickup.rider': { $ne: null },
                                'dispatchDetails.pickup.status': {
                                    $ne: PICKUP_STATUS.SCHEDULED,
                                },
                            },
                            {
                                'dispatchDetails.delivery.rider': { $ne: null },
                                'dispatchDetails.delivery.status': {
                                    $ne: DELIVERY_STATUS.DELIVERED,
                                },
                            },
                        ],
                    }
                    break

                case 'delivered':
                    filter = {
                        'stage.status': ORDER_STATUS.DELIVERED,
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
                BookOrderModel.countDocuments({
                    isPickUp: true,
                    'dispatchDetails.pickup.status': PICKUP_STATUS.PENDING,
                    'dispatchDetails.pickup.updatedAt': todayRange,
                }),

                // scheduled today
                BookOrderModel.countDocuments({
                    isPickUp: true,
                    'dispatchDetails.pickup.status': PICKUP_STATUS.SCHEDULED,
                    'dispatchDetails.pickup.updatedAt': todayRange,
                }),

                // pickup in progress today
                BookOrderModel.countDocuments({
                    isPickUp: true,
                    'dispatchDetails.pickup.status':
                        PICKUP_STATUS.PICKUP_IN_PROGRESS,
                    'dispatchDetails.pickup.updatedAt': todayRange,
                }),

                // picked up today
                BookOrderModel.countDocuments({
                    isPickUp: true,
                    'dispatchDetails.pickup.status': PICKUP_STATUS.PICKED_UP,
                    'dispatchDetails.pickup.updatedAt': todayRange,
                }),

                // out for delivery today
                BookOrderModel.countDocuments({
                    isDelivery: true,
                    'dispatchDetails.delivery.status':
                        DELIVERY_STATUS.OUT_FOR_DELIVERY,
                    'dispatchDetails.delivery.updatedAt': todayRange,
                }),

                // delivered today
                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.DELIVERED,
                    'stage.updatedAt': todayRange,
                }),

                // failed delivery today
                BookOrderModel.countDocuments({
                    'dispatchDetails.delivery.status': DELIVERY_STATUS.FAILED,
                    'dispatchDetails.delivery.updatedAt': todayRange,
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
                case 'activeHolds':
                    filter = { 'stage.status': ORDER_STATUS.HOLD }
                    break

                case 'overdueHolds':
                    filter = {
                        'stage.status': ORDER_STATUS.HOLD,
                        $or: [
                            {
                                deliverySpeed: DELIVERY_SPEED.SAME_DAY,
                                'stage.updatedAt': {
                                    $lt: new Date(now - 2 * 60 * 60 * 1000),
                                },
                            },
                            {
                                deliverySpeed: DELIVERY_SPEED.EXPRESS,
                                'stage.updatedAt': {
                                    $lt: new Date(now - 4 * 60 * 60 * 1000),
                                },
                            },
                            {
                                deliverySpeed: DELIVERY_SPEED.STANDARD,
                                'stage.updatedAt': {
                                    $lt: new Date(now - 6 * 60 * 60 * 1000),
                                },
                            },
                            {
                                deliveryDate: { $lt: now },
                            },
                        ],
                    }
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

            const enriched = result.data.map((order) => {
                const heldSince = order.stage?.updatedAt
                const heldMinutes = heldSince
                    ? Math.floor((now - new Date(heldSince)) / 60000)
                    : null

                const slaThresholdMinutes =
                    order.deliverySpeed === DELIVERY_SPEED.SAME_DAY
                        ? 120
                        : order.deliverySpeed === DELIVERY_SPEED.EXPRESS
                          ? 240
                          : 360 // standard

                const slaBreached =
                    heldMinutes !== null
                        ? heldMinutes > slaThresholdMinutes
                        : false

                return {
                    ...order,
                    holdMeta: {
                        heldSince,
                        heldMinutes,
                        slaThresholdMinutes,
                        slaBreached,
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

            // notify admin who performed the action
            await createNotification({
                userId,
                title: 'Hold Reassigned',
                body: `Order ${order.oscNumber} hold has been reassigned to ${type.replace(/-/g, ' ')}. Note: ${note}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })

            // notify all operators at the target station
            const stationOperators = await UserModel.find({
                userType: target.role,
                status: 'active',
            }).select('_id')

            await Promise.all(
                stationOperators.map((operator) =>
                    createNotification({
                        userId: operator._id,
                        title: 'Hold Order Assigned to Your Station',
                        body: `Order ${order.oscNumber} has been reassigned to your station for resolution. Note: ${note}`,
                        subBody: `Order ID: ${order.oscNumber}`,
                        type: NOTIFICATION_TYPE.ORDER_UPDATED,
                    }),
                ),
            )

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

            // notify admin who performed the action
            await createNotification({
                userId,
                title: 'Hold Resolved',
                body: `Order ${order.oscNumber} hold has been resolved and returned to ${type.replace(/-/g, ' ')}. Note: ${note}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })

            // notify all operators at the target station
            const stationOperators = await UserModel.find({
                userType: target.role,
                status: 'active',
            }).select('_id')

            await Promise.all(
                stationOperators.map((operator) =>
                    createNotification({
                        userId: operator._id,
                        title: 'Order Returned to Your Station',
                        body: `Order ${order.oscNumber} hold has been resolved and returned to your station. Note: ${note}`,
                        subBody: `Order ID: ${order.oscNumber}`,
                        type: NOTIFICATION_TYPE.ORDER_UPDATED,
                    }),
                ),
            )

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

            await UpdateFundModel.create({
                userId,
                amount,
                type: 'credit',
                ...(message && { message }),
            })

            const wallet = await WalletModel.findOne({ userId })

            if (!wallet) {
                return BaseService.sendFailedResponse({
                    error: 'Wallet not found for user',
                })
            }
            wallet.balance += amount
            await wallet.save()

            await WalletTransactionModel.create({
                userId,
                type: 'credit',
                amount,
                status: 'success',
                description: message || 'Admin added fund to wallet',
            })

            await createNotification({
                userId: userId,
                title: 'Wallet addition',
                body: `${req.body.amount} has been added to your wallet`,
                // subBody: `Order ID: ${oscNumber}.`,
                type: NOTIFICATION_TYPE.WALLET_UPDATE,
            })

            return BaseService.sendSuccessResponse({
                message: 'Fund added to wallet successfully',
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

            const wallet = await WalletModel.findOne({ userId })
            if (!wallet)
                return BaseService.sendFailedResponse({
                    error: 'Wallet not found for user',
                })

            if (wallet.balance < amount) {
                return BaseService.sendFailedResponse({
                    error: 'Insufficient balance in wallet',
                })
            }

            wallet.balance -= amount
            await wallet.save()

            await UpdateFundModel.create({
                userId,
                amount,
                type: 'debit',
                ...(message && { message }),
            })

            await WalletTransactionModel.create({
                userId,
                type: 'debit',
                amount,
                status: 'success',
                description: message || 'Admin deducted fund from wallet',
            })

            await createNotification({
                userId,
                title: 'Wallet deduction',
                body: `₦${amount} has been deducted from your wallet`,
                type: NOTIFICATION_TYPE.WALLET_UPDATE,
            })

            return BaseService.sendSuccessResponse({
                message: 'Fund deducted from wallet successfully',
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
    async addItem(req) {
        try {
            const name = req.body.name
            const price = req.body.price
            if (!name) {
                return BaseService.sendFailedResponse({
                    error: 'Please enter a name for the item',
                })
            }
            if (!price) {
                return BaseService.sendFailedResponse({
                    error: 'Please enter a price for the item',
                })
            }

            await OrderItemModel.create({ name, price })

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
            const orderItems = await OrderItemModel.find({})

            return BaseService.sendSuccessResponse({ message: orderItems })
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

            await BookOrderModel.findByIdAndUpdate(
                orderId,
                {
                    $set: {
                        'stage.status': ORDER_STATUS.HOLD,
                        'stage.note': holdNote,
                        'stage.updatedAt': now,
                        stationStatus: stationMap[assignTo],
                    },
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

            const stationOperators = await UserModel.find({
                userType: assignTo,
                status: 'active',
            }).select('_id')

            await Promise.all(
                stationOperators.map((operator) =>
                    createNotification({
                        userId: operator._id,
                        title: 'Hold Order Assigned to Your Station',
                        body: `Order ${order.oscNumber} has been placed on hold by admin and assigned to your station for resolution. Reason: ${reason}.${note ? ` Note: ${note}.` : ''}`,
                        subBody: `Order ID: ${order.oscNumber}`,
                        type: NOTIFICATION_TYPE.ORDER_ON_HOLD,
                    }),
                ),
            )

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
