// Stateless parsing / matching / estimate helpers for the in-app bot.
//
// These were extracted verbatim from botOrchestrator.service.js to keep that
// file a lean router. They are mixed onto the orchestrator's prototype (see the
// Object.assign at the bottom of botOrchestrator.service.js), so they keep using
// `this` for their few internal cross-calls (e.g. _parseItemsFromText →
// this._wordToNumber, _bookingEstimate → this._speedCharge) exactly as before —
// no behaviour change. Nothing here touches conversation state, models, or the
// network; it's pure text/number/price logic.
const { roundToNearestHundred, calculateDueDate } = require('../../util/helper')
const { DELIVERY_SPEED } = require('../../util/constants')

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
    _parseDateTimeFromText(text) {
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
        }
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

    // Speeds available at the current clock time (uses the backend cutoff rule via
    // calculateDueDate, so the bot never offers something that would be blocked),
    // each with its charge + a human ETA. Standard is always available.
    _availableSpeeds(setting) {
        const out = []
        if (calculateDueDate(DELIVERY_SPEED.SAME_DAY)) {
            out.push({ speed: DELIVERY_SPEED.SAME_DAY, label: 'Same-day', charge: setting?.sameDayCharge || 0, eta: 'ready today' })
        }
        if (calculateDueDate(DELIVERY_SPEED.EXPRESS)) {
            out.push({ speed: DELIVERY_SPEED.EXPRESS, label: 'Express', charge: setting?.expressCharge || 0, eta: 'ready tomorrow' })
        }
        out.push({ speed: DELIVERY_SPEED.STANDARD, label: 'Standard', charge: 0, eta: 'ready in about 2 days' })
        return out
    },

    _speedOfferText(avail) {
        const lines = avail.map((s) => {
            const price = s.charge > 0 ? ` (+${naira(s.charge)})` : ' (free)'
            return `• ${s.label}${price} — ${s.eta}`
        })
        return `How soon do you need it?\n${lines.join('\n')}\nReply with one — or "standard" if you're not in a hurry.`
    },

    // One-line speed description for the confirm summary.
    _describeSpeed(speed, setting) {
        const map = {
            [DELIVERY_SPEED.SAME_DAY]: { label: 'Same-day', eta: 'ready today' },
            [DELIVERY_SPEED.EXPRESS]: { label: 'Express', eta: 'ready tomorrow' },
            [DELIVERY_SPEED.STANDARD]: { label: 'Standard', eta: 'ready in about 2 days' },
        }
        const d = map[speed] || map[DELIVERY_SPEED.STANDARD]
        const charge = this._speedCharge(speed, setting)
        return `${d.label}${charge > 0 ? ` (+${naira(charge)})` : ''} — ${d.eta}`
    },

    // Resolve a simple day phrase to a real Date (today / tomorrow / weekday);
    // returns null for anything we can't safely parse (the order still stores
    // the phrase-free fields and staff coordinate exact timing).
    _resolvePickupDate(phrase) {
        const p = String(phrase || '').toLowerCase()
        if (!p) return null
        const atNoon = (d) => {
            d.setHours(12, 0, 0, 0)
            return d
        }
        const now = new Date()
        if (/\btoday\b/.test(p)) return atNoon(new Date(now))
        if (/\bday after tomorrow\b|\bovermorrow\b/.test(p)) {
            const d = new Date(now)
            d.setDate(d.getDate() + 2)
            return atNoon(d)
        }
        if (/\btomorrow\b/.test(p)) {
            const d = new Date(now)
            d.setDate(d.getDate() + 1)
            return atNoon(d)
        }
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        for (let i = 0; i < 7; i++) {
            if (new RegExp(`\\b${days[i]}\\b`).test(p)) {
                const d = new Date(now)
                const diff = ((i - d.getDay() + 7) % 7) || 7
                d.setDate(d.getDate() + diff)
                return atNoon(d)
            }
        }
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
