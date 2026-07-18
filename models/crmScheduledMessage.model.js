const mongoose = require('mongoose')
const {
    CRM_WORKFLOW,
    CRM_MESSAGE_TYPE,
    CRM_MESSAGE_STATUS,
} = require('../util/constants')

// DB-backed follow-up queue. A cron dispatcher picks up pending entries whose
// dueAt has passed — this survives restarts, which matters because CRM delays
// span hours to weeks.
const crmScheduledMessageSchema = new mongoose.Schema(
    {
        profileId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'CrmProfile',
            required: true,
            index: true,
        },
        workflow: {
            type: String,
            enum: Object.values(CRM_WORKFLOW),
            required: true,
        },
        messageType: {
            type: String,
            enum: Object.values(CRM_MESSAGE_TYPE),
            required: true,
        },
        dueAt: { type: Date, required: true },
        status: {
            type: String,
            enum: Object.values(CRM_MESSAGE_STATUS),
            default: CRM_MESSAGE_STATUS.PENDING,
        },
        // if true, the dispatcher cancels this entry when the profile has
        // ordered since it was scheduled (lead reminders, reactivation
        // messages, reorder prompts all stop once the customer orders)
        cancelIfOrdered: { type: Boolean, default: false },
        sentAt: { type: Date },
        channelUsed: { type: String }, // whatsapp | sms | email
        error: { type: String },
    },
    { timestamps: true },
)

crmScheduledMessageSchema.index({ status: 1, dueAt: 1 })

const CrmScheduledMessageModel = mongoose.model(
    'CrmScheduledMessage',
    crmScheduledMessageSchema,
)
module.exports = CrmScheduledMessageModel
