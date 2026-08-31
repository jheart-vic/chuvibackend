// This file is the lean ROUTER/turn-engine. The workflows themselves live in
// services/bot/*.js and are mixed onto the prototype at the bottom of this file
// (Object.assign) — so most models/services are imported THERE, not here. Only
// what the turn engine itself touches is imported below.
const ConversationService = require('./conversation.service')
const BotIntentService = require('./botIntent.service')
const BotContextService = require('./botContext.service')
const createNotification = require('../util/createNotification')
const { emitChatMessage } = require('../config/socket')
const {
    BOT_INTENT,
    CHAT_SENDER,
    NOTIFICATION_TYPE,
    ORDER_STATUS,
} = require('../util/constants')

// Phase D quick-action chips — the constants + the context-aware picker now live
// in ./bot/quickActions (the picker is mixed onto the prototype below).
const { MAIN_QUICK_ACTIONS } = require('./bot/quickActions')

// Read-only informational intents that are safe to batch in one message
// (a compound request like "my balance and order status"). Actions and
// multi-turn flows are never batched.
const READ_ONLY_INFO = [
    BOT_INTENT.ORDER_STATUS,
    BOT_INTENT.WALLET_BALANCE,
    BOT_INTENT.VIEW_OFFERS,
    BOT_INTENT.REFERRAL_INFO,
    BOT_INTENT.PRICING,
    BOT_INTENT.TURNAROUND,
    BOT_INTENT.SERVICE_INFO,
]

