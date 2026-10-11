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

### F-07 [P3] open - The getBookOrder comment and the spec say the intake route shares this handler; it does not

**File:** services/bookOrder.service.js:2345
**Found:** 2026-10-10 by /audit independent (scope: current; lens: quality)
**Why it matters:** The new comment says staff reads go through this handler because "this
handler is also mounted on the intake routes", and the spec says the same about
routes/intake-user.js:481. That route actually calls `IntakeUserController.getBookOrder`,
which uses `IntakeUserService.getBookOrder` (services/intake-user.service.js:563), a
separate handler behind `intakeUserAuth`. Behaviour is unaffected: staff of every role
still read any order through `/bookOrder/book-order/:id`, and the intake route was never
open to customers. The wrong comment could mislead the next change to either handler.
**Suggested fix:** Reword the comment to say staff apps read any order through this route,
and drop the intake-route claim. Nothing current is lost.
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
**Resolution:**

### F-16 [P3] open - The window-only fees line says "Choose a time window" when a window cannot help

**File:** services/offer.service.js:694
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** The window-only message always ends "Choose a time window to save ₦X".
On a same-day order with no morning window, `resolvePickupTiming` forces the pickup to
Anytime even when the customer picked a window, so the customer sees advice they cannot
follow. The amount is also the client-sent `draft.pickupAmount` (usually the window
fee), not the Anytime fee the order charges. Separately, `computeBenefits` flags
`anytimeKeptPickup`/`anytimeKeptDelivery` from the timing alone, so a draft that sends an
Anytime timing for a leg it does not book (`isPickUp` or `isDelivery` false) gets
"... save ₦0." The bill is right in every case. Only the line's wording or amount is off.
**Suggested fix:** Skip the window-only row (or give it same-day wording) when the leg was
forced to Anytime by the same-day rule. Ignore a leg whose amount is 0 or that is not
booked. Nothing current is lost.
**Resolution:**
