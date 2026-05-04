const ActivityModel = require('../models/activity.model')
const BookOrderModel = require('../models/bookOrder.model')
const NotificationModel = require('../models/notification.model')
const UserModel = require('../models/user.model')
const {
    ORDER_STATUS,
    ORDER_SERVICE_TYPE,
    COLOR_GROUP,
    FABRIC_TYPE,
    PRETREATMENT_OPTIONS,
    DAMAGE_RISK_FLAGS,
    STATION_STATUS,
    ACTIVITY_TYPE,
    ROLE,
    NOTIFICATION_TYPE,
} = require('../util/constants')
const { buildStageUpdate } = require('../util/helper')
const paginate = require('../util/paginate')
const BaseService = require('./base.service')

class SortAndPretreatService extends BaseService {
    async getDashboard(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const { page = 1, limit = 20, search = '' } = req.query

            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)
            const yesterdayStart = new Date(todayStart)
            yesterdayStart.setDate(yesterdayStart.getDate() - 1)

            const [
                ordersReceivedToday,
                ordersReceivedYesterday,
                ordersAwaitingSorting,
                flaggedCount,
                recentOrdersResult,
            ] = await Promise.all([
                BookOrderModel.countDocuments({
                    createdAt: { $gte: todayStart },
                }),
                BookOrderModel.countDocuments({
                    createdAt: { $gte: yesterdayStart, $lt: todayStart },
                }),
                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
                }),
                BookOrderModel.countDocuments({
                    'items.damageRiskFlags.0': { $exists: true },
                    'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
                }),
                (() => {
                    const query = {
                        'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
                    }
                    if (search) {
                        query.$or = [
                            { oscNumber: { $regex: search, $options: 'i' } },
                            { fullName: { $regex: search, $options: 'i' } },
                            { phoneNumber: { $regex: search, $options: 'i' } },
                        ]
                    }
                    return paginate(BookOrderModel, query, {
                        page,
                        limit,
                        sort: { updatedAt: -1 },
                        select: 'oscNumber fullName phoneNumber serviceType serviceTier stage createdAt updatedAt',
                        lean: true,
                    })
                })(),
            ])

            // Items pretreated today — items inside orders where pretreatStatus flipped today
            const pretreatedToday = await BookOrderModel.aggregate([
                { $unwind: '$items' },
                {
                    $match: {
                        'items.pretreatStatus': 'complete',
                        'items.updatedAt': { $gte: todayStart },
                    },
                },
                { $count: 'total' },
            ])

            const itemsPretreatedToday = pretreatedToday[0]?.total ?? 0

            const receivedDelta =
                ordersReceivedYesterday === 0
                    ? null
                    : Math.round(
                          ((ordersReceivedToday - ordersReceivedYesterday) /
                              ordersReceivedYesterday) *
                              100,
                      )

            return BaseService.sendSuccessResponse({
                message: {
                    stats: {
                        ordersReceivedToday,
                        receivedDeltaPercent: receivedDelta,
                        ordersAwaitingSorting,
                        itemsPretreatedToday,
                        riskFlaggedItems: flaggedCount,
                    },
                    recentOrders: recentOrdersResult.data,
                    pagination: recentOrdersResult.pagination,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch dashboard',
            })
        }
    }

    // GET ORDER QUEUE
    async getOrderQueue(req) {
        try {
            const userId = req.user.id

            const user = await UserModel.findById(userId)
            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const { page = 1, limit = 20, search = '' } = req.query

            const query = { 'stage.status': ORDER_STATUS.SORT_AND_PRETREAT }

            if (search) {
                query.$or = [
                    { oscNumber: { $regex: search, $options: 'i' } },
                    { fullName: { $regex: search, $options: 'i' } },
                    { phoneNumber: { $regex: search, $options: 'i' } },
                ]
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { updatedAt: -1 },
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount items stage stageHistory createdAt updatedAt',
                lean: true,
            })

            return BaseService.sendSuccessResponse({
                message: {
                    data,
                    pagination,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch order queue',
            })
        }
    }

    // GET SINGLE ORDER DETAILS
    async getOrderDetails(req) {
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
                'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
            }).lean()

            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in sort & pretreat stage',
                })

            const allItemsSorted = order.items.every(
                (i) => i.sortStatus === 'complete',
            )
            const allItemsPretreated = order.items.every(
                (i) => i.pretreatStatus === 'complete',
            )
            const readyToSend = allItemsSorted && allItemsPretreated

            return BaseService.sendSuccessResponse({
                message: {
                    order,
                    allItemsSorted,
                    allItemsPretreated,
                    readyToSend,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch order details',
            })
        }
    }

    //UPDATE ITEM SORT & PRETREAT DETAILS
    async updateItemSortDetails(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id
            const post = req.body

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!itemId)
                return BaseService.sendFailedResponse({
                    error: 'Item ID is required',
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in sort & pretreat stage',
                })

            const item = order.items.id(itemId)
            if (!item)
                return BaseService.sendFailedResponse({
                    error: 'Item not found in order',
                })

            const allowedColorGroups = Object.values(COLOR_GROUP)
            const allowedFabricTypes = Object.values(FABRIC_TYPE)
            const allowedPretreatments = Object.values(PRETREATMENT_OPTIONS)
            const allowedDamageFlags = Object.values(DAMAGE_RISK_FLAGS)

            if (post.colorGroup !== undefined) {
                if (!allowedColorGroups.includes(post.colorGroup)) {
                    return BaseService.sendFailedResponse({
                        error: `colorGroup must be one of: ${allowedColorGroups.join(', ')}`,
                    })
                }
            }

            if (post.fabricType !== undefined) {
                if (!allowedFabricTypes.includes(post.fabricType)) {
                    return BaseService.sendFailedResponse({
                        error: `fabricType must be one of: ${allowedFabricTypes.join(', ')}`,
                    })
                }
                const resolvedColorGroup = post.colorGroup ?? item.colorGroup
                if (!resolvedColorGroup) {
                    return BaseService.sendFailedResponse({
                        error: 'colorGroup must be set before selecting a fabricType',
                    })
                }
            }

            if (post.pretreatmentOptions !== undefined) {
                if (!Array.isArray(post.pretreatmentOptions)) {
                    return BaseService.sendFailedResponse({
                        error: 'pretreatmentOptions must be an array',
                    })
                }
                const invalid = post.pretreatmentOptions.filter(
                    (o) => !allowedPretreatments.includes(o),
                )
                if (invalid.length) {
                    return BaseService.sendFailedResponse({
                        error: `Invalid pretreatmentOptions: ${invalid.join(', ')}`,
                    })
                }
            }

            if (post.damageRiskFlags !== undefined) {
                if (!Array.isArray(post.damageRiskFlags)) {
                    return BaseService.sendFailedResponse({
                        error: 'damageRiskFlags must be an array',
                    })
                }
                const invalid = post.damageRiskFlags.filter(
                    (f) => !allowedDamageFlags.includes(f),
                )
                if (invalid.length) {
                    return BaseService.sendFailedResponse({
                        error: `Invalid damageRiskFlags: ${invalid.join(', ')}`,
                    })
                }
            }

            if (
                post.itemNote !== undefined &&
                typeof post.itemNote !== 'string'
            ) {
                return BaseService.sendFailedResponse({
                    error: 'itemNote must be a string',
                })
            }

            const setPayload = {}
            if (post.colorGroup !== undefined)
                setPayload['items.$.colorGroup'] = post.colorGroup
            if (post.fabricType !== undefined)
                setPayload['items.$.fabricType'] = post.fabricType
            if (post.pretreatmentOptions !== undefined)
                setPayload['items.$.pretreatmentOptions'] =
                    post.pretreatmentOptions
            if (post.damageRiskFlags !== undefined)
                setPayload['items.$.damageRiskFlags'] = post.damageRiskFlags
            if (post.itemNote !== undefined)
                setPayload['items.$.itemNote'] = post.itemNote

            if (Object.keys(setPayload).length === 0) {
                return BaseService.sendFailedResponse({
                    error: 'No valid fields provided to update',
                })
            }

            const changeSummaryParts = []
            if (post.colorGroup !== undefined)
                changeSummaryParts.push(`colorGroup=${post.colorGroup}`)
            if (post.fabricType !== undefined) {
                const context = post.colorGroup ?? item.colorGroup
                changeSummaryParts.push(
                    `fabricType=${post.fabricType} (${context})`,
                )
            }
            if (post.pretreatmentOptions !== undefined)
                changeSummaryParts.push(
                    `pretreatmentOptions=[${post.pretreatmentOptions.join(', ')}]`,
                )
            if (post.damageRiskFlags !== undefined)
                changeSummaryParts.push(
                    `damageRiskFlags=[${post.damageRiskFlags.join(', ')}]`,
                )
            if (post.itemNote !== undefined)
                changeSummaryParts.push(`itemNote updated`)

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: setPayload,
                    $push: {
                        'items.$.actionLog': {
                            action: 'sort_details_updated',
                            note: changeSummaryParts.join(' | '),
                            timestamp: new Date(),
                        },
                    },
                },
            )

            await ActivityModel.create({
                title: 'Item Sort Details Updated',
                description: `Sort details updated for item ${itemId} on order ${order.oscNumber} by ${user.fullName}. Changes: ${changeSummaryParts.join(' | ')}`,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({
                message: 'Item details saved successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to update item sort details',
            })
        }
    }

    //MARK ITEM AS SORTED
    async markItemAsSorted(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!itemId)
                return BaseService.sendFailedResponse({
                    error: 'Item ID is required',
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in sort & pretreat stage',
                })

            const item = order.items.id(itemId)
            if (!item)
                return BaseService.sendFailedResponse({
                    error: 'Item not found in order',
                })
            if (item.sortStatus === 'complete')
                return BaseService.sendFailedResponse({
                    error: 'Item is already marked as sorted',
                })

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: { 'items.$.sortStatus': 'complete' },
                    $push: {
                        'items.$.actionLog': {
                            action: 'sorted',
                            note: '',
                            timestamp: new Date(),
                        },
                    },
                },
            )

            const updatedOrder = await BookOrderModel.findById(orderId).lean()
            const allItemsSorted = updatedOrder.items.every(
                (i) => i.sortStatus === 'complete',
            )

            await ActivityModel.create({
                title: 'Item Sorted',
                description: `Item ${itemId} on order ${order.oscNumber} marked as sorted by ${user.fullName}.`,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({
                message: { message: 'Item marked as sorted', allItemsSorted },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to mark item as sorted',
            })
        }
    }

    // UNDO ITEM SORTED
    async undoMarkItemAsSorted(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!itemId)
                return BaseService.sendFailedResponse({
                    error: 'Item ID is required',
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in sort & pretreat stage',
                })

            const item = order.items.id(itemId)
            if (!item)
                return BaseService.sendFailedResponse({
                    error: 'Item not found in order',
                })

            if (item.sortStatus === 'pending') {
                return BaseService.sendFailedResponse({
                    error: 'Item is already marked as sorted',
                })
            }

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: { 'items.$.sortStatus': 'pending' },
                    $push: {
                        'items.$.actionLog': {
                            action: 'undo_sorted',
                            note: '',
                            timestamp: new Date(),
                        },
                    },
                },
            )

            await ActivityModel.create({
                title: 'Item Sort Undone',
                description: `Sort status undone for item ${itemId} on order ${order.oscNumber} by ${user.fullName}.`,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({
                message: 'Item sort undone successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to undo item sort',
            })
        }
    }

    // MARK ALL ITEMS AS SORTED
    async markAllItemsAsSorted(req) {
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
                'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in sort & pretreat stage',
                })
            const now = new Date()
            const updatedItems = order.items.map((item) => ({
                ...item.toObject(),
                sortStatus: 'complete',
                actionLog: [
                    ...(item.actionLog || []),
                    { action: 'sorted', note: 'bulk', timestamp: now },
                ],
            }))

            await BookOrderModel.updateOne(
                { _id: orderId },
                { $set: { items: updatedItems } },
            )

            await ActivityModel.create({
                title: 'All Items Sorted',
                description: `All items on order ${order.oscNumber} bulk-marked as sorted by ${user.fullName}.`,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({
                message: {
                    message: 'All items marked as sorted',
                    allItemsSorted: true,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to mark all items as sorted',
            })
        }
    }

    // MARK ITEM AS PRETREATED
    async markItemAsPretreated(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!itemId)
                return BaseService.sendFailedResponse({
                    error: 'Item ID is required',
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in sort & pretreat stage',
                })

            const item = order.items.id(itemId)
            if (!item)
                return BaseService.sendFailedResponse({
                    error: 'Item not found in order',
                })
            if (item.pretreatStatus === 'complete')
                return BaseService.sendFailedResponse({
                    error: 'Item is already marked as pretreated',
                })

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: { 'items.$.pretreatStatus': 'complete' },
                    $push: {
                        'items.$.actionLog': {
                            action: 'pretreated',
                            note: '',
                            timestamp: new Date(),
                        },
                    },
                },
            )

            const updatedOrder = await BookOrderModel.findById(orderId).lean()
            const allItemsSorted = updatedOrder.items.every(
                (i) => i.sortStatus === 'complete',
            )
            const allItemsPretreated = updatedOrder.items.every(
                (i) => i.pretreatStatus === 'complete',
            )
            const readyToSend = allItemsSorted && allItemsPretreated

            await ActivityModel.create({
                title: 'Item Pretreated',
                description: `Item ${itemId} on order ${order.oscNumber} marked as pretreated by ${user.fullName}.`,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({
                message: {
                    message: 'Item marked as pretreated',
                    data: { allItemsSorted, allItemsPretreated, readyToSend },
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to mark item as pretreated',
            })
        }
    }

    //UNDO ITEM PRETREATED
    async undoMarkItemAsPretreated(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!itemId)
                return BaseService.sendFailedResponse({
                    error: 'Item ID is required',
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in sort & pretreat stage',
                })

            const item = order.items.id(itemId)
            if (!item)
                return BaseService.sendFailedResponse({
                    error: 'Item not found in order',
                })

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: { 'items.$.pretreatStatus': 'pending' },
                    $push: {
                        'items.$.actionLog': {
                            action: 'undo_pretreated',
                            note: '',
                            timestamp: new Date(),
                        },
                    },
                },
            )

            await ActivityModel.create({
                title: 'Item Pretreat Undone',
                description: `Pretreat status undone for item ${itemId} on order ${order.oscNumber} by ${user.fullName}.`,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({
                message: 'Item pretreat status undone successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to undo item pretreat status',
            })
        }
    }

    // FLAG ITEM FOR REVIEW
    async flagItemForReview(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id
            const { note } = req.body

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!itemId)
                return BaseService.sendFailedResponse({
                    error: 'Item ID is required',
                })
            if (!note)
                return BaseService.sendFailedResponse({
                    error: 'A note is required when flagging an item',
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in sort & pretreat stage',
                })

            const item = order.items.id(itemId)
            if (!item)
                return BaseService.sendFailedResponse({
                    error: 'Item not found in order',
                })

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: {
                        'items.$.flaggedForReview': true,
                        'items.$.flagNote': note,
                    },
                    $push: {
                        'items.$.actionLog': {
                            action: 'flagged',
                            note,
                            timestamp: new Date(),
                        },
                    },
                },
            )

            await ActivityModel.create({
                title: 'Item Flagged for Review',
                description: `Item ${itemId} on order ${order.oscNumber} was flagged by ${user.fullName}. Reason: ${note}`,
                type: ACTIVITY_TYPE.ORDER_FLAGGED,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({
                message: 'Item flagged for review successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to flag item for review',
            })
        }
    }

    //SEND ORDER TO NEXT STAGE
    async sendToNextStage(req) {
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
                'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in sort & pretreat stage',
                })

            const allItemsSorted = order.items.every(
                (i) => i.sortStatus === 'complete',
            )
            const allItemsPretreated = order.items.every(
                (i) => i.pretreatStatus === 'complete',
            )

            if (!allItemsSorted || !allItemsPretreated) {
                return BaseService.sendFailedResponse({
                    error: 'All items must be marked as sorted and pretreated before sending to the next stage',
                })
            }

            // Determine next ORDER_STATUS and matching STATION_STATUS
            const isIroningOnly =
                order.serviceType === ORDER_SERVICE_TYPE.IRONING_ONLY

            const nextOrderStatus = isIroningOnly
                ? ORDER_STATUS.IRONING
                : ORDER_STATUS.WASHING
            const nextStationStatus = isIroningOnly
                ? STATION_STATUS.PRESSING_AND_IRONING_STATION
                : STATION_STATUS.WASH_AND_DRY_STATION

            const now = new Date()

            order.stage.status = nextOrderStatus
            order.stage.note = ''
            order.stage.updatedAt = now

            order.stageHistory.push({
                status: nextOrderStatus,
                note: `Moved to ${nextOrderStatus} by ${user.fullName}`,
                updatedAt: now,
            })

            order.stationStatus = nextStationStatus

            await order.save()

            await ActivityModel.create({
                title: 'Order Moved to Next Stage',
                description: `Order ${order.oscNumber} moved from Sort & Pretreat to ${nextOrderStatus} by ${user.fullName}.`,
                type: ACTIVITY_TYPE.ORDER_STATUS_UPDATED,
                orderId: order._id,
                userId,
            })
            await NotificationModel.create({
                userId,
                title: isIroningOnly
                    ? 'Your order is being ironed'
                    : 'Your order is being washed',
                body: isIroningOnly
                    ? `Order ${order.oscNumber} has been sorted and is now being ironed.`
                    : `Order ${order.oscNumber} has been sorted and is now in the wash.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: isIroningOnly
                    ? NOTIFICATION_TYPE.ORDER_IRONING
                    : NOTIFICATION_TYPE.ORDER_WASHING,
            })

            return BaseService.sendSuccessResponse({
                message: `Order ${order.oscNumber} successfully sent to ${nextOrderStatus}`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to send order to next stage',
            })
        }
    }

    // GET FLAGGED ORDERS
    // async getFlaggedOrders(req) {
    //     try {
    //         const userId = req.user.id

    //         const user = await UserModel.findById(userId)
    //         if (!user) {
    //             return BaseService.sendFailedResponse({
    //                 error: 'User not found',
    //             })
    //         }

    //         const { page = 1, limit = 20, search = '' } = req.query

    //         const query = { 'stage.status': ORDER_STATUS.HOLD }

    //         if (search) {
    //             query.$or = [
    //                 { oscNumber: { $regex: search, $options: 'i' } },
    //                 { fullName: { $regex: search, $options: 'i' } },
    //                 { phoneNumber: { $regex: search, $options: 'i' } },
    //             ]
    //         }

    //         const { data, pagination } = await paginate(BookOrderModel, query, {
    //             page,
    //             limit,
    //             sort: { updatedAt: -1 },
    //             select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stageHistory createdAt updatedAt',
    //             lean: true,
    //         })

    //         return BaseService.sendSuccessResponse({
    //             message: {
    //                 data,
    //                 pagination,
    //             },
    //         })
    //     } catch (error) {
    //         console.log(error)
    //         return BaseService.sendFailedResponse({
    //             error: 'Failed to fetch flagged orders',
    //         })
    //     }
    // }

    async getFlaggedOrders(req) {
        try {
            const userId = req.user.id

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const { page = 1, limit = 20, search = '' } = req.query

            const query = {
                items: { $elemMatch: { flaggedForReview: true } },
            }

            if (search) {
                query.$or = [
                    { oscNumber: { $regex: search, $options: 'i' } },
                    { fullName: { $regex: search, $options: 'i' } },
                    { phoneNumber: { $regex: search, $options: 'i' } },
                ]
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { updatedAt: -1 },
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stageHistory items createdAt updatedAt',
                lean: true,
            })

            const ordersWithFlagCount = data.map((order) => ({
                ...order,
                flaggedItemCount: order.items.filter(
                    (i) => i.flaggedForReview === true,
                ).length,
            }))

            return BaseService.sendSuccessResponse({
                message: {
                    data: ordersWithFlagCount,
                    pagination,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch flagged orders',
            })
        }
    }

    async getFlaggedOrderDetail(req) {
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

                items: { $elemMatch: { flaggedForReview: true } },
            }).lean()

            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or has no flagged items',
                })

            const flaggedItems = order.items.filter(
                (i) => i.flaggedForReview === true,
            )

            return BaseService.sendSuccessResponse({
                message: {
                    order,
                    flaggedItems,
                    flaggedItemCount: flaggedItems.length,
                },
            })
        } catch (error) {
            console.log(error)

            return BaseService.sendFailedResponse({
                error: 'Failed to fetch flagged order detail',
            })
        }
    }

    // GET SORTED & PRETREATED ORDERS LIST
    async getSortedAndPretreatdOrders(req) {
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
            const skip = (Number(page) - 1) * Number(limit)

            const query = {
                'stageHistory.status': ORDER_STATUS.SORT_AND_PRETREAT,
                'stage.status': {
                    $nin: [
                        ORDER_STATUS.SORT_AND_PRETREAT,
                        ORDER_STATUS.HOLD,
                        ORDER_STATUS.QUEUE,
                        ORDER_STATUS.PENDING,
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

            const [orders, total] = await Promise.all([
                BookOrderModel.find(query)
                    .sort({ updatedAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .lean(),
                BookOrderModel.countDocuments(query),
            ])

            return BaseService.sendSuccessResponse({
                message: {
                    orders,
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
                error: 'Failed to fetch sorted orders',
            })
        }
    }

    async getSortedOrderDetail(req) {
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

                'stageHistory.status': ORDER_STATUS.SORT_AND_PRETREAT,
            }).lean()

            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            const allItemsSorted = order.items.every(
                (i) => i.sortStatus === 'complete',
            )

            const allItemsPretreated = order.items.every(
                (i) => i.pretreatStatus === 'complete',
            )

            return BaseService.sendSuccessResponse({
                message: { order, allItemsSorted, allItemsPretreated },
            })
        } catch (error) {
            console.log(error)

            return BaseService.sendFailedResponse({
                error: 'Failed to fetch sorted order detail',
            })
        }
    }
    //GET ORDERS IN WASHING STAGE
    async getWashingOrders(req) {
        try {
            const userId = req.user.id

            const user = await UserModel.findById(userId)
            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const { page = 1, limit = 20, search = '' } = req.query

            const query = { 'stage.status': ORDER_STATUS.WASHING }

            if (search) {
                query.$or = [
                    { oscNumber: { $regex: search, $options: 'i' } },
                    { fullName: { $regex: search, $options: 'i' } },
                    { phoneNumber: { $regex: search, $options: 'i' } },
                ]
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { updatedAt: -1 },
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stageHistory createdAt updatedAt',
                lean: true,
            })

            return BaseService.sendSuccessResponse({
                message: {
                    data,
                    pagination,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch washing orders',
            })
        }
    }

    // GET SINGLE ORDER DETAILS (WASHING VIEW)
    async getWashingOrderDetails(req) {
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
                'stage.status': ORDER_STATUS.WASHING,
            }).lean()
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not currently in washing stage',
                })

            return BaseService.sendSuccessResponse({ message: { order } })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch order details',
            })
        }
    }

    // GET ORDERS IN IRONING STAGE
    async getIroningOrders(req) {
        try {
            const userId = req.user.id

            const user = await UserModel.findById(userId)
            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const { page = 1, limit = 20, search = '' } = req.query

            const query = { 'stage.status': ORDER_STATUS.IRONING }

            if (search) {
                query.$or = [
                    { oscNumber: { $regex: search, $options: 'i' } },
                    { fullName: { $regex: search, $options: 'i' } },
                    { phoneNumber: { $regex: search, $options: 'i' } },
                ]
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { updatedAt: -1 },
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stageHistory createdAt updatedAt',
                lean: true,
            })

            return BaseService.sendSuccessResponse({
                message: {
                    data,
                    pagination,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch ironing orders',
            })
        }
    }

    //GET SINGLE ORDER DETAILS (IRONING VIEW)
    async getIroningOrderDetails(req) {
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
                'stage.status': ORDER_STATUS.IRONING,
            }).lean()
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not currently in ironing stage',
                })

            return BaseService.sendSuccessResponse({ message: { order } })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch order details',
            })
        }
    }

    //GET HISTORY LIST
    async getHistoryList(req) {
        try {
            const userId = req.user.id

            const user = await UserModel.findById(userId)
            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const {
                page = 1,
                limit = 20,
                search = '',
                startDate,
                endDate,
            } = req.query

            const query = {
                'stageHistory.status': ORDER_STATUS.SORT_AND_PRETREAT,
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
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stageHistory createdAt updatedAt',
                lean: true,
            })

            return BaseService.sendSuccessResponse({
                message: {
                    data,
                    pagination,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch history list',
            })
        }
    }

    //GET ORDER TIMELINE
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
                    key: 'washing',
                    label: 'Washing',
                    status: ORDER_STATUS.WASHING,
                },
                {
                    key: 'ironed',
                    label: 'Ironed',
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

            // Build status → earliest timestamp lookup from stageHistory
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
                    timestamp: timestamp || null,
                }
            })

            // Per-item granular audit trail
            const itemTimeline = []
            for (const item of order.items || []) {
                for (const log of item.actionLog || []) {
                    itemTimeline.push({
                        itemId: item._id,
                        itemType: item.type,
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
                        serviceType: order.serviceType,
                        serviceTier: order.serviceTier,
                        amount: order.amount,
                        stage: order.stage,
                        stationStatus: order.stationStatus,
                        trackingStatus,
                        items: order.items,
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

    async sendToHold(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id
            const { reason, assignTo } = req.body

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!itemId)
                return BaseService.sendFailedResponse({
                    error: 'Item ID is required',
                })
            if (!reason)
                return BaseService.sendFailedResponse({
                    error: 'A reason is required',
                })
            if (!assignTo)
                return BaseService.sendFailedResponse({
                    error: 'An assignee is required',
                })

            const allowedReasons = ['item_missing', 'item_mismatched']

            const stationMap = {
                [ROLE.ADMIN]: STATION_STATUS.ADMIN_STATION,
                [ROLE.INTAKE_AND_TAG]: STATION_STATUS.INTAKE_AND_TAG_STATION,
            }

            if (!allowedReasons.includes(reason)) {
                return BaseService.sendFailedResponse({
                    error: `reason must be one of: ${allowedReasons.join(', ')}`,
                })
            }
            if (!stationMap[assignTo]) {
                return BaseService.sendFailedResponse({
                    error: `assignTo must be one of: ${Object.keys(stationMap).join(', ')}`,
                })
            }

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.SORT_AND_PRETREAT,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in sort & pretreat stage',
                })

            const item = order.items.id(itemId)
            if (!item)
                return BaseService.sendFailedResponse({
                    error: 'Item not found in order',
                })

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: {
                        'items.$.flaggedForReview': true,
                        'items.$.flagNote': reason,
                        'items.$.holdDetails.reason': reason,
                        'items.$.holdDetails.assignTo': assignTo,
                        'items.$.holdDetails.heldAt': new Date(),
                        'items.$.holdDetails.heldByOperatorId': userId,
                        'items.$.holdDetails.heldByStation':
                            STATION_STATUS.SORT_AND_PRETREAT_STATION,
                    },
                    $push: {
                        'items.$.actionLog': {
                            action: 'item_held',
                            note: `Reason: ${reason}, Assigned to: ${assignTo}`,
                            timestamp: new Date(),
                        },
                    },
                },
            )

            await BookOrderModel.updateOne(
                { _id: orderId },
                buildStageUpdate(
                    ORDER_STATUS.HOLD,
                    stationMap[assignTo],
                    reason,
                ),
            )

            await ActivityModel.create({
                title: 'Item Placed on Hold',
                description: `Item ${item.type} (Tag: ${item.tagId || itemId}) on order ${order.oscNumber} placed on hold by ${user.fullName}. Reason: ${reason}. Assigned to: ${assignTo}`,
                type: ACTIVITY_TYPE.ORDER_ON_HOLD,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({
                message: 'Item placed on hold successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to place item on hold',
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
                    { stationStatus: STATION_STATUS.SORT_AND_PRETREAT_STATION },
                    {
                        'items.holdDetails.heldByStation':
                            STATION_STATUS.SORT_AND_PRETREAT_STATION,
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
                    select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stationStatus stageHistory items createdAt updatedAt',
                    lean: true,
                },
            )

            const holdItems = data.map((order) => {
                const assignedToUs =
                    order.stationStatus ===
                    STATION_STATUS.SORT_AND_PRETREAT_STATION
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

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.HOLD,
                stationStatus: STATION_STATUS.SORT_AND_PRETREAT_STATION,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not on hold at this station',
                })

            // stamp releasedAt and releasedByOperatorId on all held items
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
                            ORDER_STATUS.SORT_AND_PRETREAT,
                            STATION_STATUS.SORT_AND_PRETREAT_STATION,
                            'Released from hold',
                        ).$set,
                    },
                },
            )

            await ActivityModel.create({
                title: 'Order Released from Hold',
                description: `Order ${order.oscNumber} released from hold and returned to sort & pretreat queue by ${user.fullName}`,
                type: ACTIVITY_TYPE.ORDER_RELEASED_FROM_HOLD,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({
                message:
                    'Order released from hold and returned to sort & pretreat queue',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to release order from hold',
            })
        }
    }
}

module.exports = new SortAndPretreatService()
