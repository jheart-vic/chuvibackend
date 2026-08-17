# Current Feature: CHUVI V1 AI Assistant — in-app bot upgrade (Phases A–D)

Branch: `smart-book-feature`. ALL bot work is **UNCOMMITTED** (do NOT commit unless asked).
Started from a client doc ("CHUVI V1 AI Assistant") that turns the read-only Phase-6 bot
into a full conversational assistant that answers AND takes actions. Approved plan file:
`C:\Users\LENOVO\.claude\plans\take-a-look-at-majestic-cherny.md`. Blow-by-blow in session.md.

## The two-bot distinction (client-confirmed — never blur this)
- **In-app bot = THIS repo.** `botIntent` + `botOrchestrator` + `Conversation`/`ChatMessage`
  support thread + sockets. Everything below is the in-app bot.
- **WhatsApp bot = SEPARATE repo.** It consumes THIS backend via the EXISTING REST APIs
  (order status, place order, open case, …) and owns its own conversation over there.
  There is NO special WhatsApp bridge endpoint here (an earlier `/bot/internal/crm-reply`
  was built then REMOVED — no consumer). Do NOT re-add one; do NOT build a stateless "brain"
  endpoint unless the client explicitly asks (would need the orchestrator decoupled from the
  in-app Conversation).

## Locked client decisions
1. The bot NOW quotes prices, places orders, opens complaints, records feedback, applies
   wallet payment, changes phone (OTP) — **each behind an explicit confirm + audit**.
2. Hard guardrails STAY (structural — never invent data; the bot has NO code path to):
   approve refunds/compensation, edit wallet balances/credits, release referral rewards,
   or resolve/close complaint cases. Those + anything unhandled → human handoff.
3. Phased build **A→D**, each shippable on its own.

## Core architecture (how the whole thing hangs together)
- LLM does TWO jobs only (`services/botIntent.service.js`): `classify()` → one `BOT_INTENT`
  (+ `intents[]` for compound, + rich `slots`), and `smallTalkReply()` for greetings/OOS.
  Keyword `rulesFallback` when no provider key / LLM fails (never hard-fails).
- `services/botOrchestrator.service.js` is the deterministic brain: routes intent → workflow.
  Multi-turn flows persist on `conversation.botState = { intent, step, slots, memory }`.
- **Reuse pattern that unblocked everything:** the controller-style services (`postBookOrder`,
  `payWithWallet`, `submitFeedback`) never touch `res` and return the plain `{success,data}`
  envelope — so the bot drives them with a synthetic `{ body, user:{id} }` request and reuses
  the EXACT production pricing/validation/credit/audit path. No money logic duplicated.
- Every write action is behind a confirm step; wallet/case/OTP verified before mutating.

## Deliverables checklist — Phases A–D ALL DONE (stub-verified; reads live-verified)

### Phase A — understanding core + conversation memory  ✅
- [x] `conversation.model.js`: added `botState.memory` (Mixed) — survives the per-turn reset.
- [x] NEW `services/botContext.service.js`: `getLastOrder`/`buildOrderSnapshot`,
      `detectReferent` (the usual / same-as-last / same place / go ahead / pronoun),
      `savedDefaults`, `loadMemory`/`mergeMemory`.
- [x] `botIntent`: expanded `slots` (items[], pickupDate, pickupTime, addressRef same/home/office,
      address, itemName, amount) + prompt extracts stated details only, never resolves refs.
- [x] `botOrchestrator`: PRESERVES `memory` across the botState reset (`_runSingle` + batch,
      `markModified`); `_updateMemory` (lastIntent + lastOrder snapshot on order-touching turns);
      `_resolveAddressRef` turns addressRef:"same" → real address from memory/profile.

### Phase B — read-only answers  ✅
- [x] New intents: pricing, turnaround, service-info, policy, payment-status, reward-status.
- [x] `pricingReply` (per-piece = `roundToNearestHundred(OrderItem.price × serviceType.pricePerPiece)`
      — the EXACT booking math; item or general list), `turnaroundReply`, `serviceInfoReply`,
      `policyReply` (curated approved facts only; null→handoff), `paymentStatusReply` (reads
      BookOrder.paymentStatus; never accuses), `rewardStatusReply` (referral ledger; never releases).
- [x] Enriched `orderStatusReply`: `STAGE_EXPLAIN` plain-language stage +
      `_readinessAndDispatchLine` ("are they ready?"/"has the rider left?") from stage+dispatchDetails.
- [x] Batching (READ_ONLY_INFO + icons), classifier prompt + rules keywords, swagger enum.

### Phase C — confirmed + audited actions  ✅
- [x] **Booking** (`bookingFlow`): BOOKING_GUIDE runs slot-fill (items→service→address→date/time→
      confirm) → `BookOrderService.createOrder({userId,payload})` (thin wrapper over postBookOrder).
      "the usual" prefills from `memory.lastOrder`. Helpers: `_placeBooking`, `_resolveBookingItems`,
      `_parseItemsFromText`, `_matchServiceType`, `_bookingEstimate`, `_resolvePickupDate`.
