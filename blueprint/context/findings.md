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

### F-20 [P2] closed - An item edit drops an attached offer that expired or was paused after booking

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

### F-24 [P1] closed - A customer can mark an unbilled Quick Booking as paid with a ₦0 wallet payment and skip the bill

**File:** services/bookOrder.service.js:2014 (with services/wallet.service.js:188-200, services/bookOrder.service.js:1094-1097)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** This work item creates every Quick Booking with `amount: 0` and `paymentStatus` pending. The pay paths read `amount: 0` as "nothing owed". A customer calls `POST /api/wallet/pay-with-wallet { bookOrderId: <their QB> }`. `payWithWallet` calls `chargeWalletForOrder` with amount 0, so `cashNeeded` is 0 and the call succeeds. It then sets `paymentStatus = "success"`. When Intake enters the items, `applyItemEdit` takes `amountPaid = previousTotal = 0`, so `outstanding = newTotal`. But `PaymentHoldService.raise` refuses ("already paid"), and the order keeps `paymentStatus: success` with the full bill as `amount`. `itemTagGate` → `moneyIsComplete` then opens the tags, and the order is processed and delivered without being paid. `settleAnytimeRefund` also skips the new unbilled branch (`paymentStatus === SUCCESS`) and credits a real wallet refund on an order that paid nothing. Before this delta a Quick Booking carried its trip fees as `amount`, so this was reachable only with no trips at standard speed. Now every Quick Booking exposes it. The in-app assistant's "use my balance" does not pay it, but it tells the customer the Quick Booking is "already fully covered — there's nothing left to pay" (services/bot/payment.flow.js:273).
**Suggested fix:** Refuse payment on an order that is still `itemsPending` ("Your bill isn't ready yet; we'll send it after we count"). Do this in `payWithWallet`, in `PaystackService.initializePayment` for orders, and in the assistant's unpaid-order lookup (skip `itemsPending` orders or give the not-billed-yet reply). Optionally, have `applyItemEdit` treat a ₦0 "success" as unpaid when the bill rises. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. New `orderPayableGate` (util/paymentGate.js): an order still waiting for its items is not payable ("There's nothing to pay yet. We send your bill by SMS after we count your clothes."). Checked first by `WalletService.payWithWallet`, `PaystackService.initializePayment` (order) and the assistant's "use my balance". The Intake re-price clears `itemsPending` before it raises the hold, so the SMS bill and its Paystack link still work. quickBookingStaging scenario 9 (wallet and real card init both refused, order stays unpaid).
Closed 2026-10-12 by /audit independent (round 3): every customer path that can charge or mark an uncounted order paid is gated. `payWithWallet` (wallet.service.js:189-193, also the only wallet path the assistant uses, payment.flow.js:112), `initializePayment` for orders (paystack.service.js:65-69, also used by the hold's link builder and the assistant's card link), and the assistant's lookup (payment.flow.js:274-279). The booking-time wallet charges (bookOrder.service.js:1917, 2223) cannot run for a Quick Booking because `applyCountOnlyBooking` forces pay-per-item. The webhook can only confirm a Paystack reference that `initializePayment` created, so it is gated upstream. `applyItemEdit` sets `itemsPending: false` and the real items in one `updateOne` before `PaymentHoldService.raise` builds the link, so the bill's Paystack link and wallet payment work. Offline probe: `orderPayableGate` refuses `itemsPending: true`/unset with placeholder pieces and null, and allows `itemsPending: false` and real items. Remaining staff-only gap recorded as F-31.

### F-29 [P3] closed - On a re-price, an order's attached promotion can be offered as its "personal" offer and applied twice

