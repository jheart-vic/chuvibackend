# Current Feature: Phase 6 — In-app Bot ("smart assistant")

Branch: continues on `proper-swagger-prt` (Phases 1–5 + referral levels committed).

## What it is

A hybrid LLM + rules assistant living inside THIS backend (not the WhatsApp
repo). Authenticated customers chat with it; it resolves routine low-risk tasks
itself and hands anything needing human judgement to Customer Experience.

## Binding client decisions

- **Intelligence = Hybrid.** The LLM ONLY classifies intent; it makes no
  business decisions and invents no policy. A deterministic workflow then runs
  against the existing systems.
- **Permissions = low-risk only.** Bot MAY: book a pickup (GUIDED only — never
  places the order), file a complaint (→ handoff), submit feedback, apply a
  referral code, check order status, check wallet balance, show offers, update
  simple details (phone / pickup address), start a CX conversation. Bot must
  NOT: approve compensation, add/remove credits, resolve complaints, override
  offer eligibility, refund, edit records, change policy → these have NO
  workflow and can only reach a human.
- **Provider = Claude** (`claude-haiku-4-5` default — cheap, fast classifier).
- **Booking:** detailed guided flow + estimate, but the bot never calls
  create-order; the customer confirms in-app.
- **Authenticated customers only** (JWT).
- **WebSockets now** (real-time), REST remains source of truth.

## Deliverables checklist

- [x] constants: `BOT_INTENT` enum (+ export)
- [x] conversation.model: `botState` (multi-turn slots); conversation.service
  `getOrCreateSupport(userId)`
- [x] user.model: `defaultPickupAddress` (bot-editable)
- [x] services/botIntent.service.js — Claude Haiku, structured tool output
  `{intent, confidence, slots}`; keyword rules fallback (no key / on error)
- [x] services/botOrchestrator.service.js — router + workflows (order-status,
  wallet-balance, view-offers, referral-info, apply-referral-code,
  update-details, booking-guide, feedback-ack, greeting/menu) + handoff;
  permission boundary is structural (high-risk intents have no tool)
- [x] config/socket.js — socket.io on the HTTP server, JWT handshake, rooms
  `user:<id>` + `staff:support`, `emitChatMessage` (non-fatal); wired in server.js
- [x] services/botApi.service.js + controllers/bot.controller.js + routes/bot.js
  at /api/bot (customer: message/conversation/handoff; staff CX: queue/reply/close)
  + page-route consts + mount + Swagger (BotReply schema)
- [x] CLAUDE.md (In-app bot section + env vars), .env keys (ANTHROPIC_API_KEY, BOT_MODEL)
- [x] Verify: 18-check script (each read workflow, multi-turn apply-code +
  update-details, unknown→menu, refund/complaint→handoff-never-acts, bot silent
  after handoff) + PORT=7999 boot (sockets attach clean)

## Who later phases expect

- Phase 7 WhatsApp reconnection: the bot's intent+workflow layer is channel-
  agnostic; the WhatsApp repo becomes a thin transport that posts messages in
  and renders replies out (same as the in-app socket/REST client).
