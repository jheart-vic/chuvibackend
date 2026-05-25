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
    // serviceType: {
    //   type: [String],
    //   default: [
    //     ORDER_SERVICE_TYPE.IRONING_ONLY,
    //     ORDER_SERVICE_TYPE.WASHING_ONLY,
    //     ORDER_SERVICE_TYPE.WASH_AND_IRON,
    //   ],
    // },
    billingType: {
      type: [String],
      default: [BILLING_TYPE.PAY_PER_ITEM, BILLING_TYPE.PAY_FROM_SUBSCRIPTION],
    },
    serviceTiers: {
      type: [String],
      default: [
        SERVICE_TIERS.CLASSIC,
        SERVICE_TIERS.PREMIUM,
        SERVICE_TIERS.VIP,
      ],
    },
    deliverySpeed: {
      type: [String],
      default: [
        DELIVERY_SPEED.STANDARD,
        DELIVERY_SPEED.EXPRESS,
        DELIVERY_SPEED.SAME_DAY,
      ],
    },
    // pickupTime: {
    //   type: [String],
    // },
    // standardCapacity: { type: Number },
    // sameDayCapacity: { type: Number },
    // expressCapacity: { type: Number },
    // standardDeliveryPeriod: {type: Number},
  },
  { timestamps: true }
);

const AdminOrderDetailsModel = mongoose.model(
  "AdminOrderDetails",
  adminOrderDetailsSchema
);
module.exports = AdminOrderDetailsModel;
