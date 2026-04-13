const AuthController = require("../controllers/auth.controller");
const {
  ROUTE_REGISTER,
  ROUTE_LOGIN,
  ROUTE_FORGOT_PASSWORD,
  ROUTE_RESET_PASSWORD,
  ROUTE_SEND_OTP,
  ROUTE_VERIFY_OTP,
  ROUTE_VERIFY_EMAIL,
  ROUTE_VERIFY_PASSWORD_OTP,
  ROUTE_REFRESH_TOKEN,
  ROUTE_GOOGLE_SIGNUP,
  ROUTE_APPLE_SIGNUP,
  ROUTE_RESEND_OTP,
  ROUTE_ADMIN_LOGIN,
  ROUTE_ADMIN_REGISTER,
  ROUTE_VERIFY_RESET_PASSWORD_OTP,
  ROUTE_INTAKE_USER_REFRESH_TOKEN,
  ROUTE_INTAKE_USER_RESEND_OTP,
  ROUTE_INTAKE_USER_VERIFY_EMAIL,
  ROUTE_INTAKE_USER_VERIFY_OTP,
  ROUTE_INTAKE_USER_RESET_PASSWORD,
  ROUTE_INTAKE_USER_VERIFY_RESET_PASSWORD_OTP,
  ROUTE_INTAKE_USER_FORGOT_PASSWORD,
  ROUTE_INTAKE_USER_LOGIN,
  ROUTE_INTAKE_USER_REGISTER,
  ROUTE_INTAKE_USER_GOOGLE_SIGNUP,
  ROUTE_QC_USER_REGISTER,
  ROUTE_QC_USER_GOOGLE_SIGNUP,
  ROUTE_INTAKE_USER_APPLE_SIGNUP,
  ROUTE_QC_USER_APPLE_SIGNUP,
  ROUTE_QC_USER_LOGIN,
  ROUTE_QC_USER_FORGOT_PASSWORD,
  ROUTE_QC_USER_VERIFY_RESET_PASSWORD_OTP,
  ROUTE_QC_USER_RESET_PASSWORD,
  ROUTE_QC_USER_VERIFY_OTP,
  ROUTE_QC_USER_RESEND_OTP,
  ROUTE_QC_USER_VERIFY_EMAIL,
  ROUTE_QC_USER_REFRESH_TOKEN,
} = require("../util/page-route");

const router = require("express").Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - AuthUser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - fullName
 *               - phoneNumber
 *               - userType
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: gRDERIdiidfjii@
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               phoneNumber:
 *                 type: string
 *                 example: "+1234567890"
 *               userType:
 *                 type: string
 *                 enum: [admin, intake-users, user]
 *                 example: user

 *     responses:
 *       200:
 *         description: Registration successful, OTP sent for email verification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Registration successful. Please verify your email.
 *                 user:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     phoneNumber:
 *                       type: string
 *                     userType:
 *                       type: string
 *                     servicePlatform:
 *                       type: string
 *                     otp:
 *                       type: string
 *                     otpExpiresAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing or invalid fields, or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: User exists. Please login
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Server error
 */
router.post(ROUTE_REGISTER, (req, res) => {
  const authController = new AuthController();
  return authController.createUser(req, res);
});

/**
 * @swagger
 * /auth/google-signup:
 *   post:
 *     summary: Register new user through google
 *     tags:
 *       - AuthUser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - userType
 *             properties:
 *               idToken:
 *                 type: string
 *                 format: text
 *                 example: <your_id_token>
 *               userType:
 *                 type: string
 *                 format: text
 *                 example: (manager, admin, staff, front_desk, user)
 *     responses:
 *       200:
 *         description: Registration successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: <access_token>
 *       400:
 *         description: Missing or invalid email
 *       500:
 *         description: Server error
 */
router.post(ROUTE_GOOGLE_SIGNUP, (req, res) => {
  const authController = new AuthController();
  return authController.googleSignup(req, res);
});

/**
 * @swagger
 * /auth/apple-signup:
 *   post:
 *     summary: Register new user through apple
 *     tags:
 *       - AuthUser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - userType
 *             properties:
 *               idToken:
 *                 type: string
 *                 format: text
 *                 example: <your_id_token>
 *               userType:
 *                 type: string
 *                 format: text
 *                 example: (manager, admin, staff, front_desk, user)
 *               authorizationCode:
 *                 type: string
 *                 format: text
 *                 example: <your_authorization_code>
 *     responses:
 *       200:
 *         description: Registration successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: <access_token>
 *       400:
 *         description: Missing or invalid email
 *       500:
 *         description: Server error
 */
