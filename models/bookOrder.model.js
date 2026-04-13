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
  TAG_STATE,
  TAG_COLOR,
  PICKUP_STATUS,
  DELIVERY_STATUS,
  FABRIC_TYPE,
  PRETREATMENT_OPTIONS,
  DAMAGE_RISK_FLAGS,
  COLOR_GROUP,
} = require("../util/constants");

const ItemSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ITEM_ENUM_TYPES },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  tagId: { type: String },
  tagState: { type: String, enum: [TAG_STATE.DAMAGED, TAG_STATE.DELICATE, TAG_STATE.PRETREAT, TAG_STATE.STAINED] },
  tagColor: { type: String, enum: [TAG_COLOR.DARK, TAG_COLOR.LIGHT, TAG_COLOR.WHITE] },
  tagStatus: {type: String, enum: ['complete', 'pending'], default: 'pending'},
// Sort & Pretreat fields
colorGroup: {
  type: String,
  enum: Object.values(COLOR_GROUP),   // white | colored
  default: null,
},
fabricType: {
  type: String,
  enum: Object.values(FABRIC_TYPE),   // delicate | light | heavy
  default: null,
},
pretreatmentOptions: {
  type: [String],
  enum: Object.values(PRETREATMENT_OPTIONS),
  default: [],
},
damageRiskFlags: {
  type: [String],
  enum: Object.values(DAMAGE_RISK_FLAGS),
  default: [],
},
itemNote: {
  type: String,
  default: "",
},
sortStatus: {
  type: String,
  enum: ["pending", "complete"],
  default: "pending",
},
pretreatStatus: {
  type: String,
  enum: ["pending", "complete"],
  default: "pending",
},

    // ── Washing stage ────────────────────────────────────────────────────────
    washStatus: { type: String, enum: ["pending", "complete"], default: "pending" },

    // ── Ironing stage ────────────────────────────────────────────────────────
    ironStatus: { type: String, enum: ["pending", "complete"], default: "pending" },

    // ── Full audit trail (used by History timeline) ──────────────────────────
    // Every service method that changes item state pushes an entry here.
    // action values: "sorted" | "undo_sorted" | "pretreated" | "undo_pretreated"
    //              | "flagged" | "washed" | "undo_washed" | "ironed" | "undo_ironed"
    actionLog: [
      {
        action:    { type: String },
        note:      { type: String, default: "" },
        timestamp: { type: Date, default: Date.now },
      },
    ],
}, { _id: true });

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
    items: [ItemSchema],
    extraNote: { type: String },
    stage: {
      status: {
        type: String,
        required: true,
        trim: true,
        enum: Object.values(ORDER_STATUS),
        default: ORDER_STATUS.PENDING,
      },
      note: { type: String },
      updatedAt: { type: Date, default: Date.now }
    },
    stageHistory: [
      {
        status: {
          type: String,
          enum: Object.values(ORDER_STATUS),
        },
        note: String,
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    paymentStatus: {
      type: String,
      required: true,
      trim: true,
      enum: Object.values(PAYMENT_ORDER_STATUS),
      default: PAYMENT_ORDER_STATUS.PENDING,
    },
    isPickUpAndDelivery: { type: Boolean, default: false },
    reference: { type: String },
    paymentDate: { type: Date },
    adjustWallet:{
      amount: {type: Number},
      message: {type: String}
    },
    intakeStaffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IntakeUser",
      required: false,
    },
    dispatchDetails: {
      pickup: {
        status: {type: String, enum: Object.values(PICKUP_STATUS), default: PICKUP_STATUS.PENDING},
        rider: {type: mongoose.Schema.Types.ObjectId, ref: "Rider"},
        isVerified: {type: Boolean, default: false},
      },
      delivery: {
        status: {type: String, enum: Object.values(DELIVERY_STATUS), default: DELIVERY_STATUS.READY},
        rider: {type: mongoose.Schema.Types.ObjectId, ref: "Rider"},
        note: {type: String},
      }
    }
  },
  { timestamps: true }
);

const BookOrderModel = mongoose.model("BookOrder", bookOrderSchema);
module.exports = BookOrderModel;
