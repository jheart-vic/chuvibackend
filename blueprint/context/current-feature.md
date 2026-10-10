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
