const router = require('express').Router()
const BotController = require('../controllers/bot.controller')
const auth = require('../middlewares/auth')
const customerExperienceAuth = require('../middlewares/customerExperienceAuth')
const adminAuth = require('../middlewares/adminAuth')
const {
    ROUTE_BOT_MESSAGE,
    ROUTE_BOT_CONVERSATION,
    ROUTE_BOT_CONVERSATIONS,
    ROUTE_BOT_CUSTOMER_REPLY,
    ROUTE_BOT_HANDOFF,
    ROUTE_BOT_QUEUE,
    ROUTE_BOT_STAFF_CONVERSATION,
    ROUTE_BOT_STAFF_REPLY,
    ROUTE_BOT_CLOSE,
    ROUTE_BOT_ESCALATE,
    ROUTE_BOT_ADMIN_JOIN,
    ROUTE_BOT_ADMIN_CONVERSATIONS,
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
 *       description: Provide `text`, `attachments`, or both (at least one is required).
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text: { type: string, example: "Where are my clothes?" }
 *               attachments:
 *                 type: array
 *                 description: >
 *                   Photo URLs — upload each file via POST /api/utils/image-upload-single
 *                   first, then send the returned imageUrl string(s) here.
 *                 items: { type: string, example: "https://res.cloudinary.com/.../photo.jpg" }
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
 *     description: >
 *       Omit `conversationId` to get (or create) the live bot thread. Pass a
 *       `conversationId` from GET /bot/conversations to open a specific thread —
 *       e.g. the handed-off human one. Only the caller's own support threads are
 *       accessible.
 *     tags: [Bot]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: conversationId
 *         required: false
 *         schema: { type: string }
 *         description: A support thread id owned by the caller. Omit for the bot thread.
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
 * /bot/conversations:
 *   get:
 *     summary: My open support threads (Assistant + Support agent)
 *     description: >
 *       Lists the customer's open support conversations so the app can show them
 *       as separate threads/tickets. There is at most one bot thread
 *       (mode `bot`, the self-service assistant) plus any handed-off threads
 *       (mode `human`) a live agent is handling. Newest activity first. Load a
 *       thread's messages via GET /bot/conversation (bot) or, for staff, the
 *       staff message endpoint.
 *     tags: [Bot]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The customer's open support threads
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
 *                       mode: { type: string, enum: [bot, human], example: human }
 *                       open: { type: boolean, example: true }
 *                       unreadForCustomer: { type: integer, example: 1 }
 *                       lastMessageAt: { type: string, format: date-time, nullable: true }
 */
router.get(ROUTE_BOT_CONVERSATIONS, [auth], (req, res) =>
    new BotController().listConversations(req, res),
)

/**
 * @swagger
 * /bot/conversation/{conversationId}/message:
 *   post:
 *     summary: Send a message into a specific thread (customer)
 *     description: >
 *       Posts the customer's message into one of their own support threads by id.
 *       Use this to reply into a handed-off (human) thread — the bot stays silent
 *       and staff will respond (`handledBy: human`, empty replies beyond the echo).
 *       If the target thread is still a bot thread, the message is routed to the
 *       assistant exactly like POST /bot/message (`handledBy: bot`, replies filled).
 *       Closed threads are rejected.
 *     tags: [Bot]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *         description: A support thread id owned by the caller.
 *     requestBody:
 *       required: true
 *       description: Provide `text`, `attachments`, or both (at least one is required).
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text: { type: string, example: "Yes, tomorrow morning works." }
 *               attachments:
 *                 type: array
 *                 description: >
 *                   Photo URLs — upload each file via POST /api/utils/image-upload-single
 *                   first, then send the returned imageUrl string(s) here.
 *                 items: { type: string, example: "https://res.cloudinary.com/.../photo.jpg" }
 *     responses:
 *       200:
 *         description: Message posted (human thread) or the assistant's reply (bot thread)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/BotReply' }
 *       400:
 *         description: Missing text / conversation not found / conversation closed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_BOT_CUSTOMER_REPLY, [auth], (req, res) =>
    new BotController().replyToConversation(req, res),
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
 *                       lastMessage:
 *                         type: object
 *                         nullable: true
 *                         description: Preview of the most recent message (null if the thread has none). Text is truncated to ~140 chars.
 *                         properties:
 *                           senderType: { type: string, enum: [customer, staff, bot, system], example: customer }
 *                           text: { type: string, example: "Hi, my order still hasn't arrived — can someone check?" }
 *                           attachments: { type: array, items: { type: string }, example: [] }
 *                           createdAt: { type: string, format: date-time }
 */
router.get(ROUTE_BOT_QUEUE, [customerExperienceAuth], (req, res) =>
    new BotController().queue(req, res),
)

/**
 * @swagger
 * /bot/{conversationId}/messages:
 *   get:
 *     summary: Read a support conversation's full message history (CX/admin)
 *     description: >
 *       Loads a specific support conversation by id with its paginated messages,
 *       so staff can read what the customer said before replying. Marks the staff
 *       side read.
 *     tags: [Bot]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
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
 *                     conversation:
 *                       type: object
 *                       properties:
 *                         _id: { type: string, example: 665f1c2ab9e77a0012d4e900 }
 *                         mode: { type: string, example: human }
 *                         open: { type: boolean, example: true }
 *                         customer: { type: string, example: Ada Obi }
 *                         phoneNumber: { type: string, example: "+2348012345678" }
 *                         unreadForStaff: { type: integer, example: 0 }
 *                         lastMessageAt: { type: string, format: date-time }
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
 *       400:
 *         description: Support conversation not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_BOT_STAFF_CONVERSATION, [customerExperienceAuth], (req, res) =>
    new BotController().staffGetConversation(req, res),
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
 *       description: Provide `text`, `attachments`, or both (at least one is required).
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text: { type: string, example: "Hi! I've checked your order and it's out for delivery." }
 *               attachments:
 *                 type: array
 *                 description: >
 *                   Photo URLs — upload each file via POST /api/utils/image-upload-single
 *                   first, then send the returned imageUrl string(s) here.
 *                 items: { type: string, example: "https://res.cloudinary.com/.../photo.jpg" }
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
 *     description: >
 *       Marks the support chat closed (records closedAt/closedBy and an optional
 *       reason), posts a one-time "chat closed" system message to the customer,
 *       and emits it live plus a `conversation:closed` socket event (rooms
 *       `user:<id>` and `staff:support`; payload `{ conversationId, closedAt,
 *       source }` where source is `staff`). The chat then drops out of the staff
 *       queue and the customer's open-threads list; history is retained. The
 *       customer's next message starts a fresh assistant (bot) conversation.
 *       Idempotent — closing an already-closed chat is a no-op
 *       (`alreadyClosed: true`, no new message/event).
 *     tags: [Bot]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, example: "Resolved — order located and re-delivered" }
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
 *                     alreadyClosed: { type: boolean, example: false }
 *                     conversationId: { type: string, example: 665f1c2ab9e77a0012d4e900 }
 *                     closedAt: { type: string, format: date-time }
 *       400:
 *         description: Support conversation not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_BOT_CLOSE, [customerExperienceAuth], (req, res) =>
    new BotController().closeConversation(req, res),
)

/**
 * @swagger
 * /bot/{conversationId}/escalate:
 *   post:
 *     summary: (CX) Escalate a conversation to Admin
 *     description: >
 *       Customer Experience flags a conversation for Admin with a reason and
 *       urgency. Records it on the conversation, signals staff/admin UIs live
 *       (socket `conversation:escalated`), and notifies admins. Does NOT post a
 *       customer-facing message — escalation is internal. Customers can never
 *       trigger this.
 *     tags: [Bot]
 *     security:
 *       - bearerAuth: []
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string, example: "Customer requesting a refund above my approval limit" }
 *               urgency: { type: string, enum: [low, normal, high, urgent], default: normal, example: high }
 *     responses:
 *       200:
 *         description: Escalation recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     escalated: { type: boolean, example: true }
 *                     conversationId: { type: string }
 *                     urgency: { type: string, example: high }
 *                     reason: { type: string }
 *                     escalatedAt: { type: string, format: date-time }
 *       400:
 *         description: Missing reason or conversation not found/closed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_BOT_ESCALATE, [customerExperienceAuth], (req, res) =>
    new BotController().escalateToAdmin(req, res),
)

/**
 * @swagger
 * /bot/{conversationId}/admin-join:
 *   post:
 *     summary: (Admin) Enter a conversation and take ownership
 *     description: >
 *       An Admin may enter ANY conversation without waiting for an escalation.
 *       On entry the Admin becomes the owner (`assignedRole: admin`). Idempotent;
 *       if the thread had not yet been engaged by a human it also posts the
 *       one-time "you're now connected" notice to the customer.
 *     tags: [Bot]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Admin now owns the conversation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     conversationId: { type: string }
 *                     assignedRole: { type: string, example: admin }
 *                     assignedTo: { type: string }
 *                     adminJoinedAt: { type: string, format: date-time }
 *                     alreadyOwnedByAdmin: { type: boolean, example: false }
 *       400:
 *         description: Conversation not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_BOT_ADMIN_JOIN, [adminAuth], (req, res) =>
    new BotController().adminTakeOwnership(req, res),
)

/**
 * @swagger
 * /bot/admin/conversations:
 *   get:
 *     summary: (Admin) View every Customer Experience conversation
 *     description: >
 *       Admin oversight of all support conversations (every customer, open and
 *       closed). Escalated conversations float to the top. Filterable.
 *     tags: [Bot]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: open
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: Only open or only closed
 *       - in: query
 *         name: escalated
 *         schema: { type: string, enum: ['true'] }
 *         description: Only escalated conversations
 *       - in: query
 *         name: urgency
 *         schema: { type: string, enum: [low, normal, high, urgent] }
 *       - in: query
 *         name: mode
 *         schema: { type: string, enum: [bot, human] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated conversations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         allOf:
 *                           - $ref: '#/components/schemas/Conversation'
 *                           - type: object
 *                             properties:
 *                               customer:
 *                                 type: string
 *                                 description: Customer full name (flat, same as /queue). Falls back to "Customer".
 *                                 example: Ada Obi
 *                               phoneNumber:
 *                                 type: string
 *                                 nullable: true
 *                                 example: "+2348012345678"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 12 }
 *                         page: { type: integer, example: 1 }
 *                         limit: { type: integer, example: 20 }
 *                         pages: { type: integer, example: 1 }
 */
router.get(ROUTE_BOT_ADMIN_CONVERSATIONS, [adminAuth], (req, res) =>
    new BotController().adminListConversations(req, res),
)

module.exports = router
