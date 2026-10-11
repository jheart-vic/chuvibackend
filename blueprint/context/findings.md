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

### F-17 [P0] fixed - The booking still trusts the customer's item prices, so the bill can be set to almost anything (pre-existing)

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

### F-18 [P1] fixed - Fields inside each booked item are still copied from the body (pre-existing)

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

### F-20 [P3] fixed - The allow-list lets a customer set the order's channel, including "office"

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
