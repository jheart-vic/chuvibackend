const router = require('express').Router()
const PressAndIronController = require('../controllers/pressAndIron.controller')
const pressAndIronAuth = require('../middlewares/pressAndIronAuth')
const {
    ROUTE_PRESS_IRON_DASHBOARD,
    ROUTE_PRESS_IRON_QUEUE,
    ROUTE_PRESS_IRON_QUEUE_SINGLE,
    ROUTE_PRESS_IRON_CONFIRM_FOR_PRESSING,
    ROUTE_PRESS_IRON_UNDO_CONFIRM_FOR_PRESSING,
    ROUTE_PRESS_IRON_HOLD,
    ROUTE_PRESS_IRON_GET_ACTIVE_PRESS,
    ROUTE_PRESS_IRON_PRESS_DONE,
    ROUTE_PRESS_IRON_GET_HOLD,
    ROUTE_PRESS_IRON_RELEASE,
    ROUTE_PRESS_IRON_HISTORY,
    ROUTE_PRESS_IRON_HISTORY_TIMELINE,
} = require('../util/page-route')

/**
 * @swagger
 * /press-iron/dashboard:
 *   get:
 *     summary: Get Press & Iron dashboard overview
 *     description: Returns stats (Press Queue, Active Press, Completed Today) and recent press queue preview.
 *     tags:
 *       - Press & Iron
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
 *                     data:
 *                       type: object
 *                       properties:
 *                         pressQueue:     { type: integer, example: 2 }
 *                         activePress:    { type: integer, example: 0 }
 *                         completedToday: { type: integer, example: 0 }
 *                     recentQueue:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/BookOrder' }
 *       500:
 *         description: Server error
 */
router.get(ROUTE_PRESS_IRON_DASHBOARD, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.getDashboard(req, res)
})

/**
 * @swagger
 * /press-iron/orders/queue:
 *   get:
 *     summary: Get press queue — orders in IRONING stage waiting to be pressed
 *     tags:
 *       - Press & Iron
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
 *         description: Paginated list of orders with flaggedItemCount, allItemsConfirmed and confirmedItemCount per order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/BookOrder' }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_PRESS_IRON_QUEUE, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.getPressQueue(req, res)
})

/**
 * @swagger
 * /press-iron/order/queue/{id}:
 *   get:
 *     summary: Get single order details from press queue
 *     description: Returns full order with item list (Type, Color, pressStatus per item) and allItemsConfirmed flag.
 *     tags:
 *       - Press & Iron
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order details with allItemsConfirmed flag
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     order: { $ref: '#/components/schemas/BookOrder' }
 *                     allItemsConfirmed: { type: boolean, example: false }
 *       404:
 *         description: Order not found or not in ironing stage
 *       500:
 *         description: Server error
 */
router.get(ROUTE_PRESS_IRON_QUEUE_SINGLE, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.getPressQueueOrderDetails(req, res)
})

