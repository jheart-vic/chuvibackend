const RiderController = require('../controllers/rider.controller');
const riderAuth = require('../middlewares/riderAuth');
const { ROUTE_RIDER_ASSIGNED_DELIVERIES, ROUTE_RIDER_ORDER_ID, ROUTE_START_DELIVERY_ID, ROUTE_RIDER_ACTIVE_DELIVERIES, ROUTE_RIDER_MARK_DELIVERED_ID, ROUTE_RIDER_MARK_DELIVERY_FAILED_ID } = require('../util/page-route');

const router = require('express').Router();

/**
 * @swagger
 * /rider/assigned-deliveries:
 *   get:
 *     summary: Get deliveries assigned to the logged-in rider
 *     tags:
 *       - Rider
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: List of deliveries assigned to the rider
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
 *                             example: "08123456789"
 *                           pickupAddress:
 *                             type: string
 *                             example: "12 Allen Avenue, Ikeja"
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
 *                           deliverySpeed:
 *                             type: string
 *                             example: "express"
 *                           amount:
 *                             type: number
 *                             example: 1500
 *                           paymentStatus:
 *                             type: string
 *                             example: "pending"
 *                           dispatchDetails:
 *                             type: object
 *                             properties:
 *                               pickup:
 *                                 type: object
 *                                 properties:
 *                                   status:
 *                                     type: string
 *                                     example: "pending"
 *                                   rider:
 *                                     type: string
 *                                     example: "64d3c9c0f1b2a8e9d0f99999"
 *                                   isVerified:
 *                                     type: boolean
 *                                     example: false
 *                                   updatedAt:
 *                                     type: string
 *                                     format: date-time
 *                               delivery:
 *                                 type: object
 *                                 properties:
 *                                   status:
 *                                     type: string
 *                                     example: "ready"
 *                                   rider:
 *                                     type: string
 *                                     example: "64d3c9c0f1b2a8e9d0f99999"
 *                                   note:
 *                                     type: string
 *                                     example: "Handle with care"
 *                                   updatedAt:
 *                                     type: string
 *                                     format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 25
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         pages:
 *                           type: integer
 *                           example: 3
 *       401:
 *         description: Unauthorized - Rider not authenticated
 *       500:
 *         description: Server error
 */
router.get(ROUTE_RIDER_ASSIGNED_DELIVERIES, riderAuth, (req, res)=>{
    const riderController = new RiderController()
    return riderController.getRiderAssignedDeliveries(req, res)
})

/**
 * @swagger
 * /rider/order/{id}:
 *   get:
 *     summary: Get details of a specific order
 *     tags:
 *       - Rider
 *     security:
 *       - bearerAuth: []
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
 *         description: Order details retrieved successfully
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
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                           example: "64d3c9c0f1b2a8e9d0f54321"
 *                         fullName:
 *                           type: string
 *                           example: "John Doe"
 *                         email:
 *                           type: string
 *                           example: "johndoe@example.com"
 *                         phoneNumber:
 *                           type: string
 *                           example: "08123456789"
 *                     fullName:
 *                       type: string
 *                       example: "John Doe"
 *                     phoneNumber:
 *                       type: string
 *                       example: "08123456789"
 *                     pickupAddress:
 *                       type: string
 *                       example: "12 Allen Avenue, Ikeja"
 *                     pickupDate:
 *                       type: string
 *                       format: date
 *                       example: "2026-01-13"
 *                     deliveryDate:
 *                       type: string
 *                       format: date
 *                       example: "2026-01-15"
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
 *                       example: 1500
 *                     deliveryAmount:
 *                       type: number
 *                       example: 500
 *                     paymentMethod:
 *                       type: string
 *                       example: "paystack"
 *                     paymentStatus:
 *                       type: string
 *                       example: "pending"
 *                     oscNumber:
 *                       type: string
 *                       example: "OSC123456"
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "64d3c9c0f1b2a8e9d0f77777"
 *                           type:
 *                             type: string
 *                             example: "shirt"
 *                           price:
 *                             type: number
 *                             example: 500
 *                           quantity:
 *                             type: number
 *                             example: 3
 *                           tagId:
 *                             type: string
 *                             example: "TAG123"
 *                           tagStatus:
 *                             type: string
 *                             example: "pending"
 *                           sortStatus:
 *                             type: string
 *                             example: "pending"
 *                           washStatus:
 *                             type: string
 *                             example: "pending"
 *                           ironStatus:
 *                             type: string
 *                             example: "pending"
 *                     stage:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: "pending"
 *                         note:
 *                           type: string
 *                           example: "Order created"
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                     dispatchDetails:
 *                       type: object
 *                       properties:
 *                         pickup:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               example: "pending"
 *                             rider:
 *                               type: string
 *                               example: "64d3c9c0f1b2a8e9d0f99999"
 *                             isVerified:
 *                               type: boolean
 *                               example: false
 *                             updatedAt:
 *                               type: string
 *                               format: date-time
 *                         delivery:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               example: "ready"
 *                             rider:
 *                               type: string
 *                               example: "64d3c9c0f1b2a8e9d0f99999"
 *                             note:
 *                               type: string
 *                               example: "Handle with care"
 *                             updatedAt:
 *                               type: string
 *                               format: date-time
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
 *       401:
 *         description: Unauthorized - Rider not authenticated
 *       404:
 *         description: Order not found
 *       500:
 *         description: Server error
 */
router.get(ROUTE_RIDER_ORDER_ID, riderAuth, (req, res)=>{
    const riderController = new RiderController()
    return riderController.getOrderDetails(req, res)
})

