const mongoose = require("mongoose");

const adminSettingSchema = new mongoose.Schema(
  {
    washAndIronPerKg: { type: Number,default: 700 },
    washOnlyPerKg: { type: Number,default: 700 },
    ironOnlyPerPiece: { type: Number,default: 700 },
    dryCleanPerPiece: { type: Number,default: 700 },
    sameDayCharge: { type: Number,default: 300 },
    expressCharge: { type: Number,default: 100 },
    premiumServiceTierCharge: { type: Number, default: 1.5 },
    vipServiceTierCharge: { type: Number, default: 2 },
    // serviceType: {type: [{ type: String }], default: ['ironing-only', 'washing-only', 'wash-and-iron', 'dry-clean']},
    // pickupTimeSlots: {type: [{ type: String }], default: ['10am-12pm', '4pm-6pm']},
    // billingType: [{ type: String, default: ["pay-per-item", "pay-from-subscription", "pay-from-wallet"]}],
    // serviceTier: [{ value: String, charge: Number }],
    // deliverySpeed: [{ value: String, charge: Number }],
  },
  { timestamps: true }
);


const AdminSettingModel = mongoose.model("AdminSetting", adminSettingSchema);
module.exports = AdminSettingModel;
