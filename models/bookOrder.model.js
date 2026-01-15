const mongoose = require("mongoose");
const {
  ORDER_STATUS,
  PAYMENT_ORDER_STATUS,
  DELIVERY_SPEED,
  SERVICE_TIERS,
  ORDER_SERVICE_TYPE,
  PICK_UP_TIME,
  PAYMENT_METHOD,
} = require("../util/constants");

const bookOrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookOrderCategory",
      required: false,
    },
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    pickupAddress: { type: String, required: true },
    // deliveryAddress: { type: String, required: true },
    pickupDate: { type: Date, required: true },
    pickupTime: {
      type: String,
      required: true,
      enum: [PICK_UP_TIME.MORNING_TIME, PICK_UP_TIME.EVENING_TIME],
    },
    serviceType: {
      type: String,
      required: true,
      enum: [
        ORDER_SERVICE_TYPE.IRONING_ONLY,
        ORDER_SERVICE_TYPE.WASHING_ONLY,
        ORDER_SERVICE_TYPE.WASH_AND_IRON,
      ],
    },
    serviceTier: {
      type: String,
      required: true,
      enum: [
        SERVICE_TIERS.PREMIUM,
        SERVICE_TIERS.STANDARD,
        SERVICE_TIERS.VIP,
        SERVICE_TIERS.STUDENT,
      ],
    },
    deliverySpeed: {
      type: String,
      required: true,
      enum: [
        DELIVERY_SPEED.EXPRESS,
        DELIVERY_SPEED.STANDARD,
        DELIVERY_SPEED.VIP,
      ],
    },
    // noOfItems: { type: Number, required: true },
    amount: { type: Number, required: true },
    paymentMethod: {
      type: String,
      required: true,
      enum: [
        PAYMENT_METHOD.BANK_TRANFER,
        PAYMENT_METHOD.CARD,
        PAYMENT_METHOD.PAYPAL,
        PAYMENT_METHOD.PAYSTACK,
        PAYMENT_METHOD.WALLET
      ],
      default: PAYMENT_METHOD.PAYSTACK
    },
    oscNumber: { type: String, required: true, index: true, unique: true },
    items: [
      {
        type: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
      },
    ],
    extraNote: { type: String },
    stage: {
      status: {
        type: String,
        required: true,
        enum: [
          ORDER_STATUS.PICKED_UP,
          ORDER_STATUS.DELIVERED,
          ORDER_STATUS.OUT_FOR_DELIVERY,
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
      enum: [
        PAYMENT_ORDER_STATUS.SUCCESS,
        PAYMENT_ORDER_STATUS.PENDING,
        PAYMENT_ORDER_STATUS.FAILED,
      ],
      default: PAYMENT_ORDER_STATUS.PENDING,
    },
  },
  { timestamps: true }
);

const BookOrderModel = mongoose.model("BookOrder", bookOrderSchema);
module.exports = BookOrderModel;
