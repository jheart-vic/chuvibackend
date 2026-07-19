const router = require('express').Router()
const FeedbackController = require('../controllers/feedback.controller')
const customerExperienceAuth = require('../middlewares/customerExperienceAuth')
const adminAuth = require('../middlewares/adminAuth')
const {
    ROUTE_RECOVERY_FEEDBACK_LIST,
    ROUTE_RECOVERY_COMPLAINT_TYPES,
    ROUTE_RECOVERY_COMPLAINT_TYPE_BY_ID,
    ROUTE_RECOVERY_CASES,
    ROUTE_RECOVERY_CASE,
    ROUTE_RECOVERY_CASE_ASSIGN,
    ROUTE_RECOVERY_CASE_TRANSITION,
    ROUTE_RECOVERY_CASE_ACTIONS,
    ROUTE_RECOVERY_CASE_ACTION_COMPLETE,
    ROUTE_RECOVERY_CASE_CREDIT_REQUEST,
    ROUTE_RECOVERY_CASE_CREDIT_APPROVE,
    ROUTE_RECOVERY_CASE_CREDIT_REJECT,
    ROUTE_RECOVERY_CASE_ESCALATE,
    ROUTE_RECOVERY_CASE_MESSAGES,
} = require('../util/page-route')

/**
 * @swagger
 * tags:
 *   - name: Recovery (Staff)
 *     description: Customer Experience complaint management, recovery actions, compensation approval, and complaint-type admin
 */

// ── admin: complaint types ──
/**
 * @swagger
 * /recovery/complaint-types:
 *   get:
 *     summary: List all complaint types (staff)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: active
 *         schema: { type: string, enum: ['true','false'] }
 *     responses:
 *       200:
 *         description: Complaint types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/ComplaintType' }
 *   post:
 *     summary: Create a complaint type (admin)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Stain Remains" }
 *               description: { type: string }
 *               active: { type: boolean, default: true }
 *     responses:
 *       200:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintType' }
 *       400:
 *         description: Duplicate/validation
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_RECOVERY_COMPLAINT_TYPES, [customerExperienceAuth], (req, res) =>
    new FeedbackController().listComplaintTypes(req, res),
)
router.post(ROUTE_RECOVERY_COMPLAINT_TYPES, [adminAuth], (req, res) =>
    new FeedbackController().createComplaintType(req, res),
)
/**
 * @swagger
 * /recovery/complaint-types/{id}:
 *   put:
 *     summary: Update or disable a complaint type (admin)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               active: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintType' }
 */
router.put(ROUTE_RECOVERY_COMPLAINT_TYPE_BY_ID, [adminAuth], (req, res) =>
    new FeedbackController().updateComplaintType(req, res),
)

// ── staff: feedback ledger ──
/**
 * @swagger
 * /recovery/feedback:
 *   get:
 *     summary: Browse feedback records (staff)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [satisfied, neutral, complaint] }
 *       - in: query
 *         name: rating
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated feedback
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
 *                       items: { $ref: '#/components/schemas/Feedback' }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 48 }
 *                         page: { type: integer, example: 1 }
 *                         limit: { type: integer, example: 20 }
 *                         pages: { type: integer, example: 3 }
 */
router.get(ROUTE_RECOVERY_FEEDBACK_LIST, [customerExperienceAuth], (req, res) =>
    new FeedbackController().listFeedback(req, res),
)

// ── CX: complaint queue + case management ──
/**
 * @swagger
 * /recovery/cases:
 *   get:
 *     summary: Complaint queue (CX)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: escalated
 *         schema: { type: string, enum: ['true'] }
 *     responses:
 *       200:
 *         description: Paginated complaint cases
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
 *                       items: { $ref: '#/components/schemas/ComplaintCase' }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 12 }
 *                         page: { type: integer, example: 1 }
 *                         limit: { type: integer, example: 20 }
 *                         pages: { type: integer, example: 1 }
 */
router.get(ROUTE_RECOVERY_CASES, [customerExperienceAuth], (req, res) =>
    new FeedbackController().listCases(req, res),
)
/**
 * @swagger
 * /recovery/cases/{id}:
 *   get:
 *     summary: Get a complaint case (CX)
 *     tags: [Recovery (Staff)]
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
 */
router.get(ROUTE_RECOVERY_CASE, [customerExperienceAuth], (req, res) =>
    new FeedbackController().getCase(req, res),
)
/**
 * @swagger
 * /recovery/cases/{id}/assign:
 *   post:
 *     summary: Assign a case (defaults to self) (CX)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { assignedTo: { type: string } } }
 *     responses:
 *       200:
 *         description: Assigned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 */
