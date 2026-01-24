const UserController = require("../controllers/user.controller");
const adminAuth = require("../middlewares/adminAuth");
const auth = require("../middlewares/auth");
const {
  ROUTE_GET_ACCOUNT,
  ROUTE_PROFILE_IMAGE_UPLOAD,
  ROUTE_COMPLETE_ONBOARDING,
  ROUTE_DAILY_NUGGET,
  ROUTE_LIKE_AND_UNLIKE_NUGGET,
  ROUTE_INCREASE_NUGGET_SHARE_COUNT,
  ROUTE_INCREASE_NUGGET_DOWNLOAD_COUNT,
  ROUTE_UPDATE_NUGGET,
  ROUTE_CREATE_NUGGET,
  ROUTE_UPGRADE_PLAN,
  ROUTE_DASHBOARD_STAT,
  ROUTE_LOG_WEIGHT,
  ROUTE_COACH_VERIFICATION_APPLY,
  ROUTE_COACH_VERIFICATIONS,
  ROUTE_COACH_VERIFICATION_REJECT,
  ROUTE_COACH_VERIFICATION_APPROVE,
  ROUTE_LOG_HEIGHT,
  ROUTE_CHANGE_PASSWORD,
  ROUTE_GET_COACHES_BY_SPECIALTY,
  ROUTE_CREATE_PLAN,
  ROUTE_GET_ALL_PLANS,
  ROUTE_GET_PLAN,
  ROUTE_UPDATE_PLAN,
  ROUTE_DELETE_PLAN,
  ROUTE_SUBSCRIBE_PLAN,
  ROUTE_REDEEM_PLAN,
  ROUTE_LOG_SLEEP,
  ROUTE_GET_SLEEP_LOGS,
  ROUTE_LOG_WATER,
  ROUTE_GET_WATER_LOGS,
  ROUTE_GET_NOTIFICATIONS,
  ROUTE_BROADCAST_NOTIFICATION,
  ROUTE_GET_SUBSCRIPTION_STATUS,
  ROUTE_UPDATE_DEVICE_TOKEN,
  ROUTE_MARK_NOTIFICATION_AS_READ,
  ROUTE_DELETE_NOTIFICATION,
  ROUTE_GET_WEIGHT_IMPROVEMENT_TIPS,
  ROUTE_GET_USER_WEIGHT_LOSS,
  ROUTE_DELETE_ALL_NOTIFICATION,
  ROUTE_MARK_ALL_NOTIFICATIONS_AS_READ,
  ROUTE_GET_VERIFIED_COACHES,
  ROUTE_UPDATE_USER,
  ROUTE_CANCEL_PLAN,
  ROUTE_VERIFY_PHONE_NUMBER,
  ROUTE_UPDATE_PHONE_NUMBER,
  ROUTE_COACH_DASHBOARD,
  ROUTE_GET_UNREAD_NOTIFICATIONS_COUNT,
  ROUTE_DELETE_USER,
  ROUTE_CUSTOMER_SUPPORT,
  ROUTE_INITIALIZE_PAYMENT,
  ROUTE_DELETE_ADDRESS,
  ROUTE_ADD_ADDRESS,
  ROUTE_UPDATE_ADDRESS,
  ROUTE_GET_ADDRESS,
  ROUTE_NOTITICATION_PREFERENCE,
  ROUTE_GET_USER_NOTIFICATIONS,
  ROUTE_INITIALIZE_ORDER_PAYMENT,
} = require("../util/page-route");
const { image_uploader } = require("../util/imageUpload");
const router = require("express").Router();

