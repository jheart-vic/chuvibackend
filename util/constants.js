const EXPIRES_AT = 10 * 60 * 1000;
const DELIVERY_CHARGE = 1000;


const ROLE = {
  INTAKE_AND_TAG: "intake-and-tag",
  ADMIN: "admin",
  QC: "qc",
  PRESS: "press",
  WASH_AND_DRY: "wash-and-dry",
  SORT_AND_PRETREAT: "sort-and-pretreat",
  USER: "user",
  RIDER: "rider",
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

const PICKUP_STATUS = {
  PENDING: "pending",
  PICKED_UP: "picked-up",
  FAILED: "failed",
  SCHEDULED: "scheduled",
}

const DELIVERY_STATUS = {
  READY: "ready",
  DELIVERED: "delivered",
  OUT_FOR_DELIVERY: "out-for-delivery",
  FAILED: "failed",
}

const ACTIVITY_TYPE = {
  ORDER_CREATED: "order-created",
  ORDER_PICKED: "order-picked",
  ORDER_WASHING: "order-washing",
  ORDER_IRONING: "order-ironing",
  ORDER_CONFIRM: "order-confirm",
  ORDER_FLAGGED: "order-flagged",
  ORDER_DELIVERED: "order-delivered",
  PAYMENT_APPROVED: "payment-approved",
  WALLET_TOP_UP: "wallet-top-up",
  WALLET_ADJUSTMENT: "wallet-adjustment",
  DISPATCH_PICKUP: "dispatch-pickup",
  DISPATCH_DELIVERY: "dispatch-delivery",
  TAG_AND_QUEUE: "tag-and-queue",
  SORT_AND_PRETREAT: "sort-and-pretreat",
  TOP_UP_REQUEST: "top-up-request",
}

const STATION_STATUS = {
  INTAKE_AND_TAG_STATION: "intake-and-tag-station",
  SORT_AND_PRETREAT_STATION: "sort-and-pretreat-station",
  WASH_AND_DRY_STATION: "wash-and-dry-station",
  PRESSING_AND_IRONING_STATION: "pressing-and-ironing-station",
  QC_STATION: 'qc-station',
  PENDING: 'pending'
}

const ORDER_STATUS = {
  PENDING: "pending",
  HOLD: "hold",
  QUEUE: "queue",
  RECEIVED: "received",
  PICKED_UP: "picked-up",
  READY: "ready",
  DELIVERED: "delivered",
  OUT_FOR_DELIVERY: "out-for-delivery",
  WASHING: "washing",
  IRONING: "ironing",
  QC: "qc",
  SORT_AND_PRETREAT: "sort-and-pretreat",
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
  PAYMENT_APPROVED: "payment-approved",
  WALLET_TOP_UP: "wallet-top-up",
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
  SAME_DAY: "same-day",
};

const ORDER_CHANNEL = {
  WHATSAPP: "whatsapp",
  WEBSITE: "website",
  OFFICE: "office",
};

const PICK_UP_TIME = {
  MORNING_TIME: "10am-12pm",
  EVENING_TIME: "4pm-6pm",
};

const ORDER_ITEMS = {
  SHIRT: "shirt",
  TROUSER: "trouser",
  DRESS: "dress",
  SUIT: "suit",
  SKIRT: "skirt",
  JACKET: "jacket",
  BLOUSE: "blouse",
  JEANS: "jeans",
  BEDSHEET: "bedsheet",
  CURTAIN: "curtain",
  BLANKET: "blanket",
  TOWEL: "towel",
}
const STANDARD_ORDER_ITEMS = {
  SHIRT: "shirt",
  TROUSER: "trouser",
  DRESS: "dress",
  SKIRT: "skirt",
  JACKET: "jacket",
  BLOUSE: "blouse",
  JEANS: "jeans",
  TOWEL: "towel",
}

const TAG_STATE = {
  DAMAGED: "damaged",
  STAINED: "stained",
  PRETREAT: "pretreat",
  DELICATE: "delicate"
}

const TAG_COLOR = {
  WHITE: "white",
  DARK: "dark",
  LIGHT: "light",
}

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']

const ITEM_ENUM_TYPES = Object.values(ORDER_ITEMS);
const STANDARD_ITEMS_ENUM_TYPES = Object.values(STANDARD_ORDER_ITEMS);

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
  ORDER_ITEMS,
  STANDARD_ORDER_ITEMS,
  STANDARD_ITEMS_ENUM_TYPES,
  ITEM_ENUM_TYPES,
  ORDER_CHANNEL,
  TAG_STATE,
  TAG_COLOR,
  PICKUP_STATUS,
  DELIVERY_STATUS,
  ACTIVITY_TYPE,
  STATION_STATUS
};
