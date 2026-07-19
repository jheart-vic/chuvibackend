# CHUVI Backend — Program Summary

Big picture of everything agreed and built beyond what CLAUDE.md documents.
Keep this updated when a phase lands or a client decision changes.

## Where this came from

The CRM ("smart customer notebook") shipped first (see CLAUDE.md → CRM). The
client then spec'd five new systems, all backend-first (the WhatsApp chatbot in
`Desktop/Desktop/chatbot` reconnects LATER as a thin channel — do not build bot
features now): **Offer System, Feedback & Recovery, Referral, Communication,
Wallet & Credit**. In-app chat + an in-app bot (agent living in THIS backend,
not the bot repo) are part of the plan.

## Agreed build order (₦600k budget, phased)

1. ✅ **Wallet & Credit** — reward credit sub-balances inside the existing wallet
2. ⏳ **Communication layer** — one delivery pipe (in-app notification + SMS), admin templates, delivery log
3. **Offer System** — Offer Builder (admin CRUD), CRM-event triggers, booking-time validation/pricing
4. **Feedback & Recovery** — feedback records, complaint cases + status machine, CX role, SLA escalation cron, in-app complaint chat (REST/polling first, sockets later)
5. **Referral** — codes/links, tracked to first completed order, % reward via Offer System
6. **In-app bot** — agent service inside this backend (tools over services), bot↔human handover
7. **WhatsApp reconnection** — separate budget, later

## Client's final decisions (binding)

- **Stacking**: baseline benefits always apply; max ONE personal offer per order; promos don't combine with personal offers unless a per-offer admin flag (`stackableWithPersonal`) allows it. Default: one promo per order.
- **Credit expiry defaults** (per-offer overridable): referral 45d, recovery 90d, promotional 30d. (We set laundry 90d.)
- **Complaints**: Customer Experience Officer owns all cases (new ROLE needed); first review 24h, resolution 72h; overdue auto-escalates to Ops Manager/Founder.
- **Recovery credit approval**: CX officer ≤ ₦10,000 with evidence; above needs Ops Manager/Founder. Threshold configurable.
- **Referral**: reward = configurable % of referred customer's first COMPLETED order (released only then); referred customer gets configurable welcome reward; no monthly cap by default but an admin-configurable cap field must exist.

## Key architecture rules

- Follow the repo's layered pattern exactly: routes → controllers → services → models; enums in `util/constants.js`; route strings in `util/page-route.js`; swagger JSDoc on every route; seeds in `config/setup.js`; crons required in `server.js`.
- No mongo transactions anywhere — use per-document atomic guards + compensating updates (see walletCredit.service).
- Money paths must be verified end-to-end with throwaway scripts against the dev DB (no test suite exists). Scripts create synthetic users and clean up after themselves.
- Systems talk through fire-and-forget hooks (pattern: `util/crmHooks.js`) — a downstream failure must never break the calling flow.
- Offers are created ONCE by staff; automated systems only LINK existing offers (never invent them). Credits only deduct permanently after order completion; cancelled orders restore credits (original expiry kept).
- **Swagger docs must show real shapes.** Model shapes live once as reusable `components.schemas` in `swagger/schemas.js` (with realistic examples + spelled-out enums); route responses `$ref` them inside the standard success envelope (`{ success, message }`) — never a bare `{ description }` or placeholder `type: object`. Errors use the shared `ErrorResponse` schema. Verify the actual response key names from the service before documenting. Full pattern in CLAUDE.md → API docs.

## Phase status

| Phase | Status | Branch/commit |
|---|---|---|
| 1. Wallet & Credit | ✅ committed | `e0fca80 wallet-credits done` |
| 2. Communication layer | ✅ committed | `8eb638b all done for communicatios` |
| 3. Offer System | ✅ committed | `aee9434 offer system done` (branch `offer-system`) |
| 4. Feedback & Recovery | ✅ committed | `5d80b2e All done for the feedback-recovery` |
| 5. Referral | ✅ built + verified (25-check script + boot), awaiting commit | branch `feature-referral` |
| 6. In-app bot | next up | — |
| 7. WhatsApp reconnection | not started | — |

### Referral quick reference (Phase 5)

