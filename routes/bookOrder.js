const router = require("express").Router();
const BookOrderController = require("../controllers/bookOrder.controller");
const adminAuth = require("../middlewares/adminAuth");
const auth = require("../middlewares/auth");
const customerExperienceAuth = require("../middlewares/customerExperienceAuth");
const checkSubscription = require("../middlewares/checkSubscription");
const {
  ROUTE_CREATE_BOOK_ORDER,
  ROUTE_ADMIN_ORDER_DETAILS,
  ROUTE_UPDATE_BOOK_ORDER_PAYMENT_STATUS,
  ROUTE_UPDATE_BOOK_ORDER_STAGE,
  ROUTE_BOOK_ORDER_HISTORY,
  ROUTE_BOOK_ORDER,
  ROUTE_CANCEL_BOOK_ORDER_ID,
  ROUTE_REQUEST_CANCEL_BOOK_ORDER_ID,
  ROUTE_CANCELLATION_REQUESTS,
  ROUTE_APPROVE_CANCELLATION_REQUEST_ID,
  ROUTE_REJECT_CANCELLATION_REQUEST_ID,
} = require("../util/page-route");


/**
 * @swagger
 * /bookOrder/create-book-order:
 *   post:
 *     summary: Create a new laundry order
 *     description: |
 *       Creates a new laundry order for the authenticated user.
 *       Items must match allowed service types. Total amount is calculated on the backend.
 *       Pickup details are required only if pickup and delivery is selected.
 *     tags:
 *       - BookOrder
 *     security:
 *       - bearerAuth: []
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
 *               - isPickup
 *               - isDelivery
 *               - items
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               phoneNumber:
 *                 type: string
 *                 example: "+2348151128383"
 *               pickupAddress:
 *                 type: string
 *                 example: 12 Allen Avenue, Ikeja
 *                 description: Required if isPickupAndDelivery is true
 *               deliveryAddress:
 *                 type: string
 *                 example: 12 Allen Avenue, Ikeja
 *                 description: Required if isPickupAndDelivery is true
 *               pickupDate:
 *                 type: string
 *                 format: date
 *                 example: 2026-06-01
 *                 description: Required if isPickupAndDelivery is true
 *               pickupTime:
 *                 type: string
 *                 example: "10am-12pm"
 *                 description: Required if isPickupAndDelivery is true
 *               isPickUp:
 *                 type: boolean
 *                 example: true
 *               isDelivery:
 *                 type: boolean
 *                 example: true
 *               serviceType:
 *                 type: string
 *                 enum: [wash-and-iron, dry-cleaning]
 *                 example: wash-and-iron
 *               serviceTier:
 *                 type: string
 *                 enum: [standard, premium]
 *               billingType:
 *                 type: string
 *                 enum: [pay-per-item, pay-from-subscription, pay-from-wallet]
 *                 example: pay-per-item
 *               deliverySpeed:
 *                 type: string
 *                 enum: [same-day, express, standard]
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
 *                       enum: [shirt, trouser, blanket]
 *                       example: trouser
 *                     price:
 *                       type: integer
 *                       example: 700
 *                     quantity:
 *                       type: integer
 *                       example: 5
 *     responses:
 *       200:
 *         description: Order created successfully
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
 *                       example: "+2348151128383"
 *                     pickupAddress:
 *                       type: string
 *                       example: "12 Allen Avenue, Ikeja"
 *                     deliveryAddress:
 *                       type: string
 *                       example: "12 Allen Avenue, Ikeja"
 *                     pickupDate:
 *                       type: string
 *                       format: date
 *                       example: "2026-06-01"
 *                     pickupTime:
 *                       type: string
 *                       example: "10am-12pm"
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
 *                       example: 3500
 *                       description: Total calculated amount based on items and selected services
 *                     paymentMethod:
 *                       type: string
 *                       example: "paystack"
 *                       description: Automatically assigned by the system
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
 *                             example: 700
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
 *         description: Validation error or bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   example:
 *                     fullName: ["fullName is required"]
 *                     items: ["items is required"]
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
router.post(ROUTE_CREATE_BOOK_ORDER, [auth], (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.postBookOrder(req, res);
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
 *                           deliveryAddress:
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
 *                             example: "express | standard | same-day"
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
 *                     deliveryAddress:
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

/**
 * @swagger
 * /bookOrder/book-order/{id}/cancel:
 *   post:
 *     summary: Cancel your own order (customer, Green window)
 *     description: >
 *       Cancels the authenticated customer's own order when it is still in the
 *       Green window — either within the grace period after creation
 *       (default 15 min, configurable) or while it is pending and no rider has
 *       been dispatched. The order is flipped to `cancelled`, any reward credits
 *       it consumed are reversed, any cash paid is refunded to the CHUVI wallet
 *       balance (never to card/bank), the attached offer is released, and a
 *       scheduled pickup is freed. Orders whose items are already in transit /
 *       with us (Amber) or already being processed (Red) return 400 and must go
 *       through support.
 *     tags:
 *       - BookOrder
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: The order id to cancel
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, example: "Booked by mistake" }
 *     responses:
 *       200:
 *         description: Order cancelled and refunds applied
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     orderId: { type: string, example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *                     status: { type: string, example: cancelled }
 *                     cashRefunded: { type: number, example: 3000 }
 *                     creditsReversed: { type: number, example: 2000 }
 *                     refundedTo: { type: string, example: wallet }
 *       400:
 *         description: >
 *           Not cancellable (Amber/Red window or already cancelled), not the
 *           owner, or order not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Server error
 */
