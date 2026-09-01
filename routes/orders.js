const express = require('express')
const router = express.Router()
const HandoffController = require('../controllers/handoff.controller')
const multiAuth = require('../middlewares/multiAuth')
const { ROLE } = require('../util/constants')
const {
    ROUTE_HANDOFFS_PENDING,
    ROUTE_ORDER_HANDOFF,
    ROUTE_ORDER_HANDOFF_CONFIRM,
    ROUTE_ORDER_SPLIT_STATE,
} = require('../util/page-route')

// Station operators (+ admin) drive the production split-flow.
const stationAuth = multiAuth(
    ROLE.ADMIN,
    ROLE.INTAKE_AND_TAG,
    ROLE.SORT_AND_PRETREAT,
    ROLE.WASH_AND_DRY,
    ROLE.PRESS,
    ROLE.QC,
)

/**
 * @swagger
 * /orders/handoffs/pending:
 *   get:
 *     summary: Inbound handoff queue
 *     tags: [Split-Flow]
 *     description: "Pending handoffs waiting to be confirmed by a receiving station. Optionally filter to one station with ?toStation=. Sorted oldest-first."
 *     parameters:
 *       - in: query
 *         name: toStation
 *         required: false
 *         schema:
 *           type: string
 *           enum: [intake-and-tag-station, sort-and-pretreat-station, wash-and-dry-station, pressing-and-ironing-station, qc-station]
 *         description: Only return handoffs bound for this station.
 *     responses:
 *       200:
 *         description: Pending handoffs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/PendingHandoff' }
 */
router.get(ROUTE_HANDOFFS_PENDING, [stationAuth], (req, res) => {
    const controller = new HandoffController()
    return controller.pendingQueue(req, res)
})

/**
 * @swagger
 * /orders/{id}/handoff:
 *   post:
 *     summary: Push items to the next station
 *     tags: [Split-Flow]
 *     description: "Push completed items from one station to the next, creating a PENDING handoff (items advance only once the receiving station confirms). Gates: S1→S2 (intake→sort) and S4→S5 (press→qc) must move the WHOLE order; the stretch zone S2↔S3↔S4 allows partial pushes. Every pushed item must be completed at the source station. Omit itemIds to push all completed items at the source station. A repeat push for the same from→to merges into the existing pending handoff."
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromStation, toStation]
 *             properties:
 *               fromStation:
 *                 type: string
 *                 enum: [intake-and-tag-station, sort-and-pretreat-station, wash-and-dry-station, pressing-and-ironing-station, qc-station]
 *                 example: sort-and-pretreat-station
 *               toStation:
 *                 type: string
 *                 enum: [sort-and-pretreat-station, wash-and-dry-station, pressing-and-ironing-station, qc-station]
 *                 example: wash-and-dry-station
 *               itemIds:
 *                 type: array
 *                 description: Specific item ids to push. Omit to push all completed items at the source station.
 *                 items: { type: string }
 *               note: { type: string, example: "" }
 *     responses:
 *       200:
 *         description: Handoff created (pending)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/Handoff' }
 *       400:
 *         description: Gate/completion violation or invalid stations
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ORDER_HANDOFF, [stationAuth], (req, res) => {
    const controller = new HandoffController()
    return controller.push(req, res)
})

/**
 * @swagger
 * /orders/{id}/handoff/{hid}/confirm:
 *   post:
 *     summary: Confirm a received handoff
 *     tags: [Split-Flow]
 *     description: "The receiving station confirms a pending handoff. Accepted items advance to the toStation; any rejectedItems[] are placed on Hold (assigned back to the source station) and stay put. The order's stage.status is recomputed as the least-advanced station any item now sits at. HARD GATES: on the whole-order transitions (S1 intake→sort and S4 press→QC) a PARTIAL confirm is refused — rejectedItems must be empty (accept every item) or list every item in the handoff (send the whole order back). Nothing partial may reach QC. Partial confirms are allowed only in the stretch zone (S2↔S3↔S4)."
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Order ID
 *       - in: path
 *         name: hid
 *         required: true
 *         schema: { type: string }
 *         description: Handoff ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rejectedItems:
 *                 type: array
 *                 description: "Subset of the handoff's item ids to reject to Hold. On a whole-order gate (intake→sort, press→QC) only two values are accepted: omitted/empty, or every item id in the handoff — a partial rejection is refused with 400."
 *                 items: { type: string }
 *               note: { type: string, example: "2 items still wet" }
 *     responses:
 *       200:
 *         description: Handoff confirmed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         handoffId: { type: string, example: 64d1f9a2e3c3b4a1d2f1c1a0 }
 *                         status: { type: string, enum: [confirmed, rejected], example: confirmed }
 *                         confirmedCount: { type: number, example: 3 }
 *                         rejectedItemIds: { type: array, items: { type: string } }
 *                         stageStatus: { type: string, example: washing }
 *                         stationStatus: { type: string, example: wash-and-dry-station }
 *       400:
 *         description: Already confirmed or invalid rejectedItems
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ORDER_HANDOFF_CONFIRM, [stationAuth], (req, res) => {
    const controller = new HandoffController()
    return controller.confirm(req, res)
})

/**
 * @swagger
 * /orders/{id}/split-state:
 *   get:
 *     summary: Per-station breakdown of an order
 *     tags: [Split-Flow]
 *     description: "Where every item in the order currently sits, counts per station, and any pending handoffs."
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Split state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/OrderSplitState' }
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_ORDER_SPLIT_STATE, [stationAuth], (req, res) => {
    const controller = new HandoffController()
    return controller.splitState(req, res)
})

module.exports = router
