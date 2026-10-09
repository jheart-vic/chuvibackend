# Frontend changelog — 9 Oct 2026 · Window booking (N1 Phases 1–2)

Backend only. Everything below is built and **verified against a real database**:
the offline gate `node briefCheck.js` is **275/275**, and all **20 DB harnesses
pass** against `testingdb`, including a new `windowBookingStaging.js` (35/35)
covering the endpoints in §2 and §3. Swagger is up to date at `/api-docs`
(**69 schemas / 301 paths**).

**Nothing here breaks an existing app build.** Window booking is opt-in: send no
timing fields and booking behaves exactly as it does today, at the flat
pickup/delivery fee. Read §1 anyway — there is one rendering rule that matters.

---

## 1. The one thing you must change

### ⚠️ Render `order.deliveryPromise.text`. Do NOT format `deliveryDate` as a time.

Every order the API returns now carries a new field:

```json
"deliveryPromise": {
  "text": "Delivery on Tue Oct 13 2026, between 15:00 and 18:30.",
  "date": "2026-10-13T00:00:00+01:00",
  "dateText": "Tue Oct 13 2026",
  "confirmed": true,
  "timing": "window",
  "windowName": "Evening",
  "windowStart": "15:00",
  "windowEnd": "18:30"
}
```

`deliveryDate` is the order's **internal deadline**, and the 19:00 on it is an
end-of-day sentinel — it drives the "overdue" and "due today" dashboard buckets
and the hold-breach checks. It was never a customer promise. If a screen renders
it as a time it says **"7:00 PM"**, which now contradicts a delivery window that
ends at **18:30**.

So: show `deliveryPromise.text`. It is assembled on the backend for the same
reason the checkout offer prompt is — the words and the rule must not drift
apart, and the app, the in-app bot and SMS must not quote different times for
one order.

- `confirmed: false` → the text already reads *"Estimated delivery…"*. Present it
  as an estimate; a standard order's delivery day is not known at booking, so the
  window is confirmed when the order is marked READY.
- `deliveryPromise` is `null` when an order has no delivery date. Guard it.
- On an order booked with no window it degrades honestly to
  *"Estimated delivery on Tue Oct 13 2026."* — day only, never an invented time.

### Delivery dates move on weekends

The promised date now **skips non-working days** (Monday is closed). A standard
order booked on Saturday used to be promised Monday; it is now Tuesday. Nothing
to build — just expect the dates and tell support, because the previous Monday
promise was a day nobody was working, and those orders were being flagged
**overdue** through no fault of the business.

---

## 2. New: pick a pickup/delivery time

### `GET /api/bookOrder/booking-availability` (customer auth)

Query: `leg=pickup|delivery` (required) · `days=7` (1–31) ·
`deliverySpeed=standard|express|same-day`

Returns `data.message` as `BookingAvailability`:

```json
{
  "leg": "pickup",
  "workingDays": ["tue","wed","thu","fri","sat","sun"],
  "windowFee": 500,
  "slots": [
    { "date": "2026-10-09", "windowId": "671f…", "name": "Evening",
      "startTime": "15:00", "endTime": "18:30",
      "cutoffAt": "2026-10-09T14:00:00+01:00",
      "timing": "window", "fee": 500,
      "available": true, "remaining": 4, "unavailableReason": null }
  ],
  "anytime": {
    "timing": "anytime", "fee": 1000, "open": true,
    "opensFrom": "08:00", "opensTo": "17:00",
    "servesFrom": "2026-10-09T11:20:00+01:00",
    "note": "We will dispatch as soon as we can."
  }
}
```

Notes for the screen:

- **`unavailableReason` is why a slot is dead**, and the four values want
  different copy: `not-working-day` (we are closed), `does-not-run-that-day`
  (this window does not run then), `cutoff-passed` (too late to book it today),
  `full` (no places left).
- **`remaining` is `Infinity` for a window with no limit**, which serialises to
  `null` in JSON. Treat null as unlimited, not as zero.
- **Anytime is returned even when closed** (`open: false`), with `servesFrom`
  giving the honest next service time. Show it with the "first thing on the next
  working day" message rather than hiding it, or the screen looks broken outside
  08:00–17:00.
- Pass `deliverySpeed=same-day` to also receive a **`sameDay`** block. Its
  `disclosure` string **must be shown before the customer confirms** — a same-day
  pickup is an Anytime trip at the Anytime price (₦1,000) while the delivery
  returns in the evening window at the window price (₦500). This is an explicit
  client requirement, not a nicety.

### Booking: three optional fields

On `POST /api/bookOrder/create-book-order`:

| Field | Values | Notes |
|---|---|---|
| `pickupTiming` | `window` \| `anytime` | Omit → today's behaviour, flat fee |
| `pickupWindowId` | window id | Required when `pickupTiming=window` |
| `pickupDate` | date | The day the window is for |
| `deliveryTiming` | `window` \| `anytime` | Intent only; the window is confirmed at READY |

Two responses to handle:

- **A refusal with `requiresChoice: true`** — the window filled, its cutoff
  passed, or the day is closed. The `error` string is written for the customer
  (*"Bookings for Evening on that day have closed."*). Re-open the picker; **no
  order was created**, so a retry is safe.
