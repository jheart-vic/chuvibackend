// util/sendSms.js
const axios = require('axios')

const TERMII_API_KEY = process.env.TERMII_API_KEY
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID

// V1 launch batch 1 (client 15 Oct, R23): every SMS uses N instead of the naira
// sign and has no dashes. Done here, where every SMS passes, so no message can
// slip through. Hyphens inside a word or code (OSC-20261015-123456, a link) stay.
function cleanSmsText(message) {
    return String(message ?? '')
        .replace(/₦\s*/g, 'N')
        .replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2')
        .replace(/\s*[–—]+\s*/g, ', ')
        .replace(/\s+-\s+/g, ', ')
        .replace(/,\s*([.,!?])/g, '$1')
        .replace(/ {2,}/g, ' ')
        .trim()
}

const sendSms = async (phoneNumber, message) => {
    try {
        message = cleanSmsText(message)
        const phoneNo = formatPhoneNumber(phoneNumber)
        const response = await axios.post(
            'https://api.ng.termii.com/api/sms/send',
            {
                api_key: TERMII_API_KEY,
                to: phoneNo,
                from: TERMII_SENDER_ID,
                channel: 'generic',
                type: 'plain',
                sms: message,
            },
        )
        return response.data
    } catch (error) {
        console.error('Error sending SMS:', error.response?.data || error.message)
        throw error
    }
}

function formatPhoneNumber(phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, '')
    if (digits.startsWith('0')) return '234' + digits.slice(1)
    if (digits.startsWith('234')) return digits
    return digits
}

module.exports = sendSms
module.exports.cleanSmsText = cleanSmsText