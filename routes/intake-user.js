const router = require("express").Router();
const IntakeUserController = require("../controllers/intake-user.controller");
const {
  ROUTE_CREATE_BOOK_ORDER,
  ROUTE_FLAG_ORDER_ID,
  ROUTE_PROCEED_TO_TAG_ID,
  ROUTE_CONFIRM_TAG_ID_ITEM_ID,
  ROUTE_UNDO_CONFIRM_TAG_ID_ITEM_ID,
  ROUTE_PROCEED_TO_SORT_AND_PRETREAT_ID,
  ROUTE_SEND_TOP_UP_REQUEST_ID,
  ROUTE_ADJUST_WALLET,
  ROUTE_GET_USER_WALLET_ID,
  ROUTE_DELIVERABLE_ORDERS,
  ROUTE_ASSIGN_RIDER_ID_TO_PICKUP_ORDER_ID,
  ROUTE_ASSIGN_RIDER_ID_TO_DEVLIVERY_ORDER_ID,
  ROUTE_PICKABLE_ORDERS,
  ROUTE_GET_BOOK_ORDER_ID,
  ROUTE_GET_PENDING_ORDERS,
  ROUTE_INTAKE_USER_DASHBOARD_STATS,
  ROUTE_INTAKE_GET_DRAFTS,
  ROUTE_INTAKE_GENERATE_ALL_TAGS,
  ROUTE_INTAKE_COMPLETE_TAGGING,
  ROUTE_INTAKE_GET_TAGGING_QUEUE,
} = require("../util/page-route");
const intakeUserAuth = require("../middlewares/intakeUserAuth");

