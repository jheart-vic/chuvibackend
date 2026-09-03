const mongoose = require('mongoose')
const {
    ORDER_STATUS,
    PAYMENT_ORDER_STATUS,
    DELIVERY_SPEED,
    SERVICE_TIERS,
    ORDER_SERVICE_TYPE,
    PAYMENT_METHOD,
    BILLING_TYPE,
    // ITEM_ENUM_TYPES,
    ORDER_CHANNEL,
    TAG_STATE,
    TAG_COLOR,
    PICKUP_STATUS,
    DELIVERY_STATUS,
    STATION_STATUS,
    FABRIC_TYPE,
    PRETREATMENT_OPTIONS,
    DAMAGE_RISK_FLAGS,
    COLOR_GROUP,
    ROLE,
} = require('../util/constants')

const ItemSchema = new mongoose.Schema(
    {
        type: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
        // Optional: name of the Set this piece was selected from (traceability).
        fromSet: { type: String },
        // Split-flow: the station this item is currently sitting at. Items can be
        // at different stations at once (some washing while others still pressing).
        currentStation: {
            type: String,
            enum: Object.values(STATION_STATUS),
            default: STATION_STATUS.INTAKE_AND_TAG_STATION,
        },
        tagId: { type: String },
        tagState: [
            {
                type: String,
                enum: [
                    TAG_STATE.DAMAGED,
                    TAG_STATE.DELICATE,
                    TAG_STATE.PRETREAT,
                    TAG_STATE.STAINED,
                ],
                default: [],
            },
        ],
        tagColor: {
            type: String,
            enum: [TAG_COLOR.DARK, TAG_COLOR.LIGHT, TAG_COLOR.WHITE, null],
            default: null,
        },
        tagStatus: {
            type: String,
            enum: ['complete', 'pending'],
            default: 'pending',
        },
        // Sort & Pretreat fields
        colorGroup: {
            type: String,
            enum: Object.values(COLOR_GROUP), // white | colored
            default: null,
        },
        fabricType: {
            type: String,
            enum: Object.values(FABRIC_TYPE), // delicate | light | heavy
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
            default: '',
        },
        sortStatus: {
            type: String,
            enum: ['pending', 'complete', 'not_required'],
            default: 'pending',
        },
        pretreatStatus: {
            type: String,
            enum: ['pending', 'complete', 'not_required'],
            default: 'pending',
        },
        washStatus: {
            type: String,
            enum: ['pending', 'complete'],
            default: 'pending',
        },
        ironStatus: {
            type: String,
            enum: ['pending', 'complete'],
            default: 'pending',
        },
        washConfirmedAt: { type: Date },
        washConfirmedByOperatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        qcStatus: {
            type: String,
            enum: ['pending', 'passed', 'failed'],
            default: 'pending',
        },
        qcConfirmedAt: { type: Date },
        qcConfirmedByOperatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        pressStatus: {
            type: String,
            enum: ['pending', 'complete'],
            default: 'pending',
        },
        pressConfirmedAt: { type: Date },
        pressConfirmedByOperatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        flaggedForReview: { type: Boolean, default: false },
        holdDetails: {
            reason: { type: String },
            note: { type: String, default: '' },
            assignTo: {
                type: String,
                enum: [
                    ROLE.ADMIN,
                    ROLE.SORT_AND_PRETREAT,
                    ROLE.INTAKE_AND_TAG,
                    ROLE.WASH_AND_DRY,
                    ROLE.PRESS,
                    ROLE.QC,
                ],
            },
            heldAt: { type: Date },
            heldByOperatorId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
            heldByStation: {
                type: String,
                enum: Object.values(STATION_STATUS),
            },
            releasedAt: { type: Date },
            releasedByOperatorId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        },
        actionLog: [
            {
                action: { type: String },
                note: { type: String, default: '' },
                timestamp: { type: Date, default: Date.now },
            },
        ],
    },
    { _id: true },
)

// Split-flow: a confirmed record of items being pushed from one station to the
// next. The pushing station creates it (status 'pending'); the receiving station
// confirms the exact count (accepted items advance; rejected items go to Hold).
const HandoffSchema = new mongoose.Schema(
    {
        fromStation: {
            type: String,
            enum: Object.values(STATION_STATUS),
            required: true,
        },
        toStation: {
            type: String,
            enum: Object.values(STATION_STATUS),
            required: true,
        },
        itemIds: [{ type: mongoose.Schema.Types.ObjectId }],
        count: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'rejected'],
            default: 'pending',
        },
        pushedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        pushedAt: { type: Date, default: Date.now },
        confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        confirmedAt: { type: Date },
        confirmedCount: { type: Number },
        rejectedItemIds: [{ type: mongoose.Schema.Types.ObjectId }],
        note: { type: String },
    },
    { _id: true, timestamps: true },
)

const bookOrderSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false,
        },
        fullName: { type: String, required: true },
        phoneNumber: { type: String, required: true },
        // Structured {label, address, landmark}; tolerant of legacy string orders.
        pickupAddress: { type: mongoose.Schema.Types.Mixed },
        deliveryAddress: { type: mongoose.Schema.Types.Mixed },
        pickupDate: { type: Date },
        deliveryDate: { type: Date },
        isVerified: { type: Boolean, default: false },
        pickupTime: {
            type: String,
            // enum: Object.values(PICK_UP_TIME),
        },
        serviceType: {
            type: String,
            required: true,
            trim: true,
            // enum: Object.values(ORDER_SERVICE_TYPE),
        },
        serviceTier: {
            type: String,
            required: true,
            trim: true,
            enum: Object.values(SERVICE_TIERS),
        },
        deliverySpeed: {
            type: String,
            required: true,
            trim: true,
            enum: Object.values(DELIVERY_SPEED),
        },
        channel: {
            type: String,
            required: true,
            trim: true,
            default: ORDER_CHANNEL.WEBSITE,
            enum: Object.values(ORDER_CHANNEL),
        },
        // noOfItems: { type: Number, required: true },
        amount: { type: Number, required: true },
        deliveryAmount: { type: Number, default: 0 },
        // Subscriber overflow: pickup/delivery fee charged once the weekly free
        // allowance is used up (0 = covered). Collected via wallet or card.
        logisticsFee: { type: Number, default: 0 },
        logisticsPaymentMethod: { type: String, enum: ['wallet', 'card', null], default: null },
        // Frozen price receipt captured at booking: every line that raised
        // (tier, fees) or lowered (offer, waived fees, wallet credit) the price,
        // so the customer can see the full breakdown of what they paid / gained.
        // No leaf defaults on purpose — the whole subdoc must stay ABSENT unless a
        // booking path explicitly sets it, so the read-time fallback can detect
        // legacy orders (defaults would auto-populate a misleading all-zero
        // receipt). reconstructed=true marks a best-effort shape built at read time.
        pricing: {
            type: {
                itemsBase: Number, // item subtotal before the tier multiplier
                serviceTier: String,
                tierMultiplier: Number,
                tierUplift: Number, // itemsSubtotal - itemsBase
                itemsSubtotal: Number, // item subtotal after the tier multiplier
                speedCharge: Number, // express / same-day surcharge
                pickupFee: Number,
                deliveryFee: Number,
                feesTotal: Number, // == deliveryAmount
                grossTotal: Number, // itemsSubtotal + feesTotal, before discounts
                offerDiscount: Number,
                freePickupWaived: Number,
                freeDeliveryWaived: Number,
                appliedOffers: [
                    {
                        // Explicit { type: ... } form: the field is literally named
                        // `type`, which Mongoose treats as its reserved type keyword
                        // in the shorthand form and mis-casts the array to [String].
                        offerId: { type: mongoose.Schema.Types.ObjectId },
                        name: { type: String },
                        type: { type: String }, // personal | promotion
                    },
                ],
                creditApplied: Number, // wallet reward credit used
                orderTotal: Number, // == amount (billed after offers/credit)
                youSaved: Number, // offerDiscount + waived fees + creditApplied
                coveredBySubscription: Boolean,
                reconstructed: Boolean,
            },
            default: undefined, // do not auto-create the subdoc
        },
        billingType: {
            type: String,
            enum: Object.values(BILLING_TYPE),
        },
        paymentMethod: {
            type: String,
            enum: Object.values(PAYMENT_METHOD),
            default: PAYMENT_METHOD.PAYSTACK,
        },
        oscNumber: { type: String, required: true, index: true, unique: true },
        // §6: a free recovery order (rewash/rework/repair/replace) created by CX
        // and linked back to the complaint + the original order. It flows through
        // the normal pipeline; on delivery the complaint auto-advances. Recovery
        // orders are excluded from CRM/offer/referral order accounting.
        isRecoveryOrder: { type: Boolean, default: false },
        recoveryForComplaintId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ComplaintCase',
        },
        recoveryForOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookOrder' },
        recoveryActionType: { type: String }, // rewash | rework | repair | replace
        items: [ItemSchema],
        handoffs: [HandoffSchema],
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
            updatedAt: { type: Date, default: Date.now },
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
        stationStatus: {
            type: String,
            enum: Object.values(STATION_STATUS),
            default: STATION_STATUS.PENDING,
        },
        paymentStatus: {
            type: String,
            required: true,
            trim: true,
            enum: Object.values(PAYMENT_ORDER_STATUS),
            default: PAYMENT_ORDER_STATUS.PENDING,
        },
        // Set when an order is cancelled (customer self-cancel or, later, staff
        // approval of a cancellation request). cancelledBy is the actor.
        cancellation: {
            cancelledAt: { type: Date },
            reason: { type: String },
            cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            tier: { type: String }, // green | amber (which window it was cancelled in)
            cashRefunded: { type: Number, default: 0 },
            creditsReversed: { type: Number, default: 0 },
            feeApplied: { type: Number, default: 0 }, // Amber only: fee withheld from cash refund
        },
        isPickUp: { type: Boolean, default: false },
        isDelivery: { type: Boolean, default: false },
        reference: { type: String },
        paymentDate: { type: Date },
        adjustWallet: {
            amount: { type: Number },
            message: { type: String },
        },
        intakeStaffId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false,
        },
        washDetails: {
            startedAt: { type: Date },
            movedToDryingAt: { type: Date },
            dryingCompletedAt: { type: Date },
            operatorId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        },
        pressDetails: {
            startedAt: { type: Date },
            completedAt: { type: Date },
            operatorId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        },
        qcDetails: {
            startedAt: { type: Date },
            passedAt: { type: Date },
            packCompletedAt: { type: Date },
            labelAttached: { type: Boolean, default: false },
            packageSealed: { type: Boolean, default: false },
            operatorId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
            packOperatorId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        },
        dispatchDetails: {
            pickup: {
                status: {
                    type: String,
                    enum: Object.values(PICKUP_STATUS),
                    default: PICKUP_STATUS.PENDING,
                },
                rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                isVerified: { type: Boolean, default: false },
                startedAt: { type: Date },
                updatedAt: { type: Date },
                // Unassigned-dispatch sweep guards (fire once per stage).
                alertedAt: { type: Date },
                escalatedAt: { type: Date },
            },
            delivery: {
                status: {
                    type: String,
                    enum: Object.values(DELIVERY_STATUS),
                    default: DELIVERY_STATUS.READY,
                },
                rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                note: { type: String },
                startedAt: { type: Date },
                updatedAt: { type: Date },
                alertedAt: { type: Date },
                escalatedAt: { type: Date },
            },
        },
    },
    { timestamps: true },
)

