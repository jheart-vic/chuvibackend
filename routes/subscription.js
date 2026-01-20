const SubscriptionController = require('../controllers/subscription.controller');
const { ROUTE_GET_PLAN, ROUTE_GET_PLANS, ROUTE_UPDATE_PLAN, ROUTE_DELETE_PLAN, ROUTE_SUBSCRIBE_PLAN, ROUTE_CANCEL_SUBSCRIPTION, ROUTE_CREATE_PLAN, ROUTE_CURRENT_SUBSCRIPTION } = require('../util/page-route');
const adminAuth = require('../middlewares/adminAuth');
const auth = require('../middlewares/auth');

const router = require('express').Router();

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
 *               - itemPerMonth
 *               - price
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
 *               itemPerMonth:
 *                 type: integer
 *                 example: 30
 *               price:
 *                 type: integer
 *                 example: 5000
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
 *                 message:
 *                   type: string
 *                   example: Plan created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Plan'
 *       400:
 *         description: Validation error or plan already exists
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
 *                   example: Plan title already exists
 *       500:
 *         description: Server error
 */
router.post(ROUTE_CREATE_PLAN, [adminAuth], async (req, res) => {
    const subscriptionController = new SubscriptionController()
    return subscriptionController.createPlans(req, res)
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
 *                 message:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Plan'
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_PLANS, [auth], async (req, res) => {
    const subscriptionController = new SubscriptionController()
    return subscriptionController.getPlans(req, res)
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
 *                 message:
 *                   $ref: '#/components/schemas/Plan'
 *       404:
 *         description: Plan not found
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_PLAN+"/:id", [auth], async (req, res) => {
    const subscriptionController = new SubscriptionController()
    return subscriptionController.getPlan(req, res)
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
 *               itemPerMonth:
 *                 type: integer
 *               price:
 *                 type: integer
 *               features:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Plan updated successfully
 *       404:
 *         description: Plan not found
 *       500:
 *         description: Server error
 */
router.put(ROUTE_UPDATE_PLAN+"/:id", [adminAuth], async (req, res) => {
    const subscriptionController = new SubscriptionController()
    return subscriptionController.updatePlan(req, res)
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
 *       404:
 *         description: Plan not found
 *       500:
 *         description: Server error
 */
router.delete(ROUTE_DELETE_PLAN+"/:id", [adminAuth], async (req, res) => {
    const subscriptionController = new SubscriptionController()
    return subscriptionController.deletePlan(req, res)
});

/**
 * @swagger
 * /subscription/subscribe-plan:
 *   post:
 *     summary: Subscribe a user to a plan
 *     tags:
 *       - Subscription
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - planId
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               planId:
 *                 type: string
 *                 example: 64f21b9a5c9d0c001e7a1234
 *     responses:
 *       200:
 *         description: Subscription initialized successfully
 *       404:
 *         description: Plan not found
 *       500:
 *         description: Server error
 */
router.post(ROUTE_SUBSCRIBE_PLAN, [auth], async (req, res) => {
    const subscriptionController = new SubscriptionController()
    return subscriptionController.subscribePlan(req, res)
});

/**
 * @swagger
 * /subscription/cancel-subscription:
 *   post:
 *     summary: Cancel an active subscription
 *     tags:
 *       - Subscription
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subscriptionCode
 *               - emailToken
 *             properties:
 *               subscriptionCode:
 *                 type: string
 *                 example: SUB_xxxxx
 *               emailToken:
 *                 type: string
 *                 example: email_token_here
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully
 *       500:
 *         description: Server error
 */
router.post(ROUTE_CANCEL_SUBSCRIPTION, [auth], async (req, res) => {
    const subscriptionController = new SubscriptionController()
    return subscriptionController.cancelSubscription(req, res)
});

/**
 * @swagger
 * /subscription/current-subscription:
 *   get:
 *     summary: Get the current active subscription of the user
 *     tags:
 *       - Subscription
 *     responses:
 *       200:
 *         description: Current subscription fetched successfully
 *       404:
 *         description: No active subscription found
 *       500:
 *         description: Server error
 */
router.get(ROUTE_CURRENT_SUBSCRIPTION, [auth], async (req, res) => {
    const subscriptionController = new SubscriptionController()
    return subscriptionController.getCurrentSubscription(req, res)
});

module.exports = router;