const mongoose = require("mongoose");

const hubSchema = new mongoose.Schema(
  {
    hubName: { type: String, required: true, trim: true, unique: true },
    location: { type: String, required: true, trim: true },
    cityState: { type: String, required: true, trim: true },
    phoneNumber: { type: String },
  },
  { timestamps: true }
);


const HubModel = mongoose.model("Hub", hubSchema);
module.exports = HubModel;
