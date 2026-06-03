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
    ROUTE_SEARCH_WALLET,
    ROUTE_SEARCH_ORDERS,
    ROUTE_SEARCH_ORDER_DETAIL,
    ROUTE_ADMIN_ORDER_DETAILS,
    ROUTE_ADD_ORDER_ITEM,
    ROUTE_UPDATE_ORDER_ITEM_ID,
    ROUTE_GET_ORDER_ITEMS,
    ROUTE_GET_ORDER_ITEM_ID,
    ROUTE_DELETE_ORDER_ITEM_ID,
    ROUTE_UPDATE_ORDER_DETAILS,
    ROUTE_UPDATE_ADMIN_SETTING,
    ROUTE_GET_ADMIN_SETTING,
    ROUTE_ADMIN_SEND_TO_HOLD_ORDERS,
    ROUTE_ADMIN_RESOLVE_ORDER_HOLD,
    ROUTE_GET_AUDIT_LOGS
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
 *                     totalRevenue:
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
 * /admin/admin-order-details:
 *   get:
 *     summary: Get admin order details
 *     tags:
 *       - Admin
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
 *                       example: ["standard", "express", "same-day"]
 *                     pickupTime:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["10am-12pm", "4pm-6pm"]
 *                     standardCapacity:
 *                       type: number
 *                       example: 400
 *                     sameDayCapacity:
 *                       type: number
 *                       example: 400
 *                     expressCapacity:
 *                       type: number
 *                       example: 400
 *                     standardDeliveryPeriod:
 *                       type: number
 *                       example: 2
 *                       description: Period in days for the standard delivery to be ready because of too much orders
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
router.get(ROUTE_ADMIN_ORDER_DETAILS, [auth], (req, res) => {
    const bookOrderController = new AdminController();
    return bookOrderController.getAdminOrderDetails(req, res);
  });

/**
 * @swagger
 * /admin/get-admin-setting:
 *   get:
 *     summary: Get admin setting
 *     tags:
 *       - Admin
 *     responses:
 *       200:
 *         description: Returns an admin setting object
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
 *                     washAndIronPerKg:
 *                       type: number
 *                       example: 400
 *                     washOnlyPerKg:
 *                       type: number
 *                       example: 400
 *                     ironOnlyPerPiece:
 *                       type: number
 *                       example: 400
 *                     dryCleanPerPiece:
 *                       type: number
 *                       example: 400
 *                     sameDayCharge:
 *                       type: number
 *                       example: 400
 *                     expressCharge:
 *                       type: number
 *                       example: 400
 *                     premiumServiceTierCharge:
 *                       type: number
 *                       example: 1.5
 *                     vipServiceTierCharge:
 *                       type: number
 *                       example: 2
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
router.get(ROUTE_GET_ADMIN_SETTING, [auth], (req, res) => {
    const bookOrderController = new AdminController();
    return bookOrderController.getAdminSetting(req, res);
});

/**
 * @swagger
 * /admin/update-order-details:
 *   put:
 *     summary: Update admin order details
 *     tags:
 *       - Admin
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serviceType:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["ironing-only", "washing-only", "wash-and-iron"]
 *               billingType:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["pay-per-item", "pay-from-subscription"]
 *               serviceTiers:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["student", "standard", "premium", "vip"]
 *               deliverySpeed:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["standard", "express", "same-day"]
 *               pickupTime:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["10am-12pm", "4pm-6pm"]
 *               standardCapacity:
 *                 type: number
 *                 example: 400
 *               sameDayCapacity:
 *                 type: number
 *                 example: 400
 *               expressCapacity:
 *                 type: number
 *                 example: 400
 *               standardDeliveryPeriod:
 *                 type: number
 *                 example: 2
 *                 description: Period in days for the standard delivery to be ready because of too much orders
 *               sameDayCharge:
 *                 type: number
 *                 example: 500
 *                 description: Charge for same day
 *               expressCharge:
 *                 type: number
 *                 example: 200
 *                 description: Charge for express day
 *               premiumServiceTierCharge:
 *                 type: number
 *                 example: 1.5
 *                 description: Charge for premium service tier
 *               vipServiceTierCharge:
 *                 type: number
 *                 example: 2
 *                 description: Charge for vip service tier
 *     responses:
 *       200:
 *         description: Admin order details updated successfully
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
 *                       example: ["standard", "express", "same-day"]
 *                     pickupTime:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["10am-12pm", "4pm-6pm"]
 *                     standardCapacity:
 *                       type: number
 *                       example: 400
 *                     sameDayCapacity:
 *                       type: number
 *                       example: 400
 *                     expressCapacity:
 *                       type: number
 *                       example: 400
 *                     standardDeliveryPeriod:
 *                       type: number
 *                       example: 2
 *                       description: Period in days for the standard delivery to be ready because of too much orders
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2026-01-12T10:00:00.000Z
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2026-01-12T10:00:00.000Z
 *       400:
 *         description: Invalid input data supplied
 *       404:
 *         description: Admin order details not found to update
 *       500:
 *         description: Server error
 */
