# Fix: Remove dead subscription cron jobs

**Type:** Fix
**Status:** verified
**Branch:** `fix/remove-dead-subscription-cron-jobs`

Three subscription background jobs required in `server.js` have never worked. Each
one logs an error or matches nothing, and none changes any data. They are misleading:
they read as if monthly resets, expiry and cleanup happen on a schedule, and one of
them would do real harm if anyone "fixed" it naively.

## The problem

| Job | Schedule (Lagos) | Intended | What actually happens |
|---|---|---|---|
| `crons/resetMonthlyLimits.js` | 1st of month, 00:00 | Reset every active subscriber's `remainingItems` to the plan limit | It populates `plan`, but the field is `planId`, so `sub.plan.monthlyLimits` throws on the first subscriber. The error is caught and logged. Nothing is reset. |
| `crons/expireSubscriptions.js` | Daily, 00:00 | Mark lapsed subscriptions `expired` | It filters on `expiresAt`, which is not in the schema (commented out at `models/subscription.model.js:42`). It matches nothing. |
| `crons/cleanUpCancelledSubs.js` | Sundays, 00:00 | Clear cancelled subscribers' items | It writes `remainingItems: {}` into a Number field, so the cast fails ("Cast to Number failed for value {}"). The error is caught and logged. |

What really governs subscriptions today, and must not change:
- **The renewal resets the allowance.** A Paystack renewal (`charge.success`) sets
  `remainingItems = plan.monthlyLimits` on the customer's own billing date
  (`util/webhook.handler.js:217`), then applies the loyalty bonus for months 3, 6
  and 12. Unused items are forfeited.
- **Paystack events change the status.** `invoice.payment_failed` sets `failed` and
  resets the loyalty streak (`util/webhook.handler.js:282`); `subscription.disable` is
  handled too. The daily `crons/reconcilePaystack.js` re-syncs the status from Paystack.
- **Booking checks the status.** Booking refuses a non-`active` subscription
  (`services/bookOrder.service.js:1532`).

**Why the reset job must be removed, not repaired.** Repaired, it would reset every
subscriber on the 1st of the calendar month, whatever their billing date, and wipe a
loyalty bonus granted mid-cycle. The renewal already does the correct reset.

## The fix

- Delete `crons/resetMonthlyLimits.js`, `crons/expireSubscriptions.js` and
  `crons/cleanUpCancelledSubs.js`, and their three `require` lines in `server.js`.
- Add one comment at the remaining cron `require` block in `server.js` saying where
  the subscription allowance reset and status changes live (the renewal webhook,
  Paystack events and `reconcilePaystack`), so nobody adds a calendar reset back.
- **No behaviour change.** No data written today is written differently, because none
  of these jobs has ever changed a document. No new job, field or setting.
- Not in scope, and recorded below: rollover of unused items (a client decision) and
  the `reconcilePaystack` status sync.

## Build steps

1. [x] **Remove the three jobs.** Delete the files, remove the `require` lines, and
   add the pointer comment.
   **Done when:** no `.js` file references the three job names; `server.js` boots
   with the remaining crons; `node briefCheck.js` still passes.

## Verify

- `grep` for `resetMonthlyLimits|expireSubscriptions|cleanUpCancelledSubs` in `*.js`
  returns nothing.
- Add a briefCheck assertion that `server.js` requires none of the three jobs and
  that the renewal webhook still sets `remainingItems = plan.monthlyLimits`.
- Boot on `PORT=7999` against the testing DB: the server starts and setup completes.
- `node briefCheck.js` passes.

## Out of scope (recorded, not fixed)

- **Rollover of unused items.** Unused items are forfeited at renewal. No client
  decision on rollover exists. Needed if they want it: carry all or a cap, does it
  expire, and what happens after a failed renewal or cancellation.
- **`reconcilePaystack` can abort and can block subscribers.**
  - It copies Paystack's status straight onto the subscription. Paystack uses
    `non-renewing`, `attention` and `complete`, which are not in the schema's
    `status` enum (`active`, `cancelled`, `expired`, `pending`, `failed`), so
    `sub.save()` fails validation.
  - It saves inside one try/catch, so the first failure stops the run for every
    subscription after it.
  - A `non-renewing` subscriber (cancelled but paid to the end of the period) would
    also be blocked from booking if the save succeeded.
  - This needs its own `/fix`, with a decision on how Paystack statuses map onto ours.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":4546,"specSha256":"1e99a787dec1beff6fdd4d05e0ba080bf0685b67d8c05c876a247cc8c538ff81","branch":"refs/heads/fix/remove-dead-subscription-cron-jobs","head":"65281e26ca9c1b41ca343849c716df8ca971369c","baseRef":"refs/heads/main","baseCommit":"ddbb3ba3876340b08ab571bdf8e8b8e8b4c633b0","sourceTree":"81aac199432d56017d6517d88a6742f80ed76bec","landing":"pull-request","absentOptional":[]} -->
