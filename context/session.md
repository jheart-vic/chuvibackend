# Current Session Log

> **▶ WHAT IS LEFT TO BUILD LIVES IN `context/feature.md`, IN THE "TO BUILD" BOARD AT THE VERY
> TOP. Read that first, before anything else in either file.** Short version: N1 Quick Booking
> + order editing is the one large piece. **Items #8, #6 and #9 were built 2026-10-08 (see the
> board).** Of what is left, #10 notifications and #2 offer auto-grant are blocked on client
> answers sent 2026-10-08, and **#1's CRM sequence is blocked on CONTENT — the three verbatim
> message texts were never saved into this repo, so there is nothing to copy; ask for them.**
> **MERGE STATE IS CLEAN: PR #242 put everything on `origin/main` (`e0d5c3a`) and
> `origin/main..feature/fix` is EMPTY.** Any older note here claiming commits are unpushed is
> stale.

### ALL FIVE RULINGS + HOUSEKEEPING BUILT — briefCheck **208/208**, 20 harnesses green
holds **48/48** (was 34) · stationFlow **97/97** (was 92) · tierPricing 33 · phase12 14 ·
counterPayment 51 · regNotBooked 33 · recoveryReport 52 · walletLimit 63 · handoff 54 · dispatch 46 ·
dispatchTag 46 · dashboardDecisions 36 · offerAdmin 37 · freeLogistics 23 · template 27 ·
subLogistics 20 · staffStatus 38 · planCreate 39 · bot 11/11. Swagger 62/296/0.

- **HOLDS ARE PER-STATION NOW.** Removing one line per station (the order-level
  `buildStageUpdate(HOLD, …)`) is what unparked the siblings. The hard parts were the filters:
  **`$elemMatch` is mandatory because a RELEASED hold keeps its `heldAt`**; **`$and` not `$or`
  because Overdue's clause is itself an `$or` and two `$or` keys overwrite each other silently**;
  and **every order-level breach branch had to be pinned to `stage.status: HOLD`** or an order with
  only a held PIECE matched a speed branch purely for a stale `stage.updatedAt` and read Overdue
  with nothing overdue. The pack gate went in `packAndSealComplete`; the dispatch gate went in
  **`dispatchTagGate`**, which the tag read, the print and the rider-assignment guard all share.
  **The intake finders mattered most** — the four stations assign holds TO Intake, so without
  widening Intake's release nobody could release an item hold at all.
- **Archived merge cards are hidden by Mongoose query middleware**, not by editing ~13 read sites:
  a filter added at 13 sites is the one the 14th forgets, and the symptom is the merged duplicate
  reappearing in a count.
- **Per-method revenue needed no reconciliation** — a split counter order already writes one Payment
  ROW PER TENDER, so grouping by `paymentMethod` splits it by construction.
- **TWO REAL GAPS the new hold-type CRUD coverage found:** the duplicate check was on the derived
  KEY, so after a rename the NAME was free again and two indistinguishable reasons could exist; and
  **renaming a SYSTEM type was silently ignored** — skipped write, success response.
- **TWO HARNESSES went red for the right reason and were out of date, not wrong:** tierPricing and
  phase12 both call the staff intake path, which now REQUIRES `paymentMethod`. phase12's was the
  instructive one — its landmark assertion was failing on the missing tender, i.e. testing nothing.

### ITEM #1 CRM SEQUENCE BUILT (2026-10-08) — briefCheck **200/200**, regNotBooked **33/33**
Client asked for it LIVE NOW, before window booking: their reps start registering people tomorrow.
NEW `CRM_WORKFLOW.REGISTERED_NOT_BOOKED`, 4 message types, admin-editable schedule, the three texts
seeded verbatim (revised copy, no "pickup window"), NEW pure `util/crmSendWindow.js`.
- **Global send windows 06:00–08:00 / 18:00–20:00** (four settings) for lead ·
  registered-not-booked · reactivation · broadcast. **POST-DELIVERY + ORDER-READY EXEMPT** —
  holding "your order is ready" until 6pm would be a real harm.
- **msg2/msg3 anchored to the OFFER's `expiresAt`, never a fixed delay**, so 3 → 7 days moves them.
  `handleUserRegistered` now AWAITS `OfferService.handleTrigger` for the linkage; still non-fatal.
- Their edge case built: offer ending before 08:00 → msg3 the evening before, msg2 the morning
  before that. Snapped at schedule time (honest `nextFollowUpAt`) AND guarded in the dispatcher.
- **TWO REAL BUGS FOUND DOING IT:**
  (1) **`setupApp()` was `async` but awaited NOTHING** — nine seeds/migrations fired in parallel and
  "App init successful" printed before any completed, so a migration could still be running when
  traffic arrived and a failure inside one was an invisible unhandled rejection. **Now sequential and
  awaited, each wrapped so one failure cannot stop the others or kill a live process.** This is what
  made the harness flap between runs.
  (2) The new settings needed an explicit **migration** onto the existing CrmSetting doc — defaults
  apply on CREATION only, so without it the sequence works on a fresh DB and **silently schedules
  nothing in production**. The harness strips the fields and re-runs setup to prove the backfill.
- ⚠️ **Their dependency:** msg3's "free only on orders from ₦8,000" needs a BASELINE free-logistics
  offer with an ₦8,000 minimum switched on. They said they will do it before the sequence starts.

### CLIENT REPLIES #5 AND #6 (2026-10-08) — 4 BUILT, 5 RULINGS QUEUED, 2 BLOCKERS CLEARED
Recorded in memory as `chuvi-client-rulings-oct2026`; full design on the board in feature.md.
**BUILT:** counter tender MANDATORY (`paymentMethod: 'string|required'`, no `|| CASH` fallback; cash
is a UI pre-select exported as `DEFAULT_COUNTER_METHOD` — a server fallback is exactly what
"mandatory" rules out). ⚠️ **BREAKING for any app build not sending it.** counterPayment **51/51**.
Reward credit stays customer opt-in (no change). **The customer is now told when an item goes on
hold** — that body was written for the customer all along and had only ever reached the operator.
**QUEUED, and #1 is the big one:**
1. **Holds become per-STATION in scope, reversing shipped behaviour.** Intake + payment holds park
   the whole order; S2/S3/S4/S5 holds park only the PIECE, siblings keep moving, and the order
   simply cannot be PACKED or DISPATCHED until every held piece is released. Holds Management must
   still list the order **with a count of held pieces**. The trap: removing the order-level
   `buildStageUpdate(HOLD, …)` makes item holds VANISH from Holds Management, because both
   `holdSla.js` filters are scoped `'stage.status': HOLD`. Design on the board; **`$elemMatch` is
   mandatory in the item branch because a RELEASED item keeps its `heldAt`.**
2. Per-METHOD money reporting (the tenders are already stored; the aggregations split on
   `billingType` alone).
3. **First Experience ALWAYS wins on a first order**, overriding the bill-value tie-break.
4. Merged CRM cards are **ARCHIVED, not deleted** — their reason is sound: numbers get recycled here.
5. The merged card's stage is **recomputed from the combined orders**, not "keep the furthest".
**BLOCKERS CLEARED:** window booking D1–D6 answered (they chose to build **Quick Booking ONCE with
real windows**, so N1 + windows are now one piece), and the three CRM texts arrived — saved to
`context/CRM-REGISTERED-NOT-BOOKED-TEXTS.md` so they cannot be lost again.
**NEW GLOBAL CRM RULE:** every follow-up/offer message sends only 06:00–08:00 or 18:00–20:00 (both
settings), waiting for the next window if due outside; order/payment messages are exempt. That
changes the dispatcher, not just the new sequence.
**STILL OWED:** audit item 8 is ambiguous ("add the it to the notifications") — do NOT guess, a wrong
read either spams customers or spams staff on every handoff; and D7/D8 need restating for them.

### CLIENT ANSWERS #4 BUILT + **ALL 19 HARNESSES RUN GREEN AGAINST testingdb** (2026-10-08)
briefCheck **178/178**. The user supplied the testingdb URI, so **every gate has now actually run**,
including `counterPaymentStaging` which had never been executed.
**TALLY:** counterPayment **49/49 (first ever run)** · stationFlow **92/92** (new scenario 15) ·
recoveryReport **52/52** · walletLimit 63 · handoff 54 · dispatch 46 · dispatchTag 46 ·
staffStatus 38 · planCreate 39 · offerAdmin 37 · dashboardDecisions 36 · holds 34 · tierPricing 33 ·
templateStaging 27 · freeLogistics 23 · subLogistics 20 · phase12 14 · bot 11/11.
Swagger 62 schemas / 296 paths / 0 wrong envelopes.

- **ANSWER 1(a) CONFIRMED TRUE, no change needed.** `itemCompleteAt` already requires
  `pretreatStatus` to be `complete` or `not_required`, so a piece still needing pretreatment was
  never in `readyIds`.
- **ANSWER 1(b) WAS FALSE — A REAL BUG, FIXED.** They asked us to confirm "pieces on hold do not
  move until the hold is released". They did not. **A hold writes ONLY `flaggedForReview` +
  `holdDetails` and never touches the station status**, and the handoff's only completion gate was
  `itemCompleteAt`, which reads those statuses. So a piece finished at its station and THEN held
  satisfied every gate and was pushed onward with its hold still open — **at every station, not
  just S2.** NEW `util/itemHold.js` (`isItemOnHold` = `heldAt && !releasedAt`, which matches both
  hold paths — station `sendToHold` and a handoff rejection — and all five release paths) + a gate
  in `HandoffService.push` BEFORE any write. Also excluded held pieces from the two auto-handover
  paths in sortAndPretreat. **Deliberately NOT part of the test: `flaggedForReview` — a flag is not
  a hold (brief 1.4 keeps them apart) and must not stop work.**
- **DISCOVERED WHILE TESTING IT, and it is a product question for the client: holding ONE piece
  flips the whole ORDER's `stage.status` to `hold`, and the station guard then refuses every further
  action on that order — so the four siblings stop too.** Stronger than they asked for, but it means
  one held piece parks its entire order. **Left alone on purpose** (order-level hold is what drives
  Holds Management) and asserted as the current behaviour in scenario 15 so a future change is
  visible. ASK THEM.
- **ANSWER 2 BUILT: "ordered again after recovery" capped at 60 days** (`ORDERED_AGAIN_WINDOW_DAYS`,
  named once, travels in the response as `orderedAgainWindowDays` so the card cannot misstate it).
  The order query's upper bound widened to `latestRelevant` — the ORDER may fall outside the report
  month; it is the RECOVERY that must be in it. Harness proves both sides of the boundary: the SAME
  order at 61 days is excluded and at 59 days is counted.
- **TWO REAL BUGS THE FIRST counterPayment RUN FOUND — both in `fetch-user-transactions`:**
  (1) **the swagger documented `data.message.data[]` for an endpoint that returns
  `data.transactions[]`** (a deliberate envelope exception, commented as such in the code) and also
  promised `userId`/`subscription`/`channel`/`paidAt`/`metadata`, none of which the pipeline
  returns. Rewritten to reality. This is the exact class CLAUDE.md warns about — the FE would have
  found it with a network capture. (2) **neither union branch projected the ORDER**, so a customer
  saw amounts with no way to tell what they paid for — only half of "the money has a record". Added
  `order` to both branches plus a `$lookup` for `oscNumber`, because a raw ObjectId is not a record
  a customer can read.
- **My own harness bugs, for the record:** the ledger invariant subtracted reward credit, assuming
  only cash is ledgered — wrong, `applyCreditsToAmount` writes its own debit line per credit spent
  (correctly; the ledger must show credit being used or the balance won't reconcile). And a station
  **may not assign a hold to itself** (S2's `assignTo` is admin/intake-and-tag only), so the release
  has to come from the station it was assigned to.

### ITEM #10 NOTIFICATIONS BUILT (2026-10-08) — briefCheck **165/165**
NEW `util/notifyPolicy.js`; `notifyRoles` gained `exceptUserId` so "affected station, never the
actor" has ONE implementation. 27 operator receipts suppressed through `notifyOperator` (kept as a
wrapper, not 27 deletions, so the sites still read as themselves and there is one switch);
3 exceptions named; 5 `notifyAffectedStation` all passing `actorId`; 7 new admin notifications.
- **`keep` must be the exception's NAME, not `true` — a mistyped name sends NOTHING** (fails
  closed). Otherwise a new call site copying a flag it didn't understand would silently re-enable.
- **"New complaint opened" ALREADY notified admin** (`recovery.service.js:150`) — briefCheck asserts
  we did NOT add a duplicate.
- **"Payment approved/rejected by INTAKE" cannot be built: the event does not exist yet.** Only
  ADMIN approves payments today; Intake approval is part of N1's payment hold. Told the client.
- **THE FINDING: those station notifications were WRITTEN FOR THE CUSTOMER AND SENT TO THE
  OPERATOR.** "An item on *your* order was placed on hold… we are working to resolve this" went to
  `req.user.id` — the staff member. So the customer was never told an item was held, and the
  operator read messages addressed to them as if they were the customer. Suppressing the operator
  copy is right; whether the CUSTOMER should now be told is a NEW question for the client.
- **ONE INTERPRETATION WE OWE THEM:** no notification is titled "handoff confirmed between
  stations" (`handoff.service.js:470` is an Activity row). The customer message on a handoff confirm
  is `STAGE_ENTRY_NOTICE`, so we silenced only the entry about an internal station move
  (`customerSilent: true`) and kept the garment-progress ones. GET CONFIRMED.
- **MY OWN BUG the harness caught:** the bulk-rewrite script wrote its regex-escaped title into the
  replacement → `title: 'Item\(s\) QC Passed'`. JS drops unknown escapes, so the VALUE was right
  and no test would ever have failed — it would just have looked wrong forever. briefCheck now
  rejects a backslash in any notification title.

### CLIENT REPLY #3 (2026-10-08) — 1(b) + notifications AGREED + A NEW FEATURE (window booking)
briefCheck now **140/140**.
- **1(b) BUILT, and it was a BUG, not a policy change — our answer to the client was WRONG.**
  The `FIRST_EXPERIENCE` trigger moved from `createLead` to `handleUserRegistered`. We had told
  them a staff-entered lead's 3-day clock starts when the rep types the number in. It doesn't:
  `handleTrigger` returns null without a `userId` (`offer.service.js:253`), and the call sat behind
  `if (created)` — so when that lead later registered, `findOrCreateProfile` matched the existing
  profile by phone, `created` was false, and the trigger **never fired again. Those people got no
  First Experience offer and never would have.** Correction issued; they should check which entered
  leads have since registered and grant it manually.
- **Offer length was ALREADY a setting** (`offer.customerWindowDays`) — their "make it a setting I
  control" needs no code. All four other asks (first-order-only, ₦4,000 minimum, ₦1,000 credit on
  delivery, 30-day credit life) verified expressible as offer config; the credit already pays out on
  REDEEM which fires from `offerOnOrderDelivered`, i.e. on delivery. **Still to do: create the offer.**
