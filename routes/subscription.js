const SubscriptionController = require("../controllers/subscription.controller");
const {
  ROUTE_GET_PLAN,
  ROUTE_GET_PLANS,
  ROUTE_UPDATE_PLAN,
  ROUTE_DELETE_PLAN,
  ROUTE_SUBSCRIBE_PLAN,
  ROUTE_CANCEL_SUBSCRIPTION,
  ROUTE_CREATE_PLAN,
  ROUTE_CURRENT_SUBSCRIPTION,
} = require("../util/page-route");
const adminAuth = require("../middlewares/adminAuth");
const auth = require("../middlewares/auth");

const router = require("express").Router();

/**
 * @swagger
 * /subscription/create-plan:
 *   post:
 *     summary: Create a new subscription plan
 *     tags:
 *       - Subscription
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - duration
 *               - paystackPlanCode
 *               - price
 *               - monthlyLimits
 *               - features
 *             properties:
 *               title:
 *                 type: string
 *                 example: Basic Plan
 *               description:
 *                 type: string
 *                 example: Affordable monthly laundry subscription
 *               duration:
 *                 type: string
 *                 example: monthly
 *               paystackPlanCode:
 *                 type: string
 *                 description: Required — the plan's Paystack plan code. The plan cannot be created without it.
 *                 example: PLN_dzkt60m83znaydt
 *               price:
 *                 type: integer
 *                 example: 5000
 *               monthlyLimits:
 *                 type: integer
 *                 description: Items covered per month.
 *                 example: 45
 *               freePickupDeliveryPerWeek:
 *                 type: integer
 *                 description: Free pickup/delivery legs per rolling week. Optional, defaults to 0.
 *                 example: 4
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example:
 *                   - Free pickup & delivery
 *                   - Ironing included
 *                   - Priority support
 *     responses:
 *       201:
 *         description: Plan created successfully
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
 *                       type: string
 *                       example: Plan created successfully
 *                     data:
 *                       $ref: '#/components/schemas/Plan'
 *       400:
 *         description: Validation error, or a plan with that title already exists. The message names the field or the conflict.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Server error
 */
router.post(ROUTE_CREATE_PLAN, [adminAuth], async (req, res) => {
  const subscriptionController = new SubscriptionController();
  return subscriptionController.createPlans(req, res);
});

/**
 * @swagger
 * /subscription/get-plans:
 *   get:
 *     summary: Get all subscription plans
 *     tags:
 *       - Subscription
 *     responses:
 *       200:
 *         description: Plans fetched successfully
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
 *                         $ref: '#/components/schemas/Plan'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_PLANS, [auth], async (req, res) => {
  const subscriptionController = new SubscriptionController();
  return subscriptionController.getPlans(req, res);
});

/**
 * @swagger
 * /subscription/get-plan/{id}:
 *   get:
 *     summary: Get a single subscription plan
 *     tags:
 *       - Subscription
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Plan ID
 *     responses:
 *       200:
 *         description: Plan fetched successfully
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
 *                       $ref: '#/components/schemas/Plan'
 *       404:
 *         description: Plan not found
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_PLAN + "/:id", [auth], async (req, res) => {
  const subscriptionController = new SubscriptionController();
  return subscriptionController.getPlan(req, res);
});

/**
 * @swagger
 * /subscription/update-plan/{id}:
 *   put:
 *     summary: Update a subscription plan
 *     tags:
 *       - Subscription
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Plan ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               duration:
 *                 type: string
 *               price:
 *                 type: integer
 *               monthlyLimits:
 *                 type: integer
 *               freePickupDeliveryPerWeek:
 *                 type: integer
 *               paystackPlanCode:
 *                 type: string
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Plan updated. Returns the saved plan so an edit screen can reload the authoritative row.
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
 *                       example: Plan updated successfully
 *                     data:
 *                       $ref: '#/components/schemas/Plan'
 *       400:
 *         description: Plan not found, or the edit was rejected (the message names the field or the conflicting title).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Server error
 */
router.put(ROUTE_UPDATE_PLAN + "/:id", [adminAuth], async (req, res) => {
  const subscriptionController = new SubscriptionController();
  return subscriptionController.updatePlan(req, res);
});

/**
 * @swagger
 * /subscription/delete-plan/{id}:
 *   delete:
 *     summary: Delete a subscription plan
 *     tags:
 *       - Subscription
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Plan ID
 *     responses:
 *       200:
 *         description: Plan deleted successfully
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
 *                       example: Plan deleted successfully
 *       400:
 *         description: Plan not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Server error
 */
router.delete(ROUTE_DELETE_PLAN + "/:id", [adminAuth], async (req, res) => {
  const subscriptionController = new SubscriptionController();
  return subscriptionController.deletePlan(req, res);
});

/**
 * @swagger
 * /subscription/subscribe-plan:
 *   post:
 *     summary: Switched off — always refused
 *     deprecated: true
 *     description: >
 *       No longer creates a subscription (it used to start an active plan with no
 *       payment). A plan starts only through the Paystack checkout:
 *       `POST /user/initialize-payment` with `transactionType: subscription` and
 *       `planId`; the subscription is created when the payment is confirmed.
 *     tags:
 *       - Subscription
 *     responses:
 *       400:
 *         description: Always — subscribe through checkout instead
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               data:
 *                 error: Please subscribe to a plan through checkout.
 */
