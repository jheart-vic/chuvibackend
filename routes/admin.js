const AdminController = require("../controllers/admin.controller");
const adminAuth = require("../middlewares/adminAuth");
const auth = require("../middlewares/auth");
const {
    ROUTE_ADMIN_DASHBOARD_STATS,
    ROUTE_ADMIN_ORDER_MANAGEMENT,
    ROUTE_ADMIN_ORDER_ORDERID,
    ROUTE_ADMIN_PAYMENT_VERIFICATION_QUEUE,
    ROUTE_ADMIN_WALLET_ADJUSTMENT_REQUESTS,
    ROUTE_ADMIN_WALLET_ADJUSTMENT_APPROVE,
    ROUTE_ADMIN_WALLET_ADJUSTMENT_REJECT,
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
    ROUTE_ADMIN_WALLET_TRANSACTIONS,
    ROUTE_ADMIN_STAFF,
    ROUTE_ADMIN_STAFF_STATUS,
    ROUTE_ADMIN_HOLD_TYPES,
    ROUTE_ADMIN_PROFILE_DUPLICATES,
    ROUTE_ADMIN_PROFILE_DUPLICATES_MERGE,
    ROUTE_ADMIN_HOLD_TYPE_BY_ID,
    ROUTE_ORDER_PAYMENT_HOLD_WAIVE,
    ROUTE_ADMIN_BANK_CHECK_LIST,
    ROUTE_ADMIN_DISPLAY_NAMES,
    ROUTE_ADMIN_BOOKING_WINDOWS,
    ROUTE_ADMIN_BOOKING_WINDOW_BY_ID,
    ROUTE_ADMIN_WORKING_DAYS,
    ROUTE_ADMIN_WINDOW_DEFLECTIONS,
    ROUTE_SEARCH_ORDERS,
    ROUTE_SEARCH_ORDER_DETAIL,
    ROUTE_ADMIN_ORDER_DETAILS,
    ROUTE_ADD_ORDER_ITEM,
    ROUTE_UPDATE_ORDER_ITEM_ID,
    ROUTE_GET_ORDER_ITEMS,
    ROUTE_GET_ORDER_ITEM_ID,
    ROUTE_DELETE_ORDER_ITEM_ID,
    ROUTE_ADD_ORDER_SET,
    ROUTE_UPDATE_ORDER_SET_ID,
    ROUTE_GET_ORDER_SETS,
    ROUTE_GET_ORDER_SET_ID,
    ROUTE_DELETE_ORDER_SET_ID,
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         totalActiveOrders:
 *                           type: integer
 *                           example: 120
 *                         totalRevenue:
 *                           type: integer
 *                           example: 120
 *                         revenueTodayVerified:
 *                           type: number
 *                           example: 50000
 *                         revenueTodayChange:
 *                           type: number
 *                           description: Percentage change compared to yesterday
 *                           example: 12.5
 *                         avgProcessingTime:
 *                           type: number
 *                           description: Average processing time in milliseconds
 *                           example: 3600000
 *                         overdueOrders:
 *                           type: integer
 *                           example: 15
 *                         dueToday:
 *                           type: integer
 *                           example: 20
 *                         bottleNeckStation:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             _id:
 *                               type: string
 *                               example: "washing"
 *                             count:
 *                               type: integer
 *                               example: 45
 *                         readyAndWaiting:
 *                           type: integer
 *                           example: 10
 *                         pendingPayment:
 *                           type: integer
 *                           example: 8
 *                         activeHolds:
 *                           type: integer
 *                           example: 5
 *                         overdueHolds:
 *                           type: integer
 *                           example: 2
 *                         deliveryIssues:
 *                           type: integer
 *                           example: 3
 *                         avgCostPerItem7Days:
 *                           type: number
 *                           example: 250
 *                         totalSubscribers:
 *                           type: integer
 *                           example: 300
 *                         monthlyRevenueAgg:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: object
 *                                 properties:
 *                                   year:
 *                                     type: integer
 *                                     example: 2026
 *                                   month:
 *                                     type: integer
 *                                     example: 4
 *                               totalRevenue:
 *                                 type: number
 *                                 example: 250000
 *                               totalSubscriptions:
 *                                 type: integer
 *                                 example: 120
 *                         planDistributionAgg:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               planId:
 *                                 type: string
 *                                 example: "abc123"
 *                               title:
 *                                 type: string
 *                                 example: "Premium"
 *                               count:
 *                                 type: integer
 *                                 example: 80
 *                               percentage:
 *                                 type: number
 *                                 example: 66.67
 *                         graphResult:
 *                           type: array
 *                           description: Orders trend for the last 12 hours (2-hour intervals)
 *                           items:
 *                             type: object
 *                             properties:
 *                               time:
 *                                 type: string
 *                                 example: "08:00"
 *                               newOrders:
 *                                 type: integer
 *                                 example: 20
 *                               completedOrders:
 *                                 type: integer
 *                                 example: 10
 *                         activities:
 *                           type: array
 *                           description: Latest system activities
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "64d3c9c0f1b2a8e9d0f12345"
 *                               message:
 *                                 type: string
 *                                 example: "Order created"
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2026-01-13T12:34:56.789Z"
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "64d3c9c0f1b2a8e9d0f12345"
 *                               fullName:
 *                                 type: string
 *                                 example: "John Doe"
 *                               phoneNumber:
 *                                 type: string
 *                                 example: "+1234567890"
 *                               pickupAddress:
 *                                 type: string
 *                                 example: "123 Main Street"
 *                               pickupDate:
 *                                 type: string
 *                                 format: date
 *                                 example: "2026-01-13"
 *                               deliveryDate:
 *                                 type: string
 *                                 format: date
 *                                 example: "2026-01-15"
 *                               serviceType:
 *                                 type: string
 *                                 example: "wash-and-iron"
 *                               serviceTier:
 *                                 type: string
 *                                 example: "premium"
 *                               amount:
 *                                 type: number
 *                                 example: 150
 *                               paymentStatus:
 *                                 type: string
 *                                 example: "pending"
 *                               stage:
 *                                 type: object
 *                                 properties:
 *                                   status:
 *                                     type: string
 *                                     example: "washing"
 *                                   note:
 *                                     type: string
 *                                     example: "Processing started"
 *                               dispatchDetails:
 *                                 type: object
 *                                 properties:
 *                                   pickup:
 *                                     type: object
 *                                     properties:
 *                                       status:
 *                                         type: string
 *                                         example: "pending"
 *                                   delivery:
 *                                     type: object
 *                                     properties:
 *                                       status:
 *                                         type: string
 *                                         example: "ready"
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2026-01-13T12:34:56.789Z"
 *                         pagination:
 *                           type: object
 *                           properties:
 *                             total:
 *                               type: integer
 *                               example: 50
 *                             page:
 *                               type: integer
 *                               example: 1
 *                             limit:
 *                               type: integer
 *                               example: 10
 *                             totalPages:
 *                               type: integer
 *                               example: 5
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
 *               walletAdjustmentLimits:
 *                 type: object
 *                 description: >
 *                   Brief item 2.4 — the most one operator of each role may move in a single
 *                   wallet adjustment, in naira. Keys are ROLE values; a role with NO entry has a
 *                   limit of 0, meaning every adjustment it makes becomes an approval request.
 *                   Admin is unlimited and is never read from here.
 *                   WARNING: this is replaced WHOLESALE, not merged — send every role you want to
 *                   keep, or the omitted ones fall back to 0. Read the current values from
 *                   GET /admin/get-admin-setting first.
 *                 additionalProperties: { type: number }
 *                 example:
 *                   intake-and-tag: 5000
 *                   customer-experience: 10000
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       description: >
 *                         The SAVED AdminSetting document itself — not a confirmation string.
 *                         (This block used to document `message` as a string with the document
 *                         beside it under `data`; neither matched the wire.) Read the limits
 *                         back from here to confirm what was stored.
 *                       properties:
 *                         _id:
 *                           type: string
 *                           example: 64fa12b8a4b7c91234567890
 *                         washAndIronPerKg:
 *                           type: number
 *                           example: 1200
 *                         washOnlyPerKg:
 *                           type: number
 *                           example: 800
 *                         ironOnlyPerPiece:
 *                           type: number
 *                           example: 300
 *                         dryCleanPerPiece:
 *                           type: number
 *                           example: 1500
 *                         sameDayCharge:
 *                           type: number
 *                           example: 500
 *                         expressCharge:
 *                           type: number
 *                           example: 200
 *                         premiumServiceTierCharge:
 *                           type: number
 *                           example: 1.5
 *                         vipServiceTierCharge:
 *                           type: number
 *                           example: 2
 *                         serviceType:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["ironing-only", "washing-only", "wash-and-iron"]
 *                         pickupTimeSlots:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["10am-12pm", "4pm-6pm"]
 *                         walletAdjustmentLimits:
 *                           type: object
 *                           additionalProperties: { type: number }
 *                           example:
 *                             intake-and-tag: 5000
 *                             customer-experience: 10000
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                           example: 2026-01-12T10:00:00.000Z
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                           example: 2026-05-19T14:00:00.000Z
 *       400:
 *         description: >
 *           Invalid value or payload format — **or** the payload would change or
 *           remove a `serviceTypes[].name` that existing orders depend on.
 *
 *
 *           A service type's name is the key an order uses to find its price, so
 *           renaming or dropping one would silently under-price every order
 *           already placed under the old name. The refusal carries
 *           `blockedServiceTypes` (each with its name and order count) and
 *           `useInstead: "/api/admin/display-names"` — **to change what people
 *           SEE, use that endpoint instead.** Adding a type, changing a price,
 *           and removing a type no order has used are all still allowed.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                           example: "64d3c9c0f1b2a8e9d0f12345"
 *                         fullName:
 *                           type: string
 *                           example: "John Doe"
 *                         phoneNumber:
 *                           type: string
 *                           example: "+1234567890"
 *                         pickupAddress:
 *                           type: string
 *                           example: "123 Main Street"
 *                         pickupDate:
 *                           type: string
 *                           format: date
 *                           example: "2026-01-13"
 *                         deliveryDate:
 *                           type: string
 *                           format: date
 *                           example: "2026-01-15"
 *                         serviceType:
 *                           type: string
 *                           example: "wash-and-iron"
 *                         serviceTier:
 *                           type: string
 *                           example: "premium"
 *                         deliverySpeed:
 *                           type: string
 *                           example: "express"
 *                         amount:
 *                           type: number
 *                           example: 150
 *                         paymentStatus:
 *                           type: string
 *                           example: "pending"
 *                         stage:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               example: "washing"
 *                             note:
 *                               type: string
 *                               example: "Processing started"
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               type:
 *                                 type: string
 *                                 example: "shirt"
 *                               price:
 *                                 type: number
 *                                 example: 50
 *                               quantity:
 *                                 type: number
 *                                 example: 2
 *                               tagStatus:
 *                                 type: string
 *                                 example: "pending"
 *                         dispatchDetails:
 *                           type: object
 *                           properties:
 *                             pickup:
 *                               type: object
 *                               properties:
 *                                 status:
 *                                   type: string
 *                                   example: "pending"
 *                             delivery:
 *                               type: object
 *                               properties:
 *                                 status:
 *                                   type: string
 *                                   example: "ready"
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2026-01-13T12:34:56.789Z"
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2026-01-13T13:00:00.123Z"
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
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
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "64d3c9c0f1b2a8e9d0f12345"
 *                               reference:
 *                                 type: string
 *                                 example: "PAY-REF-123456"
 *                               amount:
 *                                 type: number
 *                                 example: 150
 *                               paymentStatus:
 *                                 type: string
 *                                 example: "pending"
 *                               paymentMethod:
 *                                 type: string
 *                                 example: "paystack"
 *                               paymentDate:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2026-01-13T12:34:56.789Z"
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2026-01-13T12:34:56.789Z"
 *                               updatedAt:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2026-01-13T13:00:00.123Z"
 *       500:
 *         description: Server error
 */
router.get(ROUTE_ADMIN_PAYMENT_VERIFICATION_QUEUE, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.getPaymentVerificationQueue(req, res);
});

