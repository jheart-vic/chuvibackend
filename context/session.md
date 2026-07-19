# Current Session Log

Update this as work progresses. Newest entries at the top of "Done this
session". When a session ends/clears, fold anything durable into summary.md.

## Session: 2026-07-19 (later still) — Phase 6 In-app Bot

### Done this session (uncommitted)

- **Phase 6 in-app bot — built + verified.** Hybrid LLM+rules assistant in THIS
  backend. Client decisions: LLM classifies intent only; low-risk actions only
  (high-risk → human handoff, structurally no workflow); provider Claude
  (`claude-haiku-4-5`); guided booking that never places the order;
  authenticated customers only; WebSockets now.
- New: services/botIntent.service.js (Claude structured tool output `{intent,
  confidence, slots}` + keyword fallback when ANTHROPIC_API_KEY unset/errors —
  never hard-fails); services/botOrchestrator.service.js (deterministic router +
  workflows over existing systems: order-status, wallet-balance, view-offers,
  referral-info incl. level, apply-referral-code, update-details phone/pickup,
  booking-guide, feedback-ack, menu, handoff); config/socket.js (socket.io on
  the HTTP server, JWT handshake, rooms user:<id>+staff:support, emitChatMessage
  non-fatal); services/botApi.service.js; controllers/bot.controller.js;
  routes/bot.js (/api/bot: message/conversation/handoff [auth]; queue/reply/close
  [customerExperienceAuth]).
- Modified: constants (BOT_INTENT + export); conversation.model (botState) +
  conversation.service (getOrCreateSupport); user.model (defaultPickupAddress);
  server.js (initSocket on httpServer; uncommented socket require); routes/index
  + page-route (bot routes); swagger/schemas (BotReply); CLAUDE.md (In-app bot
  section + env); .env (ANTHROPIC_API_KEY empty, BOT_MODEL=claude-haiku-4-5).
  Installed @anthropic-ai/sdk. socket.io was already a dependency; CHAT_SENDER.BOT
  and CONVERSATION_TYPE.SUPPORT already existed from Phase 4.
- Verified: 18-check script (each read workflow, multi-turn apply-code +
  update-details, unknown→menu, refund & complaint → handoff-never-acts, bot
  silent after handoff, no credit ever granted by bot) + PORT=7999 boot with
  sockets. NOTE: the rules fallback ordering matters — "referral code" must NOT
  match apply-code (fixed: apply needs an actual code or apply/redeem verb),
  else a stray pending botState hijacks later single-shot messages.
- Permission boundary is STRUCTURAL: high-risk actions have no intent/tool, so
  the bot can only ever hand them to a human. LLM path unused in tests (no key)
  — rules fallback exercised; set ANTHROPIC_API_KEY to enable Claude classifier.

## Session: 2026-07-19 (later) — Referral Levels enhancement

### Done this session (uncommitted)

- **Referral advocacy levels — built + verified.** Client's FINAL decision =
  Option A: levels are PERMANENT achievements (earned by lifetime successful
  referrals, never lost → permanent reward % + exclusive offer); only the
  MONTHLY free-laundry perk is activity-gated (granted in any month the monthly
  target is met, paused otherwise, auto-restored on requalify). No demotion.
- Levels: Member/Promoter/Ambassador/Champion. Default ladder (admin-editable in
  RewardSetting.referralLevels): life>=0/3/8/15, monthly>=0/2/3/5, reward
  5/7/10/15%, free-laundry ₦0/2000/5000/10000, offerTrigger level-promoter/
  ambassador/champion.
- New: `models/referralStats.model.js` (per-user snapshot: lifetime/monthly
  counts, monthKey, currentLevel, highestLevelReached, levelSince,
  lastMonthlyPerkKey). Added `rewardedAt` to referral.model (authoritative for
  monthly counting).
- constants: `REFERRAL_LEVEL` enum + 3 `OFFER_TRIGGER` values (LEVEL_*).
  rewardSetting: `referralLevels` array (+ subdoc schema + DEFAULT ladder) with
  backfill in config/setup.createRewardSettings. Seeded templates
  `referral-level-up` + `referral-monthly-benefit`.
- referral.service: level-aware `computeReward` (uses referrer's level %, +1
  prospective so the promoting referral gets the boosted rate); `rewardedAt` set
  on grant; new engine methods `getLevelConfig/levelForLifetime/levelRank/
  countLifetimeSuccessful/countMonthlySuccessful/recomputeLevel/onLevelUp/
  maybeGrantMonthlyPerk/getLevelSummary`. `recomputeLevel` called after every
  grant AND on every page load (idempotent; no cron needed — monthly counts are
  derived from rewardedAt, perks deduped by stored key + credit sourceRef).
  `getReferralPage` now returns a `level` block. Monthly perk = `laundry` credit
  via WalletCreditService, sourceRef `referral-level-laundry-<lvl>-<YYYY-MM>`.
  Exclusive offer linked once via offerOnTrigger milestoneKey `level-<lvl>`.
