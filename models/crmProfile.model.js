const mongoose = require('mongoose')
const {
    CRM_STAGE,
    CRM_TAG,
    ORDER_CHANNEL,
} = require('../util/constants')

// One CRM "customer card" per person. userId is optional so that leads coming
// from WhatsApp chats or walk-ins (no account) still get a card; identity is
// linked later by normalized phone number.
const crmProfileSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true,
            sparse: true,
        },
        fullName: { type: String, trim: true },
        phoneNumber: { type: String, trim: true },
        normalizedPhone: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        },
        email: { type: String, trim: true, lowercase: true },

        stage: {
            type: String,
            enum: Object.values(CRM_STAGE),
            default: CRM_STAGE.LEAD,
        },
        tags: {
            type: [String],
            enum: Object.values(CRM_TAG),
            default: [],
        },
        channel: {
            type: String,
            enum: Object.values(ORDER_CHANNEL),
        },

        totalOrders: { type: Number, default: 0 },
        expressOrders: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        firstOrderAt: { type: Date },
        lastOrderAt: { type: Date },
        nextFollowUpAt: { type: Date },

        wasDormant: { type: Boolean, default: false },
        dormantSince: { type: Date },

        broadcastLists: {
            prospect: {
                active: { type: Boolean, default: false },
                joinedAt: { type: Date },
                lastSentAt: { type: Date },
            },
            churn: {
                active: { type: Boolean, default: false },
                joinedAt: { type: Date },
                lastSentAt: { type: Date },
            },
        },

        stageHistory: [
            {
                from: { type: String },
                to: { type: String },
                note: { type: String, default: '' },
                changedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                }, // null = automatic
                changedAt: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true },
)

crmProfileSchema.index({ stage: 1 })
crmProfileSchema.index({ tags: 1 })
crmProfileSchema.index({ lastOrderAt: 1 })

const CrmProfileModel = mongoose.model('CrmProfile', crmProfileSchema)
module.exports = CrmProfileModel
