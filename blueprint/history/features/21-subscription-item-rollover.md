# Feature: Subscription item rollover

**From build-plan:** feature 21
**Build attempt:** 1
**Status:** verified
**Branch:** feature/subscription-item-rollover

## Goal

Plan customers keep part of what they didn't use. At each renewal, the items left over carry into
the new month, up to half the plan. A customer whose renewal fails has a week to pay and still keep
them. A cancelled plan stays usable until the month they paid for ends. A plan change starts fresh.
This must be live before the first renewals in early November 2026.

Client rules (approved 2026-10-10, settled 2026-10-11, binding — memory `chuvi-subscription-rollover`):

1. At each renewal, carry over the items left, capped at **half the plan's monthly items, rounded
   down** (25-item plan → 12). New balance = plan + carried. The same rule applies every renewal.
2. **One balance** (`remainingItems`). No separate carried pool, no expiry, no subscription-screen
   change.
3. Rollover only happens on renewal. **A failed renewal gets 1 week from the failed payment** to pay
   and keep the rollover. Bookings stay blocked during that week, as today. After a week the
   leftovers are forfeited.
4. **Cancel → the customer keeps using items until the paid month ends.** Nothing carries after.
5. Only items roll over. Free pickups and deliveries (the weekly counter) do not.
6. **Plan change: NO rollover.** The customer uses the existing "Upgrade Plan" option and the new
   plan starts fresh. There is no switch-plan feature.

## In scope

- Rollover at renewal, applied BEFORE the month-3/6/12 loyalty bonus, so the cap never cuts the bonus.
- Failed renewal: record when it failed; a renewal paid within 7 days keeps the rollover, later
  forfeits it.
- Cancel to period end:
  - the record is kept, not deleted;
  - the plan stays usable until the paid month ends;
  - then it expires with nothing carried.
- Paystack's `subscription.disable` event and the nightly reconcile stop deleting records or
  corrupting the status.
- Plan change starts fresh: when a new plan activates, the customer's other plan record is closed.
- One rule, used everywhere, for "the customer's usable plan".

## Out of scope

- No switch-plan or prorating feature (rule 6).
- No subscription-screen redesign (rule 2). The app shows `remainingItems` as today, plus a
  "cancelled, usable until…" state.
- No change to free pickups and deliveries (rule 5) or to the loyalty percentages.
- Paystack's own retry schedule is unchanged. We only react to its events.

## Today (repository evidence)

| Area | Today | Problem for the rules |
|---|---|---|
| Renewal (`util/webhook.handler.js` `handleRenewal`) | `remainingItems = plan.monthlyLimits`, then the loyalty bonus | Leftovers are lost (rule 1) |
| Failed renewal (`handleInvoiceFailed`, `handlePaymentFailed`) | `status: 'failed'`; `handlePaymentFailed` also resets the loyalty months | No record of when it failed (rule 3) |
| Cancel (`subscription.service.js` `cancelSubscription`) | Disables on Paystack, then **deletes the record** | Rule 4 is impossible |
| `subscription.disable` webhook | **Deletes the record** | Same |
| Nightly reconcile (`crons/reconcilePaystack.js`) | Copies Paystack's status straight in | Paystack's `non-renewing`, `attention` and `complete` aren't in our enum, so the save throws and **aborts the loop** for every later subscriber |
| Period end | `currentPeriodEnd` is set on the first charge and never moved on renewal; `nextPaymentDate` is moved | No reliable "paid until" date |
| Finding the plan | Booking uses `findOne({ userId })` with no sort; others use `findOne({ userId, status: 'active' })` | With more than one record, booking can pick the wrong one |
| Plan change | Subscribing again is refused while a plan is `active` ("cancel first"). A new plan or card creates a new record (F-47 only reuses the same plan and card) | After cancel-then-subscribe, two records can both look usable |

## Build loop

`workflow.stepReview: feature`, `checkpointCommits: disabled`: build all steps, then one review packet.
Independent review is selected (payments and subscriptions). `/complete` makes the commit.

## Build steps

1. [x] **Rollover and the failed-renewal week.**
   - Model `models/subscription.model.js`: add
     - `failedAt` (Date): the first failed renewal payment of the current failure, cleared on renewal;
     - `rolledOverItems` (Number, default 0): what the last renewal carried, for support and audit.
   - `handleRenewal`:
     1. Compute `carried = min(max(remainingItems, 0), floor(plan.monthlyLimits / 2))`.
     2. If the record is `failed` and `failedAt` is more than 7 days before the renewal's `paid_at`,
        set `carried = 0`.
     3. Set `remainingItems = plan.monthlyLimits + carried`, `rolledOverItems = carried`, and clear
        `failedAt`.
     4. Set `currentPeriodEnd` to the new `nextPaymentDate`.
     5. Then apply the loyalty bonus, as today.
   - `handleInvoiceFailed` and `handlePaymentFailed`: set `failedAt` only when it isn't already set.
     The week counts from the first failed payment. Bookings stay blocked because the status is
     `failed`, as today.
   - **Done when:** a staging script on testingdb, driving `handleChargeSuccess` with a synthetic
     renewal, shows:
     - 25-item plan with 20 left → 37 (25 + 12);
     - 5 left → 30;
     - 0 left → 25;
     - failed then paid 3 days later with 20 left → 37;
     - failed then paid 8 days later → 25;
     - a month-3 renewal with 20 left → 37 + the 25% bonus (6) = 43;
     - the same webhook delivered twice applies once.

2. [x] **Cancel to period end, one usable-plan rule, and safe Paystack syncing.**
   - **One rule:** add `findUsableSubscription(userId, { populate })` in `util/subscriptionAccess.js`.
     It returns the newest record that is `active`, or `cancelled` with `currentPeriodEnd` still in
     the future. Use it in:
     - the booking gate (`postBookOrder` plan billing);
     - booking-options;
     - the bot's plan check (`services/bot/booking.flow.js`);
     - the dashboard (`user.service.js`);
     - `getCurrentSubscription`.
   - Booking accepts a cancelled-but-paid plan the same as an active one.
   - **`cancelSubscription`:** after Paystack confirms the disable, set `status: 'cancelled'` and
     `cancelledAt`, and keep the record. The reply says "Your plan is cancelled. You can keep using
     your items until <date>."
   - **`handleSubscriptionDisable`:** an `active` record becomes `cancelled` with `cancelledAt`; a
     `failed` record keeps its status, so the failed-payment week still applies. Never delete.
   - **Nightly reconcile (`crons/reconcilePaystack.js`):** map Paystack's status before saving:

     | Paystack | Ours |
     |---|---|
     | `active` | `active` |
     | `non-renewing` | `cancelled` |
     | `attention` | `failed` (with `failedAt`) |
     | `complete` / `cancelled` | `cancelled` |

     Wrap each subscriber in its own try/catch, so one bad record can't stop the rest.
   - **Expiry:** the same nightly run marks a `cancelled` record whose `currentPeriodEnd` has passed
     as `expired`, with `remainingItems: 0` (nothing carries).
   - **Done when:** staging shows:
     - cancel keeps the record, booking with the plan still works before the period end;
     - after the period end it's refused ("Subscription is not active") and the nightly step marks
       it `expired` with 0 items;
     - a reconcile with a `non-renewing` status saves without throwing and the next subscriber is
       still processed.

3. [x] **A plan change starts fresh.**
   - When `handleNormalSubscription` activates a plan, mark every OTHER record of the same customer
     that is still `active` or `cancelled` as `expired`, with `remainingItems: 0`. The new plan is
     the only usable one and starts with its own full items (rule 6).
   - The start-a-plan gate in `paystack.service.js` already refuses while a plan is `active`, so the
     app's "Upgrade Plan" (cancel, then subscribe) works with a cancelled-but-paid plan.
   - **Done when:** staging shows:
     - cancel a 25-item plan with 10 left, then subscribe to a 40-item plan → exactly one usable
       record, 40 items, `rolledOverItems` 0;
     - the old record is `expired` with 0 items.

4. [x] **Review round 1 fixes (2026-10-14): F-90 [P2], F-91, F-92, F-93 [P3].**
   - A replaced plan is also stopped on Paystack when a new plan activates. A late charge on an
     `expired` plan is reported for an admin, never revived. This prevents double billing when a
     failed customer starts a new plan.
   - A plan change doesn't send the "your plan expired, renew" email.
   - The reconcile no longer asks Paystack about cancelled plans.
   - Cancel stops the plan on Paystack whenever Paystack would still charge it, including "attention".
   - `handleInvoiceFailed` also resets the loyalty months, as the model's rule says.
     `handlePaymentFailed` had that reset, but no webhook event reaches it.
   - **Done when:** rolloverStaging 21/0 (scenarios 8 and 9 added); briefCheck 549/0.