router.post(ROUTE_RECOVERY_CASE_ASSIGN, [customerExperienceAuth], (req, res) =>
    new FeedbackController().assignCase(req, res),
)
/**
 * @swagger
 * /recovery/cases/{id}/transition:
 *   post:
 *     summary: Move a case to the next status (CX)
 *     description: "Guarded state machine: submitted→under-review→awaiting-item→item-received→recovery-in-progress→ready→resolved→customer-confirmed."
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, example: under-review }
 *               note: { type: string }
 *     responses:
 *       200:
 *         description: Transitioned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 *       400:
 *         description: Illegal transition
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_RECOVERY_CASE_TRANSITION, [customerExperienceAuth], (req, res) =>
    new FeedbackController().transition(req, res),
)
/**
 * @swagger
 * /recovery/cases/{id}/actions:
 *   post:
 *     summary: Add a recovery action (CX)
 *     description: "rewash/rework/repair/replace/compensate. replace and compensate auto-escalate to a manager."
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [rewash, rework, repair, replace, compensate] }
 *               note: { type: string }
 *     responses:
 *       200:
 *         description: Action added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 */
router.post(ROUTE_RECOVERY_CASE_ACTIONS, [customerExperienceAuth], (req, res) =>
    new FeedbackController().addAction(req, res),
)
/**
 * @swagger
 * /recovery/cases/{id}/actions/{index}/complete:
 *   post:
 *     summary: Mark a recovery action complete (CX)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: index, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Marked complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 */
router.post(ROUTE_RECOVERY_CASE_ACTION_COMPLETE, [customerExperienceAuth], (req, res) =>
    new FeedbackController().completeAction(req, res),
)
/**
 * @swagger
 * /recovery/cases/{id}/credit/request:
 *   post:
 *     summary: Request recovery compensation credit (CX)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, reason]
 *             properties:
 *               amount: { type: integer, example: 5000 }
 *               reason: { type: string, example: "Colour ran onto two shirts; supporting photos attached" }
 *     responses:
 *       200:
 *         description: Credit requested (pending approval)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 */
router.post(ROUTE_RECOVERY_CASE_CREDIT_REQUEST, [customerExperienceAuth], (req, res) =>
    new FeedbackController().requestCredit(req, res),
)
/**
 * @swagger
 * /recovery/cases/{id}/credit/approve:
 *   post:
 *     summary: Approve pending recovery credit (CX ≤ ₦10,000, else admin)
 *     description: "Amounts above the configured threshold (₦10,000) require an admin (Operations Manager/Founder). On approval the wallet recovery credit is granted and the Recovery Offer trigger fires."
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200:
 *         description: Approved and credited (the granted credit is referenced by recoveryCredit.walletCreditId)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 *       400:
 *         description: Above threshold without admin approval, or nothing pending
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_RECOVERY_CASE_CREDIT_APPROVE, [customerExperienceAuth], (req, res) =>
    new FeedbackController().approveCredit(req, res),
)
/**
 * @swagger
 * /recovery/cases/{id}/credit/reject:
 *   post:
 *     summary: Reject pending recovery credit (CX)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200:
 *         description: Rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 */
router.post(ROUTE_RECOVERY_CASE_CREDIT_REJECT, [customerExperienceAuth], (req, res) =>
    new FeedbackController().rejectCredit(req, res),
)
/**
 * @swagger
 * /recovery/cases/{id}/escalate:
 *   post:
 *     summary: Escalate a case to a manager (CX)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, enum: [missing-item, serious-damage, replacement-required, compensation-required, complaint-reopened, review-overdue, resolution-overdue, customer-rejected] }
 *     responses:
 *       200:
 *         description: Escalated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 */
router.post(ROUTE_RECOVERY_CASE_ESCALATE, [customerExperienceAuth], (req, res) =>
    new FeedbackController().escalate(req, res),
)
/**
 * @swagger
 * /recovery/cases/{id}/messages:
 *   get:
 *     summary: Read the complaint conversation (CX)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200:
 *         description: Messages (marks read for staff)
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
 *     summary: Reply in the complaint conversation (CX)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text: { type: string, example: "We're re-washing the two shirts and will re-deliver tomorrow." }
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
router.get(ROUTE_RECOVERY_CASE_MESSAGES, [customerExperienceAuth], (req, res) =>
    new FeedbackController().staffListMessages(req, res),
)
router.post(ROUTE_RECOVERY_CASE_MESSAGES, [customerExperienceAuth], (req, res) =>
    new FeedbackController().staffPostMessage(req, res),
)

module.exports = router
