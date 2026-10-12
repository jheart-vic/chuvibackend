# Fix: Registration welcome SMS and schedule save

**Type:** Fix
**Status:** verified
**Branch:** `fix/registration-welcome-sms-and-schedule-save` (stacked on
`fix/quick-booking-nothing-paid-at-booking`; its PR lands after item 2's)

Launch item 6 (client item 4), `blueprint/context/LAUNCH-FIXES-2026-10-11.md`. Client
answer, 11 Oct 2026 (binding): "Send it by SMS and as an in app notification, so they see
it on their phone even before they open the app. The email can stay as it is. Please put
the SMS text in the CRM templates so I can edit it, with the system filling in their first
name and the day their offer ends."

## The problem

1. **The registration welcome is a hardcoded email** (`services/auth.service.js`, email
   and Google sign-up). There is no SMS, no in-app notice, and no template the client can
   edit. The only "welcome" template (`lead-welcome`) is for staff-entered leads, and no
   template can show when the Welcome Offer ends.
2. **The "Registered, not booked" schedule does not save.** `crm.service.updateSettings`
   reads only `leadSchedule` / `postDeliverySchedule` / `reactivationSchedule`, so
   `registeredNotBookedSchedule` is dropped and the request still returns success. The
   frontend's new schedule card believes it saves. Two more traps sit behind it:
   - `normalizeSchedule` keeps only `messageType` / `enabled` / `delayMinutes` /
     `cancelIfOrdered`. It would drop `anchor` and `preferSlot`, turning messages 2 and 3
     ("the day before the offer ends" / "the day it ends") into plain delays from sign-up.
   - Its "no two messages in the same minute" rule would refuse the default schedule:
     messages 2 and 3 both have `delayMinutes: 0`, counted from the offer's end, in
     different send windows.

## The fix

### A. Registration welcome (SMS + in-app, editable)

- **New CRM template `registration-welcome`** (new `CRM_MESSAGE_TYPE.REGISTRATION_WELCOME`).
  It's editable in CRM settings like the others, and boot seeds it when missing
  (`config/setup.js` already fills in missing template keys). New placeholder
  **`{{offerEndDay}}`**: the Lagos day the customer's Welcome Offer ends, for example
  "Friday 16 October". `{{firstName}}` / `{{name}}` work as before. Proposed default text
  (the client then edits it), using the amounts from their own messages:
  > Hello {{firstName}}, welcome to CHUVI! Your Welcome Offer is ready: book any order from
  > ₦4,000 by {{offerEndDay}} and we pick up and deliver for free. After your first wash,
  > we also add ₦1,000 to your CHUVI wallet.
  > Book here: www.chuvilaundry.com
- **Second template `registration-welcome-no-offer`.** This covers a customer who got no
  Welcome Offer (the offer is paused or missing) or whose offer has already ended. The
  welcome must never print a blank end day. Default:
  > Hello {{firstName}}, welcome to CHUVI! We pick up, clean and deliver your laundry.
  > Book here: www.chuvilaundry.com
- **Sent from `CrmService.handleUserRegistered`**, right after the Welcome Offer is granted
  (the end date is known there). Every customer sign-up path (email, Google, Apple) already
  comes through it.
  - **In-app notification:** always, at sign-up. Title "Welcome to Chuvi Laundry", body =
    the rendered template, `type: system`.
  - **SMS:** by SMS itself, not the WhatsApp-first CRM chain, because the client asked for
    SMS. Sent at once when the account has a phone (email sign-up).
  - **Google / Apple sign-ups have no phone yet.** Their SMS goes when the phone is added
    (`userService.completeProfile`), once, with the offer's end day re-read at that moment.
    If the offer has ended by then, the no-offer text is used.
  - **Once per customer:** the SMS is recorded in `CrmMessageLog` (workflow
    `registered-not-booked`, type `registration-welcome`), and a logged success is never
    resent.
  - Every step is non-fatal. A failed SMS or notice never breaks a sign-up or the phone
    step.
  - **The email stays exactly as it is.**
- **Sent immediately, not held for the 6–8 AM / 6–8 PM send windows.** ⚠️ Builder default,
  confirm with the client: the windows are for follow-up and offer messages, and the client
  wants the welcome on their phone "even before they open the app". A welcome held until
  6 PM after a 9 AM sign-up would miss that.

### B. Schedule save

- `updateSettings` accepts **`registeredNotBookedSchedule`**.
- It keeps each step's **`anchor`** (`workflow-start` | `offer-end`) and **`preferSlot`**
  (`any` | `morning` | `evening`), checks them against their enums, and keeps the
  defaults when they are absent. This applies to every schedule; the other three
  schedules are unaffected because their steps carry the defaults.
- **The stagger rule becomes anchor-aware:** two enabled steps clash only when they share
  the same anchor AND the same minute (and, for `offer-end` steps, the same send window).
  The shipped default schedule saves unchanged.
- Only valid `registered-not-booked` message types are accepted in that schedule. The
  error messages say which step is wrong, like the existing ones.
- Swagger for `PUT /api/crm/settings` gains `registeredNotBookedSchedule` and the two new
  template keys.

**Must not break:**
- the other three schedules;
- the existing templates and the `{{firstName}}` rendering;
- the registered-not-booked sequence itself (messages 1–3, day 7);
- the welcome email;
- sign-up and the Google phone step when SMS or notifications fail.

**Out of scope:** phone normalisation, the terms tick and the referral code on the Google
phone step (launch item 5).

## Build steps

1. [x] **Schedule save.** `updateSettings` saves `registeredNotBookedSchedule` with
   `anchor` / `preferSlot` kept, and staggering is anchor-aware. Swagger updated.
   **Done when:** saving the default schedule round-trips unchanged; moving message 1 to
   36 hours persists; two `workflow-start` steps in the same minute are refused; an
   unknown anchor or slot is refused; saving `leadSchedule` still works as before.
2. [x] **Welcome templates and send.** The two templates and the `{{offerEndDay}}`
   placeholder; the send from `handleUserRegistered` (in-app always, SMS when there is a
   phone); and the once-only SMS from `completeProfile`.
   **Done when:**
   - an email sign-up gets one in-app notice and one SMS naming their first name and the
     offer's end day;
   - a Google sign-up gets the in-app notice at sign-up and the SMS only when the phone is
     added, once;
   - a sign-up with no active Welcome Offer gets the no-offer text;
   - an edited template is what gets sent;
   - a failing SMS still lets sign-up and the phone step succeed.
3. [x] **Review round 1 repairs (passed with F-50..F-53).**
   - **F-50:** the phone step sets the phone only while it is still empty, in one step. A
     double-tap saves one number and sends one SMS.
   - **F-51:** `{{offerEndDay}}` names the last usable day. An offer ending before 08:00
     names the day before, the same rule as messages 2 and 3.
   - **F-52:** steps counted from the offer's end must have `delayMinutes: 0` and clash on
     the window they actually use.
   - **F-53:** the sequence is queued before the welcome is sent.

   **Done when:** briefCheck and welcomeStaging cover each one.
4. [x] **Review round 2 repair (passed with F-54 [P3]).** Only the "Registered, not
   booked" schedule may count a step from the offer's end; the other three refuse it.
   **Done when:** briefCheck covers both sides.

## Verify

- briefCheck: assertions for the anchor-aware stagger rule, `{{offerEndDay}}` rendering
  and the no-offer fallback.
- A testingdb staging script (SMS stubbed, nothing sent):
  - save and re-read the schedule;
  - email sign-up → notice + SMS once;
  - Google sign-up → notice, then the SMS at `completeProfile`, and no second SMS on a
    repeat;
  - offer paused → no-offer text;
  - SMS throws → sign-up still succeeds.
- Swagger envelope check (0 wrong). Boot on `PORT=7999`.
- **Independent review: required.** It sends SMS to real customers, which counts as an
  external side effect under `when-sensitive`.
- **Results (2026-10-12, after the round-2 repair):** briefCheck 478/0 · welcomeStaging 28/0 ·
  regNotBookedStaging 33/0.
- **Results (2026-10-12, after the round-1 repairs):** briefCheck 476/0 · `welcomeStaging.js`
  28/0 (adds the double-tap and the 01:00 offer end) · `regNotBookedStaging.js` 33/0 ·
  Swagger 0 wrong · boot on 7999 ok.
- **Results (2026-10-12, round 1):** briefCheck 471/0 (9 new) · `welcomeStaging.js` 25/0 on testingdb
  (SMS stubbed) · `regNotBookedStaging.js` 33/0 (now stubs SMS, since registering texts) ·
  Swagger 0 wrong · boot on 7999 ok (unauthenticated PUT /crm/settings → 401).
- **Known:** `seedTestCustomers.js` drives the real sign-up path, so it now also sends the
  welcome SMS to its 0700… test numbers (it already fires the real CRM workflows).

## Frontend impact (to send them)

- CRM → Settings: the "Registered, not booked" schedule now **really saves**. It didn't
  before, even though the save returned success. Send `anchor` and `preferSlot` back
  unchanged with each step. Messages 2 and 3 (`anchor: offer-end`) are placed only by
  their window (morning / evening). Their `delayMinutes` must stay 0, so don't offer a
  delay box for them.
- The Google/Apple phone step answers "Profile already completed" to a second tap.
- Two new editable templates in the same screen: **`registration-welcome`** and
  **`registration-welcome-no-offer`**, with the new placeholder `{{offerEndDay}}`.
- A new in-app notification "Welcome to Chuvi Laundry" arrives right after sign-up.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":9691,"specSha256":"a09829b12638bf196015681542a3c261bacf0ad2e657132244b5d545c00c3c92","branch":"refs/heads/fix/registration-welcome-sms-and-schedule-save","head":"1bf7add1375aa9cb2721259de82f5fc5f294b280","baseRef":"refs/heads/main","baseCommit":"ddbb3ba3876340b08ab571bdf8e8b8e8b4c633b0","sourceTree":"07ed5df4a65ba696da379a5f93a0110ef60f96c2","landing":"pull-request","absentOptional":[]} -->

## Findings

### registration-welcome-sms-and-schedule-save/F-50 [P2] closed - Two quick phone-step calls send the welcome SMS twice

**File:** services/crm.service.js:689 (with services/user.service.js:555-570)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality, security)
**Why it matters:** The once-only rule is check-then-send: `CrmMessageLogModel.exists(...)` runs, then `sendSms`, and the log row is written only after the SMS returns. `completeProfile` is also check-then-set: it reads `user.phoneNumber`, then runs an unconditional `findByIdAndUpdate`. A double-tap (or a client retry) on the Google/Apple phone step gets past both checks, fires `crmOnProfileCompleted` twice, and both calls see no logged SMS. An offline stubbed probe calling `sendRegistrationWelcome` twice at once sent 2 SMS and wrote 2 logs. If the two requests carry different numbers, each number gets a welcome and the second number overwrites the first. The spec says "a logged success is never resent". When the CRM profile is missing, nothing is logged at all (also confirmed by the probe), but `completeProfile` already refuses a second call once the phone is set, so only the race path reaches that case.
**Suggested fix:** Make the phone step atomic: `findOneAndUpdate({ _id: userId, phoneNumber: { $in: [null, ''] } }, ...)`, and fire the hook only when a document came back (otherwise return "Profile already completed"). That closes both the duplicate SMS and the number overwrite. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. `completeProfile` sets the phone with `findOneAndUpdate({ _id, phoneNumber: { $in: [null, ''] } })` and fires the welcome hook only when that update matched; otherwise it answers "Profile already completed". welcomeStaging: two parallel phone steps with different numbers → one saved, one refused, one SMS to the kept number.
Closed 2026-10-12 by /audit independent round 2: services/user.service.js:565-578 is a conditional findOneAndUpdate on an empty phone and the hook fires only when it matched; a racing second call gets "Profile already completed" and fires nothing. The check-then-send in sendRegistrationWelcome is no longer reachable twice for one user.

