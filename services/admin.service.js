const ActivityModel = require('../models/activity.model')
const BookOrderModel = require('../models/bookOrder.model')
const NotificationModel = require('../models/notification.model')
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

            let todayRevenue = 0
            let yesterdayRevenue = 0
            let percentageChange = 0

            const revenueTodayVerifiedAgg = await BookOrderModel.aggregate([
                {
                    $match: {
                        paymentDate: { $gte: todayStart, $lte: todayEnd },
                        paymentStatus: PAYMENT_ORDER_STATUS.PAID,
                        isVerified: true,
                    },
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' },
                    },
                },
            ])

            const revenueTodayVerified = revenueTodayVerifiedAgg[0]?.total || 0

            const revenueComparisonAgg = await BookOrderModel.aggregate([
                {
                    $match: {
                        paymentDate: { $gte: yesterdayStart, $lte: todayEnd },
                        paymentStatus: PAYMENT_ORDER_STATUS.PAID,
                        isVerified: true,
                    },
                },
                {
                    $project: {
                        amount: 1,
                        period: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: ['$paymentDate', todayStart] },
                                        { $lte: ['$paymentDate', todayEnd] },
                                    ],
                                },
                                'today',
                                'yesterday',
                            ],
                        },
                    },
                },
                {
                    $group: {
                        _id: '$period',
                        total: { $sum: '$amount' },
                    },
                },
            ])

            revenueComparisonAgg.forEach((item) => {
                if (item._id === 'today') todayRevenue = item.total
                if (item._id === 'yesterday') yesterdayRevenue = item.total
            })

            if (yesterdayRevenue === 0) {
                percentageChange = todayRevenue > 0 ? 100 : 0
            } else {
                percentageChange =
                    ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
            }

            //   const revenueTodayVerified = todayRevenue;

            const revenueTodayChange = Number(percentageChange.toFixed(2))

            const activities = await ActivityModel.find()
                .sort({ createdAt: -1 })
                .limit(10)

            const totalActiveOrders = await BookOrderModel.countDocuments({
                'stage.status': { $ne: ORDER_STATUS.DELIVERED },
            })

            const avgProcessingTimeAgg = await BookOrderModel.aggregate([
                {
                    $match: {
                        'stage.status': ORDER_STATUS.DELIVERED,
                    },
                },
                {
                    $project: {
                        processingTime: {
                            $subtract: ['$updatedAt', '$createdAt'],
                        },
                    },
                },
                {
                    $group: {
                        _id: null,
                        avgTime: { $avg: '$processingTime' },
                    },
                },
            ])

            const avgProcessingTime = avgProcessingTimeAgg[0]?.avgTime || 0

            const overdueOrders = await BookOrderModel.countDocuments({
                deliveryDate: { $lt: now },
                'stage.status': { $ne: ORDER_STATUS.DELIVERED },
            })

            const dueToday = await BookOrderModel.countDocuments({
                deliveryDate: { $gte: todayStart, $lte: todayEnd },
                'stage.status': { $ne: ORDER_STATUS.DELIVERED },
            })

            const bottleneckAgg = await BookOrderModel.aggregate([
                {
                    $match: {
                        'stage.status': { $ne: ORDER_STATUS.DELIVERED },
                    },
                },
                {
                    $group: {
                        _id: '$stage.status',
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
                { $limit: 1 },
            ])

            const bottleNeckStation = bottleneckAgg[0] || null

            const readyAndWaiting = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.READY,
                'dispatchDetails.delivery.status': {
                    $ne: DELIVERY_STATUS.DELIVERED,
                },
            })

            const pendingPayment = await BookOrderModel.countDocuments({
                paymentStatus: PAYMENT_ORDER_STATUS.PENDING,
            })

            const activeHolds = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.HOLD,
            })

            const overdueHolds = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.HOLD,
                deliveryDate: { $lt: now },
            })

            const deliveryIssues = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.OUT_FOR_DELIVERY,
                // deliveryDate: { $lt: now }
                'dispatchDetails.delivery.status': DELIVERY_STATUS.FAILED,
            })

            const avgCostPerItem7DaysAgg = await BookOrderModel.aggregate([
                {
                    $match: {
                        paymentDate: { $gte: sevenDaysAgo, $lte: todayEnd },
                        paymentStatus: PAYMENT_ORDER_STATUS.PAID,
                    },
                },
                {
                    $unwind: '$items',
                },
                {
                    $group: {
                        _id: {
                            day: { $dayOfMonth: '$paymentDate' },
                            month: { $month: '$paymentDate' },
                            year: { $year: '$paymentDate' },
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
                {
                    $group: {
                        _id: null,
                        avgCostPerItem: { $avg: '$dailyCostPerItem' },
                    },
                },
            ])

            const avgCostPerItem7Days =
                avgCostPerItem7DaysAgg[0]?.avgCostPerItem || 0

            const totalSubscribers = await SubscriptionModel.countDocuments({
                status: 'active',
            })

            const monthlyRevenueAgg = await SubscriptionModel.aggregate([
                {
                    $match: {
                        status: 'active', // or include expired/cancelled if needed
                        lastPaymentAt: { $ne: null },
                    },
                },
                {
                    $lookup: {
                        from: 'plans', // collection name (important: lowercase plural)
                        localField: 'planId',
                        foreignField: '_id',
                        as: 'plan',
                    },
                },
                {
                    $unwind: '$plan',
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$lastPaymentAt' },
                            month: { $month: '$lastPaymentAt' },
                        },
                        totalRevenue: { $sum: '$plan.price' },
                        totalSubscriptions: { $sum: 1 },
                    },
                },
                {
                    $sort: {
                        '_id.year': -1,
                        '_id.month': -1,
                    },
                },
            ])
            //   monthlyRevenueAgg = [           ///sample docs
            //     {
            //       "_id": { "year": 2026, "month": 4 },
            //       "totalRevenue": 250000,
            //       "totalSubscriptions": 120
            //     }
            //   ]

            const planDistributionAgg = await SubscriptionModel.aggregate([
                {
                    $match: {
                        status: 'active',
                    },
                },
                {
                    $group: {
                        _id: '$planId',
                        count: { $sum: 1 },
                    },
                },
                {
                    $lookup: {
                        from: 'plans',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'plan',
                    },
                },
                {
                    $unwind: '$plan',
                },
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
                {
                    $unwind: '$plans',
                },
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
                {
                    $sort: { percentage: -1 },
                },
            ])

            //   const planDistributionAgg = [         //sample docs
            //     {
            //       "planId": "abc123",
            //       "title": "Premium",
            //       "count": 80,
            //       "percentage": 66.67
            //     },
            //     {
            //       "planId": "xyz456",
            //       "title": "Standard",
            //       "count": 40,
            //       "percentage": 33.33
            //     }
            //   ]

            const ordersGraphAgg = await BookOrderModel.aggregate([
                {
                    $facet: {
                        // ✅ NEW ORDERS
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
                                            binSize: 2, // 👈 change to 1 for hourly
                                        },
                                    },
                                    count: { $sum: 1 },
                                },
                            },
                        ],

                        // ✅ COMPLETED ORDERS
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

            // Generate time buckets
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

            const response = {}
            response['totalActiveOrders'] = totalActiveOrders
            response['revenueTodayVerified'] = revenueTodayVerified
            response['avgProcessingTime'] = avgProcessingTime
            response['overdueOrders'] = overdueOrders
            response['dueToday'] = dueToday
            response['bottleNeckStation'] = bottleNeckStation
            response['readyAndWaiting'] = readyAndWaiting
            response['pendingPayment'] = pendingPayment
            response['activeHolds'] = activeHolds
            response['overdueHolds'] = overdueHolds
            response['deliveryIssues'] = deliveryIssues
            response['activities'] = activities
            response['avgCostPerItem7Days'] = avgCostPerItem7Days
            response['revenueTodayVerified'] = revenueTodayVerified
            response['revenueTodayChange'] = revenueTodayChange
            response['totalSubscribers'] = totalSubscribers
            response['monthlyRevenueAgg'] = monthlyRevenueAgg
            response['planDistributionAgg'] = planDistributionAgg
            response['graphResult'] = graphResult

            return BaseService.sendSuccessResponse({ message: response })
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
                        'stage.status': { $ne: ORDER_STATUS.DELIVERED },
                    }
                    break

                case 'overdue':
                    filter = {
                        deliveryDate: { $lt: now },
                        'stage.status': { $ne: ORDER_STATUS.DELIVERED },
                    }
                    break

                case 'dueToday':
                    filter = {
                        deliveryDate: { $gte: todayStart, $lte: todayEnd },
                        'stage.status': { $ne: ORDER_STATUS.DELIVERED },
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
    //   async orderManagement(req, res) {
    //     try {
    //       const now = new Date();

    //       const todayStart = new Date();
    //       todayStart.setHours(0, 0, 0, 0);

    //       const todayEnd = new Date();
    //       todayEnd.setHours(23, 59, 59, 999);

    //       const [
    //         totalActiveOrders,
    //         overdueOrders,
    //         dueToday,
    //         activeHolds,
    //         assignedForDelivery,
    //         pendingPayment,
    //       ] = await Promise.all([
    //         // Active Orders (not delivered)
    //         BookOrderModel.find({
    //           "stage.status": { $ne: ORDER_STATUS.DELIVERED },
    //         }),

    //         // Overdue Orders
    //         BookOrderModel.find({
    //           deliveryDate: { $lt: now },
    //           "stage.status": { $ne: ORDER_STATUS.DELIVERED },
    //         }),

    //         // Due Today
    //         // BookOrderModel.find({
    //         //   deliveryDate: { $gte: todayStart, $lte: todayEnd },
    //         //   "stage.status": { $ne: ORDER_STATUS.DELIVERED }
    //         // }),
    //         BookOrderModel.find({
    //           deliveryDate: {
    //             $gte: todayStart,
    //             $lte: todayEnd,
    //           },
    //           "stage.status": { $ne: ORDER_STATUS.DELIVERED },
    //         }),

    //         // Active Holds
    //         BookOrderModel.find({
    //           "stage.status": ORDER_STATUS.HOLD,
    //         }),

    //         // Assigned for Delivery
    //         BookOrderModel.find({
    //           "stage.status": {
    //             $in: [
    //               ORDER_STATUS.OUT_FOR_DELIVERY,
    //               //   ORDER_STATUS.READY
    //             ],
    //           },
    //         }),

    //         // Pending Payment
    //         BookOrderModel.find({
    //           paymentStatus: PAYMENT_ORDER_STATUS.PENDING,
    //         }),
    //       ]);

    //       const response = {
    //         totalActiveOrders,
    //         overdueOrders,
    //         dueToday,
    //         activeHolds,
    //         assignedForDelivery,
    //         pendingPayment,
    //       };

    //       return BaseService.sendSuccessResponse({ message: response });
    //     } catch (error) {
    //       console.log(error);
    //       return BaseService.sendFailedResponse({
    //         error: "Something went wrong. Please try again later.",
    //       });
    //     }
    //   }

    async getOrderDetails(req, res) {
        try {
            const { id } = req.params
            if (!id) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }

            const order = await BookOrderModel.findById(id)

            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            return BaseService.sendSuccessResponse({ message: order })
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
                {},
                {
                    page: req.query.page,
                    limit: req.query.limit,
                    sort: { createdAt: -1 },
                    populate: [{ path: 'userId' }],
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

            if (!payment.status == PAYMENT_ORDER_STATUS.SUCCESS) {
                return BaseService.sendSuccessResponse({
                    error: 'Payment already resolved as successful',
                })
            }

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
            }

            // If it's an order payment, update the order's payment status
            if (payment.type === 'order' && payment.order) {
                await BookOrderModel.findByIdAndUpdate(payment.order, {
                    paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                })
            }

            await createNotification({
                userId: payment.userId,
                title: 'Payment Approved',
                body: `Your payment of ${payment.amount} has been approved.`,
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

            if (!payment.status == PAYMENT_ORDER_STATUS.FAILED) {
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
            const { type } = req.query

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

            const result = await paginate(BookOrderModel, filter, {
                page: req.query.page,
                limit: req.query.limit,
                sort: { createdAt: -1 },
                populate: [{ path: 'userId' }],
            })

            //   const orders = await BookOrderModel.find(filter)
            //     .sort({ createdAt: -1 });

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
            const pendingPickupOrders = await BookOrderModel.countDocuments({
                isPickUp: true,
                'dispatchDetails.pickup.status': PICKUP_STATUS.PENDING,
            })

            const assignedOrders = await BookOrderModel.countDocuments({
                isPickUp: true,
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
            })

            const deliveredOrders = await BookOrderModel.countDocuments({
                isPickUp: true,
                'stage.status': ORDER_STATUS.DELIVERED,
            })

            const response = {}
            response['pendingPickupOrders'] = pendingPickupOrders
            response['assignedOrders'] = assignedOrders
            response['deliveredOrders'] = deliveredOrders

            return BaseService.sendSuccessResponse({ message: response })
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

            if (!type) {
                return BaseService.sendFailedResponse({
                    error: 'Type query parameter is required',
                })
            }

            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)

            const todayEnd = new Date()
            todayEnd.setHours(23, 59, 59, 999)

            let filter = {}

            switch (type) {
                case 'activeHolds':
                    filter = {
                        'stage.status': ORDER_STATUS.HOLD,
                    }
                    break

                case 'overdueHolds':
                    filter = {
                        'stage.status': ORDER_STATUS.HOLD,
                        deliveryDate: { $lt: now },
                    }
                    break

                case 'expiringToday':
                    filter = {
                        deliveryDate: { $gte: todayStart, $lte: todayEnd },
                        'stage.status': { $ne: ORDER_STATUS.DELIVERED },
                    }
                    break

                default:
                    return BaseService.sendFailedResponse({
                        error: 'Invalid type',
                    })
            }

            const result = await paginate(BookOrderModel, filter, {
                page,
                limit,
                sort: { createdAt: -1 },
                populate: [
                    {
                        path: 'userId',
                    },
                ],
            })

            return BaseService.sendSuccessResponse({
                message: result,
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
            const note = req.body.note
            const orderId = req.params.id

            if (!orderId) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }

            if (!note) {
                return BaseService.sendFailedResponse({
                    error: 'Note is required to reassign order state',
                })
            }

            const order = await BookOrderModel.findById(orderId)

            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            if (!type || !Object.values(STATION_STATUS).includes(type)) {
                return BaseService.sendFailedResponse({
                    error: 'Invalid type query parameter',
                })
            }

            switch (type) {
                case 'intake-and-tag-station':
                    order.stationStatus = STATION_STATUS.INTAKE_AND_TAG_STATION
                    order.stage.status = ORDER_STATUS.QUEUE
                    order.stageHistory.push({
                        status: ORDER_STATUS.QUEUE,
                        note,
                        updatedAt: new Date(),
                    })
                    break
                case 'sort-and-pretreat-station':
                    order.stationStatus =
                        STATION_STATUS.SORT_AND_PRETREAT_STATION
                    order.stage.status = ORDER_STATUS.SORT_AND_PRETREAT
                    order.stageHistory.push({
                        status: ORDER_STATUS.SORT_AND_PRETREAT,
                        note,
                        updatedAt: new Date(),
                    })
                    break
                case 'wash-and-dry-station':
                    order.stationStatus = STATION_STATUS.WASH_AND_DRY_STATION
                    order.stage.status = ORDER_STATUS.WASHING
                    order.stageHistory.push({
                        status: ORDER_STATUS.WASHING,
                        note,
                        updatedAt: new Date(),
                    })
                    break
                case 'pressing-and-ironing-station':
                    order.stationStatus =
                        STATION_STATUS.PRESSING_AND_IRONING_STATION
                    order.stage.status = ORDER_STATUS.IRONING
                    order.stageHistory.push({
                        status: ORDER_STATUS.IRONING,
                        note,
                        updatedAt: new Date(),
                    })
                    break
                case 'qc-station':
                    order.stationStatus = STATION_STATUS.QC_STATION
                    order.stage.status = ORDER_STATUS.QC
                    order.stageHistory.push({
                        status: ORDER_STATUS.QC,
                        note,
                        updatedAt: new Date(),
                    })
                    break
            }

            await order.save()

            await createNotification({
                userId: userId,
                title: 'Order Reassigned',
                body: `You have reassigned order ${order.oscNumber} to ${type.replace(/-/g, ' ')}. Note: ${note}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATE,
            })

            return BaseService.sendSuccessResponse({
                message: `Order ${order.oscNumber} has been assigned and sent to be resolved`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to assign rider to order',
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

}

module.exports = AdminService
