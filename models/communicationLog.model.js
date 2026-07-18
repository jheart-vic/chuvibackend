const mongoose = require('mongoose')
const {
    COMM_CHANNEL,
    COMM_STATUS,
    COMM_SOURCE_SYSTEM,
} = require('../util/constants')

// One record per message per channel — the delivery ledger of the
// communication layer. "Who got what, through which channel, and did it land."
const communicationLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        messageType: { type: String, required: true }, // e.g. offer-available, complaint-update
        sourceSystem: {
            type: String,
            enum: Object.values(COMM_SOURCE_SYSTEM),
            required: true,
        },
        templateKey: { type: String },
        // the record this message is about (offer linkage, complaint case, …)
        relatedRef: { type: mongoose.Schema.Types.ObjectId },
        relatedModel: { type: String }, // model name for relatedRef, informational
        channel: {
            type: String,
            enum: Object.values(COMM_CHANNEL),
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(COMM_STATUS),
            default: COMM_STATUS.PENDING,
            index: true,
        },
        content: {
            title: { type: String },
            body: { type: String },
        },
        // the in-app notification this log entry produced (read-receipt link)
        notificationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Notification',
        },
        error: { type: String },
        retryCount: { type: Number, default: 0 },
        sentAt: { type: Date },
        readAt: { type: Date },
    },
    { timestamps: true },
)

communicationLogSchema.index({ userId: 1, createdAt: -1 })
communicationLogSchema.index({ sourceSystem: 1, createdAt: -1 })

const CommunicationLogModel = mongoose.model(
    'CommunicationLog',
    communicationLogSchema,
)
module.exports = CommunicationLogModel
