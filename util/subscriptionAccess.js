// Subscription rules shared by booking, the bot, the dashboard, the webhooks and
// the nightly reconcile (build-plan feature 21, client rules 2026-10-10/11).
//
// - Rollover: at each renewal the items left carry over, capped at HALF the
//   plan's monthly items, rounded down. A failed renewal keeps them only if it
//   is paid within 7 days of the first failed payment.
// - A cancelled plan stays usable until the month the customer paid for ends
//   (`currentPeriodEnd`); after that it expires with nothing carried.
const SubscriptionModel = require('../models/subscription.model')

const GRACE_MS = 7 * 24 * 60 * 60 * 1000

/** How many items a renewal carries into the new month. */
function carriedItems({ remainingItems, monthlyLimits, status, failedAt, paidAt }) {
    const cap = Math.floor((Number(monthlyLimits) || 0) / 2)
    if (status === 'failed' && failedAt && new Date(paidAt) - new Date(failedAt) > GRACE_MS) return 0
    return Math.min(Math.max(Number(remainingItems) || 0, 0), cap)
}

/** Can this plan be booked against right now? */
function isUsable(sub, now = new Date()) {
    if (!sub) return false
    if (sub.status === 'active') return true
    return sub.status === 'cancelled' && !!sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now
}

const usableFilter = (userId, now = new Date()) => ({
    userId,
    $or: [{ status: 'active' }, { status: 'cancelled', currentPeriodEnd: { $gt: now } }],
})

/**
 * The customer's usable plan: the newest record that is active, or cancelled
 * with its paid month not yet over. One rule for every place that asks.
 */
function findUsableSubscription(userId, { populate = false, lean = false } = {}) {
    let q = SubscriptionModel.findOne(usableFilter(userId)).sort({ createdAt: -1 })
    if (populate) q = q.populate('planId')
    if (lean) q = q.lean()
    return q
}

// Paystack's subscription statuses → ours. Anything unknown is left as it is,
// so a new Paystack status can never fail the save (the old copy-as-is threw
// on `non-renewing` and aborted the whole nightly loop).
const PAYSTACK_STATUS_MAP = Object.freeze({
    active: 'active',
    'non-renewing': 'cancelled',
    attention: 'failed',
    complete: 'cancelled',
    completed: 'cancelled',
    cancelled: 'cancelled',
})

// ── A failed renewal: what the customer is told (client 2026-10-14) ─────────
// "Tell the customer the moment a renewal fails. Send an SMS and show a banner
// on My Plan … Send a reminder SMS on day 5, two days before the deadline."
// SMS rules: no dashes, N instead of the naira sign (no amounts here anyway).

/** The last moment re-subscribing to the same plan still keeps the items. */
const keepItemsBy = (failedAt) => (failedAt ? new Date(new Date(failedAt).getTime() + GRACE_MS) : null)
const dayText = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
/**
 * The items the customer would KEEP by re-subscribing: their unused items,
 * capped at half the plan (rule 1). Review F-100: the texts promised the raw
 * unused count ("keep your 20") while re-subscribing keeps at most 12 of a
 * 25-item plan. Without the plan size, falls back to the unused count.
 */
const unusedItems = (sub, monthlyLimits = null) => {
    const left = Math.max(Number(sub?.remainingItems) || 0, 0)
    return Number.isFinite(Number(monthlyLimits)) && monthlyLimits != null
        ? Math.min(left, Math.floor(Number(monthlyLimits) / 2))
        : left
}

/** The banner (and SMS) sentence: "Subscribe again by <date> to keep your <X> unused items." */
function renewalFailedMessage(sub, monthlyLimits = null) {
    const by = keepItemsBy(sub?.failedAt)
    const items = unusedItems(sub, monthlyLimits)
    if (!by || items <= 0) return "Your plan renewal didn't go through. Subscribe again to keep using your plan."
    return `Your plan renewal didn't go through. Subscribe again by ${dayText(by)} to keep your ${items} unused ${items === 1 ? 'item' : 'items'}.`
}

/** What My Plan needs for the banner, or null when there is nothing to show. */
function renewalFailedBanner(sub, now = new Date(), monthlyLimits = null) {
    if (!sub || sub.status !== 'failed' || !sub.failedAt) return null
    const by = keepItemsBy(sub.failedAt)
    return {
        planId: sub.planId?._id || sub.planId,
        failedAt: sub.failedAt,
        keepItemsBy: by,
        unusedItems: by > now ? unusedItems(sub, monthlyLimits) : 0,
        message: by > now ? renewalFailedMessage(sub, monthlyLimits) : "Your plan renewal didn't go through. Subscribe again to keep using your plan.",
    }
}

const renewalFailedSms = (sub, monthlyLimits = null) => `Chuvi: ${renewalFailedMessage(sub, monthlyLimits)}`
const renewalReminderSms = (sub, monthlyLimits = null) => {
    const n = unusedItems(sub, monthlyLimits)
    return `Chuvi reminder: 2 days left. Subscribe again by ${dayText(keepItemsBy(sub.failedAt))} to keep your ${n} unused ${n === 1 ? 'item' : 'items'}.`
}

module.exports = {
    GRACE_MS, carriedItems, isUsable, usableFilter, findUsableSubscription, PAYSTACK_STATUS_MAP,
    keepItemsBy, unusedItems, renewalFailedMessage, renewalFailedBanner, renewalFailedSms, renewalReminderSms,
}
