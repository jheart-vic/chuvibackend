const mongoose = require("mongoose");

const supplySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    hub: { type: mongoose.Schema.Types.ObjectId, ref: "Hub", required: true },
    reorderLevel: { type: Number, required: true },
  },
  { timestamps: true }
);


const SupplyModel = mongoose.model("Supply", supplySchema);
module.exports = SupplyModel;
