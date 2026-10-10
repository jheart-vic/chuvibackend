# Fix: Restrict order reads and issue reports

**Type:** Fix
**Status:** verified
**Branch:** `fix/restrict-order-reads-and-issue-reports`
**Fixes:** F-05

Two routes check only that the caller is logged in, not who they are.

## The problem

### A. Anyone logged in can report a dispatch problem on any order (F-05)

- `PATCH /api/utils/order/:id/report-issue` (`routes/utils.js`) uses plain `auth`.
- Its docs name three callers: riders and intake staff (pickup problems), riders
  (delivery problems), and the front desk (walk-in problems).
- In practice, any logged-in account, including a customer, can mark any order's
  pickup or delivery `failed`. Since the failed-deliveries fix, a `delivery_problem`
  report also moves an out-for-delivery order back to `ready`. The report also
  notifies the customer and every admin.

### B. Any logged-in user can read any order by ID

- `GET /api/bookOrder/book-order/:id` (`routes/bookOrder.js`) uses plain `auth`, and
  `getBookOrder` (`services/bookOrder.service.js`) loads the order by ID with no
  owner check.
- A customer who has another order's ID gets that customer's name, phone number,
  addresses, items, amounts and payment status.
- The same handler is also mounted for staff (`intakeUserAuth`) on
  `routes/intake-user.js:481`, so staff reads must keep working.

## The fix

### A. Report-issue: role check plus rider assignment

- Route: replace `auth` with
  `multiAuth(ROLE.RIDER, ROLE.INTAKE_AND_TAG, ROLE.CUSTOMER_EXPERIENCE, ROLE.ADMIN)`.
  Customer-experience is included by the user's decision (CX may log a failure
  after a customer call). Any other role gets the standard 403.
- Service (`reportDeliveryIssue`): a **rider** may report only on their own run.
  - `pickup_problem` needs `dispatchDetails.pickup.rider` to be the caller.
  - `delivery_problem` needs `dispatchDetails.delivery.rider` to be the caller.
  - `walkin_problem` is refused for riders, because it is a front-desk report.

  Intake-and-tag, customer-experience and admin may report on any order.
