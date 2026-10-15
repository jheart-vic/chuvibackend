# Fix: Review fixes for V1 batches 1 and 2

**Type:** Fix
**Status:** verified
**Branch:** `fix/review-fixes-b1-b2`

An independent review (background reviewer, 15 Oct) of e3d9e5c + 26809ef found 3 P0, 4 P1 and several P2/P3,
plus a pre-existing security hole.

## Fixed
- **SECURITY (pre-existing):** public sign-up (email, Google, Apple) accepted any role, so anyone could become
  admin → a self-registered staff/admin account now starts INACTIVE until an admin activates it (admins are
  notified). The public `GET /auth/admin-register` seed (admin@chuvi.com, password in code) is closed unless
  ADMIN_SEED_ENABLED=true. Admin login no longer crashes on an unknown email. (The live admin still has the
  default password — the user is changing it.)
- **P0** paying a return fee sent a cancelled order back to the queue → cancelling closes the payment hold and
  `clear()` never moves a cancelled order.
- **P0** staff-raised payment links spent the customer's reward credit → `_buildPaymentLink` passes
  `useCredit: false`.
- **P0** credit counted as cash: a recount down now gives credit back as credit (`creditPaidAtPay` + reversal),
  an overpaid card refunds credit as credit, the cancellation fee is owed whatever cash did not cover.
- **P1** double tap spent credit twice → atomic once-per-order claim. Fully credit-covered Pay now does the card
  side effects (urgent alert, booking received, billingType).
- **P1** redelivery fee did not block assignment → refused at rider assignment too.
- **P1** finished orders could be escalated/approved for cancellation → refused; returned-unwashed tier none.
- **P2** never-paid order + redelivery fee; return jobs listed on S1's delivery list; delivered-only counters now
  include collected; returned-unwashed left out of active lists; no ready-date recompute on cancelled orders;
  floor allocation restored on failure. **P3** repeatLimit 0 = no limit; numeric POS receipt accepted.

## Verify
`reviewFixStaging.js` (new) 16/0; batch2 42/0; batch1 29/0; all 29 suites green (recoveryReport 52/0 after
fixing a `$$` the bulk edit had eaten); briefCheck 566/0.
