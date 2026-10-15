// Quiet hours (V1 launch batch 2, client 15 Oct, R23): "no SMS between 9 PM and
// 7 AM (queued for 7 AM)", and the feedback request is never sent in them.
// Both hours are admin settings (AdminSetting.quietHours). Lagos time: the
// process is pinned to Africa/Lagos, so getHours() is the Lagos hour.
const DEFAULTS = { startHour: 21, endHour: 7 }

let cache = { at: 0, value: DEFAULTS }
async function loadQuietHours() {
    if (Date.now() - cache.at < 60 * 1000) return cache.value
    try {
        const AdminSettingModel = require('../models/adminSetting.model')
        const s = await AdminSettingModel.findOne().select('quietHours').lean()
        const q = s?.quietHours || {}
        const num = (v, d) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 23 ? Number(v) : d)
        cache = { at: Date.now(), value: { startHour: num(q.startHour, DEFAULTS.startHour), endHour: num(q.endHour, DEFAULTS.endHour) } }
    } catch {
        cache = { at: Date.now(), value: DEFAULTS }
    }
    return cache.value
}

/** Is `now` inside the quiet window? A window that crosses midnight wraps. */
function isQuiet(now = new Date(), { startHour, endHour } = DEFAULTS) {
    if (startHour === endHour) return false
    const h = now.getHours()
    return startHour < endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour
}

/** The moment the current quiet window ends (endHour:00 today or tomorrow). */
function quietEnds(now = new Date(), { endHour } = DEFAULTS) {
    const d = new Date(now)
    d.setHours(endHour, 0, 0, 0)
    if (d <= now) d.setDate(d.getDate() + 1)
    return d
}

function _resetCache() {
    cache = { at: 0, value: DEFAULTS }
}

module.exports = { DEFAULTS, loadQuietHours, isQuiet, quietEnds, _resetCache }
