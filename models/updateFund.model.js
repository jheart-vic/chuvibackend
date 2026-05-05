const mongoose = require("mongoose");

const updateFundSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    amount: { type: Number, required: true },
    message: { type: String },
    type: { type: String, enum: ["credit", "debit"], required: true },
  },
  { timestamps: true }
);

const UpdateFundModel = mongoose.model("UpdateFund", updateFundSchema);
module.exports = UpdateFundModel;
