const router = require('express').Router()
const CrmController = require('../controllers/crm.controller')
const adminAuth = require('../middlewares/adminAuth')
const intakeUserAuth = require('../middlewares/intakeUserAuth')
const {
    ROUTE_CRM_CUSTOMERS,
    ROUTE_CRM_CUSTOMER_CARD,
    ROUTE_CRM_ADD_TAG,
    ROUTE_CRM_REMOVE_TAG,
    ROUTE_CRM_CORRECT_STAGE,
    ROUTE_CRM_CREATE_WALKIN_LEAD,
    ROUTE_CRM_UPDATE_FOLLOWUP,
    ROUTE_CRM_METRICS,
    ROUTE_CRM_BROADCAST_LIST,
    ROUTE_CRM_SETTINGS,
    ROUTE_CRM_INTERNAL_LEAD,
} = require('../util/page-route')

// Shared-secret auth for the WhatsApp bot (separate repo). Same secret as
// util/notifyBot.js uses in the other direction.
const botSecretAuth = (req, res, next) => {
    const secret = process.env.CHATBOT_NOTIFY_SECRET
    if (!secret || req.headers['x-bot-secret'] !== secret) {
        return res.status(401).json({
            success: false,
            data: { error: 'Unauthorized' },
        })
    }
    next()
}

// ── Staff tier (intake-and-tag + admin) ────────────────────────────────────

/**
 * @swagger
 * /crm/customers:
 *   get:
 *     summary: List CRM customer cards
 *     description: |
 *       Paginated list of CRM profiles (leads and customers). Filterable by
 *       stage, tag and channel; searchable by name, phone or email.
 *       Accessible to intake-and-tag staff and admins.
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: stage
 *         schema: { type: string, enum: [lead, first-order, active, loyal, dormant, reactivated] }
 *       - in: query
 *         name: tag
 *         schema: { type: string, example: complaint }
 *       - in: query
 *         name: channel
 *         schema: { type: string, enum: [whatsapp, website, office] }
 *       - in: query
 *         name: search
 *         schema: { type: string, example: "0803" }
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: Paginated CRM profiles
 *       500:
 *         description: Server error
 */
router.get(ROUTE_CRM_CUSTOMERS, [intakeUserAuth], (req, res) => {
    const controller = new CrmController()
    return controller.getCustomers(req, res)
})

/**
 * @swagger
 * /crm/customers/{id}:
 *   get:
 *     summary: Get one customer card
 *     description: |
 *       Full customer card: profile (stage, tags, counters, next follow-up),
 *       recent orders, CRM message history and pending follow-ups.
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Customer card
 *       404:
 *         description: Profile not found
 */
router.get(ROUTE_CRM_CUSTOMER_CARD, [intakeUserAuth], (req, res) => {
    const controller = new CrmController()
    return controller.getCustomerCard(req, res)
})

/**
 * @swagger
 * /crm/customers/{id}/tags:
 *   post:
 *     summary: Apply a manual tag (complaint / recovery-required)
 *     description: Only manual retention tags can be applied by staff. Automatic tags are managed by the CRM engine.
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tag]
 *             properties:
 *               tag:
 *                 type: string
 *                 enum: [complaint, recovery-required]
 *     responses:
 *       200:
 *         description: Updated profile
 *       400:
 *         description: Not a manual tag
 *       404:
 *         description: Profile not found
 */
router.post(ROUTE_CRM_ADD_TAG, [intakeUserAuth], (req, res) => {
    const controller = new CrmController()
    return controller.addManualTag(req, res)
})

/**
 * @swagger
 * /crm/customers/{id}/tags/{tag}:
 *   delete:
 *     summary: Remove a manual tag (complaint / recovery-required)
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: tag
 *         required: true
 *         schema: { type: string, enum: [complaint, recovery-required] }
 *     responses:
 *       200:
 *         description: Updated profile
 *       400:
 *         description: Not a manual tag
 *       404:
 *         description: Profile not found
 */
router.delete(ROUTE_CRM_REMOVE_TAG, [intakeUserAuth], (req, res) => {
    const controller = new CrmController()
    return controller.removeManualTag(req, res)
})

/**
 * @swagger
 * /crm/customers/{id}/stage:
 *   patch:
 *     summary: Manually correct a customer's stage
 *     description: Manual correction for when the automation got it wrong. Recorded in stage history and the audit log.
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stage]
 *             properties:
 *               stage:
 *                 type: string
 *                 enum: [lead, first-order, active, loyal, dormant, reactivated]
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated profile
 *       400:
 *         description: Invalid stage
 *       404:
 *         description: Profile not found
 */
