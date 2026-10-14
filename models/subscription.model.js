const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  email: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
  paystackSubscriptionCode: { type: String },
  subscriptionCode: { type: String, unique: true, sparse: true },
  status: {
    type: String,
    enum: ["active", "cancelled", "expired", "pending", "failed"],
    default: "active",
  },
  startDate: { type: Date },
  nextPaymentDate: { type: Date },
  paystackAuthorizationToken: { type: String, default: null },
  paystackSubscriptionId: { type: String },
  currentPeriodEnd: { type: Date },
  cancelledAt: { type: Date },
  // Set the first time the "your plan expired" reminder goes out, so the daily
  // cron emails each expired subscriber ONCE instead of every day forever.
  expiryReminderSentAt: { type: Date },
  lastPaymentAt: { type: Date },
  lastPaymentReference: String,
  // Feature 21 (client rules 2026-10-11). The FIRST failed renewal payment of
  // the current failure: paid within 7 days of it, the leftover items still
  // carry over; later, they are forfeited. Cleared on renewal.
  failedAt: { type: Date },
  // When the day-5 "2 days left" SMS went out for the current failure (client
  // 2026-10-14), so it is sent once. Cleared with `failedAt`.
  renewalReminderSentAt: { type: Date },
  // A replaced plan we could not switch off on Paystack yet (risk fix C,
  // 2026-10-14). The nightly reconcile retries until Paystack says it stopped.
  paystackDisablePending: { type: Boolean },
  // What the last renewal carried over (at most half the plan). Audit only:
  // it is already inside `remainingItems`, which stays the one balance.
  rolledOverItems: { type: Number, default: 0 },
  // pendingPlan: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: "SubscriptionPlan",
  //   default: null,
  // },
  remainingItems: { type: Number, required: true, default: 0 },
  // Free pickup/delivery allowance — resets on a rolling 7-day window anchored
  // to the subscription start (lazy reset at booking; see util/logisticsAllowance).
  remainingPickupDeliveries: { type: Number, default: 0 },
  logisticsWeekStart: { type: Date },
  // Subscriber loyalty (client 2026-08-28): consecutive months the plan has been
  // renewed (1 on first charge, +1 each successful renewal, reset to 0 on a
  // failed payment). Rewards at 3/6/12 months, scaled to plan size.
  consecutiveMonths: { type: Number, default: 0 },
  // milestone months already rewarded (e.g. [3, 6]) — guards against a webhook
  // being delivered twice applying the same reward twice.
  loyaltyRewardsApplied: { type: [Number], default: [] },
  // expiresAt: Date,
  paystackCustomerCode: String,
  paystackEmailToken: String,
},{timestamps: true});

// F-47: `userId` is the field ("user" does not exist on this schema).
subscriptionSchema.index({ userId: 1, status: 1 });

subscriptionSchema.index({
  authorizationCode: 1,
  userId: 1,
  paystackSubscriptionId: 1,
});

const SubscriptionModel = mongoose.model("Subscription", subscriptionSchema);
module.exports = SubscriptionModel;

