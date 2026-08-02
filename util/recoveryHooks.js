// Fire-and-forget Recovery hooks (§6) — same philosophy as util/crmHooks.js:
// a downstream failure must never break the order flow.
const RecoveryService = require('../services/recovery.service')

// When an order is delivered, let Recovery auto-advance the linked complaint —
// but only for recovery orders (the service itself no-ops otherwise).
const recoveryOnOrderDelivered = (order) => {
    if (!order?.isRecoveryOrder) return
    RecoveryService.onRecoveryOrderDelivered(order).catch((err) =>
        console.warn('Recovery order-delivered hook failed (non-fatal):', err.message),
    )
}

module.exports = { recoveryOnOrderDelivered }
