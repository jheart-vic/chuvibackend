const mongoose = require('mongoose')

// Admin-managed complaint categories (Not Washed Well, Stain Remains, ...).
// The Feedback & Recovery System never invents these — it uses the active ones.
const complaintTypeSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, unique: true },
        description: { type: String },
        active: { type: Boolean, default: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
)

const ComplaintTypeModel = mongoose.model('ComplaintType', complaintTypeSchema)
module.exports = ComplaintTypeModel
