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
# Scope & Estimate — Operations, Cost & Learning System

> Planning doc only. Not started. Written 2026-08-01.
> The "smart business notebook": records what staff did, what supplies exist,
> what was spent/earned, what was learned, and what to improve — then reports
> and snapshots it. Backend-first, same layered pattern as Phases 1–6.

## Verdict up front

- **Size:** the single largest cohesive build in the project — roughly **70–85%
  of the entire first program (Phases 1–6) combined**. This is a second program,
  not a phase.
- **Endpoints:** **≈ 80** (realistic range 75–95).
- **New models:** **≈ 12.**
- **New crons:** **≈ 5–6.**
- **Cost anchor:** the first program was the ~₦600k phased budget (~₦100k/system
  avg). This system is ≈ 4–6× an average past phase ⇒ **≈ ₦450k–₦650k of build
  effort** in the same terms. Final naira is the client's call on their rate.
- **Where the cost/risk lives:** (1) the dynamic **Form Builder** (a mini no-code
  engine) and (2) the **finance module** (weekly P&L, monthly cash flow, basic
  balance sheet with immutable snapshots). Everything else is standard CRUD +
  read-aggregation.

## First program vs. this system

| | First program (Wallet→Bot) | Ops, Cost & Learning |
|---|---|---|
| Distinct domains | 6 systems | 1 cohesive system |
| New models | ~14 | ~12 |
| Endpoints | ~80–90 across all six | ~75–95 |
| Hardest tech | Paystack money, WebSockets, LLM | No-code form builder, real accounting |
| Delivery | Incremental, heavy reuse | One large drop unless phased |

By raw volume + domain diversity the first program is bigger; this one matches it
in scale and is harder per-line in the form-builder and finance pieces.

## Endpoint breakdown (≈ 80)

