const router = require("express").Router();
const BookOrderController = require("../controllers/bookOrder.controller");
const adminAuth = require("../middlewares/adminAuth");
const auth = require("../middlewares/auth");
const checkSubscription = require("../middlewares/checkSubscription");
const {
  ROUTE_CREATE_BOOK_ORDER,
  ROUTE_ADMIN_ORDER_DETAILS,
  ROUTE_UPDATE_BOOK_ORDER_PAYMENT_STATUS,
  ROUTE_UPDATE_BOOK_ORDER_STAGE,
  ROUTE_BOOK_ORDER_HISTORY,
  ROUTE_BOOK_ORDER,
} = require("../util/page-route");

/**
 * @swagger
 * /bookOrder/create-book-order:
 *   post:
 *     summary: Create a new order
 *     tags:
 *       - BookOrder
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
 *               - isPickUpOnly
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
 *               isPickUpOnly:
 *                 type: boolean
 *                 example: false
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
router.post(ROUTE_CREATE_BOOK_ORDER, [auth, checkSubscription], (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.postBookOrder(req, res);
});

/**
 * @swagger
 * /bookOrder/admin-order-details:
 *   get:
 *     summary: Get admin order details
 *     tags:
 *       - BookOrder
 *     responses:
 *       200:
 *         description: Returns an admin order details object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 64fa12b8a4b7c91234567890
 *                     serviceType:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["ironing-only", "washing-only", "wash-and-iron"]
 *                     billingType:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["pay-per-item", "pay-from-subscription"]
 *                     serviceTiers:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["student", "standard", "premium", "vip"]
 *                     deliverySpeed:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["standard", "express", "vip"]
 *                     pickupTime:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["10am-12pm", "4pm-6pm"]
 *                     orderItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           itemType:
 *                             type: string
 *                             example: shirt
 *                           price:
 *                             type: number
 *                             example: 500
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2026-01-12T10:00:00.000Z
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2026-01-12T10:00:00.000Z
 *       404:
 *         description: Admin order details not found
 *       500:
 *         description: Server error
 */
router.get(ROUTE_ADMIN_ORDER_DETAILS, (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.getBookOrderDetails(req, res);
});

/**
 * @swagger
 * /bookOrder/update-book-order-payment-status/${bookOrderId}:
 *   put:
 *     summary: Update payment status of a book order
 *     tags:
 *       - BookOrder
 *     parameters:
 *       - in: path
 *         name: bookOrderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the book order
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentStatus:
 *                 type: string
 *                 enum: [pending, success, failed]
 *                 example: success
 *     responses:
 *       200:
 *         description: Payment status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/BookOrder'
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Book order not found
 *       500:
 *         description: Server error
 */
router.put(ROUTE_UPDATE_BOOK_ORDER_PAYMENT_STATUS+"/:id", [adminAuth], (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.updateBookOrderPaymentStatus(req, res);
});

/**
 * @swagger
 * /bookOrder/update-book-order-stage/${bookOrderId}:
 *   put:
 *     summary: Update stage of a book order
 *     tags:
 *       - BookOrder
 *     parameters:
 *       - in: path
 *         name: bookOrderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the book order
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stage:
 *                 type: string
 *                 enum: [picked-up, delivered, out-for-delivery, in-process, ready, washing, ironing]
 *                 example: washing
 *               note:
 *                 type: string
 *                 example: "successfully delivered"
 *     responses:
 *       200:
 *         description: Payment status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/BookOrder'
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Book order not found
 *       500:
 *         description: Server error
 */
router.put(ROUTE_UPDATE_BOOK_ORDER_STAGE+"/:id", [adminAuth], (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.updateBookOrderStage(req, res);
});

/**
 * @swagger
 * /bookOrder/book-order-history:
 *   get:
 *     summary: Get a paginated list of book orders
 *     tags:
 *       - BookOrder
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of orders per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [picked-up, delivered, out-for-delivery, in-process, ready, washing, ironing]
 *         description: Filter by order stage status
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [success, pending, failed]
 *         description: Filter by payment status
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *           enum: [all, user]
 *         description: Scope of the orders to retrieve (all for admin, user for individual user)
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *     responses:
 *       200:
 *         description: Paginated list of book orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 42
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "64d3c9c0f1b2a8e9d0f12345"
 *                           userId:
 *                             type: string
 *                             example: "64d3c9c0f1b2a8e9d0f54321"
 *                           fullName:
 *                             type: string
 *                             example: "John Doe"
 *                           phoneNumber:
 *                             type: string
 *                             example: "+1234567890"
 *                           pickupAddress:
 *                             type: string
 *                             example: "123 Main Street"
 *                           pickupDate:
 *                             type: string
 *                             format: date
 *                             example: "2026-01-13"
 *                           pickupTime:
 *                             type: string
 *                             example: "morning"
 *                           serviceType:
 *                             type: string
 *                             example: "wash-and-iron"
 *                           serviceTier:
 *                             type: string
 *                             example: "premium"
 *                           deliverySpeed:
 *                             type: string
 *                             example: "express"
 *                           amount:
 *                             type: number
 *                             example: 150
 *                           paymentMethod:
 *                             type: string
 *                             example: "paystack"
 *                           oscNumber:
 *                             type: string
 *                             example: "OSC123456"
 *                           items:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 type:
 *                                   type: string
 *                                   example: "shirt"
 *                                 price:
 *                                   type: number
 *                                   example: 50
 *                                 quantity:
 *                                   type: number
 *                                   example: 2
 *                           extraNote:
 *                             type: string
 *                             example: "Handle with care"
 *                           stage:
 *                             type: object
 *                             properties:
 *                               status:
 *                                 type: string
 *                                 example: "in-process"
 *                               note:
 *                                 type: string
 *                                 example: "Picked up by driver"
 *                           paymentStatus:
 *                             type: string
 *                             example: "pending"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-01-13T12:34:56.789Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-01-13T13:00:00.123Z"
 *       400:
 *         description: Invalid query parameters
 *       500:
 *         description: Server error
 */
router.get(ROUTE_BOOK_ORDER_HISTORY, [auth], (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.getBookOrderHistory(req, res);
});

/**
 * @swagger
 * /bookOrder/book-order/{orderId}:
 *   get:
 *     summary: Get a single book order by ID
 *     tags:
 *       - BookOrder
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the book order to retrieve
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
 *         description: Invalid order ID
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.get(ROUTE_BOOK_ORDER+"/:id", [auth], (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.getBookOrder(req, res);
});

module.exports = router;
