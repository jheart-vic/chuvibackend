# Current Feature: Subscriber Per-Plan Free Pickup/Delivery Allowance (Feature 1)

**STATUS 2026-08-31: PLANNED, client-approved to start, NO CODE YET.** ₦65,000. Part of a 2-feature package
(Feature 2 = Recurring Offers ₦145k, DEFERRED — see summary.md). This doc = Feature 1 only.

## What it does
Each subscription plan gets its own editable **weekly** free pickup/delivery allowance. Pickup and delivery
count SEPARATELY (an order with both uses 2 units). Speed surcharge stays free for subscribers ALWAYS. Once the
weekly allowance is exhausted, the normal pickup/delivery fee applies per remaining leg. Replaces the current
"subscribers get everything free" behaviour (`extraDeliveryCost = 0`, bookOrder.service ~line 972).

## Locked client decisions (2026-08-31)
- **Per WEEK**, not per month. Editable **per plan** (admin panel).
- Pickup + delivery counted **separately** → both on one order = **2 units**.
- **Speed stays free always** (only pickup/delivery fee is gated by the allowance).
- Allowance exhausted → charge `AdminSetting.pickupFee` / `deliveryFee` per uncovered leg.
- Admin re-sets existing plans' numbers themselves (not our task).

## Key design point — WEEKLY reset (not monthly)
Paystack renews MONTHLY and resets `remainingItems` on renewal; the logistics allowance is WEEKLY, so it can't ride
the renewal. Plan: **lazy weekly reset at booking** — store `logisticsWeekStart` on the subscription; on each
subscription booking, if `now` is a new week vs `logisticsWeekStart`, reset `remainingPickupDeliveries =
plan.freePickupDeliveryPerWeek` and advance `logisticsWeekStart` BEFORE consuming. No cron needed.
- **Week boundary DECIDED (2026-08-31): rolling 7-day window anchored to the subscription START.** The week is NOT a
  calendar week. `logisticsWeekStart` is initialised to the subscription start (first-charge date). Lazy reset: on a
  subscription booking, while `now >= logisticsWeekStart + 7 days`, advance `logisticsWeekStart` by 7 days (in steps,
  so a gap of several weeks lands on the correct current window) and reset the counter; then consume. So each
  customer's "week" runs from their own signup anchor, e.g. a Wed-signup customer's weeks are Wed→Tue.

## BUILD TODOS (not started)
- [ ] `plan.model.js` — `freePickupDeliveryPerWeek` (Number, default 0)
- [ ] `subscription.model.js` — `remainingPickupDeliveries` (Number) + `logisticsWeekStart` (Date)
- [ ] Seed on first charge/subscribe: `remainingPickupDeliveries = plan.freePickupDeliveryPerWeek`, `logisticsWeekStart = now`
      (subscription.service subscribe + webhook.handler handleNormalSubscription create + reactivate branches)
- [ ] `bookOrder.service.js` subscription branch (~972): lazy weekly reset → legs = (isPickUp?1:0)+(isDelivery?1:0) →
      free = min(needed, remaining), decrement → charge pickupFee/deliveryFee for uncovered legs → **speed stays ₦0**.
      Deterministic tie-break when 1 unit left + both legs (free the pickup first, charge delivery) — documented.
- [ ] `admin.service.js` — expose `freePickupDeliveryPerWeek` on plan create/update (+ validate ≥ 0)
- [ ] Swagger — `Plan` schema + plan create/update request bodies
- [ ] DB verify: N/week → orders free + decremented; both-legs = 2 units; exhausted → fee charged; new week → reset;
      speed still free after exhaustion; non-subscriber unaffected.

## Files (no new endpoints)
plan.model, subscription.model, subscription.service, webhook.handler, bookOrder.service, admin.service, swagger.

---

# PREVIOUS Feature (COMPLETE): CHUVI Production Split-Flow, Structured Addresses & Set Items

**STATUS 2026-08-28: COMPLETE & DB-VERIFIED (Phases 1+2: 14/14, Phase 3: 18/18). Uncommitted on
modular-branch, ready to commit.** Client-approved package
of two features (+1 add-on). Full detail also in memory `chuvi-prodflow-setitems.md`. Combined
**₦190,000 · 9 new endpoints · ~12.5 days.** Build order (low-risk → high): (1) structured addresses
[quick], (2) Set Items [isolated catalog], (3) split production-flow engine [biggest, includes the
recovery-order requirement]. Swagger done in full detail (new `Handoff`/`ItemSet` schemas); in-code
comments kept LIGHT.

