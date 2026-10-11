# Fix: Quick Booking nothing paid at booking

**Type:** Fix
**Status:** not started
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

## Build steps

1. [ ] **Booking charges nothing.** Step 1 above, plus the Intake queue comment.
   **Done when:** a count-only booking is created with `amount: 0`, `paymentStatus`
   pending, no credit spent and no offer attached, and a normal pay-per-item booking
   still charges its fees.
2. [ ] **Re-price keeps and picks the offer.** Step 2 above.
   **Done when:**
   - a Quick Booking whose items are entered gets the free-trip offer once the basket
     meets its minimum, and that offer is attached to the order
   - a first-order customer with a First Experience offer gets it auto-applied
   - an edited normal order keeps the offer it was booked with
3. [ ] **Anytime refund and booking-options.** Steps 3 and 4 above.
   **Done when:** an unbilled Quick Booking served inside a window has its leg fee lowered
   and no wallet credit, a paid order still gets the wallet refund, and booking-options
   returns the `quick-booking` line for an `itemCount` draft.
4. [ ] **Swagger:** `paymentRequired` on the booking response and the `quick-booking`
   `feesLine` type. **Done when:** the envelope check reports 0 wrong envelopes.

## Verify

- briefCheck: offline assertions for the booking amount rule, the same-order linkage
  rule in `_offerRejection`, the Anytime fee-lowering branch and the `quick-booking` line.
- A staging scenario on testingdb: book a Quick Booking (nothing charged), enter items
  below and above a free-trip offer's minimum (offer applied and attached, payment hold
  raised for the right total), a First Experience auto-apply, an Anytime pickup served
  in a window, and a normal order edit keeping its offer.
- Boot on `PORT=7999`.
- **Independent review is required:** this changes when money is taken and how offers
  attach.

## Frontend impact (to send them)

- A Quick Booking returns `paymentRequired: false`: show no payment step. The bill comes
  by SMS after Intake counts.
- booking-options with `itemCount` returns `feesLine.type: 'quick-booking'` with its message.
- The line under the number box is theirs (client's wording): "Between 1 and 200. You pay
  nothing now. After we count your clothes, we send your bill by SMS, with pickup and
  delivery included."
