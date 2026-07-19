const router = require('express').Router()
const ReferralController = require('../controllers/referral.controller')
const auth = require('../middlewares/auth')
const adminAuth = require('../middlewares/adminAuth')
const {
    ROUTE_REFERRAL_ME,
    ROUTE_REFERRAL_HISTORY,
    ROUTE_REFERRAL_APPLY,
    ROUTE_REFERRAL_RESET,
} = require('../util/page-route')

/**
 * @swagger
 * tags:
 *   - name: Referral
 *     description: Personal referral codes/links, tracking, and rewards
 */

/**
 * @swagger
 * /referral/me:
 *   get:
 *     summary: My referral page (code, link, stats, history)
 *     description: >
 *       Returns the customer's permanent referral code (generated on first
 *       access if absent), the shareable link, totals, and referral history.
 *     tags: [Referral]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Referral page
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     referralCode: { type: string, example: CHUVIA1B2C3 }
 *                     referralLink: { type: string, example: "https://www.chuvilaundry.com/join?ref=CHUVIA1B2C3" }
 *                     totalSuccessfulReferrals: { type: integer, example: 3 }
 *                     pendingReferrals: { type: integer, example: 1 }
 *                     totalRewardsEarned: { type: number, example: 1500 }
 *                     history:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           referredName: { type: string }
 *                           referralDate: { type: string, format: date-time }
 *                           status: { type: string, enum: [pending, registered, first-order, completed, rewarded] }
 *                           rewardStatus: { type: string, enum: [none, deferred, granted] }
 *                           rewardAmount: { type: number }
 */
router.get(ROUTE_REFERRAL_ME, [auth], (req, res) =>
    new ReferralController().getMyReferralPage(req, res),
)

/**
 * @swagger
 * /referral/history:
 *   get:
 *     summary: My referral history
 *     tags: [Referral]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Array of the customer's referrals }
 */
router.get(ROUTE_REFERRAL_HISTORY, [auth], (req, res) =>
    new ReferralController().getMyHistory(req, res),
)

/**
 * @swagger
 * /referral/apply-code:
 *   post:
 *     summary: Apply a referral code (post-registration)
 *     description: >
 *       Links the current customer to the owner of the code, if they don't
 *       already have a referrer. Rejects unknown codes, self-referral, and
 *       customers already referred. Grants the configured welcome reward.
 *     tags: [Referral]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, example: CHUVIA1B2C3 }
 *     responses:
 *       200: { description: Code applied }
 *       400: { description: Unknown/own code, or already referred }
 */
router.post(ROUTE_REFERRAL_APPLY, [auth], (req, res) =>
    new ReferralController().applyCode(req, res),
)

/**
 * @swagger
 * /referral/reset-code:
 *   post:
 *     summary: Reset a customer's referral code (admin)
 *     tags: [Referral]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: { type: string }
 *     responses:
 *       200: { description: New referral code }
 *       400: { description: User not found }
 */
router.post(ROUTE_REFERRAL_RESET, [adminAuth], (req, res) =>
    new ReferralController().resetCode(req, res),
)

module.exports = router