// ── Split-flow derived helpers ────────────────────────────────────────────
// The order-level station sequence for the summary (dispatch is post-S5).
const STATION_SEQUENCE = [
    STATION_STATUS.INTAKE_AND_TAG_STATION, // S1
    STATION_STATUS.SORT_AND_PRETREAT_STATION, // S2
    STATION_STATUS.WASH_AND_DRY_STATION, // S3
    STATION_STATUS.PRESSING_AND_IRONING_STATION, // S4
    STATION_STATUS.QC_STATION, // S5
]
const STATION_TO_ORDER_STATUS = {
    [STATION_STATUS.INTAKE_AND_TAG_STATION]: ORDER_STATUS.QUEUE,
    [STATION_STATUS.SORT_AND_PRETREAT_STATION]: ORDER_STATUS.SORT_AND_PRETREAT,
    [STATION_STATUS.WASH_AND_DRY_STATION]: ORDER_STATUS.WASHING,
    [STATION_STATUS.PRESSING_AND_IRONING_STATION]: ORDER_STATUS.IRONING,
    [STATION_STATUS.QC_STATION]: ORDER_STATUS.QC,
}

// Count of items sitting at each station: { station: count }.
bookOrderSchema.methods.countByStation = function () {
    const counts = {}
    for (const item of this.items || []) {
        const s = item.currentStation || STATION_STATUS.INTAKE_AND_TAG_STATION
        counts[s] = (counts[s] || 0) + 1
    }
    return counts
}

// True when every item is at the given station (whole-order gate helper).
bookOrderSchema.methods.isWholeAt = function (station) {
    const items = this.items || []
    if (!items.length) return false
    return items.every(
        (i) =>
            (i.currentStation || STATION_STATUS.INTAKE_AND_TAG_STATION) ===
            station,
    )
}

// Computed order summary: the LEAST-advanced station any item sits at maps to a
// conservative ORDER_STATUS (so dashboards never show an order further along than
// its slowest item). Returns null when there are no items.
bookOrderSchema.methods.summaryStatus = function () {
    const items = this.items || []
    if (!items.length) return null
    let minIdx = STATION_SEQUENCE.length
    for (const item of items) {
        const s = item.currentStation || STATION_STATUS.INTAKE_AND_TAG_STATION
        const idx = STATION_SEQUENCE.indexOf(s)
        if (idx !== -1 && idx < minIdx) minIdx = idx
    }
    if (minIdx >= STATION_SEQUENCE.length) return null
    return STATION_TO_ORDER_STATUS[STATION_SEQUENCE[minIdx]]
}

bookOrderSchema.statics.STATION_SEQUENCE = STATION_SEQUENCE
bookOrderSchema.statics.STATION_TO_ORDER_STATUS = STATION_TO_ORDER_STATUS

const BookOrderModel = mongoose.model('BookOrder', bookOrderSchema)
module.exports = BookOrderModel
