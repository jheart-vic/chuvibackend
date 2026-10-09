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
const legFee = ({ timing, leg, settings }) => {
    const s = settings || {}
    if (timing === BOOKING_TIMING.ANYTIME) {
        return leg === DISPATCH_LEG.PICKUP
            ? Number(s.anytimePickupFee ?? 1000)
            : Number(s.anytimeDeliveryFee ?? 1000)
    }
    return leg === DISPATCH_LEG.PICKUP
        ? Number(s.pickupFee ?? 500)
        : Number(s.deliveryFee ?? 500)
}

/** What D2(c) refunds: the premium the customer paid for speed they didn't get. */
const anytimeRefundAmount = ({ leg, settings }) =>
    Math.max(
        0,
        legFee({ timing: BOOKING_TIMING.ANYTIME, leg, settings }) -
            legFee({ timing: BOOKING_TIMING.WINDOW, leg, settings }),
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
                fee: legFee({ timing: BOOKING_TIMING.WINDOW, leg, settings }),
                available: Boolean(runs && bookable && !full),
                remaining: windowRemaining(window, booked),
                unavailableReason,
            })
        }
    }

    return { slots, deflections }
}

// ──────────────────── the delivery promise (D1 + D6 + same-day) ────────────────────

/**
 * How many days after pickup a speed delivers. Mirrors `calculateDueDate` in
 * util/helper.js — same-day 0, express +1, standard +2 — but counted in WORKING
 * days (D6) and WITHOUT the 19:00 pin.
 *
 * ⚠️ THE 19:00 PIN IS THE COLLISION THE LOGIC DOC FLAGGED. `calculateDueDate`
 * promises "by 7pm"; D1 says the WINDOW REPLACES that promise, and the client's
 * only window ends at 18:30. Both cannot be told to the customer. Under D1 the
 * window wins, so a windowed order's promise is the window on the due DAY, and
 * the 19:00 time is not shown. `calculateDueDate` is left alone — it still
 * governs capacity cutoffs and every non-windowed order.
 */
const SPEED_WORKING_DAYS = {
    [DELIVERY_SPEED.SAME_DAY]: 0,
    [DELIVERY_SPEED.EXPRESS]: 1,
    [DELIVERY_SPEED.STANDARD]: 2,
}

const deliveryDayForSpeed = ({ from, deliverySpeed, workingDays }) => {
    const count = SPEED_WORKING_DAYS[deliverySpeed]
    return addWorkingDays(
        from,
        count === undefined ? SPEED_WORKING_DAYS[DELIVERY_SPEED.STANDARD] : count,
        workingDays,
    )
}

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
            : 'Same-day pickup is an Anytime trip and is charged at the Anytime rate. Delivery returns in the evening window at the window rate.',
    }
}

/**
 * THE CUSTOMER-FACING DELIVERY PROMISE — deliberately separate from the
 * order's `deliveryDate`, which is an internal deadline with an end-of-day
 * sentinel time (see `calculateDueDate`). D1: the window REPLACES the old
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

module.exports = {
    DAY_KEYS,
    DEFAULT_WORKING_DAYS,
    DEFAULT_ANYTIME_OPEN_FROM,
    DEFAULT_ANYTIME_OPEN_TO,
    BOOKING_TIMING,
    DISPATCH_LEG,
    SLOT_UNAVAILABLE,
    SPEED_WORKING_DAYS,
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
    qualifiesForAnytimeRefund,
    legFee,
    anytimeRefundAmount,
    buildOfferedSlots,
    deliveryDayForSpeed,
    sameDayLegPlan,
    deliveryPromise,
}
