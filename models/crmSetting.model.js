const mongoose = require('mongoose')
const { CRM_MESSAGE_TYPE } = require('../util/constants')

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
    },
    { _id: false },
)

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
