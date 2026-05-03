const NotificationService = require('../services/notification.service')
const BaseController = require('./base.controller')

class NotificationController extends BaseController {

    // ── Get All Notifications ──────────────────────────────────────────────────
    async getNotifications(req, res) {
        const result = await NotificationService.getNotifications(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── Get Single Notification ────────────────────────────────────────────────
    async getNotification(req, res) {
        const result = await NotificationService.getNotification(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── Mark Single as Read ────────────────────────────────────────────────────
    async markAsRead(req, res) {
        const result = await NotificationService.markAsRead(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── Mark All as Read ───────────────────────────────────────────────────────
    async markAllAsRead(req, res) {
        const result = await NotificationService.markAllAsRead(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── Delete Single Notification ─────────────────────────────────────────────
    async deleteNotification(req, res) {
        const result = await NotificationService.deleteNotification(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── Delete All Notifications ───────────────────────────────────────────────
    async deleteAllNotifications(req, res) {
        const result = await NotificationService.deleteAllNotifications(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
}

module.exports = NotificationController