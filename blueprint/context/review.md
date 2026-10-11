# Independent Review

**Status:** passed
**Target commit:** aa4ed928f87ed895b9a1e36c3840451007908ad4
**Base commit:** 450a4c754c6a73e84a5c138ebd1f704bf1dfaabc
**Base ref:** origin/main
**Spec hash:** eb7384d152ebf8a9459df16d84bbc4d640b22b801e60d3c594fa899e059dc3ce
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-11T13:18:45Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-11T13:32:07Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `450a4c7..aa4ed92` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

The branch is stacked: commits up to `912d520` belong to three earlier fixes that
already passed their own independent reviews (archives under
`blueprint/history/fixes/`). This work item's own change is `912d520..aa4ed92`.

## Commands

- `git rev-parse HEAD` / `git merge-base origin/main HEAD` / `sha256sum blueprint/context/current-feature.md` / `git status --porcelain`: pass (all match the request; only review.md dirty)
- `node briefCheck.js`: pass (398 passed, 0 failed)
- Swagger envelope check from AGENTS.md: pass (0 wrong envelopes; BookingContext schema and feesLine present)
- `node bookingContextStaging.js`: unavailable (database scripts not permitted for this reviewer)
- Boot on `PORT=7999`: unavailable (server start not permitted for this reviewer)

## Evidence

- Window-only rule: `computeBenefits` (services/offer.service.js:828-841) keeps Anytime legs' fees; `_priceWithOffers` passes `scheduling.pickup/delivery.timing` from all three callers (booking branches and `_repriceForItems`); no-timing orders unchanged.
- Read-only reset: `freeLegsThisWeek` (util/logisticsAllowance.js:64) runs `applyWeeklyReset` on a fresh object over `lean()` reads; nothing is saved.
- `GET /api/bookOrder/booking-context` sits behind `auth` and reads only `req.user.id`; no id parameter, no cross-customer read.
- `applyCode` guard matches `canEnterReferralCode` (non-cancelled order, same query).
- Pricing consistency gaps between booking-options and order creation recorded as F-09 and F-10 (display only; the charged total stays authoritative and follows the client ruling).

## Findings

- F-09 (P2), F-10 (P2), F-11 (P2), F-12 (P2), F-13 (P3), F-14 (P3), F-15 (P3)

## Remaining risk

- `bookingContextStaging.js` and the PORT=7999 boot were not run here, so the DB-backed paths (booking-context against real documents, applyCode refusal, resolved timings at order creation) are verified only by reading the code.
- F-09/F-10: the booking screen can still show a free trip that the order then charges until those are fixed or the frontend always sends the selected offer and `anytime` for same-day.
- F-11: the bot remains a second entry point for late referral codes.
