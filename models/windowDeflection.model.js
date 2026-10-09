const mongoose = require('mongoose')
const { DISPATCH_LEG } = require('../util/bookingWindow')

/**
 * A customer was MOVED because a window was full (client decision D5: "keep the
 * daily count of windows that filled and customers moved").
 *
 * ⚠️ WHY THIS COLLECTION HAS TO EXIST AT ALL — the one finding from the logic
 * document that costs real work:
 *
 *   **"Customers moved because a window was full" CANNOT be derived from saved
 *   orders.** A deflected customer leaves no trace. Their order records the
 *   window they ENDED UP with, which looks identical to a customer who wanted
 *   that window all along. The order they wanted and could not have is nowhere.
 *
 * So the row must be written AT THE MOMENT the full window is dropped from the
 * offered list — not reconstructed from the order afterwards, because by then
 * the information is gone. Same shape as the N2 NPS asked-vs-answered clock
 * (an ignored prompt leaves no Feedback row) and as
 * `windowWasBookableAtBooking` on the Anytime refund.
 *
 * Consequence worth stating plainly: this is logged when the slot list is
 * BUILT, so it counts customers who were shown a full window — which is the
 * number the client asked for ("windows that filled and customers moved"), and
 * it is not the same as, and will be larger than, the count of orders that
 * changed window. One customer refreshing the booking screen three times is
 * three rows. Dedupe on `userId + date + windowId` when reporting, not on write
 * — the raw rows are also how we see a window filling up repeatedly.
 */
const windowDeflectionSchema = new mongoose.Schema(
    {
        // The Lagos day the customer was trying to book, 'YYYY-MM-DD'. A string
        // key, not a Date, because the whole figure is "per window per day" and
        // a string cannot drift by an hour.
        date: { type: String, required: true, index: true },

        windowId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BookingWindow',
        },
        // Denormalised so a renamed or deleted window does not erase history.
        windowName: { type: String },

        leg: {
            type: String,
            enum: Object.values(DISPATCH_LEG),
            required: true,
        },

        // Absent for an unauthenticated browse of the booking screen.
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

        // What the window was holding when it turned them away — so the report
        // can show the limit that was in force, not today's limit.
        limit: { type: Number },
        booked: { type: Number },

        occurredAt: { type: Date, default: Date.now, index: true },
    },
    { timestamps: true },
)

windowDeflectionSchema.index({ date: 1, windowId: 1 })

const WindowDeflectionModel = mongoose.model(
    'WindowDeflection',
    windowDeflectionSchema,
)

module.exports = WindowDeflectionModel
