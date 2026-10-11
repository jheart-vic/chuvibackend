# Fix: Behavioural checks and comment cleanup

**Type:** Fix
**Status:** not started
**Branch:** `fix/behavioural-checks-and-comment-cleanup`
**Fixes:** F-06, F-07, F-08

Three P3 findings from the last two independent reviews. None of them changes how the
app behaves. They make the offline safety net prove behaviour rather than spelling,
and correct one misleading comment.

## The problem

- **F-06** (`briefCheck.js`, "FE: failed delivery goes back to the delivery queue"):
  - The failed-delivery checks only match source text with regexes.
  - A refactor that keeps the behaviour breaks them, and a behaviour change that keeps
    the text passes them.
  - The only real behavioural cover is `dispatchStaging.js` (scenarios 11 to 13), which
    needs a testing database and is not part of the offline gate.
- **F-07** (`services/bookOrder.service.js`, `getBookOrder`):
  - The new comment says the handler "is also mounted on the intake routes", and the
    last spec said the same.
  - In fact `routes/intake-user.js:481` uses a separate handler
    (`IntakeUserService.getBookOrder`) behind `intakeUserAuth`.
  - Behaviour is fine, but the comment would mislead the next change to either handler.
- **F-08** (`briefCheck.js`, the "Access" block and the headers above it):
  - The three access checks are regex-only, like F-06.
  - Two section-header comments ("FE 9 Oct: a failed delivery returns to READY" and
    "Dead subscription crons removed") ended up stacked above the Access block instead
    of their own sections.

## The fix

### Behavioural checks, offline, with no new dependency

- In `briefCheck.js`, add one small local helper that temporarily replaces Mongoose
  model statics (and a document's `save`) with in-memory fakes, runs a check, and
  always restores the originals in `finally`.
- No test runner and no library. Only `briefCheck.js` changes for this part.
- Use it to drive the **real** functions with plain fake orders and users:
  - `RiderService.markOrderDeliveryAsFailed`:
    - from `out-for-delivery`, the saved order has stage `ready` and a
      `Delivery failed: <note>` history entry
    - from `cancelled`, the stage stays `cancelled`
    - the leg status is `failed` in both cases
  - `UtilService.reportDeliveryIssue`:
    - a rider on someone else's delivery is refused, and nothing is written
    - a rider's walk-in report is refused
    - the assigned rider's `delivery_problem` writes stage `ready` when the order was
      out for delivery
    - intake can report on any order
  - `BookOrderService.getBookOrder`:
    - the owner gets the order
    - another customer gets `Book order not found`, the same as a missing ID
    - staff get any order
- Side effects the functions trigger (notifications, audit log, activity rows) go to
  fakes that record calls, so the checks can also assert that a refused report writes
  nothing.
- Keep the existing regex check for the route's `multiAuth` role list. Route
  middleware cannot be driven without a request; it stays a source check, which is
  stated in a comment.
- Replace the other regex-only assertions these behavioural checks supersede.

### Comment and headers

- **F-07:** reword the `getBookOrder` comment. Staff read any order through this route;
  the intake route has its own handler behind `intakeUserAuth`.
- **F-08:** put each section header above its own block.

## Build steps

1. [ ] **Fake-model helper plus failed-delivery checks (F-06).**
   **Done when:** the failed-delivery assertions call the real rider and util functions
   offline, and `node briefCheck.js` passes with no database.
2. [ ] **Access checks (F-08) and comment (F-07).** Behavioural checks for
   report-issue and `getBookOrder`, headers moved, comment reworded.
   **Done when:**
   - `node briefCheck.js` passes
   - deliberately breaking each guarded line makes the matching assertion fail (tried
     once by hand and reverted)

## Verify

- `node briefCheck.js` passes, offline.
- **Mutation spot-check, by hand, reverted afterwards.** Each of these must fail the
  matching assertion:
  - remove the `out-for-delivery` guard in `markOrderDeliveryAsFailed`
  - remove the rider assignment check in `reportDeliveryIssue`
  - remove `notMine` in `getBookOrder`
- `dispatchStaging.js` against the testing DB still passes. Product code changes only
  by one comment.
- `git diff` touches only `briefCheck.js` and the one comment in
  `services/bookOrder.service.js`.

## Out of scope

- **A real test runner** (`/tests`). These checks are the bridge until one exists.
- **The `reconcilePaystack` status mapping.** It needs its own `/fix` and a product
  decision.
