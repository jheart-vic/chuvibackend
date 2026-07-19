const EXPIRES_AT = 10 * 60 * 1000
const DELIVERY_CHARGE = 1000


const ROLE = {
    INTAKE_AND_TAG: 'intake-and-tag',
    ADMIN: 'admin',
    QC: 'qc',
    PRESS: 'press',
    WASH_AND_DRY: 'wash-and-dry',
    SORT_AND_PRETREAT: 'sort-and-pretreat',
    USER: 'user',
    RIDER: 'rider',
    CUSTOMER_EXPERIENCE: 'customer-experience', // owns complaint cases
}
const SERVICE_PLATFORM = {
    GOOGLE: 'google',
    APPLE: 'apple',
    LOCAL: 'local',
}

const GENERAL_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    PENDING: 'pending',
    SUSPENDED: 'suspended',
}

const PICKUP_STATUS = {
    PENDING: 'pending',
    PICKED_UP: 'picked-up',
    FAILED: 'failed',
    SCHEDULED: 'scheduled',
    PICKUP_IN_PROGRESS: 'pickup-in-progress',
}

const DELIVERY_STATUS = {
    READY: 'ready',
    DELIVERED: 'delivered',
    OUT_FOR_DELIVERY: 'out-for-delivery',
    FAILED: 'failed',
}

const ACTIVITY_TYPE = {
    ORDER_CREATED: 'order-created',
    ORDER_PICKED: 'order-picked',
    ORDER_WASHING: 'order-washing',
    ORDER_IRONING: 'order-ironing',
    ORDER_CONFIRM: 'order-confirm',
    ORDER_FLAGGED: 'order-flagged',
    ORDER_DELIVERED: 'order-delivered',
    ORDER_UPDATED: 'order-updated',
    ORDER_STATUS_UPDATED: 'order-status-updated',
    PAYMENT_APPROVED: 'payment-approved',
    WALLET_TOP_UP: 'wallet-top-up',
    WALLET_ADJUSTMENT: 'wallet-adjustment',
    DISPATCH_PICKUP: 'dispatch-pickup',
    DISPATCH_DELIVERY: 'dispatch-delivery',
    TAG_AND_QUEUE: 'tag-and-queue',
    SORT_AND_PRETREAT: 'sort-and-pretreat',
    TOP_UP_REQUEST: 'top-up-request',
    ORDER_ITEM_WASH_CONFIRMED: 'order_item_wash_confirmed',
    ORDER_MOVED_TO_DRYING: 'order_moved_to_drying',
    ORDER_WASH_DRY_COMPLETED: 'order_wash_dry_completed',
    ORDER_ON_HOLD: 'order_on_hold',
    ORDER_RELEASED_FROM_HOLD: 'order_released_from_hold',
    ORDER_ITEM_PRESS_CONFIRMED: 'order_item_press_confirmed',
    ORDER_PRESS_COMPLETED: 'order_press_completed',
    ORDER_QC_PASSED: 'order_qc_passed',
    ORDER_PACKED_AND_SEALED: 'order_packed_and_sealed',
}

const STATION_STATUS = {
    INTAKE_AND_TAG_STATION: 'intake-and-tag-station',
    SORT_AND_PRETREAT_STATION: 'sort-and-pretreat-station',
    WASH_AND_DRY_STATION: 'wash-and-dry-station',
    PRESSING_AND_IRONING_STATION: 'pressing-and-ironing-station',
    QC_STATION: 'qc-station',
    PENDING: 'pending',
    ADMIN_STATION: 'admin-station',
    RIDER_STATION: 'rider-station',
}

const WASH_DURATION_MINUTES = { standard: 65, express: 45, same_day: 25 }
const DRY_DURATION_MINUTES = { standard: 65, express: 45, same_day: 25 }
const PRESS_DURATION_MINUTES = { standard: 65, express: 45, same_day: 25 }
const QC_DURATION_MINUTES = { standard: 25, express: 15, same_day: 10 }
const PICKUP_DURATION_MINUTES = 30  // flat estimate — no tier variation
const DELIVERY_DURATION_MINUTES = 45

