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

---

# Addendum — 9 October, later: the five reported bugs

Added after the frontend's bug report of the same day. All five were real; each
is fixed and asserted in `briefCheck.js` so it cannot come back silently
(**359/359**, swagger **74 schemas / 308 paths / 0 wrong envelopes**).

## A1. Item holds can now be cleared — one NEW endpoint, one changed contract

**NEW `PATCH /api/admin/order/{id}/release-item-hold`** (admin only).

```jsonc
// body — both fields optional
{ "itemId": "66f1a2b3c4d5e6f708192a3b",   // omit to release every held piece
  "note": "Missing shirt found in the sorting bin" }
```

```jsonc
// 200
{ "success": true,
  "data": { "message": {
      "orderId": "…", "oscNumber": "OSC-20261009-442410",
      "released": 1, "releasedItemIds": ["66f1…"],
      "itemsStillOnHold": 2 } } }
```

This is **the only way to clear a hold assigned to Admin**, and every station
offers Admin as the first assignee when raising one — so those holds previously
had no door at all. It does not move the piece and does not rewind any station's
progress: a hold never changed `currentStation`, so the piece resumes where it
already sits.

You already have everything needed to call it per piece: the Holds Management
rows carry `holdMeta.heldPieces[]` with `itemId`, `tagId`, `type`, `reason`,
`heldByStation` and `assignTo`, plus `heldPieceCount` and
`holdScope: 'order' | 'items'`.

**CHANGED — every station release takes an optional `itemId`:**
`PATCH /api/{sort-pretreat|wash-dry|press-iron|qc|intake-user}/…/release-from-hold`

- **Omit `itemId`** → exactly today's behaviour. Nothing you have built breaks.
- **Send `itemId`** → that one piece is released and the order is left alone.

**Also fixed, and it affected you:** Intake's release used to wipe `tagId` /
`tagStatus` on every piece and push the whole order back to the tagging queue —
even when the hold had been raised at Wash, Press, Sort or QC and merely
*assigned* to Intake (which is the normal case, since a station may not hold for
itself). It now does that only for holds Intake itself raised.

**Use `/admin/order/{id}/resolve-hold` for ORDER-level holds** (Intake and
payment holds, `holdScope: 'order'`) — that one also routes the order onward.
The two are not interchangeable.

## A2. Press queue — the list now matches its counter

No shape change. `GET /api/press-iron/dashboard` and `GET /api/press-iron/queue`
were asking three different questions; all three now use one predicate
(`items.currentStation` at press **and** `pressDetails.startedAt` unset), the
same way Wash was fixed for brief 1.1.

A started order now appears in **Active Press only**, not in both lists at once,
and the Press Queue count always equals the length of the Press Queue list.

## A3. Rider screens now get the delivery promise

**`deliveryPromise` is now on every rider read** — assigned deliveries, active
deliveries, assigned pickups, active pickups and the rider order detail:

```jsonc
"deliveryPromise": { "text": "Tomorrow between 15:00 and 18:30",
                     "confirmed": true, … }
```

Same object the customer app already renders. `deliveryDate` is now returned
too, but **render `deliveryPromise.text` and never format `deliveryDate` as a
time** — its time component is a 19:00 end-of-day sentinel, which is the trap B1
was about. `deliveryPromise` is `null` when there is no date yet.

## A4. Count mismatch stays **400** — and now says so in the docs

The behaviour has not changed; the documentation had simply never stated the
status code, which is what misled you. Confirmed contract:

**`POST /api/intake-user/proceed-to-tag/{id}`** with an `itemCount` that
disagrees with the rider's answers **400**, because the order did *not* proceed
to tag. Branch on the flag, not the code:

```jsonc
{ "success": false,
  "data": { "error": "Your count of 8 does not match the rider's count of 10. …",
            "countMismatch": true, "riderCount": 10, "intakeCount": 8,
            "holdRaised": true, "requiresAdminApproval": true,
            "statusCode": 400 } }
```

The `error` sentence is written for the operator and can be shown as it is. The
rider's `requiresCountReason` refusal on `PUT /api/rider/mark-pickup/{id}` has
the same shape and is recoverable — resend with `countReason`. Both are now
documented with their bodies in swagger.

## A5. `hasComplaint` is now derived, not read off a back-reference