**File:** services/offer.service.js:518
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `getBookingOptions` builds its personal list from every linkage the query returns, with no `offer.type === PERSONAL` filter, and `_offerRejection({ kind: 'personal' })` does not check the type either. The round-3 `$or` branch returns every ATTACHED linkage on the re-priced order, so a promotional linkage attached to that order is now listed as a personal candidate whatever its expiry (before, only one whose promotion had a future `expiryDate` matched). On a Quick Booking re-price, `pickBestPersonalOffer` can pick it, and `_repriceForItems` then passes it as `customerOfferId` while also passing the same promotion as `promoOfferId`. If the promotion is `stackableWithPersonal`, `validateAndPrice` applies it twice. New Quick Bookings attach no offer at booking and the re-price only re-passes an already-attached promotion, so this is reachable only for Quick Bookings booked before this change that had a promotion attached at booking. Note: the F-numbers F-25 to F-28 are skipped because the hotfix ledger used them and code comments cite them.
**Suggested fix:** In `getBookingOptions`, skip linkages whose `offerId.type` is not PERSONAL (the same filter `getCustomerOffers` uses at offer.service.js:440), or restrict the new `$or` branch to personal offers.
**Resolution:**
Fixed 2026-10-12. The personal-offer list in `getBookingOptions` skips promotion linkages, so the re-pick can never take an attached promotion as the personal offer. briefCheck.
Closed 2026-10-12 by /audit independent (round 4): offer.service.js:541 skips `OFFER_TYPE.PROMOTIONAL` linkages before `evaluate('personal', ...)`, so `pickBestPersonalOffer` cannot return the attached promotion; briefCheck 450/0.

### F-30 [P2] closed - A paid order whose bill goes up at the item edit stays marked paid (pre-existing, outside this delta)

**File:** services/bookOrder.service.js:1094 (with services/paymentHold.service.js:80)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** Found while tracing F-24. It was not introduced by this work item and is the same at 502dc0f. `applyItemEdit` treats a `success` order as having paid `previousTotal`, computes `outstanding = newTotal - previousTotal`, writes `amount: newTotal`, and calls `PaymentHoldService.raise`. `raise` refuses any order with `paymentStatus: success` ("already paid"), so no hold or link is raised. The order keeps `success` with the higher `amount`, `moneyIsComplete` opens the tags, and the difference is never collected unless staff notice the error in the response and send a top-up request by hand. Reachable for a normal order paid at booking that Intake finds has more items, and for a Quick Booking that paid its trip fees under the old rule before this change.
**Suggested fix:** Fix in its own change. When a paid order's bill rises, reset `paymentStatus` to pending (or record the paid amount separately) and raise the hold for the outstanding difference only.
**Resolution:**
Fixed 2026-10-12. New `balanceDue` on the order. When the item edit raises the bill of a paid (or part-paid) order, it goes back to unpaid with only the difference due; `amountDue` makes the payment hold, the Paystack link, the wallet payment and the assistant collect that balance, and the webhook, the wallet payment and a transfer approval clear it. Paystack allows a second card payment only while a balance is due. The wallet payment now also releases a payment hold and starts the processing clock, as the webhook does. A cancelled part-paid order refunds what was paid (`amountPaidSoFar`, used by the cancel verdict, `_performCancellation` and `cancellationOutcome`). quickBookingStaging scenario 11 (paid ₦421,000, edited to ₦1,261,000, hold and balance ₦840,000, wallet pays it, paid once in total, hold cleared).
Closed 2026-10-12 by /audit independent (round 4): the first raise on a paid order now goes pending with `balanceDue` = difference and a fresh hold for that difference; hold, Paystack init, wallet and assistant all read `amountDue`; webhook, wallet and approveTransfer clear it; cancel refunds use `amountPaidSoFar` (waiver excluded, credits subtracted). Offline probe of up/up/down/down sequences gives the right status, balance and refund at each step. Residual hold/link staleness on a SECOND re-price is recorded as F-33; admin mark-paid paths that leave `balanceDue` set as F-34.

### F-31 [P3] closed - Staff bank-transfer approval can still mark an uncounted Quick Booking paid at ₦0

**File:** services/paymentHold.service.js:463
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** `approveTransfer` (Intake or admin, `/api/intake-user/order/{id}/approve-transfer`) does not check `orderPayableGate`. Approving a transfer on a Quick Booking still waiting for its items marks it `success` with amount 0. When Intake then enters the items, the hold is refused as "already paid" and the order goes through unpaid, which is the F-24 outcome through a staff action. The admin `updateBookOrderPaymentStatus` and the admin Payment approval are deliberate admin overrides. This path needs a human, is audited, and notifies an admin, so the risk is a mistake rather than abuse.
**Suggested fix:** Refuse `approveTransfer` while `awaitingRealItems(order)` ("Enter the items first; there is no bill yet").
**Resolution:**
Fixed 2026-10-12. `approveTransfer` checks `orderPayableGate` first. quickBookingStaging scenario 12.
Closed 2026-10-12 by /audit independent (round 4): paymentHold.service.js:485-488 refuses before any write, after the already-paid check.

