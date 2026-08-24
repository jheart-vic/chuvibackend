const ConversationService = require('./conversation.service')
const BotIntentService = require('./botIntent.service')
const BotContextService = require('./botContext.service')
const ReferralService = require('./referral.service')
const OfferService = require('./offer.service')
const BookOrderService = require('./bookOrder.service')
const WalletService = require('./wallet.service')
const WalletCreditService = require('./walletCredit.service')
const PaystackService = require('./paystack.service')
const RecoveryService = require('./recovery.service')
const FeedbackService = require('./feedback.service')
const ComplaintTypeModel = require('../models/complaintType.model')
const ComplaintCaseModel = require('../models/complaintCase.model')
const WalletModel = require('../models/wallet.model')
const WalletCreditModel = require('../models/walletCredit.model')
const SubscriptionModel = require('../models/subscription.model')
const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const AdminSettingModel = require('../models/adminSetting.model')
const OrderItemModel = require('../models/orderItem.model')
const createNotification = require('../util/createNotification')
const createAuditLog = require('../util/createAuditLog')
const { roundToNearestHundred, generateOTP, calculateDueDate } = require('../util/helper')
const sendSmsOtp = require('../util/sendOtp')
const { emitChatMessage } = require('../config/socket')
const {
    BOT_INTENT,
    BILLING_TYPE,
    DELIVERY_SPEED,
    CHAT_SENDER,
    CREDIT_STATUS,
    CONVERSATION_TYPE,
    NOTIFICATION_TYPE,
    PAYMENT_ORDER_STATUS,
    PICKUP_STATUS,
    DELIVERY_STATUS,
    ORDER_STATUS,
    REFERRAL_REWARD_STATUS,
    AUDIT_LOG_CATEGORIES,
    COMPLAINT_STATUS,
    FEEDBACK_TYPE,
} = require('../util/constants')

// Phase D: quick-action chips the frontend renders as tappable buttons. Each is
// { label, message } — tapping sends `message` back as the next customer message,
// so the whole existing pipeline handles it (no new action protocol).
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

// Plain-language explanation of each pipeline stage, so the assistant can say
// what is happening instead of a bare status code. Descriptive only.
const STAGE_EXPLAIN = {
    pending: 'received and waiting to be picked up',
    queue: 'in the queue to start',
    received: 'picked up and now with us',
    'picked-up': 'picked up and on its way to us',
    'sort-and-pretreat': 'being sorted and pre-treated',
    washing: 'being washed',
    drying: 'drying',
    ironing: 'being pressed and ironed',
    qc: 'in final quality check',
    ready: 'cleaned, passed QC, and ready',
    'out-for-delivery': 'out for delivery',
    delivered: 'delivered',
    hold: 'on hold while we sort something out',
    cancelled: 'cancelled',
}