/**
 * @swagger
 * /intake-user/create-book-order:
 *   post:
 *     summary: Create a new order
 *     tags:
 *       - Intake User
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - phoneNumber
 *               - serviceType
 *               - serviceTier
 *               - isPickUpAndDelivery
 *               - items
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               phoneNumber:
 *                 type: string
 *                 example: 08151128383
 *               pickupAddress:
 *                 type: string
 *                 example: 12 Allen Avenue, Ikeja
 *               pickupDate:
 *                 type: string
 *                 format: date
 *                 example: 2025-06-01
 *               pickupTime:
 *                 type: string
 *                 example: "10am-12pm | 4pm-6pm"
 *               isPickUpAndDelivery:
 *                 type: boolean
 *                 example: false
 *               serviceType:
 *                 type: string
 *                 example: wash-and-iron
 *               serviceTier:
 *                 type: string
 *                 example: premium
 *               deliverySpeed:
 *                 type: string
 *                 example: express
 *               extraNote:
 *                 type: string
 *                 example: "wash carefully"
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - type
 *                     - price
 *                     - quantity
 *                   properties:
 *                     type:
 *                       type: string
 *                       example: trouser
 *                     price:
 *                       type: integer
 *                       example: 700
 *                     quantity:
 *                       type: integer
 *                       example: 5
 *     responses:
 *       200:
 *         description: A single book order document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64d3c9c0f1b2a8e9d0f12345"
 *                     userId:
 *                       type: string
 *                       example: "64d3c9c0f1b2a8e9d0f54321"
 *                     fullName:
 *                       type: string
 *                       example: "John Doe"
 *                     phoneNumber:
 *                       type: string
 *                       example: "+1234567890"
 *                     pickupAddress:
 *                       type: string
 *                       example: "123 Main Street"
 *                     pickupDate:
 *                       type: string
 *                       format: date
 *                       example: "2026-01-13"
 *                     pickupTime:
 *                       type: string
 *                       example: "morning"
 *                     serviceType:
 *                       type: string
 *                       example: "wash-and-iron"
 *                     serviceTier:
 *                       type: string
 *                       example: "premium"
 *                     deliverySpeed:
 *                       type: string
 *                       example: "express"
 *                     amount:
 *                       type: number
 *                       example: 150
 *                     paymentMethod:
 *                       type: string
 *                       example: "paystack"
 *                     oscNumber:
 *                       type: string
 *                       example: "OSC123456"
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             example: "shirt"
 *                           price:
 *                             type: number
 *                             example: 50
 *                           quantity:
 *                             type: number
 *                             example: 2
 *                     extraNote:
 *                       type: string
 *                       example: "Handle with care"
 *                     stage:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: "in-process"
 *                         note:
 *                           type: string
 *                           example: "Picked up by driver"
 *                     paymentStatus:
 *                       type: string
 *                       example: "pending"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-01-13T12:34:56.789Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-01-13T13:00:00.123Z"
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post(ROUTE_CREATE_BOOK_ORDER, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.createBookOrder(req, res);
});

/**
 * @swagger
 * /intake-user/get-pending-orders:
 *   get:
 *     summary: Get all pending orders
 *     tags:
 *       - Intake User
 *     responses:
 *       200:
 *         description: List of pending book orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "64d3c9c0f1b2a8e9d0f12345"
 *                       fullName:
 *                         type: string
 *                         example: "John Doe"
 *                       phoneNumber:
 *                         type: string
 *                         example: "+1234567890"
 *                       serviceType:
 *                         type: string
 *                         example: "wash-and-iron"
 *                       serviceTier:
 *                         type: string
 *                         example: "premium"
 *                       amount:
 *                         type: number
 *                         example: 150
 *                       paymentStatus:
 *                         type: string
 *                         example: "pending"
 *                       stage:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                             example: "pending"
 *                           note:
 *                             type: string
 *                             example: "Awaiting pickup"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-01-13T12:34:56.789Z"
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_PENDING_ORDERS, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.getPendingOrders(req, res);
});

/**
 * @swagger
 * /intake-user/get-book-order/{id}:
 *   get:
 *     summary: Get a single book order by ID
 *     tags:
 *       - Intake User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the order
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f12345"
 *     responses:
 *       200:
 *         description: A single book order document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "64d3c9c0f1b2a8e9d0f12345"
 *                     fullName:
 *                       type: string
 *                       example: "John Doe"
 *                     phoneNumber:
 *                       type: string
 *                       example: "+1234567890"
 *                     pickupAddress:
 *                       type: string
 *                       example: "123 Main Street"
 *                     pickupDate:
 *                       type: string
 *                       format: date
 *                       example: "2026-01-13"
 *                     pickupTime:
 *                       type: string
 *                       example: "morning"
 *                     serviceType:
 *                       type: string
 *                       example: "wash-and-iron"
 *                     serviceTier:
 *                       type: string
 *                       example: "premium"
 *                     deliverySpeed:
 *                       type: string
 *                       example: "express"
 *                     amount:
 *                       type: number
 *                       example: 150
 *                     paymentMethod:
 *                       type: string
 *                       example: "paystack"
 *                     oscNumber:
 *                       type: string
 *                       example: "OSC123456"
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             example: "shirt"
 *                           price:
 *                             type: number
 *                             example: 50
 *                           quantity:
 *                             type: number
 *                             example: 2
 *                     extraNote:
 *                       type: string
 *                       example: "Handle with care"
 *                     stage:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: "in-process"
 *                         note:
 *                           type: string
 *                           example: "Picked up by driver"
 *                     paymentStatus:
 *                       type: string
 *                       example: "pending"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-01-13T12:34:56.789Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-01-13T13:00:00.123Z"
 *       400:
 *         description: Invalid request (e.g., missing ID)
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_BOOK_ORDER_ID, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.getBookOrder(req, res);
});

/**
 * @swagger
 * /intake-user/flag-order/{id}:
 *   post:
 *     summary: Flag an order (set status to HOLD)
 *     tags:
 *       - Intake User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f12345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Order flaggged as hold"
 *     responses:
 *       200:
 *         description: Order flagged successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order flagged successfully"
 *       400:
 *         description: Validation error or missing order ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Order ID is required"
 *       404:
 *         description: Order or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Server error
 */
router.post(ROUTE_FLAG_ORDER_ID, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.flagOrder(req, res);
});

