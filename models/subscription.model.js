const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
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
  lastPaymentAt: { type: Date },
  lastPaymentReference: String,
  // pendingPlan: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: "SubscriptionPlan",
  //   default: null,
  // },
  remainingItems: { type: Number, required: true, default: 0 },
  // expiresAt: Date,
  paystackCustomerCode: String,
  paystackEmailToken: String,
},{timestamps: true});

subscriptionSchema.index({ user: 1, status: 1 });

subscriptionSchema.index({
  authorizationCode: 1,
  userId: 1,
  paystackSubscriptionId: 1,
});

const SubscriptionModel = mongoose.model("Subscription", subscriptionSchema);
module.exports = SubscriptionModel;