router.put(ROUTE_UPDATE_ORDER_DETAILS, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.updateOrderDetails(req, res);
});

/**
 * @swagger
 * /admin/update-admin-setting:
 *   put:
 *     summary: Update system-wide admin settings
 *     tags:
 *       - Admin
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               washAndIronPerKg:
 *                 type: number
 *                 example: 1200
 *                 description: Cost per kilogram for washing and ironing
 *               washOnlyPerKg:
 *                 type: number
 *                 example: 800
 *                 description: Cost per kilogram for washing only
 *               ironOnlyPerPiece:
 *                 type: number
 *                 example: 300
 *                 description: Cost per individual piece for ironing only
 *               dryCleanPerPiece:
 *                 type: number
 *                 example: 1500
 *                 description: Cost per individual piece for dry cleaning
 *               sameDayCharge:
 *                 type: number
 *                 example: 500
 *                 description: Additional dynamic fee for same-day delivery service
 *               expressCharge:
 *                 type: number
 *                 example: 200
 *                 description: Additional dynamic fee for express delivery service
 *               premiumServiceTierCharge:
 *                 type: number
 *                 example: 1.5
 *                 description: Surcharge multiplier for premium service tier (e.g., 1.5 means 50% increase over base price)
 *               vipServiceTierCharge:
 *                 type: number
 *                 example: 2
 *                 description: Surcharge multiplier for VIP service tier (e.g., 2 means 100% increase over base price)
 *               serviceType:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["ironing-only", "washing-only", "wash-and-iron"]
 *               pickupTimeSlots:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["10am-12pm", "4pm-6pm"]
 *     responses:
 *       200:
 *         description: Admin settings updated successfully
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
 *                   example: Settings updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 64fa12b8a4b7c91234567890
 *                     washAndIronPerKg:
 *                       type: number
 *                       example: 1200
 *                     washOnlyPerKg:
 *                       type: number
 *                       example: 800
 *                     ironOnlyPerPiece:
 *                       type: number
 *                       example: 300
 *                     dryCleanPerPiece:
 *                       type: number
 *                       example: 1500
 *                     sameDayCharge:
 *                       type: number
 *                       example: 500
 *                     expressCharge:
 *                       type: number
 *                       example: 200
 *                     premiumServiceTierCharge:
 *                       type: number
 *                       example: 1.5
 *                     vipServiceTierCharge:
 *                       type: number
 *                       example: 2
 *                     serviceType:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["ironing-only", "washing-only", "wash-and-iron"]
 *                     pickupTimeSlots:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["10am-12pm", "4pm-6pm"]
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2026-01-12T10:00:00.000Z
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2026-05-19T14:00:00.000Z
 *       400:
 *         description: Invalid value or payload format supplied
 *       401:
 *         description: Unauthorized access (Missing token)
 *       403:
 *         description: Forbidden access (User is not an admin)
 *       500:
 *         description: Internal server database error
 */