const ORDER_STATUS = {
    PENDING: 'pending',
    HOLD: 'hold',
    QUEUE: 'queue',
    RECEIVED: 'received',
    PICKED_UP: 'picked-up',
    READY: 'ready',
    DELIVERED: 'delivered',
    OUT_FOR_DELIVERY: 'out-for-delivery',
    WASHING: 'washing',
    DRYING: 'drying',
    IRONING: 'ironing',
    QC: 'qc',
    SORT_AND_PRETREAT: 'sort-and-pretreat',
}
const PAYMENT_ORDER_STATUS = {
    SUCCESS: 'success',
    PENDING: 'pending',
    FAILED: 'failed',
}

const PAYMENT_METHOD = {
    // PAY_ON_DELIVERY: "pay-on-delivery",
    BANK_TRANFER: 'bank-transfer',
    PAYPAL: 'paypal',
    PAYSTACK: 'paystack',
    WALLET: 'wallet',
    CARD: 'card',
}

const NOTIFICATION_TYPE = {
    SYSTEM: 'system',
    ORDER_CREATED: 'order-created',
    ORDER_PICKED: 'order-picked',
    ORDER_WASHING: 'order-washing',
    ORDER_IRONING: 'order-ironing',
    ORDER_READY: 'order-ready',
    ORDER_DELIVERED: 'order-delivered',
    PAYMENT_APPROVED: 'payment-approved',
    WALLET_TOP_UP: 'wallet-top-up',
    WALLET_UPDATE: 'wallet-update',
    PICKUP_STARTED: 'pickup-started',
    PICKUP_FAILED: 'pickup-failed',
    DELIVERY_STARTED: 'delivery-started',
    ORDER_UPDATED: 'order-updated',
    ORDER_FLAGGED: 'order-flagged',
    ORDER_ON_HOLD: 'order_on_hold',
    TOP_UP_REQUEST: 'top-up-request',
    WALLET_ADJUSTMENT: 'wallet-adjustment',
    DISPATCH_ASSIGNMENT: 'dispatch-assignment',
    PAYMENT_UPDATE: 'payment-update',
    OFFER: 'offer',
    FEEDBACK: 'feedback',
    COMPLAINT: 'complaint',
    RECOVERY: 'recovery',
    REFERRAL: 'referral',
}

const ORDER_SERVICE_TYPE = {
    WASHING_ONLY: 'washing-only',
    IRONING_ONLY: 'ironing-only',
    WASH_AND_IRON: 'wash-and-iron',
}

const BILLING_TYPE = {
    PAY_PER_ITEM: 'pay-per-item',
    PAY_FROM_SUBSCRIPTION: 'pay-from-subscription',
    PAY_FROM_WALLET: 'pay-from-wallet'
}

const SERVICE_TIERS = {
    CLASSIC: 'classic',
    PREMIUM: 'premium',
    VIP: 'vip',
}

const DELIVERY_SPEED = {
    STANDARD: 'standard',
    EXPRESS: 'express',
    // VIP: 'vip',
    SAME_DAY: 'same-day',
}

const ORDER_CHANNEL = {
    WHATSAPP: 'whatsapp',
    WEBSITE: 'website',
    OFFICE: 'office',
}

const PICK_UP_TIME = {
    MORNING_TIME: '10am-12pm',
    EVENING_TIME: '4pm-6pm',
}

const ORDER_ITEMS = {
    SHIRT: 'shirt',
    TROUSER: 'trouser',
    DRESS: 'dress',
    SUIT: 'suit',
    SKIRT: 'skirt',
    JACKET: 'jacket',
    BLOUSE: 'blouse',
    JEANS: 'jeans',
    BEDSHEET: 'bedsheet',
    CURTAIN: 'curtain',
    BLANKET: 'blanket',
    TOWEL: 'towel',
}
const STANDARD_ORDER_ITEMS = {
    SHIRT: 'shirt',
    TROUSER: 'trouser',
    DRESS: 'dress',
    SKIRT: 'skirt',
    JACKET: 'jacket',
    BLOUSE: 'blouse',
    JEANS: 'jeans',
    TOWEL: 'towel',
}

