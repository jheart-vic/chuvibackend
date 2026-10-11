# Fix: Booking screen data and the window-only free rule

**Type:** Fix
**Status:** verified
**Branch:** `fix/booking-screen-data-and-window-only-free-rule`

Launch work item 1 of 9 (client message of 11 Oct, items 10, 11, 12, 14 and 15, plus the
frontend's list). The frontend has built these screens and is waiting on data only the
backend has. One rule the data depends on (free trips for window bookings only) was
never enforced, so it is fixed here too, or the new fees line would describe pricing
that does not happen.

## The problem

| Need | Today |
|---|---|
| Renamed labels (speeds, services, care levels) for customers | `GET /api/admin/display-names` is admin-only, so customers get 403 and see stored names |
| Payment options with numbers (item 11) | No customer endpoint returns the wallet balance next to plan items left |
| Last order's choices (item 12) | Not returned anywhere |
| Free pickups left this week (item 14, frontend item 33) | `remainingPickupDeliveries` is only reset lazily at booking, so a raw read can show last week's number. The dashboard does not return it. |
| Welcome Offer active, and the referral code box (item 15, frontend item 18) | No flag. `POST /api/referral/apply-code` also accepts a code after the first order, which the client says must not happen. |
| Fees line (item 10, frontend item 6) | `checkoutPrompt` covers only personal offers, so it is empty for most customers. No gap, reached, welcome or window-only line. |
| **Free trips for window bookings only** (client ruling, 8 Oct) | **Not enforced.** `validateAndPrice` waives pickup and delivery for any timing, so an Anytime booking gets free trips. |

## The fix

### 1. `GET /api/bookOrder/booking-context` (new, customer `auth`)

One read for everything on the booking screen that does not depend on the basket:

```json
{
  "displayNames": {
    "deliverySpeeds": [{ "value": "standard", "label": "Regular", "renamed": true }],
    "serviceTypes": [], "serviceTiers": []
  },
  "wallet": { "balance": 2500, "rewardCredit": 1000 },
  "plan": {
    "active": true, "itemsLeft": 18, "monthlyItems": 30,
    "freePickupDeliveriesLeftThisWeek": 1, "freePickupDeliveriesPerWeek": 2,
    "weekResetsAt": "2026-10-14T09:00:00.000Z"
  },
  "suggestedPayment": "pay-from-subscription",
  "lastOrderChoices": {
    "serviceType": "wash-and-iron", "serviceTier": "classic", "deliverySpeed": "standard",
    "pickupTiming": "window", "pickupWindowId": "...", "pickupAddress": {}
  },
  "welcomeOffer": { "active": true, "name": "First Experience Offer", "endsAt": "..." },
  "canEnterReferralCode": true
}
```

- `plan` is `null` with no active subscription. The free count uses the existing
  `applyWeeklyReset` on a **copy**, so a read never writes.
- `suggestedPayment` is `pay-from-subscription` when the plan is active with items
  left, otherwise `null`. The screen preselects "My plan" from it.
- `lastOrderChoices` comes from the customer's latest non-cancelled order, or is
  `null` when there is none.
- `welcomeOffer.active` means an unused (assigned or viewed) First Experience linkage
  that has not expired, on an offer that is active.
- `canEnterReferralCode` is true only with no referrer on record and no
  non-cancelled order yet.

### 2. Dashboard (`My Plan`)

Add `freePickupDeliveriesLeftThisWeek` and `freePickupDeliveriesPerWeek` to the
dashboard's `subscription` block, computed the same way. These are the field names
the frontend asked for.

### 3. Referral code after the first order

`applyCode` refuses once the customer has a non-cancelled order: "Referral codes can
only be added before your first order." This is the same rule as
`canEnterReferralCode`.

### 4. Window-only free trips (pricing)

- `validateAndPrice` takes optional `pickupTiming` and `deliveryTiming` in the draft.
  A leg booked `anytime` keeps its fee even when an offer would waive it. The rest
  of the offer (discounts, credit) still applies.
- `_priceWithOffers` passes the **resolved** timings from `scheduling`, not the raw
  request. A same-day pickup is forced to Anytime, so it pays the Anytime fee, as the
  client ruled.
- Orders with no timing (older app builds) are unchanged.
- **Out of scope here:** "if our capacity forces a customer out of a window they keep
  their offer". That waits on the client's answer to question 2 and belongs to work
  item 4.

### 5. Fees line on `POST /api/offers/booking-options`

The response gains `feesLine`, computed from the same draft (now including timing):

| `type` | When | `amount` |
|---|---|---|
| `welcome-offer` | A first order with an applicable First Experience offer | what it takes off this bill |
| `window-only` | Some offer would waive a trip, but that leg is booked Anytime | the fee kept |
| `free-reached` | An applicable offer waives pickup and/or delivery | the fees waived |
| `free-gap` | A free-trip offer is rejected only for its minimum order value | the shortfall |
| `null` | None of the above | - |

- Priority order is top to bottom. Each row also carries a ready `message` in the
  client's wording, for example "Add ₦3,200 more for free pickup and delivery". The
  screen shows text from the backend, as with `checkoutPrompt`.
- `checkoutPrompt` is unchanged.

**Found during build, fixed in scope:** `offer.service.js` used `OFFER_TRIGGER` in
`getBookingOptions` without importing it (since `620cca4`, 9 Oct). Every customer holding a
personal offer, the Welcome Offer included, got "Failed to load booking offers", which is why
the frontend saw `checkoutPrompt` empty. The import is added and briefCheck asserts it.

**Found by the independent review (F-09 to F-15), fixed in scope before `/complete`:**

- The fees line counts only offers that are actually on the bill: baselines that pass,
  plus the personal offer and promotion the customer **selected** (read from
  `selected`, the same quote the order charges). Nothing is auto-applied on a normal
  booking, so an unselected offer gives no line; `checkoutPrompt` covers that case.
- booking-options prices the timing the order will use: a same-day pickup with no
  morning window is Anytime (one helper, `BookingWindowService.resolvePickupTiming`).
- The first-order rule for referral codes lives in `captureReferral`, so the bot
  refuses too, with the same message.
- The free-gap message names only the legs that offer would actually free.
- Swagger documents `displayNames` as arrays of `DisplayNameEntry`.

Swagger: a `BookingContext` schema for the new route, the dashboard fields,
`feesLine` on booking-options, and the new apply-code refusal.

## Build steps

1. [x] **Window-only free rule.** Draft timings in `validateAndPrice`, resolved timings
   from `_priceWithOffers`.
   **Done when:**
   - an Anytime pickup with a free-trip offer is charged the pickup fee
   - a window pickup is still waived
   - a request with no timing is unchanged
2. [x] **Booking context, dashboard and referral.** New route, dashboard fields, and
   the `applyCode` guard.
   **Done when:** each field is right for these customers:
   - a new customer
   - a customer with a plan whose week rolled over without a booking
   - a customer after their first order (the code box is closed and `applyCode` refuses)
3. [x] **Fees line.** `feesLine` on booking-options.
   **Done when:** each of the five types appears for a draft built to trigger it.
4. [x] **Swagger.**
   **Done when:** the envelope check reports 0 wrong envelopes.

## Verify

- briefCheck: offline assertions on the fees-line choice and on window-only
  suppression in `validateAndPrice`.
- A new staging scenario against the testing DB covering steps 1 to 3 end to end.
- Boot on `PORT=7999` against the testing DB.
- **Independent review is required, because this changes pricing.**

## Frontend impact (to send them)

- New `GET /api/bookOrder/booking-context`, with its fields as above.
- Dashboard `subscription.freePickupDeliveriesLeftThisWeek` / `freePickupDeliveriesPerWeek`.
- `booking-options` now accepts `pickupTiming` / `deliveryTiming` in the draft and
  returns `feesLine`.
- **A behaviour change they should know about:** Anytime legs no longer get free
  pickup or delivery from an offer.
- `displayNames` groups are arrays of `{ value, label, renamed }`: show `label`, send `value`.
- `feesLine` reflects only the offers in the draft: send `customerOfferId` /
  `promoOfferId` once the customer picks one, or the Welcome line will not show.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":8464,"specSha256":"73dc89d3866636b2830d206fed2162d8a2fe62d3e607d4c2369641b5eeac3513","branch":"refs/heads/fix/booking-screen-data-and-window-only-free-rule","head":"7e86ca1f8e2a2b51dcd65d78a247920a0797f380","baseRef":"refs/heads/main","baseCommit":"ddbb3ba3876340b08ab571bdf8e8b8e8b4c633b0","sourceTree":"587b072261b26394cdc28175650a7079dc74cad5","landing":"pull-request","absentOptional":[]} -->

## Findings

### booking-screen-data-and-window-only-free-rule/F-09 [P2] closed - The fees line counts the auto-apply pick as applied, not the offer the customer selected

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
**Resolution:** Fixed 2026-10-11. `buildFeesLine` now takes `selected` (the validateAndPrice quote the order charges) and counts only the baselines that passed plus the personal offer and promotion the customer selected and that survived validation. briefCheck (unselected and rejected-promo cases) and bookingContextStaging scenario 4. Closed 2026-10-11 by /audit independent: `onBill` keys off `selected.baseline`, `selected.personal.customerOfferId` and `selected.promotion.offerId`, so an unselected or rejected offer gives no line.

### booking-screen-data-and-window-only-free-rule/F-10 [P2] closed - booking-options prices the raw timing, order creation the resolved one

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
**Resolution:** Fixed 2026-10-11. New `BookingWindowService.resolvePickupTiming` holds the same-day rule; `postBookOrder` and `getBookingOptions` both call it (the latter only when timings are sent, as the order does). briefCheck and bookingContextStaging scenario 5. Closed 2026-10-11 by /audit independent: same helper, same `getActiveWindows` source and same timings-sent condition on both paths.

### booking-screen-data-and-window-only-free-rule/F-11 [P2] closed - The bot can still apply a referral code after the first order

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
**Resolution:** Fixed 2026-10-11. `ReferralService.hasPlacedOrder` is checked inside `captureReferral` (every entry point; the registration callers run before any order exists), and `applyCode` and the bot use it first for the client's message. bookingContextStaging scenario 6. Closed 2026-10-11 by /audit independent: all three registration callers (auth.service.js:100, 364, 536) go through the fire-and-forget `referralOnReferralCode` on a just-created user id, so registration is unaffected.

### booking-screen-data-and-window-only-free-rule/F-12 [P2] closed - BookingContext documents displayNames as maps; the service returns arrays

**File:** swagger/schemas.js:1368
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** `displayNames` comes from `labelMap` (util/displayName.js:112), which
returns `{ deliverySpeeds: [{ value, label, renamed }], serviceTypes: [...], serviceTiers: [...] }`.
The schema (and the spec) show `{ standard: "Regular", ... }` objects. The frontend reads
these docs for the exact shape, so a screen built from them looks up `deliverySpeeds.standard`
and gets undefined. AGENTS.md requires examples to match reality.
**Suggested fix:** Document each group as `type: array` of `{ value, label, renamed }`,
matching the admin display-names route.
**Resolution:** Fixed 2026-10-11. Each `displayNames` group is documented as an array of the existing `DisplayNameEntry` schema. Swagger build confirms `type: array`. Closed 2026-10-11 by /audit independent: the built spec matches `labelMap`'s `{ value, label, renamed }` arrays.

### booking-screen-data-and-window-only-free-rule/F-13 [P3] closed - The free-gap message always says "pickup and delivery"

**File:** services/offer.service.js:696
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** The free-gap row is chosen for any offer that waives either leg, but
the message is fixed to "free pickup and delivery". An offer that waives only delivery
promises a free pickup the customer will not get. It also fires when the pickup is
Anytime, where reaching the minimum would not free that leg.
**Suggested fix:** Use `legs()` from the gap offer's benefits, as the other rows do.
**Resolution:** Fixed 2026-10-11. The free-gap message names the legs from the gap offer's own trip benefits, minus any leg booked Anytime; an offer with no such leg left gives no gap line. briefCheck. Closed 2026-10-11 by /audit independent: `gapLegs` holds.

### booking-screen-data-and-window-only-free-rule/F-14 [P3] closed - welcomeOffer.active stays true while the Welcome Offer is attached to a placed order

**File:** services/bookOrder.service.js:2375
**Found:** 2026-10-11 by /audit independent (scope: current; lens: quality)
**Why it matters:** The query includes `ATTACHED` linkages, which are committed to an
order and rejected by booking-options ("Offer already applied to an order"). After the
first order is placed and before it is redeemed, booking-context reports the Welcome Offer
active while `canEnterReferralCode` is false and no booking can use it. The offer's own
status (paused) is not checked either.
**Suggested fix:** Count only `ASSIGNED`/`VIEWED` linkages whose offer is active.
**Resolution:** Fixed 2026-10-11. booking-context counts only ASSIGNED/VIEWED linkages whose offer is ACTIVE. bookingContextStaging scenarios 5 (paused) and 6 (attached). Closed 2026-10-11 by /audit independent: the query and the `OFFER_STATUS.ACTIVE` filter hold.

### booking-screen-data-and-window-only-free-rule/F-15 [P3] closed - The read-only reset, the timing pass-through and the applyCode guard have no offline check

**File:** briefCheck.js:2052
**Found:** 2026-10-11 by /audit independent (scope: current; lens: tests)
**Why it matters:** The new briefCheck block drives `computeBenefits` and `buildFeesLine`
well, but `freeLegsThisWeek` (rollover and no-write), `_priceWithOffers` receiving resolved
timings, and the `applyCode` refusal are covered only by bookingContextStaging.js, which
needs a testing database. A regression there passes every offline gate.
**Suggested fix:** Add pure briefCheck assertions for `freeLegsThisWeek` (input object
unchanged, rolled-over week returns the full grant). Nothing current is lost.
**Resolution:** Fixed 2026-10-11. briefCheck now drives `freeLegsThisWeek` (rolled-over week gives the full grant, input object unchanged) and `resolvePickupTiming`, and asserts both callers use the helper. The `applyCode` refusal stays covered by bookingContextStaging only (it needs a database). Closed 2026-10-11 by /audit independent: the new assertions drive the real functions, and briefCheck reports 404 passed, 0 failed.

## Independent review

**Status:** passed
**Target commit:** 7e86ca1f8e2a2b51dcd65d78a247920a0797f380
**Base commit:** 450a4c754c6a73e84a5c138ebd1f704bf1dfaabc
**Base ref:** origin/main
**Spec hash:** 73dc89d3866636b2830d206fed2162d8a2fe62d3e607d4c2369641b5eeac3513
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-11T15:00:38Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-11T15:07:42Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `450a4c7..7e86ca1` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

The branch is stacked: commits up to `912d520` belong to three earlier fixes that
already passed their own independent reviews (archives under
`blueprint/history/fixes/`). This work item's own change is `912d520..7e86ca1`:
`aa4ed92` (the fix) and `7e86ca1` (repairs for F-09 to F-15 from the first review
round, now marked `fixed` in findings.md; verify each and move it to `closed` or
reopen it).

### Commands

- `git rev-parse HEAD` / `git merge-base origin/main HEAD` / `git status --porcelain` / `sha256sum blueprint/context/current-feature.md`: pass (HEAD 7e86ca1, merge base 450a4c7, only review.md dirty, spec hash matches)
- `node briefCheck.js`: pass (404 passed, 0 failed)
- Swagger envelope check from AGENTS.md: pass (0 wrong envelopes; BookingContext.displayNames groups are `type: array` of DisplayNameEntry; `/bookOrder/booking-context` present)
- `node bookingContextStaging.js`: unavailable (needs the testing DB, which the reviewer may not touch)
- Boot on `PORT=7999`: unavailable (the reviewer may not start the server)

### Evidence

- Pricing parity: `_priceWithOffers` passes `scheduling.pickup/delivery.timing` (bookOrder.service.js:784-793). `postBookOrder` resolves the pickup through `BookingWindowService.resolvePickupTiming` (1467). `getBookingOptions` (offer.service.js:457-470) applies the same helper with the same `getActiveWindows` source, only when timings are sent, as the order does. With no `deliveryTiming`, the order defaults to WINDOW and `computeBenefits` treats undefined as not Anytime, so both still waive.
- Fees line: `buildFeesLine` counts only the `selected` baselines, personal offer and promotion (offer.service.js:652-665), so it matches what `validateAndPrice` charges.
- Referral: `captureReferral` checks `hasPlacedOrder` first (referral.service.js:93). `applyCode` and details.flow.js:21 return `REFERRAL_AFTER_FIRST_ORDER`. The registration callers (auth.service.js:100, 364, 536) are fire-and-forget through util/referralHooks.js on a just-created user id.
- booking-context: `auth` only, scoped to `req.user.id`, and `freeLegsThisWeek` resets a copy, so the route writes nothing. `welcomeOffer` filters ASSIGNED/VIEWED linkages with offer status ACTIVE. The route has no param-route shadowing.
- Item-edit re-pricing (`_repriceForItems`) passes `order.scheduling`, so it follows the same window-only rule.

### Findings

- F-09, F-10, F-11, F-12, F-13, F-14, F-15: closed (repairs verified)
- F-16 [P3] open: the window-only fees line says "Choose a time window" when the same-day rule forced Anytime, and can show ₦0 for a leg that is not booked
- F-06, F-07, F-08 [P3] open: from earlier fixes, not in this delta

### Remaining risk

- `bookingContextStaging.js` (the builder reports 30/0 on the testing DB) was unavailable to the reviewer. DB-backed behaviour (the applyCode refusal, live booking-context reads, end-to-end order charges) is verified by code reading only.
- Server boot on `PORT=7999` was unavailable to the reviewer (the builder reports a clean boot).
- An order placed before deploy with an Anytime leg and a free-trip offer is now charged that leg's fee if its items are edited before tagging (`_repriceForItems` re-applies the new rule). This matches the client ruling, but such a customer would get a payment hold for a fee that was waived at booking.
- `POST /offers/validate` (`offerApi.validateOffer`) prices the raw draft without the same-day resolution. This only matters if a screen uses it to preview a same-day window booking.
