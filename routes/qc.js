const router = require('express').Router()
const QCController = require('../controllers/qc.controller')
const qcAuth = require('../middlewares/qcAuth')
const {
    ROUTE_QC_DASHBOARD,
    ROUTE_QC_QUEUE,
    ROUTE_QC_QUEUE_SINGLE,
    ROUTE_QC_CONFIRM_ITEM,
    ROUTE_QC_UNDO_CONFIRM_ITEM,
    ROUTE_QC_PASS_ORDER,
    ROUTE_QC_PACK_AND_SEAL_DETAIL,
    ROUTE_QC_PACK_AND_SEAL_COMPLETE,
    ROUTE_QC_READY_ORDERS,
    ROUTE_QC_HOLD,
    ROUTE_QC_GET_HOLD,
    ROUTE_QC_RELEASE,
    ROUTE_QC_HISTORY,
    ROUTE_QC_HISTORY_TIMELINE,
    ROUTE_QC_PACK_AND_SEAL,
} = require('../util/page-route')

// ── Dashboard ──────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /qc-user/dashboard:
 *   get:
 *     summary: QC dashboard overview
 *     description: |
 *       Returns four stat cards and a recent queue list:
 *       - **qcQueue** — orders awaiting QC inspection
 *       - **activeQC** — orders currently being inspected
 *       - **packing** — orders that passed QC, awaiting Pack & Seal
 *       - **ready** — orders packed and ready for delivery
 *     tags:
 *       - QC
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
 *                         qcQueue:   { type: integer, example: 2 }
 *                         activeQC:  { type: integer, example: 0 }
 *                         packing:   { type: integer, example: 0 }
 *                         ready:     { type: integer, example: 0 }
 *                     recentQueue:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/BookOrder' }
 *       500:
 *         description: Server error
 */
router.get(ROUTE_QC_DASHBOARD, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.getDashboard(req, res)
})

// ── QC Queue ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /qc-user/orders/queue:
 *   get:
 *     summary: Get QC queue — orders awaiting inspection
 *     tags:
 *       - QC
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "OSC-001" }
 *     responses:
 *       200:
 *         description: Paginated QC queue
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
router.get(ROUTE_QC_QUEUE, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.getQCQueue(req, res)
})

/**
 * @swagger
 * /qc-user/order/queue/{id}:
 *   get:
 *     summary: Get single order details for QC inspection
 *     tags:
 *       - QC
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order with items and allItemsPassed flag
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     order: { $ref: '#/components/schemas/BookOrder' }
 *                     allItemsPassed: { type: boolean, example: false }
 *       404:
 *         description: Order not found or not in QC stage
 *       500:
 *         description: Server error
 */
router.get(ROUTE_QC_QUEUE_SINGLE, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.getQCQueueOrderDetails(req, res)
})

