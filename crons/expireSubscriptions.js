const cron = require("node-cron");
const SubscriptionModel = require("../models/subscription.model");


cron.schedule("0 0 * * *", async () => {
  try {
    const now = new Date();

    await SubscriptionModel.updateMany(
      {
        status: "active",
        expiresAt: { $lt: now },
      },
      { status: "expired" }
    );

    console.log("✅ Expired subscriptions checked");
  } catch (err) {
    console.error("Expire cron error:", err);
  }
});
