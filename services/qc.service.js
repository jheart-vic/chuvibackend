const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const ActivityModel = require('../models/activity.model')
const {
    ORDER_STATUS,
    STATION_STATUS,
    ACTIVITY_TYPE,
    ROLE,
    NOTIFICATION_TYPE,
    DELIVERY_STATUS,
    PICKUP_STATUS,
    QC_DURATION_MINUTES,
    ORDER_SERVICE_TYPE,
} = require('../util/constants')
const { buildStageUpdate, getObjectId } = require('../util/helper')
const BaseService = require('./base.service')
const paginate = require('../util/paginate')
const NotificationModel = require('../models/notification.model')
const createNotification = require('../util/createNotification')
const updateOrderItemsStage = require('../util/updateOrderItemsStage')
const createAuditLog = require('../util/createAuditLog')

class QCService extends BaseService {
    // ── Dashboard ──────────────────────────────────────────────────────────────
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
                qcQueue,
                activeQC,
                packing,
                completedToday,
                recentQueueResult,
            ] = await Promise.all([
                // awaiting QC — no startedAt, arrived today
                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.QC,
                    'qcDetails.startedAt': { $exists: false },
                    'stage.updatedAt': { $gte: startOfToday },
                }),
                // active QC — started but not passed, today
                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.QC,
                    'qcDetails.startedAt': { $gte: startOfToday },
                    'qcDetails.passedAt': { $exists: false },
                }),
                // pack & seal — passed QC today but not yet packed
                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.QC,
                    'qcDetails.passedAt': { $gte: startOfToday },
                    'qcDetails.packCompletedAt': { $exists: false },
                }),
                // completed today — pack completed today
                BookOrderModel.countDocuments({
                    'qcDetails.packCompletedAt': { $gte: startOfToday },
                    'stage.status': ORDER_STATUS.READY,
                }),
                // recent queue
                paginate(
                    BookOrderModel,
                    { 'stage.status': ORDER_STATUS.QC },
                    {
                        page: 1,
                        limit: 5,
                        sort: { 'stage.updatedAt': 1 },
                        select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage createdAt qcDetails',
                        lean: true,
                    },
                ),
            ])

            return BaseService.sendSuccessResponse({
                message: {
                    stats: { qcQueue, activeQC, packing, completedToday },
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

    // ── QC Queue ───────────────────────────────────────────────────────────────
    async getQCQueue(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const { page = 1, limit = 20, search = '' } = req.query

            const query = {
                'stage.status': ORDER_STATUS.QC,
                'qcDetails.startedAt': { $exists: false },
                'qcDetails.passedAt': { $exists: false },
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
                sort: { 'stage.updatedAt': 1 },
                select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage stationStatus createdAt qcDetails',
                lean: true,
            })

            const ordersWithMeta = data.map((o) => {
                const arrivedAt = o.stage?.updatedAt
                const durationMinutes =
                    QC_DURATION_MINUTES[o.deliverySpeed] ?? 20
                const estimatedFinish = arrivedAt
                    ? new Date(
                          new Date(arrivedAt).getTime() +
                              durationMinutes * 60 * 1000,
                      )
                    : null

                return {
                    ...o,
                    itemCount: (o.items || []).length,
                    flaggedItemCount: (o.items || []).filter(
                        (i) => i.flaggedForReview,
                    ).length,
                    qcDetails: {
                        ...o.qcDetails,
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
                error: 'Failed to fetch QC queue',
            })
        }
    }

    // ── QC Queue Order Details ─────────────────────────────────────────────────
    async getQCQueueOrderDetails(req) {
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
                'stage.status': ORDER_STATUS.QC,
            }).lean()
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in QC stage',
                })

            const arrivedAt = order.stage?.updatedAt
            const durationMinutes =
                QC_DURATION_MINUTES[order.deliverySpeed] ?? 20
            const estimatedFinish = arrivedAt
                ? new Date(
                      new Date(arrivedAt).getTime() +
                          durationMinutes * 60 * 1000,
                  )
                : null

            const allItemsPassed = order.items.every(
                (i) => i.qcStatus === 'passed',
            )

            return BaseService.sendSuccessResponse({
                message: {
                    order: {
                        ...order,
                        qcDetails: {
                            ...order.qcDetails,
                            estimatedFinish,
                            durationMinutes,
                        },
                    },
                    allItemsPassed,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch order details',
            })
        }
    }

    // ── Confirm Item QC ────────────────────────────────────────────────────────
    async confirmItemQC(req) {
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
                'stage.status': ORDER_STATUS.QC,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in QC stage',
                })

            // Set qcDetails.startedAt on the very first confirmation (not when all are done)
            if (!order.qcDetails?.startedAt) {
                await BookOrderModel.updateOne(
                    { _id: orderId },
                    {
                        $set: {
                            'qcDetails.startedAt': new Date(),
                            'qcDetails.operatorId': userId,
                        },
                    },
                )
            }

            const { updatedCount, allItemsCompleted } =
                await updateOrderItemsStage({
                    order,
                    orderId,
                    userId,
                    itemIds,
                    allItems,
                    statusField: 'qcStatus',
                    completedValue: 'passed',
                    timestampField: 'qcConfirmedAt',
                    operatorField: 'qcConfirmedByOperatorId',
                    actionName: 'qc_passed',
                    actionNote: '',
                    // No orderStartedAtField here — handled above
                    completionCheck: (item) => item.qcStatus === 'passed',
                })

            await ActivityModel.create({
                title: 'Item(s) QC Passed',
                description: `${updatedCount} item(s) on order ${order.oscNumber} marked as QC passed by ${user.fullName}`,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            await createNotification({
                userId,
                title: 'Item(s) QC Passed',
                body: `${updatedCount} item(s) on order ${order.oscNumber} have passed quality control.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })
            await createAuditLog({userId: getObjectId(userId), orderId, category: 'qc', action: `Qc passed. Items: ${itemIds.join(', ')}. All items passed: ${allItemsCompleted}`})

            return BaseService.sendSuccessResponse({
                message: {
                    message: `${updatedCount} item(s) marked as QC passed`,
                    allItemsPassed: allItemsCompleted,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to confirm item(s) QC',
            })
        }
    }
    // UNDO ITEM(S) QC CONFIRMATION

    async undoConfirmItemQC(req) {
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
                'stage.status': ORDER_STATUS.QC,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in QC stage',
                })

            const now = new Date()

            const targetItems = allItems
                ? order.items.filter((item) => item.qcStatus === 'passed')
                : order.items.filter(
                      (item) =>
                          itemIds.includes(item._id.toString()) &&
                          item.qcStatus === 'passed',
                  )

            if (!targetItems.length)
                return BaseService.sendFailedResponse({
                    error: 'No passed items found to undo',
                })

            await BookOrderModel.bulkWrite(
                targetItems.map((item) => ({
                    updateOne: {
                        filter: { _id: orderId, 'items._id': item._id },
                        update: {
                            $set: {
                                'items.$.qcStatus': 'pending',
                                'items.$.qcConfirmedAt': null,
                                'items.$.qcConfirmedByOperatorId': null,
                            },
                            $push: {
                                'items.$.actionLog': {
                                    action: 'qc_undo',
                                    note: '',
                                    timestamp: now,
                                },
                            },
                        },
                    },
                })),
            )

            await ActivityModel.create({
                title: 'Item(s) QC Undone',
                description: `QC status undone for ${targetItems.length} item(s) on order ${order.oscNumber} by ${user.fullName}`,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            await createNotification({
                userId,
                title: 'Item QC Status Undone',
                body: `${targetItems.length} item(s) on order ${order.oscNumber} have had their QC status undone.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })
            await createAuditLog({userId: getObjectId(userId), orderId, category: 'qc', action: `Undo QC confirmation. Items: ${itemIds.join(', ')}. All items undone: ${allItems}`})

            return BaseService.sendSuccessResponse({
                message: `${targetItems.length} item(s) QC status undone`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to undo item QC',
            })
        }
    }

    // ── Pass QC — send to Pack & Seal ──────────────────────────────────────────
    async passQC(req) {
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
                'stage.status': ORDER_STATUS.QC,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in QC stage',
                })

            const allItemsPassed = order.items.every(
                (i) => i.qcStatus === 'passed',
            )
            if (!allItemsPassed) {
                return BaseService.sendFailedResponse({
                    error: 'All items must pass QC before sending to Pack & Seal',
                })
            }

            await BookOrderModel.updateOne(
                { _id: orderId },
                { $set: { 'qcDetails.passedAt': new Date() } },
            )

            await ActivityModel.create({
                title: 'Order Passed QC',
                description: `Order ${order.oscNumber} passed QC and sent to Pack & Seal by ${user.fullName}`,
                type: ACTIVITY_TYPE.ORDER_QC_PASSED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            await createNotification({
                userId: userId,
                title: 'Your order passed QC',
                body: `Order ${order.oscNumber} has passed quality control and is now being prepared for packing and sealing.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })
            await createAuditLog({userId: getObjectId(userId), orderId, category: 'qc', action: 'Order passed QC and sent to Pack & Seal'})

            return BaseService.sendSuccessResponse({
                message: 'Order passed QC and sent to Pack & Seal',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to pass QC',
            })
        }
    }

    // ── Pack & Seal List ───────────────────────────────────────────────────────
    async getPackAndSealList(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const { page = 1, limit = 20, search = '' } = req.query

            const query = {
                'stage.status': ORDER_STATUS.QC,
                'qcDetails.passedAt': { $exists: true },
                'qcDetails.packCompletedAt': { $exists: false },
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
                sort: { 'qcDetails.passedAt': 1 },
                select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage stationStatus createdAt qcDetails',
                lean: true,
            })
            console.log({ data, pagination })

            const ordersWithMeta = data.map((o) => ({
                ...o,
                itemCount: (o.items || []).length,
            }))

            return BaseService.sendSuccessResponse({
                message: { data: ordersWithMeta, pagination },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch Pack & Seal list',
            })
        }
    }

    // ── Pack & Seal Detail ─────────────────────────────────────────────────────
    async getPackAndSealDetail(req) {
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
                'stage.status': ORDER_STATUS.QC,
                'qcDetails.passedAt': { $exists: true },
                'qcDetails.packCompletedAt': { $exists: false },
            }).lean()
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in Pack & Seal stage',
                })

            return BaseService.sendSuccessResponse({ message: { order } })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch Pack & Seal order',
            })
        }
    }

    // ── Pack & Seal Complete → Ready ───────────────────────────────────────────
    async packAndSealComplete(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id
            const { labelAttached, packageSealed } = req.body

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!labelAttached || !packageSealed) {
                return BaseService.sendFailedResponse({
                    error: 'All pack & seal checklist items must be completed',
                })
            }

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.QC,
                'qcDetails.passedAt': { $exists: true },
                'qcDetails.packCompletedAt': { $exists: false },
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in Pack & Seal stage',
                })

            const now = new Date()

            const stageUpdate = buildStageUpdate(
                ORDER_STATUS.READY,
                STATION_STATUS.QC_STATION,
                'Pack & Seal complete',
            )

            await BookOrderModel.updateOne(
                { _id: orderId },
                {
                    $set: {
                        'qcDetails.packCompletedAt': now,
                        'qcDetails.labelAttached': true,
                        'qcDetails.packageSealed': true,
                        'qcDetails.packOperatorId': userId,
                        ...stageUpdate.$set,
                    },
                    $push: stageUpdate.$push,
                },
            )

            await ActivityModel.create({
                title: 'Order Packed & Sealed',
                description: `Order ${order.oscNumber} packed and sealed by ${user.fullName}. Now ready for delivery.`,
                type: ACTIVITY_TYPE.ORDER_PACKED_AND_SEALED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })
            await createNotification({
                userId: order.userId || userId,
                title: 'Your order is ready for delivery',
                body: `Order ${order.oscNumber} has been quality-checked, packed, and sealed. It is now ready for delivery.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.ORDER_READY,
            })

            return BaseService.sendSuccessResponse({
                message: 'Order packed and sealed. Now ready for delivery.',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to complete Pack & Seal',
            })
        }
    }

    // ── Ready Orders ───────────────────────────────────────────────────────────
    async getReadyOrders(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const { page = 1, limit = 20, search = '' } = req.query

            const startOfToday = new Date()
            startOfToday.setHours(0, 0, 0, 0)

            const query = {
                'stage.status': ORDER_STATUS.READY,
                'qcDetails.packCompletedAt': { $gte: startOfToday },
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
                select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage stationStatus createdAt qcDetails',
                lean: true,
            })

            const ordersWithMeta = data.map((o) => ({
                ...o,
                itemCount: (o.items || []).length,
            }))

            return BaseService.sendSuccessResponse({
                message: { data: ordersWithMeta, pagination },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch ready orders',
            })
        }
    }

    // ── Send to Hold ───────────────────────────────────────────────────────────
    async sendToHold(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id
            const { reason, assignTo, note = '' } = req.body // ← add note

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
                [ROLE.PRESS]: STATION_STATUS.PRESSING_AND_IRONING_STATION,
                [ROLE.WASH_AND_DRY]: STATION_STATUS.WASH_AND_DRY_STATION,
                [ROLE.SORT_AND_PRETREAT]:
                    STATION_STATUS.SORT_AND_PRETREAT_STATION,
                [ROLE.INTAKE_AND_TAG]: STATION_STATUS.INTAKE_AND_TAG_STATION,
            }

            // if (!allowedReasons.includes(reason))
            //     return BaseService.sendFailedResponse({
            //         error: `reason must be one of: ${allowedReasons.join(', ')}`,
            //     })

            if (!reason || !reason.trim())
                return BaseService.sendFailedResponse({
                    error: 'A reason is required',
                })

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
                'stage.status': ORDER_STATUS.QC,
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not in QC stage',
                })

            const item = order.items.id(itemId)
            if (!item)
                return BaseService.sendFailedResponse({
                    error: 'Item not found in order',
                })

            // build the hold note — reason label + operator's custom note if provided
            const holdNote = note ? `${reason}: ${note}` : reason

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: {
                        'items.$.flaggedForReview': true,
                        'items.$.flagNote': holdNote, // ← stores combined note
                        'items.$.holdDetails.reason': reason,
                        'items.$.holdDetails.note': note, // ← stores raw operator note separately
                        'items.$.holdDetails.assignTo': assignTo,
                        'items.$.holdDetails.heldAt': new Date(),
                        'items.$.holdDetails.heldByOperatorId': userId,
                        'items.$.holdDetails.heldByStation':
                            STATION_STATUS.QC_STATION,
                    },
                    $push: {
                        'items.$.actionLog': {
                            action: 'item_held',
                            note: holdNote, // ← full note in action log
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
                    holdNote, // ← stage note also carries it
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
                title: 'An item on your order has been placed on hold',
                body: `Item ${item.type} (Tag: ${item.tagId || itemId}) on your order ${order.oscNumber} has been placed on hold.${note ? ` Note: ${note}.` : ''} Please contact support for more details.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.ORDER_UPDATED,
            })
            await createAuditLog({userId: getObjectId(userId), orderId, category: 'qc', action: `Item placed on hold. Item ID: ${itemId}. Reason: ${reason}. Assigned to: ${assignTo}. Note: ${note}`})

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

    // ── Get Hold Queue ─────────────────────────────────────────────────────────
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
                    // assigned to QC by another station
                    { stationStatus: STATION_STATUS.QC_STATION },
                    // raised by QC — sitting at another station
                    {
                        'items.holdDetails.heldByStation':
                            STATION_STATUS.QC_STATION,
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
                    select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage stationStatus qcDetails createdAt updatedAt',
                    lean: true,
                },
            )

            const holdItems = data.map((order) => {
                const assignedToUs =
                    order.stationStatus === STATION_STATUS.QC_STATION
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

    // ── Release from Hold ──────────────────────────────────────────────────────
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
                    { stationStatus: STATION_STATUS.QC_STATION },
                    { 'items.holdDetails.assignTo': ROLE.QC },
                ],
            })
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found or not on hold at this station',
                })

            const now = new Date()
            const updatedItems = order.items.map((item) => {
                if (item.holdDetails?.assignTo === ROLE.QC) {
                    item.holdDetails.releasedAt = now
                    item.holdDetails.releasedByOperatorId = userId
                    item.holdDetails.assignTo = null
                    // ✅ reset qc status so item can be worked on again
                    item.qcStatus = 'pending'
                    item.qcConfirmedAt = null
                    item.qcConfirmedByOperatorId = null
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
                            ORDER_STATUS.QC,
                            STATION_STATUS.QC_STATION,
                            'Released from hold',
                        ).$set,
                    },

                    $unset: {
                        'qcDetails.startedAt': '',
                        'qcDetails.passedAt': '',
                        'qcDetails.packCompletedAt': '',
                        'qcDetails.operatorId': '',
                        'qcDetails.packOperatorId': '',
                    },
                    $push: {
                        stageHistory: {
                            status: ORDER_STATUS.QC,
                            note: 'Released from hold',
                            updatedAt: now,
                        },
                    },
                },
                { runValidators: false },
            )

            await ActivityModel.create({
                title: 'Order Released from Hold',
                description: `Order ${order.oscNumber} released from hold and returned to QC queue by ${user.fullName}`,
                type: ACTIVITY_TYPE.ORDER_RELEASED_FROM_HOLD,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })
            await createAuditLog({userId: getObjectId(userId), orderId, category: 'qc', action: 'Order released from hold and returned to QC queue'})

            return BaseService.sendSuccessResponse({
                message: 'Order released from hold and returned to QC queue',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to release order from hold',
            })
        }
    }

    // ── History List ───────────────────────────────────────────────────────────
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

            // QC history = orders that passed through QC and moved beyond it
            const query = {
                'stageHistory.status': ORDER_STATUS.QC,
                'stage.status': {
                    $nin: [ORDER_STATUS.QC], // ← removed HOLD
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
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stationStatus stageHistory qcDetails createdAt updatedAt',
                lean: true,
            })

            const startOfToday = new Date()
            startOfToday.setHours(0, 0, 0, 0)

            const today = []
            const earlier = []

            for (const order of data) {
                // use packCompletedAt as primary anchor — most accurate for QC completion
                // fallback to when READY entered stageHistory
                // fallback to updatedAt
                const completedAt =
                    order.qcDetails?.packCompletedAt ||
                    order.stageHistory?.find(
                        (h) => h.status === ORDER_STATUS.READY,
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
module.exports = new QCService()