### F-32 [P2] closed - The staff counter booking spread the request body over the order (carried over from the hotfix's F-19)

**File:** services/intake-user.service.js:339
**Found:** 2026-10-11 by /audit independent of the booking hotfix (its F-19); carried into this work item 2026-10-12
**Why it matters:** `IntakeUserService.createBookOrder` built the order as `{ ..., amount, paymentStatus, intakeStaffId, channel: OFFICE, stage, ...post }`, so the staff request could override amount, attribution, stage, channel, owner and pricing. Intake staff and admins only, but it undermined the counter audit trail.
**Suggested fix:** An allow-list of the order's own fields in place of `...post`.
**Resolution:** Fixed 2026-10-12. Only `STAFF_ORDER_FIELDS` (name, phone, addresses, pickup date and time, service, care level, speed, items, note, pickup/delivery) are taken from the request, spread first so the server's values win. counterPaymentStaging 51/0; briefCheck.
Closed 2026-10-12 by /audit independent (round 4): the allow-list matches every order field in the documented `/intake-user/create-book-order` request (routes/intake-user.js:62-150); `paymentMethod`/`secondaryPaymentMethod`/`useCredit` are still read from `post` before the build, and `items` is re-set from `post.items` after it, so nothing the counter app sends is lost.

### F-33 [P2] closed - A second re-price while a payment hold is open keeps the old hold amount and Paystack link, so the customer can pay the wrong figure

**File:** services/bookOrder.service.js:1186 (with services/paymentHold.service.js:86-97, util/webhook.handler.js:509-519)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** `applyItemEdit` calls `PaymentHoldService.raise` whenever something is outstanding, but `raise` is idempotent: if a hold is already open it returns the old `paymentHold.amount` and `paymentUrl` without changing them. The webhook marks the order paid on any confirmed reference for it and clears `balanceDue`, without comparing what was paid to `amountDue(order)`. Example: paid ₦5,000, edited to ₦6,000 (balance and hold ₦1,000, link initialised for ₦1,000), then edited again to ₦7,000 (balance ₦2,000, hold still ₦1,000). The reminders keep sending "₦1,000" with the old link. Paying that link marks the order fully paid, and ₦1,000 is never collected. `approveTransfer` also records the stale `paymentHold.amount` on the bank-check list. In the other direction, edited back down to ₦5,500 the balance is ₦500 but the link still charges ₦1,000. Edited down to ₦4,000, the order becomes `success` with a ₦1,000 wallet refund, but the hold stays open: the order sits at `stage: hold` (Intake must release it by hand) with a live ₦1,000 link. If the customer pays it, the webhook returns early on the paid order and the money is taken with nothing credited. A card checkout opened before an edit and completed after it has the same effect. The idempotent hold and the webhook with no amount check were already there at 502dc0f for never-paid orders. F-30 now lets paid orders reach this too, and adds the case of a paid order left on an open hold.
**Suggested fix:** In `applyItemEdit`, when a payment hold is already open, refresh it to the new `amountDue` with a new link, or clear it and raise a new one. When nothing is outstanding any more, clear it (`PaymentHoldService.clear`, source `item-edit`). In `handleOrderPayment`, compare `metadata.amount` with `amountDue(order)`: if it is short, take what was paid off `balanceDue` and leave the order pending; if the order is already paid or the payment is over, credit the excess to the wallet. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. (1) `applyItemEdit` clears an open payment hold before raising one for what is owed now (owing nothing → released), and `approveTransfer` records `amountDue(order)`, not an older hold figure. (2) The card webhook settles against what Paystack collected (`data.amount`): short → unpaid with the rest as `balanceDue` and a fresh hold; over → paid and the excess to the wallet; a separate payment on an order already paid → refunded to the wallet (the pre-existing "two checkouts" loss). Also fixed: the webhook's missing-Payment fallback never set the required `type`, so it failed validation and dropped the payment. quickBookingStaging 11 (second edit refreshes the hold, paid once in total) and 13 (short by ₦1,000 → ₦1,000 due and held; remainder settles and clears the hold; a stray ₦500 returns to the wallet).
Closed 2026-10-12 by /audit independent (round 5): every scenario in this finding is handled. A second edit clears the open hold and raises one for the current `amountDue` with a new link (bookOrder.service.js:1186-1206), owing nothing releases it, `approveTransfer` records `amountDue(order)`, and the webhook settles against `data.amount` (HMAC-signed by Paystack, util/webhook.js:14-22). Short/over/duplicate math traced by hand for unpaid, paid and part-paid orders (e.g. 18,000 with 3,000 left → `amountDue` 3,000, `amountPaidSoFar` 15,000, probed offline). Side effects of this fix are tracked separately as F-35 (the fallback now credits forged top-ups), F-36 and F-37.