### registration-welcome-sms-and-schedule-save/F-51 [P2] closed - The welcome can name the day after the offer really ends

**File:** services/crm.service.js:669
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `{{offerEndDay}}` is the Lagos calendar day of the raw `expiresAt`. The offer expires `customerWindowDays × 24h` after sign-up, so anyone who signs up between 00:00 and the morning window's end (08:00) gets an expiry early in the morning. `offerEndSchedule` (util/crmSendWindow.js:131) treats that as "the offer ends the day before" and sends "today is the last day" the previous evening. The welcome still says "by Thursday 15 October" for an offer that ends at 01:00 Thursday (probe output). A customer who books on Thursday morning finds the free pickup gone, and the welcome contradicts messages 2 and 3, which arrive one day earlier.
**Suggested fix:** Use the same rule as `offerEndSchedule`. When the expiry's hour is before `sendWindows.morningEndHour`, print the previous day. Or print the last full day before the expiry instant. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. New `welcomeOfferEndDay` uses `offerEndSchedule(...).shifted` (the messages 2/3 rule): an offer ending before the morning window closes names the day before. briefCheck (01:00 Thursday → Wednesday; 15:00 Thursday → Thursday) and welcomeStaging ("by Wednesday 14 October").
Closed 2026-10-12 by /audit independent round 2: welcomeOfferEndDay (services/crm.service.js:177-181) shares offerEndSchedule's rule; offline probe (Lagos TZ) 00:00 and 07:59 Thursday -> Wednesday, 08:00 and 23:30 -> Thursday, custom morningEndHour 10 honoured.

