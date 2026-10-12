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
### F-19 [P2] open - The staff counter booking still spreads the request body over the order (pre-existing)

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

### F-28 [P2] open - Parallel plan bookings can each pass the items-left check (lost update)

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