/**
 * @swagger
 * /intake-users/dashboard-stats:
 *   get:
 *     summary: Get dashboard statistics and analytics
 *     tags:
 *       - Intake User
 *     description: Returns aggregated metrics including revenue, orders, subscriptions, and activity insights for the admin dashboard.
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     pendingOrders:
 *                       type: integer
 *                       example: 120
 *                     taggingQueueOrders:
 *                       type: number
 *                       example: 500
 *                     holdOrders:
 *                       type: number
 *                       description: Percentage change compared to yesterday
 *                       example: 12
 *       500:
 *         description: Server error
 */
router.get(ROUTE_INTAKE_USER_DASHBOARD_STATS, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.intakeDashboard(req, res);
});

/**
 * @swagger
 * /intake-user/proceed-to-tag/{id}:
 *   post:
 *     summary: Move order to tagging queue
 *     tags:
 *       - Intake User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f12345"
 *     responses:
 *       200:
 *         description: Order moved to tag and queue successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order moved to tag and queue successfully"
 *       400:
 *         description: Validation error or missing order ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Order ID is required"
 *       404:
 *         description: Order or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Server error
 */
router.post(ROUTE_PROCEED_TO_TAG_ID, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.proceedToTag(req, res);
});
/**
 * @swagger
 * /intake-user/confirm-tag/{orderId}/item/{itemId}:
 *   put:
 *     summary: Confirm and update tag details for a specific item in an order
 *     tags:
 *       - Intake User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f12345"
 *       - in: path
 *         name: itemId
 *         required: true
 *         description: Item ID inside the order
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f67890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tagState
 *               - tagColor
 *               - tagStatus
 *               - tagId
 *             properties:
 *               tagState:
 *                 type: string
 *                 example: "cleaned"
 *               tagColor:
 *                 type: string
 *                 example: "blue"
 *               tagStatus:
 *                 type: string
 *                 example: "complete"
 *               tagId:
 *                 type: string
 *                 example: "TAG123456"
 *     responses:
 *       200:
 *         description: Tag successfully confirmed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Tag successfully confirmed"
 *       400:
 *         description: Validation error or missing parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Item ID is required"
 *       404:
 *         description: Order or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Server error
 */
router.post(ROUTE_CONFIRM_TAG_ID_ITEM_ID, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.confirmTagItem(req, res);
});

/**
 * @swagger
 * /intake-user/undo-confirm-tag/{id}/item/{itemId}:
 *   put:
 *     summary: Undo tag confirmation for a specific item in an order
 *     tags:
 *       - Intake User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f12345"
 *       - in: path
 *         name: itemId
 *         required: true
 *         description: Item ID inside the order
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f67890"
 *     responses:
 *       200:
 *         description: Tag successfully undone
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Tag successfully undone"
 *       400:
 *         description: Validation error or missing parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Item ID is required"
 *       404:
 *         description: Order or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Server error
 */
router.post(ROUTE_UNDO_CONFIRM_TAG_ID_ITEM_ID, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.undoConfirmTagItem(req, res);
});

/**
 * @swagger
 * /intake-user/proceed-to-sort-and-pretreat/{id}:
 *   post:
 *     summary: Move order to sort and pretreat stage
 *     tags:
 *       - Intake User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f12345"
 *     responses:
 *       200:
 *         description: Order successfully moved to sort and pretreat stage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order OSC123456 successfully sent"
 *       400:
 *         description: Validation error or missing order ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Order ID is required"
 *       404:
 *         description: Order or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Server error
 */
router.post(ROUTE_PROCEED_TO_SORT_AND_PRETREAT_ID, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.proceedToSortAndPretreat(req, res);
});

/**
 * @swagger
 * /intake-user/send-top-up-request/{id}:
 *   post:
 *     summary: Send a top-up request for an order (e.g. additional charges)
 *     tags:
 *       - Intake User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f12345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - amount
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Additional charges for stain removal"
 *               amount:
 *                 type: integer
 *                 example: 1500
 *     responses:
 *       200:
 *         description: Top-up request sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Top-up request sent successfully"
 *       400:
 *         description: Validation error or missing order ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Amount is required"
 *       404:
 *         description: Order or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Server error
 */
router.post(ROUTE_SEND_TOP_UP_REQUEST_ID, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.sendTopUpRequest(req, res);
});

