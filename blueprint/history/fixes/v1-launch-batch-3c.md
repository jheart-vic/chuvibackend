# Fix: V1 launch batch 3c — recovery credit + the client's word list

**Type:** Fix
**Status:** verified
**Branch:** fix/v1-batch-3c
**Date:** 2026-10-16

## The problem
The client's 15 Oct answers: customer care closes a complaint with recovery credit (N5,000 per case, admin above,
90 days, one SMS in their words); and one word list for stations, statuses and history lines, used everywhere.

## The fix
- `RecoveryService.giveCredit` + `POST /recovery/cases/{id}/credit/give`; `_recoveryCreditSms` on every granted
  wallet recovery credit (the template update pinned to in-app, so ONE SMS); `recoveryApprovalThreshold` default 5000.
- `util/displayName.js` station names + role names in the client's words; 31 message lines swept (station names,
  "Urgent" not "Anytime", "care level" not "tier", "Customer Care").
- `util/statusLabel.js` `orderStatusLabel` → `statusLabel` on presentOrder, station lists (paginate withPromise),
  rider lists; S1 dispatch labels in the client's words.
- `util/historyLines.js` → `historyLines[]` on all six station timelines.
- Swagger: give-credit, statusLabel, historyLines; approve doc says N5,000.

## Verify
- `node briefCheck.js`: 566 passed (two assertions moved to the new station words).
- `batch3cStaging.js` on testingdb: 22 passed, 0 failed.
- Regression suites on testingdb (see the commit). Swagger: 0 wrong envelopes, 0 dangling refs.
- Live: the client sets "Customer experience limits N5,000" on Monday (already on their list); the default is now
  5000 for a fresh settings document.
