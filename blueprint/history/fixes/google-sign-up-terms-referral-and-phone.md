# Fix: Google sign-up terms, referral code and phone

**Type:** Fix
**Status:** verified
**Branch:** fix/google-sign-up-terms-referral-and-phone

Launch item 5 (client item 5, `blueprint/context/LAUNCH-FIXES-2026-10-11.md`).

## The problem

People who sign up with Google (or Apple) never tick the Terms and Conditions, because that tick box
is only on the email form. After Google sign-in, the app asks for a phone number through
`PATCH /api/users/complete-profile` (`userService.completeProfile`). That step:

- stores the phone exactly as typed. The email form stores `normalizePhone(...)` ("one stored phone
  format everywhere", brief 4.6), so a Google user who types "+234 803…" or "803…" doesn't match the
  same number on their orders or CRM profile;
- takes no terms tick, and nothing records that anyone accepted the terms;
- takes no referral code. The client wants "Referral code (optional)" on this step, pre-filled from a
  rep's link.

The client's rule for codes (verbatim): "If they skip the code … they can still enter it later in
Refer & Earn, any time before their first order. After the first order, no code can be added and the
order is not linked to anybody." `applyCode` and `captureReferral` already enforce "before the first
order" (`ReferralService.hasPlacedOrder`), so that part needs no change.

## The fix

In `userService.completeProfile`:

1. **Phone:** store `normalizePhone(phoneNumber)`. Refuse a number that doesn't normalise to 11
   digits: "Enter a valid phone number, e.g. 0803 123 4567." Shared numbers stay allowed (no
   uniqueness check), the same as the email form.
2. **Terms: recorded, not required** (user decision 2026-10-13). The tick box is the app's job. When the
   body sends `termsAccepted: true` (boolean `true` or the string `"true"`), store `termsAccepted: true` and `termsAcceptedAt` (new
   optional fields on the user: a Boolean, default false, and a Date) in the same atomic update as the phone. Without it the step still
   succeeds, so the backend never blocks Google sign-ups before the app update ships.
3. **Referral code (optional):** `referralCode` in the body.
   - Checked BEFORE anything is saved. An unknown code, or the customer's own code, is refused:
     "That referral code doesn't exist. Check it, or leave it empty and add it later in Refer &
     Earn." The customer can correct it or clear it, and nothing half-saves. (User decision
     2026-10-13: refuse and show the message. Today `captureReferral` drops an unknown code silently,
     so a customer who mistypes a rep's code would never know they weren't linked.)
   - After the phone is saved, the code is captured through `ReferralService.captureReferral`
     (source `code`). If they're already linked (for example from the rep's link at Google sign-in),
     the existing link stands and the phone step still succeeds. A failure here is logged and never
     fails the phone step.
4. **Email sign-up:** if the email form sends `termsAccepted: true`, `register` (`createUser`) stores
   `termsAccepted` + `termsAcceptedAt` too, so both paths record it. Not required there, so the current form keeps
   working.

Must not break:
- the one-time welcome SMS on this step (item 6, `crmOnProfileCompleted`);
- the atomic "only while the phone is empty" update (F-50);
- the tokens in the response.

## Build steps

1. [x] **completeProfile takes the phone, terms and referral code.** Normalise and check the phone,
   record terms when sent, check the code before saving, save phone + `termsAcceptedAt` atomically, capture
   the code after. Add `termsAccepted` + `termsAcceptedAt` to the user model (and the Swagger `User` schema, which routes already referenced but which did not exist), the optional record on `register`, and
   the Swagger request/response for `PATCH /users/complete-profile` (`termsAccepted`,
   `referralCode`; the real success shape `data.{message, data, accessToken, refreshToken}`).
   **Done when:** a staging script on testingdb shows:
   - "+234 803 123 4567" → stored "08031234567";
   - `termsAccepted: true` → `termsAcceptedAt` stored; without it → phone saved, no `termsAcceptedAt`;
   - an invalid phone → refused, nothing saved;
   - unknown code → refused, nothing saved;
   - own code → refused;
   - valid code → linked, with the welcome credit when configured;
   - an already-linked customer → phone saved, link unchanged;
   - a second call → "Profile already completed".

   briefCheck passes; Swagger 0 wrong.

   **Result:** googleProfileStaging 11/0 (testingdb); briefCheck 479/0; Swagger 0 wrong, `User` schema
   present; boot on PORT=7999 OK.

## Verify

- `node googleProfileStaging.js` (testingdb) — every case above.
- `node briefCheck.js`; Swagger envelope check; boot on PORT=7999.

## Frontend impact (to send them)

- Phone step body: `{ phoneNumber, termsAccepted: true, referralCode? }`. Pre-fill `referralCode` from
  the `?ref=` in the sign-up link.
