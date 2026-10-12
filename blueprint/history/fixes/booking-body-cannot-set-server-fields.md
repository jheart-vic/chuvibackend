# Fix: Booking body cannot set server fields

**Type:** Fix
**Status:** verified
**Branch:** `fix/booking-body-cannot-set-server-fields`

Security hotfix, branched from `main` so it can ship ahead of the stacked launch-fix
branches. Found by the independent review of launch fix 2 (F-18 [P0]).

## The problem

`BookOrderService.postBookOrder` (`POST /api/bookOrder/create-book-order`, also the in-app
assistant's booking) builds the order in all three billing branches as
`{ userId, oscNumber, amount: totalPrice, …, ...post, deliveryDate }`, where `post` is the
request body. Anything in the body overwrites the server's values:

- `amount: 100` → the order's amount is ₦100, which Paystack then charges.
- `paymentStatus: "success"` → an unpaid order is stored as paid (tagging unlocks).
- `userId` → the order is filed under another customer.
- likewise `stage`, `pricing`, `paymentWaivedAt`, `deliveryAmount`, `quickBooking`, …

## The fix

- Save only an allow-list of the customer's own fields from the body
  (`CUSTOMER_ORDER_FIELDS`: name, phone, addresses, pickup date and time, service type,
  care level, speed, channel, billing type, items, note, pickup/delivery), plus the
  Quick Booking fields the server's own normaliser puts on `post`. Every other field is
  the server's.
- The Quick Booking fields (`quickBooking`, `itemsPending`, `counts`) are removed from the
  body before anything reads it, so a client cannot set them.
- Inputs that are read but never stored (`itemCount`, `useCredit`, offer ids, timings,
  window ids, …) are unaffected.

Must not break: any booking branch (pay-per-item, wallet, subscription, Quick Booking).

**Added after review round 1 (changes-requested) — the same hole through `items[]`:**

- **Item prices from the catalog (F-17 [P0]).** Item prices were taken from the body, so
  `items: [{ type: "blanket", price: 100 }]` set the bill just like `amount: 100`. Each
  customer item is now priced from `OrderItem`, or from its `ItemSet` piece when
  `fromSet` is sent (`util/catalogItems.js` `priceFromCatalog`). Names are compared
  lowercased with whitespace as hyphens, because the app sends slugs
  (`shirts-/-tops-/-blouses`). The request's price is ignored; an item that matches
  nothing is refused ("We don't recognise 'X'. Please refresh the app and pick it from
  the list."). It runs before validation and before every billing branch (the
  subscription sum included). Quick Booking placeholders are the server's own and skip it.
  Read-only production check: every customer item line in the previous 14 days matched,
  at exactly the catalog price, so honest bookings are unchanged.
- **Item fields (F-18 [P1]).** Only `type`, `quantity`, `serviceTier` and `fromSet` are
  kept from each item; station, QC, tag and other staff fields are dropped.
- **Channel (F-20).** A customer cannot mark an order `office` (the staff counter's
  channel). `website` / `whatsapp` are still accepted.
- **Round 2 (changes-requested) repairs:** a zero, negative or fractional item quantity
  is refused (F-21 [P0]: two lines at 0 plus one at -5 priced -₦3,000 and a wallet order
  was saved paid for ₦0); `" office"` is compared trimmed (F-20); the subscription
  heavy-item check uses the same name key as pricing (F-22); an unknown service type is
  refused (F-23); deactivated sets are skipped, catalog prices are whole naira, the first
  of two clashing names wins, and Swagger marks `items[].price` as ignored (F-24).
- **Round 3 (changes-requested) repairs:** a real basket drops any stray `itemCount`
  (F-25: `itemCount: 999` unlocked minimum-item offers); one booking holds at most 200
  pieces (F-26: an unbounded quantity crashed the server); a plan order counts pieces and
  is checked against the items left this month, deducting pieces (F-27: a plan could book
  without end). ⚠️ F-27 changes subscriber behaviour — a line of 3 shirts now uses 3 plan
  items, not 1 — confirm with the client.
- **Left open — F-19 [P2]:** the staff counter booking (`intake-user` `createBookOrder`)
  still spreads its body; only intake staff and admins reach it.
- **What can now be refused:** an old app build listing an item no longer in the
  catalog, or a basket holding an item the admin renamed or deleted mid-booking. If the
  admin edits a price mid-booking, the customer pays the new price.
- **testingdb:** production's catalog (12 items, 1 set; names, prices, heavy flags) was
  copied into testingdb, which had none. Booking staging scripts that used made-up items
  (`shirt`, `trouser`) now use catalog items.

## Build steps

1. [x] **Allow-list the saved fields.**
   **Done when:** a booking that sends `amount`, `paymentStatus`, `userId` or
   `quickBooking` gets the server's values, and every billing branch still books.
2. [x] **Price items from the catalog; keep only customer item fields; refuse `office`.**
   **Done when:** a booking with `price: 100` on a catalog item pays the catalog price, an
   unknown item is refused with nothing created, a set piece is priced from its set, and
   staff item fields sent by a customer are not stored.

## Verify

- briefCheck: the allow-list drops server fields, and all three order literals use it.
- A booking against testingdb sending `amount: 100`, `paymentStatus: success` and another
  `userId` (SMS and Paystack stubbed).
- `subLogisticsStaging.js` (subscription branch) on testingdb.
- **Independent review is required** (security, payments).
- **Results (2026-10-11):** briefCheck 407/0. Probe through the real `postBookOrder` on
  testingdb (SMS/Paystack stubbed): **unpatched `main` stored a ₦100 order, marked paid,
  filed under another customer**; with the fix, amount ₦701,000 (server), payment pending,
  owner = caller, `deliveryAmount`/`pricing` server's, `quickBooking` not settable,
  customer fields kept (8/8). `subLogisticsStaging.js` 20/0 (subscription branch).
- **Results after step 2 (2026-10-11):** briefCheck 412/0. Probe 14/14 (adds catalog
  price, item staff fields, unknown item refused with nothing created, set piece, channel).
  Booking staging on testingdb, all stubbed: subLogistics 20/0, freeLogistics 23/0,
  tierPricing 33/0, dispatchTag 46/0, handoff 54/0, dispatch 80/0, phase12 14/0,
  dashboardDecisions 45/0, bookingContext 30/0.
- **Results after round 2 repairs (2026-10-11):** briefCheck 418/0, probe 14/14,
  subLogistics 20/0, handoff 54/0, dispatch 80/0, dashboardDecisions 45/0, tierPricing
  33/0, freeLogistics 23/0.
- **Results after round 3 repairs (2026-10-12):** briefCheck 421/0, probe 14/14, plan
  probe 4/4 (2 left: 3 pieces refused, 2 booked, 0 left, next refused), subLogistics 20/0,
  handoff 54/0, dispatch 80/0, dashboardDecisions 45/0, tierPricing 33/0, freeLogistics
  23/0, dispatchTag 46/0, phase12 14/0.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":6821,"specSha256":"f8d12683a5d76e3182e77abff35b93836d7e4bb18dfbd5b68858bb9e04b972e8","branch":"refs/heads/fix/booking-body-cannot-set-server-fields","head":"4862a8770ff35cd7144b6f83bafcfb8e51a92848","baseRef":"refs/heads/main","baseCommit":"ddbb3ba3876340b08ab571bdf8e8b8e8b4c633b0","sourceTree":"f908e38d86d1ae39b50dbf6335b7f28679e24759","landing":"pull-request","absentOptional":[]} -->

## Findings

### booking-body-cannot-set-server-fields/F-17 [P0] closed - The booking still trusts the customer's item prices, so the bill can be set to almost anything (pre-existing)

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

### booking-body-cannot-set-server-fields/F-18 [P1] closed - Fields inside each booked item are still copied from the body (pre-existing)

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

### booking-body-cannot-set-server-fields/F-20 [P3] closed - The allow-list lets a customer set the order's channel, including "office"

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

### booking-body-cannot-set-server-fields/F-21 [P0] closed - A zero or negative item quantity still lets the customer set the bill

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

### booking-body-cannot-set-server-fields/F-22 [P2] closed - The subscription heavy-item block misses slug and padded item names (pre-existing)

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

### booking-body-cannot-set-server-fields/F-23 [P2] closed - An unknown serviceType prices the basket at multiplier 1 (pre-existing)

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

### booking-body-cannot-set-server-fields/F-24 [P3] closed - Catalog matching edge cases: inactive sets, duplicate names, decimal prices, stale docs

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

### booking-body-cannot-set-server-fields/F-25 [P1] closed - An itemCount sent with a normal basket unlocks minimum-item offers

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
Closed 2026-10-12 by /audit independent (round 4): verified. `delete post.itemCount` runs in the real-basket branch after catalog pricing, before `_priceWithOffers` spreads `post`, so `checkBookingRules` sums the catalog-validated quantities. On the count-only path `itemCount` is the validated 1–200 count that built the same number of placeholder lines. The briefCheck assertion is a source-text match only (same pattern as F-06/F-08).

### booking-body-cannot-set-server-fields/F-26 [P1] closed - A huge item quantity can crash the server (no upper bound)

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
Closed 2026-10-12 by /audit independent (round 4): verified. The total-piece check runs in `priceFromCatalog` before any item is built or exploded. Offline probe: 200 accepted; 100+101, 1e20 and 201 lines of 1 refused; "Infinity" refused as not whole. Quick Booking keeps its own 200 cap, so every path into `explodeItemsToPieces` and the FREE_ITEMS `Array(it.quantity)` is bounded at 200.

### booking-body-cannot-set-server-fields/F-27 [P1] closed - A subscription order never checks the plan's items left, so one plan covers unlimited laundry (pre-existing)

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
Closed 2026-10-12 by /audit independent (round 4): verified. Pieces (sum of catalog-validated whole-number quantities) are checked against `remainingItems` before any order is built, deducted on save and restored on wallet failure; the refusal text matches the assistant's `/limit|exceed/` fallback. Consistent with `getBookingContext` `plan.itemsLeft` (reads `remainingItems`) and the renewal reset to `plan.monthlyLimits`. The client confirmation on pieces-vs-lines stays open as a product question. The read-modify-write is not atomic under concurrent requests, tracked as F-28.

## Independent review

**Status:** passed
**Target commit:** 4862a8770ff35cd7144b6f83bafcfb8e51a92848
**Base commit:** 339bfec73687fa6d77253e26c6079ed3788975f1
**Base ref:** origin/main
**Spec hash:** f8d12683a5d76e3182e77abff35b93836d7e4bb18dfbd5b68858bb9e04b972e8
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-12T05:57:02Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-12T06:02:17Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `339bfec..4862a87` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

Round 4: rounds 1–3 were changes-requested. `4862a87` repairs F-25, F-26 and F-27
(marked `fixed`); verify each and move it to `closed` or reopen it. F-19 is
intentionally left open.

### Commands

- `git rev-parse HEAD` / `git merge-base origin/main HEAD` / `git status --porcelain` / `sha256sum blueprint/context/current-feature.md`: pass (HEAD, base and spec hash match; only review.md dirty)
- `node briefCheck.js`: pass (421 passed, 0 failed)
- Swagger envelope check (AGENTS.md): pass (wrong envelopes: 0)
- Offline `node` probe of `priceFromCatalog`, `util/validate.js`, `isCountOnlyBooking`/`applyCountOnlyBooking`, `customerOrderFields`: pass
- `*Staging.js` booking scripts and testingdb probes: unavailable (no database access in review)

### Evidence

- Full `339bfec..4862a87` delta read: routes/bookOrder.js, services/bookOrder.service.js, util/catalogItems.js, briefCheck.js, staging script item renames.
- All three order literals spread `customerOrderFields(post)`; `quickBooking`/`itemsPending`/`counts` deleted from the body first; `office` channel dropped trimmed/lowercased.
- Probe: slug, name and set-piece items price from the catalog with request price ignored and staff fields dropped; unknown, `__proto__`, `toString`, object types and inactive-set pieces refused; 200 pieces accepted, 201 / 1e20 / 201 lines refused; array `type` and object `serviceTier` refused by the validator; non-array `items` refused.
- F-25: `itemCount` deleted for a real basket before `_priceWithOffers`; offer rule then sums catalog quantities (services/offer.service.js:157).
- F-27: pieces vs `remainingItems`, deduct and rollback consistent with `getBookingContext` `plan.itemsLeft` and webhook renewal reset; refusal text matches the assistant's `/limit|exceed/`.
- Assistant payload (services/bot/booking.flow.js:296, parsers.js:123) sends catalog names, whole quantities ≥ 1; it matches the catalog key.

### Findings

- F-25 closed, F-26 closed, F-27 closed.
- F-28 [P2] open: plan items-left check is not atomic under parallel requests.
- F-19 [P2] open (intentionally), F-06/F-07/F-08/F-16 [P3] open (earlier rounds).

### Remaining risk

- Unverified builder claims: probe 14/14, plan probe 4/4, and the eight booking staging scripts green on testingdb. No database or server run was possible in this review.
- F-27 changes subscriber behaviour (pieces, not lines, against the plan); client confirmation is still pending.
- New briefCheck assertions for F-25 and F-27 match source text only; behaviour depends on the unverified staging runs.
- A booking over 200 pieces through the assistant for a subscriber gets the generic "pay-as-you-go" lead before the 200-piece refusal; wording only.