router.post(ROUTE_CANCEL_BOOK_ORDER_ID, [auth], (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.cancelOrder(req, res);
});

/**
 * @swagger
 * /bookOrder/book-order/{id}/cancel-request:
 *   post:
 *     summary: Request cancellation of an Amber-window order (customer)
 *     description: >
 *       For orders already in the Amber window — items on the way to us or with
 *       us, but not yet being processed — the customer cannot self-cancel and
 *       instead submits a cancellation request for Customer Experience to review.
 *       Green orders should use /cancel directly; Red (already being processed)
 *       orders cannot be cancelled. Only one pending request per order.
 *     tags:
 *       - BookOrder
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, example: "Change of plans" }
 *     responses:
 *       200:
 *         description: Cancellation request submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     requestId: { type: string, example: 64c0aa11e3c3b4a1d2f1ca10 }
 *                     orderId: { type: string, example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *                     status: { type: string, example: pending }
 *       400:
 *         description: Missing reason, not the owner, Green (cancel directly), Red, or a request is already pending
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Server error
 */
router.post(ROUTE_REQUEST_CANCEL_BOOK_ORDER_ID, [auth], (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.requestCancellation(req, res);
});

/**
 * @swagger
 * /bookOrder/cancellation-requests:
 *   get:
 *     summary: List cancellation requests (Customer Experience)
 *     description: Queue of customer cancellation requests. Defaults to pending.
 *     tags:
 *       - BookOrder
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected, all], default: pending }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated cancellation requests (order + customer populated)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/CancellationRequestPage' }
 *       500:
 *         description: Server error
 */
router.get(ROUTE_CANCELLATION_REQUESTS, [customerExperienceAuth], (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.getCancellationRequests(req, res);
});

/**
 * @swagger
 * /bookOrder/cancellation-requests/{id}/approve:
 *   post:
 *     summary: Approve a cancellation request (Customer Experience)
 *     description: >
 *       Approves the request and runs the full unwind: reverses reward credits,
 *       refunds cash to the customer's wallet (minus any fee), releases the
 *       attached offer and frees the pickup. An optional fee is withheld from the
 *       cash refund only (never from credits) and is capped at the cash actually
 *       paid. Refused if the order has since entered processing (Red).
 *     tags:
 *       - BookOrder
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               feeAmount: { type: number, example: 500, description: "Fee withheld from the cash refund (₦)" }
 *               note: { type: string, example: "Rider already dispatched; part-fee applied" }
 *     responses:
 *       200:
 *         description: Request approved and order cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     requestId: { type: string, example: 64c0aa11e3c3b4a1d2f1ca10 }
 *                     orderId: { type: string, example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *                     status: { type: string, example: approved }
 *                     cashRefunded: { type: number, example: 4500 }
 *                     creditsReversed: { type: number, example: 0 }
 *                     feeApplied: { type: number, example: 500 }
 *                     refundedTo: { type: string, example: wallet }
 *       400:
 *         description: Request not found, already resolved, or order now in processing (Red)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Server error
 */
router.post(ROUTE_APPROVE_CANCELLATION_REQUEST_ID, [customerExperienceAuth], (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.approveCancellationRequest(req, res);
});

/**
 * @swagger
 * /bookOrder/cancellation-requests/{id}/reject:
 *   post:
 *     summary: Reject a cancellation request (Customer Experience)
 *     description: Declines the request; the order continues normally and the customer is notified.
 *     tags:
 *       - BookOrder
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note: { type: string, example: "Items already being sorted" }
 *     responses:
 *       200:
 *         description: Request rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     requestId: { type: string, example: 64c0aa11e3c3b4a1d2f1ca10 }
 *                     orderId: { type: string, example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *                     status: { type: string, example: rejected }
 *       400:
 *         description: Request not found or already resolved
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Server error
 */
router.post(ROUTE_REJECT_CANCELLATION_REQUEST_ID, [customerExperienceAuth], (req, res) => {
  const bookOrderController = new BookOrderController();
  return bookOrderController.rejectCancellationRequest(req, res);
});

module.exports = router;
