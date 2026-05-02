const router = require('express').Router()
const SortAndPretreatController = require('../controllers/sortAndPretreat.controller')
const sortAndPretreatAuth = require('../middlewares/sortAndPretreatAuth')
const {
    ROUTE_SORT_AND_PRETREAT_ORDER_QUEUE,
    ROUTE_SORT_AND_PRETREAT_SINGLE_ORDER,
    ROUTE_SORT_AND_PRETREAT_UPDATE_ITEM,
    ROUTE_SORT_AND_PRETREAT_MARK_ITEM_SORTED,
    ROUTE_SORT_AND_PRETREAT_UNMARK_SORTED_ITEM,
    ROUTE_SORT_AND_PRETREAT_MARK_ALL_AS_SORTED,
    ROUTE_SORT_AND_PRETREAT_MARK_AS_PRETREATED,
    ROUTE_SORT_AND_PRETREAT_MARK_UNDO_PRETREATED,
    ROUTE_SORT_AND_PRETREAT_MARK_AS_FLAGGED,
    ROUTE_SORT_AND_PRETREAT_NEXT_STAGE,
    ROUTE_SORT_AND_PRETREAT_GET_FLAGGED,
    ROUTE_SORT_AND_PRETREAT_GET_COMPLETED,
    ROUTE_SORT_AND_PRETREAT_WASHING,
    ROUTE_SORT_AND_PRETREAT_WASHING_SINGLE,
    ROUTE_SORT_AND_PRETREAT_IRONING,
    ROUTE_SORT_AND_PRETREAT_IRONING_SINGLE,
    ROUTE_SORT_AND_PRETREAT_HISTORY,
    ROUTE_SORT_AND_PRETREAT_HISTORY_TIMELINE,
    ROUTE_SORT_AND_PRETREAT_GET_DASHBOARD,
    ROUTE_SORT_AND_PRETREAT_SORTED_ORDER_DETAIL,
    ROUTE_SORT_AND_PRETREAT_FLAGGED_ORDER_DETAIL
} = require('../util/page-route')

/**
 * @swagger
 * /sort-pretreat/dashboard:
 *   get:
 *     summary: Dashboard overview — stats + recent order queue
 *     tags:
 *       - Sort & Pretreat
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
 *         description: Dashboard stats and recent orders
 */
router.get(ROUTE_SORT_AND_PRETREAT_GET_DASHBOARD, [sortAndPretreatAuth], (req, res) => {
    const controller = new SortAndPretreatController()
    return controller.getDashboard(req, res)
})

// ORDER QUEUE

/**
 * @swagger
 * /sort-pretreat/orders/queue:
 *   get:
 *     summary: Get all orders in the sort & pretreat queue
 *     tags:
 *       - Sort & Pretreat
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
 *         description: Search by oscNumber, fullName or phoneNumber
 *     responses:
 *       200:
 *         description: Paginated list of orders in SORT_AND_PRETREAT stage
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
    ROUTE_SORT_AND_PRETREAT_ORDER_QUEUE,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getOrderQueue(req, res)
    },
)

/**
 * @swagger
 * /sort-pretreat/order/{id}:
 *   get:
 *     summary: Get single order details (must be in sort & pretreat stage)
 *     tags:
 *       - Sort & Pretreat
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order with items, allItemsSorted, allItemsPretreated and readyToSend flags
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     order: { $ref: '#/components/schemas/BookOrder' }
 *                     allItemsSorted: { type: boolean, example: false }
 *                     allItemsPretreated: { type: boolean, example: false }
 *                     readyToSend: { type: boolean, example: false }
 *       404:
 *         description: Order not found or not in sort & pretreat stage
 *       500:
 *         description: Server error
 */
router.get(
    ROUTE_SORT_AND_PRETREAT_SINGLE_ORDER,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getOrderDetails(req, res)
    },
)

// ITEM SORT DETAILS (auto-save)

