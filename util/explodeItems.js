// Per-piece explosion (client 2026-08-29): every PHYSICAL item is tracked and
// tagged individually, no matter how the catalog / pricing grouped it for booking
// convenience. A booked line of quantity N becomes N separate item records of
// quantity 1, preserving every other field (type, price, fromSet, …).
//
// IMPORTANT: pricing, subscription limits and capacity are all computed on the
// ORIGINAL booking lines (post.items) BEFORE this runs, so money and
// subscription/capacity accounting are unaffected — only the STORED physical
// items become per-piece. Run this on the order's items at creation time.
function explodeItemsToPieces(items) {
    if (!Array.isArray(items)) return items
    const pieces = []
    for (const raw of items) {
        const item =
            raw && typeof raw.toObject === 'function'
                ? raw.toObject()
                : { ...raw }
        // fresh piece records — let Mongoose assign a unique _id to each
        delete item._id
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1))
        for (let i = 0; i < qty; i++) {
            pieces.push({ ...item, quantity: 1 })
        }
    }
    return pieces
}

module.exports = { explodeItemsToPieces }
