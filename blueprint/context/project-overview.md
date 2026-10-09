# Chuvi Backend - Project Overview

<!-- blueprint:source-hash 467e720b7056b16e3956d89ac3eccd965ac76defe69eca828376f6e97e6fca33 -->

> Node.js/Express + MongoDB API for Chuvi Laundry (Lagos): booking, station
> pipeline, payments, wallet, CRM, offers, recovery, referral, and an in-app bot.

## Problem

Chuvi runs pickup-and-delivery laundry in Lagos. Each order crosses several
physical stations, is paid in several ways, and the business depends on repeat
customers. This backend is the one system that books, prices, tracks, bills, and
follows up every order for customers, staff, and admins.

## Users

- **Customer** (`user`) - books, pays, tracks, uses wallet, plans, offers and
  referrals, complains, chats with the bot.
- **Station staff** - `intake-and-tag`, `sort-and-pretreat`, `wash-and-dry`,
  `press`, `qc`, `rider`. Each moves only its own stage.
- **Customer Experience** (`customer-experience`) - complaint cases, recovery,
  bot handoff.
- **Admin** (`admin`) - settings, pricing, offers, CRM, reports, approvals; passes
  every station guard.
- **External consumers** - the frontend repo (via Swagger) and the WhatsApp bot
  repo (lead registration and CRM delivery).

## Usage model

- One business, Lagos only, internet-facing API. All dates are Africa/Lagos.
- Money paths are verified end-to-end with throwaway scripts against the dev DB.
- Manual money or status corrections record a reason and an audit entry.
- Migrations are additive only; existing data is never reset.

## Features

Shipped (1-14):

1. **Customer accounts** - email, Google, Apple, OTP, addresses, phone normalisation.
2. **Order booking and pricing** - types, tiers, speeds, capacity, item pricing, item sets.
3. **Staff laundry pipeline** - six stations, handoffs, item-level holds with SLAs.
4. **Payments and wallet** - Paystack card and webhook, wallet, bank transfer, counter payment.
5. **Subscriptions and plans** - monthly item limits, weekly free logistics allowance.
6. **Admin panel APIs** - settings, dashboard, display names, hubs, staff, expenses, supplies, audit.
7. **CRM** - stages, tags, nurture, post-delivery and reactivation workflows, broadcasts, lead reports.
8. **Wallet and Credit** - typed reward credits with expiry inside the wallet.
9. **Communication layer** - templates, in-app and SMS delivery, delivery log.
10. **Offer System** - builder, multi-trigger targeting, booking-time pricing.
11. **Feedback and Recovery** - complaint cases, SLA escalation, recovery orders and credits.
12. **Referral** - codes, first-order rewards, advocacy levels.
13. **In-app assistant bot** - LLM intent, deterministic confirmed actions, handoff, sockets.
14. **October 2026 brief** - 22 fixes, Quick Booking, booking windows, payment hold, order editing.

Next, in order (awaiting client sign-off):

15. **E2E platform validation** - scripted full-journey run and baseline report. **Headline next.**
16. **Workforce Command and Staff OS** - vertical context, multi-role staff, training, standards.
17. **Logistics System** - dispatch vertical: jobs, missions, pricing, reconciliation.
18. **Smart Book v2** - operations, cost, reporting and learning across verticals.
19. **Recurring offers** - scheduled offer windows and cadenced notifications (deferred).
20. **WhatsApp reconnection** - thin channel over this backend (separate budget).

## Data model

Mongoose models in `models/`. Core shapes and relationships only.

### User
- `email`, `fullName`, `phoneNumber` (normalised `0` + 10 digits), `userType` (ROLE)
- `servicePlatform` (google | apple | local), `isVerified`, `status`
- `customerCode`, `referralCode`, `addresses[]`, `defaultPickupAddress`
- has one Wallet, one CrmProfile, many BookOrders

### BookOrder (the order)
- `userId` -> User; `oscNumber` (human ID); `channel`
- `serviceType`, `serviceTier`, `deliverySpeed` - strings matched against
  `AdminSetting.serviceTypes[].name` for pricing (renames are guarded)
- `items[]` (per-item `tagId`, `currentStation`, holds), `stage.status` + history,
  `handoffs[]`
- `pickupAddress`, `deliveryAddress`, `pickupDate`, `deliveryDate`, `scheduling`
  (window, `windowWasBookableAtBooking`)
- `amount`, `deliveryAmount`, `logisticsFee`, `pricing`, `billingType`,
  `paymentMethod`, `paymentStatus`, `counterPayment`, payment waiver fields
- `isRecoveryOrder`, `recoveryForComplaintId` -> ComplaintCase

### Money
- **Wallet** - `userId`, `balance`, `currency`
- **WalletTransaction** - `type`, `amount`, `sourceSystem`, `creditType`,
  `relatedOrderId`, `balanceAfter`, `performedBy`
- **WalletCredit** - `type` (referral | recovery | promotional | laundry), `amount`,
  `remaining`, `expiresAt`, `status`, `sourceRef` (dedupe key), `usedBy[]`
