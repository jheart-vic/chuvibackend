const AdminController = require("../controllers/admin.controller");
const adminAuth = require("../middlewares/adminAuth");
const auth = require("../middlewares/auth");
const {
    ROUTE_ADMIN_DASHBOARD_STATS,
    ROUTE_ADMIN_ORDER_MANAGEMENT,
    ROUTE_ADMIN_ORDER_ORDERID,
    ROUTE_ADMIN_PAYMENT_VERIFICATION_QUEUE,
    ROUTE_ADMIN_PAYMENT_PAYMENTID_ACCEPT,
    ROUTE_ADMIN_PAYMENT_PAYMENTID_REJECT,
    ROUTE_ADMIN_ORDER_BY_STATE,
    ROUTE_ADMIN_DISPATCH_DATA_COUNT,
    ROUTE_HOLD_ORDERS,
    ROUTE_ADMIN_ORDERS_ID_REASSIGN_STATION,
    ROUTE_ADMIN_WALLET_ID_ADD_FUND,
    ROUTE_ADMIN_WALLET_ID_DEDUCT_FUND,
    ROUTE_ADMIN_AUDIT_LITE,
    ROUTE_SEARCH_WALLET
} = require("../util/page-route");
const router = require("express").Router();

/**
 * @swagger
 * /admin/dashboard-stats:
 *   get:
 *     summary: Get dashboard statistics and analytics
 *     tags:
 *       - Admin
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
 *                     totalActiveOrders:
 *                       type: integer
 *                       example: 120
 *                     revenueTodayVerified:
 *                       type: number
 *                       example: 50000
 *                     revenueTodayChange:
 *                       type: number
 *                       description: Percentage change compared to yesterday
 *                       example: 12.5
 *                     avgProcessingTime:
 *                       type: number
 *                       description: Average processing time in milliseconds
 *                       example: 3600000
 *                     overdueOrders:
 *                       type: integer
 *                       example: 15
 *                     dueToday:
 *                       type: integer
 *                       example: 20
 *                     bottleNeckStation:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         _id:
 *                           type: string
 *                           example: "washing"
 *                         count:
 *                           type: integer
 *                           example: 45
 *                     readyAndWaiting:
 *                       type: integer
 *                       example: 10
 *                     pendingPayment:
 *                       type: integer
 *                       example: 8
 *                     activeHolds:
 *                       type: integer
 *                       example: 5
 *                     overdueHolds:
 *                       type: integer
 *                       example: 2
 *                     deliveryIssues:
 *                       type: integer
 *                       example: 3
 *                     avgCostPerItem7Days:
 *                       type: number
 *                       example: 250
 *                     totalSubscribers:
 *                       type: integer
 *                       example: 300
 *                     monthlyRevenueAgg:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: object
 *                             properties:
 *                               year:
 *                                 type: integer
 *                                 example: 2026
 *                               month:
 *                                 type: integer
 *                                 example: 4
 *                           totalRevenue:
 *                             type: number
 *                             example: 250000
 *                           totalSubscriptions:
 *                             type: integer
 *                             example: 120
 *                     planDistributionAgg:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           planId:
 *                             type: string
 *                             example: "abc123"
 *                           title:
 *                             type: string
 *                             example: "Premium"
 *                           count:
 *                             type: integer
 *                             example: 80
 *                           percentage:
 *                             type: number
 *                             example: 66.67
 *                     graphResult:
 *                       type: array
 *                       description: Orders trend for the last 12 hours (2-hour intervals)
 *                       items:
 *                         type: object
 *                         properties:
 *                           time:
 *                             type: string
 *                             example: "08:00"
 *                           newOrders:
 *                             type: integer
 *                             example: 20
 *                           completedOrders:
 *                             type: integer
 *                             example: 10
 *                     activities:
 *                       type: array
 *                       description: Latest system activities
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "64d3c9c0f1b2a8e9d0f12345"
 *                           message:
 *                             type: string
 *                             example: "Order created"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-01-13T12:34:56.789Z"
 *       500:
 *         description: Server error
 */

router.get(ROUTE_ADMIN_DASHBOARD_STATS, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.getDashboardStats(req, res);
});

