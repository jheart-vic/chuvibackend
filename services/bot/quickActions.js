// Phase D quick-action chips. Each is { label, message } — tapping sends
// `message` back as the next customer message, so the whole existing pipeline
// handles it (no new action protocol). Extracted from botOrchestrator.service.js:
// the constants are imported back by the router (it still returns MAIN_QUICK_ACTIONS
// directly in a couple of places), and `mixin` (the context-aware chip picker) is
// Object.assign'd onto the orchestrator prototype so `this` usage is unchanged.
const MAIN_QUICK_ACTIONS = [
    { label: 'Book Laundry', message: 'I want to book a pickup' },
    { label: 'Track Order', message: 'where is my order' },
    { label: 'My Wallet', message: 'what is my wallet balance' },
    { label: 'My Offers', message: 'show my offers' },
    { label: 'Make Complaint', message: 'I have a complaint' },
    { label: 'Give Feedback', message: 'I want to give feedback' },
    { label: 'Talk To Staff', message: 'talk to a human' },
]

const YES_NO_ACTIONS = [
    { label: 'Yes', message: 'yes' },
    { label: 'No', message: 'no' },
]

const mixin = {
    // Context-aware chips for the turn. A confirm/offer step → Yes/No; a
    // mid-collection step → just an escape hatch; a completed answer → the main
    // menu; a handoff → none (they're being connected to a person).
    _quickActionsForTurn(result) {
        if (result.handoff) return []
        const step = result.state?.step
        if (!step) return MAIN_QUICK_ACTIONS
        if (/confirm/i.test(step) || step === 'offered-handoff') return YES_NO_ACTIONS
        if (step === 'collect-payment') {
            return [
                { label: 'Pay from wallet', message: 'wallet' },
                { label: 'Pay by card', message: 'card' },
            ]
        }
        if (step === 'collect-speed') {
            return [
                { label: 'Standard', message: 'standard' },
                { label: 'Express', message: 'express' },
                { label: 'Same-day', message: 'same-day' },
            ]
        }
        return [{ label: 'Talk To Staff', message: 'talk to a human' }]
    },
}

module.exports = { MAIN_QUICK_ACTIONS, YES_NO_ACTIONS, mixin }
