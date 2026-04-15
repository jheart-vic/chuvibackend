const router = require('express').Router()
const WashAndDryController = require('../controllers/washAndDry.controller')
const washAndDryAuth = require('../middlewares/washAndDryAuth')
const {
    ROUTE_WASH_AND_DRY_UNMARK_DASHBOARD,
    ROUTE_WASH_AND_DRY_QUEUE,
    ROUTE_WASH_AND_DRY_QUEUE_SINGLE,
    ROUTE_WASH_AND_DRY_CONFIRM_FOR_WASHING,
    ROUTE_WASH_AND_DRY_UNDO_CONFIRM_FOR_WASHING,
    ROUTE_WASH_AND_DRY_HOLD,
    ROUTE_WASH_AND_DRY_GET_ACTIVE_WASHING,
    ROUTE_WASH_AND_DRY_MOVE_TO_DRYING,
    ROUTE_WASH_AND_ACTIVE_DRYING,
    ROUTE_WASH_AND_DRY_MARK_COMPLETE,
    ROUTE_WASH_AND_DRY_GET_HOLD,
    ROUTE_WASH_AND_DRY_HISTORY,
    ROUTE_WASH_AND_DRY_HISTORY_TIMELINE,
    ROUTE_WASH_AND_DRY_RELEASE,
} = require('../util/page-route')

// DASHBOARD
/**
 * @swagger
 * /wash-dry/dashboard:
 *   get:
 *     summary: Get Wash & Dry dashboard overview
 *     description: Returns stats (Wash Queue, Active Wash, Active Dry, Completed Today) and recent queue preview.
 *     tags:
 *       - Wash & Dry
 *     responses:
 *       200:
 *         description: Dashboard stats and recent queue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     stats:
 *                       type: object
 *                       properties:
 *                         washQueue:      { type: integer, example: 2 }
 *                         activeWash:     { type: integer, example: 0 }
 *                         activeDry:      { type: integer, example: 0 }
 *                         completedToday: { type: integer, example: 0 }
 *                     recentQueue:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/BookOrder' }
 *       500:
 *         description: Server error
 */
router.get(
    ROUTE_WASH_AND_DRY_UNMARK_DASHBOARD,
    [washAndDryAuth],
    (req, res) => {
        const controller = new WashAndDryController()
        return controller.getDashboard(req, res)
    },
)

// WASH QUEUE
/**
 * @swagger
 * /wash-dry/orders/queue:
 *   get:
 *     summary: Get wash queue — orders waiting to be washed
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "ORD-2024-001" }
 *     responses:
 *       200:
 *         description: Paginated list of orders pending wash start, with flaggedItemCount per order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/BookOrder' }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_WASH_AND_DRY_QUEUE, [washAndDryAuth], (req, res) => {
    const controller = new WashAndDryController()
    return controller.getWashQueue(req, res)
})

/**
 * @swagger
 * /wash-dry/order/queue/{id}:
 *   get:
 *     summary: Get single order details from wash queue
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Full order with items and flagged item details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     order: { $ref: '#/components/schemas/BookOrder' }
 *       404:
 *         description: Order not found or not in washing stage
 *       500:
 *         description: Server error
 */
router.get(ROUTE_WASH_AND_DRY_QUEUE_SINGLE, [washAndDryAuth], (req, res) => {
    const controller = new WashAndDryController()
    return controller.getWashQueueOrderDetails(req, res)
})

