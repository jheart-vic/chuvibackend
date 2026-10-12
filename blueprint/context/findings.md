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

### F-47 [P3] open - A first plan charge always creates a new subscription document, so a re-subscriber can hold two (pre-existing; deferred to launch item 9)

**File:** util/webhook.handler.js (`handleNormalSubscription` lookup filter)
**Found:** 2026-10-12 by /audit independent (round 8, Remaining risk)
**Why it matters:** The lookup filters on a `user` field that is not in the subscription schema, so with Mongoose 8 (`strictQuery` false) it never matches and every first charge creates a new document. A customer who re-subscribes after a failed renewal can end up with two, and `subscription.create` may attach the new Paystack code to the old one, after which a renewal is reported as unapplied (F-46 now catches that).
**Suggested fix:** Look up by `userId`, and decide the re-subscribe rules with the subscription rollover work (launch item 9), which rebuilds this area.
**Resolution:**

### F-50 [P2] fixed - Two quick phone-step calls send the welcome SMS twice

**File:** services/crm.service.js:689 (with services/user.service.js:555-570)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality, security)
**Why it matters:** The once-only rule is check-then-send: `CrmMessageLogModel.exists(...)` runs, then `sendSms`, and the log row is written only after the SMS returns. `completeProfile` is also check-then-set: it reads `user.phoneNumber`, then runs an unconditional `findByIdAndUpdate`. A double-tap (or a client retry) on the Google/Apple phone step gets past both checks, fires `crmOnProfileCompleted` twice, and both calls see no logged SMS. An offline stubbed probe calling `sendRegistrationWelcome` twice at once sent 2 SMS and wrote 2 logs. If the two requests carry different numbers, each number gets a welcome and the second number overwrites the first. The spec says "a logged success is never resent". When the CRM profile is missing, nothing is logged at all (also confirmed by the probe), but `completeProfile` already refuses a second call once the phone is set, so only the race path reaches that case.
**Suggested fix:** Make the phone step atomic: `findOneAndUpdate({ _id: userId, phoneNumber: { $in: [null, ''] } }, ...)`, and fire the hook only when a document came back (otherwise return "Profile already completed"). That closes both the duplicate SMS and the number overwrite. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. `completeProfile` sets the phone with `findOneAndUpdate({ _id, phoneNumber: { $in: [null, ''] } })` and fires the welcome hook only when that update matched; otherwise it answers "Profile already completed". welcomeStaging: two parallel phone steps with different numbers → one saved, one refused, one SMS to the kept number.

### F-51 [P2] fixed - The welcome can name the day after the offer really ends

**File:** services/crm.service.js:669
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `{{offerEndDay}}` is the Lagos calendar day of the raw `expiresAt`. The offer expires `customerWindowDays × 24h` after sign-up, so anyone who signs up between 00:00 and the morning window's end (08:00) gets an expiry early in the morning. `offerEndSchedule` (util/crmSendWindow.js:131) treats that as "the offer ends the day before" and sends "today is the last day" the previous evening. The welcome still says "by Thursday 15 October" for an offer that ends at 01:00 Thursday (probe output). A customer who books on Thursday morning finds the free pickup gone, and the welcome contradicts messages 2 and 3, which arrive one day earlier.
**Suggested fix:** Use the same rule as `offerEndSchedule`. When the expiry's hour is before `sendWindows.morningEndHour`, print the previous day. Or print the last full day before the expiry instant. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. New `welcomeOfferEndDay` uses `offerEndSchedule(...).shifted` (the messages 2/3 rule): an offer ending before the morning window closes names the day before. briefCheck (01:00 Thursday → Wednesday; 15:00 Thursday → Thursday) and welcomeStaging ("by Wednesday 14 October").

### F-52 [P2] fixed - Offer-end steps ignore delayMinutes, but the stagger rule and Swagger say it counts

**File:** services/crm.service.js:140 (also routes/crm.js:904, swagger/schemas.js:457)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `startRegisteredNotBookedWorkflow` (crm.service.js:460-474) places an `offer-end` step only by its slot: `morning` goes to `offerPair.third`, anything else to `offerPair.second`. It never reads `delayMinutes`. The new clash key uses `offer-end|delayMinutes|preferSlot`, so two steps that will fire at the same instant still pass validation: `any` + `evening` at minute 0, or two `evening` steps at minutes 0 and 60 (both confirmed with a probe). Swagger tells the frontend that `delayMinutes` is "Minutes … after the offer's end (offer-end)". An admin who moves message 2 to 120 gets a successful save and no change in behaviour, which is the "save reports success but does nothing" problem this fix set out to remove.
**Suggested fix:** For `offer-end` steps, key the clash on the window the step will actually use (`morning`, or `evening` for evening and any), ignoring `delayMinutes`. Say in Swagger (and in the CrmScheduleStep description) that `delayMinutes` is ignored for `offer-end` steps. Or refuse a non-zero `delayMinutes` on them. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. An offer-end step with a non-zero delayMinutes is refused, and offer-end steps clash on the window they actually use (morning, or evening for evening/any), with their own error text. Swagger (PUT /crm/settings, CrmScheduleStep) says delayMinutes must be 0 for offer-end steps. briefCheck covers both.

### F-53 [P3] fixed - The registered-not-booked sequence now waits for the welcome SMS's network call

**File:** services/crm.service.js:625
**Found:** 2026-10-12 by /audit independent (scope: current; lens: performance)
**Why it matters:** `handleUserRegistered` awaits `sendRegistrationWelcome`, which awaits `sendSms` (an axios POST to Termii with no timeout set), before it calls `startRegisteredNotBookedWorkflow`. Errors are caught. But a provider that accepts the connection and never answers holds the hook until the OS socket timeout, and the customer's follow-up sequence is not queued for that whole time. If the process restarts in that window, the sequence is never queued at all. Sign-up itself is unaffected, because the hook is fire-and-forget.
**Suggested fix:** Start the registered-not-booked sequence before the welcome, or don't await the SMS part (fire it with its own catch). Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. `handleUserRegistered` queues the registered-not-booked sequence first and sends the welcome after it, so a slow SMS provider never delays the queueing.