router.post(ROUTE_SUBSCRIBE_PLAN, [auth], async (req, res) => {
  const subscriptionController = new SubscriptionController();
  return subscriptionController.subscribePlan(req, res);
});

/**
 * @swagger
 * /subscription/cancel-subscription:
 *   post:
 *     summary: Cancel an active subscription
 *     description: >
 *       Feature 21: the plan is NOT deleted. It stops renewing on Paystack, becomes
 *       `status: cancelled`, and stays usable (bookings, remaining items) until
 *       `currentPeriodEnd` — the end of the month the customer paid for. After that it
 *       expires with nothing carried over. To change plan ("Upgrade Plan"), cancel and
 *       then subscribe to the new plan: it starts fresh and the old plan is closed.
 *       A plan whose renewal FAILED can be cancelled too: Paystack stops retrying the card,
 *       and the reply says by when subscribing to the SAME plan again keeps the leftover
 *       items (within 7 days of the failed payment). `currentPeriodEnd` is then null.
 *     tags:
 *       - Subscription
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Subscription cancelled; usable until the paid month ends
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
 *                       example: "Your plan is cancelled. You can keep using your items until Saturday 14 November."
 *                     currentPeriodEnd:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: "2026-11-14T10:00:00.000Z"
 *       400:
 *         description: No active subscription found, or Paystack refused the cancellation
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       500:
 *         description: Server error
 */
router.post(ROUTE_CANCEL_SUBSCRIPTION, [auth], async (req, res) => {
  const subscriptionController = new SubscriptionController();
  return subscriptionController.cancelSubscription(req, res);
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Subscription:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 64f1a2b3c4d5e6f7890abc12
 *         userEmail:
 *           type: string
 *           example: user@example.com
 *         userId:
 *           type: string
 *           example: 64f1a2b3c4d5e6f7890abc34
 *         planId:
 *           type: object
 *           description: Populated plan document
 *         categoryId:
 *           type: object
 *           nullable: true
 *           description: Resolved category object from plan
 *         paystackSubscriptionCode:
 *           type: string
 *           example: SUB_xxxxxx
 *         subscriptionCode:
 *           type: string
 *           example: SUB_xxxxxx
 *         status:
 *           type: string
 *           enum: [active, cancelled, expired, pending, failed]
 *           example: active
 *           description: "`cancelled` = stops renewing but usable until `currentPeriodEnd` (show \"Cancelled — usable until <date>\"). `failed` = the renewal payment failed; bookings are blocked; paid within 7 days the leftover items still carry over."
 *         rolledOverItems:
 *           type: number
 *           example: 12
 *           description: "Feature 21: items the last renewal carried over (at most half the plan, rounded down). Already included in `remainingItems`."
 *         failedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: "When the current failed renewal first failed (the 7-day grace counts from here). Null when not failed."
 *         startDate:
 *           type: string
 *           format: date-time
 *         nextPaymentDate:
 *           type: string
 *           format: date-time
 *         paystackAuthorizationToken:
 *           type: string
 *           nullable: true
 *         paystackSubscriptionId:
 *           type: string
 *         currentPeriodEnd:
 *           type: string
 *           format: date-time
 *           description: "The end of the month the customer paid for. Moved on every renewal. A cancelled plan is usable until then."
 *         cancelledAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastPaymentAt:
 *           type: string
 *           format: date-time
 *         lastPaymentReference:
 *           type: string
 *         pendingPlan:
 *           type: string
 *           nullable: true
 *         remainingItems:
 *           type: number
 *           example: 10
 *         expiresAt:
 *           type: string
 *           format: date-time
 *         paystackCustomerCode:
 *           type: string
 *         paystackEmailToken:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 * /subscription/current-subscription:
 *   get:
 *     summary: Get the customer's usable subscription
 *     description: "Feature 21: returns the plan the customer can book against — `active`, or `cancelled` with `currentPeriodEnd` still ahead. `subscription` is null when there is none."
 *     tags:
 *       - Subscription
 *     responses:
 *       200:
 *         description: Subscription state retrieved successfully
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
 *                       example: Subscription state retrieved successfully
 *                     subscription:
 *                       allOf:
 *                         - $ref: '#/components/schemas/Subscription'
 *                       nullable: true
 *                     renewalFailed:
 *                       type: object
 *                       nullable: true
 *                       description: >
 *                         Feature 21 (client 2026-10-14): present when there is no usable plan and the
 *                         customer's last renewal FAILED. Show `message` as a banner on My Plan; its button
 *                         opens the normal checkout for `planId` (the same plan). Re-subscribing by
 *                         `keepItemsBy` keeps `unusedItems` (capped at half the plan). After that date
 *                         `unusedItems` is 0 and the message just invites them to subscribe again.
 *                       properties:
 *                         planId: { type: string, example: "64f1a2b3c4d5e6f7890abc56" }
 *                         failedAt: { type: string, format: date-time, example: "2026-11-10T09:00:00.000Z" }
 *                         keepItemsBy: { type: string, format: date-time, example: "2026-11-17T09:00:00.000Z" }
 *                         unusedItems: { type: number, example: 20 }
 *                         message: { type: string, example: "Your plan renewal didn't go through. Subscribe again by Tuesday 17 November to keep your 20 unused items." }
 *       500:
 *         description: Server error
 */
router.get(ROUTE_CURRENT_SUBSCRIPTION, [auth], async (req, res) => {
  const subscriptionController = new SubscriptionController();
  return subscriptionController.getCurrentSubscription(req, res);
});

module.exports = router;
