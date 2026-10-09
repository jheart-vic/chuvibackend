const mongoose = require('mongoose')
const { ROLE } = require('../util/constants')

const ServiceTypeSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        pricePerPiece: { type: Number, required: true, default: 700 },
    },
    { _id: false },
)

const BankDetailsSchema = new mongoose.Schema(
    {
        bankName: { type: String },
        accountNumber: { type: String },
        accountName: { type: String },
    },
    { _id: false },
)

const adminSettingSchema = new mongoose.Schema(
    {
        // ✅ serviceType now owns its own price — name and charge both editable
        serviceTypes: {
            type: [ServiceTypeSchema],
            default: [
                { name: 'wash-and-iron', pricePerPiece: 700 },
                { name: 'washing-only', pricePerPiece: 700 },
                { name: 'ironing-only', pricePerPiece: 700 },
                { name: 'dry-clean', pricePerPiece: 700 },
            ],
        },

        // ✅ Bank Details
        bankDetails: {
            type: BankDetailsSchema,
            default: {
                bankName: 'MONIEPOINT MICROFINANCE BANK',
                accountNumber: '8163149879',
                accountName: 'CHUVI LAUNDRY ENTERPRISE',
            },
        },

        sameDayCharge: { type: Number, default: 300 },
        expressCharge: { type: Number, default: 100 },
        premiumServiceTierCharge: { type: Number, default: 1.5 },
        vipServiceTierCharge: { type: Number, default: 2 },

        pickupTimeSlots: {
            type: [String],
            default: ['10am-12pm', '4pm-6pm'],
        },

        standardCapacity: { type: Number, default: 100 },
        sameDayCapacity: { type: Number, default: 50 },
        expressCapacity: { type: Number, default: 30 },
        standardDeliveryPeriod: { type: Number, default: 2 },
        deliveryFee: { type: Number, default: 500 },
        pickupFee: { type: Number, default: 500 },

        // Minutes after order creation during which a customer may cancel freely
        // (Green), even if a pickup was auto-scheduled. Client decision: 10–15.
        orderCancellationGraceMinutes: { type: Number, default: 15 },

        // Dispatch legs left without a rider: notify staff after the first
        // threshold, escalate by email after the second.
        unassignedDispatchAlertMinutes: { type: Number, default: 30 },
        unassignedDispatchEscalateMinutes: { type: Number, default: 60 },

        // How much each ROLE may move in one wallet adjustment without an
        // admin approving it. Client brief 6 Oct 2026, item 2.4: "A limit for
        // each role, which the admin sets in settings. It must not be fixed in
        // the code, because we will change it."
        //
        // A Map (role name → naira) rather than named fields, so a new role
        // gets a limit by editing settings instead of by a deploy. A role with
        // no entry has NO self-service allowance: every adjustment it makes
        // becomes a request. Admin is unlimited and never checked.
        // Updated through the normal admin-settings endpoint, which $sets
        // whatever it is given.
        // CLIENT DECISION (2026-10-08, section 3): station holds KEEP their
        // limit by delivery speed — same-day 2h, express 4h, standard 6h — but
        // "the admin can edit these three numbers". They were fixed in code
        // (util/holdSla.js) until now; that file still holds the defaults and
        // falls back to them when this is unset, so an unseeded database keeps
        // behaving exactly as before.
        // The PAYMENT hold does not appear here: it is a hold TYPE with its own
        // limit, because the delivery clock has not even started when it is
        // raised.
        holdSlaHoursBySpeed: {
            type: Map,
            of: Number,
            default: undefined,
        },
        // ─────────── WINDOW BOOKING / WORKING DAYS (client D1–D6, 2026-10-08) ───────────
        //
        // D6: a tick box per day. An unticked day has NO windows and NO Anytime
        // dispatch — bookings are offered the next working day — AND the
        // promised delivery date must skip it. Tue–Sun to start; Monday closed.
        // Ticking a day makes it live at once (nothing caches this).
        //
        // Stored as day keys in `util/bookingWindow.DAY_KEYS` form.
        // `normalizeWorkingDays` also accepts a `{mon:false,tue:true}` object,
        // because "tick box per day" is how the client describes it and an FE
        // may well send booleans.
        workingDays: {
            type: [String],
            default: () => ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        },

        // D2(b): Anytime dispatch is open 08:00–17:00 on a working day, "both
        // settings". Outside those hours the app promises first thing on the
        // next working day rather than refusing the booking.
        anytimeOpenFrom: { type: String, default: '08:00' },
        anytimeOpenTo: { type: String, default: '17:00' },

        // The Anytime PREMIUM. Note what is NOT here: there is no
        // `windowPickupFee`/`windowDeliveryFee`, because the existing
        // `pickupFee`/`deliveryFee` (₦500 each) already ARE the client's window
        // price, and a second pair of fields would be two sources of truth for
        // one number.
        //
        // ⚠️ TELL THE CLIENT BEFORE THEY ANNOUNCE IT: at these defaults a
        // WINDOW booking costs exactly what every booking costs today
        // (500 + 500 = their ₦1,000 "inside a window" figure), so no existing
        // customer pays more — only choosing Anytime costs extra.
        anytimePickupFee: { type: Number, default: 1000 },
        anytimeDeliveryFee: { type: Number, default: 1000 },

        walletAdjustmentLimits: {
            type: Map,
            of: Number,
            default: () =>
                new Map([
                    [ROLE.INTAKE_AND_TAG, 5000], // client: "Intake and Tag starts at ₦5,000"
                    [ROLE.CUSTOMER_EXPERIENCE, 10000], // client: "₦10,000 for refunds by CX"
                ]),
        },
    },
    { timestamps: true },
)

const AdminSettingModel = mongoose.model('AdminSetting', adminSettingSchema)

module.exports = AdminSettingModel
