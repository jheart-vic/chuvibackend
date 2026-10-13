# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-06 [P3] open - The failed-delivery checks in briefCheck only match source text

**File:** briefCheck.js:2055
**Found:** 2026-10-10 by /audit independent (scope: current; lens: tests)
**Why it matters:** The four "failed delivery goes back to the delivery queue" assertions
check the source with regexes (e.g. `order.stage.status = ORDER_STATUS.READY` within 400
characters of `await order.save()`). A refactor that keeps the behaviour breaks them, and
a behaviour change that keeps the text passes them. The only behavioural cover for the
rider path, the `delivery_problem` path and the backfill is dispatchStaging.js scenarios
11-13, which need a testing database and are not part of any offline gate. The verdict
assertions, by contrast, drive the real `_cancellationVerdict`.
**Suggested fix:** None needed for this fix. When `/tests` adds a runner, cover
`markOrderDeliveryAsFailed` and the `delivery_problem` branch with a stubbed model.
Nothing current is lost.
**Resolution:**

### F-08 [P3] open - The new access checks in briefCheck only match source text, and the section headers above them are misplaced

**File:** briefCheck.js:2047
**Found:** 2026-10-10 by /audit independent (scope: current; lens: tests)
**Why it matters:** The three "Access" assertions (briefCheck.js:2053-2071) regex-match
the route line and service source, like F-06. A reordered `multiAuth` argument list
fails them; a logic change that keeps the text passes. The behavioural cover is
dispatchStaging.js scenario 15, which needs a testing database and is outside any offline
gate. Separately, the orphaned "FE 9 Oct" and "Dead subscription crons removed" headers
at lines 2047-2051 now sit above the Access block instead of their own sections.
**Suggested fix:** Move the two headers to their sections. When `/tests` adds a runner,
drive `reportDeliveryIssue` and `getBookOrder` with stubbed models. Nothing current is lost.
**Resolution:** Partly fixed 2026-10-11: the "FE 9 Oct" and "Dead subscription crons removed" headers now sit above their own sections. The source-text-only access checks stay as they are until a test runner exists (same as F-06).

### F-47 [P3] fixed - A first plan charge always creates a new subscription document, so a re-subscriber can hold two (pre-existing; deferred to launch item 9)

**File:** util/webhook.handler.js (`handleNormalSubscription` lookup filter)
**Found:** 2026-10-12 by /audit independent (round 8, Remaining risk)
**Why it matters:** The lookup filters on a `user` field that is not in the subscription schema, so with Mongoose 8 (`strictQuery` false) it never matches and every first charge creates a new document. A customer who re-subscribes after a failed renewal can end up with two, and `subscription.create` may attach the new Paystack code to the old one, after which a renewal is reported as unapplied (F-46 now catches that).
**Suggested fix:** Look up by `userId`, and decide the re-subscribe rules with the subscription rollover work (launch item 9), which rebuilds this area.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). The first-charge lookup in `handleNormalSubscription` filters on `userId` (the schema field) instead of the non-existent `user`, and the model's index uses `userId` too, so a re-subscriber with the same plan and card reuses their document instead of getting a second one. The wider re-subscribe rules stay with launch item 9. In briefCheck.

### F-19 [P2] fixed - The staff counter booking still spreads the request body over the order (pre-existing)

**File:** services/intake-user.service.js:339
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** Pre-existing, with the same pattern this hotfix removed.
`IntakeUserService.createBookOrder` builds `{ oscNumber, amount: totalPrice,
paymentStatus: PENDING, intakeStaffId, channel: OFFICE, stage, ..., ...post }`. The
intake staff member's body can override `amount`, `intakeStaffId`, `stage`, `channel`,
`userId`, `pricing`, and so on. Settlement later restamps `paymentStatus`, but `amount`
and attribution stay as the body set them. Only intake staff and admins can reach this
route (`intakeUserAuth`), so it is not exposed to customers. It still undermines the
counter audit trail that FE-CHANGELOG-2026-10-08 tightened.
**Suggested fix:** Reuse the same allow-list approach (`customerOrderFields`, or an
intake-specific list) in place of `...post`. Nothing current is lost.
**Resolution:**
Already fixed in the code (found 2026-10-13 while checking the ledger): `IntakeUserService.createBookOrder` builds the order from the `STAFF_ORDER_FIELDS` allow-list (services/intake-user.service.js ~351) and deletes the payment instructions first; `...post` is no longer spread over the order. counterPaymentStaging covers the counter path.