/**
 * @swagger
 * /admin/wallet-adjustment-requests:
 *   get:
 *     summary: Wallet adjustments waiting for an admin decision
 *     description: |
 *       Staff may adjust a customer's wallet up to their ROLE's limit, which the
 *       admin sets in settings (`walletAdjustmentLimits`). Anything above it
 *       moves NO money and lands here instead, the same way top-up requests
 *       reach the dashboard. Defaults to `pending` — pass `status=approved`,
 *       `status=rejected` or `status=all` to see the rest.
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected, all], example: pending }
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: Paginated requests
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
 *                         data:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/WalletAdjustmentRequest' }
 *                         pagination:
 *                           type: object
 *                           properties:
 *                             total: { type: integer, example: 3 }
 *                             page: { type: integer, example: 1 }
 *                             limit: { type: integer, example: 20 }
 *                             pages: { type: integer, example: 1 }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_ADMIN_WALLET_ADJUSTMENT_REQUESTS, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.getWalletAdjustmentRequests(req, res);
});

/**
 * @swagger
 * /admin/wallet-adjustment-requests/{id}/approve:
 *   post:
 *     summary: Approve a wallet adjustment request
 *     description: |
 *       Applies the adjustment through the SAME code path a within-limit
 *       adjustment uses, so the resulting ledger line is identical: a
 *       `manual-adjustment` WalletTransaction with a signed amount, the reason,
 *       who approved it and the balance after. The request is claimed before
 *       the money moves, so two admins cannot pay it twice; if applying fails
 *       the request returns to `pending` rather than reading as approved.
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note: { type: string, example: "Agreed with the operator." }
 *     responses:
 *       200:
 *         description: Approved and applied
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
 *                         request: { $ref: '#/components/schemas/WalletAdjustmentRequest' }
 *                         balance: { type: integer, description: The customer's wallet balance after approval, example: 12500 }
 *                         transaction: { $ref: '#/components/schemas/WalletTransaction' }
 *       400:
 *         description: Already decided, insufficient balance for a debit, or the ledger write failed (no money moved)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Request not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ADMIN_WALLET_ADJUSTMENT_APPROVE, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.approveWalletAdjustment(req, res);
});

/**
 * @swagger
 * /admin/wallet-adjustment-requests/{id}/reject:
 *   post:
 *     summary: Reject a wallet adjustment request
 *     description: |
 *       Moves no money and notifies the operator who asked. A `note` is
 *       REQUIRED — a rejection without a reason leaves the operator with
 *       nothing to act on.
 *     tags: [Admin]
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
 *             required: [note]
 *             properties:
 *               note: { type: string, example: "Ask the customer to send proof of payment first." }
 *     responses:
 *       200:
 *         description: Rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/WalletAdjustmentRequest' }
 *       400:
 *         description: Missing note, or the request was already decided
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Request not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ADMIN_WALLET_ADJUSTMENT_REJECT, adminAuth, (req, res)=>{
    const adminController = new AdminController();
    return adminController.rejectWalletAdjustment(req, res);
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Payment verified successfully"
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Payment rejected successfully"
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:          { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *                               fullName:     { type: string, example: "John Doe" }
 *                               phoneNumber:  { type: string, example: "+1234567890" }
 *                               pickupAddress: { type: string, example: "123 Main Street" }
 *                               deliveryDate: { type: string, format: date }
 *                               stage:
 *                                 type: object
 *                                 properties:
 *                                   status: { type: string, example: "out-for-delivery" }
 *                               dispatchDetails:
 *                                 type: object
 *                                 properties:
 *                                   pickup:
 *                                     type: object
 *                                     properties:
 *                                       status: { type: string, example: "scheduled" }
 *                                   delivery:
 *                                     type: object
 *                                     properties:
 *                                       status: { type: string, example: "out-for-delivery" }
 *                               createdAt: { type: string, format: date-time }
 *                         pagination:
 *                           type: object
 *                           properties:
 *                             total:      { type: integer, example: 120 }
 *                             page:       { type: integer, example: 1 }
 *                             limit:      { type: integer, example: 10 }
 *                             totalPages: { type: integer, example: 12 }
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         range:
 *                           type: object
 *                           properties:
 *                             from: { type: string, format: date-time }
 *                             to:   { type: string, format: date-time }
 *                         totals:
 *                           type: object
 *                           properties:
 *                             pendingPickupOrders: { type: integer, example: 5 }
 *                             scheduledPickups:    { type: integer, example: 8 }
 *                             inProgressPickups:   { type: integer, example: 3 }
 *                             pickedUpToday:       { type: integer, example: 12 }
 *                             outForDelivery:      { type: integer, example: 6 }
 *                             deliveredToday:      { type: integer, example: 20 }
 *                             deliveryFailed:      { type: integer, example: 1 }
 *                         dayBreakdown:
 *                           type: object
 *                           properties:
 *                             pickedUp:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   _id:   { type: string, example: "2026-05-28" }
 *                                   count: { type: integer, example: 4 }
 *                             delivered:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   _id:   { type: string, example: "2026-05-28" }
 *                                   count: { type: integer, example: 7 }
 *                             failed:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   _id:   { type: string, example: "2026-05-28" }
 *                                   count: { type: integer, example: 1 }
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "64d3c9c0f1b2a8e9d0f12345"
 *                               fullName:
 *                                 type: string
 *                                 example: "John Doe"
 *                               phoneNumber:
 *                                 type: string
 *                                 example: "+1234567890"
 *                               pickupAddress:
 *                                 type: string
 *                                 example: "123 Main Street"
 *                               deliveryDate:
 *                                 type: string
 *                                 format: date
 *                                 example: "2026-01-15"
 *                               stage:
 *                                 type: object
 *                                 properties:
 *                                   status:
 *                                     type: string
 *                                     example: "hold"
 *                               userId:
 *                                 type: string
 *                                 description: Populated user reference
 *                                 example: "64d3c9c0f1b2a8e9d0f54321"
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2026-01-13T12:34:56.789Z"
 *                         pagination:
 *                           type: object
 *                           properties:
 *                             total:
 *                               type: integer
 *                               example: 30
 *                             page:
 *                               type: integer
 *                               example: 1
 *                             limit:
 *                               type: integer
 *                               example: 10
 *                             totalPages:
 *                               type: integer
 *                               example: 3
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Order placed on hold successfully"
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Order OSC-20260528-123456 hold reassigned to intake-and-tag-station"
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
router.put(ROUTE_ADMIN_ORDERS_ID_REASSIGN_STATION, adminAuth, (req, res) => {
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Order OSC-20260528-123456 hold resolved. Returned to qc-station"
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Fund added to wallet successfully"
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Fund deducted from wallet successfully"
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                               timestamp:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2026-03-23T09:45:00.000Z"
 *                               event:
 *                                 type: string
 *                                 example: "Dispatch Run Created"
 *                               type:
 *                                 type: string
 *                                 example: "dispatch-delivery"
 *                               reference:
 *                                 type: string
 *                                 nullable: true
 *                                 example: "OSC-20260428-321782"
 *                               by:
 *                                 type: string
 *                                 nullable: true
 *                                 example: "Ben Gerald"
 *                               notes:
 *                                 type: string
 *                                 example: "ORD-2024-001 order assigned to rider"
 *                         pagination:
 *                           type: object
 *                           properties:
 *                             total: { type: integer, example: 50 }
 *                             page: { type: integer, example: 1 }
 *                             limit: { type: integer, example: 10 }
 *                             pages: { type: integer, example: 5 }
 *                         eventTypes:
 *                           type: array
 *                           description: All available event types for the filter dropdown
 *                           items:
 *                             type: string
 *                           example: ["order-created", "dispatch-delivery", "wallet-top-up"]
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "6820d4a5b1e7b7c1a1234567"
 *                           userId:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "6820d4a5b1e7b7c1a7654321"
 *                               fullName:
 *                                 type: string
 *                                 example: "John Doe"
 *                               phoneNumber:
 *                                 type: string
 *                                 example: "08012345678"
 *                           balance:
 *                             type: number
 *                             example: 25000
 *                           currency:
 *                             type: string
 *                             example: "NGN"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-05-11T10:00:00.000Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-05-11T12:00:00.000Z"
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
 * /admin/wallet-transactions:
 *   get:
 *     summary: Wallet ledger across all customers (admin)
 *     description: >
 *       Brief item 2.3 — the admin side of the wallet ledger. Every wallet movement in the
 *       system writes a WalletTransaction, so this lists top-ups, order payments, reversals,
 *       credit expiry and manual adjustments, each with the customer, the operator who did it,
 *       the reason and the balance it left behind. The customer sees their own lines at
 *       GET /wallet/fetch-user-transactions; this is the same data, unscoped.
 *       A manual adjustment stores a SIGNED amount, so a deduction is negative.
 *       `totals` covers the whole filtered set, not just the current page.
 *     tags:
 *       - Admin
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         description: One customer's ledger. Takes precedence over `search`.
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "Ikechukwu" }
 *         description: Customer name or phone, matched the same way as /admin/search-wallet.
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [credit, debit, reversal, expiry, manual-adjustment] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, success, failed] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date, example: '2026-10-01' }
 *         description: Lagos day, inclusive.
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date, example: '2026-10-31' }
 *         description: Lagos day, inclusive through end of day.
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: Paginated ledger lines plus money-in / money-out totals
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
 *                         data:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/AdminWalletTransaction' }
 *                         pagination:
 *                           type: object
 *                           properties:
 *                             total: { type: integer, example: 134 }
 *                             page: { type: integer, example: 1 }
 *                             limit: { type: integer, example: 20 }
 *                             pages: { type: integer, example: 7 }
 *                         totals:
 *                           type: object
 *                           properties:
 *                             credit: { type: integer, example: 450000 }
 *                             debit: { type: integer, example: 312500 }
 *                             net: { type: integer, example: 137500 }
 *       400:
 *         description: Unknown type, or userId was not a valid id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_ADMIN_WALLET_TRANSACTIONS, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.listWalletTransactions(req, res)
})

/**
 * @swagger
 * /admin/staff:
 *   get:
 *     summary: List staff accounts with their working status (admin)
 *     description: >
 *       Everyone who is not a customer, with whether they can currently work.
 *       Customers are deliberately unreachable from here — suspending a paying customer
 *       is a different decision and must not happen by accident from a staff screen.
 *     tags:
 *       - Admin
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [admin, intake-and-tag, sort-and-pretreat, wash-and-dry, press, qc, rider, customer-experience] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, pending, suspended] }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "Emma" }
 *         description: Name, phone or email.
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 50 }
 *     responses:
 *       200:
 *         description: Staff rows plus a count per status
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
 *                         data:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/StaffAccount' }
 *                         pagination:
 *                           type: object
 *                           properties:
 *                             total: { type: integer, example: 12 }
 *                             page: { type: integer, example: 1 }
 *                             limit: { type: integer, example: 50 }
 *                             pages: { type: integer, example: 1 }
 *                         counts:
 *                           type: object
 *                           description: How many staff sit at each status.
 *                           properties:
 *                             active: { type: integer, example: 10 }
 *                             inactive: { type: integer, example: 1 }
 *                             pending: { type: integer, example: 0 }
 *                             suspended: { type: integer, example: 1 }
 *       400:
 *         description: Unknown role or status
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_ADMIN_STAFF, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.listStaff(req, res)
})

/**
 * @swagger
 * /admin/staff/{id}/status:
 *   patch:
 *     summary: Suspend, deactivate or reinstate a staff member (admin)
 *     description: >
 *       The only thing in the system that writes `User.status`. Until this existed the
 *       field was 'active' from signup forever, so the suspension checks that were
 *       already in place could never fire.
 *       Suspending takes effect immediately and does two things: the person can no
 *       longer sign in, and they can no longer be assigned a pickup or a delivery
 *       (rider assignment already refuses a non-active rider, and GET /intake-user/riders
 *       already hides them unless includeInactive=true).
 *       It does NOT move work already assigned to them — reassign that separately.
 *       A reason is required for anything other than 'active'; it is shown to the staff
 *       member and kept on the record. Calling it with the status they already have is
 *       a no-op that returns `changed: false` rather than writing a second audit line.
 *       Refused when: the target is a customer, the target is you, or the target is the
 *       last active admin (which would leave nobody able to undo it).
 *     tags:
 *       - Admin
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: The staff member's User id.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended]
 *                 example: suspended
 *               reason:
 *                 type: string
 *                 description: Required unless status is 'active'.
 *                 example: "Left the company on 6 October."
 *     responses:
 *       200:
 *         description: The saved staff record, and what the change actually does
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
 *                         staff: { $ref: '#/components/schemas/StaffAccount' }
 *                         changed:
 *                           type: boolean
 *                           example: true
 *                           description: False when they already held that status; nothing was written.
 *                         previousStatus: { type: string, example: active }
 *                         effect:
 *                           type: string
 *                           example: "They can no longer sign in, and cannot be assigned a pickup or a delivery. Work already assigned to them is NOT moved — reassign it."
 *       400:
 *         description: Invalid status, missing reason, a customer, yourself, or the last active admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch(ROUTE_ADMIN_STAFF_STATUS, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.setStaffStatus(req, res)
})

/**
 * @swagger
 * /admin/hold-types:
 *   get:
 *     summary: List hold types and their time limits (admin)
 *     description: >
 *       The kinds of hold a station can raise, each with its own time limit.
 *       A `slaHours` of null does NOT mean "no limit" — it means the hold follows the
 *       ORDER'S DELIVERY SPEED (same-day 2h / express 4h / standard 6h), which is what
 *       every operational type is seeded with, so nothing changed on the floor when
 *       hold types were introduced. `effectiveLimit` spells that out in words.
 *       `ordersOnHoldNow` lets the screen show what a limit change will affect.
 *     tags:
 *       - Admin
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema: { type: string, enum: ['true','false'] }
 *     responses:
 *       200:
 *         description: The hold types
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
 *                       items: { $ref: '#/components/schemas/HoldType' }
 *   post:
 *     summary: Create a hold type (admin)
 *     description: >
 *       The key is derived from the name and is permanent, because orders store it.
 *       Leave `slaHours` out or null to follow the order's delivery speed.
 *     tags:
 *       - Admin
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Awaiting customer reply" }
 *               description: { type: string }
 *               slaHours: { type: number, nullable: true, example: 24, description: "Minimum 0.25. Null = follow the order's delivery speed." }
 *               stations:
 *                 type: array
 *                 items: { type: string, enum: [admin, intake-and-tag, sort-and-pretreat, wash-and-dry, press, qc, customer-experience] }
 *                 description: Who may raise it. Empty means any station.
 *               escalateToAdmin: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: The created hold type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/HoldType' }
 *       400:
 *         description: Missing name, duplicate name, bad limit or unknown station
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_ADMIN_HOLD_TYPES, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.listHoldTypes(req, res)
})
router.post(ROUTE_ADMIN_HOLD_TYPES, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.createHoldType(req, res)
})

/**
 * @swagger
 * /admin/profile-duplicates:
 *   get:
 *     summary: Customers split across two CRM cards by the old phone normaliser (admin)
 *     description: >
 *       Client item #9, step 1 — the REPORT. Writes nothing. Before brief 4.6 `normalizePhone` only
 *       stripped a leading `234`, so a bare 10-digit number (`8031234567`) never matched the same
 *       person stored as `08031234567`; the CRM links identity by the normalised phone, so one human
 *       became two cards — usually a WhatsApp/walk-in lead plus their real account. Each group names
 *       the OLDER card that would survive, exactly what the merged card would look like, what carries
 *       over (orders, wallet balance, scheduled + logged messages) and any `blockers` that stop it.
 *       A referral code is not stored on the card but on the USER account, so "keep the referral code
 *       from the account card" is implemented as the surviving card ADOPTING the account's `userId` —
 *       which brings the code, the wallet and the order history with it.
 *     tags:
 *       - Admin
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Every phone number that maps to more than one CRM card
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/ProfileDuplicateReport' }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_ADMIN_PROFILE_DUPLICATES, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.listProfileDuplicates(req, res)
})

/**
 * @swagger
 * /admin/profile-duplicates/merge:
 *   post:
 *     summary: Merge one phone number's duplicate CRM cards into the older card (admin)
 *     description: >
 *       Client item #9, steps 2-5. One phone number per call, deliberately — this decides which
 *       history survives. The OLDER card survives; order counts, spend and tags are combined, the
 *       first/last order dates are widened to cover both, the furthest stage is kept, every scheduled
 *       and logged message is re-pointed at the survivor, and the account (with its referral code and
 *       wallet) moves onto it. The absorbed cards are then DELETED — a second card for the same human
 *       is the bug being fixed — and the audit row records exactly what was removed.
 *       **It REFUSES before writing anything** when a pair cannot be combined; today the one blocker
 *       is two cards linked to DIFFERENT user accounts, which is two logins and two wallets and so a
 *       user merge rather than a card merge. Run the GET report first.
 *     tags:
 *       - Admin
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "08031234567"
 *                 description: Any format — it is normalised. Send this OR keepId.
 *               keepId:
 *                 type: string
 *                 example: 665f1c2ab9e77a0012d4e300
 *                 description: A card id from the report; its phone number's whole group is merged.
 *               note:
 *                 type: string
 *                 example: "Confirmed with the customer on the phone"
 *                 description: Recorded on the survivor's stage history and in the audit log.
 *     responses:
 *       200:
 *         description: What was merged
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
 *                         merged: { type: boolean, example: true }
 *                         phone: { type: string, example: "08031234567" }
 *                         keptProfileId: { type: string, example: 665f1c2ab9e77a0012d4e300 }
 *                         removedProfileIds:
 *                           type: array
 *                           items: { type: string, example: 665f1c2ab9e77a0012d4e301 }
 *                         removedCount: { type: integer, example: 1 }
 *                         movedScheduledMessages: { type: integer, example: 2 }
 *                         movedMessageLogs: { type: integer, example: 7 }
 *                         profile: { $ref: '#/components/schemas/CrmProfile' }
 *       400:
 *         description: >
 *           Nothing to merge, an unusable phone number, or a BLOCKER — the message names it and no
 *           card was touched.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ADMIN_PROFILE_DUPLICATES_MERGE, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.mergeProfileDuplicate(req, res)
})

/**
 * @swagger
 * /admin/hold-types/{id}:
 *   put:
 *     summary: Edit a hold type's limit, stations or name (admin)
 *     description: >
 *       A system type (the payment hold) can have its limit and stations tuned but
 *       cannot be renamed or switched off, because the payment flow looks it up by key.
 *     tags:
 *       - Admin
 *     security: [{ bearerAuth: [] }]
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
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               slaHours: { type: number, nullable: true, example: 48 }
 *               stations:
 *                 type: array
 *                 items: { type: string }
 *               escalateToAdmin: { type: boolean }
 *               active: { type: boolean }
 *     responses:
 *       200:
 *         description: The saved hold type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/HoldType' }
 *       400:
 *         description: Bad limit, unknown station, or an attempt to switch off a system type
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   delete:
 *     summary: Delete a hold type (admin)
 *     description: >
 *       If orders are currently on hold under this type it is DEACTIVATED instead of
 *       deleted, and the response says so. Deleting it outright would move those orders
 *       back onto the delivery-speed clock, which for a long hold means instantly Overdue.
 *       A system type is never deleted.
 *     tags:
 *       - Admin
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted, or deactivated because it was in use
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
 *                         deleted: { type: boolean, example: false }
 *                         deactivated: { type: boolean, example: true }
 *                         ordersOnHoldNow: { type: integer, example: 3 }
 *                         note: { type: string }
 *       400:
 *         description: Unknown id, or a system type
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.put(ROUTE_ADMIN_HOLD_TYPE_BY_ID, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.updateHoldType(req, res)
})
router.delete(ROUTE_ADMIN_HOLD_TYPE_BY_ID, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.deleteHoldType(req, res)
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Order item updated successfully"
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Order item updated successfully"
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "64d3c9c0f1b2a8e9d0f12345"
 *                               name:
 *                                 type: string
 *                                 example: "Shirt"
 *                               price:
 *                                 type: number
 *                                 example: 400
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           example: Shirt
 *                         price:
 *                           type: number
 *                           example: 500
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
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Order item deleted successfully"
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
 * /admin/add-order-set:
 *   post:
 *     summary: Create an item set
 *     tags: [Admin]
 *     description: "A Set is a named catalog group of individually-priced pieces. There is NO set-level price; an order total is the sum of only the pieces a customer selects, and each selected piece is booked as its own countable item. Requires a name and at least one priced piece."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, pieces]
 *             properties:
 *               name: { type: string, example: "Agbada Set" }
 *               active: { type: boolean, example: true }
 *               pieces:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, price]
 *                   properties:
 *                     name: { type: string, example: "Agbada (outer)" }
 *                     price: { type: number, example: 3500 }
 *                     isHeavy: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Set created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: "Set added successfully" }
 *       400:
 *         description: Missing name or pieces
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ADD_ORDER_SET, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.addOrderSet(req, res)
})

/**
 * @swagger
 * /admin/update-order-set/{id}:
 *   put:
 *     summary: Update an item set
 *     tags: [Admin]
 *     description: "Update a set's name, active flag, and/or its full pieces[] list. When pieces[] is supplied it REPLACES the existing pieces and must still contain at least one priced piece."
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Set ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: "Agbada Set" }
 *               active: { type: boolean, example: false }
 *               pieces:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name, price]
 *                   properties:
 *                     name: { type: string, example: "Cap" }
 *                     price: { type: number, example: 1000 }
 *                     isHeavy: { type: boolean, example: false }
 *     responses:
 *       200:
 *         description: Set updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: "Set updated successfully" }
 *       400:
 *         description: Invalid pieces
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Set not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.put(ROUTE_UPDATE_ORDER_SET_ID, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.updateOrderSet(req, res)
})

/**
 * @swagger
 * /admin/get-order-sets:
 *   get:
 *     summary: List all item sets
 *     tags: [Admin]
 *     description: Returns every item set (active and inactive).
 *     responses:
 *       200:
 *         description: Sets returned
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
 *                       items: { $ref: '#/components/schemas/ItemSet' }
 */