const TAG_STATE = {
    DAMAGED: 'damaged',
    STAINED: 'stained',
    PRETREAT: 'pretreat',
    DELICATE: 'delicate',
}

const TAG_COLOR = {
    WHITE: 'white',
    DARK: 'dark',
    LIGHT: 'light',
}

const COLOR_GROUP = {
    WHITE: 'white',
    COLORED: 'colored',
}

const FABRIC_TYPE = {
    DELICATE: 'delicate',
    LIGHT: 'light',
    HEAVY: 'heavy',
}

const PRETREATMENT_OPTIONS = {
    STAIN_TREATMENT: 'stain_treatment_required',
    ODOR_REMOVAL: 'odor_removal',
    SPOT_CLEANING: 'spot_cleaning',
    SPECIAL_DETERGENT: 'special_detergent',
    FABRIC_SOFTENER_PREP: 'fabric_softener_prep',
    NO_PRETREATMENT: 'no_pretreatment_needed',
}

const DAMAGE_RISK_FLAGS = {
    TEARS_DAMAGE: 'tears_damage',
    COLOR_BLEEDING_RISK: 'color_bleeding_risk',
    SHRINK_RISK: 'shrink_risk',
    MISSING_PARTS: 'missing_parts',
}

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp']

const ITEM_ENUM_TYPES = Object.values(ORDER_ITEMS)
const STANDARD_ITEMS_ENUM_TYPES = Object.values(STANDARD_ORDER_ITEMS)

const HOLD_REASONS = {
    [ROLE.INTAKE_AND_TAG]: [
        'item_missing',
        'item_mismatched',
        'wrong_label',
        'damaged_on_arrival',
        'other',
    ],
    [ROLE.SORT_AND_PRETREAT]: [
        'fabric_incompatible',
        'item_missing',
        'item_mismatched',
        'stain_requires_special_treatment',
        'color_bleed_risk',
        'other',
    ],
    [ROLE.WASH_AND_DRY]: [
        'item_missing',
        'item_mismatched',
        'color_bleed_risk',
        'fabric_damage_risk',
        'other',
    ],
    [ROLE.PRESS]: [
        'item_missing',
        'item_mismatched',
        'fabric_damage_risk',
        'delicate_requires_attention',
        'other',
    ],
    [ROLE.QC]: [
        'item_missing',
        'item_mismatched',
        'quality_not_met',
        'wrong_item_returned',
        'packaging_issue',
        'other',
    ],
}

const AUDIT_LOG_CATEGORIES = {
    ORDER: 'order',
    PAYMENT: 'payment',
    WALLET: 'wallet',
    DISPATCH: 'dispatch',
    SYSTEM: 'system',
    AUTH: 'auth',
    PRESSING: 'pressing',
    QC: 'qc',
    RIDER: 'rider',
    USER: 'user',
    SORT: 'sort',
    WASH: 'wash',
    CRM: 'crm',
    COMMUNICATION: 'communication',
    OFFER: 'offer',
    RECOVERY: 'recovery',
}

// ─── CRM ────────────────────────────────────────────────────────────────────

const CRM_STAGE = {
    LEAD: 'lead',
    FIRST_ORDER: 'first-order',
    ACTIVE: 'active',
    LOYAL: 'loyal',
    DORMANT: 'dormant',
    REACTIVATED: 'reactivated',
}