5. [x] **F-94: how a failed renewal is paid within the week** (user decision 2026-10-14; the client is
   asked to confirm).
   - The customer re-subscribes to the SAME plan through the normal checkout. Within 7 days of the
     failure, the leftovers carry over, capped at half. A different plan, or after the week, starts
     fresh.
   - A failed plan can be cancelled. That stops Paystack retrying the card, and the reply gives the
     keep-your-items date.
   - **Done when:** rolloverStaging 25/0 (scenario 10); briefCheck 550/0.
6. [x] **Client additions (2026-10-14, binding).** "Keep your recommendation for launch. Please add
   three things", plus a correction to the third.
   1. **Failure SMS + My Plan banner:**
      - The moment a renewal fails (once per failure), an SMS: "Chuvi: Your plan renewal didn't go
        through. Subscribe again by <date> to keep your <X> unused items."
      - With no usable plan, `GET /subscription/current-subscription` returns `renewalFailed`
        (`planId`, `keepItemsBy`, `unusedItems`, `message`). The banner button opens the normal
        checkout for that plan.
   2. **Day-5 reminder SMS** (the new cron `crons/renewalFailedReminder.js`, 10:00 Lagos, once per
      failure, only while the deadline is ahead and there are items): "Chuvi reminder: 2 days left.
      Subscribe again by <date> to keep your <X> unused items."
   3. **Switch the old failed subscription off automatically, ONLY after the new payment
      succeeds.** It happens in the charge.success path (`handleNormalSubscription` →
      `closeOtherPlans`). A failed new payment leaves everything as it was, so the customer can try
      again before the deadline.
   - SMS rules: no dashes, N instead of the naira sign (these texts have no amounts).
   - "Pay now" is to be considered after launch if many renewals fail.
   - **Done when:** rolloverStaging 30/0 (scenarios 11 and 12); briefCheck 554/0.
7. [x] **Review round 2 fixes (2026-10-14): F-90 reopened, F-95, F-96 [P2], F-97, F-98 [P3]; F-94 re-marked fixed.**
   - A failed or expired record is never reused by a new subscription or its `subscription.create`.
     A same-plan, same-card re-subscribe gets a new record, and the old one is switched off on
     Paystack.
   - `subscription.create` stores the email token correctly. It used `|`, which stored 0. It also
     maps the status.
   - The reconcile keeps a failed plan failed, so its leftovers last until the keep-by date.
   - The reminder goes on the 5th calendar day in Lagos.
   - A failed invoice never revives an expired plan.
   - Old plans are closed locally before the Paystack calls, which have a 10 s timeout.
   - **Done when:** rolloverStaging 33/0; briefCheck 560/0.
8. [x] **Review round 3 fixes (2026-10-14): F-99, F-100 [P2].**
   - My Plan matches its own Paystack subscription code first, else the newest one on that plan
     that Paystack hasn't ended. The old switched-off subscription can't cause "no longer active".
   - The failure SMS, the reminder and the banner promise what re-subscribing keeps: the unused
     items capped at half the plan.
   - **Done when:** rolloverStaging 33/0; briefCheck 562/0.
9. [x] **Risk fixes after review round 4 (user decision 2026-10-14: "build a, b and c").**
   - **A:** a plan that activates without a Paystack code asks Paystack for the customer's
     subscriptions and stores the newest one on that plan that hasn't ended and isn't on another
     record. This closes the gap when `subscription.create` arrives before `charge.success`.
   - **B:** a renewal with an unknown code is adopted by the customer's single code-less plan on that
     plan, and applied instead of being reported unapplied.
   - **C:** a switch-off Paystack refuses is marked `paystackDisablePending`. The nightly reconcile
     retries it until Paystack confirms.
   - **D (automatic refund of a charge on a replaced plan):** awaiting the client's decision. Until
     then such a charge is reported to an admin.
   - **Done when:** rolloverStaging 37/0 (scenario 13); briefCheck 565/0.

Then:
- `node briefCheck.js`, with new checks for the rollover math, the status map, and the usable-plan rule;
- the booking staging suite (quickBooking, counterPayment, freeLogistics, subLogistics, planCreate);
- the Swagger check;
- a boot on PORT=7999 against testingdb.

**Result (2026-10-14):** rolloverStaging 18/0; briefCheck 546/0 (9 feature 21 checks); subLogistics 20,
planCreate 39, quickBooking 67, counterPayment 51, freeLogistics 23 (testingdb); botStaging 5/9 (unchanged:
the testingdb price and no LLM/SMS credits); Swagger 0 wrong; boot on PORT=7999 against testingdb OK.

## Files / areas

- `models/subscription.model.js`: `failedAt`, `rolledOverItems`.
- `util/webhook.handler.js`: `handleRenewal`, `handleInvoiceFailed`, `handlePaymentFailed`,
  `handleSubscriptionDisable`, `handleNormalSubscription`.
- `services/subscription.service.js`: `cancelSubscription`, `getCurrentSubscription`.
- `util/subscriptionAccess.js` (new): `findUsableSubscription`.
- `services/bookOrder.service.js`: the plan billing gate, booking-options.
- `services/bot/booking.flow.js`, `services/user.service.js`: the plan check and the dashboard.
- `crons/reconcilePaystack.js`: the status map, per-record safety, expiry.
- `swagger/schemas.js` and `routes/subscription.js`: document `status: cancelled`,
  `currentPeriodEnd`, `rolledOverItems`, and the cancel reply.
- `briefCheck.js`; new `rolloverStaging.js`.

## Data / contracts

- **Statuses** stay in the existing enum: `active`, `cancelled`, `expired`, `pending`, `failed`.
  A `cancelled` plan is usable while `currentPeriodEnd > now`.
- `currentPeriodEnd` is the "paid until" date: the first charge sets it (as today), and every
  renewal moves it to Paystack's `next_payment_date`.
- Rollover cap = `Math.floor(plan.monthlyLimits / 2)`. The grace period is exactly 7 × 24 h from
  `failedAt` to the renewal's `paid_at`.
- **Idempotency:** a renewal is applied once per Paystack reference, by the existing
  `PaymentModel` unique-reference claim, so the rollover can't be applied twice.
- **Trust:** every money and status change comes from signature-verified Paystack webhooks, the
  authenticated customer's own cancel, or the server cron. No client input sets items or dates.
- **API:** `GET` current subscription can return `status: 'cancelled'` with `currentPeriodEnd`. The
  app should show "Cancelled — usable until <date>". The cancel reply text changes. Both go in the
  frontend changelog.

## Testing

- There's no unit runner. briefCheck gets pure checks on the rollover math, the status map and the
  usable-plan selection (stubbed records).
- The DB-backed behaviour (webhooks, cancel, the cron step) is covered by `rolloverStaging.js` on
  testingdb, driving the real handlers with synthetic Paystack payloads and the Paystack client
  stubbed.

## Found while building (2026-10-14)

- The nightly reconcile selected on `paystackSubscriptionCode`, which nothing ever writes, so it
  never reconciled any subscription. It now selects on `subscriptionCode` (the real Paystack code),
  maps statuses, never turns a `failed` plan back to `active` (only a real renewal does, so the
  rollover and its week apply), and gives a newly cancelled plan its paid-until date.
- `getCurrentSubscription` also copied Paystack's raw status and refused a non-active Paystack
  status. It now uses the usable-plan rule, maps the status, and leaves a cancelled-but-paid plan
  alone.
- A (re)subscription resets `currentPeriodEnd`, `nextPaymentDate`, `rolledOverItems`, `failedAt`
  and `cancelledAt`, so a reused record starts a clean paid month.

## Notes for the AI

- The database is cleared on Friday 16 Oct, so there's no old data to migrate. New renewals set
  `currentPeriodEnd` correctly from then on.
- Keep rollover ahead of `applySubscriberLoyalty`. A failed payment already resets the loyalty
  months; leave that as it is.
- `sendPaymentsReminder` will now also email customers whose cancelled plan expired ("renew"). That
  is acceptable and unchanged in kind.
- Admin dashboards keep counting `status: 'active'` subscribers. A cancelled-but-paid plan isn't
  counted as active; record that in the frontend changelog.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":17373,"specSha256":"699dc79e5099201a31076bc243ab65362ca1e6767db727dffc6ff64807ae343b","branch":"refs/heads/feature/subscription-item-rollover","head":"bdae43619eabf22f164e1435b6ee27349f89100b","baseRef":"refs/heads/main","baseCommit":"eed10261321f1ef832a2d900bffe04d74bd164be","sourceTree":"a5c53c6121106949df537608cc60d2c0292d17b5","landing":"local-merge","absentOptional":[]} -->

## Findings

### 21/F-06 [P3] accepted - The failed-delivery checks in briefCheck only match source text

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
Accepted 2026-10-13 by the user ("yes" to accepting F-06/F-08). Reason: nothing in the product is wrong; the checks can only become behavioural tests once a test runner exists (`/tests`), and the behaviour is covered by dispatchStaging.js scenarios 11-13 on a testing DB meanwhile.