router.get(ROUTE_GET_ORDER_SETS, [auth], (req, res) => {
    const adminController = new AdminController()
    return adminController.getOrderSets(req, res)
})

/**
 * @swagger
 * /admin/get-order-set/{id}:
 *   get:
 *     summary: Get one item set
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Set ID
 *     responses:
 *       200:
 *         description: Set returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/ItemSet' }
 *       404:
 *         description: Set not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_GET_ORDER_SET_ID, [auth], (req, res) => {
    const adminController = new AdminController()
    return adminController.getOrderSet(req, res)
})

/**
 * @swagger
 * /admin/delete-order-set/{id}:
 *   delete:
 *     summary: Delete an item set
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Set ID
 *     responses:
 *       200:
 *         description: Set deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { type: string, example: "Set deleted successfully" }
 *       404:
 *         description: Set not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.delete(ROUTE_DELETE_ORDER_SET_ID, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.deleteOrderSet(req, res)
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

/**
 * @swagger
 * /api/admin/display-names:
 *   get:
 *     summary: Labels for delivery speeds, service types and care tiers
 *     description: >
 *       Every value with the label a screen should render. `renamed` is true
 *       where an admin has set their own label; otherwise the label is derived
 *       from the stored value. **The raw `value` always travels beside the
 *       label** — pricing, the enums and every query still match on it, so
 *       nothing should have to un-prettify a label to get the identifier back.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The labels, grouped
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/DisplayNameMap' }
 *       401:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   put:
 *     summary: Rename delivery speeds, service types or care tiers (display name only)
 *     description: >
 *       Writes a LABEL for an existing value. It never renames the stored
 *       value, and that is not a limitation we chose — `deliverySpeed` and
 *       `serviceTier` are enum fields on every order, and `serviceTypes[].name`
 *       is what the pricing path matches on, so renaming a stored value would
 *       fail validation on new orders, orphan existing ones and silently drop
 *       pricing to a multiplier of 1.
 *
 *
 *       Keys must be values that already exist; an unknown key is refused and
 *       the valid ones are listed in the error. Send an **empty label** to drop
 *       an override and go back to the derived name. Each group may be sent on
 *       its own.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deliverySpeeds:
 *                 type: object
 *                 additionalProperties: { type: string }
 *                 example: { "same-day": "Express Same Day", "standard": "Regular" }
 *               serviceTypes:
 *                 type: object
 *                 additionalProperties: { type: string }
 *                 example: { "wash-and-iron": "Wash & Press" }
 *               serviceTiers:
 *                 type: object
 *                 additionalProperties: { type: string }
 *                 example: { "vip": "Platinum" }
 *     responses:
 *       200:
 *         description: The labels now in force
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
 *                         displayNames:
 *                           type: object
 *                           additionalProperties:
 *                             type: object
 *                             additionalProperties: { type: string }
 *                         note: { type: string, example: Display names only — the stored values are unchanged, so existing orders and pricing are unaffected. }
 *       400:
 *         description: An unknown key, a non-object group, or nothing to update
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_ADMIN_DISPLAY_NAMES, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.getDisplayNames(req, res)
})
router.put(ROUTE_ADMIN_DISPLAY_NAMES, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.updateDisplayNames(req, res)
})

/**
 * @swagger
 * /api/admin/order/{id}/payment-hold/waive:
 *   post:
 *     summary: Waive a payment hold so the order processes unpaid (N1, admin only)
 *     description: >
 *       Client rule: "An admin can WAIVE a payment hold with a reason → the
 *       order processes unpaid but is **STOPPED AT DISPATCH**."
 *
 *
 *       So this opens one door and closes another. The order returns to the
 *       tagging queue, tags print and it goes through production — then it
 *       cannot be dispatched until the money arrives. The dispatch stop is
 *       enforced in the shared dispatch-tag gate, so reading the tag, printing
 *       it and assigning a rider are all refused by one check.
 *
 *
 *       **A reason is required.** A waiver is a person deciding to process
 *       unpaid work; without a reason the decision cannot be reviewed.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
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
 *               reason:
 *                 type: string
 *                 example: Long-standing corporate client, invoice agreed
 *     responses:
 *       200:
 *         description: The waiver, with what is still outstanding
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
 *                         waived: { type: boolean, example: true }
 *                         waivedAt: { type: string, format: date-time }
 *                         reason: { type: string, example: Long-standing corporate client }
 *                         outstandingAmount: { type: integer, example: 8500 }
 *                         note: { type: string, example: The order will process unpaid but cannot be dispatched until it is paid. }
 *       400:
 *         description: No reason given, already paid, or already waived
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_ORDER_PAYMENT_HOLD_WAIVE, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.waivePaymentHold(req, res)
})

/**
 * @swagger
 * /api/admin/bank-check-list:
 *   get:
 *     summary: Bank transfers approved by a human, for daily reconciliation (N1)
 *     description: >
 *       The client's daily check. Every transfer that Intake or an admin marked
 *       as received in the window, with its reference, so each can be matched
 *       against the bank statement. `byIntakeCount` is called out separately
 *       because the client's concern is specifically the approvals made by
 *       Intake rather than by an admin.
 *
 *
 *       Defaults to today in Lagos. The upper bound is EXCLUSIVE.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time, description: Exclusive upper bound }
 *     responses:
 *       200:
 *         description: The approvals to check, and their total
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
 *                         from: { type: string, format: date-time }
 *                         to: { type: string, format: date-time }
 *                         count: { type: integer, example: 4 }
 *                         totalApproved: { type: integer, example: 34000 }
 *                         byIntakeCount: { type: integer, example: 3 }
 *                         note: { type: string, example: Match each reference against the bank statement. The upper bound is exclusive. }
 *                         rows:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/BankCheckRow' }
 *       401:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_ADMIN_BANK_CHECK_LIST, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.getBankCheckList(req, res)
})

/**
 * @swagger
 * /api/admin/booking-windows:
 *   get:
 *     summary: List pickup/delivery time windows and the working-days setting
 *     description: >
 *       Client decisions D1–D6 (2026-10-08). ONE window covers both the pickup
 *       and the delivery leg. A blank `limit` means no limit. The working days
 *       are returned alongside, because an unticked day has no windows at all.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Every window (active and switched off) plus the working days
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
 *                         windows:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/BookingWindow' }
 *                         workingDays:
 *                           type: array
 *                           items: { type: string, example: tue }
 *       401:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   post:
 *     summary: Create a time window
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, startTime, endTime]
 *             properties:
 *               name: { type: string, example: Evening }
 *               startTime: { type: string, example: "15:00", description: "HH:mm, Lagos time" }
 *               endTime: { type: string, example: "18:30" }
 *               days:
 *                 type: array
 *                 items: { type: string, enum: [sun, mon, tue, wed, thu, fri, sat] }
 *                 example: [tue, wed, thu, fri, sat, sun]
 *               cutoffMinutes: { type: integer, example: 60, description: "Minutes before startTime that bookings close" }
 *               limit:
 *                 type: integer
 *                 nullable: true
 *                 example: 10
 *                 description: "Shared pickup+delivery count per day. Blank/null = no limit."
 *               isActive: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: The created window
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/BookingWindow' }
 *       400:
 *         description: Invalid times, unknown day, or a window with that name already exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_ADMIN_BOOKING_WINDOWS, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.listBookingWindows(req, res)
})
router.post(ROUTE_ADMIN_BOOKING_WINDOWS, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.createBookingWindow(req, res)
})

/**
 * @swagger
 * /api/admin/booking-windows/{id}:
 *   put:
 *     summary: Update a time window
 *     description: >
 *       Partial update. `endTime` is checked against the SAVED `startTime` when
 *       only one of the two is sent, so a window cannot be left ending before
 *       it starts.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
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
 *             properties:
 *               name: { type: string, example: Evening }
 *               startTime: { type: string, example: "15:00" }
 *               endTime: { type: string, example: "18:30" }
 *               days:
 *                 type: array
 *                 items: { type: string, enum: [sun, mon, tue, wed, thu, fri, sat] }
 *               cutoffMinutes: { type: integer, example: 60 }
 *               limit: { type: integer, nullable: true, example: 12 }
 *               isActive: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: The updated window
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message: { $ref: '#/components/schemas/BookingWindow' }
 *       400:
 *         description: Invalid payload, or the name clashes with another window
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   delete:
 *     summary: Remove a time window (switched off instead if orders use it)
 *     description: >
 *       A window referenced by any order is DEACTIVATED, not deleted, so those
 *       orders keep resolving the times their customers were promised — the same
 *       reasoning as archived offers and archived CRM cards. `deleted` and
 *       `deactivated` in the response say which happened.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: What happened to the window
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
 *                         deleted: { type: boolean, example: false }
 *                         deactivated: { type: boolean, example: true }
 *                         ordersReferencing: { type: integer, example: 4 }
 *                         note: { type: string, example: "Evening is used by 4 order(s), so it was switched off rather than deleted. Those orders keep their times." }
 *                         window: { $ref: '#/components/schemas/BookingWindow' }
 *       400:
 *         description: Window not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.put(ROUTE_ADMIN_BOOKING_WINDOW_BY_ID, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.updateBookingWindow(req, res)
})
router.delete(ROUTE_ADMIN_BOOKING_WINDOW_BY_ID, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.deleteBookingWindow(req, res)
})

/**
 * @swagger
 * /api/admin/working-days:
 *   put:
 *     summary: Set the working days (client D6)
 *     description: >
 *       The tick box per day. An unticked day has NO windows and NO Anytime
 *       dispatch — bookings are offered the next working day — and the promised
 *       delivery date skips it. Takes either a list of day keys or an object of
 *       day → true/false. An EMPTY week is refused out loud rather than quietly
 *       ignored. Ticking a day takes effect at once.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workingDays]
 *             properties:
 *               workingDays:
 *                 oneOf:
 *                   - type: array
 *                     items: { type: string, enum: [sun, mon, tue, wed, thu, fri, sat] }
 *                   - type: object
 *                     additionalProperties: { type: boolean }
 *                 example: [tue, wed, thu, fri, sat, sun]
 *     responses:
 *       200:
 *         description: The working days now in force
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
 *                         workingDays:
 *                           type: array
 *                           items: { type: string, example: tue }
 *       400:
 *         description: Unknown day, or no working day at all
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.put(ROUTE_ADMIN_WORKING_DAYS, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.updateWorkingDays(req, res)
})

/**
 * @swagger
 * /api/admin/window-deflections:
 *   get:
 *     summary: Windows that filled, and customers moved (client D5)
 *     description: >
 *       This figure CANNOT be derived from saved orders — a customer moved off a
 *       full window leaves no trace on the order they end up with, which looks
 *       identical to someone who wanted that window all along. So a row is
 *       written the moment a full window is dropped from the offered list, and
 *       this reads them back. `shown` counts every time a full window was
 *       offered (one customer refreshing three times is three rows);
 *       `customersMoved` counts distinct signed-in customers.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time, description: "Exclusive upper bound" }
 *     responses:
 *       200:
 *         description: One row per window per day
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
 *                         windowsThatFilled: { type: integer, example: 3 }
 *                         note: { type: string, example: '"shown" counts every time a full window was offered; "customersMoved" counts distinct signed-in customers turned away.' }
 *                         rows:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/WindowDeflection' }
 *       401:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_ADMIN_WINDOW_DEFLECTIONS, [adminAuth], (req, res) => {
    const adminController = new AdminController()
    return adminController.getWindowDeflections(req, res)
})

module.exports = router;