const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const AdminSettingModel = require('../models/adminSetting.model')
const ActivityModel = require('../models/activity.model')
const createNotification = require('../util/createNotification')
const sendEmail = require('../util/emailService')
const {
    ORDER_STATUS,
    ROLE,
    NOTIFICATION_TYPE,
    ACTIVITY_TYPE,
} = require('../util/constants')

// A dispatch leg with no rider is invisible work: the rider queue only lists
// assigned runs, and intake can't receive an order until it has been picked up.
// This sweep tells staff before it goes stale.
const LEGS = [
    { leg: 'pickup', flag: 'isPickUp', stage: ORDER_STATUS.PENDING, label: 'pickup' },
    { leg: 'delivery', flag: 'isDelivery', stage: ORDER_STATUS.READY, label: 'delivery' },
]

const STAFF_ROLES = [ROLE.ADMIN, ROLE.INTAKE_AND_TAG]

async function staffRecipients() {
    return UserModel.find({ userType: { $in: STAFF_ROLES } })
        .select('_id fullName email')
        .lean()
}

function ageMinutes(order) {
    return Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000)
}

async function notifyStaff(staff, order, label, minutes) {
    const title = `Order awaiting ${label} rider`
    const body = `Order ${order.oscNumber} has had no ${label} rider assigned for ${minutes} minutes.`
    for (const s of staff) {
        try {
            await createNotification({
                userId: s._id,
                title,
                body,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.DISPATCH_ASSIGNMENT,
                page: 'order',
                recordId: order._id,
            })
        } catch (err) {
            console.warn('Dispatch alert notification failed (non-fatal):', err.message)
        }
    }
}

async function emailStaff(staff, order, label, minutes) {
    const html = `<p>Order <strong>${order.oscNumber}</strong> still has no ${label} rider assigned after ${minutes} minutes.</p>
<p>Customer: ${order.fullName || '—'} (${order.phoneNumber || '—'})</p>
<p>Please assign a rider from the intake dashboard.</p>`
    for (const s of staff) {
        if (!s.email) continue
        try {
            await sendEmail({
                to: s.email,
                subject: `Escalation: ${order.oscNumber} awaiting ${label} rider`,
                html,
            })
        } catch (err) {
            console.warn('Dispatch escalation email failed (non-fatal):', err.message)
        }
    }
}

// Returns { alerted, escalated }. Never throws — the cron must survive.
async function sweep() {
    const settings = (await AdminSettingModel.findOne({}).lean()) || {}
    const alertAfter = settings.unassignedDispatchAlertMinutes ?? 30
    const escalateAfter = settings.unassignedDispatchEscalateMinutes ?? 60

    const now = Date.now()
    const alertCutoff = new Date(now - alertAfter * 60000)
    const escalateCutoff = new Date(now - escalateAfter * 60000)

    let staff = null
    let alerted = 0
    let escalated = 0

    for (const { leg, flag, stage, label } of LEGS) {
        const base = {
            [flag]: true,
            'stage.status': stage,
            [`dispatchDetails.${leg}.rider`]: null,
        }

        const toAlert = await BookOrderModel.find({
            ...base,
            createdAt: { $lte: alertCutoff },
            [`dispatchDetails.${leg}.alertedAt`]: null,
        })
            .select('oscNumber fullName phoneNumber createdAt')
            .lean()

        const toEscalate = await BookOrderModel.find({
            ...base,
            createdAt: { $lte: escalateCutoff },
            [`dispatchDetails.${leg}.escalatedAt`]: null,
        })
            .select('oscNumber fullName phoneNumber createdAt')
            .lean()

        if (!toAlert.length && !toEscalate.length) continue
        if (!staff) staff = await staffRecipients()
        if (!staff.length) return { alerted, escalated }

        for (const order of toAlert) {
            const mins = ageMinutes(order)
            await notifyStaff(staff, order, label, mins)
            await BookOrderModel.updateOne(
                { _id: order._id },
                { $set: { [`dispatchDetails.${leg}.alertedAt`]: new Date() } },
            )
            await ActivityModel.create({
                title: `Unassigned ${label} alert`,
                description: `Order ${order.oscNumber} has had no ${label} rider for ${mins} minutes.`,
                type: ACTIVITY_TYPE.ORDER_UPDATED,
                orderId: order._id,
                reference: order.oscNumber,
            }).catch(() => {})
            alerted++
        }

        for (const order of toEscalate) {
            const mins = ageMinutes(order)
            await emailStaff(staff, order, label, mins)
            await BookOrderModel.updateOne(
                { _id: order._id },
                { $set: { [`dispatchDetails.${leg}.escalatedAt`]: new Date() } },
            )
            escalated++
        }
    }

    return { alerted, escalated }
}

// Clear the guards when a rider is assigned, so a later unassignment re-arms.
async function clearGuards(orderId, leg) {
    try {
        await BookOrderModel.updateOne(
            { _id: orderId },
            {
                $unset: {
                    [`dispatchDetails.${leg}.alertedAt`]: '',
                    [`dispatchDetails.${leg}.escalatedAt`]: '',
                },
            },
        )
    } catch (err) {
        console.warn('Clearing dispatch alert guards failed (non-fatal):', err.message)
    }
}

module.exports = { sweep, clearGuards }
