const mongoose = require('mongoose')
const { CRM_MESSAGE_TYPE } = require('../util/constants')

// Single-document settings for the CRM: message templates (admin-editable)
// and the thresholds behind the automatic tags. Seeded with defaults in
// config/setup.js. Templates support {{name}} and {{firstName}} placeholders.
const DEFAULT_TEMPLATES = {
    [CRM_MESSAGE_TYPE.LEAD_WELCOME]:
        'Hi {{firstName}}! 👋 Welcome to Chuvi Laundry. We pick up, clean and deliver your laundry looking brand new.',
    [CRM_MESSAGE_TYPE.LEAD_QUALIFY]:
        'What kind of laundry do you usually need help with, {{firstName}}? Everyday wash, ironing only, or full wash & iron?',
    [CRM_MESSAGE_TYPE.LEAD_OFFER]:
        'To welcome you, {{firstName}}, you get free pickup on your first order with Chuvi Laundry. 🎁',
    [CRM_MESSAGE_TYPE.LEAD_CLOSE]:
        'Ready when you are, {{firstName}}! Book your first pickup now and let us handle the rest.',
    [CRM_MESSAGE_TYPE.LEAD_REMINDER_1]:
        'Hi {{firstName}}, just checking in — your free first pickup with Chuvi Laundry is still waiting for you. 😊',
    [CRM_MESSAGE_TYPE.LEAD_REMINDER_2]:
        "Hello {{firstName}}! Life gets busy — let Chuvi Laundry take laundry off your plate. Your welcome offer is still available.",
    [CRM_MESSAGE_TYPE.DELIVERY_CONFIRMATION]:
        'Hi {{firstName}}, your Chuvi Laundry order has been delivered. Thank you for choosing us! 🧺',
    [CRM_MESSAGE_TYPE.FEEDBACK_REQUEST]:
        'Hi {{firstName}}, how did we do on your last order? Everything clean and crisp? Reply and let us know — your feedback keeps us sharp.',
    [CRM_MESSAGE_TYPE.REORDER_PROMPT]:
        "Hi {{firstName}}, laundry basket filling up again? 😄 Book your next Chuvi Laundry pickup and we'll take it from there.",
    [CRM_MESSAGE_TYPE.REACTIVATION_1]:
        "Hi {{firstName}}, we miss you at Chuvi Laundry! It's been a while — book a pickup and let us freshen things up.",
    [CRM_MESSAGE_TYPE.REACTIVATION_2]:
        'Hi {{firstName}}, still thinking of you! Come back to Chuvi Laundry and enjoy a special welcome-back treat on your next order.',
    [CRM_MESSAGE_TYPE.REACTIVATION_3]:
        "Hi {{firstName}}, one last nudge from Chuvi Laundry — we'd love to have you back. Your next pickup is just a message away.",
    [CRM_MESSAGE_TYPE.PROSPECT_BROADCAST]:
        'Hi {{firstName}}! Chuvi Laundry here — fresh clothes without the stress. Book a pickup today and see the difference.',
    [CRM_MESSAGE_TYPE.CHURN_BROADCAST]:
        'Hi {{firstName}}, Chuvi Laundry here with something special for old friends — come back anytime, your next pickup is on us to arrange.',
}

const crmSettingSchema = new mongoose.Schema(
    {
        templates: {
            type: Map,
            of: String,
            default: DEFAULT_TEMPLATES,
        },
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