/**
 * @swagger
 * /qc-user/order/queue/{id}/items/{itemId}/confirm:
 *   patch:
 *     summary: Mark a single item as QC passed
 *     description: |
 *       Sets item `qcStatus` to `passed`. On the first item confirmation,
 *       `qcDetails.startedAt` and `qcDetails.operatorId` are recorded.
 *       Returns `allItemsPassed` flag so the frontend knows when to enable
 *       the "Pass QC" button.
 *     tags:
 *       - QC
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
 *         description: Item marked as QC passed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: "Item marked as QC passed" }
 *                     allItemsPassed: { type: boolean, example: false }
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_QC_CONFIRM_ITEM, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.confirmItemQC(req, res)
})

/**
 * @swagger
 * /qc-user/order/queue/{id}/items/{itemId}/undo-confirm:
 *   patch:
 *     summary: Undo QC pass for a single item
 *     tags:
 *       - QC
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
 *         description: Item QC status undone
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Item QC status undone" }
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_QC_UNDO_CONFIRM_ITEM, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.undoConfirmItemQC(req, res)
})

/**
 * @swagger
 * /qc-user/order/queue/{id}/pass:
 *   patch:
 *     summary: Pass QC — send order to Pack & Seal
 *     description: |
 *       All items must have `qcStatus: passed` before this can be called.
 *       Sets `qcDetails.passedAt` on the order. The order remains in `QC`
 *       stage status but now surfaces in the Pack & Seal list.
 *     tags:
 *       - QC
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order passed QC and sent to Pack & Seal
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Order passed QC and sent to Pack & Seal" }
 *       400:
 *         description: Not all items have passed QC
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_QC_PASS_ORDER, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.passQC(req, res)
})

// ── Pack & Seal ────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /qc-user/orders/pack-and-seal:
 *   get:
 *     summary: Get orders in Pack & Seal stage
 *     description: Orders that have passed QC but not yet been packed and sealed.
 *     tags:
 *       - QC
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "OSC-001" }
 *     responses:
 *       200:
 *         description: Paginated Pack & Seal list
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
router.get(ROUTE_QC_PACK_AND_SEAL, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.getPackAndSealList(req, res)
})

/**
 * @swagger
 * /qc-user/order/pack-and-seal/{id}:
 *   get:
 *     summary: Get single order for Pack & Seal
 *     tags:
 *       - QC
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order details for packing
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
 *         description: Order not found or not in Pack & Seal stage
 *       500:
 *         description: Server error
 */
router.get(ROUTE_QC_PACK_AND_SEAL_DETAIL, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.getPackAndSealDetail(req, res)
})

