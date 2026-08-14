# Scope, Plan, Costing & Todos — CHUVI Workforce Command & Staff Operating System

> Client brief received 2026-08-06. Planning only, no code. Price anchor: **₦1,200,000
> (all-in — INCLUDES the Platform Foundation base, which is not billed separately).** The
> largest single line of the four (Smart Book ₦1.16M, Logistics ₦900k). ABSORBS the earlier
> multi-role-staff plan. Extends the existing S1–S5 / Rider / CX dashboards — does NOT rebuild
> them. NOTE: in true engineering size the Smart Book is arguably the biggest/hardest (finance +
> multi-vertical reporting + consumes everything); the ₦1.2M here is a commercial figure that
> also carries the Foundation base.

## What it is
A **smart staff operating manager** that sits AROUND the existing staff dashboards and adds:
one staff identity, multiple qualified roles, training/competence, permanent + temporary
assignments, acting-role tracking, Floor Lead, staff standards/SOPs, operational risks, staff
cases, and staff audit history. Answers: who is this worker, what are they qualified/assigned
to do, what role were they acting in for this action, what standards apply, who runs the floor,
what staff problems need action.

## Core model shift
ONE STAFF MEMBER → ONE STAFF IDENTITY → MULTIPLE QUALIFIED ROLES → CURRENT ASSIGNMENT →
ACTING ROLE. Cross-train without duplicate accounts. Distinguish **qualified role** from
**current assignment**; **station** (workflow position) from **role** (responsibility).

## Key concepts
- **Staff Profile:** name/id/phone/employment status, main role, qualified roles, current
  assignments, competence status, training history, Floor-Lead eligibility + current Floor-Lead
  assignment, relevant standards/SOPs, staff cases, audit history.
- **Roles:** intake/sort/wash/press/qc/rider/CX/Floor-Lead/Hub-Coordinator/Dispatcher (+ future
  verticals). Main role + approved backup roles.
- **Assignments:** permanent multi-role AND temporary cover (start/end, **auto-expire**;
  worker keeps normal role after).
- **Acting Role (critical):** every important action records staff → acting role → station →
  vertical → related record → time. Distinguishes WHO from WHERE-IN-PROCESS.
- **Access = qualification + assignment.** No independent station work without certification.
  Workers can't freely self-switch — switch comes from assignment/Floor-Lead/Admin/workflow.
- **Competence:** train → practice → assess → certify (+ retraining-required). Training ≠
  certification. Training Records; certification unlocks assignment.
- **Emergency Override:** Admin-only, records staff/role/reason/approver/start/end; exceptional.
- **Standards & SOP Library:** role-scoped docs + CHUVI-wide rules; **versioned**; staff
  **acknowledge** major updates (read-and-understood recorded); old versions retained.