## BUILD TODOS (tracked)

### Phase 1 — Structured Addresses  ✅ DONE 2026-08-27 (scope: BOTH paths, tolerant of legacy strings)
- [x] Shared `util/address.js` — `normalizeAddress()` (string|object→structured) + `validateStructuredAddress()` (staff-intake required check). Unit-tested.
- [x] `bookOrder.model.js:172-173` — `pickupAddress`/`deliveryAddress` now `Mixed` (holds structured; no legacy-string hydration crash)
- [x] `intake-user.service.js` (staff `createBookOrder`) — REQUIRE label+address+landmark when isPickUp/isDelivery, store structured (commented validateRule left as-is; explicit check added)
- [x] `bookOrder.service.js` (customer/app/bot `postBookOrder`) — normalize `post.pickup/deliveryAddress` after validate (tolerant, string→structured, back-compat)
- [x] `services/bot/booking.flow.js:84` — "the usual" prefill coerces stored address object → display string (fixes `${bAddress}` render); bot still sends string, normalized downstream
- [x] Swagger: `OrderAddress` schema (44 total, parses) + `createBookOrder` (required) & customer booking (`oneOf` string|object) request bodies + TimelineOrder response shape
- [x] Gap closed (2026-08-27): customer `postBookOrder` now REQUIRES an address be PRESENT when isPickUp/isDelivery (presence only — label/landmark stay optional; back-compat). Bot payload now sends `deliveryAddress = pickupAddress` (single-address return) so the new isDelivery guard doesn't reject bot bookings.
- [x] DB write-path VERIFIED (phase12Staging.js, 14/14): staff intake rejects address missing landmark; customer rejects missing address when isPickUp; structured address round-trips as object; legacy string tolerated. FE note: staff intake needs label+landmark; customer app must send a delivery address when isDelivery.

### Phase 2 — Set Items  ✅ DONE 2026-08-28
- [x] `models/itemSet.model.js` — `{name*, pieces:[{name*,price*,isHeavy}], active}` (no set price; ≥1 piece enforced in service)
- [x] 5 endpoints mirroring `/admin/*-order-item`: add/update/get-all/get-one/delete (admin write; get uses `[auth]`). Routes in `page-route.js`, service `admin.service.js`, controller `admin.controller.js`. Shared `_validateSetPayload` (name + ≥1 priced piece; coerces price, defaults isHeavy). Unit-tested.
- [x] Catalog browse (`getItems`/`get-order-items`) now returns single items (`kind:'item'`) + ACTIVE sets (`kind:'set'`) in one array
- [x] Booking heavy-detection (subscription branch) also consults `ItemSet` pieces where `isHeavy` (matched by piece name vs booked item `.type`)
- [x] Optional `fromSet` tag added to order `ItemSchema` (passes through via `...post`)
- [x] Swagger: `ItemSet` + `ItemSetPiece` schemas (46 total, parses) + 5 endpoints (278 paths)
- [x] DB VERIFIED (phase12Staging.js, part of 14/14): add/get/update/delete set, pieces stored, get-order-items returns sets tagged kind:set + items tagged kind:item, no-pieces rejected. FE must branch on `kind`.

