# Backend changes for the frontend — V1 launch Batch 3 (first half), 15 Oct 2026 evening

Swagger: /api-docs. Envelope as always: `{ success, data: { message } }`; a refusal is
`{ success: false, data: { error, ...flags } }` — show `data.error` as it comes.

## 1. Missing piece named (item 17)
- A whole-order move (S1 → S2, S4 → S5) that is short now says which piece and where:
  "The whole order must be here before it can move on. Missing: TAG 03 is at Wash & Dry."
  The refusal also carries `missingPieces` (the same list as a string). Push and confirm both.

## 2. Second rejection goes to admin (item 17)
- When a receiving station rejects a piece that was already rejected once, the hold is assigned to
  **admin** (`holdDetails.assignTo: "admin"`, `holdDetails.reason: "second-rejection"`) and admin gets
  "Rejected twice: needs admin". A first rejection still goes back to the sending station.
- A station trying to release that piece gets "Only admin can release this." with `requiresAdmin: true`.
  Admin releases it with the normal release endpoint.

## 3. S2 corrects colour and stain tags (item 16)
- `PATCH /sort-pretreat/order/{id}/items/{itemId}/sort-details` takes two new optional fields:
  `tagColor`: `white` | `light` | `dark`, and `stained`: `true` | `false`.
- The wash colour group follows the colour (white → `white`, light or dark → `colored`) unless you also send
  `colorGroup`.
- Each change is recorded on the piece: `items[].tagCorrections[]` =
  `{ field: "tagColor" | "stained", from, to, by, byName, at }`. Show it on the piece history.

## 4. The 3 PM due-today check (item 20, B34)
- NEW `GET /admin/due-today-not-at-qc` (admin): `{ count, data: [ { orderId, oscNumber, customerName,
  phoneNumber, deliveryDate, deliverySpeed, status, piecesAt: { "Wash & Dry": 3 } } ] }`.
- Admin also gets one notification a day at the set hour: "N orders due today not at QC".
- NEW admin setting `dueTodayCheckHour` (0–23, default 15 = 3 PM) in the admin settings.

## 5. Per-window prices (item 20)
- Booking windows (`/admin/booking-windows` create and update) take two new optional fields:
  `pickupFee` and `deliveryFee` (naira, 0 or more). Blank (`null` or `""`) = the general window price
  (the existing `pickupFee` / `deliveryFee` settings). Windows return them in every list.
- The Urgent price is unchanged: the existing `anytimePickupFee` / `anytimeDeliveryFee` settings.
- Booking options and booking now charge the chosen window's own price; if a full window moves the
  customer to the next one, they pay that window's price. The Urgent refund is measured against the
  window's own price.
