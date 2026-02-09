const mongoose = require("mongoose");

const planSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    duration: { type: String, required: true },
    // subBody: { type: String, required: true },
    // itemPerMonth: { type: Number, required: true },
    price: { type: Number, required: true },
    features: { type: [String], required: true },
    monthlyLimits: { type: Number, required: true },
    paystackPlanCode: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const PlanModel = mongoose.model("Plan", planSchema);
module.exports = PlanModel;