/**
 * @swagger
 * /admin/order-management:
 *   get:
 *     summary: Get paginated orders by management type
 *     tags:
 *       - Admin
 *     description: Retrieve orders based on operational status such as active, overdue, due today, holds, assigned for delivery, and pending payment.
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [active, overdue, dueToday, holds, assignedForDelivery, pendingPayment]
 *         description: Type of order filter to apply
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
 *     responses:
 *       200:
 *         description: Successfully retrieved filtered orders
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
 *                           deliveryDate:
 *                             type: string
 *                             format: date
 *                             example: "2026-01-15"
 *                           serviceType:
 *                             type: string
 *                             example: "wash-and-iron"
 *                           serviceTier:
 *                             type: string
 *                             example: "premium"
 *                           amount:
 *                             type: number
 *                             example: 150
 *                           paymentStatus:
 *                             type: string
 *                             example: "pending"
 *                           stage:
 *                             type: object
 *                             properties:
 *                               status:
 *                                 type: string
 *                                 example: "washing"
 *                               note:
 *                                 type: string
 *                                 example: "Processing started"
 *                           dispatchDetails:
 *                             type: object
 *                             properties:
 *                               pickup:
 *                                 type: object
 *                                 properties:
 *                                   status:
 *                                     type: string
 *                                     example: "pending"
 *                               delivery:
 *                                 type: object
 *                                 properties:
 *                                   status:
 *                                     type: string
 *                                     example: "ready"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-01-13T12:34:56.789Z"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 50
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         totalPages:
 *                           type: integer
 *                           example: 5
 *       400:
 *         description: Invalid type supplied
 *       500:
 *         description: Server error
 */
router.get(ROUTE_ADMIN_ORDER_MANAGEMENT, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.orderManagement(req, res);
});

/**
 * @swagger
 * /admin/order/{orderId}:
 *   get:
 *     summary: Get details of a specific order
 *     tags:
 *       - Admin
 *     description: Retrieve full details of a single book order by its ID.
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique ID of the order
 *     responses:
 *       200:
 *         description: Order retrieved successfully
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
 *                     deliveryDate:
 *                       type: string
 *                       format: date
 *                       example: "2026-01-15"
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
 *                     paymentStatus:
 *                       type: string
 *                       example: "pending"
 *                     stage:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: "washing"
 *                         note:
 *                           type: string
 *                           example: "Processing started"
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
 *                           tagStatus:
 *                             type: string
 *                             example: "pending"
 *                     dispatchDetails:
 *                       type: object
 *                       properties:
 *                         pickup:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               example: "pending"
 *                         delivery:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               example: "ready"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-01-13T12:34:56.789Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-01-13T13:00:00.123Z"
 *       400:
 *         description: Order ID is required
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.get(ROUTE_ADMIN_ORDER_ORDERID, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.getOrderDetails(req, res);
});

/**
 * @swagger
 * /admin/payment-verification-queue:
 *   get:
 *     summary: Get payment verification queue (paginated)
 *     tags:
 *       - Admin
 *     description: Retrieves a paginated list of payment records awaiting or requiring verification.
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
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Payment verification queue retrieved successfully
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
 *                       example: 120
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     totalPages:
 *                       type: integer
 *                       example: 12
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "64d3c9c0f1b2a8e9d0f12345"
 *                           reference:
 *                             type: string
 *                             example: "PAY-REF-123456"
 *                           amount:
 *                             type: number
 *                             example: 150
 *                           paymentStatus:
 *                             type: string
 *                             example: "pending"
 *                           paymentMethod:
 *                             type: string
 *                             example: "paystack"
 *                           paymentDate:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-01-13T12:34:56.789Z"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-01-13T12:34:56.789Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-01-13T13:00:00.123Z"
 *       500:
 *         description: Server error
 */
router.get(ROUTE_ADMIN_PAYMENT_VERIFICATION_QUEUE, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.getPaymentVerificationQueue(req, res);
});

/**
 * @swagger
 * /admin/payment/{paymentId}/accept:
 *   put:
 *     summary: Accept and verify a payment
 *     tags:
 *       - Admin
 *     description: Marks a payment as successful after admin verification and updates related order payment status if applicable.
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique ID of the payment to be verified
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Payment verified successfully"
 *       400:
 *         description: Payment ID is required
 *       404:
 *         description: Payment not found
 *       409:
 *         description: Payment already resolved as successful
 *       500:
 *         description: Server error
 */
router.put(ROUTE_ADMIN_PAYMENT_PAYMENTID_ACCEPT, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.acceptPaymentVerification(req, res);
});

/**
 * @swagger
 * /admin/payment/{paymentId}/reject:
 *   put:
 *     summary: Reject a payment verification
 *     tags:
 *       - Admin
 *     description: Marks a payment as failed after admin review and updates related order payment status if applicable.
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique ID of the payment to be rejected
 *     responses:
 *       200:
 *         description: Payment rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Payment rejected successfully"
 *       400:
 *         description: Payment ID is required
 *       404:
 *         description: Payment not found
 *       409:
 *         description: Payment already resolved as failed
 *       500:
 *         description: Server error
 */
router.put(ROUTE_ADMIN_PAYMENT_PAYMENTID_REJECT, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.rejectPaymentVerification(req, res);
});

