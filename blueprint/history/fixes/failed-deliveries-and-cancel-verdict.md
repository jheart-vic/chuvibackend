# Fix: Failed deliveries and the cancel verdict

**Type:** Fix
**Status:** verified
**Branch:** `fix/failed-deliveries-and-cancel-verdict`

Two small backend fixes from the frontend's 9 Oct "still open" list, built together.

## The problem

### A. A failed delivery disappears from the delivery queue

- The delivery dispatch queue (`getDeliverableOrders`) lists orders whose stage is
  `ready` (`services/intake-user.service.js:1680`).
- A rider can only fail a delivery that is out for delivery. `markOrderDeliveryAsFailed`
  (`services/rider.service.js:265`) sets `dispatchDetails.delivery.status = failed`
  but leaves the order's stage at `out-for-delivery`.
- Result:
  - The delivery queue's `failedCount` is always 0, and `legStatus=failed` always
    comes back empty.
  - The office cannot find the order to reassign it, and even after reassignment
    it never shows in the queue again.
  - The bot tells the customer "a rider is out delivering your order now"
    (`services/bot/readAnswers.js:157`).
  - Admin "in delivery" counts include orders that are not moving.
- Pickups are correct. A failed pickup keeps its pre-pickup stage (`pending`), so it
  stays in the pickup queue. Deliveries should mirror that.

### B. The customer cancel button cannot know the backend's rule

- `_cancelTier` (`services/bookOrder.service.js:97`) refuses once any item has a
  tag, even while the order still sits in the tagging queue. The frontend's
  traffic light shows those orders as amber ("cancellable on request").
- No read endpoint returns the verdict. All four `_cancelTier` callers are write paths.

## The fix

### A. Return a failed delivery to the `ready` stage

- In `markOrderDeliveryAsFailed`, also set `stage.status = ready` and push a
  `stageHistory` entry (`Delivery failed: <note>`), in the same save as the
  `failed` leg status. The leg status, `failureNote`, notifications and audit log
  stay exactly as they are.
- **Backfill existing stuck orders.** Add an idempotent `backfillFailedDeliveryStage`
  step to `setupApp` in `config/setup.js`. It moves orders with stage
  `out-for-delivery` and leg status `failed` to `ready`, with the same history note.
  (Seeding is not migrating: without this, every failure recorded before the fix
  stays invisible.)
- No change to reassignment or `startDelivery`. Reassignment already resets the
  leg status to `ready` without a stage check, and `startDelivery` moves the stage
  back to `out-for-delivery`.
- Must not break:
  - the admin dashboard's `deliveryIssues` count and combined failed count (they
    read the leg status, not the stage)
  - the customer tracking status `delivery_failed` (reads the leg status first)
  - the dispatch tag gate in the delivery queue

### B. Expose the verdict on customer order reads

- Add `cancellationVerdict` (not `cancellation`, which is the stored record of a past
  cancellation) to each order returned by `GET /api/bookOrder/book-order-history` and
  `GET /api/bookOrder/book-order/:id`:

  ```json
  {
    "allowed": true,
    "canRequest": false,
    "tier": "green",
    "reason": null,
    "estimatedFee": 0,
    "refundToWallet": 5000
  }
  ```

  | Field | Meaning |
  |---|---|
  | `allowed` | The customer can self-cancel right now (`POST` cancel will succeed) |
  | `canRequest` | Self-cancel is refused, but a cancellation request is accepted (amber, no request already pending) |
  | `requestPending` | An amber order already has a request awaiting review |
  | `tier` | `green`, `amber`, `red` or `none` (already cancelled), straight from `_cancelTier` |
  | `reason` | The exact refusal text the write path returns, or `null` |
  | `estimatedFee` | Green: `0` (self-cancel is free). Amber: `cancellationOutcome().feeApplied`. Red or none: `null` |
  | `refundToWallet` | Same rule, from `cancellationOutcome`. **An estimate:** reward credits come back separately, so the cash figure can be lower when credits were used |

