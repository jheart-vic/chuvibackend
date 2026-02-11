const cron = require("node-cron");
const SubscriptionModel = require("../models/subscription.model");

cron.schedule("0 0 * * 0", async () => {
  try {
    await SubscriptionModel.updateMany(
      { status: "cancelled" },
      { remainingItems: {} }
    );

    console.log("✅ Cancelled subs cleaned");
  } catch (err) {
    console.error("Cleanup cron error:", err);
  }
});
