// util/notifyBot.js
// Pushes payment events to the WhatsApp chatbot so customers get instant
// confirmations in their chat. Fire-and-forget: failures are logged only and
// can NEVER break the Paystack webhook flow.
//
// .env:
//   CHATBOT_NOTIFY_URL=https://<chatbot-host>/api/internal/payment-event
//   CHATBOT_NOTIFY_SECRET=<same value as the bot's BOT_INTERNAL_SECRET>

const axios = require('axios')

/**
 * @param {object} payload
 * @param {string} payload.event - 'wallet-top-up' | 'order-paid' | 'subscription-active' | 'payment-failed'
 * @param {string} [payload.chuviUserId] - backend user _id (preferred)
 * @param {string} [payload.email] - fallback lookup
 * plus event fields: amount, balance, reference, orderId, oscNumber, planName, reason
 */
async function notifyBot(payload) {
    const url = process.env.CHATBOT_NOTIFY_URL
    const secret = process.env.CHATBOT_NOTIFY_SECRET
    if (!url || !secret) return // feature not configured — silently skip

    try {
        await axios.post(url, payload, {
            timeout: 2000,
            headers: { 'x-bot-secret': secret },
        })
    } catch (err) {
        console.warn(
            'notifyBot failed (non-fatal):',
            err.response?.status || err.code || err.message,
        )
    }
}

module.exports = notifyBot