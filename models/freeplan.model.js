const mongoose = require("mongoose");

const FreePlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, default: "Free Plan" },
    description: {
      type: String,
      default:
        "For free with one pickup and a few items on us no commitment required.",
    },
    duration: { type: String, default: "monthly" },
    // subBody: { type: String, required: true },
    // itemPerMonth: { type: Number, required: true },
    price: { type: Number, default: 0 },
    features: {
      type: [String],
      default: [
        "1 time free pickup",
        "Up to 1 items washed and folded",
        "Standard turnaround time",
        "Basic WhatsApp updates",
      ],
    },
    monthlyLimits: { type: Number, default: 1 },
    isUsedPickup: { type: Boolean, default: false },
    isUsedWashed: { type: Boolean, default: false },
    isUsedFolder: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const FreePlanModel = mongoose.model("FreePlan", FreePlanSchema);
module.exports = FreePlanModel;
