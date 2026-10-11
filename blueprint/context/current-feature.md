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
  "displayNames": { "deliverySpeeds": {}, "serviceTypes": {}, "serviceTiers": {} },
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
- `welcomeOffer.active` means a live First Experience linkage that has not expired.
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
