const router = require('express').Router()
const FeedbackController = require('../controllers/feedback.controller')
const auth = require('../middlewares/auth')
const {
    ROUTE_FEEDBACK_SUBMIT,
    ROUTE_FEEDBACK_FOR_ORDER,
    ROUTE_FEEDBACK_COMPLAINT_TYPES,
    ROUTE_FEEDBACK_MY_COMPLAINTS,
    ROUTE_FEEDBACK_COMPLAINT,
    ROUTE_FEEDBACK_COMPLAINT_CONFIRM,
    ROUTE_FEEDBACK_COMPLAINT_REJECT,
    ROUTE_FEEDBACK_COMPLAINT_MESSAGES,
} = require('../util/page-route')

/**
 * @swagger
 * tags:
 *   - name: Feedback & Recovery
 *     description: Customer feedback, complaints, and the in-app complaint chat
 */

/**
 * @swagger
 * /feedback:
 *   post:
 *     summary: Submit feedback for a delivered order
 *     description: >
 *       One feedback per order. `satisfied` completes and marks the customer
 *       referral-eligible; `neutral` records only; `complaint` opens a
 *       complaint case (requires complaintTypeId + description) and starts the
 *       recovery workflow — tagging the customer, pausing referral eligibility,
 *       and opening an in-app complaint conversation.
 *     tags: [Feedback & Recovery]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookOrderId, type]
 *             properties:
 *               bookOrderId: { type: string }
 *               type: { type: string, enum: [satisfied, neutral, complaint] }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *               complaintTypeId: { type: string, description: "Required when type=complaint" }
 *               description: { type: string, description: "Required when type=complaint" }
 *               affectedItems: { type: array, items: { type: string } }
 *               photos: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Feedback recorded (with complaint case if applicable)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     feedback: { $ref: '#/components/schemas/Feedback' }
 *                     complaint:
 *                       allOf: [{ $ref: '#/components/schemas/ComplaintCase' }]
 *                       nullable: true
 *                       description: Present (non-null) only when type=complaint
 *                     referralEligible:
 *                       type: boolean
 *                       example: true
 *                       description: True when the customer said they were satisfied
 *       400:
 *         description: Validation error, order not delivered, or duplicate feedback
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_FEEDBACK_SUBMIT, [auth], (req, res) =>
    new FeedbackController().submitFeedback(req, res),
)

/**
 * @swagger
 * /feedback/complaint-types:
 *   get:
 *     summary: List active complaint types (for the complaint form)
 *     tags: [Feedback & Recovery]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Array of active complaint types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/ComplaintType' }
 */
router.get(ROUTE_FEEDBACK_COMPLAINT_TYPES, [auth], (req, res) => {
    req.query.active = 'true'
    return new FeedbackController().listComplaintTypes(req, res)
})

/**
 * @swagger
 * /feedback/my-complaints:
 *   get:
 *     summary: List my complaint cases
 *     tags: [Feedback & Recovery]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Array of the customer's complaint cases
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/ComplaintCase' }
 */
router.get(ROUTE_FEEDBACK_MY_COMPLAINTS, [auth], (req, res) =>
    new FeedbackController().myComplaints(req, res),
)

/**
 * @swagger
 * /feedback/complaints/{id}:
 *   get:
 *     summary: Get one of my complaint cases
 *     tags: [Feedback & Recovery]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200:
 *         description: Complaint case
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 *       400:
 *         description: Not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_FEEDBACK_COMPLAINT, [auth], (req, res) =>
    new FeedbackController().getMyComplaint(req, res),
)

/**
 * @swagger
 * /feedback/complaints/{id}/confirm:
 *   post:
 *     summary: Confirm my complaint was resolved
 *     description: Only valid when the case is in `resolved`. Closes the case, removes recovery tags, and restores referral eligibility.
 *     tags: [Feedback & Recovery]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200:
 *         description: Complaint confirmed and closed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 *       400:
 *         description: Not awaiting confirmation
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_FEEDBACK_COMPLAINT_CONFIRM, [auth], (req, res) =>
    new FeedbackController().confirmResolution(req, res),
)

/**
 * @swagger
 * /feedback/complaints/{id}/reject:
 *   post:
 *     summary: Reject the resolution (reopens the complaint)
 *     tags: [Feedback & Recovery]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { note: { type: string } } }
 *     responses:
 *       200:
 *         description: Complaint reopened and escalated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 *       400:
 *         description: Not awaiting confirmation
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_FEEDBACK_COMPLAINT_REJECT, [auth], (req, res) =>
    new FeedbackController().rejectResolution(req, res),
)

/**
 * @swagger
 * /feedback/complaints/{id}/messages:
 *   get:
 *     summary: Read the complaint conversation
 *     tags: [Feedback & Recovery]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200:
 *         description: Paginated messages (marks read for the customer)
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
 *                       items: { $ref: '#/components/schemas/ChatMessage' }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 6 }
 *                         page: { type: integer, example: 1 }
 *                         limit: { type: integer, example: 50 }
 *                         pages: { type: integer, example: 1 }
 *   post:
 *     summary: Send a message in the complaint conversation
 *     tags: [Feedback & Recovery]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text: { type: string, example: "Thanks — that works for me." }
 *               attachments: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Message posted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ChatMessage' }
 */
router.get(ROUTE_FEEDBACK_COMPLAINT_MESSAGES, [auth], (req, res) =>
    new FeedbackController().customerListMessages(req, res),
)
router.post(ROUTE_FEEDBACK_COMPLAINT_MESSAGES, [auth], (req, res) =>
    new FeedbackController().customerPostMessage(req, res),
)

/**
 * @swagger
 * /feedback/order/{orderId}:
 *   get:
 *     summary: Get my feedback for a specific order
 *     tags: [Feedback & Recovery]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: orderId, required: true, schema: { type: string } }]
 *     responses:
 *       200:
 *         description: Feedback record or null
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   allOf: [{ $ref: '#/components/schemas/Feedback' }]
 *                   nullable: true
 *                   description: Null when the customer hasn't left feedback for this order yet
 */
router.get(ROUTE_FEEDBACK_FOR_ORDER, [auth], (req, res) =>
    new FeedbackController().getFeedbackForOrder(req, res),
)

module.exports = router
