# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Node.js/Express backend for Chuvi Laundry (CommonJS, MongoDB via Mongoose, Node 20.x). Entry point is `server.js`. There are no tests or linters configured.

## Commands

- `npm run dev` — start with nodemon (auto-reload)
- `npm start` — start with node
- Requires a `.env` file; key variables: `PORT` (default 7000), `MONGODB_URL`, `ACCESS_TOKEN_SECRET`, `PAYSTACK_SECRET_KEY`, `NODE_ENV`

## Architecture

Layered flow: `routes/` → `controllers/` → `services/` → `models/`. Routes are mounted under `/api` via `routes/index.js`. Route path strings are centralized in `util/page-route.js`; shared enums (roles, order statuses, service types, tiers, payment methods) live in `util/constants.js` — always use these constants rather than string literals.

### Laundry pipeline / roles

Orders move through staff stages, each with its own route file, controller, service, and auth middleware:
intake-and-tag → sort-and-pretreat → wash-and-dry → press-iron → qc → rider. Roles are defined in `ROLE` in `util/constants.js`. Each stage middleware (`middlewares/*Auth.js`) wraps the base `middlewares/auth.js` (JWT from the `accessToken` cookie or a `Bearer` header) and also grants admin access; `middlewares/multiAuth.js` accepts an arbitrary role list.

### Responses and errors

- Success/failure envelopes come from `controllers/base.controller.js` / `services/base.service.js`: `{ success: true, data }` or `{ success: false, data }`.
- Operational errors are thrown as `util/appError.js` (`AppError`) and handled centrally by `controllers/error.controller.js`, which is registered last in `server.js`.

### Payments (Paystack)

- Webhook is mounted at `POST /webhook` in `server.js` **before** `express.json()` using `express.raw()` so the HMAC signature over the raw body can be verified (`util/webhook.js` → `util/webhook.handler.js`). Don't move it after body parsing.
- API-side Paystack calls live in `services/paystack.service.js` / `services/paystack.client.service.js`. Wallet and subscription billing are separate models/services (`wallet`, `walletTransaction`, `subscription`, `plan`).

### Background jobs

`crons/*.js` are node-cron jobs loaded by `require()` side effects at the top of `server.js` (expire subscriptions, reconcile Paystack, reset monthly limits, clean up cancelled subs). A new cron only runs if it is required in `server.js`.

### Startup

`server.js` starts the HTTP server first, then connects to MongoDB (`config/db.js`) and runs `config/setup.js`, which seeds default `AdminSetting` and `AdminOrderDetails` documents if missing. Rate limiting (`middlewares/rateLimiter.js`) applies to `/api` except when `NODE_ENV=development`.

### CRM

`services/crm.service.js` is the CRM engine ("smart customer notebook"): one `CrmProfile` per customer/lead (userId optional — WhatsApp/walk-in leads have no account; identity links by normalized phone). It owns stage transitions (lead → first-order → active → loyal → dormant → reactivated), automatic tags, and three workflows (lead nurture, post-delivery, reactivation) driven by a DB-backed queue (`CrmScheduledMessage`) processed by `crons/crmDispatcher.js`; `crons/crmDormancyScan.js` and `crons/crmBroadcasts.js` handle dormancy and broadcast lists. Order/auth services call in only through `util/crmHooks.js` — fire-and-forget, must never break the calling flow. Message delivery (`services/crmMessenger.service.js`) tries the WhatsApp bot (separate repo, `crm-message` event via `CHATBOT_NOTIFY_URL`), then SMS, then email; the bot registers leads via `POST /api/crm/internal/lead` with the `x-bot-secret` header. Templates/thresholds live in the single `CrmSetting` document (seeded in `config/setup.js`, admin-editable). CRM routes are two-tier: staff endpoints use `intakeUserAuth` (intake-and-tag + admin), metrics/broadcasts/settings use `adminAuth`. Backfill from existing data: `node crmBackfill.js`.

### API docs

Swagger UI is set up in `swagger/swagger.js`; endpoint documentation is written as `@swagger` JSDoc comments directly in the `routes/*.js` files, with shared schemas in `swagger/schemas.js`. Keep these comments up to date when changing route contracts.
