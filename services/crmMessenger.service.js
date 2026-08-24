// CRM message delivery. Channel priority: WhatsApp (via the chatbot service,
// same contract as util/notifyBot.js but with event: 'crm-message') → SMS
// (Termii) → email. The bot lives in a separate repo; it must handle the
// 'crm-message' event: { event, phoneNumber, chuviUserId, messageType, message }.
const axios = require('axios')
const sendSms = require('../util/sendSms')
const sendEmail = require('../util/emailService')
const CrmMessageLogModel = require('../models/crmMessageLog.model')
const CrmSettingModel = require('../models/crmSetting.model')
const { CRM_WORKFLOW, CRM_MESSAGE_TYPE } = require('../util/constants')
const { registerLink, supportLink } = require('../util/deepLink')

// Re-engagement nudges that should deep-link the customer into the in-app
// assistant, tagged with the `crmContext` the bot's `_crmFrameToIntent` maps to
// (reactivation → book/human, reorder → book, feedback/post-delivery → feedback).
// Only these message types open the assistant; offer/wallet/complaint nudges keep
// their own specific deep links, and account-less leads keep the registration link.
const SUPPORT_CONTEXT_BY_MESSAGE_TYPE = {
    [CRM_MESSAGE_TYPE.REACTIVATION_1]: 'reactivation',
    [CRM_MESSAGE_TYPE.REACTIVATION_2]: 'reactivation',
    [CRM_MESSAGE_TYPE.REACTIVATION_3]: 'reactivation',
    [CRM_MESSAGE_TYPE.CHURN_BROADCAST]: 'reactivation',
    [CRM_MESSAGE_TYPE.DELIVERY_CONFIRMATION]: 'post-delivery',
    [CRM_MESSAGE_TYPE.FEEDBACK_REQUEST]: 'feedback',
    [CRM_MESSAGE_TYPE.REORDER_PROMPT]: 'reorder',
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
const sendCrmMessage = async (profile, { workflow, messageType }) => {
    const settings = await getCrmSettings()
    const template = settings.templates.get(messageType)
    let content = renderTemplate(template, profile)

    if (!content) {
        return { success: false, channel: null, content: '' }
    }

    // §3: lead-nurture messages carry a personalised registration link (leads
    // have no account yet, so this is how they sign up). Only for account-less
    // leads — a profile that already has a userId is registered.
    if (workflow === CRM_WORKFLOW.LEAD && !profile.userId) {
        content = `${content}\nSign up: ${registerLink({ phone: profile.phoneNumber })}`
    }

    // Re-engagement nudges (reactivation/reorder/post-delivery) deep-link a
    // REGISTERED customer into the in-app assistant, framed by crmContext so the
    // bot understands why they arrived. Guarded by userId — /user/support is
    // login-gated, so account-less profiles (still on the registration link) are
    // never sent here. Additive: this is a separate line, existing links untouched.
    const supportCtx = SUPPORT_CONTEXT_BY_MESSAGE_TYPE[messageType]
    if (supportCtx && profile.userId) {
        content = `${content}\nContinue in the app: ${supportLink(supportCtx)}`
    }

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
