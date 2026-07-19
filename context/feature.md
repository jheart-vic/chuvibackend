# Current Feature: Phase 4 — Feedback & Recovery

Branch: `feature-feedback-recovery` (off `offer-system` @ aee9434; Phases 1–3 committed).

## What it is

The "smart satisfaction manager": collect feedback on delivered orders; when a
customer reports a problem, open a complaint CASE, run it through a status
machine to a confirmed resolution, and recover the customer. Includes the first
in-app CHAT (order-based complaint conversation, REST/polling — sockets later
in Phase 6). Ties into CRM (Complaint/Recovery-Required tags, referral pause),
Wallet (recovery credit with approval), and Offer (recovery offer trigger).

## Binding rules (client decisions)

- Customer Experience Officer OWNS all complaint cases (new ROLE
  `customer-experience` + middleware; escalation targets admin/founder).
- SLA: first review 24h, resolution 72h; overdue → auto-escalate (cron).
- Recovery credit: CX approves ≤ ₦10,000 with evidence; above needs
  Ops Manager/Founder (reuse ADMIN as the approver tier for now).
- Complaint opens → apply Complaint + Recovery-Required tags, PAUSE referral
  eligibility; customer-confirmed resolution → remove tags, restore referral.
- Feedback linked to a DELIVERED order only; complaint linked to the order.
- Complaint cannot close before recovery completed + customer confirms;
  rejected resolution reopens (→ Under Review).
- Recovery Offer only linked AFTER approval (offerOnTrigger 'recovery').

## Deliverables checklist

- [x] Constants: FEEDBACK_TYPE (satisfied/neutral/complaint), FEEDBACK_STATUS
  (pending/completed), COMPLAINT_STATUS (submitted→under-review→awaiting-item→
  item-received→recovery-in-progress→ready→resolved→customer-confirmed +
  reopened + closed), RECOVERY_ACTION (rewash/rework/repair/replace/compensate),
  RECOVERY_CREDIT_STATUS (pending-approval/approved/rejected),
  ESCALATION_REASON, CONVERSATION_TYPE (complaint/support),
  CHAT_SENDER (customer/staff/bot/system); ROLE.CUSTOMER_EXPERIENCE;
  AUDIT category 'recovery'; NOTIFICATION types
- [x] middlewares/customerExperienceAuth.js (CX + admin), reuse adminAuth as approver
- [x] crmProfile: add referralPaused (Boolean). CrmService programmatic helpers
  applyRecoveryTags(userId) / clearRecoveryTags(userId) (tags + referralPaused)
- [x] models: feedback.model, complaintType.model, complaintCase.model,
  conversation.model, chatMessage.model
- [x] services/feedback.service — submitFeedback (satisfied/neutral/complaint),
  getFeedbackForOrder, list; opening a complaint delegates to recovery.service
- [x] services/recovery.service — openCase (tags+pause+conversation+notify CX+
  offer? no, offer only after approval), transitionStatus (guarded machine),
  addRecoveryAction, requestRecoveryCredit (approval gate by amount+role),
  approveRecoveryCredit (→ wallet recovery credit + offer recovery trigger),
  confirmResolution / rejectResolution, escalate, checkSla (cron)
- [x] services/conversation.service — complaint chat: getOrCreateForComplaint,
  postMessage (customer/staff), listMessages, markRead, auto system messages on
  status changes
- [x] controllers + routes/feedback.js at /feedback and routes/recovery.js at
  /recovery (or one module). Customer: submit feedback, my complaints, view
  case, confirm/reject resolution, chat post/list. CX: queue, review,
  transition, add action, request/approve credit, escalate. Admin: complaint
  type CRUD. Swagger on all.
- [x] crons/complaintSla.js — first-review + resolution overdue → escalate;
  required in server.js
- [x] config/setup.js: seed complaint types + feedback/recovery comm templates
- [x] Verify: lifecycle script (deliver → feedback satisfied path; feedback
  complaint → case + tags + referralPaused + conversation → transitions →
  compensate ≤10k approve → wallet credit + recovery offer trigger → confirm →
  tags cleared + referral restored; reject → reopen; SLA overdue → escalate)
  + PORT=7999 boot

## Design decisions

- One wallet path for recovery money: reuse WalletCreditService.grantCredit
  with type 'recovery' (90d default). Approval state lives on the ComplaintCase
  recoveryCredit sub-doc, credit granted only on approve.
- Conversations are separate from CommunicationLog (spec: complaint chat not
  mixed with general comms). CommunicationService still used for the OUT-of-app
  nudges (feedback request, complaint update SMS/notification).
- Feedback request scheduling (1h confirmation, 24h feedback) already exists in
  CRM post-delivery workflow — Phase 4 provides the Feedback PAGE those messages
  deep-link to (page='feedback'), and the complaint conversation (page=
  'complaint'). We do NOT duplicate the scheduler.
- Escalation = notify admins via CommunicationService + flag on case
  (escalated, escalationReason, escalatedAt). No separate manager role yet.
- referral pause is a CRM-profile flag now; Phase 5 Referral will read it.

## Who later phases expect

- Phase 5 Referral: reads crmProfile.referralPaused before rewarding.
- Phase 6 in-app bot: support conversations reuse conversation/chatMessage models.
