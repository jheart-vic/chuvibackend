const mongoose = require("mongoose");
const { PAYMENT_METHOD, ORDER_STATUS, PAYMENT_ORDER_STATUS } = require("../util/constants");

const bookOrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "BookOrderCategory", required: false },
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    pickupAddress: { type: String, required: true },
    deliveryAddress: { type: String, required: true },
    pickupDate: { type: Date, required: true },
    pickupTime: { type: String, required: true },
    serviceType: { type: String, required: true },
    noOfItems: { type: Number, required: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, required: true, enum: [PAYMENT_METHOD.BANK_TRANFER, PAYMENT_METHOD.PAY_ON_DELIVERY] },
    oscNumber: { type: String, required: true },
    specialInstruction: { type: String },
    stage: {
        status: {
          type: String,
          required: true,
          enum: [
            ORDER_STATUS.RECEIVED,
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
  },
  { timestamps: true }
);


const BookOrderModel = mongoose.model("BookOrder", bookOrderSchema);
module.exports = BookOrderModel;
