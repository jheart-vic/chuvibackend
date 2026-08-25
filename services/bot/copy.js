// Fixed, LLM-free canned text for the in-app bot (guides, acknowledgements,
// the capabilities sentence, identity + fallback replies). Extracted verbatim
// from botOrchestrator.service.js and mixed onto its prototype, so the internal
// this.capabilities() cross-calls keep working unchanged. Pure strings — no
// state, models, or network.
module.exports = {
    bookingGuide() {
        return (
            "Let's get your laundry booked — here's how:\n" +
            '1) Service: Wash & Iron, Wash Only, Iron Only, or Dry Clean\n' +
            '2) Pickup address, date and time\n' +
            '3) Items to include\n' +
            '4) Delivery speed (standard, same-day or express)\n' +
            "Open the *Book Order* screen in the app and I'll have those ready — it shows your exact quote before you confirm. " +
            'Want me to connect you to a person for help? Just say "talk to someone".'
        )
    },

    feedbackAck() {
        return "Thank you for the feedback — I've logged it for our team. Anything else I can help with?"
    },

    // Single source of truth for the capabilities sentence, reused by the menu,
    // the identity reply, and the fixed fallback.
    capabilities() {
        return (
            'answer questions about prices, services and turnaround, book a pickup, check your order status and payment, ' +
            'pay an order from your wallet, see your wallet balance, view offers, get your referral code/level and reward status, ' +
            'apply a referral code, log a complaint or feedback, or update your phone/pickup address'
        )
    },

    menu() {
        return (
            `I can help you: ${this.capabilities()}. ` +
            "For anything else I'll connect you to a person. What would you like?"
        )
    },

    // "who/what are you" — deterministic identity reply (always works, even when
    // the LLM is unavailable).
    aboutBot() {
        return (
            "I'm the Chuvi Laundry assistant — a smart in-app helper. " +
            `I can ${this.capabilities()}. ` +
            "For anything I can't handle, I'll connect you to a real person. How can I help?"
        )
    },

    // Fixed, LLM-free fallback for out-of-scope / when the assistant can't answer
    // (e.g. the LLM is down). Never depends on the model.
    cantUnderstand() {
        return (
            "Sorry — I can't quite answer or understand that. " +
            `Here's what I can help you with: ${this.capabilities()}. ` +
            "For anything else I'll connect you to a person. What would you like to do?"
        )
    },
}
