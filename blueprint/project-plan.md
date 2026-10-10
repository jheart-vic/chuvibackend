# Project Plan - Chuvi Backend

> Seeded by `/adopt` on 2026-10-09 from the shipped code and the working context in
> `blueprint/context/summary.md`, `feature.md`, `session.md`, and
> `chuvi-program-plan.md`. Lines marked `> TODO (confirm)` are inferences for you to
> correct. Binding client decisions stay in `summary.md`; this plan points to them
> rather than copying them.

## 1. Problem - What problem are we solving?

Chuvi Laundry runs a pickup-and-delivery laundry business in Lagos. Orders pass
through several physical stations, are paid in several ways (card, wallet, bank
transfer, subscription), and the business has to keep customers coming back. This
backend is the single system that books, prices, tracks, bills, and follows up
every order, and gives staff and admins one source of truth for the floor, the
money, and the customer relationship.

## 2. Users - Who is this for?

- **Customers** (`user`) - book and pay for laundry, track orders, use wallet,
  subscriptions, offers and referrals, raise complaints, chat with the assistant.
- **Station staff** - `intake-and-tag`, `sort-and-pretreat`, `wash-and-dry`,
  `press`, `qc`, `rider`. Each sees and moves only its own stage.
- **Customer Experience officer** (`customer-experience`) - owns complaint cases,
  recovery, and human handoff from the bot.
- **Admin / founder** (`admin`) - settings, pricing, offers, CRM, reports, approvals,
  and access to every station.
- **Frontend team** (separate repo) - consumes this API through Swagger at `/api-docs`.
- **WhatsApp bot** (separate repo) - registers leads and receives CRM messages.

## 3. Features - What does the MVP need?

Already shipped:

- Customer accounts: email, Google and Apple sign-in, OTP, addresses, phone normalisation
- Order booking and pricing: service types, tiers, delivery speeds, capacity, item
  pricing, item sets, Quick Booking, booking windows and Anytime slots, order editing
- Staff laundry pipeline: intake-and-tag, sort and pretreat, wash and dry, press,
  QC, rider dispatch, station handoffs, item-level holds with SLAs
- Payments: Paystack card and webhook, wallet, bank transfer and counter payment,
  payment holds, cancellation fees and refunds
- Subscriptions and plans: monthly item limits, weekly free pickup/delivery allowance
- Admin panel APIs: settings, dashboard metrics, display names, hubs, staff,
  expenses, supplies, search, audit log, wallet adjustment approvals
- CRM "smart customer notebook": stages, tags, nurture/post-delivery/reactivation
  workflows, broadcasts, registered-not-booked sequence, monthly lead reporting
- Wallet and Credit: typed reward credit sub-balances with expiry
- Communication layer: templates, in-app notification and SMS delivery, delivery log
- Offer System: offer builder, multi-trigger targeting, booking-time validation and pricing
- Feedback and Recovery: feedback, complaint cases, SLA escalation, recovery orders
  and credits, in-app complaint chat
- Referral with advocacy levels
- In-app assistant bot: LLM intent classification, deterministic actions behind
  confirm steps, human handoff, WebSockets

Planned next: see `build-plan.md` (the four-system program, recurring offers,
WhatsApp reconnection).

> TODO (confirm): whether the approved voice + multilingual bot plan (LiveKit +
> Spitch, four backend endpoints) belongs in this build plan, and where.

## 4. Data - What are we storing?

MongoDB collections (Mongoose models in `models/`): users, staff and hubs, book
orders with items and stage history, order items and item sets, payments, wallets,
wallet transactions, wallet credits and adjustment requests, plans and
subscriptions, CRM profiles with scheduled messages, logs and settings,
communication templates and logs, notifications, offers and customer offers,
feedback, complaint cases and types, conversations and chat messages, referrals and
referral stats, reward settings, admin settings, booking windows and window
deflections, hold types, cancellation requests, expenses and supplies, audit logs.

## 5. Tech - What stack are we using?

- Node.js 20.x, Express 4, CommonJS, npm
- MongoDB with Mongoose 8 (no transactions; atomic guards plus compensating updates)
- Paystack for card payments and subscriptions; Termii SMS; Nodemailer email
- Cloudinary with Multer for uploads
- socket.io for real-time chat
- node-cron jobs, all pinned to Africa/Lagos time
- OpenAI (current) or Anthropic for the bot's intent and small-talk layer
- Swagger (swagger-jsdoc and swagger-ui-express) for API docs

## 6. Monetize - How will this make money?

Chuvi earns from per-order laundry charges (service type, tier, speed surcharges,
pickup and delivery fees) and from monthly subscription plans billed through
Paystack. Development is paid per agreed client package.

## 7. UI/UX - How should this look and feel?

Backend only. The customer app, staff station apps, and admin panel live in the
frontend team's repo. The API contract is Swagger, with real example shapes for
every route. The bot replies in plain, warm language and never invents data.

## 8. Deployment - Where and how will this ship?

- Host: Render web service, deployed from `main`
  (`https://chuvibackend-n0zh.onrender.com/api`).
- Start command: `npm start` (`node server.js`). No build step.
- Env vars: `PORT`, `MONGODB_URL`, `ACCESS_TOKEN_SECRET`, `PAYSTACK_SECRET_KEY`,
  `NODE_ENV`, `TZ_OVERRIDE` (optional), `BOT_PROVIDER`, `OPENAI_API_KEY`,
  `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, `BOT_MODEL`, `BOT_STYLE_REPLIES`,
  `CHATBOT_NOTIFY_URL`, plus SMS, email, and Cloudinary keys.
- Crons run in-process (required at the top of `server.js`).
- Paystack webhook: `POST /webhook` (raw body, before `express.json()`).

> TODO (confirm): health check path, and the exact SMS, email, and Cloudinary env
> var names to list here.

## 9. Usage model and constraints (optional)

- Single business (Chuvi Laundry), Lagos only, internet-facing API.
- Money paths (wallet, credits, refunds, payments) must be verified end-to-end
  with throwaway scripts against the dev DB before shipping.
- Every manual money or status correction records a reason and an audit log entry.
- Data migrations are additive only; existing records are never reset.