- One private helper, `_cancellationVerdict(order, settings)`, built only from
  `_cancelTier` and `cancellationOutcome`, so the button and the refusal share one
  rule. Settings are read once per request, not once per order.
- Swagger: add a `CancellationVerdict` schema in `swagger/schemas.js` and reference
  it from the two routes' order shapes.
- No new endpoint and no change to any write path.

## Build steps

1. [x] **Failed delivery returns to `ready`**: change `markOrderDeliveryAsFailed` and add
   the setup backfill step.
   **Done when:** a delivery marked failed shows in `GET` deliverable orders with
   `legStatus=failed`; `failedCount` counts it; a second boot changes nothing.
2. [x] **Cancellation verdict on order reads**: add the helper, wire both reads, add Swagger.
   **Done when:** each order in both responses carries `cancellationVerdict`; a tagged
   order in the tagging queue shows `allowed: false, canRequest: false, tier: red`; the
   envelope check reports 0 wrong envelopes.
3. [x] **Repair independent-review findings F-01, F-02, F-03.**
   - F-01: the verdict is attached as `cancellationVerdict`, so the stored
     `cancellation` record is returned unchanged.
   - F-02: the staff `delivery_problem` report also returns an out-for-delivery order
     to `ready`.
   - F-03: a pending cancellation request gives `canRequest: false, requestPending: true`.
   **Done when:** briefCheck and dispatchStaging scenarios 13 and 14 pass, and the
   Swagger envelope check reports 0 wrong envelopes.
4. [x] **Repair independent-review finding F-04.** A rider's failed delivery moves the
   stage to `ready` only when the order is `out-for-delivery`, so an order an admin
   cancelled mid-run stays cancelled.
   **Done when:** dispatchStaging scenario 11 asserts a cancelled order stays cancelled
   after a failed delivery, and briefCheck passes.

## Verify

- `node briefCheck.js` stays green. Add offline assertions for `_cancellationVerdict`
  across green, amber, red-by-tag and none.
- Extend `dispatchStaging.js` (testing DB) with:
  - a failed delivery that appears in the delivery queue with `failed: true`
  - a reassignment followed by a restarted delivery
- Boot on `PORT=7999` and confirm the backfill step logs no error and is a no-op
  on the second boot.
- Swagger envelope check from `AGENTS.md`: 0 wrong envelopes.

## Out of scope (recorded, not fixed)

- `GET /api/bookOrder/book-order/:id` has no ownership check, so any logged-in user can read
  any order by its ID. Fixing it needs a decision on which staff roles use this
  route. Raise it as its own `/fix`.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":6565,"specSha256":"74883976fabee53a8611c00c207b73534c625556174adb47d839b91b311eb22e","branch":"refs/heads/fix/failed-deliveries-and-cancel-verdict","head":"51de3961a22932ab511f2d975e9d51f71f195590","baseRef":"refs/heads/main","baseCommit":"ddbb3ba3876340b08ab571bdf8e8b8e8b4c633b0","sourceTree":"b243362d227ed7ccfb541e6f242112e33306800e","landing":"pull-request","absentOptional":[]} -->

## Findings

### failed-deliveries-and-cancel-verdict/F-01 [P1] closed - Cancel verdict overwrites the stored cancellation record on customer order reads

