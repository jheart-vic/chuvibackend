// Stateless parsing / matching / estimate helpers for the in-app bot.
//
// These were extracted verbatim from botOrchestrator.service.js to keep that
// file a lean router. They are mixed onto the orchestrator's prototype (see the
// Object.assign at the bottom of botOrchestrator.service.js), so they keep using
// `this` for their few internal cross-calls (e.g. _parseItemsFromText →
// this._wordToNumber, _bookingEstimate → this._speedCharge) exactly as before —
// no behaviour change. Nothing here touches conversation state, models, or the
// network; it's pure text/number/price logic.
const { roundToNearestHundred } = require('../../util/helper')
const { DELIVERY_SPEED } = require('../../util/constants')

// "next week" that isn't ruled out ("this saturday, not next week", "saturday
// or next week") — review F-78.
const NEXT_WEEK = /(?<!\b(?:not|or)\s+)\bnext\s+week\b/

const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`

module.exports = {
    _isCancel(text) {
        return /\b(cancel|never ?mind|forget (it|about it)|scrap that|start over|abort)\b/i.test(String(text || ''))
    },

    isAffirmative(text) {
        return /\b(yes|yeah|yep|yup|sure|ok|okay|okk|please|pls|connect|do it|go ahead|alright|yh|ya|talk|speak|correct|confirm)\b/i.test(
            String(text || ''),
        )
    },

    // Loose no-detector for the update-details confirmation step.
    isNegative(text) {
        return /\b(no|nope|nah|don'?t|do ?not|cancel|stop|wrong|incorrect|not right|change it)\b/i.test(
            String(text || ''),
        )
    },

    // Find a catalog item the message refers to (singular/plural).
    _extractItemName(text, items) {
        const t = String(text || '').toLowerCase()
        for (const i of items) {
            const n = (i.name || '').toLowerCase()
            if (n && new RegExp(`\\b${n}s?\\b`, 'i').test(t)) return i.name
        }
        return null
    },

    // 'wallet' | 'card' | null — how the customer wants to pay for a booking.
    _parsePaymentChoice(text) {
        const t = String(text || '').toLowerCase()
        if (/\bwallet\b|\bbalance\b|\bcredit\b|from my (wallet|balance)/.test(t)) return 'wallet'
        if (/\bcard\b|paystack|online|debit|\bbank\b|transfer|\blink\b|pay now/.test(t)) return 'card'
        return null
    },

    _complaintSummary({ oscNumber, typeName, description, photos }) {
        return [
            "Here's the complaint I'll log:",
            `• Order: ${oscNumber}`,
            `• Issue: ${typeName}`,
            `• Details: ${description}`,
            `• Photos: ${photos.length ? `${photos.length} attached` : 'none'}`,
            'Shall I submit it? (yes/no)',
        ].join('\n')
    },

    // Best-effort auto-match of the description to a complaint type (confirmed
    // later, so a loose guess is safe). Uses the type name's significant words.
    _matchComplaintType(text, types) {
        const t = String(text || '').toLowerCase()
        for (const ty of types) {
            const words = String(ty.name || '')
                .toLowerCase()
                .split(/\W+/)
                .filter((w) => w.length >= 5)
            if (words.some((w) => t.includes(w))) return ty
        }
        return null
    },

    // Resolve the customer's pick (a number or a name) to a complaint type.
    _pickComplaintType(text, types) {
        const t = String(text || '').trim().toLowerCase()
        const num = t.match(/^\s*(\d+)/)
        if (num) {
            const idx = parseInt(num[1], 10) - 1
            if (idx >= 0 && idx < types.length) return types[idx]
        }
        return (
            types.find((ty) => t.includes(String(ty.name || '').toLowerCase())) ||
            (t.length >= 3
                ? types.find((ty) => String(ty.name || '').toLowerCase().includes(t))
                : null) ||
            null
        )
    },

    // Parse a 1–5 rating from a free-text reply (digit, stars, or sentiment words).
    _parseRating(text) {
        const t = String(text || '')
        const m = t.match(/\b([1-5])\b(?:\s*(?:\/|out of)\s*5)?/)
        if (m) return parseInt(m[1], 10)
        const stars = (t.match(/★|⭐/g) || []).length
        if (stars >= 1 && stars <= 5) return stars
        if (/\b(excellent|great|perfect|amazing|love|wonderful)\b/i.test(t)) return 5
        if (/\b(good|nice|happy|satisfied|clean)\b/i.test(t)) return 4
        if (/\b(ok|okay|fine|average|alright)\b/i.test(t)) return 3
        if (/\b(bad|poor|late|terrible|awful|disappointed|rude|not good)\b/i.test(t)) return 2
        return null
    },

    // Resolve "6 shirts, 3 trousers" → catalog-priced items. Returns matched
    // (priced) items and any names we don't carry.
    _resolveBookingItems(rawItems, catalog) {
        const priced = []
        const unmatched = []
        for (const it of rawItems || []) {
            const type = String(it.type || '').toLowerCase().trim()
            const qty = Math.max(1, Math.round(Number(it.quantity) || 1))
            if (!type) continue
            const m =
                catalog.find((c) => (c.name || '').toLowerCase() === type) ||
                catalog.find(
                    (c) =>
                        type.includes((c.name || '').toLowerCase()) ||
                        (c.name || '').toLowerCase().includes(type),
                )
            if (m) priced.push({ type: m.name, price: m.price, quantity: qty })
            else unmatched.push(it.type)
        }
        return { priced, unmatched }
    },

    // Offline fallback item parser ("6 shirts and 3 trousers") for when the LLM
    // isn't available to structure slots.items.
    _parseItemsFromText(text, catalog) {
        // Digits AND spelled-out numbers, incl. tens/compounds ("2 shirts,
        // two duvets, thirty-five towels, fifty shorts").
        const tens = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety'
        const teens = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen'
        const ones = 'one|two|three|four|five|six|seven|eight|nine'
        // tens (+ optional ones) matched first so "thirty five" is one number.
        const numWord = `(?:${tens})(?:[\\s-](?:${ones}))?|${teens}|${ones}`
        const re = new RegExp(`\\b(\\d+|${numWord})\\s+([a-zA-Z]+)`, 'gi')
        const out = []
        let m
        while ((m = re.exec(String(text || '')))) {
            const q = this._wordToNumber(m[1])
            if (!q) continue
            out.push({ type: m[2].toLowerCase(), quantity: q })
        }
        return out
    },

    // Parse a number written as digits or words ("35", "thirty-five", "fifty",
    // "seven") to an integer; null if any token isn't a known number word.
    _wordToNumber(str) {
        const s = String(str || '').toLowerCase().trim()
        if (/^\d+$/.test(s)) return parseInt(s, 10)
        const map = {
            one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
            ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
            sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
            twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
        }
        let total = 0
        for (const tok of s.split(/[\s-]+/)) {
            if (map[tok] == null) return null
            total += map[tok]
        }
        return total || null
    },

    // Part A: pull a day phrase and/or time-of-day from free text, WITHOUT
    // swallowing the whole message. Returns { datePhrase, timePhrase } (either
    // may be null). _resolvePickupDate turns datePhrase into a real Date.
    // `written` also reads a written date ("20 October", "20/10") — only when the
    // customer is answering the day question, so an address ("12/4 Allen
    // Avenue") is never taken as a day.
    _parseDateTimeFromText(text, { written = false } = {}) {
        const t = String(text || '').toLowerCase()
        let datePhrase = null
        if (/\bday after tomorrow\b/.test(t)) datePhrase = 'day after tomorrow'
        else if (/\btomorrow\b/.test(t)) datePhrase = 'tomorrow'
        else if (/\btoday\b/.test(t)) datePhrase = 'today'
        else {
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
            for (const d of days) {
                if (new RegExp(`\\b${d}\\b`).test(t)) { datePhrase = d; break }
            }
            // Keep "next week" with the weekday, so it isn't the coming one —
            // unless it's ruled out ("this saturday, not next week") (F-78).
            if (datePhrase && NEXT_WEEK.test(t)) datePhrase = `${datePhrase} next week`
        }
        // A written date is kept BESIDE a named day ("saturday 20 Oct"), never in
        // place of it, so _resolvePickupDate can check they agree (F-73).
        // Beside a named weekday a date is read on any turn ("book saturday
        // 24th"), so the agreement check runs; on its own only on the day
        // question, so an address is never a day (F-78).
        // Away from the day question only a day-of-month or a month name counts
        // beside the weekday, never a slash pair ("No 17/4 Allen Avenue", F-81).
        const w = written || datePhrase ? this._writtenPickupDate(t, new Date(), { slash: written }) : null
        if (w) datePhrase = datePhrase ? `${datePhrase} ${w.text}` : w.text
        let timePhrase = null
        const clock = t.match(/\b(\d{1,2})(:\d{2})?\s*(am|pm)\b/)
        if (clock) timePhrase = clock[0].replace(/\s+/g, '')
        else if (/\bmorning\b/.test(t)) timePhrase = 'morning'
        else if (/\bafternoon\b/.test(t)) timePhrase = 'afternoon'
        else if (/\bevening\b/.test(t)) timePhrase = 'evening'
        else if (/\bnight\b/.test(t)) timePhrase = 'night'
        else if (/\bnoon\b|\bmidday\b|\bmid-day\b/.test(t)) timePhrase = 'noon'
        return { datePhrase, timePhrase }
    },

    // Default pickup window when the customer gives a day but no time. Uses the
    // first configured pickup slot if present, else a sensible "morning".
    _defaultPickupWindow(setting) {
        const slots = setting?.pickupTimes || setting?.pickupTimeSlots || setting?.pickupSlots
        if (Array.isArray(slots) && slots.length) {
            const first = slots[0]
            return typeof first === 'string' ? first : first?.label || first?.name || 'morning'
        }
        return 'morning'
    },

    // Map the customer's words to one of the configured service-type names.
    _matchServiceType(text, setting) {
        const t = String(text || '').toLowerCase()
        const names = (setting?.serviceTypes || []).map((s) => s.name)
        const want = (n) => (names.includes(n) ? n : null)
        if (/\bdry\s*clean/.test(t)) return want('dry-clean')
        if (/\bwash\b.*\biron\b|\bwash and iron\b|\bwash & iron\b/.test(t)) return want('wash-and-iron')
        if (/\biron(ing)?\s*only\b|\bjust iron\b|\bonly iron/.test(t)) return want('ironing-only')
        if (/\bwash(ing)?\s*only\b|\bjust wash\b|\bonly wash/.test(t)) return want('washing-only')
        if (/\biron/.test(t)) return want('ironing-only')
        if (/\bwash/.test(t)) return want('wash-and-iron')
        return null
    },

    // Estimate for the confirm prompt — same per-piece math as pricing/booking
    // (classic tier) plus pickup/delivery fees. Clearly labelled an estimate;
    // the authoritative total comes from the placed order's receipt.
    _bookingEstimate(priced, serviceType, setting, speed) {
        const svc =
            (setting?.serviceTypes || []).find((s) => s.name === serviceType) ||
            (setting?.serviceTypes || [])[0]
        const per = svc ? svc.pricePerPiece || 0 : 0
        let sum = 0
        for (const i of priced) sum += roundToNearestHundred((i.price || 0) * per) * i.quantity
        sum += (setting?.pickupFee || 0) + (setting?.deliveryFee || 0)
        sum += this._speedCharge(speed, setting)
        return sum
    },

    // Speed surcharge (0 for standard / unknown).
    _speedCharge(speed, setting) {
        if (speed === DELIVERY_SPEED.EXPRESS) return setting?.expressCharge || 0
        if (speed === DELIVERY_SPEED.SAME_DAY) return setting?.sameDayCharge || 0
        return 0
    },

    // 'same-day' | 'express' | 'standard' | null — the customer's chosen speed.
    _parseDeliverySpeed(text) {
        const t = String(text || '').toLowerCase()
        if (/same.?day|\btoday\b/.test(t)) return DELIVERY_SPEED.SAME_DAY
        // standard BEFORE express so "no rush" isn't caught by express's "rush".
        if (/standard|normal|regular|cheap|no rush|not in a hurry|whenever|\bslow\b/.test(t)) return DELIVERY_SPEED.STANDARD
        if (/express|urgent|\bfast\b|\brush\b|\bquick/.test(t)) return DELIVERY_SPEED.EXPRESS
        return null
    },

    // Every speed for this pickup day/time and piece count, from the SAME rows
    // the booking enforces (launch item 3: ready dates from the pickup, the
    // daily floor limit, the on-screen speed names), so the assistant never
    // offers what the booking would refuse. Unavailable rows carry the
    // client's sentence. Standard (Regular) is never refused.
    async _availableSpeeds(setting, { bItems = [], bDate = null, pickupDay = null, bTime = null } = {}) {
        const BookingWindowService = require('../bookingWindow.service')
        const pieces = (bItems || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0)
        // Resolved exactly as _placeBooking resolves it ("tomorrow" → a date),
        // so the offered rows and the booking count from the same pickup.
        const { speeds } = await BookingWindowService.speedOptionsFor({
            pickup: { pickupDate: pickupDay || this._resolvePickupDate(bDate), pickupTime: bTime },
            pieces,
        })
        const charge = {
            [DELIVERY_SPEED.SAME_DAY]: setting?.sameDayCharge || 0,
            [DELIVERY_SPEED.EXPRESS]: setting?.expressCharge || 0,
            [DELIVERY_SPEED.STANDARD]: 0,
        }
        return speeds.map((s) => ({
            speed: s.speed,
            label: s.label,
            available: s.available,
            charge: charge[s.speed] || 0,
            eta: s.available ? s.readyText.replace(/^Ready/, 'ready') : null,
            message: s.message,
        }))
    },

    _speedOfferText(avail, { skipNoteFor = null } = {}) {
        // Only the speeds that still fit are offered (client, 12 Oct); a
        // greyed-out speed gets its reason underneath — except the one the
        // reply already leads with (F-60).
        const notes = avail
            .filter((s) => !s.available && s.message && s.speed !== skipNoteFor)
            .map((s) => `(${s.message})`)
        avail = avail.filter((s) => s.available !== false)
        const lines = avail.map((s) => {
            const price = s.charge > 0 ? ` (+${naira(s.charge)})` : ' (free)'
            return `• ${s.label}${price} — ${s.eta}`
        })
        return `How soon do you need it?\n${[...lines, ...notes].join('\n')}\nReply with one — or "standard" if you're not in a hurry.`
    },

    // One-line speed description for the confirm summary.
    _describeSpeed(speed, setting, chosen = null) {
        // The real ready date for this pickup when the speed step worked it
        // out (launch item 3); the old fixed wording otherwise.
        if (chosen?.label && chosen?.eta) {
            const c = this._speedCharge(speed, setting)
            return `${chosen.label}${c > 0 ? ` (+${naira(c)})` : ''} — ${chosen.eta}`
        }
        const map = {
            [DELIVERY_SPEED.SAME_DAY]: { label: 'Same-day', eta: 'ready today' },
            [DELIVERY_SPEED.EXPRESS]: { label: 'Express', eta: 'ready tomorrow' },
            [DELIVERY_SPEED.STANDARD]: { label: 'Standard', eta: 'ready in about 2 days' },
        }
        const d = map[speed] || map[DELIVERY_SPEED.STANDARD]
        const charge = this._speedCharge(speed, setting)
        return `${d.label}${charge > 0 ? ` (+${naira(charge)})` : ''} — ${d.eta}`
    },

    // A written pickup day: "20 October", "20th of Oct", "Oct 20", "20/10"
    // (day first), "the 20th", "in 3 days". Returns { date (local midnight),
    // text } for the next such day on or after today, or null. A day that
    // doesn't exist (31/02) or an explicit past date is null, never a guess
    // (review F-72: an unread day used to fall back to NOW).
    _writtenPickupDate(phrase, now = new Date(), { slash = true } = {}) {
        const p = String(phrase || '').toLowerCase()
        const today = new Date(now)
        today.setHours(0, 0, 0, 0)
        const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
        const make = (y, m, d) => {
            const dt = new Date(y, m, d)
            return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null
        }
        // Next occurrence on or after today when no year was written. A date
        // that passed recently ("12 Oct" on the 13th) is a slip, not next
        // year: null, so the customer is asked again. Only a date well behind
        // ("5 Jan" in December) rolls to next year.
        const nextOf = (m, d) => {
            const y = today.getFullYear()
            const dt = make(y, m, d)
            if (dt && dt >= today) return dt
            if (dt && today - dt < 60 * 86400000) return null
            return make(y + 1, m, d)
        }
        let m
        // "may" is also a verb: "9 may" is 9 May only when nothing but a time,
        // a year or punctuation follows ("by 3 may be 4pm", "around 9 may
        // work" are not dates — F-73, F-79).
        const MAY_IS_MONTH = /^\s*(?:$|[,.!?]|\d|(?:at|by|around|in|morning|afternoon|evening|from)\b)/
        if ((m = p.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}\\b`))) &&
            (m[2] !== 'may' || MAY_IS_MONTH.test(p.slice(m.index + m[0].length)))) {
            const dt = nextOf(MONTHS.indexOf(m[2].slice(0, 3)), Number(m[1]))
            return dt ? { date: dt, text: m[0] } : null
        }
        // "may 10 am" is a time, not 10 May (F-79).
        if ((m = p.match(new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?::\\d{2})?\\s*[ap]\\.?m)`)))) {
            const dt = nextOf(MONTHS.indexOf(m[1].slice(0, 3)), Number(m[2]))
            return dt ? { date: dt, text: m[0] } : null
        }
        // "10/11 am" and "9/10am" are a time range, not a date (F-73).
        if (slash && (m = p.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b(?!\s*[ap]\.?m)/))) {
            const d = Number(m[1])
            const mo = Number(m[2]) - 1
            let dt
            if (m[3]) {
                const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
                dt = make(y, mo, d)
                if (dt && dt < today) dt = null
            } else dt = nextOf(mo, d)
            return dt ? { date: dt, text: m[0] } : null
        }
        // "the 20th" needs "the" — or a weekday beside it ("Saturday 24th",
        // "saturday 24"), so the weekday/date agreement check runs (F-78). Beside
        // a weekday a bare 13–31 is a day of the month; 1–12 stays an hour, and
        // nothing followed by am/pm, ":" or a count is a day. "the 3rd floor" /
        // "the 2nd gate" are places (F-74).
        const NOT_A_DAY = '(?!\\s*(?::|\\/|\\.\\d|[ap]\\.?m|floor|flr|storey|gate|street|st\\b|avenue|ave\\b|road|rd\\b|close|crescent|lane|estate|house|building|block|phase|left|right|turn|junction|bus|shirts?|pieces?|pcs|items?|bags?|clothes|kg))'
        const WEEKDAY = '(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)'
        // What may follow a bare day: a time word, a clock time or a year
        // ("saturday 24 10am", "saturday 24 noon", "saturday 24 between 9 and
        // 11", "saturday 24 2026" — F-82). On the day question punctuation counts
        // too; on any other turn a comma doesn't, because "saturday 24, Allen
        // Avenue" is a house number (F-83).
        const TIME_AFTER = '(?:by|at|around|about|in|from|or|and|morning|afternoon|evening|noon|midday|between|latest|anytime|please|pls)\\b|\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m|\\d{1,2}:\\d{2}|\\d{4}\\b'
        const BARE_AFTER = slash
            ? `(?=\\s*(?:$|[,.!?;]|${TIME_AFTER}))`
            : `(?=\\s*(?:$|[.!?]\\s*$|,?\\s*(?:${TIME_AFTER})))` // a comma only before a time: "saturday 24, 9am"
        const ordinal = new RegExp(`\\b${WEEKDAY}\\b`).test(p)
            // The bare number must sit RIGHT after the weekday, so a house
            // number later in the sentence ("saturday, at 24 Allen Avenue") isn't a day.
            ? new RegExp(`(?:\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)\\b${NOT_A_DAY}|\\b${WEEKDAY}[,\\s]+(?:the\\s+)?(1[3-9]|2\\d|3[01])\\b${BARE_AFTER})`)
            : new RegExp(`\\bthe\\s+(\\d{1,2})(?:st|nd|rd|th)\\b${NOT_A_DAY}`)
        if ((m = p.match(ordinal))) {
            const d = Number(m[1] || m[2])
            let dt = make(today.getFullYear(), today.getMonth(), d)
            if (!dt || dt < today) {
                const next = new Date(today.getFullYear(), today.getMonth() + 1, 1)
                dt = make(next.getFullYear(), next.getMonth(), d)
            }
            // For a bare day only the NUMBER is the written date — the weekday
            // is already in the phrase ("saturday 24", not "saturday saturday 24", F-84).
            return dt ? { date: dt, text: m[2] || m[0] } : null
        }
        if ((m = p.match(/\bin\s+(\d{1,2})\s+days?\b/))) {
            const n = Number(m[1])
            if (n > 60) return null
            const dt = new Date(today)
            dt.setDate(dt.getDate() + n)
            return { date: dt, text: m[0] }
        }
        return null
    },

    // Resolve a day phrase to a real Date (today / tomorrow / a written date /
    // weekday); returns null for anything we can't safely parse — the booking
    // flow then asks for the day again rather than counting from now (F-72).
    _resolvePickupDate(phrase) {
        const p = String(phrase || '').toLowerCase()
        if (!p) return null
        const atNoon = (d) => {
            d.setHours(12, 0, 0, 0)
            return d
        }
        const now = new Date()
        const written = this._writtenPickupDate(p, now)
        const inDays = (n) => {
            const d = new Date(now)
            d.setDate(d.getDate() + n)
            return atNoon(d)
        }
        // A named day: an exact date (today/tomorrow) or a weekday.
        let named = null
        let weekday = -1
        if (/\btoday\b/.test(p)) named = inDays(0)
        else if (/\bday after tomorrow\b|\bovermorrow\b/.test(p)) named = inDays(2)
        else if (/\btomorrow\b/.test(p)) named = inDays(1)
        else {
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
            weekday = days.findIndex((d) => new RegExp(`\\b${d}\\b`).test(p))
            if (weekday >= 0 && NEXT_WEEK.test(p)) {
                // "Saturday next week" = that day in the week starting next
                // Monday, never the coming one (F-78).
                const toNextMonday = ((8 - now.getDay()) % 7) || 7
                named = inDays(toNextMonday + ((weekday + 6) % 7))
            } else if (weekday >= 0) named = inDays(((weekday - now.getDay() + 7) % 7) || 7)
        }
        // Both written → they must agree, or we ask again rather than pick one
        // ("saturday 10/11" is not 10 November — F-73). "Saturday 31 October"
        // agrees when 31 October is a Saturday.
        if (written && named) {
            const agrees = weekday >= 0
                ? written.date.getDay() === weekday
                : written.date.toDateString() === new Date(named).toDateString()
            return agrees ? atNoon(written.date) : null
        }
        if (written) return atNoon(written.date)
        if (named) return named
        return null
    },

    extractCode(text) {
        const m = String(text || '').match(/chuvi[a-z0-9]{4,}/i)
        return m ? m[0].toUpperCase() : null
    },

    parseDetail(text, slots) {
        let field = slots.field || null
        let value = slots.value || null
        const t = String(text || '')
        if (!field) {
            if (/phone|number|mobile|call/i.test(t)) field = 'phone'
            else if (/address|pickup|location/i.test(t)) field = 'pickupAddress'
        }
        if (!value) {
            const phone = t.match(/(\+?\d[\d\s-]{6,}\d)/)
            if (field === 'phone' && phone) value = phone[1].replace(/\s+/g, '')
            else if (field === 'pickupAddress') {
                const after = t.replace(/.*\b(address|pickup|location)\b[:\s]*/i, '').trim()
                if (after && after.toLowerCase() !== t.toLowerCase()) value = after
            }
        }
        return { field, value }
    },

    // Clean a value captured on the `awaiting-value` turn, where the whole
    // message is the answer. Phone → just the digit run; address → strip common
    // lead-in filler ("the new address is at …") so we store "Aroma", not
    // "is at aroma". Returns null when nothing usable is found.
    cleanDetailValue(field, text) {
        const raw = String(text || '').trim()
        if (!raw) return null
        if (field === 'phone') {
            const m = raw.match(/(\+?\d[\d\s-]{6,}\d)/)
            return m ? m[1].replace(/\s+/g, '') : null
        }
        // address: peel a leading preamble only when it's clearly one — either
        // "…address/location is/at/to VALUE" or a conversational lead-in like
        // "it's …" / "make it …". A bare address that merely starts with a filler
        // word ("New Haven Street") has no connector, so it's left untouched.
        let v = raw
            // (a) "the new pickup address is at VALUE" → VALUE
            .replace(
                /^.*\b(?:address|location|pickup|pick\s*up)\b[\s,:.-]*(?:\b(?:is|are|at|to)\b[\s,:.-]*)*/i,
                '',
            )
        // (b) conversational lead-in with no address keyword ("it's aroma",
        //     "make it 5 Broad", "set it to …")
        v = v.replace(
            /^\s*(?:it'?s|it\s+is|(?:change|update|set|make)\s+it(?:\s+to)?|please|pls)\b[\s,:.-]*/i,
            '',
        )
        v = (v.trim() || raw).trim()
        // must contain a real character, not just punctuation ("???" → re-prompt)
        return /[a-z0-9]/i.test(v) ? v : null
    },
}