### F-28 [P2] fixed - Parallel plan bookings can each pass the items-left check (lost update)

**File:** services/bookOrder.service.js:1767
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** The subscription is read at line 1610, checked at 1686, and written at
1767 as an absolute `remainingItems = planItemsLeft - planPieces`, with several awaits in
between (heavy-item lookups, `newOrder.save()`). Two or more requests sent at the same time
for a plan with 28 left can each read 28, each book 28 pieces, and each write 0. A
deliberate customer could get several months' allowance covered in one burst. The
`/api` rate limiter narrows it but does not stop it. Not reachable by an honest single
booking.
**Suggested fix:** Deduct atomically and treat no match as the limit refusal:
`SubscriptionModel.findOneAndUpdate({ _id, remainingItems: { $gte: planPieces } }, { $inc: { remainingItems: -planPieces } })`
before saving the order (and `$inc` back on rollback). Nothing current is lost.
**Resolution:**
Already fixed in the code (found 2026-10-13 while checking the ledger): the plan deduct is atomic — `SubscriptionModel.updateOne({ _id, remainingItems: { $gte: planPieces } }, { $inc: { remainingItems: -planPieces } })` before the order is saved, a loser creates nothing, and `returnPlanItems` gives the items back on rollback (services/bookOrder.service.js ~1941-1955).

### F-75 [P3] fixed - A non-string referral code on the phone step is silently ignored instead of refused

**File:** services/user.service.js:575
**Found:** 2026-10-13 by /audit independent (scope: current; lens: quality)
**Why it matters:** `completeProfile` treats any non-string `referralCode` (an array such as
`["CHUVIADA7K2"]`, or an object) as "no code": the phone is saved, the welcome SMS goes, and no
referral is linked, with a 200. The user decision for this step is that a code is never silently
dropped. The real app sends a string, so this only bites a malformed client (offline probe with
stubbed models confirmed it). Harmless for security: the value never reaches a query.
**Suggested fix:** Refuse a present-but-non-string `referralCode` with the same 400 message
(`referralCode != null && referralCode !== '' && typeof referralCode !== 'string'`), before the
update. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). `completeProfile` refuses a present-but-non-string `referralCode` with the same 400 message, before anything is saved. In briefCheck.

### F-82 [P3] fixed - Beside a weekday, a bare day-of-month followed by a word outside the short time list ("saturday 24 10am", "saturday 24 noon") still resolves to the coming weekday

**File:** services/bot/parsers.js:398 (the bare 13–31 lookahead allows only end, punctuation or by/at/around/about/in/from/or/and/morning/afternoon/evening/please/pls)
**Found:** 2026-10-13 by /audit independent round 11 (scope: current; lens: quality)
**Why it matters:** Frozen clock Tue 13 Oct, rules-only parse on the day question: "saturday 24 10am", "saturday 24 9:30am", "saturday 24 noon", "saturday 24 between 9 and 11", "saturday 24 anytime", "saturday 24 thanks", "saturday 24 latest 10", "saturday 24 if possible", "saturday 24 2026" and "saturday 2026-10-24" all resolve to Sat 17 Oct (meant: Sat 24). "saturday 24 10am" is an ordinary answer. Stubbed bookingFlow: the summary reads "Pickup: … Saturday 17 October 10am … Standard — ready Wednesday 21 October", so the week-early date is plain before "yes". With an LLM, `pickupDate` is usually just "Saturday 24" (the time goes to `pickupTime`), which resolves correctly. b6bdb30 gave Sat 17 for all of these, so this item did not introduce or worsen it; it is the residue of F-78, now visible at confirm. P3.
**Suggested fix:** Also allow a clock time (`\d{1,2}(?::\d{2})?\s*[ap]\.?m`), "noon"/"midday", "between", "latest", "anytime" and a 4-digit year after the bare number, or invert the guard: read the bare 13–31 unless it is followed by an address or count word (the existing NOT_A_DAY list plus a capitalised or alphabetic street name). Add "saturday 24 10am" to the F-78 briefCheck check. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). Beside a weekday a bare 13–31 also counts as the day when a clock time, "noon"/"midday", "between", "latest", "anytime" or a year follows: "saturday 24 10am", "saturday 24 noon", "saturday 24 between 9 and 11" → Sat 24 (frozen-clock probe, 21 phrases, 0 wrong). In briefCheck (clock-independent).