| Module | Endpoints |
|---|---|
| Form Builder (form/question CRUD, reorder, assign to station/role, toggle compulsory/active) | ~9 |
| Daily Staff Form (today's form, start, save progress, submit, my-forms, verify, mark discrepancy, admin list) | ~8 |
| Floor Lead assignment (assign, unassign, current) | ~3 |
| Supply Record (CRUD, set low-level) | ~6 |
| Supply Request + Purchase + Receive (raise, list, get, assign, record purchase, confirm received, close, discrepancy review) | ~8 |
| Supply Usage Standard (CRUD) | ~5 |
| Physical Stock Check (create, list, get) | ~3 |
| Expense Record + Categories (create, submit, approve, reject, list, get, update; category CRUD) | ~10 |
| Reports (operations, financial, weekly P&L, monthly cash flow, balance sheet, logistics, opening balances) | ~8 |
| Report Snapshot (generate, list, get, corrected version) | ~4 |
| Learning Record + Improvement Action + System Change + History | ~16 |
| Admin dashboard summary | ~2 |
| **Total** | **≈ 80** |

## Costed breakdown — ₦800,000 (weighted across ~80 endpoints)

Weighted by complexity, not flat. Flat average ≈ ₦9,750/endpoint. Cron cost is
folded into each parent module (not a separate line).

| Module | Endpoints | Cost |
|---|---:|---:|
| Reports (ops, financial, weekly P&L, cash flow, balance sheet, logistics, opening balances) | 8 | ₦130,000 |
| Form Builder (dynamic no-code engine) | 9 | ₦120,000 |
| Daily Staff Form (status machine + verify/discrepancy) | 8 | ₦90,000 |
| Supply Request + Purchase + Receive | 8 | ₦80,000 |
| Expense + Categories (approval flow) | 10 | ₦75,000 |
| Learning Record + Improvement + System Change + History | 16 | ₦75,000 |
| Supply Usage Standard (engine + pipeline hook) | 5 | ₦55,000 |
| Supply Record (CRUD + low-level) | 6 | ₦45,000 |
| Report Snapshot (immutable + corrections) | 4 | ₦45,000 |
| Floor Lead (temporary permission tier) | 3 | ₦35,000 |
| Physical Stock Check | 3 | ₦25,000 |
| Admin dashboard summary | 2 | ₦25,000 |
| **Total** | **82** | **₦800,000** |

Reports + Form Builder = ₦250k (31%) — the real weight, matching the high-risk
pieces below.

## New models (≈ 12)

FormTemplate (dynamic typed questions), DailyForm (submissions + status machine),
FloorLeadAssignment, Supply, SupplyRequest (purchase + receipt subdocs),
SupplyUsageStandard, StockCheck, Expense, ExpenseCategory, ReportSnapshot,
LearningRecord (ImprovementAction + SystemChange subdocs or refs), plus
opening-balance / balance-sheet state (may live on AdminSetting).

## Status machines (mirror the spec)

- **Daily Form:** not-started → in-progress → submitted → verified | discrepancy
- **Supply:** available / low / out-of-stock
- **Supply Request:** raised → assigned → purchased → received → closed (+ discrepancy)
- **Expense:** pending → approved | rejected (admin-direct may auto-approve)
- **Improvement Action:** planned → active → reviewed → adopted | modified | rejected
- **System Change:** planned → installed → verified

All go in `util/constants.js` as enums, never string literals.

## Crons / background jobs (≈ 5–6)

- Supply-usage deduction hooked into the production pipeline (item reaches stage →
  check usage rule → reduce estimated balance → record against station). Wired via
  a fire-and-forget hook like `util/crmHooks.js`, must never break the order flow.
- Low-supply / out-of-stock alert sweep → notify Admin + current Floor Lead.
- Weekly P&L snapshot generator.
- Biweekly Learning Record creator (blank record + attach snapshots + carry forward
  active improvements + review-date reminders).
- Monthly cash-flow rollup.
- Weekly stock-check reminder.

Each cron only runs if `require()`d in `server.js`.

## Hard / high-risk pieces (most of the cost)

1. **Form Builder = a mini no-code engine.** Admin edits forms with no developer:
   typed questions (yes/no, checkbox, number, quantity, time, short/long note,
   photo, rating), ordering, required flags, activate/disable, assign to
   station/role. Needs a schema for question types, a renderer contract for the
   frontend, and a validator that enforces required/typed answers on submit.
2. **Finance module.** Weekly P&L (revenue → variable cost → contribution → fixed
   cost → net), monthly cash flow (profit ≠ cash), and a basic balance sheet
   (assets/liabilities/owner's position) seeded by admin opening balances.
   Accounting correctness with **no test suite** ⇒ every figure verified against
   the live DB via throwaway scripts (repo rule).
3. **Read-only integration into all 6 prior systems.** Reports pull revenue from
   Orders/Payments, items from production stages, holds/complaints/feedback from
   Recovery+CRM, wallet-liability from Wallet. Rule: **no duplicate revenue** —
   revenue is read, never re-entered here.
4. **Immutable snapshots.** A saved Report Snapshot never changes when later
   records are edited; corrections create a new corrected version. Store computed
   figures at write time, don't recompute on read.
5. **Temporary Floor Lead permission tier.** Assignable/revocable extra access
   layered on top of existing station auth (`middlewares/*Auth.js` pattern);
   revoking restores plain station access. Rider stays separate from S1–S5.

## Recommended phasing (don't build as one drop)

1. **Supplies + Requests/Purchases/Receipts + Expenses** — self-contained, immediate
   operational value.
2. **Daily Forms + Form Builder + Floor Lead** — the dynamic engine + staff workflow.
3. **Supply Usage Standards + Stock Checks** — hooks into the production pipeline.
4. **Reporting + Snapshots** — read-only aggregation over phases 1–3 + existing systems.
5. **Biweekly Learning + System Changes + dashboard** — learning layer on top of snapshots.

## Standing repo rules that apply

- Layered flow routes → controllers → services → models; enums in constants;
  route strings in `util/page-route.js`; swagger JSDoc + real `components.schemas`
  on every route; seeds in `config/setup.js`; crons required in `server.js`.
- No mongo transactions — per-document atomic guards + compensating updates.
- Money/finance paths verified end-to-end with throwaway scripts (synthetic data,
  cleaned up). No test suite exists.
- Cross-system calls are fire-and-forget hooks — a downstream failure must never
  break the caller.
- Every manual correction (stock, snapshot, discrepancy) records a reason.

---

## Reconciliation vs the client's authoritative doc (2026-08-03)

Matched the client's full "Simple Explanation" doc against this scope. **All six
status machines, the 9 question types, the ~12 models, immutable snapshots, Rider-
separate, Floor-Lead-temporary, and manual-correction-reason all MATCH.** The client
doc adds specificity + a few integration rules this scope had missed. Estimate holds
(~80 endpoints / ₦800k) — the deltas are refinements inside existing modules, not new
domains.

> Terminology note: the client's "What the Bot Does" uses **"the bot" = THIS system's
> server/cron engine**, NOT the Phase-6 customer chat assistant. Keep them distinct.

### GAPS to add (were missing / under-specified here)

- **G1 — Auto-expense on purchase [Phase 1].** Client RULE: "Every approved purchase
  must create an expense automatically." When a Supply Request closes/received, fire a
  hook that creates an **APPROVED** Expense (category SUPPLIES, linked to the station,
  amount = purchase total). Couples Supplies↔Expenses inside Phase 1 (both already there).
- **G2 — Seed 12 default expense categories [Phase 1].** SUPPLIES, FUEL, RIDER COST,
  DISPATCHER COST, PAYROLL, RENT, UTILITIES, REPAIRS & MAINTENANCE, DATA & COMMUNICATION,
  MARKETING, PETTY CASH, OTHER EXPENSE — seed in `config/setup.js`; keep category CRUD for
  extras. Expense also carries a **Business Area** field (station vs general).
- **G3 — Logistics as its own sub-report [Phase 4].** Not just one report line: Jobs,
  Logistics Revenue, Fuel, Rider, Dispatcher, Other Logistics Cost, Total Logistics Cost,
  **Logistics Contribution**. V1 stays simple — NO route/km tracking.
- **G4 — Revenue split [Phase 4].** LAUNDRY / LOGISTICS / OTHER INCOME / TOTAL, READ from
  Orders/Payments only (never re-entered — no duplicate revenue).
- **G5 — The 16 success KPIs [Phase 4/5].** Define + compute for the Operations Report and
  Admin Dashboard: Daily-Form Completion %, Floor Compliance %, Expense Documentation %,
  Supply Shortage %, Expected-vs-Physical Supply Diff %, Contribution Margin %, Net P/L,
  Operating Cash Flow, Logistics Contribution, Rework %, Complaint %, Delivery Success %,
  Biweekly Learning Completion %, Improvement Actions Completed %, System Changes Verified %,
  **Repeated Problem Rate %** (derived from Learning History — flags recurring issues).
- **G6 — Report period filters [Phase 4].** TODAY / THIS WEEK / THIS MONTH / CUSTOM RANGE on
  every report.
- **G7 — Biweekly snapshot period [Phase 4/5].** Snapshots must support **biweekly (+ prev-
  biweekly)** comparison, not only weekly/monthly, to feed the Learning Record.
- **G8 — Supply-usage consumption ledger [Phase 3].** Each auto-deduction is RECORDED against
  the station (a usage-log entry, not just a decremented balance) — feeds "Expected Supply
  Usage" in the Ops report and the stock-check expected-vs-physical comparison.
- **G9 — Floor-Lead alert bundle [Phase 2].** Floor Lead is the explicit recipient of: form
  verification, operational alerts, low-supply alerts, **staff-availability alerts**,
  **unresolved-issue alerts**, **closing checks**. NOTE sequencing: low-supply alerts exist in
  Phase 1 but Floor Lead isn't built until Phase 2 → in Phase 1 alert Admin only; add the
  "current Floor Lead" recipient when Phase 2 lands.
- **G10 — Daily-form triggers [Phase 2].** The form's **Low-Supply Check** field can RAISE a
  Supply Request (Phase 1 also allows a direct raise); **Tomorrow Availability** feeds the
  staff-availability alerts. Daily-form fields per client: Staff/Station/Date/Time-In/Opening
  Checklist/Station Protocol/Mid-Shift/Low-Supply Check/Issues/Closing Checklist/Tomorrow
  Availability/Submission Time/Verification (all dynamic via the Form Builder).

### DECISIONS the client doc resolves (previously open here)

- **Admin-direct expenses auto-approve** ("may be approved immediately") — resolves the
  Phase-1 auto-approve question. Staff-submitted expenses still require Admin approval.
- **Opening balances are Admin-entered**; the system updates balances from recorded
  transactions "where possible." Balance-sheet opening state seeded/edited by Admin.

### FLAGS — confirm with client before the affected phase (terms not in current codebase)

- **Q1 [blocks Phase 4 Ops report] — "Holds" / "OT Traveller" / "Hold Process".** Ops report
  wants Holds Raised/Resolved; Learning references OT Traveller + Hold Process. The current
  backend has complaints/recovery, NOT a "hold" concept. Confirm: is a Hold a new thing (order
  paused) or does it map to recovery/complaint? "OT Traveller" = the order travel/routing ticket?
- **Q2 [Phase 2] — Station↔role mapping.** Client's S1 = "Intake, Tagging AND Customer
  Experience", but the codebase separates `intake-and-tag` from `customerExperience`. Confirm
  whether the S1 form spans both or CX stays its own lane.
- **Q3 [Phase 4] — "Logistics Jobs" source.** From order pickup/delivery runs, or a separate
  dispatch record? Needed to count jobs + attribute logistics revenue.
- **Q4 [Phase 1/4] — "Dispatcher" vs "Rider".** Doc costs both Dispatcher and Rider; current
  system has Rider only. Is Dispatcher a distinct role/cost line or just a category label?

### CLIENT ANSWERS (2026-08-03) — Q1–Q4 resolved (+2 new modules)

- **A1 (Holds) — ALREADY BUILT, NOT a new module (CONFIRMED by client + code 2026-08-03).**
  Hold create + resolve already exist at EVERY production station: intake, sort-and-pretreat,
  wash-and-dry, press-iron, QC each have hold + `/hold/:id/release` routes (page-route.js), plus
  admin `send-to-hold`/`resolve-hold`/`hold-orders` + `hold-reasons`. Data lives on
  `bookOrder.holdDetails { reason, note, assignTo, heldAt, heldByOperatorId, heldByStation }` +
  `ORDER_STATUS.HOLD` + ORDER_ON_HOLD/RELEASED notifications. ⇒ **The Smart Book only READS this**
  for Ops-report Holds-Raised/Resolved — NO new Hold model, NO new endpoints. Folds into Phase 4
  reporting. **"OT" = Order Traveler** = the order moving station→station (existing pipeline stage
  transitions) — also already built; report reads stage history.
- **A2 (Station S1) — keep CX SEPARATE.** S1 = **Intake & Tagging only**; Customer Experience
  stays its own lane (its current setup). So the S1 daily form + station reporting cover
  intake/tagging; CX is not folded into S1.
- **A3 (Dispatcher) — COST CATEGORY ONLY for now.** Rider (physically does pickups/deliveries/
  errands) and Dispatcher (receives jobs, assigns riders, plans routes, monitors, handles
  problems) are conceptually distinct roles, BUT CHUVI has **no dedicated Dispatcher account** —
  Founder/Admin/assigned staff does it temporarily. ⇒ **Do NOT add a Dispatcher role now.** Keep
  **Dispatcher Cost as a separate optional category, ₦0 when unpaid.** The Logistics Job
  structure must NOT depend on a Dispatcher role — a real Dispatcher role can be activated later
  without changing it.
- **A4 (Logistics Jobs) — NEW STANDALONE MODULE.** "Logistics Jobs" = **separate PAID logistics/
  delivery/errand requests**, NOT the normal pickup/delivery of a laundry order. Laundry
  pickup/delivery stays a **dispatch task linked to the laundry order**. A Logistics Job gets its
  **own record**: `{ price, payment, rider, pickup/dropoff locations, status, costs }`. Both may
  share the same dispatch system, but **Laundry revenue and Logistics revenue MUST report
  separately** (feeds G4 revenue split + G3 Logistics report). ⇒ New **LogisticsJob model +
  ~8–10 endpoints** (create, assign rider, status transitions, record cost, record payment,
  list, get, cancel). Own status machine (e.g. requested → assigned → in-progress → completed |
  cancelled). Provisional home: its own slice built BEFORE Reporting so the data exists.

### SCOPE / ESTIMATE IMPACT (revised — Holds already built)

Only ONE genuinely new module on top of the original ~80-endpoint scope:
- ~~Holds~~ — ALREADY BUILT (A1); Smart Book only reads it. NO added build.
- Logistics Jobs (A4): +1 model, ~8–10 endpoints (includes payment handling → heavier).

Revised rough total: **~13 models, ~88–90 endpoints.** In the doc's own weighting that's roughly
**+₦60k–₦80k** for Logistics Jobs only. Final naira is the client's call. Does not block Phase 1.
