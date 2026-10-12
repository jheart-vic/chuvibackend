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

### F-07 [P3] open - The getBookOrder comment and the spec say the intake route shares this handler; it does not

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
**Resolution:**

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
**Resolution:**

### F-16 [P3] open - The window-only fees line says "Choose a time window" when a window cannot help

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
**Resolution:**

### F-17 [P0] closed - The booking still trusts the customer's item prices, so the bill can be set to almost anything (pre-existing)

**File:** util/itemPricing.js:78
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** Pre-existing and outside the hotfix delta, but it defeats what the
hotfix is for. `postBookOrder` checks only that `items.*.price` is an integer
(services/bookOrder.service.js:1336). It never looks up the catalog price. The
pay-per-item and wallet branches then price with `priceItems`, which uses
`Number(item.price)` from the body (util/itemPricing.js:78). The subscription branch sums
`item.price * quantity` the same way (services/bookOrder.service.js:1640). So a customer
who sends `items: [{ type: "blanket", price: 100, quantity: 1 }]` gets an order `amount`
of ₦100 plus fees. Paystack charges that, or the wallet is debited that, and the order is
saved as paid. That is the same outcome as the `amount: 100` attack this fix closes. The
in-app assistant takes its prices from the catalog (services/bot/booking.flow.js:35), so
only direct API callers can do this.
**Suggested fix:** In `postBookOrder`, look up each item's price on the server from
`OrderItemModel` (and set pieces from `ItemSetModel`) by `type`. Refuse an unknown type, or
ignore the body's price. Placeholder Quick Booking pieces keep price 0. Nothing current is
lost.
**Resolution:** Fixed 2026-10-11. New `util/catalogItems.js` `priceFromCatalog`: every customer booking item is priced from `OrderItem` (or its `ItemSet` piece when `fromSet` is sent), matched lowercased with whitespace as hyphens; the request's price is ignored and an unknown item is refused ("We don't recognise …"). Runs in `postBookOrder` before validation and before every billing branch (the subscription sum included); Quick Booking placeholders skip it. Production check (read-only): every customer item line in the 14 days before matched the catalog at exactly the catalog price. briefCheck + testingdb probe (a `price: 100` item booked at the catalog price; `blanket` refused, nothing created; a set piece priced from its set).
Closed 2026-10-11 by /audit independent (round 2): verified. `priceFromCatalog` runs before validation and every billing branch, overwrites any request price, and refuses unknown types. Offline probe: `price: 1` on catalog items came back at catalog price, `blanket` was refused. A zero or negative `quantity` still lowers the bill, but that is a separate input, tracked as F-21.

### F-18 [P1] closed - Fields inside each booked item are still copied from the body (pre-existing)

**File:** util/explodeItems.js:22
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** Pre-existing. The allow-list keeps `items`, and
`explodeItemsToPieces(post.items)` (services/bookOrder.service.js:1695/1836/1996) copies
every field of each body item onto the stored piece. A customer can therefore set the
staff fields on `ItemSchema`: `currentStation: "qc-station"`, `qcStatus: "passed"`,
`tagStatus: "complete"`, `tagId`, `washStatus`, `holdDetails`, `flaggedForReview`,
`actionLog`, and so on. A booking can arrive with its pieces already marked as past
tagging or at QC, so it skips stations in the split flow. An offline probe of
`customerOrderFields` followed by `explodeItemsToPieces` kept all three injected fields.
The briefCheck hotfix assertions do not cover item subfields.
**Suggested fix:** When the order is built, map each body item to `{ type, price,
quantity, serviceTier, fromSet }` before it is exploded into pieces. Add a briefCheck
assertion that an injected `currentStation`/`qcStatus` is dropped. Nothing current is lost.
**Resolution:** Fixed 2026-10-11. `priceFromCatalog` keeps only `type`, `quantity`, `serviceTier`, `fromSet` (plus the catalog price); station, QC, tag and every other staff field is dropped. Probe: an item sent with `qcStatus: passed`, `tagStatus: complete`, `currentStation: qc-station` is stored pending at intake.
Closed 2026-10-11 by /audit independent (round 2): verified. Items are rebuilt from `CUSTOMER_ITEM_FIELDS` plus the catalog price before `explodeItemsToPieces`. The only other source of items is the server's own Quick Booking placeholders. The briefCheck assertion covers `qcStatus`/`tagStatus`/`currentStation`.