- **`new UserModel(` exists ONLY in `auth.service.js`** (local/Google/Apple), so "staff creating the
  account counts as registration" is true by construction — asserted by briefCheck. **But no staff
  endpoint creates a customer account at all**, so a counter order has no account behind it and
  therefore no offer. Flagged to the client.
- **Item #10 notifications UNBLOCKED** — client agreed: affected station only, never the actor.
- **NEW: window booking.** Logic doc written FIRST as they asked
  (`context/WINDOW-BOOKING-LOGIC-2026-10-08.md`), 8 decisions back to them, nothing built.
  **The three findings that matter: (1) the customer does NOT choose delivery timing today at all —
  delivery is a DATE pinned to 19:00 from `calculateDueDate`, so their 6:30pm evening window
  collides with every existing "by 7pm" promise; (2) today's `pickupTimeSlots` is decorative —
  free text, validator COMMENTED OUT, no cutoff, no limit; (3) the "customers moved because a
  window was full" number cannot be derived from saved orders — a deflected customer leaves no
  trace, so the deflection must be written at the moment it happens. Same shape as the N2 NPS
  asked-vs-answered clock.** Also: "a bag" does not exist in the data (orders are PIECES), and
  their ₦1,000 window price IS today's price (500+500), so nobody pays more unless they pick anytime.

### SESSION 2026-10-08 (later) — ITEMS #8, #6, #9 BUILT. briefCheck 135/135.
Swagger **62 schemas / 296 paths / 0 wrong envelopes**. NEW `counterPaymentStaging.js`
**not yet run — needs the testingdb URI.** Full design for all three is in feature.md's board.
- **#8 counter payment.** NEW `util/counterPayment.js`: plan-then-settle, delegating the actual
  money to the existing `WalletService.chargeWalletForOrder` rather than writing a second copy.
  **The plan runs before the order is created**, so a wallet that cannot cover the bill produces
  a sentence naming both amounts instead of an order sitting unpaid.
  **TWO BUGS FOUND WHILE DOING IT:** the counter order's `Payment` row was filed under the
  **STAFF** member with the default method **`paystack`** (the one method a counter order can never
  be), so a walk-in's own payment never showed in their history — the 2.3 complaint again, on a
  path nobody had looked at; and the customer was matched by **`fullName` alone**, which collides,
  now phone-first per 4.6.
- **#6 offers at checkout.** `checkoutPrompt` + `autoApply`. The tie-break scores **only what comes
  off THIS bill** — `creditPromised` is excluded on purpose, or a big future credit would win and
  spend today's better offer. Part (c) confirmed with no code: `validateAndPrice` →
  `_offerRejection` is the single rule and the bill already carries `rejected[]` with
  `reason`/`requirement`/`unlockMessage`.
- **#9 phone-split merge.** The interesting part is that a **referral code lives on the USER, not
  the card**, so "keep the referral code from the account card" means the older surviving card must
  ADOPT the account's `userId`. **AND `phoneFormatBackfill.js` was guaranteed to ABORT on live
  data** — `normalizedPhone` is `unique+sparse`, so rewriting a 10-digit number to canonical form
  throws E11000 against the same person's other card, which is precisely the split it reports. The
  un-caught `updateOne` would have died mid-run having already rewritten every row before it. Now
  caught per row and reported as "merge these two first".
- **NEW `context/FE-CHANGELOG-2026-10-08.md`** — everything FE-affecting since 7 Oct, all 8
  endpoint claims verified against the built spec. **The one hard FE break: `avgProcessingTime` is
  now `null` + `processingTimeNote` instead of a number**, so an unguarded render prints "null".
>
> **CURRENT STATE 2026-10-07 — see `context/feature.md`'s STATUS BOARD at the top for the full
> picture.** Working the 6 Oct client Developer Brief, backend only, order = fixes → features →
> answers. **§1 ALL 22 FIXES DONE** (4.5 needed no code — answered; 1.7/1.8 + parts of 1.4/1.5/2.1 are
> FE-only). **§3 Q1–Q8 ALL WRITTEN.** **MERGED: PR #240 (`2084e07`) put Groups 1–4 on `origin/main` —
> BUT `cc8ef2c` ("all done") is NOT on main and carries the 4.4 SLA-badge/holdMeta unification in
> `admin.service.js`, so 4.4 is not fully live until it is merged too.**
> **NEXT = §2. N1 Quick Booking is BLOCKED on 5 client questions sent 2026-10-07 (count mismatch ·
> who picks service+speed · payment-request direction · cancellation rules · the ₦4,000 line) — build
> on the stated defaults if no reply. N2 Recovery/Complaints/Feedback dashboard STARTED.** Every gate green 2026-10-07: briefCheck **101** · stationFlow 80 · tierPricing 33 ·
> offerAdmin 37 · freeLogistics 23 · walletLimit 39 · dispatchTag 46 · planCreate 39 · dispatch 46 ·
> template 27 · phase12 14 · subLogistics 20 · handoff 54 · botStaging 11/11. Swagger 56/287, 0 wrong
> envelopes. Never edit `.env` — pass `MONGODB_URL` inline (testingdb URI supplied by the user).

### FE WAS RIGHT TWICE (2026-10-08) — 2.3 WAS NEVER FINISHED, AND LIMITS READ ₦0 LIVE
- **`fetch-user-transactions` read ONLY the Payment collection.** A manual adjustment writes a
  WalletTransaction and NO Payment, so the customer never saw it — **the client's original 2.3
  complaint ("the money has no record") was still true** after we fixed the write side and built
  the admin ledger. Now a `$unionWith` over both collections: Payment rows plus the
  WalletTransaction kinds that have no Payment twin (manual-adjustment / reversal / expiry /
  anything with a `creditType`). Deliberately a UNION, not a swap — top-ups and card refunds live
  in both, and swapping would have lost proof-of-payment and card refs. Direction comes from the
  SIGN, never the type, and amounts are shown positive with `alertType` beside them. Each row
  carries `source: 'payment' | 'wallet'`.
- **`walletAdjustmentLimits` reads ₦0 for every role in PRODUCTION** even though the model default
  says 5000/10000 — because `setup.js init()` returns early when an AdminSetting exists, and
  **Mongoose applies defaults on CREATION, not on read.** The live doc predates 2.4 and has no such
  key. NEW idempotent `ensureWalletAdjustmentLimits()` writes the defaults ONLY when the field is
  absent, so an admin's own limits are never overwritten. **Same trap as the inverted tier charges:
  seeding is not migrating — check this whenever a field is added to an existing settings doc.**
- The FE's other two points were a STALE DEPLOY, not gaps: `GET /api/admin/wallet-transactions`
  exists (built 2026-10-07) and phone normalisation shipped with 4.6.
- `walletLimitStaging.js` now **63/63** (new scenario 10b proves the customer sees adjustments).

### CLIENT REPLY #2 (2026-10-08) — ITEMS 3, 4 AND 5 BUILT. 1, 2, 6–10 STILL OPEN.
Ten items, recorded in full at the top of feature.md. Built so far:
- **#5 PROCESSING CLOCK — the client REVERSED the A4 rule we shipped the same day.** Not at
  tagging: it starts when the order is **cleared for production = clothes at Intake AND money
  complete, whichever is LAST.** NEW `util/productionClock.js` with a recompute called from BOTH
  sides (payment webhook, rider pickup, intake receive, counter order) because neither side knows
  if it is the second one. Stamped once, guarded against a double trigger. An admin payment WAIVER
  counts as money-complete. The handoff stamp I added hours earlier is REMOVED. Card now returns
  `avgProcessingTime: null` + `processingTimeNote: 'Not enough data yet'` instead of a 0.
- **#3 HOLD LIMITS — they picked the option our `slaHours: null` default already implemented.**
  Added on top: the three speed numbers are now admin-editable (`AdminSetting.holdSlaHoursBySpeed`,
  falls back to the code table per-speed so a partial setting can't leave a gap); NEW Intake reason
  `count_differs_from_rider` with `requiresAdminApproval`; `checkStationMayRaise()` enforces "a
  station may only raise its own reasons" (admin exempt, system-only types refused).
- **#4 REFERRAL:** the open-complaint pause is REMOVED (deferred rewards already granted are still
  released by `processDeferredRewards`, so none are stranded). NEW
  `reverseRewardForRefundedOrder` + `WalletCreditService.clawBackCredit` — **full refund only**,
  **never takes the wallet below zero** (claws back only what is unspent), records
  `rewardShortfall` and notifies an admin about the part it could not recover. Hooked into
  `_performCancellation` via `referralOnOrderRefunded`.
Gates: briefCheck 106 · dashboardDecisions **36** · holds 34 · stationFlow 80 · handoff 54 ·
phase12 14 · bot 11/11.

### SECTION A (A1–A5, A7) BUILT (2026-10-08) — `dashboardDecisionsStaging.js` 32/32
The client's decisions that need no further input. **A2, A3 and A4 all make a number on their
dashboard go DOWN — warn them before they see it.** A2 divides by all 7 days (₦45,000 → ₦12,857 on
the same money); A3 is total÷total (₦1,750 → ₦1,636) with the old `avgCostPerItem7Days` key kept as
a mirror for one release; A4 measures `productionStartedAt` → `qcDetails.packCompletedAt` over
orders READY TODAY and reads **0 on day one** because orders tagged before the deploy have no start
stamp and are excluded rather than guessed. A5 added `util/queueSort.js` across 16 lists, closing
the §3 Q6 newest-vs-oldest split. A1 renamed the card from the backend. A7 added
`deliverySameAsPickup`. Full design in feature.md.
- **BUG the harness caught: A7 applied the tick box AFTER validation**, so ticking it and sending
  nothing else was refused "isDelivery is required". Defaulted before the validator now.
- Also found: the booking swagger still described `landmark` as optional when the code has rejected
  without it since 2026-10-07. Corrected.

### SECTION B — HOLD TYPES BUILT (2026-10-08), started while the client confirms
N1's payment hold depends on it, so it went first. NEW `HoldType` model + seed + admin CRUD
(`/api/admin/hold-types`) + `crons/holdSlaScan.js` escalating overdue holds to admins once each.
**`slaHours: null` = "follow the order's delivery speed", which every operational type seeds with —
so nothing changes on the floor until an admin sets a number, and we are built for either answer to
the open question.** Payment hold = 48h + `judgeByOwnLimitOnly`. `util/holdSla.js` kept backward-
compatible signatures and the 4.4 Active/Overdue partition still holds. **`holdsStaging.js` 34/34.**
- **BUG: `holdDetails` is on the ITEM, not the order.** The first cut `$set` a non-existent
  order-level path and Mongoose silently dropped it — the 3.2 `pickup.note` shape exactly. The
  order-level block is now **`orderHold`**. Also learned: an item hold does NOT set
  `stage.status: hold`, so Holds Management is order-level only.
- **HARNESS BUG = the Lagos/UTC split-brain, inside a test:** `walletLimitStaging` took "today" from
  `toISOString().slice(0,10)` (UTC). Passed all day, failed at 00:43 Lagos. Endpoint was right.

### STAFF SUSPENSION BUILT (2026-10-07) — FE: "no endpoint to suspend a rider"
True, and the shape was the interesting part: **every reader of `User.status` already existed and
nothing could write it**, so suspension was unreachable dead code. NEW `GET /api/admin/staff` +
`PATCH /api/admin/staff/:id/status`, new `statusReason`/`statusChangedAt`/`statusChangedBy`, and a
**login refusal in `_handleLogin`** (without it a suspended rider still signs in and works their
existing jobs — suspension would be decoration). Guards: not yourself, not the last active admin,
not a customer; reason required; idempotent. `staffStatusStaging.js` **38/38** proves it bites at
sign-in, at assignment and in the riders list. See feature.md for the full design.
- **`logSafely(label, work)` took a PROMISE and I passed a thunk** → `await someFunction` resolves
  to the function, so the audit row and the notification were never written, nothing threw, and the
  endpoint reported clean success. **The silent-no-op shape, found only by counting the rows.**
  `util/safeLog.js` now accepts either form. All safeLog-dependent gates re-run green.

### §2 N2 DASHBOARD BUILT + N1 QUESTIONS SENT (2026-10-07)
- **N1 Quick Booking is BLOCKED on 5 client questions** drafted as one copy/paste block: count mismatch
  (customer vs rider vs S1) · who picks service + delivery speed (the brief captures NEITHER, so nothing
  can be priced or promised at booking) · the payment-request direction (**today's "top up request" runs
  the OTHER way** — the customer uploads bank-transfer proof; nothing pushes a bill from the office) ·
  cancellation (who, until when, does "in full" include the pickup fee) · whether the ₦4,000 line is the
  existing offers or a new overriding rule. Defaults stated for all five; build on them if no reply.
- **N2 BUILT.** See feature.md's "§2 N2" section for the design. Headlines: the NPS 0–10 question did
  not exist and is new on `Feedback` (`npsScore` has **no default — 0 is a real answer**); the throttle
  tracks **asked** (on `CrmProfile.lastNpsAskedAt`, because an ignored prompt leaves no Feedback row)
  separately from **answered**; a throttled score is dropped, never fatal; "delivered in the month"
  comes off `stageHistory`, not `updatedAt`, so it does not repeat the §3 Q1 flaw.
- **ALL GATES GREEN AGAINST `testingdb` 2026-10-07:** `recoveryReportStaging` **49/49** (the client's
  own worked example lands on **4.3 · NPS 40 · 50%**) · `walletLimitStaging` **55/55** (now includes
  the admin ledger) · briefCheck 104 · holds 22 · bot 11/11 · dispatch 46 · template 27 ·
  stationFlow 80. Swagger **59 schemas / 290 paths / 0 wrong envelopes**.
- **TWO BUGS THE RUNS CAUGHT, both "green for the wrong reason" shapes:**
  (1) **`createdAt` is IMMUTABLE under Mongoose timestamps** — `updateOne({$set:{createdAt}})` is
  silently dropped, so the first harness run backdated nothing and 14 assertions failed against an
  honestly-empty month. Backdate via `Model.collection.updateOne` (raw driver).
  (2) **the role field on `User` is `userType`, not `role`** — the admin ledger populated
  `select: 'fullName role'` and got the name with the role `undefined`, so every operator would have
  shown a blank role; asserting on `fullName` alone had passed.

### §3 Q1–Q8 ALL ANSWERED + FE CHANGELOG WRITTEN (2026-10-07)
- **`context/CLIENT-ANSWERS-oct2026.md`** — all eight questions in the client's requested form, ending
  with **7 decisions we need back** (dormancy window + card name; avg-revenue divisor; per-item average
  of rates vs total÷total; the processing-time day filter we flagged as a flaw; queue sort direction;
  whether hold limits move to settings; landmark now required).
