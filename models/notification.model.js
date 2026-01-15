const mongoose = require("mongoose");
const { ROLE, NOTIFICATION_TYPE } = require("../util/constants");

const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    subBody: { type: String },
    type: {
      type: String,
      required: true,
      enum: [
        NOTIFICATION_TYPE.SYSTEM,
        NOTIFICATION_TYPE.ORDER_CREATED,
        NOTIFICATION_TYPE.ORDER_DELIVERED,
        NOTIFICATION_TYPE.ORDER_IRONING,
        NOTIFICATION_TYPE.ORDER_WASHING,
        NOTIFICATION_TYPE.ORDER_PICKED,
        NOTIFICATION_TYPE.PAYMENT_APPROVED,
    ],
      default: NOTIFICATION_TYPE.SYSTEM,
    },
  },
  { timestamps: true }
);

const NotificationModel = mongoose.model("Notification", notificationSchema);
module.exports = NotificationModel;
