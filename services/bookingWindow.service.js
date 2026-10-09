const BaseService = require('./base.service')
const BookingWindowModel = require('../models/bookingWindow.model')
const WindowDeflectionModel = require('../models/windowDeflection.model')
const AdminSettingModel = require('../models/adminSetting.model')
const BookOrderModel = require('../models/bookOrder.model')
const createAuditLog = require('../util/createAuditLog')
const {
    DELIVERY_SPEED,
    BOOKING_TIMING,
    DISPATCH_LEG,
    AUDIT_LOG_CATEGORIES,
    NOTIFICATION_TYPE,
    SERVICE_TIERS,
} = require('../util/constants')
const W = require('../util/bookingWindow')
// D2(c): the Anytime refund pays through the ONE wallet-refund implementation,
// so it lands in the ledger AND in the customer's own history (the 2.3 lesson).
const { refundToWallet } = require('../util/walletRefund')
const createNotification = require('../util/createNotification')

/**
 * WINDOW BOOKING — the data layer around the pure engine in
 * `util/bookingWindow.js` (client decisions D1–D8, 2026-10-08).
 *
 * The split is deliberate: every RULE lives in the pure module and is asserted
 * offline in briefCheck; this file only fetches, counts and writes. Nothing here
 * re-decides a cutoff or a price.
 */
class BookingWindowService {
    // ───────────────────────────── settings ─────────────────────────────

    /**
     * The scheduling half of AdminSetting, with the engine's defaults applied
     * so a database that somehow missed the migration still answers sensibly
     * rather than closing the business.
     */
    static async getSchedulingSettings() {
        const s = (await AdminSettingModel.findOne({}).lean()) || {}
        return {
            workingDays: W.normalizeWorkingDays(s.workingDays),
            anytimeOpenFrom: s.anytimeOpenFrom || W.DEFAULT_ANYTIME_OPEN_FROM,
            anytimeOpenTo: s.anytimeOpenTo || W.DEFAULT_ANYTIME_OPEN_TO,
            // The WINDOW price is the existing pickup/delivery fee — there is no
            // second pair of settings (see the model comment).
            pickupFee: s.pickupFee ?? 500,
            deliveryFee: s.deliveryFee ?? 500,
            anytimePickupFee: s.anytimePickupFee ?? 1000,
            anytimeDeliveryFee: s.anytimeDeliveryFee ?? 1000,
        }
    }

    static async getActiveWindows() {
        return BookingWindowModel.find({ isActive: true }).sort({ startTime: 1 }).lean()
    }

    // ───────────────────────── per-window-per-day counts ─────────────────────────

    /**
     * D5: ONE shared count per window per day, covering pickups AND deliveries
     * together, because one window serves both legs (D1) and one order is one
     * bag per leg (D4).
     *
     * Returns `{ 'YYYY-MM-DD::<windowId>': n }` — the shape the pure engine
     * expects. Counts BOTH legs of every live order in one pass; an order with
     * its pickup and its delivery in the same window on the same day therefore
     * occupies two of that window's slots, which is correct: it is two trips.
     */
    static async getBookedCounts({ from, to }) {
        const rows = await BookOrderModel.aggregate([
            {
                $match: {
                    $or: [
                        {
                            'scheduling.pickup.windowId': { $ne: null },
                            'scheduling.pickup.date': { $gte: from, $lt: to },
                        },
                        {
                            'scheduling.delivery.windowId': { $ne: null },
                            'scheduling.delivery.date': { $gte: from, $lt: to },
                        },
                    ],
                    // A cancelled order has RELEASED its slot — without this a
                    // cancelled booking would occupy a window's limit forever
                    // and deflect customers for nothing.
                    //
                    // ⚠️ BookOrder has no "is cancelled" boolean — cancellation
                    // is `cancellation.cancelledAt`. Matching an invented
                    // boolean against `$ne` true LOOKS right and silently
                    // matches every document, because `$ne` also matches an
                    // ABSENT field. A green-for-the-wrong-reason shape, caught
                    // here before it shipped; briefCheck now fails if that
                    // field name reappears as a query key.
                    'cancellation.cancelledAt': { $exists: false },
                },
            },
            {
                $project: {
                    legs: [
                        {
                            windowId: '$scheduling.pickup.windowId',
                            date: '$scheduling.pickup.date',
                        },
                        {
                            windowId: '$scheduling.delivery.windowId',
                            date: '$scheduling.delivery.date',
                        },
                    ],
                },
            },
            { $unwind: '$legs' },
            {
                $match: {
                    'legs.windowId': { $ne: null },
                    'legs.date': { $gte: from, $lt: to },
                },
            },
            {
                $group: {
                    _id: { windowId: '$legs.windowId', date: '$legs.date' },
                    n: { $sum: 1 },
                },
            },
        ])

        const counts = {}
        for (const r of rows) {
            // Bucket by the LAGOS day of the stored date. The process is pinned
            // to Africa/Lagos, so this is the same day the customer chose.
            const key = `${W.dateKey(new Date(r._id.date))}::${String(r._id.windowId)}`
            counts[key] = (counts[key] || 0) + r.n
        }
        return counts
    }