- **Q6 found a real inconsistency:** the stations disagree on sort direction — **Sort & Pretreat shows
  NEWEST first (`updatedAt: -1`) while Wash, Press and the dispatch queues show OLDEST first.** Same
  three orders, opposite order, one screen apart. Recommended oldest-first everywhere (or by delivery
  deadline) but did NOT change it — it changes what staff see first, so it is the client's call.
- **`context/FE-CHANGELOG-2026-10-07.md`** — every FE-affecting change in one block. **3 BREAKING:**
  landmark required on customer booking; item-brief `name` is now the readable form with the slug moved
  to new `rawType`; rider assignment rejects a non-rider id (pick from `GET /intake-user/riders`).
  All 15 endpoint claims were verified against the built spec before publishing, and the one vague
  path (`/rider/...assigned-pickups`) was replaced with the real one.

### 4.4 DB-VERIFIED + 4.5 ANSWERED + §3 Q1/Q2/Q3 WRITTEN (2026-10-07)
NEW `holdsStaging.js` **22/22** — the client's literal test (3 breached holds, nothing else → Active 0,
Overdue 3) against the REAL endpoints, plus card-length == list-length both ways.
- **IT FOUND TWO MORE COPIES OF THE SLA TABLE.** `util/holdSla.js` was built for 4.4 as the one
  definition, but the per-row **"SLA Breached" badge** (`getHoldOrders`) and the **order-detail**
  `holdMeta` each kept hardcoded `120/240/360` minutes AND ignored the past-delivery-date branch — so
  one order could be counted Overdue while its row and its detail page said "not breached". That is part
  of the client's screenshot. All three unified on `isHoldBreached`; briefCheck now fails if any
  hardcoded minute threshold reappears in `admin.service.js` (that assertion is what caught the third).
- **Harness design note:** `getDashboardStats`/`getHoldOrders` are declared `(req, res)` but RETURN an
  envelope and never touch `res`. A res-capturing wrapper produced `undefined` for every figure and two
  assertions then "passed" against empty arrays — green for the wrong reason, again.
- **4.5 needed NO code change** and is answered: 4÷4 = 100% is valid and true (every delivered customer
  quiet >30 days). One decision for the client: keep "share of customers" + rename the card, or switch
  to a pipeline measure over all profiles; and whether 30 days is the right window.
- **NEW `context/CLIENT-ANSWERS-oct2026.md`** — Q1/Q2/Q3 in the client's requested form. Two facts
  explain all three of their "unexplained" CRM numbers: `totalOrders` counts DELIVERED orders while the
  STAGE moves at BOOKING; and the 30-day dormancy scan OVERRIDES the count-based stage. Q1 raises three
  judgement calls, incl. **avg processing time filtering on "record modified today", so editing an old
  delivered order drags it into today's average — flagged as a flaw, not a design choice.**

### GROUP 4 DONE (4.1/4.2/4.3/4.6) — NEW `templateStaging.js` 27/27
- **4.1 REPRODUCED: the 400 was `post.channels.filter is not a function`.** A channel picker sending a
  single value as a STRING (`channels: "sms"`) hit `.filter` on a string → TypeError → the catch-all
  said "Failed to update template". **Nothing in the template was being rejected — the shape of one
  field was.** Running the client's own test also found: a whitespace-only `body` SAVED (Mongoose
  `required` passes on `"   "`, so a template could be blanked and then render empty to customers), and
  the audit write could report a saved template as failed.
- **4.2** NEW `GET /api/communication/templates/meta` + `util/commMeta.js` = the written list they asked
  for, derived from what the code actually sends: 5 pages, 13 keys, each with one line. Only
  `{{name}}`/`{{firstName}}` are universal; every other key belongs to ONE template key (`onlyFor`),
  and a key no system supplies is flagged `unresolved`.
- **4.3** The notice already names customer+amount+operator. Scanned all **87** notification call sites:
  **only 6 reach an admin.** FOUND WHILE DOING IT: `admin.service.js` had its OWN wallet add/deduct code
  with the pre-2.3 bugs (non-atomic `balance += amount`, weak ledger line, no rollback); both now
  delegate to `WalletAdjustmentService.applyAdjustment`.
- **4.6 the phone normaliser ITSELF was the profile-splitter** — it only stripped a `234` prefix, so
  `8031234567` came back unchanged and never matched `08031234567`. CRM links identity by normalised
  phone, so that alone makes one person two profiles. Canonical `0`+10 digits now; 7 real-world forms
  collapse to one; idempotent; applied on write at signup/booking/intake; NEW `phoneFormatBackfill.js`
  (`--dry`) which also REPORTS already-split CRM profiles without merging them (that is a business call).
  NEW `util/displayName.js` (`prettifyName`/`stationLabel`) applied in `util/itemSummary.js`, the shared
  brief builder behind every station card. **FE shape note: briefs now carry the readable form in `name`
  and the stored slug in a new `rawType`.**
- **NEW `util/safeLog.js`** — the "a record of the work must never reverse the work" wrapper, now shared
  by subscription (2.5), intake-user (3.1), communication (4.1) and admin (4.3). Three bug reports in
  this one brief were that single shape.

### ⚠️ LOCAL `main` IS 127 COMMITS BEHIND `origin/main` — THIS CAUSED A WRONG DIAGNOSIS
I concluded 3.1 could not be the dispatch-tag gate because `git show main:…` had no `needsDispatchTag`.
**The user corrected me and was right:** `git show origin/main:…` HAS it — `mesage-and-alert-fix` was
merged to `origin/main` on 7 Oct (PR #239, `f11a05b`, ~5h before). So the dispatch tag, the 1.3
wash-station fixes and the Lagos TZ pin ARE deployed. **`git fetch` and read `origin/main` before ever
reasoning about what the client is running.** (The 3.1 fix stands regardless — see feature.md.)

### GROUP 3 DONE — NEW `dispatchStaging.js` 37/37
- **3.1: nothing validated the rider id.** A valid ObjectId that is not a rider SAVED and then
  populated back as `null`, so the row read "needs a rider" again — the client's exact words. Upstream
  cause: **no endpoint anywhere listed riders** (`ROLE.RIDER` appeared in no service at all), so the
  picker had no source for its ids. NEW `GET /intake-user/riders` + `resolveRider()` + the assigned
  rider returned in the response. The three post-write side effects (activity/notification/audit) went
  through `logSafely` — the same false-failure class as 2.5, on both legs.
- **3.2: `dispatchDetails.pickup.note` WAS NOT A SCHEMA PATH** — Mongoose silently dropped it, so every
  failed pickup ever recorded lost the rider's reason. Only RUNNING the harness found it. And the
  delivery leg wrote its reason into `delivery.note`, **the line the dispatch tag PRINTS as the
  customer's special instruction**. NEW `failureNote` on both legs. Plus: `legStatus` filter (unknown
  values refused with the valid list), `failedCount`, `failed`/`legNote` on the row — and **both failure
  handlers notified only the RIDER who pressed the button**, never the office. `NOTIFICATION_TYPE`
  had `PICKUP_FAILED` but no `DELIVERY_FAILED`, so failed deliveries were filed as `system`.
- **NEW `util/notifyRoles.js`** — the third copy of "notify everyone with role X" was about to be
  written; one implementation now, `notifyAdmins` delegates, suspended staff skipped, never throws.
- **3.3: the rider's assigned-pickups/deliveries lists were the only dispatch lists that never called
  `normalizeOrderAddresses`** — a legacy string address reached them with no `landmark` key at all,
  while Active Pickups (same order, one tap later) showed it.
- **User asked whether the customer fills in the landmark when booking: NO.** Only `address` is
  required on the customer path. Rather than hard-require it (that breaks every live app build that
  doesn't send it), NEW `enrichFromSavedAddresses()` borrows the landmark from the customer's SAVED
  address when it matches (landmark IS required on `user.addresses`), and rows with none carry
  `landmarkMissing: true`. Making it mandatory is a one-line change and the client's call.
- Harness bugs the run found: order ITEMS require `type`, not `name` (a top-level required-path scan
  does not see subdoc paths), and `ORDER_CHANNEL` is whatsapp|website|office — there is no "walk-in".

### 2.5 DONE — NEW `planCreateStaging.js` (DB run pending a URI). briefCheck 47/47
**A REAL BUG, and the opposite of the report: the plan WAS created every time.** `createPlan` saves the
plan, then calls `createAuditLog`, which **rethrows**; the row carried `category: 'subscription'` and
**`'subscription'` was never in `AUDIT_LOG_CATEGORIES`** → enum ValidationError → the catch returned the
generic "Something went wrong", and the retry hit "Plan title already exists". A repo-wide scan found
**exactly four such sites, all in `subscription.service.js`** (create/update/delete plan +
cancelSubscription) — so update and delete had the same false failure, and a cancellation reported
failure after Paystack had already been told.
- Added `AUDIT_LOG_CATEGORIES.SUBSCRIPTION`; briefCheck asserts **no hardcoded category string remains
  in the file**, so a new call site can't reintroduce it with a different word.
- **The structural fix: an audit log must never reverse the outcome the operator is shown.** New
  `auditSafely()` swallows log failures at all four sites. **`createAuditLog` itself left alone** — 127
  other call sites share it and widening that is a separate call.
- Real failures now name themselves (`describeDbError`: 11000 → "Plan title already exists",
  ValidationError → the field, CastError → the field + type); the plan write has its own try/catch so
  the unique-title index rejecting reads as a conflict.
- **The validation rules contradicted the model BOTH ways:** `paystackPlanCode` is `required` on the
  model but wasn't validated (⇒ the generic error), and `itemPerMonth` was `integer|required` while the
  model field is COMMENTED OUT — the screen was refused over a field the backend discards. Fixed both,
  plus the swagger `Plan` schema and the required list.
- `updatePlan` gained `runValidators: true` and now returns the saved plan (same gap as 2.1's missing
  `GET /offers/:id`). `cancelSubscription`'s `error.response.data.message` threw on a network failure
  and surfaced as "Failed to cancel plan" — fixed.
- **FOUND, NOT FIXED: a 4th swagger envelope variant — 15 blocks with `success` + `error` as SIBLINGS**
  (the three earlier sweeps only hunted `success`+`message`). Failure side this time, docs-only. Sites:
  `/admin/search-wallet`, `/auth/login|logout|refresh-token`, `/bookOrder/create-book-order`,
  `/api/user/get-dashboard`, `/users/update-user|initialize-payment|change-password`,
  `/utils/image-upload-single`, `/wallet/wallet-top-up|pay-with-wallet` (+3 more). Canonical gate still
  reads 0 because it only checks `success`+`message`.

Update this as work progresses. Newest entries at the top of "Done this
session". When a session ends/clears, fold anything durable into summary.md.

## Session: 2026-10-07 — Developer Brief (6 Oct) TRIAGED + LOCKED. NO CODE YET.

New client PDF: "CHUVI Digital Stack Developer Brief, Oct 6 2026 · @Cyphas" — 22 fixes, 2 new
features, 8 questions, from their own testing 4–6 Oct. **Full plan now lives in `context/feature.md`
as the CURRENT feature** (dispatch tag demoted to PREVIOUS). Read that first.

- **SCOPE: BACKEND ONLY** (user: the FE team has its own repo, user is not on it). Every item is
  tagged A (pure backend) / B (FE waiting on me) / C (pure FE, not mine) / D (blocked on an answer).
- **ORDER AGREED: fixes → new features → answers.** Answers written LAST, from shipped code.
  Deliverable = ONE copy/paste block (§1 status · §2 status · §3 answers in their
  rule/formula/worked-example form).
- **Their Thursday 8 Oct deadline is not achievable for all 22+2 — must tell them early** (the brief
  explicitly asks for that). Propose Group 1 + 2.3 + 4.4 by Thursday, rest the week after.

### BUILD STARTED same session — 3 items landed, offline-verified 29/29 (`node briefCheck.js`)
NEW `briefCheck.js` at the repo ROOT (deliberately committed, not left in the scratchpad — it is the
regression gate for the whole package and must survive a context clear). Swagger 55/281, 0 wrong
envelopes. All touched services load.
- **1.1 (S3 dashboard half) DONE.** `washAndDry.getDashboard`'s "Recent Wash Queue" paginated on
  `{'items.currentStation': HERE}` while the `washQueue` COUNT beside it ALSO required
  `'washDetails.startedAt': {$exists:false}` — the client's screenshot exactly (tab 0, list showing
  two orders already Washing). Same filter + same derived fields on both now.
- **4.4 DONE.** NEW `util/holdSla.js`: one `breachBranches` definition, `overdueHoldsFilter` ($or) and
  `activeHoldsFilter` ($nor over the SAME branches) as exact complements + `isHoldBreached`. Both
  `admin.service.js` call sites (dashboard counts, Holds Management list) use it. Harness asserts the
  complement STRUCTURALLY so they can't drift again.
- **2.3 DONE.** `adjustWallet` now: atomic `$inc` guarded on funds (no overdraw race) → a
  `WalletTransaction` (`manual-adjustment`, SIGNED amount, reason, performedBy, balanceAfter,
  relatedOrderId) → **rollback of the balance if the ledger write fails** (the ledger IS the record).
  Fixed in passing: two un-awaited `save()`s; the audit log credited the CUSTOMER not the operator;
  `order.userId.fullName` read off an un-populated ref. Swagger updated to the new object response.
- **BIG ONE: 1.1.1 and 1.2 are the SAME incident and the drafts count was CORRECT.** The dashboard
  drafts count and `getDrafts` use byte-identical queries, so 15 staying 15 means the orders never
  left `stage.status: QUEUE`. A push S1→S2 only creates a PENDING handoff (items stay at S1 until S2
  confirms) and S2's Accept-all was failing (1.2) — so nothing moved and the number was honest.
  **Do NOT "fix" the drafts count.** Fix the confirm.
### 2.4 DONE — NEW `walletLimitStaging.js` 39/39 (the client's own test)
Per-role wallet limits + admin approval.
- **KEY DESIGN:** NEW `services/walletAdjustment.service.js` owns ALL manual balance movement, so an
  operator adjusting within their limit and an admin APPROVING an over-limit request run the SAME
  `applyAdjustment` — identical ledger lines. A separate copy for approval would have quietly undone
  2.3. The 2.3 money code moved there; `intake-user.adjustWallet` delegates.
- Limits in **`AdminSetting.walletAdjustmentLimits` (a Map role→naira)**, defaults intake-and-tag
  5000 / CX 10000. A Map not named fields, so a new role needs a settings edit not a deploy.
  `updateAdminSettings` already `$set`s anything, so no service change. **No entry = 0** (everything
  becomes a request); **admin unlimited**.
- Over-limit returns **SUCCESS** with `requiresApproval: true` — calling it a failure would invite a
  retry and stack duplicate requests.