### F-83 [P3] fixed - Off the day question, "saturday 24, Allen Avenue" reads the house number as the pickup date when it falls on that weekday; a count after a comma or "and" forces a re-ask

**File:** services/bot/parsers.js:398 (`[,.!?;]` and `and`/`or` are accepted after the bare number), reached from services/bot/booking.flow.js:78-79 on any step when the LLM leaves `pickupDate` empty
**Found:** 2026-10-13 by /audit independent round 11 (scope: current; lens: quality)
**Why it matters:** Nigerian addresses are often written "24, Allen Avenue". Frozen clock Tue 13 Oct, rules-only parse off the day question: "saturday 24, allen avenue ikeja" → Sat 24 Oct (meant: Sat 17, the 24 is the house number). Stubbed bookingFlow: `bDay` Sat 24 Oct and the summary reads "Saturday 24 October". This only happens when the house number is a date that falls on the named weekday within the next month (about 1 in 7), when the weekday and the address share a message, and when there is no LLM `pickupDate` slot. The summary shows the date plainly. "saturday 20, 5 trousers", "saturday 20 and 5 trousers" and "saturday 13 or 14 shirts" read the number as a day that disagrees, so the day is asked again (the safe direction). New in this round: before f30c3d3 no bare number was read beside a weekday (code inspection of 01fdf64 parsers.js), so this gave Sat 17. P3.
**Suggested fix:** Off the day question (`written` false), accept the bare number only when it is followed by the end of the text or a time word, not by a comma followed by more words; or pass `{ bare: written }` like the `slash` option, so the bare reading is used on the day question only. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). Off the day question a comma after the bare number counts only when a time follows it: "saturday 24, allen avenue ikeja" keeps the coming Saturday (house number), "saturday 24, 9am" reads the 24th. On the day question punctuation still counts. In briefCheck.

### F-84 [P3] fixed - The re-ask for a disagreeing weekday and bare day echoes the weekday twice ("saturday saturday 14")

