// Fire-and-forget Referral System hooks — same philosophy as util/crmHooks.js:
// failures are logged and can NEVER break the calling flow.
const ReferralService = require('../services/referral.service')

// Give every new customer their permanent referral code.
const referralOnUserRegistered = (user) => {
    if (!user) return
    ReferralService.ensureCode(user).catch((err) =>
        console.warn('Referral code hook failed (non-fatal):', err.message),
    )
}

// Capture a referral when a new customer registered/booked with a code.
const referralOnReferralCode = (referredUserId, code, source) => {
    if (!referredUserId || !code) return
    ReferralService.captureReferral({ referredUserId, code, source }).catch((err) =>
        console.warn('Referral capture hook failed (non-fatal):', err.message),
    )
}

// Referred customer placed their first order.
const referralOnOrderCreated = (order) => {
    if (order?.isRecoveryOrder) return // §6: recovery orders aren't real orders
    if (!order) return
    ReferralService.handleReferredOrderCreated(order).catch((err) =>
        console.warn('Referral order-created hook failed (non-fatal):', err.message),
    )
}

// Referred customer's order delivered → reward the referrer (if it's the first).
const referralOnOrderDelivered = (order) => {
    if (order?.isRecoveryOrder) return // §6: don't reward on recovery orders
    if (!order) return
    ReferralService.handleReferredOrderDelivered(order).catch((err) =>
        console.warn('Referral order-delivered hook failed (non-fatal):', err.message),
    )
}

// The referred customer's first order was refunded IN FULL → take the
// referrer's reward back (client 2026-10-08 §4.3). A partial refund keeps it,
// which is why `fullRefund` must be passed explicitly rather than assumed.
const referralOnOrderRefunded = (order, { fullRefund, performedBy } = {}) => {
    if (!order?._id) return
    ReferralService.reverseRewardForRefundedOrder(order._id, {
        fullRefund,
        performedBy,
    }).catch((err) =>
        console.warn('Referral reversal hook failed (non-fatal):', err.message),
    )
}

// A referrer's eligibility was restored (complaint resolved) → release deferred rewards.
const referralOnEligibilityRestored = (userId) => {
    if (!userId) return
    ReferralService.processDeferredRewards(userId).catch((err) =>
        console.warn('Referral deferred-reward hook failed (non-fatal):', err.message),
    )
}

module.exports = {
    referralOnUserRegistered,
    referralOnReferralCode,
    referralOnOrderCreated,
    referralOnOrderDelivered,
    referralOnOrderRefunded,
    referralOnEligibilityRestored,
}