### F-34 [P3] closed - Admin mark-paid paths leave `balanceDue` set, which lets a second card payment start on a paid order

**File:** services/bookOrder.service.js:2421, services/admin.service.js:1643 (with services/paystack.service.js:94-100)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** `updateBookOrderPaymentStatus` and the admin Payment approval set `paymentStatus: success` but do not unset `balanceDue`, unlike the webhook, the wallet and `approveTransfer`. `initializePayment` never checks `order.paymentStatus`. Its only duplicate guard is now bypassed while `balanceDue > 0`, so on such an order it still opens a Paystack checkout for the balance. If that is paid, the webhook returns early on the already-paid order: the customer is charged and nothing is credited. `updateBookOrderPaymentStatus` also leaves the hold and its pre-initialised link open. These are admin override paths and need a deliberate action, so this is low risk.
**Suggested fix:** Unset `balanceDue` wherever an order is marked `success`. In `initializePayment`, refuse an order whose `paymentStatus` is already `success`. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. Both admin mark-paid paths clear `balanceDue`, and `initializePayment` refuses an order already paid ("This order has already been paid."). briefCheck.
Closed 2026-10-12 by /audit independent (round 5): `updateBookOrderPaymentStatus` (bookOrder.service.js:2435) and the admin Payment approval (admin.service.js:1642-1645) both unset `balanceDue` on success, and `initializePayment` refuses a paid order before creating a Payment row (paystack.service.js:65-69), which also covers the hold's link builder.

### F-35 [P1] closed - The webhook's repaired missing-Payment fallback now credits a wallet top-up from metadata the payer controls

**File:** util/webhook.handler.js:160-170 (with util/webhook.handler.js:653-662)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** Before this round, a `charge.success` whose reference had no Payment row failed validation (`type` is required) and nothing happened. Probe: the old fallback document is invalid on `type`, and the new one is valid. Now the row saves and the flow continues. `handleWalletTopUp` then adds `metadata.amount` to `metadata.userId`'s wallet without reading `data.amount` or checking that the user is the payer. The only transactions with no Payment row are ones `initializePayment` did not create. Anyone holding the merchant public key (it is public by design, and any Paystack Inline checkout exposes it) can start one with their own reference, amount and metadata. Example: pay ₦100 with `metadata: { transactionType: 'wallet-top-up', userId: <any user>, amount: 1000000 }`. Paystack sends a genuinely signed `charge.success`, the HMAC check passes, and the wallet gains ₦1,000,000. The subscription branch is reachable the same way and is not checked against the plan price.
**Suggested fix:** Process only references `initializePayment` created. When the Payment row is missing, record the event for an admin and stop; do not run the type handlers. Defence in depth: credit top-ups from `data.amount / 100`, and require `metadata.userId` to equal the payer.
**Resolution:**
Fixed 2026-10-12. A signed event whose reference has no pending Payment row (i.e. not a checkout this server started) is never processed: logged and an admin is notified, nothing saved, so a retry stops too. Every real checkout (order/subscription `initializePayment`, wallet top-up init) writes that row first; Paystack renewals carry no `transactionType` and already returned earlier. Wallet top-ups now credit `data.amount / 100` (what Paystack collected) and only when `metadata.userId` is the payer. quickBookingStaging 14 (a forged top-up with no checkout, and one naming another user, credit nothing; a genuine ₦2,000 top-up with metadata ₦999,999 credits ₦2,000).
Closed 2026-10-12 by /audit independent (round 6): a reference with no Payment row now stops before any write (webhook.handler.js:157-173), and top-ups credit `data.amount / 100` only when `metadata.userId` is the payer found by email (webhook.handler.js:207-210, 677-693). The scenario recorded here is gone. A pre-existing variant that reuses a pending row the server did NOT open as a checkout (and the unchecked subscription price) is tracked as F-38.

