const mongoose = require('mongoose')
const { COMM_CHANNEL } = require('../util/constants')

// Admin-managed message templates. The communication service never invents
// content — it renders one of these. Placeholders use {{key}} syntax:
// {{name}} / {{firstName}} come from the user document, anything else from
// the data object the calling system passes in.
const templateSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        name: { type: String, required: true }, // human label for the dashboard
        title: { type: String, required: true }, // notification title
        body: { type: String, required: true }, // notification body
        // SMS variant; falls back to body when unset. Keep it short — SMS is
        // billed per 160-char segment.
        smsBody: { type: String },
        channels: {
            type: [String],
            enum: Object.values(COMM_CHANNEL),
            default: [COMM_CHANNEL.IN_APP],
        },
        // deep link defaults: which app page this message should open
        page: { type: String },
        active: { type: Boolean, default: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
)

const TemplateModel = mongoose.model('Template', templateSchema)
module.exports = TemplateModel