**File:** services/bookOrder.service.js:2298
**Found:** 2026-10-10 by /audit independent (scope: current; lens: quality, tests)
**Why it matters:** `BookOrder` already has a persisted `cancellation` subdocument
(models/bookOrder.model.js:709: `cancelledAt`, `reason`, `cancelledBy`, `tier`,
`cashRefunded`, `creditsReversed`, `feeApplied`), written by `_performCancellation`
(services/bookOrder.service.js:278). Both reads load the order with `.lean()` and then
assign `order.cancellation = this._cancellationVerdict(...)` (lines 2298 and 2335), which
replaces that record in the response. Since 5381255, `GET /api/bookOrder/book-order-history`
(customer and admin `scope=all`) and `GET /api/bookOrder/book-order/:id` no longer return
when an order was cancelled, why, or how much cash/credit was refunded and what fee was
kept. For a cancelled order the client now gets only `{ tier: "none", ... }`. The spec and
Swagger do not mention the name collision, so this is an unintended contract break.
The briefCheck assertion "both customer order reads attach the verdict" checks the source
text `.cancellation = this._cancellationVerdict(` and so locks the collision in. No test
covers keeping the stored record.
**Suggested fix:** Attach the verdict under a field the schema does not use (for example
`cancelVerdict` or `cancellationVerdict`). Update the spec field name, both route Swagger
blocks, the briefCheck source assertion, and the FE note to match. Add an offline assertion
that a cancelled order keeps its stored `cancellation.cashRefunded`. Nothing current is lost.
The field name the frontend was told is the only thing that changes, so confirm it with the
user before landing.
**Resolution:** fixed 2026-10-10 by /implement (spec step 3). Both reads now attach the
verdict as `cancellationVerdict`; spec and Swagger renamed to match (the user approved the
name by asking to finish). briefCheck asserts no read assigns `.cancellation`, and
dispatchStaging scenario 14 confirms a cancelled order keeps `cancellation.cashRefunded` on
both reads.
Closed 2026-10-10 by /audit independent (fresh subagent, target 09ec587): both reads
(services/bookOrder.service.js:2314 and :2357) assign only `cancellationVerdict`; nothing
writes `.cancellation` on a read; the stored record is left intact on the lean document.
Swagger (routes/bookOrder.js:648, :772) and the `CancellationVerdict` schema match.
briefCheck asserts both. No new defect introduced.

### failed-deliveries-and-cancel-verdict/F-02 [P2] closed - The staff "delivery_problem" report still leaves the order at out-for-delivery

**File:** services/util.service.js:177
**Found:** 2026-10-10 by /audit independent (scope: current; lens: quality)
**Why it matters:** `reportDeliveryIssue` with `issueType: delivery_problem`
(`PATCH` report-delivery-issues, any authenticated user) sets
`dispatchDetails.delivery.status = failed` and does not touch the stage. An order failed
this way while out for delivery ends up in the stuck state this fix exists to remove: it
is missing from the delivery queue and `failedCount`, and the bot says a rider is on the way.
It stays that way until the next server boot, when `backfillFailedDeliveryStage` quietly
moves it. The fix covers only the rider path (`markOrderDeliveryAsFailed`).
**Suggested fix:** In the `delivery_problem` branch, when `stage.status` is
`out-for-delivery`, set it to `ready` with the same `stageHistory` note in the same update.
Alternatively, record a user decision that this path is out of scope. Nothing current is lost.
**Resolution:** fixed 2026-10-10 by /implement (spec step 3). The `delivery_problem`
branch sets `stage.status = ready` with a `Delivery failed: <note>` history entry, in the
same update, when the order was out for delivery. dispatchStaging scenario 13 covers it.
Closed 2026-10-10 by /audit independent (fresh subagent, target 09ec587):
services/util.service.js:182-207 moves the stage only when it was `out-for-delivery`
(`wasOut`), in the same `findByIdAndUpdate` as the failed leg status. The stage check reads
the earlier `findById` rather than the update filter, a negligible race that does not reopen
this finding. The rider path's missing equivalent guard is tracked separately as F-04.

### failed-deliveries-and-cancel-verdict/F-03 [P2] closed - `canRequest` is true while a cancellation request is already pending

