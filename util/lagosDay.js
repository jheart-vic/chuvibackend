// Lagos-time date buckets (WAT = UTC+1, no DST).
//
// Why this exists: ~25 places in this codebase bucket "today"/"this month" with
// `new Date().setHours(0,0,0,0)`, which is SERVER-local — UTC on Render, but WAT
// on a dev machine in Nigeria. So those buckets silently disagree with the
// Lagos-based reporting surfaces for the first hour of each Lagos day
// (00:00-00:59 Lagos = the previous day in UTC), and the disagreement is
// invisible in local development.
//
// New code should bucket dates through here instead of `setHours(0,0,0,0)` so we
// stop adding to that pile. The existing 25 call sites are deliberately NOT
// rewritten (see context/feature.md Part B).
const moment = require('moment-timezone')

const LAGOS = 'Africa/Lagos'

// Start of the Lagos day containing `date` (default: now), as a UTC Date.
function startOfDay(date = new Date()) {
    return moment(date).tz(LAGOS).startOf('day').toDate()
}

// Exclusive upper bound — start of the NEXT Lagos day. Prefer `$lt: endOfDay()`
// over `$lte: 23:59:59.999`, which drops anything in the final millisecond.
function endOfDay(date = new Date()) {
    return moment(date).tz(LAGOS).startOf('day').add(1, 'day').toDate()
}

// Start of the Lagos month containing `date` (default: now), as a UTC Date.
function startOfMonth(date = new Date()) {
    return moment(date).tz(LAGOS).startOf('month').toDate()
}

// Exclusive upper bound — start of the next Lagos month.
function endOfMonth(date = new Date()) {
    return moment(date).tz(LAGOS).startOf('month').add(1, 'month').toDate()
}

// `date` shifted by whole Lagos days, e.g. daysAgo(7) = start of the Lagos day
// seven days back. Useful for "last 7 days" windows.
function daysAgo(days, date = new Date()) {
    return moment(date).tz(LAGOS).startOf('day').subtract(days, 'days').toDate()
}

// Half-open [from, to) range for a 'YYYY-MM' string, or null if it isn't a real
// month. Strict on purpose: moment accepts "April 2027" for 'YYYY-MM' otherwise.
function monthRange(month) {
    if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return null
    const start = moment.tz(month, 'YYYY-MM', true, LAGOS)
    if (!start.isValid()) return null
    return {
        from: start.toDate(),
        to: start.clone().add(1, 'month').toDate(),
    }
}

// The Lagos month a timestamp falls in, as 'YYYY-MM'.
function monthKey(date = new Date()) {
    return moment(date).tz(LAGOS).format('YYYY-MM')
}

module.exports = {
    LAGOS,
    startOfDay,
    endOfDay,
    startOfMonth,
    endOfMonth,
    daysAgo,
    monthRange,
    monthKey,
}