### 21/F-08 [P3] accepted - The new access checks in briefCheck only match source text, and the section headers above them are misplaced

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
Accepted 2026-10-13 by the user ("yes" to accepting F-06/F-08). Reason: the headers are fixed; the access checks can only become behavioural tests once a test runner exists (`/tests`), and dispatchStaging.js scenario 15 covers the behaviour on a testing DB meanwhile.

### 21/F-47 [P3] closed - A first plan charge always creates a new subscription document, so a re-subscriber can hold two (pre-existing; deferred to launch item 9)

**File:** util/webhook.handler.js (`handleNormalSubscription` lookup filter)
**Found:** 2026-10-12 by /audit independent (round 8, Remaining risk)
**Why it matters:** The lookup filters on a `user` field that is not in the subscription schema, so with Mongoose 8 (`strictQuery` false) it never matches and every first charge creates a new document. A customer who re-subscribes after a failed renewal can end up with two, and `subscription.create` may attach the new Paystack code to the old one, after which a renewal is reported as unapplied (F-46 now catches that).
**Suggested fix:** Look up by `userId`, and decide the re-subscribe rules with the subscription rollover work (launch item 9), which rebuilds this area.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). The first-charge lookup in `handleNormalSubscription` filters on `userId` (the schema field) instead of the non-existent `user`, and the model's index uses `userId` too, so a re-subscriber with the same plan and card reuses their document instead of getting a second one. The wider re-subscribe rules stay with launch item 9. In briefCheck.
Closed 2026-10-14 by /audit independent (feature 21, target 6d649ba). Re-examined util/webhook.handler.js:736-742: the first-charge lookup is `{ userId: user._id, paystackSubscriptionId, paystackAuthorizationToken }`, so a same-plan, same-card re-subscriber reuses the document (feature 21 now also resets the paid month on reuse, :809-818). Original defect gone. Side note, harmless: the second model index (models/subscription.model.js:57-61) names `authorizationCode`, which is not a schema field, so that index is never used; the userId/status index is correct. Wider re-subscribe defect after a FAILED renewal is tracked separately as F-90.

### 21/F-19 [P2] closed - The staff counter booking still spreads the request body over the order (pre-existing)

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
Already fixed in the code (found 2026-10-13 while checking the ledger): `IntakeUserService.createBookOrder` builds the order from the `STAFF_ORDER_FIELDS` allow-list (services/intake-user.service.js ~351) and deletes the payment instructions first; `...post` is no longer spread over the order. counterPaymentStaging covers the counter path.
Closed 2026-10-14 by /audit independent (feature 21, target 6d649ba). Re-examined services/intake-user.service.js:332-375: the payment instructions are deleted, only the 13 `STAFF_ORDER_FIELDS` are copied from the body, and they are spread FIRST so `amount`, `paymentStatus`, `billingType`, `intakeStaffId`, `channel`, `stage` and `stageHistory` are always the server's. Original defect gone; no new defect seen in the block.

### 21/F-28 [P2] closed - Parallel plan bookings can each pass the items-left check (lost update)

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
Already fixed in the code (found 2026-10-13 while checking the ledger): the plan deduct is atomic — `SubscriptionModel.updateOne({ _id, remainingItems: { $gte: planPieces } }, { $inc: { remainingItems: -planPieces } })` before the order is saved, a loser creates nothing, and `returnPlanItems` gives the items back on rollback (services/bookOrder.service.js ~1941-1955).
Closed 2026-10-14 by /audit independent (feature 21, target 6d649ba). Re-examined services/bookOrder.service.js:1929-1972 against the new usable-plan lookup (:1805): the claim is `updateOne({ _id, remainingItems: { $gte: planPieces } }, { $inc: -planPieces })`, a zero `modifiedCount` refuses before any order exists, and a failed order save returns the items. The later `subscription.save()` leaves `remainingItems` untouched. Booking-vs-booking lost update is gone. (A renewal saving an absolute balance concurrently with a booking claim is a separate, pre-existing narrow window, listed under Remaining risk in review.md.)

### 21/F-75 [P3] closed - A non-string referral code on the phone step is silently ignored instead of refused

**File:** services/user.service.js:575
**Found:** 2026-10-13 by /audit independent (scope: current; lens: quality)
**Why it matters:** `completeProfile` treats any non-string `referralCode` (an array such as
`["CHUVIADA7K2"]`, or an object) as "no code": the phone is saved, the welcome SMS goes, and no
referral is linked, with a 200. The user decision for this step is that a code is never silently
dropped. The real app sends a string, so this only bites a malformed client (offline probe with
stubbed models confirmed it). Harmless for security: the value never reaches a query.
**Suggested fix:** Refuse a present-but-non-string `referralCode` with the same 400 message
(`referralCode != null && referralCode !== '' && typeof referralCode !== 'string'`), before the
update. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). `completeProfile` refuses a present-but-non-string `referralCode` with the same 400 message, before anything is saved. In briefCheck.
Closed 2026-10-14 by /audit independent (feature 21, target 6d649ba). Re-examined services/user.service.js:570-589: a present, non-empty, non-string code returns the referral-code error before the phone update; a string is trimmed/upper-cased and looked up. Original defect gone. briefCheck F-75 check passes (source-text only, same class as F-06).

### 21/F-82 [P3] closed - Beside a weekday, a bare day-of-month followed by a word outside the short time list ("saturday 24 10am", "saturday 24 noon") still resolves to the coming weekday

**File:** services/bot/parsers.js:398 (the bare 13–31 lookahead allows only end, punctuation or by/at/around/about/in/from/or/and/morning/afternoon/evening/please/pls)
**Found:** 2026-10-13 by /audit independent round 11 (scope: current; lens: quality)
**Why it matters:** Frozen clock Tue 13 Oct, rules-only parse on the day question: "saturday 24 10am", "saturday 24 9:30am", "saturday 24 noon", "saturday 24 between 9 and 11", "saturday 24 anytime", "saturday 24 thanks", "saturday 24 latest 10", "saturday 24 if possible", "saturday 24 2026" and "saturday 2026-10-24" all resolve to Sat 17 Oct (meant: Sat 24). "saturday 24 10am" is an ordinary answer. Stubbed bookingFlow: the summary reads "Pickup: … Saturday 17 October 10am … Standard — ready Wednesday 21 October", so the week-early date is plain before "yes". With an LLM, `pickupDate` is usually just "Saturday 24" (the time goes to `pickupTime`), which resolves correctly. b6bdb30 gave Sat 17 for all of these, so this item did not introduce or worsen it; it is the residue of F-78, now visible at confirm. P3.
**Suggested fix:** Also allow a clock time (`\d{1,2}(?::\d{2})?\s*[ap]\.?m`), "noon"/"midday", "between", "latest", "anytime" and a 4-digit year after the bare number, or invert the guard: read the bare 13–31 unless it is followed by an address or count word (the existing NOT_A_DAY list plus a capitalised or alphabetic street name). Add "saturday 24 10am" to the F-78 briefCheck check. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). Beside a weekday a bare 13–31 also counts as the day when a clock time, "noon"/"midday", "between", "latest", "anytime" or a year follows: "saturday 24 10am", "saturday 24 noon", "saturday 24 between 9 and 11" → Sat 24 (frozen-clock probe, 21 phrases, 0 wrong). In briefCheck (clock-independent).
Closed 2026-10-14 by /audit independent (feature 21, target 6d649ba). Re-examined services/bot/parsers.js:386-410: `TIME_AFTER` now admits a clock time, noon/midday, between, latest, anytime and a 4-digit year after the bare 13-31. The behavioural briefCheck F-82 check (drives `_parseDateTimeFromText` + `_resolvePickupDate` on a computed weekday/day pair) passes.

### 21/F-83 [P3] closed - Off the day question, "saturday 24, Allen Avenue" reads the house number as the pickup date when it falls on that weekday; a count after a comma or "and" forces a re-ask

