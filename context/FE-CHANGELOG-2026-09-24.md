═══════════════════════════════════════════════════════════════════════════════
5. NEW — Dispatch Tag (order-level, rider deliveries only)
═══════════════════════════════════════════════════════════════════════════════

A second, separate tag. The intake item tag (`items[].tagId`) tracks a garment
through the office, one per physical piece. This one is **one per ORDER**, and it
only exists for an order leaving the building with a rider — it is what lets the
rider prove, at a door they don't control, that this order belongs to this person.

An order the customer collects in person has no dispatch tag. They identify
themselves at the counter, so there is nothing for a tag to prove.

## Who prints it
**Station 1 (intake-and-tag)**, at the moment they hand the bagged order to the
rider. Not QC, and never the rider. Auth is the normal `intakeUserAuth` (admin
included), so this belongs on the S1 dispatch screen, beside rider assignment.

## Endpoints
```
GET   /intake-user/order/{id}/dispatch-tag          build it (writes nothing)
POST  /intake-user/order/{id}/dispatch-tag/print    record that it was printed
```

`GET` is safe to call as often as you like — use it for the preview. `POST` is
the one that counts as a print.

## Response (both endpoints)
```json
{
  "orderId": "68cf1a2b4d5e6f7a8b9c0d1e",
  "ref": "OSC-20260428-321782",
  "orderReference": "OSC-20260428-321782",
  "customerName": "Jude Victor",
  "customerPhone": "08012345678",
  "deliveryAddress": {
    "label": "Home",
    "address": "12 Lagos Street, Yaba",
    "landmark": "Opposite GTBank"
  },
  "contents": "3 Shirts, 2 Trousers",
  "itemCount": 5,
  "items": [ { "itemId": "...", "tagId": "TAG-01", "name": "shirt", "quantity": 1 } ],
  "paymentState": "paid",
  "amountDue": null,
  "paymentNotice": "Paid in full — nothing to collect.",
  "deliveryNote": "Call on arrival, gate is usually locked",
  "printedAt": null,
  "printCount": 0,
  "reprintFlagged": false
}
```
`POST` returns the same object plus `"reprint": true|false`.

## ⚠️ THE AMOUNT LINE IS A FLAG, NOT A COLLECTION INSTRUCTION
Laundry is always prepaid — card, wallet or subscription. There is no
cash-on-delivery anywhere in the system and riders do not collect money.

  • `paymentState: "paid"` → `amountDue` is **null**. Print no figure at all.
  • `paymentState: "unpaid"` → `amountDue` is the outstanding amount, and it
    means *ask the customer to settle it in the app*. That is what
    `paymentNotice` says, verbatim.

**Print `paymentNotice` next to `amountDue`, never the number on its own.** A bare
"₦4,500" on a tag in a rider's hand reads as "collect ₦4,500", which is exactly
what must not happen. `amountDue` is deliberately `null` rather than `0` when
nothing is owed, so a "₦0" can never appear either.

## Layout note (client)
Leave room on the tag for a barcode. We are not adding one now — no station has
scanners yet — but this is expected in V2, and `ref` is what it will encode. A bit
of space now avoids a redesign then.

## ⚠️ PRINTING NOW GATES RIDER ASSIGNMENT
```
POST /intake-user/assign-rider/{riderId}/delivery-order/{id}
```
now returns **400** for a delivery order whose tag has not been printed:
```json
{ "error": "Print the dispatch tag for order OSC-20260428-321782 before assigning a rider.",
  "needsDispatchTag": true }
```
Nothing is written when it refuses. Pickup-leg assignment is unaffected.

The order's stage is **not** affected — `ready` still fires at Pack & Seal exactly
as before, so the customer's "your order is ready" notification is not delayed by
a printing step. The tag gates the handover, not the status.

### FE action
Branch on `needsDispatchTag` and send the user straight to the print action
rather than showing a generic error.

## The delivery queue tells you which orders are blocked
```
GET /intake-user/deliverable-orders
```
Each **delivery** row now also carries:

| field | meaning |
|---|---|
| `needsTag` | **the actionable flag** — true means a rider cannot be assigned yet |
| `tagPrinted` | whether the tag has ever been printed |
| `printCount` | how many times it has been printed |
| `reprintFlagged` | true past 3 prints — worth a look |

and the envelope carries `needsTagCount` beside the existing `needsRiderCount`.

These appear on the **delivery** queue only. `/intake-user/pickable-orders` is
unchanged — pickups are never tagged.

### FE action
Show `needsTag` on the row. Without it, staff hit "print the tag first" with
nothing on screen explaining which orders need one, and the gate looks like a bug.

## Reprints
Allowed — tags get lost, torn and printed badly. Every print increments
`printCount` and writes an audit entry that names it as a reprint with its number
("REPRINTED (print #2)"). `reprintFlagged` turns true past 3, per the client's
"if an order shows five reprints that should be visible on our side".

### FE action
Surface `reprintFlagged` on the row. It is the only place a reviewer would notice.

## Errors
```
400  "This order is not going out for delivery, so it has no dispatch tag.
      Only rider deliveries are tagged."
400  "Order has not completed Pack & Seal yet, so it is not ready to leave
      the office."
404  Order not found
```

