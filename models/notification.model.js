const mongoose = require('mongoose')
const { ROLE, NOTIFICATION_TYPE } = require('../util/constants')

const notificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        title: { type: String, required: true },
        body: { type: String, required: true },
        subBody: { type: String },
        type: {
            type: String,
            required: true,
            enum: Object.values(NOTIFICATION_TYPE),
            default: NOTIFICATION_TYPE.SYSTEM,
        },
        isRead: { type: Boolean, default: false },
    },
    { timestamps: true },
)

const NotificationModel = mongoose.model('Notification', notificationSchema)
module.exports = NotificationModel
