const EXPIRES_AT = 10 * 60 * 1000;
const DELIVERY_CHARGE = 1000;

// enum: ["manager", "admin", "staff", "front-desk"],
const ROLE = {
  MANAGER: "manager",
  ADMIN: "admin",
  STAFF: "staff",
  FRONT_DESK: "front_desk",
  USER: "user",
};
const SERVICE_PLATFORM = {
  GOOGLE: "google",
  APPLE: "apple",
  LOCAL: "local",
};

const GENERAL_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  PENDING: "pending",
  SUSPENDED: "suspended",
};
const ORDER_STATUS = {
  IN_PROCESS: "in-process",
  RECEIVED: "received",
  READY: "ready",
  DELIVERED: "delivered",
  WASHING: "washing",
  IRONING: "ironing"
};
const PAYMENT_ORDER_STATUS = {
  PAID: "paid",
  PENDING: "pending"
};

const PAYMENT_METHOD = {
  PAY_ON_DELIVERY: "pay-on-delivery",
  BANK_TRANFER: "bank-transfer"
};

const NOTIFICATION_TYPE = {
  SYSTEM: "system",
  ORDER_CREATED: "order-created",
  ORDER_PICKED: "order-picked",
  ORDER_WASHING: "order-washing",
  ORDER_IRONING: "order-ironing",
  ORDER_DELIVERED: "order-delivered",
};

module.exports = {
  EXPIRES_AT,
  DELIVERY_CHARGE,
  ROLE,
  SERVICE_PLATFORM,
  GENERAL_STATUS,
  ORDER_STATUS,
  PAYMENT_ORDER_STATUS,
  PAYMENT_METHOD,
  NOTIFICATION_TYPE
};
