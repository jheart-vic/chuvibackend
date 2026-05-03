const NotificationModel = require('../models/notification.model')
const UserModel = require('../models/user.model')
const BaseService = require('./base.service')
const paginate = require('../util/paginate')

class NotificationService extends BaseService {

    // ── Get All Notifications ──────────────────────────────────────────────────
    async getNotifications(req) {
        try {
            const userId = req.user.id
            const { page = 1, limit = 20 } = req.query

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const { data, pagination } = await paginate(
                NotificationModel,
                { userId },
                {
                    page,
                    limit,
                    sort: { createdAt: -1 },
                    lean: true,
                },
            )

            const unreadCount = await NotificationModel.countDocuments({ userId, isRead: false })

            return BaseService.sendSuccessResponse({ message: { data, pagination, unreadCount } })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch notifications' })
        }
    }

    // ── Get Single Notification ────────────────────────────────────────────────
    async getNotification(req) {
        try {
            const userId = req.user.id
            const notificationId = req.params.id

            if (!notificationId) return BaseService.sendFailedResponse({ error: 'Notification ID is required' })

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const notification = await NotificationModel.findOne({ _id: notificationId, userId }).lean()
            if (!notification) return BaseService.sendFailedResponse({ error: 'Notification not found' })

            // auto-mark as read when viewed
            if (!notification.isRead) {
                await NotificationModel.updateOne({ _id: notificationId }, { $set: { isRead: true } })
                notification.isRead = true
            }

            return BaseService.sendSuccessResponse({ message: notification })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch notification' })
        }
    }

    // ── Mark Single as Read ────────────────────────────────────────────────────
    async markAsRead(req) {
        try {
            const userId = req.user.id
            const notificationId = req.params.id

            if (!notificationId) return BaseService.sendFailedResponse({ error: 'Notification ID is required' })

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const notification = await NotificationModel.findOne({ _id: notificationId, userId })
            if (!notification) return BaseService.sendFailedResponse({ error: 'Notification not found' })

            if (notification.isRead) {
                return BaseService.sendFailedResponse({ error: 'Notification is already marked as read' })
            }

            await NotificationModel.updateOne({ _id: notificationId }, { $set: { isRead: true } })

            return BaseService.sendSuccessResponse({ message: 'Notification marked as read' })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to mark notification as read' })
        }
    }

    // ── Mark All as Read ───────────────────────────────────────────────────────
    async markAllAsRead(req) {
        try {
            const userId = req.user.id

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const result = await NotificationModel.updateMany(
                { userId, isRead: false },
                { $set: { isRead: true } },
            )

            return BaseService.sendSuccessResponse({
                message: `${result.modifiedCount} notification(s) marked as read`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to mark all notifications as read' })
        }
    }

    // ── Delete Single Notification ─────────────────────────────────────────────
    async deleteNotification(req) {
        try {
            const userId = req.user.id
            const notificationId = req.params.id

            if (!notificationId) return BaseService.sendFailedResponse({ error: 'Notification ID is required' })

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const notification = await NotificationModel.findOneAndDelete({ _id: notificationId, userId })
            if (!notification) return BaseService.sendFailedResponse({ error: 'Notification not found' })

            return BaseService.sendSuccessResponse({ message: 'Notification deleted' })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to delete notification' })
        }
    }

    // ── Delete All Notifications ───────────────────────────────────────────────
    async deleteAllNotifications(req) {
        try {
            const userId = req.user.id

            const user = await UserModel.findById(userId)
            if (!user) return BaseService.sendFailedResponse({ error: 'User not found' })

            const result = await NotificationModel.deleteMany({ userId })

            return BaseService.sendSuccessResponse({
                message: `${result.deletedCount} notification(s) deleted`,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error: 'Failed to delete notifications' })
        }
    }
}

module.exports = new NotificationService()