router.patch(ROUTE_CRM_CORRECT_STAGE, [intakeUserAuth], (req, res) => {
    const controller = new CrmController()
    return controller.correctStage(req, res)
})

/**
 * @swagger
 * /crm/leads:
 *   post:
 *     summary: Create a walk-in lead
 *     description: Creates a CRM profile for a walk-in customer and starts the lead nurture workflow.
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullName, phoneNumber]
 *             properties:
 *               fullName: { type: string, example: John Doe }
 *               phoneNumber: { type: string, example: "+2348151128383" }
 *               email: { type: string, example: john@example.com }
 *     responses:
 *       200:
 *         description: Created lead profile
 *       400:
 *         description: Profile already exists / missing fields
 */
router.post(ROUTE_CRM_CREATE_WALKIN_LEAD, [intakeUserAuth], (req, res) => {
    const controller = new CrmController()
    return controller.createWalkInLead(req, res)
})

/**
 * @swagger
 * /crm/followups/{id}:
 *   patch:
 *     summary: Reschedule or cancel a pending follow-up
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dueAt: { type: string, format: date-time, description: "New date (reschedule)" }
 *               cancel: { type: boolean, description: "true to cancel instead" }
 *     responses:
 *       200:
 *         description: Updated follow-up
 *       404:
 *         description: Pending follow-up not found
 */
router.patch(ROUTE_CRM_UPDATE_FOLLOWUP, [intakeUserAuth], (req, res) => {
    const controller = new CrmController()
    return controller.updateFollowUp(req, res)
})

// ── Admin tier ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /crm/metrics:
 *   get:
 *     summary: CRM success metrics (admin only)
 *     description: |
 *       Lead→customer conversion %, repeat customer %, dormant %,
 *       reactivated %, revenue per customer, and per-stage counts.
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KPI metrics
 */
router.get(ROUTE_CRM_METRICS, [adminAuth], (req, res) => {
    const controller = new CrmController()
    return controller.getMetrics(req, res)
})

/**
 * @swagger
 * /crm/broadcasts/{list}:
 *   get:
 *     summary: View a broadcast list (admin only)
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: list
 *         required: true
 *         schema: { type: string, enum: [prospect, churn] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated list members
 *       400:
 *         description: Invalid list
 */
router.get(ROUTE_CRM_BROADCAST_LIST, [adminAuth], (req, res) => {
    const controller = new CrmController()
    return controller.getBroadcastList(req, res)
})

/**
 * @swagger
 * /crm/settings:
 *   get:
 *     summary: Get CRM settings — templates & thresholds (admin only)
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CRM settings
 *   put:
 *     summary: Update CRM message templates and/or thresholds (admin only)
 *     description: |
 *       Partial update. `templates` keys must be valid CRM message types;
 *       templates support {{name}} and {{firstName}} placeholders.
 *       `thresholds` keys: dormantDays, highVolumeAvgAmount,
 *       highFrequencyPerMonth, expressUserRatio, prospectBroadcastDays,
 *       churnBroadcastDays.
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               templates:
 *                 type: object
 *                 additionalProperties: { type: string }
 *               thresholds:
 *                 type: object
 *                 additionalProperties: { type: number }
 *     responses:
 *       200:
 *         description: Updated settings
 *       400:
 *         description: Invalid template key or threshold
 */
router.get(ROUTE_CRM_SETTINGS, [adminAuth], (req, res) => {
    const controller = new CrmController()
    return controller.getSettings(req, res)
})
router.put(ROUTE_CRM_SETTINGS, [adminAuth], (req, res) => {
    const controller = new CrmController()
    return controller.updateSettings(req, res)
})

// ── Internal (WhatsApp bot → backend) ───────────────────────────────────────

/**
 * @swagger
 * /crm/internal/lead:
 *   post:
 *     summary: Register a WhatsApp lead (bot internal, x-bot-secret header)
 *     description: |
 *       Called by the WhatsApp chatbot (separate repo) when a new contact
 *       chats in. Idempotent — an existing profile with the same phone is
 *       returned rather than duplicated.
 *     tags: [CRM]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               fullName: { type: string }
 *               phoneNumber: { type: string }
 *               email: { type: string }
 *     responses:
 *       200:
 *         description: profileId and whether it was newly created
 *       401:
 *         description: Bad or missing x-bot-secret
 */
router.post(ROUTE_CRM_INTERNAL_LEAD, [botSecretAuth], (req, res) => {
    const controller = new CrmController()
    return controller.registerBotLead(req, res)
})

module.exports = router
