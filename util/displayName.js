// Brief 4.6 — "names shown as code text".
//
// Item types and station names are STORED as slugs: "Shirts-/-tops-/-blouses",
// "Blazers-/-jackets-/-hoodie", "intake-and-tag-station". Some payloads passed
// the slug straight through while others ran it through a capitaliser, so two
// cards on the same screen showed the same thing two different ways.
//
// These are DISPLAY helpers only. The stored slug stays the identifier — pricing,
// catalog lookups and the station enums all still match on it — so anything that
// needs the raw value keeps getting it beside the label.

// Words that should not be title-cased in the middle of a name.
const SMALL_WORDS = new Set(['and', 'or', 'of', 'the', 'with', 'per'])

// "Shirts-/-tops-/-blouses" → "Shirts / Tops / Blouses"
// "blazers_jackets-hoodie" → "Blazers Jackets Hoodie"
// "duvet (king)" → "Duvet (King)"
function prettifyName(raw) {
    const s = String(raw ?? '').trim()
    if (!s) return ''
    // Separators first: a slug uses - and _ for spaces, and "-/-" for a real slash.
    const spaced = s
        .replace(/\s*-?\/-?\s*/g, ' / ') // -/- or / → " / "
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    return spaced
        .split(' ')
        .map((word, i) => {
            if (word === '/') return word
            const lower = word.toLowerCase()
            // Keep an already-capitalised acronym as it is (QC, VIP, SMS).
            if (word.length <= 3 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
                return word
            }
            if (i > 0 && SMALL_WORDS.has(lower)) return lower
            // Title-case the first letter, including after an opening bracket.
            return lower.replace(/^(\(*)([a-z])/, (_, b, c) => b + c.toUpperCase())
        })
        .join(' ')
}

// The station labels staff actually use, rather than the enum value. Anything not
// listed falls back to prettifying the slug with the "-station" suffix dropped.
const STATION_LABELS = {
    'intake-and-tag-station': 'Intake & Tag',
    'sort-and-pretreat-station': 'Sort & Pretreat',
    'wash-and-dry-station': 'Wash & Dry',
    'pressing-and-ironing-station': 'Press & Iron',
    'qc-station': 'Quality Control',
    'admin-station': 'Admin',
    'rider-station': 'Rider',
    pending: 'Pending',
}

function stationLabel(raw) {
    const key = String(raw ?? '').trim().toLowerCase()
    if (!key) return ''
    if (STATION_LABELS[key]) return STATION_LABELS[key]
    return prettifyName(key.replace(/-station$/, ''))
}

module.exports = { prettifyName, stationLabel, STATION_LABELS }