### registration-welcome-sms-and-schedule-save/F-52 [P2] closed - Offer-end steps ignore delayMinutes, but the stagger rule and Swagger say it counts

**File:** services/crm.service.js:140 (also routes/crm.js:904, swagger/schemas.js:457)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `startRegisteredNotBookedWorkflow` (crm.service.js:460-474) places an `offer-end` step only by its slot: `morning` goes to `offerPair.third`, anything else to `offerPair.second`. It never reads `delayMinutes`. The new clash key uses `offer-end|delayMinutes|preferSlot`, so two steps that will fire at the same instant still pass validation: `any` + `evening` at minute 0, or two `evening` steps at minutes 0 and 60 (both confirmed with a probe). Swagger tells the frontend that `delayMinutes` is "Minutes … after the offer's end (offer-end)". An admin who moves message 2 to 120 gets a successful save and no change in behaviour, which is the "save reports success but does nothing" problem this fix set out to remove.
**Suggested fix:** For `offer-end` steps, key the clash on the window the step will actually use (`morning`, or `evening` for evening and any), ignoring `delayMinutes`. Say in Swagger (and in the CrmScheduleStep description) that `delayMinutes` is ignored for `offer-end` steps. Or refuse a non-zero `delayMinutes` on them. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. An offer-end step with a non-zero delayMinutes is refused, and offer-end steps clash on the window they actually use (morning, or evening for evening/any), with their own error text. Swagger (PUT /crm/settings, CrmScheduleStep) says delayMinutes must be 0 for offer-end steps. briefCheck covers both.
Closed 2026-10-12 by /audit independent round 2: services/crm.service.js:140-158 refuses non-zero delayMinutes on offer-end steps and keys the clash on morning vs evening/any, matching startRegisteredNotBookedWorkflow:482-485; probe any/morning ok, any/any and morning/morning clash, disabled duplicate ok. Swagger routes/crm.js and swagger/schemas.js updated; envelope check 0 wrong.

