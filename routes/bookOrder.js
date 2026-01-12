const router = require("express").Router();
const BookOrderController = require("../controllers/bookOrder.controller");
const adminAuth = require("../middlewares/adminAuth");
const auth = require("../middlewares/auth");
const {
  ROUTE_CREATE_BOOK_ORDER,
  ROUTE_ADMIN_ORDER_DETAILS,
  ROUTE_UPDATE_BOOK_ORDER_PAYMENT_STATUS,
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
 *               - pickupAddress
 *               - pickupDate
 *               - pickupTime
 *               - serviceType
 *               - serviceTier
 *               - deliverySpeed
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
 *       201:
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
 *                   type: string
 *                   example: Order created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.post(ROUTE_CREATE_BOOK_ORDER, [auth], (req, res) => {
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

module.exports = router;
