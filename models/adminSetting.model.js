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
        // ADMIN-EDITABLE DISPLAY NAMES (client spec 2026-10-07: "admin must be
        // able to rename delivery speeds / service types / care tiers —
        // DISPLAY NAME ONLY").
        //
        // ⚠️ "Display name only" is not a limitation we chose, it is the only
        // safe reading, and the trap is worth spelling out:
        //
        //   * `deliverySpeed` and `serviceTier` are ENUM fields on BookOrder
        //     (`enum: Object.values(DELIVERY_SPEED)` / `SERVICE_TIERS`).
        //     Renaming a stored value would fail validation on every new order
        //     and orphan every existing one.
        //   * `serviceTypes[].name` IS the value stored on the order, and
        //     pricing matches on it (`service.name === post.serviceType`). So
        //     editing a service type's `name` — which `updateAdminSettings`
        //     happily allows, because it $sets anything — silently breaks
        //     pricing for every order already placed under the old name, which
        //     then falls back to a multiplier of 1.
        //
        // So renaming is a LABEL layer: keys are the stored values and never
        // change; only what the customer and staff READ changes. A Map rather
        // than named fields, so a new speed or tier needs a settings edit and
        // not a deploy — the same reasoning as `walletAdjustmentLimits`.
        displayNames: {
            deliverySpeeds: { type: Map, of: String, default: undefined },
            serviceTypes: { type: Map, of: String, default: undefined },
            serviceTiers: { type: Map, of: String, default: undefined },
        },

        // N1 cancellation charges (client spec 2026-10-07): "after pickup,
        // before payment, the customer pays ₦1,000 + ₦1,000 before the clothes
        // go back, EVEN IF a free-pickup offer applied."
        //
        // Their own settings rather than being derived from `order.pricing`,
        // and that is the whole point: an offer-covered order was billed ₦0 for
        // logistics, so deriving the charge would make cancelling a free-pickup
        // order cost nothing and absorb the rider's trip. The trip is real work.
        cancellationPickupFee: { type: Number, default: 1000 },
        // V1 launch batch 2 (client 15 Oct, B9/R24): every unpaid-bill timer is a
        // setting, in MINUTES so the test values (10 / 30 / 45 / 60) fit as well
        // as the real ones. Counted from when the bill (payment hold) was raised.
        // V1 batch 2 (R21, R24): a Quick Booking whose real count is more than
        // this many times the booked count gets a new ready date.
        quickBookingRecountTrigger: { type: Number, default: 2, min: 1 },
        // V1 batch 3 (B34): the hour (Lagos) admin is alerted to orders due today
        // that are not yet at QC. The last-run day is the once-a-day latch.
        dueTodayCheckHour: { type: Number, default: 15, min: 0, max: 23 },
        dueTodayCheckLastRun: { type: String },
        // V1 batch 2 (R23): no SMS (and no feedback request) in these hours,
        // Lagos time; held until endHour.
        quietHours: {
            startHour: { type: Number, default: 21, min: 0, max: 23 },
            endHour: { type: Number, default: 7, min: 0, max: 23 },
        },
        // V1 batch 2 (R17): recount cover and the repeat-mismatch limit. 0 in
        // either cover limit means no cover. Launch 10% and N200 (test N600).
        recountCover: {
            percent: { type: Number, default: 10, min: 0 },
            maxAmount: { type: Number, default: 200, min: 0 },
            repeatLimit: { type: Number, default: 3, min: 0 },
            repeatDays: { type: Number, default: 60, min: 1 },
        },
        unpaidBillTimers: {
            // first reminder SMS: real 3 hours, test 10 minutes
            firstReminderMinutes: { type: Number, default: 180, min: 1 },
            // second reminder SMS at this hour on the day after the bill (9 AM)
            nextDayReminderHour: { type: Number, default: 9, min: 0, max: 23 },
            // "Call: unpaid bill" tasks for customer experience: real 24 h and 72 h
            taskMinutes: { type: [Number], default: () => [1440, 4320] },
            // admin flag: real 7 days, test 60 minutes
            adminFlagMinutes: { type: Number, default: 10080, min: 1 },
        },
        // V1 launch batch 2 (R22): the charge for the second and later
        // redelivery after "Customer not available". Unset → the delivery fee.
        redeliveryFee: { type: Number, min: 0 },
        cancellationReturnFee: { type: Number, default: 1000 },

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

        // Launch item 3 (client 11–12 Oct 2026). A half day counts ½ towards a
        // ready date and gets half of each floor limit (Sunday). Read through
        // `util/bookingWindow.normalizeHalfDays`, so a document without it
        // behaves as the default.
        halfDays: {
            type: [String],
            default: () => ['sun'],
        },
        // The daily floor limit in PIECES (client 12 Oct): one number for the
        // whole floor, with the Ready Today (`same-day`) and Express shares
        // INSIDE it; Regular uses the rest. × the day's weight (Sunday half,
        // Monday 0). Replaces the dead `*Capacity` fields below, which were
        // never read from here.
        floorLimits: {
            dailyPieces: { type: Number, default: 150, min: 0 },
            sameDayPieces: { type: Number, default: 30, min: 0 },
            expressPieces: { type: Number, default: 50, min: 0 },
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
