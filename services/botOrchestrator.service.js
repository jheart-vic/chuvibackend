const ConversationService = require('./conversation.service')
const BotIntentService = require('./botIntent.service')
const BotContextService = require('./botContext.service')
const ReferralService = require('./referral.service')
const OfferService = require('./offer.service')
const BookOrderService = require('./bookOrder.service')
const WalletModel = require('../models/wallet.model')
const WalletCreditModel = require('../models/walletCredit.model')
const BookOrderModel = require('../models/bookOrder.model')
const UserModel = require('../models/user.model')
const AdminSettingModel = require('../models/adminSetting.model')
const OrderItemModel = require('../models/orderItem.model')
const createNotification = require('../util/createNotification')
const { roundToNearestHundred } = require('../util/helper')
const { emitChatMessage } = require('../config/socket')
const {
    BOT_INTENT,
    CHAT_SENDER,
    CREDIT_STATUS,
    CONVERSATION_TYPE,
    NOTIFICATION_TYPE,
    PAYMENT_ORDER_STATUS,
    PICKUP_STATUS,
    DELIVERY_STATUS,
    ORDER_STATUS,
    REFERRAL_REWARD_STATUS,
} = require('../util/constants')

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
            case BOT_INTENT.REWARD_STATUS:
                return { replies: [await this.rewardStatusReply(userId)] }
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
        let bPhone = slots.bPhone || null
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
        if (!bDate) bDate = slots.pickupDate || (step === 'collect-datetime' ? String(text || '').trim() : null)
        if (!bTime) bTime = slots.pickupTime || null
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
                bPhone,
            },
        })

        // ── confirm step: yes places it, no cancels, anything else re-checks ──
        if (step === 'confirm') {
            if (this.isNegative(text)) {
                return {
                    replies: ["No problem — I've cancelled that. Tell me what you'd like to change or add."],
                }
            }
            if (this.isAffirmative(text)) {
                return await this._placeBooking({
                    userId, bItems, bServiceType, bAddress, bDate, bTime, bPhone,
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
        if (!bDate || !bTime) {
            return {
                replies: ['When should we come? Give me a day and rough time — e.g. "tomorrow morning".'],
                state: persist('collect-datetime'),
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
        const estimate = this._bookingEstimate(bItems, bServiceType, setting)
        const itemsLine = bItems
            .map((i) => `${i.quantity} ${i.type}${i.quantity > 1 ? 's' : ''}`)
            .join(', ')
        const summary = [
            "Here's your booking:",
            `• Items: ${itemsLine}`,
            `• Service: ${bServiceType} (classic tier)`,
            `• Pickup: ${bAddress}${bDate ? `, ${bDate}` : ''}${bTime ? ` ${bTime}` : ''}`,
            `• Delivery: standard`,
            `Estimated total: about ${naira(estimate)} — you'll see the exact amount once it's placed, and you can pay in the app or from your wallet.`,
            'Shall I place it? (yes/no)',
        ].join('\n')
        return { replies: [summary], state: persist('confirm') }
    }

    // Build the payload and place the order through the shared booking path.
    async _placeBooking({ userId, bItems, bServiceType, bAddress, bDate, bTime, bPhone }) {
        const defaults = await BotContextService.savedDefaults(userId)
        const phone = bPhone || defaults.phoneNumber
        const payload = {
            fullName: defaults.fullName || 'Customer',
            phoneNumber: phone,
            serviceType: bServiceType,
            serviceTier: 'classic',
            billingType: 'pay-per-item',
            deliverySpeed: 'standard',
            isDelivery: true,
            isPickUp: true,
            items: (bItems || []).map((i) => ({
                type: i.type,
                price: Math.round(i.price) || 0,
                quantity: Math.max(1, Math.round(i.quantity) || 1),
            })),
            pickupAddress: bAddress,
        }
        if (bTime) payload.pickupTime = bTime
        const day = this._resolvePickupDate(bDate)
        if (day) payload.pickupDate = day

        let result
        try {
            result = await new BookOrderService().createOrder({ userId, payload })
        } catch (e) {
            result = { success: false, data: { error: e.message } }
        }
        if (result?.success) {
            const order = result.data?.order
            return {
                replies: [
                    `Done! Your order ${order?.oscNumber || ''} is placed ✅. Total ${naira(order?.amount)}. We'll arrange your pickup shortly — you can pay in the app, or say "use my wallet" and I'll apply your balance.`,
                ],
            }
        }
        const err = result?.data?.error
        const msg = typeof err === 'string' ? err : 'something went wrong on our side'
        return {
            replies: [
                `I couldn't place the order — ${msg}. Would you like me to connect you to a person?`,
            ],
            state: { intent: BOT_INTENT.BOOKING_GUIDE, step: 'offered-handoff', slots: {} },
        }
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
        const out = []
        const re = /(\d+)\s+([a-zA-Z]+)/g
        let m
        while ((m = re.exec(String(text || '')))) {
            out.push({ type: m[2].toLowerCase(), quantity: parseInt(m[1], 10) })
        }
        return out
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
    _bookingEstimate(priced, serviceType, setting) {
        const svc =
            (setting?.serviceTypes || []).find((s) => s.name === serviceType) ||
            (setting?.serviceTypes || [])[0]
        const per = svc ? svc.pricePerPiece || 0 : 0
        let sum = 0
        for (const i of priced) sum += roundToNearestHundred((i.price || 0) * per) * i.quantity
        sum += (setting?.pickupFee || 0) + (setting?.deliveryFee || 0)
        return sum
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
            'answer questions about prices, services and turnaround, check your order status and payment, ' +
            'see your wallet balance, view offers, get your referral code/level and reward status, ' +
            'apply a referral code, or update your phone/pickup address'
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