const CRM_TAG = {
    // channel
    WHATSAPP: 'whatsapp',
    WEBSITE: 'website',
    WALK_IN: 'walk-in',
    // service preference
    EXPRESS_USER: 'express-user',
    STANDARD_USER: 'standard-user',
    // order pattern
    HIGH_VOLUME: 'high-volume',
    LOW_VOLUME: 'low-volume',
    HIGH_FREQUENCY: 'high-frequency',
    LOW_FREQUENCY: 'low-frequency',
    // relationship
    NEW_CUSTOMER: 'new-customer',
    REPEAT_CUSTOMER: 'repeat-customer',
    LOYAL_CUSTOMER: 'loyal-customer',
    REACTIVATED_CUSTOMER: 'reactivated-customer',
    // lead status
    FRESH_LEAD: 'fresh-lead',
    PROSPECT: 'prospect',
    // retention
    COMPLAINT: 'complaint',
    RECOVERY_REQUIRED: 'recovery-required',
    CHURNED: 'churned',
}

// Tag groups: automatic tags are replaced within their group on every
// recompute; manual tags are only ever touched by staff.
const CRM_TAG_GROUPS = {
    CHANNEL: [CRM_TAG.WHATSAPP, CRM_TAG.WEBSITE, CRM_TAG.WALK_IN],
    SERVICE_PREFERENCE: [CRM_TAG.EXPRESS_USER, CRM_TAG.STANDARD_USER],
    ORDER_VOLUME: [CRM_TAG.HIGH_VOLUME, CRM_TAG.LOW_VOLUME],
    ORDER_FREQUENCY: [CRM_TAG.HIGH_FREQUENCY, CRM_TAG.LOW_FREQUENCY],
    RELATIONSHIP: [
        CRM_TAG.NEW_CUSTOMER,
        CRM_TAG.REPEAT_CUSTOMER,
        CRM_TAG.LOYAL_CUSTOMER,
        CRM_TAG.REACTIVATED_CUSTOMER,
    ],
    LEAD_STATUS: [CRM_TAG.FRESH_LEAD, CRM_TAG.PROSPECT],
}

const CRM_MANUAL_TAGS = [CRM_TAG.COMPLAINT, CRM_TAG.RECOVERY_REQUIRED]

const CRM_WORKFLOW = {
    LEAD: 'lead',
    POST_DELIVERY: 'post-delivery',
    REACTIVATION: 'reactivation',
    BROADCAST: 'broadcast',
}

const CRM_MESSAGE_TYPE = {
    // lead workflow
    LEAD_WELCOME: 'lead-welcome',
    LEAD_QUALIFY: 'lead-qualify',
    LEAD_OFFER: 'lead-offer',
    LEAD_CLOSE: 'lead-close',
    LEAD_REMINDER_1: 'lead-reminder-1',
    LEAD_REMINDER_2: 'lead-reminder-2',
    LEAD_MARK_PROSPECT: 'lead-mark-prospect', // internal action, no message sent
    // post-delivery workflow
    DELIVERY_CONFIRMATION: 'delivery-confirmation',
    FEEDBACK_REQUEST: 'feedback-request',
    REORDER_PROMPT: 'reorder-prompt',
    // reactivation workflow
    REACTIVATION_1: 'reactivation-1',
    REACTIVATION_2: 'reactivation-2',
    REACTIVATION_3: 'reactivation-3',
    REACTIVATION_MARK_CHURNED: 'reactivation-mark-churned', // internal action
    // broadcasts
    PROSPECT_BROADCAST: 'prospect-broadcast',
    CHURN_BROADCAST: 'churn-broadcast',
}

// message types that trigger an internal state change instead of a send
const CRM_INTERNAL_ACTIONS = [
    CRM_MESSAGE_TYPE.LEAD_MARK_PROSPECT,
    CRM_MESSAGE_TYPE.REACTIVATION_MARK_CHURNED,
]

const CRM_MESSAGE_STATUS = {
    PENDING: 'pending',
    SENT: 'sent',
    CANCELLED: 'cancelled',
    FAILED: 'failed',
}

const CRM_BROADCAST_LIST = {
    PROSPECT: 'prospect',
    CHURN: 'churn',
}

// ─── Wallet credits (Offer/Referral/Recovery reward value inside the wallet) ─

