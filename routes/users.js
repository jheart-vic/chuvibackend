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
  ROUTE_NOTITICATION_PREFERENCE
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
 *     summary: Update user profile information
 *     tags:
 *       - Users
 *     description: Allows an authenticated user to update their profile details such as name, gender, age, fitness level, location, etc.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 description: First name of the user
 *                 example: Sarah
 *               lastName:
 *                 type: string
 *                 description: Last name of the user
 *                 example: James
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *                 description: Gender of the user
 *                 example: female
 *               age:
 *                 type: integer
 *                 description: Age of the user
 *                 example: 28
 *               focusArea:
 *                 type: array
 *                 description: Optional list of fitness focus areas
 *                 items:
 *                   type: string
 *                 example: ["weight loss", "muscle gain"]
 *               specialty:
 *                 type: array
 *                 description: Optional list of specialty areas (for coaches)
 *                 items:
 *                   type: string
 *                 example: ["yoga", "HIIT"]
 *               fitnessLevel:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced]
 *                 description: Optional fitness level
 *                 example: intermediate
 *               weight:
 *                 type: object
 *                 description: Optional weight of the user
 *                 properties:
 *                   value:
 *                     type: number
 *                     example: 72.5
 *                   unit:
 *                     type: string
 *                     enum: [kg, lbs]
 *                     example: kg
 *               height:
 *                 type: object
 *                 description: Optional height of the user
 *                 properties:
 *                   value:
 *                     type: number
 *                     example: 180
 *                   unit:
 *                     type: string
 *                     enum: [cm, ft]
 *                     example: cm
 *               location:
 *                 type: string
 *                 description: Optional location of the user
 *                 example: "Awka, NG"
 *               yearsOfExperience:
 *                 type: integer
 *                 description: Optional years of experience (for coaches)
 *                 example: 5
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
 *         description: Bad request, such as missing or invalid fields
 *       401:
 *         description: Unauthorized, user not authenticated
 *       500:
 *         description: Server error
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
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Profile image file
 *     responses:
 *       200:
 *         description: Profile image uploaded successfully
 *       400:
 *         description: Invalid file or missing image
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
 *             properties:
 *               label:
 *                 type: string
 *                 example: "Home"
 *                 description: Label for the address
 *               address:
 *                 type: string
 *                 example: "123 Main Street, Anytown, USA"
 *                 description: Full address details
 *     responses:
 *       200:
 *         description: Address added successfully
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
 * /users/delete-address:
 *   delete:
 *     summary: Delete an address from the user's address list
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Address deleted successfully
 *       400:
 *         description: Deleting address failed
 *       401:
 *         description: Unauthorized
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
 *         description: Address added successfully
 *       400:
 *         description: Invalid input data
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
 * /users/update-address:
 *   post:
 *     summary: Update an existing address in the user's address list
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
 *             properties:
 *               label:
 *                 type: string
 *                 example: "Home"
 *                 description: Label for the address
 *               address:
 *                 type: string
 *                 example: "123 Main Street, Anytown, USA"
 *                 description: Full address details
 *     responses:
 *       200:
 *         description: Address updated successfully
 *       400:
 *         description:Failing to update address
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.put(ROUTE_UPDATE_ADDRESS, [auth], (req, res) => {
  const userController = new UserController();
  return userController.updateAddress(req, res);
});

/**
 * @swagger
 * /users/initialize-payment:
 *   post:
 *     summary: Initialize a Paystack payment
 *     description: Initializes a Paystack transaction for a user subscribing to a fitness plan. Returns an authorization URL that the user can use to complete payment.
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
 *               type:
 *                 type: string
 *                 example: "order | subscription"
 *                 description: The type of payment made
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
router.post(ROUTE_INITIALIZE_PAYMENT, auth, (req, res) => {
  const userController = new UserController();
  return userController.initializePayment(req, res);
});

/**
 * @swagger
 * /users/notification-preference:
 *   patch:
 *     tags:
 *       - User
 *     summary: Update user notification preferences
 *     description: Enable or disable email and WhatsApp notifications for the authenticated user.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
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
 *                   example: Notification preference updated
 *                 data:
 *                   type: object
 *                   properties:
 *                     whatsappNotification:
 *                       type: boolean
 *                       example: true
 *                     emailNotification:
 *                       type: boolean
 *                       example: false
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized (missing or invalid token)
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
 *     summary: Delete an user from the system
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       400:
 *         description: Deleting user failed
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.delete(ROUTE_DELETE_USER, [auth], (req, res) => {
  const userController = new UserController();
  return userController.deleteUser(req, res);
});

module.exports = router;
