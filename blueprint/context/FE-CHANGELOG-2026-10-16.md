# Backend changes for the frontend — V1 launch Batch 2, 15–16 Oct 2026

Swagger: /api-docs. Envelope as always: `{ success, data: { message } }`; a refusal is
`{ success: false, data: { error, ...flags } }` — show `data.error` as it comes ("Tap to try again" on
network failures).

## 1. Riders (R22)
- **Customer not available at pickup**: the pickup leg keeps `status: "failed"` but loses its rider, so it
  shows in **Needs rider** for the next window (`needsRider: true`). Rows in the S1 pickup/delivery lists
  now carry `failedAttempts` and `statusLabel` ("Customer not available: needs rider" / "Ready, waiting
  redelivery"). After 2 failures a customer experience task opens (see 5).
- **Customer not available at delivery**: the order stays **Ready**, delivery `status: "failed"`, no rider
  (`statusLabel: "Ready, waiting redelivery"`). Customer gets the "not available" SMS. **First redelivery is
  free; from the 2nd failure the next redelivery is charged**: a line in
  `dispatchDetails.delivery.redeliveryFees[]` (`{ amount, at, paidAt }`), the order's `amount` goes up by it,
  `balanceDue` = the fee, `paymentStatus: "pending"`. Assigning / dispatching is refused until paid
  (`redeliveryFee: true`, `requiresPayment: true`). The customer pays with the normal Pay; S1 can record
  POS/transfer. Setting: `redeliveryFee` (admin order settings; empty = the delivery fee).
- **Assigning a pickup rider** to an order already collected (or with the rider on the way) is refused
  (was 200 and reset the pickup).
- **"Collected"**: the S1 "customer collected in person" action now ends the order as stage
  `collected` (not `delivered`). Every "finished" filter treats `collected` like `delivered`.
- **Count dispute**: the hold is named "Count dispute"; when S1 counts fewer than the rider admin also gets
  "Possible missing item".

## 2. Cancellation (R12, R21) — only admin cancels
- `POST /bookOrder/book-order/{id}/staff-cancel`: **admin only**. Others get `requiresAdmin: true`,
  `canEscalate: true`.
- NEW `POST /bookOrder/book-order/{id}/escalate-cancel` `{ reason }` (S1, customer experience, admin): puts
  the order on admin's list. The list is `GET /bookOrder/cancellation-requests`; rows now carry
  `source: "staff" | "customer"` and `escalatedBy`. Approving (`POST .../cancellation-requests/{id}/approve`) is
  **admin only**; customer experience can still decline.
- An **unpaid order cancelled after pickup** owes the trips (N1,000 + N1,000): `amount` becomes that fee,
  `cancellation.returnFeeDue` and `cancellation.originalAmount` are set, the customer gets a payment link by
  SMS. **The return delivery cannot be assigned until it is paid** (`requiresPayment`, `returnFeeDue`); the
  same for "customer collected" at the office.
- Starting the return keeps the order `cancelled`; handing it back makes the stage **`returned-unwashed`**.

## 3. Quick Booking (R21)
- Bill SMS carries the pay-by time ("Pay by 12 noon Fri to keep your ready date of Sat 7 PM") and the
  expired-link note (since Batch 1).
- **Paid after the pay-by time** (12 noon the day after the bill) → `deliveryDate` is worked out again from
  the payment time, `readyDateRecalc: { at, from: "payment", previous }`, an in-app notice tells the customer.
- **Counted more than 2× the booking** → `deliveryDate` worked out again with the daily limit before the
  bill goes out (`readyDateRecalc.from: "pickup"`); the Change Items result has `readyDateChanged`.
  Setting: `quickBookingRecountTrigger` (default 2).

## 4. Recount cover and Change Items history (R17, R13)
- Settings: `recountCover: { percent: 10, maxAmount: 200, repeatLimit: 3, repeatDays: 60 }` (0 in either cover
  limit = no cover).
- An increase within BOTH limits is covered: `pricing.recountCover` (show "Covered by CHUVI N…" as its own
  line), nothing more to pay, no SMS, no hold. Above either limit: charged in full (payment link).
- Every mismatch is recorded on the customer (`recountMismatches`); past the repeat limit there is no cover and
  admin gets "Repeat mismatch".
- Change Items result adds `recountCover`, `coverReason` (`covered | over-cover | repeat-limit |
  quick-booking | no-cover-set | no-increase`), `readyDateChanged`. Each `itemEdits[]` entry now has
  `byName`, `previousItems[{type,quantity}]`, `newItems[{type,quantity}]`.

## 5. Unpaid bills as settings + customer experience tasks (B9, R24)
- Setting `unpaidBillTimers: { firstReminderMinutes: 180, nextDayReminderHour: 9, taskMinutes: [1440, 4320],
  adminFlagMinutes: 10080 }` (minutes, so the test values 10 / 30 / 45 / 60 fit).
- Reminder SMS at the first time and at 9 AM the next day; "Call: unpaid bill" tasks at each task time; an
  admin flag ("Unpaid bill flagged") at the last. Tasks close by themselves when paid or cancelled.
- NEW task list (customer experience, admin): `GET /recovery/tasks?status=open|closed|all&type=failed-pickups|unpaid-bill`,
  `POST /recovery/tasks/{id}/close` `{ note }`.
- Payment holds are never Overdue (Batch 1).

## 6. Quiet hours (R23)
Setting `quietHours: { startHour: 21, endHour: 7 }`. No SMS in those hours: held and sent when they end
(OTP codes are never held). CRM messages, the feedback request included, wait too.

## 7. Assistant and Pay (B16, B38, B13)
- The assistant gives **no price estimate** (points to Book / Quick Booking) and takes **no payment in chat**
  (an unpaid booking says "open the CHUVI app, go to Orders and tap Pay").
- "Talk to someone" also **opens a complaint** for customer experience, linked to the customer (and their
  latest order). Once per open case.
- **Reward credit is used by default at Pay**: `POST /users/initialize-payment` (order) and wallet pay spend
  credit first unless `useCredit: false`. If credit covers it all the reply is
  `{ coveredByCredit: true, creditApplied, amountToPay: 0 }` and no link.
- NEW `GET /users/check-payment?reference=…` (or `?orderId=`): asks Paystack again and settles the payment if
  it succeeded (once). **The page after Paystack (callback) should call this and show the result — never a
  blank screen (B2).** The callback address is now a server setting.

## 8. Fixes you reported
- `lastOrderChoices` now has `billingType` and `paymentMethod`.
- A delivered (or collected) order's `cancellationVerdict.tier` is `none`.
- Held pieces show in the Hold list of the station they are **assigned** to (and the raising station); a
  search no longer drops the hold filter; QC's Hold list was reading Sort & Pretreat's — fixed.
- The feedback list rows carry `hasComplaint` (from the complaints themselves).
- Already in the code before this (please send an order id if you still see it): the rider's assigned
  deliveries carry `deliveryDate` and `deliveryPromise`; the press queue leaves out started orders.
- B1 "orders failing to load": we need the failing request (endpoint, order id, response) to reproduce it.
