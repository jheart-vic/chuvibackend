// RECOUNT COVER — V1 launch batch 2 (client 15 Oct, R17):
//
// "Recount at Intake on item list bookings. An increase within both cover
//  limits (a percent of the bill and a naira amount, both editable in admin;
//  launch values 10% and N200) is covered by CHUVI and shown as its own line.
//  Anything above the cover is charged in full … Every mismatch is recorded
//  against the customer. After the repeat limit (setting, 3 in 60 days) that
//  customer gets no cover. The cover never applies to Quick Booking or to a
//  service change the customer accepts."
//
// Readings stated here so they can be checked:
//   * "within both limits" — the WHOLE increase must be at or under the naira
//     amount AND at or under the percent of the bill before the recount. It is
//     all or nothing: an increase above either limit is charged in full.
//   * A limit set to 0 means no cover (the client's "0 means no cover").
//   * Every count mismatch (up or down) on an item-list booking counts towards
//     the repeat limit; the cover is refused once the customer already has
//     `limit` mismatches inside the window (the 4th after 3 covered ones).
const UserModel = require('../models/user.model')

const DEFAULTS = { percent: 10, maxAmount: 200, repeatLimit: 3, repeatDays: 60 }

function coverSettings(adminSetting = {}) {
    const c = adminSetting.recountCover || {}
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)
    return {
        percent: num(c.percent, DEFAULTS.percent),
        maxAmount: num(c.maxAmount, DEFAULTS.maxAmount),
        repeatLimit: num(c.repeatLimit, DEFAULTS.repeatLimit),
        repeatDays: num(c.repeatDays, DEFAULTS.repeatDays),
    }
}

/** How many mismatches this customer has inside the repeat window. */
async function recentMismatches(userId, days, now = new Date()) {
    if (!userId) return 0
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const u = await UserModel.findById(userId).select('recountMismatches').lean()
    return (u?.recountMismatches || []).filter((m) => new Date(m.at) >= since).length
}

/**
 * Decide the cover for one recount. Pure apart from the mismatch lookup.
 * Returns { cover, eligible, reason, repeatLimitReached }.
 */
async function decideCover({ order, previousTotal, newTotal, adminSetting }) {
    const s = coverSettings(adminSetting)
    const increase = newTotal - previousTotal
    if (increase <= 0) return { cover: 0, eligible: false, reason: 'no-increase' }
    if (order.quickBooking) return { cover: 0, eligible: false, reason: 'quick-booking' }
    if (s.percent <= 0 || s.maxAmount <= 0) return { cover: 0, eligible: false, reason: 'no-cover-set' }
    const prior = await recentMismatches(order.userId, s.repeatDays)
    if (order.userId && prior >= s.repeatLimit) {
        return { cover: 0, eligible: false, reason: 'repeat-limit', repeatLimitReached: true, prior }
    }
    const percentCap = Math.floor((previousTotal * s.percent) / 100)
    if (increase <= s.maxAmount && increase <= percentCap) {
        return { cover: increase, eligible: true, reason: 'covered', prior }
    }
    return { cover: 0, eligible: false, reason: 'over-cover', prior }
}

/** Record one mismatch against the customer. Never throws. */
async function recordMismatch({ userId, orderId, previousPieces, newPieces, cover }) {
    if (!userId) return
    try {
        await UserModel.updateOne(
            { _id: userId },
            { $push: { recountMismatches: { at: new Date(), orderId, previousPieces, newPieces, covered: cover || 0 } } },
        )
    } catch (err) {
        console.error('record mismatch failed:', err?.message)
    }
}

module.exports = { DEFAULTS, coverSettings, decideCover, recordMismatch, recentMismatches }
