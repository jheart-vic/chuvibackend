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
    ROUTE_RECOVERY_CASE_CLOSE,
    ROUTE_RECOVERY_CASE_RECOVERY_ORDER,
    ROUTE_RECOVERY_CASE_DASHBOARD,
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
 *     summary: Request a compensation — wallet credit or cash (CX)
 *     description: >
 *       §7: each call adds a separate compensation (amount, reason, evidence).
 *       `type: cash` requires the customer's bank details and always needs
 *       Admin/Founder approval. Appends to the case's `compensations[]`.
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
 *               type: { type: string, enum: [wallet-credit, cash], default: wallet-credit }
 *               amount: { type: integer, example: 5000 }
 *               reason: { type: string, example: "Colour ran onto two shirts" }
 *               evidence: { type: array, items: { type: string }, description: Supporting evidence URLs, example: ["https://cdn.chuvi.com/complaints/photo1.jpg"] }
 *               bankDetails:
 *                 type: object
 *                 description: Required when type=cash (manual transfer target).
 *                 properties:
 *                   accountName: { type: string, example: "John Doe" }
 *                   accountNumber: { type: string, example: "0123456789" }
 *                   bankName: { type: string, example: "GTBank" }
 *     responses:
 *       200:
 *         description: Compensation requested (pending approval)
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
 *     summary: Approve a compensation (CX ≤ ₦10,000, else admin)
 *     description: >
 *       §7 gate: CX may approve wallet credit up to the threshold (₦10,000);
 *       anything above, any CASH compensation, or an amount that takes the
 *       CUMULATIVE approved total on the case above the threshold requires an
 *       admin (Operations Manager/Founder). Requires `confirmed: true` (the
 *       confirmation screen). Wallet-credit approvals grant the credit (visible
 *       wallet transaction) and fire the Recovery Offer trigger; cash approvals
 *       are recorded for manual transfer (no wallet movement).
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [confirmed]
 *             properties:
 *               compensationId: { type: string, description: Which compensation to approve (defaults to the single pending one) }
 *               confirmed: { type: boolean, description: Must be true — reflects the confirmation screen, example: true }
 *     responses:
 *       200:
 *         description: Approved (credit granted, or cash recorded for transfer)
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
 *     summary: Reject a pending compensation (CX)
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               compensationId: { type: string, description: Which compensation to reject (defaults to the single pending one) }
 *               reason: { type: string, example: "Duplicate request" }
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
 * /recovery/cases/{id}/close:
 *   post:
 *     summary: Close a resolved complaint the customer didn't confirm (CX)
 *     description: >
 *       §5: when a case has been `resolved` and the customer has not confirmed
 *       within the confirmation window (48h default), Customer Experience may
 *       close it. Sets status `closed` (confirmed=false), removes recovery tags,
 *       and restores referral eligibility. Rejected while the window is still open.
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { reason: { type: string, example: "No customer response after 48h" } } }
 *     responses:
 *       200:
 *         description: Complaint closed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { $ref: '#/components/schemas/ComplaintCase' }
 *       400:
 *         description: Not resolved, or confirmation window still open
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_RECOVERY_CASE_CLOSE, [customerExperienceAuth], (req, res) =>
    new FeedbackController().closeCase(req, res),
)

/**
 * @swagger
 * /recovery/cases/{id}/recovery-order:
 *   post:
 *     summary: Create a free recovery order — rewash/rework/repair/replace (CX)
 *     description: >
 *       §6: CX creates a FREE recovery order linked to the complaint, the original
 *       order and the affected items. It enters Intake & Tag (stage `queue`) and
 *       then follows the normal pipeline (rider → processing → QC → delivery). CX
 *       cannot change its operational stages; on delivery the complaint
 *       auto-advances to `resolved` (awaiting customer confirmation). Recovery
 *       orders are free (₦0) and excluded from CRM/offer/referral accounting.
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
 *               action: { type: string, enum: [rewash, rework, repair, replace], example: rewash }
 *               note: { type: string, example: "Re-wash the two shirts that still had stains" }
 *               items:
 *                 type: array
 *                 description: Items to redo. Omit to use the complaint's affected items (or the original order's items).
 *                 items:
 *                   type: object
 *                   properties:
 *                     type: { type: string, example: shirt }
 *                     quantity: { type: integer, example: 2 }
 *     responses:
 *       200:
 *         description: Recovery order created and sent to Intake & Tag
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     complaint: { $ref: '#/components/schemas/ComplaintCase' }
 *                     order: { $ref: '#/components/schemas/BookOrderSummary' }
 *       400:
 *         description: Invalid action, or original order/items missing
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post(ROUTE_RECOVERY_CASE_RECOVERY_ORDER, [customerExperienceAuth], (req, res) =>
    new FeedbackController().createRecoveryOrder(req, res),
)

/**
 * @swagger
 * /recovery/cases/{id}/dashboard:
 *   get:
 *     summary: Full complaint dashboard (CX/Admin)
 *     description: >
 *       §6: everything about one case in a single payload — evidence (photos +
 *       affected items), the complaint chat, escalation, recovery orders with
 *       their live stages, compensations/approvals, and computed SLA-breach flags.
 *     tags: [Recovery (Staff)]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200:
 *         description: The case dashboard bundle
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     complaint: { $ref: '#/components/schemas/ComplaintCase' }
 *                     evidence:
 *                       type: object
 *                       properties:
 *                         photos: { type: array, items: { type: string } }
 *                         affectedItems: { type: array, items: { type: string } }
 *                     compensations: { type: array, items: { $ref: '#/components/schemas/RecoveryCompensation' } }
 *                     recoveryActions: { type: array, items: { $ref: '#/components/schemas/RecoveryAction' } }
 *                     recoveryOrders: { type: array, items: { $ref: '#/components/schemas/BookOrderSummary' } }
 *                     escalation:
 *                       type: object
 *                       properties:
 *                         escalated: { type: boolean, example: false }
 *                         reason: { type: string, nullable: true }
 *                         escalatedAt: { type: string, format: date-time, nullable: true }
 *                     slaBreaches:
 *                       type: object
 *                       properties:
 *                         reviewOverdue: { type: boolean, example: false }
 *                         resolutionOverdue: { type: boolean, example: false }
 *                         escalated: { type: boolean, example: false }
 *                     messages: { type: array, items: { $ref: '#/components/schemas/ChatMessage' } }
 *       400:
 *         description: Complaint not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_RECOVERY_CASE_DASHBOARD, [customerExperienceAuth], (req, res) =>
    new FeedbackController().caseDashboard(req, res),
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
