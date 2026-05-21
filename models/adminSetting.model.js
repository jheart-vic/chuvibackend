const mongoose = require("mongoose");

const adminSettingSchema = new mongoose.Schema(
  {
    washAndIronPerKg: { type: Number },
    washOnlyPerKg: { type: Number },
    ironOnlyPerPiece: { type: Number },
    dryCleanPerPiece: { type: Number },
    sameDayCharge: { type: Number },
    expressCharge: { type: Number },
    premiumServiceTierCharge: { type: Number, default: 1.5 },
    vipServiceTierCharge: { type: Number, default: 2 },
  },
  { timestamps: true }
);


const AdminSettingModel = mongoose.model("AdminSetting", adminSettingSchema);
module.exports = AdminSettingModel;
