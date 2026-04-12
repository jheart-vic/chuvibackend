
//users
exports.ROUTE_REGISTER = '/register'
exports.ROUTE_APPLE_SIGNUP = '/apple-signup'
exports.ROUTE_GOOGLE_SIGNUP = '/google-signup'
exports.ROUTE_LOGIN = '/login'
exports.ROUTE_FORGOT_PASSWORD = '/forgot-password'
exports.ROUTE_RESET_PASSWORD = '/reset-password'
exports.ROUTE_SEND_OTP = '/send-otp'
exports.ROUTE_RESEND_OTP = '/resend-otp'
exports.ROUTE_VERIFY_OTP = '/verify-otp'
exports.ROUTE_VERIFY_PASSWORD_OTP = '/verify-password-otp'
exports.ROUTE_REFRESH_TOKEN = '/refresh-token'
exports.ROUTE_VERIFY_EMAIL = '/verify-email'
exports.ROUTE_GET_ACCOUNT = '/get-account'
exports.ROUTE_PROFILE_IMAGE_UPLOAD = '/profile-image-upload'
exports.ROUTE_UPDATE_ADDRESS = '/update-address/:addressId'
exports.ROUTE_ADD_ADDRESS = '/add-address'
exports.ROUTE_DELETE_ADDRESS = '/delete-address/:addressId'
exports.ROUTE_GET_ADDRESS = '/get-address'
exports.ROUTE_UPDATE_USER = '/update-user'
exports.ROUTE_NOTITICATION_PREFERENCE = '/notification-preference'
exports.ROUTE_CHANGE_PASSWORD = '/change-password'
exports.ROUTE_DELETE_USER = '/delete-user'
exports.ROUTE_INITIALIZE_PAYMENT = '/initialize-payment'
exports.ROUTE_INITIALIZE_ORDER_PAYMENT = '/initialize-order-payment'
exports.ROUTE_GET_USER_NOTIFICATIONS = '/get-user-notifications'
exports.ROUTE_VERIFY_RESET_PASSWORD_OTP = '/verify-reset-password-otp'

// Intake User
exports.ROUTE_INTAKE_USER_REFRESH_TOKEN = '/intake-user/refresh-token'
exports.ROUTE_INTAKE_USER_REGISTER = '/intake-user/register'
exports.ROUTE_INTAKE_USER_APPLE_SIGNUP = '/intake-user/apple-signup'
exports.ROUTE_INTAKE_USER_GOOGLE_SIGNUP = '/intake-user/google-signup'
exports.ROUTE_INTAKE_USER_LOGIN = '/intake-user/login'
exports.ROUTE_INTAKE_USER_FORGOT_PASSWORD = '/intake-user/forgot-password'
exports.ROUTE_INTAKE_USER_RESET_PASSWORD = '/intake-user/reset-password'
exports.ROUTE_INTAKE_USER_SEND_OTP = '/intake-user/send-otp'
exports.ROUTE_INTAKE_USER_RESEND_OTP = '/intake-user/resend-otp'
exports.ROUTE_INTAKE_USER_VERIFY_OTP = '/intake-user/verify-otp'
exports.ROUTE_INTAKE_USER_VERIFY_EMAIL = '/intake-user/verify-email'
exports.ROUTE_INTAKE_USER_VERIFY_RESET_PASSWORD_OTP = '/intake-user/verify-reset-password-otp'



// QC User
exports.ROUTE_QC_USER_REFRESH_TOKEN = '/qc-user/refresh-token'
exports.ROUTE_QC_USER_REGISTER = '/qc-user/register'
exports.ROUTE_QC_USER_APPLE_SIGNUP = '/qc-user/apple-signup'
exports.ROUTE_QC_USER_GOOGLE_SIGNUP = '/qc-user/google-signup'
exports.ROUTE_QC_USER_LOGIN = '/qc-user/login'
exports.ROUTE_QC_USER_FORGOT_PASSWORD = '/qc-user/forgot-password'
exports.ROUTE_QC_USER_RESET_PASSWORD = '/qc-user/reset-password'
exports.ROUTE_QC_USER_SEND_OTP = '/qc-user/send-otp'
exports.ROUTE_QC_USER_RESEND_OTP = '/qc-user/resend-otp'
exports.ROUTE_QC_USER_VERIFY_OTP = '/qc-user/verify-otp'
exports.ROUTE_QC_USER_VERIFY_EMAIL = '/qc-user/verify-email'
exports.ROUTE_QC_USER_VERIFY_RESET_PASSWORD_OTP = '/qc-user/verify-reset-password-otp'




