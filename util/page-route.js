
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
exports.ROUTE_GET_DASHBOARD = '/get-dashboard'
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
exports.ROUTE_INTAKE_USER_DASHBOARD_STATS = '/dashboard-stats'
exports.ROUTE_INTAKE_GENERATE_ALL_TAGS = '/generate-all-tags/:id'
exports.ROUTE_INTAKE_COMPLETE_TAGGING  = '/complete-tagging/:id'
exports.ROUTE_INTAKE_GET_DRAFTS        = '/drafts'
exports.ROUTE_INTAKE_GET_TAGGING_QUEUE   = '/tagging-queue'
exports.ROUTE_INTAKE_USER_GET_HOLD       = '/orders/hold'
exports.ROUTE_INTAKE_USER_RELEASE         = '/hold/:id/release'



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
exports.ROUTE_QC_DASHBOARD              = '/dashboard'
exports.ROUTE_QC_QUEUE                  = '/orders/queue'
exports.ROUTE_QC_QUEUE_SINGLE           = '/order/queue/:id'
exports.ROUTE_QC_CONFIRM_ITEM           = '/order/queue/:id/items/:itemId/confirm'
exports.ROUTE_QC_UNDO_CONFIRM_ITEM      = '/order/queue/:id/items/:itemId/undo-confirm'
exports.ROUTE_QC_PASS_ORDER             = '/order/queue/:id/pass'
exports.ROUTE_QC_PACK_AND_SEAL     = '/orders/pack-and-seal'
exports.ROUTE_QC_PACK_AND_SEAL_DETAIL   = '/order/pack-and-seal/:id'
exports.ROUTE_QC_PACK_AND_SEAL_COMPLETE = '/order/pack-and-seal/:id/complete'
exports.ROUTE_QC_READY_ORDERS           = '/orders/ready'
exports.ROUTE_QC_HOLD                   = '/order/queue/:id/items/:itemId/hold'
exports.ROUTE_QC_GET_HOLD               = '/orders/hold'
exports.ROUTE_QC_RELEASE                = '/order/hold/:id/release'
exports.ROUTE_QC_HISTORY                = '/orders/history'
exports.ROUTE_QC_HISTORY_TIMELINE       = '/order/history/:id/timeline'

//sortandpretreat

