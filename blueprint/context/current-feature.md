# Fix: Booking body cannot set server fields

**Type:** Fix
**Status:** verified
**Branch:** `fix/booking-body-cannot-set-server-fields`

Security hotfix, branched from `main` so it can ship ahead of the stacked launch-fix
branches. Found by the independent review of launch fix 2 (F-18 [P0]).

## The problem

`BookOrderService.postBookOrder` (`POST /api/bookOrder/create-book-order`, also the in-app
assistant's booking) builds the order in all three billing branches as
`{ userId, oscNumber, amount: totalPrice, …, ...post, deliveryDate }`, where `post` is the
request body. Anything in the body overwrites the server's values:

- `amount: 100` → the order's amount is ₦100, which Paystack then charges.
- `paymentStatus: "success"` → an unpaid order is stored as paid (tagging unlocks).
- `userId` → the order is filed under another customer.
- likewise `stage`, `pricing`, `paymentWaivedAt`, `deliveryAmount`, `quickBooking`, …

## The fix

- Save only an allow-list of the customer's own fields from the body
  (`CUSTOMER_ORDER_FIELDS`: name, phone, addresses, pickup date and time, service type,
  care level, speed, channel, billing type, items, note, pickup/delivery), plus the
  Quick Booking fields the server's own normaliser puts on `post`. Every other field is
  the server's.
- The Quick Booking fields (`quickBooking`, `itemsPending`, `counts`) are removed from the
  body before anything reads it, so a client cannot set them.
- Inputs that are read but never stored (`itemCount`, `useCredit`, offer ids, timings,
  window ids, …) are unaffected.

Must not break: any booking branch (pay-per-item, wallet, subscription, Quick Booking).

## Build steps

1. [x] **Allow-list the saved fields.**
   **Done when:** a booking that sends `amount`, `paymentStatus`, `userId` or
   `quickBooking` gets the server's values, and every billing branch still books.

## Verify

- briefCheck: the allow-list drops server fields, and all three order literals use it.
- A booking against testingdb sending `amount: 100`, `paymentStatus: success` and another
  `userId` (SMS and Paystack stubbed).
- `subLogisticsStaging.js` (subscription branch) on testingdb.
- **Independent review is required** (security, payments).
- **Results (2026-10-11):** briefCheck 407/0. Probe through the real `postBookOrder` on
  testingdb (SMS/Paystack stubbed): **unpatched `main` stored a ₦100 order, marked paid,
  filed under another customer**; with the fix, amount ₦701,000 (server), payment pending,
  owner = caller, `deliveryAmount`/`pricing` server's, `quickBooking` not settable,
  customer fields kept (8/8). `subLogisticsStaging.js` 20/0 (subscription branch).