### F-36 [P2] closed - A delayed or concurrent duplicate webhook is refunded as a "second payment" on an order already marked paid for the same money

**File:** util/webhook.handler.js:524-538 (with util/webhook.handler.js:152-176)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** The new branch assumes an order already `success` means separate money, because "the same reference never reaches here twice". There are two holes. (1) A human can mark the order paid for this same card payment, and nothing ties that to the reference. Example: the webhook cannot reach the server (deploy or outage) and Paystack retries for up to 72 hours. Meanwhile the customer shows the receipt and an admin uses `updateBookOrderPaymentStatus` or Intake uses `approveTransfer`. When the retry lands, the Payment row is still pending, so the full amount goes to the wallet. The customer has had the order settled and also got the money back. (2) The Payment-row check is a `findOne` and then a `save`, so it is not atomic. Two near-simultaneous deliveries of one event can both pass it, and the later one refunds. Before this round, both cases simply returned.
**Suggested fix:** Claim the reference atomically (`findOneAndUpdate({ reference, status: { $ne: 'success' } }, { status: 'success' })`, and continue only if it matched). In the already-paid branch, refund automatically only when the order was paid by a Paystack reference other than this one or by the wallet. Otherwise notify an admin to settle it by hand.
**Resolution:**
Fixed 2026-10-12. The reference is claimed atomically (`findOneAndUpdate` with `status: { $ne: 'success' }`), so a duplicated or racing event is processed once. A payment landing on an order already paid is flagged to admins ("Payment on an order already paid … refund it if genuine"), not refunded automatically, because a late retry of the same money cannot be told apart from a real second payment. quickBookingStaging 13 (the same event twice changes nothing; ₦500 on a paid order → wallet unchanged, admin flagged).
Closed 2026-10-12 by /audit independent (round 6): the `findOneAndUpdate({ reference, status: { $ne: 'success' } })` claim (webhook.handler.js:177-193) runs before the order, top-up and subscription branches (first charge and renewal alike), so a duplicate or racing delivery stops at `!payment`. The already-paid branch (webhook.handler.js:547-564) only notifies admins; nothing is credited automatically, and the Payment row keeps the record.

### F-37 [P3] closed - Clearing a hold just to raise a new one tells the customer "payment received, we have started work"

**File:** services/bookOrder.service.js:1186-1192, util/webhook.handler.js:552 (with services/paymentHold.service.js:232-250)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `PaymentHoldService.clear` always sends the in-app notice "Thank you — payment for order … has been received and we have started work". It also writes `stageHistory` "Payment confirmed (<source>)" and an audit line. Both new clear-then-raise sites call it when nothing, or only part, has been paid: a second item edit on an unpaid order, and a short card payment. The customer gets a false "paid, started" notice right before the "payment needed" SMS, and the order's history says payment was confirmed by `item-edit`. Each refresh also gives a new `raisedAt`, which restarts the 6h/24h reminders and the 48h admin escalation (the reason `raise` was made idempotent).
**Suggested fix:** Give `clear` a quiet mode (no notification, a neutral history note) for a refresh, or add a `refresh` helper that updates `paymentHold.amount`/`paymentUrl` in place and keeps `raisedAt`.
**Resolution:**
Fixed 2026-10-12. `clear({ quiet: true })` for a REPLACED hold (item edit, short card payment): no "payment received" message, history and log say "Payment hold replaced — the bill changed". `raise({ keepClockFrom })` keeps the replaced hold's `raisedAt` and `remindersSent`, so the 6h/24h reminders and the 48h admin escalation do not restart. quickBookingStaging 11.
Closed 2026-10-12 by /audit independent (round 6): both replace sites (bookOrder.service.js:1186-1211, webhook.handler.js:573-586) take `raisedAt`/`remindersSent` from the open hold before the quiet clear, and `raise` writes them back (paymentHold.service.js:129-135). The quiet clear skips the "Payment received" notice; its `markProductionClearedIfReady` call cannot start the clock because the order is still unpaid. A replaced hold cannot remind with a wrong figure: `raise` sends the new amount and link at once, and later reminders read the new `paymentHold.amount`. Reminders already sent are not repeated, which is the intent. The separate hold-SLA escalation (`escalateOverdueHolds`, keyed on `stage.updatedAt`) restarts on each raise, as it does for every re-held order.