/**
 * @swagger
 * /intake-user/adjust-wallet/{id}/{userId}:
 *   post:
 *     summary: Adjust a user's wallet balance (credit or debit) for an order
 *     tags:
 *       - Intake User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f12345"
 *       - in: path
 *         name: userId
 *         required: true
 *         description: User ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f54321"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - amount
 *               - type
 *             properties:
 *               message:
 *                 type: string
 *                 example: "Refund for damaged item"
 *               amount:
 *                 type: integer
 *                 example: 2000
 *               type:
 *                 type: string
 *                 enum: [credit, debit]
 *                 example: credit
 *     responses:
 *       200:
 *         description: Wallet adjustment successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Wallet credit request successful of 2000 Reason: Refund for damaged item"
 *       400:
 *         description: Validation error or insufficient balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Insufficient balance"
 *       404:
 *         description: Order, user, or wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Wallet not found"
 *       500:
 *         description: Server error
 */
router.post(ROUTE_ADJUST_WALLET, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.adjustWallet(req, res);
});

/**
 * @swagger
 * /intake-user/get-user-wallet/{id}:
 *   get:
 *     summary: Get a user's wallet balance
 *     tags:
 *       - Intake User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: User ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f54321"
 *     responses:
 *       200:
 *         description: Wallet retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: number
 *                   example: 5000
 *       400:
 *         description: Missing user ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "User ID is required"
 *       404:
 *         description: User or wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Wallet not found"
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_USER_WALLET_ID, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.getUserWallet(req, res);
});

/**
 * @swagger
 * /intake-user/pickable-orders:
 *   get:
 *     summary: Get all orders available for pickup (pending stage)
 *     tags:
 *       - Intake User
 *     responses:
 *       200:
 *         description: List of pickable orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BookOrder'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_PICKABLE_ORDERS, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.getPickableOrders(req, res);
});

/**
 * @swagger
 * /intake-user/deliverable-orders:
 *   get:
 *     summary: Get all orders ready for delivery
 *     tags:
 *       - Intake User
 *     responses:
 *       200:
 *         description: List of deliverable orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BookOrder'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_DELIVERABLE_ORDERS, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.getDeliverableOrders(req, res);
});

/**
 * @swagger
 * /intake-user/assign-rider/{riderId}/pickup-order/{id}:
 *   patch:
 *     summary: Assign a rider to a pickup order
 *     tags:
 *       - Intake User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f12345"
 *       - in: path
 *         name: riderId
 *         required: true
 *         description: Rider ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f54321"
 *     responses:
 *       200:
 *         description: Rider successfully assigned to order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Rider successfully assigned to order"
 *       400:
 *         description: Validation error or missing parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Rider ID is required"
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Server error
 */
router.post(ROUTE_ASSIGN_RIDER_ID_TO_PICKUP_ORDER_ID, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.assignRiderTopPickupOrder(req, res);
});

/**
 * @swagger
 * /intake-user/assign-rider/{riderId}/delivery-order/{id}:
 *   patch:
 *     summary: Assign a rider to a delivery order
 *     tags:
 *       - Intake User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Order ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f12345"
 *       - in: path
 *         name: riderId
 *         required: true
 *         description: Rider ID
 *         schema:
 *           type: string
 *           example: "64d3c9c0f1b2a8e9d0f54321"
 *     responses:
 *       200:
 *         description: Rider successfully assigned to delivery order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Rider successfully assigned to order"
 *       400:
 *         description: Validation error or missing parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Rider ID is required"
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Server error
 */
router.post(ROUTE_ASSIGN_RIDER_ID_TO_DEVLIVERY_ORDER_ID, [intakeUserAuth], (req, res) => {
  const bookOrderController = new IntakeUserController();
  return bookOrderController.assignRiderTopDeliveryOrder(req, res);
});

