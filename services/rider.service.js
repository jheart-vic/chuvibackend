const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const NotificationModel = require('../models/notification.model')
const {
    PICKUP_STATUS,
    DELIVERY_STATUS,
    ORDER_STATUS,
    NOTIFICATION_TYPE,
    STATION_STATUS,
    PICKUP_DURATION_MINUTES,
    DELIVERY_DURATION_MINUTES,
    ORDER_SERVICE_TYPE,
} = require('../util/constants')
const paginate = require('../util/paginate')

const BaseService = require('./base.service')
const createNotification = require('../util/createNotification')
const {
    buildStageUpdate,
    normalizePhone,
    getObjectId,
} = require('../util/helper')
const createAuditLog = require('../util/createAuditLog')
const { crmOnOrderDelivered } = require('../util/crmHooks')
const { offerOnOrderDelivered } = require('../util/offerHooks')

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

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                select: 'oscNumber fullName phoneNumber deliveryAddress serviceType serviceTier stage dispatchDetails createdAt',
                lean: true,
            })

            const ordersWithMeta = data.map((order) => {
                const startedAt = order.dispatchDetails?.delivery?.startedAt
                const estimatedDelivery = startedAt
                    ? new Date(
                          new Date(startedAt).getTime() +
                              DELIVERY_DURATION_MINUTES * 60 * 1000,
                      )
                    : null

                return {
                    ...order,
                    dispatchDetails: {
                        ...order.dispatchDetails,
                        delivery: {
                            ...order.dispatchDetails?.delivery,
                            estimatedDelivery,
                            durationMinutes: DELIVERY_DURATION_MINUTES,
                        },
                    },
                }
            })

            return BaseService.sendSuccessResponse({
                message: { data: ordersWithMeta, pagination },
            })
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

            const customerPhone = order.phoneNumber
            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (normalizePhone(customerPhone) !== normalizePhone(phoneNumber)) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.delivery.status = DELIVERY_STATUS.DELIVERED
            order.dispatchDetails.delivery.updatedAt = new Date()
            order.markModified('dispatchDetails.delivery')
            await order.save()
            await BookOrderModel.updateOne(
                { _id: orderId },
                buildStageUpdate(
                    ORDER_STATUS.DELIVERED,
                    STATION_STATUS.RIDER_STATION,
                    'Delivery complete',
                ),
            )

            crmOnOrderDelivered(order)
            offerOnOrderDelivered(order)

            if (order.userId?._id) {
                await createNotification({
                    userId: order.userId._id,
                    title: 'Your order has been delivered',
                    body: `Order ${order.oscNumber} has been delivered successfully.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.ORDER_DELIVERED,
                })
            }
            await createNotification({
                userId,
                title: 'Delivery Completed',
                body: `Delivery for order ${order.oscNumber} has been marked as delivered.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.DELIVERY_STARTED,
            })
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Order ${order.oscNumber} marked as delivered by rider`,
            })

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

            const customerPhone = order.phoneNumber
            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (normalizePhone(customerPhone) !== normalizePhone(phoneNumber)) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.delivery.status = DELIVERY_STATUS.FAILED
            order.dispatchDetails.delivery.updatedAt = new Date()
            order.dispatchDetails.delivery.note = note
            order.markModified('dispatchDetails.delivery')
            await order.save()

            await createNotification({
                userId: userId,
                title: 'Delivery Update',
                body: `Delivery for order ${order.oscNumber} has been marked as failed. Note: ${note}`,
                subBody: `Order ID: ${order.oscNumber}`,
            })
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Order ${order.oscNumber} marked as delivery failed by rider. Note: ${note}`,
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
                isPickUp: true,
                'dispatchDetails.pickup.rider': riderId,
                'dispatchDetails.pickup.status':
                    PICKUP_STATUS.PICKUP_IN_PROGRESS,
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                select: 'oscNumber fullName phoneNumber pickupAddress serviceType serviceTier stage dispatchDetails createdAt',
                lean: true,
            })

            const ordersWithMeta = data.map((order) => {
                const startedAt = order.dispatchDetails?.pickup?.updatedAt
                const estimatedArrival = startedAt
                    ? new Date(
                          new Date(startedAt).getTime() +
                              PICKUP_DURATION_MINUTES * 60 * 1000,
                      )
                    : null

                return {
                    ...order,
                    dispatchDetails: {
                        ...order.dispatchDetails,
                        pickup: {
                            ...order.dispatchDetails?.pickup,
                            estimatedArrival,
                            durationMinutes: PICKUP_DURATION_MINUTES,
                        },
                    },
                }
            })

            return BaseService.sendSuccessResponse({
                message: { data: ordersWithMeta, pagination },
            })
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

            if (!order.isPickUp) {
                return BaseService.sendFailedResponse({
                    error: 'This order does not require pickup',
                })
            }

            if (
                order.dispatchDetails.pickup.status !== PICKUP_STATUS.SCHEDULED
            ) {
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

            const customerPhone = order.phoneNumber
            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (normalizePhone(customerPhone) !== normalizePhone(phoneNumber)) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.pickup.status =
                PICKUP_STATUS.PICKUP_IN_PROGRESS
            order.dispatchDetails.pickup.updatedAt = new Date()
            order.dispatchDetails.pickup.isVerified = true
            await order.save()

            if (order.userId?._id) {
                await createNotification({
                    userId: order.userId._id,
                    title: 'Your order has been picked up',
                    body: `Order ${order.oscNumber} has been picked up successfully.`,
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
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Pickup for order ${order.oscNumber} started by rider`,
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

    async markAsPickedUp(req) {
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

            if (!order.isPickUp)
                return BaseService.sendFailedResponse({
                    error: 'This order does not require pickup',
                })

            if (order.dispatchDetails.pickup.rider?.toString() !== userId)
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this pickup',
                })

            if (
                order.dispatchDetails.pickup.status !==
                PICKUP_STATUS.PICKUP_IN_PROGRESS
            )
                return BaseService.sendFailedResponse({
                    error: 'Pickup must be in progress before it can be marked as picked up',
                })

            const customerPhone = order.phoneNumber
            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (normalizePhone(customerPhone) !== normalizePhone(phoneNumber)) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }
            order.dispatchDetails.pickup.status = PICKUP_STATUS.PICKED_UP
            order.dispatchDetails.pickup.updatedAt = new Date()
            order.dispatchDetails.pickup.isVerified = true
            order.markModified('dispatchDetails.pickup')
            await order.save()

            if (order.userId?._id) {
                await createNotification({
                    userId: order.userId._id,
                    title: 'Order Picked Up',
                    body: `Your order ${order.oscNumber} has been picked up and is on its way to us.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.PICKUP_STARTED,
                })
            }

            await createNotification({
                userId: userId,
                title: 'Pickup Completed',
                body: `Pickup for order ${order.oscNumber} has been marked as picked up.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.PICKUP_STARTED,
            })
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Order ${order.oscNumber} marked as picked up by rider`,
            })

            return BaseService.sendSuccessResponse({
                message: 'Order marked as picked up successfully',
            })
        } catch (error) {
            console.error('Error in markAsPickedUp:', error)
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

            const failableStatuses = [
                PICKUP_STATUS.SCHEDULED,
                PICKUP_STATUS.PICKUP_IN_PROGRESS,
            ]
            if (
                !failableStatuses.includes(order.dispatchDetails.pickup.status)
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Only scheduled or in-progress pickups can be marked as failed',
                })
            }
            const customerPhone = order.phoneNumber

            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (normalizePhone(customerPhone) !== normalizePhone(phoneNumber)) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.pickup.status = PICKUP_STATUS.FAILED
            order.dispatchDetails.pickup.updatedAt = new Date()
            order.dispatchDetails.pickup.note = note
            order.markModified('dispatchDetails.pickup')
            await order.save()

            await createNotification({
                userId: userId,
                title: 'Pickup Update',
                body: `Pickup for order ${order.oscNumber} has been marked as failed. Note: ${note}`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.PICKUP_FAILED,
            })
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Order ${order.oscNumber} marked as pickup failed by rider. Note: ${note}`,
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
                order.isDelivery &&
                order.dispatchDetails.delivery.status !== DELIVERY_STATUS.READY
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Order is not ready for delivery',
                })
            }

            order.dispatchDetails.delivery.status =
                DELIVERY_STATUS.OUT_FOR_DELIVERY
            order.dispatchDetails.delivery.updatedAt = new Date()
            order.dispatchDetails.delivery.startedAt = new Date()
            await order.save()

            await BookOrderModel.updateOne(
                { _id: orderId },
                {
                    $set: {
                        'stage.status': ORDER_STATUS.OUT_FOR_DELIVERY,
                        'stage.updatedAt': new Date(),
                    },
                    $push: {
                        stageHistory: {
                            status: ORDER_STATUS.OUT_FOR_DELIVERY,
                            note: 'Out for delivery',
                            updatedAt: new Date(),
                        },
                    },
                },
            )

            await createNotification({
                userId: userId,
                title: 'Delivery Started',
                body: `Delivery for order ${order.oscNumber} has been started.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.DELIVERY_STARTED,
            })
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Delivery for order ${order.oscNumber} started by rider`,
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
                        'dispatchDetails.pickup.status': {
                            $in: [
                                PICKUP_STATUS.PICKED_UP,
                                PICKUP_STATUS.FAILED,
                            ],
                        },
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
                if (startDate)
                    query['updatedAt'].$gte = new Date(
                        new Date(startDate).setHours(0, 0, 0, 0),
                    )
                if (endDate)
                    query['updatedAt'].$lte = new Date(
                        new Date(endDate).setHours(23, 59, 59, 999),
                    )
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { updatedAt: -1 },
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount pickupAddress stage dispatchDetails createdAt updatedAt',
                lean: true,
            })

            const startOfToday = new Date()
            startOfToday.setHours(0, 0, 0, 0)

            const today = []
            const earlier = []

            for (const order of data) {
                // use the most recent dispatch action as anchor
                const deliveryUpdatedAt =
                    order.dispatchDetails?.delivery?.updatedAt
                const pickupUpdatedAt = order.dispatchDetails?.pickup?.updatedAt
                const completedAt =
                    deliveryUpdatedAt || pickupUpdatedAt || order.updatedAt

                if (new Date(completedAt) >= startOfToday) {
                    today.push(order)
                } else {
                    earlier.push(order)
                }
            }

            return BaseService.sendSuccessResponse({
                message: { today, earlier, pagination },
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
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findById(orderId).lean()
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            const skipWashingTypes = [
                'iron-only',
                'ironing-only',
                ORDER_SERVICE_TYPE.IRONING_ONLY,
            ]
            const skipIroningTypes = [
                'wash-only',
                'washing-only',
                ORDER_SERVICE_TYPE.WASHING_ONLY,
            ]

            const isIronOnly = skipWashingTypes.includes(order.serviceType)
            const isWashOnly = skipIroningTypes.includes(order.serviceType)

            const PIPELINE = [
                {
                    key: 'intake',
                    label: 'Intake',
                    completedBy: ORDER_STATUS.QUEUE,
                },
                {
                    key: 'tagged',
                    label: 'Tagged',
                    completedBy: ORDER_STATUS.SORT_AND_PRETREAT,
                },
                {
                    key: 'pretreated',
                    label: 'Pretreated',
                    completedBy: [ORDER_STATUS.WASHING, ORDER_STATUS.IRONING],
                },
                // washed — only show for non iron-only orders
                ...(!isIronOnly
                    ? [
                          {
                              key: 'washed',
                              label: 'Washed',
                              completedBy: [
                                  ORDER_STATUS.IRONING,
                                  ORDER_STATUS.READY,
                              ],
                          },
                      ]
                    : []),
                // ironing — only show for non wash-only orders
                ...(!isWashOnly
                    ? [
                          {
                              key: 'ironing',
                              label: 'Ironing',
                              completedBy: [
                                  ORDER_STATUS.QC,
                                  ORDER_STATUS.READY,
                              ],
                          },
                      ]
                    : []),
                {
                    key: 'qc_passed',
                    label: 'QC Passed',
                    completedBy: ORDER_STATUS.READY,
                },
                {
                    key: 'ready',
                    label: 'Ready',
                    completedBy: [
                        ORDER_STATUS.OUT_FOR_DELIVERY,
                        ORDER_STATUS.DELIVERED,
                    ],
                },
                {
                    key: 'delivered',
                    label: 'Delivered',
                    completedBy: ORDER_STATUS.DELIVERED,
                },
            ]

            const pipeline = PIPELINE.map((step) => {
                const completedByStatuses = Array.isArray(step.completedBy)
                    ? step.completedBy
                    : [step.completedBy]

                const matchingEntry = order.stageHistory?.find((h) =>
                    completedByStatuses.includes(h.status),
                )

                return {
                    key: step.key,
                    label: step.label,
                    completed: !!matchingEntry,
                    timestamp: matchingEntry?.updatedAt || null,
                }
            })

            const itemTimeline = []
            for (const item of order.items || []) {
                for (const log of item.actionLog || []) {
                    itemTimeline.push({
                        itemId: item._id,
                        itemType: item.type,
                        tagId: item.tagId,
                        action: log.action,
                        note: log.note || '',
                        timestamp: log.timestamp,
                    })
                }
            }
            itemTimeline.sort(
                (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
            )

            const trackingStatus =
                order.dispatchDetails?.delivery?.status ===
                DELIVERY_STATUS.DELIVERED
                    ? 'completed'
                    : order.dispatchDetails?.delivery?.status ===
                        DELIVERY_STATUS.FAILED
                      ? 'delivery_failed'
                      : order.dispatchDetails?.pickup?.status ===
                          PICKUP_STATUS.FAILED
                        ? 'pickup_failed'
                        : 'in_progress'

            return BaseService.sendSuccessResponse({
                message: {
                    order: {
                        _id: order._id,
                        oscNumber: order.oscNumber,
                        fullName: order.fullName,
                        serviceType: order.serviceType,
                        serviceTier: order.serviceTier,
                        amount: order.amount,
                        stage: order.stage,
                        stationStatus: order.stationStatus,
                        trackingStatus,
                        qcDetails: order.qcDetails,
                        dispatchDetails: order.dispatchDetails,
                        createdAt: order.createdAt,
                    },
                    pipeline,
                    itemTimeline,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch order timeline',
            })
        }
    }
}

module.exports = RiderService