### F-38 [P1] closed - The webhook acts on the event's metadata, so a pending Payment row the server never opened as a checkout can be reused to activate a plan for a token payment (pre-existing, outside this delta)

**File:** util/webhook.handler.js:157-217 (with util/webhook.handler.js:444-487, services/wallet.service.js:54-74 and 748-760, services/wallet.service.js:307-318)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** The F-35 repair assumes that every pending Payment row is a Paystack checkout this server opened, so the event's metadata must be ours. That is not true for two kinds of row. (1) `walletTopUp` writes the pending row before calling Paystack, and it validates only `amount: integer|required` (offline probe: 0 and -5 pass). With `amount: 0`, Paystack refuses the initialize call, and the row stays `pending` with a reference that Paystack has never seen. (2) `uploadPaymentProof` writes a pending `BT-<ms>` wallet-top-up row. The customer's own transaction history (`wallet.service.js:307-318`) returns `reference` and `status` for both kinds. So a customer can open a Paystack Inline checkout with the public key, using that reference and metadata `{ transactionType: 'subscription', planId, paystackPlan: <most expensive plan> }`, and pay ₦100 with their own email. The webhook finds the row, claims it, and dispatches on `metadata.transactionType`, never on the row's `type`, `userId` or `paymentMethod`. `handleNormalSubscription` then creates an active subscription with that plan's `monthlyLimits` from the metadata alone. It never compares `data.amount` with `plan.price`. The `order` and `wallet-top-up` branches are safe in this case, because they settle or credit only what was collected. The same thing happened at 502dc0f, so this delta did not introduce it. But F-35's "only a payment this server started is processed" guarantee does not hold, and this is the remaining way to get value that was not paid for.
**Suggested fix:** In `handleChargeSuccess`, process the event only when `existing.status === 'pending'`, `existing.type === metadata.transactionType`, `String(existing.userId) === String(user._id)` and `existing.paymentMethod !== 'bank-transfer'`. Otherwise alert an admin, as the unmatched-reference branch does. In `handleNormalSubscription`, refuse unless `data.amount / 100 >= plan.price`. Optionally, have `walletTopUp` refuse an amount below the Paystack minimum before it writes the row. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. `handleChargeSuccess` only acts when the event matches the checkout WE recorded: our row is not `failed`, is not a bank-transfer proof (`paymentMethod: bank-transfer` / `BT-` reference), has the event's type, belongs to the payer, and (orders) is for the same order; otherwise nothing is credited and admins are alerted. A first subscription charge activates only the plan this checkout recorded and only when the money collected covers its price. Checkouts Paystack refuses are marked `failed` (initializePayment, wallet top-up), and a top-up under ₦100 is refused before Paystack is called. quickBookingStaging 15 (a bank-transfer row and a top-up row re-used as a subscription, and a ₦100 payment on a ₦50,000 plan checkout, activate nothing).
Closed 2026-10-12 by /audit independent (round 7): the scenario is gone. Failed-init rows are marked `failed` (paystack.service.js:126-129, wallet.service.js:81-85), BT rows, type, owner and order mismatches stop before the claim (webhook.handler.js:180-208), and a first subscription charge needs a resolved plan and `collected >= plan.price` (webhook.handler.js:261-280). New references are refused by Paystack as duplicates once initialized, and legacy pending rows are deleted daily by reconcilePaystack. Residual trust in `metadata.paystackPlan` is tracked as F-43; side effects as F-40, F-41, F-42 and F-44.

### F-39 [P3] closed - Credits read `data.amount`, which may include the Paystack fee when the customer bears it