- User.referralCode (permanent, one per customer, lazily generated everywhere
  it's needed). Reward is a computed % of the referred customer's first order
  → referral.service grants a `referral` wallet credit (45d) DIRECTLY (not an
  Offer benefit). Welcome reward = configurable `promotional` credit (30d) to
  the referred customer on capture (RewardSetting.referralWelcomeAmount, 0=off).
- Reward config in RewardSetting: referralRewardPercent (5), referralRewardMax
  (null), referralMonthlyCap (null), referralWelcomeAmount (0).
- Flow via util/referralHooks.js: register→ensureCode + capture-if-code (auth
  ×3 paths); order-created→first-order (bookOrder+intake); order-delivered→
  reward referrer (all 3 delivered sites); recovery.confirmResolution→
  referralOnEligibilityRestored (releases rewards deferred while referrer had
  an open complaint via crmProfile.referralPaused).
- Routes /api/referral: me (page: code/link/stats/history), history, apply-code
  (post-registration), reset-code (admin). Models: referral.model.js.

### Feedback & Recovery quick reference (Phase 4)

- New ROLE `customer-experience` + `middlewares/customerExperienceAuth.js` (+admin).
- **crmProfile.referralPaused** true while an unresolved complaint is open —
  Phase 5 Referral MUST check it before rewarding. Helpers on CrmService:
  `applyRecoveryTags(userId)` / `clearRecoveryTags(userId)`.
- Recovery money reuses WalletCreditService (type 'recovery', 90d). Approval
  gate: CX ≤ ₦10,000, admin above (RewardSetting.recoveryApprovalThreshold).
  Approved credit fires `offerOnTrigger('recovery', {userId})`.
- In-app chat models Conversation + ChatMessage (services/conversation.service)
  built here for complaint conversations — **Phase 6 in-app bot reuses them**
  (type 'support', mode 'bot'). REST/polling; sockets deferred to Phase 6.
- Routes: /api/feedback (customer: submit, my-complaints, confirm/reject, chat,
  complaint-types) + /api/recovery (CX/admin: queue, transition, actions,
  credit request/approve/reject, escalate, chat, complaint-type CRUD).
- crons/complaintSla.js hourly escalates review(24h)/resolution(72h) overdue.

### Offer System quick reference (Phase 3)

- Engine: `services/offer.service.js` (singleton); request layer:
  `services/offerApi.service.js`; routes at /api/offers (admin builder CRUD +
  performance + manual assign + linkage cancel; user my-offers / view /
  validate / attach). Models: offer.model.js, customerOffer.model.js.
- Events flow in via `util/offerHooks.js`: `offerOnTrigger(trigger, {userId,
  milestoneKey})` fired from crm.service (first-experience on lead creation,
  second-order on 1st delivery, loyalty-N every 5th, reactivation on dormancy
  scan) and `offerOnOrderDelivered(order)` at the 3 delivered sites (intake,
  rider, bookOrder) → redeems attached linkages + pays extra-laundry-credit
  into the wallet (sourceRef `offer-<linkageId>` dedupe).
- Referral phase will fire `offerOnTrigger('referral-reward', {userId,
  milestoneKey: 'referral-<referralId>'})`; Recovery phase fires
  `offerOnTrigger('recovery', ...)` after approval.
- Order cancellation must call `OfferService.releaseForOrder(orderId)` (and
  wallet reverseOrderCredits) when a cancel flow lands.

### How other systems send messages (Phase 2 API)

```js
const CommunicationService = require('./services/communication.service')
await CommunicationService.send({
  userId, templateKey: 'offer-available', data: { offerName },
  sourceSystem: 'offer', messageType: 'offer-available',
  relatedRef: customerOfferId, relatedModel: 'CustomerOffer',
})  // never throws; returns { logs }
```
Seeded template keys: offer-available, referral-reward, complaint-update,
generic-announcement. Admin endpoints under /api/communication (templates CRUD,
logs, retry-failed).

## CRM backend changes still pending (from earlier plan, separate from phases)

- `startLeadWorkflow`: stop auto-scheduling LEAD_OFFER/LEAD_CLOSE (client wants conversational offer/close via bot later; only welcome+qualify + timed reminders).
- Internal endpoints for bot: "lead replied" (pause reminders), "feedback rating" (record, auto-Complaint tag on ≤2★).
- Post-delivery T3 retention message (+7d) and subscription-intro message (3–4 orders, no complaint tags).
- Reactivation cadence + dormancy: client must still pick manual (7/7d, 21/35d) vs spec (14/28d, 30d).
- Termii `dnd` channel consideration in `util/sendSms.js`.
