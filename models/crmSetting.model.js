const mongoose = require('mongoose')
const {
    CRM_MESSAGE_TYPE,
    CRM_SCHEDULE_ANCHOR,
    CRM_SEND_SLOT,
} = require('../util/constants')

// Single-document settings for the CRM: message templates (admin-editable)
// and the thresholds behind the automatic tags. Seeded with defaults in
// config/setup.js. Templates support {{name}} and {{firstName}} placeholders.
const DEFAULT_TEMPLATES = {
    // Lead nurture (client 2026-08-28: 3-message sequence — Welcome Offer →
    // Offer 2 → Offer 3, mirroring Reactivation, then the prospect broadcast).
    [CRM_MESSAGE_TYPE.LEAD_WELCOME]:
        'Hi {{firstName}}! 👋 Welcome to Chuvi Laundry — we pick up, clean and deliver your laundry looking brand new. Enjoy free pickup on your first order. 🎁',
    [CRM_MESSAGE_TYPE.LEAD_OFFER]:
        "Still here for you, {{firstName}}! Your free first pickup with Chuvi Laundry is ready whenever you are — book in a couple of taps.",
    [CRM_MESSAGE_TYPE.LEAD_CLOSE]:
        "Hello {{firstName}}! Life gets busy — let Chuvi Laundry take laundry off your plate. Your welcome offer is still available. 😊",
    // ── Registered but never booked (client item #1, texts supplied verbatim
    // 2026-10-08 and revised the same day to drop "in a pickup window" so the
    // sequence can go live BEFORE window booking). COPIED EXACTLY, with one
    // substitution: the client writes `{name}` and says it is the first name,
    // which is this system's existing `{{firstName}}` placeholder. Do not
    // re-word these; the client edits them in CRM settings themselves once
    // window booking ships. Full record: blueprint/context/CRM-REGISTERED-NOT-BOOKED-TEXTS.md
    [CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1]:
        'Hello {{firstName}}, this is CHUVI. Your first order offer is still open: book any order from ₦4,000 and we pick up and deliver for free. After your first wash, we also add ₦1,000 to your CHUVI wallet for your next order.\nTo book: go to www.chuvilaundry.com, tap Book, choose your items and pick a pickup time.\nFor example, one duvet and two bedsheets come to ₦4,000.\nReply here if you want us to help you book.',
    [CRM_MESSAGE_TYPE.REG_NOT_BOOKED_2]:
        'Hello {{firstName}}, your free pickup and delivery ends tomorrow.\nIs there a duvet, bedsheets or white clothes you have been planning to give out? Book any order from ₦4,000 and we will come for it and bring it back clean, at no transport cost.\nBook here: www.chuvilaundry.com\nOr reply here and we will help you book.',
    [CRM_MESSAGE_TYPE.REG_NOT_BOOKED_3]:
        'Hello {{firstName}}, today is the last day of your free pickup and delivery.\nBook any order from ₦4,000 today and we pick up and deliver for free, plus ₦1,000 in your CHUVI wallet for your next wash.\nBook here: www.chuvilaundry.com\nAfter today, pickup and delivery are free only on orders from ₦8,000.',
    [CRM_MESSAGE_TYPE.ORDER_READY]:
        'Hi {{firstName}}, good news — your Chuvi Laundry order is clean, pressed and ready. 🧺 We\'ll be on our way to you shortly!',
    [CRM_MESSAGE_TYPE.DELIVERY_CONFIRMATION]:
        'Hi {{firstName}}, your Chuvi Laundry order has been delivered. Thank you for choosing us! 🧺',
    [CRM_MESSAGE_TYPE.FEEDBACK_REQUEST]:
        'Hi {{firstName}}, how did we do on your last order? Everything clean and crisp? Tap below to rate it — your feedback keeps us sharp.',
    [CRM_MESSAGE_TYPE.REACTIVATION_1]:
        "Hi {{firstName}}, we miss you at Chuvi Laundry! It's been a while — book a pickup and let us freshen things up.",
    [CRM_MESSAGE_TYPE.REACTIVATION_2]:
        'Hi {{firstName}}, still thinking of you! Come back to Chuvi Laundry and enjoy a special welcome-back treat on your next order.',
    [CRM_MESSAGE_TYPE.REACTIVATION_3]:
        "Hi {{firstName}}, one last nudge from Chuvi Laundry — we'd love to have you back. Your next pickup is just a message away.",
    // Broadcast variants (client 2026-08-28): each list rotates 3 interchangeable
    // messages A→B→C→A. The founder refreshes this copy by hand (~quarterly); the
    // system only rotates. The base key (no suffix) is a fallback if a variant is blank.
    [CRM_MESSAGE_TYPE.PROSPECT_BROADCAST]:
        'Hi {{firstName}}! Chuvi Laundry here — fresh clothes without the stress. Book a pickup today and see the difference.',
    'prospect-broadcast-a':
        'Hi {{firstName}}! Chuvi Laundry here — fresh clothes without the stress. Book a pickup today and see the difference.',
    'prospect-broadcast-b':
        "Hi {{firstName}}, still thinking about spotless laundry? Chuvi Laundry picks up, cleans and delivers — try us this week. 🧺",
    'prospect-broadcast-c':
        "Hi {{firstName}}! Give your weekend back — let Chuvi Laundry handle the washing and ironing. Book your first pickup today.",
    [CRM_MESSAGE_TYPE.CHURN_BROADCAST]:
        'Hi {{firstName}}, Chuvi Laundry here with something special for old friends — come back anytime, your next pickup is on us to arrange.',
    'churn-broadcast-a':
        'Hi {{firstName}}, Chuvi Laundry here with something special for old friends — come back anytime, your next pickup is on us to arrange.',
    'churn-broadcast-b':
        "Hi {{firstName}}, it's been a while! We'd love to have you back at Chuvi Laundry — check your offers and book a fresh pickup.",
    'churn-broadcast-c':
        "Hi {{firstName}}, your clothes miss us 😄 Come back to Chuvi Laundry — there's a little something waiting on your offers page.",
}

