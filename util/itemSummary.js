// Readable item helpers. Order items are PER PIECE (one physical garment = one
// record, see util/explodeItems.js), so a count of records IS a count of pieces.
// Works for both Mongoose subdoc arrays and lean plain arrays.
//
// Extracted from handoff.service.js so the dispatch tag renders an order's
// contents with the exact same wording the handoff payloads use.

function itemBrief(items, id) {
    const it = (items || []).find((i) => String(i._id) === String(id))
    if (!it) return { itemId: String(id), name: 'Item', quantity: 1 }
    return {
        itemId: String(it._id),
        tagId: it.tagId || '',
        name: it.type,
        quantity: it.quantity || 1,
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
        name: it.type,
        quantity: it.quantity || 1,
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
            const label = name.charAt(0).toUpperCase() + name.slice(1)
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
