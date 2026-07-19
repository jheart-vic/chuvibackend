// Fire-and-forget Offer System hooks — same philosophy as util/crmHooks.js:
// failures are logged and can NEVER break the calling flow.
const OfferService = require('../services/offer.service')

// A connected system reports an event; the Offer System finds and links the
// matching existing offer (or silently does nothing).
const offerOnTrigger = (trigger, payload) => {
    if (!trigger || !payload?.userId) return
    OfferService.handleTrigger(trigger, payload).catch((err) =>
        console.warn(
            `Offer trigger "${trigger}" hook failed (non-fatal):`,
            err.message,
        ),
    )
}

// Order delivered → attached offers become redeemed (and credit benefits pay out).
const offerOnOrderDelivered = (order) => {
    if (!order) return
    OfferService.redeemForOrder(order).catch((err) =>
        console.warn('Offer redeem hook failed (non-fatal):', err.message),
    )
}

module.exports = { offerOnTrigger, offerOnOrderDelivered }
