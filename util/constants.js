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
  SUCCESS: "success",
  PENDING: "pending",
  FAILED: "failed"
};

const PAYMENT_METHOD = {
  // PAY_ON_DELIVERY: "pay-on-delivery",
  BANK_TRANFER: "bank-transfer",
  PAYPAL: "paypal",
  PAYSTACK: "paystack",
  WALLET: "wallet",
  CARD: "card",
};

const NOTIFICATION_TYPE = {
  SYSTEM: "system",
  ORDER_CREATED: "order-created",
  ORDER_PICKED: "order-picked",
  ORDER_WASHING: "order-washing",
  ORDER_IRONING: "order-ironing",
  ORDER_DELIVERED: "order-delivered",
};

const ORDER_SERVICE_TYPE = {
  WASHING_ONLY: "washing-only",
  IRONING_ONLY: "ironing-only",
  WASH_AND_IRON: "wash-and-iron",
};

const BILLING_TYPE = {
  PAY_PER_ITEM: "pay-per-item",
  PAY_FROM_SUBSCRIPTION: "pay-from-subscription",
};

const SERVICE_TIERS = {
  STUDENT: "student",
  STANDARD: "standard",
  PREMIUM: "premium",
  VIP: "vip",
};

const DELIVERY_SPEED = {
  STANDARD: "standard",
  EXPRESS: "express",
  VIP: "vip",
};

const PICK_UP_TIME = {
  MORNING_TIME: "10am-12pm",
  EVENING_TIME: "4pm-6pm",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']

module.exports = {
  EXPIRES_AT,
  DELIVERY_CHARGE,
  ROLE,
  SERVICE_PLATFORM,
  GENERAL_STATUS,
  ORDER_STATUS,
  PAYMENT_ORDER_STATUS,
  PAYMENT_METHOD,
  NOTIFICATION_TYPE,
  ORDER_SERVICE_TYPE,
  BILLING_TYPE,
  SERVICE_TIERS,
  DELIVERY_SPEED,
  PICK_UP_TIME,
  MAX_FILE_BYTES,
  ALLOWED_MIMES,
};
