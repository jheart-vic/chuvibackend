# Scope, Plan & Costing — Operations, Cost, Reporting & Learning System (v2)

> Client brief v2 received 2026-08-06. REPLACES the earlier Laundry-only Smart Book
> scope. Planning only, no code. Base price anchor: **₦800,000** (the old Laundry-only
> estimate) → this v2 re-costs upward for multi-vertical + workforce + logistics.

## What this is
A "smart business notebook + management control system." It does NOT re-collect data the
platform already has — it **consumes** existing CHUVI systems (orders, payments, wallet,
production, holds, complaints, CRM, offers, referrals, audit + the new **Logistics** and
**Workforce** systems), **adds** only the physical/financial facts the platform can't know
(stock counts, receipts, opening balances, staff-observed issues), then **calculates KPIs,
saves historical snapshots, and runs a biweekly learning loop.** Answers: did CHUVI operate
properly, what did staff do, what did it earn/spend, where did money go, what problems
occurred, what changed vs last period, what to improve next.

**Core principle: "enter information once."** If the system already knows it (e.g. "Chidi
processed 8 orders"), the form must NOT ask — it pulls it. Staff enter ONLY what the system
can't detect (station dirty, iron faulty, bags low, stock count, discrepancy reason, photo,
tomorrow availability).

## What changed vs the old (v1) Laundry-only scope
- **Multi-vertical** — everything is now scoped by **vertical** (Laundry | Logistics | Shoe
  Cleaning | Alterations | future) and a **hierarchy: CHUVI → Vertical → Hub → Station/Role →
  Staff**. Reports roll up/down that tree; the engine must NOT be built Laundry-only.
- **Workforce-aware** — Daily Staff Forms read from the Workforce System (staff identity,
  home/acting role, station, qualifications, Floor Lead) and **auto-pull** each staff's
  operational activity (orders/items/jobs/holds/rework/times). Reporting distinguishes
  **person performance vs station/role performance**.
- **Logistics-consuming** — reporting ingests Logistics records (external + **internal** jobs,
  revenue, fuel/rider/dispatcher cost, missions, distance, failed attempts) and computes
  **Logistics Contribution**. Internal ₦0-charge pickup/delivery still shows its **real
  operating cost** ("what free pickup & delivery actually costs").
- **More KPIs** (~19): adds Purchase Reconciliation Accuracy %, On-Time Logistics Completion %,
  Laundry Contribution, Logistics Contribution, etc.
- **Revenue/Wallet discipline** — revenue read from Order/Payment/Logistics only; a wallet
  top-up is cash/liability movement, NOT a sale. Preserve payment↔wallet-liability↔order-
  revenue↔refund↔credit relationships (existing architecture).

## Dependencies (important — this is a CAPSTONE)
This module sits ON TOP of other briefs and mostly CONSUMES them:
- **Platform Foundation** (Dev Brief 1) — provides the `vertical` context primitive + the
  Workforce staff-identity/acting-role/qualifications. REQUIRED before the workforce-aware
  Daily Forms + vertical reporting are meaningful. See `platform-foundation-brief.md`.
- **Logistics System** — provides logistics job/mission records the reporting consumes
  (separate build; not built here).
- **Workforce System** — staff identity, roles, acting role, qualifications, Floor Lead.
Practical approach: build this module **vertical-ready with Laundry data flowing first**;
Logistics/Workforce metrics plug into the same reporting layer as those systems come online.
So real sequencing across programs: Platform Foundation → Workforce + Logistics engines →
this Reporting/Learning capstone (or Laundry-first + wire the rest in).

## The 6 operating areas
1. **Daily Staff Forms** (+ Form Builder, version history) — role/station/vertical-assigned
   forms; auto-pull known activity; staff enter only exceptions; status not-started →
   in-progress → submitted → verified | discrepancy. 9 question types. Old forms stay linked to
   the form VERSION in force when submitted.
2. **Supplies & Inventory** — Supply Record (scoped CHUVI→vertical→hub→station), status
   available/low/out-of-stock; **Supply Usage Standards** (expected consumption per trigger);
   **Estimated Balance** = prev + purchases − expected usage; **Physical Stock Checks** compare
   estimated vs physical.
3. **Expenses & Costs** — Expense Record (scoped by vertical/hub/station or general), 12 default
   categories (admin-editable), status pending → approved|rejected (admin-direct auto-approve);
   **approved Supply Purchase auto-creates/links its Expense** ("enter once").
4. **Reporting** — Operations + Financial (Weekly P&L, Monthly Cash Flow, Basic Balance Sheet
   w/ admin opening balances) + Workforce + Logistics; filters TODAY/WEEK/MONTH/CUSTOM ×
   ALL-CHUVI/vertical/hub/station/role/staff; CHUVI-wide + per-vertical views.
