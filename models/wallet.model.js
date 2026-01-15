const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0 }, // Current wallet balance
    currency: { type: String, default: "NGN" }, // optional
  },
  { timestamps: true }
);

const WalletModel = mongoose.model("Wallet", walletSchema);
module.exports = WalletModel;
