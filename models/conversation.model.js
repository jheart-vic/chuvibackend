const mongoose = require('mongoose')
const { CONVERSATION_TYPE } = require('../util/constants')

// An in-app conversation thread. Complaint conversations stay linked to their
// case/order and are kept separate from general customer communication
// (spec rule). `support` type is reserved for the Phase 6 in-app bot.
const conversationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: Object.values(CONVERSATION_TYPE),
            required: true,
        },
        complaintCaseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ComplaintCase',
        },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookOrder' },
        // bot vs human handling (Phase 6); complaint chats are staff-handled
        mode: { type: String, enum: ['bot', 'human'], default: 'human' },
        // Phase 6 bot: in-flight multi-turn workflow state (intent + collected
        // slots), so a follow-up message continues where the last one left off.
        botState: {
            intent: { type: String, default: null },
            step: { type: String, default: null },
            slots: { type: mongoose.Schema.Types.Mixed, default: {} },
        },
        open: { type: Boolean, default: true },
        lastMessageAt: { type: Date },
        // unread counters per side, for badges
        unreadForCustomer: { type: Number, default: 0 },
        unreadForStaff: { type: Number, default: 0 },
    },
    { timestamps: true },
)

conversationSchema.index({ complaintCaseId: 1 })

const ConversationModel = mongoose.model('Conversation', conversationSchema)
module.exports = ConversationModel
