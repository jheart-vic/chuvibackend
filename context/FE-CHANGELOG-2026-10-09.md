# Frontend changelog — 9 Oct 2026

Backend work since the 8 Oct changelog: **window booking, the payment hold,
order editing, and admin renaming.** Everything here is built and verified —
`node briefCheck.js` is **341/341** offline and all **21 database harnesses**
pass against `testingdb`. Swagger: **74 schemas / 307 paths / 0 envelope
errors**.

**Nothing in this document is deployed yet.** See §8 before you test against a
URL.

---

## 0. Three things to know before you read the rest

### Every endpoint is under `/api` — the older swagger blocks lie about this

`server.js` does `app.use("/api", router)`, so the real paths are
`/api/intake-user/...`, `/api/rider/...`, `/api/bookOrder/...`.

Swagger is inconsistent about it, and this is pre-existing rather than new.
Counted from the built spec: **12 paths are documented with `/api`, and 295
without it.**

So the practical rule is: **if a swagger path does not start with `/api`, add
it.** The 12 that already have it are the new endpoints in this document.

| What swagger shows | The real path |
|---|---|
| `/intake-user/proceed-to-tag/{id}` | `/api/intake-user/proceed-to-tag/{id}` |
| `/rider/mark-pickup/{id}` | `/api/rider/mark-pickup/{id}` |
| `/bookOrder/create-book-order` | `/api/bookOrder/create-book-order` |
| `/admin/update-admin-setting` | `/api/admin/update-admin-setting` |
| `/api/admin/booking-windows` | correct as shown |

We have not rewritten the 295 — it is a mechanical change across every route
file and we would rather do it deliberately than fold it into this batch. Say if
you want it done; until then the rule above holds.

### The response envelope has two levels

The payload is at **`data.message`** — `success` and `message` are never
siblings:

```json
{ "success": true, "data": { "message": { } } }
```

Failures are `{ "success": false, "data": { "error": "..." } }` — the
`ErrorResponse` schema. Some failures carry **extra sibling keys** beside
`error` that you should branch on; they are called out below each time.

### "Try it out" in `/api-docs` hits production

`swagger/swagger.js` pins `servers` to the deployed Render URL, so pressing Try
it out from a local `/api-docs` sends the request to **production**. Don't use it
to probe destructive endpoints.

---

## 1. Must change — ranked

### 1.1 Render `order.deliveryPromise.text`. Never format `deliveryDate` as a time

**Swagger:** `DeliveryPromise` schema. Present on every order the API returns.

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

`deliveryDate` is the order's **internal deadline** and the 19:00 on it is an
end-of-day sentinel driving the overdue / due-today buckets and hold-breach
checks. It was never a customer promise. Rendered as a time it says **"7:00 PM"**,
which now contradicts a delivery window ending at **18:30**.

- `confirmed: false` → the text already reads *"Estimated delivery…"*. Treat it
  as an estimate, and **handle it indefinitely, not as a transient state** — if
  no window has room the leg is deliberately left unconfirmed rather than given
  a made-up date.
- `deliveryPromise` is `null` when an order has no delivery date. Guard it.
- A legacy order with no window degrades to *"Estimated delivery on Tue Oct 13
  2026."* — day only, never an invented time.

### 1.2 Tag endpoints now refuse an unpaid order

**Swagger:** the three `/api/intake-user` tag paths below.

| Method | Path |
|---|---|
| PATCH | `/api/intake-user/generate-all-tags/{id}` |
| PUT | `/api/intake-user/confirm-tag/{orderId}/item/{itemId}` |
| PATCH | `/api/intake-user/complete-tagging/{id}` |

All three return:

```json
{ "success": false, "data": {
  "error": "Tags cannot be printed until this order is paid. ₦8,500 is outstanding. …",
  "requiresPayment": true,
  "outstandingAmount": 8500 } }
```

Branch on **`requiresPayment`** and route the operator to the payment hold
(§2.2) rather than showing a generic failure. This applies to an ordinary unpaid
booking too, not only Quick Booking.

### 1.3 The settings screen must stop editing service-type names

**Swagger:** `PUT /api/admin/update-admin-setting`, the **400** response.

A service type's name is the key an order uses to find its price, so renaming
one silently under-priced every order already placed under the old name. The
endpoint now refuses it:

