const mongoose = require('mongoose')
const { CHAT_SENDER } = require('../util/constants')

// One message inside a Conversation. Supports text + photo attachments and
// system-generated status updates (senderType 'system').
const chatMessageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
            index: true,
        },
        senderType: {
            type: String,
            enum: Object.values(CHAT_SENDER),
            required: true,
        },
        // set for customer/staff messages; null for system/bot
        senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        text: { type: String },
        attachments: [{ type: String }], // photo URLs
        readByCustomer: { type: Boolean, default: false },
        readByStaff: { type: Boolean, default: false },
    },
    { timestamps: true },
)

chatMessageSchema.index({ conversationId: 1, createdAt: 1 })

const ChatMessageModel = mongoose.model('ChatMessage', chatMessageSchema)
module.exports = ChatMessageModel