- swagger: added `ReferralLevel` schema + `level` on `ReferralPage`.
- Verified: 22-check script (Member start → Promoter@3/Ambassador@8/Champion@15,
  level-aware reward %, monthly perk grant + idempotency, permanent level on
  missed month + perk pause, page level block) + PORT=7999 boot. No wallet/offer
  engine changes — only calls into them. Reused offerHooks (no circular dep:
  offer.service doesn't require referral).

## Session: 2026-07-19 — Swagger response shapes for all 5 systems + wallet

### Done this session

- **Swagger examples/responses pass (uncommitted).** Frontend couldn't see the
  shape of returned data for Communication, Offer, Feedback & Recovery, Referral
  (and asked to align Wallet too). Fixed by establishing a reusable pattern:
  - Added ~20 reusable `components.schemas` to `swagger/schemas.js` with realistic
    examples + spelled-out enums: WalletCredit, WalletTransaction, OfferBenefit,
    Offer, CustomerOffer, OfferPage, OfferQuote, Referral, ReferralPage, Feedback,
    ComplaintType, RecoveryAction, RecoveryCredit, ComplaintCase, Conversation,
    ChatMessage, CommunicationTemplate, CommunicationLog, plus shared ErrorResponse.
  - Rewrote route responses to `$ref` those schemas inside the `{ success, message }`
    envelope (arrays, `{data,pagination}`, and single-object variants) across
    routes/feedback.js, recovery.js, referral.js, offer.js, communication.js, and
    pointed wallet.js placeholder `type: object` items to WalletCredit/WalletTransaction.
  - Verified each example against the real service return (e.g. submitFeedback →
    `{feedback, complaint, referralEligible}`; listMessages → `{data, pagination}`;
    approveCredit → ComplaintCase; getPerformance → `{offer, performance}`) — not assumed.
  - Codified the pattern as a standing rule in CLAUDE.md → API docs and summary.md
    (Key architecture rules) so future routes follow it.
  - "CX" = **Customer Experience Officer** (ROLE `customer-experience`), the staff
    role that owns all complaint cases in the Recovery system.

## Session: 2026-07-18 (continuing from 2026-07-15..17 planning sessions)

### Done this session

- **Phase 5 Referral System: COMPLETE (uncommitted)** on branch
  `feature-referral` (off `feature-feedback-recovery` @ 5d80b2e; Phase 4
  committed by user as `5d80b2e All done for the feedback-recovery`). All
  feature.md deliverables done. New: models/referral.model.js;
  services/referral.service.js + referralApi.service.js; util/referralHooks.js;
  controllers/referral.controller.js; routes/referral.js (/referral). Modified:
  constants (REFERRAL_* enums), user.model (referralCode unique sparse),
  rewardSetting (referralWelcomeAmount), auth.service (×3 register paths →
  ensureCode + capture-if-referralCode), bookOrder/intake/rider services
  (referralOnOrderCreated + referralOnOrderDelivered beside existing hooks),
  recovery.service (referralOnEligibilityRestored in confirmResolution),
  page-route, routes/index. Verified: 25-check script (code gen/uniqueness/
  permanence, capture + welcome credit, self-ref/dup blocked, first-order,
  delivered→10% reward w/ 45d credit, no-double-reward, max cap, deferred-when-
  paused→released-on-restore, page stats, reset) + boot. Reward is direct
  wallet credit (% of order), NOT an Offer benefit — see feature.md rationale.
- **Phase 4 Feedback & Recovery: COMPLETE (committed 5d80b2e)** on branch
  `feature-feedback-recovery` (created off `offer-system` @ aee9434 after
  clearing a months-old orphaned interactive rebase with `git rebase --quit` —
  non-destructive, HEAD untouched). Phase 3 was already committed by user as
  `aee9434 offer system done`. All feature.md deliverables done. New: models
  feedback/complaintType/complaintCase/conversation/chatMessage; services
  conversation/recovery/feedback/recoveryApi; controllers/feedback.controller;
  routes/feedback.js (/feedback) + routes/recovery.js (/recovery);
  middlewares/customerExperienceAuth; crons/complaintSla.js (hourly).
  Modified: constants (feedback/recovery/complaint/conversation enums + CX role
  + RECOVERY audit cat + notif types), crmProfile (referralPaused) + CrmService
  (applyRecoveryTags/clearRecoveryTags), rewardSetting (SLA hours + already had
  approval threshold), config/setup (seed 10 complaint types), page-route,
  routes/index, server.js. Verified: 27-check script (satisfied/complaint
  paths, CRM tags + referral pause, conversation + system msgs, status-machine
  guards, compensate auto-escalate, approval gate ≤10k CX vs >10k admin, wallet
  recovery credit + recovery offer trigger, confirm clears tags/restores
  referral + closes convo, reject→reopen, chat unread counters, SLA sweep) +
  boot + 10 complaint types seeded. NOTE: test left a stray complaint type on
  first run (DB was empty); cleaned it and re-booted so the real 10 seeded.
- **Phase 3 Offer System: COMPLETE (committed aee9434).** All feature.md
  deliverables done. New: models/offer.model.js, models/customerOffer.model.js,
  services/offer.service.js (engine), services/offerApi.service.js,
  controllers/offer.controller.js, routes/offer.js (/offers — specific paths
  registered before /:id), util/offerHooks.js, crons/offerExpiry.js (02:45).
  Modified: constants (OFFER_* enums + AUDIT_LOG_CATEGORIES.OFFER),
  crm.service.js (trigger calls at createLead / handleOrderDelivered /
  runDormancyScan), intake-user + rider + bookOrder services
  (offerOnOrderDelivered beside crmOnOrderDelivered), page-route, routes/index,
  server.js. Verified: 36-check script (triggers+dedupe, eligibility, page,
  stacking pricing incl. free-items cap, attach/redeem/release, credit payout
  w/ per-offer expiry override, expiry sweep, performance, real
  CrmService.handleOrderDelivered auto-linking) + PORT=7999 boot.
- **Phase 2 Communication layer: COMPLETE (uncommitted).** All deliverables in
  feature.md done. New files: models/template.model.js,
  models/communicationLog.model.js, services/communication.service.js (facade),
  services/communicationAdmin.service.js, controllers/communication.controller.js,
  routes/communication.js (mounted at /communication). Modified: constants
  (COMM_* + AUDIT_LOG_CATEGORIES.COMMUNICATION), notification model +
  createNotification (page/recordId deep links), notification.service (read
  receipts → CommunicationLog on all three read paths), config/setup.js (4
  seeded templates), page-route.js. Verified: 17-check script (template render,
  in-app delivery + deep link, SMS failure path without sending real SMS, retry
  accounting, read receipts, never-throws) + PORT=7999 boot. NOTE: template
  render placeholders use {{key}}; unknown keys stay literal.
- **Context folder created** (this folder) + CLAUDE.md points to it.
- **Phase 1 Wallet & Credit: COMPLETE** on branch `feature-wallet-credits`,
  committed by user as `e0fca80 wallet-credits done`. Details in summary.md
  and the commit. Verified with three throwaway scripts (in session scratchpad,
  not committed): full credit lifecycle (24 checks), real payWithWallet drive
  (mixed credit+cash, credit-only, insufficient-cash), and the
  partial-credit-then-cash-fails rollback path. All passed; synthetic data
  cleaned up.
- **Phase 2 Communication layer: STARTED.** Studied existing plumbing:
  - `util/createNotification.js` — thin create wrapper `{userId,title,body,subBody,type}`
  - `models/notification.model.js` — has `isRead`, `NOTIFICATION_TYPE` enum
  - `services/notification.service.js` — list (with unreadCount), get-one
    (auto-marks read at line ~58-61), explicit mark-read (~85-91)
  - `routes/index.js` — routers mounted under /api; new communication router
    goes here
  - SMS: `util/sendSms.js` (Termii, generic channel, works; env keys present)

### Phase 2 plan (agreed design)

1. Constants: `COMM_CHANNEL` (in-app, sms), `COMM_STATUS`
   (pending/sent/delivered/read/failed), `COMM_SOURCE_SYSTEM`
   (crm/offer/order/feedback/recovery/referral/broadcast/system).
2. `models/template.model.js` — admin-managed: key (unique), name, title,
   body (supports {{placeholders}}), smsBody optional, channels, active.
3. `models/communicationLog.model.js` — userId, messageType, sourceSystem,
   relatedRef, channel, status lifecycle, content, notificationId, error.
4. Notification model + createNotification gain deep-link fields
   (`page`, `recordId`) — additive, non-breaking.
5. `services/communication.service.js` — facade:
   `send({userId, templateKey?|title/body, data, sourceSystem, messageType,
   relatedRef, page, recordId, channels})` → render → deliver in-app (+SMS
   when asked) → log per channel. Plus `retryFailed()` and log queries.
   CRM messenger stays as-is for now (migrates later).
6. Read receipts: notification.service mark-read paths also flip the linked
   CommunicationLog to `read`.
7. Routes `routes/communication.js` mounted at `/communication`: admin template
   CRUD, admin log listing w/ filters. Swagger on everything.
8. Seed a few default templates in `config/setup.js`.
9. Verify with a lifecycle script (synthetic user, cleanup), then server boot.

### Environment notes

- User's dev server usually running on :7000 (nodemon) — boot-verify on PORT=7999.
- Verification scripts pattern: absolute requires into the repo +
  `require('<repo>/node_modules/dotenv')` (scratchpad is outside the repo tree).