- `roleLimitAtRequest` stored so changing the setting never rewrites why approval was needed.
- Approve **claims the request BEFORE** moving money (no double-pay) and **returns it to pending if
  applying fails**. Reject REQUIRES a note. New admin endpoints + `WalletAdjustmentRequest` schema.
- Brief **4.3 partly covered**: admins notified of every adjustment AND every request.
- **briefCheck.js updated** to assert the money guarantees at their new home (34/34). All 5 DB gates
  re-run green. **NEXT: 2.5 (false "cannot create plan"), then Group 3.**

### 2.2 DONE — a REAL bug. NEW `freeLogisticsStaging.js` 23/23
**USER CORRECTION THAT CRACKED IT: the client's "General" offer is `OFFER_TYPE.BASELINE`** (there is
no "general" in the code). I had been testing with `promotional`, which carries an id and so was
never affected — the bug only bites the type the client actually uses.
- **ROOT CAUSE:** `_priceWithOffers` returned EARLY unless `post.customerOfferId || post.promoOfferId`.
  A BASELINE offer applies BY RULE with **no linkage and no id to send**, so every one of them was
  skipped. `offer.service.validateAndPrice` handled baselines correctly all along (`:729-743`);
  booking never called it. The app advertised free pickup/delivery and charged ₦2,000 anyway.
  Fix = always call `validateAndPrice` (it already tolerates no selection).
- **Second half (the display ask):** `_buildPricing`'s `appliedOffers` was built from personal +
  promotion ONLY, so a summary could say "Pickup: Free" with no offer name. Baselines now pushed
  first with `type: 'baseline'`. (`pricing.appliedOffers.type` IS genuinely named `type` — it uses
  the explicit `{ type: String }` form to dodge the Mongoose keyword, unlike `benefits.benefitType`.)
- Verified the client's three cases + draft/archived/single-leg guards. All gates re-run green.
- **Harness bug: the fees are on `AdminSetting`, NOT `AdminOrderDetails`** (`adminOrderSetting` at
  `bookOrder.service.js:865` is AdminSettingModel). Reading the wrong model compared every total to
  ₦0 and produced 9 meaningless failures.

### 2.1 DONE — NEW `offerAdminStaging.js` 37/37 (runs the CLIENT'S OWN test)
**"Offers do not save" was three separate things and the SAVE WAS NEVER BROKEN.** Create+update at
`offerApi.service.js` persist correctly — proved by replaying their exact test (create the three
named offers, leave, re-list, edit each, delete one).
1. A new offer defaults to **`status: 'draft'`** → a list filtered to `status=active` can't show it.
   That is the "gone after refresh" report, and it is **FE/workflow, not a lost save**. Say so.
2. **No `GET /offers/:id` existed** (list/create/update only) → an edit screen had nothing to reload
   one offer from; likeliest source of "still holds the old details". ADDED, returns
   `linkages {live,total,deletable}`.
3. **No delete existed at all.** ADDED, conditional: never-given → really deleted; only finished
   linkages → ARCHIVED (history kept); customers currently hold it → refused with
   `requiresForce:true`+count, `?force=true` cancels them and archives. `ARCHIVED` was already in
   `OFFER_STATUS`.
- **`CustomerOffer.cancelledAt` added at the user's request** — correct call: every other terminal
  state stamps its own time, so a cancellation could only be inferred from `updatedAt`, which a later
  write would clobber. Both cancel paths stamp it.
- **Date-library question answered with evidence:** `moment` appears in only 2 files
  (`util/lagosDay.js`, `crm.service.js`), both for calendar BUCKETING; **0 places stamp a field with
  moment**, 64 use `new Date()`. Keep `new Date()` for instants, moment for Lagos boundaries —
  especially since server.js pins TZ so `new Date()` is already Lagos-correct.
- **Harness bugs (never assume a shape):** `OFFER_TYPE` is personal|promotional|baseline (no
  "general"), and the benefit field is **`benefitType`** not `type` (Mongoose reserved keyword in a
  subdoc — same trap already commented in `pricing.appliedOffers`). A `|| 'general'` fallback quietly
  produced an invalid value; the harness now hard-fails if setup doesn't complete.

### 1.6 DONE — GROUP 1 COMPLETE. NEW `tierPricingStaging.js` 33/33; all four gates green
Per-item care tier, the item that moves MONEY, so it got its own harness.
- **NEW `util/itemPricing.js`.** The maths existed as THREE near-identical copies that had **already
  drifted** — two defaulted a missing tier charge to `|| 1`, the third to `|| 1.5`/`|| 2`, so the same
  basket priced differently depending on which screen created the order. One helper now; fallback is
  **1 (no uplift)** everywhere, because an unconfigured setting must never silently charge more.
- `items[].serviceTier` (enum + null). **Absent = follow the order's tier** → existing orders and
  callers are byte-identical. Formula and rounding position unchanged.
- `pricing` gained `tierLines[]`/`tiersUsed[]`/`isMixedTier`; `tierMultiplier` is **null when mixed**.
  Swagger updated on the schema AND the booking request body. `itemSummary` briefs carry the tier so
  it reaches handoff cards / dispatch tag / station payloads.
- **BUG 1 — three `ReferenceError`s that BOTH `node --check` AND `require()` passed.** The call sites
  still passed `tierMultiplier: multiplier` after I deleted that variable. Only executing each branch
  caught it. Exactly the `isWashed`-hoist lesson from 2026-10-05: **loading a service proves nothing
  about its method bodies** — if you touch a branch, run that branch.
- **BUG 2 — `config/setup.js` seeded the tier charges INVERTED:** `premium: 2, vip: 1.5` vs the
  model's own defaults premium 1.5 / vip 2, so a freshly seeded DB charged MORE for Premium than for
  VIP. Confirmed live (testingdb prices VIP ×1.5). Seed fixed. **setup.js only seeds when the doc is
  MISSING → existing DBs keep the inverted values. CHECK THE LIVE `AdminSetting` before claiming this
  is fixed in production.**
- Gates after the change: tierPricing 33 · stationFlow 80 · briefCheck 29 · dispatchTag 46.
  Swagger 55/282, 0 bad envelopes. **NEXT: Group 2 (2.1 offer DELETE, 2.2, 2.4, 2.5).**

### 1.5 DONE same session — `stationFlowStaging.js` now 80/80
NEW **`PATCH /api/sort-pretreat/order/:id/items/sort`** (`bulkSortItems`). Before this the surface was
per-ITEM or whole-order ONLY, and the whole-order one could not set colour/pretreatment at all —
literally the client's 1.5.1 and 1.5.2. Takes `itemIds[]`/`all`, colour, fabric, pretreatment,
damage flags, note, `markSorted`, `sendToWash`.
- **The "no pretreatment" machinery already existed and nothing could set it:** the enum value
  `no_pretreatment_needed` and `pretreatStatus: 'not_required'` were both in the model, and
  `itemCompleteAt` already accepts `not_required` — so choosing it finishes the piece at S2 with no
  step to mark done. One line of wiring, not a feature.
- Required-ness is enforced **at mark-sorted time**, not at save time, so the operator can work in
  stages; messages say how many pieces are missing what.
- **STATED ASSUMPTION to raise with the client:** the brief wants the 7 to "show in the S3 Wash Queue
  at once" AND S3 to confirm per batch — only both true if marking sorted also HANDS OVER. So
  completed pieces auto-push to S3 as a normal handoff; `sendToWash:false` opts out.
- **`markItemAsPretreated` had a real split-flow bug, fixed in passing:** `allItemsSorted`/
  `allItemsPretreated`/`readyToSend` were computed over EVERY item, so with 7 pieces already at wash
  `readyToSend` could never turn true for the 3 left. Now station-scoped. It also hands the piece
  over now ("those 3 then join the rest at S3").
- Verified against the brief's OWN worked example (scenario 14), end to end, including the
  "3 of 10 left" counter and both batches meeting at S3.
- **Test-design lesson repeated:** two guard-rail assertions "failed" only because they ran after the
  order had fully moved to S3, so the order-level guard fired first. The behaviour was right and the
  test was wrong — same class of mistake as the earlier missing-`note` assertion. Guard-rail cases now
  run against a fresh order still at the station.

### 1.1 / 1.2 / 1.4 ROOT-CAUSED, REPRODUCED AND FIXED same session — DB-verified 50/50
User supplied the testingdb URI. NEW **`stationFlowStaging.js`** (repo root): walks one order
S1→S2→S3 through the REAL services asserting, after each move, that the station it LEFT drops it, the
station it ENTERED lists it, and **every count equals its list**. `STAGING_OK=1 MONGODB_URL="…" node
stationFlowStaging.js` → **50/50**. Safety-gated, hard-refuses `laundrydb`, cleans up (0 leftovers).
- **The happy path was NEVER broken** (scenarios 1–8 green on clean data). 1.1 was not "queues are
  wrong in general" — which is why reading the queue code kept coming up empty.
- **REAL CAUSE, reproduced verbatim (scenario 12):** `isWholeOrderGate` is
  `fromIdx === 0 || toIdx === last` and the only ordering rule is `toIdx > fromIdx`, so a push may
  legitimately SKIP a station (a wash-only order really does go S3→S5 — must stay). Nothing
  invalidated an EARLIER pending handoff when the same items left by the new route. push S1→S2 (H1)
  → push S1→S3 (H2) → S3 confirms H2 → pieces at S3, order reads "washing", **H1 still pending** →
  still drawn in S2's Incoming → Accept all hits `isWholeAt(INTAKE)` false → the client's exact
  string *"…must move the whole order — all items must still be at intake-and-tag-station"*. That is
  also how OSC-20261004-631233 was at S3 Washing AND in S2's Incoming list.
- **FIX:** `HandoffSchema.status` gains `superseded` (+`supersededAt`/`supersededBy`); a new push
  supersedes intersecting earlier pending handoffs from the same station (+Activity row); `confirm`
  checks staleness BEFORE the gates and returns a plain sentence; the `status !== 'pending'` guard
  now distinguishes confirmed/rejected/superseded; **`pendingQueue` is self-healing** and persists the
  cleanup — **so the client's two already-stranded orders fix themselves on the next read, no
  migration** (scenario 13 writes the damage straight to Mongo and proves it).
- **1.4 backend half DONE:** flag + hold were verified to WORK (scenarios 9–10); they were being
  refused and the refusal was unreadable. S2's NINE identical `'Order not found or not in sort &
  pretreat stage'` guards now call NEW `explainNotAtSort(orderId)` — one extra read, a sentence that
  names the order and where it actually is. Swagger `Handoff` schema updated (55/281, 0 bad
  envelopes). The "display the error" half remains FE (Bucket C).
- **Harness bugs the run found (worth remembering):** `sendToHold` takes `itemId` as a ROUTE PARAM and
  requires `assignTo`; `flagItemForReview` requires a `note` — a first draft "passed" a station-guard
  assertion that was actually failing on a missing note, i.e. the test was green for the wrong reason.

### Verified against the code BEFORE planning (these are findings, not guesses)
- **1.1 root cause — TWO parallel notions of "where is this order".** S2 `sortAndPretreat.service.js`
  filters `stage.status === sort-and-pretreat` at ORDER level (~15 sites); S3/S4 filter
  `items[].currentStation` at ITEM level; `handoff.service.js:351-369` only rewrites `stage.status`
  when `summaryStatus()` CHANGES, which a partial move doesn't. So an order is legitimately in BOTH
  lists. This is decision D3 from the split-flow work coming home — S2 was deliberately left on
  `stage.status` and that is now the bug.
- **1.2 is NOT its own bug** — the red message is `handoff.service.js:280`, the CONFIRM-side
  whole-order gate, firing because the items already left S1. Symptom of 1.1.
- **2.3 CONFIRMED BUG:** `intake-user.service.js:867 adjustWallet` mutates `wallet.balance` and writes
  NO `WalletTransaction` at all; both `save()` calls un-awaited.
- **4.4 CONFIRMED BUG:** `admin.service.js:349/:353` — `activeHolds` is ALL holds, `overdueHolds` is a
  strict SUBSET of it. Duplicated at `:1692/:1696`.
- **3.1 is probably NOT "doesn't save"** — `intake-user.service.js:1340` really writes the rider. The
  dispatch-tag gate at `:1331` refuses with `needsDispatchTag` and the FE swallows it.
- **2.1:** create/update at `offerApi.service.js:125/168` are CORRECT and persist; what is genuinely
  missing is a DELETE route (`util/page-route.js:250-261`). "Gone after refresh" is most likely
  offers defaulting to `status: draft` against an active-filtered list.
- **1.5:** only per-item + all-items endpoints exist (`:276`, `:473`, `:665`) — no bulk endpoint, which
  is exactly the "cannot select a few" complaint. Model ALREADY has `colorGroup`/`fabricType`/
  `pretreatmentOptions` + a `not_required` pretreatStatus (bookOrder.model.js:62-94).
- **3.2/3.3 are cheap:** `PICKUP_STATUS.FAILED` exists (constants.js:32); `landmark` exists on
  `user.model.js:10` and in `util/address.js`'s structured address.
- **1.3 IS ALREADY FIXED HERE BUT NOT DEPLOYED** — the 2026-10-05/06 wash-station work is on
  `mesage-and-alert-fix`; Render serves `main`. Same stale-deploy pattern as 2026-09-25. Merging also
  ships the dispatch-tag gate, which may change 3.1.
- **1.6 (per-item care tier) is the money risk** — it moves pricing that booking, the bot, offers and
  subscription draw-down all share. Scheduled LAST in Group 1 with its own DB harness.
- **4.5 is blocked on their own Q2/Q3** and the 125% case was already fixed 2026-09-23; 100% may now
  simply be true. Do NOT change the formula on a guess — answer it in §3.

## Session: 2026-09-24 (cont.) — Dispatch Tag PLANNED + the 2 flagged debts moved INTO plan (NO CODE)

New client brief "CHUVI Dispatch Tag — Simple Explanation". Rewrote `context/feature.md` as a 3-part
package: **A** dispatch tag, **B** the Lagos/UTC split-brain, **C** subscription-purchase revenue —
B and C were previously only *flagged* by the reporting feature, now they have plans + client questions.
- **A — all 7 brief fields already exist on `bookOrder`** (fullName, phoneNumber, deliveryAddress Mixed,
  oscNumber, items[], amount/paymentStatus, `dispatchDetails.delivery.note`). NO schema change for the
  CONTENT; only a `dispatchTag {ref,printedAt,printedBy,printCount}` print record is new. Item count is
  already correct per-piece (the explosion work), and `handoff.service.summarize()` already produces
  "5 Shirts, 3 Trousers". Hook point = `qc.service.packAndSealComplete` (:665).
  - **Q1 is the gating question:** the brief says printing "marks the order dispatch-ready", but
    `packAndSealComplete` is what sets READY today AND fires the customer notification + `crmOnOrderReady`
    + the rider-visible ready queue. Moving READY to print time re-sequences three downstream systems and
    creates a packed-but-not-printed stuck state. **Recommended instead:** keep READY where it is, make
    the tag a required artifact that blocks rider assignment.
  - **Q2 flagged:** `PAYMENT_METHOD.PAY_ON_DELIVERY` is COMMENTED OUT (constants.js:114) — there is no
    cash-on-delivery, collection recording or rider reconciliation anywhere. "Amount due if anything is
    being collected" may therefore imply a whole separate feature. Amount-due must branch on
    `paymentStatus`, NEVER on `amount > 0` (subscription draw-downs have amount>0 but are already paid).
  - Rendering stays FE-side: no PDF/barcode dep in the repo (only `ejs`, for email).