// Sub-balances inside the one customer wallet. Cash stays as Wallet.balance;
// these are service-value credits — never withdrawable as cash.
const CREDIT_TYPE = {
    LAUNDRY: 'laundry',
    REFERRAL: 'referral',
    RECOVERY: 'recovery',
    PROMOTIONAL: 'promotional',
}

const CREDIT_STATUS = {
    ACTIVE: 'active', // has remaining value and is not expired
    EXHAUSTED: 'exhausted', // fully spent
    EXPIRED: 'expired', // expiry date passed with value unused
    REVERSED: 'reversed', // pulled back by an admin correction
}

// Which system created a credit / wallet movement (for audit + dedupe)
const CREDIT_SOURCE = {
    OFFER: 'offer',
    REFERRAL: 'referral',
    RECOVERY: 'recovery',
    ADMIN: 'admin',
    ORDER: 'order',
}

const WALLET_TX_TYPE = {
    CREDIT: 'credit',
    DEBIT: 'debit',
    REVERSAL: 'reversal',
    EXPIRY: 'expiry',
    MANUAL_ADJUSTMENT: 'manual-adjustment',
}

// ─── Communication layer (the "smart messenger") ────────────────────────────

// Delivery channels. WhatsApp joins later behind the same facade.
const COMM_CHANNEL = {
    IN_APP: 'in-app',
    SMS: 'sms',
}

const COMM_STATUS = {
    PENDING: 'pending',
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read',
    FAILED: 'failed',
}

// ─── Offer System (the "smart offer linker") ────────────────────────────────

const OFFER_TYPE = {
    PERSONAL: 'personal', // linked to individual customers on an event
    PROMOTIONAL: 'promotional', // campaigns for eligible groups
    BASELINE: 'baseline', // permanent policies, applied by rule at booking
}

const OFFER_STATUS = {
    DRAFT: 'draft',
    ACTIVE: 'active',
    PAUSED: 'paused',
    EXPIRED: 'expired',
    ARCHIVED: 'archived',
}

// customer-offer linkage lifecycle
const CUSTOMER_OFFER_STATUS = {
    ASSIGNED: 'assigned',
    VIEWED: 'viewed',
    ATTACHED: 'attached', // selected during booking
    REDEEMED: 'redeemed', // connected order delivered
    EXPIRED: 'expired',
    CANCELLED: 'cancelled',
}

// which event a personal offer is linked on — the trigger is the bridge from
// CRM/referral/recovery events to the one configured offer for that moment
const OFFER_TRIGGER = {
    FIRST_EXPERIENCE: 'first-experience', // new lead qualifies
    SECOND_ORDER: 'second-order', // first order completed
    LOYALTY: 'loyalty', // every 5 completed orders
    REFERRAL_REWARD: 'referral-reward', // referred friend's first completed order
    RECOVERY: 'recovery', // approved after complaint resolution
    REACTIVATION: 'reactivation', // customer went dormant
    MANUAL: 'manual', // staff-assigned only
    // exclusive offers unlocked permanently on reaching a referral level
    LEVEL_PROMOTER: 'level-promoter',
    LEVEL_AMBASSADOR: 'level-ambassador',
    LEVEL_CHAMPION: 'level-champion',
}

const OFFER_BENEFIT_TYPE = {
    ORDER_DISCOUNT: 'order-discount', // percent or fixed amount off
    FREE_PICKUP: 'free-pickup',
    FREE_DELIVERY: 'free-delivery',
    FREE_ITEMS: 'free-items', // pay N eligible items, get M free
    EXTRA_LAUNDRY_CREDIT: 'extra-laundry-credit', // spend X get Y wallet credit
}

// ─── Referral System ("smart recommendation tracker") ───────────────────────

const REFERRAL_STATUS = {
    PENDING: 'pending', // code shared, nobody registered yet (reserved)
    REGISTERED: 'registered', // referred customer registered
    FIRST_ORDER: 'first-order', // referred placed first order
    COMPLETED: 'completed', // referred's first order delivered → qualifies
    REWARDED: 'rewarded', // referrer reward granted
}

