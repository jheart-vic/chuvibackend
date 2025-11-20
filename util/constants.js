const EXPIRES_AT = 8 * 60 * 1000;
const DELIVERY_CHARGE = 1000;

// enum: ["manager", "admin", "staff", "front-desk"],
const ROLE = {
  MANAGER: "manager",
  ADMIN: "admin",
  STAFF: "staff",
  FRONT_DESK: "front_desk",
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
  READY: "ready",
  DELIVERED: "delivered",
  WASHING: "washing",
  IRONING: "ironing"
};
const PAYMENT_ORDER_STATUS = {
  PAID: "paid",
  PENDING: "pending"
};

module.exports = {
  EXPIRES_AT,
  DELIVERY_CHARGE,
  ROLE,
  SERVICE_PLATFORM,
  GENERAL_STATUS,
  ORDER_STATUS,
  PAYMENT_ORDER_STATUS
};
