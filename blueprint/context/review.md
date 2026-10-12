# Independent Review

**Status:** changes-requested
**Target commit:** e61faedf417da9c6484481e0d01d093dda84475d
**Base commit:** 502dc0f0f38dc0ebdea5bec7878e066af9ee31c2
**Base ref:** origin/main
**Spec hash:** 8b89b9965433404f4303f0225c62c479a5add6eb29325d3d9abe23466fc35071
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-12T11:56:10Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-12T12:00:29Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** changes-requested
**Check result:** not-required

## Handoff

Review the active spec and the complete `502dc0f..e61faed` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

Round 8. This work item is `4dbdc53..e61faed`. Round 7 (`0bb40bd`) was changes-requested
with F-40 [P1], F-41, F-42 [P2], F-43, F-44 [P3]; `e61faed` repairs all five (marked
`fixed`). Verify each and move it to `closed` or reopen it.

## Commands

- `git rev-parse HEAD`, `git merge-base origin/main HEAD`, `git status --porcelain`, `sha256sum blueprint/context/current-feature.md`: pass (HEAD e61faed, base 502dc0f, spec hash matches, only review.md dirty)
- `node briefCheck.js`: pass (462 passed, 0 failed)
- Swagger envelope check from AGENTS.md: pass (wrong envelopes: 0)
- `node -e "require('./util/webhook.handler.js')"`: pass (module loads)
- `node quickBookingStaging.js` and the other `*Staging.js` scripts: unavailable (DB-backed, not run by rule)
- Server boot: unavailable (not run by rule)

## Evidence

- F-40: renewal routing at util/webhook.handler.js:151-154 before the metadata and row checks; ownership and unique-reference claim at 332-362; `data.subscription` is Paystack-set and codes are stored only from signed `subscription.create` (webhook.handler.js:451-512), so a public-key checkout cannot borrow another code. Renewal amount is not checked against plan price; acceptable because Paystack charges the plan's own amount, which only the secret key can set.
- F-41: crons/reconcilePaystack.js:32-40 (7-day cutoff, pending amount-0 only).
- F-42: webhook.handler.js:236-261 runs before the claim at 265 and uses our row's planId and expectedAmount.
- F-43: handleNormalSubscription (540-641) uses only `verifiedPlan`.
- F-44: refusal keys on `metadata.initRefused` (193-195), set at paystack.service.js:127 and wallet.service.js:83.
- Orders, top-ups, payment holds and cancellation fees: no change this round; order and top-up branches still credit `min(collected, expected)` after the unchanged mismatch checks.
- F-45: services/subscription.service.js:235-267 creates an `active` subscription (schema default, models/subscription.model.js:9-13) with full `monthlyLimits` behind plain `auth`; consumed by bookOrder.service.js:1763-1777.

## Findings

- F-40, F-41, F-42, F-43, F-44: closed
- F-45 [P1] open (pre-existing, outside this delta): free active subscription via `POST /api/subscription/subscribe-plan`
- F-46 [P2] open: unapplied renewal charges dropped with no record or admin alert
- F-06, F-08 [P3] remain open by design

## Remaining risk

- Not verifiable offline: whether Paystack's renewal `charge.success` carries `data.subscription.subscription_code`. If it does not, renewals fall to the "no transaction type" branch and are silently skipped (pre-existing shape; no `invoice.update` handler exists).
- Not verifiable offline: whether a first plan charge ever carries `data.subscription`; if it does, the F-42 check is skipped and the claimed renewal path may record success with nothing activated (F-46).
- `handleNormalSubscription`'s filter uses the non-schema `user` field (Mongoose 8, strictQuery false), so every first charge creates a new document; a re-subscriber after a `failed` renewal can end with two documents, and `subscription.create` may attach the new code to the older one (pre-existing).
- Builder claims not re-run here (DB-backed): quickBookingStaging 67/0 (including scenario 16: renewal refreshes once, another payer refused, price edit after checkout still activates, underpaid plan charge stays pending, failed-then-retried payment credited), plan probe 5/5, fourteen other staging scripts green, boot ok.
