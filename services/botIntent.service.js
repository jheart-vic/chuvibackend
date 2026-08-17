const { BOT_INTENT } = require('../util/constants')

// The ONLY place an LLM is used in the in-app bot. The LLM does exactly one job:
// map a free-text customer message to ONE of the fixed BOT_INTENT values and pull
// out obvious slots. It never decides business outcomes and never takes actions —
// a deterministic workflow does that afterwards (services/botOrchestrator.service.js).
//
// Provider is configurable so we can run on OpenAI now and switch back to
// Anthropic later without touching the orchestrator:
//   BOT_PROVIDER = openai | anthropic   (optional — auto-detected from keys)
//   OpenAI:    OPENAI_API_KEY, OPENAI_MODEL   (default gpt-4o-mini)
//   Anthropic: ANTHROPIC_API_KEY, BOT_MODEL   (default claude-haiku-4-5)
// If no provider/key is available or the call fails, we fall back to a keyword
// matcher so the bot degrades to a guided menu instead of breaking (client rule:
// never hard-fail).
class BotIntentService {
    constructor() {
        this._client = null
        this._sdkTried = false
    }

    // Which provider to use: explicit BOT_PROVIDER wins, otherwise infer from the
    // key that is present (OpenAI preferred while Anthropic billing is paused).
    get provider() {
        const explicit = (process.env.BOT_PROVIDER || '').toLowerCase()
        if (explicit === 'openai' || explicit === 'anthropic') return explicit
        if (process.env.OPENAI_API_KEY) return 'openai'
        if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
        return null
    }

    get model() {
        return this.provider === 'anthropic'
            ? process.env.BOT_MODEL || 'claude-haiku-4-5'
            : process.env.OPENAI_MODEL || 'gpt-4o-mini'
    }

    // Lazily build (and cache) the SDK client for the active provider.
    client() {
        if (this._sdkTried) return this._client
        this._sdkTried = true
        const provider = this.provider
        try {
            if (provider === 'anthropic') {
                if (!process.env.ANTHROPIC_API_KEY) return null
                const Anthropic = require('@anthropic-ai/sdk')
                this._client = new Anthropic() // reads ANTHROPIC_API_KEY
            } else if (provider === 'openai') {
                if (!process.env.OPENAI_API_KEY) return null
                const OpenAI = require('openai')
                this._client = new OpenAI() // reads OPENAI_API_KEY
            }
        } catch (err) {
            console.warn(`${provider} SDK unavailable, using rules fallback:`, err.message)
            this._client = null
        }
        return this._client
    }

    get intents() {
        return Object.values(BOT_INTENT)
    }

