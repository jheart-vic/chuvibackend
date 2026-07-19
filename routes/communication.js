const router = require('express').Router()
const CommunicationController = require('../controllers/communication.controller')
const adminAuth = require('../middlewares/adminAuth')
const {
    ROUTE_COMM_TEMPLATES,
    ROUTE_COMM_TEMPLATE_BY_ID,
    ROUTE_COMM_LOGS,
    ROUTE_COMM_RETRY_FAILED,
} = require('../util/page-route')

/**
 * @swagger
 * /communication/templates:
 *   get:
 *     summary: List communication templates (admin)
 *     description: >
 *       Message templates used by the communication layer. Other systems send
 *       messages by template key; the messenger never invents content.
 *       Placeholders use `{{key}}` syntax — `{{name}}`/`{{firstName}}` come
 *       from the user document, anything else from the caller's data object.
 *     tags: [Communication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: active
 *         schema: { type: string, enum: ['true', 'false'] }
 *         description: Filter by active state (omit for all)
 *     responses:
 *       200:
 *         description: Array of templates
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
 *                       _id: { type: string }
 *                       key: { type: string, example: offer-available }
 *                       name: { type: string, example: Offer Available }
 *                       title: { type: string, example: "A new reward is waiting 🎁" }
 *                       body: { type: string, example: "Hello {{firstName}}, you have a new offer: {{offerName}}. Tap to view it." }
 *                       smsBody: { type: string }
 *                       channels:
 *                         type: array
 *                         items: { type: string, enum: [in-app, sms] }
 *                       page: { type: string, example: offers }
 *                       active: { type: boolean }
 *       500:
 *         description: Server error
 *   post:
 *     summary: Create a communication template (admin)
 *     tags: [Communication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key, name, title, body]
 *             properties:
 *               key: { type: string, example: offer-available, description: "Unique identifier other systems send by (immutable after creation)" }
 *               name: { type: string, example: Offer Available }
 *               title: { type: string, example: "A new reward is waiting 🎁" }
 *               body: { type: string, example: "Hello {{firstName}}, you have a new offer: {{offerName}}." }
 *               smsBody: { type: string, description: "Short SMS variant; falls back to body" }
 *               channels:
 *                 type: array
 *                 items: { type: string, enum: [in-app, sms] }
 *                 example: [in-app]
 *               page: { type: string, example: offers, description: "App page this message deep-links to" }
 *               active: { type: boolean, default: true }
 *     responses:
 *       200:
 *         description: Created template
 *       400:
 *         description: Validation error or duplicate key
 *       500:
 *         description: Server error
 */
router.get(ROUTE_COMM_TEMPLATES, [adminAuth], (req, res) => {
    const controller = new CommunicationController()
    return controller.listTemplates(req, res)
})
router.post(ROUTE_COMM_TEMPLATES, [adminAuth], (req, res) => {
    const controller = new CommunicationController()
    return controller.createTemplate(req, res)
})

/**
 * @swagger
 * /communication/templates/{id}:
 *   put:
 *     summary: Update a communication template (admin)
 *     description: Every field except the key is editable. Set `active:false` to disable without deleting.
 *     tags: [Communication]
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
 *               name: { type: string }
 *               title: { type: string }
 *               body: { type: string }
 *               smsBody: { type: string }
 *               channels:
 *                 type: array
 *                 items: { type: string, enum: [in-app, sms] }
 *               page: { type: string }
 *               active: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated template
 *       400:
 *         description: Template not found or invalid channels
 *       500:
 *         description: Server error
 */
router.put(ROUTE_COMM_TEMPLATE_BY_ID, [adminAuth], (req, res) => {
    const controller = new CommunicationController()
    return controller.updateTemplate(req, res)
})

/**
 * @swagger
 * /communication/logs:
 *   get:
 *     summary: Browse the communication delivery ledger (admin)
 *     description: Every message any system sent, with channel, delivery status (pending→sent→delivered→read→failed) and error details.
 *     tags: [Communication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: sourceSystem
 *         schema: { type: string, enum: [crm, offer, order, feedback, recovery, referral, broadcast, system] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, sent, delivered, read, failed] }
 *       - in: query
 *         name: channel
 *         schema: { type: string, enum: [in-app, sms] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated log entries
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
 *                       items: { type: object }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         page: { type: integer }
 *                         limit: { type: integer }
 *                         pages: { type: integer }
 *       500:
 *         description: Server error
 */
router.get(ROUTE_COMM_LOGS, [adminAuth], (req, res) => {
    const controller = new CommunicationController()
    return controller.getLogs(req, res)
})

/**
 * @swagger
 * /communication/retry-failed:
 *   post:
 *     summary: Retry failed SMS deliveries (admin)
 *     description: Re-attempts failed SMS log entries (up to 3 tries each, 50 per call). In-app failures are configuration errors and are not retried.
 *     tags: [Communication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Retry summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     attempted: { type: integer, example: 4 }
 *                     succeeded: { type: integer, example: 3 }
 *       500:
 *         description: Server error
 */
router.post(ROUTE_COMM_RETRY_FAILED, [adminAuth], (req, res) => {
    const controller = new CommunicationController()
    return controller.retryFailed(req, res)
})

module.exports = router
