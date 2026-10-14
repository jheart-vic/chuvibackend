const cron = require("node-cron");
const SubscriptionModel = require("../models/subscription.model");
const paystackAxios = require("../services/paystack.client.service.js");
const PaymentModel = require("../models/payment.model.js");
const { PAYSTACK_STATUS_MAP } = require("../util/subscriptionAccess");

// One nightly pass. Exported so it can be driven by a staging script.
async function reconcileSubscriptions(now = new Date()) {
  const summary = { checked: 0, updated: 0, failed: 0, expired: 0 };

  // === Task 1: Reconcile Paystack Subscriptions ===
  // Feature 21: Paystack's status is MAPPED onto ours (`non-renewing` and
  // `complete` → cancelled, `attention` → failed). Copying it as-is threw on
  // those values, and the first throw aborted the loop for every later
  // subscriber. Each record is now handled on its own.
  // It used to select on `paystackSubscriptionCode`, which nothing ever writes,
  // so no subscription was ever reconciled. The Paystack code is `subscriptionCode`.
  const subs = await SubscriptionModel.find({
    subscriptionCode: { $exists: true, $ne: null },
    // Not `cancelled`: we keep our own cancelled state, so asking Paystack about
    // it changed nothing (review F-92). Ended cancelled plans expire in Task 2.
    status: { $in: ["active", "failed"] },
  });
  for (const sub of subs) {
    summary.checked += 1;
    try {
      const res = await paystackAxios.get(`/subscription/${sub.subscriptionCode}`);
      const mapped = PAYSTACK_STATUS_MAP[res.data?.data?.status];
      // A record we cancelled stays cancelled (it is usable until its paid
      // month ends); an unknown Paystack status changes nothing.
      if (!mapped || mapped === sub.status || sub.status === "cancelled") continue;
      // Only a real renewal payment (the webhook) un-fails a plan — it also
      // applies the rollover and its one-week rule. Paystack can still say
      // `active` while it retries the card.
      // And a failed plan stays FAILED whatever Paystack says — cancelled
      // included (review F-95): the customer keeps the leftovers until the
      // keep-by date promised in the SMS, cancel reply and My Plan banner, and
      // re-subscribing to the same plan within the week carries them.
      if (sub.status === "failed") continue;
      sub.status = mapped;
      if (mapped === "failed" && !sub.failedAt) sub.failedAt = now;
      if (mapped === "cancelled") {
        if (!sub.cancelledAt) sub.cancelledAt = now;
        // Usable until the paid month ends (rule 4).
        if (!sub.currentPeriodEnd && sub.nextPaymentDate) sub.currentPeriodEnd = sub.nextPaymentDate;
      }
      await sub.save();
      summary.updated += 1;
    } catch (err) {
      summary.failed += 1;
      console.error(`Reconcile failed for subscription ${sub._id}:`, err?.message);
    }
  }

  // === Task 2: Expire cancelled plans whose paid month has ended ===
  // Feature 21 (rule 4): usable until the paid month ends, then nothing carries.
  const expired = await SubscriptionModel.updateMany(
    { status: "cancelled", currentPeriodEnd: { $lte: now } },
    { $set: { status: "expired", remainingItems: 0 } },
  );
  summary.expired = expired.modifiedCount || 0;

  // === Task 2b: Retry switching off replaced plans on Paystack ===
  // Risk fix C (2026-10-14): when a new plan activated, the old one was closed
  // here but Paystack refused or timed out on stopping it. Retry every night
  // until Paystack says it has ended, so it can't charge the customer again.
  summary.disableRetried = 0;
  summary.disableCleared = 0;
  const pending = await SubscriptionModel.find({
    paystackDisablePending: true,
    subscriptionCode: { $exists: true, $ne: null },
  });
  for (const sub of pending) {
    try {
      const res = await paystackAxios.get(`/subscription/${sub.subscriptionCode}`, { timeout: 10000 });
      const ps = res.data?.data;
      if (ps && !["cancelled", "complete", "completed", "non-renewing"].includes(ps.status)) {
        await paystackAxios.post(
          "/subscription/disable",
          { code: sub.subscriptionCode, token: sub.paystackEmailToken || ps.email_token },
          { timeout: 10000 },
        );
        summary.disableRetried += 1;
      }
      // Ended already, or our disable was accepted: nothing left to retry.
      await SubscriptionModel.updateOne({ _id: sub._id }, { $unset: { paystackDisablePending: "" } });
      summary.disableCleared += 1;
    } catch (err) {
      // Still pending; tomorrow night tries again.
      console.error(`Switch-off retry failed for subscription ${sub._id}:`, err?.response?.data?.message || err?.message);
    }
  }
  return summary;
}

cron.schedule("0 3 * * *", async () => {
  try {
    const summary = await reconcileSubscriptions();
    console.log("✅ Paystack subscriptions reconciled", summary);

    // === Task 3: Clean up abandoned pending payments ===
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

module.exports = { reconcileSubscriptions };
