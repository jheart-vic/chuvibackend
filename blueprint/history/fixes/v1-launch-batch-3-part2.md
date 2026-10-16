# Fix: V1 launch batch 3 part 2 — four floor features behind four switches

**Type:** Fix
**Status:** verified
**Branch:** fix/v1-batch-3-part2
**Date:** 2026-10-16

## The problem
Client list items 12, 14 (routes), 15, 16 and the revised test plan R2, R4, R6, R8 (T3, T4, T8), each behind its
own admin switch, all off; no order may get stuck or lose a piece when a switch goes on or off. Rules saved
verbatim in `blueprint/context/TEST-PLAN-REVISED-PART2-RULES.md`.

## The fix
- `util/switches.js` + `AdminSetting.v1Switches` (+ `ironOnlyAnswerMinutes`), `GET/PATCH /admin/switches`.
  Rule: a switch gates only STARTING its action; everything started can be finished with it off.
- Damage (`util/damageCase.js`): report → item hold for admin + care task (type damage); Customer informed; admin
  release gate (`AdminService.releaseItemHold`); partial delivery → follow-on order (free second trip when our
  fault).
- S2 partial receipt (`handoff.service.js`): partial reject at S1→S2 confirm when on; out of S1 the rule is "send
  every piece still at Intake and Tag" (switch-independent, so a fixed piece is never stuck).
- Routes (`util/routes.js`): push refused off the piece's route when on; S2 automatic send routes per piece; an
  off-route piece always has a next stop.
- Iron Only (`util/ironOnlyUpgrade.js`): suggestion, S1 list, upgrade with a link for the full difference
  (redelivery-fee money pattern, no payment hold), settle on every payment path + cron, expiry (cron
  `crons/ironOnlyExpiry.js`, every 5 min), decline; waiting pieces never move.
- Item fields `serviceType`, `damageCase`, `dirtySuggestion`; order `partialDelivery`, `parentOrderId`;
  `pricing.serviceChange`; care task types damage, looks-dirty.
- Swagger: tag Floor cases + /admin/switches.

## Verify
- `part2Staging.js` on testingdb: 50 passed, 0 failed (each part off / on / switched off mid-way).
- briefCheck and all regression suites (see the commit). Swagger 0 wrong, 0 dangling. Boot clean.
