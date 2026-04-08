const router = require("express").Router();
const WalletController = require("../controllers/walletController");
const auth = require("../middlewares/auth");
const {
  ROUTE_WALLET_TOP_UP,
  ROUTE_FETCH_USER_TRANSACTIONS,
  ROUTE_PAY_WITH_WALLET,
  ROUTE_WALLET_BALANCE,
  ROUTE_GET_MONTHLY_TRANSACTIONS,
  ROUTE_UPLOAD_PAYMENT_PROOF,
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
 *               - amount
 *             properties:
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
 *     summary: Get all wallet transactions for a user with pagination and date filter
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
 *       - in: query
 *         name: alertType
 *         schema:
 *           type: string
 *           enum: [credit, debit]
 *         description: Filter transactions by alert type
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [7d, 30d, all]
 *           default: all
 *         description: Filter transactions by date range
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
 *                           userId:
 *                             type: string
 *                             example: 64a8f4b6c3d3f3b2e7a1f2c0
 *                           amount:
 *                             type: number
 *                             example: 500
 *                           reference:
 *                             type: string
 *                             example: TXN123456
 *                           type:
 *                             type: string
 *                             enum: [order, subscription, wallet-top-up]
 *                             example: wallet-top-up
 *                           subscription:
 *                             type: string
 *                             example: 64a8f4b6c3d3f3b2e7a1f2b0
 *                           order:
 *                             type: string
 *                             example: 64a8f4b6c3d3f3b2e7a1f2a0
 *                           status:
 *                             type: string
 *                             enum: [pending, success, failed]
 *                             example: success
 *                           channel:
 *                             type: string
 *                             example: card
 *                           alertType:
 *                             type: string
 *                             enum: [credit, debit]
 *                             example: credit
 *                           paidAt:
 *                             type: string
 *                             format: date-time
 *                             example: 2026-01-13T12:34:56.789Z
 *                           metadata:
 *                             type: object
 *                             additionalProperties: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: 2026-01-13T12:34:56.789Z
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: 2026-01-13T12:34:56.789Z
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

/**
 * @swagger
 * /wallet/wallet-balance:
 *   get:
 *     summary: Get the wallet balance of the authenticated user
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: number
 *                       example: 1500.75
 *       400:
 *         description: Validation error
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
 *                   example: "Wallet not found"
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
router.get(ROUTE_WALLET_BALANCE, [auth], (req, res) => {
  const walletController = new WalletController();
  return walletController.getWalletBalance(req, res);
});

/**
 * @swagger
 * /wallet/get-monthly-transactions:
 *   get:
 *     summary: Get monthly wallet transactions, totals (credit & debit), and pagination
 *     tags:
 *       - Wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         description: Page number (default is 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         description: Number of records per page (default is 10)
 *     responses:
 *       200:
 *         description: Wallet transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
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
 *                           userId:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           reference:
 *                             type: string
 *                           status:
 *                             type: string
 *                             example: success
 *                           type:
 *                             type: string
 *                             example: wallet-top-up
 *                           alertType:
 *                             type: string
 *                             enum: [credit, debit]
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     totals:
 *                       type: object
 *                       properties:
 *                         credit:
 *                           type: number
 *                           example: 50000
 *                         debit:
 *                           type: number
 *                           example: 20000
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 25
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         pages:
 *                           type: integer
 *                           example: 3
 *       400:
 *         description: Validation or request error
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
 *                   example: "Invalid request parameters"
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
router.get(ROUTE_GET_MONTHLY_TRANSACTIONS, [auth], (req, res) => {
  const walletController = new WalletController();
  return walletController.getMonthlyTransaction(req, res);
});

/**
 * @swagger
 * /wallet/upload-payment-proof:
 *   post:
 *     summary: Upload payment proof for bank transfer wallet top-up
 *     description: Allows a user to submit proof of payment after making a bank transfer. The transaction will be marked as pending until verified by an admin.
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
 *               - amount
 *               - proofOfPayment
 *             properties:
 *               amount:
 *                 type: integer
 *                 example: 5000
 *                 description: Amount transferred in naira
 *               proofOfPayment:
 *                 type: string
 *                 example: "https://yourcdn.com/uploads/payment-proof.jpg"
 *                 description: URL or path to uploaded payment proof (e.g. receipt screenshot)
 *     responses:
 *       200:
 *         description: Payment proof uploaded successfully
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
 *                   example: Payment proof uploaded successfully. Awaiting verification.
 *       400:
 *         description: Validation error or invalid user
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
 *                     amount: ["amount is required"]
 *                     proofOfPayment: ["proofOfPayment is required"]
 *       500:
 *         description: Server error while uploading proof
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
 *                   example: Unable to upload payment proof
 */
router.post(ROUTE_UPLOAD_PAYMENT_PROOF, [auth], (req, res) => {
  const walletController = new WalletController();
  return walletController.uploadPaymentProof(req, res);
});

module.exports = router;
