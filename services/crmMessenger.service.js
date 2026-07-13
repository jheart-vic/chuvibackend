// CRM message delivery. Channel priority: WhatsApp (via the chatbot service,
// same contract as util/notifyBot.js but with event: 'crm-message') → SMS
// (Termii) → email. The bot lives in a separate repo; it must handle the
// 'crm-message' event: { event, phoneNumber, chuviUserId, messageType, message }.
const axios = require('axios')
const sendSms = require('../util/sendSms')
const sendEmail = require('../util/emailService')
const CrmMessageLogModel = require('../models/crmMessageLog.model')
const CrmSettingModel = require('../models/crmSetting.model')

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
    const content = renderTemplate(template, profile)

    if (!content) {
        return { success: false, channel: null, content: '' }
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
