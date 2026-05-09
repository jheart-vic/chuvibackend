const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const NotificationModel = require('../models/notification.model')
const {
    PICKUP_STATUS,
    DELIVERY_STATUS,
    ORDER_STATUS,
    NOTIFICATION_TYPE,
    STATION_STATUS,
} = require('../util/constants')
const paginate = require('../util/paginate')

const BaseService = require('./base.service')
const createNotification = require('../util/createNotification')
const { buildStageUpdate } = require('../util/helper')

class RiderService extends BaseService {
    async getRiderAssignedDeliveries(req) {
        try {
            const riderId = req.user.id
            const { page = 1, limit = 10 } = req.query

            const query = {
                isDelivery: true,
                'dispatchDetails.delivery.rider': riderId,
                'dispatchDetails.delivery.status': DELIVERY_STATUS.READY,
            }

            const result = await paginate(BookOrderModel, query, {
                page,
                limit,
            })
            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error('Error in getRiderAssignedDeliveries:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getActiveDeliveries(req) {
        try {
            const riderId = req.user.id
            const { page = 1, limit = 10 } = req.query

            const query = {
                isDelivery: true,
                'dispatchDetails.delivery.rider': riderId,
                'dispatchDetails.delivery.status':
                    DELIVERY_STATUS.OUT_FOR_DELIVERY,
            }

            const result = await paginate(BookOrderModel, query, {
                page,
                limit,
            })
            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error('Error in getActiveDeliveries:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async markOrderAsDelivered(req) {
        try {
            const orderId = req.params.id
            const { phoneNumber } = req.body
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!phoneNumber)
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number is required',
                })

            const order = await BookOrderModel.findById(orderId).populate(
                'userId',
                'phoneNumber',
            )
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            // ✅ fix: check delivery.rider not pickup.rider
            if (order.dispatchDetails.delivery.rider?.toString() !== userId) {
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this delivery',
                })
            }

            if (
                order.dispatchDetails.delivery.status !==
                DELIVERY_STATUS.OUT_FOR_DELIVERY
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Delivery must be out for delivery before it can be marked as delivered',
                })
            }

            const customerPhone = order.userId?.phoneNumber || order.phoneNumber
            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (customerPhone !== phoneNumber) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.delivery.status = DELIVERY_STATUS.DELIVERED
            order.dispatchDetails.delivery.updatedAt = new Date()

            const stageUpdate = buildStageUpdate(
                ORDER_STATUS.READY,
                STATION_STATUS.RIDER_STATION,
                'Delivery complete',
            )
            await order.save()

            if (order.userId?._id) {
                await createNotification({
                    userId: order.userId._id,
                    title: 'Your order has been delivered',
                    body: `Order ${order.oscNumber} has been delivered successfully.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.ORDER_DELIVERED,
                })
            }

            return BaseService.sendSuccessResponse({
                message: 'Order marked as delivered successfully',
            })
        } catch (error) {
            console.error('Error in markOrderAsDelivered:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async markOrderDeliveryAsFailed(req) {
        try {
            const orderId = req.params.id
            const { phoneNumber, note = '' } = req.body
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!phoneNumber)
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number is required',
                })

            const order = await BookOrderModel.findById(orderId).populate(
                'userId',
                'phoneNumber',
            )

            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            if (order.dispatchDetails.delivery.rider?.toString() !== userId) {
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this delivery',
                })
            }

            if (
                order.dispatchDetails.delivery.status !==
                DELIVERY_STATUS.OUT_FOR_DELIVERY
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Delivery must be out for delivery before it can be marked as failed',
                })
            }

            const customerPhone = order.userId?.phoneNumber || order.phoneNumber
            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (customerPhone !== phoneNumber) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.delivery.status = DELIVERY_STATUS.FAILED
            order.dispatchDetails.delivery.updatedAt = new Date()
            order.dispatchDetails.delivery.note = note
            await order.save()

            await createNotification({
                userId: userId,
                title: 'Delivery Update',
                body: `Delivery for order ${order.oscNumber} has been marked as failed. Note: ${note}`,
                subBody: `Order ID: ${order.oscNumber}`,
            })

            return BaseService.sendSuccessResponse({
                message: 'Delivery marked as failed successfully',
            })
        } catch (error) {
            console.error('Error in markOrderDeliveryAsFailed:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getRiderAssignedPickups(req) {
        try {
            const riderId = req.user.id
            const { page = 1, limit = 10 } = req.query

            const query = {
                isPickUp: true,
                'dispatchDetails.pickup.rider': riderId,
                'dispatchDetails.pickup.status': PICKUP_STATUS.SCHEDULED,
            }

            const result = await paginate(BookOrderModel, query, {
                page,
                limit,
            })
            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error('Error in getRiderAssignedPickups:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getActivePickups(req) {
        try {
            const riderId = req.user.id
            const { page = 1, limit = 10 } = req.query

            const query = {
                isDelivery: true,
                'dispatchDetails.pickup.rider': riderId,
                'dispatchDetails.pickup.status': PICKUP_STATUS.PICKED_UP,
            }

            const result = await paginate(BookOrderModel, query, {
                page,
                limit,
            })
            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error('Error in getActivePickups:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async startPickup(req) {
        try {
            const orderId = req.params.id
            const { phoneNumber } = req.body
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!phoneNumber)
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number is required',
                })

            const order = await BookOrderModel.findById(orderId).populate(
                'userId',
                'phoneNumber',
            )
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            if(!order.isPickUp) {
                return BaseService.sendFailedResponse({
                    error: 'This order does not require pickup',
                })
            }

            if(order.dispatchDetails.pickup.status !== PICKUP_STATUS.SCHEDULED) {
                return BaseService.sendFailedResponse({
                    error: 'Pickup is not in a scheduled state',
                })
            }

            if (order.dispatchDetails.pickup.rider?.toString() !== userId) {
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this pickup',
                })
            }

            if (
                order.dispatchDetails.pickup.status === PICKUP_STATUS.PICKED_UP
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Order has already been picked up',
                })
            }

            const customerPhone = order.userId?.phoneNumber || order.phoneNumber
            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (customerPhone !== phoneNumber) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.pickup.status = PICKUP_STATUS.PICKED_UP
            order.dispatchDetails.pickup.updatedAt = new Date()
            order.dispatchDetails.pickup.isVerified = true
            await order.save()

            if (order.userId?._id) {
                await createNotification({
                    userId: order.userId._id,
                    title: 'Your order has been delivered',
                    body: `Order ${order.oscNumber} has been delivered successfully.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.PICKUP_STARTED,
                })
            }

            await createNotification({
                userId: userId,
                title: 'Pickup Started',
                body: `Pickup for order ${order.oscNumber} has been started.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.PICKUP_STARTED,
            })

            return BaseService.sendSuccessResponse({
                message: 'Pickup started successfully',
            })
        } catch (error) {
            console.error('Error in startPickup:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async markPickupAsFailed(req) {
        try {
            const orderId = req.params.id
            const { phoneNumber, note = '' } = req.body
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!phoneNumber)
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number is required',
                })

            const order = await BookOrderModel.findById(orderId).populate(
                'userId',
                'phoneNumber',
            )
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            if (order.dispatchDetails.pickup.rider?.toString() !== userId) {
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this pickup',
                })
            }

            if (order.dispatchDetails.pickup.status !== PICKUP_STATUS.SCHEDULED) {
                return BaseService.sendFailedResponse({
                    error: 'Only scheduled pickups can be marked as failed',
                })
            }

            if (order.userId.phoneNumber !== phoneNumber) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.pickup.status = PICKUP_STATUS.FAILED
            order.dispatchDetails.pickup.updatedAt = new Date()
            order.dispatchDetails.pickup.note = note
            await order.save()

            await createNotification({
                userId: userId,
                title: 'Pickup Update',
                body: `Pickup for order ${order.oscNumber} has been marked as failed. Note: ${note}`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.PICKUP_FAILED,
            })

            return BaseService.sendSuccessResponse({
                message: 'Pickup marked as failed successfully',
            })
        } catch (error) {
            console.error('Error in markPickupAsFailed:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async startDelivery(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })

            const order = await BookOrderModel.findById(orderId)
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            if (order.dispatchDetails.delivery.rider?.toString() !== userId) {
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this delivery',
                })
            }

            if (
                order.isDelivery && order.dispatchDetails.delivery.status !== DELIVERY_STATUS.READY
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Order is not ready for delivery',
                })
            }

            order.dispatchDetails.delivery.status =
                DELIVERY_STATUS.OUT_FOR_DELIVERY
            order.dispatchDetails.delivery.updatedAt = new Date()
            await order.save()

            await createNotification({
                userId: userId,
                title: 'Delivery Started',
                body: `Delivery for order ${order.oscNumber} has been started.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.DELIVERY_STARTED,
            })

            return BaseService.sendSuccessResponse({
                message: 'Delivery started successfully',
            })
        } catch (error) {
            console.error('Error in startDelivery:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getHistoryList(req) {
        try {
            const riderId = req.user.id
            const user = await UserModel.findById(riderId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const {
                page = 1,
                limit = 20,
                search = '',
                startDate,
                endDate,
            } = req.query

            const query = {
                $or: [
                    {
                        'dispatchDetails.pickup.rider': riderId,
                        'dispatchDetails.pickup.status': PICKUP_STATUS.FAILED,
                    },
                    {
                        'dispatchDetails.delivery.rider': riderId,
                        'dispatchDetails.delivery.status': {
                            $in: [
                                DELIVERY_STATUS.DELIVERED,
                                DELIVERY_STATUS.FAILED,
                            ],
                        },
                    },
                ],
            }

            if (search) {
                query.$and = [
                    {
                        $or: [
                            { oscNumber: { $regex: search, $options: 'i' } },
                            { fullName: { $regex: search, $options: 'i' } },
                            { phoneNumber: { $regex: search, $options: 'i' } },
                        ],
                    },
                ]
            }

            if (startDate || endDate) {
                query['updatedAt'] = {}
                if (startDate) query['updatedAt'].$gte = new Date(startDate)
                if (endDate) query['updatedAt'].$lte = new Date(endDate)
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { updatedAt: -1 },
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount pickupAddress stage dispatchDetails createdAt updatedAt',
                lean: true,
            })

            return BaseService.sendSuccessResponse({
                message: { data, pagination },
            })
        } catch (error) {
            console.error('Error in getHistoryList:', error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch history',
            })
        }
    }

    async getOrderDetails(req) {
        try {
            const orderId = req.params.id
            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })

            const order = await BookOrderModel.findById(orderId).populate(
                'userId',
                'fullName email phoneNumber',
            )
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            return BaseService.sendSuccessResponse({ message: order })
        } catch (error) {
            console.log('Error in getOrderDetails:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getOrderTimeline(req) {
        try {
            const orderId = req.params.id
            const riderId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })

            const user = await UserModel.findById(riderId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findById(orderId).lean()
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            const isAssigned =
                order.dispatchDetails?.pickup?.rider?.toString() === riderId ||
                order.dispatchDetails?.delivery?.rider?.toString() === riderId

            if (!isAssigned)
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this order',
                })

            const PIPELINE = [
                {
                    key: 'intake',
                    label: 'Intake',
                    status: ORDER_STATUS.PENDING,
                },
                { key: 'tagged', label: 'Tagged', status: ORDER_STATUS.QUEUE },
                {
                    key: 'pretreated',
                    label: 'Pretreated',
                    status: ORDER_STATUS.SORT_AND_PRETREAT,
                },
                {
                    key: 'washed',
                    label: 'Washed',
                    status: ORDER_STATUS.WASHING,
                },
                {
                    key: 'ironing',
                    label: 'Ironing',
                    status: ORDER_STATUS.IRONING,
                },
                {
                    key: 'qc_passed',
                    label: 'QC Passed',
                    status: ORDER_STATUS.QC,
                },
                { key: 'ready', label: 'Ready', status: ORDER_STATUS.READY },
                {
                    key: 'delivered',
                    label: 'Delivered',
                    status: ORDER_STATUS.DELIVERED,
                },
            ]

            const stageTimestampMap = {}
            for (const entry of order.stageHistory || []) {
                if (!stageTimestampMap[entry.status]) {
                    stageTimestampMap[entry.status] = entry.updatedAt
                }
            }
            stageTimestampMap[ORDER_STATUS.PENDING] =
                stageTimestampMap[ORDER_STATUS.PENDING] || order.createdAt

            const pipeline = PIPELINE.map((step) => {
                const timestamp = stageTimestampMap[step.status] || null
                return {
                    key: step.key,
                    label: step.label,
                    completed: !!timestamp,
                    timestamp,
                }
            })

            const trackingStatus =
                order.dispatchDetails?.delivery?.status ===
                DELIVERY_STATUS.DELIVERED
                    ? 'completed'
                    : order.dispatchDetails?.delivery?.status ===
                        DELIVERY_STATUS.FAILED
                      ? 'failed'
                      : 'in_progress'

            return BaseService.sendSuccessResponse({
                message: {
                    order: {
                        _id: order._id,
                        oscNumber: order.oscNumber,
                        fullName: order.fullName,
                        phoneNumber: order.phoneNumber,
                        pickupAddress: order.pickupAddress,
                        serviceType: order.serviceType,
                        serviceTier: order.serviceTier,
                        amount: order.amount,
                        stage: order.stage,
                        trackingStatus,
                        dispatchDetails: order.dispatchDetails,
                        createdAt: order.createdAt,
                    },
                    pipeline,
                },
            })
        } catch (error) {
            console.error('Error in getOrderTimeline:', error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch order timeline',
            })
        }
    }
}

module.exports = RiderService
