# Fix: V1 launch batch 3, low-risk half

**Type:** Fix
**Status:** verified
**Branch:** fix/v1-batch-3a
**Date:** 2026-10-15

## The problem
The client's 15 Oct launch list, Batch 3, low-risk items (tracker items 16, 17 part, 20), plus a batch 2
boot bug found on the way.

## The fix
- Missing-piece message names tag and station (`services/handoff.service.js` `missingPieces`).
- Second rejection of a piece → admin hold; stations refused with "Only admin can release this."
  (`util/releaseItemHold.js` `adminAssignedRefusal`, wired into all five stations).
- S2 corrects `tagColor` / `stained`, colour group follows, `items[].tagCorrections`.
- Due-today-not-at-QC list (`GET /admin/due-today-not-at-qc`) and a once-a-day admin alert at
  `dueTodayCheckHour` (`util/dueTodayCheck.js`, `crons/dueTodayCheck.js`).
- Booking windows carry `pickupFee` / `deliveryFee`; `legFee`, `resolveLeg` (incl. forced move),
  the availability list and the Urgent refund use them.
- `config/setup.js`: the batch 2 "Count dispute" rename step crashed at boot (HoldTypeModel not in scope),
  so the rename never ran; fixed.

## Verify
- `node briefCheck.js`: 566 passed.
- `batch3aStaging.js` on testingdb: 32 passed, 0 failed.
- Regression staging suites on testingdb (see the commit).
- Swagger envelope check: 0 wrong envelopes. Boot check clean.
- FE notes: `blueprint/context/FE-CHANGELOG-2026-10-15-B3A.md`.
