const BaseService = require('./base.service')
const ConversationService = require('./conversation.service')
const BotOrchestratorService = require('./botOrchestrator.service')
const ConversationModel = require('../models/conversation.model')
const ChatMessageModel = require('../models/chatMessage.model')
const { emitChatMessage } = require('../config/socket')
const { CONVERSATION_TYPE, CHAT_SENDER } = require('../util/constants')

// Attachments are photo URLs (upload via /api/utils/image-upload-single first).
// Accept an array of strings, drop anything empty/non-string.
function normalizeAttachments(input) {
    if (!Array.isArray(input)) return []
    return input
        .filter((u) => typeof u === 'string' && u.trim())
        .map((u) => u.trim())
}

// Request-facing surface of the in-app bot (Phase 6). Customer endpoints drive
// the bot; staff endpoints (Customer Experience) service handed-off chats.
class BotApiService extends BaseService {
    // customer: send a message and get the bot's reply (or a handoff notice)
    async sendMessage(req) {
        try {
            // A message needs text or at least one attachment (photo URL).
            const text =
                typeof req.body.text === 'string' ? req.body.text.trim() : ''
            const attachments = normalizeAttachments(req.body.attachments)
            if (!text && !attachments.length) {
                return BaseService.sendFailedResponse({
                    error: 'A message needs text or an attachment',
                })
            }

            const result = await BotOrchestratorService.handleCustomerMessage({
                userId: req.user.id,
                text,
                attachments,
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

    // customer: a support conversation + message history (marks read).
    // Pass ?conversationId to open a specific thread (e.g. the handed-off human
    // one); ownership-checked. Omit it to get/create the live bot thread.
    async getConversation(req) {
        try {
            let convo
            const { conversationId, page, limit } = req.query
            if (conversationId) {
                convo = await ConversationModel.findOne({
                    _id: conversationId,
                    userId: req.user.id,
                    type: CONVERSATION_TYPE.SUPPORT,
                })
                if (!convo) {
                    return BaseService.sendFailedResponse({
                        error: 'Support conversation not found',
                    })
                }
            } else {
                convo = await ConversationService.getOrCreateSupport(req.user.id)
            }
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

    // customer: list my open support threads (bot + human) for the thread picker
    async listConversations(req) {
        try {
            const convos = await ConversationService.listOpenSupport(req.user.id)
            return BaseService.sendSuccessResponse({
                message: convos.map((c) => ({
                    _id: c._id,
                    mode: c.mode,
                    open: c.open,
                    unreadForCustomer: c.unreadForCustomer || 0,
                    lastMessageAt: c.lastMessageAt || null,
                })),
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load conversations' })
        }
    }

    // customer: post a message into a specific owned thread. Used for the
    // handed-off (human) thread, where the bot stays silent and staff reply.
    // If the target is still a bot thread, route through the orchestrator so the
    // assistant answers as usual.
    async replyToConversation(req) {
        try {
            const text =
                typeof req.body.text === 'string' ? req.body.text.trim() : ''
            const attachments = normalizeAttachments(req.body.attachments)
            if (!text && !attachments.length) {
                return BaseService.sendFailedResponse({
                    error: 'A message needs text or an attachment',
                })
            }

            const convo = await ConversationModel.findOne({
                _id: req.params.conversationId,
                userId: req.user.id,
                type: CONVERSATION_TYPE.SUPPORT,
            })
            if (!convo) {
                return BaseService.sendFailedResponse({
                    error: 'Support conversation not found',
                })
            }
            if (!convo.open) {
                return BaseService.sendFailedResponse({
                    error: 'This conversation is closed',
                })
            }

            // Still a bot thread → let the assistant handle it (same as /message).
            if (convo.mode !== 'human') {
                const result = await BotOrchestratorService.handleCustomerMessage({
                    userId: req.user.id,
                    text,
                    attachments,
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
            }

            // Human thread → just post and wait for staff; no bot reply.
            const message = await ConversationService.postMessage({
                conversationId: convo._id,
                senderType: CHAT_SENDER.CUSTOMER,
                senderId: req.user.id,
                text,
                attachments,
            })
            emitChatMessage(convo, message)
            return BaseService.sendSuccessResponse({
                message: {
                    conversationId: convo._id,
                    mode: convo.mode,
                    handledBy: 'human',
                    replies: [
                        {
                            _id: message._id,
                            senderType: message.senderType,
                            text: message.text,
                            createdAt: message.createdAt,
                        },
                    ],
                },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to send your message' })
        }
    }

    // customer: explicitly ask for a human. Reuse an existing open human thread
    // if one is already in the queue, so repeated taps don't spawn empty tickets;
    // otherwise hand off the customer's current bot thread.
    async requestHandoff(req) {
        try {
            let convo = await ConversationService.findOpenHumanSupport(req.user.id)
            if (!convo) {
                convo = await ConversationService.getOrCreateSupport(req.user.id)
                await BotOrchestratorService.handoff(convo, req.user.id)
            }
            return BaseService.sendSuccessResponse({
                message: { conversationId: convo._id, mode: 'human' },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to request a human' })
        }
    }

    // ─── staff (Customer Experience) ─────────────────────────────────────────

    // list handed-off support chats waiting on staff, each with a lightweight
    // last-message preview so the queue survives a page refresh (no client cache).
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

            // One query for the whole queue: newest message per conversation.
            const ids = convos.map((c) => c._id)
            const previewMap = {}
            if (ids.length) {
                const latest = await ChatMessageModel.aggregate([
                    { $match: { conversationId: { $in: ids } } },
                    { $sort: { createdAt: -1 } },
                    {
                        $group: {
                            _id: '$conversationId',
                            senderType: { $first: '$senderType' },
                            text: { $first: '$text' },
                            attachments: { $first: '$attachments' },
                            createdAt: { $first: '$createdAt' },
                        },
                    },
                ])
                for (const m of latest) {
                    const text = typeof m.text === 'string' ? m.text : ''
                    previewMap[String(m._id)] = {
                        senderType: m.senderType,
                        // cap the preview so the queue stays lightweight
                        text: text.length > 140 ? `${text.slice(0, 140)}…` : text,
                        attachments: Array.isArray(m.attachments) ? m.attachments : [],
                        createdAt: m.createdAt,
                    }
                }
            }

            return BaseService.sendSuccessResponse({
                message: convos.map((c) => ({
                    _id: c._id,
                    customer: c.userId?.fullName || 'Customer',
                    phoneNumber: c.userId?.phoneNumber || null,
                    unreadForStaff: c.unreadForStaff || 0,
                    lastMessageAt: c.lastMessageAt,
                    lastMessage: previewMap[String(c._id)] || null,
                })),
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load support queue' })
        }
    }

    // staff: load a support conversation's full message history by id, so CX can
    // read what the customer said before replying. Marks the staff side read.
    async staffGetConversation(req) {
        try {
            const convo = await ConversationModel.findById(req.params.conversationId)
                .populate('userId', 'fullName phoneNumber')
            if (!convo || convo.type !== CONVERSATION_TYPE.SUPPORT) {
                return BaseService.sendFailedResponse({ error: 'Support conversation not found' })
            }
            const { page, limit } = req.query
            const messages = await ConversationService.listMessages({
                conversationId: convo._id,
                page,
                limit,
            })
            await ConversationService.markRead({ conversationId: convo._id, side: 'staff' })
            return BaseService.sendSuccessResponse({
                message: {
                    conversation: {
                        _id: convo._id,
                        mode: convo.mode,
                        open: convo.open,
                        customer: convo.userId?.fullName || 'Customer',
                        phoneNumber: convo.userId?.phoneNumber || null,
                        unreadForStaff: 0,
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

    // staff posts a reply into a support conversation
    async staffReply(req) {
        try {
            // A reply needs text or at least one attachment (photo URL).
            const text =
                typeof req.body.text === 'string' ? req.body.text.trim() : ''
            const attachments = normalizeAttachments(req.body.attachments)
            if (!text && !attachments.length) {
                return BaseService.sendFailedResponse({
                    error: 'A reply needs text or an attachment',
                })
            }

            const convo = await ConversationModel.findById(req.params.conversationId)
            if (!convo || convo.type !== CONVERSATION_TYPE.SUPPORT) {
                return BaseService.sendFailedResponse({ error: 'Support conversation not found' })
            }
            // First staff engagement → tell the customer a human has joined.
            const joinNotice = await ConversationService.markAgentJoined(convo._id)
            if (joinNotice) emitChatMessage(convo, joinNotice)
            const message = await ConversationService.postMessage({
                conversationId: convo._id,
                senderType: CHAT_SENDER.STAFF,
                senderId: req.user.id,
                text,
                attachments,
            })
            await ConversationService.markRead({ conversationId: convo._id, side: 'staff' })
            emitChatMessage(convo, message)
            return BaseService.sendSuccessResponse({
                message: {
                    _id: message._id,
                    text: message.text,
                    attachments: message.attachments,
                    createdAt: message.createdAt,
                },
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
