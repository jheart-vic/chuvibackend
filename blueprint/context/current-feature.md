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
