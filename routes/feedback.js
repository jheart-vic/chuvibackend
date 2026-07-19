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
 *       200: { description: Feedback recorded (with complaint case if applicable) }
 *       400: { description: Validation error, order not delivered, or duplicate feedback }
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
 *       200: { description: Array of active complaint types }
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
 *       200: { description: Array of the customer's complaint cases }
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
 *       200: { description: Complaint case }
 *       400: { description: Not found }
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
 *       200: { description: Complaint confirmed and closed }
 *       400: { description: Not awaiting confirmation }
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
 *       200: { description: Complaint reopened and escalated }
 *       400: { description: Not awaiting confirmation }
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
 *       200: { description: Paginated messages (marks read for the customer) }
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
 *               text: { type: string }
 *               attachments: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Message posted }
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
 *       200: { description: Feedback record or null }
 */
router.get(ROUTE_FEEDBACK_FOR_ORDER, [auth], (req, res) =>
    new FeedbackController().getFeedbackForOrder(req, res),
)

module.exports = router
