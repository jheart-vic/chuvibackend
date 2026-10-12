# Fix: Quick Booking nothing paid at booking

**Type:** Fix
**Status:** verified
**Branch:** `fix/quick-booking-nothing-paid-at-booking`

Launch work item 2 of 9 (client message of 11 Oct, item 3). The client's words: "Quick
Booking means: the customer books, we pick up, count, price and send the bill. Nothing is
paid at booking, not even pickup and delivery. Those fees go on the SMS bill, because the
free pickup and delivery offer can only be checked after counting." The missing Book
button and the new line under the number box are frontend work.

## The problem

| Where | Today |
|---|---|
| Booking (`postBookOrder`, pay-per-item branch, count-only) | The laundry is priced at ₦0, but pickup, delivery and the speed charge are still put on the order (`amount` = fees), so the app shows a payment step. A customer who opted in also has reward credit spent against those fees, and a selected offer is attached to a ₦0 basket. |
| Intake re-price (`_repriceForItems` → `_priceWithOffers` → `validateAndPrice`) | Adds the trips and speed and re-runs offers, which is right. But a personal offer **already attached to this same order** is rejected ("Offer already applied to an order"), so it silently drops off the bill. A customer who chose nothing gets no offer at all: the agreed Quick Booking auto-apply (`pickBestPersonalOffer`, client item #6(b), including the 8 Oct "First Experience always wins" ruling) has no caller. An offer that does apply at re-price is never attached, so it stays reusable. |
| Anytime refund at rider pickup (`settleAnytimeRefund`) | A Quick Booking with an Anytime pickup served inside a window gets the difference credited to the wallet, though nothing was paid. |
| Intake Quick Booking queue | `logisticsAmount` is described as "already owed". After this fix it is what the bill will add, before offers. |

Not a problem: the rider's pickup is not blocked by an unpaid order (the payment gate is at
tagging, `util/paymentGate.js`), and unpaid reminders start only once Intake raises the
payment hold.

## The fix

1. **Booking: nothing charged.** In the pay-per-item branch, a count-only booking
   (`post.quickBooking`) stores `amount: 0`, stays payment-pending, spends no credit
   and attaches no offer. Its customer, promotion and offer choices stay on the order
   (`customerOfferId` / `promoOfferId` / `useCredit`) for the re-price. `deliveryAmount`
   keeps the trip and speed fees as information for Intake. The success response says so
   (`paymentRequired: false` and a "you pay nothing now" notification body). Normal
   bookings are unchanged.
2. **Re-price keeps and picks the offer.**
   - `validateAndPrice` accepts an optional `draft.orderId`. A personal linkage attached
     to that same order is treated as applicable, not "already applied". Every other
     committed linkage is still rejected.
   - `_repriceForItems` passes `orderId`. For a Quick Booking with no `customerOfferId`,
     it first asks `pickBestPersonalOffer` with the real basket (the existing auto-apply,
     First Experience override included) and prices with that offer.
   - `applyItemEdit` attaches the personal offer and promotion that actually applied to
     the order (the same `_attachOffersToOrder` booking uses; attaching to the same order
     is a no-op). This step applies to normal bookings too: an edited normal order no
     longer loses its attached offer.
3. **Anytime refund on an unbilled Quick Booking.** When the order still has
   `itemsPending` and is not paid, `settleAnytimeRefund` lowers `scheduling.<leg>.fee` by
   the refund amount instead of crediting the wallet, and records the decision the same
   way ("Served inside a window, so the bill charges the window price."). The re-price
   reads that fee, so the SMS bill charges the window price. Paid orders are unchanged.
4. **booking-options on a count:** when the draft is a Quick Booking (`itemCount`
   with no `items`), `feesLine` is a single `quick-booking` row: "You pay nothing now.
   Pickup and delivery are added to your bill after we count, and any free pickup and
   delivery offer is checked then." This replaces an "Add ₦X more" line worked out from
   an empty basket.

Must not break: normal pay-per-item, wallet and subscription bookings; the item edit on
a normal order (only the offer handling changes); the payment hold and SMS at Intake.

**Found during build (fixed in scope):**

- The order schema is strict and has no `customerOfferId` / `promoOfferId`, so the
  booking's offer choice was never stored and `_repriceForItems` read `undefined`:
  **every edited order lost its personal offer and promotion**, not only attached ones.
  The re-price now finds the order's offers through their `CustomerOffer` linkages
  (`orderId`, status attached). So a Quick Booking's own `customerOfferId` /
  `promoOfferId` / `useCredit` are not carried to Intake (there is nowhere to keep
  them); the auto-apply picks the offer, as client item #6(b) intends.
- The auto-apply runs again on **every** edit of a Quick Booking before tagging. If
  Intake first counts below the Welcome Offer's minimum (another offer is picked) and
  then corrects the count, the Welcome Offer replaces the earlier pick, which is
  released. Keeping the first pick would have lost the Welcome Offer for good.
- The re-price charged the order's window/Anytime trip fee but, when an offer waived the
  trip, took off the flat setting fee. It now takes off the fee the order is charged.

**Found by the independent review (round 1, changes-requested), fixed in scope:**

- **F-18 [P0], live before this work:** `postBookOrder` built the order as
  `{ amount: totalPrice, …, ...post }`, so the request body overwrote any field: a
  customer could send `amount: 100` (Paystack then charged ₦100), `paymentStatus:
  "success"` (an unpaid order marked paid) or another `userId`. The order now saves only
  an allow-list of the customer's fields (`CUSTOMER_ORDER_FIELDS`).
- **F-17 [P1]:** the same-order offer exception read `orderId` from the draft, which is
  the request body on every customer path, so an offer attached to one order could be
  spent again on another. It is now a server-only `repriceOrderId` argument.
- **F-19:** a client-sent `quickBooking: true` zeroed a normal booking. The server-set
  Quick Booking fields are stripped from the body and the rule uses `countOnly`.
- **F-21:** a released promotion linkage became a reusable personal reward; it is now
  removed (cancellation included).
- **F-22:** the unbilled Anytime branch claims the refund atomically.
- **F-20 [P2], builder default — confirm with the client:** an offer attached at booking
  is honoured at the re-price even if it expired or was paused since (personal and
  promotional); its basket rules are still checked against the real count. Before, it was
  dropped and the bill went up.

**Round 2 (after the booking hotfix, branch `fix/booking-body-cannot-set-server-fields`):**