/**
 * @swagger
 * /intake-user/generate-all-tags/{id}:
 *   patch:
 *     summary: Auto-generate tag IDs for all untagged items in an order
 *     description: |
 *       Generates a unique tagId for every item that hasn't been tagged yet
 *       and sets `tagStatus` to `complete` on each. Tag format:
 *       `{oscNumber}-{padded index}` e.g. `OSC-20260428-321782-01`.
 *       The order remains in the tagging queue — no stage change occurs.
 *     tags:
 *       - Intake & Tag
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: All tags generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: "All tags generated successfully" }
 *                     order: { $ref: '#/components/schemas/BookOrder' }
 *       404:
 *         description: Order not found or not in tagging queue
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_INTAKE_GENERATE_ALL_TAGS, [intakeUserAuth], (req, res) => {
    const controller = new IntakeUserController()
    return controller.generateAllTags(req, res)
})

/**
 * @swagger
 * /intake-user/complete-tagging/{id}:
 *   patch:
 *     summary: Validate all items are tagged — confirmation gate before sending to S&P
 *     description: |
 *       Checks that every item on the order has `tagStatus: complete`.
 *       Returns an error listing how many items are still untagged.
 *       On success, confirms the order is ready for Sort & Pretreat.
 *       **No stage change occurs** — the operator then calls
 *       `proceed-to-sort-and-pretreat` to actually move the order.
 *     tags:
 *       - Intake & Tag
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: All items tagged — ready to send to Sort & Pretreat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "All items tagged. Ready to send to Sort & Pretreat."
 *       400:
 *         description: One or more items still untagged
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "3 item(s) still untagged. Please tag all items before completing."
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_INTAKE_COMPLETE_TAGGING, [intakeUserAuth], (req, res) => {
    const controller = new IntakeUserController()
    return controller.completeTagging(req, res)
})

/**
 * @swagger
 * /intake-user/drafts:
 *   get:
 *     summary: Get draft orders — pending orders not yet in the tagging queue
 *     description: |
 *       Returns orders with `stage.status: pending`. These are orders that
 *       have been created (from the customer app or website) but have not yet
 *       been proceeded to the tagging queue by intake staff.
 *     tags:
 *       - Intake & Tag
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
 *         description: Paginated list of draft orders
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
 *                           oscNumber:   { type: string, example: "OSC-20260428-321782" }
 *                           fullName:    { type: string, example: "Jude Victor" }
 *                           phoneNumber: { type: string, example: "08081234567" }
 *                           serviceType: { type: string, example: "wash-and-iron" }
 *                           serviceTier: { type: string, example: "standard" }
 *                           amount:      { type: number, example: 5000 }
 *                           stage:
 *                             type: object
 *                             properties:
 *                               status: { type: string, example: "pending" }
 *                           createdAt:   { type: string, format: date-time }
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_INTAKE_GET_DRAFTS, [intakeUserAuth], (req, res) => {
    const controller = new IntakeUserController()
    return controller.getDrafts(req, res)
})

/**
 * @swagger
 * /intake-user/tagging-queue:
 *   get:
 *     summary: Get all orders in tagging queue
 *     description: Returns paginated orders with status QUEUE, ready for tagging by intake staff.
 *     tags:
 *       - Intake
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: "ORD-2024-001"
 *         description: Search by order ID, customer name, or phone number
 *     responses:
 *       200:
 *         description: Tagging queue fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           oscNumber:
 *                             type: string
 *                             example: "ORD-2024-001"
 *                           fullName:
 *                             type: string
 *                             example: "Jude Victor"
 *                           phoneNumber:
 *                             type: string
 *                             example: "08012345678"
 *                           serviceType:
 *                             type: string
 *                             example: "wash-and-iron"
 *                           serviceTier:
 *                             type: string
 *                             example: "standard"
 *                           amount:
 *                             type: number
 *                             example: 4500
 *                           channel:
 *                             type: string
 *                             example: "office"
 *                           stage:
 *                             type: object
 *                             properties:
 *                               status:
 *                                 type: string
 *                                 example: "queue"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 12
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         totalPages:
 *                           type: integer
 *                           example: 2
 *       400:
 *         description: Failed to fetch tagging queue
 *       401:
 *         description: Unauthorized
 */
router.get(ROUTE_INTAKE_GET_TAGGING_QUEUE, [intakeUserAuth], (req, res) => {
const controller = new IntakeUserController()
  return controller.getTaggingQueue(req, res)
})

module.exports = router;