const REFERRAL_SOURCE = {
    CODE: 'code',
    LINK: 'link',
}

const REFERRAL_REWARD_STATUS = {
    NONE: 'none',
    DEFERRED: 'deferred', // earned but referrer had an open complaint
    GRANTED: 'granted',
}

// Permanent advocacy tiers. A customer's level is earned by LIFETIME successful
// referrals and is never lost; higher levels permanently raise the referral
// reward % and unlock an exclusive offer. The monthly free-laundry perk is the
// only activity-gated benefit — granted in any month the monthly target is met,
// paused (never granted) otherwise, and auto-restored when the target is met again.
const REFERRAL_LEVEL = {
    MEMBER: 'member',
    PROMOTER: 'promoter',
    AMBASSADOR: 'ambassador',
    CHAMPION: 'champion',
}

// ─── Feedback & Recovery ("smart satisfaction manager") ─────────────────────

const FEEDBACK_TYPE = {
    SATISFIED: 'satisfied',
    NEUTRAL: 'neutral',
    COMPLAINT: 'complaint',
}

const FEEDBACK_STATUS = {
    PENDING: 'pending',
    COMPLETED: 'completed',
}

// complaint case status machine (spec order)
const COMPLAINT_STATUS = {
    SUBMITTED: 'submitted',
    UNDER_REVIEW: 'under-review',
    AWAITING_ITEM: 'awaiting-item',
    ITEM_RECEIVED: 'item-received',
    RECOVERY_IN_PROGRESS: 'recovery-in-progress',
    READY: 'ready',
    RESOLVED: 'resolved', // recovery done, awaiting customer confirmation
    CUSTOMER_CONFIRMED: 'customer-confirmed', // terminal (closed)
    REOPENED: 'reopened', // customer rejected → back into review
}

// allowed forward transitions; REOPENED and escalation handled separately
const COMPLAINT_TRANSITIONS = {
    submitted: ['under-review'],
    'under-review': ['awaiting-item', 'recovery-in-progress', 'resolved'],
    'awaiting-item': ['item-received'],
    'item-received': ['recovery-in-progress'],
    'recovery-in-progress': ['ready'],
    ready: ['resolved'],
    resolved: ['customer-confirmed', 'reopened'],
    reopened: ['under-review'],
    'customer-confirmed': [],
}

const RECOVERY_ACTION = {
    REWASH: 'rewash',
    REWORK: 'rework',
    REPAIR: 'repair',
    REPLACE: 'replace',
    COMPENSATE: 'compensate',
}

const RECOVERY_CREDIT_STATUS = {
    PENDING_APPROVAL: 'pending-approval',
    APPROVED: 'approved',
    REJECTED: 'rejected',
}

const ESCALATION_REASON = {
    MISSING_ITEM: 'missing-item',
    SERIOUS_DAMAGE: 'serious-damage',
    REPLACEMENT_REQUIRED: 'replacement-required',
    COMPENSATION_REQUIRED: 'compensation-required',
    COMPLAINT_REOPENED: 'complaint-reopened',
    REVIEW_OVERDUE: 'review-overdue',
    RESOLUTION_OVERDUE: 'resolution-overdue',
    CUSTOMER_REJECTED: 'customer-rejected',
}

// in-app chat
const CONVERSATION_TYPE = {
    COMPLAINT: 'complaint',
    SUPPORT: 'support', // Phase 6 in-app bot
}

const CHAT_SENDER = {
    CUSTOMER: 'customer',
    STAFF: 'staff',
    BOT: 'bot',
    SYSTEM: 'system', // automated status updates
}