### registration-welcome-sms-and-schedule-save/F-53 [P3] closed - The registered-not-booked sequence now waits for the welcome SMS's network call

**File:** services/crm.service.js:625
**Found:** 2026-10-12 by /audit independent (scope: current; lens: performance)
**Why it matters:** `handleUserRegistered` awaits `sendRegistrationWelcome`, which awaits `sendSms` (an axios POST to Termii with no timeout set), before it calls `startRegisteredNotBookedWorkflow`. Errors are caught. But a provider that accepts the connection and never answers holds the hook until the OS socket timeout, and the customer's follow-up sequence is not queued for that whole time. If the process restarts in that window, the sequence is never queued at all. Sign-up itself is unaffected, because the hook is fire-and-forget.
**Suggested fix:** Start the registered-not-booked sequence before the welcome, or don't await the SMS part (fire it with its own catch). Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. `handleUserRegistered` queues the registered-not-booked sequence first and sends the welcome after it, so a slow SMS provider never delays the queueing.
Closed 2026-10-12 by /audit independent round 2: handleUserRegistered (services/crm.service.js:644-664) awaits startRegisteredNotBookedWorkflow before sendRegistrationWelcome; stubbed probe order [sequence, welcome].

### registration-welcome-sms-and-schedule-save/F-54 [P3] closed - The lead, post-delivery and reactivation schedules accept an `offer-end` anchor that only the registered-not-booked workflow understands

**File:** services/crm.service.js:129-158 (callers at services/crm.service.js:413-419, 535-546, 568-574)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `normalizeSchedule` now accepts `anchor: offer-end` in every schedule, but only `startRegisteredNotBookedWorkflow` reads `anchor`. The other three workflows treat the step as a plain delay, so an `offer-end` step there always fires at minute 0 (its delay must be 0). Its clash key is `offer-end|evening`, so it also dodges the same-minute rule: a `leadSchedule` with `lead-welcome` at 0 (workflow-start) and another step at 0 with `anchor: offer-end` saves (offline probe: "accepted"), and both messages fire at once. It is reachable only through the admin-only `PUT /api/crm/settings` with a hand-built body. The frontend never sends `offer-end` for these schedules.
**Suggested fix:** Pass the allowed anchors with the allowed types (`[WORKFLOW_START]` for the three older schedules, both anchors for `registeredNotBookedSchedule`) and refuse anything else. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. `normalizeSchedule` refuses an `offer-end` step unless the schedule's allowed types are all registered-not-booked messages, which is only true for `registeredNotBookedSchedule`. The error reads "<schedule> steps can't be counted from the offer's end: only the "Registered, not booked" messages can." briefCheck covers both sides (478/0), and the offer-end checks now pass the real type list. welcomeStaging 28/0; regNotBookedStaging 33/0.
Closed 2026-10-12 by /audit independent round 3: services/crm.service.js:133-139 refuses `offer-end` unless every allowed type is a registered-not-booked message; updateSettings (services/crm.service.js:2007-2020) passes REGISTERED_NOT_BOOKED_TYPES only for registeredNotBookedSchedule, the other three use the default SCHEDULE_TYPES. Stubbed updateSettings probe: all four shipped default schedules save and round-trip; offer-end on lead/post-delivery/reactivation (incl. a reg-not-booked type inside leadSchedule) refused with nothing saved; registered-not-booked offer-end still accepted. briefCheck 478/0.

