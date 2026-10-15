// THE DUE-TODAY CHECK (V1 launch batch 3, client 15 Oct, B34 / T7.03): "at 3 PM
// admin must see every order due today that hasn't reached QC", with an alert.
// The hour is a setting (AdminSetting.dueTodayCheckHour, default 15). The list
// is also available any time (GET /admin/due-today-not-at-qc).
const BookOrderModel = require('../models/bookOrder.model')
const { startOfDay, endOfDay } = require('./lagosDay')

// At QC or further along: nothing left for the floor to rush.
const PAST_QC = ['qc', 'ready', 'out-for-delivery', 'delivered', 'collected', 'returned-unwashed', 'cancelled']

async function dueTodayNotAtQc(now = new Date()) {
    const { stationLabel } = require('./displayName')
    const rows = await BookOrderModel.find({
        deliveryDate: { $gte: startOfDay(now), $lt: endOfDay(now) },
        'stage.status': { $nin: PAST_QC },
    })
        .select('oscNumber fullName phoneNumber deliveryDate deliverySpeed stage stationStatus items.currentStation items.tagId')
        .sort({ deliveryDate: 1 })
        .lean()
    return rows.map((o) => {
        const at = {}
        for (const i of o.items || []) {
            const k = stationLabel(i.currentStation || 'intake-and-tag-station')
            at[k] = (at[k] || 0) + 1
        }
        return {
            orderId: o._id,
            oscNumber: o.oscNumber,
            customerName: o.fullName,
            phoneNumber: o.phoneNumber,
            deliveryDate: o.deliveryDate,
            deliverySpeed: o.deliverySpeed,
            status: o.stage?.status,
            piecesAt: at,
        }
    })
}

/** Run by the hourly cron; alerts admin once a day at the set hour. */
async function runDueTodayAlert(now = new Date()) {
    const AdminSettingModel = require('../models/adminSetting.model')
    const s = await AdminSettingModel.findOne().select('dueTodayCheckHour dueTodayCheckLastRun').lean()
    const hour = Number.isInteger(s?.dueTodayCheckHour) ? s.dueTodayCheckHour : 15
    if (now.getHours() !== hour) return { ran: false }
    const day = startOfDay(now).toISOString()
    // Latch per day, claimed before sending, so two runs cannot alert twice.
    const claim = await AdminSettingModel.updateOne(
        { _id: s?._id, dueTodayCheckLastRun: { $ne: day } },
        { $set: { dueTodayCheckLastRun: day } },
    )
    if (!claim.modifiedCount) return { ran: false }
    const rows = await dueTodayNotAtQc(now)
    if (rows.length) {
        const { notifyRoles } = require('./notifyRoles')
        const { ROLE, NOTIFICATION_TYPE } = require('./constants')
        const list = rows.slice(0, 10).map((r) => r.oscNumber).join(', ')
        await notifyRoles({
            roles: [ROLE.ADMIN],
            title: `${rows.length} order${rows.length === 1 ? '' : 's'} due today not at QC`,
            body: `Due today and not yet at QC: ${list}${rows.length > 10 ? ` and ${rows.length - 10} more` : ''}.`,
            subBody: 'Open the due-today list to see where each one is.',
            type: NOTIFICATION_TYPE.ORDER_UPDATED,
        })
    }
    return { ran: true, count: rows.length }
}

module.exports = { dueTodayNotAtQc, runDueTodayAlert, PAST_QC }
