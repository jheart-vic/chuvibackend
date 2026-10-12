# Independent Review

**Status:** passed
**Target commit:** 90247ef09394a1432af86ba1ce3e25ac40272d30
**Base commit:** 502dc0f0f38dc0ebdea5bec7878e066af9ee31c2
**Base ref:** origin/main
**Spec hash:** 6b9206a89cc7526921dfe4c4ace621d42ed76147199cf7b8eb680795fccfcb19
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-12T13:30:00Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-12T13:20:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `502dc0f..90247ef` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

Round 9. This work item is `4dbdc53..90247ef`. Round 8 (`e61faed`) was changes-requested
with F-45 [P1] and F-46 [P2]; `90247ef` repairs both (marked `fixed`). Verify each and move
it to `closed` or reopen it. F-47 [P3] (duplicate subscription documents) is logged open and
deferred to launch item 9 by the user; F-06/F-08 stay open by design.

## Commands

- `git rev-parse HEAD` / `git merge-base origin/main HEAD` / `sha256sum blueprint/context/current-feature.md` / `git status --porcelain`: pass (all match the request; only review.md dirty)
- `node briefCheck.js`: pass (462 passed, 0 failed)
- Swagger envelope check from AGENTS.md: pass (0 wrong envelopes; `/subscription/subscribe-plan` is `deprecated: true` with only a 400 response)
- `node -e "require('./util/webhook.handler.js'); require('./services/subscription.service.js'); require('./routes/subscription.js')"`: pass
- Offline renewal probe (scratchpad script; model statics and notifiers stubbed, no DB connection): 9/10. The one miss is the pre-existing loyalty-notice ordering, recorded as F-48. All F-46 behaviours pass.
- testingdb probes, staging scripts, boot on 7999: unavailable to this reviewer (not run by rule)

## Evidence

- F-45: `subscribePlan` (services/subscription.service.js:240-244) takes no input and always returns the failed envelope (HTTP 400 via controllers/base.controller.js:10-13). Its only caller is routes/subscription.js:311-313; routes/users.js:30 imports the constant but never mounts it. The paid path (`initializePayment` → `handleChargeSuccess` → `handleNormalSubscription`, util/webhook.handler.js:236-261, 302-311, 608-709) is not touched by 90247ef.
- F-46: `handleRenewal` (util/webhook.handler.js:329-395) sends unknown-code, other-customer and catch-all failures to `reportUnappliedRenewal` (:403-459). It creates the row once (11000 → return before any alert) or flags the existing row, and each step is in its own try/catch, so it never throws. After `subscription.save()` only `notifyBot` runs, which swallows its own errors (util/notifyBot.js), so a successful renewal is never reported as unapplied. A repeat event stops at `exists(reference)` (:151) or the atomic claim (:265-281). The customer text says only that the payment was received and is being confirmed.
- Full delta re-read for money paths: booking allow-list and Quick Booking zero bill (services/bookOrder.service.js), re-price offer settlement, atomic plan-item claim, `paymentGate` (`orderPayableGate`/`amountDue`/`amountPaidSoFar`), wallet/bot payment gates, webhook checkout matching, top-up crediting, and order settlement. No new P0/P1 found.

## Findings

- F-45 [P1]: closed
- F-46 [P2]: closed
- F-48 [P3] open (new): if a renewal's save fails on a loyalty month, the customer still gets "we've added N extra items", alongside the F-46 notice (util/webhook.handler.js:36-46, 379-380). Pre-existing ordering.
- F-49 [P3] open (new, pre-existing, outside delta): util/webhook.js:50 calls `handleChargeFailed`, which is not imported, so every `charge.failed` event returns 500
- F-47 [P3] open (deferred by user); F-06 / F-08 [P3] open (by design)

## Remaining risk

- Builder-reported results this reviewer could not rerun (DB access not allowed): F-45/F-46 testingdb probe 15/0, quickBookingStaging 67/0, plan probe 5/5, boot on 7999 with unauthenticated subscribe-plan → 401.
- The real Paystack renewal event shape (whether `paid_at`/`amount` are always present, and whether renewals carry custom metadata) could not be checked offline. If `paid_at` were missing, the unapplied row would fail validation, but admins are still alerted.
- No unit test runner exists (`npm test` is a placeholder). F-46 behaviour was checked only through an offline stubbed-model probe, not against Mongo's unique index.
- The frontend's claim that it never calls `POST /subscription/subscribe-plan` is the user's confirmation; this reviewer did not check the frontend repo.