/**
 * @swagger
 * /qc-user/order/pack-and-seal/{id}/complete:
 *   patch:
 *     summary: Complete Pack & Seal — move order to Ready
 *     description: |
 *       Operator completes the Pack & Seal checklist:
 *       - `labelAttached`: true
 *       - `packageSealed`: true
 *
 *       Both must be true. On success the order moves to `READY` status
 *       and surfaces in Ready Orders for delivery dispatch.
 *     tags:
 *       - QC
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [labelAttached, packageSealed]
 *             properties:
 *               labelAttached:  { type: boolean, example: true }
 *               packageSealed:  { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Order packed and sealed, now ready for delivery
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Order packed and sealed. Now ready for delivery." }
 *       400:
 *         description: Checklist incomplete
 *       404:
 *         description: Order not found or not in Pack & Seal stage
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_QC_PACK_AND_SEAL_COMPLETE, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.packAndSealComplete(req, res)
})

// ── Ready Orders ───────────────────────────────────────────────────────────────

/**
 * @swagger
 * /qc-user/orders/ready:
 *   get:
 *     summary: Get ready orders — packed and awaiting delivery dispatch
 *     tags:
 *       - QC
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "OSC-001" }
 *     responses:
 *       200:
 *         description: Paginated ready orders
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
router.get(ROUTE_QC_READY_ORDERS, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.getReadyOrders(req, res)
})

// ── Hold ───────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /qc-user/order/queue/{id}/items/{itemId}/hold:
 *   patch:
 *     summary: Place a specific item on hold and assign to another station
 *     description: |
 *       QC operator places a problematic item on hold and assigns it to
 *       admin, press & iron, or wash & dry for resolution. Hold details
 *       are stored on the item with `heldByStation` set to qc-station.
 *       The order routes to the assigned station's hold queue. QC can
 *       monitor it in their hold queue (raised_by_us) but cannot release it.
 *     tags:
 *       - QC
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
 *                 enum: [admin, press-and-iron, wash-and-dry]
 *                 example: press-and-iron
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
 *         description: reason or assignTo missing or invalid
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_QC_HOLD, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.sendToHold(req, res)
})

/**
 * @swagger
 * /qc-user/orders/hold:
 *   get:
 *     summary: Get hold queue — assigned to us and raised by us
 *     description: |
 *       Returns two categories of held orders for QC:
 *
 *       **assigned_to_us** — orders assigned to QC by Press & Iron or another
 *       station. QC is responsible for fixing and releasing these back to
 *       the QC queue.
 *
 *       **raised_by_us** — orders QC placed on hold and assigned elsewhere.
 *       Read-only monitoring. QC cannot release these.
 *
 *       Use the `holdType` field to separate them in the UI.
 *     tags:
 *       - QC
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "OSC-001" }
 *     responses:
 *       200:
 *         description: Paginated hold queue with holdType per order
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
 *                           orderId:       { type: string }
 *                           oscNumber:     { type: string, example: "OSC-20260428-321782" }
 *                           fullName:      { type: string, example: "Jude Victor" }
 *                           stationStatus: { type: string, example: "pressing-and-ironing-station" }
 *                           holdType:
 *                             type: string
 *                             enum: [assigned_to_us, raised_by_us]
 *                             example: assigned_to_us
 *                           holdReason:    { type: string, example: "item_missing" }
 *                           holdTime:      { type: string, format: date-time }
 *                           flaggedItems:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 itemId:        { type: string }
 *                                 tagId:         { type: string }
 *                                 type:          { type: string, example: "shirt" }
 *                                 flagNote:      { type: string }
 *                                 holdReason:    { type: string, example: "item_missing" }
 *                                 assignTo:      { type: string, example: "press-and-iron" }
 *                                 heldByStation: { type: string, example: "qc-station" }
 *                                 heldAt:        { type: string, format: date-time }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_QC_GET_HOLD, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.getHoldQueue(req, res)
})

/**
 * @swagger
 * /qc-user/order/hold/{id}/release:
 *   patch:
 *     summary: Release an order from hold back to QC queue
 *     description: |
 *       Only available for orders with `holdType: assigned_to_us`. Releases
 *       the order back to `qc` status so it re-enters the QC queue.
 *       Stamps `releasedAt` and `releasedByOperatorId` on all held items
 *       for audit trail.
 *     tags:
 *       - QC
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order released and returned to QC queue
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Order released from hold and returned to QC queue
 *       404:
 *         description: Order not found or not on hold at this station
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_QC_RELEASE, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.releaseFromHold(req, res)
})

// ── History ────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /qc-user/orders/history:
 *   get:
 *     summary: Get history — orders that have passed through QC
 *     description: Orders that have passed QC and Pack & Seal and moved to Ready or beyond.
 *     tags:
 *       - QC
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "OSC-001" }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date, example: "2026-01-01" }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date, example: "2026-04-30" }
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
router.get(ROUTE_QC_HISTORY, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.getHistoryList(req, res)
})

/**
 * @swagger
 * /qc-user/order/history/{id}/timeline:
 *   get:
 *     summary: Get full order timeline — pipeline stepper + per-item audit log
 *     description: |
 *       Returns the 8-step pipeline stepper (Intake → Tagged → Pretreated →
 *       Washed → Ironing → QC Passed → Ready → Delivered) with timestamps,
 *       plus a granular per-item action log sorted chronologically.
 *     tags:
 *       - QC
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
 *                         oscNumber:     { type: string, example: "OSC-20260428-321782" }
 *                         fullName:      { type: string, example: "Jude Victor" }
 *                         serviceType:   { type: string, example: "wash-and-iron" }
 *                         trackingStatus: { type: string, enum: [in_progress, completed] }
 *                     pipeline:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key:       { type: string, example: "qc_passed" }
 *                           label:     { type: string, example: "QC Passed" }
 *                           completed: { type: boolean, example: true }
 *                           timestamp: { type: string, format: date-time, nullable: true }
 *                     itemTimeline:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           itemId:    { type: string }
 *                           itemType:  { type: string, example: "shirt" }
 *                           action:    { type: string, example: "qc_passed" }
 *                           note:      { type: string }
 *                           timestamp: { type: string, format: date-time }
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.get(ROUTE_QC_HISTORY_TIMELINE, [qcAuth], (req, res) => {
    const controller = new QCController()
    return controller.getOrderTimeline(req, res)
})

module.exports = router