- **Floor Lead:** temporary MANAGEMENT responsibility (not a station); eligibility flag;
  time-boxed assignment (auto-expire); dashboard **WORK / PEOPLE / PROBLEMS / QUALITY / CLOSE**;
  operational powers (reprioritise, move qualified staff, require rework, hold, escalate, close)
  but NOT employment/pay/discipline (permission principle: unauthorized actions don't appear).
- **Staff Cases:** discipline workflow (coaching→recorded-correction→review→decision), evidence
  incl. **CCTV reference** (no direct CCTV integration this phase). **Separate from customer
  complaints.**
- **Operational Risk + Important Instruction records:** structured records only when
  significant/unresolved/escalated — NOT every routine conversation.
- **Reuse:** existing Hold engine, station handoffs, audit logs (extend, don't rebuild),
  Communication/Notification for alerts.
- **Availability:** available / assigned / unavailable / absent (kept simple).
- **Daily Staff Form:** Workforce owns which worker/role/shift/verifier; the detailed
  configurable form + reporting/supplies/cost connections belong to the Smart Book build.
- **Multi-vertical:** same staff architecture supports Laundry/Logistics/Shoe Cleaning/
  Alterations (one identity can hold Laundry Intake + Logistics Hub-Coordinator quals).

## Cross-links (roadmap)
- **Absorbs** the multi-role-staff plan ([[chuvi-multi-role-staff]]).
- The **identity + multi-role + acting-role + audit-upgrade base overlaps the Platform
  Foundation** (Dev Brief 1 §2–7). Build that base ONCE in the Foundation; Workforce adds the
  operating layer on top. See `platform-foundation-brief.md`.
- Provides the Workforce identity/acting-role/qualifications the **Smart Book** and **Logistics**
  consume ([[chuvi-smart-book-feature]], [[chuvi-logistics-system]]).

---

## Costing — base ₦1,200,000 (standalone full build, weighted)
Final naira is the client's call on rate.

| Module | ₦ |
|---|---:|
| Staff Identity & Profile + multi-role model (main/backup/qualified) + auth refactor (12 middlewares + multiAuth → effective-role) + role-switch + dashboard-access resolution | 180,000 |
| Acting-Role stamping + Audit Log upgrade (acting role/station/vertical/related-record across ALL existing action sites) | 150,000 |
| Competence & Certification (train→practice→assess→certify + retraining) + Training Records + notifications | 140,000 |
| Floor Lead Dashboard (WORK / PEOPLE / PROBLEMS / QUALITY / CLOSE aggregation) | 130,000 |
| Staff Standards & SOP Library (role-scoped docs + versioning + acknowledgement) | 110,000 |
| Permanent + Temporary Assignment (auto-expiry) + Availability + shift-assignment workflow | 100,000 |
| Staff Cases (discipline workflow + evidence + CCTV reference; separate from complaints) | 90,000 |
| Floor Lead role (eligibility + time-boxed assignment + powers + permission gating) | 90,000 |
| Significant Operational Risk + Important Instruction records (workflows) | 75,000 |
| Multi-vertical role readiness + staff/activity reporting source feed | 60,000 |
| Daily Staff Form ownership layer (worker/role/shift/verifier hooks) | 45,000 |
| Emergency Override (audited) | 30,000 |
| **TOTAL (standalone)** | **₦1,200,000** |

Size ~8–10 models · ~95–115 endpoints · ~2–3 crons (temp-assignment/Floor-Lead expiry sweep,
training-due reminders).

**Includes the Platform Foundation base (client decision 2026-08-06):** the Platform Foundation
is NOT costed as a separate system — its buildable base (staff identity / multi-role / acting-
role / audit upgrade + the `vertical` context primitive + the §1 E2E validation baseline) is
FOLDED INTO this ₦1,200,000. So **₦1.2M is the all-in Workforce + Foundation figure** — no
separate Foundation charge, no double-count. The Platform Foundation's remaining content is a
governing CHARTER (principles the other systems follow), not a billed build.
**Lean option:** deferring the Standards/SOP Library (₦110k) + Staff Cases (₦90k) to a later
phase → ~₦1.0M.

## Phased plan / TODOS (durable — survives context clear)
Overlap note: if Platform Foundation builds identity/multi-role/acting-role/audit, skip/reuse
Phases 1 & 3's base here.
- **Phase 1 — Identity & access:** Staff Profile + multi-role model (main/backup/qualified) +
  auth refactor to effective-role helper (12 middlewares + multiAuth) + role-switch + dashboard-
  access resolution.
- **Phase 2 — Assignment:** permanent + temporary assignment (auto-expiry) + availability +
  shift-assignment workflow + Emergency Override (audited).
- **Phase 3 — Acting-role & audit:** stamp acting role/station/vertical/related-record across
  existing action sites + Audit Log upgrade.
- **Phase 4 — Competence:** train→practice→assess→certify + Training Records + notifications +
  cross-training + retraining.
- **Phase 5 — Floor Lead:** eligibility + time-boxed assignment (auto-expire) + operational
  powers + permission gating + Floor Lead Dashboard (WORK/PEOPLE/PROBLEMS/QUALITY/CLOSE).
- **Phase 6 — Standards, cases & feeds:** Standards/SOP Library (versioning + acknowledgement) +
  Staff Cases + Operational Risk + Instruction records + Daily Staff Form ownership layer +
  staff/activity reporting feed + multi-vertical readiness.

## Standing rules
Preserve S1–S5/Rider/CX dashboards (extend, don't rebuild) · one identity, many qualified roles
· permanent + temporary multi-role both supported · important actions record Acting Role ·
reports distinguish person vs role/station · payroll need NOT split for multi-role · certify
before independent assignment · Floor Lead moves workers only into qualified roles · Admin
emergency override records a reason · Floor Lead = temporary responsibility, privileges expire ·
no free self-switching · standards/SOPs available in-platform, acknowledge major updates ·
training ≠ competence · routine talk creates no digital record; significant risk/unresolved
disagreement may · staff conduct issues SEPARATE from customer complaints · no direct CCTV
integration (reference only) · extend audit logs, don't replace · Daily Forms auto-use known
data · architecture supports future verticals · additive Mongo migration (protect data) ·
**populate human-readable identity in responses** (never bare ObjectIds).

## Success KPIs
Correct Role Assignment % · Certified Staff Coverage % · Cross-Training Coverage % · Temporary
Assignment Accuracy % · Staff Standard Acknowledgement % · Training Completion % · Certification
Pass % · Daily Staff Form Completion % · Floor Compliance % · Rework % · Repeated Hold % · Staff
Operational Issue Resolution % · Unresolved Staff Case % · Role/Permission Error %.

## Dev success tests (per brief)
1. One identity, main=Pressing + backup=QC; login → Pressing works + laundry workflow intact;
   Floor Lead temp-assigns QC → QC dashboard available; QC action logs acting-role=QC/S5;
   temp assignment expires → QC access removed, Pressing remains.
2. Not certified for Wash&Dry → normal assignment blocked; Admin emergency override (reason
   required, audited, expires).
3. Floor Lead assigned → dashboard (5 sections) + reprioritise + temp-assign qualified worker +
   cannot access unauthorized functions; shift ends → privileges auto-removed.
4. Admin publishes updated Pressing Standard → certified staff notified → acknowledge (recorded)
   → old version retained.
5. Staff conduct problem → Staff Case (linked staff + evidence + management decision) → stays
   separate from Customer Complaints.
