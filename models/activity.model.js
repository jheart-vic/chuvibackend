const mongoose = require('mongoose')
const { ACTIVITY_TYPE } = require('../util/constants')

const activitySchema = new mongoose.Schema(
    {
        title: { type: String, required: true },
        description: { type: String, required: true },
        type: {
            type: String,
            required: true,
            enum: Object.values(ACTIVITY_TYPE),
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BookOrder',
            default: null,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        }, // "By"
        reference: { type: String, default: null },
    },
    { timestamps: true },
)

const ActivityModel = mongoose.model('Activity', activitySchema)
module.exports = ActivityModel
