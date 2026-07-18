# Current Feature: Phase 2 — Communication Layer

Branch: `feature-wallet-credits` (continue here or branch `feature-communication` off it — Phase 1 is committed at e0fca80).

## What it is

The "smart messenger" from the client's spec: other systems decide WHO/WHEN,
this layer only delivers (in-app notification + SMS; WhatsApp joins later via
the same facade), uses admin-approved templates, and records every delivery.

## Deliverables checklist

- [x] Constants: COMM_CHANNEL, COMM_STATUS, COMM_SOURCE_SYSTEM in util/constants.js (+ exports)
- [x] models/template.model.js — key(unique), name, title, body ({{placeholders}}: {{name}}, {{firstName}}, plus arbitrary data keys), smsBody?, channels[], active, timestamps
- [x] models/communicationLog.model.js — userId, messageType, sourceSystem, relatedRef(ObjectId, no ref), relatedModel(String)?, channel, status(pending→sent→delivered→read→failed), content{title,body}, notificationId?, error?, retryCount; index {userId, createdAt}, {status}
- [x] notification.model.js + util/createNotification.js: add `page` (String) + `recordId` (String) deep-link fields (additive)
- [x] services/communication.service.js — send(), renderTemplate(), retryFailed(), getLogs(); in-app always unless channels says otherwise; SMS only when requested and phone exists (user lookup); failures logged never thrown (fire-and-forget philosophy)
- [x] notification.service.js: when a notification is marked read (both paths), set linked CommunicationLog status='read'
- [x] routes/communication.js + controller: adminAuth template CRUD (list/create/update/toggle), admin logs listing with filters (userId, sourceSystem, status, date range, pagination); mounted in routes/index.js at /communication; ROUTE_* constants in util/page-route.js; swagger JSDoc
- [x] config/setup.js: seed starter templates (e.g. offer-available, referral-reward, complaint-update, generic-announcement) — skip if key exists
- [x] Verify: lifecycle script (send with template → notification created w/ deep link → log sent; sms failure → status failed + retry; mark notification read → log read), then PORT=7999 boot

## Design decisions

- CRM's messenger (crmMessenger.service + CrmSetting templates) is NOT migrated
  in this phase — it keeps working as-is; migration happens when convenient.
- SMS via existing util/sendSms.js; an SMS send failure marks that log entry
  failed (retryable), it does NOT reject the whole send.
- Templates render {{name}}/{{firstName}} from the user doc + any caller data.
- Delivery status: in-app "delivered" = notification doc created; "read" comes
  from the notification read hooks. SMS stops at "sent" (Termii DLR webhook is
  out of scope this phase).

## Who calls this later (don't break these expectations)

- Phase 3 Offer System: "offer assigned" notifications with page='offers'.
- Phase 4 Recovery: complaint updates with page='complaint', recordId=caseId.
- Phase 5 Referral: reward notifications with page='referrals'.
- Phase 6 in-app bot + WhatsApp: an extra channel behind the same facade.