- **B — verified `process.env.TZ` is set NOWHERE.** Disagreement window is exactly 00:00–00:59 Lagos.
  Two aggravating facts recorded: it is **invisible on a WAT dev machine** (so any harness passes
  locally), and it **hides inside the already-accepted "Leads Booked ≠ customers" caveat**. Option (b)
  `TZ=Africa/Lagos` is one env var and makes all 26 surfaces agree — **but node-cron runs on server time,
  so all 12 crons shift an hour** (`crmBroadcasts`/`sendPaymentsReminder` 10am→9am Lagos,
  `resetMonthlyLimits` 01:00→00:00). Recommended: (b) + `util/lagosDay.js` + re-pin the two
  customer-facing crons if 10am was intentional.
- **C — this one is an actual bug, not a gap.** crm.service.js:1250-1253 zeroes a draw-down's revenue but
  :1260 still counts the lead in `booked` → subscriber leads sit in the numerator with ₦0. Deflates
  revenue÷booked (the exact hand-math the report exists for), the error GROWS with subscription adoption
  and points the wrong way, and nothing in the payload reveals it. Trigger is the first sale, not a date.
  Cheap to fix: `Subscription.userId`/`Payment.userId` are both REQUIRED → userId join covers 100%, no
  schema change. **New Q6 for the client: do monthly RENEWALS count, or only the first charge?** That
  moves the numbers more than the initial purchase.
### BUILD (same session) — the answer-independent parts are DONE, offline-verified 48/48
Built everything that does NOT depend on a client answer. New harness `scratchpad/dispatchTagCheck.js`
(stubs `BookOrderModel.findById`, so no DB): lagosDay 13 · itemSummary 7 · amount-due 7 · gates 6 ·
payload 15 → **48 passed, 0 failed.** Swagger **55 schemas / 281 paths**, all routes load.
- **NEW `util/lagosDay.js` (B3)** — `startOfDay`/`endOfDay`/`startOfMonth`/`endOfMonth`/`daysAgo`/
  `monthRange`/`monthKey`. Upper bounds EXCLUSIVE (`$lt` next-period start, not `23:59:59.999` which
  drops the last millisecond); `monthRange` strict + regex-guarded. The 25 existing call sites are
  deliberately NOT migrated — that's B1, the client's call. Test pins the real split-brain: 23:30 UTC
  Sep 30 → Lagos month 2026-10, naive UTC 2026-09.
- **NEW `util/itemSummary.js`** — `itemBrief`/`briefsForIds`/`summarize` were PRIVATE to
  handoff.service.js. Extracted (+ `briefsForAll`/`countPieces`) so the tag's contents line is the exact
  wording the handoff payloads use instead of a second implementation that could drift. handoff.service
  now requires them; verified it still loads.
- **`bookOrder.dispatchTag {ref,printedAt,printedBy,printCount}`** — absent until first print.
- **`qc.service`:** `_dispatchTagOrder` (BOTH gates in ONE place, shared by read + print, refuses with
  the reason), `_amountDue`, `_buildDispatchTagPayload`, `getDispatchTag` (writes nothing),
  `printDispatchTag` (record + activity + audit + `printCount`, `reprint:true` after the first).
- **Routes `/order/:id/dispatch-tag[/print]` under `qcAuth`** + `ACTIVITY_TYPE.DISPATCH_TAG_PRINTED`.
  **GOTCHA: the QC router mounts at `/qc-user`, not `/qc`** (routes/index.js:46) — first draft of the
  swagger said `/api/qc/...`; corrected to match the file's existing `/qc-user/...` convention.
- **BUG CAUGHT IN BUILD: `amount` is ALREADY the full billed total** (bookOrder.service:664 = items +
  pickup/delivery/speed − discount) and on a subscriber-overflow order `amount` IS the logistics fee
  (:980). The first cut added `logisticsFee` on top — that could only double-count what a rider
  collects. Amount-due is now `amount` alone. `deliveryAmount`/`logisticsFee` are BREAKDOWN lines, not
  extra charges — worth remembering anywhere money is summed.
- **Amount-due prints NOTHING (null), never "₦0"**, when there's nothing to collect, so a rider can't
  read a zero as an instruction. Branches on `paymentStatus`, never `amount > 0` (a subscription order
  has an amount but is paid).
### CLIENT ANSWERED ALL SIX same session — one answer forces rework of what was just built
Full locked wording in `context/feature.md`. Headlines + what changes:
- **Q1 → gate RIDER ASSIGNMENT, not READY** (took the recommendation). `packAndSealComplete` stays
  completely untouched. Guard goes in `assignRiderTopDeliveryOrder` (intake-user.service.js:1167) —
  **verified that is the ONLY write path setting `dispatchDetails.delivery.rider`**, so one guard closes
  it. Found the follow-on the answer implies: the S1 list (`getDeliverableOrders`/`_dispatchQueue`
  :1081/:1010) must gain `tagPrinted`/`needsTag`/`printCount` + `needsTagCount`, or staff hit "print the
  tag first" with nothing on screen showing which orders those are — the gate would read as a bug.
- **Q4 → S1 PRINTS, NOT QC. This is the rework.** I had built it under `qcAuth` in qc.service. Checked
  the client's reasoning against the code and **they are right, not confused**: S1 already owns delivery
  rider assignment AND in-person collection (:2148), i.e. S1 is front-of-house order RELEASE. So the two
  endpoints move to intake-user + `intakeUserAuth`, and the payload builder moves to a shared NEW
  `util/dispatchTag.js` (pure function; also lets the rider gate reuse one "is this tagged" definition).
- **Q2 → amount line is a FLAG, not a collection instruction** (laundry is always prepaid; no COD being
  built). ⇒ wording change needed: `amountDue` alone invites a rider to collect cash, so add
  `paymentState: paid|unpaid` + `paymentNotice` ("ask the customer to settle in the app").
- **Q3 → reprints allowed + logged, and "flaggable on our side"** ⇒ `printCount` must surface on the S1
  screen, plus a `reprintFlagged` threshold (propose >3, named constant).
- **Q5 → no barcode now** (no scanners yet; likely V2). Nothing server-side; `ref` already carries what
  a future barcode would encode. FE keeps layout room.
- **Q6 → FIRST subscription payment ONLY, never renewals.** Client's reasoning clarifies the report's
  whole purpose: it measures the SALES REPS' conversion rate for the effort in that window; once a lead
  converts, ongoing spend belongs in a customer/CRM revenue view, not the lead number. Consequence worth
  keeping: each month's figure then STOPS changing once its leads convert, so months stay comparable —
  counting renewals would have made every past month creep upward forever.
  Build note: a renewal is also a successful payment on the same subscription, so C2 must pick the
  EARLIEST payment per `subscriptionId`, not every successful one in the month.
### PART B NOW DONE TOO (B1-B4), verified 14/14 under a simulated UTC host
User confirmed **"the actual time is 10am Nigeria time"** and said to pick an approach. Chose the
**in-code pin over the Render env var** — and note the answer to the user's question: setting `TZ` on
Render needs NO paid plan, env vars are free on every tier; the in-code pin was chosen on merit.
- **`server.js` FIRST statement: `process.env.TZ = process.env.TZ_OVERRIDE || "Africa/Lagos"`.** Verified
  on Node 22 that a runtime assignment really moves `getTimezoneOffset`/`getMonth`/`setHours`, so **all
  ~25 legacy `setHours(0,0,0,0)` sites become Lagos-correct WITHOUT being touched** — the harness asserts
  the legacy pattern and `util/lagosDay` now return the identical instant for the 23:30Z Sep-30 edge case.
  Picked over the dashboard env var because it is version-controlled, needs no dashboard/plan, survives a
  service being recreated, and above all makes **dev match production** so the bug is reproducible
  locally instead of existing only on Render.
- **DESIGN FLAW THE HARNESS CAUGHT:** first cut was `process.env.TZ || "Africa/Lagos"`. Ran it with
  `TZ=UTC` exported to simulate Render and the pin silently did NOTHING — exactly the invisible failure
  it exists to prevent. Override is now the distinct **`TZ_OVERRIDE`** (no platform sets it), so the pin
  is unconditional in practice but still escapable deliberately. Verified both directions.
- **Cron audit, all 11 loaded.** Only `crmBroadcasts` needed changing: **`0 9` → `0 10`**, because it
  relied on the process being UTC to land at 10:00 Lagos and would otherwise have sent an hour early.
  All others are overnight housekeeping shifting an hour earlier (no customer impact);
  `resetMonthlyLimits` 01:00→00:00 on the 1st is an IMPROVEMENT — it now resets exactly at the Lagos
  month boundary the report uses. complaintSla/crmDispatcher/unassignedDispatchScan are interval-based.
- **FOUND IN PASSING, flagged not fixed:** `crons/sendPaymentsReminder.js` is DEAD — not required in
  server.js and would crash if it were (ESM `import` in a CJS file, `../utils/email.js` where no `utils/`
  directory exists). Deliberately left alone; changing its schedule would imply it runs. Fix-and-wire or
  delete is a separate call.
- **CLAUDE.md gained a "Time zone (all dates are Lagos time)" section** (B4) so the next feature doesn't
  re-fork this: the pin + why it stays first, `TZ_OVERRIDE` not `TZ`, **cron expressions are now Lagos
  wall-clock**, and `util/lagosDay.js` for new code.
- New harness `scratchpad/tzCheck.js` (asserts the pin is the first executable statement, that a host
  `TZ=UTC` can't defeat it, legacy-vs-lagosDay agreement, and prints every cron's new Lagos wall clock).
### ALL PARTS NOW CODED — 119/119 offline across three harnesses
`tzCheck` 14 · `dispatchTagCheck` 88 · `subRevenueCheck` 17. Swagger 55 schemas / 281 paths; all routes
load; every touched file `node --check` clean.
- **R1-R4 relocation done.** NEW `util/dispatchTag.js` holds the gate + payload + `isTagPrinted` +
  `REPRINT_REVIEW_THRESHOLD` as pure functions, so the read endpoint, the print endpoint AND the
  rider-assignment guard share ONE definition of "may this be tagged / is it tagged". The two endpoints
  now live on intake-user under `intakeUserAuth`: **`GET|POST /api/intake-user/order/:id/dispatch-tag
  [/print]`**. qc.service/controller/routes fully stripped (harness asserts no dispatch-tag code is left
  there, and that `packAndSealComplete` still sets READY + still fires `crmOnOrderReady`).
- **R3 wording (Q2):** payload now carries `paymentState: paid|unpaid` + `paymentNotice`. Unpaid reads
  "Ask the customer to settle it in the app — do NOT collect cash." A bare `amountDue` would have
  invited exactly the cash collection the client says never happens.
- **A6 gate:** `assignRiderTopDeliveryOrder` refuses an untagged delivery order with
  `needsDispatchTag: true` and a message naming the order + the action, BEFORE any write (harness
  asserts nothing was written on refusal, that it passes once printed, and that a non-delivery order is
  never blocked).
- **A6b/A6c:** delivery-queue rows gained `tagPrinted`/`needsTag`/`printCount`/`reprintFlagged` +
  `needsTagCount`; `select` gained `dispatchTag qcDetails`. Pickup leg deliberately unchanged.
  Threshold 3, so the client's "five reprints" case flags. Reprint audit line reads "REPRINTED (print #2)".
