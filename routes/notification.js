const router = require('express').Router()
const NotificationController = require('../controllers/notification.controller')
const auth = require('../middlewares/auth')
const {
    ROUTE_GET_USER_NOTIFICATIONS,
    ROUTE_GET_USER_NOTIFICATION,
    ROUTE_MARK_NOTIFICATION_AS_READ,
    ROUTE_MARK_ALL_NOTIFICATIONS_AS_READ,
    ROUTE_DELETE_NOTIFICATION,
    ROUTE_DELETE_ALL_NOTIFICATIONS,
} = require('../util/page-route')

// ── Get All Notifications ──────────────────────────────────────────────────────

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get all notifications for the authenticated user
 *     description: |
 *       Returns a paginated list of notifications for the current user,
 *       sorted by newest first. Also returns the total `unreadCount`
 *       so the frontend can badge the notification icon.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: Paginated notification list and unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Notification'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *                     unreadCount:
 *                       type: integer
 *                       example: 3
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_USER_NOTIFICATIONS, [auth], (req, res) => {
    const controller = new NotificationController()
    return controller.getNotifications(req, res)
})

// ── Get Single Notification ────────────────────────────────────────────────────

/**
 * @swagger
 * /notification/{id}:
 *   get:
 *     summary: Get a single notification by ID
 *     description: |
 *       Returns the full details of a single notification.
 *       If the notification was previously unread, it is automatically
 *       marked as read when this endpoint is called.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Notification detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   $ref: '#/components/schemas/Notification'
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */
router.get(ROUTE_GET_USER_NOTIFICATION, [auth], (req, res) => {
    const controller = new NotificationController()
    return controller.getNotification(req, res)
})

// ── Mark Single as Read ────────────────────────────────────────────────────────

/**
 * @swagger
 * /notification/{id}/mark-read:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Notification marked as read
 *       400:
 *         description: Notification already read
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_MARK_NOTIFICATION_AS_READ, [auth], (req, res) => {
    const controller = new NotificationController()
    return controller.markAsRead(req, res)
})

// ── Mark All as Read ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /notifications/mark-all-read:
 *   patch:
 *     summary: Mark all notifications as read
 *     description: Marks every unread notification for the current user as read in one call.
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 5 notification(s) marked as read
 *       500:
 *         description: Server error
 */
router.patch(ROUTE_MARK_ALL_NOTIFICATIONS_AS_READ, [auth], (req, res) => {
    const controller = new NotificationController()
    return controller.markAllAsRead(req, res)
})

// ── Delete Single Notification ─────────────────────────────────────────────────

/**
 * @swagger
 * /notification/{id}:
 *   delete:
 *     summary: Delete a single notification
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, example: "64d3c9c0f1b2a8e9d0f12345" }
 *     responses:
 *       200:
 *         description: Notification deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Notification deleted
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Server error
 */
router.delete(ROUTE_DELETE_NOTIFICATION, [auth], (req, res) => {
    const controller = new NotificationController()
    return controller.deleteNotification(req, res)
})

// ── Delete All Notifications ───────────────────────────────────────────────────

/**
 * @swagger
 * /notifications:
 *   delete:
 *     summary: Delete all notifications for the authenticated user
 *     tags:
 *       - Notifications
 *     responses:
 *       200:
 *         description: All notifications deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 12 notification(s) deleted
 *       500:
 *         description: Server error
 */
router.delete(ROUTE_DELETE_ALL_NOTIFICATIONS, [auth], (req, res) => {
    const controller = new NotificationController()
    return controller.deleteAllNotifications(req, res)
})

module.exports = router