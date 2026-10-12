const cron = require("node-cron");
const SubscriptionModel = require("../models/subscription.model");
const paystackAxios = require("../services/paystack.client.service.js");
const PaymentModel = require("../models/payment.model.js");

cron.schedule("0 3 * * *", async () => {
  try {
    // === Task 1: Reconcile Paystack Subscriptions ===
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
    console.log("✅ Paystack subscriptions reconciled");

    // === Task 2: Clean up abandoned pending payments ===
    // Kept for 7 days: a payment-hold link is re-sent at 24h and stays usable
    // well past 48h, and the webhook only credits a payment whose pending row
    // still exists. Deleting after one day (the code said "3 days" but
    // subtracted 1) left late payers charged with nothing credited (F-41).
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    // Perform bulk deletion matching all your criteria
    const deleteResult = await PaymentModel.deleteMany({
      status: "pending",
      amount: 0,
      createdAt: { $lte: cutoff } // $lte means "less than or equal to" (older than)
    });

    console.log(`🧹 Cleaned up ${deleteResult.deletedCount} abandoned pending payments.`);

  } catch (err) {
    console.error("Reconcile/Cleanup cron error:", err);
  }
});