// Section icons for a combined compound-request reply (scannability).
const INTENT_ICON = {
    [BOT_INTENT.ORDER_STATUS]: '📦',
    [BOT_INTENT.WALLET_BALANCE]: '💰',
    [BOT_INTENT.VIEW_OFFERS]: '🎁',
    [BOT_INTENT.REFERRAL_INFO]: '👥',
    [BOT_INTENT.PRICING]: '💵',
    [BOT_INTENT.TURNAROUND]: '⏱️',
    [BOT_INTENT.SERVICE_INFO]: 'ℹ️',
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
            BOT_INTENT.PRICING,
            BOT_INTENT.TURNAROUND,
            BOT_INTENT.SERVICE_INFO,
            BOT_INTENT.POLICY,
            BOT_INTENT.PAYMENT_STATUS,
            BOT_INTENT.REWARD_STATUS,
            BOT_INTENT.APPLY_PAYMENT,
        ]
    }

    // Entry point: customer sends a message, we reply (or hand off). `crmContext`
    // is set only when the message is a reply to a CRM nudge (via the internal
    // bridge) — it frames an otherwise-ambiguous reply (CRM decides WHEN/WHY, the
    // AI understands WHAT).
    async handleCustomerMessage({ userId, text, attachments = [], crmContext = null }) {
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
            return { conversation: convo, handledBy: 'human', replies: [], quickActions: [] }
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

        // D) Cancel an in-progress flow at any point ("cancel", "never mind",
        //    "start over"). Clears the flow but keeps long-lived memory.
        if (pendingStep && pendingStep !== 'offered-handoff' && this._isCancel(text)) {
            convo.botState = { intent: null, step: null, slots: {}, memory: convo.botState?.memory || {} }
            convo.markModified('botState')
            await convo.save()
            const msg = await this.say(convo, "No problem — I've cancelled that. What else can I help with?")
            return { conversation: convo, handledBy: 'bot', intent: BOT_INTENT.UNKNOWN, replies: [msg], quickActions: MAIN_QUICK_ACTIONS }
        }

        // A) A pending "…would you like a person?" offer (from a delayed-order
        //    reply): a yes hands off; anything else drops the offer and the new
        //    message is handled normally.
        if (pendingStep === 'offered-handoff') {
            if (this.isAffirmative(text)) {
                return this._runSingle({
                    convo, userId, text, intent: BOT_INTENT.TALK_TO_HUMAN, confidence, slots: mergedSlots, attachments,
                })
            }
            return this._runSingle({ convo, userId, text, intent, confidence, slots: mergedSlots, attachments })
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
            return {
                conversation: convo,
                handledBy: 'bot',
                intent: batch.join('+'),
                replies: [msg],
                quickActions: MAIN_QUICK_ACTIONS,
            }
        }

        // B2) CRM frame: when this is a reply to a CRM nudge and the message is
        //     ambiguous (no clear intent / a bare "yes"), interpret it in the
        //     nudge's frame. Never overrides a clear specific intent, and never
        //     mid-flow.
        if (!pendingStep && crmContext) {
            const ambiguous =
                intent === BOT_INTENT.UNKNOWN ||
                confidence < 0.5 ||
                this.isAffirmative(text)
            const framed = ambiguous ? this._crmFrameToIntent(crmContext, text) : null
            if (framed) {
                return this._runSingle({
                    convo, userId, text, intent: framed, confidence, slots: mergedSlots, attachments,
                })
            }
        }

        // D2) Side-question mid-flow: a clear read-only question asked DURING a
        //     collection flow ("how much is a shirt?" while booking) → answer it,
        //     then resume the flow where it left off. Never for confirm/handoff
        //     steps, and never hijacks a genuine answer (needs decent confidence).
        const SIDE_QUESTION = [BOT_INTENT.PRICING, BOT_INTENT.TURNAROUND, BOT_INTENT.SERVICE_INFO]
        const midFlow = pendingIntent && pendingStep && !/confirm|offered-handoff/.test(pendingStep)
        if (midFlow && SIDE_QUESTION.includes(intent) && confidence >= 0.6) {
            const info = await this.runWorkflow({ convo, userId, text, intent, confidence, slots: mergedSlots })
            // resume the flow with NO new input so it just re-asks the current step
            const resume = await this.runWorkflow({
                convo, userId, text: '', intent: pendingIntent, confidence: 1, slots: convo.botState?.slots || {},
            })
            const infoReply = (info.replies || []).filter(Boolean).join('\n')
            const resumeReply = (resume.replies || []).filter(Boolean).join('\n')
            const combined = [infoReply, resumeReply].filter(Boolean).join('\n\n')
            const st = resume.state || convo.botState
            convo.botState = {
                ...st,
                slots: { ...(st.slots || {}), _stall: 0 }, // a question isn't a stall
                memory: convo.botState?.memory || {},
            }
            convo.markModified('botState')
            await convo.save()
            const msg = await this.say(convo, combined || this.cantUnderstand())
            return { conversation: convo, handledBy: 'bot', intent, replies: [msg], quickActions: this._quickActionsForTurn(resume) }
        }

        // C) Single intent. Escalation always wins; otherwise continue a genuinely
        //    mid-step flow (guards the always-0.4 keyword fallback from trapping
        //    the customer in a previous flow).
        let effectiveIntent = intent
        if (!escalationIntents.includes(intent)) {
            // Some collection steps expect a bare answer that is ITSELF a strong
            // keyword for a DIFFERENT intent, so a *confident* (mis)classification
            // would hijack the flow: "card"/"use my balance" at a booking's payment
            // step reads as apply-payment; a 6-digit OTP reads as an order number
            // (order-status). Pin the owning flow on those steps regardless of
            // confidence. (Escalation still wins above; cancel + side-questions
            // were handled earlier. Chip taps send the bare word and mostly dodge
            // this — a customer who types the phrase must not be punished for it.)
            const isPinnedStep =
                (pendingIntent === BOT_INTENT.BOOKING_GUIDE &&
                    (pendingStep === 'collect-payment' ||
                        pendingStep === 'collect-logistics-fee')) ||
                (pendingIntent === BOT_INTENT.UPDATE_DETAILS && pendingStep === 'verify-phone-otp')
            const continuesFlow =
                pendingIntent &&
                pendingStep &&
                (confidence < 0.6 || intent === BOT_INTENT.UNKNOWN)
            if (isPinnedStep || continuesFlow) effectiveIntent = pendingIntent
        }
        return this._runSingle({ convo, userId, text, intent: effectiveIntent, confidence, slots: mergedSlots, attachments })
    }

    // Run one intent's workflow, persist multi-turn state, post replies, hand off.
    async _runSingle({ convo, userId, text, intent, confidence, slots, attachments = [] }) {
        // Loop/repeat guard (Part C): remember the step we were on BEFORE this turn
        // so we can detect a flow that keeps re-asking without advancing.
        const prevStep = convo.botState?.step || null
        const prevIntent = convo.botState?.intent || null
        const prevStall = convo.botState?.slots?._stall || 0

        const result = await this.runWorkflow({ convo, userId, text, intent, confidence, slots, attachments })
        this._applyLoopGuard(result, { prevStep, prevIntent, prevStall })

        // Preserve long-lived memory across the per-turn botState reset — the
        // workflow only returns intent/step/slots, never memory.
        const memory = await this._updateMemory(convo, userId, intent)
        convo.botState = {
            ...(result.state || { intent: null, step: null, slots: {} }),
            memory,
        }
        convo.markModified('botState')
        await convo.save()

        // Only warm a reply that ENDS the turn cleanly (no next step, not a
        // handoff): informational answers, greetings, confirmations of a done
        // action. NEVER style a functional flow prompt ("what's the new phone
        // number?", "wallet or card?") or a handoff line — rewording those risks
        // inverting their meaning or dropping a placeholder, which is worse than
        // a plainly-worded prompt.
        const canStyle = !result.handoff && !result.state?.step
        const posted = []
        for (const reply of result.replies || []) {
            const shaped = canStyle ? await this._maybeStyle(reply) : reply
            posted.push(await this.say(convo, shaped))
        }
        if (result.handoff) await this.handoff(convo, userId)

        return {
            conversation: convo,
            handledBy: result.handoff ? 'handoff' : 'bot',
            intent,
            replies: posted,
            quickActions: this._quickActionsForTurn(result),
        }
    }

    // Part C — never trap a customer re-asking the same thing. If a multi-turn
    // flow returns the SAME step it was already on (the customer's reply didn't
    // advance it), count the stall: after the 2nd no-advance, stop repeating and
    // offer a human (reuses the offered-handoff step so a "yes" hands off). The
    // counter lives in botState.slots._stall and resets the moment a step advances.
    _applyLoopGuard(result, { prevStep, prevIntent, prevStall }) {
        if (!result?.state?.step) return // answered/ended — nothing to stall on
        const noAdvance =
            result.state.step === prevStep &&
            (result.state.intent || null) === (prevIntent || null)
        const stall = noAdvance ? prevStall + 1 : 0

        if (stall >= 2 && !/handoff/i.test(result.state.step)) {
            result.replies = [
                "I'm sorry — I'm having trouble getting that right. Would you like me to connect you to a member of staff? (yes/no)",
            ]
            result.state = {
                ...result.state,
                step: 'offered-handoff',
                slots: { ...(result.state.slots || {}), _stall: 0 },
            }
            return
        }

        result.state.slots = { ...(result.state.slots || {}), _stall: stall }
        if (stall === 1 && Array.isArray(result.replies) && result.replies.length) {
            result.replies[result.replies.length - 1] +=
                '\n(If it’s easier, just tap “Talk To Staff”.)'
        }
    }

    // Part D — an explicit cancel/reset of an in-progress flow (not "no", which
    // is a valid step answer).
    // Part E — optionally re-word a single-line PROSE reply to be warmer/shorter,
    // protecting all data (₦ amounts, order codes, times, numbers, links) behind
    // §n§ placeholders and falling back to the EXACT deterministic text on any
    // doubt (missing token, no provider, error). Skips multi-line/link/very-short
    // replies so summaries, offers and links stay byte-for-byte intact. Gated by
    // BOT_STYLE_REPLIES (set to "false" to disable); a no-op when no LLM provider.
    async _maybeStyle(reply) {
        if (process.env.BOT_STYLE_REPLIES === 'false') return reply
        if (!reply || typeof reply !== 'string') return reply
        if (/\n/.test(reply) || /https?:\/\//i.test(reply) || reply.length < 25) return reply
        const tokens = []
        const guarded = reply.replace(
            /₦[\d,]+(?:\.\d+)?|\bOSC[-\w]*|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b\d[\d,]*(?:\.\d+)?%?\b/gi,
            (m) => {
                const key = `§${tokens.length}§`
                tokens.push(m)
                return key
            },
        )
        let styled
        try {
            styled = await BotIntentService.styleReply(guarded)
        } catch (_) {
            return reply
        }
        if (!styled || typeof styled !== 'string') return reply
        for (let i = 0; i < tokens.length; i++) {
            if (!styled.includes(`§${i}§`)) return reply // a token vanished → don't trust it
        }
        let restored = styled
        for (let i = 0; i < tokens.length; i++) restored = restored.split(`§${i}§`).join(tokens[i])
        // Any leftover § means the model invented a placeholder of its own (seen:
        // "…the number at §number§") — reject rather than leak it to the customer.
        if (/§/.test(restored)) return reply
        // A trailing "?" flipping to/from a statement means the meaning changed
        // (a question became an assertion or vice-versa) — don't trust it.
        if (/\?\s*$/.test(reply.trim()) !== /\?\s*$/.test(restored.trim())) return reply
        return restored.trim() || reply
    }

    // Map a CRM nudge frame to the workflow an ambiguous reply should enter.
    // Accepts a CRM workflow / message-type / free label and matches on substring
    // so the bridge can pass whatever it has. Returns null when nothing fits.
    _crmFrameToIntent(crmContext, text) {
        const c = String(crmContext || '').toLowerCase()
        if (/reactiv/.test(c)) {
            // reactivation: a "yes, I'll reorder" → booking; a churn reason → human
            return this.isAffirmative(text) ? BOT_INTENT.BOOKING_GUIDE : BOT_INTENT.TALK_TO_HUMAN
        }
        if (/reorder/.test(c)) return BOT_INTENT.BOOKING_GUIDE
        if (/feedback|post.?delivery|delivery.?confirm/.test(c)) return BOT_INTENT.SUBMIT_FEEDBACK
        if (/lead/.test(c)) return BOT_INTENT.BOOKING_GUIDE
        return null
    }

    async runWorkflow({ convo, userId, text, intent, confidence, slots, batch = false, attachments = [] }) {
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
                return await this.bookingFlow({
                    convo, userId, text, slots, step: convo.botState?.step,
                })
            case BOT_INTENT.PRICING:
                return { replies: [await this.pricingReply(text, slots)] }
            case BOT_INTENT.TURNAROUND:
                return { replies: [await this.turnaroundReply(userId)] }
            case BOT_INTENT.SERVICE_INFO:
                return { replies: [await this.serviceInfoReply()] }
            case BOT_INTENT.POLICY: {
                const r = await this.policyReply(text)
                return r
                    ? { replies: [r] }
                    : {
                          replies: [
                              "That's a fair question — let me connect you to a person who can explain our policy properly.",
                          ],
                          handoff: true,
                      }
            }
            case BOT_INTENT.PAYMENT_STATUS:
                return await this.paymentStatusReply(userId, slots)
            case BOT_INTENT.APPLY_PAYMENT:
                return await this.applyPaymentFlow({
                    convo, userId, text, slots, step: convo.botState?.step,
                })
            case BOT_INTENT.REWARD_STATUS:
                return { replies: [await this.rewardStatusReply(userId)] }
            case BOT_INTENT.SUBMIT_FEEDBACK:
                return await this.feedbackFlow({
                    convo, userId, text, slots, step: convo.botState?.step,
                })
            case BOT_INTENT.FILE_COMPLAINT:
                return await this.complaintFlow({
                    convo, userId, text, slots, attachments, step: convo.botState?.step,
                })
            case BOT_INTENT.TALK_TO_HUMAN:
            default:
                // No bot reply — handoff() posts the single queue notice.
                return { replies: [], handoff: true }
        }
    }

    // ─── low-risk workflows (existing systems only) ───────────────────────────

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

// Compose the stateless parsing / matching / estimate helpers onto the
// prototype (extracted to services/bot/parsers.js to keep this file a router).
// They still bind to `this`, so every existing call site works unchanged.
Object.assign(
    BotOrchestratorService.prototype,
    require('./bot/parsers'),
    require('./bot/copy'),
    require('./bot/quickActions').mixin,
    require('./bot/readAnswers'),
    require('./bot/payment.flow'),
    require('./bot/booking.flow'),
    require('./bot/complaint.flow'),
    require('./bot/feedback.flow'),
    require('./bot/details.flow'),
)

module.exports = new BotOrchestratorService()
