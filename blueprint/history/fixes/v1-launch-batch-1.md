# Fix: V1 launch Batch 1

**Type:** Fix
**Status:** verified
**Branch:** `fix/v1-batch-1`

Client reply of 15 Oct 2026 ("Everything by Saturday, in 3 batches"), Batch 1: must be in for launch.
Tracker: `blueprint/context/V1-LAUNCH-PLAN-2026-10-15.md`. FE notes: `blueprint/context/FE-CHANGELOG-2026-10-15.md`.

## What changed
- **Change Items** (`bookOrder.service applyItemEdit`): refused for S1 before the pickup is confirmed (R13);
  refused on plan orders for everyone (R18 fallback, admin settles by hand); SMS only for a wallet refund.
- **Riders** (`rider.service`): the customer phone check is gone from start pickup, picked up, delivered,
  pickup failed and delivery failed (B17).
- **Reason on every rejection** (`handoff.service confirm`): `note` required when pieces are rejected (R5).
- **No Ready Today on Quick Booking** (`bookingWindow.service speedOptionsFor` `quickBooking` option, used by
  booking-options and the booking itself).
- **Payment holds never Overdue** (`util/holdSla.js`): left out of every breach branch and `isHoldBreached`.
- **SMS cleanup** (`util/sendSms.js cleanSmsText`): N for the naira sign, no dashes, in the one place every SMS
  passes; hyphens inside codes and links stay.
- **No cash at the counter** (`util/counterPayment.js`, constants): cash refused; POS default; POS receipt
  number / transfer reference required and saved on `counterPayment.tenders[].reference`.
- **Rep tracking report** (new `services/repReport.service.js`, `GET /admin/reports/rep-links`).
- **Lead report** (`crm.service monthlyLeadReport`): staff-entered leads only (lead cards created at the office).
- **SMS texts** (new `util/orderSms.js`): the client's ten texts; booking received / ready / delivered sent once
  per order (`smsLog` latch on the order); the CRM's own "order ready" and "delivery confirmation" retired.
- **Sign-up** (new `util/signupGuard.js`, `models/signupAttempt.model.js`, `GET /admin/signup-attempts`): only a
  real Nigerian mobile; one phone one account (any written form); refusals logged with the referral code.

## Verify
- `batch1Staging.js` (new, testingdb): 29 passed, 0 failed.
- briefCheck 566/0 (cash and rider-SMS assertions moved to the new rules).
- Updated to the new rules and green: counterPayment 54/0, itemEdit 20/0, quickBooking 67/0, holds 48/0,
  googleProfile 11/0, readyDate 32/0, tierPricing 33/0. Unchanged and green: holdRelease 15, stationFlow 97,
  dispatch 80, intakeUnpaid 11, handoff 54, welcome 28, urgent 18, windowBooking 35, freeLogistics 23,
  rollover 37, subLogistics 20, planCreate 39, regNotBooked 33, bookingContext 30, dispatchTag 46,
  walletLimit 63, phase12 14, recoveryReport 52, dashboardDecisions 45, offerAdmin 37, template 27.
  botStaging 5/9 both before and after (testingdb prices, not this change).
- Boot on PORT=7999: 0 errors. Swagger: 0 wrong envelopes.
- Not run: an independent review (skipped for the Saturday deadline).