router.post(ROUTE_APPLE_SIGNUP, (req, res) => {
  const authController = new AuthController();
  return authController.appleSignup(req, res);
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [AuthUser]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - userType
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *               userType:
 *                 type: string
 *                 example: user
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Access token (JWT)
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 user:
 *                   type: object
 *                   description: Logged in user details
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "612345abcdef67890"
 *                     email:
 *                       type: string
 *                       example: user@example.com
 *                     userType:
 *                       type: string
 *                       example: admin
 *                     name:
 *                       type: string
 *                       example: John Doe
 *                 refreshToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       401:
 *         description: Invalid credentials
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
 *                   example: Invalid email or password
 */
router.post(ROUTE_LOGIN, (req, res) => {
  const authController = new AuthController();
  return authController.loginUser(req, res);
});
/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Send password reset email
 *     tags:
 *       - AuthUser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - userType
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               userType:
 *                 type: string
 *                 example: user
 *     responses:
 *       200:
 *         description: Reset email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Reset email sent
 *       400:
 *         description: Missing or invalid email
 *       500:
 *         description: Server error
 */
router.post(ROUTE_FORGOT_PASSWORD, (req, res) => {
  const authController = new AuthController();
  return authController.forgotPassword(req, res);
});

/**
 * @swagger
 * /auth/verify-reset-password-otp:
 *   post:
 *     summary: Verify OTP for password reset
 *     description: Verifies the OTP sent to the user's email and returns a short-lived reset token.
 *     tags:
 *       - AuthUser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - userType
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               otp:
 *                 type: string
 *                 example: "482193"
 *               userType:
 *                 type: string
 *                 example: "user"
 *     responses:
 *       200:
 *         description: OTP verified successfully
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
 *                   example: OTP verified successfully
 *                 resetToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Invalid or expired OTP
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post(ROUTE_VERIFY_RESET_PASSWORD_OTP, (req, res) => {
  const authController = new AuthController();
  return authController.verifyResetPasswordOtp(req, res);
});

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset user password
 *     description: Resets the user's password using a valid reset token obtained after OTP verification.
 *     tags:
 *       - AuthUser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *               - resetToken
 *               - userType
 *             properties:
 *               password:
 *                 type: string
 *                 example: StrongPassword123!
 *               resetToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *               userType:
 *                 type: string
 *                 example: user
 *     responses:
 *       200:
 *         description: Password reset successfully
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
 *                   example: Password reset successful
 *       400:
 *         description: Invalid or expired reset token
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post(ROUTE_RESET_PASSWORD, (req, res) => {
  const authController = new AuthController();
  return authController.resetPassword(req, res);
});

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Verify your otp
 *     tags:
 *       - AuthUser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - userType
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               otp:
 *                 type: string
 *                 format: string
 *                 example: 123456
 *               userType:
 *                 type: string
 *                 example: user
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP verified successfully
 *       400:
 *         description: Missing or invalid email or OTP
 *       500:
 *         description: Server error
 */
router.post(ROUTE_VERIFY_OTP, (req, res) => {
  const authController = new AuthController();
  return authController.verifyOTP(req, res);
});

/**
 * @swagger
 * /auth/resend-otp:
 *   post:
 *     summary: Resend OTP to user email/phone
 *     tags:
 *       - AuthUser
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - userType
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               userType:
 *                 type: string
 *                 example: user
 *     responses:
 *       200:
 *         description: OTP resent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP resent to email successfully.
 *       400:
 *         description: Missing or invalid email
 *       404:
 *         description: User not found
 *       409:
 *         description: Email already verified
 *       500:
 *         description: Server error
 */
router.post(ROUTE_RESEND_OTP, (req, res) => {
  const authController = new AuthController();
  return authController.resendOtp(req, res);
});

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Refresh Access Token
 *     tags:
 *       - AuthUser
 *     description: Uses a refresh token to generate a new access token.
 *     parameters:
 *       - in: header
 *         name: x-refresh-token
 *         schema:
 *           type: string
 *         required: false
 *         description: The refresh token sent in the header
 *     responses:
 *       200:
 *         description: Access token successfully refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Refresh token is missing or invalid
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
 *                   example: No refresh token provided
 *       401:
 *         description: Invalid or expired refresh token
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
 *                   example: Invalid or expired refresh token
 */
router.post(ROUTE_REFRESH_TOKEN, (req, res) => {
  const authController = new AuthController();
  return authController.refreshToken(req, res);
});

// ADMIN
/**
 * @swagger
 * /auth/admin/register:
 *   get:
 *     summary: Seed register a new admin (Restricted)
 *     tags:
 *       - AuthAdmin
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *     responses:
 *       200:
 *         description: Admin seed successful
 *       400:
 *         description: Admin already exists or
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Admin already exists
 *       403:
 *         description: Unauthorized access
 *       500:
 *         description: Internal server error
 */
router.get(ROUTE_ADMIN_REGISTER, (req, res) => {
  const authController = new AuthController();
  return authController.registerAdmin(req, res);
});

/**
 * @swagger
 * /auth/admin/login:
 *   post:
 *     summary: Login as admin
 *     tags:
 *       - AuthAdmin
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@chuvi.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Admin@1234
 *     responses:
 *       200:
 *         description: Admin logged in successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: JWT_ACCESS_TOKEN
 *                 user:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     userType:
 *                       type: string
 *                       example: admin
 *                 refreshToken:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Wrong email or password
 *       403:
 *         description: Access denied (Not an admin)
 *       500:
 *         description: Internal server error
 */
router.post(ROUTE_ADMIN_LOGIN, (req, res) => {
  const authController = new AuthController();
  return authController.adminLogin(req, res);
});



module.exports = router;
