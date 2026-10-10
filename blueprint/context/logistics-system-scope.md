# Scope, Plan, Costing & Todos — CHUVI Logistics System

> Client brief received 2026-08-06. Planning only, no code. Base price anchor: **₦900,000**.
> A large new VERTICAL (comparable in size to the Smart Book). Sits under the Platform
> Foundation, absorbs the paused Maps+Weather feature, and feeds the Smart Book reporting.

## What it is
A **smart dispatch manager** — a SEPARATE CHUVI vertical (its own **Logistics Job**, not a
Laundry Order) that **reuses the shared systems** (customer accounts, CRM, wallet, payments,
offers, communication, AI, complaints/recovery, audit) but keeps its own operational workflow.
Answers: what does the customer need moved/done, can CHUVI accept it, how much, when, which
rider, was it completed properly.

## Two core entities
- **Logistics Job** — one permanent ID per qualified request (e.g. `LOG-000124`), traceable
  creation→completion. One request = one job (two packages = two jobs).
- **Mission** — a rider's movement executing ONE OR MORE jobs (`MIS-0045`); jobs stay
  individually traceable even when batched.

## 4 service families
Send/Deliver · Ready-Item Collection · Buy/Deliver (purchase + money reconciliation) · Simple
Errand. Each has its own required booking fields.

## Internal jobs (key concept)
Other verticals create linked internal jobs. A Laundry order's **pickup and delivery are TWO
separate internal logistics jobs**, linked to the order, **₦0 to the customer but real
operating cost recorded** — so CHUVI knows what "free pickup & delivery" actually costs. Job
Source tags origin (customer request / laundry internal / shoe-cleaning / alterations / admin).

## Mechanics
- **Qualification** before a request becomes executable + admin-managed **Item Guide**
  (accepted / restricted / prohibited).
- **Distance** = road-route where possible, **provider-replaceable** (not tied to one map API),
  manual/zone/override fallback (reason required).
- **Pricing** = admin-configurable (base + per-km + service family + extra stops + waiting +
  purchase/errand + failed attempt + special handling), **versioned** (old jobs keep their
  pricing version). Never hard-code one formula.
- **Timing** = rolling, per-service windows (food short / parcel standard / laundry wide
  batched), configurable — not forced to start on the hour.
- **Weather intelligence** (absorbs Maps+Weather feature) = interpreted labels (RAIN RISK /
  DISPATCH DELAY / GOOD OPERATING WINDOW / STORM / HARMATTAN-DUST / GOOD DRYING WINDOW), shared
  ops intelligence (also for laundry drying). Customer weather alert ONLY when it affects THEIR
  service; may offer reschedule; never auto-reschedules.
- **Payment before execution** for external jobs (reuse Paystack/wallet/transfer + offers;
  wallet-credit eligibility chuvi-wide vs logistics-only). No separate logistics payment engine.
- **Status flow:** requested → qualification → awaiting-payment → ready-for-dispatch → assigned
  → pickup-in-progress → picked-up → in-transit → delivered → completed (+ on-hold / failed-
  attempt / cancelled / incident). Final names finalized in dev.

## Three DISTINCT records
- **Failed Attempt** — reached the stage but couldn't complete (customer unavailable, wrong
  address, item not ready…). Job doesn't vanish; captures reason/rider/time/location/evidence/
  next-action.
- **Hold** — work blocked / needs correction (uses shared CHUVI Hold concept).
- **Incident** — a significant operational event happened (accident, damage, loss, money
  discrepancy). Separate from a Hold and from a Complaint (a complaint may LINK to an incident).

## Roles / surfaces
Dispatcher / **Hub Coordinator** (Hub Coordinator carries the dispatcher layer for now) — job
queue, mission building, rider assignment, decision support · **Rider** dashboard + field
execution events + proof (not a laundry-order dashboard) · CX (customer-facing exceptions only,
NOT rider stages) · Admin (config / versioning / approvals / supervision). Permission model
follows the Workforce architecture.

