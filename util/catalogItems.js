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
    const single = new Map(catalog.map((c) => [catalogKey(c.name), Number(c.price)]))
    const setPieces = new Map()
    for (const s of sets) {
        for (const p of s.pieces || []) {
            setPieces.set(`${catalogKey(s.name)}::${catalogKey(p.name)}`, Number(p.price))
        }
    }

    const unknown = []
    const priced = (items || []).map((raw) => {
        const item = {}
        for (const k of CUSTOMER_ITEM_FIELDS) {
            if (raw?.[k] !== undefined) item[k] = raw[k]
        }
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

module.exports = { CUSTOMER_ITEM_FIELDS, catalogKey, priceFromCatalog }
