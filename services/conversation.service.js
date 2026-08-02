const ConversationModel = require('../models/conversation.model')
const ChatMessageModel = require('../models/chatMessage.model')
const {
    CONVERSATION_TYPE,
    CHAT_SENDER,
    CONVERSATION_OWNER,
    CONVERSATION_URGENCY,
} = require('../util/constants')

// In-app conversation engine. Phase 4 uses it for order-based complaint
// conversations (kept separate from general communication). Transport is REST
// now; real-time sockets can layer on later (Phase 6) without changing this.
class ConversationService {
    async getOrCreateForComplaint({ userId, complaintCaseId, orderId }) {
        let convo = await ConversationModel.findOne({
            type: CONVERSATION_TYPE.COMPLAINT,
            complaintCaseId,
        })
        if (!convo) {
            convo = await ConversationModel.create({
                userId,
                type: CONVERSATION_TYPE.COMPLAINT,
                complaintCaseId,
                orderId,
                mode: 'human',
            })
        }
        return convo
    }

    // The customer's live bot conversation (Phase 6). Scoped to mode:'bot' so it
    // stays separate from any handed-off (human) thread the customer may also
    // have open — that one lives in the staff queue as its own ticket. When the
    // bot thread is handed off it flips to human, and the next customer message
    // starts a fresh bot thread alongside it (two visible threads).
    async getOrCreateSupport(userId) {
        let convo = await ConversationModel.findOne({
            type: CONVERSATION_TYPE.SUPPORT,
            userId,
            open: true,
            mode: 'bot',
        })
        if (!convo) {
            convo = await ConversationModel.create({
                userId,
                type: CONVERSATION_TYPE.SUPPORT,
                mode: 'bot',
            })
        }
        return convo
    }

    // An existing open human (handed-off) support thread for the customer, if
    // any. Lets handoff stay idempotent instead of spawning empty duplicates.
    async findOpenHumanSupport(userId) {
        return ConversationModel.findOne({
            type: CONVERSATION_TYPE.SUPPORT,
            userId,
            open: true,
            mode: 'human',
        })
    }

    // All of the customer's open support threads (bot + human), newest first —
    // powers the customer's "Assistant" / "Support agent" thread list.
    async listOpenSupport(userId) {
        return ConversationModel.find({
            type: CONVERSATION_TYPE.SUPPORT,
            userId,
            open: true,
        })
            .sort({ lastMessageAt: -1 })
            .lean()
    }

    // Post a message. senderType decides which unread counter increments.
    async postMessage({
        conversationId,
        senderType,
        senderId,
        text,
        attachments = [],
    }) {
        const convo = await ConversationModel.findById(conversationId)
        if (!convo) throw new Error('Conversation not found')
        if (!text && (!attachments || !attachments.length)) {
            throw new Error('A message needs text or an attachment')
        }

        const message = await ChatMessageModel.create({
            conversationId,
            senderType,
            senderId,
            text,
            attachments,
            readByCustomer: senderType === CHAT_SENDER.CUSTOMER,
            readByStaff: senderType === CHAT_SENDER.STAFF,
        })

        convo.lastMessageAt = new Date()
        if (senderType === CHAT_SENDER.CUSTOMER) {
            convo.unreadForStaff += 1
        } else if (
            senderType === CHAT_SENDER.STAFF ||
            senderType === CHAT_SENDER.SYSTEM ||
            senderType === CHAT_SENDER.BOT
        ) {
            convo.unreadForCustomer += 1
        }
        await convo.save()
        return message
    }

    // System status update posted into the thread (e.g. "Status: Item Received").
    async postSystemMessage(conversationId, text) {
        if (!conversationId) return null
        try {
            return await this.postMessage({
                conversationId,
                senderType: CHAT_SENDER.SYSTEM,
                text,
            })
        } catch (err) {
            console.warn('System chat message failed (non-fatal):', err.message)
            return null
        }
    }

