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

### F-09 [P2] fixed - The fees line counts the auto-apply pick as applied, not the offer the customer selected

**File:** services/offer.service.js:630
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** `onBill` treats a personal offer as on the bill only when it is
`bestPersonalId` (the auto-apply pick). Order creation applies a personal offer only when
the request carries `customerOfferId` (`pickBestPersonalOffer` has no caller). So if a
customer selects a 10% discount offer instead of their free-trip offer, the fees line says
"You get free pickup and delivery on this order" and the order still charges both fees.
The same happens with no selection at all, and for the Welcome Offer line. A promotion is
also counted as applied when it is selected but not stackable with the selected personal
offer, which `validateAndPrice` would reject.
**Suggested fix:** When `draft.customerOfferId` is present, use it in place of
`bestPersonalId`, and judge promotions with `hasPersonal` set as `validateAndPrice` does
(or derive the line from the `selected` breakdown).
**Resolution:** Fixed 2026-10-11. `buildFeesLine` now takes `selected` (the validateAndPrice quote the order charges) and counts only the baselines that passed plus the personal offer and promotion the customer selected and that survived validation. briefCheck (unselected and rejected-promo cases) and bookingContextStaging scenario 4.

### F-10 [P2] fixed - booking-options prices the raw timing, order creation the resolved one

**File:** services/offer.service.js:828
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** `_priceWithOffers` passes the resolved timings, so a same-day pickup
with no morning window is forced to Anytime and keeps its fee
(services/bookOrder.service.js:790 and the force near line 1466). `getBookingOptions` uses
the raw draft, so the same basket sent as `deliverySpeed: same-day, pickupTiming: window`
shows `selected.freePickup: true` and a "free-reached" fees line, then the order charges
the pickup fee. The screen and the bill disagree on exactly the case the client ruled on.
**Suggested fix:** Apply the same same-day-forces-Anytime resolution to the draft in
`getBookingOptions` (share a small helper with postBookOrder), or document that the
frontend must send `anytime` for same-day.
**Resolution:** Fixed 2026-10-11. New `BookingWindowService.resolvePickupTiming` holds the same-day rule; `postBookOrder` and `getBookingOptions` both call it (the latter only when timings are sent, as the order does). briefCheck and bookingContextStaging scenario 5.

### F-11 [P2] fixed - The bot can still apply a referral code after the first order

**File:** services/bot/details.flow.js:21
**Found:** 2026-10-11 by /audit independent (scope: current; lens: security)
**Why it matters:** The new first-order guard lives only in `ReferralApiService.applyCode`.
The in-app bot's `applyReferralCode` calls `ReferralService.captureReferral` directly, and
`captureReferral` has no order check. A customer with delivered orders can tell the bot
"apply code X" and get a referrer attached, which the client said must not happen and
which may let a later order earn the referrer a reward. Not a regression (both paths
allowed it before), but the rule is now enforced in one of two entry points.
**Suggested fix:** Move the non-cancelled-order check into `captureReferral` for the
code-entry sources (or call it from the bot flow too), keeping the same message.
**Resolution:** Fixed 2026-10-11. `ReferralService.hasPlacedOrder` is checked inside `captureReferral` (every entry point; the registration callers run before any order exists), and `applyCode` and the bot use it first for the client's message. bookingContextStaging scenario 6.

### F-12 [P2] fixed - BookingContext documents displayNames as maps; the service returns arrays

**File:** swagger/schemas.js:1368
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** `displayNames` comes from `labelMap` (util/displayName.js:112), which
returns `{ deliverySpeeds: [{ value, label, renamed }], serviceTypes: [...], serviceTiers: [...] }`.
The schema (and the spec) show `{ standard: "Regular", ... }` objects. The frontend reads
these docs for the exact shape, so a screen built from them looks up `deliverySpeeds.standard`
and gets undefined. AGENTS.md requires examples to match reality.
**Suggested fix:** Document each group as `type: array` of `{ value, label, renamed }`,
matching the admin display-names route.
**Resolution:** Fixed 2026-10-11. Each `displayNames` group is documented as an array of the existing `DisplayNameEntry` schema. Swagger build confirms `type: array`.

### F-13 [P3] fixed - The free-gap message always says "pickup and delivery"

**File:** services/offer.service.js:696
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** The free-gap row is chosen for any offer that waives either leg, but
the message is fixed to "free pickup and delivery". An offer that waives only delivery
promises a free pickup the customer will not get. It also fires when the pickup is
Anytime, where reaching the minimum would not free that leg.
**Suggested fix:** Use `legs()` from the gap offer's benefits, as the other rows do.
**Resolution:** Fixed 2026-10-11. The free-gap message names the legs from the gap offer's own trip benefits, minus any leg booked Anytime; an offer with no such leg left gives no gap line. briefCheck.

### F-14 [P3] fixed - welcomeOffer.active stays true while the Welcome Offer is attached to a placed order

**File:** services/bookOrder.service.js:2375
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** The query includes `ATTACHED` linkages, which are committed to an
order and rejected by booking-options ("Offer already applied to an order"). After the
first order is placed and before it is redeemed, booking-context reports the Welcome Offer
active while `canEnterReferralCode` is false and no booking can use it. The offer's own
status (paused) is not checked either.
**Suggested fix:** Count only `ASSIGNED`/`VIEWED` linkages whose offer is active.
**Resolution:** Fixed 2026-10-11. booking-context counts only ASSIGNED/VIEWED linkages whose offer is ACTIVE. bookingContextStaging scenarios 5 (paused) and 6 (attached).

### F-15 [P3] fixed - The read-only reset, the timing pass-through and the applyCode guard have no offline check

**File:** briefCheck.js:2052
**Found:** 2026-10-11 by /audit independent (scope: current; lens: tests)
**Why it matters:** The new briefCheck block drives `computeBenefits` and `buildFeesLine`
well, but `freeLegsThisWeek` (rollover and no-write), `_priceWithOffers` receiving resolved
timings, and the `applyCode` refusal are covered only by bookingContextStaging.js, which
needs a testing database. A regression there passes every offline gate.
**Suggested fix:** Add pure briefCheck assertions for `freeLegsThisWeek` (input object
unchanged, rolled-over week returns the full grant). Nothing current is lost.
**Resolution:** Fixed 2026-10-11. briefCheck now drives `freeLegsThisWeek` (rolled-over week gives the full grant, input object unchanged) and `resolvePickupTiming`, and asserts both callers use the helper. The `applyCode` refusal stays covered by bookingContextStaging only (it needs a database).
