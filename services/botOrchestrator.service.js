const ConversationService = require('./conversation.service')
const BotIntentService = require('./botIntent.service')
const BotContextService = require('./botContext.service')
const ReferralService = require('./referral.service')
const OfferService = require('./offer.service')
const WalletModel = require('../models/wallet.model')
const WalletCreditModel = require('../models/walletCredit.model')
const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const createNotification = require('../util/createNotification')
const { emitChatMessage } = require('../config/socket')
const {
    BOT_INTENT,
    CHAT_SENDER,
    CREDIT_STATUS,
    CONVERSATION_TYPE,
    NOTIFICATION_TYPE,
} = require('../util/constants')

const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`

// Read-only informational intents that are safe to batch in one message
// (a compound request like "my balance and order status"). Actions and
// multi-turn flows are never batched.
const READ_ONLY_INFO = [
    BOT_INTENT.ORDER_STATUS,
    BOT_INTENT.WALLET_BALANCE,
    BOT_INTENT.VIEW_OFFERS,
    BOT_INTENT.REFERRAL_INFO,
]

// Section icons for a combined compound-request reply (scannability).
const INTENT_ICON = {
    [BOT_INTENT.ORDER_STATUS]: '📦',
    [BOT_INTENT.WALLET_BALANCE]: '💰',
    [BOT_INTENT.VIEW_OFFERS]: '🎁',
    [BOT_INTENT.REFERRAL_INFO]: '👥',
}

// The deterministic brain of the in-app bot. The LLM only labels intent
// (botIntent.service); everything here follows the EXISTING system rules and
// can only perform the client-approved low-risk actions. High-risk requests
// have no code path other than handing off to a human. Never invents policy.
class BotOrchestratorService {
    // Actions the bot is allowed to complete on its own. Anything not here
    // (refunds, compensation approval, credit edits, resolving complaints,
    // overriding eligibility, record edits, policy) has no workflow — it can
    // only reach a human via handoff.
    get allowedIntents() {
        return [
            BOT_INTENT.GREETING,
            BOT_INTENT.ABOUT,
            BOT_INTENT.ORDER_STATUS,
            BOT_INTENT.WALLET_BALANCE,
            BOT_INTENT.VIEW_OFFERS,
            BOT_INTENT.REFERRAL_INFO,
            BOT_INTENT.APPLY_REFERRAL_CODE,
            BOT_INTENT.UPDATE_DETAILS,
            BOT_INTENT.BOOKING_GUIDE,
            BOT_INTENT.SUBMIT_FEEDBACK,
        ]
    }

    // Entry point: customer sends a message, we reply (or hand off).
    async handleCustomerMessage({ userId, text, attachments = [] }) {
        const convo = await ConversationService.getOrCreateSupport(userId)

        // record the customer's message (increments unreadForStaff for CX).
        // Attachments (photo URLs) ride along; intent is still classified from
        // text only, so a photo-only message degrades to the guided menu.
        const customerMsg = await ConversationService.postMessage({
            conversationId: convo._id,
            senderType: CHAT_SENDER.CUSTOMER,
            senderId: userId,
            text,
            attachments,
        })
        emitChatMessage(convo, customerMsg)

        // already with a human — the bot stays silent, staff will reply
        if (convo.mode === 'human') {
            return { conversation: convo, handledBy: 'human', replies: [] }
        }

        const pendingIntent = convo.botState?.intent || null
        const pendingStep = convo.botState?.step || null
        const { intent, intents, confidence, slots } = await BotIntentService.classify(text, {
            pendingIntent,
        })
        const escalationIntents = [BOT_INTENT.TALK_TO_HUMAN, BOT_INTENT.FILE_COMPLAINT]
        const mergedSlots = { ...(convo.botState?.slots || {}), ...slots }

        // Resolve a natural place reference ("same place as last time") into a
        // concrete address from memory / saved defaults, so downstream flows get
        // a real value instead of the word "same". Memory-only — never invents.
        await this._resolveAddressRef({ convo, userId, slots: mergedSlots })

        // A) A pending "…would you like a person?" offer (from a delayed-order
        //    reply): a yes hands off; anything else drops the offer and the new
        //    message is handled normally.
        if (pendingStep === 'offered-handoff') {
            if (this.isAffirmative(text)) {
                return this._runSingle({
                    convo, userId, text, intent: BOT_INTENT.TALK_TO_HUMAN, confidence, slots: mergedSlots,
                })
            }
            return this._runSingle({ convo, userId, text, intent, confidence, slots: mergedSlots })
        }

        // B) Compound request → answer each read-only info intent in turn. Never
        //    when mid-flow or when escalation is the primary intent.
        const batch = [...new Set((intents || []).filter((i) => READ_ONLY_INFO.includes(i)))]
        if (!pendingStep && !escalationIntents.includes(intent) && batch.length >= 2) {
            // Collect each answer, then send as ONE cohesive message (not stapled
            // bubbles). Only the wrapper is templated — the data stays deterministic.
            const sections = []
            for (const it of batch) {
                const r = await this.runWorkflow({
                    convo, userId, text, intent: it, confidence, slots: mergedSlots, batch: true,
                })
                const body = (r.replies || []).filter(Boolean).join('\n')
                if (body) sections.push(`${INTENT_ICON[it] ? INTENT_ICON[it] + ' ' : ''}${body}`)
            }
            convo.botState = {
                intent: null,
                step: null,
                slots: {},
                memory: await this._updateMemory(convo, userId, batch[0]),
            }
            convo.markModified('botState')
            await convo.save()
            const combined =
                sections.length > 1
                    ? `Here's what I found:\n\n${sections.join('\n\n')}`
                    : sections[0] || this.cantUnderstand()
            const msg = await this.say(convo, combined)
            return { conversation: convo, handledBy: 'bot', intent: batch.join('+'), replies: [msg] }
        }

        // C) Single intent. Escalation always wins; otherwise continue a genuinely
        //    mid-step flow (guards the always-0.4 keyword fallback from trapping
        //    the customer in a previous flow).
        let effectiveIntent = intent
        if (!escalationIntents.includes(intent)) {
            const continuesFlow =
                pendingIntent &&
                pendingStep &&
                (confidence < 0.6 || intent === BOT_INTENT.UNKNOWN)
            if (continuesFlow) effectiveIntent = pendingIntent
        }
        return this._runSingle({ convo, userId, text, intent: effectiveIntent, confidence, slots: mergedSlots })
    }

    // Run one intent's workflow, persist multi-turn state, post replies, hand off.
    async _runSingle({ convo, userId, text, intent, confidence, slots }) {
        const result = await this.runWorkflow({ convo, userId, text, intent, confidence, slots })
        // Preserve long-lived memory across the per-turn botState reset — the
        // workflow only returns intent/step/slots, never memory.
        const memory = await this._updateMemory(convo, userId, intent)
        convo.botState = {
            ...(result.state || { intent: null, step: null, slots: {} }),
            memory,
        }
        convo.markModified('botState')
        await convo.save()

        const posted = []
        for (const reply of result.replies || []) {
            posted.push(await this.say(convo, reply))
        }
        if (result.handoff) await this.handoff(convo, userId)

        return {
            conversation: convo,
            handledBy: result.handoff ? 'handoff' : 'bot',
            intent,
            replies: posted,
        }
    }

    async runWorkflow({ convo, userId, text, intent, confidence, slots, batch = false }) {
        // low confidence and nothing in flight → out-of-scope: a friendly LLM
        // redirect (falls back to the plain menu when the LLM is unavailable).
        if (
            (confidence < 0.35 && !convo.botState?.intent) ||
            intent === BOT_INTENT.UNKNOWN
        ) {
            const reply = await BotIntentService.smallTalkReply(text, {
                kind: 'outOfScope',
                fallback: this.cantUnderstand(),
            })
            return { replies: [reply] }
        }

        switch (intent) {
            case BOT_INTENT.GREETING: {
                const reply = await BotIntentService.smallTalkReply(text, {
                    kind: 'greeting',
                    fallback: `Hi! I'm the Chuvi assistant. ${this.menu()}`,
                })
                return { replies: [reply] }
            }
            case BOT_INTENT.ABOUT:
                return { replies: [this.aboutBot()] }
            case BOT_INTENT.ORDER_STATUS:
                return await this.orderStatusReply(userId, slots, text, {
                    allowHandoffOffer: !batch,
                })
            case BOT_INTENT.WALLET_BALANCE:
                return { replies: [await this.walletBalance(userId)] }
            case BOT_INTENT.VIEW_OFFERS:
                return { replies: [await this.viewOffers(userId)] }
            case BOT_INTENT.REFERRAL_INFO:
                return { replies: [await this.referralInfo(userId)] }
            case BOT_INTENT.APPLY_REFERRAL_CODE:
                return await this.applyReferralCode(userId, text, slots)
            case BOT_INTENT.UPDATE_DETAILS:
                return await this.updateDetails(userId, text, slots, convo.botState?.step)
            case BOT_INTENT.BOOKING_GUIDE:
                return { replies: [this.bookingGuide()] }
            case BOT_INTENT.SUBMIT_FEEDBACK:
                return { replies: [this.feedbackAck()] }
            case BOT_INTENT.FILE_COMPLAINT:
                // Empathetic apology only — handoff() adds the single "you're in
                // the queue" notice, so this isn't a duplicate "connecting you".
                return {
                    replies: ["I'm sorry about that — I'll get a Customer Experience officer to help you."],
                    handoff: true,
                }
            case BOT_INTENT.TALK_TO_HUMAN:
            default:
                // No bot reply — handoff() posts the single queue notice.
                return { replies: [], handoff: true }
        }
    }

    // ─── low-risk workflows (existing systems only) ───────────────────────────

    // Returns { replies, state? }. When the order is overdue or the customer is
    // asking about a delay, it appends an empathetic line + a handoff offer (a
    // "yes" next turn hands off) — it NEVER invents a reason for the delay.
    async orderStatusReply(userId, slots, text, { allowHandoffOffer = true } = {}) {
        const query = { userId }
        if (slots.orderNumber) query.oscNumber = String(slots.orderNumber).trim()
        const order = await BookOrderModel.findOne(query).sort({ createdAt: -1 }).lean()
        if (!order) {
            return {
                replies: [
                    slots.orderNumber
                        ? `I couldn't find an order ${slots.orderNumber} on your account.`
                        : "I couldn't find any orders on your account yet. Ready to place one? " +
                              this.bookingGuide(),
                ],
            }
        }
        const status = order.stage?.status || 'pending'
        const bits = [
            `Order ${order.oscNumber}: *${status.replace(/-/g, ' ')}*`,
            order.serviceType ? `Service: ${order.serviceType}` : null,
            order.amount != null ? `Total: ${naira(order.amount)}` : null,
            order.deliveryDate
                ? `Estimated delivery: ${new Date(order.deliveryDate).toDateString()}`
                : null,
        ].filter(Boolean)
        let reply = bits.join('\n')

        const done = ['delivered', 'cancelled'].includes(status)
        const overdue =
            !done &&
            order.deliveryDate &&
            new Date(order.deliveryDate) < new Date()
        const asksAboutDelay =
            /\b(delay|delayed|late|overdue|taking (too |so )?long|still (not|haven'?t|isn'?t)|why.*(not|isn'?t).*(ready|delivered|here|come|arriv))\b/i.test(
                String(text || ''),
            )
        if (allowHandoffOffer && !done && (overdue || asksAboutDelay)) {
            reply +=
                "\n\nI'm sorry it's taking longer than expected. Would you like me to connect you to a Customer Experience officer?"
            return {
                replies: [reply],
                state: { intent: BOT_INTENT.ORDER_STATUS, step: 'offered-handoff', slots: {} },
            }
        }
        return { replies: [reply] }
    }

    // Loose yes-detector for the "connect you to a person?" offer.
    isAffirmative(text) {
        return /\b(yes|yeah|yep|yup|sure|ok|okay|okk|please|pls|connect|do it|go ahead|alright|yh|ya|talk|speak|correct|confirm)\b/i.test(
            String(text || ''),
        )
    }

    // Loose no-detector for the update-details confirmation step.
    isNegative(text) {
        return /\b(no|nope|nah|don'?t|do ?not|cancel|stop|wrong|incorrect|not right|change it)\b/i.test(
            String(text || ''),
        )
    }

    async walletBalance(userId) {
        const wallet = await WalletModel.findOne({ userId }).lean()
        const cash = wallet?.balance || 0
        const credits = await WalletCreditModel.find({
            userId,
            status: CREDIT_STATUS.ACTIVE,
            expiresAt: { $gt: new Date() },
        }).lean()
        const creditTotal = credits.reduce((s, c) => s + (c.remaining || 0), 0)
        const lines = [
            `Wallet balance: ${naira(cash)}`,
            `Reward credit: ${naira(creditTotal)}${credits.length ? ` (${credits.length} active)` : ''}`,
        ]
        return lines.join('\n')
    }

    async viewOffers(userId) {
        const page = await OfferService.getCustomerOffers(userId)
        const rewards = page?.rewards || page?.yourRewards || []
        const promos = page?.promos || page?.currentPromotions || []
        if (!rewards.length && !promos.length) {
            return 'You have no active offers right now. Keep ordering (and referring friends) to unlock rewards!'
        }
        const names = []
        for (const r of rewards) names.push(`• ${r.offerId?.name || r.name || 'Reward'} (yours)`)
        for (const p of promos) names.push(`• ${p.name || 'Promotion'}`)
        return `Here are your current offers:\n${names.join('\n')}`
    }

    async referralInfo(userId) {
        const page = await ReferralService.getReferralPage(userId)
        const lvl = page.level || {}
        const lines = [
            `Your referral code: ${page.referralCode}`,
            `Share link: ${page.referralLink}`,
            lvl.name ? `Level: ${lvl.name} (${lvl.rewardPercent}% reward)` : null,
            `Successful referrals: ${page.totalSuccessfulReferrals}` +
                (lvl.lifetimeReferrals != null ? ` lifetime, ${lvl.monthlyReferrals} this month` : ''),
        ].filter(Boolean)
        if (lvl.nextLevel) {
            lines.push(
                `${lvl.nextLevel.referralsToGo} more referral(s) to reach ${lvl.nextLevel.name}.`,
            )
        }
        return lines.join('\n')
    }

    async applyReferralCode(userId, text, slots) {
        const code = slots.code || this.extractCode(text)
        if (!code) {
            return {
                replies: ['Sure — what referral code would you like to apply?'],
                state: { intent: BOT_INTENT.APPLY_REFERRAL_CODE, step: 'awaiting-code', slots: {} },
            }
        }
        const referral = await ReferralService.captureReferral({ referredUserId: userId, code })
        if (!referral) {
            return {
                replies: [
                    `I couldn't apply "${code}". It may be unknown, your own code, or you already have a referrer.`,
                ],
            }
        }
        return { replies: [`Done! Code "${code}" applied. 🎉`] }
    }

    // Multi-turn: (1) figure out the field, (2) capture the value, (3) confirm,
    // (4) write. `step` is the PENDING step from botState so we know which turn
    // this is — on `awaiting-value` the WHOLE message is the answer (no keyword
    // re-parsing), which is what stops the "What's the new pickup address?" loop.
    async updateDetails(userId, text, slots, step) {
        const label = (f) => (f === 'phone' ? 'phone number' : 'pickup address')

        // (3) Confirmation turn — we already have field + value, awaiting yes/no.
        if (step === 'awaiting-confirm' && slots.field && slots.value) {
            if (this.isAffirmative(text)) {
                const set =
                    slots.field === 'phone'
                        ? { phoneNumber: slots.value }
                        : { defaultPickupAddress: slots.value }
                await UserModel.updateOne({ _id: userId }, { $set: set })
                return { replies: [`Done — your ${label(slots.field)} is now "${slots.value}".`] }
            }
            if (this.isNegative(text)) {
                return {
                    replies: [`No problem — I've left it unchanged. What's the correct ${label(slots.field)}?`],
                    state: {
                        intent: BOT_INTENT.UPDATE_DETAILS,
                        step: 'awaiting-value',
                        slots: { field: slots.field },
                    },
                }
            }
            // Unclear reply → re-ask the confirmation, keep the pending value.
            return {
                replies: [`Just to confirm — set your ${label(slots.field)} to "${slots.value}"? (yes/no)`],
                state: {
                    intent: BOT_INTENT.UPDATE_DETAILS,
                    step: 'awaiting-confirm',
                    slots: { field: slots.field, value: slots.value },
                },
            }
        }

        // (2) Value turn — the field is known, so the whole message IS the value.
        if (step === 'awaiting-value' && slots.field) {
            const value = this.cleanDetailValue(slots.field, text)
            if (!value) {
                return {
                    replies: [
                        slots.field === 'phone'
                            ? "That doesn't look like a phone number — please send just the digits, e.g. 08031234567."
                            : "I didn't catch an address there — please type your pickup address, e.g. 12 Marina, Lagos.",
                    ],
                    state: {
                        intent: BOT_INTENT.UPDATE_DETAILS,
                        step: 'awaiting-value',
                        slots: { field: slots.field },
                    },
                }
            }
            return {
                replies: [`Set your ${label(slots.field)} to "${value}"? (yes/no)`],
                state: {
                    intent: BOT_INTENT.UPDATE_DETAILS,
                    step: 'awaiting-confirm',
                    slots: { field: slots.field, value },
                },
            }
        }

        // (1) First turn — parse what we can from the message.
        const parsed = this.parseDetail(text, slots)
        if (!parsed.field) {
            return {
                replies: [
                    'I can update your phone number or pickup address. Reply like "phone 0803..." or "address 12 Marina, Lagos".',
                ],
                state: { intent: BOT_INTENT.UPDATE_DETAILS, step: 'awaiting-detail', slots: {} },
            }
        }
        if (!parsed.value) {
            return {
                replies: [`What's the new ${label(parsed.field)}?`],
                state: {
                    intent: BOT_INTENT.UPDATE_DETAILS,
                    step: 'awaiting-value',
                    slots: { field: parsed.field },
                },
            }
        }
        // Got both in one message → confirm before writing.
        return {
            replies: [`Set your ${label(parsed.field)} to "${parsed.value}"? (yes/no)`],
            state: {
                intent: BOT_INTENT.UPDATE_DETAILS,
                step: 'awaiting-confirm',
                slots: { field: parsed.field, value: parsed.value },
            },
        }
    }

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
    }

    feedbackAck() {
        return "Thank you for the feedback — I've logged it for our team. Anything else I can help with?"
    }

    // Single source of truth for the capabilities sentence, reused by the menu,
    // the identity reply, and the fixed fallback.
    capabilities() {
        return (
            'check your order status, see your wallet balance, view offers, ' +
            'get your referral code/level, apply a referral code, or update your phone/pickup address'
        )
    }

    menu() {
        return (
            `I can help you: ${this.capabilities()}. ` +
            "For anything else I'll connect you to a person. What would you like?"
        )
    }

    // "who/what are you" — deterministic identity reply (always works, even when
    // the LLM is unavailable).
    aboutBot() {
        return (
            "I'm the Chuvi Laundry assistant — a smart in-app helper. " +
            `I can ${this.capabilities()}. ` +
            "For anything I can't handle, I'll connect you to a real person. How can I help?"
        )
    }

    // Fixed, LLM-free fallback for out-of-scope / when the assistant can't answer
    // (e.g. the LLM is down). Never depends on the model.
    cantUnderstand() {
        return (
            "Sorry — I can't quite answer or understand that. " +
            `Here's what I can help you with: ${this.capabilities()}. ` +
            "For anything else I'll connect you to a person. What would you like to do?"
        )
    }

    // ─── handoff to a human (Customer Experience) ─────────────────────────────

    async handoff(convo, userId) {
        convo.mode = 'human'
        convo.botState = { intent: null, step: null, slots: {} }
        await convo.save()
        const sys = await ConversationService.postSystemMessage(
            convo._id,
            "You're now in our support queue — a Customer Experience officer will reply right here shortly.",
        )
        if (sys) emitChatMessage(convo, sys)
        // let the customer know (best-effort; never breaks the flow)
        try {
            await createNotification({
                userId,
                title: 'Connecting you to support',
                body: 'A Customer Experience officer will reply in your chat shortly.',
                type: NOTIFICATION_TYPE.SYSTEM,
            })
        } catch (_) {
            /* non-fatal */
        }
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    async say(convo, text) {
        const msg = await ConversationService.postMessage({
            conversationId: convo._id,
            senderType: CHAT_SENDER.BOT,
            text,
        })
        emitChatMessage(convo, msg)
        return msg
    }

    extractCode(text) {
        const m = String(text || '').match(/chuvi[a-z0-9]{4,}/i)
        return m ? m[0].toUpperCase() : null
    }

    parseDetail(text, slots) {
        let field = slots.field || null
        let value = slots.value || null
        const t = String(text || '')
        if (!field) {
            if (/phone|number|mobile|call/i.test(t)) field = 'phone'
            else if (/address|pickup|location/i.test(t)) field = 'pickupAddress'
        }
        if (!value) {
            const phone = t.match(/(\+?\d[\d\s-]{6,}\d)/)
            if (field === 'phone' && phone) value = phone[1].replace(/\s+/g, '')
            else if (field === 'pickupAddress') {
                const after = t.replace(/.*\b(address|pickup|location)\b[:\s]*/i, '').trim()
                if (after && after.toLowerCase() !== t.toLowerCase()) value = after
            }
        }
        return { field, value }
    }

    // Clean a value captured on the `awaiting-value` turn, where the whole
    // message is the answer. Phone → just the digit run; address → strip common
    // lead-in filler ("the new address is at …") so we store "Aroma", not
    // "is at aroma". Returns null when nothing usable is found.
    cleanDetailValue(field, text) {
        const raw = String(text || '').trim()
        if (!raw) return null
        if (field === 'phone') {
            const m = raw.match(/(\+?\d[\d\s-]{6,}\d)/)
            return m ? m[1].replace(/\s+/g, '') : null
        }
        // address: peel a leading preamble only when it's clearly one — either
        // "…address/location is/at/to VALUE" or a conversational lead-in like
        // "it's …" / "make it …". A bare address that merely starts with a filler
        // word ("New Haven Street") has no connector, so it's left untouched.
        let v = raw
            // (a) "the new pickup address is at VALUE" → VALUE
            .replace(
                /^.*\b(?:address|location|pickup|pick\s*up)\b[\s,:.-]*(?:\b(?:is|are|at|to)\b[\s,:.-]*)*/i,
                '',
            )
        // (b) conversational lead-in with no address keyword ("it's aroma",
        //     "make it 5 Broad", "set it to …")
        v = v.replace(
            /^\s*(?:it'?s|it\s+is|(?:change|update|set|make)\s+it(?:\s+to)?|please|pls)\b[\s,:.-]*/i,
            '',
        )
        v = (v.trim() || raw).trim()
        // must contain a real character, not just punctuation ("???" → re-prompt)
        return /[a-z0-9]/i.test(v) ? v : null
    }

    // ─── conversation memory (Phase A) ────────────────────────────────────────

    // Refresh the conversation's long-lived memory after a turn: remember the
    // intent just handled and, on order-touching turns, a snapshot of the
    // customer's most recent order so natural references ("the usual", "are they
    // ready?") have a concrete target later. Best-effort — never throws into the
    // reply path. Returns the merged memory object for the caller to store.
    async _updateMemory(convo, userId, intent) {
        const patch = { lastIntent: intent || null }
        const orderTouching = [
            BOT_INTENT.ORDER_STATUS,
            BOT_INTENT.SUBMIT_FEEDBACK,
            BOT_INTENT.FILE_COMPLAINT,
            BOT_INTENT.BOOKING_GUIDE,
        ].includes(intent)
        if (orderTouching) {
            try {
                const order = await BotContextService.getLastOrder(userId)
                if (order) patch.lastOrder = BotContextService.buildOrderSnapshot(order)
            } catch (_) {
                /* memory refresh is best-effort */
            }
        }
        return BotContextService.mergeMemory(convo, patch)
    }

    // Turn a place reference (addressRef: "same"/"home") into a concrete address
    // from memory or the saved profile, writing it into slots. Never invents —
    // if nothing is stored, it leaves the slot empty and the flow will ask.
    async _resolveAddressRef({ convo, userId, slots }) {
        if (!slots || slots.address || slots.value) return
        const ref = slots.addressRef
        if (!ref || ref === 'other' || ref === 'office') return // no stored office field yet
        let resolved = null
        if (ref === 'same') {
            const mem = BotContextService.loadMemory(convo)
            resolved = mem.lastOrder?.pickupAddress || null
        }
        if (!resolved) {
            try {
                const defaults = await BotContextService.savedDefaults(userId)
                resolved = defaults.pickupAddress || null
            } catch (_) {
                /* best-effort */
            }
        }
        if (resolved) {
            slots.address = resolved
            if (!slots.value) slots.value = resolved
        }
    }
}

module.exports = new BotOrchestratorService()