- The app enforces the "I agree to the Terms and Conditions" tick box (the backend records it, it
  doesn't refuse without it). Send `termsAccepted: true` when ticked.
- New 400 messages: the invalid-phone one and the unknown-code one. Show each under its field.
- The email form should send `termsAccepted: true` too, so every customer's acceptance is recorded.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":5335,"specSha256":"2db07f03c5526d47c31a46324adfa6e85276d631f352b5599aa7bcec29382ad5","branch":"refs/heads/fix/google-sign-up-terms-referral-and-phone","head":"997e6f8700223be41997d1237368cfb26a076f13","baseRef":"refs/heads/main","baseCommit":"d0f3cc0b02109ff4730749650e28fd28011541d0","sourceTree":"36464eac79a44f90678459f3151a82f4e78cb348","landing":"local-merge","absentOptional":[]} -->

## Findings

No finding was resolved by this fix. F-75 [P3] (a non-string referral code on the phone step is ignored instead of refused) was raised by its review and stays `open` in the live ledger: only a malformed client can send it, and the user chose to complete without it (2026-10-13).

## Independent review

**Status:** passed
**Target commit:** 997e6f8700223be41997d1237368cfb26a076f13
**Base commit:** d0f3cc0b02109ff4730749650e28fd28011541d0
**Base ref:** origin/main
**Spec hash:** 2db07f03c5526d47c31a46324adfa6e85276d631f352b5599aa7bcec29382ad5
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-13T15:30:00Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-13T15:28:00Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `d0f3cc0..997e6f8` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

Launch item 5, first review: the Google/Apple sign-up phone step (`PATCH /api/users/complete-profile`,
`userService.completeProfile`) normalises the phone, records terms (recorded, never required — a user
decision), takes an optional referral code (an unknown or own code is refused before anything is saved —
a user decision), and email sign-up (`createUser`) records terms when sent. Shared phone numbers are
allowed on purpose. Selected because it touches sign-up, personal data and referral linking.

## Commands

- `git rev-parse HEAD` / `git merge-base HEAD origin/main` / `git status --short` / `sha256sum blueprint/context/current-feature.md`: pass (HEAD 997e6f8, merge base d0f3cc0, only review.md dirty, spec hash 2db07f03... matches)
- `git diff d0f3cc0..997e6f8` (8 files, full delta read): pass
- `node briefCheck.js`: pass (479 passed, 0 failed)
- Swagger envelope check (AGENTS.md): pass (0 wrong envelopes; `User` schema present; complete-profile 200 is `data.{message, data: User, accessToken, refreshToken}`; request body lists phoneNumber, termsAccepted, referralCode)
- Module-load check (user.service, auth.service, user.model): pass
- Offline probe of `completeProfile` with stubbed UserModel/ReferralService/crmHooks (scratch dir, no DB): pass (13 cases, results below)

## Evidence

- Phone: "+234 803 123 4567", "803 123 4567", "+234 (0) 803 123 4567" all store "08031234567"; "12345", "+2348031234567890" and `{ "$ne": null }` refused before any read/write.
- Terms: `true` and `"true"` set termsAccepted + termsAcceptedAt in the same `$set` as the phone; `"yes"`/absent saves the phone only.
- Referral: unknown and own code refused with nothing saved and no SMS; " good1 " trimmed/uppercased and passed to `captureReferral`. The pre-check uses the exact lookup `captureReferral` uses (`UserModel.findOne({ referralCode: UPPER })`), so it cannot refuse a code capture would accept. `captureReferral` still enforces no-referral-after-first-order (`hasPlacedOrder`), no self-referral and one referrer (`ReferralModel.findOne` + unique-index race guard), so rules are not weakened; an already-linked customer keeps the link.
- F-50 atomic update intact: `findOneAndUpdate({ _id, phoneNumber: { $in: [null, ''] } }, { $set })`; `crmOnProfileCompleted` still fires once, only on a successful update, after referral capture.
- Injection/type confusion: phone is coerced through `normalizePhone` (string digits only); code is used only when `typeof === 'string'`; `$set` keys are server-built.
- Response: `password`, `otp*`, `resetPasswordOtp*` are `select: false`; the returned user carries no secrets. Code-existence oracle is authenticated, rate-limited and reveals no identity; codes are shared publicly by reps, so proportionate.
- `createUser` records terms only on `true`/`"true"`; register's `referralCode` was already handled and is now documented.
- Performance: one extra indexed `findOne` (unique `referralCode`) only when a code is sent.

## Findings

- F-75 [P3] open - A non-string referral code on the phone step is silently ignored instead of refused

## Remaining risk

- No test runner exists; the DB-level behaviour (referral link + welcome credit, already-linked customer, second call) rests on the builder's `googleProfileStaging.js` run (11/0), which this reviewer read but did not run by instruction.
- briefCheck has no assertions for launch item 5, so a later regression in this step would not be caught offline.
