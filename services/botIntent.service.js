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
                confidence: { type: 'number', description: '0..1 confidence' },
                slots: {
                    type: 'object',
                    description: 'Optional extracted values',
                    properties: {
                        orderNumber: { type: 'string' },
                        code: { type: 'string' },
                        field: { type: 'string', description: 'phone | pickupAddress' },
                        value: { type: 'string' },
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
            'If unsure, use "unknown". ' +
            (pendingIntent
                ? `The assistant is currently in the middle of a "${pendingIntent}" flow, so a short reply likely continues it.`
                : '')
        )
    }

    // → { intent, confidence, slots, source: 'llm' | 'rules' }
    async classify(text, { pendingIntent } = {}) {
        const client = this.client()
        if (!client || !text || !text.trim()) {
            return { ...this.rulesFallback(text), source: 'rules' }
        }
        try {
            const parsed =
                this.provider === 'anthropic'
                    ? await this._classifyAnthropic(client, text, pendingIntent)
                    : await this._classifyOpenAI(client, text, pendingIntent)

            if (!parsed?.intent || !this.intents.includes(parsed.intent)) {
                return { ...this.rulesFallback(text), source: 'rules' }
            }
            return {
                intent: parsed.intent,
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
                slots: parsed.slots || {},
                source: 'llm',
            }
        } catch (err) {
            console.warn('Bot intent LLM failed, using rules fallback:', err.message)
            return { ...this.rulesFallback(text), source: 'rules' }
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

    // Deterministic keyword matcher — the safety net when the LLM is unavailable.
    rulesFallback(text) {
        const t = String(text || '').toLowerCase()
        const has = (...words) => words.some((w) => t.includes(w))
        const slots = {}
        const codeMatch = t.match(/chuvi[a-z0-9]{4,}/i)
        if (codeMatch) slots.code = codeMatch[0].toUpperCase()

        let intent = BOT_INTENT.UNKNOWN
        if (has('refund', 'compensat', 'money back', 'human', 'agent', 'representative', 'speak to', 'talk to someone'))
            intent = BOT_INTENT.TALK_TO_HUMAN
        else if (has('complain', 'damaged', 'missing', 'not washed', 'stain', 'wrong item', 'bad'))
            intent = BOT_INTENT.FILE_COMPLAINT
        else if (has('feedback', 'suggestion', 'review', 'rate'))
            intent = BOT_INTENT.SUBMIT_FEEDBACK
        else if (has('where', 'status', 'my order', 'my clothes', 'my laundry', 'track', 'ready', 'arrive', 'delivered'))
            intent = BOT_INTENT.ORDER_STATUS
        else if (has('wallet', 'balance', 'credit', 'how much do i have'))
            intent = BOT_INTENT.WALLET_BALANCE
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
        else if (has('hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'))
            intent = BOT_INTENT.GREETING

        return { intent, confidence: 0.4, slots }
    }
}

module.exports = new BotIntentService()
