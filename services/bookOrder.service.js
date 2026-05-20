const BaseService = require('./base.service')
const UserModel = require('../models/user.model')
const validateData = require('../util/validate')
const BookOrderModel = require('../models/bookOrder.model')
const AdminOrderDetailsModel = require('../models/adminOrderDetails.model')
const { generateOscNumber } = require('../util/helper')
const SubscriptionModel = require('../models/subscription.model')
const {
    NOTIFICATION_TYPE,
    ORDER_STATUS,
    DELIVERY_SPEED,
    BILLING_TYPE,
    STANDARD_ITEMS_ENUM_TYPES,
    ACTIVITY_TYPE,
    STATION_STATUS,
    PAYMENT_ORDER_STATUS,
} = require('../util/constants')
const ActivityModel = require('../models/activity.model')
const createNotification = require('../util/createNotification')
const WalletModel = require('../models/wallet.model')
const AdminSettingModel = require('../models/adminSetting.model')
const WalletTransactionModel = require('../models/walletTransaction.model')

class BookOrderService extends BaseService {
    async postBookOrder(req, res) {
        try {
            const post = req.body
            const userId = req.user.id

            const user = await UserModel.findById(userId)

            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const validateRule = {
                fullName: 'string|required',
                phoneNumber: 'string|required',
                // pickupAddress: 'string|required',
                // pickupDate: "date|required",
                // pickupTime: "string|required",
                serviceType: 'string|required',
                serviceTier: 'string|required',
                billingType: 'string|required|in:pay-per-item,pay-from-subscription,pay-from-wallet',
                deliverySpeed: 'string|required|in:express,standard,same-day',
                isDelivery: 'boolean|required',
                isPickUp: 'boolean|required',
                items: 'array|required',
                'items.*.type': 'string|required',
                'items.*.price': 'integer|required',
                'items.*.quantity': 'integer|required',
            }

            const validateMessage = {
                required: ':attribute is required',
                int: ':attribute must be an integer.',
                array: ':attribute must be an array.',
                in: ":attribute must be valid.",
            }

            const validateResult = validateData(
                post,
                validateRule,
                validateMessage,
            )
            if (!validateResult.success) {
                return BaseService.sendFailedResponse({
                    error: validateResult.data,
                })
            }

            let finalMessage = 'Order booked successfully'
            const adminOrderDetails = await AdminOrderDetailsModel.findOne({})
            const adminOrderSetting = await AdminSettingModel.findOne({})

            if (!adminOrderDetails) {
                return BaseService.sendFailedResponse({
                    error: 'Admin order details not found',
                })
            }
            if (!adminOrderSetting) {
                return BaseService.sendFailedResponse({
                    error: 'Admin settings not found',
                })
            }

            const oscNumber = generateOscNumber()
            let newOrder = null

            if (post.billingType === BILLING_TYPE.PAY_FROM_SUBSCRIPTION) {
                const subscription = await SubscriptionModel.findOne({
                    userId,
                }).populate('planId')
                if (!subscription) {
                    return BaseService.sendFailedResponse({
                        error: 'No active subscription found for user',
                    })
                }

                if (subscription.status !== 'active') {
                    return BaseService.sendFailedResponse({
                        error: 'Subscription is not active',
                    })
                }

                // const isAllStandard = post.items.every((item) =>
                //     STANDARD_ITEMS_ENUM_TYPES.includes(item.type),
                // )

                // if (!isAllStandard) {
                //     return BaseService.sendFailedResponse({
                //         error: 'Your subscription plan only allows standard items. Please remove any non-standard items from your order.',
                //     })
                // }

                const invalidItem = post.items.find(
                    (item) => !STANDARD_ITEMS_ENUM_TYPES.includes(item.type)
                  );
                  
                  if (invalidItem) {
                    return BaseService.sendFailedResponse({
                      error: `Your subscription plan only allows standard items. "${invalidItem.type}" is not supported. Please remove it from your order.`,
                    });
                  }

                if (
                    post.deliverySpeed === DELIVERY_SPEED.SAME_DAY &&
                    post.items.length > adminOrderDetails.sameDayCapacity
                ) {
                    return BaseService.sendFailedResponse({
                        error: `Same day delivery is currently at full capacity. Please reduce your items or choose the express delivery speed.`,
                    })
                }

                if (
                    post.deliverySpeed === DELIVERY_SPEED.EXPRESS &&
                    post.items.length > adminOrderDetails.expressCapacity
                ) {
                    return BaseService.sendFailedResponse({
                        error: `Same day delivery is currently at full capacity. Please reduce your items or choose the standard delivery speed.`,
                    })
                }

                if (
                    post.deliverySpeed === DELIVERY_SPEED.STANDARD &&
                    post.items.length > adminOrderDetails.standardCapacity
                ) {
                    finalMessage += ` We expect this to take ${adminOrderDetails.standardDeliveryPeriod} days. We appreciate your patience and understanding.`
                }

                const subscriptionPlanMonthlyLimits =
                    subscription.planId.monthlyLimits
                if (post.items.length > subscriptionPlanMonthlyLimits) {
                    return BaseService.sendFailedResponse({
                        error: 'You selected items has exceeded your currently subscription limit. Consider upgrading or reducing your items',
                    })
                }

                let totalPrice = post.items.reduce((sum, item) => {
                    const price = Number(item.price)
                    const quantity = Number(item.quantity)

                    return sum + price * quantity
                }, 0)

                let extraDeliveryCost = 0

                totalPrice += extraDeliveryCost
                const stage = {
                    status: ORDER_STATUS.PENDING,
                    updatedAt: new Date(),
                }
                const stageHistory = {
                    status: ORDER_STATUS.PENDING,
                    note: 'Order created',
                    updatedAt: new Date(),
                }

                const newOrderItem = {
                    userId,
                    oscNumber,
                    amount: totalPrice,
                    deliveryAmount: extraDeliveryCost,
                    stage,
                    stageHistory: [stageHistory],
                    stationStatus: STATION_STATUS.PENDING,
                    paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                    ...post,
                }

                newOrder = new BookOrderModel(newOrderItem)
                await newOrder.save()

                await createNotification({
                    userId: userId,
                    title: 'Order Created Successfully',
                    body: `Your laundry order has been received. We will pick it up shortly.`,
                    subBody: `Order ID: ${oscNumber}.`,
                    type: NOTIFICATION_TYPE.ORDER_CREATED,
                })

                // update the subscription usage
                subscription.remainingItems -= post.items.length
                await subscription.save()
            } else if (post.billingType === BILLING_TYPE.PAY_PER_ITEM) {
                let totalPrice = post.items.reduce((sum, item) => {
                    const price = Number(item.price)
                    const quantity = Number(item.quantity)

                    return sum + price * quantity
                }, 0)

                let extraDeliveryCost = 0

                if (post.deliverySpeed === DELIVERY_SPEED.EXPRESS) {
                    extraDeliveryCost = adminOrderSetting.expressCharge
                } else if (post.deliverySpeed == DELIVERY_SPEED.SAME_DAY) {
                    extraDeliveryCost = adminOrderSetting.sameDayCharge
                }

                totalPrice += extraDeliveryCost

                // const oscNumber = generateOscNumber();

                const stage = {
                    status: ORDER_STATUS.PENDING,
                    updatedAt: new Date(),
                }
                const stageHistory = {
                    status: ORDER_STATUS.PENDING,
                    note: 'Order created',
                    updatedAt: new Date(),
                }

                const newOrderItem = {
                    userId,
                    oscNumber,
                    amount: totalPrice,
                    deliveryAmount: extraDeliveryCost,
                    stage,
                    stageHistory: [stageHistory],
                    ...post,
                }
                newOrder = new BookOrderModel(newOrderItem)
                await newOrder.save()

                await createNotification({
                    userId: userId,
                    title: 'Order Created Successfully',
                    body: `Your laundry order has been received. We will pick it up shortly.`,
                    subBody: `Order ID: ${oscNumber}.`,
                    type: NOTIFICATION_TYPE.ORDER_CREATED,
                })
            } else if (post.billingType === BILLING_TYPE.PAY_FROM_WALLET) {
                const wallet = await WalletModel.findOne({userId})
                if(!wallet){
                    return BaseService.sendFailedResponse({error: 'Wallet not found. Please try again later'})
                }

                let totalPrice = post.items.reduce((sum, item) => {
                    const price = Number(item.price)
                    const quantity = Number(item.quantity)

                    return sum + price * quantity
                }, 0)

                let extraDeliveryCost = 0

                if (post.deliverySpeed === DELIVERY_SPEED.EXPRESS) {
                    extraDeliveryCost = adminOrderSetting.expressCharge
                } else if (post.deliverySpeed == DELIVERY_SPEED.SAME_DAY) {
                    extraDeliveryCost = adminOrderSetting.sameDayCharge
                }

                totalPrice += extraDeliveryCost

                // const oscNumber = generateOscNumber();

                if(totalPrice > wallet.balance){
                    return BaseService.sendFailedResponse({error: 'Insufficient balance in your wallet. Please try funding your account to continue'})
                }

                wallet.balance -= totalPrice
                await wallet.save()

                const reference = uuidv4();
                await WalletTransactionModel.create({
                    userId,
                    walletId: wallet._id,
                    type: "debit",
                    amount: totalPrice,
                    reference,
                    status: "success",
                    description: "Order Payment",
                  });

                const stage = {
                    status: ORDER_STATUS.PENDING,
                    updatedAt: new Date(),
                }
                const stageHistory = {
                    status: ORDER_STATUS.PENDING,
                    note: 'Order created',
                    updatedAt: new Date(),
                }

                const newOrderItem = {
                    userId,
                    oscNumber,
                    amount: totalPrice,
                    deliveryAmount: extraDeliveryCost,
                    stage,
                    stageHistory: [stageHistory],
                    paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                    ...post,
                }
                newOrder = new BookOrderModel(newOrderItem)
                await newOrder.save()

                await createNotification({
                    userId: userId,
                    title: 'Order Created Successfully',
                    body: `Your laundry order has been received. We will pick it up shortly.`,
                    subBody: `Order ID: ${oscNumber}.`,
                    type: NOTIFICATION_TYPE.ORDER_CREATED,
                })
            }
            // update the capacity in admin order settings
            if (
                post.deliverySpeed === DELIVERY_SPEED.SAME_DAY &&
                adminOrderDetails.sameDayCapacity > 0
            ) {
                adminOrderDetails.sameDayCapacity -= post.items.length
            } else if (
                post.deliverySpeed === DELIVERY_SPEED.EXPRESS &&
                adminOrderDetails.expressCapacity > 0
            ) {
                adminOrderDetails.expressCapacity -= post.items.length
            } else if (
                post.deliverySpeed === DELIVERY_SPEED.STANDARD &&
                adminOrderDetails.standardCapacity > 0
            ) {
                adminOrderDetails.standardCapacity -= post.items.length
            }
            await adminOrderDetails.save()
            await ActivityModel.create({
                title: 'New Order Registered',
                description: `Order ${oscNumber} created for a customer ${post.fullName}.`,
                type: ACTIVITY_TYPE.ORDER_CREATED,
                orderId: newOrder._id,
                userId: userId || null,
                reference: oscNumber,
            })
            return BaseService.sendSuccessResponse({
                message: finalMessage,
                order: newOrder,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
    async updateBookOrderPaymentStatus(req, res) {
        try {
            const status = req.body.paymentStatus
            const bookOrderId = req.params.id

            if (!status) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a payment status for the book order',
                })
            }

            if (!bookOrderId) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a book order id',
                })
            }

