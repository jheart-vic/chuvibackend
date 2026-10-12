# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-06 [P3] open - The failed-delivery checks in briefCheck only match source text

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

### F-07 [P3] closed - The getBookOrder comment and the spec say the intake route shares this handler; it does not

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

### F-08 [P3] open - The new access checks in briefCheck only match source text, and the section headers above them are misplaced

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

### F-16 [P3] closed - The window-only fees line says "Choose a time window" when a window cannot help

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

### F-17 [P1] closed - A customer can send `orderId` in a booking to reuse an offer attached to another order

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

### F-18 [P0] closed - A booking body can overwrite the order's amount, paymentStatus and userId (pre-existing, outside this delta)

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

### F-19 [P2] closed - A client-sent `quickBooking: true` zeroes a normal booking's bill

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

### F-20 [P2] fixed - An item edit drops an attached offer that expired or was paused after booking

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

### F-21 [P2] closed - Releasing a promotion linkage turns it into a reusable "personal" reward

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

### F-22 [P3] closed - The unbilled Anytime branch can lower the leg fee twice under concurrent calls

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

### F-23 [P3] closed - The new briefCheck cover is mostly source-text matching; offer settlement is not driven

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

### F-24 [P1] fixed - A customer can mark an unbilled Quick Booking as paid with a ₦0 wallet payment and skip the bill

**File:** services/bookOrder.service.js:2014 (with services/wallet.service.js:188-200, services/bookOrder.service.js:1094-1097)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** This work item creates every Quick Booking with `amount: 0` and `paymentStatus` pending. The pay paths read `amount: 0` as "nothing owed". A customer calls `POST /api/wallet/pay-with-wallet { bookOrderId: <their QB> }`. `payWithWallet` calls `chargeWalletForOrder` with amount 0, so `cashNeeded` is 0 and the call succeeds. It then sets `paymentStatus = "success"`. When Intake enters the items, `applyItemEdit` takes `amountPaid = previousTotal = 0`, so `outstanding = newTotal`. But `PaymentHoldService.raise` refuses ("already paid"), and the order keeps `paymentStatus: success` with the full bill as `amount`. `itemTagGate` → `moneyIsComplete` then opens the tags, and the order is processed and delivered without being paid. `settleAnytimeRefund` also skips the new unbilled branch (`paymentStatus === SUCCESS`) and credits a real wallet refund on an order that paid nothing. Before this delta a Quick Booking carried its trip fees as `amount`, so this was reachable only with no trips at standard speed. Now every Quick Booking exposes it. The in-app assistant's "use my balance" does not pay it, but it tells the customer the Quick Booking is "already fully covered — there's nothing left to pay" (services/bot/payment.flow.js:273).
**Suggested fix:** Refuse payment on an order that is still `itemsPending` ("Your bill isn't ready yet; we'll send it after we count"). Do this in `payWithWallet`, in `PaystackService.initializePayment` for orders, and in the assistant's unpaid-order lookup (skip `itemsPending` orders or give the not-billed-yet reply). Optionally, have `applyItemEdit` treat a ₦0 "success" as unpaid when the bill rises. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. New `orderPayableGate` (util/paymentGate.js): an order still waiting for its items is not payable ("There's nothing to pay yet. We send your bill by SMS after we count your clothes."). Checked first by `WalletService.payWithWallet`, `PaystackService.initializePayment` (order) and the assistant's "use my balance". The Intake re-price clears `itemsPending` before it raises the hold, so the SMS bill and its Paystack link still work. quickBookingStaging scenario 9 (wallet and real card init both refused, order stays unpaid).