`GET /api/recovery/report` → `lowRatedOrders[].hasComplaint` was reading
`feedback.complaintCaseId`, which is written in exactly one place: a feedback
submission that *itself* carried `type: 'complaint'`. Every other route into a
complaint — the in-app bot, a case opened by CX or an admin, and the common one,
a customer who rates 1–2 stars and *then* opens a complaint — left it unset
while the case still counted in the complaint figures.

It is now derived from `ComplaintCase` directly, so it is correct whichever door
the complaint came through. No shape change, no backfill needed — existing rows
are fixed by the read.

## A6. Not a backend gap: the rider pickup photo

`PUT /api/rider/mark-pickup/{id}` takes `itemCount` and `countReason` and **no
photo**, by the client's decision of 2026-10-07 — *"No rider photo. Rider
RECORDS the count; if it differs he must change it and give a reason."* That
overrode the "count + photo" line in the 6 October brief. Nothing is blocked on
the backend here. If the client changes their mind again it is a small add.

**Count-only Quick Booking IS a real gap and is mine** — booking currently
requires a full `items[]` and the capacity gates count `items.length`. Being
built next.

---

# Addendum 2 — count-only Quick Booking

The gap from A6 is closed. **briefCheck 371/371**, swagger 74 schemas / 309 paths
/ 0 wrong envelopes.

## B1. Book by count — `itemCount` on the existing booking endpoint

**`POST /api/bookOrder/create-book-order`** — send `itemCount` *instead of*
`items[]`:

```jsonc
{ "fullName": "Ada Obi", "phoneNumber": "08031234567",
  "serviceType": "wash-and-iron", "serviceTier": "classic",
  "deliverySpeed": "standard", "isPickUp": true, "isDelivery": true,
  "pickupAddress": { "address": "…", "landmark": "…" },
  "pickupTiming": "window", "pickupWindowId": "…",
  "itemCount": 10 }
```

There is **no separate Quick Booking endpoint** — same endpoint, same required
fields (service type, tier, speed, landmark, windows), same capacity gates,
measured against your count.

The order comes back with `quickBooking: true`, `itemsPending: true`,
`counts.customer: 10`, and 10 placeholder pieces.

**`amount` at booking is the LOGISTICS FEES ONLY.** The laundry bill is 0 until
Intake enters the real pieces — that is the client's flow ("bill by SMS before
washing"), so do not present `amount` as a total. Say the bill follows.

Rules worth knowing:
- `billingType` is forced to `pay-per-item`. A wallet or a subscription cannot
  be charged against an unknown amount; the customer's plan is settled at Intake.
- Offers resolve against the **real** bill at Intake, not against zero — which
  is what "the amount is checked on the bill" means in the spec.
- Send both `itemCount` and `items[]` and the real basket wins; `itemCount` is
  ignored.
- 1–200 pieces. A bad count is refused with a sentence.

## B2. Intake: `GET /api/intake-user/quick-bookings`

The Quick Booking card. Orders waiting for their real contents — step 2 of
Intake's four. They are **not** in the tagging queue yet, by design: tags never
print before the bill is settled.

Each row carries the three counts side by side (`customerCount`, `riderCount`
with `riderReason`, `intakeCount`), `placeholderPieces`, `logisticsAmount` and
the `deliveryPromise`. Paginated, searchable by OSC number / name / phone,
sorted by delivery deadline like every other queue.

Enter the real pieces with the existing **`PATCH /api/orders/{id}/items`**
(`items[]` + a required `reason`). That computes the total, raises the payment
hold with its SMS and Paystack link, and drops the order off this list.

## B3. What I decided, and what the client may want to confirm

The spec fixes the booking fields, the capacity rule and the Intake flow, but
never says what a count-only order *costs at booking*. I built the reading that
follows from "bill by SMS before washing": **the laundry bill does not exist
until Intake**, so the placeholder pieces are priced at zero rather than at an
invented per-piece estimate — a guess would quote the customer a number nobody
approved and would make the ₦4,000 offer threshold resolve against it.

Two consequences the client should be told about, because they are commercial:
1. A Quick Booking customer is **not quoted a laundry price at booking at all**.
   If they expect an indicative estimate on screen, that is a separate decision
   and needs a per-piece figure from the client.
2. A subscriber booking by count does not have the order counted against their
   plan at booking — it is settled when the bill exists. Worth confirming that
   is what they want.