/**
 * @swagger
 * /users/get-account:
 *   get:
 *     summary: Get user details
 *     tags:
 *       - Users
 *     responses:
 *       200:
 *         description: The user details object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   description: Unique identifier for the user
 *                   example: 609e129e8bfa8b2f4c8d4567
 *                 fullname:
 *                   type: string
 *                   description: Full name of the user
 *                   example: John Doe
 *                 email:
 *                   type: string
 *                   format: email
 *                   description: User's email address
 *                   example: johndoe@example.com
 *                 phone_number:
 *                   type: string
 *                   description: User's phone number
 *                   example: 08151128383
 *                 isVerified:
 *                   type: boolean
 *                   description: Whether the user has verified their email or not
 *                   example: true
 *                 referralCode:
 *                   type: string
 *                   description: Unique referral code for the user
 *                   example: user123
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   description: Account creation date
 *                   example: 2025-05-08T18:45:33.160Z
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   description: Last profile update
 *                   example: 2025-05-09T09:30:10.000Z
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_ACCOUNT, [auth], (req, res) => {
  const userController = new UserController();
  return userController.getUser(req, res);
});

/**
 * @swagger
 * /users/update-user:
 *   put:
 *     summary: Update user profile
 *     tags:
 *       - Users
 *     description: Allows an authenticated user to update their profile information. At least one field must be provided.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 description: Full name of the user
 *                 example: Sarah James
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address (must be unique)
 *                 example: sarah.james@example.com
 *               phoneNumber:
 *                 type: string
 *                 description: User phone number
 *                 example: "+2348012345678"
 *             minProperties: 1
 *     responses:
 *       200:
 *         description: User profile updated successfully
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
 *                   example: User profile updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request (nothing to update or email already in use)
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
 *                   example: Nothing to update
 *       401:
 *         description: Unauthorized – invalid or missing access token
 *       500:
 *         description: Internal server error
 */
router.put(ROUTE_UPDATE_USER, [auth], (req, res) => {
  const userController = new UserController();
  return userController.updateUserProfile(req, res);
});

/**
 * @swagger
 * /users/profile-image-upload:
 *   post:
 *     summary: Upload or update user profile image
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Profile image file (jpg, png, webp, gif)
 *     responses:
 *       200:
 *         description: Profile image uploaded successfully
 *       400:
 *         description: Invalid file format or missing image
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post(ROUTE_PROFILE_IMAGE_UPLOAD, [auth], image_uploader.single("image"), (req, res) => {
  const userController = new UserController();
  return userController.uploadProfileImage(req, res);
});

/**
 * @swagger
 * /users/add-address:
 *   post:
 *     summary: Add a new address to the user's address list
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - label
 *               - address
 *             properties:
 *               label:
 *                 type: string
 *                 example: Home
 *               address:
 *                 type: string
 *                 example: "123 Main Street, Anytown, USA"
 *     responses:
 *       201:
 *         description: Address added successfully
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
 *                   example: Address added successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 64fbc91d7e9a8c0012ab3456
 *                     label:
 *                       type: string
 *                     address:
 *                       type: string
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post(ROUTE_ADD_ADDRESS, [auth], (req, res) => {
  const userController = new UserController();
  return userController.addAddress(req, res);
});

/**
 * @swagger
 * /users/delete-address/{addressId}:
 *   delete:
 *     summary: Delete an address from the user's address list
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the address to delete
 *     responses:
 *       200:
 *         description: Address deleted successfully
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
 *                   example: Address deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Address not found
 *       500:
 *         description: Server error
 */
router.delete(ROUTE_DELETE_ADDRESS, [auth], (req, res) => {
  const userController = new UserController();
  return userController.deleteAddress(req, res);
});

/**
 * @swagger
 * /users/get-address:
 *   get:
 *     summary: Get user's address list
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Address list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 64fbc91d7e9a8c0012ab3456
 *                       label:
 *                         type: string
 *                         example: Home
 *                       address:
 *                         type: string
 *                         example: "123 Main Street, Anytown, USA"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_ADDRESS, [auth], (req, res) => {
  const userController = new UserController();
  return userController.getAddress(req, res);
});

/**
 * @swagger
 * /users/update-address/{addressId}:
 *   put:
 *     summary: Update an existing address
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the address to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label:
 *                 type: string
 *                 example: Home
 *               address:
 *                 type: string
 *                 example: "123 Main Street, Anytown, USA"
 *             minProperties: 1
 *     responses:
 *       200:
 *         description: Address updated successfully
 *       400:
 *         description: Invalid request or nothing to update
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Address not found
 *       500:
 *         description: Server error
 */

