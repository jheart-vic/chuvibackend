// Sends the SMS that quiet hours held back (V1 launch batch 2, R23). Each
// message is claimed before it is sent, so two overlapping runs cannot send it
// twice. Scheduled by crons/queuedSmsFlush.js.
const QueuedSmsModel = require('../models/queuedSms.model')
const { loadQuietHours, isQuiet } = require('./quietHours')

async function flushQueuedSms(now = new Date()) {
    const sendSms = require('./sendSms')
    const hours = await loadQuietHours()
    if (isQuiet(now, hours)) return 0
    const due = await QueuedSmsModel.find({ sendAfter: { $lte: now }, sentAt: { $exists: false }, failedAt: { $exists: false } })
        .sort({ sendAfter: 1 })
        .limit(200)
        .lean()
    let sent = 0
    for (const m of due) {
        const claim = await QueuedSmsModel.updateOne({ _id: m._id, sentAt: { $exists: false } }, { $set: { sentAt: new Date() } })
        if (!claim.modifiedCount) continue
        try {
            await sendSms(m.to, m.message, { immediate: true })
            sent++
        } catch (err) {
            await QueuedSmsModel.updateOne({ _id: m._id }, { $set: { failedAt: new Date(), error: String(err?.message || err).slice(0, 300) } })
        }
    }
    return sent
}

module.exports = { flushQueuedSms }