    // Shared JSON schema for the structured classification output.
    get schema() {
        return {
            type: 'object',
            properties: {
                intent: { type: 'string', enum: this.intents },
                intents: {
                    type: 'array',
                    description:
                        'ALL intents present in the message, most important first, when the customer asks for more than one thing (e.g. balance AND order status). Include `intent` as the first element. Omit or single-element when only one thing is asked.',
                    items: { type: 'string', enum: this.intents },
                },
                confidence: { type: 'number', description: '0..1 confidence' },
                slots: {
                    type: 'object',
                    description:
                        'Optional values extracted from the message. Only fill a field when the customer actually stated it — never guess or invent. Leave unknown fields out.',
                    properties: {
                        orderNumber: {
                            type: 'string',
                            description: 'An order reference the customer named (e.g. OSC1234).',
                        },
                        code: { type: 'string', description: 'A referral/promo code.' },
                        field: { type: 'string', description: 'phone | pickupAddress' },
                        value: { type: 'string' },
                        // ── booking / natural-language slots (Phase A) ──────────
                        items: {
                            type: 'array',
                            description:
                                'Laundry items the customer listed, with quantities, e.g. "6 shirts, 3 trousers, 1 hoodie".',
                            items: {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', description: 'Item name, singular (shirt, trouser, dress…).' },
                                    quantity: { type: 'number', description: 'How many of this item.' },
                                },
                            },
                        },
                        itemName: {
                            type: 'string',
                            description: 'A single item the customer is asking a price/question about (e.g. "trouser").',
                        },
                        pickupDate: {
                            type: 'string',
                            description:
                                'Pickup day exactly as said — a natural phrase ("tomorrow", "tomorrow morning", "Saturday") is fine; do not convert to a calendar date.',
                        },
                        pickupTime: {
                            type: 'string',
                            description: 'Preferred time as said ("morning", "around 10", "4pm").',
                        },
                        addressRef: {
                            type: 'string',
                            description:
                                'A referenced place rather than a literal address: one of "same", "home", "office", or "other" — use "same" for "same place as last time".',
                            enum: ['same', 'home', 'office', 'other'],
                        },
                        address: {
                            type: 'string',
                            description: 'A literal address the customer typed out.',
                        },
                        amount: {
                            type: 'number',
                            description: 'A money amount the customer mentioned, in naira (digits only).',
                        },
                        text: { type: 'string' },
                    },
                },
            },
            required: ['intent', 'confidence'],
        }
    }

    systemPrompt(pendingIntent) {
        return (
            "You are the intent classifier for Chuvi Laundry's in-app customer assistant. " +
            'Classify the customer\'s latest message into EXACTLY ONE intent using the classify_intent tool. ' +
            'You never answer the customer, give advice, quote prices, or take any action — you only label the intent and extract obvious slots. ' +
            'If the customer wants a refund, compensation, money back, credit added/removed, a case resolved, or anything needing staff judgement, use "file-complaint" or "talk-to-human". ' +
            'If the customer says their ORDER, DELIVERY, or laundered ITEMS are damaged, wrong, missing, or were not received, use "file-complaint" (a clear service problem to open a case for). ' +
            'If the customer mentions losing a personal item (like their own bag), or raises a vague or out-of-scope problem you have no tool for, use "talk-to-human" — a neutral handoff; do NOT assume Chuvi is at fault or apologise. ' +
            'A plain question about where an order is or its progress/status — with nothing reported wrong — is "order-status", NOT a complaint. ' +
            // Booking: the customer wants to place/schedule an order (an action).
            'If the customer wants to BOOK or schedule a laundry pickup, place a new order, reorder, or asks you to come and carry/collect/pick up their clothes ("come carry my clothes tomorrow", "book a pickup", "I want to send my clothes", "do the usual"), use "booking-guide". ' +
            // Phase B read-only answer intents.
            'If the customer asks how much an item/service costs or about your prices, use "pricing". ' +
            'If they ask how long it takes / turnaround / when it will be ready in general, use "turnaround". ' +
            'If they ask what services, tiers, or delivery speeds you offer / how it works, use "service-info". ' +
            'If they ask about payment methods, cancellation, refunds-in-general, or pickup/delivery policy, use "policy". ' +
            'If they say they already paid or question whether a payment went through, use "payment-status". ' +
            'If they want to PAY an order using their wallet, balance, or credit ("use my balance", "use the money I have with you", "pay from my wallet"), use "apply-payment". ' +
            'If they ask where their referral reward/money is for a friend who used their code, use "reward-status". ' +
            'If the customer asks who or what you are, your name, or what you can do, use "about". ' +
            'If the customer asks for MORE THAN ONE thing (e.g. "my balance and order status"), set `intent` to the primary one AND list every applicable intent in `intents` (most important first). ' +
            'If unsure, use "unknown". ' +
            // Slot extraction (Phase A): pull out every concrete detail the
            // customer states so the assistant does not have to ask again.
            'Also extract concrete details into `slots` — items and quantities, a pickup day/time as phrased, a literal address, a place reference (addressRef: same/home/office), a single item being asked about (itemName), a money amount, an order number, or a code. ' +
            'Only fill a slot the customer actually stated; never guess, resolve, or invent. ' +
            'Do NOT try to resolve natural references like "the usual", "same as last time", "same place", "go ahead", or pronouns ("are they ready?") — for a place reference set addressRef:"same" and otherwise just classify the intent; the assistant resolves those against its own memory. ' +
            (pendingIntent
                ? `The assistant is currently in the middle of a "${pendingIntent}" flow, so a short reply likely continues it (and usually fills the detail it just asked for).`
                : '')
        )
    }

    // → { intent, intents[], confidence, slots, source: 'llm' | 'rules' }
    async classify(text, { pendingIntent } = {}) {
        const client = this.client()
        if (!client || !text || !text.trim()) {
            const r = this.rulesFallback(text)
            return { ...r, intents: [r.intent], source: 'rules' }
        }
        try {
            const parsed =
                this.provider === 'anthropic'
                    ? await this._classifyAnthropic(client, text, pendingIntent)
                    : await this._classifyOpenAI(client, text, pendingIntent)

            if (!parsed?.intent || !this.intents.includes(parsed.intent)) {
                const r = this.rulesFallback(text)
                return { ...r, intents: [r.intent], source: 'rules' }
            }
            // De-dupe + validate the multi-intent list; always lead with `intent`.
            const raw = Array.isArray(parsed.intents) ? parsed.intents : []
            const intents = [
                parsed.intent,
                ...raw.filter((i) => this.intents.includes(i)),
            ].filter((v, idx, arr) => arr.indexOf(v) === idx)
            return {
                intent: parsed.intent,
                intents,
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
                slots: parsed.slots || {},
                source: 'llm',
            }
        } catch (err) {
            console.warn('Bot intent LLM failed, using rules fallback:', err.message)
            const r = this.rulesFallback(text)
            return { ...r, intents: [r.intent], source: 'rules' }
        }
    }

    // OpenAI — Chat Completions with a forced function (tool) call.
    async _classifyOpenAI(client, text, pendingIntent) {
        const resp = await client.chat.completions.create({
            model: this.model,
            temperature: 0,
            max_tokens: 256,
            messages: [
                { role: 'system', content: this.systemPrompt(pendingIntent) },
                { role: 'user', content: text },
            ],
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'classify_intent',
                        description:
                            'Record the single best intent for the customer message plus any obvious slots.',
                        parameters: this.schema,
                    },
                },
            ],
            tool_choice: { type: 'function', function: { name: 'classify_intent' } },
        })
        const call = resp.choices?.[0]?.message?.tool_calls?.[0]
        if (!call?.function?.arguments) return null
        return JSON.parse(call.function.arguments)
    }

    // Anthropic — Messages API with a forced tool call.
    async _classifyAnthropic(client, text, pendingIntent) {
        const resp = await client.messages.create({
            model: this.model,
            max_tokens: 256,
            system: this.systemPrompt(pendingIntent),
            tools: [
                {
                    name: 'classify_intent',
                    description:
                        'Record the single best intent for the customer message plus any obvious slots.',
                    input_schema: this.schema,
                },
            ],
            tool_choice: { type: 'tool', name: 'classify_intent' },
            messages: [{ role: 'user', content: text }],
        })
        const block = (resp.content || []).find((b) => b.type === 'tool_use')
        return block?.input || null
    }

    // ─── small-talk / out-of-scope copy (LLM writes, never acts) ──────────────
    // The bot's ONLY text-generation use. It produces a short, friendly reply for
    // greetings, chit-chat, and requests outside the bot's abilities — it never
    // quotes prices, promises timelines, invents account/order details, discusses
    // policy, or claims to have done anything. All real answers/actions stay in
    // the deterministic orchestrator. Falls back to the supplied canned text when
    // no provider is configured or the call fails (never hard-fails).
    async smallTalkReply(text, { kind = 'outOfScope', fallback = '' } = {}) {
        const client = this.client()
        if (!client || !text || !text.trim()) return fallback
        try {
            const system = this.smallTalkPrompt(kind)
            const out =
                this.provider === 'anthropic'
                    ? await this._generateAnthropic(client, system, text)
                    : await this._generateOpenAI(client, system, text)
            const clean = (out || '').trim()
            return clean || fallback
        } catch (err) {
            console.warn('Bot small-talk LLM failed, using fallback:', err.message)
            return fallback
        }
    }

    smallTalkPrompt(kind) {
        const capabilities =
            'check order status, show wallet balance, view offers, share their referral code/level, ' +
            'apply a referral code, update their phone number or pickup address, guide them through booking, ' +
            'or connect them to a human'
        let base =
            "You are Chuvi Laundry's friendly in-app assistant. " +
            'Reply in ONE short, warm sentence (two at most), like a helpful human — no bullet points or lists. ' +
            `You can only help customers with: ${capabilities}. ` +
            'You must NEVER quote prices, promise delivery times, invent order or account details, discuss policies, ' +
            'or claim to have performed any action. ' +
            'If they ask for something you cannot do, kindly say so and offer to connect them to a person. ' +
            'Always nudge them toward something you can actually help with.'
        base +=
            kind === 'greeting'
                ? ' The customer greeted you or made small talk — greet them back warmly and briefly mention what you can help with.'
                : " The customer's message is outside what you can do — respond kindly and steer them back."
        return base
    }

    async _generateOpenAI(client, system, text) {
        const resp = await client.chat.completions.create({
            model: this.model,
            temperature: 0.6,
            max_tokens: 120,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: text },
            ],
        })
        return resp.choices?.[0]?.message?.content || ''
    }

    async _generateAnthropic(client, system, text) {
        const resp = await client.messages.create({
            model: this.model,
            max_tokens: 120,
            system,
            messages: [{ role: 'user', content: text }],
        })
        const block = (resp.content || []).find((b) => b.type === 'text')
        return block?.text || ''
    }

    // Deterministic keyword matcher — the safety net when the LLM is unavailable.
    // The LLM path owns the long tail of phrasings; this only needs to be
    // "good enough" and to degrade gracefully (unmatched → unknown → capabilities).
    rulesFallback(text) {
        const t = String(text || '').toLowerCase()
        const has = (...words) => words.some((w) => t.includes(w))
        // word-boundary match for short/ambiguous tokens so "hi" doesn't fire on
        // "this"/"shipping" and "yo" doesn't fire on "your".
        const hasWord = (...words) =>
            new RegExp(`\\b(?:${words.join('|')})\\b`, 'i').test(t)
        const wordCount = t.trim() ? t.trim().split(/\s+/).length : 0
        const slots = {}
        const codeMatch = t.match(/chuvi[a-z0-9]{4,}/i)
        if (codeMatch) slots.code = codeMatch[0].toUpperCase()

        let intent = BOT_INTENT.UNKNOWN
        if (has('refund', 'compensat', 'money back', 'human', 'agent', 'representative', 'speak to', 'talk to someone',
            'lost', "can't find", 'cant find'))
            // "lost"/"can't find" are ambiguous (may be a personal item, not Chuvi's
            // fault) → neutral handoff, not an apology/complaint.
            intent = BOT_INTENT.TALK_TO_HUMAN
        else if (has('complain', 'damaged', 'missing', 'not washed', 'stain', 'wrong item', 'bad',
            "didn't get", 'didnt get', "didn't receive", 'didnt receive',
            'never got', 'never received', 'never arrived', 'not delivered', 'stolen'))
            intent = BOT_INTENT.FILE_COMPLAINT
        else if (has('feedback', 'suggestion', 'review', 'rate'))
            intent = BOT_INTENT.SUBMIT_FEEDBACK
        else if (has('i paid', 'already paid', 'paid already', 'made payment', 'sent the money',
            'payment go through', 'payment went through', 'confirm my payment', 'did you get my payment', 'my transfer'))
            intent = BOT_INTENT.PAYMENT_STATUS
        else if (has('used my code', 'friend used my code', 'where is my reward', 'wheres my reward',
            "where's my reward", 'my referral reward', 'referral bonus', 'my reward'))
            intent = BOT_INTENT.REWARD_STATUS
        // cancellation is a policy question — check before order-status so
        // "can i cancel my order" isn't swallowed by the "my order" keyword.
        else if (has('cancel', 'cancellation'))
            intent = BOT_INTENT.POLICY
        // booking verbs before order-status so "book my laundry" / "come carry my
        // clothes" aren't swallowed by the "my laundry"/"my clothes" keywords.
        else if (has('book my', 'book a', 'carry my', 'come carry', 'come and carry', 'come get my',
            'collect my', 'pick up my', 'pickup my', 'send my clothes', 'the usual', 'place an order', 'new order'))
            intent = BOT_INTENT.BOOKING_GUIDE
        else if (has('where', 'status', 'my order', 'my clothes', 'my laundry', 'track', 'ready', 'arrive', 'delivered'))
            intent = BOT_INTENT.ORDER_STATUS
        // apply-payment must beat wallet-balance: "use my wallet/balance" is a pay
        // action, not a balance lookup ("what's my balance").
        else if (has('use my wallet', 'use my balance', 'use the money', 'use my money',
            'use my credit', 'use wallet', 'pay with wallet', 'pay from wallet', 'pay with my wallet',
            'pay from my wallet', 'deduct from my wallet', 'charge my wallet', 'settle from wallet'))
            intent = BOT_INTENT.APPLY_PAYMENT
        else if (has('wallet', 'balance', 'credit', 'how much do i have'))
            intent = BOT_INTENT.WALLET_BALANCE
        // pricing/turnaround/service-info/policy are checked BEFORE offers so a
        // VERB "offer" ("what do you offer") doesn't get caught by the offers
        // (noun) branch; genuine "my offers / any promo" still fall through to it.
        else if (has('how much', 'price', 'pricing', 'cost', 'how much is', 'what is the price', 'charge for', 'rate for'))
            intent = BOT_INTENT.PRICING
        else if (has('how long', 'how many days', 'turnaround', 'turn around', 'how soon', 'how fast', 'ready by'))
            intent = BOT_INTENT.TURNAROUND
        else if (has('what services', 'services do you', 'what do you offer', 'how does it work',
            'how does this work', 'service tier', 'delivery speed', 'what tiers'))
            intent = BOT_INTENT.SERVICE_INFO
        else if (has('policy', 'cancellation', 'can i cancel', 'how do i pay', 'payment method', 'how can i pay', 'ways to pay'))
            intent = BOT_INTENT.POLICY
        else if (has('offer', 'discount', 'promo'))
            intent = BOT_INTENT.VIEW_OFFERS
        else if (slots.code || has('apply', 'redeem', 'i have a code', 'use this code', 'enter code'))
            intent = BOT_INTENT.APPLY_REFERRAL_CODE
        else if (has('referral', 'refer a friend', 'my code', 'invite', 'level', 'ambassador', 'champion', 'reward'))
            intent = BOT_INTENT.REFERRAL_INFO
        else if (has('book', 'pickup', 'schedule', 'place an order', 'new order'))
            intent = BOT_INTENT.BOOKING_GUIDE
        else if (has('change my', 'update my', 'phone number', 'address'))
            intent = BOT_INTENT.UPDATE_DETAILS
        else if (has('who are you', 'what are you', 'who is this', 'what is this', 'what can you do', 'your name', 'about you', 'what do you do'))
            intent = BOT_INTENT.ABOUT
        else if (
            hasWord('hi', 'hello', 'hey', 'yo', 'sup', 'hiya', 'howdy', 'greetings', 'gm', 'thanks', 'thank you') ||
            has("what's up", 'whats up', 'watsup', 'wassup', 'wagwan', 'good morning', 'good afternoon', 'good evening', 'good day', 'how are you', 'how far')
        )
            intent = BOT_INTENT.GREETING
        // Short leftover message that matched nothing else → almost certainly
        // small talk (real requests are caught above). Broadens greeting coverage
        // without enumerating every word.
        else if (wordCount > 0 && wordCount <= 2)
            intent = BOT_INTENT.GREETING

        return { intent, confidence: 0.4, slots }
    }
}

module.exports = new BotIntentService()
