# Backend changes for the frontend — V1 launch Batch 3b, 15–16 Oct 2026 (night)

Swagger: /api-docs, now complete for everything below. Envelope as always: `{ success, data: { message } }`;
a refusal is `{ success: false, data: { error, ...flags } }`.

**Swagger fix:** `BookOrder`, `BookOrderItem`, `Pagination` and `Notification` were referenced by many routes but
never defined, so those responses showed empty. They are defined now with every real field. `missingPieces` and the
second-rejection hold (live since Batch 3a) are now documented too.

## 1. "Ready by" on station lists (G1–G3, F37)
Every Sort, Wash, Press and QC list row now carries `deliveryDate`, `deliveryPromise` (`{ text, date, confirmed, … }`
— show `deliveryPromise.text`) and `quickBooking`.

## 2. Rider lists (F13, client 15 Oct rider cards)
Assigned and active pickups and deliveries:
- `itemCount`, `deliverySpeed`, `quickBooking`, `deliveryPromise`
- `speedLabel`: the speed by its admin display name (e.g. "Ready in 24 hours"). **Client: show this, never "Express".**
- `urgentPickup`, `urgentDelivery`: show a **red "Urgent pickup" / "Urgent delivery"** badge. `urgent` = Urgent for
  that list. **Urgent jobs come first** in the list. Both badges show when both apply.
- Rider history rows carry `itemCount`, `deliverySpeed`, `quickBooking`.

## 3. Pay-by time (F5)
A Quick Booking waiting for payment carries `payBy` (12 noon the day after the bill, the same as the bill SMS) on the
customer's order list and detail. `null` otherwise.

## 4. Hold data (F28)
- Station hold lists (`/…/orders/hold`): each row has `holdTypeKey` and `counts` (`{ booked, rider, intake,
  riderReason }`, null when not a count dispute); each `flaggedItems[]` piece has `rejectionCount`.
- Admin holds (`GET /admin/hold-orders`): `holdMeta.counts`, and `holdMeta.heldPieces[].rejectionCount`.
  `holdMeta` is documented in full now.
- A piece rejected twice: `holdReason`/`reason` = `second-rejection`, `assignTo` = `admin`.

## 5. Admin alerts (F40/F41) — NEW
`GET /admin/alerts` (admin): `{ counts: { countDisputes, possibleMissing, repeatMismatch }, countDisputes: [...],
possibleMissing: [... { missing }], repeatMismatch: [... { mismatches, lastAt, coverStopped }], repeatLimit, repeatDays }`.

## 6. Resend payment link (F24) — NEW
`POST /intake-user/order/{id}/payment-hold/resend` (Intake or admin): makes a fresh Paystack link and sends the
customer the payment reminder SMS with it. `{ resent, amount, paymentUrl, sentAt }`. Refused when already paid, not
on a payment hold, or sent less than a minute ago.

## 7. Releasing a hold (client 15 Oct, final)
- **The station the hold is assigned to releases it, with a note** ("Fixed, send again"). The station that raised it
  sees "Monitoring" and accepts the piece again when it comes back. Your pages already work this way.
- Station release endpoints now take `{ itemId?, note }`. **`note` is required for station staff**: without it,
  `error: "Add a note saying what was fixed before releasing this piece."`, `noteRequired: true`. Admin may omit it.
- The note is saved as `holdDetails.releaseNote` and in the piece history (`actionLog`, action `hold_released`).
- Admin only: count disputes / "Possible missing item", damage (after "Customer informed", part 2), and a piece
  rejected twice → `"Only admin can release this."`, `requiresAdmin: true`.

## 8. Pretreatment options
`soak` and `brush_off` added to `pretreatmentOptions` (stop sending them in the note).

## 9. Discount per offer (F20)
`pricing.appliedOffers[]` now has `discount` (that offer's own money off the items; 0 when it only waived a fee).
Orders booked before tonight do not have it.

## 10. Change Items (F19)
- The result now includes `pricing`: `{ itemsBase, tierUplift, itemsSubtotal, speedCharge, pickupFee, deliveryFee,
  offerDiscount, freePickupWaived, freeDeliveryWaived, appliedOffers, creditApplied, recountCover, orderTotal }` —
  show the care level uplift (`tierUplift`) on its own line.
- **Your side note was a real bug, fixed:** sending the same items again re-priced an old order at today's prices
  (N2,700 → N2,500, N200 refunded). Now the same items are refused: `"These are the same items already on the order,
  so nothing was changed."`, `noChange: true`.

## Still coming
Damage "Customer informed" + partial delivery, S2 holding one piece at receipt, routes by service, Iron Only "looks
dirty" — Batch 3 part 2, each behind its own switch (Saturday 12 noon). Customer care recovery credit at closing and
the client's word list are next on the backend.