/**
 * @swagger
 * /sort-pretreat/order/{id}/items/{itemId}/sort-details:
 *   patch:
 *     summary: Auto-save sort & pretreat details for a single item
 *     description: |
 *       All fields are optional per call. The frontend can call this as the
 *       operator makes selections (colorGroup, fabricType, pretreatmentOptions,
 *       damageRiskFlags, itemNote) without waiting for the final Mark buttons
 *       Note: if fabricType is provided,
 *       colorGroup must also be provided in the same request or already saved
*        on the item — fabricType cannot be set without a color context..
 *     tags:
 *       - Sort & Pretreat
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
 *             properties:
 *               colorGroup:
 *                 type: string
 *                 enum: [white, colored]
 *                 example: white
 *               fabricType:
 *                 type: string
 *                 enum: [delicate, light, heavy]
 *                 example: light
 *               pretreatmentOptions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum:
 *                     - stain_treatment_required
 *                     - odor_removal
 *                     - spot_cleaning
 *                     - special_detergent
 *                     - fabric_softener_prep
 *                     - no_pretreatment_needed
 *                 example: ["odor_removal", "spot_cleaning"]
 *               damageRiskFlags:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum:
 *                     - tears_damage
 *                     - color_bleeding_risk
 *                     - shrink_risk
 *                     - missing_parts
 *                 example: ["shrink_risk"]
 *               itemNote:
 *                 type: string
 *                 example: "Use fresh savoring detergent on this item"
 *     responses:
 *       200:
 *         description: Item details saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Item details saved successfully" }
 *       400:
 *         description: Validation error
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(
    ROUTE_SORT_AND_PRETREAT_UPDATE_ITEM,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.updateItemSortDetails(req, res)
    },
)

// MARK SORTED

/**
 * @swagger
 * /sort-pretreat/{id}/items/{itemId}/mark-sorted:
 *   patch:
 *     summary: Mark a single item as sorted
 *     tags:
 *       - Sort & Pretreat
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
 *         description: Item marked as sorted. Returns allItemsSorted flag.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: "Item marked as sorted" }
 *                     allItemsSorted: { type: boolean, example: false }
 *       400:
 *         description: Item already marked as sorted
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(
    ROUTE_SORT_AND_PRETREAT_MARK_ITEM_SORTED,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.markItemAsSorted(req, res)
    },
)

/**
 * @swagger
 * /sort-pretreat/{id}/items/{itemId}/undo-sorted:
 *   patch:
 *     summary: Undo sorted status for a single item
 *     tags:
 *       - Sort & Pretreat
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
 *         description: Item sort undone successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Item sort undone successfully" }
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(
    ROUTE_SORT_AND_PRETREAT_UNMARK_SORTED_ITEM,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.undoMarkItemAsSorted(req, res)
    },
)

/**
 * @swagger
 * /sort-pretreat/order/{id}/mark-all-sorted:
 *   patch:
 *     summary: Mark all items in an order as sorted at once
 *     tags:
 *       - Sort & Pretreat
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: All items marked as sorted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: "All items marked as sorted successfully" }
 *                     allItemsSorted: { type: boolean, example: true }
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.patch(
    ROUTE_SORT_AND_PRETREAT_MARK_ALL_AS_SORTED,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.markAllItemsAsSorted(req, res)
    },
)

// MARK PRETREATED

/**
 * @swagger
 * /sort-pretreat/order/{id}/items/{itemId}/mark-pretreated:
 *   patch:
 *     summary: Mark a single item as pretreated
 *     tags:
 *       - Sort & Pretreat
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
 *         description: Item marked as pretreated. Returns readyToSend flag.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: "Item marked as pretreated" }
 *                     allItemsSorted: { type: boolean, example: true }
 *                     allItemsPretreated: { type: boolean, example: false }
 *                     readyToSend: { type: boolean, example: false }
 *       400:
 *         description: Item already marked as pretreated
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(
    ROUTE_SORT_AND_PRETREAT_MARK_AS_PRETREATED,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.markItemAsPretreated(req, res)
    },
)

/**
 * @swagger
 * /sort-pretreat/order/{id}/items/{itemId}/undo-pretreated:
 *   patch:
 *     summary: Undo pretreated status for a single item
 *     tags:
 *       - Sort & Pretreat
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
 *         description: Item pretreat status undone successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Item pretreat status undone successfully" }
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(
    ROUTE_SORT_AND_PRETREAT_MARK_UNDO_PRETREATED,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.undoMarkItemAsPretreated(req, res)
    },
)

// FLAG ITEM

/**
 * @swagger
 * /sort-pretreat/order/{id}/items/{itemId}/flag:
 *   patch:
 *     summary: Flag a specific item for review
 *     tags:
 *       - Sort & Pretreat
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
 *               - note
 *             properties:
 *               note:
 *                 type: string
 *                 example: "Fabric is torn at the seam, needs supervisor review"
 *     responses:
 *       200:
 *         description: Item flagged for review successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Item flagged for review successfully" }
 *       400:
 *         description: Note is required
 *       404:
 *         description: Order or item not found
 *       500:
 *         description: Server error
 */
router.patch(
    ROUTE_SORT_AND_PRETREAT_MARK_AS_FLAGGED,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.flagItemForReview(req, res)
    },
)

// SEND TO NEXT STAGE

