const mongoose = require("mongoose");

const adminSettingSchema = new mongoose.Schema(
  {
    washAndIronPerKg: { type: Number },
    washOnlyPerKg: { type: Number },
    ironOnlyPerPiece: { type: Number },
    dryCleanPerPiece: { type: Number },
  },
  { timestamps: true }
);


const AdminSettingModel = mongoose.model("AdminSetting", adminSettingSchema);
module.exports = AdminSettingModel;