**File:** util/webhook.handler.js:201, 207-210
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** Top-ups credit `data.amount / 100`, and an order payment above `amountDue` sends the excess to the wallet. If the Paystack account passes transaction fees to customers, `data.amount` may be the total charged, fee included, rather than the amount requested. Each top-up would then credit the fee as wallet cash, and every card order would refund the fee as an "overpayment". This depends on the Paystack dashboard setting and on payload semantics that cannot be checked offline.
**Suggested fix:** Confirm the account's fee bearer. If customers bear fees, use `data.requested_amount` when it is present, or subtract `data.fees`.
**Resolution:**
Fixed 2026-10-12 (defensively; the account fee setting was not checked). Each checkout records `metadata.expectedAmount`; the webhook credits `min(collected, expected)`, so a fee the customer bore is never credited. quickBookingStaging 15 (a ₦1,015 charge for a ₦1,000 top-up credits ₦1,000).
Closed 2026-10-12 by /audit independent (round 7): both checkout paths record `metadata.expectedAmount` in naira (paystack.service.js:119-122, wallet.service.js:66-67), the webhook credits `min(collected, expected)` and falls back to `collected` for rows without it (webhook.handler.js:212-215), the claim preserves `expectedAmount` (line 225), and nothing else reads Payment.metadata.

### F-40 [P1] fixed - Subscription renewals can no longer be processed, so paid months never refresh the item allowance

**File:** util/webhook.handler.js:146-173 and 285-328 (with server.js:36-39)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** Paystack starts each monthly renewal itself. That charge's reference was never written by `initializePayment`, so no Payment row exists for it. Since 9367785, a `charge.success` with no row stops at step 2 ("did not match any checkout we started") before the renewal branch. If the renewal event has no `metadata.transactionType`, it already stops at line 146. Either way, at HEAD the renewal branch (status active, `remainingItems = plan.monthlyLimits`, `consecutiveMonths + 1`, loyalty bonus, customer notice) is unreachable. server.js:36-39 says this webhook is the ONLY monthly reset. A subscriber who pays month 2 keeps last month's leftover items and is billed per item once they run out, and each renewal sends admins an "Unmatched Paystack payment" alert. At 502dc0f the missing-row fallback let a renewal that carries metadata through. No offline check or staging scenario drives a renewal event (briefCheck 2454-2461 only matches source text).
**Suggested fix:** Before the "no matching checkout" refusal, route events with `data.subscription?.subscription_code` to the renewal branch, keyed on a `SubscriptionModel` whose `subscriptionCode` matches and whose `userId` is the payer found by email. Do not use `metadata.transactionType` for this. Then claim the reference atomically by upserting a Payment row on `reference`. Add a staging scenario that sends a renewal event with no pre-created row.
**Resolution:**
Fixed 2026-10-12. A charge carrying Paystack's `subscription.subscription_code` with no Payment row of ours is a renewal: routed (before the metadata and checkout-row checks) to `handleRenewal`, which matches OUR subscription by code, requires it to belong to the payer, claims the reference by creating a unique Payment row (a repeated event hits E11000 and renews once), then refreshes the allowance, next payment date and loyalty month. quickBookingStaging 16 (renewal → 30 items, month 2; the same event twice renews once; a renewal by another payer is refused).

### F-41 [P2] fixed - A checkout link paid more than a day after it was opened is refused, because the cleanup cron deletes its pending row

**File:** crons/reconcilePaystack.js:27-37 (with util/webhook.handler.js:157-173, services/paymentHold.service.js:54-58 and 440-443)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** At 03:00 each day, reconcilePaystack deletes every `pending` Payment row with `amount: 0` that was created more than one day earlier. The variable is named `threeDaysAgo`, but the code subtracts one day. Every checkout row is written with `amount: 0`. The payment-hold link is created when the hold is raised, and the 24h reminder sends the same link again. The hold stays open until an admin acts after 48h. Example: a hold raised Monday 10:00, the 24h reminder on Tuesday, the row deleted at 03:00 Wednesday, the customer pays on Wednesday. Since 9367785, a payment with no row is not processed. The customer is charged, the order stays on hold, and only an admin alert remains. Bot card links and the logistics-fee link behave the same way. At 502dc0f the fallback processed such a payment.
**Suggested fix:** Stop deleting pending checkout rows. Either mark them `abandoned` and accept a later `charge.success` for them, or extend the cutoff past the longest life of a link the server reuses (hold reminders up to 48h). Check the 3-day intent against the code.
**Resolution:**
Fixed 2026-10-12. The reconcile cron keeps pending checkout rows 7 days (it deleted them after 1 day while the variable said 3), past the payment-hold link window.

