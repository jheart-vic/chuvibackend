// Customer booking items, priced from the CATALOG, never from the request.
//
// The booking used to trust each item's `price` from the body, so
// `items: [{ type: "blanket", price: 100 }]` booked a ₦100 laundry bill — the
// same hole as sending `amount: 100`. It also copied every field of each item
// onto the stored pieces, so a customer could book pieces already marked
// `qcStatus: "passed"` or `tagStatus: "complete"`.
//
// MATCHING. The customer app sends a slug of the catalog name
// ("shirts-/-tops-/-blouses" for "Shirts / Tops / Blouses", "lab-coats" for
// "Lab coats"), older builds and the assistant send the name itself, and set
// pieces arrive as `{ type: "agbada", fromSet: "Agbada" }`. Both sides are
// compared lowercased with whitespace runs turned into one hyphen, which matched
// every customer item line in production over the 14 days before this change,
// at exactly the catalog price. `type` is kept as sent, so nothing downstream
// that reads it changes.

// The item fields a customer may set. Every other field (station, QC, tag,
// sort, hold, notes…) belongs to the staff stations.
const CUSTOMER_ITEM_FIELDS = ['type', 'quantity', 'serviceTier', 'fromSet']

// The most pieces one booking may hold — the Quick Booking ceiling.
const { MAX_QUICK_BOOKING_PIECES: MAX_BOOKING_PIECES } = require('./quickBooking')

const catalogKey = (s) =>
    String(s ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')

/**
 * Re-price customer booking items from the catalog.
 *
 * @param {Array} items    the request's items
 * @param {Array} catalog  OrderItem documents ({ name, price })
 * @param {Array} sets     ItemSet documents ({ name, pieces: [{ name, price }] })
 * @returns {{ ok: true, items } | { ok: false, error, unknown }}
 */
function priceFromCatalog(items, { catalog = [], sets = [] } = {}) {
    // Whole naira (the booking validator requires an integer price). The first
    // entry wins if two catalog names normalise to the same key.
    const naira = (n) => Math.round(Number(n))
    const single = new Map()
    for (const c of catalog) {
        const key = catalogKey(c.name)
        if (!single.has(key)) single.set(key, naira(c.price))
    }
    const setPieces = new Map()
    for (const s of sets) {
        if (s.active === false) continue // a deactivated set cannot be booked
        for (const p of s.pieces || []) {
            const key = `${catalogKey(s.name)}::${catalogKey(p.name)}`
            if (!setPieces.has(key)) setPieces.set(key, naira(p.price))
        }
    }

    // A quantity of 0 or less priced the line at zero or below while still
    // storing a piece (review F-21): a whole number of at least 1, always.
    let pieces = 0
    for (const raw of items || []) {
        const q = Number(raw?.quantity)
        if (!Number.isInteger(q) || q < 1) {
            return {
                ok: false,
                unknown: [],
                error: 'Each item needs a whole-number quantity of at least 1.',
            }
        }
        pieces += q
    }
    // Every piece becomes its own stored record, so an unbounded quantity
    // (100,000,000) exhausted memory and took the server down (review F-26).
    // The same ceiling as a Quick Booking.
    if (pieces > MAX_BOOKING_PIECES) {
        return {
            ok: false,
            unknown: [],
            // Client's exact words, 12 Oct 2026 (the cap stays at 200).
            error: 'For more than 200 pieces, call or WhatsApp us on +234 707 325 4943 and we will plan it with you.',
        }
    }

    const unknown = []
    const priced = (items || []).map((raw) => {
        const item = {}
        for (const k of CUSTOMER_ITEM_FIELDS) {
            if (raw?.[k] !== undefined) item[k] = raw[k]
        }
        item.quantity = Number(item.quantity)
        const key = catalogKey(item.type)
        const price = item.fromSet
            ? setPieces.get(`${catalogKey(item.fromSet)}::${key}`)
            : single.get(key)
        if (!Number.isFinite(price)) {
            unknown.push(item.fromSet ? `${item.type} (${item.fromSet})` : String(item.type ?? ''))
            return item
        }
        return { ...item, price }
    })

    if (unknown.length) {
        return {
            ok: false,
            unknown,
            error: `We don't recognise ${unknown.map((u) => `"${u}"`).join(', ')}. Please refresh the app and pick ${unknown.length > 1 ? 'them' : 'it'} from the list.`,
        }
    }
    return { ok: true, items: priced }
}

module.exports = { CUSTOMER_ITEM_FIELDS, MAX_BOOKING_PIECES, catalogKey, priceFromCatalog }
