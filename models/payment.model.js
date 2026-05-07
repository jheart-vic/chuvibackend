const { default: mongoose } = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: { type: Number, required: true }, // in your base currency
    reference: { type: String, required: true, unique: true }, // from Paystack
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "BookOrder" },
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },
    type: {
      type: String,
      enum: ["order", "subscription", "wallet-top-up"],
      required: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
    channel: { type: String }, // card, bank, etc.
    paidAt: { type: Date },
    alertType: { type: String, enum: ["credit", "debit"] },
    paymentMethod: {
      type: String,
      enum: ["paystack", "bank-transfer"],
      default: "paystack",
    },
    proofOfPayment: { type: String },
    adminNote: { type: String },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const PaymentModel = mongoose.model("Payment", PaymentSchema);
module.exports = PaymentModel;