/**
 * @swagger
 * /admin/orders/by-state:
 *   get:
 *     summary: Get orders filtered by operational state
 *     tags:
 *       - Admin
 *     description: Retrieves paginated orders based on logistics state such as delivery, pickup, assignment, or completion status.
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [all, delivery, pendingPickup, assigned, delivered]
 *         description: Type of order state filter
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
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
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
 *                           fullName:
 *                             type: string
 *                             example: "John Doe"
 *                           phoneNumber:
 *                             type: string
 *                             example: "+1234567890"
 *                           pickupAddress:
 *                             type: string
 *                             example: "123 Main Street"
 *                           deliveryDate:
 *                             type: string
 *                             format: date
 *                             example: "2026-01-15"
 *                           stage:
 *                             type: object
 *                             properties:
 *                               status:
 *                                 type: string
 *                                 example: "out-for-delivery"
 *                           dispatchDetails:
 *                             type: object
 *                             properties:
 *                               pickup:
 *                                 type: object
 *                                 properties:
 *                                   status:
 *                                     type: string
 *                                     example: "dispatched"
 *                               delivery:
 *                                 type: object
 *                                 properties:
 *                                   status:
 *                                     type: string
 *                                     example: "in-progress"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-01-13T12:34:56.789Z"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 120
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         totalPages:
 *                           type: integer
 *                           example: 12
 *       400:
 *         description: Invalid type supplied
 *       500:
 *         description: Server error
 */
router.get(ROUTE_ADMIN_ORDER_BY_STATE, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.getOrdersByState(req, res);
});

/**
 * @swagger
 * /admin/dispatch/data-count:
 *   get:
 *     summary: Get dispatch dashboard counts
 *     tags:
 *       - Admin
 *     description: Returns summary counts for dispatch operations including pending pickups, assigned orders, and delivered orders.
 *     responses:
 *       200:
 *         description: Dispatch counts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     pendingPickupOrders:
 *                       type: integer
 *                       example: 25
 *                     assignedOrders:
 *                       type: integer
 *                       example: 40
 *                     deliveredOrders:
 *                       type: integer
 *                       example: 120
 *       500:
 *         description: Server error
 */
router.get(ROUTE_ADMIN_DISPATCH_DATA_COUNT, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.getDispatchAdminDataCount(req, res);
});

/**
 * @swagger
 * /admin/hold-orders:
 *   get:
 *     summary: Get orders by special operational status
 *     tags:
 *       - Admin
 *     description: Retrieves paginated orders filtered by special conditions such as holds, overdue holds, or expiring today.
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [activeHolds, overdueHolds, expiringToday]
 *         description: Type of special order filter
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
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
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
 *                           fullName:
 *                             type: string
 *                             example: "John Doe"
 *                           phoneNumber:
 *                             type: string
 *                             example: "+1234567890"
 *                           pickupAddress:
 *                             type: string
 *                             example: "123 Main Street"
 *                           deliveryDate:
 *                             type: string
 *                             format: date
 *                             example: "2026-01-15"
 *                           stage:
 *                             type: object
 *                             properties:
 *                               status:
 *                                 type: string
 *                                 example: "hold"
 *                           userId:
 *                             type: string
 *                             description: Populated user reference
 *                             example: "64d3c9c0f1b2a8e9d0f54321"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-01-13T12:34:56.789Z"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 30
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         totalPages:
 *                           type: integer
 *                           example: 3
 *       400:
 *         description: Invalid type supplied
 *       500:
 *         description: Server error
 */
router.get(ROUTE_HOLD_ORDERS, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.getHoldOrders(req, res);
});

/**
 * @swagger
 * /admin/orders/{id}/reassign-station:
 *   put:
 *     summary: Reassign order to a different processing station
 *     tags:
 *       - Admin
 *     description: Moves an order to a specific internal station (intake, sorting, washing, ironing, QC) and updates its stage history with an admin note.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique order ID
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum:
 *             [
 *               intake-and-tag-station,
 *               sort-and-pretreat-station,
 *               wash-and-dry-station,
 *               pressing-and-ironing-station,
 *               qc-station
 *             ]
 *         description: Target station to reassign the order to
 *       - in: body
 *         name: note
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             note:
 *               type: string
 *               example: "Reassigned due to missing tags"
 *         description: Admin note explaining the reassignment
 *     responses:
 *       200:
 *         description: Order reassigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order OSC12345 has been assigned and sent to be resolved"
 *       400:
 *         description: Invalid input (missing orderId, note, or invalid station type)
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.put(ROUTE_ADMIN_ORDERS_ID_REASSIGN_STATION, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.reAssignOrderStation(req, res);
});

/**
 * @swagger
 * /admin/wallet/{id}/add-fund:
 *   put:
 *     summary: Add funds to a user's wallet
 *     tags:
 *       - Admin
 *     description: Credits a specified amount to a user's wallet, logs the transaction, and sends a notification.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique user ID
 *       - in: body
 *         name: body
 *         required: true
 *         schema:
 *           type: object
 *           required:
 *             - amount
 *           properties:
 *             amount:
 *               type: number
 *               example: 5000
 *             message:
 *               type: string
 *               example: "Admin top-up"
 *         description: Amount to add and optional message
 *     responses:
 *       200:
 *         description: Fund added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Fund added to wallet successfully"
 *       400:
 *         description: Invalid input (missing or invalid amount/userId)
 *       404:
 *         description: Wallet not found
 *       500:
 *         description: Server error
 */