/**
 * @swagger
 * /rider/active-deliveries:
 *   get:
 *     summary: Get all active (in-progress) deliveries assigned to the logged-in rider
 *     tags:
 *       - Rider
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: List of active deliveries
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
 *                             example: "08123456789"
 *                           pickupAddress:
 *                             type: string
 *                             example: "12 Allen Avenue, Ikeja"
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
 *                             example: 1500
 *                           paymentStatus:
 *                             type: string
 *                             example: "pending"
 *                           dispatchDetails:
 *                             type: object
 *                             properties:
 *                               delivery:
 *                                 type: object
 *                                 properties:
 *                                   status:
 *                                     type: string
 *                                     example: "picked_up"
 *                                   rider:
 *                                     type: string
 *                                     example: "64d3c9c0f1b2a8e9d0f99999"
 *                                   note:
 *                                     type: string
 *                                     example: "On the way"
 *                                   updatedAt:
 *                                     type: string
 *                                     format: date-time
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
 *                         pages:
 *                           type: integer
 *                           example: 2
 *       401:
 *         description: Unauthorized - Rider not authenticated
 *       500:
 *         description: Server error
 */
router.get(ROUTE_RIDER_ACTIVE_DELIVERIES, riderAuth, (req, res)=>{
    const riderController = new RiderController()
    return riderController.getActiveDeliveries(req, res)
})

/**
 * @swagger
 * /rider/start-delivery/{id}:
 *   put:
 *     summary: Start delivery for an assigned order (verify customer and mark as picked up)
 *     tags:
 *       - Rider
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the order
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
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "08123456789"
 *                 description: Customer's phone number for verification
 *     responses:
 *       200:
 *         description: Delivery started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Delivery started successfully"
 *       400:
 *         description: Validation or business logic error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               examples:
 *                 missingOrderId:
 *                   summary: Missing order ID
 *                   value:
 *                     error: "Order ID is required"
 *                 missingPhone:
 *                   summary: Missing phone number
 *                   value:
 *                     error: "Customer phone number is required"
 *                 alreadyPicked:
 *                   summary: Delivery already started
 *                   value:
 *                     error: "Delivery is already picked up"
 *                 wrongRider:
 *                   summary: Unauthorized rider
 *                   value:
 *                     error: "You are not assigned to this delivery"
 *                 phoneMismatch:
 *                   summary: Phone number mismatch
 *                   value:
 *                     error: "Provided phone number does not match customer's phone number"
 *       401:
 *         description: Unauthorized - Rider not authenticated
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 error: "Order not found"
 *       500:
 *         description: Server error
 */
router.put(ROUTE_START_DELIVERY_ID, riderAuth, (req, res)=>{
    const riderController = new RiderController()
    return riderController.startDelivery(req, res)
})

/**
 * @swagger
 * /rider/mark-delivered/{id}:
 *   put:
 *     summary: Mark an order as delivered (after verifying customer phone number)
 *     tags:
 *       - Rider
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the order
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
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "08123456789"
 *                 description: Customer phone number for verification
 *     responses:
 *       200:
 *         description: Order successfully marked as delivered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order marked as delivered successfully"
 *       400:
 *         description: Validation or business logic error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               examples:
 *                 missingOrderId:
 *                   summary: Missing order ID
 *                   value:
 *                     error: "Order ID is required"
 *                 missingPhone:
 *                   summary: Missing phone number
 *                   value:
 *                     error: "Customer phone number is required"
 *                 notPickedUp:
 *                   summary: Delivery not started
 *                   value:
 *                     error: "Delivery must be picked up before it can be marked as delivered"
 *                 wrongRider:
 *                   summary: Unauthorized rider
 *                   value:
 *                     error: "You are not assigned to this delivery"
 *                 phoneMismatch:
 *                   summary: Phone number mismatch
 *                   value:
 *                     error: "Provided phone number does not match customer's phone number"
 *       401:
 *         description: Unauthorized - Rider not authenticated
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 error: "Order not found"
 *       500:
 *         description: Server error
 */
router.put(ROUTE_RIDER_MARK_DELIVERED_ID, riderAuth, (req, res)=>{
    const riderController = new RiderController()
    return riderController.markOrderAsDelivered(req, res)
})

/**
 * @swagger
 * /rider/mark-delivery-failed/{id}:
 *   put:
 *     summary: Mark an order delivery as failed (after verifying customer phone number)
 *     tags:
 *       - Rider
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The ID of the order
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
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "08123456789"
 *                 description: Customer phone number for verification
 *               note:
 *                 type: string
 *                 example: "Customer was not available at the delivery address"
 *                 description: Optional note explaining why delivery failed
 *     responses:
 *       200:
 *         description: Order delivery marked as failed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Order marked as failed successfully"
 *       400:
 *         description: Validation or business logic error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               examples:
 *                 missingOrderId:
 *                   summary: Missing order ID
 *                   value:
 *                     error: "Order ID is required"
 *                 missingPhone:
 *                   summary: Missing phone number
 *                   value:
 *                     error: "Customer phone number is required"
 *                 notPickedUp:
 *                   summary: Delivery not started
 *                   value:
 *                     error: "Delivery must be picked up before it can be marked as failed"
 *                 wrongRider:
 *                   summary: Unauthorized rider
 *                   value:
 *                     error: "You are not assigned to this delivery"
 *                 phoneMismatch:
 *                   summary: Phone number mismatch
 *                   value:
 *                     error: "Provided phone number does not match customer's phone number"
 *       401:
 *         description: Unauthorized - Rider not authenticated
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 error: "Order not found"
 *       500:
 *         description: Server error
 */
router.put(ROUTE_RIDER_MARK_DELIVERY_FAILED_ID, riderAuth, (req, res)=>{
    const riderController = new RiderController()
    return riderController.markOrderDeliveryAsFailed(req, res)
})

module.exports = router