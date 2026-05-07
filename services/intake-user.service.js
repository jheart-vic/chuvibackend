const ActivityModel = require('../models/activity.model')
const BookOrderModel = require('../models/bookOrder.model')
const NotificationModel = require('../models/notification.model')
const UserModel = require('../models/user.model')
const WalletModel = require('../models/wallet.model')
const {
    PAYMENT_ORDER_STATUS,
    BILLING_TYPE,
    ORDER_CHANNEL,
    ORDER_STATUS,
    PICKUP_STATUS,
    DELIVERY_STATUS,
    ACTIVITY_TYPE,
    STATION_STATUS,
    DELIVERY_SPEED,
    NOTIFICATION_TYPE,
} = require('../util/constants')
const { generateOscNumber, buildStageUpdate } = require('../util/helper')
const paginate = require('../util/paginate')
const validateData = require('../util/validate')
const BaseService = require('./base.service')

class IntakeUserService extends BaseService {
    async createBookOrder(req, res) {
        try {
            const post = req.body
            const userId = req.user.id

            const user = await UserModel.findById(userId)

            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const customer = await UserModel.findOne({
                fullName: post.fullName,
            })

            const customerId = customer ? customer._id : null

            const validateRule = {
                fullName: 'string|required',
                phoneNumber: 'string|required',
                // pickupAddress: 'string|required',
                serviceType: 'string|required',
                serviceTier: 'string|required',
                isPickUp: 'boolean|required',
                isDelivery: 'boolean|required',
                deliverySpeed: 'string|required',
                items: 'array|required',
                'items.*.type': 'string|required',
                'items.*.price': 'integer|required',
                'items.*.quantity': 'integer|required',
            }

            const validateMessage = {
                required: ':attribute is required',
                int: ':attribute must be an integer.',
                array: ':attribute must be an array.',
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

            let totalPrice = post.items.reduce((sum, item) => {
                const price = Number(item.price)
                const quantity = Number(item.quantity)

                return sum + price * quantity
            }, 0)

            let extraDeliveryCost = 0

            if (post.deliverySpeend == DELIVERY_SPEED.EXPRESS) {
                extraDeliveryCost = 300
            } else if (post.deliverySpeed == DELIVERY_SPEED.SAME_DAY) {
                extraDeliveryCost = 500
            }

            totalPrice += extraDeliveryCost * post.items.length

            const oscNumber = generateOscNumber()
            const newOrderItem = {
                oscNumber,
                amount: totalPrice,
                paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                billingType: BILLING_TYPE.PAY_PER_ITEM,
                intakeStaffId: userId,
                channel: ORDER_CHANNEL.OFFICE,
                stage: {
                    status: ORDER_STATUS.QUEUE,
                },
                stageHistory: [
                    {
                        status: ORDER_STATUS.QUEUE,
                        updatedAt: new Date(),
                        note: 'Order Created',
                    },
                ],
                ...(customerId && { userId: customerId }),
                ...post,
            }
            const newOrder = new BookOrderModel(newOrderItem)
            await newOrder.save()

            await NotificationModel.create({
                userId: userId,
                title: 'Order Created Successfully',
                body: `Your have successfully created an order for ${post.fullName}.`,
                subBody: `Order ID: ${oscNumber}.`,
                type: NOTIFICATION_TYPE.ORDER_CREATED,
            })

            await ActivityModel.create({
                title: 'New Order Registered',
                description: `Order ${oscNumber} created for a customer ${post.fullName}.`,
                type: ACTIVITY_TYPE.ORDER_CREATED,
                orderId: newOrder._id,
                userId,
                reference: oscNumber,
            })

            return BaseService.sendSuccessResponse({
                message: newOrder,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
    async intakeDashboard(req, res) {
        try {
            const pendingOrders = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.PENDING,
            })
            const taggingQueue = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.QUEUE,
            })
            const holdOrders = await BookOrderModel.countDocuments({
                'stage.status': ORDER_STATUS.HOLD,
            })

            const response = {}
            response['pendingOrders'] = pendingOrders
            response['taggingQueueOrders'] = taggingQueue
            response['holdOrders'] = holdOrders

            return BaseService.sendSuccessResponse({ message: response })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong.',
            })
        }
    }
    // async getPendingOrders(req) {
    //     try {
    //         const page = parseInt(req.query.page) || 1 // default to page 1
    //         const limit = parseInt(req.query.limit) || 10 // default 10 per page
    //         const skip = (page - 1) * limit

    //         const filter = {
    //             'stage.status': ORDER_STATUS.PENDING,
    //         }

    //         const orders = await BookOrderModel.find(filter)
    //             .sort({ createdAt: -1 }) // latest first
    //             .skip(skip)
    //             .limit(limit)
    //             .lean()

    //         // 4️⃣ Count total for pagination meta
    //         const total = await BookOrderModel.countDocuments(filter)

    //         // 5️⃣ Send response
    //         return BaseService.sendSuccessResponse({
    //             message: {
    //                 total,
    //                 page,
    //                 limit,
    //                 totalPages: Math.ceil(total / limit),
    //                 data: orders,
    //             },
    //         })
    //     } catch (error) {
    //         console.log(error)
    //         return BaseService.sendFailedResponse({
    //             error: 'Failed to get orders',
    //         })
    //     }
    // }
    async getBookOrder(req) {
        try {
            const orderId = req.params.id

            if (!orderId) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }
            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            return BaseService.sendSuccessResponse({
                message: order,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to get order',
            })
        }
    }
    async flagOrder(req) {
        try {
            const userId = req.user.id
            const orderId = req.params.id
            const post = req.body
            const { message } = post

            if (!orderId) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }
            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            const user = await UserModel.findById(userId)

            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const validateRule = {
                message: 'string|required',
            }

            const validateMessage = {
                required: ':attribute is required',
                string: ':attribute must be an string.',
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

            order.stage.status = ORDER_STATUS.HOLD
            order.stage.note = message

            order.stageHistory.push({
                status: ORDER_STATUS.HOLD,
                note: message,
                updatedAt: new Date(),
            })

            await order.save()

            await ActivityModel.create({
                title: 'Order Flagged',
                description: `Order ${order.oscNumber} has been flagged with the following message: ${message}`,
                type: ACTIVITY_TYPE.ORDER_FLAGGED,
                orderId: order._id,
                userId: userId || null,
                reference: order.oscNumber,
            })

            return BaseService.sendSuccessResponse({
                message: 'Order flagged successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to flag order',
            })
        }
    }
    async proceedToTag(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }
            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            const user = await UserModel.findById(userId)

            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            if(order.isPickUp && order.dispatchDetails.pickup.status !== PICKUP_STATUS.PICKED_UP){
                return BaseService.sendFailedResponse({error: "Order is yet to be picked up. Please wait"})
            }

            order.stage.status = ORDER_STATUS.QUEUE
            order.stage.note = ''
            order.stageHistory.push({
                status: ORDER_STATUS.QUEUE,
                note: '',
                updatedAt: new Date(),
            })
            order.stationStatus = STATION_STATUS.INTAKE_AND_TAG_STATION

            await order.save()

            await ActivityModel.create({
                title: 'Order moved to tag and queue',
                description: `A order ${order.oscNumber} has been moved to tag and queue`,
                type: ACTIVITY_TYPE.TAG_AND_QUEUE,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            return BaseService.sendSuccessResponse({
                message: 'Order moved to tag and queue successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to proceed order',
            })
        }
    }
    async confirmTagItem(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id

            if (!orderId) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }
            if (!itemId) {
                return BaseService.sendFailedResponse({
                    error: 'item ID is required',
                })
            }
            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            const post = req.body

            const user = await UserModel.findById(userId)

            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const validateRule = {
                tagState: 'string|required',
                tagColor: 'string|required',
                tagStatus: 'string|required',
                tagId: 'string|required',
            }

            const validateMessage = {
                required: ':attribute is required',
                string: ':attribute must be an string.',
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

            const { tagState, tagColor, tagStatus, tagId } = post

            await BookOrderModel.updateOne(
                { 'items._id': itemId },
                {
                    $set: {
                        'items.$.tagState': tagState,
                        'items.$.tagColor': tagColor,
                        'items.$.tagStatus': tagStatus,
                        'items.$.tagId': tagId,
                    },
                },
            )

            await ActivityModel.create({
                title: 'Order Item Tagged',
                description: `An item with ${tagId} order ${order.oscNumber} has been tagged`,
                type: ACTIVITY_TYPE.ORDER_CONFIRM,
                orderId: order._id,
                userId: userId || null,
                reference: order.oscNumber,
            })

            return BaseService.sendSuccessResponse({
                message: 'Tag successfully confirmed',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to flag order',
            })
        }
    }
    async undoConfirmTagItem(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id

            if (!orderId) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }
            if (!itemId) {
                return BaseService.sendFailedResponse({
                    error: 'item ID is required',
                })
            }
            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            const user = await UserModel.findById(userId)

            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            await BookOrderModel.updateOne(
                { 'items._id': itemId },
                {
                    $set: {
                        'items.$.tagState': '',
                        'items.$.tagColor': '',
                        'items.$.tagStatus': '',
                        'items.$.tagId': '',
                    },
                },
            )

            await ActivityModel.create({
                title: 'Order Item Tag Undone',
                description: `An item with ${itemId} order ${order.oscNumber} has been undone from tagging`,
                type: ACTIVITY_TYPE.ORDER_CONFIRM,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            return BaseService.sendSuccessResponse({
                message: 'Tag successfully undone',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to flag order',
            })
        }
    }
    async proceedToSortAndPretreat(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }
            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            const user = await UserModel.findById(userId)

            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }
            const untaggedItems = order.items.filter(
                (i) => i.tagStatus !== 'complete',
            )
            if (untaggedItems.length > 0) {
                return BaseService.sendFailedResponse({
                    error: `${untaggedItems.length} item(s) still untagged. Please tag all items before proceeding.`,
                })
            }

            order.stage.status = ORDER_STATUS.SORT_AND_PRETREAT
            order.stage.note = ''
            order.stageHistory.push({
                status: ORDER_STATUS.SORT_AND_PRETREAT,
                note: '',
                updatedAt: new Date(),
            })
            order.stationStatus = STATION_STATUS.SORT_AND_PRETREAT_STATION

            await order.save()

            await ActivityModel.create({
                title: 'Order moved to sort and pretreat',
                description: `A order ${order.oscNumber} has been moved to sort and pretreat`,
                type: ACTIVITY_TYPE.SORT_AND_PRETREAT,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            return BaseService.sendSuccessResponse({
                message: `Order ${order.oscNumber} successfully sent`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to flag order',
            })
        }
    }
    async sendTopUpRequest(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id
            const post = req.body

            if (!orderId) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }
            const order =
                await BookOrderModel.findById(orderId).populate('userId')
            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            const user = await UserModel.findById(userId)

            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const validateRule = {
                message: 'string|required',
                amount: 'integer|required',
            }

            const validateMessage = {
                required: ':attribute is required',
                string: ':attribute must be an string.',
                integer: ':attribute must be an number.',
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

            const { amount } = post
            //   send message either SMS or Whatsapp to a user
            await ActivityModel.create({
                title: 'Wallet Adjustment request',
                description: `Credit ${amount} to ${order.fullName} with ${order.phoneNumber}`,
                type: ACTIVITY_TYPE.TOP_UP_REQUEST,
            })

            return BaseService.sendSuccessResponse({
                message: 'Order moved to sort and pretreat successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to send top up',
            })
        }
    }
    async adjustWallet(req) {
        try {
            const orderId = req.params.id
            const userId = req.params.userId
            const post = req.body

            if (!orderId) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }
            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            const user = await UserModel.findById(userId)

            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const validateRule = {
                message: 'string|required',
                amount: 'integer|required',
                type: 'string|required|in:credit,debit',
            }

            const validateMessage = {
                required: ':attribute is required',
                string: ':attribute must be an string.',
                integer: ':attribute must be an number.',
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

            const { type, message, amount } = post

            const wallet = await WalletModel.findOne({ userId })

            if (!wallet) {
                return BaseService.sendFailedResponse({
                    error: 'Wallet not found',
                })
            }

            if (type === 'credit') {
                wallet.balance += amount
                wallet.save()
            } else {
                if (wallet.balance < amount) {
                    return BaseService.sendFailedResponse({
                        error: 'Insufficient balance',
                    })
                }
                wallet.balance -= amount
                wallet.save()
            }

            order.adjustWallet.message = message
            order.adjustWallet.amount = amount
            order.save()

            await ActivityModel.create({
                title: 'Wallet Adjustment',
                description: `${type === 'credit' ? 'Credited' : 'Debited'} ${amount} to wallet of ${order.userId.fullName} with ${order.userId.phoneNumber}. Reason: ${message}`,
                type: ACTIVITY_TYPE.WALLET_ADJUSTMENT,
            })

            return BaseService.sendSuccessResponse({
                message: `Wallet ${type} request successful of ${amount}
        Reason: ${message}`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to flag order',
            })
        }
    }
    async getUserWallet(req) {
        try {
            const userId = req.params.id

            if (!userId) {
                return BaseService.sendFailedResponse({
                    error: 'User ID is required',
                })
            }

            const user = await UserModel.findById(userId)

            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const wallet = await WalletModel.findOne({ userId })

            if (!wallet) {
                return BaseService.sendFailedResponse({
                    error: 'Wallet not found',
                })
            }

            return BaseService.sendSuccessResponse({
                message: wallet.balance,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to flag order',
            })
        }
    }
    async getPickableOrders(req) {
        try {
            const orders = await BookOrderModel.find({
                isPickUpAndDelivery: true,
                'stage.status': ORDER_STATUS.PENDING,
            })

            return BaseService.sendSuccessResponse({
                message: orders,
            })
        } catch (error) {
            return BaseService.sendFailedResponse({
                error: 'Failed to get pickable orders',
            })
        }
    }
    async getDeliverableOrders(req) {
        try {
            const orders = await BookOrderModel.find({
                isPickUpAndDelivery: true,
                'stage.status': ORDER_STATUS.READY,
            })

            return BaseService.sendSuccessResponse({
                message: orders,
            })
        } catch (error) {
            return BaseService.sendFailedResponse({
                error: 'Failed to get deliverable orders',
            })
        }
    }
    async assignRiderTopPickupOrder(req) {
        try {
            const orderId = req.params.id
            const riderId = req.params.riderId

            if (!orderId) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }
            if (!riderId) {
                return BaseService.sendFailedResponse({
                    error: 'Rider ID is required',
                })
            }
            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            order.dispatchDetails.pickup.rider = riderId
            order.dispatchDetails.pickup.status = PICKUP_STATUS.SCHEDULED
            order.dispatchDetails.pickup.updatedAt = new Date()

            await order.save()

            await ActivityModel.create({
                title: 'Dispach Run Created',
                description: `Order ${order.oscNumber}: ${order.items.length} assigned for pickup`,
                type: ACTIVITY_TYPE.ORDER_PICKED,
                orderId: order._id,
                userId: userId || null,
                reference: order.oscNumber,
            })

            return BaseService.sendSuccessResponse({
                message: 'Rider successfully assigned to order',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to assign rider to order',
            })
        }
    }
    async assignRiderTopDeliveryOrder(req) {
        try {
            const orderId = req.params.id
            const riderId = req.params.riderId

            if (!orderId) {
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            }
            if (!riderId) {
                return BaseService.sendFailedResponse({
                    error: 'Rider ID is required',
                })
            }
            const order = await BookOrderModel.findById(orderId)
            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            order.dispatchDetails.delivery.rider = riderId
            order.dispatchDetails.delivery.status =
                DELIVERY_STATUS.OUT_FOR_DELIVERY
            order.dispatchDetails.delivery.updatedAt = new Date()

            await order.save()

            await ActivityModel.create({
                title: 'Dispach Run Created',
                description: `Order ${order.oscNumber}: ${order.items.length} assigned for delivery`,
                type: ACTIVITY_TYPE.ORDER_DELIVERED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            return BaseService.sendSuccessResponse({
                message: 'Rider successfully assigned to order',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to assign rider to order',
            })
        }
    }

    async generateAllTags(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.QUEUE,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in tagging queue',
                })

            const now = new Date()
            const updatedItems = order.items.map((item, index) => {
                // only generate if not already tagged
                if (item.tagStatus === 'complete') return item
                const paddedIndex = String(index + 1).padStart(2, '0')
                item.tagId = `${order.oscNumber}-${paddedIndex}`
                // item.tagStatus = 'complete'
                return item
            })

            await BookOrderModel.updateOne(
                { _id: orderId },
                { $set: { items: updatedItems } },
            )

            await ActivityModel.create({
                title: 'All Tags Generated',
                description: `All tags auto-generated for order ${order.oscNumber} by ${user.fullName}`,
                type: ACTIVITY_TYPE.TAG_AND_QUEUE,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            const updatedOrder = await BookOrderModel.findById(orderId).lean()
            return BaseService.sendSuccessResponse({
                message: {
                    message: 'All tags generated successfully',
                    order: updatedOrder,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to generate tags',
            })
        }
    }

    async completeTagging(req) {
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

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const untaggedItems = order.items.filter(
                (i) => i.tagStatus !== 'complete',
            )
            if (untaggedItems.length > 0) {
                return BaseService.sendFailedResponse({
                    error: `${untaggedItems.length} item(s) still untagged. Please tag all items before completing.`,
                })
            }

            await ActivityModel.create({
                title: 'Tagging Completed',
                description: `All items on order ${order.oscNumber} confirmed tagged by ${user.fullName}`,
                type: ACTIVITY_TYPE.TAG_AND_QUEUE,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            return BaseService.sendSuccessResponse({
                message: 'All items tagged. Ready to send to Sort & Pretreat.',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to complete tagging',
            })
        }
    }

    async getPendingOrders(req) {
        try {
            const { page = 1, limit = 10, search = '' } = req.query
            const skip = (Number(page) - 1) * Number(limit)

            const query = {
                'stage.status': ORDER_STATUS.PENDING,
                channel: {
                    $in: [ORDER_CHANNEL.WHATSAPP, ORDER_CHANNEL.WEBSITE],
                },
            }

            if (search) {
                query.$or = [
                    { oscNumber: { $regex: search, $options: 'i' } },
                    { fullName: { $regex: search, $options: 'i' } },
                    { phoneNumber: { $regex: search, $options: 'i' } },
                ]
            }

            const [orders, total] = await Promise.all([
                BookOrderModel.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .select(
                        'oscNumber fullName phoneNumber serviceType serviceTier items amount channel stage createdAt',
                    )
                    .lean(),
                BookOrderModel.countDocuments(query),
            ])

            return BaseService.sendSuccessResponse({
                message: {
                    data: orders,
                    pagination: {
                        total,
                        page: Number(page),
                        limit: Number(limit),
                        totalPages: Math.ceil(total / Number(limit)),
                    },
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to get pending orders',
            })
        }
    }
    async getDrafts(req) {
        try {
            const { page = 1, limit = 20, search = '' } = req.query
            const skip = (Number(page) - 1) * Number(limit)

            const query = {
                'stage.status': ORDER_STATUS.QUEUE,
                $and: [
                    { items: { $elemMatch: { tagStatus: 'complete' } } },
                    {
                        items: {
                            $elemMatch: { tagStatus: { $ne: 'complete' } },
                        },
                    },
                ],
            }

            if (search) {
                query.$or = [
                    { oscNumber: { $regex: search, $options: 'i' } },
                    { fullName: { $regex: search, $options: 'i' } },
                    { phoneNumber: { $regex: search, $options: 'i' } },
                ]
            }

            const [orders, total] = await Promise.all([
                BookOrderModel.find(query)
                    .sort({ updatedAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .select(
                        'oscNumber fullName phoneNumber serviceType serviceTier items amount channel stage createdAt updatedAt',
                    )
                    .lean(),
                BookOrderModel.countDocuments(query),
            ])

            const ordersWithMeta = orders.map((order) => ({
                ...order,
                itemCount: order.items.length,
                taggedCount: order.items.filter(
                    (i) => i.tagStatus === 'complete',
                ).length,
                untaggedCount: order.items.filter(
                    (i) => i.tagStatus !== 'complete',
                ).length,
            }))

            return BaseService.sendSuccessResponse({
                message: {
                    data: ordersWithMeta,
                    pagination: {
                        total,
                        page: Number(page),
                        limit: Number(limit),
                        totalPages: Math.ceil(total / Number(limit)),
                    },
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch drafts',
            })
        }
    }
    async getTaggingQueue(req) {
        try {
            const { page = 1, limit = 10, search = '' } = req.query
            const skip = (Number(page) - 1) * Number(limit)

            const query = {
                'stage.status': ORDER_STATUS.QUEUE,
                items: {
                    $not: { $elemMatch: { tagStatus: 'complete' } },
                },
            }

            if (search) {
                query.$or = [
                    { oscNumber: { $regex: search, $options: 'i' } },
                    { fullName: { $regex: search, $options: 'i' } },
                    { phoneNumber: { $regex: search, $options: 'i' } },
                ]
            }

            const [orders, total] = await Promise.all([
                BookOrderModel.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .select(
                        'oscNumber fullName phoneNumber serviceType serviceTier items amount channel stage createdAt',
                    )
                    .lean(),
                BookOrderModel.countDocuments(query),
            ])

            return BaseService.sendSuccessResponse({
                message: {
                    data: orders,
                    pagination: {
                        total,
                        page: Number(page),
                        limit: Number(limit),
                        totalPages: Math.ceil(total / Number(limit)),
                    },
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch tagging queue',
            })
        }
    }

    async getHoldQueue(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const { page = 1, limit = 20, search = '' } = req.query

            const baseQuery = {
                'stage.status': ORDER_STATUS.HOLD,
                $or: [
                    { stationStatus: STATION_STATUS.INTAKE_AND_TAG_STATION },
                    {
                        'items.holdDetails.heldByStation':
                            STATION_STATUS.INTAKE_AND_TAG_STATION,
                    },
                ],
            }

            if (search) {
                baseQuery.$and = [
                    {
                        $or: [
                            { oscNumber: { $regex: search, $options: 'i' } },
                            { fullName: { $regex: search, $options: 'i' } },
                            { phoneNumber: { $regex: search, $options: 'i' } },
                        ],
                    },
                ]
            }

            const { data, pagination } = await paginate(
                BookOrderModel,
                baseQuery,
                {
                    page,
                    limit,
                    sort: { 'stage.updatedAt': -1 },
                    select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stationStatus stageHistory washDetails items createdAt updatedAt',
                    populate: {
                        path: 'intakeStaffId washDetails.operatorId',
                        select: 'fullName',
                    },
                    lean: true,
                },
            )

            const holdItems = data.map((order) => {
                const assignedToUs =
                    order.stationStatus ===
                    STATION_STATUS.INTAKE_AND_TAG_STATION
                const flaggedItems = (order.items || [])
                    .filter(
                        (i) =>
                            i.holdDetails?.heldByStation ||
                            i.holdDetails?.assignTo,
                    )
                    .map((i) => ({
                        itemId: i._id,
                        tagId: i.tagId,
                        type: i.type,
                        flagNote: i.flagNote,
                        holdReason: i.holdDetails?.reason,
                        assignTo: i.holdDetails?.assignTo,
                        heldByStation: i.holdDetails?.heldByStation,
                        heldAt: i.holdDetails?.heldAt,
                    }))

                return {
                    orderId: order._id,
                    oscNumber: order.oscNumber,
                    fullName: order.fullName,
                    phoneNumber: order.phoneNumber,
                    serviceType: order.serviceType,
                    serviceTier: order.serviceTier,
                    operator: order.washDetails?.operatorId?.fullName || null,
                    stage: order.stage,
                    stationStatus: order.stationStatus,
                    holdType: assignedToUs ? 'assigned_to_us' : 'raised_by_us',
                    holdReason: order.stage.note || '',
                    holdTime: order.stage.updatedAt,
                    flaggedItems,
                }
            })

            return BaseService.sendSuccessResponse({
                message: { data: holdItems, pagination },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch hold queue',
            })
        }
    }

    async releaseFromHold(req) {
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

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.HOLD,
                stationStatus: STATION_STATUS.INTAKE_AND_TAG_STATION,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not on hold at this station',
                })

            // stamp release details on all held items
            const now = new Date()
            const updatedItems = order.items.map((item) => {
                if (item.holdDetails?.assignTo) {
                    item.holdDetails.releasedAt = now
                    item.holdDetails.releasedByOperatorId = userId
                }
                return item
            })

            await BookOrderModel.updateOne(
                { _id: orderId },
                {
                    $set: {
                        items: updatedItems,
                        ...buildStageUpdate(
                            ORDER_STATUS.QUEUE,
                            STATION_STATUS.INTAKE_AND_TAG_STATION,
                            'Released from hold',
                        ).$set,
                    },
                },
            )
            await ActivityModel.create({
                title: 'Order Released from Hold',
                description: `Order ${order.oscNumber} released from hold and returned to tagging queue by ${user.fullName}`,
                type: ACTIVITY_TYPE.ORDER_RELEASED_FROM_HOLD,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            return BaseService.sendSuccessResponse({
                message:
                    'Order released from hold and returned to tagging queue',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to release order from hold',
            })
        }
    }

    async getHistoryList(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
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
                'stageHistory.status': ORDER_STATUS.QUEUE,
                'stage.status': {
                    $nin: [
                        ORDER_STATUS.PENDING,
                        ORDER_STATUS.QUEUE,
                        ORDER_STATUS.HOLD,
                    ],
                },
            }

            if (search) {
                query.$or = [
                    { oscNumber: { $regex: search, $options: 'i' } },
                    { fullName: { $regex: search, $options: 'i' } },
                    { phoneNumber: { $regex: search, $options: 'i' } },
                ]
            }

            if (startDate || endDate) {
                query.createdAt = {}
                if (startDate) query.createdAt.$gte = new Date(startDate)
                if (endDate) query.createdAt.$lte = new Date(endDate)
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { updatedAt: -1 },
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount channel stage stationStatus stageHistory createdAt updatedAt',
                lean: true,
            })

            return BaseService.sendSuccessResponse({
                message: { data, pagination },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch history',
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

            // Per-item action log
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
                order.stage.status === ORDER_STATUS.DELIVERED
                    ? 'completed'
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
                        channel: order.channel,
                        stage: order.stage,
                        stationStatus: order.stationStatus,
                        trackingStatus,
                        intakeStaffId: order.intakeStaffId,
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

module.exports = IntakeUserService