- The refusal is a normal failed response naming the reason ("You are not assigned
  to this delivery"), matching the wording the rider service already uses.
- No change to what a permitted report writes.

### B. Order read: customers see only their own orders

- In `getBookOrder`, after loading the order: if the caller's `userType` is
  `ROLE.USER` and `order.userId` is not the caller, return the same
  `Book order not found` failure as a missing order, so order IDs cannot be probed.
- Staff of any role keep reading any order, unchanged.
- The check runs before the cancellation verdict is built.

No new middleware, helper or setting. The route uses the existing `multiAuth`.

## Build steps

1. [x] **Report-issue access.** Change the route guard and add the rider assignment
   check.
   **Done when:**
   - a rider can report on their own pickup and their own delivery
   - a rider is refused on another rider's run and on a walk-in report
   - intake, CX and admin can report on any order
   - the route rejects the customer role
2. [x] **Order read ownership.** Add the owner check to `getBookOrder`.
   **Done when:**
   - a customer can read their own order
   - another customer's order returns `Book order not found`
   - staff (intake, admin) can read any order
3. [x] **Swagger.** Document the roles on both routes and add a 403 response to
   report-issue.
   **Done when:** the envelope check reports 0 wrong envelopes.

## Verify

- briefCheck: the report-issue route uses `multiAuth` with exactly the four roles,
  and `getBookOrder` has the owner check before the verdict.
- `dispatchStaging.js` (testing DB), new scenario:
  - a rider reports on their own delivery (ok) and on another rider's (refused)
  - a rider's walk-in report is refused
  - intake reports on any order (ok)
  - customer A reads their own order (ok) and customer B's order (not found)
  - staff reads customer B's order (ok)
- Boot on `PORT=7999` against the testing DB.

## Frontend impact

- Report-issue now returns 403 for any role other than rider, intake-and-tag,
  customer-experience or admin, and a rider sees a refusal on a run that isn't theirs.
- A customer opening an order that isn't theirs now gets "not found".

Neither should affect correct use of either route.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":4317,"specSha256":"6e83a8e510dd86a7c7b043315cf42a43080cb03fc981d9f17c665ae959788694","branch":"refs/heads/fix/restrict-order-reads-and-issue-reports","head":"189518db46ae7c71b546ba65be2ed6fe8a09363b","baseRef":"refs/heads/main","baseCommit":"ddbb3ba3876340b08ab571bdf8e8b8e8b4c633b0","sourceTree":"319b0fc086f49012739793646a0ab5c50da09d56","landing":"pull-request","absentOptional":[]} -->

## Findings

### restrict-order-reads-and-issue-reports/F-05 [P2] closed - Any logged-in user can report a delivery problem on any order, which now also moves its stage

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
**Resolution:** fixed 2026-10-10 by /implement (fix: Restrict order reads and issue
reports, step 1). The route is `multiAuth(RIDER, INTAKE_AND_TAG, CUSTOMER_EXPERIENCE, ADMIN)`,
with CX included by the user's decision. The route docs name no customer caller. A rider
may report only on their own pickup or delivery and never a walk-in. dispatchStaging
scenario 15 and briefCheck cover it.
closed 2026-10-10 by /audit independent (target 189518d). Re-examined routes/utils.js:282
and services/util.service.js:162-174. A customer token carries `userType: 'user'`
(models/user.model.js:117-121), so `multiAuth` returns 403 before the service runs. The
route is mounted once and `reportDeliveryIssue` has no other caller. A rider is refused a
walk-in report and any leg whose `dispatchDetails.<leg>.rider` is not them; an unassigned
leg (`undefined`/`null`) also refuses. The check runs before any write, notification or
activity. No new defect found.

## Independent review

**Status:** passed
**Target commit:** 189518db46ae7c71b546ba65be2ed6fe8a09363b
**Base commit:** 450a4c754c6a73e84a5c138ebd1f704bf1dfaabc
**Base ref:** origin/main
**Spec hash:** 6e83a8e510dd86a7c7b043315cf42a43080cb03fc981d9f17c665ae959788694
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-10T19:51:16Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-10T19:54:45Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `450a4c754c6a73e84a5c138ebd1f704bf1dfaabc..189518db46ae7c71b546ba65be2ed6fe8a09363b` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD` / `git merge-base origin/main HEAD` / `git status --porcelain --untracked-files=all` / `sha256sum blueprint/context/current-feature.md`: pass (HEAD, merge base and spec hash match; only review.md and findings.md differ; spec is tracked)
- `node briefCheck.js`: pass (390 passed, 0 failed)
- Offline Swagger envelope check (AGENTS.md "API docs"): pass (0 wrong envelopes; report-issue documents 403)

### Evidence

- Freshness: target, merge base via origin/main, and spec hash verified before review.
- Report-issue: routes/utils.js:282 uses `multiAuth(RIDER, INTAKE_AND_TAG, CUSTOMER_EXPERIENCE, ADMIN)`; tokens always carry `userType` (models/user.model.js:117-133), so a customer gets 403. The route and `reportDeliveryIssue` have exactly one mount and caller.
- Rider scope: services/util.service.js:164-174 refuses walk-in and any pickup/delivery leg whose rider is not the caller (including unassigned legs), before any write, activity or notification.
- Order read: services/bookOrder.service.js:2348-2355 returns the same `Book order not found` (same 400, same early return before any further query) for a missing order, a walk-in order with no `userId`, and another customer's order. Staff roles are unchanged. routes/intake-user.js:480 uses a separate handler (`IntakeUserService.getBookOrder`) behind `intakeUserAuth` (intake/admin only), so no customer path reaches an unscoped read there.
- Earlier stacked commits (Blueprint setup, failed-delivery READY rule + backfill, cancellation verdict, dead cron removal) re-read: no new defect; verdict is computed only after the ownership check.
- Performance: the new checks add no queries; the not-mine path short-circuits before the settings and cancellation-request lookups.

### Findings

- F-05 [P2] closed: report-issue access repair confirmed correct and complete.
- F-06 [P3] open (unchanged): failed-delivery briefCheck assertions are source-regex only.
- F-07 [P3] open: getBookOrder comment and spec wrongly say the intake route shares the handler.
- F-08 [P3] open: new access assertions are source-regex only; misplaced briefCheck section headers.

### Remaining risk

- dispatchStaging.js scenario 15 (the only behavioural cover for the rider and ownership checks) needs a testing database and was not run; the builder's 80/0 result is unverified.
- No test runner, lint or typecheck exists (`npm test` is a placeholder), so there is no automated behavioural gate.
- No boot verification on `PORT=7999` was run (`.env` points at the production database).
- Frontend callers of report-issue in roles other than rider, intake-and-tag, CX and admin (for example QC or press) would now get 403; the frontend repo was not inspected.