## Independent review

**Status:** passed
**Target commit:** 1bf7add1375aa9cb2721259de82f5fc5f294b280
**Base commit:** ccabcaa0a34c44da1f118ca5d1bc6278258ab8d0
**Base ref:** origin/main
**Spec hash:** a09829b12638bf196015681542a3c261bacf0ad2e657132244b5d545c00c3c92
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-12T16:25:00Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-12T16:57:47Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `ccabcaa..1bf7add` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

Round 3. Round 2 (`c6f40f0`) passed and closed F-50..F-53, raising F-54 [P3]; `1bf7add`
repairs it (marked `fixed`). Verify it and move it to `closed` or reopen it. F-06, F-08,
F-47 [P3] belong to earlier items and are out of scope.

### Commands

- `git rev-parse HEAD` / `git merge-base origin/main HEAD` / `sha256sum blueprint/context/current-feature.md` / `git status --porcelain`: pass (1bf7add, ccabcaa, a0982...3c92, only review.md dirty)
- `git diff ccabcaa..1bf7add` (product code, briefCheck, staging scripts) and `git show 1bf7add`: reviewed
- `node briefCheck.js`: pass (478 passed, 0 failed)
- Swagger envelope check from AGENTS.md: pass (0 wrong envelopes)
- Offline stubbed probe of `CrmService.updateSettings` (getCrmSettings, save, audit log stubbed; scratchpad): pass
- Offline stubbed probe of `CrmService.sendRegistrationWelcome` (sendSms, createNotification, CrmMessageLog stubbed; scratchpad): pass

### Evidence

- F-54 repair: services/crm.service.js:133-139 refuses `offer-end` unless all allowed types are registered-not-booked; updateSettings:2007-2020 passes REGISTERED_NOT_BOOKED_TYPES only for registeredNotBookedSchedule.
- updateSettings probe: the four shipped default schedules (lead, post-delivery, reactivation, registered-not-booked) all save and round-trip messageType/delayMinutes/anchor; offer-end in lead/post-delivery/reactivation refused with nothing saved; non-RNB and welcome types refused in registeredNotBookedSchedule; disabled offer-end step with delay 60 refused.
- Welcome probe: offer → in-app + SMS naming first name and end day; second call deduped; expired offer → no-offer text; no phone → in-app only; SMS and notification failures caught and logged as failed; retry after a failed SMS sends; edited template used.
- completeProfile (services/user.service.js:565-578) is a conditional findOneAndUpdate; hook fires only for ROLE.USER on a matched update. All three registration paths in auth.service guard on ROLE.USER.
- briefCheck's offer-end checks pass the REG list (briefCheck.js:2531, 2536, 2564, 2569, 2574); the F-54 negative check uses the default list.

### Findings

- F-54 [P3] closed (repair verified).
- F-55 [P3] open (new): `preferSlot` saves on the lead/post-delivery/reactivation schedules but those workflows ignore it.
- No P0/P1 open or fixed. F-06, F-08, F-47 [P3] are earlier items, out of scope.

### Remaining risk

- Builder-reported, not rerun here (DB/boot forbidden in review): `welcomeStaging.js` 28/0 and `regNotBookedStaging.js` 33/0 on testingdb; boot on PORT=7999 ok (round 1).
- No test runner exists; briefCheck's "updateSettings saves registeredNotBookedSchedule" and F-50 checks match source text only (same class as F-06/F-08).
- Real SMS delivery (Termii) and phone-number format for the welcome SMS were not exercised; phone normalisation is launch item 5.
- The "sent immediately, not in the send windows" behaviour is a builder default awaiting client confirmation (spec).