```json
{ "success": false, "data": {
  "error": "A service type's name is how existing orders find their price, so it cannot be changed or removed here: \"wash-and-iron\" (42 orders). To change what customers and staff SEE, use Display Names instead…",
  "blockedServiceTypes": [{ "name": "wash-and-iron", "orders": 42 }],
  "useInstead": "/api/admin/display-names" } }
```

**Make the service-type *name* field read-only once saved**, and link to the
Display Names screen (§2.5). Adding a type, editing a price, and removing a type
with no orders all still work.

The block triggers on a name **disappearing**, so delete-and-re-add under a
different name is refused too — same effect on pricing.

### 1.4 Weekend delivery dates move by one day

No code for you. Promised dates now skip non-working days, so a standard order
booked **Saturday** is promised **Tuesday**, not Monday (Monday is closed).
Expect the dates and brief support. Nothing got slower — those Monday orders were
never going to be delivered on a closed day, and were being flagged overdue for
it.

---

## 2. New endpoints

### 2.1 Pickup / delivery availability

**`GET /api/bookOrder/booking-availability`** · customer auth
**Swagger:** `BookingAvailability`, `BookingSlot`

Query: `leg=pickup|delivery` (**required**) · `days=7` (1–31) ·
`deliverySpeed=standard|express|same-day`

- **`unavailableReason`** is why a slot is dead, and the four values want
  different copy: `not-working-day` · `does-not-run-that-day` ·
  `cutoff-passed` · `full`.
- **`remaining` is `null` for a window with no limit.** Treat null as
  *unlimited*, not zero.
- **Anytime is returned even when closed** (`anytime.open: false`) with
  `servesFrom` giving the honest next service time. Show it with the "first
  thing on the next working day" message — hiding it looks broken outside
  08:00–17:00.
- Pass `deliverySpeed=same-day` to also get a **`sameDay`** block. Its
  `disclosure` string **must be shown before the customer confirms**: a same-day
  pickup is an Anytime trip at the Anytime price (₦1,000) while delivery returns
  in the evening window at the window price (₦500). Client requirement, not a
  nicety.
- An unknown `leg` is refused rather than silently priced as a delivery.

### 2.2 The payment hold

| Method | Path | Who | Swagger |
|---|---|---|---|
| POST | `/api/intake-user/order/{id}/payment-hold` | Intake | `PaymentHoldResult` |
| POST | `/api/intake-user/order/{id}/approve-transfer` | Intake/admin | inline |
| POST | `/api/admin/order/{id}/payment-hold/waive` | **admin only** | inline |
| GET | `/api/admin/bank-check-list` | admin | `BankCheckRow` |

- **Raising a hold takes no amount.** There is no field for one — the bill comes
  from the order, because staff can never type an amount. **Don't build an
  input.** Body takes an optional `reason` only.
- **`paymentUrl` can be null** (walk-in with no account, or Paystack
  unreachable). The hold still stands — fall back to "pay in the app".
- **Raising twice is a SUCCESS**, returning `alreadyOnHold: true` with the
  existing hold. It does not re-send the link or restart the 48h clock, so a
  double tap is safe.
- **`approve-transfer` requires `reference`** — the sender's name or transfer
  reference. Without it the daily bank check has nothing to match, so it is
  refused. Make the field mandatory.
- **The waiver requires `reason`** and is admin-only. Afterwards the order
  processes normally but **cannot be dispatched** — the dispatch-tag endpoints
  refuse it with `paymentWaived: true`. Surface that to whoever is packing or it
  looks like a broken tag.
- An ordinary **unpaid** order (never waived) still dispatches as always, with
  its existing "settle it in the app, do not collect cash" notice. Only a
  *waived* order is stopped.
- Reminders go out automatically at **6h / 24h**, with an admin alert at **48h**.
  Nothing for you to trigger.

### 2.3 Editing an order's items

**`PATCH /api/bookOrder/order/{id}/items`** · Intake or admin
**Swagger:** `ItemEditResult`

```json
{ "items": [{ "type": "shirt", "price": 700, "quantity": 4 }],
  "reason": "Two extra shirts were in the bag" }
```

Response carries `previousTotal`, `newTotal`, `difference`, `pieceCount`, plus
**exactly one** of:

- **`paymentHold`** — the total went up and money is outstanding (same shape as
  §2.2, including `paymentUrl`).
- **`walletRefund`** — the total went down; the number is what went back. **If
  the automatic refund failed it is an object** with `error` and `amount`
  instead — the customer is still owed it, so surface that rather than treating
  it as success.

Rules to build around:

- **`reason` is required** — the customer is told the bill changed and why.
- **After tagging, only an admin may edit.** Intake gets `requiresAdmin: true`.
  Detected from the items, so an order still in the tagging queue with labels
  generated is already admin-only.
- **You cannot change service type, care tier, delivery speed or time window
  here.** They come from the order, so an item edit can't re-price logistics.
- **A waived order is not treated as paid** — reducing its bill refunds nothing.
- Applies to **both** booking types.

### 2.4 Admin: windows, working days, deflections

| Method | Path | Swagger |
|---|---|---|
| GET | `/api/admin/booking-windows` | `BookingWindow` |
| POST | `/api/admin/booking-windows` | `BookingWindow` |
| PUT | `/api/admin/booking-windows/{id}` | `BookingWindow` |
| DELETE | `/api/admin/booking-windows/{id}` | inline |
| PUT | `/api/admin/working-days` | inline |
| GET | `/api/admin/window-deflections` | `WindowDeflection` |

- **A window's `limit` is nullable and blank means NO limit.** Send `null` or
  `""`, **not `0`** — zero means a window nobody can book. The form needs a
  genuinely empty state, not a zero default.
- **DELETE may not delete.** A window any order references is switched off
  instead, so those orders keep resolving the times their customers were
  promised. The response says which happened: `deleted`, `deactivated`,
  `ordersReferencing`, and an operator-facing `note`.
- **`working-days` accepts either** a list (`["tue","wed"]`) or an object of
  day → boolean, whichever suits the control. An **empty** week is refused with
  a reason rather than silently ignored.
- **Window times are `"HH:mm"` strings**, validated strictly — `"3pm"` is
  refused. `endTime` must be after `startTime`, checked against the **saved**
  start when you patch only the end.
- The deflection report separates **`shown`** (every time a full window was put
  in front of someone — one customer refreshing three times is three) from
  **`customersMoved`** (distinct signed-in customers). Different numbers; label
  them differently.

### 2.5 Admin: renaming (display name only)

**`GET` / `PUT /api/admin/display-names`**
**Swagger:** `DisplayNameMap`, `DisplayNameEntry`

```json
{ "deliverySpeeds": { "same-day": "Express Same Day" },
  "serviceTiers": { "vip": "Platinum" } }
```

- Each entry returns `{ value, label, renamed }`. **Always send the `value` back
  in other requests, never the label** — that's exactly why `value` travels
  alongside.
- An unknown key is refused, with the valid keys listed in the error.
- An **empty label** drops the override and restores the derived name.
- `renamed: false` means the label is derived, so the screen can show which are
  custom.
- Also fixed: a lower-case acronym now renders as one — the `vip` tier
  previously read **"Vip"** on every station card.

---

## 3. Changed endpoints

### 3.1 Booking — three optional timing fields

**`POST /api/bookOrder/create-book-order`**

| Field | Values | Notes |
|---|---|---|
| `pickupTiming` | `window` \| `anytime` | Omit → today's behaviour, flat fee |
| `pickupWindowId` | window id | Required when `pickupTiming=window` |
| `pickupDate` | date | The day the window is for |
| `deliveryTiming` | `window` \| `anytime` | Intent only; the window is confirmed at READY |

**Not breaking** — send nothing and booking behaves exactly as today.

Two responses to handle:

- **A refusal with `requiresChoice: true`** — the window filled, its cutoff
  passed, or the day is closed. The `error` is written for the customer
  (*"Bookings for Evening on that day have closed."*). Re-open the picker;
  **no order was created**, so a retry is safe.
- **A success where we moved them.** If the chosen window was full we book the
  next free one. `scheduling.pickup.forcedMove: true` and
  `forcedMoveFrom: "Evening on 2026-10-09"`. They pay the **window** price and
  **keep their offer** — show this, it's a change to what they picked.

Same-day pickups are **forced** to Anytime pricing server-side, so sending
`pickupTiming: "window"` on a same-day order is still recorded as Anytime (until
a morning window exists). Quote from the `sameDay` block, not your own
arithmetic.

**Fees:** there is **no new window-fee setting** — the existing pickup/delivery
fees (₦500 each) *are* the window price. Only Anytime is new (₦1,000 each). At
today's settings a window booking costs exactly what every booking costs now.
Read the per-leg price off each slot and `anytime.fee`; don't hardcode either.

### 3.2 Rider pickup — optional true count

**`PUT /api/rider/mark-pickup/{id}`** — new optional `itemCount`, `countReason`.

