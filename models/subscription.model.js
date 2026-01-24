const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
  paystackSubscriptionCode: { type: String, required: true },
  status: {
    type: String,
    enum: ["active", "cancelled", "expired"],
    default: "active",
  },
  startDate: { type: Date },
  nextPaymentDate: { type: Date },
  paystackAuthorizationToken: { type: String, default: null },
  currentPeriodEnd: { type: Date },
  cancelledAt: { type: Date },
  lastPaymentAt: { type: Date },
});

const SubscriptionModel = mongoose.model("Subscription", subscriptionSchema);
module.exports = SubscriptionModel;
