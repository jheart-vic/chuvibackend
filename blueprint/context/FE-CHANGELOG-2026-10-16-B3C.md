# Backend changes for the frontend — V1 launch Batch 3c, 16 Oct 2026

Swagger: /api-docs (all documented). Envelope as always: `{ success, data: { message } }`.

## 1. Customer care gives recovery credit (client 15 Oct) — NEW
`POST /recovery/cases/{id}/credit/give` (customer care, admin) `{ amount, reason }` — the "discount" when closing a
complaint, in ONE step.
- Recovery credit for the **next order**, never money off an unpaid bill.
- Within the per-case limit (**N5,000**, counted with credit already given on that case) it is granted now:
  `{ granted: true, pendingApproval: false, amount, compensationId, complaint }`. The credit lasts **90 days**, and
  the customer gets ONE SMS: "{firstName}, we are sorry about your order {orderCode}. We have added N{amount} credit to
  your CHUVI wallet for your next order. It is valid for 90 days."
- Above the limit: `{ granted: false, pendingApproval: true, limit: 5000, alreadyGiven }`. Admin is notified and
  approves with the existing `POST /recovery/cases/{id}/credit/approve` (`{ compensationId, confirmed: true }`), which
  grants it and sends the same SMS. Show "Waiting for admin" until then.
- Closing the case is the existing close.

## 2. The client's words everywhere
- **Station names:** Intake and Tag, Sort and Pretreat, Wash and Dry, Press, Quality Check and Pack, Rider, Customer
  Care, Admin. Every backend message and label now uses them (no "&", no "Press & Iron", no "Quality Control", no
  "Customer Experience" in customer or staff text).
- **`statusLabel`** on orders (customer order list/detail, station lists, rider lists): Booked, Needs rider, Rider on
  the way, Picked up, Waiting for payment, At Intake, Sorting, Washing, Pressing, Quality check, Ready, Out for
  delivery, Ready waiting redelivery, Delivered, Collected, Returned unwashed, Cancelled; holds: On hold, Waiting for
  admin. **Show `statusLabel`, not `stage.status`.**
- S1 dispatch rows: `statusLabel` now reads "Needs rider" / "Ready waiting redelivery" (no colon or comma).
- "Urgent", never "Anytime", in every backend message. "Care level", never "tier".

## 3. History lines
Every station timeline (`/…/order/history/{id}/timeline`, Sort: `/sort-pretreat/history/{id}/timeline`) now has
`historyLines[]`: `{ line, at, station, what, by, detail }`. Show `line`: "10:42 Intake and Tag: 6 pieces counted by
Chioma" — the client's format. Built from the order's activity records, so steps before tonight read the same way
where the staff member was recorded.

## Still coming
Batch 3 part 2 (four switches): damage "Customer informed" + partial delivery, S2 holds one piece at receipt, routes
by service, Iron Only "looks dirty". Saturday 12 noon.
