const BaseService = require('./base.service')
const validateData = require('../util/validate')
const ConversationService = require('./conversation.service')
const BotOrchestratorService = require('./botOrchestrator.service')
const ConversationModel = require('../models/conversation.model')
const { emitChatMessage } = require('../config/socket')
const { CONVERSATION_TYPE, CHAT_SENDER } = require('../util/constants')

// Request-facing surface of the in-app bot (Phase 6). Customer endpoints drive
// the bot; staff endpoints (Customer Experience) service handed-off chats.
class BotApiService extends BaseService {
    // customer: send a message and get the bot's reply (or a handoff notice)
    async sendMessage(req) {
        try {
            const v = validateData(
                req.body,
                { text: 'string|required' },
                { required: ':attribute is required' },
            )
            if (!v.success) return BaseService.sendFailedResponse({ error: v.data })

            const result = await BotOrchestratorService.handleCustomerMessage({
                userId: req.user.id,
                text: req.body.text,
            })
            return BaseService.sendSuccessResponse({
                message: {
                    conversationId: result.conversation._id,
                    mode: result.conversation.mode,
                    handledBy: result.handledBy,
                    intent: result.intent || null,
                    replies: (result.replies || []).map((m) => ({
                        _id: m._id,
                        senderType: m.senderType,
                        text: m.text,
                        createdAt: m.createdAt,
                    })),
                },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to process your message' })
        }
    }

    // customer: my support conversation + message history (marks read)
    async getConversation(req) {
        try {
            const convo = await ConversationService.getOrCreateSupport(req.user.id)
            const { page, limit } = req.query
            const messages = await ConversationService.listMessages({
                conversationId: convo._id,
                page,
                limit,
            })
            await ConversationService.markRead({ conversationId: convo._id, side: 'customer' })
            return BaseService.sendSuccessResponse({
                message: {
                    conversation: {
                        _id: convo._id,
                        mode: convo.mode,
                        open: convo.open,
                        unreadForCustomer: 0,
                        lastMessageAt: convo.lastMessageAt,
                    },
                    ...messages,
                },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load conversation' })
        }
    }

    // customer: explicitly ask for a human
    async requestHandoff(req) {
        try {
            const convo = await ConversationService.getOrCreateSupport(req.user.id)
            if (convo.mode !== 'human') await BotOrchestratorService.handoff(convo, req.user.id)
            return BaseService.sendSuccessResponse({
                message: { conversationId: convo._id, mode: 'human' },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to request a human' })
        }
    }

    // ─── staff (Customer Experience) ─────────────────────────────────────────

    // list handed-off support chats waiting on staff
    async queue(req) {
        try {
            const convos = await ConversationModel.find({
                type: CONVERSATION_TYPE.SUPPORT,
                mode: 'human',
                open: true,
            })
                .sort({ lastMessageAt: -1 })
                .populate('userId', 'fullName phoneNumber')
                .lean()
            return BaseService.sendSuccessResponse({
                message: convos.map((c) => ({
                    _id: c._id,
                    customer: c.userId?.fullName || 'Customer',
                    phoneNumber: c.userId?.phoneNumber || null,
                    unreadForStaff: c.unreadForStaff || 0,
                    lastMessageAt: c.lastMessageAt,
                })),
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load support queue' })
        }
    }

    // staff posts a reply into a support conversation
    async staffReply(req) {
        try {
            const v = validateData(
                req.body,
                { text: 'string|required' },
                { required: ':attribute is required' },
            )
            if (!v.success) return BaseService.sendFailedResponse({ error: v.data })

            const convo = await ConversationModel.findById(req.params.conversationId)
            if (!convo || convo.type !== CONVERSATION_TYPE.SUPPORT) {
                return BaseService.sendFailedResponse({ error: 'Support conversation not found' })
            }
            const message = await ConversationService.postMessage({
                conversationId: convo._id,
                senderType: CHAT_SENDER.STAFF,
                senderId: req.user.id,
                text: req.body.text,
            })
            await ConversationService.markRead({ conversationId: convo._id, side: 'staff' })
            emitChatMessage(convo, message)
            return BaseService.sendSuccessResponse({
                message: { _id: message._id, text: message.text, createdAt: message.createdAt },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to send reply' })
        }
    }

    // staff closes a resolved support conversation
    async closeConversation(req) {
        try {
            const convo = await ConversationService.closeConversation(req.params.conversationId)
            if (!convo) return BaseService.sendFailedResponse({ error: 'Conversation not found' })
            return BaseService.sendSuccessResponse({ message: { closed: true } })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to close conversation' })
        }
    }
}

module.exports = BotApiService
