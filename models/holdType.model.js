const mongoose = require('mongoose')
const { ROLE } = require('../util/constants')

// Client brief reply, section B (2026-10-07): "the limit should depend on the
// kind of hold, not on the speed of the order."
//
// Why this exists: Quick Booking creates PAYMENT holds, which legitimately last
// a day or more. Under the 2 / 4 / 6-hour limits by delivery speed that item 4.4
// shipped, every payment hold would be Overdue within hours and the Overdue card
// would become noise — the exact thing 4.4 was fixing.
//
// `slaHours: null` means "fall back to the order's delivery-speed limit", which
// is what every operational hold type is seeded with. So nothing changes for the
// stations until the admin actually sets a limit, and the client can still
// choose "operational holds keep 2/4/6, payment holds 48h" without a rebuild.
const holdTypeSchema = new mongoose.Schema(
    {
        // stable identifier used on the order (`holdDetails.holdTypeKey`) and in
        // code. Never renamed — `name` is what the screens show, and the admin
        // may change that freely.
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        name: { type: String, required: true, trim: true },
        description: { type: String },
        // Hours on hold before it is Overdue. NULL = use the order's delivery
        // speed (same-day 2 / express 4 / standard 6), i.e. today's behaviour.
        slaHours: { type: Number, min: 0.25, default: null },
        // Which stations may raise it. Empty = any station.
        stations: [
            {
                type: String,
                enum: [
                    ROLE.ADMIN,
                    ROLE.INTAKE_AND_TAG,
                    ROLE.SORT_AND_PRETREAT,
                    ROLE.WASH_AND_DRY,
                    ROLE.PRESS,
                    ROLE.QC,
                    ROLE.CUSTOMER_EXPERIENCE,
                ],
            },
        ],
        // "It is judged only by its own limit" (client, on the payment hold).
        // A payment hold must NOT be dragged into Overdue by the order's promised
        // delivery date — on Quick Booking that date does not even exist yet,
        // because the clock starts when payment is confirmed.
        judgeByOwnLimitOnly: { type: Boolean, default: false },
        // Overdue → tell an admin. The client asked for escalation on breach.
        escalateToAdmin: { type: Boolean, default: true },
        // Client 2026-10-08 §3.5: some holds may only be cleared by an admin,
        // not by the station that raised them — the count-mismatch hold on a
        // Quick Booking is the first. Read by the release path, so a station
        // operator cannot wave through a discrepancy they are party to.
        requiresAdminApproval: { type: Boolean, default: false },
        // System types are seeded, drive code paths and cannot be deleted.
        // `payment` is raised by the system, never by a person.
        isSystem: { type: Boolean, default: false },
        systemRaisedOnly: { type: Boolean, default: false },
        active: { type: Boolean, default: true },
    },
    { timestamps: true },
)

const HoldTypeModel = mongoose.model('HoldType', holdTypeSchema)

// The payment hold is referenced by name from the booking/payment flow, so its
// key is a constant rather than a string typed in several places.
HoldTypeModel.PAYMENT_HOLD_KEY = 'payment'

module.exports = HoldTypeModel
