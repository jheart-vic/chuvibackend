# CHUVI Dev Brief 1 — Platform Foundation & Multi-Vertical Readiness

> Client brief received 2026-08-06. Planning only. This REFRAMES the roadmap:
> it becomes the priority foundation; the three prior planned features are
> paused/absorbed (see "Relationship to prior plans" below).

## Purpose (one line)
Prepare the existing, laundry-centric CHUVI platform to support **multiple service
verticals** (Logistics, Shoe Cleaning, Alterations, future) and **multi-role staff**
WITHOUT rebuilding the working systems. Guiding motto: **"one shared system + vertical
context."** It does NOT build the new verticals themselves — it makes the platform
*ready* for them.

## Feature or rule? → BOTH (a foundational program + standing principles)
Not a single feature and not a single rule. It's:
- a **foundational program** = several enabling FEATURES (staff identity/roles, acting-role,
  audit upgrade, adding "vertical context" to Offers/Wallet/CRM/Comms/Complaints/AI/records),
  plus
- a set of **standing RULES/principles** that govern all future work (validate-first,
  don't-rebuild, one-shared-system, configurable rules, historical-rule versioning,
  migration safety, regression testing).

## The 3 core new primitives it introduces
1. **`vertical` context** on records — Laundry | Logistics | Shoe Cleaning | Alterations |
   future. The central through-line; most upgrades = "add vertical awareness to X."
2. **Staff Identity** — ONE identity → MULTIPLE qualified roles: `homeRole`, `qualifiedRoles[]`
   (trained/approved backups), `temporaryAssignments` (shift/day, auto-expire), Floor Lead
   (time-boxed mgmt responsibility). Access = qualified + assigned. Admin emergency override
   (audited: approver/role/reason/start/end).
3. **Acting Role + Audit upgrade** — every important action records: staff identity → **acting
   role** → station → **vertical** → related record → time. Enables person-performance AND
   role/station-performance without duplicate accounts.

## Enabling features (buildable, extend—don't rebuild)
- Staff Identity & multi-role (§2–5) — **absorbs the earlier multi-role plan**, extended with
  home/backup/temp/Floor-Lead + qualification + emergency override.
- Acting-role stamping on operational actions (§4).
- Audit log extension: acting role/station/vertical/vertical-record (§7).
- Add vertical-awareness (field/scope) to existing shared systems, each staying ONE system:
  - Offers → **Offer Scope** (CHUVI-wide | Laundry | Logistics | ... | specific service) (§11).
  - Wallet → credit carries **eligibleVertical/eligibleService** + restrictions; still one wallet (§12).
  - CRM → one CRM + **per-vertical engagement** (global relationship + per-vertical stats) (§9).
  - Communication → every request carries **sourceVertical** + related record (§14).
  - Complaints/Recovery → complaint carries **vertical + relatedRecordType/record**; different
    verticals get different complaint-type configs; one framework (§15).
  - AI Assistant → recognize vertical intent (e.g. "take this parcel to Ifite" → Logistics) then
    hand to that workflow; still LLM-understands / rules-decide; never invents policy (§16).
  - Referral → stays customer-level; vertical rewards reuse Offer+Wallet infra (§17).
  - Records carry vertical/hub/station context for future reporting (§18).
  - Payment → ready to reference future vertical records without separate engines (§13).
- Customer dashboard readiness: one account/wallet/CRM/referral; future history filter
  All | Laundry | Logistics | Shoe Cleaning | Alterations (§10).
- Admin readiness: future context selector ALL CHUVI | per-vertical, no separate admin apps (§19).

## Standing rules / principles (governance)
- **Validate first (§1):** controlled END-TO-END test of the full customer journey
  (registration → CRM/offer/wallet/payment → booking → S1–S5 → hold/rework → dispatch →
  delivered → feedback/complaint/recovery → referral → CRM). Find bugs/broken integrations/
  permission gaps; result = stable baseline. Protect existing data.
- **Don't rebuild working systems** (§6, §24) — extend them; dashboards stay, access is chosen
  by current role assignment.
- **One shared system + vertical context** (§8) — no per-vertical duplicate CRM/Wallet/Offer/
  Comms/Complaint/Payment.
- **Configuration principle** (§20) — business rules admin-configurable (offer scope, comms
  rules, role assignments, credit eligibility, complaint types, vertical availability, future
  logistics rules); no developer for normal rule changes.
- **Historical rule protection** (§21) — old records keep the rule/version in force at creation
  (e.g. Logistics Pricing v1 vs v2). Apply where audit/reconstruction matters (mirrors the
  Smart Book immutable-snapshot rule).
- **Migration safety** (§22) — no destructive resets; protect customers/orders/wallet/txns/
  payments/CRM/offers/referrals/complaints/comms/holds/audit.
- **Regression testing (§23)** — verify NEW works AND all EXISTING still works after the upgrade.

## What it explicitly does NOT build (§24)
Logistics Job/Mission engine, Dispatcher, Logistics Rider workflow, Workforce Command, Floor
Lead dashboard, Training/Certification, Daily Staff Forms, Supply, Expense, full Ops/Cost/
Learning (Smart Book). It PREPARES for them.

## Database — MongoDB (confirmed)
§22's "MySQL" was a **typo** (client confirmed 2026-08-06). CHUVI runs on **MongoDB via
Mongoose** (Node/Express, CommonJS) — the stack in this repo. The migration-safety principle
(§22: no destructive resets, protect all existing data) applies as written; the "safest
technical migration approach" is a Mongo migration (additive schema changes + backfills, the
pattern already used across this codebase).

## Relationship to the prior 3 planned features
- **Multi-role staff** → NOT dropped — **absorbed** into this brief (§2–5 Staff Identity Upgrade),
  extended. The earlier plan ([[chuvi-multi-role-staff]]) feeds straight in.
- **Smart Book (Ops/Cost/Learning)** → explicitly OUT of scope here (§24); this brief is its
  prerequisite. **Paused** until the foundation lands. ([[chuvi-smart-book-feature]])
- **Maps + Weather** → not referenced by this brief; separate concern, **paused**.

## Success (§25)
Existing stack stable; laundry still works; commercial systems still work; one staff identity
supports multiple qualified roles; temp assignments work; actions record acting role; shared
systems understand vertical context; CRM/Wallet/Offers/Comms/Complaints each remain ONE system;
platform ready to accept Logistics + Workforce upgrades without rebuilding.
