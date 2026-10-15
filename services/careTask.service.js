const BaseService = require('./base.service')
const CareTaskModel = require('../models/careTask.model')
const { getObjectId } = require('../util/helper')

// The customer experience officer's task list (V1 launch batch 2).
class CareTaskService {
    static async list({ status = 'open', type, page = 1, limit = 20 } = {}) {
        try {
            const q = {}
            if (status && status !== 'all') q.status = status
            if (type) q.type = type
            const p = Math.max(1, Number(page) || 1)
            const l = Math.min(100, Math.max(1, Number(limit) || 20))
            const [rows, total] = await Promise.all([
                CareTaskModel.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).populate('closedBy', 'fullName').lean(),
                CareTaskModel.countDocuments(q),
            ])
            return BaseService.sendSuccessResponse({
                message: {
                    data: rows.map((t) => ({
                        id: t._id,
                        type: t.type,
                        title: t.title,
                        detail: t.detail || null,
                        orderId: t.orderId || null,
                        oscNumber: t.oscNumber || null,
                        customerName: t.customerName || null,
                        phoneNumber: t.phoneNumber || null,
                        status: t.status,
                        createdAt: t.createdAt,
                        closedAt: t.closedAt || null,
                        closedBy: t.closedBy?.fullName || null,
                        closeReason: t.closeReason || null,
                    })),
                    pagination: { total, page: p, limit: l, pages: Math.ceil(total / l) },
                },
            })
        } catch (error) {
            console.error('care task list failed:', error)
            return BaseService.sendFailedResponse({ error: 'Could not load the tasks.' })
        }
    }

    static async close({ id, userId, note }) {
        try {
            const _id = getObjectId(id)
            if (!_id) return BaseService.sendFailedResponse({ error: 'Task not found.' })
            const task = await CareTaskModel.findOneAndUpdate(
                { _id, status: 'open' },
                { $set: { status: 'closed', closedAt: new Date(), closedBy: userId, closeReason: String(note || '').trim() || 'done' } },
                { new: true },
            ).lean()
            if (!task) {
                const exists = await CareTaskModel.exists({ _id })
                return BaseService.sendFailedResponse({ error: exists ? 'This task is already closed.' : 'Task not found.' })
            }
            return BaseService.sendSuccessResponse({ message: { id: task._id, status: task.status, closedAt: task.closedAt } })
        } catch (error) {
            console.error('care task close failed:', error)
            return BaseService.sendFailedResponse({ error: 'Could not close the task.' })
        }
    }
}

module.exports = CareTaskService