router.put(ROUTE_UPDATE_ADMIN_SETTING, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.updateAdminSettings(req, res);
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
 *     description: |
 *       Retrieves paginated orders based on logistics state.
 *       Optionally filter by date range using startDate and endDate.
 *
 *       **Examples:**
 *       - All delivery orders: `/admin/orders/by-state?type=delivery`
 *       - Delivered in May: `/admin/orders/by-state?type=delivered&startDate=2026-05-01&endDate=2026-05-31`
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [all, delivery, pendingPickup, assigned, delivered]
 *         description: Type of order state filter
 *       - in: query
 *         name: startDate
 *         required: false
 *         schema: { type: string, format: date, example: "2026-05-01" }
 *         description: Filter orders created on or after this date
 *       - in: query
 *         name: endDate
 *         required: false
 *         schema: { type: string, format: date, example: "2026-05-31" }
 *         description: Filter orders created on or before this date
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
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
 *                           _id:          { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *                           fullName:     { type: string, example: "John Doe" }
 *                           phoneNumber:  { type: string, example: "+1234567890" }
 *                           pickupAddress: { type: string, example: "123 Main Street" }
 *                           deliveryDate: { type: string, format: date }
 *                           stage:
 *                             type: object
 *                             properties:
 *                               status: { type: string, example: "out-for-delivery" }
 *                           dispatchDetails:
 *                             type: object
 *                             properties:
 *                               pickup:
 *                                 type: object
 *                                 properties:
 *                                   status: { type: string, example: "scheduled" }
 *                               delivery:
 *                                 type: object
 *                                 properties:
 *                                   status: { type: string, example: "out-for-delivery" }
 *                           createdAt: { type: string, format: date-time }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:      { type: integer, example: 120 }
 *                         page:       { type: integer, example: 1 }
 *                         limit:      { type: integer, example: 10 }
 *                         totalPages: { type: integer, example: 12 }
 *       400:
 *         description: Invalid or missing type parameter
 *       500:
 *         description: Server error
 */
router.get(ROUTE_ADMIN_ORDER_BY_STATE, adminAuth, (req, res) => {
    const adminController = new AdminController()
    return adminController.getOrdersByState(req, res)
})

/**
 * @swagger
 * /admin/dispatch/data-count:
 *   get:
 *     summary: Get dispatch dashboard counts with per-day breakdown
 *     tags:
 *       - Admin
 *     description: |
 *       Returns summary counts and per-day breakdown for dispatch operations.
 *       Defaults to today if no date range is provided.
 *
 *       **Examples:**
 *       - Today only: `/admin/dispatch/data-count`
 *       - From date: `/admin/dispatch/data-count?startDate=2026-06-01`
 *       - Full range: `/admin/dispatch/data-count?startDate=2026-05-01&endDate=2026-05-31`
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: false
 *         schema: { type: string, format: date, example: "2026-05-01" }
 *         description: Start of date range (defaults to today)
 *       - in: query
 *         name: endDate
 *         required: false
 *         schema: { type: string, format: date, example: "2026-05-31" }
 *         description: End of date range (defaults to today)
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
 *                     range:
 *                       type: object
 *                       properties:
 *                         from: { type: string, format: date-time }
 *                         to:   { type: string, format: date-time }
 *                     totals:
 *                       type: object
 *                       properties:
 *                         pendingPickupOrders: { type: integer, example: 5 }
 *                         scheduledPickups:    { type: integer, example: 8 }
 *                         inProgressPickups:   { type: integer, example: 3 }
 *                         pickedUpToday:       { type: integer, example: 12 }
 *                         outForDelivery:      { type: integer, example: 6 }
 *                         deliveredToday:      { type: integer, example: 20 }
 *                         deliveryFailed:      { type: integer, example: 1 }
 *                     dayBreakdown:
 *                       type: object
 *                       properties:
 *                         pickedUp:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:   { type: string, example: "2026-05-28" }
 *                               count: { type: integer, example: 4 }
 *                         delivered:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:   { type: string, example: "2026-05-28" }
 *                               count: { type: integer, example: 7 }
 *                         failed:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:   { type: string, example: "2026-05-28" }
 *                               count: { type: integer, example: 1 }
 *       500:
 *         description: Server error
 */
router.get(ROUTE_ADMIN_DISPATCH_DATA_COUNT, adminAuth, (req, res) => {
    const adminController = new AdminController()
    return adminController.getDispatchAdminDataCount(req, res)
})

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
 * /admin/order/{id}/send-to-hold:
 *   patch:
 *     summary: Admin raises a hold on any order
 *     description: |
 *       Admin can place any order on hold regardless of its current stage,
 *       assign it to a specific station to resolve, and add a reason and note.
 *       Unlike station-level holds this acts on the whole order not a single item.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *         description: Order ID
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
 *                 example: "item_missing"
 *                 description: Reason for hold — free text, use hold-reasons endpoint for suggestions
 *               assignTo:
 *                 type: string
 *                 enum: [admin, intake-and-tag, sort-and-pretreat, wash-and-dry, press, qc]
 *                 example: "intake-and-tag"
 *                 description: Station role responsible for resolving the hold
 *               note:
 *                 type: string
 *                 example: "Customer declared 5 shirts but only 4 received"
 *                 description: Optional additional explanation
 *     responses:
 *       200:
 *         description: Order placed on hold successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order placed on hold successfully"
 *       400:
 *         description: Missing reason, assignTo, or invalid assignTo value
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_ADMIN_SEND_TO_HOLD_ORDERS, adminAuth, (req, res) => {
    const adminController = new AdminController()
    return adminController.adminSendToHold(req, res)
})

/**
 * @swagger
 * /admin/orders/{id}/reassign-station:
 *   patch:
 *     summary: Reassign a held order to a different station
 *     description: |
 *       Shifts the hold to another station without closing it.
 *       The hold remains open — only stationStatus changes so the target
 *       station can see and action it. stage.status stays HOLD throughout.
 *
 *       **Order must currently be in HOLD status.**
 *       Use `/admin/resolve-order-hold` to close the hold completely.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *         description: Order ID
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum:
 *             - intake-and-tag-station
 *             - sort-and-pretreat-station
 *             - wash-and-dry-station
 *             - pressing-and-ironing-station
 *             - qc-station
 *         description: Target station to reassign the hold to
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [note]
 *             properties:
 *               note:
 *                 type: string
 *                 example: "Reassigned to intake — tags need to be re-verified"
 *     responses:
 *       200:
 *         description: Hold reassigned successfully — hold remains open
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order OSC-20260528-123456 hold reassigned to intake-and-tag-station"
 *       400:
 *         description: |
 *           - Order is not currently on hold
 *           - Missing note
 *           - Invalid station type
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_ADMIN_ORDERS_ID_REASSIGN_STATION, adminAuth, (req, res) => {
    const adminController = new AdminController()
    return adminController.reAssignOrderStation(req, res)
})

/**
 * @swagger
 * /admin/order/{id}/resolve-hold:
 *   patch:
 *     summary: Resolve a hold and return order to normal flow
 *     description: |
 *       Closes the hold completely and returns the order to the specified
 *       station's normal processing flow. stage.status changes from HOLD
 *       back to the station's active ORDER_STATUS.
 *
 *       **Order must currently be in HOLD status.**
 *
 *       Station → ORDER_STATUS mapping:
 *       - `intake-and-tag-station`        → queue
 *       - `sort-and-pretreat-station`     → sort-and-pretreat
 *       - `wash-and-dry-station`          → washing
 *       - `pressing-and-ironing-station`  → ironing
 *       - `qc-station`                    → qc
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum:
 *             - intake-and-tag-station
 *             - sort-and-pretreat-station
 *             - wash-and-dry-station
 *             - pressing-and-ironing-station
 *             - qc-station
 *         description: Station the order returns to after hold is resolved
 *       - in: query
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [note]
 *             properties:
 *               note:
 *                 type: string
 *                 example: "Missing item has been located and added to the order"
 *     responses:
 *       200:
 *         description: Hold resolved — order returned to normal flow
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order OSC-20260528-123456 hold resolved. Returned to qc-station"
 *       400:
 *         description: |
 *           - Order is not currently on hold
 *           - Missing resolution note
 *           - Invalid station type
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_ADMIN_RESOLVE_ORDER_HOLD, adminAuth, (req, res) => {
    const adminController = new AdminController()
    return adminController.resolveOrderHold(req, res)
})

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
router.get(ROUTE_SEARCH_WALLET, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.searchWallet(req, res)
})

/**
 * @swagger
 * /admin/search-orders:
 *   get:
 *     summary: Search orders by OSC number, phone number, or customer name
 *     description: |
 *       Searches book orders using a free-text term matched against oscNumber,
 *       phoneNumber, and fullName fields. Results can additionally be filtered
 *       to a date range (last 7 days, 30 days, 90 days, this year, or a custom
 *       start/end date window). Requires admin authentication.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: >
 *           Search term matched against Order ID (oscNumber), phone number, or
 *           customer name. Leave empty to return all orders within the chosen
 *           date range.
 *         example: OSC-2024-001
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [7days, 30days, 90days, thisYear, custom]
 *         description: >
 *           Predefined date range for filtering. Use 'custom' together with
 *           startDate and endDate to define an arbitrary window.
 *         example: 7days
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start of custom date range (ISO format). Required when range is 'custom'.
 *         example: "2026-01-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End of custom date range (ISO format). Required when range is 'custom'.
 *         example: "2026-03-31"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of results per page.
 *     responses:
 *       200:
 *         description: Search results returned successfully
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
 *                     total:
 *                       type: integer
 *                       example: 50
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
 *                             example: "663f1a2b4c8e4a001f9d0001"
 *                           oscNumber:
 *                             type: string
 *                             example: "OSC-2024-001"
 *                           fullName:
 *                             type: string
 *                             example: "Jane Doe"
 *                           phoneNumber:
 *                             type: string
 *                             example: "+2348012345678"
 *                           stage:
 *                             type: object
 *                             properties:
 *                               status:
 *                                 type: string
 *                                 example: "pending"
 *                           paymentStatus:
 *                             type: string
 *                             example: "success"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-03-23T09:40:00.000Z"
 *       400:
 *         description: Bad request – missing or invalid query parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get(ROUTE_SEARCH_ORDERS, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.searchOrders(req, res)
})

/**
 * @swagger
 * /admin/order/{id}:
 *   get:
 *     summary: Get full detail of a single order (drill-down from search results)
 *     description: |
 *       Returns the complete order document for the given MongoDB `_id`,
 *       with the linked user's name, email, phone, and avatar populated.
 *       Use the `_id` returned in the search-orders response.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the order
 *         example: "663f1a2b4c8e4a001f9d0001"
 *     responses:
 *       200:
 *         description: Order detail returned successfully
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
 *                   description: Full BookOrder document with populated userId
 *       400:
 *         description: Missing or invalid order id
 *       404:
 *         description: Order not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get(ROUTE_SEARCH_ORDER_DETAIL, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.getOrderDetail(req, res)
})

/**
 * @swagger
 * /admin/add-order-item:
 *   post:
 *     summary: Add an order item
 *     tags:
 *       - Admin
 *     description: Add an order item
 *     parameters:
 *       - in: body
 *         name: body
 *         required: true
 *         schema:
 *           type: object
 *           required:
 *             - amount
 *           properties:
 *             name:
 *               type: string
 *               example: Shirt
 *             price:
 *               type: number
 *               example: 400
 *         description: Details of the item to be added
 *     responses:
 *       200:
 *         description: Item updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order item updated successfully"
 *       400:
 *         description: Invalid input (missing or invalid amount/userId)
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.post(ROUTE_ADD_ORDER_ITEM, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.addItem(req, res)
})

/**
 * @swagger
 * /admin/update-order-item/{id}:
 *   put:
 *     summary: Update an order item
 *     tags:
 *       - Admin
 *     description: Update an order item
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
 *             name:
 *               type: string
 *               example: Shirt
 *             price:
 *               type: number
 *               example: 400
 *         description: Amount of the items
 *     responses:
 *       200:
 *         description: Item updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order item updated successfully"
 *       400:
 *         description: Invalid input (missing or invalid amount/userId)
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.put(ROUTE_UPDATE_ORDER_ITEM_ID, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.updateItem(req, res)
})

/**
 * @swagger
 * /admin/get-order-items:
 *   get:
 *     summary: Get all order items
 *     tags:
 *       - Admin
 *     description: Fetch all order items
 *     responses:
 *       200:
 *         description: Successfully retrieved order items
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
 *                           name:
 *                             type: string
 *                             example: "Shirt"
 *                           price:
 *                             type: number
 *                             example: 400
 *       400:
 *         description: Invalid type supplied
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_ORDER_ITEMS, [auth], (req, res) => {
    const adminController = new AdminController()
    return adminController.getItems(req, res)
})

/**
 * @swagger
 * /admin/get-order-item/{id}:
 *   get:
 *     summary: Get order item
 *     tags:
 *       - Admin
 *     description: Returns order item
 *     responses:
 *       200:
 *         description: Order item fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: Shirt
 *                     price:
 *                       type: number
 *                       example: 500
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_ORDER_ITEM_ID, [auth], (req, res) => {
    const adminController = new AdminController()
    return adminController.getItem(req, res)
})

/**
 * @swagger
 * /admin/delete-order-item/{id}:
 *   delete:
 *     summary: Delete an order item
 *     tags:
 *       - Admin
 *     description: Delete an order item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique user ID
 *     responses:
 *       200:
 *         description: Item deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order item deleted successfully"
 *       400:
 *         description: Invalid input (missing or invalid amount/userId)
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.delete(ROUTE_DELETE_ORDER_ITEM_ID, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.deleteItem(req, res)
})

/**
 * @swagger
 * /admin/audit-logs:
 *   get:
 *     summary: Get all audit logs
 *     tags:
 *       - Admin
 *     description: Retrieve a list of system audit logs with optional filtering.
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter logs by the ID of the user who performed the action.
 *       - in: query
 *         name: action
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter logs by specific action type.
 *       - in: query
 *         name: orderId
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter logs related to a specific order ID.
 *       - in: query
 *         name: category
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter logs by category.
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "success"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "65cb3f8e21a4b3d8f28c1101"
 *                       userId:
 *                         type: string
 *                         example: "user_99238"
 *                       action:
 *                         type: string
 *                         example: "DELETE_ORDER_ITEM"
 *                       orderId:
 *                         type: string
 *                         example: "order_55102"
 *                       category:
 *                         type: string
 *                         example: "ORDER_MANAGEMENT"
 *                       metadata:
 *                         type: object
 *                         additionalProperties: true
 *                         example: { "deletedItemId": "item_112", "reason": "Customer request" }
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-06-03T12:00:00.000Z"
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-06-03T12:00:00.000Z"
 *       401:
 *         description: Unauthorized access (Missing or invalid token)
 *       403:
 *         description: Forbidden access (Admin privilege required)
 *       500:
 *         description: Internal server error
 */
router.get(ROUTE_GET_AUDIT_LOGS, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.getAuditLogs(req, res)
})

module.exports = router;