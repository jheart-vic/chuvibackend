const UserController = require ('../controllers/auth.controller');
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
} = require ('../util/page-route');

const router = require ('express').Router ();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - Auth
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
 *                 enum: [manager, admin, staff, front_desk, user]
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

router.post (ROUTE_REGISTER, (req, res) => {
  const userController = new UserController ();
  return userController.createUser (req, res);
});

/**
 * @swagger
 * /auth/google-signup:
 *   post:
 *     summary: Register new user through google
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
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
router.post (ROUTE_GOOGLE_SIGNUP, (req, res) => {
  const userController = new UserController ();
  return userController.googleSignup (req, res);
});

/**
 * @swagger
 * /auth/apple-signup:
 *   post:
 *     summary: Register new user through apple
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
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
router.post (ROUTE_APPLE_SIGNUP, (req, res) => {
  const userController = new UserController ();
  return userController.appleSignup (req, res);
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Auth]
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
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: password123
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
router.post (ROUTE_LOGIN, (req, res) => {
  const userController = new UserController ();
  return userController.loginUser (req, res);
});
/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Send password reset email
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
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
router.post (ROUTE_FORGOT_PASSWORD, (req, res) => {
  const userController = new UserController ();
  return userController.forgotPassword (req, res);
});
/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Change your password
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: string
 *                 example: Word1234.
 *               otp:
 *                 type: string
 *                 example: "123456"
 *
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset successful
 *       400:
 *         description: Missing or invalid email, password, or OTP
 *       500:
 *         description: Server error
 */
router.post (ROUTE_RESET_PASSWORD, (req, res) => {
  const userController = new UserController ();
  return userController.resetPassword (req, res);
});
// /**
//  * @swagger
//  * /auth/send-otp:
//  *   post:
//  *     summary: Send your otp
//  *     tags:
//  *       - Auth
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - email
//  *             properties:
//  *               email:
//  *                 type: string
//  *                 format: email
//  *                 example: user@example.com
//  *     responses:
//  *       200:
//  *         description: Email verified successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 message:
//  *                   type: string
//  *                   example: Email verified successfully
//  *       400:
//  *         description: Missing or invalid email
//  *       500:
//  *         description: Server error
//  */
// router.post (ROUTE_SEND_OTP, (req, res) => {
//   const userController = new UserController ();
//   return userController.sendOTP (req, res);
// });
/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Verify your otp
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               otp:
 *                 type: string
 *                 format: string
 *                 example: 123456
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
router.post (ROUTE_VERIFY_OTP, (req, res) => {
  const userController = new UserController ();
  return userController.verifyOTP (req, res);
});

/**
 * @swagger
 * /auth/resend-otp:
 *   post:
 *     summary: Resend OTP to user email/phone
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
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
  const userController = new UserController();
  return userController.resendOtp(req, res);
});


/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verify your email
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
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
 *                   example: Email verified successfully
 *       400:
 *         description: Missing or invalid email
 *       500:
 *         description: Server error
 */
router.post (ROUTE_VERIFY_EMAIL, (req, res) => {
  const userController = new UserController ();
  return userController.verifyEmail (req, res);
});
// /**
//  * @swagger
//  * /auth/verify-password-otp:
//  *   post:
//  *     summary: Verify your reset password OTP
//  *     tags:
//  *       - Auth
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - email
//  *             properties:
//  *               email:
//  *                 type: string
//  *                 format: email
//  *                 example: user@example.com
//  *               otp:
//  *                 type: string
//  *                 format: string
//  *                 example: 123456
//  *     responses:
//  *       200:
//  *         description: Email verified successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 message:
//  *                   type: string
//  *                   example: OTP verified successfully
//  *       400:
//  *         description: Missing or invalid email or OTP
//  *       500:
//  *         description: Server error
//  */
// router.post (ROUTE_VERIFY_PASSWORD_OTP, (req, res) => {
//   const userController = new UserController ();
//   return userController.verifyPasswordOTP (req, res);
// });
/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Refresh Access Token
 *     tags:
 *       - Auth
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

router.post (ROUTE_REFRESH_TOKEN, (req, res) => {
  const userController = new UserController ();
  return userController.refreshToken (req, res);
});

/**
 * @swagger
 * /auth/admin/register:
 *   post:
 *     summary: Register a new admin (Restricted)
 *     tags:
 *       - Admin Auth
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
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@chuvi.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Admin@1234
 *               fullName:
 *                 type: string
 *                 example: John Admin
 *               phoneNumber:
 *                 type: string
 *                 example: "+2348012345678"
 *               userType:
 *                 type: string
 *                 enum: [manager, admin, staff, front_desk, user]
 *                 example: admin
 *     responses:
 *       200:
 *         description: Admin registration successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Admin account created successfully
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
 *                       example: admin
 *                     servicePlatform:
 *                       type: string
 *                       example: local
 *       400:
 *         description: Admin already exists or invalid fields
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
router.post(ROUTE_ADMIN_REGISTER, (req, res) => {
  const userController = new UserController();
  return userController.registerAdmin(req, res);
});

/**
 * @swagger
 * /auth/admin/login:
 *   post:
 *     summary: Login as admin
 *     tags:
 *       - Admin Auth
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
  const userController = new UserController();
  return userController.adminLogin(req, res);
});

module.exports = router;