### Phase 3 — Split-Flow Engine (+ recovery add-on)
> **ARCH DECISION 2026-08-28 (client): INTEGRATED — the split-flow REPLACES the old whole-order
> mechanism (old flow was already built; client wants this to supersede it).** Pre-launch, so no live
> pipeline/data to protect. Per-item `currentStation` + `handoffs[]` become THE advance mechanism;
> `stage.status` is a COMPUTED summary (`summaryStatus`). The 5 station services keep their per-item
> work (tag/sort/wash/press/qc completion + hold + queues) which feeds the gates, but their whole-order
> "advance to next stage" step is replaced by the handoff push/confirm flow. Build order: model+engine
> first (isolated, verifiable), then integrate station-by-station.
> Verified facts: S1 done = item.tagStatus==='complete' (intake:775); sort=sort+pretreatStatus;
> wash=washStatus; press=pressStatus; qc=qcStatus==='passed'. Recovery items get S1 via schema default.
- [x] Model: `Item.currentStation` (default S1); `order.handoffs[]` (HandoffSchema); helpers `countByStation`/`isWholeAt`/`summaryStatus` + statics STATION_SEQUENCE/STATION_TO_ORDER_STATUS. Tested.
- [x] `services/handoff.service.js` engine (push/confirm/pendingQueue/splitState) + gates (whole-order S1→S2 & S4→S5, partial stretch zone) + completion checks + repeat-merge + reject→Hold. **In-memory logic test 16/16.**
- [x] `POST /orders/:id/handoff` (push → pending handoff; items advance only on confirm)
- [x] `POST /orders/:id/handoff/:hid/confirm` (accept→advance, reject→Hold+stay; recompute stage.status)
- [x] `GET /orders/handoffs/pending` (inbound queue, ?toStation filter)
- [x] `GET /orders/:id/split-state` (per-station breakdown + pending handoffs)
- [x] Controller + `routes/orders.js` (stationAuth = station roles + admin) + mounted `/orders` + page-route strings
- [x] Recovery add-on: recovery items get `currentStation`=S1 via schema default (createRecoveryOrder sets no per-item station). Verify CX+admin both start at S1 [confirm at integration].
- [x] Swagger: `Handoff`/`PendingHandoff`/`OrderSplitState` schemas + 4 endpoints (49 schemas, 282 paths, parses)
#### INTEGRATION — Option 2 (client-approved 2026-08-28): split-flow REPLACES the whole-order advance.
**Design decisions (locked):**
- **D1 stage.status = coarse computed summary** (`summaryStatus`, least-advanced station→ORDER_STATUS).
  Faithful values: QUEUE/SORT_AND_PRETREAT/WASHING/IRONING/QC. Hooks/CRM/offer/referral/bot keep reading it.
- **D2 sub-phases (washing↔drying, ironing) are WITHIN-station**, tracked by the EXISTING per-station
  detail fields (`washDetails.movedToDryingAt`, `pressDetails`, item `washStatus/pressStatus`) — NOT by
  order-level stage.status anymore. For SPLIT orders a single order-level drying/ironing is meaningless
  by design; the truth is per-item `currentStation` + `/split-state`.
- **D3 ONLY wash (S3) + press (S4) queues move to `items.currentStation`-based** selection. Refinement:
  because summaryStatus = LEAST-advanced station and sort is the earliest stretch station, ANY order with
  an item at sort has `stage.status==='sort-and-pretreat'` — so the SORT queue/guards on stage.status are
  already correct and stay. Intake (S1) + QC (S5) queues also stay (whole-order gated). So only wash+press
  need item-station-aware queries. Within-wash washing-vs-drying sub-lists use the detail fields (D2),
  and moveToDrying sets a sub-phase, not stage.status.
- **D4 the 4 between-station advances are REMOVED** (intake→sort, sort `sendToNextStage`, wash
  `washAndDryComplete`, press `pressDone`); movement happens via `/orders/:id/handoff` push+confirm.
  **KEEP:** all per-item completion actions, hold/release, qc pack&seal→dispatch (post-S5), moveToDrying
  (now sets a sub-phase, not stage.status), rider.
- **D5 notifications ported into confirm:** when the order's computed summary ENTERS a new stage, fire the
  matching customer notification (→WASHING: ORDER_WASHING, →IRONING: ORDER_IRONING, wash-only→READY, etc.).
- **D6 whole-order gates stay:** S1→S2 and S4→S5 whole-order; S2↔S3↔S4 partial (already in engine).

**Build order (station by station, read-then-edit, verify each):**
- [x] port stage-entry notifications into `handoff.confirm` (STAGE_ENTRY_NOTICE; fires to order.userId on entry)
- [x] intake→sort (S1→S2): removed `proceedToSortAndPretreat` (route+ctrl+svc+page-route). Queue stays (whole-order gated). Loads ✓
- [x] sort→wash/iron (S2→S3/S4): removed `sendToNextStage` (route+ctrl+svc+page-route). Queue stays on stage.status (sort=min-when-present). Loads ✓
- [x] wash (S3): removed `washAndDryComplete` (route+ctrl+svc+page-route); queue/active-wash/active-dry/dashboard → currentStation===WASH; moveToDrying now sets ONLY `washDetails.movedToDryingAt` + history marker (not stage.status); item guards → currentStation; completedToday → confirmed wash→press handoff today. Loads ✓
- [x] press (S4): removed `pressDone` (route+ctrl+svc+page-route); queue/active/dashboard/guards → currentStation===PRESS; completedToday → confirmed press→qc handoff today. Loads ✓
- [x] qc (S5): NO change needed — queue stays on stage.status (whole-order gated), receives via press→qc handoff confirm, pack&seal→dispatch untouched.
- [x] Swagger: removed advance route docs replaced with handoff-engine notes; engine builds (49 schemas, 278 paths). Stale sendToNextStage prose fixed.
- [x] All 5 stations verified: load + mount + engine test 16/16 + no dangling refs to removed methods.
- [x] DB VERIFICATION — `handoffStaging.js` ran against testing_db: **18 passed, 0 failed** (all matrix scenarios: gates, push/confirm, split queues, notification, reject→Hold, recovery-S1, concurrency, split-state). Cleaned up.
- [x] CONCURRENCY FIX (found by the DB run): confirm now does an ATOMIC CLAIM (updateOne guarded on handoff status==='pending' → final status) so exactly one of two concurrent confirms wins; in-memory handoff mutation removed so save can't overwrite the claim. Engine re-verified 16/16.