// §3: admin-configurable lead-message SEQUENCE + delivery timing. Each step is
// one message in the lead-nurture workflow; delayMinutes is measured from lead
// creation. Steps are staggered (distinct minutes) so messages never all fire in
// the same minute. `lead-mark-prospect` is the terminal tagging action, not a
// message. Admin edits this via PUT /crm/settings (admin only).
// Client 2026-08-28: reduced from 5 messages to 3 (Welcome Offer → Offer 2 →
// Offer 3), then the terminal mark-prospect action moves them to the prospect
// broadcast list. Delays are staggered defaults; the founder tunes them in the
// admin dashboard. (lead-qualify / lead-reminder-1 / lead-reminder-2 are retired
// — no longer in the default sequence, kept in the enum for old rows.)
const DEFAULT_LEAD_SCHEDULE = [
    { messageType: CRM_MESSAGE_TYPE.LEAD_WELCOME, enabled: true, delayMinutes: 0, cancelIfOrdered: true },
    { messageType: CRM_MESSAGE_TYPE.LEAD_OFFER, enabled: true, delayMinutes: 2880, cancelIfOrdered: true }, // +2 days
    { messageType: CRM_MESSAGE_TYPE.LEAD_CLOSE, enabled: true, delayMinutes: 7200, cancelIfOrdered: true }, // +5 days
    { messageType: CRM_MESSAGE_TYPE.LEAD_MARK_PROSPECT, enabled: true, delayMinutes: 11520, cancelIfOrdered: true }, // +8 days
]

