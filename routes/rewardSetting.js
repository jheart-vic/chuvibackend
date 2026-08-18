const router = require('express').Router()
const RewardSettingController = require('../controllers/rewardSetting.controller')
const adminAuth = require('../middlewares/adminAuth')
const { ROUTE_REWARD_SETTINGS } = require('../util/page-route')

/**
 * @swagger
 * tags:
 *   - name: RewardSettings
 *     description: Admin config for the reward economy — complaint SLA & reopen window, recovery approval threshold, credit expiry, referral rewards/levels (singleton doc)
 */

/**
 * @swagger
 * /reward-settings:
 *   get:
 *     summary: Get the reward settings (Admin)
 *     description: >
 *       Returns the single RewardSetting document. It holds the complaint SLA and
 *       reopen window (`complaintConfirmWindowHours`, `complaintReopenDays`), the
 *       recovery compensation approval threshold, credit-expiry defaults, and the
 *       referral economy (reward %, caps, welcome amount, advocacy levels). The
 *       document is auto-created with defaults on first read, so this never 404s.
 *     tags: [RewardSettings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The reward settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/RewardSetting' }
 *   put:
 *     summary: Update the reward settings (Admin)
 *     description: >
 *       Partial update — send only the fields you want to change. Unknown keys are
 *       ignored. All numbers must be >= 0; `referralRewardMax` and
 *       `referralMonthlyCap` may be `null` to mean "no limit". `creditExpiryDays`
 *       is a partial object (only the provided credit types are updated).
 *       `referralLevels`, if sent, fully replaces the ladder and must be a
 *       non-empty array of valid levels.
 *     tags: [RewardSettings]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Any subset of the RewardSetting fields.
 *             properties:
 *               complaintReopenDays: { type: integer, minimum: 0, example: 7 }
 *               complaintConfirmWindowHours: { type: integer, minimum: 0, example: 48 }
 *               complaintReviewHours: { type: integer, minimum: 0, example: 24 }
 *               complaintResolutionHours: { type: integer, minimum: 0, example: 72 }
 *               recoveryApprovalThreshold: { type: number, minimum: 0, example: 10000 }
 *               referralRewardPercent: { type: number, minimum: 0, example: 5 }
 *               referralRewardMax: { type: number, minimum: 0, nullable: true, example: null }
 *               referralMonthlyCap: { type: number, minimum: 0, nullable: true, example: null }
 *               referralWelcomeAmount: { type: number, minimum: 0, example: 0 }
 *               creditExpiryDays:
 *                 type: object
 *                 properties:
 *                   referral: { type: integer, minimum: 0, example: 45 }
 *                   recovery: { type: integer, minimum: 0, example: 90 }
 *                   promotional: { type: integer, minimum: 0, example: 30 }
 *                   laundry: { type: integer, minimum: 0, example: 90 }
 *               referralLevels:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/RewardSettingLevel' }
 *     responses:
 *       200:
 *         description: The updated reward settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/RewardSetting' }
 *       400:
 *         description: Invalid value (e.g. a negative number, or a bad referral level)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get(ROUTE_REWARD_SETTINGS, [adminAuth], (req, res) =>
    new RewardSettingController().getSettings(req, res),
)
router.put(ROUTE_REWARD_SETTINGS, [adminAuth], (req, res) =>
    new RewardSettingController().updateSettings(req, res),
)

module.exports = router
