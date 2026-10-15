# Fix: V1 launch batch 3b — frontend asks + client answers

**Type:** Fix
**Status:** verified
**Branch:** fix/v1-batch-3b
**Date:** 2026-10-15

## The problem
The frontend's 15 Oct fix status listed fields and endpoints it still needed (Ready by, rider list fields, pay-by,
count dispute data, admin alerts, resend link, release note, Soak/Brush off, discount per offer, Change Items
pricing lines), plus a real bug (identical items re-priced an old order). The client's answers the same night set
the hold release rule (assigned station, with a note), rider cards (red Urgent badges first, speed display names).

## The fix
- `util/paginate.js` `withPromise` → station lists carry deliveryDate / deliveryPromise / quickBooking (25 lists).
- `services/rider.service.js`: `riderJobFlags` (urgentPickup/urgentDelivery/urgent, speedLabel, Urgent first);
  itemCount, deliverySpeed, quickBooking on every list and history.
- `util/orderView.js` `addPayBy` (presentOrder).
- `util/itemHold.js` `rejectionCount`, `holdCounts`; station hold lists and admin holds carry them.
- `util/adminAlerts.js` + `GET /admin/alerts`.
- `PaymentHoldService.resendLink` + `POST /intake-user/order/{id}/payment-hold/resend` (`paymentHold.linkResentAt`).
- `stampRelease` saves the note (releaseNote + actionLog); station releases require a note (admin exempt).
- `PRETREATMENT_OPTIONS` soak, brush_off.
- `appliedOffers[].discount`.
- `applyItemEdit`: identical items refused (`noChange`); result carries `pricing` lines.
- Swagger: BookOrder, BookOrderItem, Pagination, Notification defined (were dangling); everything above + Batch 3a's
  missingPieces documented.

## Verify
- `node briefCheck.js`: 566 passed.
- `batch3bStaging.js` on testingdb: 33 passed, 0 failed.
- Regression suites on testingdb (see the commit). Swagger: 0 wrong envelopes, 0 dangling refs.
- FE notes: `blueprint/context/FE-CHANGELOG-2026-10-16-B3B.md`.
