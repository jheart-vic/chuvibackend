# CHUVI Multi-System Program Plan — Master Agreement ("the deal")

> Consolidated 2026-08-06. The single sign-off reference before build starts. Each system has
> its own detailed scope doc (linked). Planning only until this is confirmed. All figures are
> build-effort estimates; final naira is the client's agreed rate.

## The four systems + budget
| # | System | Scope (one line) | Cost | Detail doc |
|---|---|---|---:|---|
| 1 | **Workforce Command & Staff Operating System** (incl. Platform Foundation base) | One staff identity → many qualified roles + training/competence + Floor Lead + standards/SOPs + staff cases + acting-role/audit; **carries the multi-vertical `vertical` primitive + E2E validation base** | **₦1,200,000** | `workforce-command-scope.md` |
| 2 | **Operations, Cost, Reporting & Learning (Smart Book v2)** | Multi-vertical reporting/finance capstone (P&L, cash flow, balance sheet), supplies, expenses, daily forms, snapshots, biweekly learning; consumes every other system | ₦1,160,000 | `ops-cost-learning-scope.md` |
| 3 | **Logistics System** | Standalone dispatch vertical (Logistics Job + Mission, 4 service families, pricing/distance/weather, money reconciliation, dispatcher/rider); reuses shared systems | ₦900,000 | `logistics-system-scope.md` |
| — | **Platform Foundation** (Dev Brief 1) | Governing CHARTER (one shared system + vertical context, config, versioning, migration safety, regression) — **base folded into Workforce, not billed separately** | ₦0 (in #1) | `platform-foundation-brief.md` |
| | | **PROGRAM TOTAL** | **₦3,260,000** | |

Honest note: by sticker price Workforce is the biggest line; by true engineering size/risk the
Smart Book is arguably the biggest/hardest (finance correctness + multi-vertical reporting +
consumes everything). Both are true — the ₦1.2M Workforce figure also carries the Foundation base.

## Build order (dependency-driven)
```
0. E2E PLATFORM VALIDATION  (first, non-negotiable, cheap — Foundation §1)
   full existing journey → find broken integrations/permission gaps → stable baseline → protect data
        ↓
1. WORKFORCE — foundation slice (Phases 1–3)
   vertical primitive + staff identity/multi-role/acting-role/audit  → unblocks everything
        ↓
2. LOGISTICS  (needs vertical context + Dispatcher/Hub-Coordinator/Rider roles)  ── new revenue
        ↓   (Workforce Phases 4–6 — training/Floor-Lead/standards/cases — can run in parallel here)
3. SMART BOOK v2  (capstone — consumes Workforce + Logistics + everything; build last, or Laundry-first + wire in)
```
Rationale: Smart Book consumes the other two → last. Logistics needs the vertical + Workforce
roles → after the foundation slice. Workforce carries the foundation → root of the tree, first.
Strategic call retained by client: **foundation-first (recommended, no rework)** vs revenue-first
(rush Logistics, accept refactor). Recommendation stands: foundation-first.

## First work package (what we build immediately after sign-off)
1. **E2E validation**: scripted end-to-end run of the current stack + a written baseline report
   (bugs, broken links, permission gaps). No structural change until this passes.
2. **Workforce foundation slice**: `vertical` context primitive; Staff Profile + `roles[]`
   (main/backup/qualified) + temp assignments (auto-expire); auth refactor (12 station
   middlewares + multiAuth → one effective-role helper, back-compat fallback + backfill
   roles=[userType]); acting-role stamping + audit upgrade; role-switch + dashboard-access
   resolution. Additive Mongo migration, no destructive resets.

## Program-wide standing rules (apply to all systems)
Layered routes→controllers→services→models · enums in constants · routes in page-route.js ·
Swagger + real schemas per route · seeds in config/setup.js · crons required in server.js · no
mongo transactions (atomic guards + compensating updates) · cross-system calls = fire-and-forget
hooks · **one shared system + vertical context** (no per-vertical duplicate CRM/Wallet/Offers/
Comms/Complaints/Payments) · **enter data once** (auto-pull known activity) · revenue read-only
(no duplicate revenue; wallet top-up ≠ sale) · **historical rule/version protection** (old
records keep the rule in force at creation; snapshots immutable) · **migration safety** (additive
Mongo, protect all existing data) · **regression testing** (new + existing both work) · finance
verified end-to-end with throwaway scripts (no test suite) · every manual correction records a
reason · **populate human-readable identity in every response** (names, phone, oscNumber, job/
mission IDs, station/vertical names — never bare ObjectIds).

## OPEN ITEMS to confirm BEFORE building (sign-off checklist)
- [ ] **Total budget ₦3,260,000** + rate agreed (or per-system as listed).
- [ ] **Build order** approved (foundation-first) OR client chooses revenue-first (accepting rework).
- [ ] **Multi-role client questions** (plain-language versions drafted) — esp. **Q3: must records
      show WHICH role/station a multi-role person was acting in? (A no / B yes)** — B adds an
      "acting as" step + scope. Also Q1 real role combos, Q2 permanent vs temporary, Q4 pay split.
- [ ] **Smart Book** depends on Logistics + Workforce data — confirm Laundry-first-then-wire-in
      approach is acceptable.
- [ ] **Logistics** — confirm map/weather provider preference + whether distance changes pricing
      (money path needs sign-off), and that existing Laundry Dispatch stays until proven.
- [ ] **Staff Cases + Standards/SOP library** — keep in Workforce v1 or defer (lean −₦200k)?
- [ ] **DB confirmed MongoDB** (MySQL in briefs was a typo) — additive migration only. ✅ confirmed.

## Status
Planning complete for all four. Awaiting sign-off on this master agreement, then Work Package 1
(E2E validation + Workforce foundation slice) begins. No code until confirmed.
