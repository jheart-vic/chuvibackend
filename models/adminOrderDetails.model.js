const mongoose = require("mongoose");
const {
  ORDER_SERVICE_TYPE,
  BILLING_TYPE,
  SERVICE_TIERS,
  DELIVERY_SPEED,
  PICK_UP_TIME,
} = require("../util/constants");

const OrderItemSchema = new mongoose.Schema(
  {
    itemType: { type: String, required: true },
    price: { type: Number, required: true },
  },
  // { _id: false }
);


const adminOrderDetailsSchema = new mongoose.Schema(
  {
    serviceType: {
      type: [String],
      default: [
        ORDER_SERVICE_TYPE.IRONING_ONLY,
        ORDER_SERVICE_TYPE.WASHING_ONLY,
        ORDER_SERVICE_TYPE.WASH_AND_IRON,
      ],
    },
    billingType: {
      type: [String],
      default: [BILLING_TYPE.PAY_PER_ITEM, BILLING_TYPE.PAY_FROM_SUBSCRIPTION],
    },
    serviceTiers: {
      type: [String],
      default: [
        SERVICE_TIERS.STUDENT,
        SERVICE_TIERS.STANDARD,
        SERVICE_TIERS.PREMIUM,
        SERVICE_TIERS.VIP,
      ],
    },
    deliverySpeed: {
      type: [String],
      default: [
        DELIVERY_SPEED.STANDARD,
        DELIVERY_SPEED.EXPRESS,
        DELIVERY_SPEED.VIP,
      ],
    },
    pickupTime: {
      type: [String],
      default: [PICK_UP_TIME.MORNING_TIME, PICK_UP_TIME.EVENING_TIME],
    },
    orderItems: {
      type: [OrderItemSchema],
      default: [
        { itemType: "shirt", price: 500 },
        { itemType: "trouser", price: 600 },
        { itemType: "dress", price: 800 },
        { itemType: "suit", price: 1500 },
        { itemType: "skirt", price: 500 },
        { itemType: "bedsheet", price: 1000 },
        { itemType: "jeans", price: 700 },
        { itemType: "blouse", price: 500 },
        { itemType: "curtain", price: 1500 },
        { itemType: "blanket", price: 2000 },
        { itemType: "towel", price: 400 },
        { itemType: "jacket", price: 1200 },
      ],
    },
  },
  { timestamps: true }
);

const AdminOrderDetailsModel = mongoose.model(
  "AdminOrderDetails",
  adminOrderDetailsSchema
);
module.exports = AdminOrderDetailsModel;