- **Part C:** `$sort {createdAt:1}` → `$group` by `subscription` taking `$first` → `$match` the month.
  Sorting-then-first is what makes a RENEWAL structurally unreachable. Adds into the SAME `leads` Sets
  as the order pass, so a lead who subscribed AND ordered is counted once with both revenues summed.
  Payments with no `subscription` ref are excluded (can't tell first from renewal). New plain integers
  `subscriptionConversions` (credited leads only — a walk-in's plan would imply money not in the totals)
  and `subscriptionDrawDownOrders`.
- **USER WIRED `sendPaymentsReminder.js` INTO server.js MID-SESSION** (fixed its ESM import → `require
  ('../util/emailService')`). My cron harness caught it immediately as a regression. Moved it to
  `0 10 * * *` to match the confirmed 10am Lagos intent. **BUT it sends NOTHING — two bugs, documented
  in the file, NOT fixed (switching on customer email is the user's call):** (1) `.populate("user")` is
  the wrong path, the field is `userId`, so `sub.user.email` throws on the first expired subscription
  and the catch swallows it nightly; (2) `sendEmail` requires `html` (emailService.js:54 returns false
  without it) but the cron passes `text`.
### 2026-09-25/29 — TWO FOLLOW-UPS: swagger envelope fixed repo-wide + dispatch tag DB-VERIFIED

**1. FE reported "nothing is live", then found a real docs bug.**
- **"Not live" was a stale DEPLOY, not missing code.** The symptom pattern gave it away: 2 endpoints
  entirely absent, 3 present but on their OLD shape = the server was running an older commit. Locally
  everything was there (281 paths). All the work sits on `mesage-and-alert-fix`; Render serves `main`.
  Fix = merge + redeploy, no code change. FE later confirmed live round-trips.
- **Related trap recorded:** `swagger/swagger.js` hardcodes `servers` to the deployed Render URL, so
  "Try it out" from ANY `/api-docs` (even local) hits PRODUCTION.
- **THE REAL BUG — the success envelope was documented one level too shallow.** Wire shape is
  `{success, data:{message}}` (service returns `sendSuccessResponse({message})`, controller nests
  `result.data` under its own `data`). Docs said `{success, message}`. Payload is at **`data.message`**.
  FE had to find this with a network capture.
  - **112 response blocks across 27 route files**, in TWO variants: 104 with `success`+`message` as
    siblings, and 8 with `success`+`message`+`data` as siblings (services returning an extra key, e.g.
    `addAddress` → `{message, data}` — BOTH belong under the outer `data`). Fixed with a structural
    sweep (rule: `success` and `message` may never be siblings), idempotent, verified 141 correct / 0 wrong.
  - **ROOT CAUSE was the pattern in CLAUDE.md itself**, so every endpoint written to the house style
    inherited it. Fixed there FIRST, with a verification snippet, so it can't regrow.
  - **Why it survived:** `ErrorResponse` was always correct (`{success, data:{error}}`). Failures
    nested, successes didn't, and nobody compares the two.
  - **DOCS ONLY — no FE change needed.** Proved it: stripped all comments from the 17 changed route
    files and diffed against HEAD → executable code IDENTICAL in every one; route registrations
    identical (16/10/4/8/33); all 8 worried-about endpoints still registered in the live router; 294
    routes as before; 119/119 runtime checks still pass. The docs were changed to match the code, NOT
    the reverse — the reverse would have broken every FE call.
- **A CRLF trap in the sweep script:** the first pass found only 9 sites because `properties:\r` never
  matched `'properties:'`. Most route files are CRLF; the \r must be stripped before comparing and
  restored when writing.

**2. Dispatch tag DB-VERIFIED — NEW `dispatchTagStaging.js`, 46/46 GREEN against `testingdb`.**
User supplied the testing URI. Details in `context/feature.md` A8. Headlines: the print record really
PERSISTS; Activity + AuditLog written and the reprint audited as "REPRINTED (print #2)"; the rider gate
refuses with `needsDispatchTag` writing NOTHING then allows after printing with the rider actually
stored; the queue returns `needsTag`/`needsTagCount` from a real query; the payment flag correct across
paid/unpaid/subscription; `itemCount` = 5 pieces from a real 3+2 booking. All probe data removed.
- **Harness hard-refuses a DB named `laundrydb`** (the older harnesses don't) — `.env` still points at
  the LIVE db, so always pass `MONGODB_URL` inline.
- **Two harness bugs the run found:** booking payload was missing required `fullName`; and
  `postBookOrder` returns `{ message: <string>, order, offer }` — the order is a SIBLING of `message`,
  so the id is at `data.order._id` (another instance of the multi-key-under-data shape).
- **testingdb was seeded** (AdminSetting 4 serviceTypes, AdminOrderDetails, one OrderItem `shirt` with
  price as a MULTIPLIER of 1 — not naira, per the earlier botStaging lesson).

### 2026-10-05/06 — WASH STATION fixes (from an FE screenshot) + envelope variant 3

**Trigger: a screenshot of Active Wash — every card stuck on "Waiting confirmation", Est. Finish wrong.**

- **9a — the stuck button WAS a backend gap, not just FE labelling.** I first said it was FE-only; the
  code says otherwise. `allItemsConfirmed`/`confirmedItemCount` are returned by the QUEUE endpoints
  (washAndDry :164-165, :209-218) but NOT by `getActiveWash`/`getActiveDry`. A shared station card
  keyed on `allItemsConfirmed` reads `undefined` there → falsy → "waiting confirmation" that can NEVER
  clear. Added `allItemsConfirmed` + `confirmedItemCount` + a new **`canMoveToDrying`** (the genuinely
  actionable flag) to both lists.
  - The underlying logic was always right: `washDetails.startedAt` is stamped ONLY when every item at
    the station is confirmed (updateOrderItemsStage :90-111) and active-wash selects on it — so an order
    on that screen has nothing left to confirm. The backend just wasn't saying so.
  - **`isWashed` had to be hoisted to module scope** — it was local to `getWashQueue`, so using it in the
    other two methods would have thrown ReferenceError at runtime. `node --check` AND `require()` both
    passed it; only running the code caught it. Worth remembering: loading a service proves nothing
    about method bodies.
- **9b — Est. Finish was a flat default everywhere. THREE compounding bugs:**
  1. `deliverySpeed` was never in any station projection → the lookup always read `undefined`. Added to
     **18 selects** across wash/press/qc.
  2. Duration tables keyed `same_day` but the stored enum value is **`same-day`** (hyphen) — same-day
     orders never matched even once the field was there.
  3. `pressAndIron :546` indexed a SPEED-keyed table by `serviceTier` (classic/premium/vip) → never
     matched, every press order read 30 min.
  Fallbacks now resolve to each table's own `.standard` instead of unrelated constants (60/30/20).
  **DB-verified 20/20: express 45 / standard 65 / same-day 25 — three different estimates where there
  was one.** (That harness lived in the scratchpad and was cleared by the session rollover; the
  committed `dispatchTagStaging.js` re-ran 46/46 green as the regression gate.)
- **ENVELOPE VARIANT 3 — 138 MORE blocks.** While documenting the above I found response schemas with
  `{message}` and NO `success` wrapper at all (my earlier sweep required `success` to be present). Same
  bug. Fixed with a second structural pass anchored on `schema:` → `type: object` → `properties:` so it
  can't touch nested blocks. **Running total: 250 blocks corrected; spec now 277 correct / 0 wrong.**
  Also: 8 station endpoints documented their payload key as `orders` when the services return `data`
  (CRM's `orders` is genuine — left alone).
- Docs-only proof repeated for this pass: 13 route files changed, executable code IDENTICAL in all.

- **STATUS: all parts CODE-COMPLETE + DB-VERIFIED. Part C's live check (C5) is the only gap and needs a
  real subscription to exist.** UNCOMMITTED before this commit: the two envelope sweeps, CLAUDE.md, the
  wash/press/qc duration + flag fixes, changelog §8-9, and `dispatchTagStaging.js`.
- **NEXT:** on go-ahead — R1-R4 relocation, A6+A6b+A6c, Part C, then A8/C5 DB verify. Monthly Lead
  Reporting is STILL UNCOMMITTED underneath all of this.

## Session: 2026-09-23 — CRM dormant-rate 125% FIXED + Monthly Lead Reporting PLANNED (all client answers in)

Branch `mesage-and-alert-fix`. Two threads this session.

### 1. DORMANT RATE showed 125% — DIAGNOSED + FIXED (2 code changes, live-verified)
Root cause: `dormantRate: pct(dormant, converted)` compared DIFFERENT populations. Numerator counted
EVERY profile at stage `dormant` (no order filter); denominator only `totalOrders >= 1`. Live data:
dormant 5 / converted 4 = 125%. Nothing constrained dormant ⊆ converted, so it was unbounded.
Two things put a profile in the numerator but not the denominator:
  (a) a staff member manually moved a LEAD (0 orders) to `dormant` via `correctStage` — stageHistory
      showed `lead→dormant`, note "new dormant stage", with `changedBy` set. The automatic
      `runDormancyScan` could NOT have done it (it requires `totalOrders > 0` AND sets
      `wasDormant`/`dormantSince`, both unset on that record).
  (b) `totalOrders` counts DELIVERED orders — a lead who books moves to stage `first-order` at booking
      (crm.service.js ~:397) but the counter only increments on delivery (~:428). All 4 profiles at
      `first-order` had totalOrders=0.
- **FIX 1 (crm.service.js ~:1072):** numerator scoped to `{stage:'dormant', totalOrders:{$gte:1}}` →
  **125% → 100%**, now mathematically ≤100%. Raw `stages` breakdown left UNSCOPED on purpose (it is the
  true stage distribution).
- **FIX 2 (crm.service.js ~:920 `correctStage`):** blocks `active`/`loyal`/`dormant`/`reactivated` on a
  profile with 0 delivered orders, with a clear error. `lead` + `first-order` stay allowed at 0 —
  `first-order` is the legitimate booked-but-not-delivered state. Verified 7/7 cases live.
- **Q3 client ruling:** "converted = ordered AND we delivered to them" → the existing denominator was
  already correct, NO change needed.
- **Data cleanup:** "Rebecca Houston" (the lead manually set to dormant) restored to `lead` with a
  stageHistory note (`changedBy: null` — it wasn't a staff action). Live now: **dormant=4, lead=20,
  first-order=4, dormantRate 100%, customers 4.**
- **NOTE:** verification ran against `laundrydb` (.env). Two allowed guard-test calls wrote through;
  the one artifact (a `lead→first-order` stageHistory entry on "Nwoye Kelvin") was removed and the
  final state matches session start exactly.

### 2. Monthly Lead Reporting — PLANNED, ALL Q1–Q6 ANSWERED BY CLIENT, NO CODE YET
Full plan + locked decisions in `context/feature.md` (rewritten as the CURRENT feature). Headlines:
- **Cold leads → a TAG** (`cold-lead`), not a stage. Slots into the EXISTING
  `CRM_TAG_GROUPS.LEAD_STATUS` group, so `replaceGroupTags` + the existing clear-on-booking path handle
  it with no new machinery. Client also wants "gone cold vs still being worked" beside conversion.
- **"Placed an order" = BOOKED**, revenue = booked `order.amount`, month bucket = PLACED date.
  **Label it "Leads Booked"** — it will NOT match `customers` (delivered-based) and the label must stop
  that becoming a confused support thread.
- Exclude cancelled + recovery orders. **NEW POLICY:** subscription draw-down order = ₦0; the
  subscription PURCHASE is what gets credited, in the month the money moved (no double-count).
- **Months on Lagos time** (`moment-timezone` already a dependency; WAT = UTC+1 year-round, no DST).
- **"Leads entered" = genuine leads only.** Needs a schema change — `CrmProfile` has ONLY `createdAt`
  and no origin marker. Verified breakdown of the 28 live profiles: **15 backfilled** (single-day
  `crmBackfill.js` batch on 2026-07-15), **3 created BY their own order**, **10 genuine leads**
  (7 never ordered). A report on `createdAt` today would print July 2026 = 17 leads when the truth is 2.
  Historical months can't be fully reconstructed; exact only from the day `leadSource` ships.
- **Join feasibility CONFIRMED:** orders→profiles by `userId` then `normalizedPhone` covers **66/66
  live orders** (62 userId, 4 phone, 0 orphans) — no schema change needed for the join itself.
- **FLAGGED, not blocking:** 25 other places bucket "today" via `setHours(0,0,0,0)` = server-local
  (UTC on Render), so this will be the only Lagos-time surface and can disagree at month-end.
  Deliberately not rewriting 25 call sites.
- **NEXT:** build Parts 1–6 in feature.md on go-ahead.

## Session: 2026-09-24 — Monthly Lead Reporting BUILT (Parts 1-6), 48/48 DB-verified

All six parts done in one pass. Blow-by-blow + locked decisions in `context/feature.md`. Summary:
- **Part 1 cold-lead tag.** `CRM_TAG.COLD_LEAD` in the EXISTING `LEAD_STATUS` group + `CRM_MANUAL_TAGS`.
  Two things the plan missed and the build found: `markProspect` replaced the whole LEAD_STATUS group,
  so the nurture cron would have overwritten a staff-set cold-lead and resumed outreach — now skips
  cold leads; and applying the tag had to actually STOP outreach (cancel pending LEAD messages, drop
  the prospect broadcast, clear nextFollowUpAt) or "cold" was cosmetic. Booking already clears the tag
  for free via the existing LEAD_STATUS clear. 19/19.
- **Part 2 profile origin.** `CrmProfile.leadSource` (lead|order|backfill, indexed) + `leadEnteredAt`.
  `findOrCreateProfile` takes it, defaulting to ORDER (conservative — an undeclared path never inflates
  the lead count). `createLead` → lead, `crmBackfill.js` → backfill. NEW `crmLeadSourceBackfill.js`
  (idempotent, --dry). **APPLIED to laundrydb: 28 stamped → backfill 15, lead 10, order 3, 0 missing.**
  12/12.
- **Part 3-5 report.** `GET /api/crm/reports/monthly-leads?month=YYYY-MM` (adminAuth),
  `ROUTE_CRM_REPORT_MONTHLY_LEADS`, `MonthlyLeadReport` swagger schema. Lagos months via
  moment-timezone. Plain integers + naira ONLY — a test asserts no `rate|percent|%` field exists
  anywhere in the payload, so the client's "no server-side math" rule is enforced not just intended.
  17/17.
- **5 real bugs caught by the harnesses** (details in feature.md): the migration's userId-only order
  key; `booked` counting orders instead of leads; `stillBeingWorked` derived from a driftable `stage`;
  a `$or` clause matching every order with a phone; and moment accepting "April 2027" non-strictly.
- **Live numbers:** 2026-07 leads **2** (raw createdAt would have said 17) · 08 leads 5 · 09 leads 3.
- **Boot check run against testing_db this time** — NOT laundrydb, after the earlier cron incident.
- **NEXT:** FE changelog written; then commit. Subscription-purchase revenue (Q3) still unplumbed —
  no subscriptions exist yet, ships after the order-based numbers.

## Session: 2026-09-01 — FE bug diagnosed: split-flow station scoping. PLANNED, NO CODE YET.

FE reported: moving ONE item S2→S3 makes the WHOLE order appear at wash after confirmation. Confirmed in
code; also confirmed it happens S3→S4 identically. `context/feature.md` rewritten as the CURRENT feature
(the allowance feature demoted to PREVIOUS/COMPLETE). Full plan + 8 TODOs there. Summary:
- **Root cause:** engine stores station membership PER ITEM (`items[].currentStation`) but every station
  read filters at ORDER level and returns the full `items[]`. `{'items.currentStation':X}` = "order has ≥1
  item here", it does NOT project the matching items. DB data is correct; reads/writes on top are not.
- **3 symptoms:** (1) whole order rendered at the receiving station; (2) `allItemsConfirmed` computed over
  ALL items → never true → next push button never enables; (3) **data corruption** —
  `util/updateOrderItemsStage.js` filters by STATUS ONLY, never `currentStation`, so `allItems:true` at
  wash stamps `washStatus:'complete'` on items still at S2, which then pass the wash gate for a station
  they never reached.
- **Gate hole found:** client re-confirmed S1→S2 and S4→S5 are HARD gates (complete order only; nothing
  partial may reach QC). Code enforces this on `handoff.push` (:106-108, :181-192) but NOT on
  `handoff.confirm` — `rejectedItems` accepts any subset (:268) so QC can partially accept a whole-order
  handoff. Must be closed (Part 1). An earlier suggestion to instead station-scope QC's reads was WRONG
  and is scrapped.
- **Existing orders: NOT at risk.** `currentStation` landed 2026-08-28 (`98425af`), no backfill exists, and
  Mongo does not match a missing field — but the Phase-3 arch decision records "Pre-launch, so no live
  pipeline/data to protect". Part 0 backfill is a cheap idempotent safety net for dev/test DBs, not a
  production migration. Confirm pre-launch still holds before deploying.
- **Scope narrowed by two prior decisions:** Part 1 proves S1+S5 need no change (whole-order gated), and
  decision D3 means S2 KEEPS its `stage.status` query (only its `items[]` needs scoping). So station-aware
  reads are needed in the stretch zone ONLY — S2/S3/S4.
### BUILD DONE same session — Parts 0-6 complete, offline-verified 24/24. Part 7 (DB run) BLOCKED.
User said ship Parts 0-7, breaking FE contract is fine (scoped subset stays under `items`).
- **Part 1 gate** (`handoff.service.js` confirm): recomputes `isWholeOrderGate` from the stored handoff and
  refuses a partial confirm on S1→S2 / S4→S5 — `rejectedItems` must be empty or the complete set. Plus a
  defensive `isWholeAt(fromStation)` re-check.
- **Part 2** NEW `util/stationScope.js`: `stationOf` (missing field → S1, the handoff.service convention),
  `itemsAtStation`, `itemsElsewhere`, `scopeOrderToStation`, `allAtStation` (empty is NEVER all-done),
  `countAtStation`.
- **Part 3 writes** `util/updateOrderItemsStage.js`: new `station` param; `allItems:true` now means "all
  items at MY station"; `allItemsCompleted` station-scoped (so `washDetails.startedAt`/`pressDetails.startedAt`
  finally stamp on a partial batch). Callers pass `station` + reject stray explicit itemIds up front.
- **Part 4 reads** S2/S3/S4 only (S1/S5 proved out of scope by Part 1): wash + press queue/details/dashboard/
  active-wash/active-dry/active-press all scoped; sort keeps its `stage.status` query per D3 and scopes only
  items + `allItemsSorted`/`allItemsPretreated`/`readyToSend`; `markAllItemsAsSorted` no longer bulk-stamps
  items already handed to wash; per-item S2/S3/S4 guards (sort/pretreat/flag/hold) reject items not at the
  calling station.
- **Part 5** `$elemMatch` on the press dashboard's two item-level conditions. (Wash's mixed queries pair an
  item-level with an ORDER-level `washDetails.*` condition, so they were already correct — no change.)
- **Part 0** NEW `stationBackfill.js` — idempotent, `--dry` mode, stamps missing `currentStation` from
  `stage.status`; HOLD resolves via `stationStatus` then last non-hold history entry.
- **Part 6 Swagger** NEW `StationScopedOrder` schema (allOf BookOrder + `itemsAtStationCount`/`totalItemCount`/
  `itemsElsewhere`), wired into the 11 scoped station endpoints; handoff-confirm documents the gate refusal.
  52 schemas, 278 paths, parses.
- **TWO PRE-EXISTING BUGS FIXED in passing** (wash undo-confirm): it set `washDetails.startedAt = null`, but
  the queue selects on `{$exists:false}` — a null left the order stuck OUT of the wash queue and showing in
  Active Wash; now `$unset`. It also reset `stationStatus` to the SORT station, which under split-flow is
  simply wrong (undoing a confirmation moves no items); now left alone.
- **VERIFIED OFFLINE 24/24** (scratchpad `scopeTest.js`, stubs the two BookOrderModel calls): hard-gate
  matrix incl. wash-only S3→S5; confirm-side refusal accept-all/reject-all/partial; no item at two stations;
  `allAtStation` opening the push gate; `allItems:true` touching only the 2 wash items not all 4. All 5
  services + swagger load clean.
- **Part 7 DB-VERIFIED (user supplied the testing_db URI; `.env` still points at `laundrydb` — always pass
  MONGODB_URL inline for these harnesses, never edit .env):**
  - `handoffStaging.js` extended with scenarios 15-20 → **54 passed, 0 failed** (was 18). New coverage:
    wash queue shows 1 item not 4 + `totalItemCount`/`itemsElsewhere`; sort shows the remaining 3; NO item at
    two stations; scoped order-details both sides; sort `readyToSend` no longer blocked by the item at wash;
    `allItems:true` at wash stamps only the wash item; `washDetails.startedAt` finally stamps on a partial
    batch; cross-station itemIds refused BOTH ways; **S4→S5 partial confirm REFUSED, moved nothing, handoff
    left pending**; reject-all and accept-all both still work; S2→S3 partial confirm still allowed;
    legacy order proven invisible to the wash queue until backfilled.
  - `stationBackfill.js` verified end-to-end (scratchpad `backfillCheck.js`) → **15 passed, 0 failed**: dry
    run writes nothing; all 9 stage→station mappings correct incl. HOLD-via-`stationStatus` and
    HOLD-via-`stageHistory` fallback; an already-stamped item is NOT overwritten; second run is a no-op.
  - All probe/staging data cleaned up — verified 0 leftover orders, 0 leftover users in testing_db.
  - testing_db held NO real legacy orders (the backfill found only the 10 seeded probes), consistent with
    the recorded "pre-launch" decision.
- **STATUS: Parts 0-7 COMPLETE + DB-VERIFIED. Uncommitted on `sub-offer-recurring-feature`.**

## Session: 2026-08-31 — Quoted + locked 2-feature package; Feature 1 planned (NO CODE YET)

Client approved a new package (₦210k): Feature 1 = per-plan free pickup/delivery allowance (₦65k), Feature 2 =
recurring offers (₦145k, DEFERRED). Client answered all scoping questions (see summary.md "NEW PACKAGE").
**Only Feature 1 to be built now; NO CODE YET this session.** Plans locked in:
- `context/summary.md` → new section with both features' confirmed decisions + cost + build order.
- `context/feature.md` → rewritten as CURRENT feature = Feature 1 (weekly allowance) with full TODOs; the completed
  split-flow/addresses/set-items feature moved below as PREVIOUS.
- **Change from the quote:** allowance is **PER WEEK**, not per month → needs a lazy weekly reset at booking
  (`logisticsWeekStart` on the subscription), since Paystack renewal is monthly. Pickup+delivery counted separately
  (both = 2 units); speed stays free always; charge pickupFee/deliveryFee once the weekly allowance is exhausted.
- Feature 1 files (no new endpoints): plan.model, subscription.model, subscription.service, webhook.handler,
  bookOrder.service, admin.service, swagger. Build starts on go-ahead.

### Feature 1 BUILD STARTED — non-payment parts DONE + verified; billing branch HELD pending client
- **Week boundary: rolling 7-day from subscription start** (client-confirmed). DONE (all load + unit verified):
  - `plan.model` `freePickupDeliveryPerWeek` (Number, default 0, min 0).
  - `subscription.model` `remainingPickupDeliveries` + `logisticsWeekStart`.
  - `util/logisticsAllowance.js` (NEW helper, keeps billing branch lean): `applyWeeklyReset` (lazy 7-day-step reset
    anchored to logisticsWeekStart) + `computeLogisticsCharge` (legs pickup+delivery separate, **pickup freed first**,
    returns {freeUsed, fee, chargedPickup, chargedDelivery}). Unit-verified: rem0→fee1000 both charged, rem1→pickup
    free+delivery charged, rem2→free; reset 20d→advanced to 6d-ago, counter→grant.
  - Seed on subscribe (`subscription.service.subscribePlan`) + webhook first-charge create & reactivate branches
    (`webhook.handler.handleNormalSubscription`): remainingPickupDeliveries = plan.freePickupDeliveryPerWeek,
    logisticsWeekStart anchor. Monthly RENEWAL branch NOT touched for logistics (weekly lazy reset handles it).
  - `subscription.service` createPlan validateRule: `freePickupDeliveryPerWeek: 'integer'` (create/update already
    spread `post`, so the field flows through — no admin.service change needed).
  - Swagger `Plan` schema: added freePickupDeliveryPerWeek (+ monthlyLimits which was missing).
- **BILLING BRANCH + BOT DONE (client: fee = configured pickupFee/deliveryFee; customer picks WALLET or CARD; include bot).**
  Load-verified; DB-verify + commit still pending.
  - `bookOrder.model`: `logisticsFee` (Number) + `logisticsPaymentMethod` (wallet|card|null).
  - `bookOrder.service` subscription branch: `applyWeeklyReset` → `computeLogisticsCharge` (fees from
    `adminOrderSetting.pickupFee/deliveryFee`) → consume free legs + monthly items. **fee=0 → covered as today
    (amount=item sum, SUCCESS).** **fee>0 → amount=fee, deliveryAmount=fee, logisticsFee=fee, paymentStatus PENDING**;
    requires `post.overflowPaymentMethod` (else fails with `needsLogisticsPayment:true`+`logisticsFee`).
    wallet → `chargeWalletForOrder(amount:fee)`; fail → rollback allowance+delete order+`needsLogisticsPayment`.
    card → `initializePayment(order)` (charges order.amount=fee) → `logisticsPaymentUrl` in the response, order stays
    PENDING until the existing webhook. **Speed surcharge stays ₦0.** _buildPricing keeps the item value in the breakdown.
  - BOT (`services/bot/booking.flow.js`): subscriber overflow no longer falls back to pay-per-item — new
    `collect-logistics-fee` step (`_bookingLogisticsFeeStep`) asks wallet/card, re-calls createOrder with
    `overflowPaymentMethod`; wallet→confirm, card→returns the Paystack link; wallet-insufficient→offer card.
    Step pinned in `isPinnedStep` (like collect-payment) so a typed "card"/"wallet" can't hijack it.
  - Swagger: booking request body documents `overflowPaymentMethod` + the `logisticsFee`/`logisticsPaymentUrl` behaviour;
    Plan schema has `freePickupDeliveryPerWeek`.
  - **DB-VERIFIED 2026-08-31: `subLogisticsStaging.js` ran GREEN against testing_db — 20 passed, 0 failed.**
    A) both legs within allowance → free, allowance 2→0 (separate counting); B) used up + no method → needsLogisticsPayment
    + fee ₦1000; C) wallet → charged, order SUCCESS, wallet debited; D) card → order PENDING (Paystack link soft-skipped,
    no key in run — behaviour correct); E) wallet insufficient → rollback (no order, allowance intact); F) rolling 7-day
    reset → legs free again, anchor advanced. Cleanup removed all throwaway data. NEW harness `subLogisticsStaging.js`
    (safety-gated, self-seeds settings). **FEATURE 1 COMPLETE + DB-VERIFIED.** Only the card `logisticsPaymentUrl` link
    is untested (needs PAYSTACK key loaded). Ready to commit. All uncommitted on modular-branch.

