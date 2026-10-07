// Structured order address {label, address, landmark}. Tolerant: accepts a
// legacy plain string (older orders / customer + bot paths) or the structured
// object, and always returns the structured shape.

function normalizeAddress(input) {
    if (input == null) return undefined
    if (typeof input === 'string') {
        const address = input.trim()
        return address ? { label: '', address, landmark: '' } : undefined
    }
    if (typeof input === 'object') {
        const label = String(input.label || '').trim()
        const address = String(input.address || '').trim()
        const landmark = String(input.landmark || '').trim()
        return address || label || landmark
            ? { label, address, landmark }
            : undefined
    }
    return undefined
}

// Staff intake requires all three fields. Returns { ok, error }.
function validateStructuredAddress(input, field = 'pickupAddress') {
    const a = normalizeAddress(input)
    if (!a || !a.address) return { ok: false, error: `${field}.address is required` }
    if (!a.label) return { ok: false, error: `${field}.label is required` }
    if (!a.landmark) return { ok: false, error: `${field}.landmark is required` }
    return { ok: true, value: a }
}

// Brief 3.3 — the customer booking path only ever required `address`, so a
// customer-placed order usually reached the rider with no landmark at all, while
// staff intake (validateStructuredAddress) demanded all three. The customer's
// SAVED addresses do carry a landmark (it is required on user.addresses), so when
// a booking's address matches one of them, borrow its landmark and label instead
// of sending the rider out without one. Making landmark mandatory on the customer
// path would be a breaking change for the live app, so this recovers it silently
// and `landmarkMissing` on the dispatch rows shows what is still genuinely blank.
const addressKey = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/[\s,.-]+/g, ' ')
        .trim()

function enrichFromSavedAddresses(input, savedAddresses) {
    const a = normalizeAddress(input)
    if (!a || !a.address) return a
    if (a.landmark && a.label) return a

    const match = (savedAddresses || []).find(
        (s) => addressKey(s?.address) === addressKey(a.address),
    )
    if (!match) return a

    return {
        label: a.label || String(match.label || '').trim(),
        address: a.address,
        landmark: a.landmark || String(match.landmark || '').trim(),
    }
}

module.exports = {
    normalizeAddress,
    validateStructuredAddress,
    enrichFromSavedAddresses,
}