router.put(ROUTE_ADMIN_WALLET_ID_ADD_FUND, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.addFund(req, res);
});

/**
 * @swagger
 * /admin/wallet/{id}/deduct-fund:
 *   put:
 *     summary: Deduct funds from a user's wallet
 *     tags:
 *       - Admin
 *     description: Debits a specified amount from a user's wallet, logs the transaction, and sends a notification.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique user ID
 *       - in: body
 *         name: body
 *         required: true
 *         schema:
 *           type: object
 *           required:
 *             - amount
 *           properties:
 *             amount:
 *               type: number
 *               example: 2000
 *             message:
 *               type: string
 *               example: "Service charge deduction"
 *         description: Amount to deduct and optional message
 *     responses:
 *       200:
 *         description: Fund deducted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Fund deducted from wallet successfully"
 *       400:
 *         description: Invalid input (missing amount, insufficient balance, or invalid userId)
 *       404:
 *         description: Wallet not found
 *       500:
 *         description: Server error
 */
router.put(ROUTE_ADMIN_WALLET_ID_DEDUCT_FUND, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.deductFund(req, res);
});

/**
 * @swagger
 * /admin/audit-lite:
 *   get:
 *     summary: Get audit log — paginated activity feed with filtering
 *     description: Returns a timestamped log of all system events. Filterable by event type, date range, and search term. Supports CSV export via client.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "ORD-2024-001" }
 *         description: Search by reference, event title, or description
 *       - in: query
 *         name: type
 *         schema: { type: string, example: "wallet-top-up" }
 *         description: Filter by event type (use eventTypes array from response)
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date, example: "2026-01-01" }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date, example: "2026-04-30" }
 *     responses:
 *       200:
 *         description: Paginated audit log
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
 *                           _id:
 *                             type: string
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-03-23T09:45:00.000Z"
 *                           event:
 *                             type: string
 *                             example: "Dispatch Run Created"
 *                           type:
 *                             type: string
 *                             example: "dispatch-delivery"
 *                           reference:
 *                             type: string
 *                             nullable: true
 *                             example: "OSC-20260428-321782"
 *                           by:
 *                             type: string
 *                             nullable: true
 *                             example: "Ben Gerald"
 *                           notes:
 *                             type: string
 *                             example: "ORD-2024-001 order assigned to rider"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 50 }
 *                         page: { type: integer, example: 1 }
 *                         limit: { type: integer, example: 10 }
 *                         pages: { type: integer, example: 5 }
 *                     eventTypes:
 *                       type: array
 *                       description: All available event types for the filter dropdown
 *                       items:
 *                         type: string
 *                       example: ["order-created", "dispatch-delivery", "wallet-top-up"]
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get(ROUTE_ADMIN_AUDIT_LITE, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.getAuditLite(req, res)
})

/**
 * @swagger
 * /admin/search-wallet:
 *   get:
 *     summary: Search customer wallets
 *     tags:
 *       - Admin
 *     description: Search for customer wallets using customer full name or phone number.
 *     parameters:
 *       - in: query
 *         name: search
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer full name or phone number
 *         example: john
 *     responses:
 *       200:
 *         description: Wallet search completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "6820d4a5b1e7b7c1a1234567"
 *                       userId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "6820d4a5b1e7b7c1a7654321"
 *                           fullName:
 *                             type: string
 *                             example: "John Doe"
 *                           phoneNumber:
 *                             type: string
 *                             example: "08012345678"
 *                       balance:
 *                         type: number
 *                         example: 25000
 *                       currency:
 *                         type: string
 *                         example: "NGN"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-05-11T10:00:00.000Z"
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-05-11T12:00:00.000Z"
 *       400:
 *         description: Search query is required
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
 *                   example: "Search query is required"
 *       500:
 *         description: Failed to search wallet
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
 *                   example: "Failed to search wallet"
 */
router.get(ROUTE_SEARCH_WALLET, [], (req, res) => {
    const adminController = new AdminController()
    return adminController.searchWallet(req, res)
})


module.exports = router;