/**
 * @swagger
 * /sort-pretreat/{id}/send-to-next-stage:
 *   patch:
 *     summary: Send order to washing or ironing stage
 *     description: |
 *       Only active when ALL items have both sortStatus and pretreatStatus = complete.
 *       Routes to WASHING for WASHING_ONLY and WASH_AND_IRON orders.
 *       Routes to IRONING for IRONING_ONLY orders.
 *     tags:
 *       - Sort & Pretreat
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order successfully sent to next stage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: "Order OSC-2024-001 successfully sent to washing" }
 *       400:
 *         description: Not all items sorted and pretreated
 *       404:
 *         description: Order not found or not in sort & pretreat stage
 *       500:
 *         description: Server error
 */
router.patch(
    ROUTE_SORT_AND_PRETREAT_NEXT_STAGE,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.sendToNextStage(req, res)
    },
)

// FLAGGED ORDERS

/**
 * @swagger
 * /sort-pretreat/orders/flagged:
 *   get:
 *     summary: Get all orders that have at least one flagged item
 *     tags:
 *       - Sort & Pretreat
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
 *         description: Search by oscNumber, fullName, or phoneNumber
 *     responses:
 *       200:
 *         description: Paginated list of orders containing flagged items
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
 *                           _id:
 *                             type: string
 *                             example: "64d3c9c0f1b2a8e9d0f12345"
 *                           oscNumber:
 *                             type: string
 *                             example: "OSC-001"
 *                           fullName:
 *                             type: string
 *                             example: "John Doe"
 *                           phoneNumber:
 *                             type: string
 *                             example: "+2348012345678"
 *                           serviceType:
 *                             type: string
 *                             example: "wash_and_iron"
 *                           serviceTier:
 *                             type: string
 *                             example: "standard"
 *                           amount:
 *                             type: number
 *                             example: 5000
 *                           flaggedItemCount:
 *                             type: integer
 *                             description: Number of items on this order with flaggedForReview = true
 *                             example: 2
 *                           stage:
 *                             type: object
 *                             properties:
 *                               status:
 *                                 type: string
 *                                 example: "sort_and_pretreat"
 *                               note:
 *                                 type: string
 *                               updatedAt:
 *                                 type: string
 *                                 format: date-time
 *                           items:
 *                             type: array
 *                             items:
 *                               type: object
 *                           stageHistory:
 *                             type: array
 *                             items:
 *                               type: object
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(
    ROUTE_SORT_AND_PRETREAT_GET_FLAGGED,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getFlaggedOrders(req, res)
    },
)

// SORTED & PRETREATED LIST

/**
 * @swagger
 * /sort-pretreat/orders/completed:
 *   get:
 *     summary: Get all orders that have passed through sort & pretreat
 *     tags:
 *       - Sort & Pretreat
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
 *         schema: { type: string, format: date, example: "2026-04-13" }
 *     responses:
 *       200:
 *         description: Paginated list of completed sort & pretreat orders
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
    ROUTE_SORT_AND_PRETREAT_GET_COMPLETED,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getSortedAndPretreatdOrders(req, res)
    },
)

// WASHING VIEW (read-only)

/**
 * @swagger
 * /sort-pretreat/washing:
 *   get:
 *     summary: Get all orders currently at the Wash & Dry station (read-only monitor)
 *     tags:
 *       - Sort & Pretreat
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
 *         description: Paginated list of orders in WASHING stage
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
    ROUTE_SORT_AND_PRETREAT_WASHING,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getWashingOrders(req, res)
    },
)

/**
 * @swagger
 * /sort-pretreat/washing/{id}:
 *   get:
 *     summary: Get single order details from the washing stage (read-only)
 *     tags:
 *       - Sort & Pretreat
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order details
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
 *         description: Order not found or not currently in washing stage
 *       500:
 *         description: Server error
 */
router.get(
    ROUTE_SORT_AND_PRETREAT_WASHING_SINGLE,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getWashingOrderDetails(req, res)
    },
)

// IRONING VIEW (read-only)

/**
 * @swagger
 * /sort-pretreat/orders/ironing:
 *   get:
 *     summary: Get all orders currently at the Press & Iron station (read-only monitor)
 *     description: |
 *       Contains both IRONING_ONLY orders (sent directly from S&P) and
 *       WASH_AND_IRON orders (arrived from the Wash & Dry station).
 *     tags:
 *       - Sort & Pretreat
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
 *         description: Paginated list of orders in IRONING stage
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
    ROUTE_SORT_AND_PRETREAT_IRONING,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getIroningOrders(req, res)
    },
)

/**
 * @swagger
 * /sort-pretreat/orders/ironing/{id}:
 *   get:
 *     summary: Get single order details from the ironing stage (read-only)
 *     tags:
 *       - Sort & Pretreat
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order details
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
 *         description: Order not found or not currently in ironing stage
 *       500:
 *         description: Server error
 */
