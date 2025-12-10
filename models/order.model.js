const mongoose = require("mongoose");
const { ORDER_STATUS, PAYMENT_ORDER_STATUS } = require("../util/constants");

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    osc: { type: String, required: true, trim: true },
    service: { type: String, required: true },
    stage: {
      status: {
        type: String,
        required: true,
        enum: [
          ORDER_STATUS.DELIVERED,
          ORDER_STATUS.IN_PROCESS,
          ORDER_STATUS.READY,
          ORDER_STATUS.WASHING,
          ORDER_STATUS.IRONING,
        ],
        default: ORDER_STATUS.IN_PROCESS,
      },
      note: { type: String },
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: [PAYMENT_ORDER_STATUS.PAID, PAYMENT_ORDER_STATUS.PENDING],
      default: PAYMENT_ORDER_STATUS.PENDING,
    },
    address: { type: String, required: true },
    items: [
      {
        itemType: String,
        quantity: Number,
        amount: Number,
      },
    ],
    totalAmount: { type: Number, required: true },
  },
  { timestamps: true }
);

const OrderModel = mongoose.model("Order", orderSchema);
module.exports = OrderModel;
