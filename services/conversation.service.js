const ConversationModel = require('../models/conversation.model')
const ChatMessageModel = require('../models/chatMessage.model')
const { CONVERSATION_TYPE, CHAT_SENDER } = require('../util/constants')

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

    async closeConversation(conversationId) {
        const convo = await ConversationModel.findById(conversationId)
        if (!convo) return null
        convo.open = false
        await convo.save()
        return convo
    }
}

module.exports = new ConversationService()
