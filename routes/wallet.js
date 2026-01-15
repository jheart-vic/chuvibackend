const router = require("express").Router();
const WalletController = require("../controllers/walletController");
const auth = require("../middlewares/auth");
const {
  ROUTE_WALLET_TOP_UP,
  ROUTE_FETCH_USER_TRANSACTIONS,
  ROUTE_PAY_WITH_WALLET,
} = require("../util/page-route");

/**
 * @swagger
 * /wallet/wallet-top-up:
 *   post:
 *     summary: Initialize a Wallet topup with paystack payment
 *     description: Initializes a Paystack transaction for a user subscribing to a fitness plan. Returns an authorization URL that the user can use to complete payment.
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - amount
 *             properties:
 *               email:
 *                 type: string
 *                 example: "chiemelapromise30@gmail.com"
 *                 description: The user's email address
 *               amount:
 *                 type: string
 *                 example: "4500000"
 *                 description: Amount in kobo (₦1 = 100 kobo)
 *     responses:
 *       200:
 *         description: Payment initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Payment initialized successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorization_url:
 *                       type: string
 *                       example: "https://checkout.paystack.com/2v4t6w4s8s"
 *                     access_code:
 *                       type: string
 *                       example: "ACCESS_23s5z3m0ha"
 *                     reference:
 *                       type: string
 *                       example: "T513406671019712"
 *       400:
 *         description: Validation error — missing or invalid fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   example:
 *                     email: ["email is required"]
 *                     amount: ["amount is required"]
 *       500:
 *         description: Server error during payment initialization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "An internal server error occurred. Please try again later."
 */
router.post(ROUTE_WALLET_TOP_UP, [auth], (req, res) => {
  const walletController = new WalletController();
  return walletController.walletTopUp(req, res);
});

/**
 * @swagger
 * /wallet/pay-with-wallet:
 *   post:
 *     summary: Make a payment using wallet balance
 *     tags:
 *       - Wallet
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookOrderId
 *             properties:
 *               bookOrderId:
 *                 type: string
 *                 example: 64b9a7f6e3c3b4a1d2f1c9b0
 *     responses:
 *       200:
 *         description: Payment made successfully from wallet
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Payment made successfully from wallet."
 *       400:
 *         description: Validation error or insufficient balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Opps! Insufficient balance."
 *       404:
 *         description: User or order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Internal server error"
 */
router.post(ROUTE_PAY_WITH_WALLET, [auth], (req, res) => {
  const walletController = new WalletController();
  return walletController.payWithWallet(req, res);
});

/**
 * @swagger
 * /wallet/fetch-user-transactions:
 *   get:
 *     summary: Get all wallet transactions for a user with pagination
 *     tags:
 *       - Wallet
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID of the user
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of transactions per page
 *     responses:
 *       200:
 *         description: List of wallet transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: 64a8f4b6c3d3f3b2e7a1f2d1
 *                           walletId:
 *                             type: string
 *                             example: 64a8f4b6c3d3f3b2e7a1f2c0
 *                           type:
 *                             type: string
 *                             example: credit
 *                           amount:
 *                             type: number
 *                             example: 500
 *                           description:
 *                             type: string
 *                             example: "Order Payment"
 *                           reference:
 *                             type: string
 *                             example: "TXN123456"
 *                           status:
 *                             type: string
 *                             example: success
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-01-13T12:34:56.789Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-01-13T12:34:56.789Z"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 100
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         pages:
 *                           type: integer
 *                           example: 10
 *       400:
 *         description: Validation error
 *       500:
 *         description: Server error
 */
router.get(ROUTE_FETCH_USER_TRANSACTIONS, [auth], (req, res) => {
  const walletController = new WalletController();
  return walletController.fetchUserTransactions(req, res);
});

module.exports = router;
