// §3: personalised deep links for outbound messages (SMS/WhatsApp/email).
// The link points at the customer-facing app; login-gated pages rely on the
// app's auth guard to send the customer to login first and then back to this
// exact path (so "after login, redirect to the exact page/order" just works).
//
// All routes live HERE, in one place, so the frontend paths can be corrected
// without hunting through services. Override the base per-environment with
// CLIENT_URL; falls back to the production frontend (same convention as
// REFERRAL_BASE_URL). API base is API_URL when needed elsewhere.
const CLIENT_URL = (process.env.CLIENT_URL || 'https://www.chuvilaundry.com').replace(
    /\/+$/,
    '',
)

// notification `page` key → frontend route builder. Keys are the exact values
// already passed as `page:` by the offer/wallet/recovery/referral systems
// (wallet, offers, referral, complaint) plus order/feedback for completeness.
const PAGE_ROUTES = {
    wallet: () => '/wallet',
    offers: () => '/offers',
    referral: () => '/referral',
    complaint: (id) => (id ? `/complaints/${id}` : '/complaints'),
    order: (id) => (id ? `/orders/${id}` : '/orders'),
    feedback: (id) => (id ? `/feedback/${id}` : '/feedback'),
}

const clientUrl = () => CLIENT_URL

// Absolute deep link for a notification `page` (+ optional record id). Unknown
// page keys are treated as a literal path. Returns null when no page is given.
const deepLink = (page, recordId) => {
    if (!page) return null
    const builder = PAGE_ROUTES[page]
    const path = builder
        ? builder(recordId)
        : page.startsWith('/')
          ? page
          : `/${page}`
    return `${CLIENT_URL}${path}`
}

// Personalised registration link for a lead (no account yet). Prefills the
// phone so the signup form can attribute the lead. Reuses the same signup route
// as referral links (REFERRAL_BASE_URL) for consistency.
const registerLink = ({ phone } = {}) => {
    const base = process.env.REFERRAL_BASE_URL || `${CLIENT_URL}/auth/signup`
    if (!phone) return base
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}phone=${encodeURIComponent(phone)}`
}

module.exports = { clientUrl, deepLink, registerLink, PAGE_ROUTES }