router.get(
    ROUTE_SORT_AND_PRETREAT_IRONING_SINGLE,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getIroningOrderDetails(req, res)
    },
)

// HISTORY

/**
 * @swagger
 * /sort-pretreat/history:
 *   get:
 *     summary: Get history list — all orders that have passed through S&P
 *     tags:
 *       - Sort & Pretreat
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
router.get(
    ROUTE_SORT_AND_PRETREAT_HISTORY,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getHistoryList(req, res)
    },
)

/**
 * @swagger
 * /sort-pretreat/history/{id}/timeline:
 *   get:
 *     summary: Get full order timeline — pipeline stepper + per-item audit log
 *     description: |
 *       Returns two structures:
 *
 *       **pipeline** — the fixed 8-step stepper shown in the UI:
 *       Intake → Tagged → Pretreated → Washing → Ironed → QC Passed → Ready → Delivered.
 *       Each step has `completed` (boolean) and `timestamp` (null if not yet reached).
 *
 *       **itemTimeline** — granular per-item action log (sorted, pretreated, flagged, etc.)
 *       sorted chronologically for the detailed audit section.
 *     tags:
 *       - Sort & Pretreat
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
 *                         oscNumber: { type: string, example: "ORD-2024-001" }
 *                         fullName: { type: string, example: "Jude Victor" }
 *                         serviceType: { type: string, example: "wash-and-iron" }
 *                         serviceTier: { type: string, example: "standard" }
 *                         trackingStatus: { type: string, enum: [in_progress, completed], example: "in_progress" }
 *                     pipeline:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key: { type: string, example: "washing" }
 *                           label: { type: string, example: "Washing" }
 *                           completed: { type: boolean, example: true }
 *                           timestamp: { type: string, format: date-time, nullable: true, example: "2026-03-29T10:30:00.000Z" }
 *                     itemTimeline:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           itemId: { type: string, example: "64d3c9c0f1b2a8e9d0f67890" }
 *                           itemType: { type: string, example: "trouser" }
 *                           action: { type: string, example: "sorted" }
 *                           note: { type: string, example: "" }
 *                           timestamp: { type: string, format: date-time, example: "2026-03-29T09:10:00.000Z" }
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.get(
    ROUTE_SORT_AND_PRETREAT_HISTORY_TIMELINE,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getOrderTimeline(req, res)
    },
)

/**
 * @swagger
 * /sort-pretreat/orders/completed/{id}:
 *   get:
 *     summary: Get detail of a sorted & pretreated order
 *     description: |
 *       Returns the full order with all items and their sort/pretreat data.
 *       The order must have passed through the sort & pretreat stage but can
 *       be at any subsequent stage (washing, ironing, qc, etc.).
 *     tags:
 *       - Sort & Pretreat
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order detail with sort & pretreat summary flags
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     order: { $ref: '#/components/schemas/BookOrder' }
 *                     allItemsSorted: { type: boolean, example: true }
 *                     allItemsPretreated: { type: boolean, example: true }
 *       404:
 *         description: Order not found or has not passed through sort & pretreat
 *       500:
 *         description: Server error
 */
router.get(
    ROUTE_SORT_AND_PRETREAT_SORTED_ORDER_DETAIL,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getSortedOrderDetail(req, res)
    },
)

/**
 * @swagger
 * /sort-pretreat/orders/flagged/{id}:
 *   get:
 *     summary: Get detail of a flagged order
 *     description: |
 *       Returns the full order alongside a filtered `flaggedItems` array
 *       containing only items where `flaggedForReview` is true.
 *       Intended for the next stage operator to know which items need
 *       special handling before processing begins.
 *     tags:
 *       - Sort & Pretreat
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Order detail with flagged items isolated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     order: { $ref: '#/components/schemas/BookOrder' }
 *                     flaggedItems:
 *                       type: array
 *                       description: Only items where flaggedForReview is true
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string }
 *                           type: { type: string, example: "shirt" }
 *                           flagNote: { type: string, example: "Color bleeding risk on collar" }
 *                           damageRiskFlags:
 *                             type: array
 *                             items: { type: string }
 *                             example: ["color_bleeding_risk"]
 *                     flaggedItemCount: { type: integer, example: 2 }
 *       404:
 *         description: Order not found or has no flagged items
 *       500:
 *         description: Server error
 */
router.get(
    ROUTE_SORT_AND_PRETREAT_FLAGGED_ORDER_DETAIL,
    [sortAndPretreatAuth],
    (req, res) => {
        const controller = new SortAndPretreatController()
        return controller.getFlaggedOrderDetail(req, res)
    },
)

module.exports = router
