/**
 * BOOKING WINDOWS, ANYTIME DISPATCH AND WORKING DAYS — the pure scheduling
 * engine behind N1 Quick Booking and window booking (client decisions D1–D8,
 * 2026-10-08, plus the two later rulings on same-day pickups and the narrowed
 * Anytime refund).
 *
 * PURE ON PURPOSE. Nothing here touches the database, and `now` is always a
 * parameter — never `new Date()` read inside a branch. Two reasons:
 *
 *   1. Every rule in this file is a CUTOFF rule, i.e. it is a different answer
 *      at 14:00 than at 14:01. A function that reads the clock itself can only
 *      be tested by waiting, which means it is never tested. `util/crmSendWindow.js`
 *      is the same shape and is the reason the client's worked example for the
 *      registered-not-booked sequence could be asserted offline.
 *   2. The refund rule (below) has to be evaluated TWICE against two different
 *      instants — once at booking and once when the job is actually done — so
 *      "the current time" cannot be an implementation detail.
 *
 * The process is pinned to Africa/Lagos in server.js's first statement, so every
 * Date here is already Lagos wall-clock and `getDay()`/`getHours()` are the
 * Lagos day and hour. Do not add timezone maths.
 */

const {
    DELIVERY_SPEED,
    BOOKING_TIMING,
    DISPATCH_LEG,
} = require('./constants')

/**
 * Day keys in JavaScript's own `Date.getDay()` order, so `DAY_KEYS[d.getDay()]`
 * is the key with no lookup table and no off-by-one. The client's "tick box per
 * day" setting stores these strings.
 */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** The client's starting working week: Tue–Sun. Monday is closed. */
