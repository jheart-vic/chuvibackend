const mongoose = require('mongoose')
const { CRM_WORKFLOW, CRM_MESSAGE_TYPE } = require('../util/constants')

// Permanent record of every CRM message actually sent (workflow messages and
// broadcasts). Shown on the customer card as message history.
const crmMessageLogSchema = new mongoose.Schema(
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
        channel: { type: String }, // whatsapp | sms | email
        content: { type: String },
        success: { type: Boolean, default: true },
        error: { type: String },
    },
    { timestamps: true },
)

const CrmMessageLogModel = mongoose.model('CrmMessageLog', crmMessageLogSchema)
module.exports = CrmMessageLogModel
