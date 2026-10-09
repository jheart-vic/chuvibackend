// WHEN a follow-up message may be sent — client ruling 2026-10-08.
//
// "All follow up and offer messages (leads, registered but not booked, prospects
//  and reactivation) go out only between 6:00 AM and 8:00 AM, or between 6:00 PM
//  and 8:00 PM. Both are settings. A message that falls due outside these times
//  waits for the next one. Order and payment messages still go out at once."
//
// All times are LAGOS wall-clock, which is automatic: server.js pins the process
// TZ, so `new Date().getHours()` already IS the Lagos hour (see CLAUDE.md).
//
// This module is deliberately PURE — no model, no settings read — so it can be
// exercised offline against the client's own worked example. The caller passes
// the window settings in.

const { CRM_SEND_SLOT } = require('./constants')

// Defaults match the client's figures; the real values come from CrmSetting.
const DEFAULT_SEND_WINDOWS = {
    morningStartHour: 6,
    morningEndHour: 8,
    eveningStartHour: 18,
    eveningEndHour: 20,
}

const atHour = (d, hour) => {
    const out = new Date(d)
    out.setHours(hour, 0, 0, 0)
    return out
}

function normalizeWindows(w) {
    const s = { ...DEFAULT_SEND_WINDOWS, ...(w || {}) }
    // A nonsense setting must not silently stop every message forever, so an
    // end at or before its start falls back to the default for that window.
    if (!(s.morningEndHour > s.morningStartHour)) {
        s.morningStartHour = DEFAULT_SEND_WINDOWS.morningStartHour
        s.morningEndHour = DEFAULT_SEND_WINDOWS.morningEndHour
    }
    if (!(s.eveningEndHour > s.eveningStartHour)) {
        s.eveningStartHour = DEFAULT_SEND_WINDOWS.eveningStartHour
        s.eveningEndHour = DEFAULT_SEND_WINDOWS.eveningEndHour
    }
    return s
}

// Is this instant inside one of the two windows?
function isInSendWindow(when, windows) {
    const w = normalizeWindows(windows)
    const h = new Date(when).getHours()
    return (
        (h >= w.morningStartHour && h < w.morningEndHour) ||
        (h >= w.eveningStartHour && h < w.eveningEndHour)
    )
}

// The first moment at or after `from` that falls inside an allowed window.
//
// `prefer` narrows it to one of the two windows (the client pinned message 2 to
// the evening and message 3 to the morning). With `any`, the next window of
// either kind wins — which is what "waits for the next one" means.
function nextSendSlot(from, prefer = CRM_SEND_SLOT.ANY, windows) {
    const w = normalizeWindows(windows)
    const start = new Date(from)

    const candidates = []
    // today and tomorrow are enough: every window recurs daily, so the next one
    // is always within 24h of any instant.
    for (const dayOffset of [0, 1]) {
        const day = new Date(start)
        day.setDate(day.getDate() + dayOffset)
        if (prefer !== CRM_SEND_SLOT.EVENING) {
            candidates.push({
                slot: CRM_SEND_SLOT.MORNING,
                at: atHour(day, w.morningStartHour),
            })
        }
        if (prefer !== CRM_SEND_SLOT.MORNING) {
            candidates.push({
                slot: CRM_SEND_SLOT.EVENING,
                at: atHour(day, w.eveningStartHour),
            })
        }
    }

    // Already inside the right window → send now, don't wait for the next one.
    if (isInSendWindow(start, w)) {
        const h = start.getHours()
        const inMorning = h >= w.morningStartHour && h < w.morningEndHour
        const slotNow = inMorning ? CRM_SEND_SLOT.MORNING : CRM_SEND_SLOT.EVENING
        if (prefer === CRM_SEND_SLOT.ANY || prefer === slotNow) return start
    }

    candidates.sort((a, b) => a.at - b.at)
    const next = candidates.find((c) => c.at >= start)
    // Unreachable in practice (two days of candidates always contain one), but
    // returning `from` is safer than returning undefined and scheduling at the
    // epoch.
    return next ? next.at : start
}

// The window on a GIVEN DAY, used where the client named a day rather than a
// delay ("the evening before the offer ends", "the morning it ends").
function slotOnDay(day, slot, windows) {
    const w = normalizeWindows(windows)
    return atHour(
        day,
        slot === CRM_SEND_SLOT.EVENING ? w.eveningStartHour : w.morningStartHour,
    )
}

// ── The messages 2 and 3 schedule ───────────────────────────────────────────
// Client's rule: message 2 in the EVENING window the day before the offer ends,
// message 3 in the MORNING window on the day it ends.
//
// THE EDGE CASE THEY SPECIFIED, and it is the whole reason this is a function:
// "If the offer ends before 8:00 AM, send message 3 the evening before, and
//  message 2 the morning before that."
// An offer ending at 07:00 Monday would otherwise have message 3 due at 06:00
// Monday — inside the window but only an hour before expiry — and on a 06:00
// expiry it would be due AFTER the offer had already gone. So both messages
// shift back one slot rather than one being dropped.
//
// Returns { second, third } as Dates.
function offerEndSchedule(offerEndsAt, windows) {
    const w = normalizeWindows(windows)
    const end = new Date(offerEndsAt)
    const dayBefore = new Date(end)
    dayBefore.setDate(dayBefore.getDate() - 1)

    // "ends before the morning window closes" — an 07:00 expiry is before 08:00.
    const endsBeforeMorningCloses = end.getHours() < w.morningEndHour

    if (!endsBeforeMorningCloses) {
        return {
            third: slotOnDay(end, CRM_SEND_SLOT.MORNING, w),
            second: slotOnDay(dayBefore, CRM_SEND_SLOT.EVENING, w),
            shifted: false,
        }
    }

    const twoDaysBefore = new Date(end)
    twoDaysBefore.setDate(twoDaysBefore.getDate() - 2)
    return {
        // the evening before
        third: slotOnDay(dayBefore, CRM_SEND_SLOT.EVENING, w),
        // the morning before that
        second: slotOnDay(dayBefore, CRM_SEND_SLOT.MORNING, w),
        shifted: true,
        // kept for the harness: which day the pair fell back onto
        shiftedFrom: twoDaysBefore,
    }
}

module.exports = {
    DEFAULT_SEND_WINDOWS,
    normalizeWindows,
    isInSendWindow,
    nextSendSlot,
    slotOnDay,
    offerEndSchedule,
}
