const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const ActivityModel = require('../models/activity.model')
const {
    ORDER_STATUS,
    STATION_STATUS,
    ACTIVITY_TYPE,
    ROLE,
    DELIVERY_STATUS,
    PICKUP_STATUS,
    PRESS_DURATION_MINUTES,
    ORDER_SERVICE_TYPE,
} = require('../util/constants')
const BaseService = require('./base.service')
const paginate = require('../util/paginate')
const { buildStageUpdate, getObjectId } = require('../util/helper')
const updateOrderItemsStage = require('../util/updateOrderItemsStage')
const createAuditLog = require('../util/createAuditLog')

class PressAndIronService extends BaseService {
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

            const [pressQueue, activePress, completedToday, recentQueueResult] =
                await Promise.all([
                    BookOrderModel.countDocuments({
                        'stage.status': ORDER_STATUS.IRONING,
                        'items.pressConfirmedAt': { $exists: false },
                    }),
                    BookOrderModel.countDocuments({
                        'stage.status': ORDER_STATUS.IRONING,
                        'pressDetails.startedAt': { $exists: true },
                        'pressDetails.completedAt': { $exists: false },
                    }),
                    BookOrderModel.countDocuments({
                        'pressDetails.completedAt': { $gte: startOfToday },
                        'stage.status': ORDER_STATUS.QC,
                    }),
                    paginate(
                        BookOrderModel,
                        { 'stage.status': ORDER_STATUS.IRONING },
                        {
                            page: 1,
                            limit: 5,
                            sort: { 'stage.updatedAt': 1 },
                            select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage stationStatus createdAt pressDetails',
                            lean: true,
                        },
                    ),
                ])

            return BaseService.sendSuccessResponse({
                message: {
                    data: { pressQueue, activePress, completedToday },
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

    async getPressQueue(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

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
                sort: { 'stage.updatedAt': 1 },
                select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage stationStatus createdAt pressDetails',
                lean: true,
            })

            const ordersWithMeta = data.map((o) => ({
                ...o,
                flaggedItemCount: (o.items || []).filter(
                    (i) => i.flaggedForReview,
                ).length,
                allItemsConfirmed: (o.items || []).every(
                    (i) => i.pressStatus === 'complete',
                ),
                confirmedItemCount: (o.items || []).filter(
                    (i) => i.pressStatus === 'complete',
                ).length,
            }))

            return BaseService.sendSuccessResponse({
                message: { data: ordersWithMeta, pagination },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch press queue',
            })
        }
    }

