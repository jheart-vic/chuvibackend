const SubscriptionController = require('../controllers/subscription.controller');
const { ROUTE_SEED_PLAN } = require('../util/page-route');


const router = require('express').Router();

router.get(ROUTE_SEED_PLAN, async (req, res) => {
    const subscriptionController = new SubscriptionController()
    return subscriptionController.seedPlans(req, res)
});

module.exports = router;