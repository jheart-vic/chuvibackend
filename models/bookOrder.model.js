const mongoose = require("mongoose");
const {
  ORDER_STATUS,
  PAYMENT_ORDER_STATUS,
  DELIVERY_SPEED,
  SERVICE_TIERS,
  ORDER_SERVICE_TYPE,
  PICK_UP_TIME,
  PAYMENT_METHOD,
  BILLING_TYPE,
  ITEM_ENUM_TYPES,
  ORDER_CHANNEL,
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
    deliveryDate: { type: Date },
    isVerified: {type: Boolean, default: false},
    rejectReason: {type: String},
    pickupTime: {
      type: String,
      required: true,
      trim: true,
      enum: [PICK_UP_TIME.MORNING_TIME, PICK_UP_TIME.EVENING_TIME],
    },
    serviceType: {
      type: String,
      required: true,
      trim: true,
      enum: [
        ORDER_SERVICE_TYPE.IRONING_ONLY,
        ORDER_SERVICE_TYPE.WASHING_ONLY,
        ORDER_SERVICE_TYPE.WASH_AND_IRON,
      ],
    },
    serviceTier: {
      type: String,
      required: true,
      trim: true,
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
      trim: true,
      enum: [
        DELIVERY_SPEED.EXPRESS,
        DELIVERY_SPEED.STANDARD,
        DELIVERY_SPEED.SAME_DAY,
      ],
    },
    channel: {
      type: String,
      required: true,
      trim: true,
      default: ORDER_CHANNEL.WEBSITE,
      enum: [
        ORDER_CHANNEL.WHATSAPP,
        ORDER_CHANNEL.WEBSITE,
        ORDER_CHANNEL.OFFICE,
      ],
    },
    // noOfItems: { type: Number, required: true },
    amount: { type: Number, required: true },
    deliveryAmount: { type: Number, default: 0 },
    billingType: {
      type: String,
      // required: true,
      // trim: true,
      enum: [BILLING_TYPE.PAY_FROM_SUBSCRIPTION, BILLING_TYPE.PAY_PER_ITEM],
    },
    paymentMethod: {
      type: String,
      // required: true,
      // trim: true,
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
        type: { type: String, required: true, enum: ITEM_ENUM_TYPES },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
      },
    ],
    extraNote: { type: String },
    stage: {
      status: {
        type: String,
        required: true,
        trim: true,
        enum: [
          ORDER_STATUS.PICKED_UP,
          ORDER_STATUS.DELIVERED,
          ORDER_STATUS.OUT_FOR_DELIVERY,
          ORDER_STATUS.PENDING,
          ORDER_STATUS.READY,
          ORDER_STATUS.WASHING,
          ORDER_STATUS.IRONING,
          ORDER_STATUS.QUEUE,
          ORDER_STATUS.HOLD,
        ],
        default: ORDER_STATUS.PENDING,
      },
      note: { type: String },
    },
    paymentStatus: {
      type: String,
      required: true,
      trim: true,
      enum: [
        PAYMENT_ORDER_STATUS.SUCCESS,
        PAYMENT_ORDER_STATUS.PENDING,
        PAYMENT_ORDER_STATUS.FAILED,
      ],
      default: PAYMENT_ORDER_STATUS.PENDING,
    },
    isPickUpAndDelivery: { type: Boolean, default: false },
    reference: { type: String },
    paymentDate: { type: Date },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IntakeUser",
      required: false,
    }
  },
  { timestamps: true }
);

const BookOrderModel = mongoose.model("BookOrder", bookOrderSchema);
module.exports = BookOrderModel;
