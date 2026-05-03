const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const ActivityModel = require('../models/activity.model')
const {
    ORDER_STATUS,
    STATION_STATUS,
    ACTIVITY_TYPE,
    ROLE,
} = require('../util/constants')
const { buildStageUpdate } = require('../util/helper')
const BaseService = require('./base.service')
const paginate = require('../util/paginate')

class QCService extends BaseService {

    // ── Dashboard ──────────────────────────────────────────────────────────────
    async getDashboard(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const [qcQueue, activeQC, packing, ready, recentQueueResult] = await Promise.all([
                // awaiting QC — no startedAt
                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.QC,
                    'qcDetails.startedAt': { $exists: false },
                }),
                // active QC — started but not passed
                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.QC,
                    'qcDetails.startedAt': { $exists: true },
                    'qcDetails.passedAt': { $exists: false },
                }),
                // pack & seal — passed QC but not yet packed
                BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.QC,
                    'qcDetails.passedAt': { $exists: true },
                    'qcDetails.packCompletedAt': { $exists: false },
                }),
                // ready for delivery
                BookOrderModel.countDocuments({
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
                    stats: { qcQueue, activeQC, packing, ready },
                    recentQueue: recentQueueResult.data,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch dashboard' })
        }
    }

    // ── QC Queue ───────────────────────────────────────────────────────────────
    async getQCQueue(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const { page = 1, limit = 20, search = '' } = req.query

            const query = {
                'stage.status': ORDER_STATUS.QC,
                'qcDetails.startedAt': { $exists: false },
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

            const ordersWithMeta = data.map((o) => ({
                ...o,
                itemCount: (o.items || []).length,
                flaggedItemCount: (o.items || []).filter((i) => i.flaggedForReview).length,
            }))

            return BaseService.sendSuccessResponse({ message: { data: ordersWithMeta, pagination } })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch QC queue' })
        }
    }

    // ── QC Queue Order Details ─────────────────────────────────────────────────
    async getQCQueueOrderDetails(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId) return BaseService.sendFailedResponse({ error: 'Order ID is required' })

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.QC,
            }).lean()
            if (!order) return BaseService.sendFailedResponse({ error: 'Order not found or not in QC stage' })

            const allItemsPassed = order.items.every((i) => i.qcStatus === 'passed')

            return BaseService.sendSuccessResponse({ message: { order, allItemsPassed } })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch order details' })
        }
    }

    // ── Confirm Item QC ────────────────────────────────────────────────────────
    async confirmItemQC(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id

            if (!orderId) return BaseService.sendFailedResponse({ error: 'Order ID is required' })
            if (!itemId) return BaseService.sendFailedResponse({ error: 'Item ID is required' })

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.QC,
            })
            if (!order) return BaseService.sendFailedResponse({ error: 'Order not found or not in QC stage' })

            const item = order.items.id(itemId)
            if (!item) return BaseService.sendFailedResponse({ error: 'Item not found in order' })
            if (item.qcStatus === 'passed') return BaseService.sendFailedResponse({ error: 'Item already passed QC' })

            const now = new Date()

            // set startedAt on first item confirmation
            const setPayload = {
                'items.$.qcStatus': 'passed',
            }
            if (!order.qcDetails?.startedAt) {
                setPayload['qcDetails.startedAt'] = now
                setPayload['qcDetails.operatorId'] = userId
            }

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: setPayload,
                    $push: {
                        'items.$.actionLog': {
                            action: 'qc_passed',
                            note: '',
                            timestamp: now,
                        },
                    },
                },
            )

            const updatedOrder = await BookOrderModel.findById(orderId).lean()
            const allItemsPassed = updatedOrder.items.every((i) => i.qcStatus === 'passed')

            await ActivityModel.create({
                title: 'Item QC Passed',
                description: `Item ${itemId} on order ${order.oscNumber} marked as QC passed by ${user.fullName}`,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({
                message: { message: 'Item marked as QC passed', allItemsPassed },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to confirm item QC' })
        }
    }

    // ── Undo Confirm Item QC ───────────────────────────────────────────────────
    async undoConfirmItemQC(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id

            if (!orderId) return BaseService.sendFailedResponse({ error: 'Order ID is required' })
            if (!itemId) return BaseService.sendFailedResponse({ error: 'Item ID is required' })

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.QC,
            })
            if (!order) return BaseService.sendFailedResponse({ error: 'Order not found or not in QC stage' })

            const item = order.items.id(itemId)
            if (!item) return BaseService.sendFailedResponse({ error: 'Item not found in order' })
            if (item.qcStatus !== 'passed') return BaseService.sendFailedResponse({ error: 'Item is not marked as passed' })

            await BookOrderModel.updateOne(
                { _id: orderId, 'items._id': itemId },
                {
                    $set: { 'items.$.qcStatus': 'pending' },
                    $push: {
                        'items.$.actionLog': {
                            action: 'qc_undo',
                            note: '',
                            timestamp: new Date(),
                        },
                    },
                },
            )

            await ActivityModel.create({
                title: 'Item QC Undone',
                description: `QC status undone for item ${itemId} on order ${order.oscNumber} by ${user.fullName}`,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({ message: 'Item QC status undone' })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to undo item QC' })
        }
    }

    // ── Pass QC — send to Pack & Seal ──────────────────────────────────────────
    async passQC(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId) return BaseService.sendFailedResponse({ error: 'Order ID is required' })

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.QC,
            })
            if (!order) return BaseService.sendFailedResponse({ error: 'Order not found or not in QC stage' })

            const allItemsPassed = order.items.every((i) => i.qcStatus === 'passed')
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
            })

            return BaseService.sendSuccessResponse({ message: 'Order passed QC and sent to Pack & Seal' })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to pass QC' })
        }
    }

    // ── Pack & Seal List ───────────────────────────────────────────────────────
    async getPackAndSealList(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

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

            const ordersWithMeta = data.map((o) => ({
                ...o,
                itemCount: (o.items || []).length,
            }))

            return BaseService.sendSuccessResponse({ message: { data: ordersWithMeta, pagination } })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch Pack & Seal list' })
        }
    }

    // ── Pack & Seal Detail ─────────────────────────────────────────────────────
    async getPackAndSealDetail(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId) return BaseService.sendFailedResponse({ error: 'Order ID is required' })

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.QC,
                'qcDetails.passedAt': { $exists: true },
                'qcDetails.packCompletedAt': { $exists: false },
            }).lean()
            if (!order) return BaseService.sendFailedResponse({ error: 'Order not found or not in Pack & Seal stage' })

            return BaseService.sendSuccessResponse({ message: { order } })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch Pack & Seal order' })
        }
    }

    // ── Pack & Seal Complete → Ready ───────────────────────────────────────────
    async packAndSealComplete(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id
            const { labelAttached, packageSealed } = req.body

            if (!orderId) return BaseService.sendFailedResponse({ error: 'Order ID is required' })
            if (!labelAttached || !packageSealed) {
                return BaseService.sendFailedResponse({
                    error: 'All pack & seal checklist items must be completed',
                })
            }

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.QC,
                'qcDetails.passedAt': { $exists: true },
                'qcDetails.packCompletedAt': { $exists: false },
            })
            if (!order) return BaseService.sendFailedResponse({ error: 'Order not found or not in Pack & Seal stage' })

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
                },
            )

            await ActivityModel.create({
                title: 'Order Packed & Sealed',
                description: `Order ${order.oscNumber} packed and sealed by ${user.fullName}. Now ready for delivery.`,
                type: ACTIVITY_TYPE.ORDER_PACKED_AND_SEALED,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({ message: 'Order packed and sealed. Now ready for delivery.' })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to complete Pack & Seal' })
        }
    }

    // ── Ready Orders ───────────────────────────────────────────────────────────
    async getReadyOrders(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const { page = 1, limit = 20, search = '' } = req.query

            const query = { 'stage.status': ORDER_STATUS.READY }

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

            return BaseService.sendSuccessResponse({ message: { data: ordersWithMeta, pagination } })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch ready orders' })
        }
    }

    // ── Send to Hold ───────────────────────────────────────────────────────────
    async sendToHold(req) {
        try {
            const orderId = req.params.id
            const itemId = req.params.itemId
            const userId = req.user.id
            const { reason, assignTo } = req.body

            if (!orderId) return BaseService.sendFailedResponse({ error: 'Order ID is required' })
            if (!itemId) return BaseService.sendFailedResponse({ error: 'Item ID is required' })
            if (!reason) return BaseService.sendFailedResponse({ error: 'A reason is required' })
            if (!assignTo) return BaseService.sendFailedResponse({ error: 'An assignee is required' })

            const allowedReasons = ['item_missing', 'item_mismatched']

            const stationMap = {
                [ROLE.ADMIN]: STATION_STATUS.ADMIN_STATION,
                [ROLE.PRESS]: STATION_STATUS.PRESSING_AND_IRONING_STATION,
                [ROLE.WASH_AND_DRY]: STATION_STATUS.WASH_AND_DRY_STATION,
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
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.QC,
            })
            if (!order) return BaseService.sendFailedResponse({ error: 'Order not found or not in QC stage' })

            const item = order.items.id(itemId)
            if (!item) return BaseService.sendFailedResponse({ error: 'Item not found in order' })

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
                        'items.$.holdDetails.heldByStation': STATION_STATUS.QC_STATION,
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
                buildStageUpdate(ORDER_STATUS.HOLD, stationMap[assignTo], reason),
            )

            await ActivityModel.create({
                title: 'Item Placed on Hold',
                description: `Item ${item.type} (Tag: ${item.tagId || itemId}) on order ${order.oscNumber} placed on hold by ${user.fullName}. Reason: ${reason}. Assigned to: ${assignTo}`,
                type: ACTIVITY_TYPE.ORDER_ON_HOLD,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({ message: 'Item placed on hold successfully' })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to place item on hold' })
        }
    }

    // ── Get Hold Queue ─────────────────────────────────────────────────────────
    async getHoldQueue(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const { page = 1, limit = 20, search = '' } = req.query

            const baseQuery = {
                'stage.status': ORDER_STATUS.HOLD,
                $or: [
                    // assigned to QC by another station
                    { stationStatus: STATION_STATUS.QC_STATION },
                    // raised by QC — sitting at another station
                    { 'items.holdDetails.heldByStation': STATION_STATUS.QC_STATION },
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

            const { data, pagination } = await paginate(BookOrderModel, baseQuery, {
                page,
                limit,
                sort: { 'stage.updatedAt': -1 },
                select: 'oscNumber fullName phoneNumber items serviceType serviceTier stage stationStatus qcDetails createdAt updatedAt',
                lean: true,
            })

            const holdItems = data.map((order) => {
                const assignedToUs = order.stationStatus === STATION_STATUS.QC_STATION
                const flaggedItems = (order.items || [])
                    .filter((i) => i.holdDetails?.heldByStation || i.holdDetails?.assignTo)
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

            return BaseService.sendSuccessResponse({ message: { data: holdItems, pagination } })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch hold queue' })
        }
    }

    // ── Release from Hold ──────────────────────────────────────────────────────
    async releaseFromHold(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId) return BaseService.sendFailedResponse({ error: 'Order ID is required' })

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const order = await BookOrderModel.findOne({
                _id: orderId,
                'stage.status': ORDER_STATUS.HOLD,
                stationStatus: STATION_STATUS.QC_STATION,
            })
            if (!order) return BaseService.sendFailedResponse({ error: 'Order not found or not on hold at this station' })

            const now = new Date()
            const updatedItems = order.items.map((item) => {
                if (item.holdDetails?.assignTo) {
                    item.holdDetails.releasedAt = now
                    item.holdDetails.releasedByOperatorId = userId
                }
                return item
            })

            const stageUpdate = buildStageUpdate(
                ORDER_STATUS.QC,
                STATION_STATUS.QC_STATION,
                'Released from hold',
            )

            await BookOrderModel.updateOne(
                { _id: orderId },
                {
                    $set: {
                        items: updatedItems,
                        ...stageUpdate.$set,
                    },
                },
            )

            await ActivityModel.create({
                title: 'Order Released from Hold',
                description: `Order ${order.oscNumber} released from hold and returned to QC queue by ${user.fullName}`,
                type: ACTIVITY_TYPE.ORDER_RELEASED_FROM_HOLD,
                orderId: order._id,
                userId,
            })

            return BaseService.sendSuccessResponse({ message: 'Order released from hold and returned to QC queue' })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to release order from hold' })
        }
    }

    // ── History List ───────────────────────────────────────────────────────────
    async getHistoryList(req) {
        try {
            const userId = req.user.id
            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const { page = 1, limit = 20, search = '', startDate, endDate } = req.query

            const query = {
                'stageHistory.status': ORDER_STATUS.QC,
                'stage.status': {
                    $nin: [ORDER_STATUS.QC, ORDER_STATUS.HOLD],
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
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount stage stationStatus stageHistory qcDetails createdAt updatedAt',
                lean: true,
            })

            return BaseService.sendSuccessResponse({ message: { data, pagination } })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch history' })
        }
    }

    // ── Order Timeline ─────────────────────────────────────────────────────────
    async getOrderTimeline(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId) return BaseService.sendFailedResponse({ error: 'Order ID is required' })

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const order = await BookOrderModel.findById(orderId).lean()
            if (!order) return BaseService.sendFailedResponse({ error: 'Order not found' })

            const PIPELINE = [
                { key: 'intake',    label: 'Intake',    status: ORDER_STATUS.PENDING },
                { key: 'tagged',    label: 'Tagged',    status: ORDER_STATUS.QUEUE },
                { key: 'pretreated',label: 'Pretreated',status: ORDER_STATUS.SORT_AND_PRETREAT },
                { key: 'washed',    label: 'Washed',    status: ORDER_STATUS.WASHING },
                { key: 'ironing',   label: 'Ironing',   status: ORDER_STATUS.IRONING },
                { key: 'qc_passed', label: 'QC Passed', status: ORDER_STATUS.QC },
                { key: 'ready',     label: 'Ready',     status: ORDER_STATUS.READY },
                { key: 'delivered', label: 'Delivered', status: ORDER_STATUS.DELIVERED },
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
                return { key: step.key, label: step.label, completed: !!timestamp, timestamp }
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
            itemTimeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

            const trackingStatus = order.stage.status === ORDER_STATUS.DELIVERED ? 'completed' : 'in_progress'

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
                        createdAt: order.createdAt,
                    },
                    pipeline,
                    itemTimeline,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch order timeline' })
        }
    }
}

module.exports = new QCService()