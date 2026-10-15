// ADMIN ALERT LISTS (V1 launch batch 3b, FE F40/F41): the three things admin
// is notified about, as lists the dashboard can show (GET /admin/alerts).
//   countDisputes      — orders held because Intake's count differs from the rider's
//   possibleMissing    — the subset where Intake counted FEWER than the rider
//   repeatMismatch     — customers at or over the recount repeat limit in its window
const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const { ORDER_STATUS } = require('./constants')
const { holdCounts } = require('./itemHold')

const COUNT_KEY = 'count_differs_from_rider'

async function adminAlerts(now = new Date()) {
    const held = await BookOrderModel.find({
        'stage.status': ORDER_STATUS.HOLD,
        'orderHold.holdTypeKey': COUNT_KEY,
    })
        .select('oscNumber fullName phoneNumber counts items._id stage.updatedAt')
        .sort({ 'stage.updatedAt': 1 })
        .lean()
    const countDisputes = held.map((o) => ({
        orderId: o._id,
        oscNumber: o.oscNumber,
        customerName: o.fullName,
        phoneNumber: o.phoneNumber,
        heldSince: o.stage?.updatedAt || null,
        counts: holdCounts(o),
    }))
    const possibleMissing = countDisputes
        .filter((r) => r.counts && r.counts.rider != null && r.counts.intake != null && r.counts.intake < r.counts.rider)
        .map((r) => ({ ...r, missing: r.counts.rider - r.counts.intake }))

    const { coverSettings } = require('./recountCover')
    const AdminSettingModel = require('../models/adminSetting.model')
    const setting = await AdminSettingModel.findOne().select('recountCover').lean()
    const { repeatLimit, repeatDays } = coverSettings(setting || {})
    const since = new Date(now.getTime() - repeatDays * 86400000)
    const users = await UserModel.find({ 'recountMismatches.at': { $gte: since } })
        .select('fullName phoneNumber email recountMismatches')
        .lean()
    const repeatMismatch = users
        .map((u) => {
            const recent = (u.recountMismatches || []).filter((m) => m.at && new Date(m.at) >= since)
            return {
                userId: u._id,
                customerName: u.fullName,
                phoneNumber: u.phoneNumber,
                mismatches: recent.length,
                lastAt: recent.reduce((a, m) => (!a || m.at > a ? m.at : a), null),
                coverStopped: repeatLimit > 0 && recent.length >= repeatLimit,
            }
        })
        .filter((r) => repeatLimit > 0 && r.mismatches >= repeatLimit)
        .sort((a, b) => b.mismatches - a.mismatches)

    return {
        countDisputes,
        possibleMissing,
        repeatMismatch,
        repeatLimit,
        repeatDays,
        counts: {
            countDisputes: countDisputes.length,
            possibleMissing: possibleMissing.length,
            repeatMismatch: repeatMismatch.length,
        },
    }
}

module.exports = { adminAlerts }
