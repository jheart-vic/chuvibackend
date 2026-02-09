const SubscriptionModel = require("../models/subscription.model");

async function checkSubscription(req, res, next) {
  if (req.body.billingType == "pay-from-subscription") {
    const sub = await SubscriptionModel.findOne({
      user: req.user.id,
      status: "active",
    });

    if (!sub) {
      return res.status(403).json({
        success: false,
        error: "No active subscription",
      });
    }
  }

  next();
}

module.exports = checkSubscription;
