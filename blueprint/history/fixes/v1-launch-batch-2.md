# Fix: V1 launch Batch 2

**Type:** Fix
**Status:** verified
**Branch:** `fix/v1-batch-2`

Client reply of 15 Oct 2026, Batch 2 ("very important, by Saturday"), plus the user's additions (assistant,
reward credit by default) and the frontend's open bugs. Tracker: `blueprint/context/V1-LAUNCH-PLAN-2026-10-15.md`.
FE notes: `blueprint/context/FE-CHANGELOG-2026-10-16.md`.

## What changed
- **Riders (R22):** failed pickup → no rider (Needs rider), status kept "failed", attempts counted on the order
  and against the customer; after 2 a customer experience task. Failed delivery → Ready, no rider ("Ready,
  waiting redelivery"); from the 2nd failure a redelivery fee line (`util/redeliveryFee.js`, setting
  `redeliveryFee`) and dispatch blocked until paid. Pickup rider refused on a collected order (FE6).
  "Collected" status (`ORDER_STATUS.COLLECTED`), treated as finished everywhere. "Count dispute" name +
  "Possible missing item" alert.
- **Cancellation (R12, R21):** admin only; S1/CX escalate (`POST /bookOrder/book-order/{id}/escalate-cancel`);
  admin-only approve; unpaid-after-pickup cancel → bill = trips, payment link SMS, return blocked until paid;
  "Returned unwashed" (`ORDER_STATUS.RETURNED_UNWASHED`).
- **Unpaid bills (B9):** `unpaidBillTimers` setting (minutes); reminders, "Call: unpaid bill" tasks, admin flag;
  sweep every 5 minutes; tasks close on payment/cancel. New `CareTask` model + `GET /recovery/tasks`,
  `POST /recovery/tasks/{id}/close`.
- **Quick Booking (R21):** `util/readyDateRecalc.js` — new ready date when paid after the pay-by time, or when
  the count is more than `quickBookingRecountTrigger` (2) × the booking.
- **Recount cover (R17, R13):** `util/recountCover.js`, `recountCover` setting; covered line
  `pricing.recountCover`; `user.recountMismatches`; repeat limit + "Repeat mismatch" alert; itemEdits keep
  staff name and old/new items.
- **Quiet hours (R23):** `util/quietHours.js`, `quietHours` setting; `util/sendSms.js` queues into `QueuedSms`,
  `crons/queuedSmsFlush.js` sends after; CRM dispatcher pauses (feedback request included). OTP unaffected.
- **Assistant (B16, B38):** no price estimate, no payment in chat, "talk to someone" opens a complaint
  (`ComplaintCase.orderId` no longer required).
- **Reward credit by default (B13):** card Pay and wallet pay spend credit unless `useCredit: false`.
- **B2:** `GET /users/check-payment` (asks Paystack, settles once via the webhook handler); callback URL from
  `PAYSTACK_CALLBACK_URL`.
- **FE fixes:** lastOrderChoices billingType/paymentMethod; delivered/collected cancel tier "none"; station Hold
  lists include pieces assigned to the station, search keeps the hold filter, QC list reads QC; feedback list
  `hasComplaint`.

## Verify
- `batch2Staging.js` (new, testingdb): 42 passed, 0 failed. `batch1Staging.js`: 29/0.
- All existing suites green unchanged: holdRelease 15, stationFlow 97, counterPayment 54, dispatch 80,
  itemEdit 20, holds 48, intakeUnpaid 11, handoff 54, welcome 28, googleProfile 11, readyDate 32, urgent 18,
  windowBooking 35, freeLogistics 23, rollover 37, subLogistics 20, planCreate 39, regNotBooked 33,
  bookingContext 30, dispatchTag 46, walletLimit 63, tierPricing 33, phase12 14, recoveryReport 52,
  dashboardDecisions 45, offerAdmin 37, template 27, staffStatus 38, quickBooking 67.
- briefCheck 566/0. Boot on PORT=7999: 0 errors. Swagger: 0 wrong envelopes.
- Not run: an independent review (skipped for the Saturday deadline). Not reproduced: B1 (needs the FE's request).