**PHASE 3 COMPLETE & DB-VERIFIED (2026-08-28).** The whole ₦190k package (Phases 1 addresses + 2 Set Items + 3 split-flow) is code-complete. Remaining: quick Phase 1/2 write-path DB checks (optional), then commit (uncommitted on modular-branch).

**VERIFICATION MATRIX (DB run must pass all — "passes" = this list):**
1. Full happy path: create→intake tag all→push S1→S2→confirm→sort items→push S2→S3 partial→confirm→…→QC. stage.status correct at each step; split-state accurate.
2. Each station QUEUE returns the order exactly when it has ≥1 item at that station (and not before/after).
3. Whole-order gate: S1→S2 partial rejected; S4→S5 partial rejected.
4. Partial stretch: S2→S3 subset moves, rest stay; order shows in BOTH wash and sort views.
5. Reject on confirm → item Hold + stays; release path still works.
6. Notifications: customer gets being-washed / being-ironed / ready at the right transitions (no dup, no loss).
7. wash-only + iron-only service routes (skip wash / skip … ) reach the right next station.
8. Recovery order: CX-created + admin-created both start all items at S1; flow via handoff.
9. Hooks/bot unaffected: order-status reply + a delivered order still fire CRM/referral correctly.
10. Concurrency smoke: two confirms on one order don't corrupt (last-write / re-read).
11. Dashboards count by station correctly for a split order.
12. qc pack&seal→dispatch→rider still works end-to-end.

## Feature 1 — Production Split-Flow & Structured Addresses — ₦110k · 4 new endpoints
An order can stretch across stations (some items washing while others still pressing) under one order
card, with a confirmed record at every handoff. **S1–S5 (client-confirmed):** S1=intake-and-tag,
S2=sort-and-pretreat, S3=wash-and-dry, S4=press-iron, S5=qc (rider/dispatch is post-S5). **Hard
gates:** S1→S2 and S4→S5 = whole order only; S2→S3→S4 = stretch zone (partial pushes allowed).
- **Confirmed decisions:** per-ITEM `currentStation` (not group); `stage.status` STAYS a computed
  summary (additive, keeps bot/CRM/dashboards working); structured address = sub-doc
  `{label,address,landmark}`; build the address slice FIRST.
- **Reuse (don't rebuild):** items already carry per-station status (`sortStatus`/`washStatus`/
  `ironStatus`/`qcStatus`/`holdDetails`, bookOrder.model ItemSchema); Hold exists (qc.service ~870).
- **New model bits:** `Item.currentStation` (enum STATION_STATUS); `order.handoffs[]`
  `{fromStation,toStation,itemIds[],count,status:pending|confirmed|rejected,pushedBy/At,
  confirmedBy/At,confirmedCount}`; derived helpers `countByStation`/`isWholeAt`/`summaryStatus`.
- **Endpoints (4):** `POST /orders/:id/handoff` (push; gate + per-item completion checks) ·
  `POST /orders/:id/handoff/:hid/confirm` (receiving confirms exact count; body `rejectedItems[]`→
  existing Hold; repeat-delivery merge by itemIds) · `GET /orders/handoffs/pending` (station inbound
  queue) · `GET /orders/:id/split-state` (per-station breakdown — may fold into order-detail → 3).