**File:** services/bot/parsers.js:398 (`[,.!?;]` and `and`/`or` are accepted after the bare number), reached from services/bot/booking.flow.js:78-79 on any step when the LLM leaves `pickupDate` empty
**Found:** 2026-10-13 by /audit independent round 11 (scope: current; lens: quality)
**Why it matters:** Nigerian addresses are often written "24, Allen Avenue". Frozen clock Tue 13 Oct, rules-only parse off the day question: "saturday 24, allen avenue ikeja" → Sat 24 Oct (meant: Sat 17, the 24 is the house number). Stubbed bookingFlow: `bDay` Sat 24 Oct and the summary reads "Saturday 24 October". This only happens when the house number is a date that falls on the named weekday within the next month (about 1 in 7), when the weekday and the address share a message, and when there is no LLM `pickupDate` slot. The summary shows the date plainly. "saturday 20, 5 trousers", "saturday 20 and 5 trousers" and "saturday 13 or 14 shirts" read the number as a day that disagrees, so the day is asked again (the safe direction). New in this round: before f30c3d3 no bare number was read beside a weekday (code inspection of 01fdf64 parsers.js), so this gave Sat 17. P3.
**Suggested fix:** Off the day question (`written` false), accept the bare number only when it is followed by the end of the text or a time word, not by a comma followed by more words; or pass `{ bare: written }` like the `slash` option, so the bare reading is used on the day question only. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). Off the day question a comma after the bare number counts only when a time follows it: "saturday 24, allen avenue ikeja" keeps the coming Saturday (house number), "saturday 24, 9am" reads the 24th. On the day question punctuation still counts. In briefCheck.
Closed 2026-10-14 by /audit independent (feature 21, target 6d649ba). Re-examined services/bot/parsers.js:398-400: off the day question `BARE_AFTER` allows end of text, terminal punctuation, or an optional comma ONLY before a `TIME_AFTER` token, so "<weekday> 24, allen avenue" no longer reads 24 as the day. The behavioural briefCheck F-83 check passes both directions.

### 21/F-84 [P3] closed - The re-ask for a disagreeing weekday and bare day echoes the weekday twice ("saturday saturday 14")

