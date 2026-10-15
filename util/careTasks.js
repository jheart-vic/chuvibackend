// Customer experience tasks (V1 launch batch 2). Raising is idempotent by key and
// never throws: a task is a reminder for a person, and failing to write one must
// never undo the work that triggered it.
const { notifyRoles } = require('./notifyRoles')
const { ROLE, NOTIFICATION_TYPE } = require('./constants')

async function openTask({ key, type, title, detail, order }) {
    try {
        const CareTaskModel = require('../models/careTask.model')
        const res = await CareTaskModel.updateOne(
            { key },
            {
                $setOnInsert: {
                    key,
                    type,
                    title,
                    detail,
                    orderId: order?._id,
                    oscNumber: order?.oscNumber,
                    userId: order?.userId?._id || order?.userId,
                    customerName: order?.fullName,
                    phoneNumber: order?.phoneNumber,
                    status: 'open',
                },
            },
            { upsert: true },
        )
        if (res.upsertedCount) {
            try {
                await notifyRoles({
                    roles: [ROLE.CUSTOMER_EXPERIENCE, ROLE.ADMIN],
                    title,
                    body: detail || title,
                    subBody: order?.oscNumber ? `Order ID: ${order.oscNumber}` : undefined,
                    type: NOTIFICATION_TYPE.ORDER_UPDATED,
                })
            } catch (err) {
                console.error('care task notify failed:', err?.message)
            }
        }
        return Boolean(res.upsertedCount)
    } catch (err) {
        console.error('care task failed:', err?.message)
        return false
    }
}

/** Close the open tasks of one type on an order (e.g. the bill was paid). */
async function closeTasks({ orderId, type, reason }) {
    try {
        const CareTaskModel = require('../models/careTask.model')
        const q = { orderId, status: 'open' }
        if (type) q.type = type
        const res = await CareTaskModel.updateMany(q, {
            $set: { status: 'closed', closedAt: new Date(), closeReason: reason },
        })
        return res.modifiedCount
    } catch (err) {
        console.error('close care tasks failed:', err?.message)
        return 0
    }
}

module.exports = { openTask, closeTasks }