- [x] **Apply-payment** (`applyPaymentFlow`, intent APPLY_PAYMENT): latest unpaid order → confirm →
      `WalletService.payWithWallet(useCredit:true)` + audit. Insufficient→handoff.
- [x] **Complaint** (`complaintFlow`, FILE_COMPLAINT no longer just hands off): order → DEDUPE vs open
      ComplaintCase → match/pick ComplaintType (`_matchComplaintType`/`_pickComplaintType`) → optional
      photo (attachments threaded handleCustomerMessage→_runSingle→runWorkflow) → confirm →
      `RecoveryService.openCase`. Opens+routes to CX, never resolves.
- [x] **Feedback** (`feedbackFlow`): delivered order → 1–5 (`_parseRating`) → `FeedbackService.submitFeedback`
      (≥4 satisfied/3 neutral); ≤2 offers to open a complaint (routes into complaintFlow).
- [x] **Phone OTP** (`_startPhoneOtp` + `verify-phone-otp` step in updateDetails): sendSmsOtp(new number),
      write only on matching code; pending number under `pendingPhone` (classifier can't clobber);
      5-min expiry; SMS-send fail→handoff; address change stays no-OTP.

### Phase D — quick actions + in-app CRM framing  ✅
- [x] `quickActions[]` (`{label,message}`) on every turn via `_quickActionsForTurn` (confirm→Yes/No,
      mid-collect→Talk To Staff, answered→MAIN menu, handoff→none). Surfaced by `botApi._replyPayload`
      (sendMessage + replyToConversation bot branch). Tapping sends `message` as the next message.
- [x] `crmContext` framing: `handleCustomerMessage` optional param → block B2 frames an AMBIGUOUS reply
      (`_crmFrameToIntent`: reactivation→booking/human, reorder→booking, feedback/post-delivery→feedback,
      lead→booking); passed via the normal `POST /bot/message` body (in-app deep-link from a CRM nudge).
- [x] Booking-routing fix: classifier prompt never told the LLM to use booking-guide → added prompt line
      + offline rules branch (book my/carry my/come carry/the usual…) BEFORE order-status.

## Files touched (all uncommitted)
- `services/botOrchestrator.service.js` (biggest — all workflows + helpers + memory + quick actions + CRM frame)
- `services/botIntent.service.js` (slot schema, prompt, rules), NEW `services/botContext.service.js`
- `services/bookOrder.service.js` (createOrder wrapper), `services/botApi.service.js` (_replyPayload + crmContext)
- `models/conversation.model.js` (botState.memory)
- `util/constants.js` (new BOT_INTENTs), `util/page-route.js` (net no change — crm-reply added then removed)
- `controllers/bot.controller.js` (net no change), `routes/bot.js` (message desc + crmContext + BotReply doc)
- `swagger/schemas.js` (BotReply intent enum + quickActions), `CLAUDE.md`, `context/session.md`

## Verified
- Unit/stub: each workflow simulated (staged botState) — booking 6-turn + the-usual + cancel; apply-payment
  routing/confirm/insufficient; complaint auto-match/pick/dedupe/no-order; feedback pos/neutral/poor;
  phone-OTP send/wrong/right/expired; quickActions per turn; CRM frame 7 cases; offline routing 10/10.
- LIVE (real DB + real LLM): boot :7333 → /api-docs 200, /bot/message 401; read-path smoke (greeting,
  pricing ₦700, turnaround, service-info, order-status, wallet, offers) all correct + chips; cleaned up.
- Swagger: 41 schemas parse; quickActions + crmContext + intents + description all present.

## What later phases / commit expect (STILL TO DO)
- **WRITE actions NOT run against live DB yet** (booking/pay/complaint/feedback/OTP create real records +
  fire CRM/referral hooks, staff notifications, capacity changes, SMS). Do a CONTROLLED STAGING run with a
  throwaway user, watching side effects, before trusting in prod. Set `TERMII_API_KEY` for OTP SMS.
- Frontend work (only two real tasks): render `quickActions` chips (tap → send `message`); wire photo
  upload (`POST /api/utils/image-upload-single`) → `attachments[]` for complaints. Copy-paste FE handoff
  block is in the session (changelog + tasks).
- Then commit (client review gate — confirm first).

## Housekeeping for a fresh session
- Read summary.md + session.md + this file first (CLAUDE.md rule).
- Bot section of CLAUDE.md was rewritten to the new "acts-with-confirm" direction incl. Phase A–D status —
  trust it over any older "the bot never places an order / never quotes prices" phrasing elsewhere.
- Provider: no key in a bare `node -e` (rules path); the full app chain loads dotenv so classify() hits the
  LLM — mind token cost when smoke-testing via the app.
