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
