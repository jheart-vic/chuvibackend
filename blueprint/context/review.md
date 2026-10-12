# Independent Review

**Status:** passed
**Target commit:** 6b393ca6653b12ddbeae4ad6b45f95300c7535fc
**Base commit:** 502dc0f0f38dc0ebdea5bec7878e066af9ee31c2
**Base ref:** origin/main
**Spec hash:** c2208754b9b583a7d6a21dace7daa39fe41380b5c2ccd6eea024881c9057d16c
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-12T16:40:00Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-12T15:34:18Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `502dc0f..6b393ca` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

Round 1. This branch is stacked: `502dc0f..ccabcaa` is launch item 2 (already reviewed
and archived in `blueprint/history/fixes/quick-booking-nothing-paid-at-booking.md`), so
this work item is `ccabcaa..6b393ca` — focus the review there. Open ledger entries F-06,
F-08, F-47 [P3] belong to earlier items and are not in scope.

## Commands

- `git rev-parse HEAD` / `git merge-base origin/main HEAD` / `sha256sum blueprint/context/current-feature.md` / `git status --porcelain`: pass (6b393ca…, 502dc0f…, c2208754…; only review.md dirty)
- `git diff ccabcaa 6b393ca`: reviewed (13 files; product code in services/crm.service.js, services/crmMessenger.service.js, services/user.service.js, util/crmHooks.js, util/constants.js, models/crmSetting.model.js, routes/crm.js, swagger/schemas.js, briefCheck.js)
- `node briefCheck.js`: pass (471 passed, 0 failed; 9 new launch-fix-6 assertions)
- Module load check (`require('./services/user.service')` then crmHooks/crm.service exports): pass (no circular-require breakage)
- Swagger envelope check from AGENTS.md: pass (0 wrong envelopes); PUT /crm/settings has `registeredNotBookedSchedule`, and CrmScheduleStep has `anchor`/`preferSlot` enums
- Offline stubbed probe (scratchpad; sendSms/createNotification/getCrmSettings/CrmMessageLog stubbed, no DB, no network): ran. Two concurrent `sendRegistrationWelcome` calls → 2 SMS (F-50). No profile, two sequential calls → 2 SMS with nothing logged. A 01:00 expiry prints that same day (F-51). Offer-end `any`+`evening` at minute 0, and `evening` at 0 and 60, both pass the stagger rule (F-52). Default lead/post-delivery/reactivation/registered-not-booked schedules all normalize without error, and older steps default to `workflow-start`/`any`

## Evidence

- `normalizeSchedule` (services/crm.service.js:110-160): validates type, delay ≥ 0, anchor and slot enums with defaults. The welcome types are excluded from every schedule (SCHEDULE_TYPES), and registeredNotBookedSchedule is limited to the four reg-not-booked types. `scheduleStepSchema` already persists anchor/preferSlot, so a save round-trips
- `sendRegistrationWelcome` sends only to `user.phoneNumber` of the registering or completing account. Every step is try/caught, and the hook wrapper `.catch`es, so sign-up and `completeProfile` cannot throw from it. `completeProfile` fires only for `userType === ROLE.USER`
- The welcome bypasses `scheduleMessages`/send windows (sent immediately, as the spec says). The registered-not-booked scheduling path is unchanged apart from now running after the welcome (F-53)
- No CRM metric or report counts CrmMessageLog by workflow: the only readers are the profile timeline (crm.service.js:1182) and profileMerge counts/moves. So welcome rows under `registered-not-booked` skew nothing
- `renderTemplate` gains an optional third arg, so existing callers are unchanged. Template keys validate against CRM_MESSAGE_TYPE, so the two new keys are editable, and config/setup.js seeds missing keys
- The request's `Requested at` (16:40Z) is later than this review's real UTC time (15:34Z). The target, base and spec hash all match, so this is metadata only

## Findings

- F-50 [P2] open: concurrent phone-step calls send the welcome SMS twice (services/crm.service.js:689, services/user.service.js:555-570)
- F-51 [P2] open: `{{offerEndDay}}` names the expiry's calendar day even for a before-08:00 expiry, one day after the "last day" message (services/crm.service.js:669)
- F-52 [P2] open: offer-end steps ignore delayMinutes, but the stagger key and Swagger treat it as meaningful (services/crm.service.js:140, routes/crm.js:904)
- F-53 [P3] open: the registered-not-booked sequence waits on an untimed SMS call (services/crm.service.js:625)
- No P0/P1. Pre-existing F-06, F-08 and F-47 were not re-examined (out of scope)

## Remaining risk

- Builder-reported, not rerun here (DB/server boundary): `welcomeStaging.js` 25/0 on testingdb (SMS stubbed), `regNotBookedStaging.js` 33/0, boot on PORT=7999 (unauthenticated PUT /crm/settings → 401)
- No test runner. The welcome send, once-only logic and `handleProfileCompleted` offer lookup have no offline behavioural cover. briefCheck covers only `normalizeSchedule`, rendering and a source-text regex for the updateSettings wiring
- No real Termii send was verified (phone formatting, SMS length/encoding of ₦ and the multi-line default text)
- Email sign-up phones are unverified, so any sign-up can send one welcome SMS to any number. Per-phone dedupe (the profile is matched by phone) limits it to once per number
- The window exemption (welcome sent immediately) is a builder default awaiting client confirmation, per the spec
- `seedTestCustomers.js` now sends real welcome SMS to its test numbers (noted in the spec)
