// util/sendSms.js
const axios = require('axios')

const TERMII_API_KEY = process.env.TERMII_API_KEY
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID

const sendSms = async (phoneNumber, message) => {
    try {
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