- **A success where we moved them.** If the chosen window was full we book the
  next free one instead of refusing. The order's
  `scheduling.pickup.forcedMove: true` and `forcedMoveFrom: "Evening on
  2026-10-09"`. They pay the **window** price and **keep their offer**. Show
  this — it is a change to what they picked.

Same-day pickups are **forced** to Anytime pricing server-side, so sending
`pickupTiming: "window"` on a same-day order will still be priced and recorded
as Anytime (until a morning window exists). Quote from the `sameDay` block, not
from your own arithmetic.

### Fees

There is **no new window-fee setting**: the existing pickup/delivery fees
(₦500 each) *are* the window price. Only Anytime is new (₦1,000 each). At today's
settings a window booking costs exactly what every booking costs now — nobody
pays more unless they choose Anytime. The per-leg price is on each slot and on
`anytime.fee`; don't hardcode either.

---

## 3. New: admin screens

All `adminAuth`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/booking-windows` | Windows (incl. switched-off) + working days |
| POST | `/api/admin/booking-windows` | Create |
| PUT | `/api/admin/booking-windows/:id` | Update (partial) |
| DELETE | `/api/admin/booking-windows/:id` | Remove, or switch off if in use |
| PUT | `/api/admin/working-days` | The tick box per day |
| GET | `/api/admin/window-deflections` | Windows that filled, customers moved |

Behaviour worth designing for:

- **A window's `limit` is nullable and blank means NO limit.** Send `null` or
  `""`, not `0` — `0` means a window that can never be booked. The form needs a
  genuinely empty state, not a zero default.
- **DELETE may not delete.** A window referenced by any order is switched off
  instead, so those orders keep resolving the times their customers were
  promised. The response says which happened: `deleted`, `deactivated`,
  `ordersReferencing`, and a `note` written for the operator.
- **`working-days` accepts either** a list (`["tue","wed"]`) or an object of
  day → boolean, whichever suits the control. An **empty** week is refused with
  a reason rather than silently ignored.
- **Window times are `"HH:mm"` strings** and are validated strictly — `"3pm"` is
  refused. `endTime` must be after `startTime`, and that is checked against the
  **saved** start when you patch only the end.
- The deflection report separates **`shown`** (every time a full window was put
  in front of someone — one customer refreshing three times is three) from
  **`customersMoved`** (distinct signed-in customers). They are different
  numbers; label them differently.

---

## 3b. New: the payment hold (N1 Phase 3)

**The rule that affects every screen showing an order:** tags cannot be produced
until an order is paid — and this applies to an ordinary unpaid booking, not
just Quick Booking.

All three tag endpoints (`generate-all-tags`, `confirm-tag`, `complete-tagging`)
now refuse an unpaid order with:

```json
{ "success": false, "data": { "error": "Tags cannot be printed until this order is paid. ₦8,500 is outstanding. …",
  "requiresPayment": true, "outstandingAmount": 8500 } }
```

Branch on `requiresPayment` and send the operator to the payment hold rather
than showing a generic failure.

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/api/intake-user/order/:id/payment-hold` | Intake | Raise the hold; sends SMS + Paystack link |
| POST | `/api/intake-user/order/:id/approve-transfer` | Intake/admin | Mark a bank transfer received |
| POST | `/api/admin/order/:id/payment-hold/waive` | **Admin only** | Process unpaid; stopped at dispatch |
| GET | `/api/admin/bank-check-list` | Admin | Daily reconciliation of approved transfers |

Design notes:

- **Raising a hold takes no amount.** There is no field for one — the bill comes
  from the order, because staff can never type an amount. Don't build an input.
- **`paymentUrl` can be null** (a walk-in with no account, or Paystack
  unreachable). The hold still stands; fall back to "pay in the app".
- **Raising twice is a SUCCESS**, returning `alreadyOnHold: true` with the
  existing hold. It does not re-send the link or restart the 48h clock, so a
  double tap is safe.
- **`approve-transfer` requires `reference`** — the sender's name or the transfer
  reference. Without it the daily bank check has nothing to match, so it is
  refused. Make the field mandatory in the form.
- **The waiver requires `reason`** and is admin-only. Afterwards the order
  processes normally but **cannot be dispatched**: the dispatch-tag endpoints
  will refuse it with `paymentWaived: true`. Surface that to whoever is packing,
  or it looks like a broken tag.
- An ordinary **unpaid** order (never waived) still dispatches as it always has,
  with its existing "settle it in the app, do not collect cash" notice. Only a
  waived order is stopped.

### Cancellation now has computed fees

`feeAmount` is no longer needed when cancelling — the backend computes it:

- **Before pickup:** free; anything paid returns to the wallet in full.
- **Collected, not yet paid:** ₦1,000 + ₦1,000 due before the clothes go back —
  **charged even if the order had free pickup**, because the trip was made. The
  response's `explanation` says this in words you can show the customer.
- **Collected and paid:** the laundry fee returns to the wallet, both trips kept.
- **Once tagging has begun:** cancellation is refused outright, including via a
  cancellation request. This is stricter than before — a tag can exist while the
  order still sits in the tagging queue, and that order is no longer cancellable.