5. **Report Snapshots** — freeze approved period figures; corrections make a **new version**
   (never silent overwrite); weekly/monthly/**biweekly** + prev periods for comparison.
6. **Learning & Improvement** — biweekly Learning Record (one Observation → Insight → one
   Priority → one Improvement Action → owner/review → Adopt|Modify|Reject → **System Change**
   planned→installed→**verified**). Learning History = permanent improvement memory. Links to
   Workforce (retrain/standard version) and Logistics (process change).

## Supply Request flow (unchanged shape, now vertical-scoped)
raised → assigned → purchased → received → closed (+ discrepancy). Purchase Record + Receiving
Record; system compares requested/purchased/received → discrepancy needs explanation.

## Status machines (enums in constants)
Daily Form: not-started→in-progress→submitted→verified|discrepancy · Supply: available/low/
out-of-stock · Supply Request: raised→assigned→purchased→received→closed(+discrepancy) ·
Expense: pending→approved|rejected · Improvement: planned→active→reviewed→adopted|modified|
rejected · System Change: planned→installed→verified.

## Recommended phasing (each shippable; every phase is vertical/hub/station-aware)
1. **Supplies + Requests/Purchases/Receipts + Expenses** (+ purchase→expense auto-link; 12
   seeded categories incl. Dispatcher Cost optional ₦0; vertical/hub/station scope).
2. **Daily Forms + Form Builder + Floor Lead view** (+ Workforce integration: auto-pull staff
   activity, acting role; version-linked history). Needs Workforce.
3. **Supply Usage Standards + Physical Stock Checks** (pipeline hook → per-station usage ledger).
4. **Reporting + Snapshots + Finance + Logistics cost integration** (multi-level hierarchy,
   vertical/hub/station/role/staff filters, CHUVI-wide + per-vertical, internal-logistics cost,
   contribution). Heaviest + highest-risk (accounting, no test suite → throwaway-script verify).
5. **Biweekly Learning + Improvement + System Changes + Admin Dashboard** (person-vs-station
   perf; Repeated Problem Rate %).

## Costing — re-costed from the ₦800,000 base
Base = old Laundry-only ₦800k. v2 adds multi-vertical + hierarchy + workforce integration +
logistics cost reporting. Weighted by complexity (not flat). Final naira is the client's call.

| Module | v1 base (₦) | v2 uplift (₦) | v2 total (₦) |
|---|---:|---:|---:|
| Reporting (hierarchy + vertical/hub/station/role/staff filters + CHUVI-wide & per-vertical + workforce person-vs-station + logistics metrics) | 130,000 | +100,000 | **230,000** |
| Daily Staff Form (+ Workforce auto-pull activity, acting role, version-linked) | 90,000 | +45,000 | **135,000** |
| Form Builder (no-code; + assign-to-vertical) | 120,000 | +15,000 | **135,000** |
| Supply Request + Purchase + Receive (+ vertical/hub/station scope) | 80,000 | +15,000 | **95,000** |
| Expense + Categories (+ scope + purchase auto-link) | 75,000 | +15,000 | **90,000** |
| Learning + Improvement + System Change + History (+ Workforce/Logistics links) | 75,000 | +15,000 | **90,000** |
| **Logistics cost/reporting integration (NEW — consume jobs, internal vs external, ₦0-internal cost, contribution)** | 0 | +80,000 | **80,000** |
| Supply Usage Standard (+ vertical scope) | 55,000 | +10,000 | **65,000** |
| Supply Record (+ vertical/hub/station ownership) | 45,000 | +10,000 | **55,000** |
| Report Snapshot (versioned; + multi-vertical fields) | 45,000 | +10,000 | **55,000** |
| Admin Dashboard (CHUVI-wide + per-vertical; Floor Lead view; CX feed) | 25,000 | +35,000 | **60,000** |
| Floor Lead view (scoped) | 35,000 | +5,000 | **40,000** |
| Physical Stock Check (+ vertical scope) | 25,000 | +5,000 | **30,000** |
| **TOTAL** | **800,000** | **+360,000** | **≈ ₦1,160,000** |

Rough size: **~14 models · ~95–105 endpoints · ~6 crons.** Reports + Finance + Logistics-cost
= the real weight/risk (~₦390k, 34%). Estimate assumes Platform Foundation + Workforce + a
Logistics System are provided (this module consumes them). If any isn't ready, we build
vertical-ready with Laundry first and wire the rest in (some cost shifts, not vanishes).

## Standing rules (all phases)
Layered routes→controllers→services→models · enums in constants · route strings in
page-route.js · Swagger + real component schemas · seeds in config/setup.js · crons required in
server.js · no mongo transactions (atomic guards + compensating updates) · cross-system calls =
fire-and-forget hooks · **enter once** (pull known activity) · revenue read-only from Order/
Payment/Logistics (no duplicate revenue) · wallet top-up ≠ sale · Rider separate from S1–S5 ·
Floor Lead = responsibility not a station · snapshots immutable (corrections = new version,
store resolved names at write time) · every manual correction records a reason · finance
verified end-to-end with throwaway scripts (no test suite) · **populate human-readable identity
in every response** (names, oscNumber, station/vertical names — never bare ObjectIds).

## Success KPIs (~19)
Daily-Form Completion %, Floor Compliance %, Expense Documentation %, Supply Shortage %,
Expected-vs-Physical Diff %, **Purchase Reconciliation Accuracy %**, Contribution Margin %,
Net P/L, Operating Cash Flow, **Laundry Contribution**, **Logistics Contribution**, Rework %,
Complaint %, Delivery Success %, **On-Time Logistics Completion %**, Biweekly Learning
Completion %, Improvement Actions Completed %, System Changes Verified %, **Repeated Problem
Rate %**.
