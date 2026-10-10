# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-05 [P2] open - Any logged-in user can report a delivery problem on any order, which now also moves its stage

**File:** routes/utils.js:266
**Found:** 2026-10-10 by /audit independent (scope: current; lens: security)
**Why it matters:** `PATCH /api/order/:id/report-issue` is guarded only by `auth`, and
neither `UtilController.reportDeliveryIssue` nor `UtilService.reportDeliveryIssue`
(services/util.service.js:129) checks role or ownership. A customer token and an order ID
are enough. Before this delta that already let any user mark another order's delivery leg
`failed`. Since 5381255/09ec587, the `delivery_problem` branch (services/util.service.js:182-207)
also moves an out-for-delivery order back to `ready`, so the same call now puts a
mid-run order back in the delivery queue and changes what the customer, the bot and the
dashboards see. The gap predates this work and the new stage change matches the failed
leg it accompanies, so the extra harm is limited. Order IDs are ObjectIds, so this needs
a known ID. It is P2, not a blocker.
**Suggested fix:** As its own `/fix`, restrict the route to staff roles (for example
`multiAuth` with rider, intake-and-tag, customer-experience and admin, after confirming
which apps call it). Nothing current is lost unless a customer-facing app uses this route.
Confirm that first.
**Resolution:**

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