exports.ROUTE_SORT_AND_PRETREAT_REGISTER = "/register";
exports.ROUTE_SORT_AND_PRETREAT_GOOGLE_SIGNUP = "/google-signup";
exports.ROUTE_SORT_AND_PRETREAT_APPLE_SIGNUP = "/apple-signup";
exports.ROUTE_SORT_AND_PRETREAT_LOGIN = "/login";
exports.ROUTE_SORT_AND_PRETREAT_FORGOT_PASSWORD = "/forgot-password";
exports.ROUTE_SORT_AND_PRETREAT_VERIFY_RESET_PASSWORD_OTP = "/verify-reset-password-otp";
exports.ROUTE_SORT_AND_PRETREAT_RESET_PASSWORD = "/reset-password";
exports.ROUTE_SORT_AND_PRETREAT_VERIFY_OTP = "/verify-otp";
exports.ROUTE_SORT_AND_PRETREAT_RESEND_OTP = "/resend-otp";
exports.ROUTE_SORT_AND_PRETREAT_VERIFY_EMAIL = "/verify-email";
exports.ROUTE_SORT_AND_PRETREAT_ORDER_QUEUE = "/orders/queue";
exports.ROUTE_SORT_AND_PRETREAT_SINGLE_ORDER = "/order/:id";
exports.ROUTE_SORT_AND_PRETREAT_UPDATE_ITEM = "/order/:id/items/:itemId/sort-details";
exports.ROUTE_SORT_AND_PRETREAT_MARK_ITEM_SORTED = "/order/:id/items/:itemId/mark-sorted";
exports.ROUTE_SORT_AND_PRETREAT_UNMARK_SORTED_ITEM = "/order/:id/items/:itemId/undo-sorted";
exports.ROUTE_SORT_AND_PRETREAT_MARK_ALL_AS_SORTED = "/order/:id/mark-all-sorted";
exports.ROUTE_SORT_AND_PRETREAT_MARK_AS_PRETREATED = "/order/:id/items/:itemId/mark-pretreated";
exports.ROUTE_SORT_AND_PRETREAT_MARK_UNDO_PRETREATED = "/order/:id/items/:itemId/undo-pretreated";
exports.ROUTE_SORT_AND_PRETREAT_MARK_AS_FLAGGED = "/order/:id/items/:itemId/flag";
exports.ROUTE_SORT_AND_PRETREAT_NEXT_STAGE = "/order/:id/send-to-next-stage";
exports.ROUTE_SORT_AND_PRETREAT_GET_FLAGGED = "/orders/flagged";
exports.ROUTE_SORT_AND_PRETREAT_GET_COMPLETED = "/orders/completed";
exports.ROUTE_SORT_AND_PRETREAT_SORTED_ORDER_DETAIL = "/orders/completed/:id";
exports.ROUTE_SORT_AND_PRETREAT_FLAGGED_ORDER_DETAIL = "/orders/flagged/:id";
exports.ROUTE_SORT_AND_PRETREAT_WASHING = "/orders/washing";
exports.ROUTE_SORT_AND_PRETREAT_WASHING_SINGLE = "/order/washing/:id";
exports.ROUTE_SORT_AND_PRETREAT_IRONING = "/orders/ironing";
exports.ROUTE_SORT_AND_PRETREAT_IRONING_SINGLE = "/order/ironing/:id";
exports.ROUTE_SORT_AND_PRETREAT_HISTORY = "/orders/history";
exports.ROUTE_SORT_AND_PRETREAT_HISTORY_TIMELINE = "/order/history/:id/timeline";
exports.ROUTE_SORT_AND_PRETREAT_GET_DASHBOARD = "/dashboard";
exports.ROUTE_SORT_AND_PRETREAT_HOLD = "/order/:id/items/:itemId/hold";
exports.ROUTE_SORT_AND_PRETREAT_GET_HOLD = "/orders/hold";
exports.ROUTE_SORT_AND_PRETREAT_RELEASE  = "/order/hold/:id/release";

// wash and dry
exports.ROUTE_WASH_AND_DRY_UNMARK_DASHBOARD = "/dashboard";
exports.ROUTE_WASH_AND_DRY_QUEUE = "/orders/queue";
exports.ROUTE_WASH_AND_DRY_QUEUE_SINGLE = "/order/queue/:id";
exports.ROUTE_WASH_AND_DRY_CONFIRM_FOR_WASHING = "/order/queue/:id/items/:itemId/confirm-washing";
exports.ROUTE_WASH_AND_DRY_UNDO_CONFIRM_FOR_WASHING = "/order/queue/:id/items/:itemId/undo-washing";
exports.ROUTE_WASH_AND_DRY_HOLD = "/order/queue/:id/items/:itemId/hold";
exports.ROUTE_WASH_AND_DRY_GET_ACTIVE_WASHING = "/orders/active-wash";
exports.ROUTE_WASH_AND_DRY_MOVE_TO_DRYING = "/order/active-wash/:id/move-to-drying";
exports.ROUTE_WASH_AND_ACTIVE_DRYING = "/orders/active-dry";
exports.ROUTE_WASH_AND_DRY_MARK_COMPLETE = "/order/active-dry/:id/complete";
exports.ROUTE_WASH_AND_DRY_GET_HOLD = "/orders/hold";
exports.ROUTE_WASH_AND_DRY_RELEASE = "/order/hold/:id/release";
exports.ROUTE_WASH_AND_DRY_HISTORY = "/orders/history";
exports.ROUTE_WASH_AND_DRY_HISTORY_TIMELINE = "/order/history/:id/timeline";