A count differing from the customer's **requires a reason**; the refusal carries
`requiresCountReason: true` plus both counts. It then flags the order and SMSes
the customer, but **never blocks the pickup**.

### 3.3 Intake confirm — optional count check

**`POST /api/intake-user/proceed-to-tag/{id}`** — new optional `itemCount`.

If it differs from the rider's, the order **stops** on a hold and the response
carries `countMismatch: true`, `requiresAdminApproval: true` and both counts.
Only an admin can clear it.

### 3.4 Cancellation — fees are now computed

`feeAmount` is no longer needed; the backend computes it:

- **Before pickup:** free; anything paid returns in full.
- **Collected, unpaid:** ₦1,000 + ₦1,000 due before the clothes go back —
  **charged even with free pickup**, because the trip was made. The response's
  `explanation` says so in words you can show the customer.
- **Collected and paid:** laundry fee returns, both trips kept.
- **Once tagging has begun:** refused outright, including via a cancellation
  request. **Stricter than before** — an order with labels generated while still
  in the tagging queue is no longer cancellable.

Sending an explicit `feeAmount` still overrides the computed value.

### 3.5 Dispatch tag — a waived order is refused

`GET`/`POST /api/intake-user/order/{id}/dispatch-tag[/print]` and rider
assignment now refuse a **waived** order with `paymentWaived: true`. Unpaid
orders that were never waived behave exactly as before.

---

## 4. New schemas in `/api-docs`

| Schema | Use |
|---|---|
| `BookingAvailability` | the availability payload (§2.1) |
| `BookingSlot` | one offered window on one day |
| `BookingWindow` | an admin-managed window |
| `WindowDeflection` | one row of the "windows that filled" report |
| `DeliveryPromise` | **the delivery line to render** (§1.1) |
| `OrderScheduling` | both legs' timing, on the order |
| `OrderSchedulingLeg` | one leg's timing |
| `PaymentHoldResult` | raising a payment hold |
| `BankCheckRow` | one approved transfer awaiting reconciliation |
| `ItemEditResult` | the outcome of an item edit (§2.3) |
| `DisplayNameMap` / `DisplayNameEntry` | labels (§2.5) |

---

## 5. New fields on the order object

All **absent** on orders placed before this shipped — don't assume they exist.

| Field | Meaning |
|---|---|
| `deliveryPromise` | §1.1. Derived on every read, so always present or `null` |
| `scheduling.pickup` / `.delivery` | timing, window, date, fee, `forcedMove`, `servedAt`, `refund` |
| `scheduling.disclosure` | the same-day disclosure, stored as shown |
| `counts` | `customer`, `rider`, `riderReason`, `intake`, `changedAtPickup` |
| `paymentHold` | `raisedAt`, `amount`, `paymentUrl`, `remindersSent`, `clearedAt`, `clearedBy` |
| `bankTransferApproval` | `approvedAt`, `approvedByRole`, `reference`, `amount` |
| `itemEdits[]` | every item change: who, why, previous/new total, piece counts |
| `paymentWaivedAt` / `By` / `paymentWaiverReason` | the admin waiver |

`scheduling.<leg>.refund` carries `qualified`, `amount`, `paidAt` and a `reason`
— **including when a refund was refused**, so you can explain why none came.

---

## 6. Fixed, no action needed

- **Daily revenue was grouped by UTC days, not Lagos days.** Money taken between
  midnight and 1am Lagos was counted under the **previous** day, so "today's
  revenue" read low for the first hour. Totals were never wrong, only which day
  they landed on.
- `vip` rendering as "Vip" (§2.5).

---

## 7. Not built — don't design against it

- **Quick Booking has no separate endpoint.** It is the normal booking endpoint
  with the §3.1 timing fields — the client chose to build it once with real
  windows rather than as a parallel flow.
- `swagger/swagger.js` still points `servers` at production (§0).
- 295 of 307 swagger paths still omit `/api` (§0). Not rewritten in this batch;
  treat the prefix as always required.

**Every endpoint path, method, schema and field name in this document was
checked against the built spec before publishing** — not written from memory.

---

## 8. Deploy state — read this before testing

As of writing, all of this sits on **`feature/fix`**, which is pushed but **not
merged to `main`** (`origin/main` is at `e0d5c3a`, nine commits behind).

**If your environment tracks `main`, none of this is live** — including the
endpoints above, which will 404. Check with the backend before testing against a
deployed URL.
