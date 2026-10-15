const mongoose = require('mongoose')

// An SMS held back by quiet hours (V1 launch batch 2, R23) and sent when the
// window ends, by crons/queuedSmsFlush.js.
const queuedSmsSchema = new mongoose.Schema(
    {
        to: { type: String, required: true },
        message: { type: String, required: true },
        sendAfter: { type: Date, required: true, index: true },
        sentAt: { type: Date },
        failedAt: { type: Date },
        error: { type: String },
    },
    { timestamps: true },
)

module.exports = mongoose.model('QueuedSms', queuedSmsSchema)
