# Fix: S1 booking payment method message

**Type:** Fix
**Status:** verified
**Branch:** `fix/s1-booking-payment-method-message`

Client report, 11 Oct 2026: booking at S1 (intake and tag) always fails on the payment
method.

## The problem

`POST /api/intake-user/create-book-order` (`IntakeUserService.createBookOrder`) has
required `paymentMethod` since the client's 8 Oct ruling ("make it mandatory, with cash
pre-selected on the screen"). But the 8 Oct frontend changelog told the frontend the field
was **optional** ("Omitted means cash… existing calls are unaffected"), and no correction
was sent. A screen that sends no `paymentMethod` gets "paymentMethod is required" on every
booking. That is a raw field name, not something staff at the counter can act on.

Confirmed on testingdb by driving the real `createBookOrder`: no value or an empty value
gives "paymentMethod is required". `cash`, `pos`, `card`, `transfer`, `bank transfer`,
`bank-transfer` and `wallet` (any capitalisation) are accepted. Anything else gets
"… is not a counter payment method. Pick one of: cash, POS, bank transfer, wallet."

## The fix

- The field stays **required**. No server-side fallback to cash: that would undo the
  client's "make it mandatory" ruling.
- A missing or blank `paymentMethod` is refused with a sentence staff can act on:
  "Choose how the customer paid: cash, POS, bank transfer or wallet." Nothing is
  created, as before.
- Swagger documents both refusals on the route.
- A corrected frontend note: the S1 screen must show the payment choice with **Cash
  pre-selected** and always send `paymentMethod`.

## Build steps

1. [x] **Message, docs and note.** The missing/blank check lives in `planCounterPayment`
   (`MISSING_COUNTER_METHOD`), which runs before any order exists; the validator rule is
   `string`. Verified: briefCheck 407/0, counterPaymentStaging 51/0 on testingdb (scenario 1
   now asserts the sentence), Swagger 0 wrong envelopes, boot on 7999 ok. Frontend note:
   `blueprint/context/FE-CHANGELOG-2026-10-11.md`.
   **Done when:** a missing or blank `paymentMethod` returns the new sentence, every
   accepted value is still accepted, and the Swagger check reports 0 wrong envelopes.

## Verify

- briefCheck: assertions for the missing/blank refusal and an accepted spelling.
- Boot on `PORT=7999`.
- Independent review: not selected. The change is the wording of a refusal; no money,
  access or data path changes.

## Frontend impact (to send them)

- The 8 Oct note was wrong: `paymentMethod` is **required** on
  `POST /api/intake-user/create-book-order`. Show the payment choice with **Cash
  pre-selected**, and always send one of `cash`, `pos`, `bank-transfer` or `wallet`.
- With `wallet`, if the wallet is short the backend answers with the amounts. Let staff
  pick how the rest is paid and resend with `secondaryPaymentMethod`.