    // ───────────────────────────── availability ─────────────────────────────

    /**
     * What to show on the booking screen for one leg.
     *
     * ⚠️ THIS ENDPOINT HAS A SIDE EFFECT ON PURPOSE: it persists a
     * `WindowDeflection` row for every FULL window it drops from the list.
     * "Customers moved because a window was full" cannot be derived from saved
     * orders afterwards — a deflected customer leaves no trace, because their
     * order records the window they ENDED UP with, which is indistinguishable
     * from someone who wanted that window all along. So the row has to be
     * written at the moment the window is dropped, which is here.
     *
     * The write is fire-and-forget: a failure to record a statistic must never
     * stop a customer seeing the booking screen.
     */
    static async getAvailability({
        userId = null,
        leg = DISPATCH_LEG.PICKUP,
        horizonDays = 7,
        deliverySpeed = null,
        now = new Date(),
    } = {}) {
        try {
            // `legFee` reads "pickup, else delivery", so an unrecognised leg
            // would quietly be priced as a DELIVERY instead of being refused.
            // Name the valid values rather than let a typo pick a price.
            if (!Object.values(DISPATCH_LEG).includes(leg)) {
                return BaseService.sendFailedResponse({
                    error: `leg must be one of: ${Object.values(DISPATCH_LEG).join(', ')}`,
                })
            }
            const horizon = Number.isFinite(Number(horizonDays))
                ? Math.min(31, Math.max(1, Math.floor(Number(horizonDays))))
                : 7
            horizonDays = horizon

            const [settings, windows] = await Promise.all([
                this.getSchedulingSettings(),
                this.getActiveWindows(),
            ])

            const from = W.startOfDay(now)
            const to = W.addDays(from, Math.max(1, horizonDays) + 1)
            const bookedCounts = await this.getBookedCounts({ from, to })

            const { slots, deflections } = W.buildOfferedSlots({
                now,
                windows,
                workingDays: settings.workingDays,
                bookedCounts,
                horizonDays,
                leg,
                settings,
            })

            // Record the deflections. Never awaited into the response path.
            if (deflections.length) {
                this._recordDeflections(deflections, userId).catch(() => {})
            }

            // The Anytime option (D2). Offered even when closed, with the
            // honest service time — "first thing next working day" — rather
            // than hidden, which would look like a broken screen.
            const anytimeOpen = W.isAnytimeOpen({
                now,
                workingDays: settings.workingDays,
                anytimeOpenFrom: settings.anytimeOpenFrom,
                anytimeOpenTo: settings.anytimeOpenTo,
            })
            const anytime = {
                timing: BOOKING_TIMING.ANYTIME,
                fee: W.legFee({ timing: BOOKING_TIMING.ANYTIME, leg, settings }),
                open: anytimeOpen,
                opensFrom: settings.anytimeOpenFrom,
                opensTo: settings.anytimeOpenTo,
                servesFrom: W.anytimeServiceStart({
                    now,
                    workingDays: settings.workingDays,
                    anytimeOpenFrom: settings.anytimeOpenFrom,
                    anytimeOpenTo: settings.anytimeOpenTo,
                }),
                // D2(a): an Anytime job alerts Intake at once and sits at the
                // TOP of the pickup list. Surfaced here so the screen can say
                // so rather than implying a wait.
                note: anytimeOpen
                    ? 'We will dispatch as soon as we can.'
                    : 'Outside our Anytime hours — we will come first thing on the next working day.',
            }

            const payload = {
                leg,
                workingDays: settings.workingDays,
                slots,
                anytime,
                windowFee: W.legFee({ timing: BOOKING_TIMING.WINDOW, leg, settings }),
            }

            // The same-day disclosure the client insists is shown BEFORE the
            // customer confirms. Returned with the availability so the screen
            // cannot reach a confirm button without having it.
            if (deliverySpeed === DELIVERY_SPEED.SAME_DAY) {
                payload.sameDay = W.sameDayLegPlan({
                    settings,
                    // A morning window flips same-day pickup to the window
                    // price with no code change on the day it is added.
                    morningWindow: this._findMorningWindow(windows),
                })
            }

            return BaseService.sendSuccessResponse({ message: payload })
        } catch (error) {
            console.error('getAvailability failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to load pickup and delivery times right now.',
            })
        }
    }

    /**
     * A "morning" window is simply one that ENDS by midday — recognised by its
     * hours, not by its name, so the client can call it whatever they like.
     */
    static _findMorningWindow(windows) {
        const morning = (windows || []).filter((w) => {
            const end = W.parseHhMm(w.endTime)
            return end !== null && end <= 12 * 60
        })
        return morning.length ? morning[0] : null
    }

    static async _recordDeflections(deflections, userId) {
        await WindowDeflectionModel.insertMany(
            deflections.map((d) => ({
                date: d.date,
                windowId: d.windowId,
                windowName: d.windowName,
                leg: d.leg,
                userId: userId || undefined,
                limit: d.limit,
                booked: d.booked,
                occurredAt: new Date(),
            })),
            { ordered: false },
        )
    }

    // ────────────────────── resolving a leg at booking time ──────────────────────

    /**
     * Turn what the customer chose into the stored `scheduling.<leg>` block,
     * refusing anything that is not actually bookable.
     *
     * Returns `{ ok: true, leg: {...} }` or `{ ok: false, error, requiresChoice }`.
     * It writes nothing — the caller owns the order document, exactly like
     * `planCounterPayment` plans before `settleCounterPayment` executes. A
     * refusal therefore leaves no half-made order behind.
     *
     * D3: when the chosen window is FULL we do not refuse — we move the
     * customer to the next available window, charge the WINDOW price and leave
     * their offer intact, flagging `forcedMove` so the screen can explain it.
     */
    static resolveLeg({
        leg,
        timing,
        windowId,
        date,
        windows,
        settings,
        bookedCounts = {},
        now = new Date(),
    }) {
        const fee = W.legFee({ timing, leg, settings })

        if (timing === BOOKING_TIMING.ANYTIME) {
            // THE ONE FACT THAT MUST BE STAMPED NOW: was any window for this
            // day still bookable at this instant? After the cutoff passes the
            // answer is unrecoverable, and the narrowed refund depends on it.
            const day = date ? W.startOfDay(new Date(date)) : W.startOfDay(now)
            const stillBookable = (windows || []).filter((w) =>
                W.isWindowBookable({
                    window: w,
                    date: day,
                    now,
                    workingDays: settings.workingDays,
                }),
            )
            return {
                ok: true,
                leg: {
                    timing: BOOKING_TIMING.ANYTIME,
                    date: day,
                    fee,
                    windowWasBookableAtBooking: stillBookable.length > 0,
                    refundAgainstWindowId: stillBookable[0]?._id || null,
                },
            }
        }

        if (!windowId) {
            return {
                ok: false,
                error: `Choose a ${leg} time window, or select Anytime.`,
                requiresChoice: true,
            }
        }

        const window = (windows || []).find(
            (w) => String(w._id) === String(windowId),
        )
        if (!window) {
            return { ok: false, error: 'That time window is no longer available.' }
        }

        const day = W.startOfDay(new Date(date || now))

        if (!W.isWorkingDay(day, settings.workingDays)) {
            const next = W.nextWorkingDay(day, settings.workingDays)
            return {
                ok: false,
                error: 'We are closed that day. The next working day is ' +
                    (next ? W.dateKey(next) : 'not available') + '.',
                requiresChoice: true,
            }
        }
        if (!W.windowRunsOn(window, day, settings.workingDays)) {
            return {
                ok: false,
                error: `${window.name} does not run that day.`,
                requiresChoice: true,
            }
        }
        if (!W.isWindowBookable({ window, date: day, now, workingDays: settings.workingDays })) {
            return {
                ok: false,
                error: `Bookings for ${window.name} on that day have closed.`,
                requiresChoice: true,
            }
        }

        const key = `${W.dateKey(day)}::${String(window._id)}`
        if (W.isWindowFull(window, bookedCounts[key] || 0)) {
            // D3 — move them rather than refuse them.
            const alternative = this._nextAvailableWindow({
                windows,
                from: day,
                now,
                settings,
                bookedCounts,
                excludeId: window._id,
            })
            if (!alternative) {
                return {
                    ok: false,
                    error: `${window.name} is full and we have no other window free. Please choose Anytime.`,
                    requiresChoice: true,
                }
            }
            return {
                ok: true,
                leg: {
                    timing: BOOKING_TIMING.WINDOW,
                    windowId: alternative.window._id,
                    windowName: alternative.window.name,
                    windowStart: alternative.window.startTime,
                    windowEnd: alternative.window.endTime,
                    date: alternative.date,
                    // D3: they pay the WINDOW price, and the offer is untouched
                    // because nothing about their eligibility changed — the
                    // move was ours, not theirs.
                    fee: W.legFee({ timing: BOOKING_TIMING.WINDOW, leg, settings }),
                    forcedMove: true,
                    forcedMoveFrom: `${window.name} on ${W.dateKey(day)}`,
                },
            }
        }

        return {
            ok: true,
            leg: {
                timing: BOOKING_TIMING.WINDOW,
                windowId: window._id,
                windowName: window.name,
                windowStart: window.startTime,
                windowEnd: window.endTime,
                date: day,
                fee,
            },
        }
    }

    /** The soonest window with room, searching forward from `from`. */
    static _nextAvailableWindow({
        windows,
        from,
        now,
        settings,
        bookedCounts,
        excludeId = null,
        horizonDays = 7,
    }) {
        for (let i = 0; i < horizonDays; i += 1) {
            const day = W.startOfDay(W.addDays(from, i))
            for (const w of windows || []) {
                if (excludeId && String(w._id) === String(excludeId) && i === 0) continue
                if (!W.isWindowBookable({ window: w, date: day, now, workingDays: settings.workingDays })) {
                    continue
                }
                const key = `${W.dateKey(day)}::${String(w._id)}`
                if (!W.isWindowFull(w, bookedCounts[key] || 0)) {
                    return { window: w, date: day }
                }
            }
        }
        return null
    }

    // ───────────────────────────── admin CRUD ─────────────────────────────

    static async listWindows() {
        try {
            const windows = await BookingWindowModel.find({})
                .sort({ startTime: 1 })
                .lean()
            const settings = await this.getSchedulingSettings()
            return BaseService.sendSuccessResponse({
                message: { windows, workingDays: settings.workingDays },
            })
        } catch (error) {
            console.error('listWindows failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to load the booking windows.',
            })
        }
    }

    /**
     * Validate a window's own shape. Shared by create and update so the two can
     * never drift — the lesson from the three copies of the hold-SLA table.
     */
    static _validateWindow(payload, { partial = false } = {}) {
        const errors = []
        const has = (k) => payload[k] !== undefined

        if (!partial || has('name')) {
            if (!String(payload.name || '').trim()) errors.push('name is required')
        }
        for (const field of ['startTime', 'endTime']) {
            if (!partial || has(field)) {
                if (W.parseHhMm(payload[field]) === null) {
                    errors.push(`${field} must be a time in HH:mm form, e.g. 15:00`)
                }
            }
        }
        if ((!partial || (has('startTime') && has('endTime'))) &&
            W.parseHhMm(payload.startTime) !== null &&
            W.parseHhMm(payload.endTime) !== null) {
            if (W.parseHhMm(payload.endTime) <= W.parseHhMm(payload.startTime)) {
                errors.push('endTime must be after startTime')
            }
        }
        if (has('days')) {
            const days = Array.isArray(payload.days) ? payload.days : []
            if (!days.length) errors.push('days must list at least one day')
            const bad = days.filter((d) => !W.DAY_KEYS.includes(String(d).toLowerCase()))
            if (bad.length) errors.push(`unknown day(s): ${bad.join(', ')}`)
        }
        if (has('cutoffMinutes')) {
            const c = Number(payload.cutoffMinutes)
            if (!Number.isFinite(c) || c < 0) errors.push('cutoffMinutes must be 0 or more')
        }
        // A blank limit is MEANINGFUL — it is "no limit" — so '' and null are
        // accepted and only a nonsense number is refused.
        if (has('limit') && payload.limit !== null && payload.limit !== '') {
            const l = Number(payload.limit)
            if (!Number.isFinite(l) || l < 0) {
                errors.push('limit must be 0 or more, or blank for no limit')
            }
        }
        return errors
    }

    /** Normalise the fields that have a stored form different from the input. */
    static _shapeWindow(payload) {
        const out = {}
        if (payload.name !== undefined) out.name = String(payload.name).trim()
        if (payload.startTime !== undefined) out.startTime = payload.startTime.trim()
        if (payload.endTime !== undefined) out.endTime = payload.endTime.trim()
        if (payload.days !== undefined) {
            out.days = [
                ...new Set(payload.days.map((d) => String(d).toLowerCase())),
            ]
        }
        if (payload.cutoffMinutes !== undefined) {
            out.cutoffMinutes = Number(payload.cutoffMinutes)
        }
        if (payload.limit !== undefined) {
            out.limit =
                payload.limit === null || payload.limit === ''
                    ? null
                    : Number(payload.limit)
        }
        if (payload.isActive !== undefined) out.isActive = Boolean(payload.isActive)
        return out
    }

    static async createWindow({ payload, actorId }) {
        try {
            const errors = this._validateWindow(payload || {})
            if (errors.length) {
                return BaseService.sendFailedResponse({ error: errors.join('; ') })
            }
            const shaped = this._shapeWindow(payload)
            // Case-insensitive name clash, which is what an operator sees as a
            // duplicate — the same gap the hold-type CRUD had (it checked the
            // derived key, so two identical NAMES could coexist).
            const clash = await BookingWindowModel.findOne({
                name: new RegExp(`^${shaped.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            }).lean()
            if (clash) {
                return BaseService.sendFailedResponse({
                    error: `A window named "${shaped.name}" already exists.`,
                })
            }
            const window = await BookingWindowModel.create({
                ...shaped,
                createdBy: actorId,
            })
            await this._audit(
                actorId,
                `Created booking window "${window.name}" ${window.startTime}-${window.endTime}, limit ${window.limit === null ? 'none' : window.limit}`,
            )
            return BaseService.sendSuccessResponse({ message: window.toObject() })
        } catch (error) {
            console.error('createWindow failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to create the booking window.',
            })
        }
    }

    static async updateWindow({ id, payload, actorId }) {
        try {
            const window = await BookingWindowModel.findById(id)
            if (!window) {
                return BaseService.sendFailedResponse({ error: 'Window not found.' })
            }
            const errors = this._validateWindow(payload || {}, { partial: true })
            if (errors.length) {
                return BaseService.sendFailedResponse({ error: errors.join('; ') })
            }
            const shaped = this._shapeWindow(payload || {})
            if (shaped.name) {
                const clash = await BookingWindowModel.findOne({
                    _id: { $ne: window._id },
                    name: new RegExp(`^${shaped.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                }).lean()
                if (clash) {
                    return BaseService.sendFailedResponse({
                        error: `A window named "${shaped.name}" already exists.`,
                    })
                }
            }
            // An endTime moved past an unchanged startTime (and the reverse) is
            // only visible against the SAVED document, not the patch.
            const merged = {
                startTime: shaped.startTime ?? window.startTime,
                endTime: shaped.endTime ?? window.endTime,
            }
            if (W.parseHhMm(merged.endTime) <= W.parseHhMm(merged.startTime)) {
                return BaseService.sendFailedResponse({
                    error: 'endTime must be after startTime',
                })
            }

            Object.assign(window, shaped, { updatedBy: actorId })
            await window.save()
            await this._audit(
                actorId,
                `Updated booking window "${window.name}" ${window.startTime}-${window.endTime}, limit ${window.limit === null ? 'none' : window.limit}, ${window.isActive ? 'active' : 'switched off'}`,
            )
            return BaseService.sendSuccessResponse({ message: window.toObject() })
        } catch (error) {
            console.error('updateWindow failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to update the booking window.',
            })
        }
    }

    /**
     * Windows are DEACTIVATED, never deleted, when orders already reference
     * them — the same reasoning as the archived CRM cards and the archived
     * offers: an order's `scheduling.windowId` must keep resolving, or the
     * customer's own history stops explaining what they were promised.
     */
    static async deleteWindow({ id, actorId }) {
        try {
            const window = await BookingWindowModel.findById(id)
            if (!window) {
                return BaseService.sendFailedResponse({ error: 'Window not found.' })
            }
            const inUse = await BookOrderModel.countDocuments({
                $or: [
                    { 'scheduling.pickup.windowId': window._id },
                    { 'scheduling.delivery.windowId': window._id },
                ],
            })
            if (inUse > 0) {
                window.isActive = false
                window.updatedBy = actorId
                await window.save()
                await this._audit(
                    actorId,
                    `Switched off booking window "${window.name}" — used by ${inUse} order(s), so not deleted`,
                )
                return BaseService.sendSuccessResponse({
                    message: {
                        deactivated: true,
                        deleted: false,
                        ordersReferencing: inUse,
                        window: window.toObject(),
                        note: `${window.name} is used by ${inUse} order(s), so it was switched off rather than deleted. Those orders keep their times.`,
                    },
                })
            }
            await BookingWindowModel.deleteOne({ _id: window._id })
            await this._audit(
                actorId,
                `Deleted unused booking window "${window.name}"`,
            )
            return BaseService.sendSuccessResponse({
                message: { deleted: true, deactivated: false, window: window.toObject() },
            })
        } catch (error) {
            console.error('deleteWindow failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to remove the booking window.',
            })
        }
    }

    /**
     * D6: the working-days tick box. Ticking a day makes it live at once —
     * nothing caches this, every read goes through `getSchedulingSettings`.
     */
    static async updateWorkingDays({ workingDays, actorId }) {
        try {
            const raw = Array.isArray(workingDays)
                ? workingDays
                : workingDays && typeof workingDays === 'object'
                  ? workingDays
                  : null
            if (raw === null) {
                return BaseService.sendFailedResponse({
                    error: 'workingDays must be a list of days, or an object of day → true/false.',
                })
            }
            // Refuse an EMPTY week explicitly rather than let the engine's
            // safety fallback silently ignore it. The fallback exists so a
            // corrupt setting cannot close the business; it must not become a
            // way for an admin to think they closed every day and be wrong.
            const requested = Array.isArray(raw)
                ? raw.map((d) => String(d).toLowerCase())
                : Object.entries(raw).filter(([, on]) => on).map(([d]) => d.toLowerCase())
            const unknown = requested.filter((d) => !W.DAY_KEYS.includes(d))
            if (unknown.length) {
                return BaseService.sendFailedResponse({
                    error: `unknown day(s): ${unknown.join(', ')}. Use ${W.DAY_KEYS.join(', ')}.`,
                })
            }
            if (!requested.length) {
                return BaseService.sendFailedResponse({
                    error: 'At least one working day is required — otherwise no booking could ever be taken.',
                })
            }

            const days = [...new Set(requested)]
            await AdminSettingModel.updateOne({}, { $set: { workingDays: days } })
            await this._audit(actorId, `Set working days to ${days.join(', ')}`)
            return BaseService.sendSuccessResponse({ message: { workingDays: days } })
        } catch (error) {
            console.error('updateWorkingDays failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to update the working days.',
            })
        }
    }

    /**
     * D7 — CONFIRM THE DELIVERY WINDOW WHEN THE ORDER IS MARKED READY.
     *
     * Pre-approved by the client ("if neither changes the shape of the data, go
     * ahead as you recommended"). The reasoning they accepted: a standard
     * order's delivery day is +2 and is NOT known at booking, and under D6 that
     * day might not even be a working day. So at booking the delivery leg
     * carries only the INTENT (timing + fee); the actual window and day are
     * pinned here, at READY, when we know the clothes are finished.
     *
     * Called from `packAndSealComplete`, fire-and-forget: a scheduling
     * refinement must never fail the act of marking an order ready. If it does
     * fail, the order simply keeps reading "estimated" — which is what it said
     * before, so nothing is worse than it was.
     *
     * Idempotent on `scheduling.delivery.confirmedAt`.
     */
    static async confirmDeliveryWindow({ orderId, now = new Date() }) {
        try {
            const order = await BookOrderModel.findById(orderId)
                .select('scheduling deliverySpeed isDelivery oscNumber')
                .lean()
            if (!order) return { ok: false, reason: 'not-found' }
            // An office collection has no delivery leg to schedule.
            if (!order.isDelivery) return { ok: false, reason: 'no-delivery-leg' }
            if (order.scheduling?.delivery?.confirmedAt) {
                return { ok: false, reason: 'already-confirmed' }
            }

            const [settings, windows] = await Promise.all([
                this.getSchedulingSettings(),
                this.getActiveWindows(),
            ])

            // The customer asked for Anytime: honour that, and pin the day
            // rather than a window.
            const timing = order.scheduling?.delivery?.timing
            if (timing === BOOKING_TIMING.ANYTIME) {
                const serveFrom = W.anytimeServiceStart({
                    now,
                    workingDays: settings.workingDays,
                    anytimeOpenFrom: settings.anytimeOpenFrom,
                    anytimeOpenTo: settings.anytimeOpenTo,
                })
                await BookOrderModel.updateOne(
                    { _id: orderId },
                    {
                        $set: {
                            'scheduling.delivery.date': serveFrom
                                ? W.startOfDay(serveFrom)
                                : W.startOfDay(now),
                            'scheduling.delivery.confirmedAt': now,
                        },
                    },
                )
                return { ok: true, timing: BOOKING_TIMING.ANYTIME }
            }

            // Otherwise find the soonest window with room, from today onward —
            // the order is ready NOW, so there is no point offering yesterday's
            // slot or a day that is already full.
            const from = W.startOfDay(now)
            const bookedCounts = await this.getBookedCounts({
                from,
                to: W.addDays(from, 10),
            })
            const slot = this._nextAvailableWindow({
                windows,
                from,
                now,
                settings,
                bookedCounts,
            })

            if (!slot) {
                // Nothing free within the horizon. Say so by leaving it
                // unconfirmed rather than inventing a date the customer would
                // then be promised — the promise keeps reading "estimated",
                // which is honest.
                return { ok: false, reason: 'no-window-available' }
            }

            await BookOrderModel.updateOne(
                { _id: orderId },
                {
                    $set: {
                        'scheduling.delivery.timing': BOOKING_TIMING.WINDOW,
                        'scheduling.delivery.windowId': slot.window._id,
                        'scheduling.delivery.windowName': slot.window.name,
                        'scheduling.delivery.windowStart': slot.window.startTime,
                        'scheduling.delivery.windowEnd': slot.window.endTime,
                        'scheduling.delivery.date': slot.date,
                        'scheduling.delivery.confirmedAt': now,
                        // The fee is NOT touched. The customer was quoted at
                        // booking and has in many cases already paid; pinning a
                        // window at READY must not re-price the order.
                    },
                },
            )

            return {
                ok: true,
                timing: BOOKING_TIMING.WINDOW,
                windowName: slot.window.name,
                date: slot.date,
            }
        } catch (error) {
            console.error('confirmDeliveryWindow failed:', error?.message)
            return { ok: false, reason: 'error' }
        }
    }

    /**
     * D2(c) AS NARROWED — pay the Anytime refund, if it is owed.
     *
     * The client's rule: refund the difference between the Anytime price and
     * the window price for that leg **only when BOTH** (a) the customer booked
     * Anytime while that day's window could still be booked, and (b) the job
     * was actually done inside that window. "They paid for speed and did not
     * get it."
     *
     * ⚠️ CONDITION (a) IS READ FROM THE ORDER, NEVER RECOMPUTED. By the time
     * the job is done the cutoff has long passed, so "was the window still
     * bookable when they booked?" is unanswerable after the fact — it is
     * stamped as `windowWasBookableAtBooking` at booking. Their examples:
     * booked 11:00 and picked up 16:00 → refund; booked 14:30 and picked up
     * 16:00 → no refund, because at 14:30 there was no cheaper way to be served
     * that day.
     *
     * Called when a leg is actually served. Stamps `servedAt` either way, so
     * the record of WHEN it happened exists whether or not money moved.
     * Idempotent on `refund.paidAt`.
     */
    static async settleAnytimeRefund({ orderId, leg, servedAt = new Date() }) {
        try {
            if (!Object.values(DISPATCH_LEG).includes(leg)) {
                return { ok: false, reason: 'bad-leg' }
            }
            const order = await BookOrderModel.findById(orderId)
                .select('scheduling userId oscNumber')
                .lean()
            if (!order) return { ok: false, reason: 'not-found' }

            const legData = order.scheduling?.[leg]
            // Always record when the leg was served, even for a window booking
            // that can never earn a refund — it is the other half of the test
            // and useful on its own.
            if (!legData?.servedAt) {
                await BookOrderModel.updateOne(
                    { _id: orderId },
                    { $set: { [`scheduling.${leg}.servedAt`]: servedAt } },
                )
            }

            if (!legData) return { ok: false, reason: 'not-scheduled' }
            if (legData.timing !== BOOKING_TIMING.ANYTIME) {
                return { ok: false, reason: 'not-anytime' }
            }
            if (legData.refund?.paidAt) return { ok: false, reason: 'already-paid' }

            // The window the flag was measured against at booking time.
            const window = legData.refundAgainstWindowId
                ? await BookingWindowModel.findById(legData.refundAgainstWindowId).lean()
                : null

            const qualifies = W.qualifiesForAnytimeRefund({
                windowWasBookableAtBooking: legData.windowWasBookableAtBooking,
                servedAt,
                window,
            })

            if (!qualifies) {
                // Record the decision, so "why was there no refund?" has an
                // answer later instead of silence.
                await BookOrderModel.updateOne(
                    { _id: orderId },
                    {
                        $set: {
                            [`scheduling.${leg}.refund.qualified`]: false,
                            [`scheduling.${leg}.refund.reason`]:
                                legData.windowWasBookableAtBooking !== true
                                    ? 'Booked after the window had closed, so there was no cheaper option that day.'
                                    : 'The job was not done inside a window.',
                        },
                    },
                )
                return { ok: false, reason: 'not-qualified' }
            }

            const settings = await this.getSchedulingSettings()
            const amount = W.anytimeRefundAmount({ leg, settings })
            if (amount <= 0) return { ok: false, reason: 'no-difference' }

            if (!order.userId) {
                // A walk-in with no account has no wallet to credit. Recorded
                // rather than silently skipped, so it can be settled by hand.
                await BookOrderModel.updateOne(
                    { _id: orderId },
                    {
                        $set: {
                            [`scheduling.${leg}.refund.qualified`]: true,
                            [`scheduling.${leg}.refund.amount`]: amount,
                            [`scheduling.${leg}.refund.reason`]:
                                'Owed, but this order has no account to credit — settle manually.',
                        },
                    },
                )
                return { ok: false, reason: 'no-account', amount }
            }

            await refundToWallet({
                userId: order.userId,
                amount,
                orderId,
                description: `Anytime ${leg} refund for order ${order.oscNumber} — served inside a window`,
            })

            await BookOrderModel.updateOne(
                { _id: orderId },
                {
                    $set: {
                        [`scheduling.${leg}.refund.qualified`]: true,
                        [`scheduling.${leg}.refund.amount`]: amount,
                        [`scheduling.${leg}.refund.paidAt`]: new Date(),
                        [`scheduling.${leg}.refund.reason`]:
                            'Paid for Anytime but served inside a window.',
                    },
                },
            )

            try {
                await createNotification({
                    userId: order.userId,
                    title: 'Refund to your wallet',
                    body: `We served your ${leg} inside our normal time window, so ₦${amount.toLocaleString('en-NG')} of the Anytime charge for order ${order.oscNumber} has gone back to your wallet.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.ORDER_UPDATED,
                })
            } catch (error) {
                console.error('anytime refund notification failed:', error?.message)
            }

            return { ok: true, amount }
        } catch (error) {
            console.error('settleAnytimeRefund failed:', error?.message)
            return { ok: false, reason: 'error' }
        }
    }

    /**
     * DISPLAY NAMES for delivery speeds, service types and care tiers (client
     * spec 2026-10-07: "admin must be able to rename them — display name
     * only").
     *
     * ⚠️ It writes ONLY the label map, never the stored value, and the guard is
     * the point: the keys must be values that already exist. `deliverySpeed`
     * and `serviceTier` are enum fields on BookOrder, and
     * `serviceTypes[].name` is matched by the pricing path — so renaming a
     * stored value would fail validation on new orders, orphan existing ones,
     * and silently drop pricing to a multiplier of 1. An unknown key here is
     * refused by name rather than stored as a label nothing will ever read.
     */
    static async updateDisplayNames({ payload, actorId }) {
        try {
            const GROUPS = {
                deliverySpeeds: Object.values(DELIVERY_SPEED),
                serviceTypes: null, // read from settings — admin-managed list
                serviceTiers: Object.values(SERVICE_TIERS),
            }

            const settings = await AdminSettingModel.findOne({})
            if (!settings) {
                return BaseService.sendFailedResponse({
                    error: 'Admin settings not found',
                })
            }
            GROUPS.serviceTypes = (settings.serviceTypes || []).map((s) => s.name)

            const $set = {}
            const applied = {}
            for (const [group, allowed] of Object.entries(GROUPS)) {
                const given = payload?.[group]
                if (given === undefined) continue
                if (!given || typeof given !== 'object' || Array.isArray(given)) {
                    return BaseService.sendFailedResponse({
                        error: `${group} must be an object of value → label.`,
                    })
                }
                const unknown = Object.keys(given).filter(
                    (k) => !allowed.includes(k),
                )
                if (unknown.length) {
                    return BaseService.sendFailedResponse({
                        error: `Unknown ${group}: ${unknown.join(', ')}. These are display names for existing values — valid keys are: ${allowed.join(', ')}.`,
                    })
                }
                const clean = {}
                for (const [k, v] of Object.entries(given)) {
                    const label = String(v ?? '').trim()
                    // An empty label means "go back to the derived name",
                    // which is more useful than storing a blank that would
                    // render as nothing on every card.
                    if (label) clean[k] = label
                }
                $set[`displayNames.${group}`] = clean
                applied[group] = clean
            }

            if (!Object.keys($set).length) {
                return BaseService.sendFailedResponse({
                    error: 'Nothing to update. Send deliverySpeeds, serviceTypes or serviceTiers.',
                })
            }

            await AdminSettingModel.updateOne({}, { $set })
            await this._audit(
                actorId,
                `Updated display names: ${Object.entries(applied)
                    .map(([g, m]) => `${g} (${Object.keys(m).length})`)
                    .join(', ')}`,
            )

            return BaseService.sendSuccessResponse({
                message: {
                    displayNames: applied,
                    note: 'Display names only — the stored values are unchanged, so existing orders and pricing are unaffected.',
                },
            })
        } catch (error) {
            console.error('updateDisplayNames failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Could not update the display names.',
            })
        }
    }

    /** Every label as a screen should render it, with the raw value beside it. */
    static async getDisplayNames() {
        try {
            const settings = await AdminSettingModel.findOne({}).lean()
            const { labelMap } = require('../util/displayName')
            return BaseService.sendSuccessResponse({
                message: labelMap(settings, {
                    speeds: Object.values(DELIVERY_SPEED),
                    types: (settings?.serviceTypes || []).map((s) => s.name),
                    tiers: Object.values(SERVICE_TIERS),
                }),
            })
        } catch (error) {
            console.error('getDisplayNames failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Could not load the display names.',
            })
        }
    }

    // ───────────────────────── the deflection report (D5) ─────────────────────────

    /**
     * "Keep the daily count of windows that filled and customers moved" (D5).
     *
     * Two numbers, deliberately separated, because they answer different
     * questions and one is much larger than the other:
     *   * `shown`   — every time a full window was put in front of somebody.
     *                 One customer refreshing three times is three rows.
     *   * `customers` — DISTINCT customers turned away, which is the figure
     *                 "customers moved" actually means. Deduped at REPORT time,
     *                 not on write, because the raw rows are also how we see a
     *                 window filling up repeatedly through the day.
     */
    static async getDeflectionReport({ from, to }) {
        try {
            const match = { occurredAt: {} }
            if (from) match.occurredAt.$gte = new Date(from)
            if (to) match.occurredAt.$lt = new Date(to)
            if (!from && !to) delete match.occurredAt

            const rows = await WindowDeflectionModel.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: {
                            date: '$date',
                            windowId: '$windowId',
                            windowName: '$windowName',
                        },
                        shown: { $sum: 1 },
                        customers: { $addToSet: '$userId' },
                        limit: { $max: '$limit' },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        date: '$_id.date',
                        windowId: '$_id.windowId',
                        windowName: '$_id.windowName',
                        shown: 1,
                        limit: 1,
                        // An anonymous browse has no userId; $addToSet collapses
                        // every one of them into a single null, so filter it out
                        // rather than count "nobody" as one customer.
                        customersMoved: {
                            $size: {
                                $filter: {
                                    input: '$customers',
                                    cond: { $ne: ['$$this', null] },
                                },
                            },
                        },
                    },
                },
                { $sort: { date: -1, windowName: 1 } },
            ])

            return BaseService.sendSuccessResponse({
                message: {
                    windowsThatFilled: rows.length,
                    rows,
                    note: '"shown" counts every time a full window was offered; "customersMoved" counts distinct signed-in customers turned away.',
                },
            })
        } catch (error) {
            console.error('getDeflectionReport failed:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to load the window deflection report.',
            })
        }
    }

    /**
     * Audit, never fatal — "a record of the work must never reverse the work"
     * (brief 2.5). `createAuditLog` RETHROWS, and its `category` is a Mongoose
     * enum: there is no 'admin' category, and writing one that is not in
     * `AUDIT_LOG_CATEGORIES` is exactly what made "cannot create plan" a false
     * failure after the plan had already been saved. SYSTEM is the right
     * category for scheduling configuration, and the catch means a log failure
     * cannot turn a saved window into a reported error.
     */
    static async _audit(actorId, action) {
        try {
            await createAuditLog({
                userId: actorId,
                action,
                category: AUDIT_LOG_CATEGORIES.SYSTEM,
            })
        } catch (error) {
            console.error(`Audit "${action}" failed (continuing):`, error?.message)
        }
    }
}

module.exports = BookingWindowService