/**
 * @swagger
 * /wash-dry/order/queue/{id}/items/{itemId}/confirm-washing:
 *   patch:
 *     summary: Confirm a single item is present and ready for washing
 *     description: |
 *       Operator opens the "Confirm Item for Washing" modal per item.
 *       The modal shows the item's pretreatment comments and flag comments from S&P (read-only).
 *       The only input is checking "This item is present and ready for washing".
 *       Sets item.washStatus → complete and pushes to actionLog.
 *       When ALL items are confirmed, stationStatus → WASH_AND_DRY_STATION and
 *       washDetails.startedAt is set automatically. Returns allItemsConfirmed.
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f67890" }
 *     responses:
 *       200:
 *         description: Item confirmed for washing. Returns allItemsConfirmed flag.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     message:           { type: string, example: "Item confirmed for washing" }
 *                     allItemsConfirmed: { type: boolean, example: false }
 *       400:
 *         description: Item already confirmed
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(
    ROUTE_WASH_AND_DRY_CONFIRM_FOR_WASHING,
    [washAndDryAuth],
    (req, res) => {
        const controller = new WashAndDryController()
        return controller.confirmItemForWashing(req, res)
    },
)

/**
 * @swagger
 * /wash-dry/order/queue/{id}/items/{itemId}/undo-washing:
 *   patch:
 *     summary: Undo a single item's wash confirmation
 *     description: Reverts item.washStatus back to pending and clears machine details.
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f67890" }
 *     responses:
 *       200:
 *         description: Item wash confirmation undone
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Item wash confirmation undone" }
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(
    ROUTE_WASH_AND_DRY_UNDO_CONFIRM_FOR_WASHING,
    [washAndDryAuth],
    (req, res) => {
        const controller = new WashAndDryController()
        return controller.undoConfirmItemForWashing(req, res)
    },
)

/**
 * @swagger
 * /wash-dry/order/queue/{id}/items/{itemId}/hold:
 *   patch:
 *     summary: Place a specific item on hold
 *     description: |
 *       Operator clicks "Hold" on a specific item. The "Move to Hold" modal appears with:
 *       - reason: Item Missing | Item Mismatched
 *       - assignTo: Admin / Manager | Sort & Pretreat | Intake & Tag
 *       Hold details are stored on the item. The order stage moves to HOLD so it surfaces
 *       in the Hold Queue.
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f67890" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *               - assignTo
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [item_missing, item_mismatched]
 *                 example: item_missing
 *               assignTo:
 *                 type: string
 *                 enum: [admin_manager, sort_and_pretreat, intake_and_tag]
 *                 example: sort_and_pretreat
 *     responses:
 *       200:
 *         description: Item placed on hold successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Item placed on hold successfully" }
 *       400:
 *         description: reason or assignTo missing/invalid
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_WASH_AND_DRY_HOLD, [washAndDryAuth], (req, res) => {
    const controller = new WashAndDryController()
    return controller.sendToHold(req, res)
})

// ACTIVE WASH
/**
 * @swagger
 * /wash-dry/orders/active-wash:
 *   get:
 *     summary: Get orders currently being washed
 *     description: Orders that have been started but not yet moved to the dryer.
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of actively washing orders with startedAt and estFinishTime
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/BookOrder' }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(
    ROUTE_WASH_AND_DRY_GET_ACTIVE_WASHING,
    [washAndDryAuth],
    (req, res) => {
        const controller = new WashAndDryController()
        return controller.getActiveWash(req, res)
    },
)

/**
 * @swagger
 * /wash-dry/order/active-wash/{id}/move-to-drying:
 *   patch:
 *     summary: Move order from washing to drying
 *     description: Operator clicks "Move to Drying". Records movedToDryingAt, moves stage to DRYING.
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order transferred to dryer
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Order ORD-2024-002 has been transferred to the dryer" }
 *       404:
 *         description: Order not found or not currently being washed
 *       500:
 *         description: Server error
 */
router.patch(
    ROUTE_WASH_AND_DRY_MOVE_TO_DRYING,
    [washAndDryAuth],
    (req, res) => {
        const controller = new WashAndDryController()
        return controller.moveToDrying(req, res)
    },
)

