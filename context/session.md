# Current Session Log

Update this as work progresses. Newest entries at the top of "Done this
session". When a session ends/clears, fold anything durable into summary.md.

## Session: 2026-08-24 (cont.) — STAGING RUN GREEN (11/11) + 3 real bugs found & fixed

Ran `botStaging.js` against a real Atlas DB (throwaway user, real LLM + real Paystack + real Termii).
First runs FAILED and surfaced THREE real product bugs (not harness quirks) — now fixed in
`services/botOrchestrator.service.js`; final run 11/11 all scenarios green; all data cleaned up.

- **BUG 1 — payment-step intent hijack (money bug).** Typing "by card" / "use my wallet" at a
  booking's `collect-payment` step was CONFIDENTLY classified as `apply-payment`, so the pending
  booking flow was abandoned and `applyPaymentFlow` ran instead of `_bookingPaymentStep` → no
  Paystack link, freshly-placed order left unpaid. (Chip taps send the bare word "card"/"wallet"
  which classify as UNKNOWN/low-conf and dodged it — only TYPED phrases hit it.) Root cause: the
  mid-flow "continuesFlow" guard (`handleCustomerMessage`, ~line 279) only retains the pending
  intent when the classifier is UNKNOWN/`confidence<0.6`.
- **BUG 2 — OTP intent hijack.** A 6-digit OTP at `verify-phone-otp` classified as an ORDER NUMBER
  (`order-status`, "I couldn't find order 106036") → phone change silently failed. Same root cause;
  nondeterministic (an earlier run's code happened to classify UNKNOWN and worked).
- **FIX 1+2 — pin collision-prone steps.** New `isPinnedStep`: when `pendingIntent===BOOKING_GUIDE
  && pendingStep==='collect-payment'` OR `pendingIntent===UPDATE_DETAILS && pendingStep===
  'verify-phone-otp'`, retain the pending intent REGARDLESS of confidence. Escalation still wins
  (checked first); cancel + side-questions are handled earlier in `handleCustomerMessage`; other
  mid-collect steps are unaffected (their answers classify UNKNOWN so continuesFlow already covers
  them). Deliberately NOT a blanket pin — a blanket pin would swallow a legit "what's my balance?"
  asked mid-booking (that path abandons+answers by design / D2 side-question).
- **BUG 3 — reply styler mangled functional prompts.** The Part-E styler ran on EVERY reply incl.
  flow prompts/handoffs. Observed: it turned "What's the new phone number?" into a STATEMENT and
  leaked an invented placeholder ("…the number at §number§"); separately reworded a complaint
  prompt into a spurious handoff-sounding line. The token-guard didn't catch it because that reply
  had NO data tokens, so the LLM was free to change meaning.
- **FIX 3 — gate the styler + harden it.** In `_runSingle` only style a reply that ENDS the turn
  cleanly (`!result.handoff && !result.state?.step`) — informational answers/greetings/done-
  confirmations — NEVER a functional prompt or a handoff line. Plus in `_maybeStyle`: reject any
  restored output that still contains `§` (invented placeholder) or that flips a trailing `?`
  (question↔statement meaning change). Styler still warms terminal replies (verified: the "Thanks
  for your 5/5" line is styled, ₦/OSC tokens intact).
- **Harness fixes (botStaging.js, test-only):** (a) `OrderItem.price` is a per-piece MULTIPLIER
  (× `serviceType.pricePerPiece`=700), not naira — seeding it as 700 gave ₦490k/piece (the
  ₦1.47M/₦1.05M nonsense); reseeded as ~1 (heavy=4) via `$set` (corrects stale items). (b) removed
  the `CARD_PAY = ...||wants('card')` default that made wallet-booking never run; now booking(wallet)
  + card + apply-payment all run by default.
- **FINAL RUN 11/11 GREEN** (real DB+LLM+Paystack+Termii): booking→wallet (success, billingType
  pay-from-wallet, credit opt-in asked, ₦4,500 for 5 shirts, 2 wallet tx + 2 audits); booking→card
  (real Paystack link, order stays PENDING ✅); apply-payment (credit opt-in→paid ₦2k credit+cash,
  success); complaint (auto-matched "Stain Remains", case opened→CX); feedback (satisfied 5/5);
  phone-OTP (real SMS sent, code verified off botState, phone written). Cleanup removed all 84
  records; nothing left behind. `node -c` clean on both files.
- **STATUS: the pre-commit staging gate is now PASSED.** The 3 orchestrator fixes are UNCOMMITTED
  on smart-book-feature with the rest of the bot work. Ready for the client review/commit gate.

## Session: 2026-08-24 — Staging harness prepped (`botStaging.js`) — the pre-commit gate

The one remaining gate before committing the bot V1/V1.1 work is a CONTROLLED STAGING RUN of the
WRITE actions against a real DB (they were only stub-verified). Built the harness that does it:
- **`botStaging.js` (project root, sibling to `crmBackfill.js`, UNCOMMITTED).** Drives the REAL
  `BotOrchestratorService.handleCustomerMessage` (real DB + real LLM + real Paystack init + real
  Termii OTP) against a THROWAWAY user, prints every turn (reply/intent/step/chips), inspects the
  side effects each action left, then deletes everything by `userId`. No test-only code path — it
  drives the bot exactly like the app does.
- **Safety gate:** refuses unless `STAGING_OK=1`; refuses on `NODE_ENV=production` unless
  `STAGING_FORCE=1`; prints the target DB host (credentials masked) up front so the operator
  confirms it's staging, not prod. Card payments are only INITIALISED (link), never completed —
  the card order stays PENDING (matches the guardrail: bot never confirms card).
- **Adaptive step-driver (`drive`)** answers whatever `botState.step` the flow returns (map of
  step→reply, from the real step-name literals) until the flow ends / bails to `offered-handoff` /
  hits the turn cap — robust to LLM slot-fill variability (turn count isn't fixed).
- **Scenarios:** (1) booking→WALLET pay (assert order created + paymentStatus success + debit
  wallet tx + audit), (2) booking→CARD pay (assert Paystack link + order stays PENDING),
  (3) apply-payment on the still-unpaid card order, (4) complaint on a delivered order (mark the
  anchor delivered → assert ComplaintCase opened), (5) feedback rating (assert Feedback saved,
  unique-per-order noted), (6) phone-OTP — reads the generated code straight off
  `convo.botState.slots.otp` (staging can't read the SMS) so it proves the write happens ONLY on a
  match; without `TERMII_API_KEY` the SMS send fails and the flow hands off (correct guardrail, flagged).
- **Flags:** `--only=booking,card,pay,complaint,feedback,otp`, `--credit` (grants ₦2k reward credit
  to exercise the credit opt-in ask), `--keep` (skip cleanup), `--card-pay`. `STAGING_PHONE` env sets
  a real number to receive the OTP.
- **Cleanup** deletes ONLY the throwaway user's data (guarded on `USER._id`): chat messages,
  conversations, orders, complaints, feedback, wallet tx/credits/wallet, audits, CRM profile,
  notifications, the user. Prints a per-collection deleted count.
- **Verified:** `node -c` clean; every model/enum/field referenced confirmed against the code
  (`wallet.service.js:137` writes the `debit` tx the booking check asserts; step-name literals
  pulled from the orchestrator; OTP stashed on `botState.slots.otp`).
- **NOT RUN in this session on purpose** — the session's `MONGODB_URL` is assumed to point at the
  real/prod DB, and the harness creates real orders/SMS by design. RUN IT against a staging DB:
  `STAGING_OK=1 node botStaging.js` (add `--credit` and set `TERMII_API_KEY` + `STAGING_PHONE` to
  exercise the credit opt-in and the full verify-and-write OTP path). Watch the ⚠️ lines — some are
  expected guardrails. Green run = the last gate before the client-review commit.

## Session: 2026-08-23 (cont.) — D (mid-flow corrections/questions) + E (reply styler) DONE (stub-verified)

Final V1.1 parts. All bot V1.1 work (G,C,A,B,D,E + credit opt-in + subscription billing + wallet label
+ delivery speed + item edge-cases) now stub-verified, UNCOMMITTED on smart-book-feature.
- **D — mid-flow handling (handleCustomerMessage):**
  - **Cancel** (`_isCancel`: cancel/never mind/start over/forget it/abort — NOT "no"): any in-progress flow →
    clears botState (keeps memory), "cancelled, what else?". Block placed before A; skips offered-handoff.
  - **Side-question** (block D2): a clear read-only question (pricing/turnaround/service-info, conf≥0.6)
    asked DURING a collect-* step (not confirm/handoff) → answers it via runWorkflow(intent) then resumes
    the flow via runWorkflow(pendingIntent, text:'') to re-ask the current step; combines both replies,
    preserves the flow state, resets `_stall` (a question isn't a loop). Never hijacks a real answer.
  - **Corrections** ("actually 2 shirts") already work — the flow re-ingests LLM slots every turn (A);
    D adds the question/cancel cases the re-ingest didn't cover.
- **E — reply styler (`botIntent.styleReply` + `_maybeStyle`):** bounded 3rd LLM job that lightly re-words
  a reply warmer/shorter. SAFETY: orchestrator tokenizes all data (₦ amounts, OSC codes, clock times,
  numbers, %) to §n§ before sending; requires every token back verbatim or FALLS BACK to the exact
  deterministic text; skips multi-line / link / <25-char replies (summaries, offers, Paystack links stay
  byte-for-byte). No-op when no LLM provider. Applied per single-line reply in `_runSingle`. Gated by
  `BOT_STYLE_REPLIES` (set "false" to disable; default on) — NOTE it adds ~1 extra LLM call per prose
  reply (classify + style), so watch cost; disable if needed.
- **Verified** (scratchpad/verify_de.js): `_isCancel` 5/5; `_maybeStyle` (styles prose + keeps data,
  skips multiline/url/short, token-loss→fallback, env-off); cancel mid-flow (clears + keeps memory);
  side-question (answer+resume, flow intact, stall reset). `node -c` clean on both files.
- ALL V1.1 PARTS COMPLETE (stub-verified). Live staging (real DB/LLM/Paystack/subscription/SMS) is the
  remaining gate before commit — the accumulated money+booking logic has NOT been run against a real DB.

## Session: 2026-08-23 (cont.) — Delivery-speed selection added to the bot (stub-verified)

Gap found: `_placeBooking` hardcoded `deliverySpeed:'standard'` → the bot never offered express/same-day,
never surfaced cut-offs/charges/capacity. Backend rules (util/helper.calculateDueDate): same-day before
10am (due today), express before 2pm (due tomorrow), standard no cut-off (~2 days); each has a charge
(expressCharge/sameDayCharge) + capacity; past cut-off or over capacity → postBookOrder rejects. Added:
- **`collect-speed` step** (after date/time, before phone) — offers ONLY what's available at the current
  clock via `calculateDueDate` (single source), each with charge + ETA (`_availableSpeeds`,`_speedOfferText`).
  Parses the reply (`_parseDeliverySpeed`; standard checked BEFORE express so "no rush" ≠ rush→express).
  Picking an unavailable speed → says so + re-offers. `bSpeed` persisted; chips [Standard/Express/Same-day].
- **Estimate** now includes the speed charge (`_bookingEstimate(...,speed)` + `_speedCharge`); confirm
  summary shows the speed line (`_describeSpeed`), e.g. "Express (+₦1,000) — ready tomorrow".
- **Payload** uses `bSpeed` (was hardcoded standard).
- **Mid-chat cut-off / capacity fallback** in `_placeBooking`: if postBookOrder rejects with
  before-10am/before-2pm/full-capacity, DON'T dead-end — reroute to `collect-speed` (now excluding the
  unavailable option), keeping all other slots. (Subscribers: pay-from-subscription zeroes the speed
  charge but is still cut-off/capacity limited — inherited behaviour.)
- Imports: DELIVERY_SPEED, calculateDueDate. Verified (scratchpad/verify_speed.js): helpers,
  availability-by-clock, estimate+1000, gate ask/pick/reject-unavailable, cut-off-at-placement reroute.
  `node -c` clean. NOTE: old scratch verify_ab asserted datetime→confirm; now datetime→collect-speed
  (expected — the anti-loop "advances" property still holds). Uncommitted; live staging pending.

## Session: 2026-08-23 (cont.) — A + B: in-flow datetime understanding + smart defaults (stub-verified)

Fixes the ROOT of the screenshot loop (C only stopped the infinite repeat; A+B make it understand).
All in `services/botOrchestrator.service.js`:
- **A — use structured slots + a real parse, never whole-message-as-date.** Removed the
  `collect-datetime ? String(text) : null` dump. Now: date = `slots.pickupDate` (LLM) → `_parseDateTimeFromText`
  fallback; time = `slots.pickupTime` (LLM) → parse fallback. Parsed EVERY turn so multi-slot answers
  ("tomorrow morning") fill both at once. New `_parseDateTimeFromText` extracts a day phrase
  (today/tomorrow/day-after/weekday) and/or time (morning/afternoon/evening/night/noon or `\d(am|pm)`)
  without swallowing the message.
- **B — a day is enough; default the time.** Requirement changed from "date AND time" to DATE-ONLY; if no
  time, `_defaultPickupWindow(setting)` sets one (first configured pickup slot else 'morning') and the confirm
  summary shows "(default window — tell me if you'd prefer another time)". `bTimeAuto` flag persisted.
  `_parseItemsFromText` now also reads spelled-out numbers ("two duvets"). `_resolvePickupDate` handles
  "day after tomorrow" (was matching /tomorrow/ → wrong +1).
- **Verified** (scratchpad/verify_ab.js): `_parseDateTimeFromText` (incl. "Tomorrow same address as before"
  → date only, no whole-message), `_resolvePickupDate` day-after=+2, `_parseItemsFromText` digits+words, and
  end-to-end bookingFlow: the reported "Tomorrow same address as before" at collect-datetime now ADVANCES to
  confirm (time defaulted, note shown) instead of looping; "tomorrow morning" → no default note; an
  unrecognisable date re-asks cleanly and NEVER stores the whole message as the date. `node -c` clean. PASSED.
- NOTE: this is the deterministic/offline parse layer; when the LLM classify is up it already supplies
  pickupDate/pickupTime slots — A just makes the flow actually USE them and adds a safe fallback. Items still
  best-extracted by the LLM; `_parseItemsFromText` is the offline degrade. Uncommitted; live staging pending.
- **Item edge-cases (2026-08-23):** offline number parsing now handles tens/compounds — `_wordToNumber`
  ("thirty-five"/"fifty"/"twenty two") + `_parseItemsFromText` rebuilt to use it (was one–ten only, so
  "fifty shorts" was dropped when the LLM was down). Added a **large-quantity sanity confirm** (`confirm-qty`
  step, threshold >30): after items are captured, if any qty>30 the bot asks "that's 50 shirts? (yes/no)"
  before pricing — yes→continue, no→clear items+re-ask; guards typos (50 vs 5). `bQtyConfirmed` persisted
  (asked once). `describeItems()` helper. Verified (scratchpad/verify_qty.js): word-number 7/7, parse
  fifty/thirty-five/twenty-two/50, confirm-qty yes/no + small-order-skips. Plurals resolve via
  `_resolveBookingItems` substring match. NOTE: plan/capacity limits still count LINE ITEMS not quantity
  (pre-existing in postBookOrder) — 50 shirts = 1 line item; flagged, not changed (backend-wide decision).

## Session: 2026-08-23 — Credit opt-in (bot ASKS before spending reward credit) (stub-verified)

Reversed the "always useCredit:true" behaviour so the bot no longer silently spends reward credit.
Both wallet-payment paths now ask, ONLY when the customer actually has credit (creditTotal>0):
- **Booking** (`_bookingPaymentStep` wallet branch): credit>0 → new `confirm-credit` step ("You have ₦X
  reward credit. Use it? yes/no"), routed in `bookingFlow`. `_bookingCreditOptinStep`: yes → charge
  useCredit:true; no → cash-only if cash≥amount, else reroute to collect-payment ("cash won't cover; use
  credit or card"). No credit → charge cash directly (no needless question).
- **Apply-payment** (`applyPaymentFlow`): `confirm-pay` yes → if credit>0 ask new `confirm-pay-credit`
  step, else charge cash; `confirm-pay-credit`: yes→credit, no→cash-only (else offered-handoff).
- **Shared charge helper** `_settleWalletCharge({userId,orderId,useCredit})` → payWithWallet + WALLET
  audit + `billingType='pay-from-wallet'` stamp; returns {ok,creditApplied}|{ok,error}. Callers phrase
  their own success line (booking via `_walletPaidReply`; apply-payment "…Thank you!"). This ALSO gave
  apply-payment the billingType stamp it was missing. `confirm-credit`/`confirm-pay-credit` match the
  `/confirm/` quick-actions regex → Yes/No chips; loop guard covers repeats.
- **Verified** (scratchpad/verify_optin.js): booking (ask-when-credit, yes→credit, no→cash, no-cover→
  reroute, no-credit→direct) + apply-payment (asks, yes→credit, no→cash, stamps label, no-credit→direct);
  payWithWallet called with the right useCredit each branch. `node -c` clean. ALL PASSED.
- Credit is now genuinely opt-in via the bot (was: always credit-first). Uncommitted; live staging pending.

## Session: 2026-08-22 (cont.) — Billing: subscription-first + wallet billingType label + credit hardening (stub-verified)

Follow-up to Part G after auditing the money path (payWithWallet → chargeWalletForOrder, shared with
the pay-from-wallet branch; credits consumed via applyCreditsToAmount across ALL types, credit-first,
then cash, atomic + rollback). Three changes, all in `services/botOrchestrator.service.js`:
- **Subscription-aware billing (`_placeBooking`).** If the customer has an ACTIVE subscription, TRY
  `pay-from-subscription` first via new `_createOrderSafe`. postBookOrder validates (no sub / heavy items /
  over monthly limit / capacity) and returns BEFORE creating an order (confirmed bookOrder.service:974),
  so a rejected attempt creates nothing → safe try-then-fallback. Success → "covered by your subscription ✅"
  and NO payment step (note: sub orders have amount>0 but paymentStatus SUCCESS, so branch on the billing
  path, not amount). Rejection → fall back to pay-per-item + a plain-language reason lead (`_subFallbackLead`:
  heavy / over-limit / generic) then the wallet-or-card step. No subscription → pay-per-item as before.
- **Wallet billingType label match.** payWithWallet settles a pay-per-item order (leaves billingType
  'pay-per-item'), so after a successful bot wallet settlement we stamp
  `BookOrderModel.findByIdAndUpdate(orderId,{billingType:'pay-from-wallet'})` (best-effort; the
  WalletTransaction is the money record). Card stays pay-per-item (correct — online pay-per-item).
- **Credit-availability hardening.** `_walletAvailable` now uses the CANONICAL
  `WalletCreditService.getCreditBalances(userId).total` (same ACTIVE/remaining>0/not-expired filter the
  charge uses) instead of a hand-rolled WalletCredit query, so the bot's "enough?" check can't drift from
  what `chargeWalletForOrder` actually consumes. (applyPaymentFlow already reuses `_walletAvailable`.)
- **Imports added:** SubscriptionModel, WalletCreditService, BILLING_TYPE. Helpers: `_createOrderSafe`,
  `_subFallbackLead`.
- **NOTE (unchanged behaviour, flagged):** the bot always passes `useCredit:true` → reward credits are
  always spent first (customer can't opt out via bot); matches the existing apply-payment flow. Add an
  opt-in question later if the client wants.
- **Verified** (scratchpad/verify_billing.js, payload-aware stubs): `_walletAvailable` cash+credit;
  subscription precedence (none→PPI, covered→no-pay-step, over-limit/heavy→fallback+reason); wallet
  success stamps billingType=pay-from-wallet once; sufficiency via cash+credit (insufficient blocks,
  credit-only covers). `node -c` clean. ALL PASSED. STILL pending live staging (real money/Paystack/sub).

## Session: 2026-08-22 — Bot V1.1: Part G (payment gate) + Part C (loop guard) DONE (stub-verified)

Started the V1.1 "Bot Intelligence & Fixes" package (plan in feature.md) with the two BUGS first.
Motivated by a client screenshot: booking repeated "When should we come?" 3× (customer answered),
and separately the bot placed orders WITHOUT collecting payment ("Done ✅" with ₦0 taken).

- **Part C — loop/repeat guard (general, in `_runSingle`).** Capture `prevStep/prevIntent/prevStall`
  BEFORE `runWorkflow`; new `_applyLoopGuard(result,{...})` post-processes: if the flow returns the
  SAME step+intent (customer's reply didn't advance it) it counts a stall in `botState.slots._stall`.
  1st stall → append "(tap Talk To Staff)" hint; 2nd → STOP repeating, replace reply with "connect you
  to a member of staff? (yes/no)" and switch step to the existing `offered-handoff` (so a yes hands off,
  YES_NO chips). Resets to 0 the moment a step advances; no-op when the turn ended (no step). Works for
  EVERY multi-turn flow (booking/complaint/feedback/updateDetails/payment), not just booking.
- **Part G — payment gate in booking.** Design: place the order via the exact prod path (unchanged),
  then DRIVE payment instead of ending. `_placeBooking` success now → step `collect-payment` (unless
  amount ≤ 0 → "fully covered, nothing to pay"); NEVER says "Done" until money is collected. New
  `bookingFlow` early-return routes `collect-payment` to `_bookingPaymentStep` BEFORE the slot-fill (so
  "wallet"/"card" isn't mis-parsed as items). `_bookingPaymentStep`: wallet → `_walletAvailable` check →
  `WalletService.payWithWallet(useCredit:true)` + WALLET audit (reuses the exact apply-payment path);
  card → `PaystackService.initializePayment({transactionType:'order',orderId})` → send `authorization_url`
  as a tappable link (order stays PENDING until the existing webhook confirms — bot never confirms). New
  chips for the step: [Pay from wallet][Pay by card]. Helpers: `_parsePaymentChoice` (wallet|card|null),
  `_walletAvailable` (cash + active reward credit) — also refactored `applyPaymentFlow` to reuse it (DRY).
  **Guardrail intact:** bot gains NO new money authority (own wallet on own order, or a link the customer
  authorises). Insufficient wallet / card-init fail → stay on step (loop guard escalates to a human).
- **Files:** `services/botOrchestrator.service.js` (loop guard + `_applyLoopGuard`; `collect-payment`
  chips; `bookingFlow` early return; `_placeBooking` payment prompt; `_bookingPaymentStep`,
  `_parsePaymentChoice`, `_walletAvailable`; `applyPaymentFlow` DRY), + `require('./paystack.service')`.
- **Verified** (scratchpad/verify_gc.js, stubbed wallet/paystack/bookOrder/models): `_parsePaymentChoice`
  6/6; `_applyLoopGuard` stall→hint→handoff + reset-on-advance + no-op-when-ended; `_placeBooking`
  unpaid→collect-payment & ₦0→fully-covered; `_bookingPaymentStep` no-order→handoff, wallet paid,
  insufficient, card link, card-fail, unclear. `node -c` clean. ALL PASSED.
- **STILL TO DO:** live staging run (real DB + real Paystack) — payment writes real money/records; verify
  the wallet charge + Paystack link + webhook confirmation end-to-end with a throwaway user before prod.
  Then A+B (in-flow understanding) which actually fixes the datetime PARSE (C only stops the infinite loop).
- Uncommitted (branch smart-book-feature, client review gate).

## Session: 2026-08-18 — Wire up crmContext (CRM-nudge → in-app assistant deep link)

FE reported Phase-D `crmContext` was DORMANT end-to-end: the FE plumbing reads `?crmContext=`
off `/user/support` and forwards it once, and the backend framer (`_crmFrameToIntent`, block B2)
was built — but NOTHING produced the deep link, so no nudge ever put a customer into
`/user/support?crmContext=…`. Confirmed the CRM nudge path is EXTERNAL-only
(`crmMessenger.sendCrmMessage` → WhatsApp → SMS → email; no in-app notification channel). So the
missing piece was purely the SENDER. Wired it (Option A, client-approved), additive:
- **util/deepLink.js:** added `support` to PAGE_ROUTES (`/user/support`) + new `supportLink(crmContext)`
  helper (builds `CLIENT_URL/user/support?crmContext=<ctx>`, URL-encoded; `deepLink()` couldn't do
  query params). Exported `supportLink`.
- **crmMessenger.service.js:** new `SUPPORT_CONTEXT_BY_MESSAGE_TYPE` map (reactivation-1/2/3 +
  churn-broadcast → `reactivation`; delivery-confirmation → `post-delivery`; feedback-request →
  `feedback`; reorder-prompt → `reorder`). In `sendCrmMessage`, after the existing lead-link block,
  append `\nContinue in the app: <supportLink(ctx)>` — GUARDED by `profile.userId` so account-less
  leads (login-gated `/user/support`) never get it and keep their registration link. Offer/wallet/
  complaint nudges keep their own specific deep links (map is opt-in per message type).
- **Non-breaking by design:** additive line only; framer only re-frames an AMBIGUOUS first reply and
  never overrides a clear intent or mid-flow step; worst case (param lost / unknown ctx) degrades to
  a normal bot chat = today's behavior. No route/Swagger contract change.
- **Verified** (scratchpad/verify_crmctx.js): supportLink URLs exact; every emitted crmContext
  (`reactivation`/`post-delivery`/`feedback`/`reorder`) round-trips through a mirror of
  `_crmFrameToIntent` to a real intent (booking-guide/talk-to-human/submit-feedback) — never null.
  `node -c` clean on both files.
- **One FE check (not a backend break):** the login redirect must PRESERVE `?crmContext=` through the
  auth gate, else it's silently dropped (degrades to a normal chat).
- Uncommitted (same branch smart-book-feature, part of the bot work awaiting the client review gate).

## Session: 2026-08-14 — Bot bugfix + "V1 AI Assistant" upgrade (Phase A)

Branch: smart-book-feature (bot work is off-topic to that branch; uncommitted).

### Bot bugfix — update-pickup-address loop (DONE, verified)
- Symptom (client screenshot): "change my address" → "Aroma" looped on *"What's the
  new pickup address?"* forever; only a sentence containing the word "address" broke out,
  and it saved garbage ("is at aroma").
- Root cause: `parseDetail` re-ran FIRST-turn keyword extraction on the value turn; its
  guard `after !== t` rejects a bare value like "Aroma".
- Fix (all in botOrchestrator.service.js): made `updateDetails` **step-aware** — on
  `awaiting-value` the whole message IS the value; added `cleanDetailValue` (connector-
  based address preamble strip so "the new pickup address is at aroma" → "Aroma", keeps
  "New Haven Street" intact, rejects punctuation-only); added a **confirm step**
  (awaiting-confirm, yes/no) before writing; added `isNegative` + extended `isAffirmative`.
  Verified 11 address phrasings + phone + junk + yes/no/unclear branches.

### V1 AI Assistant upgrade — plan approved, Phase A DONE (verified)
- Client doc asks the bot to become an ACTOR: quote prices, place bookings, open
  complaints, capture feedback, apply wallet/credit, resolve natural language + context,
  bridge CRM replies. **Client-approved decisions:** (1) bot NOW quotes prices, places
  orders, opens complaints — each behind a **confirm step + audit**; money-approval
  (refunds/compensation/reward-release/balance edits) STAYS human-only; (2) **phased A→D**.
  Plan file: `C:\Users\LENOVO\.claude\plans\take-a-look-at-majestic-cherny.md`.
- **Phase A (foundation) — understanding core + conversation memory. DONE:**
  - `conversation.model.js`: added `botState.memory` (Mixed) — long-lived memory that
    survives the per-turn botState reset.
  - NEW `services/botContext.service.js`: `getLastOrder`/`buildOrderSnapshot` (money-free
    order snapshot), `detectReferent` (the usual / same as last / same place / go ahead /
    pronoun), `savedDefaults` (name/phone/pickup addr), `loadMemory`/`mergeMemory`.
  - `botIntent.service.js`: expanded classify `slots` schema (items[], pickupDate,
    pickupTime, addressRef same/home/office, literal address, itemName, amount) + prompt
    tells LLM to extract stated details only, never resolve references itself.
  - `botOrchestrator.service.js`: **preserves `memory` across the botState reset** in
    `_runSingle` + batch path (was being wiped every turn) via markModified; `_updateMemory`
    (lastIntent + refresh lastOrder snapshot on order-touching turns); `_resolveAddressRef`
    turns addressRef:"same" into the real stored address from memory/profile (memory-only,
    never invents, leaves empty → flow asks; value-guard preserves an existing literal).
  - `CLAUDE.md`: rewrote the bot guardrail paragraph to the new act-with-confirm direction
    + Phase A-done / B–D-pending note (so future sessions don't revert the behavior).
  - Verified: full bot chain loads; referent detection, snapshot, memory merge, address-ref
    resolution (incl. office-left-to-ask + value-guard) all correct. No new action workflows
    yet — those are Phase B (answers), C (actions), D (CRM bridge + quick-action buttons).
- **Phase B (read-only answers) — DONE (verified):**
  - New BOT_INTENTs: pricing, turnaround, service-info, policy, payment-status, reward-status
    (constants + classifier prompt + rulesFallback keywords; rules ordering: reward/payment
    before order-status, cancel→policy before order-status, pricing/turnaround/service-info/
    policy before offers so the VERB "offer" doesn't hit the offers noun branch). 10/10 rules
    routing verified.
  - orchestrator workflows (all read-only, never invent): `pricingReply` (per-piece =
    roundToNearestHundred(OrderItem.price × serviceType.pricePerPiece) — EXACT booking math,
    item + general list), `turnaroundReply` (AdminSetting.standardDeliveryPeriod + active
    order ETA), `serviceInfoReply`, `policyReply` (curated approved facts only — payment/
    cancellation/refund/pickup-delivery; returns null→handoff for anything else),
    `paymentStatusReply` (reads BookOrder.paymentStatus; pending→offered-handoff, never
    accuses), `rewardStatusReply` (ReferralService.getReferralPage; explains granted/pending/
    deferred, never releases).
  - Enriched `orderStatusReply`: STAGE_EXPLAIN plain-language stage line + `_readinessAndDispatchLine`
    answering "are they ready?"/"has the rider left?" from stage + dispatchDetails (pickup/
    delivery status) — never states a state the record doesn't show.
  - Batching: pricing/turnaround/service-info added to READ_ONLY_INFO + INTENT_ICON (💵/⏱️/ℹ️).
    allowedIntents extended. capabilities() sentence + swagger BotReply intent enum updated.
  - Verified: pricing (item ₦1,400 trouser + general list), turnaround, service-info, policy
    (pay/cancel/unknown→null), reward-status, payment-pending, order-status ready + rider
    lines, swagger parses, full chain loads.
- **Phase C (actions) — booking-create DONE (verified); rest queued.**
  - KEY DISCOVERY: `postBookOrder(req,res)` never touches `res` and returns the plain
    `{success,data}` envelope (BaseService static methods just return objects). So NO risky
    refactor of the 600-line money method was needed — added a thin
    `BookOrderService.createOrder({userId,payload})` that calls
    `postBookOrder({ body:payload, user:{id:userId} })`. Bot places orders through the EXACT
    same pricing/validation/credit/notification/audit path.
  - **Guided booking flow (`bookingFlow` in botOrchestrator):** BOOKING_GUIDE intent now runs
    a multi-turn slot-fill instead of static text. Steps: collect-items → collect-service →
    collect-address → collect-datetime → (collect-phone if profile has none) → confirm. On
    "yes" builds payload (items priced from OrderItem catalog; classic/standard/pay-per-item/
    pickup+delivery defaults; name/phone from profile) and calls createOrder; shows the placed
    order's oscNumber + amount; clears state. "no" cancels. Estimate shown at confirm =
    roundToNearestHundred(catalogPrice × pricePerPiece)×qty + pickup + delivery (labelled an
    estimate; exact total from the placed order). Reuses `cleanDetailValue` for the address
    answer. Phase A memory: "the usual"/"same as last time" prefills items/service/address from
    memory.lastOrder snapshot.
  - Helpers: `_placeBooking`, `_resolveBookingItems` (catalog match + unmatched), `_parseItemsFromText`
    (offline "6 shirts" fallback), `_matchServiceType`, `_bookingEstimate`, `_resolvePickupDate`
    (today/tomorrow/weekday→Date, else null). Guardrail: NEVER places without an explicit confirm.
  - Files: services/bookOrder.service.js (createOrder wrapper), services/botOrchestrator.service.js
    (bookingFlow + helpers, BOOKING_GUIDE case, requires BookOrderService).
  - Verified (stubbed models, no DB): full 6-turn booking (guide→items→service→address→datetime→
    confirm→placed) with correct payload + estimate ₦9,400; "the usual" prefill jumps to
    datetime; confirm=no cancels; chain loads.
- **Phase C — apply-payment DONE (verified).**
  - Found the existing settle-an-unpaid-order path: `WalletService.payWithWallet(req)` (instance
    method, validates, rejects already-paid, charges credit-first then cash, sets paymentStatus
    success, notifies) — also never uses `res`, returns the plain envelope. Bot calls it via
    `new WalletService().payWithWallet({ body:{bookOrderId,useCredit:true}, user:{id:userId} })`.
  - New BOT_INTENT.APPLY_PAYMENT (constants + classifier prompt + rules keywords placed BEFORE
    wallet-balance so "use my wallet/balance" is a pay action, not a balance lookup). `applyPaymentFlow`
    (botOrchestrator): finds latest unpaid non-cancelled order → shows amount + wallet cash/credit →
    confirm-pay (yes/no) → on yes calls payWithWallet(useCredit:true) + writes a bot-initiated
    createAuditLog (WALLET, non-fatal) → success msg (notes credit used). Insufficient funds →
    offered-handoff; no unpaid order → graceful. Guardrail: only spends the customer's OWN wallet on
    their OWN order, behind a confirm; never edits balances or adds money.
  - Imports added to orchestrator: WalletService, createAuditLog, AUDIT_LOG_CATEGORIES. allowedIntents
    + switch case wired.
  - Verified (stubbed): routing 5/5 (apply-payment vs wallet-balance), enough→confirm→pay (credit
    note), insufficient→handoff, no-unpaid-order graceful, chain loads. (Audit cast error in test was
    a fake-id artifact — try/catch made it non-fatal, reply still correct.)
- **Phase C — COMPLETE (all 5 actions, verified). complaint + feedback + phone-OTP:**
  - **complaint-open** (`complaintFlow`): FILE_COMPLAINT no longer just hands off — it identifies the
    latest order, DEDUPES vs an open ComplaintCase (status $nin closed/customer-confirmed →
    offered-handoff, no duplicate), auto-matches a ComplaintType from the description (`_matchComplaintType`,
    name words ≥5 chars) or lists the active catalog to pick (`_pickComplaintType`, number or name),
    optional photo (threaded `attachments` through handleCustomerMessage→_runSingle→runWorkflow→flow),
    confirm → `RecoveryService.openCase({userId,orderId,complaintTypeIds,description,photos})` + bot
    audit (RECOVERY). Never resolves/compensates. Verified: auto-match, pick, dedupe, no-order handoff.
  - **structured feedback** (`feedbackFlow`): finds latest DELIVERED order → asks 1–5 + comment
    (`_parseRating`: digit/stars/sentiment) → ≥4 satisfied, 3 neutral via
    `new FeedbackService().submitFeedback({body,user})`; ≤2 → offers to open a complaint (routes into
    complaintFlow with the comment as description). Verified positive/neutral/poor + parse.
  - **phone change w/ OTP** (`_startPhoneOtp` + `verify-phone-otp` step in updateDetails): on confirm of
    a PHONE change, instead of writing, generateOTP + `sendSmsOtp(newPhone,otp)` (util/sendOtp, Termii);
    pending number stored under `pendingPhone` (distinct key so the classifier can't clobber it), otp +
    5-min expiry on botState; customer enters code → match writes phoneNumber + audit (USER); wrong→retry,
    expired→restart, SMS-send failure→handoff (never changes unverified). Address change stays no-OTP.
    Verified: send/wrong/right/expired.
  - Imports added: RecoveryService, FeedbackService, ComplaintType/ComplaintCase models, generateOTP,
    sendSmsOtp, COMPLAINT_STATUS, FEEDBACK_TYPE. capabilities() + swagger BotReply enum updated.
  - GUARDRAILS intact across all C actions: every write behind an explicit confirm (feedback rating is
    its own confirmation); OTP gates phone; bot NEVER approves refunds/compensation, edits balances, or
    resolves complaint cases — those stay human.
- **Booking-routing fix (found during Phase C verify):** the classifier prompt never told the LLM when
  to use `booking-guide`, so "book my laundry" fell to unknown/order-status. Added a booking line to the
  LLM systemPrompt AND an offline rules branch (book my / carry my / come carry / the usual / place an
  order …) placed BEFORE order-status so "my laundry"/"my clothes" don't swallow booking requests.
  Verified 10/10 offline (booking phrases → booking-guide; where/track/ready → order-status).
- **Phase D — DONE (verified). Quick-action buttons + CRM inbound bridge (IN-APP bot).**
  - **Quick actions:** `MAIN_QUICK_ACTIONS` (Book/Track/Wallet/Offers/Complaint/Feedback/Staff) +
    `YES_NO_ACTIONS`; `_quickActionsForTurn(result)` → confirm/offer step = Yes/No, mid-collect step =
    Talk To Staff, completed answer = main menu, handoff = none. Each chip is `{label,message}` — tapping
    sends `message` as the next customer message (reuses the whole pipeline, no new action protocol).
    Surfaced on every bot turn via `botApi._replyPayload` (sendMessage + replyToConversation bot branch);
    swagger BotReply gained `quickActions[]`.
  - **CRM frame bias (in-app only):** `handleCustomerMessage` takes optional `crmContext`; a NEW block (B2)
    frames an AMBIGUOUS reply (unknown / conf<0.5 / bare affirmative, and NOT mid-flow) via `_crmFrameToIntent`:
    reactivation+yes→booking, reactivation+reason→talk-to-human, reorder→booking, feedback/post-delivery→
    feedback, lead→booking. Never overrides a clear specific intent. Exposed via the normal customer
    `POST /bot/message` (optional `crmContext` body field) so the app can frame the first reply when it
    DEEP-LINKS the in-app assistant from a CRM nudge ("Ready for another pickup?"→opens framed as reorder).
  - Verified: quickActions per turn-type, `_crmFrameToIntent` mapping (7 cases), chain + swagger load.
  - **TWO-BOT BOUNDARY (client-confirmed):** in-app bot lives HERE; WhatsApp bot is a SEPARATE repo that
    consumes this backend via the EXISTING REST APIs (reads + writes what it needs — order status, place
    order, open case). It has its OWN conversation over there. So NO special bridge endpoint is needed here.
    An earlier `POST /bot/internal/crm-reply` (x-bot-secret) I had added was REMOVED — no consumer; the
    WhatsApp bot uses existing REST. No stateless "brain" endpoint built (would need the orchestrator
    decoupled from the in-app Conversation) — client explicitly said not needed.
- **ALL PHASES A–D COMPLETE.** Bot-side work is UNCOMMITTED on branch smart-book-feature.
- **Swagger:** verified complete — 41 schemas parse; BotReply gained `quickActions[]`; `/bot/message`
  documents optional `crmContext` + `attachments`, and its description lists the new answer/action
  capabilities; intent enum includes all new intents; removed crm-reply path gone. Live at /api-docs (Bot tag).
- **Frontend handoff block** produced (changelog + FE tasks) — quickActions chip renderer + photo-attach for
  complaints are the only real FE work; everything else flows through the existing /bot/message.
- **LIVE SMOKE (done):** booted server (PORT=7333, dev) → /api-docs 200, /api/bot/message 401 (routes+guard OK).
  Read-path DB smoke via a throwaway user through the REAL orchestrator + REAL LLM classifier: greeting,
  pricing ("shirt ₦700"), turnaround (2 days), service-info, order-status(no orders→booking guide),
  wallet(₦0), offers — all correct, correct chips, no exceptions; throwaway data cleaned up. LLM correctly
  routed the new Phase-B intents (prompt additions work in prod, not just rules).
- **STILL TO DO before/at commit:** WRITE actions (booking, apply-payment, complaint, feedback, phone-OTP)
  were NOT run against live DB on purpose — they create real orders/cases + fire CRM/referral hooks, staff
  notifications, capacity changes, and SMS. Verify these in a CONTROLLED STAGING run (throwaway user, watch
  side effects) before trusting in prod. TERMII_API_KEY must be set for phone-OTP SMS. Then commit.

## Session: 2026-08-02 — Client "Fix & Improvement Brief" (8 sections)

Client delivered a final correction brief. Building in phases; **quick wins first**
(client's choice). Hotfix (appliedOffers CastError, see below) done but NOT committed
yet (client: wait). Full brief + locked decisions recorded here so a context-clear
can't lose them.

### The brief (paraphrased) + status vs current code
1. **Registration** — dup email → "This email is already registered. Please log in."
   + machine-readable signal for a FE Log In button. Apply to email/password AND
   Google paths. [QUICK WIN]
2. **CX & Admin conversations** — CX owns CRM leads/follow-up/conversations; MOVE CRM
   lead-mgmt off Intake&Tag (`intakeUserAuth`) → CX (`customerExperienceAuth`). Admin
   views every CX conversation. CX escalates to Admin w/ reason + urgency. Admin can
   enter any conversation without escalation and TAKES OWNERSHIP on entry. Customers
   cannot request Admin escalation. [M–L]
3. **Communication config** — Admin configures lead templates/sequence/delivery times;
   messages STAGGERED (not same minute); only Admin edits schedule; lead register/book
   → stop remaining lead msgs + advance CRM stage; lead SMS = personalised registration
   link; Offer/Wallet/Complaint/Feedback SMS = personalised deep links → after login
   redirect to exact page/order; every msg has trigger/customer/related-record/time/
   status. (Comm layer + page/recordId deep-link fields already exist.) [L]
4. **Offer** — "Got It"→"Use Offer"/"Book With Offer" opens booking w/ offer preselected
   + shows all other eligible offers + clear reason when not applicable [QUICK-WIN slice].
   Admin multi-select triggers/stages/tags/customer-groups: OR within a category, AND
   across; baseline benefits all apply, ONE personal offer; personal+promo no-stack
   unless `stackableWithPersonal`; redeemed offer not reusable until a new qualifying
   event. [multi-criteria = L, later]
5. **Complaint/Recovery** — multiple complaint types per case; evidence/items/photos/
   chat stay attached; customer confirm before final close (48h reminder → CX may close
   if silent); reopen within admin-configurable window (DEFAULT 7d); post-recovery 1–5★
   + optional comment; auto-remove Complaint + Recovery-Required tags after closure. [L]
6. **Recovery ops** — Rewash/Rework/Repair/Replacement create a FREE recovery order
   linked to complaint/order/affected-items; CX creates but CANNOT change op stages;
   recovery order enters Intake&Tag → rider → processing → QC → delivery normally;
   op actions auto-update recovery + complaint status; CX monitors + communicates only;
   Admin full complaint dashboard (evidence/chats/escalations/recovery orders/approvals/
   SLA breaches). LARGEST new piece — recovery today grants credits/actions, not orders.
   [XL, build last]
7. **Compensation/Wallet** — CX wallet credit ≤₦10k w/ evidence; cash comp ALWAYS
   Founder/Admin + customer account details; >₦10k or cumulative >₦10k on a case →
   Admin; each additional comp a separate action (amount/reason/evidence); confirmation
   step before completion; wallet shows Total Available + separate Cash/Laundry/Referral/
   Recovery/Promotional; booking shows wallet value eligible for that order; every comp
   → visible wallet tx (credit comp) + audit. [M–L]
8. **Referral & AI** — referral successful ONLY on referred customer's first order
   Delivered/Completed; cancelled/reversed don't qualify; reward immediate; AI→CX handover
   stays but customer needn't remain in the same visible AI thread. Mostly BUILT (Phase 5
   + two-thread bot) — VERIFY. [QUICK WIN / verify]

### Locked client decisions (this brief)
- §1 covers email/password AND Google register paths.
- §7 cash compensation is RECORDED/APPROVED FOR MANUAL TRANSFER (no in-system payout):
  store customer bank details on the compensation action record; cash comp makes an
  audit + payout record but NO wallet tx (wallet tx requirement is for wallet-CREDIT comp).
- §4 multi-criteria (my recommendation, approved): all four categories become arrays;
  OR within a category, AND across, EMPTY category = no constraint (skipped). triggers[]
  = events that mint the offer; stages[]/tags[]/customerGroups[] = eligibility gates
  evaluated at assignment AND re-checked at booking/redeem (drives the "why it can't
  apply" reason). One shared matchesTargeting() used both places. Migrate single
  `trigger` → `triggers:[trigger]`, keep reading the old field.

### Recommended build order
1. Hotfix commit (appliedOffers) — pending client go.
2. Quick wins: §1 (email+Google), §8 verify, §4 booking-with-offer + eligible list.
3. §2 conversations. 4. §3 comms. 5. §5 complaints. 6. §7 compensation/wallet.
7. §6 recovery-orders-into-pipeline (last). §4 multi-criteria can slot after §2.

### Quick-wins progress (this session, uncommitted) — ALL 3 DONE
- **§1 Registration** — dup email now returns "This email is already registered. Please
  log in." + `code:'EMAIL_ALREADY_REGISTERED'`, `action:'login'` so FE shows a Log In
  button. Applied to the email/password register AND `googleSignup` — Google only for the
  password-collision case (email is a LOCAL account with no googleId → don't silently
  link, tell them to log in); genuine Google users still log in. File: auth.service.js.
- **§8 Referral/AI** — VERIFIED, no code change. Reward fires only via
  referralOnOrderDelivered→handleReferredOrderDelivered (immediate); order-created only
  marks FIRST_ORDER; cancelled orders never reach delivered so never reward, and a later
  delivered order still rewards. AI→CX context = CX opens full convo history + two-thread
  model. GAP (flagged, optional): no clawback if an already-rewarded delivered order is
  later reversed/cancelled (no referralOnOrderCancelled hook).
- **§4 Offer booking-options** — new `POST /offers/booking-options` [auth]: returns
  `selected` (authoritative validateAndPrice quote for the current selection) + `personal`
  /`promotions`/`baseline` lists, each evaluated against the draft cart with applicable/
  reason/requirement/unlockMessage/benefit + `preselected` (+ promos carry
  stackableWithPersonal). Extracted shared `_offerRejection({kind,offer,linkage,draft,
  stats,now,userId,hasPersonal})` and refactored BOTH validateAndPrice branches to use it
  (single source of truth; booking list & quote can't drift). Promotions in the list are
  evaluated hasPersonal=false (own merits); real personal+promo combo enforced by validate.
  Files: offer.service.js (helper + getBookingOptions + refactor), offerApi.service.js
  (bookingOptions), offer.controller.js, routes/offer.js (+Swagger), page-route.js
  (ROUTE_OFFER_BOOKING_OPTIONS), swagger/schemas.js (OfferBookingOption + OfferBookingOptions).
  VERIFIED live 15/15 (synthetic user + personal/promo/baseline offers): validate refactor
  behavior-preserving incl. stacking-precedence AND min-order requirement/unlockMessage;
  booking-options lists + flags correct. swagger parses.
- Label swap "Got It"→"Use Offer/Book With Offer" + opening booking preselected = FE
  (backend already accepts customerOfferId/promoOfferId at booking).
### §2 CX & Admin conversations — DONE (uncommitted), verified live 18/18 + boot
- **CRM lead mgmt moved Intake&Tag → CX.** routes/crm.js: all 7 staff endpoints swapped
  `intakeUserAuth` → `customerExperienceAuth` (grants CX + admin, so admin retains access;
  intake loses it). Doc strings updated too.
- **conversation.model** new fields: `assignedRole` ('cx'|'admin'|null), `assignedTo`,
  `adminJoinedAt`, `escalation{escalated,escalatedBy,reason,urgency,escalatedAt}`.
  constants: CONVERSATION_OWNER + CONVERSATION_URGENCY (low/normal/high/urgent).
- **conversation.service** new methods: `assignToCx` (first CX reply claims ownership,
  no-op if owned), `escalateToAdmin` (INTERNAL — sets escalation, NO customer message;
  guards open support convo; bad urgency→normal), `adminTakeOwnership` (admin owns any
  convo, sets adminJoinedAt, posts one-time join notice if not yet engaged, idempotent),
  `listAllSupportForAdmin` (all support convos, filters open/escalated/urgency/mode,
  escalated float to top, paginated).
- **botApi.service**: staffReply now calls assignToCx for CX. New `escalateToAdmin`
  (emits `conversation:escalated` to staff:support + notifies admins via SYSTEM
  notification, non-fatal), `adminTakeOwnership` (emits `conversation:owner-changed`),
  `adminListConversations`.
- **config/socket**: new `emitStaffConversationEvent(event, convo, extra)` — staff-room
  only (escalation/ownership are internal, never pushed to the customer).
- Routes (routes/bot.js): `POST /bot/:id/escalate` [customerExperienceAuth],
  `POST /bot/:id/admin-join` [adminAuth], `GET /bot/admin/conversations` [adminAuth].
  page-route consts + Swagger + Conversation schema updated. Customers have NO
  admin-escalation path (only /handoff → CX queue), satisfying "customers cannot request
  Admin escalation".
- Verified: escalation posts no customer message/unread bump; CX→admin ownership transfer;
  idempotent admin-join; admin escalated-filter list; closed-convo escalate guarded (null).
  Boot on :7998 clean; both new routes 401 without auth.

### §3 Communication config — 3A/3B/3D DONE (uncommitted, verified 12/12); 3C BLOCKED
Client decisions: schedule config lives IN CrmSetting; register → stop nudges + STAY
'lead' (no stage change); deep-link URLs → client will supply exact FE routes.
- **3A configurable staggered lead schedule (in CrmSetting).** crmSetting.model: new
  `leadSchedule` array [{messageType,enabled,delayMinutes,cancelIfOrdered}] +
  DEFAULT_LEAD_SCHEDULE (welcome 0, qualify 2m, offer 5m, close 10m, reminder-1 1440m/1d,
  reminder-2 4320m/3d, mark-prospect 8640m/6d — STAGGERED, fixes old now/+1s/+2s/+3s
  same-minute burst). `startLeadWorkflow` now reads settings.leadSchedule (falls back to
  DEFAULT if empty) → dueAt = now + delayMinutes. `updateSettings` accepts + validates
  leadSchedule (known type, delay≥0, and NO two ENABLED steps in the same minute → rejects
  with a stagger error). Backfill in config/setup.createCrmSettings for existing docs.
  Swagger: CrmSettings schema + PUT /crm/settings body updated. (Admin-only via existing
  adminAuth on /crm/settings.)
- **3B register/book stop + stage.** handleUserRegistered: after createLead, cancels
  pending LEAD messages (account now exists) — stage STAYS lead (client decision).
  handleOrderCreated: already cancelled LEAD msgs; now ALSO advances stage LEAD→first-order
  on booking. (Account-less leads via walk-in/bot endpoints keep nurture — they don't go
  through handleUserRegistered.)
- **3D record completeness** — VERIFIED existing models already carry trigger
  (workflow+messageType / sourceSystem), customer (profileId/userId), related record
  (relatedRef/relatedModel on CommunicationLog), delivery time (dueAt/createdAt), status.
  No change.
- Verified live 12/12 (default staggered schedule, same-minute rejected, custom accepted,
  startLeadWorkflow honors enabled+delays, register cancels+stays lead, booking cancels+
  advances to first-order). Files: crmSetting.model.js, crm.service.js, config/setup.js,
  routes/crm.js, swagger/schemas.js.
- **3C deep links — DONE (uncommitted), verified 13/13.** Client URLs: frontend
  https://www.chuvilaundry.com, API https://api.chuvilaundry.com. Client REJECTED editing
  .env — so use env-with-hardcoded-fallback (same as REFERRAL_BASE_URL). New
  `util/deepLink.js`: `clientUrl()` (CLIENT_URL || fallback), `deepLink(page, recordId)`
  with a CENTRALIZED PAGE_ROUTES map (wallet→/wallet, offers→/offers, referral→/referral,
  complaint→/complaints/:id, order→/orders/:id, feedback→/feedback/:id; unknown page →
  literal path) — edit routes in ONE place if FE differs. `registerLink({phone})` reuses
  REFERRAL_BASE_URL (/auth/signup) + prefills phone. Login-gated pages rely on the FE auth
  guard to login-then-return (satisfies "after login redirect to exact page").
  - communication.service: SMS branch appends `deepLink(targetPage, recordId||relatedRef)`
    to the SMS body (in-app already carries page+recordId). So Offer/Wallet/Complaint/
    Feedback/Referral SMS get deep links.
  - crmMessenger.sendCrmMessage: LEAD-workflow messages for ACCOUNT-LESS profiles
    (no userId) append "Sign up: <registerLink+phone>". Registered profiles get none.
  - Page keys confirmed from code: wallet, offers, referral, complaint (grep). Verified
    live 13/13 with stubbed sendSms/email (require.cache stub) — deep links + registration
    link appended correctly, registered lead gets none. Files: util/deepLink.js,
    communication.service.js, crmMessenger.service.js.
  - NOTE: FE route paths are my best-guess conventions; if FE differs, fix PAGE_ROUTES in
    util/deepLink.js only. CLIENT_URL/API_URL env not added (client rejected .env edit) —
    add later to override the fallback.
  - **CORRECTED 2026-08-03** (frontend supplied real SPA routes): PAGE_ROUTES now → /user/wallet,
    /user/offers, /user/referrals (PLURAL), /user/complaints/:id, /user/order-history/:orderId.
    Feedback has NO standalone route (lives in order detail keyed by ORDER id) → feedback maps to
    /user/order-history/:orderId; `feedback` page is not emitted by any sender anyway. Emitted
    page keys in practice: offers, wallet, referral, complaint. Backend sends FULL absolute URLs
    (CLIENT_URL + path) — FE does NOT remap. Registration-link phone param = `?phone=` (registerLink
    reuses REFERRAL_BASE_URL as base; confirm the signup route there matches FE). mark-prospect =
    CRM_INTERNAL_ACTION (crm.service:496 → markProspect), no template/SMS — schedule-only row.

### §5 Complaints — DONE (uncommitted), verified live 19/19 + boot
- **Multi-type:** complaintCase.complaintTypeIds[] (array) + complaintTypeId kept as
  primary (first) for back-compat. openCase accepts complaintTypeIds OR complaintTypeId,
  validates all active, stores de-duped array. feedback.submitFeedback + getMyComplaint
  (populates both) updated.
- **Confirm→closed + rating.** New COMPLAINT_STATUS.CLOSED (terminal). transitionStatus→
  RESOLVED sets confirmationDueAt = now + complaintConfirmWindowHours (48, RewardSetting)
  + resets reminder flag. confirmResolution(caseId,userId,{rating,comment}): validates
  1–5★, stores recoveryRating/recoveryRatingComment on the CASE (Feedback is unique-per-
  order, taken), → CUSTOMER_CONFIRMED then CLOSED, confirmed=true, closedAt; clears tags
  + referralOnEligibilityRestored (via shared afterClose()).
- **CX close after 48h.** New closeCase(caseId,{closedBy,reason}) — only from RESOLVED and
  only once confirmationDueAt passed (else rejected); → CLOSED, confirmed=false, closedBy/
  closeReason; afterClose clears tags. Route POST /recovery/cases/:id/close
  [customerExperienceAuth].
- **Reopen within window.** reopenCase(caseId,userId) from CLOSED/CUSTOMER_CONFIRMED,
  guarded by complaintReopenDays (7, RewardSetting) from closedAt; → REOPENED→UNDER_REVIEW,
  reopenCount++, clears terminal markers, re-applies recovery tags. Route POST
  /feedback/complaints/:id/reopen [auth].
- **SLA reminder.** checkSla: RESOLVED past confirmationDueAt w/o reminder → one-time
  customer nudge (complaint-update template) + notifyStaff CX/admin "you may close";
  sets confirmationReminderSentAt. CLOSED added to resolution-overdue $nin. NOT auto-closed
  (client: "CX MAY close").
- **Tags auto-removed on closure** (afterClose→clearRecoveryTags) — evidence/photos/items/
  conversation all persist (never detached).
- Config: RewardSetting.complaintConfirmWindowHours(48) + complaintReopenDays(7), read via
  ?? fallback (no migration). Swagger: ComplaintCase schema (complaintTypeIds, closed/
  confirm/rating/reopen fields, +closed status), confirm route (rating/comment body),
  new reopen + close routes. Files: constants, complaintCase.model, rewardSetting.model,
  recovery.service, recoveryApi.service, feedback.service, feedback.controller,
  routes/feedback.js, routes/recovery.js, page-route.js, swagger/schemas.js.
- Verified 19/19 (multi-type + invalid-type reject, 48h due, confirm+rating→closed, bad
  rating reject, reopen within window, CX close blocked-then-allowed, past-window reopen
  reject, SLA reminder once). Boot :7997 clean; reopen+close routes 401 unauth.

### §7 Compensation & Wallet — DONE (uncommitted), verified live 15/15 + boot
- **Per-type wallet balances (#7) ALREADY existed:** getWalletBalance returns cashBalance +
  creditsByType {laundry,referral,recovery,promotional} + creditTotal + totalAvailable. No
  change needed beyond documenting.
- **Compensation redesign (the real work).** complaintCase: new `compensations: [compSchema]`
  array (type wallet-credit|cash, amount, reason, evidence[], status, requestedBy/approvedBy/
  decidedAt/rejectionReason, walletCreditId, bankDetails{accountName,accountNumber,bankName}).
  `recoveryCredit` kept ONLY as deprecated pre-§7 field. constants: RECOVERY_COMPENSATION_TYPE
  {WALLET_CREDIT,CASH}.
  - recovery.service: replaced requestRecoveryCredit/approveRecoveryCredit/rejectRecoveryCredit
    with requestCompensation / approveCompensation / rejectCompensation + cumulativeApprovedComp
    helper. Each request = a SEPARATE action (amount/reason/evidence). Cash requires bankDetails.
  - **Approval gate (#1-4):** CASH → always admin; single amount > threshold (₦10k
    RewardSetting.recoveryApprovalThreshold) → admin; CUMULATIVE approved + this amount > threshold
    → admin; else CX. **Confirmation step (#6):** approveCompensation requires confirmed:true.
  - **#9 visible tx + audit:** wallet-credit approval → WalletCreditService.grantCredit (recovery,
    90d) which already writes a visible WalletTransaction + notification; sourceRef
    complaint-<id>-comp-<compId> (dedupe). CASH approval → NO wallet tx (external manual transfer),
    recorded on the compensation + audit log. Every request/approve/reject writes createAuditLog
    (RECOVERY). Recovery Offer trigger fires once on first approval. Customer notified (credit vs
    cash wording).
  - recoveryApi.service request/approve/rejectCredit wrappers pass type/evidence/bankDetails/
    compensationId/confirmed. Routes UNCHANGED paths (/recovery/cases/:id/credit/{request,approve,
    reject}) — Swagger bodies updated (type, bankDetails, compensationId, confirmed).
- **Booking-eligible wallet value (#8):** new GET /wallet/eligible?amount= [auth] →
  {orderAmount, cashBalance, creditTotal, creditsByType, totalAvailable, eligible=min(total,amount),
  remainingToPay}. All wallet value applies to any order (no type restriction in
  applyCreditsToAmount), so eligible is a simple min. wallet.service.getEligibleForOrder +
  walletController + ROUTE_WALLET_ELIGIBLE + Swagger.
- Swagger: RecoveryCompensation schema + ComplaintCase.compensations[]; credit route bodies;
  /wallet/eligible. Files: constants, complaintCase.model, recovery.service, recoveryApi.service,
  wallet.service, walletController, routes/wallet.js, routes/recovery.js, page-route.js,
  swagger/schemas.js.
- Verified 15/15 (confirm-required, CX ≤10k credit + visible tx, cumulative>10k blocks CX/allows
  admin, cash needs bankDetails + always admin + no wallet tx, reject, eligible=min). Boot :7996
  clean; /wallet/eligible 401 unauth.

### §6 Recovery orders into pipeline — DONE (uncommitted), verified live 18/18 + boot
- **Free recovery order (CX-created).** bookOrder.model: isRecoveryOrder, recoveryForComplaintId,
  recoveryForOrderId, recoveryActionType. complaintCase.model: recoveryOrderIds[].
  recovery.service.createRecoveryOrder(caseId,{action,note,items,createdBy}): action ∈
  rewash/rework/repair/replace (compensate rejected — that's §7 money); creates a FREE bookOrder
  (amount 0, all items priced 0), copies fullName/phone/serviceType/tier/speed/addresses from the
  ORIGINAL order, stage QUEUE + station intake-and-tag, linked back to complaint+order; items =
  explicit list → complaint.affectedItems → original order items. Pushes recoveryOrderIds +
  recoveryAction; moves any PRE-recovery status (submitted/under-review/awaiting/item-received/
  reopened) → recovery-in-progress (system action, bypasses the CX transition map). Notifies
  Intake&Tag + admin. Route POST /recovery/cases/:id/recovery-order [customerExperienceAuth].
- **CX can't change op stages** — structural: CX has no station role, so the normal pipeline
  endpoints (intake/rider/wash/press/qc) reject them. No extra guard needed.
- **Auto status sync on delivery.** New util/recoveryHooks.recoveryOnOrderDelivered wired at ALL
  3 delivered sites (bookOrder.service:1461, rider.service:171, intake-user.service:2142).
  recovery.service.onRecoveryOrderDelivered(order): only acts on recovery orders; advances the
  linked complaint ready→resolved (system-driven, bypasses guard), sets resolvedAt +
  confirmationDueAt (48h) + reminder reset, notifies customer to confirm+rate. Idempotent (no-op
  if already resolved/confirmed/closed).
- **Recovery orders EXCLUDED from CRM/offer/referral accounting.** Guards added:
  crmHooks.crmOnOrderCreated/Delivered, offerHooks.offerOnOrderDelivered,
  referralHooks.referralOnOrderCreated/Delivered all early-return when order.isRecoveryOrder.
  (Verified CRM totalOrders unchanged.)
- **Admin/CX complaint dashboard.** recovery.service.caseDashboard(caseId) → {complaint(populated
  types+assignedTo), evidence{photos,affectedItems}, compensations, recoveryActions, recoveryOrders
  (live stages), escalation, slaBreaches{reviewOverdue,resolutionOverdue,escalated}, messages(full
  chat)}. Route GET /recovery/cases/:id/dashboard [customerExperienceAuth].
- Swagger: BookOrderSummary schema; recovery-order + dashboard routes. Files: bookOrder.model,
  complaintCase.model, recovery.service, recoveryApi.service, feedback.controller, util/recoveryHooks
  (new), crmHooks, offerHooks, referralHooks, bookOrder.service, rider.service, intake-user.service,
  routes/recovery.js, page-route.js, swagger/schemas.js.
- Verified 18/18 (free order into intake, linkage, status→recovery-in-progress, CRM excluded,
  delivery→resolved+48h, idempotent re-delivery, dashboard bundle). Boot :7995 clean (no circular
  dep from the hook wiring); both new routes 401 unauth.

### §4 Multi-criteria offer targeting — DONE (uncommitted), verified 19/19 + boot :7994
- **Decision resolved:** "customer group" = admin-managed CRM tag list (option a), matched
  against the customer's tags exactly like `tags` (OR-within, AND-across, empty=skip).
- **Client CONFIRMED Option A explicitly (2026-08-03):** customerGroups = a SECOND selection
  bucket drawing from the EXISTING CRM tags; semantics = (tags OR-within) AND (customerGroups
  OR-within). NO separate Segments feature, NO new tag values (student/young-professional/vip
  were only illustrative — not to be added). Backend already implements this exactly; remaining
  work is purely the FRONTEND picker (a 2nd multi-select bound to the same 18-tag CRM taxonomy,
  labeled as the AND bucket). "Curated groups" may be added later if the need arises.
- **Multi-trigger.** offer.model: new `triggers: [enum OFFER_TRIGGER]` (events that MINT the
  offer, OR); legacy single `trigger` kept + mirrors triggers[0]. Index {triggers:1,status:1}.
  `getActiveOfferForTrigger` now queries `$or:[{triggers:t},{trigger:t}]` (multi + back-compat).
- **customerGroups gate.** offer.model rules.customerGroups[]; checkProfileRules gained a
  customerGroups clause mirroring the tags pattern (some-overlap with stats.tags; empty=skip).
  Because checkProfileRules is the ONE shared gate (assignment handleTrigger + getCustomerOffers
  + getBookingOptions + _offerRejection), all paths get it — no new matching function needed.
- **Normalisation.** offerApi.validateOfferPayload validates triggers[] (each ∈ OFFER_TRIGGER);
  personal offer needs ≥1 trigger (trigger OR triggers). New `normaliseTriggers(post,existing)`
  keeps trigger==triggers[0], dedupes, empties for promos; wired into createOffer + updateOffer.
- **Backfill.** config/setup.backfillOfferTriggers — updateMany pipeline sets triggers:[$trigger]
  for offers with a legacy trigger and empty/absent triggers[]; idempotent; called in setupApp.
- **Swagger.** Offer schema (triggers[], rules.customerGroups + targeting semantics note);
  create-offer route body (triggers[], trigger deprecated, customerGroups). swagger parses.
- Files: models/offer.model.js, services/offer.service.js, services/offerApi.service.js,
  config/setup.js, routes/offer.js, swagger/schemas.js. Verify: scratchpad/verify_s4.js.

## CLIENT BRIEF STATUS: ALL 8 of 8 sections DONE (uncommitted). Brief complete.
- Everything on this branch (correction-feature) since the appliedOffers hotfix is UNCOMMITTED
  pending client review. Verification scripts live in scratchpad (not committed).
- §3C deep-link FE paths are best-guess — fix util/deepLink.js PAGE_ROUTES if FE differs.
- EVERYTHING since the appliedOffers hotfix is UNCOMMITTED per client: quick-wins (§1/§4-bookingopts/
  §8), §2, §3(all), §5, §7, §6. Verification scripts live in scratchpad (not committed).

## Session: 2026-08-01 — Order price breakdown + delete profile photo

### Done this session (uncommitted, branch bot-polising)

- **Order pricing receipt (`order.pricing`).** Client wants the customer to see the
  full breakdown of what raised/lowered an order's price. Added a frozen `pricing`
  subdoc to bookOrder.model captured at booking: itemsBase, serviceTier,
  tierMultiplier, tierUplift, itemsSubtotal, speedCharge/pickupFee/deliveryFee,
  feesTotal (==deliveryAmount), grossTotal, offerDiscount, freePickup/DeliveryWaived,
  appliedOffers[], creditApplied, orderTotal (==amount), youSaved,
  coveredBySubscription, reconstructed.
  - Two pure helpers on bookOrder.service: `_buildPricing({...})` (normalizes the
    receipt from figures already local to a billing branch — no math change) and
    `_buildPricingFallback(order)` (best-effort receipt for legacy orders, sets
    unknown fields null + `reconstructed:true` + a `note`).
  - Wired into all three branches of `postBookOrder`: subscription (itemsBase=
    itemsSubtotal, no fees/offer/credit), pay-per-item (added an itemsBase reduce +
    split speedCharge/pickupFee/deliveryFee out of extraDeliveryCost; capture after
    credit), pay-from-wallet (same split; creditApplied from `charge.creditApplied`;
    capture after charge). Each does one extra `newOrder.save()`.
  - Read side: `getBookOrder` now `.lean()` + fills fallback when `pricing` missing;
    `getBookOrderHistory` fills fallback per row. So every order always returns a
    `pricing` block; old orders flagged `reconstructed:true`. **No DB backfill** (by
    decision — fallback covers them on read).
  - Swagger: new reusable `OrderPricing` schema in swagger/schemas.js; `$ref`'d from
    the single-order + history route responses. swagger-jsdoc parses (35 schemas).
  - Verified LIVE 18/18 (throwaway user+wallet, real pay-per-item premium booking:
    ₦3500 base ×1.5 = ₦5250 + ₦1000 fees = ₦6250 == amount; invariant grossTotal −
    reductions == orderTotal; legacy fallback path) — data cleaned up.
- **DELETE /users/profile-image [auth].** Removes the Cloudinary asset (if any) and
  resets `user.image` to the default placeholder; idempotent. New
  `UserService.deleteProfileImage`, controller `deleteProfileImage`,
  `ROUTE_PROFILE_IMAGE_DELETE='/profile-image'`, route + Swagger. Placeholder URL
  captured as `DEFAULT_PROFILE_IMAGE_URL` const (matches user.model default).
  Verified live: reset + persisted. NOTE: inline `node -e` DB scripts buffering-
  timeout on this machine; file-based scratchpad scripts work — use those.
- **Regression caught + fixed during review.** First cut gave the `pricing` subdoc
  leaf `default`s → Mongoose auto-populated a zeroed `pricing:{...reconstructed:false}`
  on EVERY new order, incl. the intake walk-in path (intake-user.service) that never
  sets it, so the read-time fallback (`if(!pricing)`) never fired and walk-ins showed
  a misleading all-zero receipt. Fix: (a) removed all leaf defaults + `default:undefined`
  on the subdoc so it stays ABSENT unless a branch sets it (verified: unset → undefined
  → fallback fires); (b) also gave the intake walk-in path a real receipt (reuses
  `BookOrderService._buildPricing`; no offer/credit). No circular-dep (neither service
  required the other before). Re-verified 18/18 + default-absent + cross-require smoke.
- Files: models/bookOrder.model.js, services/bookOrder.service.js,
  services/intake-user.service.js, swagger/schemas.js, routes/bookOrder.js,
  services/user.service.js, controllers/user.controller.js, routes/users.js,
  util/page-route.js.

## Session: 2026-07-28 — Bot: parallel bot + human support threads

### Done this session (uncommitted, branch usage-branch)

- **Two-thread support model for the Phase 6 in-app bot.** Client wants a customer
  to start/continue a bot chat WHILE a handed-off human chat stays open — the two
  shown as separate tickets ("Assistant" = bot, "Support agent" = human). Old model
  allowed only one open support conversation per customer, so bot and human collided.
- `conversation.service.getOrCreateSupport` now scoped to `mode:'bot'` (the one
  change that decouples the live bot thread from any open human thread). Added
  `findOpenHumanSupport(userId)` and `listOpenSupport(userId)` (open bot+human,
  newest first).
- Handoff FLIPS the current bot thread to `mode:'human'` (it becomes the ticket, no
  duplicate); the next `POST /bot/message` finds no open bot thread and mints a fresh
  one alongside the human one. So the assistant is never unavailable; open bot and
  open human threads each stay 0–1. Only staff-close ever closes a thread.
- New/changed endpoints (all customer `auth` unless noted):
  - `GET /bot/conversations` — list my open support threads
    `[{_id,mode,open,unreadForCustomer,lastMessageAt}]` (does NOT mark read; closed
    threads excluded). New `listConversations`.
  - `GET /bot/conversation?conversationId=<id>` — optional param opens a SPECIFIC
    owned thread (e.g. the human one); ownership-checked; marks that thread
    customer-read. Omit → get/create the bot thread (unchanged default).
  - `POST /bot/conversation/:conversationId/message` — NEW customer-reply route so
    the customer can write into the human thread (bot stays silent, `handledBy:human`,
    echoes the message + emits socket). If the target is still a bot thread it
    delegates to the orchestrator (same as `/bot/message`). Rejects closed threads.
  - `POST /bot/handoff` — now idempotent: reuses an existing open human thread
    instead of spawning empty duplicate tickets.
- Files: services/botApi.service.js (`listConversations`, `replyToConversation`,
  `getConversation` param, idempotent `requestHandoff`), services/conversation.service.js,
  controllers/bot.controller.js, util/page-route.js (ROUTE_BOT_CONVERSATIONS,
  ROUTE_BOT_CUSTOMER_REPLY), routes/bot.js (+2 routes, Swagger for both + conversationId
  param on `/bot/conversation`). Swagger reuses inline shapes / BotReply — no new
  schema needed (Conversation already covers the fields).
- NOT verified by a runtime script this session — only `node -c` syntax checks on all
  changed files (clean). Recommend a boot + quick drive before committing.
- Gap deferred: no customer-facing closed-thread history endpoint (list filters
  `open:true`); if wanted, add `?includeClosed` or a history route.
- **Queue last-message preview.** `GET /bot/queue` now returns `lastMessage:
  {senderType,text(≤140+…),attachments,createdAt}` per chat (null if empty), so the
  CX queue shows previews without client-side caching. One extra aggregation over
  ChatMessage (newest msg per conversation via $group $first) — not N queries.
  botApi.service (import ChatMessageModel + queue rewrite), routes/bot.js Swagger.
- **Bot small-talk (client asked to make it smarter).** Symptom: greetings/chit-chat
  ("hey", "what's up") dumped the robotic capabilities menu. Root: greeting + unknown
  branches returned fixed canned text. RELAXED the "LLM classify-only" rule to a
  bounded second job: `botIntent.smallTalkReply(text,{kind:'greeting'|'outOfScope',
  fallback})` — LLM writes ONE short guardrailed reply (no prices/promises/data/policy/
  actions; always steers back to capabilities), falls back to the canned menu when no
  provider/errors. Added `smallTalkPrompt` + `_generateOpenAI`/`_generateAnthropic`
  (plain-text gen, max_tokens 120). Orchestrator: greeting case + the low-conf/UNKNOWN
  menu branch now call it (today's text as fallback). ALL data/action workflows stay
  deterministic — LLM never generates data replies. CLAUDE.md bot section updated.
  Verified live (OpenAI): natural greetings, "can you do my taxes"→graceful redirect,
  no-provider→FALLBACK. Note: greeting/unknown now cost 2 LLM calls (classify + gen).
- **Fixed non-LLM fallback + `about` intent.** (a) Out-of-scope now falls back to a
  fixed `cantUnderstand()` ("Sorry — I can't quite answer or understand that…" +
  capabilities) instead of the bare menu, so it degrades gracefully when the LLM is
  down. (b) New `BOT_INTENT.ABOUT` ('about') for "who/what are you"/"what can you do" →
  deterministic `aboutBot()` reply (never LLM; works offline). Classifier: enum value +
  system-prompt hint + rulesFallback keywords (placed before greeting). Factored a
  shared `capabilities()` sentence reused by menu/aboutBot/cantUnderstand.
  Files: util/constants.js (ABOUT), botOrchestrator.service.js (allowedIntents, ABOUT
  case, capabilities/aboutBot/cantUnderstand, menu rework, out-of-scope fallback swap),
  botIntent.service.js (prompt hint + rules keywords), swagger/schemas.js (BotReply
  intent enum + about), CLAUDE.md. Verified live: identity→about (LLM 1.0 AND rules 0.4
  when LLM down), nonsense→unknown, out-of-scope w/ LLM down→fixed apology text.
- **Rules-fallback greeting coverage (offline path only; LLM path untouched — it
  already handles all phrasings).** In `rulesFallback`: (a) added `hasWord()`
  word-boundary matcher so short tokens like "hi"/"yo" no longer false-fire inside
  "this"/"shipping" (real bug); short greeting tokens moved to it and widened (yo, sup,
  hiya, howdy, gm, greetings, thanks + phrase forms what's up/wassup/wagwan/how far/
  how are you/good day). (b) Added a heuristic: a leftover message of ≤2 words that
  matched nothing else → greeting (covers the long tail without enumerating). Verified:
  long-tail greetings→greeting, "is this ready"→order-status (not greeting), genuine
  3+word non-matches→unknown. Philosophy: LLM owns the long tail; rules just degrade
  gracefully (unmatched → unknown → cantUnderstand).
- **Lost/missing/not-received → escalate to human; fault-aware routing.** "I lost my
  bag" was classifying as `unknown` (even LLM up) → dismissive cantUnderstand. Client
  point: a "complaint" implies Chuvi did wrong, so a lost personal bag shouldn't file
  one. Routing now distinguishes fault:
  - **Clear service failure** (ORDER/DELIVERY/ITEMS damaged/wrong/missing/not received)
    → `file-complaint` (apology + open case). Rules kw: complain, damaged, missing,
    not washed, stain, wrong item, bad, didn't/didnt get, didn't/didnt receive, never
    got/received/arrived, not delivered, stolen.
  - **Vague/out-of-scope/personal** ("I lost my bag", "I have a problem") → `talk-to-
    human` (NEUTRAL handoff, no apology/assumed fault). Rules kw added to talk-to-human:
    lost, can't/cant find. Prompt tells the LLM not to assume fault or apologise.
  - **Pure status** ("where/track/ready", nothing wrong) → `order-status` (bot answers,
    NO handoff) — don't flood CX.
  Both file-complaint & talk-to-human end in handoff (differ only in tone). Client chose
  NOT to show order status before complaint handoff (keep simple). Verified: LLM 10/10,
  rules 9/10 — only miss "I have a problem"→unknown offline (too generic; LLM gets it;
  degrades to cantUnderstand which still offers a human). Left as-is per "LLM owns long
  tail, rules good-enough".
- **Offer display metadata for frontend (additive, non-breaking).** FE offer-flow
  review asked for display-ready fields so UI logic stays server-side. Added to
  offer.service.js:
  - my-offers (`getCustomerOffers`) — every entry (rewards/promotions/baseline) now
    carries `displayRules[]` (human-readable rule summary via `buildDisplayRules`),
    `expiresInDays` (rounded-up; rewards from linkage.expiresAt, promos/baseline from
    offer.expiryDate; `daysUntil`), `remainingUses` (GLOBAL cap left, null=unlimited).
  - `/offers/validate` (`validateAndPrice`) — each `rejected` entry now also has
    `requirement{type,needed,current,shortfall}` and `unlockMessage` ("Spend ₦600 more
    to use this offer.") for order-level rules (minOrderValue/minItems/serviceType);
    null for non-actionable rejections. `checkBookingRules` now returns `requirement`.
  - New helpers: naira, daysUntil, remainingUses, buildDisplayRules, decorateOffer,
    unlockMessage. Swagger: Offer + CustomerOffer gain the 3 display fields; OfferQuote
    rejected gains requirement+unlockMessage; usageLimit desc clarified (null/absent=
    unlimited, 0=none). Answered FE clarifications: my-offers filters PROFILE rules +
    window + capacity only (order-level needs a cart → validate); usageLimit 0 = zero
    allowed not unlimited. Verified: helper unit tests + LIVE DB end-to-end drive 18/18
    (throwaway ZZ_TEST offers+linkage, deleted in finally — 0 leftovers): my-offers
    decoration on rewards+promotions, personal minItems + promo minOrderValue rejections
    with requirement/unlockMessage, and eligible happy-path applies. swagger-jsdoc parses.
- **Bot UX fixes 1–3 (compound / delay-aware / handoff clarity).** All verified live
  12/12 (throwaway user+order, cleaned up).
  1. **Multi-intent**: classify now returns `intents[]` (schema + prompt); orchestrator
     batches READ_ONLY_INFO intents (order-status, wallet, offers, referral) — "my
     balance and order status" answers both. Escalation/mid-flow/actions never batched.
     Refactored the single path into `_runSingle`. Compound answers now render as
     ONE cohesive bubble ("Here's what I found:" + 📦/💰/🎁/👥 sections joined) instead
     of stapled bubbles — only the wrapper is templated, section data stays
     deterministic (INTENT_ICON map). Verified live.
  2. **Delay-aware order status**: `orderStatusReply` (replaces `orderStatus`) — when
     the order is overdue OR the message mentions delay/late, it appends an empathetic
     line + "connect you to a person?" and sets `botState.step='offered-handoff'`; next
     turn an affirmative (`isAffirmative`) hands off. Never invents a delay reason.
     Suppressed in batch mode (allowHandoffOffer=!batch).
  3a. **Handoff = one clean bubble**: TALK_TO_HUMAN now returns no bot reply;
      FILE_COMPLAINT returns an empathetic apology only; the single expectation-setting
      notice comes from `handoff()` ("You're now in our support queue — … reply right
      here shortly."). Fixes the old duplicate "connecting you…" bubbles.
  3b. **"Agent joined" signal**: new `conversation.agentJoinedAt` + `markAgentJoined()`;
      first staff reply (botApi.staffReply) posts "You're now connected to our Customer
      Experience team." once + emits socket. Answers "how do we know an agent connected"
      (staff still reply manually — by design).
  Files: botIntent.service (intents[] schema/prompt/parse), botOrchestrator (READ_ONLY_INFO,
  handleCustomerMessage rewrite + _runSingle, orderStatusReply, isAffirmative, handoff text,
  runWorkflow batch param), conversation.model (agentJoinedAt), conversation.service
  (markAgentJoined), botApi.service (staffReply calls it). Backdrop: prod LLM key was the
  cause of the earlier robotic repeats — now set + redeployed, LLM confirmed live.
- **Staff-close of support chat now proper (was a silent boolean flip).** Verified live
  13/13. Four fixes in the close path:
  1. **Customer close notice** — posts a one-time system message "This chat has been
     closed by our team. Send a new message anytime and the assistant will pick it up."
  2. **Real-time push** — emits that message (emitChatMessage) + a NEW
     `conversation:closed` socket event (config/socket `emitConversationClosed`, rooms
     user:<id> + staff:support) so live UIs flip back to the assistant / drop from queue.
  3. **Audit** — new `conversation.closedAt/closedBy/closeReason`; controller passes
     `closedBy: req.user.id` + optional `reason` from body.
  4. **Hardening** — `closeConversation(id, {closedBy, reason})` guards to open SUPPORT
     chats only and is idempotent (`alreadyClosed:true`, no dup message/event).
  Response now `{closed, alreadyClosed, conversationId, closedAt}`. Double-close race
  now ATOMIC (findOneAndUpdate on `open:true`) — concurrent closes give exactly one
  winner + one notice (verified with a Promise.all race test). `conversation:closed`
  payload gained `source` ('staff' now; 'inactivity' reserved for a future auto-close)
  so the frontend won't need a second pass. Files: conversation.model
  (3 fields), conversation.service (closeConversation rewrite), botApi.service (controller
  + import emitConversationClosed), config/socket (emitConversationClosed), routes/bot
  (Swagger: reason body + richer response + behavior notes), swagger/schemas (Conversation
  gains agentJoinedAt/closedAt/closedBy/closeReason), CLAUDE.md. Unchanged: staff-only
  (customerExperienceAuth), history retained, next customer msg → fresh bot thread.
- **Documentation pass — closed the three persisted-doc gaps.** (1) Rewrote
  `docs/frontend.md` §7 (In-app Bot) to current reality: two-thread model (Assistant +
  Support agent), all customer endpoints incl. `/bot/conversations` +
  `/bot/conversation/:id/message` + conversationId param, staff queue `lastMessage`,
  compound/combined replies, delay-aware offer, agent-joined + close notices, and a full
  Real-time section documenting BOTH socket events (`chat:message` and the new
  `conversation:closed {conversationId,closedAt,source}`), rooms, handshake — the socket
  contract now lives in-repo, not just chat. Corrected 7f (provider is BOT_PROVIDER/
  OpenAI-preferred, not Anthropic-only). (2) `BotReply` schema: `intent` is now a free
  string (compound '+'-joined for multi-intent, values in description), `replies`
  description notes combined/compound + dedupe-by-id. swagger-jsdoc parses clean.
- **Diagnosed (frontend, NOT fixed here): "two messages flashed".** Each bot reply is
  delivered by BOTH the REST `replies` and the socket `emitChatMessage` push to
  `user:<id>`; the customer's own message is echoed to that room too. Frontend renders
  both → duplicate. First msg showed once because the socket hadn't joined the room yet.
  Fix is frontend dedup by message `_id` (or render from one source). Backend dual-emit
  is intentional (other devices + staff live) — left as-is.

## Session: 2026-07-20 — Wallet admin credit lookup + Order cancellation (Green/Amber/Staff)

### Done this session (uncommitted)

- **Diagnosed `/wallet/admin/adjust-credit` "not updating" report.** Verified end-to-end
  against live DB: backend is correct — grant creates an active credit and
  `getWalletBalance`/`getWalletCredits` return the updated `creditTotal`/`totalAvailable`.
  Root cause is frontend-side (likely showing cash `balance`, which admin credit
  never touches, or not refetching). No backend change needed there.
- **New `GET /wallet/admin/credits?userId=` [adminAuth]** — closes the gap where the
  `remove` path needs a `creditId` an admin had no way to see. Returns cash + credit
  totals + each active credit with its `creditId`. (wallet.service `adminGetUserCredits`,
  controller, route+Swagger, page-route). Verified: valid/missing/unknown-user cases.
- **Order cancellation — Phase 1 (Green) built + verified.** Client policy 2026-07-20
  (see decisions memory): refund to CHUVI wallet only (never card/bank); Green =
  self-cancel now; Amber (request→CX approval) = Phase 2; Red = blocked; 15-min grace.
  - Added `ORDER_STATUS.CANCELLED`, `NOTIFICATION_TYPE.ORDER_CANCELLED`,
    `AdminSetting.orderCancellationGraceMinutes` (default 15), `bookOrder.cancellation`
    subdoc.
  - `bookOrder.service`: `_cancelTier(order, graceMinutes)` (green/amber/red guard) +
    `cancelOrder(req)` — reverses credits (`WalletCreditService.reverseOrderCredits`),
    refunds cash to wallet (`amount - creditsReversed`, only if paymentStatus success),
    releases offer (`offerOnOrderCancelled` → `OfferService.releaseForOrder`), frees a
    scheduled pickup, notifies + audits (side effects non-fatal). CRM hook
    `crmOnOrderCancelled` wired defensively (no CRM handler yet — no-ops).
  - `POST /bookOrder/book-order/:id/cancel` [auth] + Swagger. Controller `cancelOrder`.
  - Verified live: tier logic across 8 real orders (pending→green, processing→red,
    hold→amber); full cancel of a throwaway paid order refunded ₦5000 to wallet, set
    status cancelled, rejected non-owner; test data cleaned up.
  - Cash refund posts BOTH a wallet `credit` WalletTransaction (balance + monthly
    aggregation) AND a `Payment` record (`type:'refund'`, `alertType:'credit'`,
    `paymentMethod:'wallet'`, shared reference) so it appears in `fetch-user-transactions`.
    Added `refund` to `Payment.type` enum and `wallet` to `Payment.paymentMethod` enum.
    Verified live: refund visible in transaction history; test data cleaned up.
- **Order cancellation — Phase 2 (Amber) built + verified.** Customer requests →
  Customer Experience approves/rejects; fee withheld from cash refund only.
  - New `models/cancellationRequest.model.js` (pending/approved/rejected;
    `CANCELLATION_REQUEST_STATUS` in constants; partial unique index → one pending
    request per order, so resubmit-after-reject works). Added `cancellation.feeApplied`
    to bookOrder.
  - Refactored the Green unwind into shared `_performCancellation(order, {reason,
    performedBy, tier, feeApplied})` — refund = `max(0, cashPaid - fee)`, fee capped at
    cash paid, credits always fully restored. Green calls it with fee 0.
  - New service methods: `requestCancellation` (customer, Amber-only guard),
    `getCancellationRequests` (CX queue, populated), `approveCancellationRequest`
    (re-checks not-Red, runs unwind with fee), `rejectCancellationRequest`.
  - Routes on /bookOrder: `POST /book-order/:id/cancel-request` [auth];
    `GET /cancellation-requests`, `POST /cancellation-requests/:id/approve`,
    `POST /cancellation-requests/:id/reject` [customerExperienceAuth]. Controller +
    page-route + Swagger.
  - Verified live: amber detected, green-cancel refused on amber, reason required,
    duplicate request blocked, CX queue lists it, approve w/ ₦500 fee refunded ₦4500
    (fee withheld, visible in tx history), re-approve blocked; test data cleaned up.
  - No migration needed: `orderCancellationGraceMinutes` reads via `?? 15` fallback for
    existing AdminSetting docs.
- **Swagger follow-up #1 done:** added `CancellationRequest` + `CancellationRequestPage`
  schemas to swagger/schemas.js; CX queue route now `$ref`s the page schema (doc-only).
- **Cancellation consolidation (client decisions 2026-07-20):**
  - **Removed `/wallet/admin/reverse-order-credits`** (route+Swagger+controller+service
    `adminReverseOrderCredits`+page-route const+import; frontend.md updated). The cancel
    flow supersedes it (reverses credits AND refunds cash AND releases offer). The internal
    `WalletCreditService.reverseOrderCredits` STAYS — it powers `_performCancellation`.
  - **New `POST /bookOrder/book-order/:id/staff-cancel`** guarded by
    `multiAuth(ROLE.ADMIN, ROLE.INTAKE_AND_TAG)` → `bookOrder.service.staffCancelOrder`.
    Admin cancels at ANY stage (incl. Red); intake-and-tag only when not-Red
    (pre-processing). Reuses `_performCancellation` (+ optional fee). Note: multiAuth
    checks `req.user.userType` (not `.role`). Verified live: no-reason refused, intake
    blocked on washing, admin voids mid-wash (₦5000 refunded), intake allowed on received,
    double-cancel refused; swagger drops old path + adds staff-cancel.
- **Order history `view` filter (2026-07-21):** cancelled orders are NEVER deleted.
  `getBookOrderHistory` now takes `?view=active|completed|cancelled|all` (default all):
  `active` = `stage.status $ne cancelled` (every real order incl. delivered — the
  customer "my orders / track" screen; delivered intentionally kept visible),
  `completed` = delivered, `cancelled` = cancelled only. Existing `?status=` exact match
  still works and takes precedence over `view`. Single-order track (`/:id`) unchanged —
  still opens a cancelled order. Swagger updated. Verified live across all buckets +
  precedence.

## Session: 2026-07-19 (later still) — Phase 6 In-app Bot

### Done this session (uncommitted)

- **Phase 6 in-app bot — built + verified.** Hybrid LLM+rules assistant in THIS
  backend. Client decisions: LLM classifies intent only; low-risk actions only
  (high-risk → human handoff, structurally no workflow); provider Claude
  (`claude-haiku-4-5`); guided booking that never places the order;
  authenticated customers only; WebSockets now.
- New: services/botIntent.service.js (Claude structured tool output `{intent,
  confidence, slots}` + keyword fallback when ANTHROPIC_API_KEY unset/errors —
  never hard-fails); services/botOrchestrator.service.js (deterministic router +
  workflows over existing systems: order-status, wallet-balance, view-offers,
  referral-info incl. level, apply-referral-code, update-details phone/pickup,
  booking-guide, feedback-ack, menu, handoff); config/socket.js (socket.io on
  the HTTP server, JWT handshake, rooms user:<id>+staff:support, emitChatMessage
  non-fatal); services/botApi.service.js; controllers/bot.controller.js;
  routes/bot.js (/api/bot: message/conversation/handoff [auth]; queue/reply/close
  [customerExperienceAuth]).
- Modified: constants (BOT_INTENT + export); conversation.model (botState) +
  conversation.service (getOrCreateSupport); user.model (defaultPickupAddress);
  server.js (initSocket on httpServer; uncommented socket require); routes/index
  + page-route (bot routes); swagger/schemas (BotReply); CLAUDE.md (In-app bot
  section + env); .env (ANTHROPIC_API_KEY empty, BOT_MODEL=claude-haiku-4-5).
  Installed @anthropic-ai/sdk. socket.io was already a dependency; CHAT_SENDER.BOT
  and CONVERSATION_TYPE.SUPPORT already existed from Phase 4.
- Verified: 18-check script (each read workflow, multi-turn apply-code +
  update-details, unknown→menu, refund & complaint → handoff-never-acts, bot
  silent after handoff, no credit ever granted by bot) + PORT=7999 boot with
  sockets. NOTE: the rules fallback ordering matters — "referral code" must NOT
  match apply-code (fixed: apply needs an actual code or apply/redeem verb),
  else a stray pending botState hijacks later single-shot messages.
- Permission boundary is STRUCTURAL: high-risk actions have no intent/tool, so
  the bot can only ever hand them to a human. LLM path unused in tests (no key)
  — rules fallback exercised; set ANTHROPIC_API_KEY to enable Claude classifier.

## Session: 2026-07-19 (later) — Referral Levels enhancement

### Done this session (uncommitted)

- **Referral advocacy levels — built + verified.** Client's FINAL decision =
  Option A: levels are PERMANENT achievements (earned by lifetime successful
  referrals, never lost → permanent reward % + exclusive offer); only the
  MONTHLY free-laundry perk is activity-gated (granted in any month the monthly
  target is met, paused otherwise, auto-restored on requalify). No demotion.
- Levels: Member/Promoter/Ambassador/Champion. Default ladder (admin-editable in
  RewardSetting.referralLevels): life>=0/3/8/15, monthly>=0/2/3/5, reward
  5/7/10/15%, free-laundry ₦0/2000/5000/10000, offerTrigger level-promoter/
  ambassador/champion.
- New: `models/referralStats.model.js` (per-user snapshot: lifetime/monthly
  counts, monthKey, currentLevel, highestLevelReached, levelSince,
  lastMonthlyPerkKey). Added `rewardedAt` to referral.model (authoritative for
  monthly counting).
- constants: `REFERRAL_LEVEL` enum + 3 `OFFER_TRIGGER` values (LEVEL_*).
  rewardSetting: `referralLevels` array (+ subdoc schema + DEFAULT ladder) with
  backfill in config/setup.createRewardSettings. Seeded templates
  `referral-level-up` + `referral-monthly-benefit`.
- referral.service: level-aware `computeReward` (uses referrer's level %, +1
  prospective so the promoting referral gets the boosted rate); `rewardedAt` set
  on grant; new engine methods `getLevelConfig/levelForLifetime/levelRank/
  countLifetimeSuccessful/countMonthlySuccessful/recomputeLevel/onLevelUp/
  maybeGrantMonthlyPerk/getLevelSummary`. `recomputeLevel` called after every
  grant AND on every page load (idempotent; no cron needed — monthly counts are
  derived from rewardedAt, perks deduped by stored key + credit sourceRef).
  `getReferralPage` now returns a `level` block. Monthly perk = `laundry` credit
  via WalletCreditService, sourceRef `referral-level-laundry-<lvl>-<YYYY-MM>`.
  Exclusive offer linked once via offerOnTrigger milestoneKey `level-<lvl>`.
- swagger: added `ReferralLevel` schema + `level` on `ReferralPage`.
- Verified: 22-check script (Member start → Promoter@3/Ambassador@8/Champion@15,
  level-aware reward %, monthly perk grant + idempotency, permanent level on
  missed month + perk pause, page level block) + PORT=7999 boot. No wallet/offer
  engine changes — only calls into them. Reused offerHooks (no circular dep:
  offer.service doesn't require referral).

## Session: 2026-07-19 — Swagger response shapes for all 5 systems + wallet

### Done this session

- **Swagger examples/responses pass (uncommitted).** Frontend couldn't see the
  shape of returned data for Communication, Offer, Feedback & Recovery, Referral
  (and asked to align Wallet too). Fixed by establishing a reusable pattern:
  - Added ~20 reusable `components.schemas` to `swagger/schemas.js` with realistic
    examples + spelled-out enums: WalletCredit, WalletTransaction, OfferBenefit,
    Offer, CustomerOffer, OfferPage, OfferQuote, Referral, ReferralPage, Feedback,
    ComplaintType, RecoveryAction, RecoveryCredit, ComplaintCase, Conversation,
    ChatMessage, CommunicationTemplate, CommunicationLog, plus shared ErrorResponse.
  - Rewrote route responses to `$ref` those schemas inside the `{ success, message }`
    envelope (arrays, `{data,pagination}`, and single-object variants) across
    routes/feedback.js, recovery.js, referral.js, offer.js, communication.js, and
    pointed wallet.js placeholder `type: object` items to WalletCredit/WalletTransaction.
  - Verified each example against the real service return (e.g. submitFeedback →
    `{feedback, complaint, referralEligible}`; listMessages → `{data, pagination}`;
    approveCredit → ComplaintCase; getPerformance → `{offer, performance}`) — not assumed.
  - Codified the pattern as a standing rule in CLAUDE.md → API docs and summary.md
    (Key architecture rules) so future routes follow it.
  - "CX" = **Customer Experience Officer** (ROLE `customer-experience`), the staff
    role that owns all complaint cases in the Recovery system.

## Session: 2026-07-18 (continuing from 2026-07-15..17 planning sessions)

### Done this session

- **Phase 5 Referral System: COMPLETE (uncommitted)** on branch
  `feature-referral` (off `feature-feedback-recovery` @ 5d80b2e; Phase 4
  committed by user as `5d80b2e All done for the feedback-recovery`). All
  feature.md deliverables done. New: models/referral.model.js;
  services/referral.service.js + referralApi.service.js; util/referralHooks.js;
  controllers/referral.controller.js; routes/referral.js (/referral). Modified:
  constants (REFERRAL_* enums), user.model (referralCode unique sparse),
  rewardSetting (referralWelcomeAmount), auth.service (×3 register paths →
  ensureCode + capture-if-referralCode), bookOrder/intake/rider services
  (referralOnOrderCreated + referralOnOrderDelivered beside existing hooks),
  recovery.service (referralOnEligibilityRestored in confirmResolution),
  page-route, routes/index. Verified: 25-check script (code gen/uniqueness/
  permanence, capture + welcome credit, self-ref/dup blocked, first-order,
  delivered→10% reward w/ 45d credit, no-double-reward, max cap, deferred-when-
  paused→released-on-restore, page stats, reset) + boot. Reward is direct
  wallet credit (% of order), NOT an Offer benefit — see feature.md rationale.
- **Phase 4 Feedback & Recovery: COMPLETE (committed 5d80b2e)** on branch
  `feature-feedback-recovery` (created off `offer-system` @ aee9434 after
  clearing a months-old orphaned interactive rebase with `git rebase --quit` —
  non-destructive, HEAD untouched). Phase 3 was already committed by user as
  `aee9434 offer system done`. All feature.md deliverables done. New: models
  feedback/complaintType/complaintCase/conversation/chatMessage; services
  conversation/recovery/feedback/recoveryApi; controllers/feedback.controller;
  routes/feedback.js (/feedback) + routes/recovery.js (/recovery);
  middlewares/customerExperienceAuth; crons/complaintSla.js (hourly).
  Modified: constants (feedback/recovery/complaint/conversation enums + CX role
  + RECOVERY audit cat + notif types), crmProfile (referralPaused) + CrmService
  (applyRecoveryTags/clearRecoveryTags), rewardSetting (SLA hours + already had
  approval threshold), config/setup (seed 10 complaint types), page-route,
  routes/index, server.js. Verified: 27-check script (satisfied/complaint
  paths, CRM tags + referral pause, conversation + system msgs, status-machine
  guards, compensate auto-escalate, approval gate ≤10k CX vs >10k admin, wallet
  recovery credit + recovery offer trigger, confirm clears tags/restores
  referral + closes convo, reject→reopen, chat unread counters, SLA sweep) +
  boot + 10 complaint types seeded. NOTE: test left a stray complaint type on
  first run (DB was empty); cleaned it and re-booted so the real 10 seeded.
- **Phase 3 Offer System: COMPLETE (committed aee9434).** All feature.md
  deliverables done. New: models/offer.model.js, models/customerOffer.model.js,
  services/offer.service.js (engine), services/offerApi.service.js,
  controllers/offer.controller.js, routes/offer.js (/offers — specific paths
  registered before /:id), util/offerHooks.js, crons/offerExpiry.js (02:45).
  Modified: constants (OFFER_* enums + AUDIT_LOG_CATEGORIES.OFFER),
  crm.service.js (trigger calls at createLead / handleOrderDelivered /
  runDormancyScan), intake-user + rider + bookOrder services
  (offerOnOrderDelivered beside crmOnOrderDelivered), page-route, routes/index,
  server.js. Verified: 36-check script (triggers+dedupe, eligibility, page,
  stacking pricing incl. free-items cap, attach/redeem/release, credit payout
  w/ per-offer expiry override, expiry sweep, performance, real
  CrmService.handleOrderDelivered auto-linking) + PORT=7999 boot.
- **Phase 2 Communication layer: COMPLETE (uncommitted).** All deliverables in
  feature.md done. New files: models/template.model.js,
  models/communicationLog.model.js, services/communication.service.js (facade),
  services/communicationAdmin.service.js, controllers/communication.controller.js,
  routes/communication.js (mounted at /communication). Modified: constants
  (COMM_* + AUDIT_LOG_CATEGORIES.COMMUNICATION), notification model +
  createNotification (page/recordId deep links), notification.service (read
  receipts → CommunicationLog on all three read paths), config/setup.js (4
  seeded templates), page-route.js. Verified: 17-check script (template render,
  in-app delivery + deep link, SMS failure path without sending real SMS, retry
  accounting, read receipts, never-throws) + PORT=7999 boot. NOTE: template
  render placeholders use {{key}}; unknown keys stay literal.
- **Context folder created** (this folder) + CLAUDE.md points to it.
- **Phase 1 Wallet & Credit: COMPLETE** on branch `feature-wallet-credits`,
  committed by user as `e0fca80 wallet-credits done`. Details in summary.md
  and the commit. Verified with three throwaway scripts (in session scratchpad,
  not committed): full credit lifecycle (24 checks), real payWithWallet drive
  (mixed credit+cash, credit-only, insufficient-cash), and the
  partial-credit-then-cash-fails rollback path. All passed; synthetic data
  cleaned up.
- **Phase 2 Communication layer: STARTED.** Studied existing plumbing:
  - `util/createNotification.js` — thin create wrapper `{userId,title,body,subBody,type}`
  - `models/notification.model.js` — has `isRead`, `NOTIFICATION_TYPE` enum
  - `services/notification.service.js` — list (with unreadCount), get-one
    (auto-marks read at line ~58-61), explicit mark-read (~85-91)
  - `routes/index.js` — routers mounted under /api; new communication router
    goes here
  - SMS: `util/sendSms.js` (Termii, generic channel, works; env keys present)

### Phase 2 plan (agreed design)

1. Constants: `COMM_CHANNEL` (in-app, sms), `COMM_STATUS`
   (pending/sent/delivered/read/failed), `COMM_SOURCE_SYSTEM`
   (crm/offer/order/feedback/recovery/referral/broadcast/system).
2. `models/template.model.js` — admin-managed: key (unique), name, title,
   body (supports {{placeholders}}), smsBody optional, channels, active.
3. `models/communicationLog.model.js` — userId, messageType, sourceSystem,
   relatedRef, channel, status lifecycle, content, notificationId, error.
4. Notification model + createNotification gain deep-link fields
   (`page`, `recordId`) — additive, non-breaking.
5. `services/communication.service.js` — facade:
   `send({userId, templateKey?|title/body, data, sourceSystem, messageType,
   relatedRef, page, recordId, channels})` → render → deliver in-app (+SMS
   when asked) → log per channel. Plus `retryFailed()` and log queries.
   CRM messenger stays as-is for now (migrates later).
6. Read receipts: notification.service mark-read paths also flip the linked
   CommunicationLog to `read`.
7. Routes `routes/communication.js` mounted at `/communication`: admin template
   CRUD, admin log listing w/ filters. Swagger on everything.
8. Seed a few default templates in `config/setup.js`.
9. Verify with a lifecycle script (synthetic user, cleanup), then server boot.

### Environment notes

- User's dev server usually running on :7000 (nodemon) — boot-verify on PORT=7999.
- Verification scripts pattern: absolute requires into the repo +
  `require('<repo>/node_modules/dotenv')` (scratchpad is outside the repo tree).
