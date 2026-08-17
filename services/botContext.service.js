const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')

// ─── Phase A: conversation memory + natural-reference resolution ──────────────
//
// The in-app assistant has to talk like a person: it must remember what the
// customer is currently talking about and understand references such as "the
// usual", "same as last time", "same place", "go ahead", or a bare pronoun
// ("are THEY ready?"). This module owns that memory. It is pure plumbing —
// it reads existing records and the conversation's stored `botState.memory`,
// and never takes an action, quotes a price, or changes anything. The
// deterministic workflows (later phases) consume what it returns.
//
// Memory shape stored on `conversation.botState.memory`:
//   {
//     lastOrder:   { orderId, oscNumber, serviceType, serviceTier,
//                    deliverySpeed, items:[{type,quantity}], pickupAddress,
//                    status, at },   // snapshot of the order last referenced
//     lastIntent:  string,           // the intent handled on the previous turn
//     referent:    { kind, ... },    // what a pronoun / "go ahead" points to
//     updatedAt:   ISO string
//   }
class BotContextService {
    // The customer's most recent order (any status). Used to resolve "the
    // usual" / "same as last time" and to anchor pronouns like "are they ready?".
    async getLastOrder(userId) {
        return BookOrderModel.findOne({ userId }).sort({ createdAt: -1 }).lean()
    }

    // Compact, safe-to-store snapshot of an order — only descriptive fields, no
    // money and no authorization state.
    buildOrderSnapshot(order) {
        if (!order) return null
        return {
            orderId: String(order._id),
            oscNumber: order.oscNumber || null,
            serviceType: order.serviceType || null,
            serviceTier: order.serviceTier || null,
            deliverySpeed: order.deliverySpeed || null,
            items: (order.items || []).map((i) => ({
                type: i.type,
                quantity: Number(i.quantity) || 0,
            })),
            pickupAddress: order.pickupAddress || null,
            status: order.stage?.status || null,
            at: order.createdAt || null,
        }
    }

    // The customer's saved profile defaults, so the assistant can reuse a known
    // name / phone / pickup address instead of re-asking (doc §3 "check what
    // information already exists").
    async savedDefaults(userId) {
        const user = await UserModel.findById(userId)
            .select('fullName phoneNumber defaultPickupAddress')
            .lean()
        if (!user) return { fullName: null, phoneNumber: null, pickupAddress: null }
        return {
            fullName: user.fullName || null,
            phoneNumber: user.phoneNumber || null,
            pickupAddress: user.defaultPickupAddress || null,
        }
    }

    // Detect natural references in a message. Returns a set of booleans plus the
    // matched flavour — the caller decides what to do with them (Phase A only
    // surfaces them; later phases wire them into booking/status/etc.). Purely
    // lexical: it flags intent to reference, it does not fetch the target.
    detectReferent(text) {
        const t = String(text || '').toLowerCase()
        const has = (re) => re.test(t)
        return {
            // "the usual", "my usual", "as usual"
            theUsual: has(/\b(the|my|as)\s+usual\b/),
            // "same as last time/week/order", "same thing as before", "like last time"
            sameAsLast: has(
                /\b(same|like)\b.*\b(last|before|previous|usual)\b|\bdo the same\b|\bas (before|always)\b/,
            ),
            // "same place", "same address", "same location", "same spot"
            samePlace: has(/\bsame\s+(place|address|location|spot|pickup)\b/),
            // "go ahead", "yes do it", "proceed", "okay go on" — confirm-a-referent
            goAhead: has(
                /\b(go ahead|proceed|do it|carry on|go on|continue|okay go|ok go)\b/,
            ),
            // a bare pronoun standing in for the last order ("are they ready?",
            // "has it shipped?", "where are they?")
            pronoun: has(/\b(they|them|it|those|these|that one|the order)\b/),
        }
    }

    // Whether any natural reference is present at all.
    hasReferent(text) {
        const r = this.detectReferent(text)
        return r.theUsual || r.sameAsLast || r.samePlace || r.goAhead || r.pronoun
    }

    // Read the stored memory off a conversation (always an object).
    loadMemory(convo) {
        return (convo?.botState && convo.botState.memory) || {}
    }

    // Merge a patch into the conversation's stored memory and return the merged
    // object. Does NOT save — the orchestrator persists the conversation once
    // per turn (it already calls convo.save()). Mongoose needs the Mixed path
    // marked modified, so the caller reassigns botState.memory to this result.
    mergeMemory(convo, patch = {}) {
        const current = this.loadMemory(convo)
        return { ...current, ...patch, updatedAt: new Date().toISOString() }
    }
}

module.exports = new BotContextService()
