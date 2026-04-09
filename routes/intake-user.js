const router = require('express').Router();
const IntakeUserController = require("../controllers/intake-user.controller");
const { ROUTE_CREATE_BOOK_ORDER } = require("../util/page-route");
const intakeUserAuth = require("../middlewares/intakeUserAuth");


/**
 * @swagger
 * /bookOrder/create-book-order:
 *   post:
 *     summary: Create a new order
 *     tags:
 *       - INTAKE_USER
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

  module.exports = router