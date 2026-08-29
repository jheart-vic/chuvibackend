// CRM message delivery. Channel priority: WhatsApp (via the chatbot service,
// same contract as util/notifyBot.js but with event: 'crm-message') → SMS
// (Termii) → email. The bot lives in a separate repo; it must handle the
// 'crm-message' event: { event, phoneNumber, chuviUserId, messageType, message }.
const axios = require('axios')
const sendSms = require('../util/sendSms')
const sendEmail = require('../util/emailService')
const CrmMessageLogModel = require('../models/crmMessageLog.model')
const CrmSettingModel = require('../models/crmSetting.model')
const { CRM_MESSAGE_TYPE } = require('../util/constants')
const { registerLink, deepLink } = require('../util/deepLink')

// Per-message-type link policy (client spec, 2026-08-28). The CRM is one-way, so
// the correct link for each message is appended automatically here — the admin
// edits only the copy. Categories:
//   'register' → app registration link (pre-account audiences: leads + prospects)
//   'offers'   → Offers page (re-engagement: reactivation + churn)
//   'order'    → that specific order's feedback screen (needs recordId)
//   (absent)   → no link (order-ready, delivery-confirmation)
const LINK_POLICY = {
    // lead workflow → registration
    [CRM_MESSAGE_TYPE.LEAD_WELCOME]: 'register',
    [CRM_MESSAGE_TYPE.LEAD_OFFER]: 'register',
    [CRM_MESSAGE_TYPE.LEAD_CLOSE]: 'register',
    [CRM_MESSAGE_TYPE.LEAD_QUALIFY]: 'register',
    [CRM_MESSAGE_TYPE.LEAD_REMINDER_1]: 'register',
    [CRM_MESSAGE_TYPE.LEAD_REMINDER_2]: 'register',
    // prospect broadcast → registration
    [CRM_MESSAGE_TYPE.PROSPECT_BROADCAST]: 'register',
    // reactivation → Offers page
    [CRM_MESSAGE_TYPE.REACTIVATION_1]: 'offers',
    [CRM_MESSAGE_TYPE.REACTIVATION_2]: 'offers',
    [CRM_MESSAGE_TYPE.REACTIVATION_3]: 'offers',
    // churn broadcast → Offers page
    [CRM_MESSAGE_TYPE.CHURN_BROADCAST]: 'offers',
    // feedback request → that order's feedback screen
    [CRM_MESSAGE_TYPE.FEEDBACK_REQUEST]: 'order',
    // order-ready + delivery-confirmation → intentionally no link
}

// Resolve the link line for a message (or '' for none). Registration links are
// only meaningful for account-less profiles; offers/order links need an account.
const linkLineFor = (messageType, profile, recordId) => {
    const policy = LINK_POLICY[messageType]
    if (!policy) return ''
    if (policy === 'register') {
        if (profile.userId) return '' // already registered — nothing to sign up for
        return `\nSign up: ${registerLink({ phone: profile.phoneNumber })}`
    }
    if (policy === 'offers') {
        if (!profile.userId) return '' // login-gated page — no account yet
        return `\nSee your offers: ${deepLink('offers')}`
    }
    if (policy === 'order') {
        if (!profile.userId || !recordId) return ''
        return `\nRate your order: ${deepLink('feedback', recordId)}`
    }
    return ''
}

const renderTemplate = (template, profile) => {
    const name = profile.fullName || 'there'
    const firstName = name.split(' ')[0]
    return (template || '')
        .replace(/{{\s*name\s*}}/g, name)
        .replace(/{{\s*firstName\s*}}/g, firstName)
}

const getCrmSettings = async () => {
    let settings = await CrmSettingModel.findOne({})
    if (!settings) {
        settings = await CrmSettingModel.create({})
    }
    return settings
}

const sendViaBot = async (profile, messageType, message) => {
    const url = process.env.CHATBOT_NOTIFY_URL
    const secret = process.env.CHATBOT_NOTIFY_SECRET
    if (!url || !secret || !profile.phoneNumber) return false

    try {
        await axios.post(
            url,
            {
                event: 'crm-message',
                chuviUserId: profile.userId ? String(profile.userId) : undefined,
                phoneNumber: profile.phoneNumber,
                email: profile.email || undefined,
                messageType,
                message,
            },
            { timeout: 5000, headers: { 'x-bot-secret': secret } },
        )
        return true
    } catch (err) {
        console.warn(
            'CRM bot send failed (falling back):',
            err.response?.status || err.code || err.message,
        )
        return false
    }
}

const sendViaSms = async (profile, message) => {
    if (!profile.phoneNumber) return false
    try {
        await sendSms(profile.phoneNumber, message)
        return true
    } catch (err) {
        console.warn('CRM SMS send failed (falling back):', err.message)
        return false
    }
}

const sendViaEmail = async (profile, message) => {
    if (!profile.email) return false
    try {
        await sendEmail({
            to: profile.email,
            subject: 'Chuvi Laundry',
            html: `<p>${message}</p>`,
        })
        return true
    } catch (err) {
        console.warn('CRM email send failed:', err.message)
        return false
    }
}

// Sends one CRM message to a profile and logs the outcome.
// Returns { success, channel, content }.
const sendCrmMessage = async (
    profile,
    { workflow, messageType, recordId, templateKey },
) => {
    const settings = await getCrmSettings()
    // templateKey lets broadcast rotation pick a variant (e.g. prospect-broadcast-b)
    // while the message stays logged/linked as its base type. Falls back to the
    // base template if the chosen variant is blank.
    const template =
        (templateKey && settings.templates.get(templateKey)) ||
        settings.templates.get(messageType)
    let content = renderTemplate(template, profile)

    if (!content) {
        return { success: false, channel: null, content: '' }
    }

    // Append the message's designated clickable link (client spec 2026-08-28):
    // leads/prospects → registration, reactivation/churn → Offers page,
    // feedback → that order's screen, order-ready/delivery → no link.
    content = `${content}${linkLineFor(messageType, profile, recordId)}`

    let channel = null
    if (await sendViaBot(profile, messageType, content)) {
        channel = 'whatsapp'
    } else if (await sendViaSms(profile, content)) {
        channel = 'sms'
    } else if (await sendViaEmail(profile, content)) {
        channel = 'email'
    }

    const success = !!channel
    try {
        await CrmMessageLogModel.create({
            profileId: profile._id,
            workflow,
            messageType,
            channel,
            content,
            success,
            error: success ? undefined : 'No delivery channel succeeded',
        })
    } catch (err) {
        console.warn('CRM message log failed:', err.message)
    }

    return { success, channel, content }
}

module.exports = {
    sendCrmMessage,
    getCrmSettings,
    renderTemplate,
}
