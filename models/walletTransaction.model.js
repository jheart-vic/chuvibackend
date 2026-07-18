const mongoose = require("mongoose");
const { WALLET_TX_TYPE, CREDIT_SOURCE, CREDIT_TYPE } = require("../util/constants");

const walletTransactionSchema = new mongoose.Schema(
    {
      // walletId: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      type: { type: String, enum: Object.values(WALLET_TX_TYPE), required: true },
      amount: { type: Number, required: true },
      description: { type: String, default: 'Wallet Top Up' }, // e.g., "Order Payment", "Wallet Top-Up"
      reference: { type: String }, // for tracking
      status: { type: String, enum: ["pending", "success", "failed"], default: "pending" },
      // ─── credit-system fields (absent on legacy cash-only records) ───
      sourceSystem: { type: String, enum: Object.values(CREDIT_SOURCE) },
      creditType: { type: String, enum: Object.values(CREDIT_TYPE) }, // unset = cash movement
      relatedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "BookOrder" },
      relatedCreditId: { type: mongoose.Schema.Types.ObjectId, ref: "WalletCredit" },
      balanceAfter: { type: Number }, // cash balance after this movement, when known
      reason: { type: String }, // mandatory in practice for manual adjustments
      performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // staff, for manual adjustments
    },
    { timestamps: true }
  );

  walletTransactionSchema.index({ userId: 1, createdAt: -1 });

  const WalletTransactionModel = mongoose.model("WalletTransaction", walletTransactionSchema);
  module.exports = WalletTransactionModel;
