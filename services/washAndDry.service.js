const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const ActivityModel = require('../models/activity.model')
const {
    ORDER_STATUS,
    ORDER_SERVICE_TYPE,
    STATION_STATUS,
    ACTIVITY_TYPE,
    ROLE,
    WASH_DURATION_MINUTES,
    NOTIFICATION_TYPE,
    DELIVERY_STATUS,
    PICKUP_STATUS,
    DRY_DURATION_MINUTES,
} = require('../util/constants')
const { buildStageUpdate } = require('../util/helper')
const BaseService = require('./base.service')
const paginate = require('../util/paginate')
const NotificationModel = require('../models/notification.model')
const createNotification = require('../util/createNotification')
const updateOrderItemsStage = require('../util/updateOrderItemsStage')
const createAuditLog = require('../util/createAuditLog')

class WashAndDryService extends BaseService {
    // GET DASHBOARD STATS
    async getDashboard(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const startOfToday = new Date()
            startOfToday.setHours(0, 0, 0, 0)

            const [
                washQueue,
                activeWash,
                activeDry,
                completedToday,
                recentQueueResult,
            ] = await Promise.all([
                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.WASHING,
                    'washDetails.startedAt': { $exists: false },
                }),

                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.WASHING,
                    'washDetails.startedAt': { $exists: true },
                    'washDetails.movedToDryingAt': { $exists: false },
                }),

                // Orders currently in drying stage
                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.DRYING,
                }),

                BookOrderModel.countDocuments({
                    'washDetails.dryingCompletedAt': { $gte: startOfToday },
                    'stage.status': {
                        $nin: [ORDER_STATUS.WASHING, ORDER_STATUS.DRYING],
                    },
                }),

                paginate(
                    BookOrderModel,
                    { 'stage.status': ORDER_STATUS.WASHING },
                    {
                        page: 1,
                        limit: 5,
                        sort: { 'stage.updatedAt': 1 },
                        select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage createdAt washDetails',
                        lean: true,
                    },
                ),
            ])

            return BaseService.sendSuccessResponse({
                message: {
                    stats: {
                        washQueue,
                        activeWash,
                        activeDry,
                        completedToday,
                    },
                    recentQueue: recentQueueResult.data,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch dashboard',
            })
        }
    }

    // GET WASH QUEUE
    async getWashQueue(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

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
                sort: { 'stage.updatedAt': 1 },
                select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage stationStatus createdAt washDetails',
                lean: true,
            })

            const ordersWithMeta = data.map((o) => ({
                ...o,
                flaggedItemCount: (o.items || []).filter(
                    (i) => i.flaggedForReview,
                ).length,
                allItemsConfirmed: (o.items || []).every(
                    (i) => i.washStatus === 'complete',
                ),
                confirmedItemCount: (o.items || []).filter(
                    (i) => i.washStatus === 'complete',
                ).length,
            }))

            return BaseService.sendSuccessResponse({
                message: {
                    data: ordersWithMeta,
                    pagination,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch wash queue',
            })
        }
    }

    // GET WASH QUEUE ORDER DETAILS
    async getWashQueueOrderDetails(req) {
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
                    error: 'Order not found or not in washing stage',
                })

            const allItemsConfirmed = order.items.every(
                (i) => i.washStatus === 'complete',
            )

            return BaseService.sendSuccessResponse({
                message: { order, allItemsConfirmed },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch order details',
            })
        }
    }

    //CONFIRM ITEM FOR WASHING

    async confirmItemForWashing(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id
            const { itemIds = [], allItems = false } = req.body

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!allItems && !itemIds.length)
                return BaseService.sendFailedResponse({
                    error: 'Provide itemIds or set allItems to true',
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.WASHING,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in washing stage',
                })

            const { updatedCount, allItemsCompleted } =
                await updateOrderItemsStage({
                    order,
                    orderId,
                    userId,
                    itemIds,
                    allItems,
                    statusField: 'washStatus',
                    completedValue: 'complete',
                    timestampField: 'washConfirmedAt',
                    operatorField: 'washConfirmedByOperatorId',
                    actionName: 'wash_confirmed',
                    actionNote:
                        'Item confirmed as present and ready for washing',
                    orderStartedAtField: 'washDetails.startedAt',
                    orderOperatorField: 'washDetails.operatorId',
                    stationStatus: STATION_STATUS.WASH_AND_DRY_STATION,
                    completionCheck: (item) => item.washStatus === 'complete',
                })

            await ActivityModel.create({
                title: 'Item(s) Confirmed for Washing',
                description: `${updatedCount} item(s) on order ${order.oscNumber} confirmed for washing`,
                type: ACTIVITY_TYPE.ORDER_ITEM_WASH_CONFIRMED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            await createNotification({
                userId,
                title: 'Item(s) Confirmed for Washing',
                body: `${updatedCount} item(s) confirmed for washing`,
                type: NOTIFICATION_TYPE.ORDER_WASHING,
            })
            await createAuditLog({
                userId,
                orderId,
                category: 'wash',
                action: `${updatedCount} item(s) confirmed for washing`,
            })

            return BaseService.sendSuccessResponse({
                message: {
                    message: `${updatedCount} item(s) confirmed for washing`,
                    allItemsConfirmed: allItemsCompleted,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to confirm item(s) for washing',
            })
        }
    }
    // UNDO ITEM(S) WASH CONFIRMATION

    async undoConfirmItemForWashing(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id
            const { itemIds = [], allItems = false } = req.body

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!allItems && !itemIds.length)
                return BaseService.sendFailedResponse({
                    error: 'Provide itemIds or set allItems to true',
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.WASHING,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in washing stage',
                })

            const now = new Date()

            const targetItems = allItems
                ? order.items.filter((item) => item.washStatus === 'complete')
                : order.items.filter(
                      (item) =>
                          itemIds.includes(item._id.toString()) &&
                          item.washStatus === 'complete',
                  )

            if (!targetItems.length)
                return BaseService.sendFailedResponse({
                    error: 'No confirmed items found to undo',
                })

            await BookOrderModel.bulkWrite(
                targetItems.map((item) => ({
                    updateOne: {
                        filter: { _id: orderId, 'items._id': item._id },
                        update: {
                            $set: {
                                'items.$.washStatus': 'pending',
                                'items.$.washConfirmedAt': null,
                                'items.$.washConfirmedByOperatorId': null,
                            },
                            $push: {
                                'items.$.actionLog': {
                                    action: 'undo_wash_confirmed',
                                    note: '',
                                    timestamp: now,
                                },
                            },
                        },
                    },
                })),
            )

            // Only clear order-level wash fields if no items remain confirmed
            const updatedOrder = await BookOrderModel.findById(orderId).lean()
            const anyStillConfirmed = updatedOrder.items.some(
                (i) => i.washStatus === 'complete',
            )

            if (!anyStillConfirmed) {
                await BookOrderModel.updateOne(
                    { _id: orderId },
                    {
                        $set: {
                            'washDetails.startedAt': null,
                            'washDetails.operatorId': null,
                            stationStatus:
                                STATION_STATUS.SORT_AND_PRETREAT_STATION,
                        },
                    },
                )
            }

            await createNotification({
                userId,
                title: 'Item Wash Confirmation Undone',
                body: `${targetItems.length} item(s) wash confirmation has been undone`,
                type: NOTIFICATION_TYPE.ORDER_WASHING,
            })
            await createAuditLog({
                userId,
                orderId,
                category: 'wash',
                action: `${targetItems.length} item(s) wash confirmation undone`,
            })

            return BaseService.sendSuccessResponse({
                message: `${targetItems.length} item(s) wash confirmation undone`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to undo item wash confirmation',
            })
        }
    }

    // SEND ITEM TO HOLD
    async sendToHold(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id
            const { reason, assignTo, note = '' } = req.body

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

            // const allowedReasons = ['item_missing', 'item_mismatched']

            const stationMap = {
                [ROLE.ADMIN]: STATION_STATUS.ADMIN_STATION,
                [ROLE.SORT_AND_PRETREAT]:
                    STATION_STATUS.SORT_AND_PRETREAT_STATION,
                [ROLE.INTAKE_AND_TAG]: STATION_STATUS.INTAKE_AND_TAG_STATION,
            }

            if (!reason || !reason.trim())
                return BaseService.sendFailedResponse({
                    error: 'A reason is required',
                })
            // if (!allowedReasons.includes(reason))
            //     return BaseService.sendFailedResponse({
            //         error: `reason must be one of: ${allowedReasons.join(', ')}`,
            //     })

            if (!stationMap[assignTo])
                return BaseService.sendFailedResponse({
                    error: `assignTo must be one of: ${Object.keys(stationMap).join(', ')}`,
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.WASHING,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in washing stage',
                })

            const item = order.items.id(itemId)
            if (!item)
                return BaseService.sendFailedResponse({
                    error: 'Item not found in order',
                })

            const holdNote = note ? `${reason}: ${note}` : reason

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: {
                        'items.$.flaggedForReview': true,
                        'items.$.flagNote': holdNote,
                        'items.$.holdDetails.reason': reason,
                        'items.$.holdDetails.note': note,
                        'items.$.holdDetails.assignTo': assignTo,
                        'items.$.holdDetails.heldAt': new Date(),
                        'items.$.holdDetails.heldByOperatorId': userId,
                        'items.$.holdDetails.heldByStation':
                            STATION_STATUS.WASH_AND_DRY_STATION,
                    },
                    $push: {
                        'items.$.actionLog': {
                            action: 'item_held',
                            note: holdNote,
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
                    holdNote,
                ),
            )

            await ActivityModel.create({
                title: 'Item Placed on Hold',
                description: `Item ${item.type} (Tag: ${item.tagId || itemId}) on order ${order.oscNumber} placed on hold by ${user.fullName}. Reason: ${reason}.${note ? ` Note: ${note}.` : ''} Assigned to: ${assignTo}`,
                type: ACTIVITY_TYPE.ORDER_ON_HOLD,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            await createNotification({
                userId,
                title: 'Item Placed on Hold',
                body: `An item has been placed on hold. Reason: ${reason}.${note ? ` Note: ${note}.` : ''} Assigned to: ${assignTo}`,
                type: NOTIFICATION_TYPE.ORDER_WASHING,
            })
            await createAuditLog({
                userId,
                orderId,
                category: 'wash',
                action: `Item ${item.type} (Tag: ${item.tagId || itemId}) placed on hold for reason: ${reason}, assigned to ${assignTo}`,
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

    //GET ACTIVE WASH
    async getActiveWash(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const { page = 1, limit = 20 } = req.query

            const query = {
                'stage.status': ORDER_STATUS.WASHING,
                'washDetails.startedAt': { $exists: true },
                'washDetails.movedToDryingAt': { $exists: false },
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { 'washDetails.startedAt': 1 },
                select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage stationStatus createdAt washDetails',
                lean: true,
            })

            const ordersWithMeta = data.map((order) => {
                const startedAt = order.washDetails?.startedAt
                const durationMinutes =
                    WASH_DURATION_MINUTES[order.deliverySpeed] ?? 60
                const estimatedFinish = startedAt
                    ? new Date(
                          new Date(startedAt).getTime() +
                              durationMinutes * 60 * 1000,
                      )
                    : null

                return {
                    ...order,
                    itemCount: (order.items || []).length,
                    washDetails: {
                        ...order.washDetails,
                        estimatedFinish,
                        durationMinutes,
                    },
                }
            })

            return BaseService.sendSuccessResponse({
                message: { data: ordersWithMeta, pagination },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch active wash orders',
            })
        }
    }

    // MOVE TO DRYING
    async moveToDrying(req) {
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
                'washDetails.startedAt': { $exists: true },
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not currently being washed',
                })

            const now = new Date()

            await BookOrderModel.updateOne(
                { _id: orderId },
                {
                    $set: {
                        'stage.status': ORDER_STATUS.DRYING,
                        'stage.note': '',
                        'stage.updatedAt': now,
                        stationStatus: STATION_STATUS.WASH_AND_DRY_STATION,
                        'washDetails.movedToDryingAt': now,
                    },
                    $push: {
                        stageHistory: {
                            status: ORDER_STATUS.DRYING,
                            note: '',
                            updatedAt: now,
                        },
                    },
                },
            )

            await ActivityModel.create({
                title: 'Moved to Drying',
                description: `Order ${order.oscNumber} has been transferred to the dryer`,
                type: ACTIVITY_TYPE.ORDER_MOVED_TO_DRYING,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            createNotification({
                userId,
                title: 'Order Moved to Drying',
                body: `Order ${order.oscNumber} has been transferred to the dryer.`,
                type: NOTIFICATION_TYPE.ORDER_WASHING,
            })
            await createAuditLog({
                userId,
                orderId,
                category: 'wash',
                action: `Order moved to drying`,
            })

            return BaseService.sendSuccessResponse({
                message: `Order ${order.oscNumber} has been transferred to the dryer`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to move order to drying',
            })
        }
    }

    // GET ACTIVE DRY

    async getActiveDry(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const { page = 1, limit = 20 } = req.query

            const query = { 'stage.status': ORDER_STATUS.DRYING }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { 'washDetails.movedToDryingAt': 1 },
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stationStatus stageHistory washDetails createdAt updatedAt',
                lean: true,
            })
            const ordersWithMeta = data.map((order) => {
                const startedAt = order.washDetails?.movedToDryingAt
                const durationMinutes =
                    DRY_DURATION_MINUTES[order.deliverySpeed] ?? 30
                const estimatedFinish = startedAt
                    ? new Date(
                          new Date(startedAt).getTime() +
                              durationMinutes * 60 * 1000,
                      )
                    : null

                return {
                    ...order,
                    itemCount: (order.items || []).length,
                    washDetails: {
                        ...order.washDetails,
                        estimatedFinish,
                        durationMinutes,
                    },
                }
            })

            return BaseService.sendSuccessResponse({
                message: { data: ordersWithMeta, pagination },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch active dry orders',
            })
        }
    }

    // WASH & DRY DONE — SEND TO NEXT STAGE
    async washAndDryComplete(req) {
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
                'stage.status': ORDER_STATUS.DRYING,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in drying stage',
                })

            const now = new Date()
            const isWashOnly =
                order.serviceType === ORDER_SERVICE_TYPE.WASHING_ONLY
            const nextStatus = isWashOnly
                ? ORDER_STATUS.READY
                : ORDER_STATUS.IRONING
            const nextStation = isWashOnly
                ? STATION_STATUS.QC_STATION
                : STATION_STATUS.PRESSING_AND_IRONING_STATION

            await BookOrderModel.updateOne(
                { _id: orderId },
                {
                    $set: {
                        'stage.status': nextStatus,
                        'stage.note': '',
                        'stage.updatedAt': now,
                        stationStatus: nextStation,
                        'washDetails.dryingCompletedAt': now,
                    },
                    $push: {
                        stageHistory: {
                            status: nextStatus,
                            note: '',
                            updatedAt: now,
                        },
                    },
                },
            )

            await ActivityModel.create({
                title: 'Wash & Dry Completed',
                description: `Order ${order.oscNumber} wash and dry completed. Sent to ${nextStatus}`,
                type: ACTIVITY_TYPE.ORDER_WASH_DRY_COMPLETED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })
            await createNotification({
                userId,
                title: isWashOnly
                    ? 'Your order is getting ready'
                    : 'Your order is being ironed',
                body: isWashOnly
                    ? `Order ${order.oscNumber} has been washed and is now ready for ironing.`
                    : `Order ${order.oscNumber} has been washed and is now being ironed.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: isWashOnly
                    ? NOTIFICATION_TYPE.ORDER_WASHING
                    : NOTIFICATION_TYPE.ORDER_IRONING,
            })
            await createAuditLog({
                userId,
                orderId,
                category: 'wash',
                action: `Wash & dry completed, moved to ${nextStatus}`,
            })

            return BaseService.sendSuccessResponse({
                message: `Order ${order.oscNumber} has been successfully processed and sent to ${nextStatus}`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to complete wash & dry',
            })
        }
    }

    //GET HOLD QUEUE — scoped to wash & dry station only
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
                    { stationStatus: STATION_STATUS.WASH_AND_DRY_STATION },
                    {
                        'items.holdDetails.heldByStation':
                            STATION_STATUS.WASH_AND_DRY_STATION,
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
                        path: 'washDetails.operatorId',
                        select: 'fullName',
                    },
                    lean: true,
                },
            )

            const holdItems = data.map((order) => {
                const assignedToUs =
                    order.stationStatus === STATION_STATUS.WASH_AND_DRY_STATION
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

            // ✅ also match orders assigned from another station
            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.HOLD,
                $or: [
                    { stationStatus: STATION_STATUS.WASH_AND_DRY_STATION },
                    { 'items.holdDetails.assignTo': ROLE.WASH_AND_DRY },
                ],
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not on hold at this station',
                })

            const now = new Date()
            const updatedItems = order.items.map((item) => {
                if (item.holdDetails?.assignTo === ROLE.WASH_AND_DRY) {
                    item.holdDetails.releasedAt = now
                    item.holdDetails.releasedByOperatorId = userId
                    item.holdDetails.assignTo = null
                    // ✅ reset wash status so item can be worked on again
                    item.washStatus = 'pending'
                    item.washConfirmedAt = null
                    item.washConfirmedByOperatorId = null
                    item.flaggedForReview = false
                }
                return item
            })

            await BookOrderModel.updateOne(
                { _id: orderId },
                {
                    $set: {
                        items: updatedItems,
                        ...buildStageUpdate(
                            ORDER_STATUS.WASHING,
                            STATION_STATUS.WASH_AND_DRY_STATION,
                            'Released from hold',
                        ).$set,
                    },
                    $unset: {
                        'washDetails.startedAt': '',
                        'washDetails.movedToDryingAt': '',
                        'washDetails.dryingCompletedAt': '',
                        'washDetails.operatorId': '',
                    },
                    $push: {
                        stageHistory: {
                            status: ORDER_STATUS.WASHING,
                            note: 'Released from hold',
                            updatedAt: now,
                        },
                    },
                },
                { runValidators: false },
            )

            await ActivityModel.create({
                title: 'Order Released from Hold',
                description: `Order ${order.oscNumber} released from hold and returned to wash queue by ${user.fullName}`,
                type: ACTIVITY_TYPE.ORDER_RELEASED_FROM_HOLD,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })
            await createAuditLog({
                userId,
                orderId,
                category: 'wash',
                action: `Order released from hold and returned to wash queue`,
            })

            return BaseService.sendSuccessResponse({
                message: 'Order released from hold and returned to wash queue',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to release order from hold',
            })
        }
    }

    //GET HISTORY LIST
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
                'stageHistory.status': ORDER_STATUS.DRYING,
                'stage.status': {
                    $nin: [ORDER_STATUS.WASHING, ORDER_STATUS.DRYING],
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
                if (startDate)
                    query.createdAt.$gte = new Date(
                        new Date(startDate).setHours(0, 0, 0, 0),
                    )
                if (endDate)
                    query.createdAt.$lte = new Date(
                        new Date(endDate).setHours(23, 59, 59, 999),
                    )
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { updatedAt: -1 },
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stationStatus stageHistory washDetails createdAt updatedAt',
                lean: true,
            })

            const startOfToday = new Date()
            startOfToday.setHours(0, 0, 0, 0)

            const today = []
            const earlier = []

            for (const order of data) {
                const completedAt =
                    order.washDetails?.dryingCompletedAt ||
                    order.stageHistory?.find(
                        (h) => h.status === ORDER_STATUS.IRONING,
                    )?.updatedAt ||
                    order.updatedAt

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

module.exports = new WashAndDryService()
