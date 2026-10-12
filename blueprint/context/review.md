# Independent Review

**Status:** passed
**Target commit:** c6f40f065d603f6962782e448b0912f24c2ae9d0
**Base commit:** ccabcaa0a34c44da1f118ca5d1bc6278258ab8d0
**Base ref:** origin/main
**Spec hash:** 0153dfd648d1c0673c609d71b5f2c1af2ba280b416e4d08c866cd87fae9ffc4c
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-12T16:20:00Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-12T16:05:07Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `ccabcaa..c6f40f0` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

Round 2. Round 1 (`6b393ca`) passed with F-50, F-51, F-52 [P2] and F-53 [P3]; `c6f40f0`
repairs all four (marked `fixed`). Verify each and move it to `closed` or reopen it. Item 2
is now merged into origin/main, so the merge base is `ccabcaa` and the whole delta is this
work item. F-06, F-08, F-47 [P3] belong to earlier items and are out of scope.

## Commands

- `git rev-parse HEAD` / `git merge-base origin/main HEAD` / `sha256sum blueprint/context/current-feature.md` / `git status --porcelain`: pass (c6f40f0, ccabcaa, 0153dfd6..., only review.md dirty at start)
- `git diff ccabcaa..c6f40f0` (product files, briefCheck.js, staging scripts): reviewed
- `node briefCheck.js`: pass (476 passed, 0 failed)
- Swagger envelope check from AGENTS.md: pass (wrong envelopes: 0)
- Offline stubbed probes in the scratchpad (TZ=Africa/Lagos; sendSms, createNotification, CrmSetting/CrmMessageLog/CrmProfile/Offer/CustomerOffer models and OfferService stubbed; no DB, no network): pass
- `welcomeStaging.js`, `regNotBookedStaging.js`, boot on PORT=7999: unavailable (DB/boot out of bounds for this reviewer)

## Evidence

- F-50: services/user.service.js:565-578 sets the phone with `findOneAndUpdate({ _id, phoneNumber: { $in: [null, ''] } })`, returns "Profile already completed" on no match, and fires `crmOnProfileCompleted` only after a match.
- F-51: `welcomeOfferEndDay` (services/crm.service.js:177-181) uses `offerEndSchedule(...).shifted`; probe: end 00:00 / 07:59 Thu -> "Wednesday 14 October", 08:00 / 23:30 Thu -> "Thursday 15 October", morningEndHour 10 with a 09:00 end -> Wednesday.
- F-52: services/crm.service.js:140-158 refuses non-zero delay on offer-end steps and keys the clash on morning vs evening/any, matching startRegisteredNotBookedWorkflow (482-485). Probe: any+morning ok; any+any, morning+morning clash; disabled duplicate ok. Swagger in routes/crm.js and swagger/schemas.js says delay must be 0.
- F-53: handleUserRegistered awaits the sequence (644-653) before the welcome (660-664); stubbed probe call order [sequence, welcome].
- Welcome send probe: email sign-up -> 1 notice + 1 SMS with first name and end day + 1 success log; repeat -> nothing; Google with no phone and no offer -> notice with the no-offer text, no SMS; SMS and notice both throwing -> no throw, failure logged; edited template (with `{{ offerEndDay }}` spacing) is what gets sent; handleProfileCompleted with an expired linkage -> no-offer SMS.
- Security: completeProfile stays behind `auth` (routes/users.js:1031), and the hook fires only for `ROLE.USER`. PUT /crm/settings stays admin-only. The staging scripts stub SMS, need STAGING_OK=1, and refuse laundrydb. No secrets in the delta.

## Findings

- F-50, F-51, F-52, F-53: closed
- F-54 [P3] open: non-registered-not-booked schedules accept an `offer-end` anchor that their workflows ignore, which bypasses the stagger rule (admin API only)

## Remaining risk

- Builder-reported, not rerun here: `welcomeStaging.js` 28/0 on testingdb (incl. a parallel double-tap and a 01:00 offer end), `regNotBookedStaging.js` 33/0, boot on PORT=7999 ok.
- The real Termii send and the CrmMessageLog/Notification writes against Mongo were exercised only through stubs here.
- `welcomeOfferEndDay` relies on the process TZ pin (server.js) via `offerEndSchedule`'s `getHours()`; a process without the pin would compute the shift in host time.
- The Google/Apple phone step has no OTP (unchanged, launch item 5), so the one welcome SMS goes to whatever number the customer types.
- The once-only SMS rule is still check-then-send inside `sendRegistrationWelcome`; it holds only because each user reaches it once (sign-up with a phone, or one matched phone step).
- The pending request's `Requested at` (16:20Z) is later than this receipt's real time (16:05Z); this is metadata only.
- The Audit skill's dashboard `run.json` activity write was skipped: this reviewer may write only findings.md and review.md.
