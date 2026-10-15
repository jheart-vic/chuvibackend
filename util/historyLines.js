// HISTORY LINES (V1 launch batch 3c, client word list 15 Oct): "[time] [station]:
// [what happened] by [staff name]". Example: "10:42 Intake and Tag: 6 pieces
// counted by Chioma". Built from the order's Activity records, which carry the
// staff member; the station is the staff member's role in the client's words.
const ActivityModel = require('../models/activity.model')
const { stationLabel } = require('./displayName')

const two = (n) => String(n).padStart(2, '0')
const clock = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`

async function historyLines(orderId) {
    if (!orderId) return []
    const rows = await ActivityModel.find({ orderId })
        .sort({ createdAt: 1 })
        .limit(300)
        .populate({ path: 'userId', select: 'fullName userType' })
        .lean()
    return rows.map((a) => {
        const at = new Date(a.createdAt)
        const user = a.userId && typeof a.userId === 'object' ? a.userId : null
        const station = user?.userType ? stationLabel(user.userType) : 'System'
        const what = String(a.title || a.description || '').trim()
        const by = user?.fullName ? String(user.fullName).trim().split(/\s+/)[0] : null
        return {
            at,
            station,
            what,
            by,
            detail: a.description || null,
            line: `${clock(at)} ${station}: ${what}${by ? ` by ${by}` : ''}`,
        }
    })
}

module.exports = { historyLines }
