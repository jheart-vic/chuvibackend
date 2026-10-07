// An audit row, activity row or notification is a RECORD of something that has
// already happened. It must never be able to turn a completed action into a
// reported failure.
//
// `createAuditLog` and `createNotification` both rethrow, and in this codebase
// they are called AFTER the data write. That shape produced three separate
// client-reported bugs in the 6 Oct brief: 2.5 ("cannot create plan" — the plan
// was created), 3.1 ("assigning a rider does not save" — it did), and 4.1
// ("saving a template always returns 400"). Wrap the record-keeping call and the
// outcome the operator is shown stays truthful.
//
// Returns the result on success, or null when the record-keeping failed.

async function logSafely(label, promise) {
    try {
        return await promise
    } catch (error) {
        console.error(`${label} failed (non-fatal):`, error?.message || error)
        return null
    }
}

module.exports = { logSafely }