**File:** services/bookOrder.service.js:183
**Found:** 2026-10-10 by /audit independent (scope: current; lens: quality)
**Why it matters:** The verdict sets `canRequest = (tier === 'amber')`, but
`requestCancellation` (services/bookOrder.service.js:520) refuses an Amber order that
already has a `pending` request ("A cancellation request for this order is already
awaiting review."). After a customer submits a request, every read keeps offering
"request cancellation", and the POST fails. That is the button/refusal drift the spec set
out to prevent. The spec limits the helper to `_cancelTier` + `cancellationOutcome`, so this
gap is in the design, not only the implementation.
**Suggested fix:** In both reads, look up pending `CancellationRequest`s for the returned
order IDs with one `$in` query. Set `canRequest: false` and add `requestPending: true`
(with the refusal text as `reason`) when one exists. The other option is to record that the
frontend tracks pending requests itself. Nothing current is lost.
**Resolution:** fixed 2026-10-10 by /implement (spec step 3). The list read does one
`distinct` over the page's order IDs, and the single read does one `exists`. A pending
request gives `canRequest: false, requestPending: true` and the `requestCancellation`
refusal text. briefCheck and dispatchStaging scenario 14 cover it.
Closed 2026-10-10 by /audit independent (fresh subagent, target 09ec587):
`_cancellationVerdict` (services/bookOrder.service.js:180-208) gives `canRequest: false,
requestPending: true` and the exact `requestCancellation` refusal text (line 532) only for
amber with a pending request. The list read uses one `distinct` over the page IDs (line 2307)
and the single read one `exists` (line 2353), both served by the `{orderId, status}` partial
index on CancellationRequest. Green, red and none are unaffected. No new defect introduced.

### failed-deliveries-and-cancel-verdict/F-04 [P1] closed - A rider's failed delivery moves any order to READY, even a cancelled one

**File:** services/rider.service.js:331
**Found:** 2026-10-10 by /audit independent (scope: current; lens: quality)
**Why it matters:** `markOrderDeliveryAsFailed` now sets `stage.status = READY`
unconditionally. It only checks that the delivery LEG is `out-for-delivery` (line 297), not
the order's stage. The leg and the stage can diverge. `staffCancelOrder` lets an admin cancel
at any stage, including `out-for-delivery` (services/bookOrder.service.js:412-467). The
shared `_performCancellation` sets the stage to `cancelled` and refunds to the wallet, but it
resets only the pickup leg (lines 265-274), so the delivery leg stays `out-for-delivery` with
the rider still assigned. If the rider then reports the delivery failed, which is the natural
thing to do when told to bring the bag back, this code moves the cancelled and refunded order
back to `ready`. It reappears in the delivery queue and can be reassigned and delivered again.
Its customer verdict changes from `none` to `red`, and stage-based cancelled counts lose it.
The same applies to any stage an admin set by hand through `updateBookOrderStage` while the
leg was out. The two sibling changes in this delta guard on the stage: the staff
`delivery_problem` path (`wasOut`, services/util.service.js:182) and the backfill filter
(config/setup.js:439). The rider path is the one that does not. Not covered by briefCheck,
whose assertion is a source-text regex, or by the dispatchStaging scenarios.
**Suggested fix:** Move the stage only when `order.stage.status === ORDER_STATUS.OUT_FOR_DELIVERY`,
the same rule as `wasOut` and the backfill. The leg status, `failureNote`, notifications and
audit log stay as they are. Add a briefCheck or staging assertion that a cancelled order whose
leg is still out stays `cancelled` after a failed delivery. Nothing current is lost.
**Resolution:** fixed 2026-10-10 by /implement (spec step 4). The stage moves to READY
only when it is `out-for-delivery`, the same rule as `wasOut` and the backfill. The leg
status, `failureNote`, notifications and audit log are unchanged. dispatchStaging scenario 11
now cancels the order mid-run, fails the delivery, and asserts the order stays `cancelled`.
briefCheck asserts the guard.
Closed 2026-10-10 by /audit independent (fresh subagent, target 51de396):
services/rider.service.js:333 moves the stage to READY (with the history entry) only when
`order.stage.status` is `out-for-delivery`, in the same `order.save()` as the failed leg.
This now matches `wasOut` (services/util.service.js:182) and the backfill filter
(config/setup.js:439). A cancelled order keeps its stage; leg status, `failureNote`,
notifications and audit log are unchanged, as suggested. No new defect introduced.
`ORDER_STATUS` was already imported (line 8). briefCheck 385/0.

## Independent review

**Status:** passed
**Target commit:** 51de3961a22932ab511f2d975e9d51f71f195590
**Base commit:** 450a4c754c6a73e84a5c138ebd1f704bf1dfaabc
**Base ref:** origin/main
**Spec hash:** 74883976fabee53a8611c00c207b73534c625556174adb47d839b91b311eb22e
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-10T18:15:38Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-10T18:20:46Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `450a4c754c6a73e84a5c138ebd1f704bf1dfaabc..51de3961a22932ab511f2d975e9d51f71f195590` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD` / `git merge-base origin/main HEAD` / `sha256sum blueprint/context/current-feature.md` / `git status --porcelain`: pass (HEAD, merge base and spec hash match the request; only review.md and findings.md differ; spec is tracked, so no snapshot)
- `git diff 450a4c7..51de396` (product code, staging/brief scripts, .gitignore, moved docs): reviewed
- `node briefCheck.js`: pass (385 passed, 0 failed)
- Swagger envelope check from AGENTS.md: pass (0 wrong envelopes; `CancellationVerdict` resolves under `data.message` on both routes)
- `node dispatchStaging.js`: unavailable (needs a testing DB; .env points at production, so not run)

### Evidence

- services/rider.service.js:333: the rider's failed delivery moves the stage to READY only from `out-for-delivery`, in the same save as the failed leg (F-04 closed)
- services/util.service.js:182-207: `delivery_problem` applies the same rule in one `findByIdAndUpdate`
- config/setup.js:432-459: the backfill is idempotent (its filter requires `out-for-delivery`, which it changes), wrapped in try/catch and registered in the sequential `setupApp` steps
- services/bookOrder.service.js:180-208: `_cancellationVerdict` uses only `_cancelTier` and `cancellationOutcome`; the amber fee matches what `approveCancellationRequest` computes (line 664); the stored `cancellation` record is not touched on either read (lines 2302-2317, 2352-2359)
- Reads add one settings query plus one `distinct`/`exists` per request, not per order; the `{orderId,status}` index on CancellationRequest covers both
- `presentOrder` does not alter `items`, `stage`, `amount` or `paymentStatus`, so the verdict reads the real fields
- e484a60: the docs move and three comment path edits only; no code reads the old `context/` path; LOCAL-SECRETS.md stays ignored and untracked; no credential patterns in the added lines
- The history-list read keeps its non-admin `userId` scope guard

### Findings

- F-04 [P1] closed: the repair is correct and complete
- F-05 [P2] open: report-issue route has no role or ownership check (predates this work; the delta widens its effect)
- F-06 [P3] open: briefCheck failed-delivery assertions match source text only
- F-01, F-02, F-03 already closed; not reopened

### Remaining risk

- `node dispatchStaging.js` not run here (needs a testing DB). The builder reports 72/0 against a separate testing DB, but that is unverified. The rider path, the `delivery_problem` path, the backfill, and both reads against a real DB have only that unverified behavioural cover.
- The boot check on `PORT=7999` from the spec's Verify section was not run (it would connect to the production DB). Whether the backfill runs cleanly on real data is unverified.
- `delivery_problem` reads the stage with `findById` and then updates without a stage filter. A cancellation that lands between those two calls could be moved to READY. The window is negligible and was not exercised.
- The boot backfill's `updateMany` on `stage.status` plus the leg status may scan the collection on every boot. Its cost on production volume is unmeasured.
- Out of scope per the spec: `GET /api/bookOrder/book-order/:id` has no ownership check. It now also returns the cancel verdict.
- No unit test runner, lint or typecheck exists in the project.