- **WalletAdjustmentRequest** - role-limited manual adjustments with approval
- **Payment** - Paystack or bank transfer record, `proofOfPayment`, `verifiedBy`
- **Plan** - `price`, `monthlyLimits`, `freePickupDeliveryPerWeek`, `paystackPlanCode`
- **Subscription** - `planId`, `status`, `remainingItems`,
  `remainingPickupDeliveries`, `logisticsWeekStart` (rolling week from start date)

### CRM and messaging
- **CrmProfile** - one per customer or lead (`userId` optional, linked by
  `normalizedPhone`), `stage`, `tags[]`, `totalOrders` (delivered only),
  `lastOrderAt`, `referralPaused`, merge fields (archive, not delete)
- **CrmScheduledMessage** - DB queue processed by `crons/crmDispatcher.js`
- **CrmSetting** - single doc: templates, schedules, send windows, thresholds
- **Template**, **CommunicationLog**, **Notification** (`page`, `recordId` deep links)

### Offers, recovery, referral
- **Offer** - `type` (personal | baseline | promotional), `triggers[]` (authoritative;
  legacy `trigger` kept in sync), `benefits[]`, `rules.*`, window, `status`,
  `stackableWithPersonal`, `creditExpiryDays`
- **CustomerOffer** - `userId`, `offerId`, `status`, `milestoneKey`, `orderId`
- **Feedback** - rating, NPS, links to ComplaintCase
- **ComplaintCase** - `complaintTypeIds[]`, `status` + history, `assignedTo`,
  SLA due dates, `recoveryActions[]`, `recoveryCredit`, `conversationId`
- **Conversation** / **ChatMessage** - `type` (complaint | support), `mode`
  (bot | human), `botState` (intent, step, slots, memory)
- **Referral** - referrer, referred user, first order, reward credit;
  **ReferralStats** - lifetime and monthly counts, level; **RewardSetting** - all
  reward and SLA config

### Scheduling and operations
- **AdminSetting** - single doc: service types, charges, capacities, fees,
  working days, Anytime hours and fees, hold SLAs, display names, wallet limits
- **BookingWindow** - one window covers both legs; `limit: null` means no limit
- **WindowDeflection** - written when a full window is hidden (not derivable later)
- **HoldType**, **CancellationRequest**, **ItemSet**, **Hub**, **Staff**,
  **Expense**, **Supply**, **AuditLog**

> Locked shapes: the two-level response envelope (`data.message`), stored service
> type names on orders, WalletCredit `sourceRef` dedupe keys, and Offer `triggers[]`.

## Tech stack

- **Node.js 20 + Express 4 (CommonJS)** - API server, entry `server.js`
- **MongoDB + Mongoose 8** - data; no transactions
- **Paystack** - card payments, subscriptions, webhook at `POST /webhook`
- **socket.io** - real-time chat (rooms `user:<id>`, `staff:support`)
- **node-cron** - 14 in-process jobs in `crons/`, Lagos wall-clock
- **OpenAI or Anthropic** - bot intent classification and small talk only
- **Termii, Nodemailer, Cloudinary** - SMS, email, uploads
- **Swagger** - `/api-docs`, JSDoc in `routes/*.js`, schemas in `swagger/schemas.js`

## Monetization

Per-order charges (service, tier, speed surcharge, pickup and delivery fees) and
monthly subscription plans billed through Paystack.

## UI/UX

Backend only; frontends live in a separate repo. Main API groups under `/api`:

- `/auth`, `/users` - accounts and profile
- `/bookOrder`, `/orders` - booking, availability, editing, cancellation
- `/intake-user`, `/sort-pretreat`, `/wash-dry`, `/press-iron`, `/qc-user`, `/rider` - stations
- `/wallet`, `/subscription` - money and plans
- `/admin`, `/search`, `/reward-settings` - admin panel
- `/crm`, `/communication`, `/notifications` - CRM and messaging
- `/offers`, `/feedback`, `/recovery`, `/referral`, `/bot` - program systems
- `/public`, `/utils`, `/seeds` - public and helper routes

## Deployment

- Render web service from `main`: `https://chuvibackend-n0zh.onrender.com/api`.
- Start `npm start`; no build step. Crons run in the web process.
- `server.js` pins `TZ` to Africa/Lagos as its first statement (override only via
  `TZ_OVERRIDE`).
- Env: `PORT`, `MONGODB_URL`, `ACCESS_TOKEN_SECRET`, `PAYSTACK_SECRET_KEY`,
  `NODE_ENV`, `BOT_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`,
  `BOT_MODEL`, `BOT_STYLE_REPLIES`, `CHATBOT_NOTIFY_URL`, plus SMS, email, Cloudinary.

> TODO: health check path and the exact SMS, email, and Cloudinary env var names.

## Open questions

> Resolve these in the plans, then re-run /overview.

- Items 15-18 await client sign-off on the program plan (budget, build order,
  multi-role Q1-Q4).
- Voice + multilingual bot (LiveKit + Spitch) is an approved plan but absent from
  the build plan.
- Recurring offers and WhatsApp reconnection have no agreed position in the order.
