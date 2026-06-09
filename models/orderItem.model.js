const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
   isHeavy: { type: Boolean, default: false },
  },
  { timestamps: true }
);


const OrderItemModel = mongoose.model("OrderItem", orderItemSchema);
module.exports = OrderItemModel;