    async getPressQueueOrderDetails(req) {
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
                    error: 'Order not found or not in ironing stage',
                })

            const allItemsConfirmed = order.items.every(
                (i) => i.pressStatus === 'complete',
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

    async confirmItemForPressing(req) {
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
                'stage.status': ORDER_STATUS.IRONING,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in ironing stage',
                })

            const { updatedCount, allItemsCompleted } =
                await updateOrderItemsStage({
                    order,
                    orderId,
                    userId,
                    itemIds,
                    allItems,
                    statusField: 'pressStatus',
                    completedValue: 'complete',
                    timestampField: 'pressConfirmedAt',
                    operatorField: 'pressConfirmedByOperatorId',
                    actionName: 'press_confirmed',
                    actionNote:
                        'Item confirmed as present and ready for pressing or ironing',
                    orderStartedAtField: 'pressDetails.startedAt',
                    orderOperatorField: 'pressDetails.operatorId',
                    stationStatus: STATION_STATUS.PRESSING_AND_IRONING_STATION,
                    completionCheck: (item) => item.pressStatus === 'complete',
                })

            await ActivityModel.create({
                title: 'Item(s) Confirmed for Pressing',
                description: `${updatedCount} item(s) on order ${order.oscNumber} confirmed for pressing`,
                type: ACTIVITY_TYPE.ORDER_ITEM_PRESS_CONFIRMED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            await createAuditLog({userId: getObjectId(userId), action: `${updatedCount} item(s) confirmed for pressing on order ${order.oscNumber}`, category: 'pressing', orderId: order._id})
            return BaseService.sendSuccessResponse({
                message: {
                    message: `${updatedCount} item(s) confirmed for pressing`,
                    allItemsConfirmed: allItemsCompleted,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to confirm item(s) for pressing',
            })
        }
    }

    // UNDO ITEM(S) PRESS CONFIRMATION
    async undoConfirmItemForPressing(req) {
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
                'stage.status': ORDER_STATUS.IRONING,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in ironing stage',
                })

            const now = new Date()

            const targetItems = allItems
                ? order.items.filter((item) => item.pressStatus === 'complete')
                : order.items.filter(
                      (item) =>
                          itemIds.includes(item._id.toString()) &&
                          item.pressStatus === 'complete',
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
                            $set: { 'items.$.pressStatus': 'pending' },
                            $push: {
                                'items.$.actionLog': {
                                    action: 'undo_press_confirmed',
                                    note: '',
                                    timestamp: now,
                                },
                            },
                        },
                    },
                })),
            )

            // Only clear pressDetails if no items remain confirmed
            const updatedOrder = await BookOrderModel.findById(orderId).lean()
            const anyStillConfirmed = updatedOrder.items.some(
                (i) => i.pressStatus === 'complete',
            )

            if (!anyStillConfirmed && updatedOrder.pressDetails?.startedAt) {
                await BookOrderModel.updateOne(
                    { _id: orderId },
                    {
                        $unset: {
                            'pressDetails.startedAt': '',
                            'pressDetails.operatorId': '',
                        },
                    },
                )
            }
            await createAuditLog({userId: getObjectId(userId), action: `${targetItems.length} item(s) press confirmation undone on order ${order.oscNumber}`, category: 'pressing', orderId: order._id})

            return BaseService.sendSuccessResponse({
                message: `${targetItems.length} item(s) press confirmation undone`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to undo item press confirmation',
            })
        }
    }

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
                [ROLE.WASH_AND_DRY]: STATION_STATUS.WASH_AND_DRY_STATION,
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
                'stage.status': ORDER_STATUS.IRONING,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in ironing stage',
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
                            STATION_STATUS.PRESSING_AND_IRONING_STATION,
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

            await createAuditLog({userId: getObjectId(userId), action: `Item ${item.type} (Tag: ${item.tagId || itemId}) on order ${order.oscNumber} placed on hold. Reason: ${reason}. Assigned to: ${assignTo}`, category: 'pressing', orderId: order._id})

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

    async getActivePress(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const { page = 1, limit = 20 } = req.query

            const query = {
                'stage.status': ORDER_STATUS.IRONING,
                'pressDetails.startedAt': { $exists: true },
                'pressDetails.completedAt': { $exists: false },
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { 'pressDetails.startedAt': 1 },
                select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage stationStatus createdAt pressDetails',
                lean: true,
            })

            const ordersWithMeta = data.map((order) => {
                const startedAt = order.pressDetails?.startedAt
                const durationMinutes =
                    PRESS_DURATION_MINUTES[order.serviceTier] ?? 30
                const estimatedFinish = startedAt
                    ? new Date(
                          new Date(startedAt).getTime() +
                              durationMinutes * 60 * 1000,
                      )
                    : null

                return {
                    ...order,
                    itemCount: (order.items || []).length,
                    pressDetails: {
                        ...order.pressDetails,
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
                error: 'Failed to fetch active press orders',
            })
        }
    }

    async pressDone(req) {
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
                'pressDetails.startedAt': { $exists: true },
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not currently being pressed',
                })

            const now = new Date()

            await BookOrderModel.updateOne(
                { _id: orderId },
                {
                    $set: {
                        'stage.status': ORDER_STATUS.QC,
                        'stage.note': '',
                        'stage.updatedAt': now,
                        stationStatus: STATION_STATUS.QC_STATION,
                        'pressDetails.completedAt': now,
                    },
                    $push: {
                        stageHistory: {
                            status: ORDER_STATUS.QC,
                            note: '',
                            updatedAt: now,
                        },
                    },
                },
            )

            await ActivityModel.create({
                title: 'Pressing Completed',
                description: `Order ${order.oscNumber} pressing has been completed and sent to QC`,
                type: ACTIVITY_TYPE.ORDER_PRESS_COMPLETED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })
            await createAuditLog({userId: getObjectId(userId), action: `Order ${order.oscNumber} pressing completed and sent to QC`, category: 'pressing', orderId: order._id})

            return BaseService.sendSuccessResponse({
                message: `Order ${order.oscNumber} has been successfully processed and sent to QC`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to complete pressing',
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
                    {
                        stationStatus:
                            STATION_STATUS.PRESSING_AND_IRONING_STATION,
                    },
                    {
                        'items.holdDetails.heldByStation':
                            STATION_STATUS.PRESSING_AND_IRONING_STATION,
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
                    select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage stationStatus stageHistory pressDetails createdAt updatedAt',
                    populate: {
                        path: 'pressDetails.operatorId',
                        select: 'fullName',
                    },
                    lean: true,
                },
            )

            const holdItems = data.map((order) => {
                const assignedToUs =
                    order.stationStatus ===
                    STATION_STATUS.PRESSING_AND_IRONING_STATION
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
                    operator: order.pressDetails?.operatorId?.fullName || null,
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
                    {
                        stationStatus:
                            STATION_STATUS.PRESSING_AND_IRONING_STATION,
                    },
                    { 'items.holdDetails.assignTo': ROLE.PRESS },
                ],
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not on hold at this station',
                })

            const now = new Date()
            const updatedItems = order.items.map((item) => {
                if (item.holdDetails?.assignTo === ROLE.PRESS) {
                    item.holdDetails.releasedAt = now
                    item.holdDetails.releasedByOperatorId = userId
                    item.holdDetails.assignTo = null
                    // ✅ reset press status so item can be worked on again
                    item.pressStatus = 'pending'
                    item.pressConfirmedAt = null
                    item.pressConfirmedByOperatorId = null
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
                            ORDER_STATUS.IRONING,
                            STATION_STATUS.PRESSING_AND_IRONING_STATION,
                            'Released from hold',
                        ).$set,
                    },
                    // ✅ $unset is a sibling of $set, not inside it
                    $unset: {
                        'pressDetails.startedAt': '',
                        'pressDetails.completedAt': '',
                        'pressDetails.operatorId': '',
                    },
                    $push: {
                        stageHistory: {
                            status: ORDER_STATUS.IRONING,
                            note: 'Released from hold',
                            updatedAt: now,
                        },
                    },
                },
                { runValidators: false },
            )

            await ActivityModel.create({
                title: 'Order Released from Hold',
                description: `Order ${order.oscNumber} released from hold and returned to press queue by ${user.fullName}`,
                type: ACTIVITY_TYPE.ORDER_RELEASED_FROM_HOLD,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })
            await createAuditLog({userId: getObjectId(userId), action: `Order ${order.oscNumber} released from hold and returned to press queue`, category: 'pressing', orderId: order._id})

            return BaseService.sendSuccessResponse({
                message: 'Order released from hold and returned to press queue',
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
                'stageHistory.status': ORDER_STATUS.IRONING,
                'stage.status': {
                    $nin: [ORDER_STATUS.IRONING], // ← removed HOLD
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
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stationStatus stageHistory pressDetails createdAt updatedAt',
                lean: true,
            })

            const startOfToday = new Date()
            startOfToday.setHours(0, 0, 0, 0)

            const today = []
            const earlier = []

            for (const order of data) {
                const completedAt =
                    order.pressDetails?.completedAt ||
                    order.stageHistory?.find(
                        (h) => h.status === ORDER_STATUS.QC,
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

module.exports = new PressAndIronService()
