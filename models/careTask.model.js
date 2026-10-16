const mongoose = require('mongoose')

// A to-do for the customer experience officer (V1 launch batch 2, client 15 Oct):
// "after 2 failures, a 'call the customer' task" and "customer care tasks at 24
// and 72 hours" for unpaid bills. One row per task; `key` makes raising one
// idempotent (the same task is never created twice for the same order).
const careTaskSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        type: {
            type: String,
            enum: ['failed-pickups', 'unpaid-bill', 'damage', 'looks-dirty'],
            required: true,
        },
        title: { type: String, required: true },
        detail: { type: String },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookOrder', index: true },
        oscNumber: { type: String },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        customerName: { type: String },
        phoneNumber: { type: String },
        status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
        closedAt: { type: Date },
        closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        // 'done' (a person closed it) or why the system closed it ('paid', 'cancelled').
        closeReason: { type: String },
    },
    { timestamps: true },
)

module.exports = mongoose.model('CareTask', careTaskSchema)