    async listMessages({ conversationId, page = 1, limit = 50 }) {
        page = parseInt(page) || 1
        limit = parseInt(limit) || 50
        const data = await ChatMessageModel.find({ conversationId })
            .sort({ createdAt: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean()
        const total = await ChatMessageModel.countDocuments({ conversationId })
        return {
            data,
            pagination: { total, page, limit, pages: Math.ceil(total / limit) },
        }
    }

    // Mark the thread read for one side and clear that side's counter.
    async markRead({ conversationId, side }) {
        const convo = await ConversationModel.findById(conversationId)
        if (!convo) throw new Error('Conversation not found')
        if (side === 'customer') {
            await ChatMessageModel.updateMany(
                { conversationId, readByCustomer: false },
                { $set: { readByCustomer: true } },
            )
            convo.unreadForCustomer = 0
        } else {
            await ChatMessageModel.updateMany(
                { conversationId, readByStaff: false },
                { $set: { readByStaff: true } },
            )
            convo.unreadForStaff = 0
        }
        await convo.save()
        return convo
    }

    // First time a staff member engages a handed-off chat, post a one-time
    // "you're now connected" notice so the customer knows a human has joined.
    // Returns the created system message (to emit), or null if already joined.
    async markAgentJoined(conversationId) {
        const convo = await ConversationModel.findById(conversationId)
        if (!convo || convo.agentJoinedAt) return null
        convo.agentJoinedAt = new Date()
        await convo.save()
        const message = await this.postSystemMessage(
            conversationId,
            "You're now connected to our Customer Experience team.",
        )
        return message
    }

    // First CX engagement claims ownership (unless an Admin already owns it).
    // Called alongside markAgentJoined on the first staff reply. No-op if the
    // thread already has an owner.
    async assignToCx(conversationId, cxId) {
        const convo = await ConversationModel.findById(conversationId)
        if (!convo || convo.assignedRole) return convo || null
        convo.assignedRole = CONVERSATION_OWNER.CX
        convo.assignedTo = cxId
        await convo.save()
        return convo
    }

    // CX → Admin escalation (§2). Records reason + urgency; never posts a
    // customer-facing message (this is an internal signal). Guards to an open
    // support conversation. Returns the updated conversation (null if invalid).
    async escalateToAdmin(conversationId, { escalatedBy, reason, urgency } = {}) {
        const convo = await ConversationModel.findById(conversationId)
        if (!convo || convo.type !== CONVERSATION_TYPE.SUPPORT || !convo.open) {
            return null
        }
        const validUrgency = Object.values(CONVERSATION_URGENCY).includes(urgency)
            ? urgency
            : CONVERSATION_URGENCY.NORMAL
        convo.escalation = {
            escalated: true,
            escalatedBy,
            reason: reason || null,
            urgency: validUrgency,
            escalatedAt: new Date(),
        }
        await convo.save()
        return convo
    }

    // Admin enters any conversation and takes ownership (§2). Idempotent on the
    // admin-owned state. If the thread hadn't been engaged by a human yet, this
    // also posts the one-time "connected" notice (returned to emit). Returns
    // { conversation, joinNotice, alreadyOwnedByAdmin }.
    async adminTakeOwnership(conversationId, { adminId } = {}) {
        const convo = await ConversationModel.findById(conversationId)
        if (!convo || convo.type !== CONVERSATION_TYPE.SUPPORT) return null
        const alreadyOwnedByAdmin =
            convo.assignedRole === CONVERSATION_OWNER.ADMIN &&
            String(convo.assignedTo || '') === String(adminId || '')

        let joinNotice = null
        if (!convo.agentJoinedAt) {
            joinNotice = await this.markAgentJoined(convo._id)
        }
        convo.assignedRole = CONVERSATION_OWNER.ADMIN
        convo.assignedTo = adminId
        if (!convo.adminJoinedAt) convo.adminJoinedAt = new Date()
        await convo.save()
        return { conversation: convo, joinNotice, alreadyOwnedByAdmin }
    }

    // Admin: every support conversation (open + closed, all customers), with
    // optional filters. Powers the admin "view every CX conversation" screen.
    async listAllSupportForAdmin({
        open,
        escalated,
        urgency,
        mode,
        page = 1,
        limit = 20,
    } = {}) {
        page = parseInt(page) || 1
        limit = parseInt(limit) || 20
        const filter = { type: CONVERSATION_TYPE.SUPPORT }
        if (open === 'true' || open === true) filter.open = true
        else if (open === 'false' || open === false) filter.open = false
        if (escalated === 'true' || escalated === true) filter['escalation.escalated'] = true
        if (urgency) filter['escalation.urgency'] = urgency
        if (mode) filter.mode = mode

        const data = await ConversationModel.find(filter)
            .sort({ 'escalation.escalated': -1, lastMessageAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('userId', 'fullName phoneNumber')
            .populate('assignedTo', 'fullName userType')
            .lean()
        const total = await ConversationModel.countDocuments(filter)
        return {
            data,
            pagination: { total, page, limit, pages: Math.ceil(total / limit) },
        }
    }

    // Staff closes a resolved support chat. Records who/when/why, posts a
    // one-time "closed" notice, and is idempotent. Returns { conversation,
    // message, alreadyClosed } — message is the system notice to emit (null when
    // none). The flip is ATOMIC (findOneAndUpdate on open:true), so a double-close
    // race gives exactly ONE winner (alreadyClosed:false + notice); every other
    // concurrent/repeat call gets alreadyClosed:true and posts nothing.
    async closeConversation(conversationId, { closedBy = null, reason = null } = {}) {
        const set = { open: false, closedAt: new Date() }
        if (closedBy) set.closedBy = closedBy
        if (reason) set.closeReason = reason

        const convo = await ConversationModel.findOneAndUpdate(
            { _id: conversationId, type: CONVERSATION_TYPE.SUPPORT, open: true },
            { $set: set },
            { new: true },
        )
        if (convo) {
            // this call won the close — post the single notice
            const message = await this.postSystemMessage(
                convo._id,
                'This chat has been closed by our team. Send a new message anytime and the assistant will pick it up.',
            )
            return { conversation: convo, message, alreadyClosed: false }
        }
        // Didn't match: either not a support chat / unknown id, or already closed.
        const existing = await ConversationModel.findById(conversationId)
        if (!existing || existing.type !== CONVERSATION_TYPE.SUPPORT) return null
        return { conversation: existing, message: null, alreadyClosed: true }
    }
}

module.exports = new ConversationService()