## Session: 2026-08-28 — CRM Communication Restructure: packages A–D done (load-verified, UNCOMMITTED on modular-branch)

Client brief "CHUVI Communication & CRM Restructure" (tune the CRM to what it is — a one-way messenger).
Five parts; client-approved to build 4 now (A–D), E (subscriber loyalty) deferred pending client answers.
Decision locked by user: subscriber orders EXCLUDED from every-5 loyalty count (that gate is part of E, NOT built yet).

- **A — Order lifecycle + per-message link routing.**
  - Added `CRM_MESSAGE_TYPE.ORDER_READY`; kept `REORDER_PROMPT` in enum but REMOVED from schedule/templates
    (14-day reorder nudge gone). New post-delivery chain: (Order Ready →) Delivery Confirmed → Feedback Request.
  - Rewrote crmMessenger link logic into an explicit per-message-type `LINK_POLICY` (`linkLineFor`):
    order-ready/delivery-confirmation→NO link; feedback-request→that order's screen (`deepLink('feedback',recordId)`);
    lead-*/prospect→registration; reactivation-*/churn→Offers page. Removed the old `SUPPORT_CONTEXT_BY_MESSAGE_TYPE`
    support-link map. **BEHAVIOR CHANGE (per spec):** reactivation/churn/feedback/delivery no longer deep-link the
    in-app assistant with `?crmContext=` → the bot's crmContext framing (2026-08-18 wiring) is dormant again. Fine per client.
  - Threaded `recordId` onto `CrmScheduledMessage` (new field) → scheduleMessages → dispatcher → sendCrmMessage, so
    the feedback link targets the specific order. `startPostDeliveryWorkflow(profile, order)` now sets it.
  - **Order Ready trigger NOT wired** (client to confirm the exact "ready" stage). Built the send path:
    `CrmService.handleOrderReady` + `crmOnOrderReady` hook (in util/crmHooks, exported) — but NOT called from any
    station flow yet. Wire at the confirmed transition (likely QC-passed / ready-for-dispatch).
- **B — All workflow timings configurable (like leads).** New CrmSetting fields `postDeliverySchedule`,
  `reactivationSchedule` (shared `scheduleStepSchema`) + `orderReadyDelayMinutes`; defaults exported
  (DEFAULT_POST_DELIVERY_SCHEDULE / DEFAULT_REACTIVATION_SCHEDULE). start*Workflow methods read settings (fall back
  to defaults). `handleOrderReady` uses `orderReadyDelayMinutes` (0=immediate send, else scheduled).
  `updateSettings` refactored: shared `normalizeSchedule` validator (stagger rule) applied to all three schedules +
  delay validation. Removed hardcoded HOUR/DAY literals from the two workflows.
- **C — Broadcast variant rotation A→B→C→A.** Per-profile `broadcastLists.<list>.cycleIndex`; `runBroadcasts` picks
  variant `['a','b','c'][idx%3]` then ++. 6 variant templates seeded (prospect-broadcast-a/b/c, churn-broadcast-a/b/c
  — literal keys, NOT enum types). `sendCrmMessage` gained `templateKey` override (base key = fallback). Template-key
  validation in updateSettings widened to allow the 6 variant keys.
- **D — Lead 5→3.** DEFAULT_LEAD_SCHEDULE reduced to lead-welcome(Welcome Offer)→lead-offer(Offer 2)→lead-close(Offer 3)
  →lead-mark-prospect; qualify/reminder-1/reminder-2 retired from defaults (enum kept). Copy updated to offer framing.
- **Back-compat:** `config/setup.js createCrmSettings` now backfills existing docs with the new schedules + any missing
  default template keys (never overwrites admin-edited keys).
- **Swagger:** CrmSettings schema updated (postDeliverySchedule/reactivationSchedule/orderReadyDelayMinutes + shared
  CrmScheduleStep); message-type enum gained order-ready. Spec builds.
- **Verified:** node -c clean on all touched files; full CRM chain + crons load; deepLink builders produce correct URLs
  (offers/feedback/register). NOT DB-tested end-to-end yet (no staging run this session).
- **FE impact:** NO customer-facing FE. Admin dashboard: B needs new timing editors (post-delivery + reactivation);
  C needs 6 broadcast template slots; A needs order-ready slot / drop reorder; D shows 3 lead steps. All auto if their
  editors are data-driven off the settings API (which is generic).
- **OPEN / TODO:** (1) `{{link}}` token decision (admin-placed link vs auto-append at end) — currently auto-append.
  (2) DB/staging verify. (3) commit.

### Follow-up same day — client answered both questions → Order Ready wired + package E (partial) built
- **Order Ready trigger WIRED (client: QC done / ready for dispatch, NOT rider assignment).** Fired `crmOnOrderReady(order)`
  in `qc.service.packAndSealComplete` (the QC→READY transition, right after the existing ORDER_READY in-app notification).
  So A is now COMPLETE. `handleOrderReady` sends immediately (orderReadyDelayMinutes=0 default) or schedules if a delay is set.