**File:** services/bot/parsers.js:398 (the bare alternative's match text includes the weekday) and 202 (`datePhrase = \`${datePhrase} ${w.text}\``); shown by services/bot/booking.flow.js:249
**Found:** 2026-10-13 by /audit independent round 11 (scope: current; lens: quality)
**Why it matters:** Stubbed bookingFlow, Tue 13 Oct, "saturday 14" (the 14th is a Wednesday): the safe re-ask reads `I couldn't pin down the day from "saturday saturday 14"`. The stored `bDatePhrase` is also "saturday saturday 24" for a good answer, but that is no longer shown in the summary. Cosmetic, new in this round.
**Suggested fix:** Capture only the number in the bare alternative's returned `text` (for example `text: m[2] ?? m[0]`), or skip the weekday prefix when `w.text` already starts with it. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). The bare-day match returns only the number as the written date, so the phrase reads "saturday 24", never "saturday saturday 24". In briefCheck.
Closed 2026-10-14 by /audit independent (feature 21, target 6d649ba). Re-examined services/bot/parsers.js:409: the ordinal/bare branch returns `text: m[2] || m[0]`, so a bare day contributes only the number. briefCheck F-84 asserts `datePhrase === "<weekday> <dd>"` behaviourally and passes.

### 21/F-89 [P3] closed - The Quick Booking re-pick applies the windows-full quote rule to an ordinary Urgent order using TODAY's windows, so it can rank a free-pickup offer the charge then ignores

**File:** services/offer.service.js:492-499, reached from services/bookOrder.service.js:951-962 (`pickBestPersonalOffer` → `getBookingOptions` with `repriceOrderId`)
**Found:** 2026-10-13 by /audit independent round 2 (scope: current; lens: quality)
**Why it matters:** The new block in `getBookingOptions` runs on every call, including the Intake re-price of a Quick Booking. For an order whose pickup is a plain Urgent pickup (booked while a window was open, so `windowsFull` is not stamped and `offerPickupTiming` passes `anytime`), the draft carries no `pickupDate`, so `pickupWindowsFullOn(undefined)` tests the windows of the day and time Intake counts. If every still-bookable window is full at that moment, the draft is switched to WINDOW with `pickupAmount` = window fee, so `_bestByBillValue` values a free-pickup personal offer at the window fee. `_priceWithOffers` then prices the real order with its stored `anytime` timing (bookOrder.service.js:842), where free pickup is `anytimeKeptPickup` and waives nothing. A free-pickup offer can therefore beat a discount offer that would have taken money off, and the customer is billed more. Needs all of: a Quick Booking, a plain Urgent pickup, a count made while that day's remaining windows are full, and two applicable personal offers (and not a first order, where First Experience wins). Narrow, so P3. Code path traced; not run.
**Suggested fix:** Skip the block when `repriceOrderId` is set (the order's stamped leg already decides via `offerPickupTiming`), or pass the order's own `scheduling.pickup.date` and only apply it at booking time. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). The booking-options full-windows rule is skipped when `repriceOrderId` is set: an Intake re-price already prices the order's own stamped pickup through `offerPickupTiming`, so today's windows can no longer change which offer is picked. In briefCheck.
Closed 2026-10-14 by /audit independent (feature 21, target 6d649ba). Re-examined services/offer.service.js:488-503: the windows-full rewrite is guarded by `!repriceOrderId`, and `pickBestPersonalOffer` (:861-862) passes `repriceOrderId` through, so the Intake re-price ranks offers on the order's stored timing only. Original defect gone.

### 21/F-55 [P3] closed - `preferSlot` now saves on the lead, post-delivery and reactivation schedules, but those workflows ignore it

**File:** services/crm.service.js:140-144 (ignored at services/crm.service.js:420-426 and 575-581)
**Found:** 2026-10-12 by /audit independent round 3 (scope: current; lens: quality)
**Why it matters:** Before this delta `normalizeSchedule` dropped `preferSlot`; it now validates and persists it on every schedule. Only `startRegisteredNotBookedWorkflow` passes it on to `scheduleMessages`. `startLeadWorkflow` and `startReactivationWorkflow` build entries without it, so the window snap always uses `any`, and post-delivery is not windowed at all. A `leadSchedule` step saved with `preferSlot: morning` returns success and changes nothing (stubbed probe: accepted, saved). The shared `CrmScheduleStep` Swagger schema describes `preferSlot` as "Which daily send window the step prefers" for every schedule. Same class as F-54 but milder: admin-only, and the frontend is told to send the value back unchanged rather than edit it.
**Suggested fix:** Either pass `preferSlot: s.preferSlot` into the lead and reactivation entries (scheduleMessages already honours it), or refuse a non-`any` preferSlot outside `registeredNotBookedSchedule` and say so in the CrmScheduleStep description. Nothing current is lost.
**Decision (user, 2026-10-12):** make the workflows HONOUR the window. Build it as its own follow-up `/fix` after launch item 6 lands:
- Lead and reactivation pass each step's `preferSlot` into their scheduled entries (`scheduleMessages` already honours it), so "morning" means the next morning window.
- Post-delivery messages are order messages, which the client exempted from the send windows ("order and payment messages still go immediately"). So that schedule refuses a non-`any` window with a clear message instead of pretending.
- Docs: the CrmScheduleStep description says which workflows use `preferSlot`.
**Resolution:**
Fixed 2026-10-13 (follow-up batch, branch fix/urgent-alert-when-paid-and-sameday-disclosure). Built as decided (user, 2026-10-12): `startLeadWorkflow` and `startReactivationWorkflow` pass each step's `preferSlot` to `scheduleMessages`, which snaps it to that window ("morning" = the next 6–8 AM). `normalizeSchedule` refuses a non-`any` window on `postDeliverySchedule` with a clear message (order messages go out straight away). The `CrmScheduleStep` Swagger description says which schedules use it. In briefCheck.
Closed 2026-10-14 by /audit independent (feature 21, target 6d649ba). Re-examined services/crm.service.js: `startLeadWorkflow` (:437) and `startReactivationWorkflow` (:594) pass `preferSlot: s.preferSlot || CRM_SEND_SLOT.ANY`; `scheduleMessages` (:372-378) snaps it for `CRM_WINDOWED_WORKFLOWS`, which includes LEAD and REACTIVATION (util/constants.js:462-467); `normalizeSchedule` (:148-150) refuses a non-`any` window on `postDeliverySchedule`. Original defect gone. briefCheck F-55 checks pass.

### 21/F-90 [P2] closed - A customer whose renewal failed can start a second plan while the failed one stays live on Paystack; the old plan is only expired locally, and its next charge bills the customer again and revives the expired record

**File:** services/paystack.service.js:87-91 (start-a-plan gate blocks only `status: 'active'`); util/webhook.handler.js:593-598 (`closeOtherPlans` expires `failed` locally, no Paystack disable) and :337-409 (`handleRenewal` applies to a record in any status); services/subscription.service.js:250-259 (`cancelSubscription` needs `active`)
**Found:** 2026-10-14 by /audit independent (scope: current; lens: quality, security)
**Why it matters:** Feature 21 makes "one usable plan" the rule and closes the customer's other plans when a new one activates, including a `failed` one. But the failed plan's Paystack subscription is never disabled: the customer cannot cancel it (cancel looks only for `active`), and `getCurrentSubscription` returns `subscription: null` for a failed plan (or "please subscribe again" when Paystack says `attention`), so the app's path forward is to subscribe again, which the gate allows. Traced: renewal fails → `failed`; customer subscribes again (new Paystack subscription) → `handleNormalSubscription` → `closeOtherPlans` sets the old record `expired`, 0 items; Paystack later charges the old subscription (its `attention` status retries on the next payment date) → `handleChargeSuccess` → `handleRenewal` finds the expired record by its code and sets it `active` with a full month of items. The customer is billed for two plans every month and holds two active records. With the same plan and card the old record is reused instead, `subscription.create` moves the new Paystack code onto it, and the old subscription's charge is reported as an unapplied renewal, but is still taken. The double charge existed before, but this feature's plan-change rule now hides it by marking the old plan closed while it can still bill. Wrong charge on a realistic input (a card that failed once, then a re-subscribe), so P2 by this review's bar.
**Suggested fix:** Either (a) refuse to start a plan while the customer has a `failed` plan, with a message to update the card or contact support, or (b) disable the old Paystack subscription before or when the new plan activates (let `cancelSubscription` accept a `failed` plan, so "Upgrade Plan" disables it first). Also make `handleRenewal` send a charge on an `expired` record to `reportUnappliedRenewal` instead of reviving it. Which customer-facing path (a or b) to use is a client decision. Nothing current is lost.
**Resolution:**
Fixed 2026-10-14 (round 2 candidate). When a plan activates, `closeOtherPlans` now also DISABLES each replaced plan on Paystack (unless Paystack already ended it), best effort per plan, then expires it here. `handleRenewal` refuses a charge on an `expired` plan and reports it as an unapplied renewal for an admin, so a late charge can never revive a replaced plan. rolloverStaging scenario 8: a failed customer starting a 40-item plan → the old Paystack subscription is disabled and expired; a late charge on it changes nothing; exactly one usable plan (21/0). Whether a failed customer may cancel, or must re-subscribe to keep the rollover, is part of the F-94 decision.
Reopened 2026-10-14 by /audit independent (feature 21 round 2, target 6a37b79). The different-plan / different-card path is repaired (closeOtherPlans disables and expires the old record; handleRenewal refuses an `expired` record and records the money as unapplied). The same-plan, same-card path this finding also named is NOT: util/webhook.handler.js:786-792 reuses the FAILED record itself (filter `userId + paystackSubscriptionId + paystackAuthorizationToken`), :861-889 turns it `active` with the old `subscriptionCode` still on it, and `closeOtherPlans(user._id, subscription._id)` (:889, :603-605) excludes that record, so the old Paystack subscription (status `attention`) is never disabled. `handleSubscriptionCreate` (:691-715, same filter) then writes the NEW Paystack code onto the record, so the old subscription's next charge finds no record (:342-345), is reported unapplied, and is still taken: two charges a month. This is the exact F-94 flow the client's binding addition 3 targets ("switch the old failed subscription off ONLY after the new payment succeeds"). Also, if `subscription.create` lands before `charge.success`, it sets the reused record `active` first, so `prevFailed` (:810) finds nothing and the leftovers are lost. rolloverStaging scenarios 10 and 12 always use a new authorization code and failed records with no `paystackAuthorizationToken`, so this path is untested. Depends on Paystack returning the same authorization code for the same card, which the F-47 reuse was built for.
**Suggested fix (round 2):** In `handleNormalSubscription`, when the reused record carries a `subscriptionCode` and was `failed` (or `cancelled`) before reuse, disable that old code on Paystack after the save, with the same best-effort helper `closeOtherPlans` uses. Or stop reusing a `failed` record (add `status: { $ne: 'failed' }` to the F-47 filter, so `closeOtherPlans` handles it) and give `handleSubscriptionCreate` a status filter so it can't attach the new code to an expired record. Nothing current is lost.
Fixed 2026-10-14 (round 3 candidate). Both lookups that reuse a record — `handleNormalSubscription` (charge.success) and `handleSubscriptionCreate` — now exclude `failed` and `expired` records. A same-plan, same-card re-subscribe creates a NEW record; `closeOtherPlans` then switches the old failed subscription off on Paystack and expires it, and `subscription.create` attaches the new code and email token to the new record only. Also fixed while there: `handleSubscriptionCreate` stored the email token with a bitwise `|` (the number 0), so cancel had no token; and it copied Paystack's raw status (now mapped). rolloverStaging scenario 12 uses the SAME card and plan (33/0).
Closed 2026-10-14 by /audit independent (feature 21 round 3, target ca44a62). Re-examined util/webhook.handler.js: the reuse filters in `handleNormalSubscription` (:799-809) and `handleSubscriptionCreate` (:694-702) both carry `status: { $nin: ['failed', 'expired'] }`, so a same-plan, same-card re-subscribe creates a new record (:855-875) and `closeOtherPlans` (:876, :603-636) expires the old failed record locally, then disables its own (old) `subscriptionCode` on Paystack; `subscription.create` can no longer move the new code onto the old record; `handleRenewal` (:354-357) refuses a late charge on an `expired` record and reports it. The carry is computed from `prevFailed` (:829-840) before `closeOtherPlans` runs, so it is not lost. Original defect gone. The disable stays best effort (logged on a Paystack error), recorded under Remaining risk. A separate, pre-existing My Plan defect on this same path is F-99.

### 21/F-91 [P3] closed - A plan change sends the customer a "Your plan has expired, renew" email for the plan they just replaced

**File:** util/webhook.handler.js:593-598 (`closeOtherPlans`), crons/sendPaymentsReminder.js:15-18
**Found:** 2026-10-14 by /audit independent (scope: current; lens: quality)
**Why it matters:** `closeOtherPlans` sets the old record to `expired` without `expiryReminderSentAt`, so at 10:00 the next day the reminder cron emails "Your <plan> plan has expired… Renew in the Chuvi app" to a customer who just upgraded and has an active plan. The spec accepted this email only for a cancelled plan that ran out. Confusing, not harmful.
**Suggested fix:** Set `expiryReminderSentAt: new Date()` in `closeOtherPlans`' `$set` (a replaced plan needs no renewal reminder). Nothing current is lost.
**Resolution:**
Fixed 2026-10-14 (round 2 candidate). `closeOtherPlans` stamps `expiryReminderSentAt` on the plans it replaces, so the daily "your plan expired, renew" email skips a customer who just changed plan. rolloverStaging scenario 7 asserts it.
Closed 2026-10-14 by /audit independent (feature 21 round 2, target 6a37b79). Re-examined util/webhook.handler.js:627-632: the `updateMany` that expires replaced plans sets `expiryReminderSentAt: new Date()`, so the reminder cron skips them. Original defect gone, no new one from the repair.

### 21/F-92 [P3] closed - The nightly reconcile calls Paystack for every cancelled plan only to skip it

**File:** crons/reconcilePaystack.js:18-28
**Found:** 2026-10-14 by /audit independent (scope: current; lens: performance)
**Why it matters:** The query selects `status: { $in: ['active', 'cancelled', 'failed'] }`, makes a sequential `GET /subscription/<code>` for each, and then `continue`s for every `cancelled` record without using the answer (offline probe with stubbed model and client: record E `cancelled`, not saved). Expiry of cancelled plans is done by date in Task 2, so the calls are pure overhead that grows with every cancelled customer.
**Suggested fix:** Drop `'cancelled'` from the `$in`. Nothing current is lost (no cancelled record is ever changed by Task 1).
**Resolution:**
Fixed 2026-10-14 (round 2 candidate). The nightly reconcile now selects only `active` and `failed` plans; cancelled plans are no longer sent to Paystack (ended ones still expire in Task 2).
Closed 2026-10-14 by /audit independent (feature 21 round 2, target 6a37b79). Re-examined crons/reconcilePaystack.js:38-43: Task 1 selects `status: { $in: ['active', 'failed'] }`; Task 2 still expires ended cancelled plans by date (:74-77). Original defect gone. (The `failed` branch of the same loop has a separate defect, F-95.)

### 21/F-93 [P3] closed - Cancel disables the plan on Paystack only when Paystack says `active`, but marks it cancelled locally in every case

**File:** services/subscription.service.js:265-302
**Found:** 2026-10-14 by /audit independent (scope: current; lens: quality)
**Why it matters:** If our record is still `active` while Paystack already shows `attention` (a renewal failed and the `invoice.payment_failed` webhook or the nightly reconcile has not landed yet), the disable call is skipped, the record becomes `cancelled`, and the reply says "You have already cancelled your subscription". Paystack can still charge that subscription on its next attempt, and `handleRenewal` then turns the cancelled record back to `active`. Narrow (needs the status gap), so P3.
**Suggested fix:** Call `/subscription/disable` for any Paystack status except `non-renewing`, `cancelled` and `complete`, and only use the "already cancelled" text for those. Nothing current is lost.
**Resolution:**
Fixed 2026-10-14 (round 2 candidate). `cancelSubscription` disables on Paystack whenever Paystack would still charge — any status except cancelled / complete / non-renewing — so "attention" is covered; the reply treats it as a fresh cancellation. rolloverStaging scenario 9 (Paystack says attention → disable sent).
Closed 2026-10-14 by /audit independent (feature 21 round 2, target 6a37b79). Re-examined services/subscription.service.js:267-298 and :355-363: disable is called for every Paystack status except cancelled / complete / completed / non-renewing, a Paystack error returns a failure before anything changes locally, and the "already cancelled" reply is used only for those ended statuses. Original defect gone, no new one from the repair.

### 21/F-94 [P2] closed - The one-week grace for a failed renewal may never be reachable: nothing charges the customer within the week

**File:** util/subscriptionAccess.js:14-18, util/webhook.handler.js:381-390, services/subscription.service.js:250-259
**Found:** 2026-10-14 by /audit independent (scope: current; lens: quality)
**Why it matters:** Rule 3 keeps the rollover only when the failed renewal is paid within 7 days. The code applies it correctly when a renewal `charge.success` arrives, but the backend offers no way to pay a failed renewal now: cancel needs `active`, re-subscribing starts a new plan (no rollover, and see F-90), and the spec leaves Paystack's retry schedule unchanged. Paystack's published behaviour for an `attention` subscription is to retry on the next payment date (about a month later), which is always outside the week. If that holds for this account, a failed customer is blocked from booking until the next month and always loses the rollover. Not confirmed here: the reviewer could not check Paystack's live retry behaviour.
**Suggested fix:** Confirm Paystack's retry schedule for this account. If it retries only on the next payment date, agree with the client how a customer pays within the week (for example a "pay now" checkout that charges the plan amount and is applied as the renewal), then build it as a follow-up. Nothing current is lost.
**Resolution:**
Fixed 2026-10-14 (round 2 candidate), user decision 2026-10-14 ("re-subscribe keeps items"; the client is being asked to confirm). A failed renewal is paid by RE-SUBSCRIBING to the same plan through the normal checkout: `handleNormalSubscription` carries the failed same-plan record's leftovers (capped at half) when the new payment lands within 7 days of `failedAt`; a different plan, or after the week, starts fresh. `cancelSubscription` now also accepts a `failed` plan: it stops Paystack retrying the card, keeps the plan `failed` (not usable), and tells the customer the date by which re-subscribing keeps their items. The start-a-plan gate already allows a failed customer to subscribe. rolloverStaging scenario 10: cancel a failed plan → disabled on Paystack and told the date; re-subscribe after 2 days → 37; after 9 days → 25; a different plan → 40 (25/0).
Not closed 2026-10-14 by /audit independent (feature 21 round 2, target 6a37b79); status stays `fixed`. The re-subscribe path makes the week reachable (util/webhook.handler.js:806-821 carries from the newest failed same-plan record of this customer, capped at half, only within 7 days of `failedAt`; the claim at :274-290 stops a second apply; the failed record is then expired by `closeOtherPlans`, so it can't carry twice). But the repair's second half, letting a customer cancel a failed plan, introduced a new defect: the nightly reconcile turns that stopped plan into `cancelled` and expires it with 0 items the same night, so the date the cancel reply promises is not honoured (F-95). The same-plan, same-card re-subscribe also still double-bills (F-90, reopened). Close this once F-95 and F-90 are repaired and re-reviewed.
Fixed 2026-10-14 (round 3 candidate). The repair's side effect (F-95) is fixed: a cancelled failed plan stays failed with its leftovers until the keep-by date, so the re-subscribe carry is reachable through the whole week.
Closed 2026-10-14 by /audit independent (feature 21 round 3, target ca44a62). Re-examined: a failed customer can re-subscribe (services/paystack.service.js:87-91 blocks only `active`); `handleNormalSubscription` carries from the newest failed same-plan record, capped at half, only when `paid_at - failedAt <= 7 days` (util/webhook.handler.js:829-840, util/subscriptionAccess.js:14-18); the same-card case now gets a new record (F-90). Cancelling a failed plan (services/subscription.service.js:250-318) keeps it `failed` with `cancelledAt`, and the reconcile no longer touches failed plans (crons/reconcilePaystack.js:59), so the carry, banner and reminder stay valid through the week. Offline: `carriedItems` 25-plan, 20 left, +2 days → 12. Original defect gone. The number the failure texts promise is a separate finding (F-100).

### 21/F-95 [P2] closed - Cancelling a failed plan loses the leftovers that same night: the reconcile turns it `cancelled`, then expires it with 0 items

**File:** crons/reconcilePaystack.js:51-61 and :74-77; services/subscription.service.js:303-333
**Found:** 2026-10-14 by /audit independent (scope: current; lens: quality)
**Why it matters:** F-94's repair lets a customer cancel a failed plan. Cancel disables it on Paystack and keeps our record `failed`, and the reply says "To keep your leftover items, subscribe to the same plan again by <failedAt + 7 days>". At 03:00 the reconcile selects `failed` records, Paystack now answers `cancelled` (or `non-renewing`), which maps to `cancelled`. The only skips are `mapped === sub.status`, `sub.status === 'cancelled'` and failed → active, so the record is saved as `cancelled`. Its `currentPeriodEnd` is the failed charge's date, already past, so Task 2 in the same run sets it `expired` with `remainingItems: 0`. After that, `handleNormalSubscription`'s carry lookup (`status: 'failed'`, util/webhook.handler.js:810) finds nothing. The banner and the day-5 reminder (both need `status: 'failed'`) stop too. Offline probe with a stubbed model and Paystack client: a failed record, 20 items, stopped 1 day ago → after `reconcileSubscriptions()`: `expired`, 0 items, `{ checked: 1, updated: 1, expired: 1 }`. Wrong item balance and a broken promise on the documented path. A smaller variant: if `currentPeriodEnd` were still ahead (our generated first-month date can be later than Paystack's real charge time), the failed plan would briefly become a usable `cancelled` plan.
**Suggested fix:** In Task 1, leave a `failed` record's status alone unless Paystack says `attention` (extend the existing failed → active skip to every non-`failed` mapping; optionally stamp `cancelledAt`). It stays `failed` until a re-subscribe closes it. Nothing current is lost.
**Resolution:**
Fixed 2026-10-14 (round 3 candidate). The nightly reconcile skips every `failed` plan (whatever Paystack reports, cancelled included), so cancelling a failed plan no longer expires it that night; the leftovers, banner and day-5 reminder stay valid until the keep-by date. rolloverStaging scenario 11 (Paystack says cancelled → still failed, 20 items).
Closed 2026-10-14 by /audit independent (feature 21 round 3, target ca44a62). Re-examined crons/reconcilePaystack.js:44-72: `if (sub.status === "failed") continue;` (:59) runs before any write, so Task 1 never changes a failed plan, and Task 2 (:78-81) expires only `cancelled` plans. Considered whether a failed plan can now stay stuck in a harmful way: it is never usable (`usableFilter` admits only active / cancelled-in-period), booking refuses it, its leftover `remainingItems` are unreachable except through the in-week carry, the reminder query is bounded to the week (crons/renewalFailedReminder.js:24-29), the banner shows 0 items and a plain "subscribe again" text after the deadline (util/subscriptionAccess.js:76-84), and the next subscription expires it via `closeOtherPlans`. No harmful stuck state found. Original defect gone.

### 21/F-96 [P2] closed - The day-5 reminder goes out on day 6 for any failure after 10:00 Lagos, still saying "2 days left" when about one day is left

**File:** crons/renewalFailedReminder.js:18-24 (the `failedAt` window); util/subscriptionAccess.js:88-89 (`renewalReminderSms`)
**Found:** 2026-10-14 by /audit independent (scope: current; lens: quality)
**Why it matters:** The cron runs once a day at 10:00 and selects `failedAt <= now - 5×24h` (and within 7×24h). A failure after 10:00 is not yet 5 full days old at day 5's 10:00 run, so it is first picked up on day 6. The text is fixed: "Chuvi reminder: 2 days left. Subscribe again by <deadline day> …". Offline probe (stubbed model, failure on Mon 19 Oct): 09:00 → sent day 5, 1.96 days left; 11:00 → day 6, 1.04 days left; 15:00 → day 6, 1.21; 23:00 → day 6, 1.54, each saying "2 days left". Wrong customer message for most failures (Paystack failures land at any hour). It also misses the client's "on day 5". rolloverStaging scenario 11 tests 5.2 days of elapsed time, so it can't catch this.
**Suggested fix:** Select by the failure's Lagos calendar day: `failedAt >= daysAgo(5)` start and `< daysAgo(4)` start via `util/lagosDay.js` (failure day = day 0, so it sends on day 5 whatever the hour), keeping the `renewalReminderSentAt` latch and the `keepItemsBy > now` guard. Or drop the count from the text and keep only the date. Nothing current is lost.
**Resolution:**
Fixed 2026-10-14 (round 3 candidate). The reminder fires on the 5th CALENDAR day after the failure in Lagos (`calendarDaysSince(failedAt, now) === 5`, daily 10:00), so a failure at 09:00, 15:00 or 23:00 on Monday is reminded on Saturday, two days before the Monday deadline. rolloverStaging scenario 11 uses a fixed 15:00 failure (day 4 none, day 5 one, day 6 none).
Closed 2026-10-14 by /audit independent (feature 21 round 3, target ca44a62). Re-examined crons/renewalFailedReminder.js:20-35: `calendarDaysSince` diffs `startOfDay` from util/lagosDay.js (moment-timezone, Africa/Lagos, independent of process TZ; no DST, so `Math.round` over whole days is exact); the DB pre-filter `failedAt` in (now-7d, now-4d] always contains every calendar-day-5 failure at the 10:00 run (oldest: 00:00 day 0 = 5d10h; newest: 23:59 day 0 = 4d10h), and the `renewalReminderSentAt` latch keeps it once. briefCheck F-96 check passes (09:00 / 15:00 / 23:00 → 5). Original defect gone.

### 21/F-97 [P3] closed - A failed invoice on a replaced (expired) plan turns it back to `failed` and texts "your renewal didn't go through" to a customer who has a working plan

**File:** util/webhook.handler.js:744-748 (`handleInvoiceFailed`), :637-653 (`markFirstFailure`)
**Found:** 2026-10-14 by /audit independent (scope: current; lens: quality)
**Why it matters:** Both updates match on `subscriptionCode` alone, whatever the status. `closeOtherPlans` disables replaced plans on Paystack only as a best effort. If that call failed and Paystack later reports a failed charge on the old subscription, the `expired` record becomes `failed` with a fresh `failedAt`, and the new failure SMS ("Subscribe again to keep using your plan", 0 items) goes to a customer whose new plan is active. That record also shows up again in `cancelSubscription`'s `active|failed` lookup if it is newer. Needs a failed Paystack disable first, so P3.
**Suggested fix:** Add `status: { $in: ['active', 'failed'] }` to the `handleInvoiceFailed` update and to `markFirstFailure`'s filter. Nothing current is lost.
**Resolution:**
Fixed 2026-10-14 (round 3 candidate). `handleInvoiceFailed` and `handlePaymentFailed` skip an `expired` plan (and `markFirstFailure` only stamps a `failed` one), so a failed invoice on a replaced plan neither revives it nor texts the customer. rolloverStaging scenario 11.
Closed 2026-10-14 by /audit independent (feature 21 round 3, target ca44a62). Re-examined util/webhook.handler.js:583-598 and :747-775: both `findOneAndUpdate` filters add `status: { $ne: 'expired' }`, `handleInvoiceFailed` returns when nothing matched (no SMS, no bot notice), and `markFirstFailure` (:640-657) stamps only `status: 'failed', failedAt: null`. Original defect gone, no new one.

### 21/F-98 [P3] closed - `closeOtherPlans` waits on Paystack (no timeout) before it closes the old plans here

**File:** util/webhook.handler.js:612-632; services/paystack.client.service.js (axios instance has no `timeout`)
**Found:** 2026-10-14 by /audit independent (scope: current; lens: performance)
**Why it matters:** The new plan is saved first, so a Paystack failure never undoes it (good). But the local `updateMany` that expires the other plans runs only after a sequential GET and POST per old plan, and the webhook's 200 waits on all of it. A hung Paystack call delays the response (Paystack retries; the reference claim makes that harmless) and leaves the old plan usable meanwhile. Booking still picks the newest plan, so impact is small.
**Suggested fix:** Run the local `updateMany` before the Paystack loop (the loop already uses the `others` list it fetched), or give these calls a short timeout. Nothing current is lost.
**Resolution:**
Fixed 2026-10-14 (round 3 candidate). `closeOtherPlans` expires the old plans in our database FIRST, then calls Paystack with a 10-second timeout per call, so a slow Paystack can't leave two usable plans or hang the webhook.
Closed 2026-10-14 by /audit independent (feature 21 round 3, target ca44a62). Re-examined util/webhook.handler.js:603-636: the `updateMany` (:611-614) runs before the loop, which reads only the pre-fetched `others` (their pre-expiry `status`, so the `cancelled` skip still works); `paystackAxios` is a plain axios instance (services/paystack.client.service.js), so the per-call `{ timeout: 10000 }` config applies to GET and POST. The webhook still awaits these calls before its 200 (util/webhook.js:32), bounded at 20 s per old plan; normally one. Original defect gone.

### 21/F-99 [P2] closed - After a same-plan re-subscribe, My Plan can answer "Your subscription is no longer active, please subscribe again" to a customer who just paid, because the Paystack subscription is matched by plan code only

**File:** services/subscription.service.js:422-462 (`getCurrentSubscription`, `fetchedSubscriptions.find(... plan_code === subscription.paystackSubscriptionId)`)
**Found:** 2026-10-14 by /audit independent (scope: current; lens: quality)
**Why it matters:** Feature 21 makes re-subscribing to the SAME plan the designed way back from a failed renewal (F-94, and the client's banner button "opens the normal checkout for that plan"), and `closeOtherPlans` then disables the old Paystack subscription. The customer's Paystack record now holds two subscriptions with the same plan code: the old one (`cancelled` / `complete`, or `attention` if the disable call failed) and the new `active` one. `getCurrentSubscription` takes the FIRST plan-code match from Paystack's list and, since the new record is not `cancelled`, returns the failure "Your subscription is no longer active, please subscribe again…" whenever that first match is the old one. Offline probe (models and Paystack client stubbed, new record active with `SUB_new`): list order `[SUB_old (cancelled), SUB_new]` → `{ error: "Your subscription is no longer active…", statusCode: 400 }`; `[SUB_new, SUB_old]` → success. The result depends on Paystack's list order, which the code does not control, and it ignores the record's own `subscriptionCode`. The same match also backfills `subscriptionCode` / `paystackEmailToken` when the record has none (`subscription.create` arrived before `charge.success`, so it matched no record), so it can attach the OLD code, which breaks the next renewal (reported unapplied) and cancel. Booking is not affected (it uses `findUsableSubscription`). Pre-existing in kind (cancel-then-resubscribe to the same plan hit it before this feature), and this feature modified this exact block, but feature 21 turns it into the routine recovery path: wrong customer message and possibly wrong persisted code on a realistic input, so P2.
**Suggested fix:** Prefer the Paystack subscription whose `subscription_code === subscription.subscriptionCode`; only when the record has no code, fall back to a plan-code match that is not ended (`cancelled` / `complete` / `completed` / `non-renewing`), preferring the newest. Nothing current is lost.
**Resolution:**
Fixed 2026-10-14 (round 4 candidate). `getCurrentSubscription` matches the record's own `subscriptionCode` in the Paystack list first; only if it has none does it take the NEWEST subscription on that plan code that Paystack hasn't ended (not cancelled / complete / non-renewing). After a same-plan re-subscribe the old, switched-off subscription can no longer produce "no longer active" or be copied onto the new record. In briefCheck.
Closed 2026-10-14 by /audit independent (feature 21 round 4, target f653435). Re-examined services/subscription.service.js:424-472: `matchedSub` takes the record's own `subscriptionCode` from the fetched list first, else the newest plan-code match whose status is not cancelled / complete / completed / non-renewing, else null (no refusal, no backfill). Offline probe of the exact expression: record `SUB_new` with list `[SUB_old (cancelled), SUB_new]` → `SUB_new`; no code with `[SUB_old (cancelled), SUB_new]` → `SUB_new`; no code with `[SUB_new, SUB_old (attention, older)]` → `SUB_new`; no code with only the ended old one → null; own code whose fetch failed → falls to the non-ended plan-code match. The order dependence and the old-code backfill are gone; the refusal/backfill/save code below is unchanged. Residual (Remaining risk, not a defect of this repair): a reused CANCELLED same-plan, same-card record keeps its old disabled code until `subscription.create` rewrites it, so My Plan can refuse in that seconds-long window; plan-code matching had the same window.

### 21/F-100 [P2] closed - The failure SMS, the day-5 reminder and the My Plan banner promise the full unused count, but re-subscribing keeps at most half the plan

**File:** util/subscriptionAccess.js:63-88 (`unusedItems`, `renewalFailedMessage`, `renewalFailedBanner`, `renewalReminderSms`); used by util/webhook.handler.js:652 and crons/renewalFailedReminder.js:41
**Found:** 2026-10-14 by /audit independent (scope: current; lens: quality)
**Why it matters:** The texts say "Subscribe again by <date> to keep your <X> unused items", with X = `remainingItems` uncapped, and the banner returns `unusedItems` the same way. Re-subscribing within the week carries `min(remaining, floor(plan / 2))` (rule 1, `carriedItems`). Offline probe: 25-item plan, 20 left, failed 10 Nov 09:00 → SMS "…by Tuesday 17 November to keep your 20 unused items.", reminder the same, banner `unusedItems: 20`; re-subscribing two days later carries 12. Any customer with more than half the plan left at a failed renewal is told a number the system will not honour. rolloverStaging asserts the 20 ("keep your 20 unused items"), so it locks the wrong number in. The route doc for `renewalFailed` already says "(capped at half the plan)", which the value contradicts. Wrong customer message on a realistic input, so P2.
**Suggested fix:** Compute X as the capped carry: `Math.min(unusedItems(sub), Math.floor(plan.monthlyLimits / 2))` (populate or look up the plan for the SMS, reminder and banner), and update the staging assertion. If the client meant X to be the raw unused count, that is a wording decision for the client; the current text otherwise contradicts rule 1. Nothing current is lost.
**Resolution:**
Fixed 2026-10-14 (round 4 candidate). The failure SMS, the day-5 reminder and the My Plan banner now promise what re-subscribing actually keeps: the unused items capped at half the plan (`unusedItems(sub, plan.monthlyLimits)`; 20 unused on a 25-item plan → "keep your 12 unused items"). rolloverStaging and briefCheck now assert 12. If the client wants the raw count shown instead, that is a wording change.
Closed 2026-10-14 by /audit independent (feature 21 round 4, target f653435). Re-examined util/subscriptionAccess.js:63-101 and its three callers: util/webhook.handler.js:650-654 (failure SMS looks up the plan's `monthlyLimits`), crons/renewalFailedReminder.js:39-45 (reminder looks up the plan, claim latch unchanged), services/subscription.service.js:374-383 (banner populates `planId` with `monthlyLimits`; `planId?._id` still yields the id). Offline probe: `unusedItems` gives 12 for 20 of 25, 20 when the plan size is undefined or null (fallback), 0 for negatives; reminder text "keep your 12 unused items"; singular "1 unused item"; and an exhaustive parity sweep (plan sizes 0-60, remaining -2..70) shows the promised count equals `carriedItems` within the week in every case, so the texts now match what re-subscribing (and a Paystack retry through `handleRenewal`) carries. briefCheck 562/0 asserts 12. Original defect gone; no new defect.

## Independent review

**Status:** passed
**Target commit:** bdae43619eabf22f164e1435b6ee27349f89100b
**Base commit:** eed10261321f1ef832a2d900bffe04d74bd164be
**Base ref:** origin/main
**Spec hash:** 699dc79e5099201a31076bc243ab65362ca1e6767db727dffc6ff64807ae343b
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-14T15:00:00Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-14T17:32:51Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `eed1026..bdae436` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

Build-plan feature 21, round 5. Round 4 (`f653435`) PASSED with F-90..F-100 closed. Since then the
user asked for three risk fixes from round 4's Remaining risk (spec step 9): A — fetch the Paystack
code when a plan activates without one; B — adopt an unknown renewal code onto the customer's one
code-less plan; C — retry a refused switch-off nightly (`paystackDisablePending`). Review the whole
delta again with these. New findings start at F-101.

## Commands

- `git rev-parse HEAD` / `git merge-base origin/main HEAD` / `git status --porcelain`: pass (HEAD = target, merge base = base, only `blueprint/context/review.md` dirty)
- `sha256sum blueprint/context/current-feature.md`: pass (699dc79e…343b, tracked, matches)
- `git diff eed1026..bdae436` and `git diff f653435..bdae436`: reviewed (16 files; round-5 delta in util/webhook.handler.js, crons/reconcilePaystack.js, models/subscription.model.js, briefCheck.js, rolloverStaging.js)
- `node briefCheck.js`: pass (565 passed, 0 failed)
- Swagger envelope check (AGENTS.md): pass (wrong envelopes: 0)
- Module-load check of util/webhook.handler.js, crons/reconcilePaystack.js, crons/renewalFailedReminder.js (then process.exit): pass
- Offline stub probe of reconcile Task 2b (scratchpad probeC.js, models and Paystack client stubbed): pass
- Offline stub probe of handleRenewal adoption (scratchpad probeB.js): pass
- rolloverStaging.js / booking staging suites / boot on PORT=7999: unavailable (DB-backed; not run by instruction)

## Evidence

- Freshness: HEAD bdae436…, `git merge-base origin/main HEAD` = eed1026…, spec SHA-256 699dc79e… matches, no other dirty path.
- Fix B (util/webhook.handler.js:342-363): adoption only when the code matches no record; candidates are restricted to the signed payer's `userId`, code-less (`$in:[null,'']`), status `active|cancelled|failed` (never `expired`, so a replaced plan cannot adopt, and F-90's expired refusal at :375 still guards the found-by-code path), and `paystackSubscriptionId` = the event's `plan.plan_code` when present; exactly one candidate required; the write is guarded on the code still being empty, so a concurrent adoption cannot overwrite. After adoption the normal path runs: the unique-reference Payment row (:380-401) keeps it once-only. Probe: one candidate on a 25-item plan with 20 left → 37 items, `rolledOverItems` 12, saved; two candidates → not saved, reported to an admin.
- Fix A (util/webhook.handler.js:669-710, called at :953 and :986 after `closeOtherPlans`): returns early if the record already has a code; reads only the signed customer's code (`data.customer.customer_code`, else the stored one); skips any code already on ANY record (global `taken` set, backed by the unique sparse index on `subscriptionCode`), skips ended statuses, requires the same plan code, picks the newest by `createdAt`; write guarded on the code still being empty, so a racing `subscription.create` is never overwritten. The old switched-off subscription of a replaced plan is excluded both as ended and as taken (it stays on the expired record).
- Fix C (util/webhook.handler.js:653-658; crons/reconcilePaystack.js:63-92): the flag is set only in `closeOtherPlans`' catch for records that the same call just expired; no path sets an expired record back to active (grep of `status = 'active'` / `status: 'active'` writers: only handleRenewal (refuses expired), handleNormalSubscription (filter excludes expired) and the create path). Probe: three pending records — Paystack timeout on A (stays pending, loop continues), B `active` → disable posted and flag cleared, C `non-renewing` → no post, flag cleared; summary disableRetried 1, disableCleared 2.
- F-90..F-100 repairs re-read on the target: unchanged and not bypassed (expired never revived; failed/expired never reused by create or first charge; local close before Paystack calls; My Plan matches own code first; texts use the capped count).
- Spec step 9 deliverables A, B, C present; D (auto-refund) correctly left as an admin report pending the client.

## Findings

- F-101 [P3] open: A and B have behavioural staging checks only for their accept paths; refusal paths are source-regex only.
- F-102 [P3] open: Paystack "ended" status list (6 copies) and the get-then-disable sequence (3 copies) are duplicated.
- No P0, P1 or P2 finding open, fixed or unverified.

## Remaining risk

- rolloverStaging.js (builder reported 37/0), the booking staging suites and the PORT=7999 boot were not run in this review (DB-backed; disallowed). DB behaviour of A/B/C is confirmed only by reading and offline stub probes.
- Paystack-live unknowns: whether `GET /customer/<code>` lists every subscription (including just-created ones) with `subscription_code`; whether `GET /subscription/<code>` returns `plan.plan_code` and `createdAt`; whether a renewal `charge.success` always carries `plan.plan_code` (without it, B adopts onto the customer's single code-less plan of any plan code).
- If `subscription.create` never arrives and A's fetch fails, a code-less plan still relies on B at first renewal; a reused same-plan, same-card cancelled record keeps its old code (A skips records that already have a code), so its new subscription's renewals would be reported unapplied (pre-existing window noted in F-99's residual).
- B edge: if a customer had an earlier code-less plan whose Paystack subscription was never switched off (code-less plans cannot be disabled) and then a new code-less plan on the same plan code, an old-subscription renewal can be adopted by the new plan. Requires two consecutive code-less plans; also pre-launch Paystack subscriptions whose records were cleared on 16 Oct could be adopted this way if still live.
- Two concurrent deliveries of the same unknown-code renewal can race so that the loser writes the unapplied row first and the winner then sees 11000 and stops: the renewal is reported to an admin instead of applied (never applied twice).
- Webhook latency: `closeOtherPlans` (up to 2 x 10 s per old plan) plus `attachPaystackCode` (1 + one 10 s call per customer subscription) run before the webhook's 200; a Paystack retry is idempotent (reference claim), but a slow Paystack delays the reply.
- Task 2b retries a permanently failing Paystack GET (for example a code Paystack no longer knows) every night with only a log line, and it clears the flag without disabling if Paystack returns 200 with no data body.
- Automatic refund of a charge on a replaced plan (spec 9D) awaits the client; such charges are admin-reported only.
- No unit test runner exists; briefCheck checks for A/B/C are source-text matches.
