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

## Verify

- briefCheck: offline assertions for the booking amount rule, the same-order linkage
  rule in `_offerRejection`, the Anytime fee-lowering branch and the `quick-booking` line.
- A staging scenario on testingdb: book a Quick Booking (nothing charged), enter items
  below and above a free-trip offer's minimum (offer applied and attached, payment hold
  raised for the right total), a First Experience auto-apply, an Anytime pickup served
  in a window, and a normal order edit keeping its offer.
- Boot on `PORT=7999`.
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
- The line under the number box is theirs (client's wording): "Between 1 and 200. You pay
  nothing now. After we count your clothes, we send your bill by SMS, with pickup and
  delivery included."