═══════════════════════════════════════════════════════════════════════════════
6. CHANGED — monthly lead report now counts subscription conversions
═══════════════════════════════════════════════════════════════════════════════

Amends §3. A lead can convert by buying a **plan** rather than placing a one-off
order, and their plan-funded orders are billed at ₦0. Those leads previously
counted as booked with no revenue attached, which quietly deflated exactly the
revenue-per-lead figure the report exists to support.

`GET /crm/reports/monthly-leads` gains two fields:
```json
{ "subscriptionConversions": 1, "subscriptionDrawDownOrders": 4 }
```

| field | meaning |
|---|---|
| `subscriptionConversions` | leads who converted this month by buying a subscription; their first payment is included in the revenue figures |
| `subscriptionDrawDownOrders` | orders a plan paid for, which therefore contributed ₦0 |

Both are plain integers — the no-percentages rule in §3 still stands, and the
test still enforces it.

## Only the FIRST payment counts, never renewals
Client decision. The report measures the sales reps' conversion rate for the
effort they put in during that window. Once a lead converts they are a customer,
and what they keep spending reflects the service, not the rep's lead generation.

The practical effect matters for the screen: **a month's revenue figure stops
changing once its leads have converted.** Months stay comparable. Had renewals
counted, every past month would creep upward for as long as those customers stayed
subscribed, and rep-to-rep comparison would be meaningless.

A lead who both subscribed **and** paid per item is counted **once** in `booked`,
with both revenues summed.

### FE action
None required. If you show a revenue breakdown, `subscriptionDrawDownOrders` is
the honest answer to "why do some orders show no money".

═══════════════════════════════════════════════════════════════════════════════
7. BACKEND-ONLY — all dates now run on Lagos time
═══════════════════════════════════════════════════════════════════════════════

**No FE action. Recorded because it changes numbers you may be comparing.**

The server now pins itself to `Africa/Lagos`. It previously ran in UTC on Render,
which meant every "today" and "this month" bucket in the API was a UTC bucket,
while the new lead report was already on Lagos time. The two disagreed for the
first hour of each Lagos day — an order at 00:30 on the 1st landed in the previous
month on one screen and the new one on another.

They now agree. Dashboards that bucket by day or month may shift by an hour's
worth of records around midnight and month boundaries; that is the correction, not
a regression.

═══════════════════════════════════════════════════════════════════════════════
8. FIXED — Swagger documented the success envelope one level too shallow
═══════════════════════════════════════════════════════════════════════════════

Found by the FE during integration, via a network capture. No API behaviour
changed — this is a DOCS-ONLY correction, and no frontend change is required.

The wire shape has always been, and still is:

    { "success": true, "data": { "message": <payload> } }

The docs said:

    { "success": true, "message": <payload> }          ← one level too shallow

So the payload is at `data.message`, not `message`. Anyone who trusted the docs
had to discover this by inspecting traffic — which is exactly what happened.

## Scale and cause
112 response blocks across 27 route files were wrong, in two variants:
  • 104 declared `success` + `message` as siblings
  • 8 declared `success` + `message` + `data` as siblings (services that return
    an extra key, e.g. addAddress returns {message, data} — so BOTH belong
    under the outer `data`)

Root cause: the required pattern in CLAUDE.md itself omitted the `data` wrapper,
so every endpoint written to the house style inherited the same error. Fixed
there first, with a verification snippet, so it cannot regrow.

Why it went unnoticed: `ErrorResponse` was always documented CORRECTLY
(`{success, data:{error}}`). Failures nested, successes didn't — and nobody
compares the two side by side.

Now: 141 correct envelopes, 0 wrong, asserted by a check over the built spec.

### FE action
NONE. Your code already targets the real shape. This only means the docs now
agree with it, and the next person won't have to reverse-engineer it.

═══════════════════════════════════════════════════════════════════════════════
SWAGGER (updated)
═══════════════════════════════════════════════════════════════════════════════
55 schemas, 281 paths, parses clean. Served at /api-docs.

⚠️ Every 200 response in these docs is now nested `data.message`. If a previous
version of this changelog showed a shallower example, this is the correct one.

New:      DispatchTag
Updated:  DispatchQueueOrder (+ tagPrinted / needsTag / printCount / reprintFlagged)
          MonthlyLeadReport (+ subscriptionConversions / subscriptionDrawDownOrders,
            and the first-payment-only rule in the description)
          GET /intake-user/deliverable-orders (+ needsTagCount)
          POST /intake-user/assign-rider/{riderId}/delivery-order/{id}
            (documents the 400 + needsDispatchTag)

═══════════════════════════════════════════════════════════════════════════════
FE CHECKLIST (additions)
═══════════════════════════════════════════════════════════════════════════════
  [ ] Build the dispatch tag print view on the S1 dispatch screen        (§5)
  [ ] Print paymentNotice next to amountDue — never the figure alone     (§5)
  [ ] Leave space on the tag layout for a future barcode                 (§5)
  [ ] Handle the 400 + needsDispatchTag on rider assignment              (§5)
  [ ] Show needsTag on delivery queue rows                               (§5)
  [ ] Surface reprintFlagged for review                                  (§5)
  [ ] Nothing to do for subscription conversions unless you show a
      revenue breakdown                                                  (§6)
