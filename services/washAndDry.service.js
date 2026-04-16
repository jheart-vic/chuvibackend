const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const ActivityModel = require('../models/activity.model')
const {
    ORDER_STATUS,
    ORDER_SERVICE_TYPE,
    STATION_STATUS,
    ACTIVITY_TYPE,
    ROLE,
} = require('../util/constants')
const {buildStageUpdate} =require('../util/helper')
const BaseService = require('./base.service')
const paginate = require('../util/paginate')

class WashAndDryService extends BaseService {
    // GET DASHBOARD STATS
  async getDashboard(req) {
    try {
      const userId = req.user.id;
      const user = await UserModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [
        washQueue,
        activeWash,
        activeDry,
        completedToday,
        recentQueueResult,
      ] = await Promise.all([


        BookOrderModel.countDocuments({
          "stage.status": ORDER_STATUS.WASHING,
          "washDetails.startedAt": { $exists: false },
        }),

        BookOrderModel.countDocuments({
          "stage.status": ORDER_STATUS.WASHING,
          "washDetails.startedAt": { $exists: true },
          "washDetails.movedToDryingAt": { $exists: false },
        }),

        // Orders currently in drying stage
        BookOrderModel.countDocuments({
          "stage.status": ORDER_STATUS.DRYING,
        }),

        BookOrderModel.countDocuments({
          "stageHistory.status": ORDER_STATUS.DRYING,
          "stageHistory.updatedAt": { $gte: startOfToday },
          "stage.status": {
            $nin: [ORDER_STATUS.WASHING, ORDER_STATUS.DRYING],
          },
        }),

        paginate(
          BookOrderModel,
          { "stage.status": ORDER_STATUS.WASHING },
          {
            page: 1,
            limit: 5,
            sort: { "stage.updatedAt": 1 },
            select: "oscNumber fullName phoneNumber items serviceType serviceTier stage createdAt washDetails",
            lean: true,
          }
        ),
      ]);

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
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to fetch dashboard" });
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
            if (item.washStatus === 'complete')
                return BaseService.sendFailedResponse({
                    error: 'Item already confirmed for washing',
                })

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: {
                        'items.$.washStatus': 'complete',
                        'items.$.washConfirmedAt': new Date(),
                        'items.$.washConfirmedByOperatorId': userId,
                    },
                    $push: {
                        'items.$.actionLog': {
                            action: 'wash_confirmed',
                            note: 'Item confirmed as present and ready for washing',
                            timestamp: new Date(),
                        },
                    },
                },
            )

            // Re-fetch to check if all items are now confirmed
            const updatedOrder = await BookOrderModel.findById(orderId).lean()
            const allItemsConfirmed = updatedOrder.items.every(
                (i) => i.washStatus === 'complete',
            )

            // Auto-promote: when all items confirmed set order-level startedAt + stationStatus
            if (allItemsConfirmed) {
                await BookOrderModel.updateOne(
                    { _id: orderId },
                    {
                        $set: {
                            stationStatus: STATION_STATUS.WASH_AND_DRY_STATION,
                            'washDetails.startedAt': new Date(),
                            'washDetails.operatorId': userId,
                        },
                    },
                )
            }

            await ActivityModel.create({
                title: 'Item Confirmed for Washing',
                description: `Item ${item.type} (Tag: ${item.tagId || itemId}) on order ${order.oscNumber} confirmed as present and ready for washing`,
                type: ACTIVITY_TYPE.ORDER_ITEM_WASH_CONFIRMED,
            })