// ─── In-app bot (Phase 6, "smart assistant") ────────────────────────────────
// The LLM ONLY classifies a customer message into ONE of these intents; a
// deterministic workflow then runs against the existing systems. High-risk
// actions have NO intent/tool — they can only ever reach a human (handoff).
const BOT_INTENT = {
    GREETING: 'greeting',
    ORDER_STATUS: 'order-status',
    WALLET_BALANCE: 'wallet-balance',
    VIEW_OFFERS: 'view-offers',
    REFERRAL_INFO: 'referral-info',
    APPLY_REFERRAL_CODE: 'apply-referral-code',
    UPDATE_DETAILS: 'update-details', // phone / pickup address only
    BOOKING_GUIDE: 'booking-guide', // guided flow + estimate; never places the order
    SUBMIT_FEEDBACK: 'submit-feedback',
    FILE_COMPLAINT: 'file-complaint',
    TALK_TO_HUMAN: 'talk-to-human',
    UNKNOWN: 'unknown',
}

// Which system requested the message — the messenger never decides on its own.
const COMM_SOURCE_SYSTEM = {
    CRM: 'crm',
    OFFER: 'offer',
    ORDER: 'order',
    FEEDBACK: 'feedback',
    RECOVERY: 'recovery',
    REFERRAL: 'referral',
    BROADCAST: 'broadcast',
    SYSTEM: 'system',
}

module.exports = {
    EXPIRES_AT,
    DELIVERY_CHARGE,
    ROLE,
    SERVICE_PLATFORM,
    GENERAL_STATUS,
    ORDER_STATUS,
    PAYMENT_ORDER_STATUS,
    PAYMENT_METHOD,
    NOTIFICATION_TYPE,
    ORDER_SERVICE_TYPE,
    BILLING_TYPE,
    SERVICE_TIERS,
    DELIVERY_SPEED,
    PICK_UP_TIME,
    MAX_FILE_BYTES,
    ALLOWED_MIMES,
    ORDER_ITEMS,
    STANDARD_ORDER_ITEMS,
    STANDARD_ITEMS_ENUM_TYPES,
    ITEM_ENUM_TYPES,
    ORDER_CHANNEL,
    TAG_STATE,
    TAG_COLOR,
    COLOR_GROUP,
    PRETREATMENT_OPTIONS,
    DAMAGE_RISK_FLAGS,
    FABRIC_TYPE,
    PICKUP_STATUS,
    DELIVERY_STATUS,
    ACTIVITY_TYPE,
    STATION_STATUS,
    WASH_DURATION_MINUTES,
    DRY_DURATION_MINUTES,
    PRESS_DURATION_MINUTES,
    PICKUP_DURATION_MINUTES,
    DELIVERY_DURATION_MINUTES,
    QC_DURATION_MINUTES,
    AUDIT_LOG_CATEGORIES,
    CRM_STAGE,
    CRM_TAG,
    CRM_TAG_GROUPS,
    CRM_MANUAL_TAGS,
    CRM_WORKFLOW,
    CRM_MESSAGE_TYPE,
    CRM_INTERNAL_ACTIONS,
    CRM_MESSAGE_STATUS,
    CRM_BROADCAST_LIST,
    CREDIT_TYPE,
    CREDIT_STATUS,
    CREDIT_SOURCE,
    WALLET_TX_TYPE,
    COMM_CHANNEL,
    COMM_STATUS,
    COMM_SOURCE_SYSTEM,
    OFFER_TYPE,
    OFFER_STATUS,
    CUSTOMER_OFFER_STATUS,
    OFFER_TRIGGER,
    OFFER_BENEFIT_TYPE,
    FEEDBACK_TYPE,
    FEEDBACK_STATUS,
    COMPLAINT_STATUS,
    COMPLAINT_TRANSITIONS,
    RECOVERY_ACTION,
    RECOVERY_CREDIT_STATUS,
    ESCALATION_REASON,
    CONVERSATION_TYPE,
    CHAT_SENDER,
    REFERRAL_STATUS,
    REFERRAL_SOURCE,
    REFERRAL_REWARD_STATUS,
    REFERRAL_LEVEL,
    BOT_INTENT,
}