- **Ported from the hotfix:** booking items are priced from the catalog
  (`util/catalogItems.js`, identical to the hotfix), only `type` / `quantity` /
  `serviceTier` / `fromSet` are kept, a quantity that is not a whole number ≥ 1 is
  refused, unknown items and unknown service types are refused, the heavy-item check uses
  the catalog key, and `channel: "office"` is dropped. The booking staging scripts that
  used made-up items now use catalog items (testingdb now holds production's catalog).
  The hotfix lands on `main` first; this branch will conflict on the same lines and is
  resolved by keeping this version.
- **Also ported from the hotfix (its rounds 3–4):** at most 200 pieces per booking, a
  real basket drops any stray `itemCount`, and a plan order counts PIECES against the
  items left this month (⚠️ subscriber behaviour change — a line of 3 shirts now uses 3
  plan items, not 1 — confirm with the client).
- **Plan items claimed atomically (hotfix F-28 [P2], fixed here):** the plan's items are
  taken with a conditional `$inc` just before the order is created, and given back if the
  order save or the wallet fee fails, so parallel bookings cannot spend the same items.
  testingdb probe: three parallel 2-piece bookings against 2 items left → 1 booked, 0 left.
- **Round 2 review (changes-requested) repairs:**
  - **F-24 [P1]:** a customer could pay an uncounted Quick Booking at ₦0 (wallet), which
    marked it paid, so Intake's real bill was refused as "already paid". New
    `orderPayableGate`: an order still waiting for its items is not payable — wallet,
    Paystack order init and the assistant's "use my balance" check it first.
  - **F-20 (again):** the Quick Booking re-pick also lists the offer already attached to
    that order, so it survives the linkage's expiry.
- **Round 3 passed; non-blocking findings fixed at the user's request (round 4):**
  - **F-30 [P2, pre-existing]:** a paid order whose bill went up at the item edit stayed
    "paid" and the difference was never collected. New `balanceDue`: such an order goes
    back to unpaid owing only the difference; the hold, Paystack, the wallet and the
    assistant collect `amountDue`; settling clears it; a cancelled part-paid order refunds
    what was paid. The wallet payment now also releases the payment hold, as Paystack does.
  - **F-29:** the personal-offer list skips promotion linkages.
  - **F-31:** staff transfer approval checks `orderPayableGate`.
  - **F-32 (the hotfix's F-19):** the staff counter booking keeps only the order's own
    fields from its request.
- **Round 4 passed; its non-blocking findings fixed (round 5):**
  - **F-33 [P2]:** a second edit while a hold was open kept the old amount and link, and
    the card webhook never checked what was paid. The edit now clears an open hold before
    raising one for what is owed now; the webhook settles against the amount Paystack
    collected (short → the rest stays due with a fresh hold; over → excess to the wallet;
    a separate payment on an already-paid order → refunded to the wallet). Also fixed: the
    webhook's missing-Payment fallback dropped payments (required `type` never set).
  - **F-34 [P3]:** admin mark-paid clears the balance; Paystack refuses an order already
    paid.
- **Round 5 (changes-requested) repairs (round 6):**
  - **F-35 [P1]:** repairing the webhook's missing-Payment fallback (round 5) made it
    run, and it then credited a wallet top-up from metadata the payer controls (a ₦100
    checkout opened with the public key could credit ₦1,000,000 to anyone). Now a payment
    with no checkout of ours is never processed (admin alerted), and top-ups credit what
    Paystack collected, only to the payer.
  - **F-36 [P2]:** the reference is claimed atomically; a payment on an order already paid
    is flagged to admins instead of auto-refunded (a late retry of the same money looks
    identical to a real second payment).
  - **F-37 [P3]:** replacing a hold is quiet (no "payment received") and keeps the
    original reminder/escalation clock.
- **Round 6 (changes-requested) repairs (round 7):**
  - **F-38 [P1, pre-existing — also on `main`]:** the webhook acted on the event's own
    metadata, so a pending row that was never a real card checkout (a refused top-up, a
    bank-transfer proof) could be re-used by a public-key checkout to activate any plan for
    ₦100. Now the event must match OUR checkout (type, owner, order; not refused, not a
    bank-transfer proof), and a first subscription charge must cover the recorded plan's
    price. Refused checkouts are marked `failed`; top-ups under ₦100 are refused.
  - **F-39 [P3]:** checkouts record the amount asked for; the webhook never credits more
    (a fee the customer bore is not credited).
- **Round 7 (changes-requested) repairs (round 8):**
  - **F-40 [P1]:** round 6's "only payments we started" rule refused every Paystack
    renewal (Paystack creates those charges itself, so no checkout row exists). A charge
    carrying Paystack's subscription code is now a renewal, matched to OUR subscription
    for the payer and claimed once.
  - **F-41:** pending checkout rows are kept 7 days (the cron deleted them after 1),
    past the payment-hold link window.
  - **F-42:** a first subscription charge is checked before it is recorded, against the
    amount its checkout asked for, so a later price edit does not lose a paid plan.
  - **F-43:** the plan activated is the verified one, not the event's.
  - **F-44:** a `charge.failed` row still accepts a successful retry.
- **Round 8 (changes-requested) repairs (round 9):**
  - **F-45 [P1, pre-existing — also on `main`]:** `POST /subscription/subscribe-plan`
    saved an active plan with its full allowance and no payment. It is switched off
    (always refused, "subscribe through checkout"); plans start only through the Paystack
    checkout. The user confirmed the app never calls it (2026-10-12).
  - **F-46 [P2]:** a renewal the webhook cannot apply (unknown code, another customer's
    subscription, or the refresh failing) is recorded once as an unapplied Payment, an
    admin is alerted, and the customer gets an in-app notice (user-approved wording):
    "We've received your plan renewal payment of ₦X and our team is confirming it. Your
    plan will be updated shortly." It never says the plan renewed.
- **Round 9 (passed) P3 follow-ups (round 10), done on this branch at the user's request:**
  - **F-49 [P3, pre-existing — also on `main`]:** `util/webhook.js` called
    `handleChargeFailed` without importing it, so every `charge.failed` returned 500 and
    Paystack kept resending. Now imported. It marks only OUR pending card checkout
    `failed` (never a bank-transfer proof, never a paid row; a failed row still accepts a
    paid retry, F-44) and tells only the customer on our row, once, never anyone named in
    the event's metadata. The customer is told on WhatsApp (as before), plus, user-approved
    2026-10-12, an in-app notice and an email, sent immediately (payment messages are
    outside the follow-up send windows): "We couldn't complete {your payment for order
    OSC…| your wallet top-up | your plan payment} of ₦X ({Paystack's reason}). Please try
    again from the app, or choose another payment method."
  - **F-48 [P3]:** the loyalty-reward notice ("we've added N extra items") is sent only
    after the renewal is saved, so a failed save no longer promises pieces that were not
    added.
- **F-16:** the window-only fees line appears only for a leg a window could free.
- **F-07** (wrong comment) fixed; **F-08** headers moved. F-06/F-08's source-text checks
  wait for a test runner.

## Build steps

1. [x] **Booking charges nothing.** Step 1 above, plus the Intake queue comment.
   **Done when:** a count-only booking is created with `amount: 0`, `paymentStatus`
   pending, no credit spent and no offer attached, and a normal pay-per-item booking
   still charges its fees.
2. [x] **Re-price keeps and picks the offer.** Step 2 above.
   **Done when:**
   - a Quick Booking whose items are entered gets the free-trip offer once the basket
     meets its minimum, and that offer is attached to the order
   - a first-order customer with a First Experience offer gets it auto-applied
   - an edited normal order keeps the offer it was booked with
3. [x] **Anytime refund and booking-options.** Steps 3 and 4 above.
   **Done when:** an unbilled Quick Booking served inside a window has its leg fee lowered
   and no wallet credit, a paid order still gets the wallet refund, and booking-options
   returns the `quick-booking` line for an `itemCount` draft.
4. [x] **Swagger:** `paymentRequired` on the booking response and the `quick-booking`
   `feesLine` type. **Done when:** the envelope check reports 0 wrong envelopes.
5. [x] **Round-8 repairs (F-45, F-46).** **Done when:** `subscribe-plan` refuses and
   creates nothing; an unapplicable renewal is recorded once as unapplied with one admin
   alert and one customer notice; a normal renewal still refreshes the plan.
6. [x] **Round-9 follow-ups (F-48, F-49).** **Done when:** a signed `charge.failed`
   answers 200, marks our pending card checkout failed and tells its owner once (WhatsApp,
   in-app, email), and nobody else; a resend, an unknown reference, a bank-transfer proof
   and a paid row change nothing; a month-3 renewal whose save fails sends no loyalty
   notice, and one that saves sends it once.

## Verify

- briefCheck: offline assertions for the booking amount rule, the same-order linkage
  rule in `_offerRejection`, the Anytime fee-lowering branch and the `quick-booking` line.
- A staging scenario on testingdb: book a Quick Booking (nothing charged), enter items
  below and above a free-trip offer's minimum (offer applied and attached, payment hold
  raised for the right total), a First Experience auto-apply, an Anytime pickup served
  in a window, and a normal order edit keeping its offer.
- Boot on `PORT=7999`.
- **Results (2026-10-12, round 10):** briefCheck 462/0 · F-48/F-49 probe 15/0 on testingdb
  (signed events through `util/webhook.js`; bot push and Brevo captured in-process, nothing
  sent) · F-45/F-46 probe 15/0 · quickBookingStaging 67/0 (Brevo key blanked) · plan
  probe 5/5 · Swagger 0 wrong · boot on 7999 ok (unsigned webhook → 401).
- **Results (2026-10-12, round 9):** briefCheck 462/0 · F-45/F-46 probe 15/0 on testingdb
  (subscribe-plan refused, nothing created; unknown-code, other-customer and claimed-row
  renewals recorded as unapplied with an admin alert and the customer notice; a repeat
  event adds nothing; a normal renewal refreshes to the full allowance) ·
  quickBookingStaging 67/0 · plan probe 5/5 · Swagger 0 wrong · boot on 7999 ok
  (unauthenticated subscribe-plan → 401).
- **Results (2026-10-12, round 8):** briefCheck 462/0 · quickBookingStaging 67/0 (16:
  renewal refreshes once, a renewal by another payer refused, a price edit after checkout
  still activates, an underpaid plan charge stays pending, a failed-then-retried payment
  is credited) · plan probe 5/5 · itemEdit 20/0 · bookingContext 30/0 · subLogistics 20/0
  · counterPayment 51/0 · dispatch 80/0 · handoff 54/0 · phase12 14/0 ·
  dashboardDecisions 45/0 · tierPricing 33/0 · freeLogistics 23/0 · dispatchTag 46/0 ·
  holds 48/0 · windowBooking 35/0 · Swagger 0 wrong · boot on 7999 ok.
- **Results (2026-10-12, round 7):** briefCheck 458/0 · quickBookingStaging 61/0 (15:
  re-used bank-transfer / top-up rows and an underpaid plan checkout activate nothing; a
  fee-inclusive charge credits only the amount asked for) · plan probe 5/5 · itemEdit 20/0
  · bookingContext 30/0 · subLogistics 20/0 · counterPayment 51/0 · dispatch 80/0 ·
  handoff 54/0 · phase12 14/0 · dashboardDecisions 45/0 · tierPricing 33/0 ·
  freeLogistics 23/0 · dispatchTag 46/0 · holds 48/0 · windowBooking 35/0 · Swagger 0
  wrong · boot on 7999 ok.
- **Results (2026-10-12, round 6):** briefCheck 456/0 · quickBookingStaging 59/0
  (13: atomic claim + flag-not-refund; 14: forged / mismatched / genuine top-ups; 11:
  replaced hold keeps its clock, no false receipt) · plan probe 5/5 · itemEdit 20/0 ·
  bookingContext 30/0 · subLogistics 20/0 · counterPayment 51/0 · dispatch 80/0 · handoff
  54/0 · phase12 14/0 · dashboardDecisions 45/0 · tierPricing 33/0 · freeLogistics 23/0 ·
  dispatchTag 46/0 · holds 48/0 · windowBooking 35/0 · Swagger 0 wrong · boot on 7999 ok.
- **Results (2026-10-12, round 5):** briefCheck 453/0 · quickBookingStaging 56/0
  (11: second edit refreshes the hold; 13: webhook short / remainder / duplicate) · plan
  probe 5/5 · itemEdit 20/0 · bookingContext 30/0 · subLogistics 20/0 · counterPayment
  51/0 · dispatch 80/0 · handoff 54/0 · phase12 14/0 · dashboardDecisions 45/0 ·
  tierPricing 33/0 · freeLogistics 23/0 · dispatchTag 46/0 · holds 48/0 · windowBooking
  35/0 · Swagger 0 wrong · boot on 7999 ok.
- **Results (2026-10-12, round 4):** briefCheck 450/0 · quickBookingStaging 52/0
  (scenarios 11–12 cover F-30 and F-31) · plan probe 5/5 · itemEdit 20/0 · bookingContext
  30/0 · subLogistics 20/0 · counterPayment 51/0 · dispatch 80/0 · handoff 54/0 · phase12
  14/0 · dashboardDecisions 45/0 · tierPricing 33/0 · freeLogistics 23/0 · dispatchTag
  46/0 · holds 48/0 · windowBooking 35/0 · Swagger 0 wrong · boot on 7999 ok.
- **Results (2026-10-12, round 3):** briefCheck 444/0 · quickBookingStaging 45/0
  (scenarios 9–10 cover F-24 and F-20) · plan probe 5/5 · itemEdit 20/0 · bookingContext
  30/0 · subLogistics 20/0 · counterPayment 51/0 · dispatch 80/0 · handoff 54/0 · phase12
  14/0 · dashboardDecisions 45/0 · tierPricing 33/0 · freeLogistics 23/0 · dispatchTag 46/0
  · Swagger 0 wrong · boot on 7999 ok.
- **Results (2026-10-12, round 2 final):** briefCheck 441/0 · plan probe 5/5 (incl. the
  parallel race) · quickBookingStaging 40/0 · subLogistics 20/0 · itemEdit 20/0 ·
  bookingContext 30/0 · handoff 54/0 · dispatch 80/0 · phase12 14/0 · dashboardDecisions
  45/0 · tierPricing 33/0 · freeLogistics 23/0 · dispatchTag 46/0 · counterPayment 51/0 ·
  Swagger 0 wrong · boot on 7999 ok.
- **Results (2026-10-11, round 2):** briefCheck 437/0 · quickBookingStaging 40/0 ·
  itemEdit 20/0 · bookingContext 30/0 · subLogistics 20/0 · handoff 54/0 · dispatch 80/0 ·
  phase12 14/0 · dashboardDecisions 45/0 · tierPricing 33/0 · freeLogistics 23/0 ·
  dispatchTag 46/0 · counterPayment 51/0 (all on testingdb, SMS/Paystack stubbed) ·
  Swagger 0 wrong · boot on 7999 ok.
- **Results (2026-10-11, after the review fixes):** briefCheck 425/0 ·
  `quickBookingStaging.js` 39/0 on testingdb (SMS and Paystack stubbed; scenarios 6–8
  cover F-18/F-19, F-17 and F-21) · `itemEditStaging.js` 20/0, `subLogisticsStaging.js`
  20/0, `tierPricingStaging.js` 14/0 (all stubbed) · Swagger 0 wrong envelopes · boot on
  7999 ok. `windowBookingStaging.js` 30/3: the 3 fail because
  "tomorrow" is Monday 12 Oct, a non-working day (`not-working-day`), in window
  availability reporting this fix does not touch. `freeLogisticsStaging.js` skipped
  (no item catalog on testingdb).
- **Independent review is required:** this changes when money is taken and how offers
  attach.

## Frontend impact (to send them)

- A Quick Booking returns `paymentRequired: false`: show no payment step. The bill comes
  by SMS after Intake counts.
- booking-options with `itemCount` returns `feesLine.type: 'quick-booking'` with its message.
- `POST /subscription/subscribe-plan` is switched off (always 400, "Please subscribe to a
  plan through checkout."). Plans start only through `POST /user/initialize-payment`
  with `transactionType: subscription`, which the app already uses.
- A new in-app notification, "Plan renewal payment received" (`type: payment-update`),
  can arrive when a renewal could not be applied automatically.
- A new in-app notification, "Payment not completed" (`type: payment-update`, `subBody`
  "Reference …"), arrives when a card payment fails. The customer is also emailed.
- The line under the number box is theirs (client's wording): "Between 1 and 200. You pay
  nothing now. After we count your clothes, we send your bill by SMS, with pickup and
  delivery included."


<!-- blueprint:completion {"schemaVersion":2,"specBytes":23399,"specSha256":"422316532e26821e04a96c719eddbd00d622b24c7cc6a921768dff6be5d52c39","branch":"refs/heads/fix/quick-booking-nothing-paid-at-booking","head":"fd27df86b3f5027c85ff1c903c9f907e0f0070cf","baseRef":"refs/heads/main","baseCommit":"ddbb3ba3876340b08ab571bdf8e8b8e8b4c633b0","sourceTree":"91d7c74dde8c45c7b2a58c1f7adfd3fa940b24cd","landing":"pull-request","absentOptional":[]} -->

## Findings

### quick-booking-nothing-paid-at-booking/F-07 [P3] closed - The getBookOrder comment and the spec say the intake route shares this handler; it does not

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
**Resolution:** Fixed 2026-10-11. The comment now says staff apps read any order through this route and that the intake route uses its own handler (`IntakeUserService.getBookOrder`). Closed 2026-10-12 by /audit independent (round 2): the comment at services/bookOrder.service.js:2720 now matches the routes.

### quick-booking-nothing-paid-at-booking/F-16 [P3] closed - The window-only fees line says "Choose a time window" when a window cannot help

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
**Resolution:** Fixed 2026-10-11. `buildFeesLine` gives the window-only line only for a leg a window could free: booked (fee > 0) and not forced to Anytime by the same-day rule (`getBookingOptions` passes `pickupForcedAnytime`). briefCheck drives forced, ₦0 and real cases. Closed 2026-10-12 by /audit independent (round 2): `buildFeesLine` (offer.service.js:710) gates keptPickup on fee > 0 and `!pickupForcedAnytime`, keptDelivery on fee > 0; display-only, the bill is unaffected.

### quick-booking-nothing-paid-at-booking/F-17 [P1] closed - A customer can send `orderId` in a booking to reuse an offer attached to another order

**File:** services/offer.service.js:964
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** `_offerRejection` reads the new same-order exception from
`draft.orderId`, and every customer path passes the raw request body as the draft:
`postBookOrder` spreads `req.body` into `validateAndPrice` through `_priceWithOffers`
(services/bookOrder.service.js:785), on both the pay-per-item and pay-from-wallet branches.
`offerApi.validateOffer` and `bookingOptions` (services/offerApi.service.js:503, 517) do the
same. A customer with an undelivered order A that holds personal offer L can book order B
with `{ customerOfferId: L, orderId: A }`. The committed check and the capacity check are
skipped, so B is charged the discount. `attachToOrder` then throws "already applied", but that
throw is swallowed as non-fatal, so B keeps the discount and A redeems L as well. A promotion
works the same way through the `exists({ offerId, userId, orderId })` check: it skips the
usage limit and `oneUsePerCustomer`, and `attachPromoToOrder` then adds a second linkage and
pushes `usedCount` past the limit.
**Suggested fix:** Do not read the exception from the draft. Pass the re-priced order id to
`validateAndPrice`/`getBookingOptions` as a separate trusted argument that only
`_repriceForItems` sets. Or delete `orderId` from the customer drafts in `postBookOrder`,
`validateOffer` and `bookingOptions`. Add a briefCheck case for a customer draft that carries
another order's id.
**Resolution:** Fixed 2026-10-11. The same-order exception is a separate `repriceOrderId` argument on `_offerRejection` / `validateAndPrice` / `getBookingOptions` / `pickBestPersonalOffer`, set only by `_repriceForItems` (`_priceWithOffers({ repriceOrderId })`); `draft.orderId` is never read. briefCheck (smuggled orderId refused) and quickBookingStaging scenario 7 (a second booking with `{customerOfferId, orderId}` pays the pickup, offer reported "already applied"). Closed 2026-10-12 by /audit independent (round 2): no code reads `draft.orderId`; `repriceOrderId` is passed only from `_repriceForItems` (bookOrder.service.js:951, 970); offerApi `validateOffer`/`bookingOptions` pass no third argument.

### quick-booking-nothing-paid-at-booking/F-18 [P0] closed - A booking body can overwrite the order's amount, paymentStatus and userId (pre-existing, outside this delta)

**File:** services/bookOrder.service.js:1918
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** Found while tracing the booking money path. It was not introduced by
4dbdc53..8556076. The pay-per-item branch builds
`{ userId, oscNumber, amount: totalPrice, deliveryAmount, stage, ... , ...post, deliveryDate }`,
so any key in `req.body` overwrites the computed value. `validateData` checks only the listed
keys and strips nothing. A customer who sends `amount: 100` gets a ₦100 order, and Paystack
charges `order.amount * 100` (services/paystack.service.js:85). A customer who sends
`paymentStatus: "success"` gets an order already marked paid, which opens `itemTagGate`. The
same spread sits after `amount`/`paymentStatus` in the pay-from-wallet branch (line 2085) and
the subscription branch (line 1763). There, `userId`, `oscNumber` and `stage` can also be
overwritten.
**Suggested fix:** Spread `post` first and put the computed fields after it, or build the
order from an allow-list of customer fields. Fix this in its own change, not in this one.
**Resolution:** Fixed 2026-10-11. `postBookOrder` saves only the `CUSTOMER_ORDER_FIELDS` allow-list from the body (`customerOrderFields(post)` in all three order literals), so amount, payment status, owner, stage, pricing and every other server field are the server's. briefCheck and quickBookingStaging scenario 6 (`amount: 100`, `paymentStatus: success`, another `userId` all ignored). subLogisticsStaging 20/0, itemEditStaging 20/0, tierPricingStaging 14/0 unaffected. Closed 2026-10-12 by /audit independent (round 2): all three order literals use `customerOrderFields(post)` and no `...post` reaches an order; items are rebuilt from `CUSTOMER_ITEM_FIELDS` with catalog prices (offline probe: `qcStatus`, `price: 1` dropped). A related but separate path to a forged paid state is F-24.

### quick-booking-nothing-paid-at-booking/F-19 [P2] closed - A client-sent `quickBooking: true` zeroes a normal booking's bill

**File:** services/bookOrder.service.js:1881
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** The new "nothing charged" rule checks `post.quickBooking === true`, which
the body can carry, instead of the server-computed `countOnly` (line 1384). A normal booking
with real items plus `quickBooking: true` is created with `amount: 0`, no fees, no offer and
no payment step. The tag gate still stops it as unpaid. But it is not `itemsPending`, so it
does not appear on Intake's Quick Booking card, and it sits unbilled until somebody edits its
items. (F-18 already allows worse, but fixing F-18 would leave this hole open.)
**Suggested fix:** Use `const quickBooking = countOnly` (or set `post.quickBooking` only
inside `applyCountOnlyBooking` and delete any client value before it runs).
**Resolution:** Fixed 2026-10-11. `quickBooking` / `itemsPending` / `counts` are deleted from the body before anything reads it, and the zero-charge rule uses the server's `countOnly`. quickBookingStaging scenario 6. Closed 2026-10-12 by /audit independent (round 2): `SERVER_SET_ON_POST` is deleted from the body copy at bookOrder.service.js:1397 and `quickBooking = countOnly` (line 2009).

### quick-booking-nothing-paid-at-booking/F-20 [P2] closed - An item edit drops an attached offer that expired or was paused after booking

**File:** services/offer.service.js:978
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** The same-order exception skips the committed check and the capacity check
but still runs the linkage-expiry and offer-active/window checks. If a normal order's offer
was valid at booking but expired or was paused before Intake edits the items, the re-price
rejects it. `_settleOfferLinkages` then releases it (as EXPIRED), and the bill goes up. The
spec's "an edited normal order keeps the offer it was booked with" holds only while the offer
is still live. A released offer is also never reconsidered on a later edit of a normal order.
**Suggested fix:** Decide with the client whether an attached offer is honoured as committed
at booking. If it is, skip the expiry and active checks when `onThisOrder` is true.
**Resolution:** Fixed 2026-10-11 (builder default, to confirm with the client). An offer attached to THIS order is honoured at the re-price: expiry, a pause, the usage cap and later profile rules no longer remove it; its basket rules are still checked against the real count. Personal and promotional alike. briefCheck + quickBookingStaging (an offer paused and expired after booking still waives the pickup on the next edit).
Reopened 2026-10-12 by /audit independent (round 2): the repair holds for normal orders (and for pauses), but not on a Quick Booking whose linkage has expired. `_repriceForItems` clears `customerOfferId` and re-picks through `pickBestPersonalOffer` → `getBookingOptions`, whose linkage query filters `expiresAt: { $gt: now }` (offer.service.js:514-518). So an offer attached at the first Intake edit is not a candidate on a later edit once its linkage expires. `_settleOfferLinkages` then releases it as EXPIRED and the bill goes up, which is the original defect. quickBookingStaging covers F-20 only on a normal order (scenario 4). Suggested fix: when re-pricing a Quick Booking, include this order's attached personal linkage as a candidate whatever its expiry (or keep it when it still passes `_offerRejection` with `repriceOrderId`). Still a builder default to confirm with the client; non-blocking.
Fixed again 2026-10-12 (round 3). On a re-price `getBookingOptions` also lists the linkage already attached to that order, whatever its expiry, so the Quick Booking re-pick keeps it. quickBookingStaging scenario 10 (Welcome Offer attached at an earlier edit, linkage expired, next edit keeps it and still waives both trips).
Closed 2026-10-12 by /audit independent (round 3): the extra `$or` branch (offer.service.js:518-524) sits under the top-level `userId` filter and is added only when `repriceOrderId` is set, which only `_repriceForItems` passes (bookOrder.service.js:951, 970), so it cannot surface another customer's or another order's linkage. Still a builder default to confirm with the client. See F-29 for a narrow side effect on promotional linkages.

### quick-booking-nothing-paid-at-booking/F-21 [P2] closed - Releasing a promotion linkage turns it into a reusable "personal" reward

**File:** services/offer.service.js:1273
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** `releaseForOrder` resets every linkage to ASSIGNED, including the promotion
linkages that `attachPromoToOrder` creates per order. `getBookingOptions` lists any ASSIGNED
linkage of the customer as a personal offer, the Quick Booking auto-pick can choose it, and
`validateAndPrice` evaluates it as `kind: 'personal'`, which has no `oneUsePerCustomer` check.
Cancellation already did this. The new `_settleOfferLinkages`
(services/bookOrder.service.js:1298) adds a common trigger: any normal-order item edit that
lowers the basket below a promotion's minimum.
**Suggested fix:** In `releaseForOrder`, set promotion linkages to CANCELLED (or delete them)
instead of ASSIGNED. Only personal linkages should go back to the customer.
**Resolution:** Fixed 2026-10-11. `releaseForOrder` deletes a promotion's linkage (it is created at attach) and gives the usage slot back, instead of resetting it to an assigned personal reward. Applies to cancellation too. quickBookingStaging scenario 8. Closed 2026-10-12 by /audit independent (round 2): `releaseForOrder` (offer.service.js:1311-1329) deletes promotional linkages with a matching `usedCount -1`; attach +1 / release -1 balance for personal and promotional, including the `only` subset used by `_settleOfferLinkages`.

### quick-booking-nothing-paid-at-booking/F-22 [P3] closed - The unbilled Anytime branch can lower the leg fee twice under concurrent calls

**File:** services/bookingWindow.service.js:940
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** Idempotency is a read of `refund.paidAt` (line 896) followed by an
unconditional `updateOne`. Two settle calls for the same leg that run together both lower the
fee, so the leg is undercharged by the refund amount twice. The wallet branch has the same
read-then-write pattern, so this is not new, but here the second write silently corrupts the
bill.
**Suggested fix:** Add `[\`scheduling.${leg}.refund.paidAt\`]: { $exists: false }` to the
update filter and treat zero matches as `already-paid`.
**Resolution:** Fixed 2026-10-11. The unbilled branch claims the refund with a conditional update on `refund.paidAt` and returns `already-paid` when it loses. quickBookingStaging scenario 5 (a second settle does not lower the fee again). Closed 2026-10-12 by /audit independent (round 2): the update filter at bookingWindow.service.js:943-946 requires `refund.paidAt` to be absent (the schema gives it no default) and returns `already-paid` on zero matches.

### quick-booking-nothing-paid-at-booking/F-23 [P3] closed - The new briefCheck cover is mostly source-text matching; offer settlement is not driven

**File:** briefCheck.js:2166
**Found:** 2026-10-11 by /audit independent (scope: current; lens: tests)
**Why it matters:** Only `_offerRejection` and the fees-line constant are run for real. The
booking amount rule, the auto-pick, `_settleOfferLinkages` and the Anytime branch are regex
matches on the source. Keep/release/attach behaviour is covered only by
`quickBookingStaging.js`/`itemEditStaging.js`, which need a testing database. No assertion
covers a customer draft that carries `orderId` (F-17).
**Suggested fix:** Drive `_settleOfferLinkages` with stubbed `OfferService` calls, and add the
F-17 case to the `_offerRejection` assertions.
**Resolution:** Fixed 2026-10-11. briefCheck now drives `_offerRejection` (own order, other order, smuggled orderId) and the body allow-list for real; keep/release/attach stays covered by quickBookingStaging (needs a database). Closed 2026-10-12 by /audit independent (round 2): briefCheck 441/0 includes the own-order / other-order / smuggled-orderId `_offerRejection` cases and the allow-list check. Settlement is still driven only by staging, the same accepted gap as F-06/F-08 until a runner exists.

### quick-booking-nothing-paid-at-booking/F-24 [P1] closed - A customer can mark an unbilled Quick Booking as paid with a ₦0 wallet payment and skip the bill

**File:** services/bookOrder.service.js:2014 (with services/wallet.service.js:188-200, services/bookOrder.service.js:1094-1097)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** This work item creates every Quick Booking with `amount: 0` and `paymentStatus` pending. The pay paths read `amount: 0` as "nothing owed". A customer calls `POST /api/wallet/pay-with-wallet { bookOrderId: <their QB> }`. `payWithWallet` calls `chargeWalletForOrder` with amount 0, so `cashNeeded` is 0 and the call succeeds. It then sets `paymentStatus = "success"`. When Intake enters the items, `applyItemEdit` takes `amountPaid = previousTotal = 0`, so `outstanding = newTotal`. But `PaymentHoldService.raise` refuses ("already paid"), and the order keeps `paymentStatus: success` with the full bill as `amount`. `itemTagGate` → `moneyIsComplete` then opens the tags, and the order is processed and delivered without being paid. `settleAnytimeRefund` also skips the new unbilled branch (`paymentStatus === SUCCESS`) and credits a real wallet refund on an order that paid nothing. Before this delta a Quick Booking carried its trip fees as `amount`, so this was reachable only with no trips at standard speed. Now every Quick Booking exposes it. The in-app assistant's "use my balance" does not pay it, but it tells the customer the Quick Booking is "already fully covered — there's nothing left to pay" (services/bot/payment.flow.js:273).
**Suggested fix:** Refuse payment on an order that is still `itemsPending` ("Your bill isn't ready yet; we'll send it after we count"). Do this in `payWithWallet`, in `PaystackService.initializePayment` for orders, and in the assistant's unpaid-order lookup (skip `itemsPending` orders or give the not-billed-yet reply). Optionally, have `applyItemEdit` treat a ₦0 "success" as unpaid when the bill rises. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. New `orderPayableGate` (util/paymentGate.js): an order still waiting for its items is not payable ("There's nothing to pay yet. We send your bill by SMS after we count your clothes."). Checked first by `WalletService.payWithWallet`, `PaystackService.initializePayment` (order) and the assistant's "use my balance". The Intake re-price clears `itemsPending` before it raises the hold, so the SMS bill and its Paystack link still work. quickBookingStaging scenario 9 (wallet and real card init both refused, order stays unpaid).
Closed 2026-10-12 by /audit independent (round 3): every customer path that can charge or mark an uncounted order paid is gated. `payWithWallet` (wallet.service.js:189-193, also the only wallet path the assistant uses, payment.flow.js:112), `initializePayment` for orders (paystack.service.js:65-69, also used by the hold's link builder and the assistant's card link), and the assistant's lookup (payment.flow.js:274-279). The booking-time wallet charges (bookOrder.service.js:1917, 2223) cannot run for a Quick Booking because `applyCountOnlyBooking` forces pay-per-item. The webhook can only confirm a Paystack reference that `initializePayment` created, so it is gated upstream. `applyItemEdit` sets `itemsPending: false` and the real items in one `updateOne` before `PaymentHoldService.raise` builds the link, so the bill's Paystack link and wallet payment work. Offline probe: `orderPayableGate` refuses `itemsPending: true`/unset with placeholder pieces and null, and allows `itemsPending: false` and real items. Remaining staff-only gap recorded as F-31.

### quick-booking-nothing-paid-at-booking/F-29 [P3] closed - On a re-price, an order's attached promotion can be offered as its "personal" offer and applied twice

**File:** services/offer.service.js:518
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `getBookingOptions` builds its personal list from every linkage the query returns, with no `offer.type === PERSONAL` filter, and `_offerRejection({ kind: 'personal' })` does not check the type either. The round-3 `$or` branch returns every ATTACHED linkage on the re-priced order, so a promotional linkage attached to that order is now listed as a personal candidate whatever its expiry (before, only one whose promotion had a future `expiryDate` matched). On a Quick Booking re-price, `pickBestPersonalOffer` can pick it, and `_repriceForItems` then passes it as `customerOfferId` while also passing the same promotion as `promoOfferId`. If the promotion is `stackableWithPersonal`, `validateAndPrice` applies it twice. New Quick Bookings attach no offer at booking and the re-price only re-passes an already-attached promotion, so this is reachable only for Quick Bookings booked before this change that had a promotion attached at booking. Note: the F-numbers F-25 to F-28 are skipped because the hotfix ledger used them and code comments cite them.
**Suggested fix:** In `getBookingOptions`, skip linkages whose `offerId.type` is not PERSONAL (the same filter `getCustomerOffers` uses at offer.service.js:440), or restrict the new `$or` branch to personal offers.
**Resolution:**
Fixed 2026-10-12. The personal-offer list in `getBookingOptions` skips promotion linkages, so the re-pick can never take an attached promotion as the personal offer. briefCheck.
Closed 2026-10-12 by /audit independent (round 4): offer.service.js:541 skips `OFFER_TYPE.PROMOTIONAL` linkages before `evaluate('personal', ...)`, so `pickBestPersonalOffer` cannot return the attached promotion; briefCheck 450/0.

### quick-booking-nothing-paid-at-booking/F-30 [P2] closed - A paid order whose bill goes up at the item edit stays marked paid (pre-existing, outside this delta)

**File:** services/bookOrder.service.js:1094 (with services/paymentHold.service.js:80)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** Found while tracing F-24. It was not introduced by this work item and is the same at 502dc0f. `applyItemEdit` treats a `success` order as having paid `previousTotal`, computes `outstanding = newTotal - previousTotal`, writes `amount: newTotal`, and calls `PaymentHoldService.raise`. `raise` refuses any order with `paymentStatus: success` ("already paid"), so no hold or link is raised. The order keeps `success` with the higher `amount`, `moneyIsComplete` opens the tags, and the difference is never collected unless staff notice the error in the response and send a top-up request by hand. Reachable for a normal order paid at booking that Intake finds has more items, and for a Quick Booking that paid its trip fees under the old rule before this change.
**Suggested fix:** Fix in its own change. When a paid order's bill rises, reset `paymentStatus` to pending (or record the paid amount separately) and raise the hold for the outstanding difference only.
**Resolution:**
Fixed 2026-10-12. New `balanceDue` on the order. When the item edit raises the bill of a paid (or part-paid) order, it goes back to unpaid with only the difference due; `amountDue` makes the payment hold, the Paystack link, the wallet payment and the assistant collect that balance, and the webhook, the wallet payment and a transfer approval clear it. Paystack allows a second card payment only while a balance is due. The wallet payment now also releases a payment hold and starts the processing clock, as the webhook does. A cancelled part-paid order refunds what was paid (`amountPaidSoFar`, used by the cancel verdict, `_performCancellation` and `cancellationOutcome`). quickBookingStaging scenario 11 (paid ₦421,000, edited to ₦1,261,000, hold and balance ₦840,000, wallet pays it, paid once in total, hold cleared).
Closed 2026-10-12 by /audit independent (round 4): the first raise on a paid order now goes pending with `balanceDue` = difference and a fresh hold for that difference; hold, Paystack init, wallet and assistant all read `amountDue`; webhook, wallet and approveTransfer clear it; cancel refunds use `amountPaidSoFar` (waiver excluded, credits subtracted). Offline probe of up/up/down/down sequences gives the right status, balance and refund at each step. Residual hold/link staleness on a SECOND re-price is recorded as F-33; admin mark-paid paths that leave `balanceDue` set as F-34.

### quick-booking-nothing-paid-at-booking/F-31 [P3] closed - Staff bank-transfer approval can still mark an uncounted Quick Booking paid at ₦0

**File:** services/paymentHold.service.js:463
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** `approveTransfer` (Intake or admin, `/api/intake-user/order/{id}/approve-transfer`) does not check `orderPayableGate`. Approving a transfer on a Quick Booking still waiting for its items marks it `success` with amount 0. When Intake then enters the items, the hold is refused as "already paid" and the order goes through unpaid, which is the F-24 outcome through a staff action. The admin `updateBookOrderPaymentStatus` and the admin Payment approval are deliberate admin overrides. This path needs a human, is audited, and notifies an admin, so the risk is a mistake rather than abuse.
**Suggested fix:** Refuse `approveTransfer` while `awaitingRealItems(order)` ("Enter the items first; there is no bill yet").
**Resolution:**
Fixed 2026-10-12. `approveTransfer` checks `orderPayableGate` first. quickBookingStaging scenario 12.
Closed 2026-10-12 by /audit independent (round 4): paymentHold.service.js:485-488 refuses before any write, after the already-paid check.

### quick-booking-nothing-paid-at-booking/F-32 [P2] closed - The staff counter booking spread the request body over the order (carried over from the hotfix's F-19)

**File:** services/intake-user.service.js:339
**Found:** 2026-10-11 by /audit independent of the booking hotfix (its F-19); carried into this work item 2026-10-12
**Why it matters:** `IntakeUserService.createBookOrder` built the order as `{ ..., amount, paymentStatus, intakeStaffId, channel: OFFICE, stage, ...post }`, so the staff request could override amount, attribution, stage, channel, owner and pricing. Intake staff and admins only, but it undermined the counter audit trail.
**Suggested fix:** An allow-list of the order's own fields in place of `...post`.
**Resolution:** Fixed 2026-10-12. Only `STAFF_ORDER_FIELDS` (name, phone, addresses, pickup date and time, service, care level, speed, items, note, pickup/delivery) are taken from the request, spread first so the server's values win. counterPaymentStaging 51/0; briefCheck.
Closed 2026-10-12 by /audit independent (round 4): the allow-list matches every order field in the documented `/intake-user/create-book-order` request (routes/intake-user.js:62-150); `paymentMethod`/`secondaryPaymentMethod`/`useCredit` are still read from `post` before the build, and `items` is re-set from `post.items` after it, so nothing the counter app sends is lost.

### quick-booking-nothing-paid-at-booking/F-33 [P2] closed - A second re-price while a payment hold is open keeps the old hold amount and Paystack link, so the customer can pay the wrong figure

**File:** services/bookOrder.service.js:1186 (with services/paymentHold.service.js:86-97, util/webhook.handler.js:509-519)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** `applyItemEdit` calls `PaymentHoldService.raise` whenever something is outstanding, but `raise` is idempotent: if a hold is already open it returns the old `paymentHold.amount` and `paymentUrl` without changing them. The webhook marks the order paid on any confirmed reference for it and clears `balanceDue`, without comparing what was paid to `amountDue(order)`. Example: paid ₦5,000, edited to ₦6,000 (balance and hold ₦1,000, link initialised for ₦1,000), then edited again to ₦7,000 (balance ₦2,000, hold still ₦1,000). The reminders keep sending "₦1,000" with the old link. Paying that link marks the order fully paid, and ₦1,000 is never collected. `approveTransfer` also records the stale `paymentHold.amount` on the bank-check list. In the other direction, edited back down to ₦5,500 the balance is ₦500 but the link still charges ₦1,000. Edited down to ₦4,000, the order becomes `success` with a ₦1,000 wallet refund, but the hold stays open: the order sits at `stage: hold` (Intake must release it by hand) with a live ₦1,000 link. If the customer pays it, the webhook returns early on the paid order and the money is taken with nothing credited. A card checkout opened before an edit and completed after it has the same effect. The idempotent hold and the webhook with no amount check were already there at 502dc0f for never-paid orders. F-30 now lets paid orders reach this too, and adds the case of a paid order left on an open hold.
**Suggested fix:** In `applyItemEdit`, when a payment hold is already open, refresh it to the new `amountDue` with a new link, or clear it and raise a new one. When nothing is outstanding any more, clear it (`PaymentHoldService.clear`, source `item-edit`). In `handleOrderPayment`, compare `metadata.amount` with `amountDue(order)`: if it is short, take what was paid off `balanceDue` and leave the order pending; if the order is already paid or the payment is over, credit the excess to the wallet. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. (1) `applyItemEdit` clears an open payment hold before raising one for what is owed now (owing nothing → released), and `approveTransfer` records `amountDue(order)`, not an older hold figure. (2) The card webhook settles against what Paystack collected (`data.amount`): short → unpaid with the rest as `balanceDue` and a fresh hold; over → paid and the excess to the wallet; a separate payment on an order already paid → refunded to the wallet (the pre-existing "two checkouts" loss). Also fixed: the webhook's missing-Payment fallback never set the required `type`, so it failed validation and dropped the payment. quickBookingStaging 11 (second edit refreshes the hold, paid once in total) and 13 (short by ₦1,000 → ₦1,000 due and held; remainder settles and clears the hold; a stray ₦500 returns to the wallet).
Closed 2026-10-12 by /audit independent (round 5): every scenario in this finding is handled. A second edit clears the open hold and raises one for the current `amountDue` with a new link (bookOrder.service.js:1186-1206), owing nothing releases it, `approveTransfer` records `amountDue(order)`, and the webhook settles against `data.amount` (HMAC-signed by Paystack, util/webhook.js:14-22). Short/over/duplicate math traced by hand for unpaid, paid and part-paid orders (e.g. 18,000 with 3,000 left → `amountDue` 3,000, `amountPaidSoFar` 15,000, probed offline). Side effects of this fix are tracked separately as F-35 (the fallback now credits forged top-ups), F-36 and F-37.

### quick-booking-nothing-paid-at-booking/F-34 [P3] closed - Admin mark-paid paths leave `balanceDue` set, which lets a second card payment start on a paid order

**File:** services/bookOrder.service.js:2421, services/admin.service.js:1643 (with services/paystack.service.js:94-100)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** `updateBookOrderPaymentStatus` and the admin Payment approval set `paymentStatus: success` but do not unset `balanceDue`, unlike the webhook, the wallet and `approveTransfer`. `initializePayment` never checks `order.paymentStatus`. Its only duplicate guard is now bypassed while `balanceDue > 0`, so on such an order it still opens a Paystack checkout for the balance. If that is paid, the webhook returns early on the already-paid order: the customer is charged and nothing is credited. `updateBookOrderPaymentStatus` also leaves the hold and its pre-initialised link open. These are admin override paths and need a deliberate action, so this is low risk.
**Suggested fix:** Unset `balanceDue` wherever an order is marked `success`. In `initializePayment`, refuse an order whose `paymentStatus` is already `success`. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. Both admin mark-paid paths clear `balanceDue`, and `initializePayment` refuses an order already paid ("This order has already been paid."). briefCheck.
Closed 2026-10-12 by /audit independent (round 5): `updateBookOrderPaymentStatus` (bookOrder.service.js:2435) and the admin Payment approval (admin.service.js:1642-1645) both unset `balanceDue` on success, and `initializePayment` refuses a paid order before creating a Payment row (paystack.service.js:65-69), which also covers the hold's link builder.

### quick-booking-nothing-paid-at-booking/F-35 [P1] closed - The webhook's repaired missing-Payment fallback now credits a wallet top-up from metadata the payer controls

**File:** util/webhook.handler.js:160-170 (with util/webhook.handler.js:653-662)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** Before this round, a `charge.success` whose reference had no Payment row failed validation (`type` is required) and nothing happened. Probe: the old fallback document is invalid on `type`, and the new one is valid. Now the row saves and the flow continues. `handleWalletTopUp` then adds `metadata.amount` to `metadata.userId`'s wallet without reading `data.amount` or checking that the user is the payer. The only transactions with no Payment row are ones `initializePayment` did not create. Anyone holding the merchant public key (it is public by design, and any Paystack Inline checkout exposes it) can start one with their own reference, amount and metadata. Example: pay ₦100 with `metadata: { transactionType: 'wallet-top-up', userId: <any user>, amount: 1000000 }`. Paystack sends a genuinely signed `charge.success`, the HMAC check passes, and the wallet gains ₦1,000,000. The subscription branch is reachable the same way and is not checked against the plan price.
**Suggested fix:** Process only references `initializePayment` created. When the Payment row is missing, record the event for an admin and stop; do not run the type handlers. Defence in depth: credit top-ups from `data.amount / 100`, and require `metadata.userId` to equal the payer.
**Resolution:**
Fixed 2026-10-12. A signed event whose reference has no pending Payment row (i.e. not a checkout this server started) is never processed: logged and an admin is notified, nothing saved, so a retry stops too. Every real checkout (order/subscription `initializePayment`, wallet top-up init) writes that row first; Paystack renewals carry no `transactionType` and already returned earlier. Wallet top-ups now credit `data.amount / 100` (what Paystack collected) and only when `metadata.userId` is the payer. quickBookingStaging 14 (a forged top-up with no checkout, and one naming another user, credit nothing; a genuine ₦2,000 top-up with metadata ₦999,999 credits ₦2,000).
Closed 2026-10-12 by /audit independent (round 6): a reference with no Payment row now stops before any write (webhook.handler.js:157-173), and top-ups credit `data.amount / 100` only when `metadata.userId` is the payer found by email (webhook.handler.js:207-210, 677-693). The scenario recorded here is gone. A pre-existing variant that reuses a pending row the server did NOT open as a checkout (and the unchecked subscription price) is tracked as F-38.

### quick-booking-nothing-paid-at-booking/F-36 [P2] closed - A delayed or concurrent duplicate webhook is refunded as a "second payment" on an order already marked paid for the same money

**File:** util/webhook.handler.js:524-538 (with util/webhook.handler.js:152-176)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** The new branch assumes an order already `success` means separate money, because "the same reference never reaches here twice". There are two holes. (1) A human can mark the order paid for this same card payment, and nothing ties that to the reference. Example: the webhook cannot reach the server (deploy or outage) and Paystack retries for up to 72 hours. Meanwhile the customer shows the receipt and an admin uses `updateBookOrderPaymentStatus` or Intake uses `approveTransfer`. When the retry lands, the Payment row is still pending, so the full amount goes to the wallet. The customer has had the order settled and also got the money back. (2) The Payment-row check is a `findOne` and then a `save`, so it is not atomic. Two near-simultaneous deliveries of one event can both pass it, and the later one refunds. Before this round, both cases simply returned.
**Suggested fix:** Claim the reference atomically (`findOneAndUpdate({ reference, status: { $ne: 'success' } }, { status: 'success' })`, and continue only if it matched). In the already-paid branch, refund automatically only when the order was paid by a Paystack reference other than this one or by the wallet. Otherwise notify an admin to settle it by hand.
**Resolution:**
Fixed 2026-10-12. The reference is claimed atomically (`findOneAndUpdate` with `status: { $ne: 'success' }`), so a duplicated or racing event is processed once. A payment landing on an order already paid is flagged to admins ("Payment on an order already paid … refund it if genuine"), not refunded automatically, because a late retry of the same money cannot be told apart from a real second payment. quickBookingStaging 13 (the same event twice changes nothing; ₦500 on a paid order → wallet unchanged, admin flagged).
Closed 2026-10-12 by /audit independent (round 6): the `findOneAndUpdate({ reference, status: { $ne: 'success' } })` claim (webhook.handler.js:177-193) runs before the order, top-up and subscription branches (first charge and renewal alike), so a duplicate or racing delivery stops at `!payment`. The already-paid branch (webhook.handler.js:547-564) only notifies admins; nothing is credited automatically, and the Payment row keeps the record.

### quick-booking-nothing-paid-at-booking/F-37 [P3] closed - Clearing a hold just to raise a new one tells the customer "payment received, we have started work"

**File:** services/bookOrder.service.js:1186-1192, util/webhook.handler.js:552 (with services/paymentHold.service.js:232-250)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `PaymentHoldService.clear` always sends the in-app notice "Thank you — payment for order … has been received and we have started work". It also writes `stageHistory` "Payment confirmed (<source>)" and an audit line. Both new clear-then-raise sites call it when nothing, or only part, has been paid: a second item edit on an unpaid order, and a short card payment. The customer gets a false "paid, started" notice right before the "payment needed" SMS, and the order's history says payment was confirmed by `item-edit`. Each refresh also gives a new `raisedAt`, which restarts the 6h/24h reminders and the 48h admin escalation (the reason `raise` was made idempotent).
**Suggested fix:** Give `clear` a quiet mode (no notification, a neutral history note) for a refresh, or add a `refresh` helper that updates `paymentHold.amount`/`paymentUrl` in place and keeps `raisedAt`.
**Resolution:**
Fixed 2026-10-12. `clear({ quiet: true })` for a REPLACED hold (item edit, short card payment): no "payment received" message, history and log say "Payment hold replaced — the bill changed". `raise({ keepClockFrom })` keeps the replaced hold's `raisedAt` and `remindersSent`, so the 6h/24h reminders and the 48h admin escalation do not restart. quickBookingStaging 11.
Closed 2026-10-12 by /audit independent (round 6): both replace sites (bookOrder.service.js:1186-1211, webhook.handler.js:573-586) take `raisedAt`/`remindersSent` from the open hold before the quiet clear, and `raise` writes them back (paymentHold.service.js:129-135). The quiet clear skips the "Payment received" notice; its `markProductionClearedIfReady` call cannot start the clock because the order is still unpaid. A replaced hold cannot remind with a wrong figure: `raise` sends the new amount and link at once, and later reminders read the new `paymentHold.amount`. Reminders already sent are not repeated, which is the intent. The separate hold-SLA escalation (`escalateOverdueHolds`, keyed on `stage.updatedAt`) restarts on each raise, as it does for every re-held order.

### quick-booking-nothing-paid-at-booking/F-38 [P1] closed - The webhook acts on the event's metadata, so a pending Payment row the server never opened as a checkout can be reused to activate a plan for a token payment (pre-existing, outside this delta)

**File:** util/webhook.handler.js:157-217 (with util/webhook.handler.js:444-487, services/wallet.service.js:54-74 and 748-760, services/wallet.service.js:307-318)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** The F-35 repair assumes that every pending Payment row is a Paystack checkout this server opened, so the event's metadata must be ours. That is not true for two kinds of row. (1) `walletTopUp` writes the pending row before calling Paystack, and it validates only `amount: integer|required` (offline probe: 0 and -5 pass). With `amount: 0`, Paystack refuses the initialize call, and the row stays `pending` with a reference that Paystack has never seen. (2) `uploadPaymentProof` writes a pending `BT-<ms>` wallet-top-up row. The customer's own transaction history (`wallet.service.js:307-318`) returns `reference` and `status` for both kinds. So a customer can open a Paystack Inline checkout with the public key, using that reference and metadata `{ transactionType: 'subscription', planId, paystackPlan: <most expensive plan> }`, and pay ₦100 with their own email. The webhook finds the row, claims it, and dispatches on `metadata.transactionType`, never on the row's `type`, `userId` or `paymentMethod`. `handleNormalSubscription` then creates an active subscription with that plan's `monthlyLimits` from the metadata alone. It never compares `data.amount` with `plan.price`. The `order` and `wallet-top-up` branches are safe in this case, because they settle or credit only what was collected. The same thing happened at 502dc0f, so this delta did not introduce it. But F-35's "only a payment this server started is processed" guarantee does not hold, and this is the remaining way to get value that was not paid for.
**Suggested fix:** In `handleChargeSuccess`, process the event only when `existing.status === 'pending'`, `existing.type === metadata.transactionType`, `String(existing.userId) === String(user._id)` and `existing.paymentMethod !== 'bank-transfer'`. Otherwise alert an admin, as the unmatched-reference branch does. In `handleNormalSubscription`, refuse unless `data.amount / 100 >= plan.price`. Optionally, have `walletTopUp` refuse an amount below the Paystack minimum before it writes the row. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. `handleChargeSuccess` only acts when the event matches the checkout WE recorded: our row is not `failed`, is not a bank-transfer proof (`paymentMethod: bank-transfer` / `BT-` reference), has the event's type, belongs to the payer, and (orders) is for the same order; otherwise nothing is credited and admins are alerted. A first subscription charge activates only the plan this checkout recorded and only when the money collected covers its price. Checkouts Paystack refuses are marked `failed` (initializePayment, wallet top-up), and a top-up under ₦100 is refused before Paystack is called. quickBookingStaging 15 (a bank-transfer row and a top-up row re-used as a subscription, and a ₦100 payment on a ₦50,000 plan checkout, activate nothing).
Closed 2026-10-12 by /audit independent (round 7): the scenario is gone. Failed-init rows are marked `failed` (paystack.service.js:126-129, wallet.service.js:81-85), BT rows, type, owner and order mismatches stop before the claim (webhook.handler.js:180-208), and a first subscription charge needs a resolved plan and `collected >= plan.price` (webhook.handler.js:261-280). New references are refused by Paystack as duplicates once initialized, and legacy pending rows are deleted daily by reconcilePaystack. Residual trust in `metadata.paystackPlan` is tracked as F-43; side effects as F-40, F-41, F-42 and F-44.

### quick-booking-nothing-paid-at-booking/F-39 [P3] closed - Credits read `data.amount`, which may include the Paystack fee when the customer bears it

**File:** util/webhook.handler.js:201, 207-210
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** Top-ups credit `data.amount / 100`, and an order payment above `amountDue` sends the excess to the wallet. If the Paystack account passes transaction fees to customers, `data.amount` may be the total charged, fee included, rather than the amount requested. Each top-up would then credit the fee as wallet cash, and every card order would refund the fee as an "overpayment". This depends on the Paystack dashboard setting and on payload semantics that cannot be checked offline.
**Suggested fix:** Confirm the account's fee bearer. If customers bear fees, use `data.requested_amount` when it is present, or subtract `data.fees`.
**Resolution:**
Fixed 2026-10-12 (defensively; the account fee setting was not checked). Each checkout records `metadata.expectedAmount`; the webhook credits `min(collected, expected)`, so a fee the customer bore is never credited. quickBookingStaging 15 (a ₦1,015 charge for a ₦1,000 top-up credits ₦1,000).
Closed 2026-10-12 by /audit independent (round 7): both checkout paths record `metadata.expectedAmount` in naira (paystack.service.js:119-122, wallet.service.js:66-67), the webhook credits `min(collected, expected)` and falls back to `collected` for rows without it (webhook.handler.js:212-215), the claim preserves `expectedAmount` (line 225), and nothing else reads Payment.metadata.

### quick-booking-nothing-paid-at-booking/F-40 [P1] closed - Subscription renewals can no longer be processed, so paid months never refresh the item allowance

**File:** util/webhook.handler.js:146-173 and 285-328 (with server.js:36-39)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** Paystack starts each monthly renewal itself. That charge's reference was never written by `initializePayment`, so no Payment row exists for it. Since 9367785, a `charge.success` with no row stops at step 2 ("did not match any checkout we started") before the renewal branch. If the renewal event has no `metadata.transactionType`, it already stops at line 146. Either way, at HEAD the renewal branch (status active, `remainingItems = plan.monthlyLimits`, `consecutiveMonths + 1`, loyalty bonus, customer notice) is unreachable. server.js:36-39 says this webhook is the ONLY monthly reset. A subscriber who pays month 2 keeps last month's leftover items and is billed per item once they run out, and each renewal sends admins an "Unmatched Paystack payment" alert. At 502dc0f the missing-row fallback let a renewal that carries metadata through. No offline check or staging scenario drives a renewal event (briefCheck 2454-2461 only matches source text).
**Suggested fix:** Before the "no matching checkout" refusal, route events with `data.subscription?.subscription_code` to the renewal branch, keyed on a `SubscriptionModel` whose `subscriptionCode` matches and whose `userId` is the payer found by email. Do not use `metadata.transactionType` for this. Then claim the reference atomically by upserting a Payment row on `reference`. Add a staging scenario that sends a renewal event with no pre-created row.
**Resolution:**
Fixed 2026-10-12. A charge carrying Paystack's `subscription.subscription_code` with no Payment row of ours is a renewal: routed (before the metadata and checkout-row checks) to `handleRenewal`, which matches OUR subscription by code, requires it to belong to the payer, claims the reference by creating a unique Payment row (a repeated event hits E11000 and renews once), then refreshes the allowance, next payment date and loyalty month. quickBookingStaging 16 (renewal → 30 items, month 2; the same event twice renews once; a renewal by another payer is refused).
Closed 2026-10-12 by /audit independent (round 8): a charge with `data.subscription.subscription_code` and no row reaches `handleRenewal` before the metadata and checkout checks (webhook.handler.js:151-154). It requires our subscription by code and the payer's ownership (332-340), claims the reference with a unique Payment row so a repeat hits E11000 (342-362, payment.model.js:11), and refreshes the allowance. `data.subscription` is set by Paystack, not by a public-key checkout, and a subscription code is only stored from a signed `subscription.create` for our plan code, so it cannot be borrowed. Not verifiable offline: that Paystack's renewal `charge.success` carries `data.subscription` (see Remaining risk). Silent drops on this path are F-46.

### quick-booking-nothing-paid-at-booking/F-41 [P2] closed - A checkout link paid more than a day after it was opened is refused, because the cleanup cron deletes its pending row

**File:** crons/reconcilePaystack.js:27-37 (with util/webhook.handler.js:157-173, services/paymentHold.service.js:54-58 and 440-443)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** At 03:00 each day, reconcilePaystack deletes every `pending` Payment row with `amount: 0` that was created more than one day earlier. The variable is named `threeDaysAgo`, but the code subtracts one day. Every checkout row is written with `amount: 0`. The payment-hold link is created when the hold is raised, and the 24h reminder sends the same link again. The hold stays open until an admin acts after 48h. Example: a hold raised Monday 10:00, the 24h reminder on Tuesday, the row deleted at 03:00 Wednesday, the customer pays on Wednesday. Since 9367785, a payment with no row is not processed. The customer is charged, the order stays on hold, and only an admin alert remains. Bot card links and the logistics-fee link behave the same way. At 502dc0f the fallback processed such a payment.
**Suggested fix:** Stop deleting pending checkout rows. Either mark them `abandoned` and accept a later `charge.success` for them, or extend the cutoff past the longest life of a link the server reuses (hold reminders up to 48h). Check the 3-day intent against the code.
**Resolution:**
Fixed 2026-10-12. The reconcile cron keeps pending checkout rows 7 days (it deleted them after 1 day while the variable said 3), past the payment-hold link window.
Closed 2026-10-12 by /audit independent (round 8): reconcilePaystack.js:32-40 now deletes only `pending`, `amount: 0` rows older than 7 days, beyond the 24h/48h hold reminder window.

### quick-booking-nothing-paid-at-booking/F-42 [P2] closed - A first subscription charge is checked against the plan's current database price, not the amount the checkout asked for

**File:** util/webhook.handler.js:262-265 (with services/paystack.service.js:97 and 136)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** Activation requires `collected + 0.5 >= plan.price`, where `plan.price` is read at webhook time. When `plan` is passed to initialize, Paystack charges the Paystack plan's own amount. The DB `price` and `paystackPlanCode` are edited separately (subscription.service.js createPlan/updatePlan never touch Paystack). Two cases fail. (1) An admin raises the DB price after a customer opened the checkout. (2) The DB price differs from the Paystack plan amount. In both, a genuine payment is claimed `success` at line 220 before this check, nothing is activated, and a retry cannot recover it. The customer is charged and only an admin alert remains.
**Suggested fix:** Compare against `existing.metadata.expectedAmount` when present (what this checkout asked for), and fall back to `plan.price` only for legacy rows. Optionally also accept `data.plan.amount` when its `plan_code` equals the recorded plan's `paystackPlanCode`. Run the check before the atomic claim, or leave the row pending, so an admin can see the money was not applied.
**Resolution:**
Fixed 2026-10-12. The first-subscription-charge check runs BEFORE the atomic claim, against the amount the checkout asked for (`expectedAmount`, i.e. the price when it opened; the plan's current price only for legacy rows). A refusal leaves the row pending for an admin instead of recording money against nothing. quickBookingStaging 16 (price raised after checkout → the plan still activates; an underpaid charge leaves its row pending).
Closed 2026-10-12 by /audit independent (round 8): the check (webhook.handler.js:236-261) resolves the plan from our row's `metadata.planId`, compares `collected` with our row's `expectedAmount` (plan price only for legacy rows), and returns before the atomic claim at 265, so a refusal leaves the row pending with an admin alert.

### quick-booking-nothing-paid-at-booking/F-43 [P3] closed - handleNormalSubscription still takes the plan and its limits from event metadata instead of the plan the webhook verified

**File:** util/webhook.handler.js:281, 508-518, 557
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** The caller resolves and price-checks `plan` from our row's `metadata.planId`. `handleNormalSubscription` ignores it. It sets `planId` from `metadata.planId` and reads `monthlyLimits` from `PlanModel.findOne({ paystackPlanCode: metadata.paystackPlan })`. The `planMismatch` check covers `planId` but not `paystackPlan`. Event metadata is ours today, because Paystack refuses a duplicate reference and refused inits are marked `failed`. So this is exploitable only through a pending subscription row Paystack never saw: a swallowed failed-mark write (paystack.service.js:127 `.catch(() => {})`) or a pre-deploy row inside the one-day cleanup window. Line 557 also references an undefined `paystackPlan`. That branch is dead today, because the filter's `user` field does not exist on the schema.
**Suggested fix:** Pass the verified `plan` into `handleNormalSubscription`. Use `plan._id`, `plan.paystackPlanCode` and `plan.monthlyLimits`, and drop the metadata lookups. Fix or remove the dead `else` branch.
**Resolution:**
Fixed 2026-10-12. `handleNormalSubscription(data, user, verifiedPlan)` takes the plan, its id, Paystack code and limits from the verified plan, never the event metadata; the undefined `paystackPlan` reference is gone and a resubscription also resets `remainingItems`.
Closed 2026-10-12 by /audit independent (round 8): `handleNormalSubscription` (webhook.handler.js:540-641) no longer reads event metadata; plan id, Paystack code and limits come from `verifiedPlan`, and it refuses without one. Its lookup filter still uses the non-schema `user` field, so with Mongoose 8 (strictQuery false) it always creates a new document; noted under Remaining risk, not a regression.

### quick-booking-nothing-paid-at-booking/F-44 [P3] closed - A paid retry after a `charge.failed` on the same checkout is refused (unverified)

**File:** util/webhook.handler.js:181-182 (with 342-346)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `handleChargeFailed` marks the row `failed`. The new mismatch check then treats any later `charge.success` on that reference as "a checkout Paystack refused" and refuses it. If Paystack sends `charge.failed` for a declined attempt and lets the customer retry with another card on the same checkout, the paid retry is not processed. Before this round, the claim (`status: { $ne: 'success' }`) still processed it. Whether Paystack sends this event and allows a retry on the same reference cannot be checked offline.
**Suggested fix:** Give a refused init a distinct status (for example `init-failed`) and refuse only that status. A webhook-reported `failed` row should stay claimable.
**Resolution:**
Fixed 2026-10-12. Only a checkout Paystack refused at initialisation (`metadata.initRefused`) is treated as refused; a row marked `failed` by `charge.failed` still accepts a successful retry. quickBookingStaging 16 (failed then retried on the same checkout → credited).
Closed 2026-10-12 by /audit independent (round 8): the refusal keys only on `metadata.initRefused === true` (webhook.handler.js:193-195), set only where Paystack refuses initialisation (paystack.service.js:127, wallet.service.js:83; `metadata` is Mixed). A `charge.failed` row stays claimable (`status: { $ne: 'success' }`).

### quick-booking-nothing-paid-at-booking/F-45 [P1] closed - Any signed-in customer can create an active subscription with a full monthly allowance without paying (pre-existing, outside this delta)

**File:** services/subscription.service.js:235-267 (route routes/subscription.js:314-317; consumer services/bookOrder.service.js:1763-1777)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** `POST /api/subscription/subscribe-plan` needs only `auth`. `subscribePlan` saves a new `SubscriptionModel` with `planId` from the body and `remainingItems: plan.monthlyLimits`. It never checks payment, and the schema's `status` defaults to `active`. `postBookOrder` with `billingType: pay-from-subscription` then accepts it: it only checks `status === 'active'` and `remainingItems`. The bot's booking flow also tries the subscription first. So a customer can book a month of items on the most expensive plan without paying anything. The same code exists at 502dc0f, so this delta did not introduce it. But the webhook hardening in this work item (F-35, F-38, F-40, F-42) is meant to stop plan value being obtained without payment, and this endpoint does exactly that. `initializePayment` refuses to open a checkout while an active subscription exists, so the real paid flow cannot depend on this endpoint creating an active row first.
**Suggested fix:** Remove the route, or make it admin-only. If the frontend still calls it before checkout, create the row with `status: 'pending'` and `remainingItems: 0`, and let the verified first charge (`handleNormalSubscription`) activate it. Confirm with the frontend which call it uses.
**Resolution:**
Fixed 2026-10-12. Confirmed live on testingdb first (a customer got 40/40 pieces with no Payment and booked 10 pieces marked paid). The user confirmed the app subscribes only through the Paystack checkout and nothing calls this endpoint, so `subscribePlan` is switched off: it always refuses ("Please subscribe to a plan through checkout.") and creates nothing. Admin-only was rejected because the endpoint subscribes the caller, so it could never grant a plan to a customer. Swagger marks it deprecated. Existing subscriptions are untouched (the user confirmed none came from this endpoint). f46Probe on testingdb.
Closed 2026-10-12 by /audit independent (round 9): `subscribePlan` (subscription.service.js:240-244) takes no input and always returns the failed envelope (controller → 400 via base.controller.js:10-13); it creates nothing. Its only caller is the route (routes/subscription.js:311-313); `routes/users.js:30` only imports the route constant and never mounts it. The paid path is untouched by this commit: `initializePayment` (paystack.service.js) and `handleNormalSubscription` (webhook.handler.js:608-709) do not reference it. Swagger shows `deprecated: true` with only a 400 `ErrorResponse`; envelope check 0 wrong.

### quick-booking-nothing-paid-at-booking/F-46 [P2] closed - A renewal charge that cannot be applied is dropped with no Payment record and no admin alert

**File:** util/webhook.handler.js:151-154, 332-340, 313-316
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** Before this round, a charge with no checkout row raised the "Unmatched Paystack payment" admin alert. Now any charge carrying `data.subscription.subscription_code` skips that branch. If `handleRenewal` finds no subscription with that code, or the subscription belongs to someone else, it only writes `console.warn`/`console.error` and returns. No Payment row is written and no admin is told. This happens when `subscription.create` did not attach the code to our document (its filter needs `userId`, the authorization code and the plan code to match), or when the code was attached to an older document. The customer is charged by Paystack every month, nothing is refreshed, and nothing in the system shows the money arrived. The `claimed: true` path (a renewal that matches one of our checkout rows) is worse: it marks our row `success` first and then may apply nothing, with no alert. A refresh that throws after the Payment row was created also cannot be retried, because a repeat now passes `exists(reference)` and stops at the claim.
**Suggested fix:** In `handleRenewal`, when the subscription is unknown or not the payer's, record the reference (for example a Payment row with `metadata.unapplied: true`) and `notifyRoles` admins, matching the unmatched-payment branch. Do the same on the claimed path before returning.
**Resolution:**
Fixed 2026-10-12. `handleRenewal` sends every failure (unknown code, another customer's subscription, or any error while applying) to `reportUnappliedRenewal`. It records the money once per reference: a new `success` Payment row with `metadata.unapplied`, or, when our row already exists (the claimed path, or after a failed refresh), it flags that row. A duplicate event returns quietly. It then alerts admins ("Plan renewal payment not applied") and gives the customer the user-approved in-app notice, which never says the plan renewed. A failed bot push after a successful renewal is caught, so it is no longer reported as unapplied. f46Probe 15/0 on testingdb; quickBookingStaging 67/0 (incl. scenario 16 renewals).
Closed 2026-10-12 by /audit independent (round 9): unknown code, another customer's subscription and errors while applying all reach `reportUnappliedRenewal` (webhook.handler.js:329-395). It records once per reference: a new row (11000 → quiet return before any alert) or, when the row exists (`claimed` or written at :356), a `$set` of the unapplied flags. A repeat event stops at `exists(reference)` (:151) or the atomic claim (:265-281). Every step is in its own try/catch, so it never throws. After `subscription.save()` only `notifyBot` runs, which is async and swallows its own errors (util/notifyBot.js), so a successful renewal cannot be reported as unapplied. The customer text says the payment was received and is being confirmed, never that the plan renewed. Offline probe with stubbed models (no DB) passed: unknown code twice → one row, one alert, one notice; another customer → flagged, subscription untouched; normal renewal twice → applied once, not flagged, no alert; save failure → row flagged, one alert; record failure → no throw. A pre-existing notice-ordering edge seen in the probe is logged separately as F-48.

### quick-booking-nothing-paid-at-booking/F-48 [P3] closed - A renewal that fails to save on a loyalty month still tells the customer "we've added N extra items" (pre-existing ordering)

**File:** util/webhook.handler.js:379-380 (notice sent at :36-46, inside `applySubscriberLoyalty`)
**Found:** 2026-10-12 by /audit independent (round 9; scope: current; lens: quality)
**Why it matters:** `applySubscriberLoyalty` sends the "Loyalty reward unlocked 🎉 … We've added N extra item(s)" notification before `subscription.save()`. If the save then throws on month 3, 6 or 12, nothing was added. F-46's repair now also sends "We've received your plan renewal payment … our team is confirming it", so the customer gets two messages that disagree. Before F-46 the loyalty message was just as wrong, but no second message pointed it out. This only happens when the save fails, and admins are alerted in that case.
**Suggested fix:** Have `applySubscriberLoyalty` return the bonus and leave the notification to `handleRenewal`, which sends it after `subscription.save()` succeeds. Nothing else changes.
**Resolution:**
Fixed 2026-10-12 (on this branch, at the user's request). `applySubscriberLoyalty` is now synchronous: it adds the bonus and returns it. `handleRenewal` saves first, then calls the new `notifySubscriberLoyalty`, which never throws, so a failed notice after a good save is not reported as an unapplied renewal. f48f49Probe on testingdb: a month-3 renewal whose save fails sends no loyalty notice (only the F-46 notice) and leaves the plan unchanged; one that saves goes 40 + 10 = 50 pieces and sends the notice once.
Closed 2026-10-12 by /audit independent (round 10): `applySubscriberLoyalty` (webhook.handler.js:28-39) is synchronous, mutates and returns the bonus with no I/O; its only caller `handleRenewal` saves (:387) before `notifySubscriberLoyalty` (:388), which wraps `createNotification` in try/catch, so a notice failure never reaches the `reportUnappliedRenewal` catch. Offline stubbed probe through signed `util/webhook.js`: save failure → no loyalty notice, only the F-46 notice; saved → 40+10=50 and one notice; notice throwing after save → not flagged unapplied.

### quick-booking-nothing-paid-at-booking/F-49 [P3] closed - Every `charge.failed` webhook throws a ReferenceError and returns 500 (pre-existing, outside this delta)

**File:** util/webhook.js:50 (imports at :2-7)
**Found:** 2026-10-12 by /audit independent (round 9; scope: current; lens: quality)
**Why it matters:** The `charge.failed` case calls `handleChargeFailed`, but the destructured `require('./webhook.handler')` omits it, even though the handler exports it. The call throws, the catch returns 500, and Paystack keeps retrying the event. The row is never marked `failed` and the customer's "payment failed" bot message is never sent. This work item's F-44 reasoning assumes `handleChargeFailed` runs. Money is not affected: the pending row stays claimable, so a paid retry is still credited. `util/webhook.js` is not changed in `502dc0f..90247ef`.
**Suggested fix:** Add `handleChargeFailed` to the destructured import in util/webhook.js.
**Resolution:**
Fixed 2026-10-12 (on this branch, at the user's request). Imported. Because this turns on a handler that had never run in production, it was also narrowed. It moves only a `pending`, non-bank-transfer row to `failed`, so a resend finds nothing and the customer is told once, and a paid row or a transfer proof is never touched. It messages only `payment.userId` from our row (the event's `metadata.userId` could name someone else), and does nothing when there is no row of ours. The order id also comes from our row. User-approved additions: an in-app "Payment not completed" notice and an email to the account address, sent immediately (payment messages are outside the send windows), every step non-fatal. f48f49Probe on testingdb (signed events through `util/webhook.js`): 200 instead of 500; the owner is told once on WhatsApp, in the app and by email; the metadata user gets nothing; a resend, an unknown reference, a transfer proof and a paid row change nothing. quickBookingStaging 16 (failed then retried → credited) still passes.
Closed 2026-10-12 by /audit independent (round 10): `handleChargeFailed` is imported (webhook.js:7) and exported (webhook.handler.js:1071). It atomically moves only `{reference, status:'pending', paymentMethod≠bank-transfer}` to `failed` (:478-482), returns with no row, and messages only `payment.userId` / `payment.order` from our row; the event's metadata and customer email are no longer read. `notifyPaymentFailed` (:511-550) is fully try/caught, escapes name, reason and reference in the email HTML, and emails the account address from `UserModel`. A failed row stays claimable by `charge.success` (`status: {$ne:'success'}`, :272-273; mismatch keys only on `initRefused`, :200-202), so F-44 holds. Immediate sending matches the client rule that order and payment messages are exempt from the follow-up send windows (CRM-REGISTERED-NOT-BOOKED-TEXTS.md rule 1). Offline stubbed probe: 200; owner told once on each channel, metadata user never; resend, unknown reference, transfer proof and paid row change nothing; messenger failures still return 200.

## Independent review

**Status:** passed
**Target commit:** fd27df86b3f5027c85ff1c903c9f907e0f0070cf
**Base commit:** 502dc0f0f38dc0ebdea5bec7878e066af9ee31c2
**Base ref:** origin/main
**Spec hash:** 422316532e26821e04a96c719eddbd00d622b24c7cc6a921768dff6be5d52c39
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-12T14:30:00Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-12T13:47:57Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `502dc0f..fd27df8` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

Round 10. This work item is `4dbdc53..fd27df8`. Round 9 (`90247ef`) passed and logged F-48
and F-49 [P3]; at the user's request `fd27df8` repairs both on this branch (marked `fixed`),
and adds a user-approved in-app notice and email for a failed card payment. Verify each and
move it to `closed` or reopen it. F-47 [P3] stays open (deferred to launch item 9);
F-06/F-08 stay open by design.

### Commands

- `git rev-parse HEAD` / `git merge-base origin/main HEAD` / `sha256sum blueprint/context/current-feature.md` / `git status --porcelain`: pass (fd27df8…, 502dc0f…, 42231653…, only review.md dirty)
- `git diff 502dc0f..HEAD` (product code: services, util, models, routes, crons, swagger) and `git show fd27df8`: reviewed
- `node briefCheck.js`: pass, 462 passed, 0 failed
- Swagger envelope check (AGENTS.md): pass, 0 wrong envelopes
- Module load of `util/webhook.js` and `util/webhook.handler.js`: pass (exports include `handleChargeFailed`)
- Offline stubbed probe (scratchpad `probe10.js`; models, notifyBot, emailService, createNotification, notifyRoles stubbed; signed events through `util/webhook.js`; no DB, no network): pass, 20 passed, 0 failed

### Evidence

- F-49: `util/webhook.js:7` imports `handleChargeFailed`; `util/webhook.handler.js:478-487` claims only `pending`, non-bank-transfer rows and returns when none; recipient and order come from our row (:490-496, :513-517); email HTML escaped (:540-545); every messenger step non-fatal (:527-549). A failed row is still claimable by `charge.success` (:200-202, :272-273), so F-44 holds.
- F-48: `applySubscriberLoyalty` is synchronous (:28-39); `subscription.save()` (:387) precedes `notifySubscriberLoyalty` (:388), which never throws (:43-56).
- Immediate payment messages are consistent with the client rule that order and payment messages are exempt from the follow-up send windows (`blueprint/context/CRM-REGISTERED-NOT-BOOKED-TEXTS.md`, rule 1).
- Probe: owner told once on WhatsApp, in-app and email; the metadata user is never told; a resend, an unknown reference, a bank-transfer proof and a paid row change nothing; messenger failures still return 200; month-3 save failure gives no loyalty notice; saved month-3 gives 40+10 and one notice; a notice failure after save is not reported as unapplied.
- Earlier delta (booking allow-list, catalog pricing, Quick Booking ₦0, offer re-price/linkages, Anytime fee lowering, balanceDue, payment gates, webhook matching/renewals, subscribe-plan switch-off) re-read; no new defect found.
- The request's `Requested at` (14:30Z) is later than this review time; it looks like local time labelled UTC. Request fields are left unchanged.

### Findings

- F-48 [P3]: closed
- F-49 [P3]: closed
- F-47 [P3]: open (user-deferred to launch item 9)
- F-06, F-08 [P3]: open by design (waiting for a test runner)
- No new findings

### Remaining risk

- Builder-reported results not rerun here (DB/server runs are outside this reviewer's boundary): F-48/F-49 testingdb probe 15/0, F-45/F-46 probe 15/0, quickBookingStaging 67/0, plan probe 5/5, boot on 7999 ok (unsigned webhook → 401).
- Whether Paystack sends `charge.failed` per declined attempt while the same checkout stays open for a retry cannot be checked offline. If it does, a customer may get "Payment not completed" and then succeed on the same reference. The retry is still credited. The wording was approved by the user.
- `util/emailService.js` posts to Brevo with no axios timeout, and the webhook awaits it before answering 200. A hung Brevo call would delay the response. A Paystack resend then finds no pending row and changes nothing, so the effect is only on timing.
- If `notifyBot` ever rejected, the in-app notice and email would be skipped, because the row is already `failed` and a resend does nothing. Today `util/notifyBot.js` swallows its own errors, so this cannot happen.
- No test runner, lint or typecheck exists; `briefCheck.js` is assertion-only and partly source-text matching (F-06/F-08).
