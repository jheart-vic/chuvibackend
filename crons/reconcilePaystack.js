const cron = require("node-cron");
const SubscriptionModel = require("../models/subscription.model");
const paystackAxios = require("../services/paystack.client.service.js");

cron.schedule("0 3 * * *", async () => {
  try {
    const subs = await SubscriptionModel.find({
      paystackSubscriptionCode: { $exists: true },
    });

    for (const sub of subs) {
      const res = await paystackAxios.get(
        `/subscription/${sub.paystackSubscriptionCode}`
      );

      const psStatus = res.data.data.status;

      if (psStatus !== sub.status) {
        sub.status = psStatus;
        await sub.save();
      }
    }

    console.log("✅ Paystack reconciled");
  } catch (err) {
    console.error("Reconcile cron error:", err);
  }
});