### F-42 [P2] fixed - A first subscription charge is checked against the plan's current database price, not the amount the checkout asked for

**File:** util/webhook.handler.js:262-265 (with services/paystack.service.js:97 and 136)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** Activation requires `collected + 0.5 >= plan.price`, where `plan.price` is read at webhook time. When `plan` is passed to initialize, Paystack charges the Paystack plan's own amount. The DB `price` and `paystackPlanCode` are edited separately (subscription.service.js createPlan/updatePlan never touch Paystack). Two cases fail. (1) An admin raises the DB price after a customer opened the checkout. (2) The DB price differs from the Paystack plan amount. In both, a genuine payment is claimed `success` at line 220 before this check, nothing is activated, and a retry cannot recover it. The customer is charged and only an admin alert remains.
**Suggested fix:** Compare against `existing.metadata.expectedAmount` when present (what this checkout asked for), and fall back to `plan.price` only for legacy rows. Optionally also accept `data.plan.amount` when its `plan_code` equals the recorded plan's `paystackPlanCode`. Run the check before the atomic claim, or leave the row pending, so an admin can see the money was not applied.
**Resolution:**
Fixed 2026-10-12. The first-subscription-charge check runs BEFORE the atomic claim, against the amount the checkout asked for (`expectedAmount`, i.e. the price when it opened; the plan's current price only for legacy rows). A refusal leaves the row pending for an admin instead of recording money against nothing. quickBookingStaging 16 (price raised after checkout → the plan still activates; an underpaid charge leaves its row pending).

### F-43 [P3] fixed - handleNormalSubscription still takes the plan and its limits from event metadata instead of the plan the webhook verified

**File:** util/webhook.handler.js:281, 508-518, 557
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** The caller resolves and price-checks `plan` from our row's `metadata.planId`. `handleNormalSubscription` ignores it. It sets `planId` from `metadata.planId` and reads `monthlyLimits` from `PlanModel.findOne({ paystackPlanCode: metadata.paystackPlan })`. The `planMismatch` check covers `planId` but not `paystackPlan`. Event metadata is ours today, because Paystack refuses a duplicate reference and refused inits are marked `failed`. So this is exploitable only through a pending subscription row Paystack never saw: a swallowed failed-mark write (paystack.service.js:127 `.catch(() => {})`) or a pre-deploy row inside the one-day cleanup window. Line 557 also references an undefined `paystackPlan`. That branch is dead today, because the filter's `user` field does not exist on the schema.
**Suggested fix:** Pass the verified `plan` into `handleNormalSubscription`. Use `plan._id`, `plan.paystackPlanCode` and `plan.monthlyLimits`, and drop the metadata lookups. Fix or remove the dead `else` branch.
**Resolution:**
Fixed 2026-10-12. `handleNormalSubscription(data, user, verifiedPlan)` takes the plan, its id, Paystack code and limits from the verified plan, never the event metadata; the undefined `paystackPlan` reference is gone and a resubscription also resets `remainingItems`.

### F-44 [P3] fixed - A paid retry after a `charge.failed` on the same checkout is refused (unverified)

**File:** util/webhook.handler.js:181-182 (with 342-346)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `handleChargeFailed` marks the row `failed`. The new mismatch check then treats any later `charge.success` on that reference as "a checkout Paystack refused" and refuses it. If Paystack sends `charge.failed` for a declined attempt and lets the customer retry with another card on the same checkout, the paid retry is not processed. Before this round, the claim (`status: { $ne: 'success' }`) still processed it. Whether Paystack sends this event and allows a retry on the same reference cannot be checked offline.
**Suggested fix:** Give a refused init a distinct status (for example `init-failed`) and refuse only that status. A webhook-reported `failed` row should stay claimable.
**Resolution:**
Fixed 2026-10-12. Only a checkout Paystack refused at initialisation (`metadata.initRefused`) is treated as refused; a row marked `failed` by `charge.failed` still accepts a successful retry. quickBookingStaging 16 (failed then retried on the same checkout → credited).