// Client 2026-08-28: post-delivery (anchor = order delivered) and reactivation
// (anchor = went dormant) timings become founder-configurable, mirroring the
// lead schedule. delayMinutes is measured from each workflow's anchor event.
const DEFAULT_POST_DELIVERY_SCHEDULE = [
    { messageType: CRM_MESSAGE_TYPE.DELIVERY_CONFIRMATION, enabled: true, delayMinutes: 60, cancelIfOrdered: false }, // +1h
    { messageType: CRM_MESSAGE_TYPE.FEEDBACK_REQUEST, enabled: true, delayMinutes: 1440, cancelIfOrdered: false }, // +1 day
]

const DEFAULT_REACTIVATION_SCHEDULE = [
    { messageType: CRM_MESSAGE_TYPE.REACTIVATION_1, enabled: true, delayMinutes: 0, cancelIfOrdered: true },
    { messageType: CRM_MESSAGE_TYPE.REACTIVATION_2, enabled: true, delayMinutes: 20160, cancelIfOrdered: true }, // +14 days
    { messageType: CRM_MESSAGE_TYPE.REACTIVATION_3, enabled: true, delayMinutes: 60480, cancelIfOrdered: true }, // +42 days
    { messageType: CRM_MESSAGE_TYPE.REACTIVATION_MARK_CHURNED, enabled: true, delayMinutes: 80640, cancelIfOrdered: true }, // +56 days
]

// Shared step shape for every configurable workflow schedule (lead / post-
// delivery / reactivation). delayMinutes is measured from that workflow's anchor.
const scheduleStepSchema = new mongoose.Schema(
    {
        messageType: {
            type: String,
            enum: Object.values(CRM_MESSAGE_TYPE),
            required: true,
        },
        enabled: { type: Boolean, default: true },
        delayMinutes: { type: Number, default: 0, min: 0 },
        // drop this step if the customer books/converts before it fires
        cancelIfOrdered: { type: Boolean, default: true },
        // ── Added 2026-10-08 for the registered-not-booked sequence ──────────
        // Both are OPTIONAL and absent on every existing schedule, so the lead,
        // post-delivery and reactivation sequences behave exactly as before.
        //
        // `anchor` says what delayMinutes is measured from. `offer-end` means
        // the step is positioned relative to the customer's First Experience
        // offer EXPIRY instead — the client tied messages 2 and 3 to the offer's
        // end so that changing its length from 3 days to 7 moves them with it.
        anchor: {
            type: String,
            enum: Object.values(CRM_SCHEDULE_ANCHOR),
            default: CRM_SCHEDULE_ANCHOR.WORKFLOW_START,
        },
        // Which of the two daily send windows this step belongs in. The client
        // pinned message 2 to the evening and message 3 to the morning.
        preferSlot: {
            type: String,
            enum: Object.values(CRM_SEND_SLOT),
            default: CRM_SEND_SLOT.ANY,
        },
    },
    { _id: false },
)

// Client item #1 (2026-10-08). Only step 1 is a plain delay; steps 2 and 3 are
// positioned from the OFFER's end, and the terminal step is the day-7 move to
// the prospect list (an action, not a message).
const DEFAULT_REGISTERED_NOT_BOOKED_SCHEDULE = [
    {
        messageType: CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1,
        enabled: true,
        delayMinutes: 1440, // +24h from registration, then the next send window
        anchor: CRM_SCHEDULE_ANCHOR.WORKFLOW_START,
        preferSlot: CRM_SEND_SLOT.ANY,
        cancelIfOrdered: true,
    },
    {
        messageType: CRM_MESSAGE_TYPE.REG_NOT_BOOKED_2,
        enabled: true,
        // the EVENING window the day before the offer ends; the exact instant is
        // computed by util/crmSendWindow.offerEndSchedule, which also handles the
        // client's "offer ends before 8am" shift.
        delayMinutes: 0,
        anchor: CRM_SCHEDULE_ANCHOR.OFFER_END,
        preferSlot: CRM_SEND_SLOT.EVENING,
        cancelIfOrdered: true,
    },
    {
        messageType: CRM_MESSAGE_TYPE.REG_NOT_BOOKED_3,
        enabled: true,
        delayMinutes: 0,
        anchor: CRM_SCHEDULE_ANCHOR.OFFER_END,
        preferSlot: CRM_SEND_SLOT.MORNING,
        cancelIfOrdered: true,
    },
    {
        messageType: CRM_MESSAGE_TYPE.REG_NOT_BOOKED_MARK_PROSPECT,
        enabled: true,
        delayMinutes: 10080, // day 7 from registration
        anchor: CRM_SCHEDULE_ANCHOR.WORKFLOW_START,
        preferSlot: CRM_SEND_SLOT.ANY,
        cancelIfOrdered: true,
    },
]

