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

### F-33 [P2] fixed - A second re-price while a payment hold is open keeps the old hold amount and Paystack link, so the customer can pay the wrong figure

**File:** services/bookOrder.service.js:1186 (with services/paymentHold.service.js:86-97, util/webhook.handler.js:509-519)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** `applyItemEdit` calls `PaymentHoldService.raise` whenever something is outstanding, but `raise` is idempotent: if a hold is already open it returns the old `paymentHold.amount` and `paymentUrl` without changing them. The webhook marks the order paid on any confirmed reference for it and clears `balanceDue`, without comparing what was paid to `amountDue(order)`. Example: paid ₦5,000, edited to ₦6,000 (balance and hold ₦1,000, link initialised for ₦1,000), then edited again to ₦7,000 (balance ₦2,000, hold still ₦1,000). The reminders keep sending "₦1,000" with the old link. Paying that link marks the order fully paid, and ₦1,000 is never collected. `approveTransfer` also records the stale `paymentHold.amount` on the bank-check list. In the other direction, edited back down to ₦5,500 the balance is ₦500 but the link still charges ₦1,000. Edited down to ₦4,000, the order becomes `success` with a ₦1,000 wallet refund, but the hold stays open: the order sits at `stage: hold` (Intake must release it by hand) with a live ₦1,000 link. If the customer pays it, the webhook returns early on the paid order and the money is taken with nothing credited. A card checkout opened before an edit and completed after it has the same effect. The idempotent hold and the webhook with no amount check were already there at 502dc0f for never-paid orders. F-30 now lets paid orders reach this too, and adds the case of a paid order left on an open hold.
**Suggested fix:** In `applyItemEdit`, when a payment hold is already open, refresh it to the new `amountDue` with a new link, or clear it and raise a new one. When nothing is outstanding any more, clear it (`PaymentHoldService.clear`, source `item-edit`). In `handleOrderPayment`, compare `metadata.amount` with `amountDue(order)`: if it is short, take what was paid off `balanceDue` and leave the order pending; if the order is already paid or the payment is over, credit the excess to the wallet. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. (1) `applyItemEdit` clears an open payment hold before raising one for what is owed now (owing nothing → released), and `approveTransfer` records `amountDue(order)`, not an older hold figure. (2) The card webhook settles against what Paystack collected (`data.amount`): short → unpaid with the rest as `balanceDue` and a fresh hold; over → paid and the excess to the wallet; a separate payment on an order already paid → refunded to the wallet (the pre-existing "two checkouts" loss). Also fixed: the webhook's missing-Payment fallback never set the required `type`, so it failed validation and dropped the payment. quickBookingStaging 11 (second edit refreshes the hold, paid once in total) and 13 (short by ₦1,000 → ₦1,000 due and held; remainder settles and clears the hold; a stray ₦500 returns to the wallet).

### F-34 [P3] fixed - Admin mark-paid paths leave `balanceDue` set, which lets a second card payment start on a paid order

**File:** services/bookOrder.service.js:2421, services/admin.service.js:1643 (with services/paystack.service.js:94-100)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: security)
**Why it matters:** `updateBookOrderPaymentStatus` and the admin Payment approval set `paymentStatus: success` but do not unset `balanceDue`, unlike the webhook, the wallet and `approveTransfer`. `initializePayment` never checks `order.paymentStatus`. Its only duplicate guard is now bypassed while `balanceDue > 0`, so on such an order it still opens a Paystack checkout for the balance. If that is paid, the webhook returns early on the already-paid order: the customer is charged and nothing is credited. `updateBookOrderPaymentStatus` also leaves the hold and its pre-initialised link open. These are admin override paths and need a deliberate action, so this is low risk.
**Suggested fix:** Unset `balanceDue` wherever an order is marked `success`. In `initializePayment`, refuse an order whose `paymentStatus` is already `success`. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. Both admin mark-paid paths clear `balanceDue`, and `initializePayment` refuses an order already paid ("This order has already been paid."). briefCheck.
