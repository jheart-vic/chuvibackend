const router = require('express').Router()
const BotController = require('../controllers/bot.controller')
const auth = require('../middlewares/auth')
const customerExperienceAuth = require('../middlewares/customerExperienceAuth')
const {
    ROUTE_BOT_MESSAGE,
    ROUTE_BOT_CONVERSATION,
    ROUTE_BOT_HANDOFF,
    ROUTE_BOT_QUEUE,
    ROUTE_BOT_STAFF_REPLY,
    ROUTE_BOT_CLOSE,
} = require('../util/page-route')

/**
 * @swagger
 * tags:
 *   - name: Bot
 *     description: In-app assistant (LLM classifies intent, workflows follow existing rules) + human handoff
 */

/**
 * @swagger
 * /bot/message:
 *   post:
 *     summary: Send a message to the in-app assistant
 *     description: >
 *       The assistant classifies the message intent (via Claude, with a rules
 *       fallback) and runs the matching low-risk workflow against the existing
 *       systems (order status, wallet, offers, referral, apply-code,
 *       update-details, guided booking). High-risk requests are handed to a
 *       human — the bot never approves compensation, edits credits, or changes
 *       records. Once handed off, the bot stays silent and staff reply.
 *     tags: [Bot]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text: { type: string, example: "Where are my clothes?" }
 *     responses:
 *       200:
 *         description: The assistant's reply (or a handoff notice)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/BotReply' }
 *       400:
 *         description: Missing text
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_BOT_MESSAGE, [auth], (req, res) =>
    new BotController().sendMessage(req, res),
)

/**
 * @swagger
 * /bot/conversation:
 *   get:
 *     summary: My support conversation + message history
 *     tags: [Bot]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 50 }
 *     responses:
 *       200:
 *         description: Conversation and paginated messages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     conversation: { $ref: '#/components/schemas/Conversation' }
 *                     data:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ChatMessage' }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 12 }
 *                         page: { type: integer, example: 1 }
 *                         limit: { type: integer, example: 50 }
 *                         pages: { type: integer, example: 1 }
 */
router.get(ROUTE_BOT_CONVERSATION, [auth], (req, res) =>
    new BotController().getConversation(req, res),
)

/**
 * @swagger
 * /bot/handoff:
 *   post:
 *     summary: Ask to speak with a human
 *     tags: [Bot]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Conversation switched to human mode
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     conversationId: { type: string, example: 665f1c2ab9e77a0012d4e900 }
 *                     mode: { type: string, example: human }
 */
router.post(ROUTE_BOT_HANDOFF, [auth], (req, res) =>
    new BotController().requestHandoff(req, res),
)

/**
 * @swagger
 * /bot/queue:
 *   get:
 *     summary: Support queue — handed-off chats waiting on staff (CX/admin)
 *     tags: [Bot]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Open support conversations in human mode
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string, example: 665f1c2ab9e77a0012d4e900 }
 *                       customer: { type: string, example: Ada Obi }
 *                       phoneNumber: { type: string, example: "+2348012345678" }
 *                       unreadForStaff: { type: integer, example: 2 }
 *                       lastMessageAt: { type: string, format: date-time }
 */
router.get(ROUTE_BOT_QUEUE, [customerExperienceAuth], (req, res) =>
    new BotController().queue(req, res),
)

/**
 * @swagger
 * /bot/{conversationId}/reply:
 *   post:
 *     summary: Staff reply into a support conversation (CX/admin)
 *     tags: [Bot]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text: { type: string, example: "Hi! I've checked your order and it's out for delivery." }
 *     responses:
 *       200:
 *         description: Reply posted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ChatMessage' }
 *       400:
 *         description: Conversation not found / missing text
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_BOT_STAFF_REPLY, [customerExperienceAuth], (req, res) =>
    new BotController().staffReply(req, res),
)

/**
 * @swagger
 * /bot/{conversationId}/close:
 *   post:
 *     summary: Close a resolved support conversation (CX/admin)
 *     tags: [Bot]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Conversation closed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     closed: { type: boolean, example: true }
 */
router.post(ROUTE_BOT_CLOSE, [customerExperienceAuth], (req, res) =>
    new BotController().closeConversation(req, res),
)

module.exports = router