/**
 * @swagger
 * /press-iron/order/queue/{id}/items/{itemId}/confirm-pressing:
 *   patch:
 *     summary: Confirm a single item is present and ready for pressing
 *     description: |
 *       Operator clicks "Start pressing" per item. The "Confirm Item for Pressing" modal shows
 *       item name, Tag ID and color (read-only). The only input is:
 *       "This item is present and ready for pressing or ironing" checkbox.
 *       Sets item.pressStatus → complete and pushes to actionLog.
 *       When ALL items are confirmed, stationStatus → PRESSING_AND_IRONING_STATION and
 *       pressDetails.startedAt is set automatically. Returns allItemsConfirmed.
 *     tags:
 *       - Press & Iron
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
 *         description: Item confirmed for pressing. Returns allItemsConfirmed flag.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     message:           { type: string, example: "Item confirmed for pressing" }
 *                     allItemsConfirmed: { type: boolean, example: false }
 *       400:
 *         description: Item already confirmed
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_PRESS_IRON_CONFIRM_FOR_PRESSING, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.confirmItemForPressing(req, res)
})

/**
 * @swagger
 * /press-iron/order/queue/{id}/items/{itemId}/undo-pressing:
 *   patch:
 *     summary: Undo a single item's press confirmation
 *     description: Reverts item.pressStatus back to pending.
 *     tags:
 *       - Press & Iron
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
 *         description: Item press confirmation undone
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Item press confirmation undone" }
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_PRESS_IRON_UNDO_CONFIRM_FOR_PRESSING, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.undoConfirmItemForPressing(req, res)
})

/**
 * @swagger
 * /press-iron/order/queue/{id}/items/{itemId}/hold:
 *   patch:
 *     summary: Place a specific item on hold
 *     description: |
 *       Operator clicks "Hold" per item. The "Move to Hold" modal shows:
 *       - reason: Item Missing | Item Mismatched (radio)
 *       - assignTo: Admin / Manager | Sort & Pretreat | Intake & Tag (radio)
 *       Hold details stored on item. Order stage → HOLD, stationStatus → PRESSING_AND_IRONING_STATION.
 *     tags:
 *       - Press & Iron
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
 *             required: [reason, assignTo]
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
router.patch(ROUTE_PRESS_IRON_HOLD, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.sendToHold(req, res)
})

/**
 * @swagger
 * /press-iron/orders/active-press:
 *   get:
 *     summary: Get orders currently being pressed
 *     description: Orders where pressDetails.startedAt is set and completedAt is not yet set.
 *     tags:
 *       - Press & Iron
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of actively pressing orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/BookOrder' }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_PRESS_IRON_GET_ACTIVE_PRESS, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.getActivePress(req, res)
})

/**
 * @swagger
 * /press-iron/order/active-press/{id}/complete:
 *   patch:
 *     summary: Mark pressing as done and send to QC
 *     description: |
 *       Operator clicks "Press done" then "Send to QC".
 *       Records pressDetails.completedAt.
 *       stage → QC, stationStatus → QC_STATION.
 *     tags:
 *       - Press & Iron
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order successfully processed and sent to QC
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Order ORD-2024-001 has been successfully processed and sent to QC" }
 *       404:
 *         description: Order not found or not currently being pressed
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_PRESS_IRON_PRESS_DONE, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.pressDone(req, res)
})

/**
 * @swagger
 * /press-iron/orders/hold:
 *   get:
 *     summary: Get hold queue — orders on hold at the press & iron station
 *     description: |
 *       Returns flattened list showing:
 *       Order ID, Item ID, Type, Reason, Hold Time, Operator, Assigned (station), Status.
 *       Scoped to PRESSING_AND_IRONING_STATION only.
 *     tags:
 *       - Press & Iron
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
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           orderId:       { type: string, example: "ORD-2024-001" }
 *                           fullName:      { type: string, example: "Jude Victor" }
 *                           holdReason:    { type: string, example: "item_missing" }
 *                           holdTime:      { type: string, format: date-time }
 *                           operator:   { type: string, example: "Victor Jp" }
 *                           stationStatus: { type: string, example: "pressing-and-ironing-station" }
 *                           flaggedItems:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 itemId:   { type: string }
 *                                 tagId:    { type: string, example: "Tag-2024-001-01" }
 *                                 type:     { type: string, example: "Shirt" }
 *                                 flagNote: { type: string, example: "item_missing" }
 *                                 holdDetails:
 *                                   type: object
 *                                   properties:
 *                                     reason:   { type: string, example: "item_missing" }
 *                                     assignTo: { type: string, example: "sort_and_pretreat" }
 *                                     heldAt:   { type: string, format: date-time }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_PRESS_IRON_GET_HOLD, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.getHoldQueue(req, res)
})

/**
 * @swagger
 * /press-iron/order/hold/{id}/release:
 *   patch:
 *     summary: Release an order from hold back to press queue
 *     description: Moves order back to IRONING stage, stationStatus stays PRESSING_AND_IRONING_STATION.
 *     tags:
 *       - Press & Iron
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order released from hold and returned to press queue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Order released from hold and returned to press queue" }
 *       404:
 *         description: Order not found or not on hold at this station
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_PRESS_IRON_RELEASE, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.releaseFromHold(req, res)
})

/**
 * @swagger
 * /press-iron/orders/history:
 *   get:
 *     summary: Get history — orders that completed pressing and moved to QC
 *     tags:
 *       - Press & Iron
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
 *         schema: { type: string, format: date, example: "2026-04-15" }
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
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/BookOrder' }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_PRESS_IRON_HISTORY, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.getHistoryList(req, res)
})

/**
 * @swagger
 * /press-iron/order/history/{id}/timeline:
 *   get:
 *     summary: Get order timeline — pipeline stepper + per-item audit log
 *     description: |
 *       Returns the 8-step pipeline stepper:
 *       Intake → Tagged → Pretreated → Washed → Ironing → QC Passed → Ready → Delivered.
 *       Each step has completed (boolean) and timestamp (null if not yet reached).
 *       Also returns itemTimeline — granular per-item action log (press_confirmed, item_held, etc.)
 *     tags:
 *       - Press & Iron
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
 *                         oscNumber:      { type: string, example: "ORD-2024-001" }
 *                         fullName:       { type: string, example: "Jude Victor" }
 *                         serviceType:    { type: string, example: "wash-and-iron" }
 *                         serviceTier:    { type: string, example: "standard" }
 *                         trackingStatus: { type: string, enum: [in_progress, completed] }
 *                         pressDetails:
 *                           type: object
 *                           properties:
 *                             startedAt:   { type: string, format: date-time }
 *                             completedAt: { type: string, format: date-time }
 *                     pipeline:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key:       { type: string, example: "ironing" }
 *                           label:     { type: string, example: "Ironing" }
 *                           completed: { type: boolean, example: true }
 *                           timestamp: { type: string, format: date-time, nullable: true }
 *                     itemTimeline:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           itemId:    { type: string }
 *                           itemType:  { type: string, example: "shirt" }
 *                           tagId:     { type: string, example: "Tag-2024-001-01" }
 *                           action:    { type: string, example: "press_confirmed" }
 *                           note:      { type: string }
 *                           timestamp: { type: string, format: date-time }
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.get(ROUTE_PRESS_IRON_HISTORY_TIMELINE, [pressAndIronAuth], (req, res) => {
    const controller = new PressAndIronController()
    return controller.getOrderTimeline(req, res)
})

module.exports = router