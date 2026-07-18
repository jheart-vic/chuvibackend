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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         data:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/CrmProfile'
 *                         pagination:
 *                           type: object
 *                           properties:
 *                             total: { type: integer, example: 143 }
 *                             page: { type: integer, example: 1 }
 *                             limit: { type: integer, example: 20 }
 *                             pages: { type: integer, example: 8 }
 *             example:
 *               success: true
 *               data:
 *                 message:
 *                   data:
 *                     - _id: 665f1c2ab9e77a0012d4e9f1
 *                       userId: 64d3c9c0f1b2a8e9d0f12345
 *                       fullName: John Doe
 *                       phoneNumber: "+2348151128383"
 *                       email: john@example.com
 *                       stage: active
 *                       tags: [website, repeat-customer, standard-user, low-volume, high-frequency]
 *                       channel: website
 *                       totalOrders: 3
 *                       totalSpent: 42500
 *                       lastOrderAt: 2026-07-01T09:12:00.000Z
 *                       nextFollowUpAt: 2026-07-15T09:12:00.000Z
 *                   pagination: { total: 143, page: 1, limit: 20, pages: 8 }
 *       401:
 *         description: Missing/invalid token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *       403:
 *         description: Role not allowed (intake-and-tag or admin only)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: Failed to fetch CRM customers }
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
 *       recent orders (max 20), CRM message history (max 50) and pending
 *       follow-ups. The `_id` of each pending follow-up is what you pass to
 *       `PATCH /crm/followups/{id}`.
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: 665f1c2ab9e77a0012d4e9f1 }
 *     responses:
 *       200:
 *         description: Customer card
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         profile:
 *                           $ref: '#/components/schemas/CrmProfile'
 *                         orders:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               oscNumber: { type: string, example: OSC-2026-00123 }
 *                               amount: { type: number, example: 14500 }
 *                               serviceType: { type: string, example: wash-and-iron }
 *                               serviceTier: { type: string, example: classic }
 *                               deliverySpeed: { type: string, example: standard }
 *                               channel: { type: string, example: website }
 *                               stage:
 *                                 type: object
 *                                 properties:
 *                                   status: { type: string, example: delivered }
 *                               paymentStatus: { type: string, example: success }
 *                               createdAt: { type: string, format: date-time }
 *                         messages:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/CrmMessageLog'
 *                         pendingFollowUps:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/CrmFollowUp'
 *             example:
 *               success: true
 *               data:
 *                 message:
 *                   profile:
 *                     _id: 665f1c2ab9e77a0012d4e9f1
 *                     fullName: John Doe
 *                     phoneNumber: "+2348151128383"
 *                     stage: active
 *                     tags: [website, repeat-customer]
 *                     totalOrders: 3
 *                     nextFollowUpAt: 2026-07-28T10:15:00.000Z
 *                   orders:
 *                     - oscNumber: OSC-2026-00123
 *                       amount: 14500
 *                       serviceType: wash-and-iron
 *                       stage: { status: delivered }
 *                       createdAt: 2026-07-01T09:12:00.000Z
 *                   messages:
 *                     - messageType: feedback-request
 *                       workflow: post-delivery
 *                       channel: whatsapp
 *                       content: Hi John, how did we do on your last order?
 *                       success: true
 *                       createdAt: 2026-07-02T09:15:00.000Z
 *                   pendingFollowUps:
 *                     - _id: 665f1c2ab9e77a0012d4e9f3
 *                       workflow: post-delivery
 *                       messageType: reorder-prompt
 *                       dueAt: 2026-07-28T10:15:00.000Z
 *                       status: pending
 *       404:
 *         description: Profile not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: Customer profile not found }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
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
 *         schema: { type: string, example: 665f1c2ab9e77a0012d4e9f1 }
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
 *           example:
 *             tag: complaint
 *     responses:
 *       200:
 *         description: Updated profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       $ref: '#/components/schemas/CrmProfile'
 *             example:
 *               success: true
 *               data:
 *                 message:
 *                   _id: 665f1c2ab9e77a0012d4e9f1
 *                   fullName: John Doe
 *                   stage: active
 *                   tags: [website, repeat-customer, complaint]
 *       400:
 *         description: Not a manual tag
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: "Only manual tags can be applied by staff: complaint, recovery-required" }
 *       404:
 *         description: Profile not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
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
 *         schema: { type: string, example: 665f1c2ab9e77a0012d4e9f1 }
 *       - in: path
 *         name: tag
 *         required: true
 *         schema: { type: string, enum: [complaint, recovery-required] }
 *     responses:
 *       200:
 *         description: Updated profile (tag removed)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       $ref: '#/components/schemas/CrmProfile'
 *             example:
 *               success: true
 *               data:
 *                 message:
 *                   _id: 665f1c2ab9e77a0012d4e9f1
 *                   fullName: John Doe
 *                   tags: [website, repeat-customer]
 *       400:
 *         description: Not a manual tag
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: "Only manual tags can be removed by staff: complaint, recovery-required" }
 *       404:
 *         description: Profile not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
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
 *     description: Manual correction for when the automation got it wrong. Recorded in stage history (with the staff user id) and the audit log.
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: 665f1c2ab9e77a0012d4e9f1 }
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
 *           example:
 *             stage: active
 *             note: Customer confirmed on phone they are still ordering
 *     responses:
 *       200:
 *         description: Updated profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       $ref: '#/components/schemas/CrmProfile'
 *             example:
 *               success: true
 *               data:
 *                 message:
 *                   _id: 665f1c2ab9e77a0012d4e9f1
 *                   fullName: John Doe
 *                   stage: active
 *                   stageHistory:
 *                     - from: dormant
 *                       to: active
 *                       note: Customer confirmed on phone they are still ordering
 *                       changedBy: 64d3c9c0f1b2a8e9d0f99999
 *                       changedAt: 2026-07-14T11:00:00.000Z
 *       400:
 *         description: Invalid stage
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: "Invalid stage. Valid stages: lead, first-order, active, loyal, dormant, reactivated" }
 *       404:
 *         description: Profile not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
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
 *     description: Creates a CRM profile for a walk-in customer and starts the lead nurture workflow (welcome sequence, reminders).
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
 *           example:
 *             fullName: John Doe
 *             phoneNumber: "+2348151128383"
 *     responses:
 *       200:
 *         description: Created lead profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       $ref: '#/components/schemas/CrmProfile'
 *             example:
 *               success: true
 *               data:
 *                 message:
 *                   _id: 665f1c2ab9e77a0012d4e9f7
 *                   fullName: John Doe
 *                   phoneNumber: "+2348151128383"
 *                   stage: lead
 *                   tags: [walk-in, fresh-lead]
 *                   channel: office
 *                   totalOrders: 0
 *       400:
 *         description: Profile already exists / missing fields
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: A CRM profile with this phone number already exists }
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
 *     description: |
 *       `id` is the `_id` of an entry in `pendingFollowUps` on the customer
 *       card (`GET /crm/customers/{id}`). Only pending follow-ups can be
 *       edited — sent/cancelled/failed ones are history.
 *       Send `dueAt` to reschedule OR `cancel: true` to cancel.
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: 665f1c2ab9e77a0012d4e9f3 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dueAt: { type: string, format: date-time, description: "New date (reschedule)" }
 *               cancel: { type: boolean, description: "true to cancel instead" }
 *           examples:
 *             reschedule:
 *               summary: Move the follow-up to a new date
 *               value: { dueAt: "2026-08-04T09:00:00.000Z" }
 *             cancel:
 *               summary: Cancel the follow-up entirely
 *               value: { cancel: true }
 *     responses:
 *       200:
 *         description: Updated follow-up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       $ref: '#/components/schemas/CrmFollowUp'
 *             example:
 *               success: true
 *               data:
 *                 message:
 *                   _id: 665f1c2ab9e77a0012d4e9f3
 *                   workflow: post-delivery
 *                   messageType: reorder-prompt
 *                   dueAt: 2026-08-04T09:00:00.000Z
 *                   status: pending
 *       400:
 *         description: Invalid body (neither dueAt nor cancel, or bad date)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: "Provide either dueAt (reschedule) or cancel: true" }
 *       404:
 *         description: Pending follow-up not found (wrong id or already sent/cancelled)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: Pending follow-up not found }
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
 *       The five KPIs from the CRM spec plus per-stage counts:
 *       lead→customer conversion %, repeat customer %, dormant %,
 *       reactivated %, revenue per customer. Rates are percentages (0–100).
 *     tags: [CRM]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KPI metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         totalProfiles: { type: integer, example: 220 }
 *                         customers: { type: integer, example: 143, description: Profiles with ≥1 delivered order }
 *                         leadConversionRate: { type: number, example: 65 }
 *                         repeatCustomerRate: { type: number, example: 41.26 }
 *                         dormantRate: { type: number, example: 18.18 }
 *                         reactivatedRate: { type: number, example: 32.5 }
 *                         revenuePerCustomer: { type: number, example: 28450 }
 *                         totalRevenue: { type: number, example: 4068350 }
 *                         stages:
 *                           type: object
 *                           additionalProperties: { type: integer }
 *                           example: { lead: 77, first-order: 30, active: 60, loyal: 27, dormant: 26, reactivated: 0 }
 *             example:
 *               success: true
 *               data:
 *                 message:
 *                   totalProfiles: 220
 *                   customers: 143
 *                   leadConversionRate: 65
 *                   repeatCustomerRate: 41.26
 *                   dormantRate: 18.18
 *                   reactivatedRate: 32.5
 *                   revenuePerCustomer: 28450
 *                   totalRevenue: 4068350
 *                   stages: { lead: 77, first-order: 30, active: 60, loyal: 27, dormant: 26, reactivated: 0 }
 *       403:
 *         description: Admin only
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
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
 *     description: |
 *       `prospect` = leads that never converted (broadcast every 14 days).
 *       `churn` = churned customers (broadcast every 30 days).
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
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: Paginated list members
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         data:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/CrmProfile'
 *                         pagination:
 *                           type: object
 *                           properties:
 *                             total: { type: integer, example: 34 }
 *                             page: { type: integer, example: 1 }
 *                             limit: { type: integer, example: 20 }
 *                             pages: { type: integer, example: 2 }
 *             example:
 *               success: true
 *               data:
 *                 message:
 *                   data:
 *                     - _id: 665f1c2ab9e77a0012d4e9a2
 *                       fullName: Jane Lead
 *                       phoneNumber: "+2348020000000"
 *                       stage: lead
 *                       tags: [whatsapp, prospect]
 *                       broadcastLists:
 *                         prospect: { active: true, joinedAt: 2026-06-20T08:00:00.000Z, lastSentAt: 2026-07-04T09:00:00.000Z }
 *                   pagination: { total: 34, page: 1, limit: 20, pages: 2 }
 *       400:
 *         description: Invalid list
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: "Invalid list. Valid lists: prospect, churn" }
 *       403:
 *         description: Admin only
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       $ref: '#/components/schemas/CrmSettings'
 *             example:
 *               success: true
 *               data:
 *                 message:
 *                   templates:
 *                     lead-welcome: "Hi {{firstName}}! 👋 Welcome to Chuvi Laundry."
 *                     reorder-prompt: "Hi {{firstName}}, laundry basket filling up again?"
 *                   thresholds:
 *                     dormantDays: 30
 *                     highVolumeAvgAmount: 15000
 *                     highFrequencyPerMonth: 2
 *                     expressUserRatio: 0.5
 *                     prospectBroadcastDays: 14
 *                     churnBroadcastDays: 30
 *       403:
 *         description: Admin only
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *   put:
 *     summary: Update CRM message templates and/or thresholds (admin only)
 *     description: |
 *       Partial update — send only the keys you want to change.
 *       `templates` keys must be valid CRM message types; templates support
 *       {{name}} and {{firstName}} placeholders.
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
 *           example:
 *             templates:
 *               lead-welcome: "Hi {{firstName}}! Welcome to Chuvi Laundry — fresh clothes, zero stress."
 *             thresholds:
 *               dormantDays: 45
 *     responses:
 *       200:
 *         description: Updated settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       $ref: '#/components/schemas/CrmSettings'
 *             example:
 *               success: true
 *               data:
 *                 message:
 *                   templates:
 *                     lead-welcome: "Hi {{firstName}}! Welcome to Chuvi Laundry — fresh clothes, zero stress."
 *                   thresholds:
 *                     dormantDays: 45
 *                     highVolumeAvgAmount: 15000
 *       400:
 *         description: Invalid template key or threshold
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: "Unknown message type: lead-hello" }
 *       403:
 *         description: Admin only
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
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
 *       chats in. Authenticated with the `x-bot-secret` header (same value
 *       as CHATBOT_NOTIFY_SECRET), not a JWT. Idempotent — an existing
 *       profile with the same phone is returned (`created: false`) rather
 *       than duplicated.
 *     tags: [CRM]
 *     parameters:
 *       - in: header
 *         name: x-bot-secret
 *         required: true
 *         schema: { type: string }
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
 *           example:
 *             fullName: Jane Lead
 *             phoneNumber: "+2348020000000"
 *     responses:
 *       200:
 *         description: profileId and whether it was newly created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: object
 *                       properties:
 *                         profileId: { type: string, example: 665f1c2ab9e77a0012d4e9a2 }
 *                         created: { type: boolean, example: true }
 *             example:
 *               success: true
 *               data:
 *                 message: { profileId: 665f1c2ab9e77a0012d4e9a2, created: true }
 *       400:
 *         description: Missing phoneNumber
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: phoneNumber is required }
 *       401:
 *         description: Bad or missing x-bot-secret
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CrmError' }
 *             example:
 *               success: false
 *               data: { error: Unauthorized }
 */
router.post(ROUTE_CRM_INTERNAL_LEAD, [botSecretAuth], (req, res) => {
    const controller = new CrmController()
    return controller.registerBotLead(req, res)
})

module.exports = router
