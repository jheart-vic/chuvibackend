const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
    {
      // walletId: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      type: { type: String, enum: ["credit", "debit"], required: true },
      amount: { type: Number, required: true },
      description: { type: String, default: 'Wallet Top Up' }, // e.g., "Order Payment", "Wallet Top-Up"
      // reference: { type: String, required: true, unique: true }, // for tracking
      status: { type: String, enum: ["pending", "success", "failed"], default: "pending" },
    },
    { timestamps: true }
  );
  
  const WalletTransactionModel = mongoose.model("WalletTransaction", walletTransactionSchema);
  module.exports = WalletTransactionModel;
  