# Backend fixes for the frontend — after the live test, 16 Oct 2026

All live on the backend and documented in Swagger (/api-docs). Envelope as always: `{ success, data: { message } }`.

## Fixed
1. **Payment links (paymentUrl was null).** Every staff-raised link came back null and the SMS had no link
   (payment hold, Change Items, resend, Iron Only upgrade, return fee). `paymentUrl` now carries the Paystack link
   and the SMS includes it.
2. **Start delivery on OSC-20261016-008.** Pieces were stored with `tagColor: "blue"` and `tagState: "STAINED"`
   (from an old Swagger example) and the save failed. Tag confirm (`PUT /intake-user/confirm-tag/{orderId}/item/{itemId}`)
   now takes colours `white | light | dark` and marks `damaged | stained | pretreat | delicate` (case forgiven;
   anything else refused: "Tag colour must be White, Light or Dark."). Rider actions no longer fail on old values.
3. **Damage task after partial delivery.** The task now moves with the piece to the follow-on order; Customer
   informed or an admin release closes it wherever the piece is.
4. **POS on mark-paid.** `POST /intake-user/order/{id}/approve-transfer` takes `method: "pos" | "transfer"`
   (default transfer). With `pos`, `reference` is the POS receipt number (required); saved as `paymentMethod: "pos"`
   with `posPaymentApproval`, not on the bank-check list. Reply: `method`, `onBankCheckList` (false for POS), note.
5. **Naira sign.** Task text, the admin unpaid flag and the redelivery fee notice use ₦ (SMS stays N).
6. **Tag search.** `/search/search-orders` matches piece tag numbers; each matching order has
   `matchedPieces: [{ itemId, tagId, type, currentStation, stationLabel }]`.
7. **S2 receiving.** Every handoff item (pending list, push/confirm replies, split state, dispatch tag) carries
   `tagColor`, `tagState` and `serviceType`.
8. **Rep report.** `GET /admin/reports/rep-links?week=YYYY-MM-DD` gives one week (that day + 6). Each rep has
   `orders[]` (every paid order: `oscNumber`, `paidAt`, `amount`, customer); each customer has `orders[]` too.
   Without `week`, all time as before.
9. **Iron Only texts** are now the client's words ("{firstName}, your shirt (TAG 03) looks dirty …" and
   "{firstName}, we pressed your shirt (TAG 03) as you booked, without washing …").

## Answers (by design)
- **Credit limit:** live still has N10,000 saved; the client sets N5,000 on Monday.
- **Customer historyLines:** only on the six staff timelines (they name staff). The customer page keeps its own
  timeline.
- **Failed renewal:** not usable for booking; the unused items are kept for 7 days if the customer renews (client
  rule). Suggested wording on the booking page: "Your plan payment failed. Renew by {date} to keep your {n} items."
- **Close task:** keeps a required outcome; no customer message on close for now.

## Test site
- Backend: `https://chuvibackend-test-app.onrender.com` (docs at `/api-docs`), on its own test database.
- Allowed origins come from the server setting `EXTRA_CORS_ORIGINS` — tell us the test Vercel address so it is
  added (with `https://test.chuvilaundry.com`).
- With `TEST_SITE=1`: staff log in as normal; customers only with `@chuvitest.com` accounts; no real customer
  sign-ups; no SMS, email or WhatsApp leaves; hidden from Google. Show the "TEST SITE" banner on your side.
- Paystack on the test site: its own test business and webhook (being set up). Until then "Check payment" confirms.
- Test logins for the test site are coming separately.
