const mongoose = require('mongoose')
const { CUSTOMER_OFFER_STATUS } = require('../util/constants')

// The linkage between one customer and one existing offer. This is what
// "assigning an offer" means — the offer itself is never copied or recreated.
const customerOfferSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        offerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Offer',
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(CUSTOMER_OFFER_STATUS),
            default: CUSTOMER_OFFER_STATUS.ASSIGNED,
            index: true,
        },
        // event identity for dedupe: e.g. "loyalty-10", "referral-<id>".
        // Loyalty/referral rewards must never be assigned twice for one event.
        milestoneKey: { type: String },
        // customer-specific deadline (offer.customerWindowDays from assignment)
        expiresAt: { type: Date, index: true },
        // booking attachment / redemption
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookOrder' },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // staff, for manual assigns
        note: { type: String },
        viewedAt: { type: Date },
        attachedAt: { type: Date },
        redeemedAt: { type: Date },
    },
    { timestamps: true },
)

customerOfferSchema.index(
    { offerId: 1, milestoneKey: 1, userId: 1 },
    {
        unique: true,
        partialFilterExpression: { milestoneKey: { $type: 'string' } },
    },
)
customerOfferSchema.index({ userId: 1, status: 1 })
customerOfferSchema.index({ orderId: 1 })

const CustomerOfferModel = mongoose.model('CustomerOffer', customerOfferSchema)
module.exports = CustomerOfferModel
