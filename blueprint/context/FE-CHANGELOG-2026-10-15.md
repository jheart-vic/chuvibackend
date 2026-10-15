# Backend changes for the frontend — V1 launch Batch 1, 15 Oct 2026

Swagger: /api-docs. Envelope as always: `{ success, data: { message } }`; a refusal is
`{ success: false, data: { error, ...flags } }` — show `data.error` as it comes.

## 1. Riders: no customer phone check
`PUT /rider/start-pickup/{id}`, `/mark-pickup/{id}`, `/mark-pickup-failed/{id}`, `/mark-delivered/{id}`,
`/mark-delivery-failed/{id}`: `phoneNumber` is no longer needed or checked (ignored if sent). Remove the
phone field from the rider screens. `note` (failed) and `itemCount` / `countReason` (picked up) are unchanged.

## 2. Change Items (`PATCH /bookOrder/order/{id}/items`)
- Refused for S1 before the pickup is confirmed: `data.pickupNotConfirmed: true`,
  "Items can be changed only after the pickup is confirmed." Hide the button until pickup is confirmed
  (walk-ins and self drop-off have no pickup, so it is open for them).
- Refused on plan orders, for everyone: `data.planOrder: true`. Hide Change Items on plan orders.
- After tagging, only admin (unchanged; `requiresAdmin: true`).
- SMS: only a wallet refund is texted here now; money owed is texted with the payment link.

## 3. A reason on every rejection
`POST /orders/{id}/handoff/{hid}/confirm`: when `rejectedItems` is not empty, `note` (the reason) is
required, else `data.reasonRequired: true`, "Give a reason for rejecting these pieces."

## 4. Quick Booking: no Ready Today
- `POST /offers/booking-options` with `itemCount` and no items: the Ready Today row comes back
  `available: false`, `unavailableReason: "quick-booking"`, with a `message`. Grey it out as usual.
- Booking a Quick Booking with `deliverySpeed: "same-day"` is refused with the same message.

## 5. Payment holds are never Overdue
Holds Management and the dashboard count every payment hold as Active, whatever its age.

## 6. No cash at the counter
`POST /intake-user/create-book-order`:
- `paymentMethod`: `pos` | `bank-transfer` | `wallet`. `cash` is refused (`data.cashRefused: true`).
  **Pre-select POS.**
- NEW `paymentReference` (string): the POS receipt number for `pos`, the transfer reference for
  `bank-transfer`. Required for both (`data.referenceRequired: true`). Add a "POS receipt number" /
  "Transfer reference" field.
- NEW `secondaryPaymentReference`: the same for `secondaryPaymentMethod` (wallet short + POS/transfer).
- The reference is saved on `counterPayment.tenders[].reference`.

## 7. Rep tracking report (NEW) — admin
`GET /admin/reports/rep-links?from=2026-10-01&to=2026-11-01&referrerId=` →
`{ totals: { reps, signups, paidCustomers, totalPaid }, reps: [ { referrer: { id, fullName, phoneNumber,
code, role }, signups, paidCustomers, paidOrders, totalPaid, customers: [ { userId, fullName, phoneNumber,
signedUpAt, paid, paidOrders, totalPaid, firstPaidAt } ] } ] }`. Paid = an order actually paid and not
cancelled; a waived order does not count.

## 8. Lead report: staff-entered leads only
`GET /crm/reports/monthly-leads` now counts only leads entered by staff (the walk-in lead form).
Sign-ups and assistant (WhatsApp) leads are left out. Same response shape.

## 9. Sign-up phone rules (email form and Google phone step)
`POST /auth/register` and `PATCH /users/complete-profile`:
- Only a real Nigerian mobile (070, 080, 081, 090, 091, or +234): else `data.code: "INVALID_PHONE"`,
  "Enter a Nigerian mobile number: 11 digits starting 070, 080, 081, 090 or 091 (or the same number with +234)."
- One phone number, one account: a number already in use → `data.code: "PHONE_ALREADY_REGISTERED"`,
  `data.action: "login"`. A used email is unchanged (`EMAIL_ALREADY_REGISTERED`). Show both under the field.
- NEW admin list of refused sign-ups: `GET /admin/signup-attempts?page=1&limit=20` →
  `{ data: [ { id, reason: "phone-in-use"|"email-in-use", method: "email"|"google", email, phoneNumber,
  fullName, referralCode, existingAccount: { id, fullName, email, phoneNumber }, at } ], pagination }`.

## 10. SMS (no screen change)
The client's texts are live: booking received (at booking, or when a card payment lands), Quick Booking
bill with pay-by time and expired-link note, payment link after recount, payment reminder, rider count,
wallet refund, ready (delivery window or collection hours), delivered, customer not available. Every SMS
uses N and no dashes. The CRM's own "order ready" and "delivery confirmation" messages are retired (the new
SMS replace them). Pay-by time = 12 noon on the day after the bill.

## Frontend only (client's Batch 1 item 8)
- "Sign up with Google" as the main sign-up button.
- Quick Booking as the main way to book; item by item as the second option.
