const SubscriptionController = require("../controllers/subscription.controller");
const { ROUTE_GET_PLANS } = require("../util/page-route");
const router = require("express").Router();

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
router.get(ROUTE_GET_PLANS,  async (req, res) => {
  const subscriptionController = new SubscriptionController();
  return subscriptionController.getPlans(req, res);
});
module.exports = router;