Sending an explicit `feeAmount` still overrides the computed value.

### The rider's count and the Intake confirmation

Both are **optional** fields, so existing calls are unchanged.

- `POST /rider/mark-pickup/:id` accepts `itemCount` and `countReason`. A count
  that differs from the customer's **requires a reason** — the refusal carries
  `requiresCountReason: true` plus both counts. It then flags the order and
  SMSes the customer, but **never blocks the pickup**.
- `POST /intake-user/proceed-to-tag/:id` accepts `itemCount`. If it differs from
  the rider's, the order **stops** on a hold and the response carries
  `countMismatch: true`, `requiresAdminApproval: true` and both counts. Only an
  admin can clear it.

## 3c. New: editing an order's items (client item #7)

### `PATCH /api/bookOrder/order/:id/items` (Intake or admin)

Intake enters what was actually in the bag; the backend recalculates the bill
through the same pricing and offer path a booking uses, then settles the
difference automatically.

```json
{ "items": [{ "type": "shirt", "price": 700, "quantity": 4 }],
  "reason": "Two extra shirts were in the bag" }
```

Response (`data.message`): `previousTotal`, `newTotal`, `difference`,
`pieceCount`, plus **exactly one** of:

- `paymentHold` — the total went up and money is outstanding. Same shape as
  raising a hold directly, including `paymentUrl`.
- `walletRefund` — the total went down; the number is what went back to the
  wallet. If the automatic refund failed it is an **object** with `error` and
  `amount` instead — the customer is still owed it, so surface that rather than
  treating it as success.

Rules worth building around:

- **`reason` is required.** The customer is told the bill changed and why.
- **After tagging has begun, only an admin may edit** — Intake gets
  `requiresAdmin: true`. This is detected from the items, so an order sitting in
  the tagging queue with labels already generated is already locked to admins.
- **You cannot change the service type, care tier, delivery speed or time window
  here.** They come from the order, so an item edit can't re-price the
  logistics. Use the existing endpoints for those.
- **A waived order is not treated as paid.** Reducing its bill refunds nothing,
  because no money was received.
- Applies to **both** booking types.

## 3d. New: renaming speeds, service types and care tiers

`GET /api/admin/display-names` · `PUT /api/admin/display-names`

**Display name only — and this matters for how you build the form.** The stored
values are enums on every order and the key the pricing path matches on, so they
never change. You rename the *label*:

```json
{ "deliverySpeeds": { "same-day": "Express Same Day" },
  "serviceTiers": { "vip": "Platinum" } }
```

- **Always send the `value` back in other requests, never the label.** Every
  entry returns `{ value, label, renamed }` precisely so you never have to
  reverse a label into an identifier.
- An unknown key is refused, with the valid keys listed in the error.
- An **empty label** drops the override and restores the derived name.
- `renamed: false` means the label is derived, so a settings screen can show
  which are custom.

Also fixed: a lower-case acronym now renders as one — the `vip` tier previously
read **"Vip"** on every station card.

## 3e. Delivery windows are confirmed at READY (D7)

`scheduling.delivery.confirmedAt` is now set when the order is packed and marked
ready, and the window/day are pinned then. Before that point `deliveryPromise`
reads *"Estimated delivery…"* with `confirmed: false`; afterwards it names the
window.

If no window has room, the leg is deliberately left **unconfirmed** rather than
given a made-up date — so keep handling `confirmed: false` indefinitely, not as
a transient state.

The **Anytime refund now pays out** automatically when a leg qualifies (booked
Anytime while the window was still bookable, then served inside that window).
It appears in the wallet and in the customer's transaction history, and
`scheduling.<leg>.refund` carries `qualified`, `amount`, `paidAt` and a `reason`
— including when it was *refused*, so you can explain why no refund came.

## 4. Not built yet — don't design against it

The backend side of N1 is now **code-complete** — booking, windows, the payment
hold, item editing, the D7 confirmation, the Anytime refund and the display
names are all built and covered. Two notes rather than gaps:

- **Quick Booking has no separate endpoint.** It is the normal booking endpoint
  with the timing fields in §2 — the client chose to build it once with real
  windows rather than as a parallel flow, so there is nothing extra to call.
- **Nothing here is deployed yet.** See §6.

---

## 5. Schemas to read in `/api-docs`

`BookingAvailability` · `BookingSlot` · `BookingWindow` · `WindowDeflection` ·
`DeliveryPromise` · `OrderScheduling` · `OrderSchedulingLeg`

Every response follows the house envelope — the payload is at **`data.message`**:

```json
{ "success": true, "data": { "message": { } } }
```

⚠️ `swagger/swagger.js` pins `servers` to the deployed Render URL, so **"Try it
out" from a local `/api-docs` still hits production.**

---

## 6. Deploy state

As of writing, this work and the previous batch sit on **`feature/fix`**, which is
pushed but **not merged to `main`** (`origin/main` is at `e0d5c3a`). If your
environment tracks `main`, none of the above is live yet — check with the backend
before testing against a deployed URL.
