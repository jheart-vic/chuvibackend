# Current Feature: Phase 5 — Referral System

Branch: `feature-referral` (off `feature-feedback-recovery` @ 5d80b2e; Phases 1–4 committed).

## What it is

The "smart recommendation tracker": every customer gets one permanent referral
code + link; referrals are tracked to the referred customer's first COMPLETED
order, then the referrer is rewarded. Thin phase — mostly glue over existing
wallet/CRM/order hooks.

## Binding rules (client decisions)

- One unique referral code per customer, for life (staff can reset).
- Referral link contains the code.
- One referrer per referred customer; no self-referral; duplicates prevented.
- Reward released ONLY after the referred customer's first COMPLETED (delivered)
  order. Cancelled orders never qualify.
- Referrer reward = configurable % of the referred customer's first order value
  (RewardSetting.referralRewardPercent, default 5%), capped by
  referralRewardMax (optional) and referralMonthlyCap (optional, off by default).
- Referred customer gets a configurable welcome reward (wallet credit).
- Referral eligibility is paused while the referrer has an unresolved complaint
  (crmProfile.referralPaused from Phase 4) — defer the reward, grant on restore.

## Design decisions

- Reward is a computed PERCENTAGE of a dynamic order → referral.service computes
  the amount and grants a `referral` wallet credit directly (45d), NOT an Offer
  Builder benefit (offers apply to the recipient's own booking; this is
  standalone credit to the referrer). sourceRef `referral-<referralId>` dedupes.
- Welcome reward = configurable `promotional` wallet credit (30d) to the
  referred customer on successful capture. RewardSetting.referralWelcomeAmount
  (default 0 = disabled). sourceRef `referral-welcome-<referralId>`.
- referralPaused gate: if referrer paused at grant time → status COMPLETED,
  rewardStatus 'deferred'; RecoveryService.confirmResolution fires
  referralOnEligibilityRestored(userId) → processDeferredRewards grants them.
- Code stored on User.referralCode, generated lazily everywhere it's needed
  (registration + first page access) so existing users are covered without a
  migration. Format: CHUVI + 6 base36 chars, uniqueness-checked.

## Deliverables checklist

- [x] Constants: REFERRAL_STATUS (pending/registered/first-order/completed/
  rewarded), REFERRAL_SOURCE (code/link), REFERRAL_REWARD_STATUS
  (none/deferred/granted). (referral credit type + source already exist.)
- [x] RewardSetting: referralWelcomeAmount (default 0). (percent/max/monthlyCap
  already exist.)
- [x] User model: referralCode (String, unique sparse)
- [x] models/referral.model.js — referrerId, referredUserId (unique), code,
  source, status, firstOrderId, firstOrderDate, rewardStatus, rewardAmount,
  rewardCreditId, welcomeCreditId
- [x] services/referral.service.js — ensureCode(user), getOrCreateCode(userId),
  buildLink(code), captureReferral({referredUserId, code, source}),
  handleReferredOrderCreated(order), handleReferredOrderDelivered(order),
  computeReward(amount), processDeferredRewards(referrerUserId),
  getReferralPage(userId), resetCode(userId)
- [x] util/referralHooks.js — referralOnUserRegistered(user),
  referralOnReferralCode(referredUserId, code), referralOnOrderCreated(order),
  referralOnOrderDelivered(order), referralOnEligibilityRestored(userId)
- [x] Wire: auth.service createUser (×3 paths) → ensure code + capture if
  req.body.referralCode; bookOrder/intake order-created →
  referralOnOrderCreated; the 3 delivered sites → referralOnOrderDelivered;
  recovery.confirmResolution → referralOnEligibilityRestored
- [x] routes/referral.js at /referral (user: my page, apply-code, history;
  staff: reset-code) + controller + swagger + page-route consts + mount
- [x] Verify: lifecycle script (code gen + uniqueness; capture + welcome credit;
  self-referral/dup blocked; order-created→first-order; delivered→completed→
  reward % to referrer w/ cap; deferred when paused then released on restore;
  page stats) + PORT=7999 boot

## Enhancement (2026-07-19): Advocacy Levels — DONE (uncommitted)

Client "Option A" (final): PERMANENT levels (Member/Promoter/Ambassador/Champion)
earned by lifetime successful referrals, never demoted → permanent reward % +
exclusive offer. Only the MONTHLY free-laundry perk is activity-gated
(granted the month the monthly target is met, paused otherwise, auto-restored).

- [x] constants: REFERRAL_LEVEL + OFFER_TRIGGER.LEVEL_{PROMOTER,AMBASSADOR,CHAMPION}
- [x] rewardSetting.referralLevels (subdoc + DEFAULT ladder) + backfill in config/setup
- [x] referral.model: rewardedAt; new models/referralStats.model.js
- [x] Seeded templates referral-level-up, referral-monthly-benefit
- [x] referral.service: level-aware computeReward; recomputeLevel/onLevelUp/
  maybeGrantMonthlyPerk/getLevelSummary; called after each grant + on page load;
  getReferralPage returns `level` block
- [x] swagger ReferralLevel schema + level on ReferralPage
- [x] Verify: 22-check script (climb thresholds, level-aware %, monthly perk
  grant/idempotency, permanent-on-miss + perk pause, page block) + PORT=7999 boot
- No cron (monthly counts derived from rewardedAt; perks deduped by key +
  credit sourceRef). No wallet/offer engine changes.

## Who later phases expect

- Phase 6 in-app bot: referral tools (get my code/link, referral status, current
  level/benefits) call referral.service.
