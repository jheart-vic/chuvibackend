const cron = require("node-cron");
const SubscriptionModel = require("../models/subscription.model");

cron.schedule("0 0 1 * *", async () => {
  try {
    const subs = await SubscriptionModel
      .find({ status: "active" })
      .populate("plan");

    for (const sub of subs) {
      sub.remainingItems = structuredClone(
        sub.plan.monthlyLimits
      );

      await sub.save();
    }

    console.log("✅ Monthly usage reset");
  } catch (err) {
    console.error("Reset usage cron error:", err);
  }
});