- **Modified (Swagger, no new route):** `createBookOrder` structured address (intake-user.service:70
  validateRule currently COMMENTED OUT; profile uses `AddressSchema{label*,address*,landmark*}`
  user.model:7-11; order stores plain `pickupAddress`/`deliveryAddress` String bookOrder.model:172-173)
  · order-detail/pipeline-progress view (intake-user.service ~1950-2025) shows split positions.
- **Add-on (+₦10k) — recovery orders honor S1→S5 (client 2026-08-27).** Recovery orders (rewash/
  rework/repair/replace) traverse the normal flow; NEITHER CX NOR ADMIN creation may skip it. ALREADY
  TRUE: `createRecoveryOrder` (recovery.service:265) sets stage=QUEUE + station=INTAKE_AND_TAG (S1),
  isRecoveryOrder; CX has no station role so can't change stages. New work = keep it true under
  split-flow: init each recovery item's `currentStation`=intake; same gates + handoff engine; create
  fixed to S1 (no "start at station X", no auto-confirmed handoff). Admin's global station access is
  unchanged (not an override). No new endpoints — wiring inside the split-flow build.

## Feature 2 — Set Items — ₦80k · 5 new endpoints
A Set = named catalog group of real, individually-priced pieces; NO set-level price; order total = sum
of ONLY the pieces selected; each selected piece recorded as its own countable order item so intake
counts stay accurate for partial sets.
- **Why cheap:** booking already TRUSTS payload `item.price` and records each line as one countable
  unit (bookOrder.service:941); catalog only consulted for heavy detection (bookOrder.service:889).
  So a Set lives entirely in the CATALOG layer — order/production layer UNCHANGED.
