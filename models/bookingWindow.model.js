const mongoose = require('mongoose')
const { DAY_KEYS } = require('../util/bookingWindow')

/**
 * A pickup/delivery TIME WINDOW (client decisions D1–D5, 2026-10-08).
 *
 * ONE window covers BOTH legs (D1) — there is no separate pickup window and
 * delivery window, and no `leg` field here. The client starts with exactly one:
 * "Evening", 15:00–18:30, Tue–Sun, 60 minute cutoff, limit 10. A morning window
 * comes later, which is why this is a collection and not four settings fields.
 *
 * The windows REPLACE today's `AdminSetting.pickupTimeSlots`, which was never
 * real: it is free text, its validator line is commented out in both
 * bookOrder.service.js and the model enum, and it has no cutoff and no limit.
 * Leave that field in place for one release so an old app build still renders
 * something, but nothing should read it once windows are live.
 */
const bookingWindowSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },

        // 'HH:mm', Lagos wall-clock (the process is pinned to Africa/Lagos).
        // Stored as strings rather than minutes because an admin edits them in a
        // settings screen and reads them back; `util/bookingWindow.parseHhMm`
        // is strict about the format so a typo cannot silently become midnight.
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },

        // Which days this window runs. Checked ON TOP of the working-days
        // setting: an unticked working day has NO windows at all (D6), which is
        // a stronger statement than this list.
        days: {
            type: [{ type: String, enum: DAY_KEYS }],
            default: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        },

        // How long before `startTime` bookings close. 60 → a 15:00 window stops
        // accepting at 14:00.
        cutoffMinutes: { type: Number, default: 60, min: 0 },

        // D5: ONE shared count per window per day, against this limit, covering
        // pickups AND deliveries together.
        //
        // **`null` MEANS NO LIMIT** — the client's words, "blank limit = no
        // limit". It is deliberately nullable rather than defaulting to a
        // number, because a window that silently acquired a cap would start
        // deflecting customers with nothing on screen to explain it.
        //
        // This REPLACED the earlier "bags per bike × bikes on duty" idea
        // entirely: when a bike is added the admin raises this number. Do not
        // reintroduce a multiplication.
        limit: { type: Number, default: null, min: 0 },

        isActive: { type: Boolean, default: true },

        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
)

const BookingWindowModel = mongoose.model('BookingWindow', bookingWindowSchema)

module.exports = BookingWindowModel