const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`

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
                (pendingIntent === BOT_INTENT.BOOKING_GUIDE && pendingStep === 'collect-payment') ||
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
    _isCancel(text) {
        return /\b(cancel|never ?mind|forget (it|about it)|scrap that|start over|abort)\b/i.test(String(text || ''))
    }

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
        const explain = STAGE_EXPLAIN[status]
        const bits = [
            explain
                ? `Order ${order.oscNumber}: your laundry is ${explain} (*${status.replace(/-/g, ' ')}*).`
                : `Order ${order.oscNumber}: *${status.replace(/-/g, ' ')}*`,
            order.serviceType ? `Service: ${order.serviceType}` : null,
            order.amount != null ? `Total: ${naira(order.amount)}` : null,
            order.deliveryDate
                ? `Estimated delivery: ${new Date(order.deliveryDate).toDateString()}`
                : null,
        ].filter(Boolean)
        let reply = bits.join('\n')

        // Answer a specific "are they ready?" / "has the rider left?" sub-question
        // straight from the record — never guess a state the system hasn't set.
        const line = this._readinessAndDispatchLine(order, status, text)
        if (line) reply += `\n${line}`

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

    // ─── Phase B: read-only answers from approved data (never invents) ────────

    // Builds a targeted readiness / dispatch line for order-status when the
    // customer asked "are they ready?" or "has the rider left?". Returns null
    // when neither was asked. Reads only real record fields.
    _readinessAndDispatchLine(order, status, text) {
        const t = String(text || '')
        const asksReady = /\b(ready|done|finished|ready yet|prepared)\b/i.test(t)
        const asksRider =
            /\b(rider|dispatch|dispatched|left|on the way|out for delivery|coming|come|pick(?:ed)?\s*up)\b/i.test(t)
        if (!asksReady && !asksRider) return null

        if (asksRider) {
            const pickup = order.dispatchDetails?.pickup?.status
            const delivery = order.dispatchDetails?.delivery?.status
            if (status === ORDER_STATUS.DELIVERED)
                return 'Your order has already been delivered.'
            if (
                status === ORDER_STATUS.OUT_FOR_DELIVERY ||
                delivery === DELIVERY_STATUS.OUT_FOR_DELIVERY
            )
                return 'Yes — a rider is out delivering your order now.'
            if (
                [PICKUP_STATUS.PICKUP_IN_PROGRESS, PICKUP_STATUS.PICKED_UP].includes(pickup)
            )
                return 'A rider is currently handling your pickup.'
            if (status === ORDER_STATUS.READY)
                return "Not yet — it's ready and waiting to be dispatched for delivery."
            return "Not yet — a rider hasn't been dispatched; your order is still being processed."
        }

        // readiness
        if (status === ORDER_STATUS.READY) return 'Yes — it’s ready. ✅'
        if (status === ORDER_STATUS.OUT_FOR_DELIVERY)
            return 'It’s ready and out for delivery right now.'
        if (status === ORDER_STATUS.DELIVERED) return 'It’s already been delivered.'
        return 'Not yet — it’s still being worked on.'
    }

    // Find a catalog item the message refers to (singular/plural).
    _extractItemName(text, items) {
        const t = String(text || '').toLowerCase()
        for (const i of items) {
            const n = (i.name || '').toLowerCase()
            if (n && new RegExp(`\\b${n}s?\\b`, 'i').test(t)) return i.name
        }
        return null
    }

    // "How much is a trouser?" / "your prices". Per-piece classic price =
    // roundToNearestHundred(item.price × serviceType.pricePerPiece) — exactly the
    // booking math, so the quote can never drift from what they'd be charged.
    async pricingReply(text, slots) {
        const setting = await AdminSettingModel.findOne({}).lean()
        const items = await OrderItemModel.find({}).lean()
        const svc =
            (setting?.serviceTypes || []).find((s) => s.name === 'wash-and-iron') ||
            (setting?.serviceTypes || [])[0] ||
            null
        const perPiece = (item) =>
            svc ? roundToNearestHundred((item.price || 0) * (svc.pricePerPiece || 0)) : null
        const premium = setting?.premiumServiceTierCharge
        const vip = setting?.vipServiceTierCharge
        const tierNote =
            premium || vip
                ? ` Premium${premium ? ` (×${premium})` : ''} and VIP${vip ? ` (×${vip})` : ''} tiers cost more, and express/same-day add a surcharge.`
                : ' Premium/VIP tiers and express/same-day delivery cost a little more.'

        const asked = (slots?.itemName || this._extractItemName(text, items) || '')
            .toLowerCase()
            .trim()
        if (asked && items.length) {
            const match =
                items.find((i) => (i.name || '').toLowerCase() === asked) ||
                items.find(
                    (i) =>
                        asked.includes((i.name || '').toLowerCase()) ||
                        (i.name || '').toLowerCase().includes(asked),
                )
            if (match && perPiece(match) != null) {
                return `A ${match.name} is ${naira(perPiece(match))} per piece (classic${svc ? `, ${svc.name}` : ''}).${tierNote} I can give you the exact total when you book.`
            }
        }

        // general price list
        if (!items.length || !svc) {
            return "I can't load our price list right now — I can connect you to a person, or you can start a booking and you'll see the exact quote before you confirm."
        }
        const sample = items
            .slice(0, 6)
            .map((i) => `• ${i.name}: ${naira(perPiece(i))}`)
        const fees = []
        if (setting?.pickupFee != null) fees.push(`pickup ${naira(setting.pickupFee)}`)
        if (setting?.deliveryFee != null) fees.push(`delivery ${naira(setting.deliveryFee)}`)
        const lines = ['Here are some of our per-piece prices (classic tier):', ...sample]
        if (fees.length) lines.push(`Pickup/delivery: ${fees.join(', ')}.`)
        lines.push(`${tierNote.trim()} Tell me your items and I can work out an exact quote.`)
        return lines.join('\n')
    }

    // "How many days does it take?" — general turnaround, plus the ETA of the
    // customer's active order if they have one.
    async turnaroundReply(userId) {
        const setting = await AdminSettingModel.findOne({}).lean()
        const days = setting?.standardDeliveryPeriod ?? 2
        const lines = [
            `Standard delivery takes about ${days} day${days === 1 ? '' : 's'}.`,
            'Express is faster, and same-day is available if you book before 10am.',
        ]
        try {
            const order = await BookOrderModel.findOne({
                userId,
                'stage.status': { $nin: [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED] },
            })
                .sort({ createdAt: -1 })
                .lean()
            if (order?.deliveryDate) {
                lines.push(
                    `Your current order ${order.oscNumber} is estimated for ${new Date(order.deliveryDate).toDateString()}.`,
                )
            }
        } catch (_) {
            /* best-effort */
        }
        return lines.join('\n')
    }

    // "What do you offer / how does it work?" — services, tiers, speeds.
    async serviceInfoReply() {
        const setting = await AdminSettingModel.findOne({}).lean()
        const services = (setting?.serviceTypes || []).map((s) => s.name).join(', ')
        return [
            `We offer: ${services || 'wash & iron, wash only, iron only, dry clean'}.`,
            'Three service tiers: classic (standard care), premium and VIP (extra care, priced higher).',
            'Delivery speeds: standard, express, and same-day (book before 10am for same-day).',
            'We can pick up and deliver too — I can guide you through booking whenever you’re ready.',
        ].join('\n')
    }

    // Payment / cancellation / pickup policy — answers ONLY from established,
    // approved facts already in the system. Returns null for anything else, so
    // the caller hands off instead of inventing policy.
    async policyReply(text) {
        const t = String(text || '').toLowerCase()
        const setting = await AdminSettingModel.findOne({}).lean()
        if (/\b(pay|payment|method|transfer|card|bank|paystack)\b/.test(t)) {
            return 'You can pay by card or bank transfer in the app, or from your Chuvi wallet. Payment is confirmed automatically once it goes through.'
        }
        if (/\b(cancel|cancellation)\b/.test(t)) {
            const mins = setting?.orderCancellationGraceMinutes ?? 15
            return `You can cancel free of charge within about ${mins} minutes of placing an order, before we start processing. After that, or once your items are with us, reach out and we’ll help. Refunds go back to your Chuvi wallet.`
        }
        if (/\brefund\b/.test(t)) {
            return 'Refunds for cancelled orders go back to your Chuvi wallet. For anything else about a refund, I can connect you to a person.'
        }
        if (/\b(pickup|pick up|delivery|deliver)\b/.test(t)) {
            const p = setting?.pickupFee
            const d = setting?.deliveryFee
            const fee =
                p != null || d != null
                    ? ` (pickup ${naira(p)}, delivery ${naira(d)})`
                    : ''
            return `We can pick up and deliver your laundry${fee}. You choose your address, date and a time slot when you book.`
        }
        return null // not an approved fact we can answer → hand off
    }

    // "I paid already" — read the payment record; never accuse, offer a human
    // when the system hasn't confirmed it.
    async paymentStatusReply(userId, slots) {
        const query = { userId }
        if (slots?.orderNumber) query.oscNumber = String(slots.orderNumber).trim()
        const order = await BookOrderModel.findOne(query).sort({ createdAt: -1 }).lean()
        if (!order) {
            return {
                replies: [
                    "I couldn't find an order to check a payment on. If you just placed one, give it a moment and try again.",
                ],
            }
        }
        if (order.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS) {
            return {
                replies: [`Payment for order ${order.oscNumber} is confirmed — you’re all set. ✅`],
            }
        }
        return {
            replies: [
                `I don’t see a confirmed payment on order ${order.oscNumber} yet. If you just paid, it can take a short while to reflect. Would you like me to connect you to a person to check?`,
            ],
            state: { intent: BOT_INTENT.PAYMENT_STATUS, step: 'offered-handoff', slots: {} },
        }
    }

    // "My friend used my code — where's my reward?" — read the referral ledger
    // and explain each status. Never releases a reward (the system does that).
    async rewardStatusReply(userId) {
        const page = await ReferralService.getReferralPage(userId)
        const history = page.history || []
        if (!history.length) {
            return `You don’t have any referrals yet. Share your code ${page.referralCode} — when a friend places their first order and it’s delivered, your reward is released automatically.`
        }
        const granted = history.filter(
            (h) => h.rewardStatus === REFERRAL_REWARD_STATUS.GRANTED,
        )
        const deferred = history.filter(
            (h) => h.rewardStatus === REFERRAL_REWARD_STATUS.DEFERRED,
        )
        const waiting = history.filter(
            (h) => h.rewardStatus === REFERRAL_REWARD_STATUS.NONE,
        )
        const lines = [
            `You’ve earned ${naira(page.totalRewardsEarned)} from ${granted.length} successful referral(s).`,
        ]
        if (waiting.length)
            lines.push(
                `${waiting.length} referral(s) still pending — a reward is released once your friend’s first order is delivered.`,
            )
        if (deferred.length)
            lines.push(
                `${deferred.length} reward(s) are on hold while a complaint on your account is being resolved.`,
            )
        lines.push(
            'I never release rewards myself — the system does that automatically once they qualify.',
        )
        return lines.join('\n')
    }

    // ─── Phase C: guided booking that actually places the order ───────────────
    //
    // Multi-turn slot-fill → estimate → explicit confirm → place through the
    // EXACT existing booking path (BookOrderService.createOrder → postBookOrder),
    // so pricing/validation/credit/notifications are identical to the app. The
    // bot NEVER places an order without a "yes" at the confirm step. Uses Phase A
    // memory so "the usual" prefills from the last order.
    async bookingFlow({ convo, userId, text, slots, step }) {
        // Payment step (after the order is placed) — handled FIRST so a
        // "wallet"/"card" reply is never mis-parsed as items/service, and so we
        // skip the catalog/settings reads the slot-fill needs.
        if (step === 'collect-payment') {
            return await this._bookingPaymentStep({ userId, text, slots })
        }
        if (step === 'confirm-credit') {
            return await this._bookingCreditOptinStep({ userId, text, slots })
        }

        const setting = await AdminSettingModel.findOne({}).lean()
        const catalog = await OrderItemModel.find({}).lean()
        const memory = BotContextService.loadMemory(convo)
        const ref = BotContextService.detectReferent(text)

        // Accumulated booking data persisted under distinct b* keys (so the
        // per-turn classifier slots never overwrite them with blanks).
        let bItems = slots.bItems || null
        let bServiceType = slots.bServiceType || null
        let bAddress = slots.bPickupAddress || null
        let bDate = slots.bDatePhrase || null
        let bTime = slots.bTime || null
        let bTimeAuto = slots.bTimeAuto || false
        let bPhone = slots.bPhone || null
        let bQtyConfirmed = slots.bQtyConfirmed || false
        let bSpeed = slots.bSpeed || null
        let unmatched = []

        // ── ingest anything this turn provided ──────────────────────────────
        const rawItems =
            slots.items && slots.items.length
                ? slots.items
                : this._parseItemsFromText(text, catalog)
        if (rawItems && rawItems.length) {
            const resolved = this._resolveBookingItems(rawItems, catalog)
            if (resolved.priced.length) bItems = resolved.priced
            unmatched = resolved.unmatched
        }
        if (!bServiceType) bServiceType = this._matchServiceType(text, setting)
        if (!bAddress) {
            bAddress =
                slots.address ||
                (step === 'collect-address'
                    ? this.cleanDetailValue('pickupAddress', text)
                    : null)
        }
        // Date/time (Part A): prefer the LLM's structured slots, then a keyword
        // parse of the raw text — NEVER dump the whole message as the date (that
        // was the "When should we come?" loop). Parsed every turn so a multi-slot
        // answer ("tomorrow morning, same address") fills date + time at once.
        const dt = this._parseDateTimeFromText(text)
        if (!bDate) bDate = slots.pickupDate || dt.datePhrase || null
        if (!bTime) bTime = slots.pickupTime || dt.timePhrase || null
        if (!bPhone && step === 'collect-phone') {
            const m = String(text || '').match(/(\+?\d[\d\s-]{6,}\d)/)
            if (m) bPhone = m[1].replace(/\s+/g, '')
        }

        // "the usual" / "same as last time" → prefill from the remembered order
        if ((ref.theUsual || ref.sameAsLast) && memory.lastOrder) {
            if ((!bItems || !bItems.length) && memory.lastOrder.items?.length) {
                const r = this._resolveBookingItems(memory.lastOrder.items, catalog)
                if (r.priced.length) bItems = r.priced
            }
            if (!bServiceType) bServiceType = memory.lastOrder.serviceType || null
            if (!bAddress) bAddress = memory.lastOrder.pickupAddress || null
        }

        const persist = (nextStep) => ({
            intent: BOT_INTENT.BOOKING_GUIDE,
            step: nextStep,
            slots: {
                bItems,
                bServiceType,
                bPickupAddress: bAddress,
                bDatePhrase: bDate,
                bTime,
                bTimeAuto,
                bPhone,
                bQtyConfirmed,
                bSpeed,
            },
        })

        // Human-readable item list, e.g. "50 shirts, 3 trousers".
        const describeItems = () =>
            (bItems || [])
                .map((i) => `${i.quantity} ${i.type}${i.quantity > 1 ? 's' : ''}`)
                .join(', ')

        // Large-quantity sanity confirm (guards typos like 50 vs 5). Asked once,
        // right after items are captured, before we price/continue.
        const LARGE_QTY = 30
        if (step === 'confirm-qty') {
            if (this.isNegative(text)) {
                bItems = null
                bQtyConfirmed = false
                return {
                    replies: ['No problem — tell me the items and how many again, e.g. "6 shirts, 3 trousers".'],
                    state: persist('collect-items'),
                }
            }
            if (this.isAffirmative(text)) {
                bQtyConfirmed = true // fall through and continue the flow
            } else {
                return {
                    replies: [`Just to confirm the quantities — ${describeItems()}? (yes/no)`],
                    state: persist('confirm-qty'),
                }
            }
        }
        if (bItems && bItems.length && !bQtyConfirmed && bItems.some((i) => i.quantity > LARGE_QTY)) {
            return {
                replies: [`Just to confirm — that's ${describeItems()}. That's a large order, so I want to be sure before I price it. (yes/no)`],
                state: persist('confirm-qty'),
            }
        }

        // ── confirm step: yes places it, no cancels, anything else re-checks ──
        if (step === 'confirm') {
            if (this.isNegative(text)) {
                return {
                    replies: ["No problem — I've cancelled that. Tell me what you'd like to change or add."],
                }
            }
            if (this.isAffirmative(text)) {
                return await this._placeBooking({
                    userId, bItems, bServiceType, bAddress, bDate, bTime, bTimeAuto, bPhone, bSpeed,
                })
            }
            // otherwise treat it as a correction and fall through to re-summarise
        }

        // ── ask for the first missing piece ─────────────────────────────────
        if (!bItems || !bItems.length) {
            const lead = step ? '' : `${this.bookingGuide()}\n\n`
            const note = unmatched.length
                ? `I can't price "${unmatched.join(', ')}" here. `
                : ''
            return {
                replies: [
                    `${lead}${note}What would you like cleaned? Tell me the items and how many — e.g. "6 shirts, 3 trousers".`,
                ],
                state: persist('collect-items'),
            }
        }
        if (!bServiceType) {
            const opts = (setting?.serviceTypes || []).map((s) => s.name).join(', ') || 'wash-and-iron, washing-only, ironing-only, dry-clean'
            return {
                replies: [`Great. Which service would you like — ${opts}?`],
                state: persist('collect-service'),
            }
        }
        if (!bAddress) {
            return {
                replies: ['Where should we pick it up? Please send the pickup address.'],
                state: persist('collect-address'),
            }
        }
        // Part B — a DAY is enough; if no time is given we default a pickup window
        // (and say so at confirm) rather than trapping the customer on this step.
        if (!bDate) {
            return {
                replies: ['When should we come? A day is fine — e.g. "tomorrow" or "Saturday" — and add a rough time (morning/afternoon) if you have one.'],
                state: persist('collect-datetime'),
            }
        }
        if (!bTime) {
            bTime = this._defaultPickupWindow(setting)
            bTimeAuto = true
        }
        // Delivery speed — offer only what's available at THIS clock time (uses the
        // backend cutoff rule as the single source), with charge + ETA. Parses the
        // reply here so a multi-slot "tomorrow express" is caught too.
        if (!bSpeed) {
            const avail = this._availableSpeeds(setting)
            const availSpeeds = avail.map((s) => s.speed)
            const candidate = this._parseDeliverySpeed(text)
            if (candidate && availSpeeds.includes(candidate)) {
                bSpeed = candidate
            } else {
                const note =
                    candidate && !availSpeeds.includes(candidate)
                        ? `Sorry, ${candidate} isn't available right now (past today's cut-off). `
                        : ''
                return {
                    replies: [`${note}${this._speedOfferText(avail)}`],
                    state: persist('collect-speed'),
                }
            }
        }
        const defaults = await BotContextService.savedDefaults(userId)
        if (!bPhone && !defaults.phoneNumber) {
            return {
                replies: ['Lastly, what phone number should the rider call?'],
                state: persist('collect-phone'),
            }
        }

        // ── everything gathered → show summary + estimate, ask to confirm ────
        const estimate = this._bookingEstimate(bItems, bServiceType, setting, bSpeed)
        const itemsLine = bItems
            .map((i) => `${i.quantity} ${i.type}${i.quantity > 1 ? 's' : ''}`)
            .join(', ')
        const summary = [
            "Here's your booking:",
            `• Items: ${itemsLine}`,
            `• Service: ${bServiceType} (classic tier)`,
            `• Pickup: ${bAddress}${bDate ? `, ${bDate}` : ''}${bTime ? ` ${bTime}${bTimeAuto ? ' (default window — tell me if you’d prefer another time)' : ''}` : ''}`,
            `• Delivery: ${this._describeSpeed(bSpeed, setting)}`,
            `Estimated total: about ${naira(estimate)} — you'll see the exact amount once it's placed.`,
            'Shall I place it? (yes/no)',
        ].join('\n')
        return { replies: [summary], state: persist('confirm') }
    }

    // Build the payload and place the order through the shared booking path.
    // Billing precedence: (1) if the customer has an ACTIVE subscription, try to
    // cover it with their plan (reuses postBookOrder's own limit/heavy-item
    // validation — a rejected attempt creates NO order); (2) otherwise / on plan
    // rejection, place pay-per-item and collect payment (wallet or card).
    async _placeBooking({ userId, bItems, bServiceType, bAddress, bDate, bTime, bTimeAuto, bPhone, bSpeed }) {
        const defaults = await BotContextService.savedDefaults(userId)
        const phone = bPhone || defaults.phoneNumber
        const basePayload = {
            fullName: defaults.fullName || 'Customer',
            phoneNumber: phone,
            serviceType: bServiceType,
            serviceTier: 'classic',
            deliverySpeed: bSpeed || DELIVERY_SPEED.STANDARD,
            isDelivery: true,
            isPickUp: true,
            items: (bItems || []).map((i) => ({
                type: i.type,
                price: Math.round(i.price) || 0,
                quantity: Math.max(1, Math.round(i.quantity) || 1),
            })),
            pickupAddress: bAddress,
        }
        if (bTime) basePayload.pickupTime = bTime
        const day = this._resolvePickupDate(bDate)
        if (day) basePayload.pickupDate = day

        // (1) Subscriber → try the plan first.
        let subLead = ''
        const sub = await SubscriptionModel.findOne({ userId, status: 'active' }).lean()
        if (sub) {
            const subRes = await this._createOrderSafe(userId, {
                ...basePayload,
                billingType: BILLING_TYPE.PAY_FROM_SUBSCRIPTION,
            })
            if (subRes?.success) {
                const order = subRes.data?.order
                return {
                    replies: [
                        `Done! Order ${order?.oscNumber || ''} is placed and covered by your subscription ✅. We'll arrange your pickup shortly!`,
                    ],
                }
            }
            // Plan can't cover it (over monthly limit / heavy items / etc.) → fall
            // back to pay-per-item, telling the customer why in plain language.
            subLead = this._subFallbackLead(subRes?.data?.error)
        }

        // (2) Pay-per-item (default / fallback) → then collect payment.
        const result = await this._createOrderSafe(userId, {
            ...basePayload,
            billingType: BILLING_TYPE.PAY_PER_ITEM,
        })
        if (result?.success) {
            const order = result.data?.order
            const amount = Number(order?.amount) || 0
            const osc = order?.oscNumber || ''
            // Fully covered at creation (offer/credit) → nothing to collect.
            if (amount <= 0) {
                return {
                    replies: [
                        `${subLead}Done! Order ${osc} is placed and fully covered — nothing to pay ✅. We'll arrange your pickup shortly!`,
                    ],
                }
            }
            // Order exists but is UNPAID — drive payment instead of ending here,
            // and DON'T call it "done" until money is actually collected.
            return {
                replies: [
                    `${subLead}Your order ${osc} is placed and awaiting payment — total ${naira(amount)}. How would you like to pay — from your wallet, or by card?`,
                ],
                state: {
                    intent: BOT_INTENT.BOOKING_GUIDE,
                    step: 'collect-payment',
                    slots: {
                        payOrderId: String(order?._id || ''),
                        payAmount: amount,
                        payOsc: osc,
                    },
                },
            }
        }
        const err = result?.data?.error
        const msg = typeof err === 'string' ? err : 'something went wrong on our side'
        // Delivery-speed cutoff passed mid-chat (before 2pm/10am) or the speed is
        // at capacity → don't dead-end: send them back to pick another speed
        // (the offer will now exclude the unavailable one). Keeps all other slots.
        if (/before 10am|before 2pm|full capacity/i.test(msg)) {
            return {
                replies: [`${msg} Let's choose another delivery speed.`],
                state: {
                    intent: BOT_INTENT.BOOKING_GUIDE,
                    step: 'collect-speed',
                    slots: {
                        bItems,
                        bServiceType,
                        bPickupAddress: bAddress,
                        bDatePhrase: bDate,
                        bTime,
                        bTimeAuto: !!bTimeAuto,
                        bPhone,
                        bQtyConfirmed: true,
                        bSpeed: null,
                    },
                },
            }
        }
        return {
            replies: [
                `I couldn't place the order — ${msg}. Would you like me to connect you to a person?`,
            ],
            state: { intent: BOT_INTENT.BOOKING_GUIDE, step: 'offered-handoff', slots: {} },
        }
    }

    // Place an order through the exact production path, never throwing.
    async _createOrderSafe(userId, payload) {
        try {
            return await new BookOrderService().createOrder({ userId, payload })
        } catch (e) {
            return { success: false, data: { error: e.message } }
        }
    }

    // Friendly one-liner explaining why a subscriber's order fell back to
    // pay-as-you-go (from postBookOrder's own rejection reason).
    _subFallbackLead(error) {
        const e = String(error || '').toLowerCase()
        if (/heavy/.test(e)) return "Your plan doesn't cover heavy items, so this one is pay-as-you-go. "
        if (/limit|exceed/.test(e)) return "That's over your plan's items for this period, so this one is pay-as-you-go. "
        return 'This one is pay-as-you-go. '
    }

    // Part G — collect payment for a freshly-placed (unpaid) booking. The order
    // already exists via the exact production path; here we settle it from the
    // customer's wallet (reusing WalletService.payWithWallet) or hand them a
    // Paystack checkout link (reusing PaystackService.initializePayment). The bot
    // gains NO new money authority: it only spends the customer's own wallet on
    // their own order, or gives them a link they authorise themselves. The order
    // stays PENDING (paymentStatus unchanged) until wallet succeeds or the
    // Paystack webhook confirms the card payment — the bot never confirms it.
    async _bookingPaymentStep({ userId, text, slots }) {
        const orderId = slots?.payOrderId
        const amount = Number(slots?.payAmount) || 0
        const osc = slots?.payOsc || ''
        const stay = {
            intent: BOT_INTENT.BOOKING_GUIDE,
            step: 'collect-payment',
            slots: { payOrderId: orderId, payAmount: amount, payOsc: osc },
        }
        if (!orderId) {
            return {
                replies: ['I lost track of that order, sorry. Shall I connect you to a member of staff? (yes/no)'],
                state: { intent: BOT_INTENT.BOOKING_GUIDE, step: 'offered-handoff', slots: {} },
            }
        }

        const choice = this._parsePaymentChoice(text)

        if (choice === 'wallet') {
            const { cash, creditTotal, available } = await this._walletAvailable(userId)
            if (available < amount) {
                return {
                    replies: [
                        `Your wallet has ${naira(available)}, which isn't enough for the ${naira(amount)} total. You can top up in the app, pay by card, or I can connect you to a person.`,
                    ],
                    state: stay,
                }
            }
            // Reward credit present → ASK before spending it (opt-in), rather than
            // silently using it. No credit → go straight to a cash charge.
            if (creditTotal > 0) {
                return {
                    replies: [`You have ${naira(creditTotal)} in reward credit. Use it toward this ${naira(amount)}? (yes/no)`],
                    state: {
                        intent: BOT_INTENT.BOOKING_GUIDE,
                        step: 'confirm-credit',
                        slots: { payOrderId: orderId, payAmount: amount, payOsc: osc, payCash: cash },
                    },
                }
            }
            const r = await this._settleWalletCharge({ userId, orderId, useCredit: false })
            return r.ok
                ? { replies: [this._walletPaidReply(amount, osc, r.creditApplied)] }
                : { replies: [`I couldn't complete the wallet payment — ${r.error}. You can pay by card instead, or I can connect you to a person.`], state: stay }
        }

        if (choice === 'card') {
            let res
            try {
                res = await new PaystackService().initializePayment({
                    body: { transactionType: 'order', orderId },
                    user: { id: userId },
                })
            } catch (e) {
                res = { success: false, data: { error: e.message } }
            }
            const url = res?.success && res.data?.message?.data?.authorization_url
            if (url) {
                return {
                    replies: [
                        `Great — tap here to pay ${naira(amount)} securely for order ${osc}:\n${url}\nYour order is confirmed the moment the payment goes through. You can say "I've paid" or ask for your order status anytime.`,
                    ],
                }
            }
            const cerr = (res && res.data && res.data.error) || 'I could not create the payment link'
            return {
                replies: [`Sorry — ${cerr}. You can pay from your wallet instead, or I can connect you to a person.`],
                state: stay,
            }
        }

        // unclear reply → ask the method again (the loop guard escalates if it repeats)
        return {
            replies: [`Would you like to pay for order ${osc} (${naira(amount)}) from your wallet, or by card?`],
            state: stay,
        }
    }

    // 'wallet' | 'card' | null — how the customer wants to pay for a booking.
    _parsePaymentChoice(text) {
        const t = String(text || '').toLowerCase()
        if (/\bwallet\b|\bbalance\b|\bcredit\b|from my (wallet|balance)/.test(t)) return 'wallet'
        if (/\bcard\b|paystack|online|debit|\bbank\b|transfer|\blink\b|pay now/.test(t)) return 'card'
        return null
    }

    // Shared wallet settlement: charge (credit-first ONLY when useCredit), write a
    // WALLET audit, and stamp the order billingType so reporting matches. Returns
    // { ok:true, creditApplied } | { ok:false, error }. Callers phrase their own
    // success line. Used by booking + apply-payment.
    async _settleWalletCharge({ userId, orderId, useCredit }) {
        let result
        try {
            result = await new WalletService().payWithWallet({
                body: { bookOrderId: orderId, useCredit: !!useCredit },
                user: { id: userId },
            })
        } catch (e) {
            result = { success: false, data: { error: e.message } }
        }
        if (!result?.success) {
            return { ok: false, error: (result && result.data && result.data.error) || 'the payment could not be completed' }
        }
        try {
            await createAuditLog({
                userId,
                action: `Bot settled order ${orderId} from wallet (useCredit=${!!useCredit})`,
                category: AUDIT_LOG_CATEGORIES.WALLET,
                orderId,
            })
        } catch (_) {
            /* audit best-effort; the WalletTransaction is the money record */
        }
        try {
            await BookOrderModel.findByIdAndUpdate(orderId, {
                billingType: BILLING_TYPE.PAY_FROM_WALLET,
            })
        } catch (_) {
            /* label only — the WalletTransaction is the money record */
        }
        return { ok: true, creditApplied: (result.data && result.data.creditApplied) || 0 }
    }

    // Booking "Paid ✅" line with an optional reward-credit note.
    _walletPaidReply(amount, osc, creditApplied) {
        const note = creditApplied > 0 ? ` (${naira(creditApplied)} from your reward credit)` : ''
        return `Paid ✅ — order ${osc} is confirmed and your wallet covered ${naira(amount)}${note}. We'll arrange your pickup shortly!`
    }

    // Credit opt-in for a booking wallet payment: yes → spend reward credit first;
    // no → cash only (if cash covers), else route back to choose credit or card.
    async _bookingCreditOptinStep({ userId, text, slots }) {
        const orderId = slots?.payOrderId
        const amount = Number(slots?.payAmount) || 0
        const osc = slots?.payOsc || ''
        const cash = Number(slots?.payCash) || 0
        const backToPay = {
            intent: BOT_INTENT.BOOKING_GUIDE,
            step: 'collect-payment',
            slots: { payOrderId: orderId, payAmount: amount, payOsc: osc },
        }
        const failReply = (err) => ({
            replies: [`I couldn't complete it — ${err}. You can pay by card, or I can connect you to a person.`],
            state: backToPay,
        })
        if (this.isAffirmative(text)) {
            const r = await this._settleWalletCharge({ userId, orderId, useCredit: true })
            return r.ok ? { replies: [this._walletPaidReply(amount, osc, r.creditApplied)] } : failReply(r.error)
        }
        if (this.isNegative(text)) {
            if (cash >= amount) {
                const r = await this._settleWalletCharge({ userId, orderId, useCredit: false })
                return r.ok ? { replies: [this._walletPaidReply(amount, osc, r.creditApplied)] } : failReply(r.error)
            }
            return {
                replies: [`No problem — but your cash balance (${naira(cash)}) alone won't cover ${naira(amount)}. Would you like to use your reward credit after all, or pay by card?`],
                state: backToPay,
            }
        }
        // unclear → re-ask (loop guard escalates if it repeats)
        return {
            replies: [`Use your reward credit toward order ${osc}? (yes/no)`],
            state: {
                intent: BOT_INTENT.BOOKING_GUIDE,
                step: 'confirm-credit',
                slots: { payOrderId: orderId, payAmount: amount, payOsc: osc, payCash: cash },
            },
        }
    }

    // Available wallet value = cash balance + usable reward credit. Uses the
    // CANONICAL credit source (WalletCreditService.getCreditBalances) so this
    // "do you have enough?" check can never drift from what chargeWalletForOrder
    // actually consumes (same ACTIVE / remaining>0 / not-expired filter).
    async _walletAvailable(userId) {
        const wallet = await WalletModel.findOne({ userId }).lean()
        const cash = wallet?.balance || 0
        const { total: creditTotal } = await WalletCreditService.getCreditBalances(userId)
        return { cash, creditTotal, available: cash + creditTotal }
    }

    // "Use my balance / wallet" — settle the customer's latest UNPAID order from
    // their wallet (credits first, then cash), behind an explicit confirm. Goes
    // through the existing WalletService.payWithWallet path (same charge/receipt/
    // notification as the app). The bot never edits balances or adds money — it
    // only spends what's already there, on the customer's own order.
    async applyPaymentFlow({ convo, userId, text, slots, step }) {
        // apply-payment success/failure reply (own wording; shares the charge helper)
        const applyPaidReply = async (orderId, useCredit) => {
            const r = await this._settleWalletCharge({ userId, orderId, useCredit })
            if (r.ok) {
                const note = r.creditApplied > 0 ? ` (${naira(r.creditApplied)} from your reward credit)` : ''
                return { replies: [`Paid ✅ — your wallet covered the order${note}. Thank you!`] }
            }
            return {
                replies: [`I couldn't complete it — ${r.error}. You can top up your wallet in the app, or I can connect you to a person.`],
                state: { intent: BOT_INTENT.APPLY_PAYMENT, step: 'offered-handoff', slots: {} },
            }
        }

        // confirm turn: on yes, ask the credit opt-in first (only if they have credit)
        if (step === 'confirm-pay') {
            const orderId = slots?.payOrderId
            const amount = Number(slots?.payAmount) || 0
            const osc = slots?.payOsc || ''
            if (this.isNegative(text)) {
                return { replies: ["Okay — I won't touch your wallet. Anything else?"] }
            }
            if (this.isAffirmative(text) && orderId) {
                const { cash, creditTotal } = await this._walletAvailable(userId)
                if (creditTotal > 0) {
                    return {
                        replies: [`You have ${naira(creditTotal)} in reward credit. Use it toward this ${naira(amount)}? (yes/no)`],
                        state: { intent: BOT_INTENT.APPLY_PAYMENT, step: 'confirm-pay-credit', slots: { payOrderId: orderId, payAmount: amount, payOsc: osc, payCash: cash } },
                    }
                }
                return await applyPaidReply(orderId, false)
            }
            // unclear reply → fall through and re-summarise
        }

        // credit opt-in turn: yes → credit-first; no → cash only (if it covers)
        if (step === 'confirm-pay-credit') {
            const orderId = slots?.payOrderId
            const amount = Number(slots?.payAmount) || 0
            const cash = Number(slots?.payCash) || 0
            if (this.isAffirmative(text) && orderId) {
                return await applyPaidReply(orderId, true)
            }
            if (this.isNegative(text) && orderId) {
                if (cash >= amount) return await applyPaidReply(orderId, false)
                return {
                    replies: [`Without your reward credit, your ${naira(cash)} cash won't cover ${naira(amount)}. You can top up in the app, or I can connect you to a person.`],
                    state: { intent: BOT_INTENT.APPLY_PAYMENT, step: 'offered-handoff', slots: {} },
                }
            }
            return {
                replies: ['Use your reward credit toward the order? (yes/no)'],
                state: { intent: BOT_INTENT.APPLY_PAYMENT, step: 'confirm-pay-credit', slots: { payOrderId: orderId, payAmount: amount, payOsc: slots?.payOsc || '', payCash: cash } },
            }
        }

        // find the latest unpaid, non-cancelled order
        const order = await BookOrderModel.findOne({
            userId,
            paymentStatus: { $ne: PAYMENT_ORDER_STATUS.SUCCESS },
            'stage.status': { $ne: ORDER_STATUS.CANCELLED },
        })
            .sort({ createdAt: -1 })
            .lean()
        if (!order) {
            return {
                replies: ["You don't have any unpaid orders right now — nothing to pay. Anything else?"],
            }
        }
        if (!order.amount || order.amount <= 0) {
            return {
                replies: [`Order ${order.oscNumber} is already fully covered — there's nothing left to pay.`],
            }
        }

        // available wallet value (cash + active reward credit)
        const { cash, creditTotal, available } = await this._walletAvailable(userId)

        const lines = [
            `Order ${order.oscNumber} comes to ${naira(order.amount)}.`,
            `Your wallet has ${naira(cash)} cash${creditTotal ? ` + ${naira(creditTotal)} reward credit` : ''} (${naira(available)} available).`,
        ]
        if (available < order.amount) {
            lines.push(
                `That's not quite enough to cover it. You can top up in the app${creditTotal ? ' — your reward credit is used first' : ''}. Would you like me to connect you to a person?`,
            )
            return {
                replies: [lines.join('\n')],
                state: { intent: BOT_INTENT.APPLY_PAYMENT, step: 'offered-handoff', slots: {} },
            }
        }
        lines.push('Shall I pay it from your wallet now? (yes/no)')
        return {
            replies: [lines.join('\n')],
            state: {
                intent: BOT_INTENT.APPLY_PAYMENT,
                step: 'confirm-pay',
                slots: { payOrderId: String(order._id), payAmount: order.amount, payOsc: order.oscNumber },
            },
        }
    }

    // ─── Phase C: open a complaint (bot logs + routes to CX; never resolves) ──
    //
    // Guided: identify the order → dedupe against an open case → pick a complaint
    // type (auto-match or ask from the active catalog) → optional photo → confirm
    // → RecoveryService.openCase. The bot NEVER resolves, compensates, or judges —
    // it opens the case and hands it to Customer Experience.
    async complaintFlow({ convo, userId, text, slots, attachments = [], step }) {
        let description = slots.cDescription || null
        let typeId = slots.cTypeId || null
        let typeName = slots.cTypeName || null
        let orderId = slots.cOrderId || null
        let oscNumber = slots.cOsc || null
        let photos = Array.isArray(slots.cPhotos) ? slots.cPhotos : []

        // fold in any photo(s) attached this turn
        const newPhotos = (attachments || []).filter((u) => typeof u === 'string' && u.trim())
        if (newPhotos.length) photos = [...photos, ...newPhotos]

        const persist = (nextStep) => ({
            intent: BOT_INTENT.FILE_COMPLAINT,
            step: nextStep,
            slots: {
                cDescription: description,
                cTypeId: typeId,
                cTypeName: typeName,
                cOrderId: orderId,
                cOsc: oscNumber,
                cPhotos: photos,
            },
        })

        // ── first entry: capture description, find order, dedupe, match type ──
        if (!step) {
            description = String(text || '').trim()
            const order = await BookOrderModel.findOne({ userId }).sort({ createdAt: -1 }).lean()
            if (!order) {
                return {
                    replies: [
                        "I'm sorry there's a problem. I couldn't find an order on your account to attach this to — let me connect you to a person who can help.",
                    ],
                    handoff: true,
                }
            }
            orderId = String(order._id)
            oscNumber = order.oscNumber

            const open = await ComplaintCaseModel.findOne({
                userId,
                status: {
                    $nin: [COMPLAINT_STATUS.CLOSED, COMPLAINT_STATUS.CUSTOMER_CONFIRMED],
                },
            })
                .sort({ createdAt: -1 })
                .lean()
            if (open) {
                return {
                    replies: [
                        "I can see you already have a complaint with us that's still being handled, so I won't open a duplicate — our Customer Experience team is on it. Would you like me to connect you to a person for an update?",
                    ],
                    state: { intent: BOT_INTENT.FILE_COMPLAINT, step: 'offered-handoff', slots: {} },
                }
            }

            const types = await ComplaintTypeModel.find({ active: true }).lean()
            if (!types.length) {
                return {
                    replies: [
                        "I'm sorry about that. Let me connect you to a person who can log this properly.",
                    ],
                    handoff: true,
                }
            }
            const matched = this._matchComplaintType(description, types)
            if (matched) {
                typeId = String(matched._id)
                typeName = matched.name
                return {
                    replies: [
                        `I'm sorry about that. I'll log a "${typeName}" complaint for order ${oscNumber}. If you have a photo of the issue, send it now — or say "skip".`,
                    ],
                    state: persist('collect-photo'),
                }
            }
            const list = types.map((t, i) => `${i + 1}. ${t.name}`).join('\n')
            return {
                replies: [
                    `I'm sorry to hear that — I'll log a complaint for order ${oscNumber}. Which best describes the issue?\n${list}\n(reply with the number or the name)`,
                ],
                state: persist('collect-type'),
            }
        }

        // ── pick a type from the catalog ──
        if (step === 'collect-type') {
            const types = await ComplaintTypeModel.find({ active: true }).lean()
            const picked = this._pickComplaintType(text, types)
            if (!picked) {
                const list = types.map((t, i) => `${i + 1}. ${t.name}`).join('\n')
                return {
                    replies: [`Sorry, I didn't catch which one. Please reply with the number or name:\n${list}`],
                    state: persist('collect-type'),
                }
            }
            typeId = String(picked._id)
            typeName = picked.name
            return {
                replies: ['Thanks. If you have a photo of the issue, send it now — or say "skip".'],
                state: persist('collect-photo'),
            }
        }

        // ── optional photo → move to confirm ──
        if (step === 'collect-photo') {
            return {
                replies: [this._complaintSummary({ oscNumber, typeName, description, photos })],
                state: persist('confirm'),
            }
        }

        // ── confirm → open the case ──
        if (step === 'confirm') {
            if (this.isNegative(text)) {
                return { replies: ["Okay, I haven't logged it. Tell me if you'd like to change anything."] }
            }
            if (this.isAffirmative(text)) {
                let complaint
                try {
                    complaint = await RecoveryService.openCase({
                        userId,
                        orderId,
                        complaintTypeIds: [typeId],
                        description: description || 'Complaint raised via assistant',
                        photos,
                    })
                } catch (e) {
                    return {
                        replies: [
                            `I couldn't log the complaint just now (${e.message}). Let me connect you to a person.`,
                        ],
                        handoff: true,
                    }
                }
                try {
                    await createAuditLog({
                        userId,
                        action: `Bot opened complaint ${complaint._id} for order ${oscNumber} on customer request`,
                        category: AUDIT_LOG_CATEGORIES.RECOVERY,
                        orderId,
                    })
                } catch (_) {
                    /* audit best-effort; the case + statusHistory + notifications are the trail */
                }
                return {
                    replies: [
                        `Done — I've logged your complaint for order ${oscNumber}. Our Customer Experience team will review it and reach out to you. I'm sorry again for the trouble.`,
                    ],
                }
            }
            return {
                replies: [this._complaintSummary({ oscNumber, typeName, description, photos })],
                state: persist('confirm'),
            }
        }

        return {
            replies: ["I'm sorry about that — let me connect you to a person."],
            handoff: true,
        }
    }

    _complaintSummary({ oscNumber, typeName, description, photos }) {
        return [
            "Here's the complaint I'll log:",
            `• Order: ${oscNumber}`,
            `• Issue: ${typeName}`,
            `• Details: ${description}`,
            `• Photos: ${photos.length ? `${photos.length} attached` : 'none'}`,
            'Shall I submit it? (yes/no)',
        ].join('\n')
    }

    // Best-effort auto-match of the description to a complaint type (confirmed
    // later, so a loose guess is safe). Uses the type name's significant words.
    _matchComplaintType(text, types) {
        const t = String(text || '').toLowerCase()
        for (const ty of types) {
            const words = String(ty.name || '')
                .toLowerCase()
                .split(/\W+/)
                .filter((w) => w.length >= 5)
            if (words.some((w) => t.includes(w))) return ty
        }
        return null
    }

    // Resolve the customer's pick (a number or a name) to a complaint type.
    _pickComplaintType(text, types) {
        const t = String(text || '').trim().toLowerCase()
        const num = t.match(/^\s*(\d+)/)
        if (num) {
            const idx = parseInt(num[1], 10) - 1
            if (idx >= 0 && idx < types.length) return types[idx]
        }
        return (
            types.find((ty) => t.includes(String(ty.name || '').toLowerCase())) ||
            (t.length >= 3
                ? types.find((ty) => String(ty.name || '').toLowerCase().includes(t))
                : null) ||
            null
        )
    }

    // ─── Phase C: structured feedback on a delivered order ────────────────────
    //
    // Rate a delivered order (1–5 + optional comment). A positive/neutral rating
    // is recorded via FeedbackService.submitFeedback; a poor rating (≤2) offers to
    // open a complaint (routing into complaintFlow) rather than silently filing one.
    async feedbackFlow({ convo, userId, text, slots, step }) {
        if (step === 'offer-complaint') {
            if (this.isAffirmative(text)) {
                const desc = slots.fComment || text
                return await this.complaintFlow({
                    convo, userId, text: desc, slots: {}, attachments: [], step: undefined,
                })
            }
            return {
                replies: ["Okay — thanks for the honest feedback, I've noted it. Anything else I can help with?"],
            }
        }

        if (step === 'collect-rating') {
            const rating = this._parseRating(text)
            const comment = String(text || '').trim()
            if (!rating) {
                return {
                    replies: ['Please give a rating from 1 to 5 (5 = great), and a comment if you like.'],
                    state: { intent: BOT_INTENT.SUBMIT_FEEDBACK, step: 'collect-rating', slots },
                }
            }
            if (rating <= 2) {
                return {
                    replies: [
                        `Sorry it wasn't good (${rating}/5). Would you like me to log a complaint so our team can make it right? (yes/no)`,
                    ],
                    state: {
                        intent: BOT_INTENT.SUBMIT_FEEDBACK,
                        step: 'offer-complaint',
                        slots: { fOrderId: slots.fOrderId, fOsc: slots.fOsc, fComment: comment },
                    },
                }
            }
            const type = rating >= 4 ? FEEDBACK_TYPE.SATISFIED : FEEDBACK_TYPE.NEUTRAL
            let result
            try {
                result = await new FeedbackService().submitFeedback({
                    body: { bookOrderId: slots.fOrderId, type, rating, comment },
                    user: { id: userId },
                })
            } catch (e) {
                result = { success: false, data: { error: e.message } }
            }
            if (result?.success) {
                try {
                    await createAuditLog({
                        userId,
                        action: `Bot recorded ${rating}/5 feedback for order ${slots.fOsc}`,
                        category: AUDIT_LOG_CATEGORIES.SYSTEM,
                        orderId: slots.fOrderId,
                    })
                } catch (_) {
                    /* best-effort */
                }
                return {
                    replies: [`Thank you! I've recorded your ${rating}/5 rating for order ${slots.fOsc}. We appreciate it. 🙏`],
                }
            }
            const err = (result && result.data && result.data.error) || 'I could not save that'
            return { replies: [`Thanks for the feedback. (${err})`] }
        }

        // start: find a delivered order to review
        const order = await BookOrderModel.findOne({
            userId,
            'stage.status': ORDER_STATUS.DELIVERED,
        })
            .sort({ createdAt: -1 })
            .lean()
        if (!order) {
            return {
                replies: [
                    "I don't see a delivered order to review yet — once your laundry is delivered you can rate it here. Anything else?",
                ],
            }
        }
        return {
            replies: [`How was order ${order.oscNumber}? Give it 1–5 (5 = great), and add a comment if you'd like.`],
            state: {
                intent: BOT_INTENT.SUBMIT_FEEDBACK,
                step: 'collect-rating',
                slots: { fOrderId: String(order._id), fOsc: order.oscNumber },
            },
        }
    }

    // Parse a 1–5 rating from a free-text reply (digit, stars, or sentiment words).
    _parseRating(text) {
        const t = String(text || '')
        const m = t.match(/\b([1-5])\b(?:\s*(?:\/|out of)\s*5)?/)
        if (m) return parseInt(m[1], 10)
        const stars = (t.match(/★|⭐/g) || []).length
        if (stars >= 1 && stars <= 5) return stars
        if (/\b(excellent|great|perfect|amazing|love|wonderful)\b/i.test(t)) return 5
        if (/\b(good|nice|happy|satisfied|clean)\b/i.test(t)) return 4
        if (/\b(ok|okay|fine|average|alright)\b/i.test(t)) return 3
        if (/\b(bad|poor|late|terrible|awful|disappointed|rude|not good)\b/i.test(t)) return 2
        return null
    }

    // Resolve "6 shirts, 3 trousers" → catalog-priced items. Returns matched
    // (priced) items and any names we don't carry.
    _resolveBookingItems(rawItems, catalog) {
        const priced = []
        const unmatched = []
        for (const it of rawItems || []) {
            const type = String(it.type || '').toLowerCase().trim()
            const qty = Math.max(1, Math.round(Number(it.quantity) || 1))
            if (!type) continue
            const m =
                catalog.find((c) => (c.name || '').toLowerCase() === type) ||
                catalog.find(
                    (c) =>
                        type.includes((c.name || '').toLowerCase()) ||
                        (c.name || '').toLowerCase().includes(type),
                )
            if (m) priced.push({ type: m.name, price: m.price, quantity: qty })
            else unmatched.push(it.type)
        }
        return { priced, unmatched }
    }

    // Offline fallback item parser ("6 shirts and 3 trousers") for when the LLM
    // isn't available to structure slots.items.
    _parseItemsFromText(text, catalog) {
        // Digits AND spelled-out numbers, incl. tens/compounds ("2 shirts,
        // two duvets, thirty-five towels, fifty shorts").
        const tens = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety'
        const teens = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen'
        const ones = 'one|two|three|four|five|six|seven|eight|nine'
        // tens (+ optional ones) matched first so "thirty five" is one number.
        const numWord = `(?:${tens})(?:[\\s-](?:${ones}))?|${teens}|${ones}`
        const re = new RegExp(`\\b(\\d+|${numWord})\\s+([a-zA-Z]+)`, 'gi')
        const out = []
        let m
        while ((m = re.exec(String(text || '')))) {
            const q = this._wordToNumber(m[1])
            if (!q) continue
            out.push({ type: m[2].toLowerCase(), quantity: q })
        }
        return out
    }

    // Parse a number written as digits or words ("35", "thirty-five", "fifty",
    // "seven") to an integer; null if any token isn't a known number word.
    _wordToNumber(str) {
        const s = String(str || '').toLowerCase().trim()
        if (/^\d+$/.test(s)) return parseInt(s, 10)
        const map = {
            one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
            ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
            sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
            twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
        }
        let total = 0
        for (const tok of s.split(/[\s-]+/)) {
            if (map[tok] == null) return null
            total += map[tok]
        }
        return total || null
    }

    // Part A: pull a day phrase and/or time-of-day from free text, WITHOUT
    // swallowing the whole message. Returns { datePhrase, timePhrase } (either
    // may be null). _resolvePickupDate turns datePhrase into a real Date.
    _parseDateTimeFromText(text) {
        const t = String(text || '').toLowerCase()
        let datePhrase = null
        if (/\bday after tomorrow\b/.test(t)) datePhrase = 'day after tomorrow'
        else if (/\btomorrow\b/.test(t)) datePhrase = 'tomorrow'
        else if (/\btoday\b/.test(t)) datePhrase = 'today'
        else {
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
            for (const d of days) {
                if (new RegExp(`\\b${d}\\b`).test(t)) { datePhrase = d; break }
            }
        }
        let timePhrase = null
        const clock = t.match(/\b(\d{1,2})(:\d{2})?\s*(am|pm)\b/)
        if (clock) timePhrase = clock[0].replace(/\s+/g, '')
        else if (/\bmorning\b/.test(t)) timePhrase = 'morning'
        else if (/\bafternoon\b/.test(t)) timePhrase = 'afternoon'
        else if (/\bevening\b/.test(t)) timePhrase = 'evening'
        else if (/\bnight\b/.test(t)) timePhrase = 'night'
        else if (/\bnoon\b|\bmidday\b|\bmid-day\b/.test(t)) timePhrase = 'noon'
        return { datePhrase, timePhrase }
    }

    // Default pickup window when the customer gives a day but no time. Uses the
    // first configured pickup slot if present, else a sensible "morning".
    _defaultPickupWindow(setting) {
        const slots = setting?.pickupTimes || setting?.pickupTimeSlots || setting?.pickupSlots
        if (Array.isArray(slots) && slots.length) {
            const first = slots[0]
            return typeof first === 'string' ? first : first?.label || first?.name || 'morning'
        }
        return 'morning'
    }

    // Map the customer's words to one of the configured service-type names.
    _matchServiceType(text, setting) {
        const t = String(text || '').toLowerCase()
        const names = (setting?.serviceTypes || []).map((s) => s.name)
        const want = (n) => (names.includes(n) ? n : null)
        if (/\bdry\s*clean/.test(t)) return want('dry-clean')
        if (/\bwash\b.*\biron\b|\bwash and iron\b|\bwash & iron\b/.test(t)) return want('wash-and-iron')
        if (/\biron(ing)?\s*only\b|\bjust iron\b|\bonly iron/.test(t)) return want('ironing-only')
        if (/\bwash(ing)?\s*only\b|\bjust wash\b|\bonly wash/.test(t)) return want('washing-only')
        if (/\biron/.test(t)) return want('ironing-only')
        if (/\bwash/.test(t)) return want('wash-and-iron')
        return null
    }

    // Estimate for the confirm prompt — same per-piece math as pricing/booking
    // (classic tier) plus pickup/delivery fees. Clearly labelled an estimate;
    // the authoritative total comes from the placed order's receipt.
    _bookingEstimate(priced, serviceType, setting, speed) {
        const svc =
            (setting?.serviceTypes || []).find((s) => s.name === serviceType) ||
            (setting?.serviceTypes || [])[0]
        const per = svc ? svc.pricePerPiece || 0 : 0
        let sum = 0
        for (const i of priced) sum += roundToNearestHundred((i.price || 0) * per) * i.quantity
        sum += (setting?.pickupFee || 0) + (setting?.deliveryFee || 0)
        sum += this._speedCharge(speed, setting)
        return sum
    }

    // Speed surcharge (0 for standard / unknown).
    _speedCharge(speed, setting) {
        if (speed === DELIVERY_SPEED.EXPRESS) return setting?.expressCharge || 0
        if (speed === DELIVERY_SPEED.SAME_DAY) return setting?.sameDayCharge || 0
        return 0
    }

    // 'same-day' | 'express' | 'standard' | null — the customer's chosen speed.
    _parseDeliverySpeed(text) {
        const t = String(text || '').toLowerCase()
        if (/same.?day|\btoday\b/.test(t)) return DELIVERY_SPEED.SAME_DAY
        // standard BEFORE express so "no rush" isn't caught by express's "rush".
        if (/standard|normal|regular|cheap|no rush|not in a hurry|whenever|\bslow\b/.test(t)) return DELIVERY_SPEED.STANDARD
        if (/express|urgent|\bfast\b|\brush\b|\bquick/.test(t)) return DELIVERY_SPEED.EXPRESS
        return null
    }

    // Speeds available at the current clock time (uses the backend cutoff rule via
    // calculateDueDate, so the bot never offers something that would be blocked),
    // each with its charge + a human ETA. Standard is always available.
    _availableSpeeds(setting) {
        const out = []
        if (calculateDueDate(DELIVERY_SPEED.SAME_DAY)) {
            out.push({ speed: DELIVERY_SPEED.SAME_DAY, label: 'Same-day', charge: setting?.sameDayCharge || 0, eta: 'ready today' })
        }
        if (calculateDueDate(DELIVERY_SPEED.EXPRESS)) {
            out.push({ speed: DELIVERY_SPEED.EXPRESS, label: 'Express', charge: setting?.expressCharge || 0, eta: 'ready tomorrow' })
        }
        out.push({ speed: DELIVERY_SPEED.STANDARD, label: 'Standard', charge: 0, eta: 'ready in about 2 days' })
        return out
    }

    _speedOfferText(avail) {
        const lines = avail.map((s) => {
            const price = s.charge > 0 ? ` (+${naira(s.charge)})` : ' (free)'
            return `• ${s.label}${price} — ${s.eta}`
        })
        return `How soon do you need it?\n${lines.join('\n')}\nReply with one — or "standard" if you're not in a hurry.`
    }

    // One-line speed description for the confirm summary.
    _describeSpeed(speed, setting) {
        const map = {
            [DELIVERY_SPEED.SAME_DAY]: { label: 'Same-day', eta: 'ready today' },
            [DELIVERY_SPEED.EXPRESS]: { label: 'Express', eta: 'ready tomorrow' },
            [DELIVERY_SPEED.STANDARD]: { label: 'Standard', eta: 'ready in about 2 days' },
        }
        const d = map[speed] || map[DELIVERY_SPEED.STANDARD]
        const charge = this._speedCharge(speed, setting)
        return `${d.label}${charge > 0 ? ` (+${naira(charge)})` : ''} — ${d.eta}`
    }

    // Resolve a simple day phrase to a real Date (today / tomorrow / weekday);
    // returns null for anything we can't safely parse (the order still stores
    // the phrase-free fields and staff coordinate exact timing).
    _resolvePickupDate(phrase) {
        const p = String(phrase || '').toLowerCase()
        if (!p) return null
        const atNoon = (d) => {
            d.setHours(12, 0, 0, 0)
            return d
        }
        const now = new Date()
        if (/\btoday\b/.test(p)) return atNoon(new Date(now))
        if (/\bday after tomorrow\b|\bovermorrow\b/.test(p)) {
            const d = new Date(now)
            d.setDate(d.getDate() + 2)
            return atNoon(d)
        }
        if (/\btomorrow\b/.test(p)) {
            const d = new Date(now)
            d.setDate(d.getDate() + 1)
            return atNoon(d)
        }
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
        for (let i = 0; i < 7; i++) {
            if (new RegExp(`\\b${days[i]}\\b`).test(p)) {
                const d = new Date(now)
                const diff = ((i - d.getDay() + 7) % 7) || 7
                d.setDate(d.getDate() + diff)
                return atNoon(d)
            }
        }
        return null
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

        // (4) Phone OTP verification turn — the pending number is only written once
        // the customer proves they own it by entering the code we texted. The code
        // is parsed from THIS message (not slots), and the pending number lives
        // under `pendingPhone` so the classifier can't clobber it.
        if (step === 'verify-phone-otp' && slots.field === 'phone') {
            if (this.isNegative(text)) {
                return { replies: ["Okay, I've left your phone number unchanged."] }
            }
            const code = (String(text || '').match(/\d{3,8}/) || [])[0]
            const expired = !slots.otpExpires || Date.now() > Number(slots.otpExpires)
            if (expired) {
                return {
                    replies: ["That code has expired. Tell me the new number again and I'll send a fresh code."],
                    state: {
                        intent: BOT_INTENT.UPDATE_DETAILS,
                        step: 'awaiting-value',
                        slots: { field: 'phone' },
                    },
                }
            }
            if (!code || code !== String(slots.otp)) {
                return {
                    replies: ["That code doesn't match. Please enter the code I sent (or say cancel)."],
                    state: { intent: BOT_INTENT.UPDATE_DETAILS, step: 'verify-phone-otp', slots },
                }
            }
            await UserModel.updateOne({ _id: userId }, { $set: { phoneNumber: slots.pendingPhone } })
            try {
                await createAuditLog({
                    userId,
                    action: 'Bot updated phone number after OTP verification',
                    category: AUDIT_LOG_CATEGORIES.USER,
                })
            } catch (_) {
                /* best-effort */
            }
            return { replies: [`Verified ✅ — your phone number is now "${slots.pendingPhone}".`] }
        }

        // (3) Confirmation turn — we already have field + value, awaiting yes/no.
        if (step === 'awaiting-confirm' && slots.field && slots.value) {
            if (this.isAffirmative(text)) {
                // Phone changes require OTP verification before we write anything.
                if (slots.field === 'phone') {
                    return await this._startPhoneOtp(slots.value)
                }
                await UserModel.updateOne(
                    { _id: userId },
                    { $set: { defaultPickupAddress: slots.value } },
                )
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

    // Send a one-time code to the NEW number and await it. If the SMS can't be
    // delivered we do NOT change the number — we hand off so a human can verify
    // it safely. The code lives on botState only for the flow (short-lived).
    async _startPhoneOtp(newPhone) {
        const otp = generateOTP()
        const otpExpires = Date.now() + 5 * 60 * 1000 // 5 minutes
        try {
            await sendSmsOtp(newPhone, otp)
        } catch (e) {
            return {
                replies: [
                    "I couldn't send a verification code to that number right now, so I won't change it. Let me connect you to a person to update it safely.",
                ],
                handoff: true,
            }
        }
        return {
            replies: [`To confirm it's really your number, I've sent a code to ${newPhone}. What's the code?`],
            state: {
                intent: BOT_INTENT.UPDATE_DETAILS,
                step: 'verify-phone-otp',
                slots: { field: 'phone', pendingPhone: newPhone, otp: String(otp), otpExpires },
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
            'answer questions about prices, services and turnaround, book a pickup, check your order status and payment, ' +
            'pay an order from your wallet, see your wallet balance, view offers, get your referral code/level and reward status, ' +
            'apply a referral code, log a complaint or feedback, or update your phone/pickup address'
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