// ACTIVE DRY
/**
 * @swagger
 * /wash-dry/orders/active-dry:
 *   get:
 *     summary: Get orders currently being dried
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of orders in DRYING stage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/BookOrder' }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_WASH_AND_ACTIVE_DRYING, [washAndDryAuth], (req, res) => {
    const controller = new WashAndDryController()
    return controller.getActiveDry(req, res)
})

/**
 * @swagger
 * /wash-dry/order/active-dry/{id}/complete:
 *   patch:
 *     summary: Mark wash & dry as done and send to ironing
 *     description: |
 *       Operator clicks "Wash & Dry Done" then "Send to Ironing".
 *       Records dryingCompletedAt.
 *       WASH_AND_IRON orders → IRONING stage.
 *       WASHING_ONLY orders → READY_FOR_DELIVERY stage.
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order successfully processed and sent to next stage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Order ORD-2024-001 has been successfully processed and sent to ironing" }
 *       404:
 *         description: Order not found or not in drying stage
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_WASH_AND_DRY_MARK_COMPLETE, [washAndDryAuth], (req, res) => {
    const controller = new WashAndDryController()
    return controller.washAndDryComplete(req, res)
})

// HOLD
/**
 * @swagger
 * /wash-dry/orders/hold:
 *   get:
 *     summary: Get hold queue — orders on hold at the wash & dry station
 *     description: Returns flattened list showing order ID, flagged items, hold reason, hold time, operator and assigned station.
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "ORD-2024-001" }
 *     responses:
 *       200:
 *         description: Paginated hold queue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     holdItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           orderId:    { type: string, example: "ORD-2024-001" }
 *                           fullName:   { type: string, example: "Jude Victor" }
 *                           holdReason: { type: string, example: "Item Missing" }
 *                           holdTime:   { type: string, format: date-time }
 *                           flaggedItems:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 itemId:   { type: string }
 *                                 tagId:    { type: string, example: "Tag-2024-001-01" }
 *                                 type:     { type: string, example: "Shirt" }
 *                                 flagNote: { type: string, example: "Item Missing" }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_WASH_AND_DRY_GET_HOLD, [washAndDryAuth], (req, res) => {
    const controller = new WashAndDryController()
    return controller.getHoldQueue(req, res)
})

/**
 * @swagger
 * /wash-dry/hold/{id}/release:
 *   patch:
 *     summary: Release an order from hold back to wash queue
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order released from hold and returned to wash queue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Order released from hold and returned to wash queue" }
 *       404:
 *         description: Order not found or not on hold
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_WASH_AND_DRY_RELEASE, [washAndDryAuth], (req, res) => {
    const controller = new WashAndDryController()
    return controller.releaseFromHold(req, res)
})

// HISTORY
/**
 * @swagger
 * /wash-dry/history:
 *   get:
 *     summary: Get history — orders that completed wash & dry and moved to ironing
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "Jude" }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date, example: "2026-01-01" }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date, example: "2026-04-13" }
 *     responses:
 *       200:
 *         description: Paginated history list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/BookOrder' }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_WASH_AND_DRY_HISTORY, [washAndDryAuth], (req, res) => {
    const controller = new WashAndDryController()
    return controller.getHistoryList(req, res)
})

/**
 * @swagger
 * /wash-dry/history/{id}/timeline:
 *   get:
 *     summary: Get order timeline — pipeline stepper for history view
 *     description: |
 *       Returns the same 8-step pipeline stepper as the S&P history:
 *       Intake → Tagged → Pretreated → Washed → Ironing → QC Passed → Ready → Delivered.
 *       Each step has completed (boolean) and timestamp (null if not yet reached).
 *     tags:
 *       - Wash & Dry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order timeline
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     order:
 *                       type: object
 *                       properties:
 *                         oscNumber:     { type: string, example: "ORD-2024-001" }
 *                         fullName:      { type: string, example: "Jude Victor" }
 *                         serviceType:   { type: string, example: "wash-and-iron" }
 *                         serviceTier:   { type: string, example: "standard" }
 *                         trackingStatus: { type: string, enum: [in_progress, completed] }
 *                         washDetails:
 *                           type: object
 *                           properties:
 *                             startedAt:        { type: string, format: date-time }
 *                             estFinishTime:    { type: string, format: date-time }
 *                             movedToDryingAt:  { type: string, format: date-time }
 *                             dryingCompletedAt: { type: string, format: date-time }
 *                     pipeline:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key:       { type: string, example: "washed" }
 *                           label:     { type: string, example: "Washed" }
 *                           completed: { type: boolean, example: true }
 *                           timestamp: { type: string, format: date-time, nullable: true }
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.get(
    ROUTE_WASH_AND_DRY_HISTORY_TIMELINE,
    [washAndDryAuth],
    (req, res) => {
        const controller = new WashAndDryController()
        return controller.getOrderTimeline(req, res)
    },
)

module.exports = router