            return BaseService.sendSuccessResponse({
                message: {
                    message: 'Item confirmed for washing',
                    allItemsConfirmed,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to confirm item for washing',
            })
        }
    }

    // UNDO ITEM WASH CONFIRMATION
    async undoConfirmItemForWashing(req) {
        try {
        const orderId = req.params.id;
        const itemId  = req.params.itemId;
        const userId  = req.user.id;

        if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });
        if (!itemId)  return BaseService.sendFailedResponse({ error: "Item ID is required" });

        const user = await UserModel.findById(userId);
        if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

        const order = await BookOrderModel.findOne({
            _id: orderId,
            "stage.status": ORDER_STATUS.WASHING,
        });
        if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not in washing stage" });

        const item = order.items.id(itemId);
        if (!item) return BaseService.sendFailedResponse({ error: "Item not found in order" });

        if (item.washStatus === "pending") {
            return BaseService.sendFailedResponse({ error: "Item wash has not been confirmed yet" });
        }

        await BookOrderModel.updateOne(
            { _id: orderId, "items._id": itemId },
            {
            $set: {
                "items.$.washStatus": "pending",
                "items.$.washConfirmedAt": null,
                "items.$.washConfirmedByOperatorId": null,
                "washDetails.startedAt": null,
                "washDetails.operatorId": null,
                stationStatus: STATION_STATUS.SORT_AND_PRETREAT_STATION,
            },
            $push: {
                "items.$.actionLog": {
                action:    "undo_wash_confirmed",
                note:      "",
                timestamp: new Date(),
                },
            },
            }
        );

        return BaseService.sendSuccessResponse({ message: "Item wash confirmation undone" });
        } catch (error) {
        console.log(error);
        return BaseService.sendFailedResponse({ error: "Failed to undo item wash confirmation" });
        }
    }

    // SEND ITEM TO HOLD
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
            const allowedAssignees = [ROLE.ADMIN, ROLE.SORT_AND_PRETREAT, ROLE.INTAKE_AND_TAG]

            if (!allowedReasons.includes(reason)) {
                return BaseService.sendFailedResponse({
                    error: `reason must be one of: ${allowedReasons.join(', ')}`,
                })
            }
            if (!allowedAssignees.includes(assignTo)) {
                return BaseService.sendFailedResponse({
                    error: `assignTo must be one of: ${allowedAssignees.join(', ')}`,
                })
            }

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

            // Store hold details on the item
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

            // Move order to HOLD stage so it surfaces in the Hold Queue
            await BookOrderModel.updateOne(
                { _id: orderId },
                buildStageUpdate(
                    ORDER_STATUS.HOLD,
                    STATION_STATUS.WASH_AND_DRY_STATION,
                    reason,
                ),
            )

            await ActivityModel.create({
                title: 'Item Placed on Hold',
                description: `Item ${item.type} (Tag: ${item.tagId || itemId}) on order ${order.oscNumber} placed on hold. Reason: ${reason}. Assigned to: ${assignTo}`,
                type: ACTIVITY_TYPE.ORDER_ON_HOLD,
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

            return BaseService.sendSuccessResponse({
                message: { data, pagination },
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

            return BaseService.sendSuccessResponse({
                message: { data, pagination },
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

            const query = {
                'stage.status': ORDER_STATUS.HOLD,
                stationStatus: STATION_STATUS.WASH_AND_DRY_STATION,
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
            sort: { 'stage.updatedAt': -1 },
            select: `
                oscNumber fullName phoneNumber serviceType serviceTier amount
                stage stationStatus stageHistory washDetails createdAt updatedAt items
            `,
            populate: {
                path: 'washDetails.operatorId',
                select: 'fullName',
            },
            lean: true,
        })

            const holdItems = data.map((order) => ({
                orderId: order.oscNumber,
                fullName: order.fullName,
                operator: order.washDetails?.operatorId?.fullName || null,
                stage: order.stage,
                stationStatus: order.stationStatus,
                holdReason: order.stage.note || '',
                holdTime: order.stage.updatedAt,
                flaggedItems: (order.items || [])
                    .filter((i) => i.flaggedForReview)
                    .map((i) => ({
                        itemId: i._id,
                        tagId: i.tagId,
                        type: i.type,
                        flagNote: i.flagNote,
                    })),
            }))

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

    // RELEASE FROM HOLD
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
                stationStatus: STATION_STATUS.WASH_AND_DRY_STATION,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not on hold at this station',
                })

            await BookOrderModel.updateOne(
                { _id: orderId },
                buildStageUpdate(
                    ORDER_STATUS.WASHING,
                    STATION_STATUS.WASH_AND_DRY_STATION,
                    'Released from hold',
                ),
            )

            await ActivityModel.create({
                title: 'Order Released from Hold',
                description: `Order ${order.oscNumber} released from hold and returned to wash queue`,
                type: ACTIVITY_TYPE.ORDER_RELEASED_FROM_HOLD,
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
                    $nin: [
                        ORDER_STATUS.WASHING,
                        ORDER_STATUS.DRYING,
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
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stationStatus stageHistory washDetails createdAt updatedAt',
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

    // GET ORDER TIMELINE
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
                {
                    key: 'ready',
                    label: 'Ready',
                    status: ORDER_STATUS.READY,
                },
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

            // Per-item action log for the detailed audit section
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
                        serviceType: order.serviceType,
                        serviceTier: order.serviceTier,
                        amount: order.amount,
                        stage: order.stage,
                        stationStatus: order.stationStatus,
                        trackingStatus,
                        washDetails: order.washDetails,
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