// press and iron

// press and iron
exports.ROUTE_PRESS_IRON_DASHBOARD               = '/dashboard'
exports.ROUTE_PRESS_IRON_QUEUE                   = '/orders/queue'
exports.ROUTE_PRESS_IRON_QUEUE_SINGLE            = '/order/queue/:id'
exports.ROUTE_PRESS_IRON_CONFIRM_FOR_PRESSING    = '/order/queue/:id/items/:itemId/confirm-pressing'
exports.ROUTE_PRESS_IRON_UNDO_CONFIRM_FOR_PRESSING = '/order/queue/:id/items/:itemId/undo-pressing'
exports.ROUTE_PRESS_IRON_HOLD                    = '/order/queue/:id/items/:itemId/hold'
exports.ROUTE_PRESS_IRON_GET_ACTIVE_PRESS        = '/orders/active-press'
exports.ROUTE_PRESS_IRON_PRESS_DONE              = '/order/active-press/:id/complete'
exports.ROUTE_PRESS_IRON_GET_HOLD                = '/orders/hold'
exports.ROUTE_PRESS_IRON_RELEASE                 = '/order/hold/:id/release'
exports.ROUTE_PRESS_IRON_HISTORY                 = '/orders/history'
exports.ROUTE_PRESS_IRON_HISTORY_TIMELINE        = '/order/history/:id/timeline'

// Admin
exports.ROUTE_ADMIN_REGISTER = '/admin/register'
exports.ROUTE_ADMIN_LOGIN = '/admin/login'
exports.ROUTE_ADMIN_DASHBOARD_STATS = '/dashboard-stats'
exports.ROUTE_ADMIN_ORDER_MANAGEMENT = '/order-management'
exports.ROUTE_ADMIN_ORDER_ORDERID = '/order/:id'
exports.ROUTE_ADMIN_PAYMENT_VERIFICATION_QUEUE = '/payment-verification-queue'
exports.ROUTE_ADMIN_PAYMENT_PAYMENTID_ACCEPT = '/payment/:id/accept'
exports.ROUTE_ADMIN_PAYMENT_PAYMENTID_REJECT = '/payment/:id/reject'
exports.ROUTE_ADMIN_ORDER_BY_STATE = '/orders/by-state'
exports.ROUTE_ADMIN_DISPATCH_DATA_COUNT = '/dispatch/data-count'
exports.ROUTE_HOLD_ORDERS = '/hold-orders'
exports.ROUTE_ADMIN_ORDERS_ID_REASSIGN_STATION = '/orders/:id/reassign-station'



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
exports.ROUTE_GET_BOOK_ORDER_ID = '/get-book-order/:id'
exports.ROUTE_GET_PENDING_ORDERS = '/get-pending-orders'

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


//rider
exports.ROUTE_RIDER_ASSIGNED_DELIVERIES = '/assigned-deliveries'
exports.ROUTE_RIDER_ORDER_ID = '/order/:id'
exports.ROUTE_START_DELIVERY_ID = '/start-delivery/:id'
exports.ROUTE_RIDER_ACTIVE_DELIVERIES = '/active-deliveries'
exports.ROUTE_RIDER_MARK_DELIVERED_ID = '/mark-delivered/:id'
exports.ROUTE_RIDER_MARK_DELIVERY_FAILED_ID = '/mark-delivery-failed/:id'

//Notifications
exports.ROUTE_GET_ALL_USER_NOTIFICATIONS       = '/'
exports.ROUTE_GET_USER_NOTIFICATION        = '/:id'
exports.ROUTE_MARK_NOTIFICATION_AS_READ    = '/:id/mark-read'
exports.ROUTE_MARK_ALL_NOTIFICATIONS_AS_READ = '/mark-all-read'
exports.ROUTE_DELETE_NOTIFICATION          = '/:id'
exports.ROUTE_DELETE_ALL_NOTIFICATIONS     = '/'