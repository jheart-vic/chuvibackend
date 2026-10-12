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
- **Results (2026-10-12):** briefCheck 471/0 (9 new) · `welcomeStaging.js` 25/0 on testingdb
  (SMS stubbed) · `regNotBookedStaging.js` 33/0 (now stubs SMS, since registering texts) ·
  Swagger 0 wrong · boot on 7999 ok (unauthenticated PUT /crm/settings → 401).
- **Known:** `seedTestCustomers.js` drives the real sign-up path, so it now also sends the
  welcome SMS to its 0700… test numbers (it already fires the real CRM workflows).

## Frontend impact (to send them)

- CRM → Settings: the "Registered, not booked" schedule now **really saves**. It didn't
  before, even though the save returned success. Send `anchor` and `preferSlot` back
  unchanged with each step.
- Two new editable templates in the same screen: **`registration-welcome`** and
  **`registration-welcome-no-offer`**, with the new placeholder `{{offerEndDay}}`.
- A new in-app notification "Welcome to Chuvi Laundry" arrives right after sign-up.
