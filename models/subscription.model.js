const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
  paystackSubscriptionCode: { type: String },
  status: {
    type: String,
    enum: ["active", "cancelled", "expired", "pending"],
    default: "active",
  },
  startDate: { type: Date },
  nextPaymentDate: { type: Date },
  paystackAuthorizationToken: { type: String, default: null },
  currentPeriodEnd: { type: Date },
  cancelledAt: { type: Date },
  lastPaymentAt: { type: Date },
  lastPaymentReference: String,
  pendingPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SubscriptionPlan",
    default: null,
  },
  remainingItems: { type: Number, required: true },
  expiresAt: Date,
  paystackCustomerCode: String,
  // paystackSubscriptionCode: String,
  paystackEmailToken: String,
},{timestamps: true});

const SubscriptionModel = mongoose.model("Subscription", subscriptionSchema);
module.exports = SubscriptionModel;
