const mongoose = require('mongoose')
const {
    CONVERSATION_TYPE,
    CONVERSATION_OWNER,
    CONVERSATION_URGENCY,
} = require('../util/constants')

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
        //
        // `memory` (Phase A) is longer-lived conversation memory that survives
        // across turns even when no workflow is in flight: the last order the
        // customer referenced, saved defaults, and what an anaphor like
        // "it/they/go ahead/the usual/same as last time" currently points to.
        // The assistant uses it to stop re-asking for details already known and
        // to resolve natural references (doc §1, §10). Never holds money/authz.
        botState: {
            intent: { type: String, default: null },
            step: { type: String, default: null },
            slots: { type: mongoose.Schema.Types.Mixed, default: {} },
            memory: { type: mongoose.Schema.Types.Mixed, default: {} },
        },
        open: { type: Boolean, default: true },
        // when a human staff member first engaged a handed-off support chat, used
        // to post a one-time "you're now connected" notice to the customer.
        agentJoinedAt: { type: Date },
        // Ownership of the human handling (§2). CX owns a handed-off thread on
        // first reply; an Admin can take over any conversation at any time and
        // becomes the owner. null = still bot-handled / not yet engaged.
        assignedRole: {
            type: String,
            enum: [...Object.values(CONVERSATION_OWNER), null],
            default: null,
        },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        adminJoinedAt: { type: Date },
        // CX → Admin escalation (§2). Customers can never trigger this.
        escalation: {
            escalated: { type: Boolean, default: false },
            escalatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            reason: { type: String },
            urgency: {
                type: String,
                enum: Object.values(CONVERSATION_URGENCY),
            },
            escalatedAt: { type: Date },
        },
        // close audit (support chats): who closed it, when, and why.
        closedAt: { type: Date },
        closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        closeReason: { type: String },
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
