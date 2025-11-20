const mongoose = require("mongoose");
const { ROLE } = require("../util/constants");

const staffSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    hub: { type: mongoose.Schema.Types.ObjectId, ref: "Hub", required: true },
    role: { type: String, required: true, enum: [ROLE.ADMIN, ROLE.MANAGER, ROLE.STAFF], default: ROLE.STAFF },
  },
  { timestamps: true }
);


const StaffModel = mongoose.model("Staff", staffSchema);
module.exports = StaffModel;