const crmSettingSchema = new mongoose.Schema(
    {
        templates: {
            type: Map,
            of: String,
            default: DEFAULT_TEMPLATES,
        },
        leadSchedule: {
            type: [scheduleStepSchema],
            default: DEFAULT_LEAD_SCHEDULE,
        },
        postDeliverySchedule: {
            type: [scheduleStepSchema],
            default: DEFAULT_POST_DELIVERY_SCHEDULE,
        },
        reactivationSchedule: {
            type: [scheduleStepSchema],
            default: DEFAULT_REACTIVATION_SCHEDULE,
        },
        registeredNotBookedSchedule: {
            type: [scheduleStepSchema],
            default: DEFAULT_REGISTERED_NOT_BOOKED_SCHEDULE,
        },
        // Client ruling 2026-10-08: every follow-up and offer message may only
        // leave in one of these two windows; anything due outside waits for the
        // next one. Hours are LAGOS wall-clock (server.js pins the process TZ).
        // Order/payment messages are exempt — see CRM_WINDOWED_WORKFLOWS.
        sendWindows: {
            morningStartHour: { type: Number, default: 6, min: 0, max: 23 },
            morningEndHour: { type: Number, default: 8, min: 1, max: 24 },
            eveningStartHour: { type: Number, default: 18, min: 0, max: 23 },
            eveningEndHour: { type: Number, default: 20, min: 1, max: 24 },
        },
        // "Order Ready" fires on its own trigger (order ready), so it's a single
        // configurable delay (minutes) from that event rather than a sequence.
        orderReadyDelayMinutes: { type: Number, default: 0, min: 0 },
        thresholds: {
            // days without an order before a customer goes Dormant
            dormantDays: { type: Number, default: 30 },
            // average order amount (₦) at/above which a customer is High Volume
            highVolumeAvgAmount: { type: Number, default: 15000 },
            // orders per month at/above which a customer is High Frequency
            highFrequencyPerMonth: { type: Number, default: 2 },
            // share of express/same-day orders at/above which = Express User
            expressUserRatio: { type: Number, default: 0.5 },
            // days between prospect broadcasts
            prospectBroadcastDays: { type: Number, default: 14 },
            // days between churn broadcasts
            churnBroadcastDays: { type: Number, default: 30 },
            // §2 N2: days that must pass before the same customer is asked the
            // NPS (0-10 recommend) question again. The brief says 30; it lives
            // here rather than in code because every other cadence does.
            npsAskIntervalDays: { type: Number, default: 30, min: 1 },
        },
    },
    { timestamps: true },
)

const CrmSettingModel = mongoose.model('CrmSetting', crmSettingSchema)

module.exports = CrmSettingModel
module.exports.DEFAULT_TEMPLATES = DEFAULT_TEMPLATES
module.exports.DEFAULT_LEAD_SCHEDULE = DEFAULT_LEAD_SCHEDULE
module.exports.DEFAULT_POST_DELIVERY_SCHEDULE = DEFAULT_POST_DELIVERY_SCHEDULE
module.exports.DEFAULT_REACTIVATION_SCHEDULE = DEFAULT_REACTIVATION_SCHEDULE
module.exports.DEFAULT_REGISTERED_NOT_BOOKED_SCHEDULE =
    DEFAULT_REGISTERED_NOT_BOOKED_SCHEDULE