- **Package E — subscriber loyalty (client mechanics: scale to plan size, ALWAYS round down):**
  - **Model:** subscription.model gained `consecutiveMonths` + `loyaltyRewardsApplied[]` (double-apply guard).
    crmProfile.model gained `nonSubscriptionOrders`.
  - **Streak tracking (util/webhook.handler.js):** first charge (handleNormalSubscription create + reactivate) sets
    consecutiveMonths=1; each recurring renewal (charge.success w/ subscription) +1 AFTER the fresh-allowance reset;
    handlePaymentFailed resets to 0 + clears applied. New `applySubscriberLoyalty(sub, plan, month)` helper.
  - **Rewards:** month 3 → remainingItems += floor(monthlyLimits*0.25); month 6 → += floor(*0.50) (verified 25→6 / 25→12,
    matches client examples); each fires a customer notification. **Month 12 = whole month free via PERIOD EXTENSION —
    NOT built.** The webhook is POST-charge, so suppressing that cycle's Paystack charge needs a Paystack-side mechanism
    that isn't decided. Month 12 is DETECTED + recorded (loyaltyRewardsApplied) + warn-logged, but the free month is NOT
    applied. **DECISION NEEDED from client/us: how to move the period without charging (Paystack has no clean "skip one
    cycle"; options: disable+re-enable around the cycle, or manage next_payment_date).**
  - **Loyalty-count exclusion (client-locked):** handleOrderDelivered now increments `nonSubscriptionOrders` only when
    order.billingType !== pay-from-subscription, and the every-5 LOYALTY offer fires on nonSubscriptionOrders%5 (was
    totalOrders%5). totalOrders still increments for stage/tags. So subscriber bundle-draws no longer earn the walk-in
    loyalty offer; they earn via renewed months instead.
  - Verified: node -c clean + full load on webhook.handler/qc/crm; reward floor math matches client examples.
  - **E STILL OPEN:** month-12 period-extension billing mechanism (above). Everything else in E is done.
- **2026-08-29 — E COMPLETE.** Client REVERSED month 12: payment never changes (same price/schedule), the reward is
  purely a bigger item bundle that month — month 3 +25%, month 6 +50%, **month 12 +100% (double), floor**. No Paystack
  interaction at all (the whole period-extension blocker is gone). `applySubscriberLoyalty` now uses one
  `LOYALTY_BONUS_PCT={3:.25,6:.5,12:1.0}` table. Verified 25-item plan → +6/+12/+25. E done.
- **2026-08-29 — CLIENT CLARIFIED PER-PIECE (production flow) — NOT YET BUILT, needs plan+go-ahead.** Client wants:
  (1) COUNT BY PIECE at every station + handoff (5 shirts = 5, not 1 bundle) — today countByStation/handoff count LINES.
  (2) PER-PIECE TAGGING ALWAYS — every physical item gets its own tag; tagging never grouped (today tagId is per LINE,
  one tag for a qty-N line). (3) "bundle" = a Set/container of DIFFERENT priced pieces (suit=jacket+trousers+…, = Phase 2
  ItemSet, already built); customer can book the whole container or pick individual pieces (price adjusts — already
  supported since booking records each selected piece as its own line). This is a REWORK of the DB-verified Phase 3
  item model — likely EXPLODE each qty-N line into N piece records (qty 1 each, own tagId, own currentStation) at intake,
  so all existing per-item machinery (tag/station/handoff/QC/count) works per piece. Pricing must stay identical.
  DECISION PENDING: explode-into-piece-records vs keep-lines-with-per-piece-tag-array. Re-verification of Phase 3 needed.
- **2026-08-29 — PER-PIECE (Option 1 = explode at creation) BUILT + handoff name/count/summary BUILT (load-verified, UNCOMMITTED).**
  - **Explosion:** new `util/explodeItems.js` `explodeItemsToPieces(items)` — a qty-N line → N records of qty1, _id
    stripped (Mongoose assigns fresh), all other fields (type/price/fromSet) preserved. Applied to the STORED
    `newOrder.items` at ALL creation sites, AFTER pricing/limit/capacity checks (which use `post.items.length` on the
    ORIGINAL lines — so money/subscription/capacity accounting is UNCHANGED, only physical items become per-piece):
    bookOrder.service 3 branches (sub/pay-per-item/wallet), intake-user staff createBookOrder, recovery.service
    createRecoveryOrder. generateAllTags already tags per index → now tags per PIECE (TAG-01..0N unique per piece,
    no change needed). Verified 5 shirts+3 trousers → 8 qty1 pieces.
  - **Why creation not booking-checks:** capacity/monthlyLimits/`remainingItems-=post.items.length` all count LINES;
    exploding those would wrongly balloon subscription/capacity — client scoped per-piece to STATIONS+HANDOFFS +
    tagging, said pricing is separate. So explode STORED items only.
  - **Handoff readable payloads (name+count+summary):** handoff.service helpers `itemBrief`/`briefsForIds`/`summarize`.
    All 4 endpoints now return per-piece `items:[{itemId,tagId,name,quantity}]` + a grouped `summary` string
    ("5 Shirts, 3 Trousers"): push, confirm (accepted[]+rejected[]+summary), pendingQueue (per entry), split-state
    (per station + per pending handoff). `itemId` kept for push/confirm inputs; counts are now per PIECE. Swagger:
    new `HandoffItem` schema + Handoff/PendingHandoff/OrderSplitState updated; spec builds.
  - **Bundle = Set (Phase 2, already built);** partial-piece selection already works (booking records each selected
    piece as its own line). Set pieces arrive as separate qty1 lines → naturally per-piece.
  - **STILL TODO:** re-run handoffStaging.js against DB via the REAL booking path (explosion is in the service, so a
    harness that creates orders directly via the model stays line-based — must book through postBookOrder to see
    per-piece). Then commit. All A–E + Order-Ready + per-piece + handoff-readable are UNCOMMITTED on modular-branch.
- **2026-08-29 — handoffStaging.js UPDATED for per-piece (syntax-verified, NOT run).** Added `bookReal(items)` (books
  through the REAL `BookOrderService.createOrder`→postBookOrder so explosion runs; self-skips if AdminOrderDetails/
  AdminSetting unseeded) + scenario 13 (qty 3+2 → asserts 5 qty1 piece records, 3 shirt+2 trouser, all at S1) +
  scenario 14 (tags all pieces, whole S1→S2 push → asserts push/confirm/split-state return 5 readable items +
  summary "3 Shirts, 2 Trousers"). Cleanup now also removes the CRM profile the real booking creates. Existing 1–11
  matrix unchanged (still uses direct model create — fine for engine mechanics). RUN: `STAGING_OK=1 node handoffStaging.js`
  against a staging DB. Harness now self-seeds AdminSetting/AdminOrderDetails (create-only) if missing.
- **2026-08-29 — handoffStaging.js RAN GREEN against testing_db: 29 passed, 0 failed.** Per-piece explosion via the
  REAL postBookOrder path verified (qty 3+2 → 5 qty1 piece records, 3 shirt+2 trouser, all S1) + readable handoff
  payloads (push/confirm/split-state return 5 items + summary "3 Shirts, 2 Trousers"). One fix during the run:
  `summarize` now capitalises the item name (types stored lower-case) so the summary matches the client's format.
  Cleanup removed all throwaway data (settings singletons left, as the app seeds them anyway).
  **ALL WORK (A–E + Order-Ready + per-piece + handoff-readable) IS NOW DB-VERIFIED + LOAD-VERIFIED, ready to commit.**

## Session: 2026-08-25 (cont.) — Refactor Tier 2: extracted the FLOWS; router now 561 lines (verified 11/11)

Continued the split (user said continue; FE hasn't started so it's a safe window). Same mechanism —
prototype mixins, verbatim moves, no logic change. `botOrchestrator.service.js`: **2455 → 561 lines
(−77%)**. The whole orchestrator is now a lean ROUTER (turn engine only: handleCustomerMessage,
_runSingle, runWorkflow dispatch, _applyLoopGuard, _maybeStyle, _crmFrameToIntent, _updateMemory,
_resolveAddressRef, handoff, say, allowedIntents) + 10 focused modules under `services/bot/`:
- **format.js** (25) — shared `naira` + `STAGE_EXPLAIN`.
- **parsers.js** (376), **copy.js** (59), **quickActions.js** (48) — Tier 1 (stateless).
- **readAnswers.js** (347) — Phase-B reads: orderStatusReply, walletBalance, viewOffers, referralInfo,
  _readinessAndDispatchLine, pricingReply, turnaroundReply, serviceInfoReply, policyReply,
  paymentStatusReply, rewardStatusReply.
- **payment.flow.js** (305) — _bookingPaymentStep, _bookingCreditOptinStep, _settleWalletCharge,
  _walletPaidReply, _walletAvailable, applyPaymentFlow.
- **booking.flow.js** (367) — bookingFlow, _placeBooking, _createOrderSafe, _subFallbackLead.
- **complaint.flow.js** (179), **feedback.flow.js** (103), **details.flow.js** (195 — applyReferralCode,
  updateDetails, _startPhoneOtp).
- **Wiring:** one `Object.assign(BotOrchestratorService.prototype, …require each module…)` before
  `module.exports = new BotOrchestratorService()`. Cross-module `this.*` calls (e.g. bookingFlow →
  this._bookingPaymentStep in payment.flow; feedbackFlow → this.complaintFlow; every flow → parsers/copy)
  all resolve on the shared prototype, unchanged.
- **Import hygiene:** the router's top imports were pruned to only what the turn engine touches
  (ConversationService, BotIntentService, BotContextService, createNotification, emitChatMessage,
  {BOT_INTENT,CHAT_SENDER,NOTIFICATION_TYPE,ORDER_STATUS}, MAIN_QUICK_ACTIONS); ~30 now-unused
  model/service/util/constant imports moved into the modules that use them. `naira` import dropped from
  the router (unused there now).
- **Verified:** `node -c` clean on all 11 files; a load + full-surface resolve check (40/40 methods
  resolve on the instance across every module); and the FULL `botStaging.js` end-to-end regression
  **11/11 green** (with `--credit`, so 2 wallet tx). Behaviour identical.
- **STATUS:** Tier 1 + Tier 2 both UNCOMMITTED local work (done after the merge to main). Behaviour-
  identical; the staging harness is the regression gate. Commit when ready. The refactor is COMPLETE —
  no Tier 3 planned (the router is already just the turn engine).

## Session: 2026-08-25 — Refactor Tier 1: extracted stateless helpers from botOrchestrator (verified)

`botOrchestrator.service.js` was a 2455-line god-class. Started splitting it (user request) WITHOUT
behaviour change, using the safest mechanism: **prototype mixins** (physically move method bodies into
`services/bot/*.js`, `Object.assign` them onto the prototype at the bottom of the router) — so every
existing `this.foo()` call site works UNCHANGED; only each moved method's external refs (constants/
util) get imported in its new file. Result: **2455 → 2014 lines (−441, ~18%)**, 3 new leaf modules.
- **`services/bot/parsers.js`** — all stateless parsing/matching/estimate helpers: `isAffirmative`,
  `isNegative`, `_isCancel`, `_parsePaymentChoice`, `_parseRating`, `_parseDeliverySpeed`,
  `_parseItemsFromText`, `_wordToNumber`, `_parseDateTimeFromText`, `_resolvePickupDate`,
  `_matchServiceType`, `_defaultPickupWindow`, `_matchComplaintType`, `_pickComplaintType`,
  `_extractItemName`, `_resolveBookingItems`, `_bookingEstimate`, `_speedCharge`, `_availableSpeeds`,
  `_speedOfferText`, `_describeSpeed`, `_complaintSummary`, `extractCode`, `parseDetail`,
  `cleanDetailValue`. (Imports `roundToNearestHundred`/`calculateDueDate`/`DELIVERY_SPEED`; local `naira`
  dup for two formatters. Internal cross-calls like `_parseItemsFromText→this._wordToNumber`,
  `_bookingEstimate→this._speedCharge` survive on the prototype.)
- **`services/bot/copy.js`** — canned LLM-free text: `bookingGuide`, `feedbackAck`, `capabilities`,
  `menu`, `aboutBot`, `cantUnderstand` (menu/aboutBot/cantUnderstand keep `this.capabilities()`).
- **`services/bot/quickActions.js`** — chip constants `MAIN_QUICK_ACTIONS`/`YES_NO_ACTIONS` +
  `_quickActionsForTurn`; exports `{ MAIN_QUICK_ACTIONS, YES_NO_ACTIONS, mixin }`; router imports
  `MAIN_QUICK_ACTIONS` (still returned directly in 2 places) and Object.assigns `.mixin`.
  `READ_ONLY_INFO`/`INTENT_ICON` (batching) intentionally LEFT in the router.
- **Wiring:** near the bottom, `Object.assign(BotOrchestratorService.prototype, require('./bot/parsers'),
  require('./bot/copy'), require('./bot/quickActions').mixin)` then `module.exports = new ...`.
- **Verified:** `node -c` clean on all files; a load + spot-call harness (isolated method behaviour) 13/13
  then 7/7 then 7/7; and the FULL `botStaging.js` end-to-end regression run **11/11 green TWICE** (after
  parsers+copy, and after quickActions) — booking/wallet/card/apply-payment/complaint/feedback/OTP all
  unchanged. Pure structural move, no logic edits.
- **NOTE — NOT on `main` yet:** this refactor was done AFTER the merge, so it's uncommitted local work on
  the current branch. Commit when ready (behaviour-identical; the staging harness is the regression gate).
- **Tier 2 (NOT done, was my recommendation to reassess):** extracting the multi-turn FLOWS (`bookingFlow`,
  `applyPaymentFlow`/payment step, `complaintFlow`, `feedbackFlow`, `updateDetails`, + the Phase-B read
  answers) into `services/bot/*.flow.js` mixins. Bigger + more `this`-coupled (share `say`/`handoff`/
  `_settleWalletCharge`/`_walletAvailable`), but the mixin mechanism just proved safe. Router would drop to
  ~500–700 lines. Left for a follow-up decision.

## Session: 2026-08-24 (cont.) — MERGED TO main; next gate is FE integration

User pushed to GitHub and merged the bot V1/V1.1 work (all Phases A–D + V1.1 + the 3 staging-run
fixes) to `main`. So the whole bot upgrade is now SHIPPED to main — earlier "UNCOMMITTED" notes are
historical. Plan going forward (user's call): the FRONTEND team builds the two FE tasks
(quickActions chips renderer + complaint photo upload → attachments[]), THEN the team push-and-tests
the live bot with REAL production data end-to-end from the app (integration/soft rollout), rather
than any further backend staging. `botStaging.js` remains in the repo as the reusable write-path
harness. Open de-riskers I flagged but that are now deferred to that real-data test: verify real
prod `serviceType.pricePerPiece` isn't left at the misleading 700 default; exercise a real card
webhook completion + a subscriber "covered by plan" booking; watch LLM classification variance
across real conversations.

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
