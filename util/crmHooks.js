// Fire-and-forget CRM hooks. Order/auth flows call these; failures are logged
// and can NEVER break the calling flow — same philosophy as util/notifyBot.js.
const CrmService = require('../services/crm.service')

const crmOnUserRegistered = (user) => {
    if (!user) return
    CrmService.handleUserRegistered(user).catch((err) =>
        console.warn('CRM user-registered hook failed (non-fatal):', err.message),
    )
}

const crmOnOrderCreated = (order) => {
    if (!order) return
    CrmService.handleOrderCreated(order).catch((err) =>
        console.warn('CRM order-created hook failed (non-fatal):', err.message),
    )
}

const crmOnOrderDelivered = (order) => {
    if (!order) return
    CrmService.handleOrderDelivered(order).catch((err) =>
        console.warn('CRM order-delivered hook failed (non-fatal):', err.message),
    )
}

// Order cancelled → let the CRM react (e.g. reactivation/nurture). The handler
// is optional for now (Phase 2), so this no-ops safely until CRM implements it.
const crmOnOrderCancelled = (order) => {
    if (!order) return
    if (typeof CrmService.handleOrderCancelled !== 'function') return
    CrmService.handleOrderCancelled(order).catch((err) =>
        console.warn('CRM order-cancelled hook failed (non-fatal):', err.message),
    )
}

module.exports = {
    crmOnUserRegistered,
    crmOnOrderCreated,
    crmOnOrderDelivered,
    crmOnOrderCancelled,
}