**File:** services/bot/parsers.js:398 (the bare alternative's match text includes the weekday) and 202 (`datePhrase = \`${datePhrase} ${w.text}\``); shown by services/bot/booking.flow.js:249
**Found:** 2026-10-13 by /audit independent round 11 (scope: current; lens: quality)
**Why it matters:** Stubbed bookingFlow, Tue 13 Oct, "saturday 14" (the 14th is a Wednesday): the safe re-ask reads `I couldn't pin down the day from "saturday saturday 14"`. The stored `bDatePhrase` is also "saturday saturday 24" for a good answer, but that is no longer shown in the summary. Cosmetic, new in this round.
**Suggested fix:** Capture only the number in the bare alternative's returned `text` (for example `text: m[2] ?? m[0]`), or skip the weekday prefix when `w.text` already starts with it. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). The bare-day match returns only the number as the written date, so the phrase reads "saturday 24", never "saturday saturday 24". In briefCheck.

### F-89 [P3] fixed - The Quick Booking re-pick applies the windows-full quote rule to an ordinary Urgent order using TODAY's windows, so it can rank a free-pickup offer the charge then ignores

**File:** services/offer.service.js:492-499, reached from services/bookOrder.service.js:951-962 (`pickBestPersonalOffer` → `getBookingOptions` with `repriceOrderId`)
**Found:** 2026-10-13 by /audit independent round 2 (scope: current; lens: quality)
**Why it matters:** The new block in `getBookingOptions` runs on every call, including the Intake re-price of a Quick Booking. For an order whose pickup is a plain Urgent pickup (booked while a window was open, so `windowsFull` is not stamped and `offerPickupTiming` passes `anytime`), the draft carries no `pickupDate`, so `pickupWindowsFullOn(undefined)` tests the windows of the day and time Intake counts. If every still-bookable window is full at that moment, the draft is switched to WINDOW with `pickupAmount` = window fee, so `_bestByBillValue` values a free-pickup personal offer at the window fee. `_priceWithOffers` then prices the real order with its stored `anytime` timing (bookOrder.service.js:842), where free pickup is `anytimeKeptPickup` and waives nothing. A free-pickup offer can therefore beat a discount offer that would have taken money off, and the customer is billed more. Needs all of: a Quick Booking, a plain Urgent pickup, a count made while that day's remaining windows are full, and two applicable personal offers (and not a first order, where First Experience wins). Narrow, so P3. Code path traced; not run.
**Suggested fix:** Skip the block when `repriceOrderId` is set (the order's stamped leg already decides via `offerPickupTiming`), or pass the order's own `scheduling.pickup.date` and only apply it at booking time. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). The booking-options full-windows rule is skipped when `repriceOrderId` is set: an Intake re-price already prices the order's own stamped pickup through `offerPickupTiming`, so today's windows can no longer change which offer is picked. In briefCheck.

### F-55 [P3] fixed - `preferSlot` now saves on the lead, post-delivery and reactivation schedules, but those workflows ignore it

**File:** services/crm.service.js:140-144 (ignored at services/crm.service.js:420-426 and 575-581)
**Found:** 2026-10-12 by /audit independent round 3 (scope: current; lens: quality)
**Why it matters:** Before this delta `normalizeSchedule` dropped `preferSlot`; it now validates and persists it on every schedule. Only `startRegisteredNotBookedWorkflow` passes it on to `scheduleMessages`. `startLeadWorkflow` and `startReactivationWorkflow` build entries without it, so the window snap always uses `any`, and post-delivery is not windowed at all. A `leadSchedule` step saved with `preferSlot: morning` returns success and changes nothing (stubbed probe: accepted, saved). The shared `CrmScheduleStep` Swagger schema describes `preferSlot` as "Which daily send window the step prefers" for every schedule. Same class as F-54 but milder: admin-only, and the frontend is told to send the value back unchanged rather than edit it.
**Suggested fix:** Either pass `preferSlot: s.preferSlot` into the lead and reactivation entries (scheduleMessages already honours it), or refuse a non-`any` preferSlot outside `registeredNotBookedSchedule` and say so in the CrmScheduleStep description. Nothing current is lost.
**Decision (user, 2026-10-12):** make the workflows HONOUR the window. Build it as its own follow-up `/fix` after launch item 6 lands:
- Lead and reactivation pass each step's `preferSlot` into their scheduled entries (`scheduleMessages` already honours it), so "morning" means the next morning window.
- Post-delivery messages are order messages, which the client exempted from the send windows ("order and payment messages still go immediately"). So that schedule refuses a non-`any` window with a clear message instead of pretending.
- Docs: the CrmScheduleStep description says which workflows use `preferSlot`.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). Built as decided (user, 2026-10-12): `startLeadWorkflow` and `startReactivationWorkflow` pass each step's `preferSlot` to `scheduleMessages`, which snaps it to that window ("morning" = the next 6–8 AM). `normalizeSchedule` refuses a non-`any` window on `postDeliverySchedule` with a clear message (order messages go out straight away). The `CrmScheduleStep` Swagger description says which schedules use it. In briefCheck.