- **New model:** `ItemSet {name*, pieces:[{name*,price*,isHeavy}], active}` — no price field, ≥1 piece.
- **Endpoints (5, mirror /admin/*-order-item):** add-order-set · get-order-sets · get-order-set/{id} ·
  update-order-set/{id} · delete-order-set/{id}. Piece mgmt folds into add/update (pieces[] payload).
  Modified: catalog browse (`get-order-items`) also returns sets tagged `kind:'set'`.
- **Two small booking fixes:** extend heavy-detection to consult `ItemSet` piece `isHeavy`; optional
  `fromSet` tag on order ItemSchema for traceability (recommended).

## Related decisions (not part of these features)
- **Customer booking cart stays CLIENT-SIDE (localStorage), no backend** (client 2026-08-27). Only
  staff-side intake "drafts" exist (`/intake-user/drafts`, `/order/draft/:id/resume` = resume partial
  TAGGING of an already-placed QUEUE order — NOT a customer cart). `CartDraft` model (~₦25-30k) scoped
  but not wanted; revisit only if cross-device resume is requested.
- **Deep links (open, offered):** admin `template.page` is an unconstrained String → an admin can set
  a page not in `PAGE_ROUTES` (util/deepLink.js) → SMS builds a literal `/<page>` (404 risk). Known
  keys (wallet/offers/referral/complaint/order/support) route correctly (FE-confirmed 2026-08-03).
  Hardening = enum-guard the admin page field + verify `CLIENT_URL` env set in prod + ensure senders
  pass recordId. Not yet done.

---

# Previous Feature (DONE): CHUVI V1 AI Assistant — in-app bot upgrade (Phases A–D)

**STATUS 2026-08-24: MERGED TO `main`.** All bot V1/V1.1 work (Phases A–D + V1.1 parts + the 3
staging-run bug fixes: payment-step pin, OTP-step pin, styler gating) is committed and merged to
main. Post-merge, the whole orchestrator was refactored into a router + `services/bot/*` modules
(2455→561 lines, verified 11/11 — see session.md). The staging gate passed 11/11. **Next gate is NOT
backend:** the frontend team builds the two FE tasks (quickActions chips + complaint photo upload),
then INTEGRATION-TEST the live bot with REAL production data end-to-end from the app. Historical
"UNCOMMITTED" notes below predate the merge — read them as "what was built," not current git state.
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
- **WRITE actions STAGING GATE — PASSED 2026-08-24 (11/11 green).** Ran `botStaging.js` against a real
  Atlas DB (throwaway user, real LLM + Paystack + Termii). All write paths verified end-to-end:
  booking→wallet (success, pay-from-wallet, credit opt-in), booking→card (real Paystack link, stays
  PENDING), apply-payment (credit+cash, success), complaint (case opened→CX), feedback (5/5), phone-OTP
  (SMS + verify + write). Cleanup removed all records. **The run FOUND & FIXED 3 real product bugs**
  (uncommitted, in `botOrchestrator.service.js`): (1) payment-step intent hijack — typed "by card"
  hijacked the booking payment → pinned `collect-payment`; (2) OTP-step hijack — 6-digit code read as an
  order number → pinned `verify-phone-otp`; (3) reply styler mangling flow prompts + leaking a `§`
  placeholder → styler now only warms terminal replies + `§`/`?`-flip guards. Details in session.md.
  - Harness: `STAGING_OK=1 node botStaging.js --seed` (no staging DB → point MONGODB_URL at a throwaway
    local/Atlas Mongo; `--seed` seeds catalog+settings). Flags `--only=`, `--credit`, `--keep`; env
    `TERMII_API_KEY`/`STAGING_PHONE` for OTP. Safety-gated (refuses prod without `STAGING_FORCE=1`).
- Frontend work (only two real tasks): render `quickActions` chips (tap → send `message`); wire photo
  upload (`POST /api/utils/image-upload-single`) → `attachments[]` for complaints. Copy-paste FE handoff
  block is in the session (changelog + tasks).
- Then commit (client review gate — confirm first).

## NEXT WORK PACKAGE — Bot Intelligence & Fixes (V1.1) — PLANNED, NOT STARTED

Approved direction (2026-08-21, client via user): make the bot **smarter + less verbose without
scope drift**, and fix two real defects. Design principle stays: **LLM understands & phrases;
deterministic code owns every fact & action; guardrails from "Locked client decisions" unchanged.**
The LLM never generates a data answer — only (1) classify, (2) extract slots, (3) [NEW] tighten/warm
a fixed reply, (4) small-talk.

**Motivating evidence (client screenshot, WhatsApp/in-app booking):** bot repeated
*"When should we come? …"* 3× while the customer answered ("Tomorrow same address as before" + tried
to change items). Root cause in `bookingFlow`:
- `botOrchestrator.service.js:771` — on `collect-datetime` it dumps the WHOLE message into the date
  field ("Tomorrow same address as before" becomes the "date").
- `:772` — time ONLY comes from the LLM `pickupTime` slot; customer gave none → stays empty.
- `:842` — step requires BOTH date AND time → re-asks the IDENTICAL line forever (no attempt counter,
  no rephrase, no escape).

### Parts (priority order) — ALL PARTS DONE 2026-08-22/23 (stub-verified, UNCOMMITTED); live staging pending
1. **G — PAYMENT GATE (highest; a money bug). ✅ DONE.** Booking now places the order then routes to a
   `collect-payment` step (`_bookingPaymentStep`): wallet (`payWithWallet` + audit) or card (Paystack
   `initializePayment` → `authorization_url` link; order PENDING until webhook). `_placeBooking` no
   longer says "Done" for an unpaid order (≤0 → "fully covered"). Helpers `_parsePaymentChoice`,
   `_walletAvailable`; chips [Pay from wallet][Pay by card]. STILL TO DO: live staging (real money).
   **Billing follow-up DONE 2026-08-22:** (a) subscription-aware — `_placeBooking` tries `pay-from-subscription`
   first for active subscribers (reuses postBookOrder validation; rejected attempt creates no order), success →
   "covered by your plan" (no payment step), rejection → pay-per-item fallback + reason (`_subFallbackLead`);
   (b) wallet billingType label match — stamp order `billingType='pay-from-wallet'` after successful wallet
   settlement (card stays pay-per-item); (c) `_walletAvailable` hardened to the canonical
   `WalletCreditService.getCreditBalances`. Credits (all types, credit-first) confirmed covered by the shared
   `chargeWalletForOrder`. **Credit opt-in DONE 2026-08-23:** the bot now ASKS before spending reward credit
   (only when creditTotal>0) in BOTH wallet paths — `confirm-credit` (booking) / `confirm-pay-credit`
   (apply-payment); yes→credit-first, no→cash-only (else reroute). Shared `_settleWalletCharge` (charge+audit
   +billingType stamp) used by both. No longer always credit-first.
   Original problem statement: `_placeBooking` creates a `pay-per-item` order UNPAID
   and says *"Done! …you can pay in the app"* (`botOrchestrator.service.js:882,907`) — no payment
   collected, billing method hardcoded, booking declared complete with ₦0 taken. Fix: after the
   customer confirms, CONTINUE into a payment step — ask wallet vs card (offer subscription if an
   active plan). Wallet → reuse `WalletService.payWithWallet` (insufficient → top-up/card). Card →
   `initialize-payment` (`transactionType:'order'`) → send `authorization_url` as a "Pay now" chip;
   order stays PENDING until the existing Paystack webhook confirms (bot never confirms payment
   itself). Wording: "placed — awaiting payment", NOT "Done ✅", until paid. Track pending so the
   loop/handoff logic can nudge unpaid orders. Guardrail: bot gains NO new money authority (own
   wallet on own order, or a standard Paystack link the customer authorizes).
2. **C — LOOP/REPEAT GUARD (bug; stops the 3× repeat). ✅ DONE.** `_applyLoopGuard` in `_runSingle`:
   counts stalls (same step+intent = no advance) in `botState.slots._stall`; 1st → "(tap Talk To Staff)"
   hint, 2nd → stop repeating + offer human via existing `offered-handoff`. Resets on advance. General
   (all flows). NOTE: C only stops the infinite LOOP — the datetime PARSE fix that makes booking actually
   understand "tomorrow same address" is A+B (still pending).
3. **A + B — IN-FLOW UNDERSTANDING + SMART DEFAULTS. ✅ DONE 2026-08-23.** Removed the "whole message =
   date" dump; date/time now come from LLM slots → `_parseDateTimeFromText` fallback (parsed every turn,
   so "tomorrow morning" fills both). DATE-ONLY accepted → `_defaultPickupWindow` defaults the time
   (`bTimeAuto` flag, shown as "default window" at confirm). `_parseItemsFromText` reads spelled-out
   numbers; `_resolvePickupDate` handles "day after tomorrow". Verified end-to-end that the screenshot
   scenario ("Tomorrow same address as before" at collect-datetime) now ADVANCES instead of looping.
   (This is the deterministic/offline layer; the LLM already supplies the slots when up — A makes the
   flow USE them + adds a safe fallback.)
   **Booking extras DONE 2026-08-23 (on request):** (i) offline number words incl. tens/compounds
   (`_wordToNumber`, "fifty shorts"); (ii) large-quantity confirm (`confirm-qty`, >30) guarding typos;
   (iii) **delivery-speed selection** (`collect-speed`) — offers only speeds available at the current
   clock via `calculateDueDate` (same-day<10am/express<2pm/standard), charge+ETA in estimate & summary,
   and reroutes to another speed if the cut-off passes / capacity fills at placement (was hardcoded
   standard). NOTE: plan/capacity limits still count LINE ITEMS not quantity (pre-existing, not changed).
4. **D — MID-FLOW CORRECTIONS & SIDE-QUESTIONS. ✅ DONE 2026-08-23.** Mid-flow **cancel** (`_isCancel`,
   clears flow keeps memory) + **side-question** (D2 block: pricing/turnaround/service-info conf≥0.6 during
   a collect step → answer via runWorkflow then resume via runWorkflow(text:'') , stall reset). Corrections
   ("actually 2 shirts") already covered by A's per-turn slot re-ingest. (No new LLM output field needed —
   derived from existing classify intent/confidence + keywords.)
5. **E — REPLY STYLER. ✅ DONE 2026-08-23.** `botIntent.styleReply` + `_maybeStyle`: tokenize all data
   (₦/OSC/times/numbers/%) → LLM ≤2 warm sentences → require every token back or FALL BACK to exact text;
   skips multi-line/link/<25-char replies (summaries/offers/links intact); applied per reply in `_runSingle`;
   gated `BOT_STYLE_REPLIES` (default on, "false" disables), no-op without provider. Chips-first already
   shipped (Phase D). Cost: +1 LLM call per prose reply — flagged.
6. **F — GUARDRAILS STAY (standing rule, not a task).** LLM never quotes an unapproved price, invents
   order/wallet data, acts without the existing confirm+audit, approves refunds/compensation, or
   resolves a case. "Smarter" only ever = better understanding + tone.

**Do first before the bot touches a live customer: G + C (they're bugs, not enhancements).**

## Housekeeping for a fresh session
- Read summary.md + session.md + this file first (CLAUDE.md rule).
- Bot section of CLAUDE.md was rewritten to the new "acts-with-confirm" direction incl. Phase A–D status —
  trust it over any older "the bot never places an order / never quotes prices" phrasing elsewhere.
- Provider: no key in a bare `node -e` (rules path); the full app chain loads dotenv so classify() hits the
  LLM — mind token cost when smoke-testing via the app.
