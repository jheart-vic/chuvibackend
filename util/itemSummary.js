// Readable item helpers. Order items are PER PIECE (one physical garment = one
// record, see util/explodeItems.js), so a count of records IS a count of pieces.
// Works for both Mongoose subdoc arrays and lean plain arrays.
//
// Extracted from handoff.service.js so the dispatch tag renders an order's
// contents with the exact same wording the handoff payloads use.

// Brief 4.6: the stored type is a slug ("Shirts-/-tops-/-blouses"). These briefs
// ARE the display payload for every station card, the dispatch tag and the
// handoff screens, so they carry the readable form — with rawType beside it for
// anything that needs the stored value.
const { prettifyName } = require('./displayName')

function itemBrief(items, id) {
    const it = (items || []).find((i) => String(i._id) === String(id))
    if (!it) return { itemId: String(id), name: 'Item', rawType: null, quantity: 1 }
    return {
        itemId: String(it._id),
        tagId: it.tagId || '',
        name: prettifyName(it.type),
        rawType: it.type,
        quantity: it.quantity || 1,
        // Care tier for this piece — the brief asks for the tier to show on the
        // item's tag and on its card at every station (6 Oct 2026, item 1.6).
        // null means the piece follows the order's tier.
        serviceTier: it.serviceTier || null,
    }
}

function briefsForIds(items, ids) {
    return (ids || []).map((id) => itemBrief(items, id))
}

// Every item in the list, as briefs — for whole-order payloads.
function briefsForAll(items) {
    return (items || []).map((it) => ({
        itemId: String(it._id),
        tagId: it.tagId || '',
        name: prettifyName(it.type),
        rawType: it.type,
        quantity: it.quantity || 1,
        serviceTier: it.serviceTier || null,
    }))
}

// "5 Shirts, 3 Trousers" — groups briefs by name, sums the piece counts, and
// capitalises each name for display (types are often stored lower-case).
function summarize(briefs) {
    const counts = {}
    for (const b of briefs || []) {
        const name = b.name || 'Item'
        counts[name] = (counts[name] || 0) + (b.quantity || 1)
    }
    return Object.entries(counts)
        .map(([name, c]) => {
            // prettifyName also handles a raw slug, so this reads the same whether
            // the brief came from itemBrief (already readable) or a caller that
            // built its own list from the stored type.
            const label = prettifyName(name) || 'Item'
            return `${c} ${c > 1 && !/s$/i.test(label) ? `${label}s` : label}`
        })
        .join(', ')
}

// Total pieces across briefs (quantity is 1 per record post-explosion, but a
// legacy un-exploded order can still carry qty > 1).
function countPieces(briefs) {
    return (briefs || []).reduce((n, b) => n + (b.quantity || 1), 0)
}

module.exports = {
    itemBrief,
    briefsForIds,
    briefsForAll,
    summarize,
    countPieces,
}