## Integrations (reuse, don't rebuild)
Customer booking inside the existing account + tracking + activity-history filter (All|Laundry|
Logistics|…) · CRM feed (logistics activity → one shared CRM) · Complaints use shared framework
with **logistics complaint types**; Recovery can spawn a **new linked logistics job** ·
Communication touchpoints via existing system (job confirmed / rider assigned / delivered /
failed / delay / reschedule) · AI understands logistics intent + runs booking, but **never
invents price/distance/promise/item-acceptance/compensation** · **Internal Movement API**
(vertical → logistics job → completion callback) · **Money reconciliation** for Buy/Deliver
(job can't close with unresolved money).

## Migration & scale
- **Gradual migration** from the existing Laundry Dispatch — don't remove it until the Logistics
  replacement is proven (build → test independently → laundry starts creating internal jobs →
  controlled pilot → retire/simplify old dispatch).
- **Multi-hub-ready** — start one hub, but don't hardcode single-hub (Awka/Agulu/future).
- **Rule versioning** — important rules keep history; old jobs retain what applied at creation.
- Produces **reporting SOURCE DATA**; the full reporting/finance lives in the Smart Book
  (Operations, Cost, Reporting & Learning) capstone — not here.

## Cross-links (roadmap)
- This IS the "Logistics System" the **Smart Book v2** consumes ([[chuvi-smart-book-feature]]).
- **Absorbs the paused Maps + Weather feature** (distance routing + weather intelligence are core here).
- Sits under the **Platform Foundation** (vertical context + Workforce roles for Dispatcher/
  Hub Coordinator/Rider) — see `platform-foundation-brief.md`.

---

## Costing — base ₦900,000 (weighted by complexity, not flat)
Final naira is the client's call on rate. Money/route/pricing paths = the weight + risk.

| Module | Cost (₦) |
|---|---:|
| Logistics Job core (model, IDs, 4 service families, qualification engine, status machine) | 130,000 |
| Mission + Dispatcher/Hub-Coordinator dashboard + rider assignment + decision support | 110,000 |
| Distance/routing (provider-abstracted + fallback) + Pricing engine (configurable + versioned) | 100,000 |
| Internal Movement API + Laundry Dispatch migration (linked internal jobs + callbacks + gradual retire) | 70,000 |
| Purchase & Money Reconciliation (Buy/Deliver money record + reconcile-before-close) | 65,000 |
| Rider dashboard + field execution events + proof capture | 65,000 |
| Admin config + Item Guide (accepted/restricted/prohibited) + rule versioning + hubs + opening/closing + audit/roles + reporting source data | 60,000 |
| Payment / Wallet / Offer integration (pay-before-execute, credit eligibility) | 55,000 |
| Weather Intelligence (routing+weather providers, interpreted labels, customer alerts, drying intel) | 50,000 |
| Failed Attempt + Hold + Incident (3 distinct records) | 45,000 |
| Customer booking + tracking + activity history | 45,000 |
| CRM link + AI logistics intent/booking + Communication touchpoints/templates | 45,000 |
| Complaint / Recovery link (logistics complaint types + recovery→new linked job) | 40,000 |
| Timing windows (rolling, per-service, configurable) | 20,000 |
| **TOTAL** | **₦900,000** |

Rough size: **~7–9 models · ~90–110 endpoints · ~3–4 crons** (weather sweep, overdue-job/at-risk
sweep, mission cleanup). Heaviest/riskiest: Job core + Dispatch + Distance/Pricing + Money
reconciliation ≈ ₦405k (45%).

---

## Phased plan / TODOS (durable — survives context clear)
Prereqs: Platform Foundation (vertical + Workforce roles Dispatcher/Hub-Coordinator/Rider);
keep the existing Laundry Dispatch running until the replacement is proven.

- **Phase 1 — Job core:** LogisticsJob model + IDs + 4 service families + qualification engine +
  admin Item Guide (accepted/restricted/prohibited) + status machine.
- **Phase 2 — Route/price/time/weather:** distance (provider-abstracted + fallback+reason) +
  configurable **versioned** pricing + per-service timing windows + weather intelligence
  (absorbs Maps+Weather).
- **Phase 3 — Customer + money-in:** payment-before-execute (reuse payments/wallet/offers +
  eligibility) + customer booking + tracking + activity history + AI logistics intent/booking.
- **Phase 4 — Dispatch + execution:** Mission + Dispatcher/Hub-Coordinator dashboard + rider
  assignment/decision support + Rider dashboard + execution events + Failed Attempt / Hold /
  Incident records.
- **Phase 5 — Money + internal jobs:** Purchase & Money Reconciliation (Buy/Deliver) + Internal
  Movement API + Laundry internal pickup/delivery jobs + controlled migration pilot.
- **Phase 6 — Connect + configure:** CRM feed + Complaint/Recovery link (logistics types +
  recovery job) + Communication touchpoints/templates + reporting source data + opening/closing
  checklists + admin config/versioning/hubs + audit (acting-role) + role permissions.

## Standing rules
Layered routes→controllers→services→models · enums in constants · routes in page-route.js ·
Swagger + real schemas · seeds in config/setup.js · crons required in server.js · no mongo
transactions (atomic guards + compensating updates) · cross-system calls = fire-and-forget
hooks · reuse shared Customer/Wallet/Payments/CRM/Offers/Comms/AI/Complaint systems (no
duplicates) · road-route distance, provider replaceable · pricing/timing admin-configurable +
versioned (old jobs keep their version) · external jobs pay before execution · one permanent
Job ID per request; one Mission may hold many Jobs; jobs stay individually traceable · laundry
pickup+delivery = two internal jobs linked to the order (₦0 customer, real cost tracked) · Hold
≠ Incident ≠ Complaint · money jobs reconciled before close · weather alert only when it affects
the customer's service; never auto-reschedule · AI understands intent, never makes business
decisions · migrate off Laundry Dispatch only when proven · protect existing data (additive
Mongo migration) · manual overrides record a reason · **populate human-readable identity in
responses** (names, phone, oscNumber, job/mission IDs — never bare ObjectIds).

## Success KPIs
Successful Job Completion Rate % · On-Time Completion Rate % · Failed Attempt Rate % · Avg Job
Completion Time · Jobs Per Rider · Jobs Per Mission · Internal Movement Cost · Logistics Revenue
· Logistics Contribution · Incident Rate % · Customer Complaint Rate % · Purchase Reconciliation
Accuracy % · Repeat Logistics Customer Rate %.

## Dev success tests (end-to-end, per brief)
1. Customer books → qualify → distance → price → pay → job created → dispatcher → mission →
   rider pickup → customer update → delivery → completed → payment+audit correct → visible in
   history → CRM updated → complaint can be opened → admin sees full history.
2. Laundry order → pickup internal job → rider pickup → result back to laundry → laundry
   processes → delivery internal job → rider delivers → BOTH jobs stay linked to the same order.
3. Existing systems still work after the module is added (booking/payments/wallet/CRM/offers/
   referrals/S1–S5/holds/laundry dispatch/complaints/AI/audit).