### F-19 [P2] open - The staff counter booking still spreads the request body over the order (pre-existing)

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

### F-20 [P3] closed - The allow-list lets a customer set the order's channel, including "office"

**File:** services/bookOrder.service.js:113
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** `channel` is on `CUSTOMER_ORDER_FIELDS`, so a customer booking can
store `channel: "office"`, which is meant only for counter orders
(CLIENT-ANSWERS-oct2026.md:305). A non-pickup customer order marked `office` then drops out
of the intake pending list, which filters on `whatsapp`/`website`
(services/intake-user.service.js:2060), and channel reporting is wrong. The impact is
small. No money moves.
**Suggested fix:** Accept only `website`/`whatsapp` from the customer path. Otherwise fall
back to the schema default. Nothing current is lost.
**Resolution:** Fixed 2026-10-11. `postBookOrder` drops `channel: "office"` (the staff counter's channel); `website` / `whatsapp` are still accepted (the WhatsApp bot books through this endpoint). Probe confirms.
Reopened 2026-10-11 by /audit independent (round 2): the check is a strict `post.channel === 'office'` (services/bookOrder.service.js:1285). The BookOrder schema's `channel` has `trim: true` before its enum, so `channel: " office"` passes the check and is stored as `office`. Suggested fix: accept only `website`/`whatsapp` (allow-list after trim and lowercase), and drop anything else.
Fixed again 2026-10-11 (round 3). The channel is compared trimmed and lowercased, as the schema stores it, so " office" is dropped too.
Closed 2026-10-11 by /audit independent (round 3): verified. The value is trimmed and lowercased before the comparison, so " office" and "OFFICE" are both dropped. Any other value that is not in the enum fails the schema on save.

### F-21 [P0] closed - A zero or negative item quantity still lets the customer set the bill

**File:** services/bookOrder.service.js:1362
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** Pre-existing, but it reopens the hole F-17 closed. `items.*.quantity` is
only `integer|required`, and validatorjs accepts `0`, `-5` and the string `"-5"`.
`priceItems` (util/itemPricing.js:80) multiplies by `Number(quantity)`, and so does the
subscription sum (services/bookOrder.service.js:1665). Meanwhile `explodeItemsToPieces`
stores `Math.max(1, qty)` pieces. Offline probe: two `duvet` lines at quantity 0 plus a
shirt line at `"-5"` priced the items at -₦3,000 and stored 3 pieces. In the wallet branch,
`chargeWalletForOrder` debits nothing when the amount is 0 or less, and the order is saved
`paymentStatus: success` (services/bookOrder.service.js:2014). Pay-per-item charges only
the fees, or less. So a direct API caller gets real pieces washed for ₦0, and negative
lines cancel the cost of paid lines. `applyItemEdit` already refuses `quantity <= 0`
(services/bookOrder.service.js:984), but booking does not.
**Suggested fix:** In `priceFromCatalog`, or the validator, refuse any item whose quantity
is not a whole number of at least 1. Store `Number(quantity)` so later reads cannot see a
string. Add a briefCheck assertion. Nothing current is lost.
**Resolution:**
Fixed 2026-10-11. `priceFromCatalog` refuses any item whose quantity is not a whole number of at least 1 ("Each item needs a whole-number quantity of at least 1.") and stores the quantity as a number. briefCheck drives 0, -5, "-5", 1.5, "two" and missing.
Closed 2026-10-11 by /audit independent (round 3): verified. Offline probe: 0, -0, "-5", 1e-7, null, "", [], {} and missing are refused. "1e3", " 2 ", true, [3] and "0x10" become positive whole numbers and price at the catalog rate. No line can price at zero or below. The missing upper bound is a separate availability issue, tracked as F-26.

### F-22 [P2] closed - The subscription heavy-item block misses slug and padded item names (pre-existing)

**File:** services/bookOrder.service.js:1622
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** The heavy check compares `item.type.toLowerCase()` with the catalog name
lowercased. The app sends slugs (`king-size-duvet`), and `priceFromCatalog` also accepts
`" Duvet "`. So any multi-word heavy item from the app, or any heavy item with padding,
is booked under a subscription that does not cover heavy items. The hotfix now
guarantees every item matched a catalog entry by `catalogKey`, so the fix is cheap.
**Suggested fix:** Compare with `catalogKey` on both sides, and key set pieces by `fromSet`.
Better still, have `priceFromCatalog` return `isHeavy` per item. Nothing current is lost.
**Resolution:**
Fixed 2026-10-11. The subscription heavy-item check compares `catalogKey` on both sides, the same key pricing uses, so slugged heavy items are caught.
Closed 2026-10-11 by /audit independent (round 3): verified. Both sides use `catalogKey` (services/bookOrder.service.js:1629-1638). Set pieces are keyed by piece name only. That can block an item it should not, but it never lets a heavy item through.

### F-23 [P2] closed - An unknown serviceType prices the basket at multiplier 1 (pre-existing)

**File:** services/bookOrder.service.js:1794
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** `serviceType` is only `string|required`, and the schema enum is
commented out. Both priced branches fall back to `serviceTypeMultiplier = 1` when the
name is not in `adminOrderSetting.serviceTypes` (lines 1794 and 1937). If any configured
`pricePerPiece` is above 1, a customer who sends `serviceType: "x"` pays the catalog base,
and the order is stored with a service the stations do not know. Production
multipliers were not visible to this review. Raise to P1 if any is above 1.
**Suggested fix:** Refuse a `serviceType` that is not in `adminOrderSetting.serviceTypes`.
Nothing current is lost.
**Resolution:**
Fixed 2026-10-11. An unknown `serviceType` is refused ("Please choose a service from the list.") before any pricing. Production multipliers are x1 / x0.7 / x0.6 (read-only check), so the old x1 fallback never discounted, but it stored made-up service types.
Closed 2026-10-11 by /audit independent (round 3): verified. The exact-name check (services/bookOrder.service.js:1474) runs before every billing branch, so the x1 fallbacks at 1809 and 1952 can no longer be reached.

### F-24 [P3] closed - Catalog matching edge cases: inactive sets, duplicate names, decimal prices, stale docs

**File:** util/catalogItems.js:37
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** The booking loads `ItemSetModel.find({})`, while the customer catalog
lists only `active: true` sets (services/admin.service.js:3543). That lets a deactivated
set's pieces still be booked. Two catalog names that share one `catalogKey` silently take
the last price. A catalog price with decimals (the schema allows it) fails the
`items.*.price: integer` rule, and every booking of that item is refused with "items.0.price
must be an integer". The create-book-order Swagger still lists `items[].price` as required,
but the body's price is now ignored.
**Suggested fix:** Filter sets by `active: true`, and round or refuse non-integer catalog
prices in the admin path, or relax the rule to `numeric`. Note in Swagger that `price` is
ignored. Nothing current is lost.
**Resolution:**
Fixed 2026-10-11. Deactivated sets are skipped, catalog prices are rounded to whole naira, the first of two clashing names wins, and Swagger documents `items[].price` as ignored (no longer required) with `quantity` minimum 1.
Closed 2026-10-11 by /audit independent (round 3): verified. Sets with `active: false` are skipped, prices go through `Math.round`, the first entry for a clashing key wins, and Swagger marks `price` as ignored with `quantity` minimum 1 (envelope check: 0 wrong).

### F-25 [P1] fixed - An itemCount sent with a normal basket unlocks minimum-item offers

**File:** services/offer.service.js:157
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** `isCountOnlyBooking` treats `items` + `itemCount` as a normal booking
and leaves `itemCount` on `post` (the spec lists it as read but not stored).
`_priceWithOffers` spreads `post` into `OfferService.validateAndPrice`
(services/bookOrder.service.js:821). `checkBookingRules` then uses an explicit
`draft.itemCount` instead of counting the real items. Offline probe: an offer with
`rules.minItems: 10` is refused for a one-item basket. The same basket with
`itemCount: 999` (or `"999"`) passes. So a customer with one item gets a minimum-item
offer's discount or free pickup/delivery in the pay-per-item and wallet branches. The
price is lowered by a body field, which is the thing this hotfix is meant to stop.
**Suggested fix:** In `postBookOrder`, delete `post.itemCount` when the booking is not
count-only. Quick Booking already turns the count into N placeholder lines, so the count
derived from the items is the same. Or have `_priceWithOffers` pass `itemCount: undefined`.
Add a briefCheck assertion. Nothing current is lost.
**Resolution:** Fixed 2026-10-12. A booking with real items deletes `itemCount` after catalog pricing, so offer rules count the real items. briefCheck.

### F-26 [P1] fixed - A huge item quantity can crash the server (no upper bound)

**File:** util/catalogItems.js:58
**Found:** 2026-10-11 by /audit independent (scope: current; lens: performance)
**Why it matters:** Pre-existing. `priceFromCatalog` refuses quantities below 1 but has no
ceiling, and the `integer` rule accepts values up to 9007199254740992 (offline probe:
1e9 passes both). `explodeItemsToPieces` (util/explodeItems.js:20) then builds one object
per piece in a synchronous loop, before anything is saved. Offline, 2,000,000 pieces
took 377 ms and about 170 MB of heap, and that is before Mongoose casting. One request
with `quantity: 100000000` therefore blocks the event loop and runs out of heap, a fatal
Node crash that takes the server down for every user. The FREE_ITEMS offer benefit does
the same with `Array(it.quantity).fill(...)` (services/offer.service.js:894). Capacity and
subscription limits count lines, so neither stops it. Any registered customer can send
it, and so can an honest typo. Quick Booking already caps a booking at 200 pieces
(`MAX_QUICK_BOOKING_PIECES`).
**Suggested fix:** In `priceFromCatalog`, refuse any line quantity above a sensible cap
(for example the same 200), and refuse a basket whose total pieces go over it, with a
plain sentence. Add a briefCheck assertion. Nothing current is lost.
**Resolution:** Fixed 2026-10-12. `priceFromCatalog` refuses more than 200 pieces in one booking (the Quick Booking ceiling, `MAX_BOOKING_PIECES`) before any piece is built. briefCheck (150+51 refused, 200 accepted, 100,000,000 refused).

### F-27 [P1] fixed - A subscription order never checks the plan's items left, so one plan covers unlimited laundry (pre-existing)

**File:** services/bookOrder.service.js:1674
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** Pre-existing. The subscription branch refuses an order only when its
number of LINES is above the plan's `monthlyLimits` (`post.items.length >
subscription.planId.monthlyLimits`). It never checks `subscription.remainingItems`,
which is reduced at line 1753 and can go below zero. Each line can also carry any
quantity, and `explodeItemsToPieces` stores that many pieces as covered
(`paymentStatus: success` when no pickup/delivery fee is due). A Student-plan subscriber
(₦12,000 for 28 items) can place any number of orders of up to 28 lines, each line at
any quantity, and pay ₦0 for the laundry. Counting lines rather than pieces was an
earlier recorded design choice (session.md, per-piece explosion). Not checking
`remainingItems` was not. The in-app assistant's "try the plan first" step relies on this
check to fall back to pay-per-item.
**Suggested fix:** Refuse an order when `post.items.length > subscription.remainingItems`.
Ask the client whether the plan allowance counts pieces (the sum of quantities, which is
what Quick Booking already does by building one line per piece), and use that answer for
both the check and the deduction. Nothing current is lost.
**Resolution:** Fixed 2026-10-12. A plan order counts PIECES and is checked against `remainingItems` (the items left this month); it deducts pieces and the wallet-failure rollback adds them back. The refusal keeps "limit"/"exceeds" so the assistant still falls back to pay-per-item. testingdb probe: plan with 2 left refuses 3 pieces, books 2, ends at 0, refuses the next. ⚠️ Behaviour change for subscribers (a line of 3 shirts now uses 3 plan items, not 1): confirm with the client.