router.put(ROUTE_UPDATE_ADDRESS, [auth], (req, res) => {
  const userController = new UserController();
  return userController.updateAddress(req, res);
});

/**
 * @swagger
 * /users/initialize-order-payment:
 *   post:
 *     summary: Initialize an order payment with Paystack
 *     description: Initializes a Paystack transaction for order.
 *     tags:
 *       - Users
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
 *               orderId:
 *                 type: string
 *                 example: "696537bdf4cd2de9186cb729"
 *                 description: The order Id
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
router.post(ROUTE_INITIALIZE_ORDER_PAYMENT, auth, (req, res) => {
  const userController = new UserController();
  return userController.initializePayment(req, res);
});

/**
 * @swagger
 * /users/notification-preference:
 *   patch:
 *     tags:
 *       - Users
 *     summary: Update user notification preferences
 *     description: Enable or disable email and WhatsApp notifications for the authenticated user.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               whatsappNotification:
 *                 type: boolean
 *                 example: true
 *               emailNotification:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Notification preference updated successfully
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
 *                   example: Notification preference updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     whatsappNotification:
 *                       type: boolean
 *                     emailNotification:
 *                       type: boolean
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

router.patch(
  ROUTE_NOTITICATION_PREFERENCE,
  [auth],(req, res) => {
  const userController = new UserController();
  return userController.notificationPreference(req, res);
});


/**
 * @swagger
 * /users/delete-user:
 *   delete:
 *     summary: Delete the authenticated user account
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User deleted successfully
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
 *                   example: User account deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.delete(ROUTE_DELETE_USER, [auth], (req, res) => {
  const userController = new UserController();
  return userController.deleteUser(req, res);
});

/**
 * @swagger
 * /users/get-user-notifications:
 *   get:
 *     summary: Get notifications for the authenticated user
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   description: List of user notifications
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 64d3c9c0f1b2a8e9d0f12345
 *                       title:
 *                         type: string
 *                         example: Order Delivered
 *                       body:
 *                         type: string
 *                         example: "Your order #OSC123456 has been delivered."
 *                       subBody:
 *                         type: string
 *                         example: Delivered by driver John
 *                       type:
 *                         type: string
 *                         enum:
 *                           - system
 *                           - order_created
 *                           - order_delivered
 *                           - order_ironing
 *                           - order_washing
 *                           - order_picked
 *                           - payment_approved
 *                         example: order_delivered
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-01-13T12:34:56.789Z"
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-01-13T13:00:00.123Z"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_USER_NOTIFICATIONS, auth, (req, res) => {
  const userController = new UserController();
  return userController.getUserNotifications(req, res);
});

/**
 * @swagger
 * /users/change-password:
 *   patch:
 *     summary: Change user password from profile page
 *     description: Allows an authenticated user to change their password from the profile page by providing the current password and a new password.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "OldPassword123!"
 *                 description: The user's current password
 *               newPassword:
 *                 type: string
 *                 example: "NewSecurePassword123!"
 *                 description: The new password the user wants to set
 *     responses:
 *       200:
 *         description: Password changed successfully
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
 *                   example: Password changed successfully
 *       400:
 *         description: Validation error or incorrect current password
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
 *                   example: Current password is incorrect
 *       401:
 *         description: Unauthorized — user not authenticated
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
 *                   example: Unauthorized access
 *       500:
 *         description: Server error while changing password
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
 *                   example: Failed to change password
 */
router.patch(ROUTE_CHANGE_PASSWORD, auth, (req, res) => {
  const userController = new UserController()
  return userController.resetPasswordInProfilePage(req, res)
})


module.exports = router;
