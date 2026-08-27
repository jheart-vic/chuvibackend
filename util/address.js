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

module.exports = { normalizeAddress, validateStructuredAddress }
