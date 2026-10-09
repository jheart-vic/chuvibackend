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

// Stored lower-case acronyms that must read as acronyms. Without this, the care
// tier `vip` renders as "Vip" on every card that uses this helper — the rule
// below only PRESERVES an acronym that is already upper-case in the stored
// value, and these are not.
const ACRONYMS = new Set(['vip', 'qc', 'sms', 'id', 'osc'])

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
            // …and upper-case one that was STORED lower-case, so the care tier
            // `vip` does not read "Vip" on every card.
            if (ACRONYMS.has(lower)) return lower.toUpperCase()
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

/**
 * ADMIN-RENAMED LABELS for delivery speeds, service types and care tiers
 * (client spec 2026-10-07: "display name only").
 *
 * Resolution order, and each step matters:
 *   1. the admin's own override from `AdminSetting.displayNames`;
 *   2. otherwise `prettifyName` of the stored value, which is what every screen
 *      already showed;
 *   3. and the RAW value always travels beside the label, because pricing, the
 *      enums and every query still match on it. A caller that needs the
 *      identifier must never have to un-prettify a label to get it back.
 *
 * `group` is 'deliverySpeeds' | 'serviceTypes' | 'serviceTiers'.
 */
function resolveLabel(group, value, displayNames) {
    const raw = String(value ?? '')
    if (!raw) return { value: raw, label: '' }

    const bucket = displayNames?.[group]
    let override = null
    if (bucket) {
        // Tolerant of a Mongoose Map and of a plain object, because a lean()
        // read gives one and a hydrated document gives the other.
        override =
            typeof bucket.get === 'function' ? bucket.get(raw) : bucket[raw]
    }

    return {
        value: raw,
        label: override ? String(override) : prettifyName(raw),
        // True when an admin has renamed it, so a settings screen can show
        // which labels are custom and which are derived.
        renamed: Boolean(override),
    }
}

/** Every label for one settings document, ready for a screen to render. */
function labelMap(adminSetting, { speeds = [], types = [], tiers = [] } = {}) {
    const d = adminSetting?.displayNames
    return {
        deliverySpeeds: speeds.map((v) => resolveLabel('deliverySpeeds', v, d)),
        serviceTypes: types.map((v) => resolveLabel('serviceTypes', v, d)),
        serviceTiers: tiers.map((v) => resolveLabel('serviceTiers', v, d)),
    }
}

module.exports = {
    prettifyName,
    stationLabel,
    STATION_LABELS,
    resolveLabel,
    labelMap,
}