const DEFAULT_WORKING_DAYS = ['tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** Anytime dispatch is open 08:00–17:00 on a working day (D2(b)). */
const DEFAULT_ANYTIME_OPEN_FROM = '08:00'
const DEFAULT_ANYTIME_OPEN_TO = '17:00'

/**
 * Why a window was not offered. Carried on the offered-slot rows so the app can
 * say which of the three it is — "full" is the only one that is a deflection.
 */
const SLOT_UNAVAILABLE = {
    NOT_WORKING_DAY: 'not-working-day',
    DOES_NOT_RUN: 'does-not-run-that-day',
    CUTOFF_PASSED: 'cutoff-passed',
    FULL: 'full',
}

// ───────────────────────────── time-of-day helpers ─────────────────────────────

/**
 * 'HH:mm' → minutes after midnight, or null if it is not a valid time.
 * Strict: the windows are admin-editable free text in a settings screen, and a
 * typo that silently became 0 would move a window to midnight.
 */
const parseHhMm = (value) => {
    if (typeof value !== 'string') return null
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
    if (!m) return null
    const hours = Number(m[1])
    const minutes = Number(m[2])
    if (hours > 23 || minutes > 59) return null
    return hours * 60 + minutes
}

/** minutes after midnight → 'HH:mm', for echoing a stored value back. */
const formatHhMm = (minutes) => {
    if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440
    return (
        String(Math.floor(m / 60)).padStart(2, '0') +
        ':' +
        String(m % 60).padStart(2, '0')
    )
}

/** Minutes after midnight of `date` itself (Lagos, per the TZ pin). */
const minutesOfDay = (date) => date.getHours() * 60 + date.getMinutes()

/** A new Date on the same calendar day as `date`, at `minutes` after midnight. */
const atMinutes = (date, minutes) => {
    const out = new Date(date)
    out.setHours(0, 0, 0, 0)
    out.setMinutes(minutes)
    return out
}

const startOfDay = (date) => {
    const out = new Date(date)
    out.setHours(0, 0, 0, 0)
    return out
}

const addDays = (date, n) => {
    const out = new Date(date)
    out.setDate(out.getDate() + n)
    return out
}

/** Same calendar day? (Lagos.) */
const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

const dayKey = (date) => DAY_KEYS[date.getDay()]

/** 'YYYY-MM-DD' for a Lagos day — the bucket key for per-day window counts. */
const dateKey = (date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

// ────────────────────────────── working days (D6) ──────────────────────────────

/**
 * Normalise whatever the settings document holds into a lower-cased array of
 * valid day keys. Tolerant of a Mongoose array, a Map, or a plain object of
 * booleans ("tick box per day" is the client's mental model and an FE may well
 * send `{mon: false, tue: true}`), and it NEVER returns an empty list by
 * accident: an unrecognised or empty setting falls back to the default week,
 * because a working-days list that normalised to `[]` would close the business
 * permanently and refuse every booking.
 */
const normalizeWorkingDays = (workingDays) => {
    let keys = []
    if (Array.isArray(workingDays)) {
        keys = workingDays
    } else if (workingDays instanceof Map) {
        keys = [...workingDays.entries()].filter(([, on]) => on).map(([k]) => k)
    } else if (workingDays && typeof workingDays === 'object') {
        keys = Object.entries(workingDays)
            .filter(([, on]) => on)
            .map(([k]) => k)
    }
    const valid = keys
        .map((k) => String(k).trim().toLowerCase().slice(0, 3))
        .filter((k) => DAY_KEYS.includes(k))
    const unique = [...new Set(valid)]
    return unique.length ? unique : [...DEFAULT_WORKING_DAYS]
}

const isWorkingDay = (date, workingDays) =>
    normalizeWorkingDays(workingDays).includes(dayKey(date))

/**
 * The first working day that is `date` or later. Bounded at 14 days so a
 * misconfigured week (every day unticked — impossible through
 * `normalizeWorkingDays`, but not impossible through a direct DB edit) cannot
 * spin forever; it returns null instead, and callers treat that as "we cannot
 * promise a date".
 */
const nextWorkingDay = (date, workingDays) => {
    const days = normalizeWorkingDays(workingDays)
    let cursor = startOfDay(date)
    for (let i = 0; i < 14; i += 1) {
        if (days.includes(dayKey(cursor))) return cursor
        cursor = addDays(cursor, 1)
    }
    return null
}

/**
 * Advance `count` WORKING days from `date`, skipping unticked days — D6's
 * "the promised delivery date must also skip unticked days".
 *
 * `count: 0` means "today if today is a working day, else the next one", which
 * is what same-day delivery needs. Counting starts the day AFTER `date` for
 * count >= 1, so standard (+2) on a Saturday with Monday closed lands on
 * Tuesday, not Monday.
 */
const addWorkingDays = (date, count, workingDays) => {
    const days = normalizeWorkingDays(workingDays)
    let cursor = nextWorkingDay(date, days)
    if (!cursor) return null
    let remaining = Math.max(0, Math.floor(count || 0))
    let guard = 0
    while (remaining > 0 && guard < 60) {
        cursor = addDays(cursor, 1)
        if (days.includes(dayKey(cursor))) remaining -= 1
        guard += 1
    }
    return remaining === 0 ? cursor : null
}

// ──────────────────────────────── windows (D1–D5) ───────────────────────────────

/**
 * Does this window run on this date? A window carries its own `days[]`, and the
 * WORKING-DAYS setting is checked separately — an unticked day has no windows at
 * all (D6), which is a stronger statement than the window's own day list.
 */
const windowRunsOn = (window, date, workingDays) => {
    if (!window || window.isActive === false) return false
    if (!isWorkingDay(date, workingDays)) return false
    const days = (window.days || []).map((d) =>
        String(d).trim().toLowerCase().slice(0, 3),
    )
    return days.includes(dayKey(date))
}

/**
 * The instant a window stops accepting bookings: its start on that day, minus
 * its own cutoff in minutes (the client's starting window is 15:00 with a 60
 * minute cutoff, so 14:00).
 */
const windowCutoffAt = (window, date) => {
    const start = parseHhMm(window?.startTime)
    if (start === null) return null
    return atMinutes(date, start - Number(window.cutoffMinutes || 0))
}

/** Can this window still be booked for `date`, as at `now`? */
const isWindowBookable = ({ window, date, now, workingDays }) => {
    if (!windowRunsOn(window, date, workingDays)) return false
    const cutoff = windowCutoffAt(window, date)
    if (!cutoff) return false
    return now < cutoff
}

/**
 * Is `instant` inside the window's hours on its own day? Used for the Anytime
 * refund test (b) — "the job was actually done inside that window" — and for
 * nothing else. Deliberately ignores the cutoff: the cutoff governs BOOKING, not
 * whether a dispatch physically happened between 15:00 and 18:30.
 */
const isWithinWindow = (instant, window) => {
    const start = parseHhMm(window?.startTime)
    const end = parseHhMm(window?.endTime)
    if (start === null || end === null) return false
    const at = minutesOfDay(instant)
    return at >= start && at <= end
}

/**
 * A window's remaining capacity for a day. D5: ONE shared count per window per
 * day, against the window's OWN limit, and a blank limit means no limit —
 * "raise a window's limit when a bike is added". This replaced the earlier
 * bagsPerBike × bikesOnDuty idea entirely, so there is no multiplication here.
 *
 * `booked` counts pickups AND deliveries together, because one window covers
 * both legs (D1) and one order is one bag per leg (D4).
 */
const windowRemaining = (window, booked) => {
    const limit = window?.limit
    if (limit === null || limit === undefined || limit === '') return Infinity
    const cap = Number(limit)
    if (!Number.isFinite(cap) || cap < 0) return Infinity
    return Math.max(0, cap - Math.max(0, Number(booked || 0)))
}

const isWindowFull = (window, booked) => windowRemaining(window, booked) <= 0

// ─────────────────────────────── anytime (D2) ───────────────────────────────

/**
 * Is Anytime dispatch open at `now`? D2(b): 08:00–17:00 on a working day, both
 * ends admin settings. Outside those hours the app promises first thing on the
 * next working day rather than refusing the booking.
 */
const isAnytimeOpen = ({ now, workingDays, anytimeOpenFrom, anytimeOpenTo }) => {
    if (!isWorkingDay(now, workingDays)) return false
    const from = parseHhMm(anytimeOpenFrom) ?? parseHhMm(DEFAULT_ANYTIME_OPEN_FROM)
    const to = parseHhMm(anytimeOpenTo) ?? parseHhMm(DEFAULT_ANYTIME_OPEN_TO)
    const at = minutesOfDay(now)
    return at >= from && at <= to
}

/**
 * When an Anytime job will be served: now if Anytime is open, otherwise the
 * opening time on the next working day ("first thing next working day").
 */
const anytimeServiceStart = ({
    now,
    workingDays,
    anytimeOpenFrom,
    anytimeOpenTo,
}) => {
    if (isAnytimeOpen({ now, workingDays, anytimeOpenFrom, anytimeOpenTo })) {
        return new Date(now)
    }
    const from = parseHhMm(anytimeOpenFrom) ?? parseHhMm(DEFAULT_ANYTIME_OPEN_FROM)
    // Still today and before opening → today. Otherwise the next working day.
    const today = nextWorkingDay(now, workingDays)
    if (today && isSameDay(today, now) && minutesOfDay(now) < from) {
        return atMinutes(now, from)
    }
    const next = nextWorkingDay(addDays(now, 1), workingDays)
    return next ? atMinutes(next, from) : null
}

// ──────────────────────── the Anytime refund rule (narrowed) ────────────────────────

/**
 * D2(c), AS NARROWED BY THE CLIENT 2026-10-08.
 *
 * The price difference for a leg is refunded to the wallet only when BOTH:
 *   (a) the customer booked Anytime while that day's window COULD STILL BE
 *       BOOKED — i.e. before its cutoff; and
 *   (b) the job was actually done INSIDE that window.
 *
 * Their examples: booked 11:00, picked up 16:00 → REFUND. Booked 14:30 (after
 * the 14:00 cutoff), picked up 16:00 → NO refund, because at 14:30 there was no
 * cheaper way to be served that day.
 *
 * ⚠️ THE WHOLE REASON (a) IS STORED ON THE ORDER RATHER THAN COMPUTED HERE:
 * by the time the job is done the cutoff has passed, so "was the window still
 * bookable when they booked?" is UNRECOVERABLE after the fact. It must be
 * written at the moment of booking — `windowWasBookableAtBooking` on the leg.
 * Same lesson as the deflection row and the NPS asked-vs-answered clock: a fact
 * about an instant has to be recorded at that instant.
 *
 * This function therefore takes the stored flag; it does not re-derive it.
 */
const qualifiesForAnytimeRefund = ({
    windowWasBookableAtBooking,
    servedAt,
    window,
}) => {
    if (windowWasBookableAtBooking !== true) return false
    if (!servedAt || !window) return false
    return isWithinWindow(servedAt, window)
}

// ─────────────────────────────── fees ───────────────────────────────

/**
 * What a leg costs. The WINDOW price is the existing `pickupFee`/`deliveryFee`
 * (₦500 each) — deliberately NOT a new pair of settings, because those two
 * numbers already ARE the client's window price and a second copy would be two
 * sources of truth for one figure. Only the Anytime premium is new.
 *
 * The client should be told, before they announce it: at today's settings a
 * window booking costs exactly what every booking costs today, so nobody pays
 * MORE unless they choose Anytime.
 */
// V1 batch 3: a window may carry its own price (window.pickupFee /
// window.deliveryFee); empty falls back to the general window price.
const legFee = ({ timing, leg, settings, window = null }) => {
    const s = settings || {}
    if (timing === BOOKING_TIMING.ANYTIME) {
        return leg === DISPATCH_LEG.PICKUP
            ? Number(s.anytimePickupFee ?? 1000)
            : Number(s.anytimeDeliveryFee ?? 1000)
    }
    const own = leg === DISPATCH_LEG.PICKUP ? window?.pickupFee : window?.deliveryFee
    if (own !== null && own !== undefined && Number.isFinite(Number(own)) && Number(own) >= 0) return Number(own)
    return leg === DISPATCH_LEG.PICKUP
        ? Number(s.pickupFee ?? 500)
        : Number(s.deliveryFee ?? 500)
}

/** What D2(c) refunds: the premium the customer paid for speed they didn't get. */
const anytimeRefundAmount = ({ leg, settings, window = null }) =>
    Math.max(
        0,
        legFee({ timing: BOOKING_TIMING.ANYTIME, leg, settings }) -
            legFee({ timing: BOOKING_TIMING.WINDOW, leg, settings, window }),
    )

// ──────────────────────── the offered-slot list (+ deflections) ────────────────────────

/**
 * Build the list of slots to show a customer for one leg, over the next
 * `horizonDays` days.
 *
 * RETURNS `{ slots, deflections }`. The deflections are the whole point of the
 * second return value: **"customers moved because a window was full" cannot be
 * derived from saved orders later** — a deflected customer leaves no trace,
 * because their order simply records the window they ended up with. So every
 * time a FULL window is dropped from the offered list, this returns a row for
 * the caller to persist. The caller writes them; this stays pure.
 *
 * `bookedCounts` is `{ 'YYYY-MM-DD::<windowId>': n }` — one shared count per
 * window per day (D5), both legs together.
 */
const buildOfferedSlots = ({
    now,
    windows = [],
    workingDays,
    bookedCounts = {},
    horizonDays = 7,
    leg = DISPATCH_LEG.PICKUP,
    settings,
}) => {
    const slots = []
    const deflections = []
    const days = normalizeWorkingDays(workingDays)
    const active = windows.filter((w) => w && w.isActive !== false)

    for (let i = 0; i < Math.max(1, horizonDays); i += 1) {
        const date = startOfDay(addDays(now, i))
        const working = days.includes(dayKey(date))

        for (const window of active) {
            const id = String(window._id || window.id || window.name)
            const key = `${dateKey(date)}::${id}`
            const booked = bookedCounts[key] || 0

            const runs = windowRunsOn(window, date, days)
            const cutoff = windowCutoffAt(window, date)
            const bookable = runs && cutoff ? now < cutoff : false
            const full = isWindowFull(window, booked)

            let unavailableReason = null
            if (!working) unavailableReason = SLOT_UNAVAILABLE.NOT_WORKING_DAY
            else if (!runs) unavailableReason = SLOT_UNAVAILABLE.DOES_NOT_RUN
            else if (!bookable) unavailableReason = SLOT_UNAVAILABLE.CUTOFF_PASSED
            else if (full) unavailableReason = SLOT_UNAVAILABLE.FULL

            // A full window that the customer COULD otherwise have booked is a
            // deflection: they are being moved for a reason that is ours, not
            // theirs. A window already past its cutoff, or not running that
            // day, is not — nothing was taken away from them.
            if (full && runs && bookable) {
                deflections.push({
                    date: dateKey(date),
                    windowId: window._id || window.id || null,
                    windowName: window.name,
                    leg,
                    limit: Number(window.limit),
                    booked,
                })
            }

            slots.push({
                date: dateKey(date),
                windowId: window._id || window.id || null,
                name: window.name,
                startTime: window.startTime,
                endTime: window.endTime,
                cutoffAt: cutoff,
                timing: BOOKING_TIMING.WINDOW,
                fee: legFee({ timing: BOOKING_TIMING.WINDOW, leg, settings, window }),
                available: Boolean(runs && bookable && !full),
                remaining: windowRemaining(window, booked),
                unavailableReason,
            })
        }
    }

    return { slots, deflections }
}

// ──────────────────── the delivery promise (D1 + D6 + same-day) ────────────────────

// (The ready day itself is `earliestReadyDay` / `allocateFloor` below — launch
// item 3. The old whole-working-day helpers were removed, review F-59. Under D1
// a windowed order's promise is the window on the ready DAY; the 19:00
// deadline time is never shown to the customer.)

/**
 * SAME-DAY ORDERS, client ruling 2026-10-08: the PICKUP is Anytime and pays the
 * Anytime price (a morning pickup is a special trip and the customer chose
 * speed); the DELIVERY comes back in the evening window at the window price.
 * **This must be shown clearly at booking BEFORE the customer confirms** —
 * their words — so it is returned as a quotable breakdown, not applied silently.
 *
 * When a morning window is added later, same-day pickups use that window at the
 * window price instead; `morningWindow` being present is what switches it over,
 * so no code change is needed on the day.
 */
const sameDayLegPlan = ({ settings, morningWindow = null }) => {
    const pickupTiming = morningWindow
        ? BOOKING_TIMING.WINDOW
        : BOOKING_TIMING.ANYTIME
    return {
        pickup: {
            timing: pickupTiming,
            windowId: morningWindow?._id || morningWindow?.id || null,
            windowName: morningWindow?.name || null,
            fee: legFee({
                timing: pickupTiming,
                leg: DISPATCH_LEG.PICKUP,
                settings,
                window: morningWindow,
            }),
        },
        delivery: {
            timing: BOOKING_TIMING.WINDOW,
            fee: legFee({
                timing: BOOKING_TIMING.WINDOW,
                leg: DISPATCH_LEG.DELIVERY,
                settings,
            }),
        },
        disclosure: morningWindow
            ? 'Same-day pickup runs in the morning window; delivery returns in the evening window.'
            : 'Same-day pickup is an Urgent trip and is charged at the Urgent rate. Delivery returns in the evening window at the window rate.',
    }
}

/**
 * THE CUSTOMER-FACING DELIVERY PROMISE — deliberately separate from the
 * order's `deliveryDate`, which is an internal deadline with an end-of-day
 * sentinel time (see `readyDeadline`). D1: the window REPLACES the old
 * "by 7pm" wording.
 *
 * Returns the parts AND the rendered sentence, so the app has one string to
 * show and never has to assemble the promise itself — the same reason the
 * checkout offer prompt and the dormant-card label ship from the backend: the
 * words and the rule must not drift apart.
 *
 * `confirmed` is false until D7's confirmation at READY, because a standard
 * order's delivery day is not known at booking; the app should present an
 * unconfirmed promise as an estimate.
 */
const deliveryPromise = ({
    date,
    window = null,
    timing = null,
    confirmed = false,
}) => {
    if (!date) return null
    const day = startOfDay(new Date(date))
    const dayText = day.toDateString()

    let timeText
    if (window && parseHhMm(window.startTime) !== null) {
        timeText = `between ${window.startTime} and ${window.endTime}`
    } else if (timing === BOOKING_TIMING.ANYTIME) {
        timeText = 'as soon as we can that day'
    } else {
        // No window to quote. Say the DAY and stop — never invent a time, and
        // never echo the 19:00 sentinel, which was only ever a deadline.
        timeText = null
    }

    return {
        date: day,
        dateText: dayText,
        timing,
        windowId: window?._id || window?.id || null,
        windowName: window?.name || null,
        windowStart: window?.startTime || null,
        windowEnd: window?.endTime || null,
        confirmed: Boolean(confirmed),
        text: timeText
            ? `${confirmed ? 'Delivery' : 'Estimated delivery'} on ${dayText}, ${timeText}.`
            : `${confirmed ? 'Delivery' : 'Estimated delivery'} on ${dayText}.`,
    }
}

// ─────────────── READY DATES AND THE DAILY FLOOR LIMIT (launch item 3) ───────────────
//
// Client rulings 11–12 Oct 2026 (LAUNCH-FIXES-2026-10-11.md), all binding:
//   * Count from the day AFTER pickup. Tue–Sat count 1, Sunday ½, Monday 0
//     (a day that is not a working day counts 0; the half days are a setting).
//     Ready by 19:00 on the day the count is reached: Express needs 1, Regular 2.
//     Sun pickup + 1 → Tue; Sat + 1 → Tue; Sat + 2 → Wed.
//   * Ready Today counts the pickup day itself, only for a pickup before 12:00,
//     never on a half day.
//   * One floor limit in PIECES per day (150), with Ready Today (30) and Express
//     (50) shares INSIDE it; Regular uses the rest. Each limit × the day's weight
//     (Sunday 75), Monday 0. Pieces count on the day they are READY.
//   * Regular is never refused and never waits for an empty day: it fills the
//     room left on its first possible day, then each next working day, and is
//     ready on the last day used. Fast speeds are never split: they need room in
//     their share AND in the floor total, else "full" / "too many pieces".
//   * Two bookings at the same moment may push a day a few pieces over: accepted.

const DEFAULT_HALF_DAYS = ['sun']
const DEFAULT_FLOOR_LIMITS = { dailyPieces: 150, sameDayPieces: 30, expressPieces: 50 }
const READY_HOUR = 19
/** Ready Today needs the pickup before 12:00. */
const READY_TODAY_PICKUP_BEFORE = 12 * 60
/** Weight a speed needs from the day after pickup (Ready Today uses the pickup day). */
const SPEED_READY_WEIGHT = { [DELIVERY_SPEED.EXPRESS]: 1, [DELIVERY_SPEED.STANDARD]: 2 }
const SPEED_ORDER = [DELIVERY_SPEED.SAME_DAY, DELIVERY_SPEED.EXPRESS, DELIVERY_SPEED.STANDARD]
const FLOOR_PHONE = '+234 707 325 4943'

/** Half-day keys. An explicit empty list means no half days; anything else falls back. */
const normalizeHalfDays = (halfDays) => {
    if (!Array.isArray(halfDays)) return [...DEFAULT_HALF_DAYS]
    return [...new Set(
        halfDays.map((k) => String(k).trim().toLowerCase().slice(0, 3)).filter((k) => DAY_KEYS.includes(k)),
    )]
}

const normalizeFloorLimits = (limits) => {
    const out = { ...DEFAULT_FLOOR_LIMITS }
    for (const key of Object.keys(out)) {
        const n = Number(limits?.[key])
        if (Number.isInteger(n) && n >= 0) out[key] = n
    }
    return out
}

/** 0 on a closed day, ½ on a half day, else 1. */
const dayWeight = (date, settings) => {
    if (!isWorkingDay(date, settings?.workingDays)) return 0
    return normalizeHalfDays(settings?.halfDays).includes(dayKey(date)) ? 0.5 : 1
}

/** Is Ready Today possible for a pickup at this instant? */
const readyTodayAllowed = (pickupAt, settings) =>
    Boolean(pickupAt) &&
    dayWeight(pickupAt, settings) === 1 &&
    minutesOfDay(pickupAt) < READY_TODAY_PICKUP_BEFORE

/**
 * The first day an order of this speed can be ready, before any floor limit:
 * a Date at 00:00 Lagos, or null (Ready Today not allowed; no day within reach).
 */
const earliestReadyDay = ({ speed, pickupAt, settings }) => {
    if (!pickupAt) return null
    if (speed === DELIVERY_SPEED.SAME_DAY) {
        return readyTodayAllowed(pickupAt, settings) ? startOfDay(pickupAt) : null
    }
    const need = SPEED_READY_WEIGHT[speed] ?? SPEED_READY_WEIGHT[DELIVERY_SPEED.STANDARD]
    let sum = 0
    let cursor = startOfDay(pickupAt)
    for (let i = 0; i < 60; i += 1) {
        cursor = addDays(cursor, 1)
        sum += dayWeight(cursor, settings)
        if (sum >= need) return cursor
    }
    return null
}

/**
 * The ready day at 19:00 — the order's internal DEADLINE (`deliveryDate`).
 *
 * ⚠️ The 19:00 is an END-OF-DAY SENTINEL, not a promise. ~10 readers compare it
 * as an instant: `deliveryDate < now` is "overdue" on the admin dashboard,
 * `{$gte: now, $lte: todayEnd}` is "due today", and util/holdSla.js has a
 * past-delivery-date breach branch. The customer-facing promise is the separate
 * `deliveryPromise` (util/orderView.js). (Moved here from calculateDueDate,
 * which this engine replaced — review F-59.)
 */
const readyDeadline = (day) => {
    if (!day) return null
    const out = new Date(day)
    out.setHours(READY_HOUR, 0, 0, 0)
    return out
}

/** A day's limit for 'floor' or a fast speed: the setting × the day's weight, rounded down. */
const dailyLimit = (date, pool, settings) => {
    const limits = normalizeFloorLimits(settings?.floorLimits)
    const base =
        pool === DELIVERY_SPEED.SAME_DAY
            ? limits.sameDayPieces
            : pool === DELIVERY_SPEED.EXPRESS
              ? limits.expressPieces
              : limits.dailyPieces
    return Math.floor(base * dayWeight(date, settings))
}

/** `usage` is `{ 'YYYY-MM-DD': { total, [speed]: pieces } }`. */
const usedOn = (usage, date, pool) => Number(usage?.[dateKey(date)]?.[pool] || 0)

/**
 * Place an order's pieces on the floor. Returns
 *   { ok: true, allocation: [{ date, pieces }], readyDay, movedFrom }
 *   { ok: false, reason: 'full' | 'too-many-pieces' | 'not-available' }
 * `movedFrom` is the first possible day when Regular had no room on it at all
 * (the screen says "Ready Thursday instead of Wednesday").
 */
const allocateFloor = ({ speed, pieces, firstDay, usage = {}, settings }) => {
    if (!firstDay) return { ok: false, reason: 'not-available' }
    const want = Math.max(0, Math.floor(Number(pieces) || 0))

    if (speed === DELIVERY_SPEED.SAME_DAY || speed === DELIVERY_SPEED.EXPRESS) {
        const floorRoom = dailyLimit(firstDay, 'floor', settings) - usedOn(usage, firstDay, 'total')
        const shareRoom = dailyLimit(firstDay, speed, settings) - usedOn(usage, firstDay, speed)
        const room = Math.min(floorRoom, shareRoom)
        if (room <= 0) return { ok: false, reason: 'full' }
        if (want > room) return { ok: false, reason: 'too-many-pieces' }
        return { ok: true, allocation: want ? [{ date: dateKey(firstDay), pieces: want }] : [], readyDay: firstDay, movedFrom: null }
    }

    // Regular: fill the room left day by day; never refused.
    const allocation = []
    let remaining = want
    let day = firstDay
    let last = firstDay
    for (let i = 0; i < 120 && remaining > 0; i += 1, day = addDays(day, 1)) {
        if (dayWeight(day, settings) === 0) continue
        const room = dailyLimit(day, 'floor', settings) - usedOn(usage, day, 'total')
        if (room <= 0) continue
        const take = Math.min(room, remaining)
        allocation.push({ date: dateKey(day), pieces: take })
        remaining -= take
        last = day
    }
    if (remaining > 0) {
        // Beyond any realistic horizon: keep the promise finite.
        if (allocation.length) allocation[allocation.length - 1].pieces += remaining
        else allocation.push({ date: dateKey(firstDay), pieces: remaining })
    }
    const readyDay = allocation.length ? last : firstDay
    const movedFrom =
        allocation.length && allocation[0].date !== dateKey(firstDay) && !isSameDay(readyDay, firstDay)
            ? firstDay
            : null
    return { ok: true, allocation, readyDay, movedFrom }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dayText = (d) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`

/** "A or B", "A, B or C". */
const orList = (names) =>
    names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`

/**
 * Every speed for one pickup and piece count, as the screen and the booking
 * both read it. `labels` maps a speed value to its on-screen name (client,
 * 12 Oct: "use the same name the customer sees on the speed button,
 * everywhere"). `usage` is the floor usage over the days involved.
 */
const speedOptions = ({ pickupAt, pieces, settings, usage = {}, labels = {} }) => {
    const label = (s) => labels[s] || s
    const raw = SPEED_ORDER.map((speed) => {
        const firstDay = earliestReadyDay({ speed, pickupAt, settings })
        if (!firstDay) {
            return { speed, firstDay: null, result: { ok: false, reason: speed === DELIVERY_SPEED.SAME_DAY ? 'pickup-rule' : 'not-available' } }
        }
        return { speed, firstDay, result: allocateFloor({ speed, pieces, firstDay, usage, settings }) }
    })
    const fits = raw.filter((r) => r.result.ok).map((r) => r.speed)
    const halfDayNames = normalizeHalfDays(settings?.halfDays).map((k) => `${WEEKDAYS[DAY_KEYS.indexOf(k)]}s`)

    return raw.map(({ speed, firstDay, result }) => {
        const others = fits.filter((s) => s !== speed).map(label)
        let message = null
        if (!result.ok) {
            if (result.reason === 'pickup-rule') {
                message = `${label(speed)} needs a pickup before 12:00${halfDayNames.length ? `, and isn't available on ${orList(halfDayNames)}` : ''}. Choose ${orList(others)}.`
            } else if (result.reason === 'full') {
                message =
                    speed === DELIVERY_SPEED.EXPRESS
                        ? `${label(speed)} is full for ${WEEKDAYS[firstDay.getDay()]}. Choose ${label(DELIVERY_SPEED.STANDARD)}, or pick another pickup day.`
                        : 'Full today'
            } else if (result.reason === 'too-many-pieces') {
                message = `Too many pieces for ${label(speed)}. Choose ${orList(others)}, or call us on ${FLOOR_PHONE}.`
            } else {
                message = `${label(speed)} is not available for this pickup. Choose ${orList(others)}.`
            }
        }
        const readyDate = result.ok ? readyDeadline(result.readyDay) : null
        return {
            speed,
            label: label(speed),
            available: Boolean(result.ok),
            readyDate,
            readyText: readyDate ? `Ready ${dayText(readyDate)}, by 7:00 PM` : null,
            movedFrom: result.ok && result.movedFrom ? result.movedFrom : null,
            movedFromText: result.ok && result.movedFrom ? `Ready ${WEEKDAYS[result.readyDay.getDay()]} instead of ${WEEKDAYS[result.movedFrom.getDay()]}` : null,
            unavailableReason: result.ok ? null : result.reason,
            message,
            allocation: result.ok ? result.allocation : [],
        }
    })
}

/**
 * The next Anytime (Urgent) opening at or after the start of `date` that is
 * still ahead of `now` — the opening hour on the first working day (launch
 * item 4: "Urgent opens at 8:00 AM tomorrow").
 */
const nextAnytimeOpening = ({ date, now, settings }) => {
    const from = parseHhMm(settings?.anytimeOpenFrom) ?? parseHhMm(DEFAULT_ANYTIME_OPEN_FROM)
    const start = startOfDay(date) < startOfDay(now) ? startOfDay(now) : startOfDay(date)
    for (let i = 0; i < 15; i += 1) {
        const day = addDays(start, i)
        if (!isWorkingDay(day, settings?.workingDays)) continue
        const at = atMinutes(day, from)
        if (at > now) return at
    }
    return null
}

/** "8:00 AM today" / "8:00 AM tomorrow" / "8:00 AM Tuesday" / "8:00 AM Tuesday 27 October". */
const opensAtText = (at, now) => {
    if (!at) return null
    const h = at.getHours()
    const time = `${h % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
    if (isSameDay(at, now)) return `${time} today`
    if (isSameDay(at, addDays(now, 1))) return `${time} tomorrow`
    if (startOfDay(at) < addDays(startOfDay(now), 7)) return `${time} ${WEEKDAYS[at.getDay()]}`
    return `${time} ${dayText(at)}`
}

/**
 * Every window still bookable on `day` is full (launch item 4, client Q2).
 * A day with NO bookable window (closed, or every cut-off passed) is not
 * "full" — there is nothing to be full.
 */
const allWindowsFull = ({ windows, day, now, workingDays, bookedCounts = {} }) => {
    const open = (windows || []).filter((w) => isWindowBookable({ window: w, date: day, now, workingDays }))
    return open.length > 0 && open.every((w) => isWindowFull(w, bookedCounts[`${dateKey(day)}::${String(w._id)}`] || 0))
}

/**
 * Anytime on ONE date (client item 2, 11 Oct: "On a closed day, Anytime should
 * say 'Closed that day', the same as the window"). The old single `anytime`
 * answer was for "now" only, so every date repeated "first thing Sunday".
 */
const anytimeOnDate = ({ date, now, settings }) => {
    const day = startOfDay(date)
    const key = dateKey(day)
    const fromText = settings?.anytimeOpenFrom || DEFAULT_ANYTIME_OPEN_FROM
    const from = parseHhMm(settings?.anytimeOpenFrom) ?? parseHhMm(DEFAULT_ANYTIME_OPEN_FROM)
    const to = parseHhMm(settings?.anytimeOpenTo) ?? parseHhMm(DEFAULT_ANYTIME_OPEN_TO)
    // Launch item 4: a closed date says when Urgent next opens.
    const closed = (note) => {
        const opensAt = nextAnytimeOpening({ date: day, now, settings })
        return { date: key, open: false, servesFrom: null, note, opensAt, opensAtText: opensAtText(opensAt, now) }
    }
    if (!isWorkingDay(day, settings?.workingDays)) return closed('Closed that day')
    if (day < startOfDay(now)) {
        return { date: key, open: false, servesFrom: null, note: 'That day has passed', opensAt: null, opensAtText: null }
    }
    if (isSameDay(day, now)) {
        const at = minutesOfDay(now)
        if (at > to) return closed('Urgent has closed for today')
        if (at < from) return { date: key, open: true, servesFrom: atMinutes(day, from), note: `We will come from ${fromText}.` }
        return { date: key, open: true, servesFrom: new Date(now), note: 'We will dispatch as soon as we can.' }
    }
    return { date: key, open: true, servesFrom: atMinutes(day, from), note: `We will come from ${fromText} that day.` }
}

/**
 * The start of a pickup slot in minutes after midnight, from the FIRST time in
 * the text. An explicit am/pm is used as written. A bare hour is read as a
 * pickup hour — pickups run 08:00–19:00 — so 8–11 are morning, 12 is noon and
 * 1–7 are afternoon/evening: "around 2", "2:30", "after 3", "between 2 and
 * 4pm", "2-4pm" → 14:00/15:00; "12-2pm" → 12:00; "11-1pm", "around 10" →
 * morning. 24-hour times ("15:00") are taken as written. The assistant's words
 * (morning, noon, afternoon, evening, night) are understood. Returns null for
 * empty text and `UNREADABLE_SLOT` for anything else — never an early time, so
 * an unreadable time can't make Ready Today look possible (reviews F-56, F-62).
 */
const UNREADABLE_SLOT = 'unreadable'
const SLOT_WORDS = [
    // ("before/by noon" is handled once, guarded against evening words, in
    // slotStartMinutes — an unguarded entry here made "afternoon, by noon"
    // read as morning, review F-67.)
    [/\bnight\b/i, 19 * 60],
    [/\bevening\b/i, 16 * 60],
    [/\bafternoon\b/i, 12 * 60],
    [/\b(noon|midday)\b/i, 12 * 60],
    [/\bmorning\b/i, 8 * 60],
]
// Words that put a pickup well past noon, whatever bare number sits beside them
// ("8 in the evening", "9 tonight", "evening, around 8" — review F-63).
const EVENING_WORDS = /\b(afternoon|evening|tonight|night)\b/i
// "noon"/"midday" alone only mark the END of a morning ("10-12 noon",
// "between 10 and noon", "9, before noon") — they never make a bare 8–11 an
// evening hour (review F-66).
const NOON_WORDS = /\b(noon|midday)\b/i
// A number that is a date or a count, not a clock time ("14 Oct", "20/10",
// "2 bags", "3rd") — reviews F-64/F-66. Month names need a whole word, so
// "9 maybe" and "9 marks" are not dates.
const NOT_A_TIME_AFTER = /^\s*(?:\/|st\b|nd\b|rd\b|th\b|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|bags?\b|pieces?\b|pcs\b|items?\b|kg\b|clothes\b|shirts?\b)/i
// Dates and counts are removed before the time is read: "2026-10-14 15:00",
// "2026-10-14T15:00:00", "14-10-2026 9am", "20/10 at 9am", "14 Oct 9am",
// "Oct 10 around 2", "2 bags at 9am" (reviews F-64, F-65, F-68).
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const WRITTEN_DATES = new RegExp(
    [
        '\\b\\d{4}-\\d{1,2}-\\d{1,2}T?',
        '\\b\\d{1,2}-\\d{1,2}-\\d{2,4}\\b',
        '\\b\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?\\b',
        `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`,
        `\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`,
        '\\b\\d+\\s*(?:bags?|pieces?|pcs|items?|kg|clothes|shirts?)\\b',
    ].join('|'),
    'gi',
)

/**
 * Ready Today is offered only for a PLAINLY written time (launch item 3,
 * review round 5). Free text can say anything ("not before noon", "8.30pm",
 * "9 o clock pm"), and five review rounds showed a reader can't catch every
 * phrasing — so after dates and counts are removed, the text may hold only
 * clock times and these words. Anything else reads as UNREADABLE (12:00) —
 * which only ever withholds Ready Today; Express and Regular count whole days
 * and never use the time. The app sends slot labels ("10am-12pm") and the
 * assistant sends short phrases, which all pass.
 */
const PLAIN_WORDS = new Set([
    'around', 'about', 'approx', 'approximately', 'at', 'by', 'from', 'between', 'and', 'to', 'till',
    'until', 'before', 'morning', 'noon', 'midday', 'afternoon', 'evening', 'night', 'tonight',
    'tomorrow', 'today', 'the', 'in', 'this', 'or', 'maybe', 'please', 'pls', 'ish', 'sharp', 'early',
    'sometime', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun', // the DAY is pickupDate's job (F-71)
])
const isPlainTimeText = (text) => {
    // A dot between digits is a time we don't read ("8.30pm"): not plain (F-68).
    if (/\d\.\d/.test(text)) return false
    const rest = text
        .toLowerCase()
        .replace(/\b\d{1,2}(?::\d{2}){0,2}\s*(?:a\.?m\.?|p\.?m\.?)(?![a-z])/g, ' ')
        .replace(/\b\d{1,2}(?::\d{2}){0,2}\b/g, ' ')
        .replace(/[-–,;!?()]/g, ' ')
    return rest.split(/\s+/).filter(Boolean).every((w) => PLAIN_WORDS.has(w))
}
const slotStartMinutes = (slot) => {
    let text = String(slot || '').trim()
    if (!text) return null
    text = text
        .replace(WRITTEN_DATES, ' ')
        // "930am", "1030 pm" → "9:30am", "10:30 pm" (review F-66). Only with
        // am/pm, so a phone number or a count never becomes a time.
        .replace(/\b(\d{1,2})(\d{2})\s*(a\.?m\.?|p\.?m\.?)/gi, '$1:$2$3')
    if (!isPlainTimeText(text)) return UNREADABLE_SLOT
    const evening = EVENING_WORDS.test(text)
    const noon = NOON_WORDS.test(text)

    // Every candidate clock time; dates and counts are skipped.
    // Seconds are read past, so "9:00:00 pm" keeps its pm (F-70).
    const re = /(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?(?![\d])/gi
    const found = []
    let m
    while ((m = re.exec(text))) {
        if (m.index > 0 && /[\d/:]/.test(text[m.index - 1])) continue
        if (NOT_A_TIME_AFTER.test(text.slice(m.index + m[0].length))) continue
        const hour = Number(m[1])
        const min = Number(m[2] || 0)
        if (hour > 23 || min > 59) continue
        found.push({
            hour,
            min,
            ap: (m[3] || '').toLowerCase().replace(/\./g, ''),
            colon: m[2] !== undefined,
            // "11-1pm", "2 to 4pm", "between 2 and 4pm": a range is read from its START.
            rangeStart: /^\s*(?:-|–|to\b|and\b|or\b)\s*(?:\d|noon|midday)/i.test(text.slice(m.index + m[0].length)),
        })
    }
    // A range is read from its start — but it only outranks its OWN end, never a
    // later, separate time written with am/pm OR a colon ("9-10 at 3pm" → 3pm,
    // "9-10 at 15:00" → 15:00; F-65). Then a time that says am/pm; then one
    // with a colon; then the first.
    const laterTime = found.slice(2).find((t) => t.ap || t.colon)
    const pick =
        (found[0]?.rangeStart && !laterTime && found[0]) ||
        found.find((t) => t.ap) ||
        found.find((t) => t.colon) ||
        found[0]

    if (pick) {
        let hour = pick.hour
        // "12am" is ambiguous (many mean noon), and "00:30" is its 24-hour
        // spelling: never read either as an early time (F-63, F-65).
        if ((pick.ap === 'am' && hour === 12) || (hour === 0 && pick.ap !== 'pm')) return UNREADABLE_SLOT
        // A bare range start shares its end's "pm" when it comes earlier on the
        // clock: "8-10pm", "between 8 and 10pm", "9 or 10pm" are evening (F-69).
        // "11-1pm" (11 > 1) and "10-12pm" (ends at noon) stay morning.
        const end = pick.rangeStart && !pick.ap ? found[found.indexOf(pick) + 1] : null
        if (end && end.ap === 'pm' && end.hour < 12 && hour <= end.hour) hour += 12
        else if (pick.ap === 'pm' && hour < 12) hour += 12
        else if (!pick.ap && hour >= 1 && hour <= 7) hour += 12 // a bare hour is a pickup hour (08:00–19:00)
        else if (!pick.ap && evening && hour >= 8 && hour <= 11) hour += 12 // "9 tonight"
        const minutes = hour * 60 + pick.min
        // An explicit "am" morning time stands; otherwise an evening word means
        // late. "noon" alone does not ("10-12 noon" is a morning).
        if (evening && !(pick.ap === 'am') && minutes < 12 * 60) return 12 * 60
        return minutes
    }
    if (noon && !evening && /\b(before|by|until|till)\s+(noon|midday)\b/i.test(text)) return 10 * 60
    for (const [word, minutes] of SLOT_WORDS) if (word.test(text)) return minutes
    return UNREADABLE_SLOT
}

/**
 * When the pickup happens, which is what the ready date counts from (client
 * item 9: "work out the ready date from the pickup day and time the customer
 * picks"). A window → its start on its date; Anytime → its service start on
 * that date; a legacy pickupDate/pickupTime → that; otherwise now.
 */
const pickupInstant = ({ leg = null, pickupDate = null, pickupTime = null, now = new Date(), settings }) => {
    if (leg?.timing === BOOKING_TIMING.WINDOW && leg.date) {
        const start = parseHhMm(leg.windowStart)
        return start === null ? startOfDay(new Date(leg.date)) : atMinutes(new Date(leg.date), start)
    }
    if (leg?.timing === BOOKING_TIMING.ANYTIME) {
        const day = startOfDay(new Date(leg.date || now))
        const a = anytimeOnDate({ date: day, now, settings })
        if (a.servesFrom) return a.servesFrom
        // A closed or finished day: the first Anytime opening ON OR AFTER that
        // day, never "now" — counting from now put the ready date before a
        // pickup on a later closed day (review F-57).
        const serviceFrom = day > startOfDay(now) ? day : now
        return (
            anytimeServiceStart({
                now: serviceFrom,
                workingDays: settings?.workingDays,
                anytimeOpenFrom: settings?.anytimeOpenFrom,
                anytimeOpenTo: settings?.anytimeOpenTo,
            }) || new Date(now)
        )
    }
    if (pickupDate) {
        const day = new Date(pickupDate)
        if (!Number.isNaN(day.getTime())) {
            const slot = slotStartMinutes(pickupTime)
            // No time given → the opening hour. A time we cannot read counts
            // as noon, so it can never make Ready Today look possible (F-56).
            const mins =
                slot === null
                    ? (parseHhMm(settings?.anytimeOpenFrom) ?? parseHhMm(DEFAULT_ANYTIME_OPEN_FROM))
                    : slot === UNREADABLE_SLOT
                      ? READY_TODAY_PICKUP_BEFORE
                      : slot
            const at = atMinutes(day, mins)
            return at < now ? new Date(now) : at
        }
    }
    return new Date(now)
}

/**
 * Adjust a booked order's split for a changed piece total (Intake count, item
 * edit). The ready date never moves (client, 12 Oct: "keep their date"): extra
 * pieces go on the LAST day, removed pieces come off the last days first.
 */
const adjustAllocation = (allocation, newPieces) => {
    // Copied field by field: a hydrated order's entries are Mongoose
    // sub-documents, and spreading one copies its internals, not its fields.
    const out = (allocation || []).map((a) => ({ date: a.date, pieces: Number(a.pieces) || 0 }))
    if (!out.length) return out
    const target = Math.max(0, Math.floor(Number(newPieces) || 0))
    let diff = target - out.reduce((n, a) => n + a.pieces, 0)
    if (diff > 0) out[out.length - 1].pieces += diff
    for (let i = out.length - 1; diff < 0 && i >= 0; i -= 1) {
        const off = Math.min(out[i].pieces, -diff)
        out[i].pieces -= off
        diff += off
    }
    return out.filter((a, i) => a.pieces > 0 || i === out.length - 1)
}

module.exports = {
    DEFAULT_HALF_DAYS,
    DEFAULT_FLOOR_LIMITS,
    SPEED_ORDER,
    normalizeHalfDays,
    normalizeFloorLimits,
    dayWeight,
    readyTodayAllowed,
    earliestReadyDay,
    readyDeadline,
    dailyLimit,
    allocateFloor,
    speedOptions,
    adjustAllocation,
    anytimeOnDate,
    pickupInstant,
    dayText,
    DAY_KEYS,
    DEFAULT_WORKING_DAYS,
    DEFAULT_ANYTIME_OPEN_FROM,
    DEFAULT_ANYTIME_OPEN_TO,
    BOOKING_TIMING,
    DISPATCH_LEG,
    SLOT_UNAVAILABLE,
    parseHhMm,
    formatHhMm,
    minutesOfDay,
    atMinutes,
    startOfDay,
    addDays,
    isSameDay,
    dayKey,
    dateKey,
    normalizeWorkingDays,
    isWorkingDay,
    nextWorkingDay,
    addWorkingDays,
    windowRunsOn,
    windowCutoffAt,
    isWindowBookable,
    isWithinWindow,
    windowRemaining,
    isWindowFull,
    isAnytimeOpen,
    anytimeServiceStart,
    nextAnytimeOpening,
    opensAtText,
    allWindowsFull,
    qualifiesForAnytimeRefund,
    legFee,
    anytimeRefundAmount,
    buildOfferedSlots,
    sameDayLegPlan,
    deliveryPromise,
}