// Admin
exports.ROUTE_ADMIN_REGISTER = '/admin/register'
exports.ROUTE_ADMIN_LOGIN = '/admin/login'
exports.ROUTE_DASHBOARD_STATS = '/dashboard-stats'


// book orders
exports.ROUTE_CREATE_BOOK_ORDER = '/create-book-order'
exports.ROUTE_ADMIN_ORDER_DETAILS = '/admin-order-details'
exports.ROUTE_GET_ORDER_DETAIL = '/get-order-detail'
exports.ROUTE_UPDATE_BOOK_ORDER_PAYMENT_STATUS = '/update-book-order-payment-status'
exports.ROUTE_UPDATE_BOOK_ORDER_STAGE = '/'
exports.ROUTE_BOOK_ORDER_HISTORY = '/book-order-history'
exports.ROUTE_BOOK_ORDER = '/book-order'
exports.ROUTE_FLAG_ORDER_ID = '/flag-order/:id'
exports.ROUTE_PROCEED_TO_TAG_ID = '/proceed-to-tag/:id'
exports.ROUTE_CONFIRM_TAG_ID_ITEM_ID = '/confirm-tag/:id/item/:itemId'
exports.ROUTE_UNDO_CONFIRM_TAG_ID_ITEM_ID = '/undo-confirm-tag/:id/item/:itemId'
exports.ROUTE_PROCEED_TO_SORT_AND_PRETREAT_ID = '/proceed-to-sort-and-pretreat/:id'
exports.ROUTE_SEND_TOP_UP_REQUEST_ID = '/send-top-up-request/:id'
exports.ROUTE_ADJUST_WALLET = '/adjust-wallet/:id/:userId'
exports.ROUTE_GET_USER_WALLET_ID = '/get-user-wallet/:id'
exports.ROUTE_PICKABLE_ORDERS = '/pickable-orders'
exports.ROUTE_DELIVERABLE_ORDERS = '/deliverable-orders'
exports.ROUTE_ASSIGN_RIDER_ID_TO_PICKUP_ORDER_ID = '/assign-rider/:riderId/pickup-order/:id'
exports.ROUTE_ASSIGN_RIDER_ID_TO_DEVLIVERY_ORDER_ID = '/assign-rider/:riderId/delivery-order/:id'

//wallet
exports.ROUTE_WALLET_TOP_UP = "/wallet-top-up"
exports.ROUTE_PAY_WITH_WALLET = "/pay-with-wallet"
exports.ROUTE_FETCH_USER_TRANSACTIONS = "/fetch-user-transactions"
exports.ROUTE_WALLET_BALANCE = "/wallet-balance"
exports.ROUTE_GET_MONTHLY_TRANSACTIONS = "/get-monthly-transactions"
exports.ROUTE_UPLOAD_PAYMENT_PROOF = "/upload-payment-proof"

//subscription
exports.ROUTE_CREATE_PLAN = '/create-plan'
exports.ROUTE_GET_PLANS = '/get-plans'
exports.ROUTE_GET_PLAN = '/get-plan'
exports.ROUTE_UPDATE_PLAN = '/update-plan'
exports.ROUTE_DELETE_PLAN = '/delete-plan'
exports.ROUTE_SUBSCRIBE_PLAN = '/subscribe-plan'
exports.ROUTE_CANCEL_SUBSCRIPTION = '/cancel-subscription'
exports.ROUTE_CURRENT_SUBSCRIPTION = '/current-subscription'


//seeding
exports.ROUTE_SEED = '/seed'
exports.ROUTE_SEED_PLAN = '/seed-plan'

//upload images - UTILS
exports.ROUTE_IMAGE_UPLOAD_MULTIPLE = '/image-upload-multiple'
exports.ROUTE_IMAGE_UPLOAD_SINGLE = '/image-upload-single'
