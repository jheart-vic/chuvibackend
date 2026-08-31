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
    // free pickup/delivery legs granted per rolling week (pickup & delivery
    // counted separately); editable per plan
    freePickupDeliveryPerWeek: { type: Number, default: 0, min: 0 },
    paystackPlanCode: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const PlanModel = mongoose.model("Plan", planSchema);
module.exports = PlanModel;