            const bookOrder = await BookOrderModel.findById(bookOrderId)
            if (!bookOrder) {
                return BaseService.sendFailedResponse({
                    error: 'Book order not found!',
                })
            }

            if (status === 'success') {
                await createNotification({
                    userId: bookOrder.userId,
                    title: 'Payment Successful Approved',
                    body: `Your payment of ${bookOrder.amount} has been successfully approved.`,
                    subBody: `Order ID: ${bookOrder.oscNumber}`,
                    type: NOTIFICATION_TYPE.PAYMENT_APPROVED,
                })
            }
            bookOrder.paymentStatus = status
            await bookOrder.save()

            return BaseService.sendSuccessResponse({
                message: 'Book order updated successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
    async updateBookOrderStage(req, res) {
        try {
            const stage = req.body.stage
            const note = req.body.note
            const bookOrderId = req.params.id

            if (!stage) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a stage for the book order',
                })
            }

            if (
                ![
                    ORDER_STATUS.DELIVERED,
                    ORDER_STATUS.IRONING,
                    ORDER_STATUS.OUT_FOR_DELIVERY,
                    ORDER_STATUS.PICKED_UP,
                    ORDER_STATUS.READY,
                    ORDER_STATUS.RECEIVED,
                ].includes(stage)
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a valid stage for the book order',
                })
            }
            if (!bookOrderId) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a book order id',
                })
            }

            const bookOrder = await BookOrderModel.findById(bookOrderId)
            if (!bookOrder) {
                return BaseService.sendFailedResponse({
                    error: 'Book order not found!',
                })
            }
            bookOrder.stage.status = stage
            bookOrder.stage.note = note
            await bookOrder.save()

            let message = ''
            let title = ''

            switch (stage) {
                case ORDER_STATUS.PICKED_UP:
                    message = 'Your laundry has been picked up successfully'
                    title = 'Picked Up'
                    break
                case ORDER_STATUS.WASHING:
                    message = 'Your laundry is being washed'
                    title = 'Washing'
                    break
                case ORDER_STATUS.IRONING:
                    message = 'Your laundry is being ironed'
                    title = 'Ironing'
                    break
                case ORDER_STATUS.DELIVERED:
                    message = 'Your order has been delivered successfully'
                    title = 'Delivered'
                    break
                case ORDER_STATUS.OUT_FOR_DELIVERY:
                    message = 'Your order is out for delivery'
                    title = 'Delivered'
                case ORDER_STATUS.RECEIVED:
                    message = 'Your order has been received'
                    title = 'Received'
                case ORDER_STATUS.READY:
                    message = 'Your order is ready for pickup'
                    title = 'Ready'
                    break
                default:
                    message = 'Status updated'
            }

            await createNotification({
                userId: bookOrder.userId,
                title: title,
                body: message,
                subBody: note || '',
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })

            return BaseService.sendSuccessResponse({
                message: 'Book order stage updated successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
    async getBookOrderHistory(req, res) {
        try {
            const page = parseInt(req.query.page) || 1 // default to page 1
            const limit = parseInt(req.query.limit) || 10 // default 10 per page
            const skip = (page - 1) * limit
            const userId = req.user.id
            const scope = req.query.scope || 'all' // default to user scope "user | all"

            // 2️⃣ Optional filters
            const filter = {}
            if (req.query.status) {
                filter['stage.status'] = req.query.status // filter by order stage status
            }
            if (req.query.paymentStatus) {
                filter.paymentStatus = req.query.paymentStatus
            }
            if (scope === 'user') {
                filter.userId = userId
            }

            // 3️⃣ Fetch orders with pagination
            const orders = await BookOrderModel.find(filter)
                .sort({ createdAt: -1 }) // latest first
                .skip(skip)
                .limit(limit)
                .lean()

            // 4️⃣ Count total for pagination meta
            const total = await BookOrderModel.countDocuments(filter)

            // 5️⃣ Send response
            return BaseService.sendSuccessResponse({
                message: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    data: orders,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
    async getBookOrder(req, res) {
        try {
            const bookOrderId = req.params.id

            if (!bookOrderId) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a valid book order id',
                })
            }
            const bookOrder = await BookOrderModel.findById(bookOrderId)

            if (!bookOrder) {
                return BaseService.sendFailedResponse({
                    error: 'Book order not found',
                })
            }

            // 5️⃣ Send response
            return BaseService.sendSuccessResponse({
                message: bookOrder,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
}

module.exports = BookOrderService
