// ORDER NUMBERS (client 15 Oct): "keep the format we already use, OSC, then the
// date, then the serial. The first real order should read OSC-20261020-001."
//
// OSC-<YYYYMMDD of the order, Lagos>-<running serial>. The serial counts every
// order ever made and never resets by itself (3 digits, it simply grows past
// 999); the Sunday data clear sets it back to 0 so the first real order is 001.
// It replaces the old random six digits, and the date is now the LAGOS day (the
// old code used the UTC date, so an order at 00:30 carried yesterday's date).
const mongoose = require('mongoose')

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false })
const CounterModel = mongoose.models.Counter || mongoose.model('Counter', counterSchema)

const SERIAL_KEY = 'orderSerial'

function lagosYmd(d = new Date()) {
    // The process is pinned to Africa/Lagos, so the local date IS the Lagos date.
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}${m}${day}`
}

/** The next order number; atomic, so two orders can never share one. */
async function nextOscNumber(now = new Date()) {
    const c = await CounterModel.findOneAndUpdate(
        { _id: SERIAL_KEY },
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
    ).lean()
    return `OSC-${lagosYmd(now)}-${String(c.seq).padStart(3, '0')}`
}

module.exports = { nextOscNumber, lagosYmd, CounterModel, SERIAL_KEY }
