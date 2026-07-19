const mongoose = require('mongoose')
const {
    OFFER_TYPE,
    OFFER_STATUS,
    OFFER_TRIGGER,
    OFFER_BENEFIT_TYPE,
    CRM_STAGE,
} = require('../util/constants')

// An offer as created ONCE by staff in the Offer Builder. Automated systems
// never create these — they only link an existing active offer to eligible
// customers (see customerOffer.model.js). Baseline offers need no linkage;
// their rules are checked directly at booking.
const benefitSchema = new mongoose.Schema(
    {
        benefitType: {
            type: String,
            enum: Object.values(OFFER_BENEFIT_TYPE),
            required: true,
        },
        // order-discount
        percent: { type: Number, min: 0, max: 100 },
        amount: { type: Number, min: 0 }, // fixed discount OR credit amount
        // free-items
        minPaidItems: { type: Number, min: 0 },
        freeItemCount: { type: Number, min: 0 },
        eligibleItemTypes: [{ type: String }],
        maxFreeValue: { type: Number, min: 0 },
        // extra-laundry-credit
        minOrderValue: { type: Number, min: 0 },
        creditAmount: { type: Number, min: 0 },
    },
    { _id: false },
)

const offerSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        headline: { type: String, required: true },
        description: { type: String },
        type: {
            type: String,
            enum: Object.values(OFFER_TYPE),
            required: true,
        },
        // personal offers only: which event links this offer. At most one
        // ACTIVE offer per trigger — handleTrigger picks the newest active.
        trigger: {
            type: String,
            enum: Object.values(OFFER_TRIGGER),
        },
        benefits: {
            type: [benefitSchema],
            validate: [(v) => v.length > 0, 'At least one benefit is required'],
        },
        // eligibility rules — all set rules must pass
        rules: {
            stages: [{ type: String, enum: Object.values(CRM_STAGE) }],
            tags: [{ type: String }],
            minOrders: { type: Number },
            maxOrders: { type: Number },
            daysSinceLastOrder: { type: Number },
            minOrderValue: { type: Number }, // checked at booking
            minItems: { type: Number }, // checked at booking
            firstOrderOnly: { type: Boolean, default: false },
            serviceTypes: [{ type: String }],
            oneUsePerCustomer: { type: Boolean, default: true },
        },
        startDate: { type: Date },
        expiryDate: { type: Date },
        // how long a customer has to use it once linked (personal offers)
        customerWindowDays: { type: Number, default: 14 },
        usageLimit: { type: Number }, // global redemption cap; null = unlimited
        usedCount: { type: Number, default: 0 },
        status: {
            type: String,
            enum: Object.values(OFFER_STATUS),
            default: OFFER_STATUS.DRAFT,
            index: true,
        },
        // promos only: may this campaign combine with a personal offer?
        stackableWithPersonal: { type: Boolean, default: false },
        // overrides RewardSetting default for extra-laundry-credit expiry
        creditExpiryDays: { type: Number },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
)

offerSchema.index({ type: 1, status: 1 })
offerSchema.index({ trigger: 1, status: 1 })

const OfferModel = mongoose.model('Offer', offerSchema)
module.exports = OfferModel
