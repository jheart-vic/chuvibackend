# AGENTS.md

Instructions for AI coding agents working in this project. This is the cross-tool
entry point. Codex, Google Antigravity, and OpenCode read `AGENTS.md`. Other
compatible tools do too. Claude Code reads `CLAUDE.md`, which imports this file,
so there is a single source of truth.

Claude Code, Codex, and every other AI tool must not add AI attribution to
commits or pull requests, including AI `Co-Authored-By` trailers or generated-by
signatures. Preserve genuine human attribution. See
[Commit and PR attribution](blueprint/context/ai-interaction.md#commit-and-pr-attribution)
for optional tool settings.

## What this is

Node.js/Express backend for Chuvi Laundry (CommonJS, MongoDB via Mongoose, Node 20.x),
a Lagos laundry and dispatch business. It serves the customer app, the staff pipeline
apps, and the admin panel (frontends live in a separate repo), plus an in-app
assistant bot. Entry point is `server.js`. There are no tests or linters configured.

## Read the working context FIRST

Before doing anything, read these three files. They carry the working context
across sessions and context clears:

- `blueprint/context/summary.md` - the whole program: the systems built (Offer,
  Feedback & Recovery, Referral, Communication, Wallet & Credit, bot), binding client
  decisions, agreed build order, phase status, and cross-phase architecture rules.
- `blueprint/context/session.md` - what the current/most recent session did and
  what's next (newest entry at the top).
- `blueprint/context/feature.md` - the feature currently being built: status board,
  deliverables checklist, design decisions, and what later phases expect from it.

Keep all three updated as you work: tick checklist items in feature.md, log
progress in session.md, and fold completed phases / new client decisions into
summary.md. When starting a new feature, rewrite feature.md for it.

Other files in `blueprint/context/` are client-facing records (FE changelogs, client
answers and deliverables, open items, system scope briefs).
`blueprint/context/LOCAL-SECRETS.md` is git-ignored and must never be committed or
quoted. The Blueprint's own `current-feature.md` is the formal spec slot used by
`/feature` and `/fix`; `feature.md` remains the long-running working log.

This project is built with the **AI Blueprint**, a workflow layer, not an
app skeleton. To start a new project, scaffold the app first in an empty folder
(create-next-app, Vite, etc.), then overlay these files on top. Never run a
framework scaffolder inside a directory that already holds the blueprint files
(`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `blueprint/`); it fails
because the directory isn't empty.

The workflow is defined by the local skills and context files below.

## Proportional engineering

Build for established requirements, not hypothetical scale, threats, or future
flexibility. Reuse existing code, the standard library, native platform features,
and installed dependencies before adding machinery.

- Unknown scale or extensibility defaults to the smaller reversible design. Do
  not infer enterprise, multi-tenant, hostile-user, or compliance requirements.
- Derive trust and data-integrity boundaries from actual reachability: untrusted
  input, auth/session/ownership, shared persisted data, destructive operations,
  payments, secrets, and sensitive data.
- Ask only when an unknown materially changes behavior, architecture, persisted
  data, interoperability, a real security boundary, or cost. Otherwise choose the
  simplest repository-native implementation.
- Add an abstraction, dependency, service, configuration surface, compatibility
  layer, or security mechanism only for a current requirement.
- Simplicity never removes real trust-boundary validation, data-loss prevention,
  accessibility, explicit security requirements, configured tests, or project rules.
- Stack-specific template standards apply only when the project uses that stack.

## Read these when relevant

- `blueprint/config.json` - deterministic project workflow settings
- `blueprint/context/project-overview.md` - the project's source of truth
- `blueprint/context/coding-standards.md` - read before changing code
- `blueprint/context/ai-interaction.md` - read when running the Blueprint workflow
- `blueprint/context/current-feature.md` - the one feature, fix, or rollback being built in this checkout

Reuse relevant context already loaded in the session. Claude Code imports only
this file; its Blueprint skills load the other files on demand.

## Project configuration

`blueprint/config.json` is the user-owned, machine-readable workflow policy for
this project. Workflow skills read the relevant settings before acting. A
missing file means built-in defaults. An invalid file falls back to defaults for
read-only status reporting, but mutating workflow commands stop and point to
`/doctor` instead of guessing.

Configuration can make review or verification stricter and can tune local
branch names and automated-mode limits. It never grants permission to commit,
merge, push, deploy, publish, send, delete data, waive a failing check, or accept
a finding. Those approval and safety boundaries are not configurable.

`qualityGates.regular` controls automatic audit, independent-review, check, and
try-guide behavior for the normal workflow and Autopilot.
`qualityGates.continuous` controls the same per-feature gates for Continuous
Mode. The existing `tryGuide` keys select `/check guide`, which generates
instructions without performing verification or recording acceptance.
Independent review defaults to `when-sensitive` in both workflows, while
audit, check, and try guide default to `manual`. Sensitive or unusually broad
work therefore selects independent review automatically; ordinary small work
does not. Setting a workflow's independent review to `manual` disables that
automatic selection, while an explicit `/audit independent current` remains
available. The other conditional modes are `when-sensitive` for audit,
`when-behavioral` for check, and `when-user-facing` for try guides. `always`
runs the gate for every work item in that workflow.

`review.independentExecution` controls how a selected independent-review gate
runs. Its default, `automatic`, uses a fresh isolated reviewer child when the
active adapter can prove isolation, exact reviewer identity and model, and
completion. Otherwise it preserves the request and falls back to the manual
handoff. This setting changes execution only; the quality-gate policy still
decides whether review is selected.
The automatic path spawns a generic child through the current runtime and gives
it the installed project-local Audit skill and review contract. It never requires
or discovers global agent roles, skills, prompts, or TraversyFlow components.
New review requests record requested execution and completed receipts record
actual execution. Manual uses `fresh session`; automatic uses `fresh subagent`;
an explicit automatic fallback records actual manual with `fresh session`.

`git.landing` controls only how `/complete` offers to land finished regular
work. Its default, `local-merge`, keeps the local squash-merge flow. Set it to
`pull-request` when completed branches should be pushed and opened as pull
requests for provider review and squash merge. Configuration never supplies the
required push, pull-request, or merge approvals. Continuous Mode remains
local-only and ignores this setting.

New projects default to one review packet after all small implementation steps
(`workflow.stepReview: "feature"`) with step checkpoint commits disabled. This
keeps the normal loop reviewable without repeating the full session context after
every step. Set `stepReview` to `every` when teaching, pairing closely, or working
on a high-risk change. That restores the per-step approval pauses. To fully
restore the previous workflow, including optional checkpoint prompts after an
approved step, also set `checkpointCommits` to `enabled`. Onboarding presents
these pairs as Efficient and Guided choices, but stores only the two low-level
settings. They can be changed at any time. Both styles end with an optional
read-only code walkthrough. Review cadence controls approval pauses, not whether
the user can ask for an explanation of the finished implementation.

## Workflow

Build one feature, fix, or rollback at a time, behind review gates. Each step's instructions
are plain markdown skills any capable agent can read and follow. The workflow is
exposed through tool-specific adapters:

- Codex: `.agents/skills/<skill>/SKILL.md`
- Claude Code: `.claude/skills/<skill>/SKILL.md`
- GitHub Copilot: `AGENTS.md` plus `.agents/skills/<skill>/SKILL.md`
- Google Antigravity: `AGENTS.md` plus `.agents/skills/<skill>/SKILL.md`
- OpenCode: `AGENTS.md` plus the compatible `.agents/skills/` or
  `.claude/skills/` tree already installed for the selected tools

Unused adapters can be removed. Codex and GitHub Copilot share `.agents/`, and
Google Antigravity uses that tree too. OpenCode can reuse `.agents/` or
`.claude/`. Projects without Claude Code can delete `CLAUDE.md` and `.claude/`.
Claude Code-only projects can delete `.agents/`, but should keep `AGENTS.md`
because `CLAUDE.md` imports it. Do not create `.opencode/skills/` or an
Antigravity-specific skill tree. Both tools use the supported shared trees.

When changing shared workflow behavior, update the matching skill in both
adapter folders so every supported tool stays aligned.

### Parallel work

Blueprint supports parallel work through isolated Git checkouts, without a
separate team mode. Give each developer or agent its own clone or Git worktree
and one dedicated branch before starting `/feature` or `/fix`. The branch must
use the configured prefix and the work item's lowercase kebab-case title. Each
checkout keeps its own
`blueprint/context/current-feature.md`, findings, and review state. Never run two
active work items in the same working directory or replace another worker's
active spec.

Parallel branches may both update `blueprint/build-plan.md`; resolve any normal
Git conflict when the later branch lands. Use `git.landing: "pull-request"` when
the default branch is protected or several isolated checkouts are active. This
model intentionally does not add per-item state folders or automatic agent
coordination.

Learn the feature loop: `/feature` -> `/implement` -> `/check` -> `/audit current` ->
`/complete`. Approve the Feature spec before Implement. Check proves behavior;
Audit reviews code and records findings. Showing both in this path does not
change configured gates or make Audit mandatory. `/check guide` only generates
manual instructions and never performs verification or records acceptance.

Core skills:

### Build

- `feature` - turn a build-plan item into a spec, or propose a reviewed plan addition for a genuinely new feature
- `implement` - build the current spec one small, reviewed step at a time
- `check` - prove the current spec against the running app, or use `check guide`
  for a read-only manual review guide: where to go, what to click, what to expect
- `complete` - run the final safety pass, log features, fixes, or rollbacks under `blueprint/history/`, then request approval for the configured local merge or pull-request landing

### Understand and review

- `explore` - investigate an idea against the actual code without writing files or requiring plans
- `brief` - read-only briefing on an upcoming build-plan feature (scope, dependencies, size) before you spec it
- `status` - read-only progress summary, workflow drift warning, and suggested next action
- `debug` - reproduce and isolate a failure without editing code, then hand the evidence to `fix` or `implement`
- `audit` - branch-aware or full-project review across all concerns or a focused quality, security, performance, or tests lens; `audit independent current` prepares an immutable checkpoint for a fresh reviewer session or configured isolated reviewer child; records findings in `blueprint/context/findings.md` and independent receipts in `blueprint/context/review.md`, where blocking findings or stale review state stop `complete`
- `doctor` - Blueprint health check for setup, adapters, plans, overview freshness, dashboard state, and workflow drift; it may offer to reset only malformed generated dashboard state after approval

### Plan and set up

- `onboard` - tune commands, standards, visibility, ignore rules, and tool adapters after overlaying the Blueprint onto a freshly scaffolded or early project
- `adopt` - bootstrap the Blueprint into an existing brownfield app with shipped features
- `discovery` - optional deep, multi-turn planning conversation that drafts the two user-owned plans only after review and approval; direct plan writing remains fully supported
- `overview` - distill the two planning docs into
  `blueprint/context/project-overview.md`, then offer a reviewed initial planning
  baseline commit before Feature 1
- `prototype` - optional, pre-build static mockups to lock the look
- `tests` - set up unit testing by default, or a repeatable browser harness with `tests browser`
- `ci` - explicitly set up one project-specific Verify command and matching automatic GitHub checks, with an optional local pre-push hook

### Recover and release

- `fix` - document an ad-hoc bug or change into `blueprint/context/current-feature.md`
- `rollback` - plan a safe reversal of a completed feature from its archive and exact git commit, with later-dependency review before code changes
- `release` - optional Render or Vercel deployment readiness, local config, env review, and smoke-test planning

In Codex, invoke these as skills (`$onboard`, `$discovery`, `$overview`, `$feature`,
`$implement`, and so on) or ask naturally, such as "run the overview." In Claude
Code and Google Antigravity, use slash commands such as `/onboard` or `/feature`.
These are AI chat commands, not terminal commands. In OpenCode or other tools
without a dedicated invocation syntax, ask the agent to run the matching skill
or follow its `SKILL.md` manually. The
conventions in `blueprint/context/` apply however a step is invoked. `/discovery`
is never required: users may write detailed plans directly or develop them
through any conversation before running `/overview`.

### Automation

Optional explicit-only skill: `autopilot` combines `feature` or `fix` with
`implement` in one bounded pass when directly invoked, including the configured
regular quality gates. The normal workflow stops for human approval of the spec
before implementation; Autopilot continues through that review point. It may
create checkpoint commits on the feature or fix branch after passing steps and
repair confirmed P0/P1 findings when its audit gate runs. It stops before
`/complete`, merge, push, deploy, or destructive actions.

Optional explicit-only skill: `continuous` can resume or select the next planned
feature and repeat the complete local feature lifecycle through the configured
limit or end of the build plan. It creates one branch and one local main commit
per feature, applies the Continuous quality gates, archives and merges serially,
and stops on decisions or failed safety gates. It never pushes, deploys,
publishes, sends, or performs destructive actions.

Deployment is also explicit. `/release` can prepare local Render or Vercel config
and run readiness checks, but it must stop before deploy, remote service changes,
push, or publish unless the user gives a separate yes in the current chat.

## Dashboard activity

The dashboard can show the active or most recent substantial Blueprint command
from `blueprint/.state/run.json`. This file is generated local state, ignored by
Git, and never part of a feature commit.

Commands with meaningful progress or a durable handoff should write it when the
state directory exists: `onboard`, `adopt`, `discovery`, `overview`, `feature`,
`fix`, `rollback`, `implement`, `debug`, `check`, `audit`, `tests`,
`ci`, `prototype`, `autopilot`, `continuous`, `complete`, and
`release`. Short orientation commands such as `explore`, `brief`, `status`, and `doctor`
do not write activity state. The `check guide` mode also never writes activity
state; select the Check mode before any activity call. Doctor's optional
approved reset removes malformed activity instead of recording another run.

Writing the initial activity record is the first action of a tracked command,
before project inspection, preflight, or other tool calls. This one generated
state write does not authorize product changes or bypass any safety check.

Never create or edit `run.json` directly. From the project root, use the first
helper that exists:

```text
node .agents/skills/doctor/scripts/run-state.mjs <action> <options>
node .claude/skills/doctor/scripts/run-state.mjs <action> <options>
```

Start with `start --command <skill> --summary <truthful-summary> --boundary
<boundary>`. Use `update` at meaningful milestones or for a blocker, with
`--status blocked` and `--resume <exact-command>` when recovery is needed. End
with `finish --status ready|completed --summary <truthful-summary>`. The helper
validates every field before atomically replacing the generated file. If it is
missing or fails, report the activity warning and continue the workflow without
writing a manual fallback.

The helper writes this schema:

```json
{
  "schemaVersion": 1,
  "command": "continuous",
  "status": "running",
  "summary": "Completing the remaining build plan",
  "detail": "Implementing feature 3.",
  "boundary": "local-only",
  "startedAt": "<ISO-8601 timestamp>",
  "updatedAt": "<ISO-8601 timestamp>",
  "resumeCommand": "/continuous resume",
  "progress": { "current": 2, "total": 5, "label": "features" },
  "feature": { "id": "3", "title": "Export reports" }
}
```

`status` must be `running`, `blocked`, `ready`, or `completed`. Use `ready` when
the command reached its intended review handoff, such as Autopilot waiting for
review before `/complete`. Use `blocked` with the exact recovery command when
work can resume. `boundary` must be `read-only`, `reviewed`, or `local-only`.
The progress, feature, detail, boundary, and resume fields are optional. Never
put secrets, raw logs, prompts, or user content in this file. Activity tracking
must not change a command's approval boundaries or turn a reporting failure into
a workflow failure.

## Automatic verification

Automatic GitHub checks are a separate explicit setup. `/onboard` and `/adopt`
only report existing checks and point to `/ci` or `$ci` when none exist. Running
`/ci` inspects the real project and defines one `Verify` command from checks that
already exist. Use this order when available: typecheck, tests, then build. Never
invent a test runner or another check just to fill the command.

For JavaScript and TypeScript projects, prefer a package script such as `verify`
and use the detected package manager. For other stacks, use the native task
runner or exact combined command. Record the exact command under Commands below.

The optional `.github/workflows/verify.yml` must run that same command for pull
requests and pushes to the default branch. Preserve existing workflows, use the
project's real runtime and install command, and grant only `contents: read` by
default. This setup does not add coverage, browser tests, security scans, or
version matrices; those remain later project choices. A local pre-push hook that
runs the same `Verify` command is offered as an opt-in at the end of `/ci`, and
`git push --no-verify` still bypasses it, so the remote ruleset stays the lock.

GitHub branch protection or a ruleset can require the check after the repository
is pushed, but that is a separate remote setting. Missing automatic GitHub
checks do not make the Blueprint unusable.

## Commands

npm (`package-lock.json`), Node 20.x.

- Dev server: `npm run dev` (nodemon, http://localhost:7000 by default). The user
  usually has it running; boot-verify changes on `PORT=7999`.
- Production server: `npm start`
- Brief regression checks: `node briefCheck.js` (offline, no DB, run from the repo
  root). This is an assertion script, not a test runner.
- Swagger envelope check: see API docs below.
- DB verification: the `*Staging.js` scripts at the repo root drive real flows
  against the dev/testing DB with synthetic data and clean up after themselves.
- No build, lint, or typecheck step exists. `npm test` is the npm placeholder and
  always fails, so there is no test gate.

Requires a `.env` file; key variables: `PORT` (default 7000), `MONGODB_URL`,
`ACCESS_TOKEN_SECRET`, `PAYSTACK_SECRET_KEY`, `NODE_ENV`, and (Phase 6 bot) the LLM
provider config. Provider-configurable: `BOT_PROVIDER` (`openai` | `anthropic`;
optional, auto-detected from whichever key is set, OpenAI preferred). For OpenAI:
`OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`). For Anthropic:
`ANTHROPIC_API_KEY`, `BOT_MODEL` (default `claude-haiku-4-5`). No key for the
active provider means a rules-only keyword fallback (bot never hard-fails). Optional
`BOT_STYLE_REPLIES` (`false` to disable) gates the Part-E reply styler (adds ~1 LLM
call per prose reply).

Testing is opt-in. This project has no unit test runner; run `/tests` or `$tests`
to add one and update this section with the real test commands.

Browser testing is also opt-in. Run `/tests browser` or `$tests browser` to add
or normalize a browser harness and document its exact command as `Browser
tests`. Check and Continuous Mode can then reuse it without installing tooling
mid-feature.

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

### Time zone (all dates are Lagos time)

`server.js` pins the whole process to `Africa/Lagos` in its **first statement**
(`process.env.TZ = process.env.TZ_OVERRIDE || "Africa/Lagos"`) — it must stay first, because the crons
schedule themselves at require-time. Chuvi operates only in Lagos, but hosts don't know that: Render runs
UTC while a dev machine here runs WAT, and that split made the ~25 places that bucket "today" with
`setHours(0, 0, 0, 0)` disagree with the Lagos-based reports for the first hour of each Lagos day
(00:00–00:59 WAT is the previous day in UTC) — a discrepancy that was impossible to reproduce locally.
With the pin, `setHours(0,0,0,0)` IS Lagos midnight everywhere and dev matches production.

- Override only via **`TZ_OVERRIDE`**, never by setting `TZ`. The pin deliberately ignores `TZ` so a host
  that exports `TZ=UTC` can't silently defeat it.
- **node-cron fires on process-local time, so every cron expression is now Lagos wall-clock.** Write the
  intended Lagos hour directly (`crmBroadcasts` is `0 10 * * *` = 10:00 WAT, the client-confirmed send
  time; it previously read `0 9` and relied on the process being UTC).
- New code should bucket dates through **`util/lagosDay.js`** (`startOfDay`/`endOfDay`/`startOfMonth`/
  `endOfMonth`/`daysAgo`/`monthRange`/`monthKey`) rather than hand-rolling `setHours`. Upper bounds there
  are EXCLUSIVE (`$lt` the next period's start) instead of `23:59:59.999`, which drops the final
  millisecond. `monthRange` is strict — plain `moment(m, 'YYYY-MM')` accepts "April 2027".

### Background jobs

`crons/*.js` are node-cron jobs loaded by `require()` side effects at the top of `server.js` (expire subscriptions, reconcile Paystack, reset monthly limits, clean up cancelled subs). A new cron only runs if it is required in `server.js`.

### Startup

`server.js` starts the HTTP server first, then connects to MongoDB (`config/db.js`) and runs `config/setup.js`, which seeds default `AdminSetting` and `AdminOrderDetails` documents if missing. Rate limiting (`middlewares/rateLimiter.js`) applies to `/api` except when `NODE_ENV=development`.

### CRM

`services/crm.service.js` is the CRM engine ("smart customer notebook"): one `CrmProfile` per customer/lead (userId optional — WhatsApp/walk-in leads have no account; identity links by normalized phone). It owns stage transitions (lead → first-order → active → loyal → dormant → reactivated), automatic tags, and three workflows (lead nurture, post-delivery, reactivation) driven by a DB-backed queue (`CrmScheduledMessage`) processed by `crons/crmDispatcher.js`; `crons/crmDormancyScan.js` and `crons/crmBroadcasts.js` handle dormancy and broadcast lists. Order/auth services call in only through `util/crmHooks.js` — fire-and-forget, must never break the calling flow. Message delivery (`services/crmMessenger.service.js`) tries the WhatsApp bot (separate repo, `crm-message` event via `CHATBOT_NOTIFY_URL`), then SMS, then email; the bot registers leads via `POST /api/crm/internal/lead` with the `x-bot-secret` header. Templates/thresholds live in the single `CrmSetting` document (seeded in `config/setup.js`, admin-editable). CRM routes are two-tier: staff endpoints use `intakeUserAuth` (intake-and-tag + admin), metrics/broadcasts/settings use `adminAuth`. Backfill from existing data: `node crmBackfill.js`.

### In-app bot (Phase 6, "smart assistant")

Hybrid LLM + rules assistant living in THIS backend (not the WhatsApp repo). The LLM has TWO tightly-scoped jobs in `services/botIntent.service.js` (provider-configurable via `BOT_PROVIDER`: OpenAI `openai` (`openai` SDK, `OPENAI_MODEL` default `gpt-4o-mini`) or Anthropic `anthropic` (`@anthropic-ai/sdk`, `BOT_MODEL` default `claude-haiku-4-5`); a keyword/canned fallback runs when no provider key is set or the call fails, so it never hard-fails): (1) `classify()` maps a message to a fixed `BOT_INTENT` via structured tool/function output; (2) `smallTalkReply()` writes a short, guardrailed free-text reply for greetings / chit-chat / out-of-scope messages ONLY — it never quotes prices, promises timelines, invents data, discusses policy, or takes actions, and falls back to fixed canned text when the LLM is unavailable (`cantUnderstand()` for out-of-scope — "Sorry, I can't quite answer…" + capabilities). Identity questions ("who/what are you", "what can you do") are their own `BOT_INTENT.ABOUT` with a deterministic `aboutBot()` reply (never LLM), so they always work. `menu()`/`aboutBot()`/`cantUnderstand()` share one `capabilities()` sentence. **All real answers and actions stay deterministic** — the LLM never generates data replies. `services/botOrchestrator.service.js` is the deterministic brain: it routes the intent to a workflow that follows the EXISTING systems (order status, wallet, offers, referral incl. level, apply-code, update phone/pickup address, guided booking) and can only perform client-approved low-risk actions (it calls `smallTalkReply` only for the greeting and unknown/low-confidence branches). **V1 AI Assistant upgrade (in progress, phased A→D — client-approved 2026-08):** the bot is being expanded from a read-only guide into an *actor*. After an explicit confirm step + audit log it may quote approved prices, place bookings, open/update complaints, capture structured feedback, and apply wallet/credit to an order. These hard guardrails STAY: it never invents data, never approves refunds/compensation, never edits credits/balances or releases rewards, and never resolves complaint cases — those still reach a human via handoff (flips the conversation to `mode: 'human'`; Customer Experience takes over). **Phase A (done):** conversation memory + richer slot extraction — `conversation.botState.memory` (last-order snapshot, `lastIntent`, resolved place references) is preserved across the per-turn `botState` reset so the bot stops re-asking and can resolve "the usual" / "same place" / "are they ready?" (`services/botContext.service.js`); `classify()` now also extracts booking slots (`items[]`, `pickupDate`/`pickupTime`, `addressRef`, `amount`, `itemName`). **Phase B (done):** read-only answer intents `pricing` (per-piece = `roundToNearestHundred(OrderItem.price × serviceType.pricePerPiece)` — the exact booking math), `turnaround`, `service-info`, `policy` (curated approved facts only, else handoff), `payment-status` (reads `BookOrder.paymentStatus`, never accuses), `reward-status` (referral ledger, never releases); `orderStatusReply` now gives a plain-language stage explanation (`STAGE_EXPLAIN`) and answers "are they ready?"/"has the rider left?" from `stage` + `dispatchDetails`. **Phase C (done) — the bot now takes actions, each behind an explicit confirm + audit; money-approval/case-resolution stays human.** (1) **Booking:** `BOOKING_GUIDE` runs a guided booking (`bookingFlow`) — slot-fill (items→service→address→date/time→confirm) placing the order via `BookOrderService.createOrder({userId,payload})` (thin wrapper over `postBookOrder`, which never uses `res`, so the exact pricing/validation/credit/audit path is reused); "the usual" prefills from `botState.memory.lastOrder`. **V1.1 in-flow understanding (2026-08):** the flow uses the LLM's structured slots (`pickupDate`/`pickupTime`/`items`/`address`) directly, with `_parseDateTimeFromText` as an offline fallback — it never dumps the whole message as the date (that caused a re-ask loop); a DAY alone is enough (time defaults via `_defaultPickupWindow`, flagged at confirm), and a `_applyLoopGuard` prevents any step re-asking forever. It also captures **delivery speed** (`collect-speed` step): offers only speeds available at the current clock via `calculateDueDate` (same-day <10am, express <2pm, standard always), with each charge + ETA; the estimate includes the speed surcharge; if the cut-off passes or the speed is at capacity at placement, it reroutes to pick another speed instead of failing. Item quantities support spelled-out numbers ("fifty shorts") and a large-quantity confirm (`confirm-qty`, >30) guards typos. **V1.1 payment gate (2026-08):** billing precedence in `_placeBooking` — (1) if the customer has an ACTIVE subscription, TRY `pay-from-subscription` first (reuses `postBookOrder`'s own limit/heavy-item validation, which rejects BEFORE creating an order, so a failed attempt creates nothing); success → "covered by your plan", no payment step; rejection → fall back to pay-per-item with a plain reason (`_subFallbackLead`). (2) Otherwise pay-per-item → routes to a `collect-payment` step (`_bookingPaymentStep`) — wallet (`WalletService.payWithWallet` + audit; on success the order's `billingType` is stamped `pay-from-wallet` so reporting matches) or card (`PaystackService.initializePayment` → `authorization_url` link; order stays PENDING until the webhook confirms — the bot never confirms card payment). Wallet settlement covers ALL credit types via the shared `chargeWalletForOrder`; when the customer has reward credit the bot ASKS before spending it (credit opt-in — `confirm-credit` in booking / `confirm-pay-credit` in apply-payment): yes → credit-first then cash, no → cash-only (if cash covers, else reroute to credit/card). Sufficiency is checked against the canonical `WalletCreditService.getCreditBalances`. The same opt-in + `pay-from-wallet` billingType stamp applies to the standalone `applyPaymentFlow` ("use my balance"). The bot gains NO new money authority (own wallet/plan on own order, or a link the customer authorises), and NEVER says "done" for an unpaid order (amount ≤ 0 → "fully covered"). (2) **APPLY_PAYMENT** ("use my balance"): finds the latest unpaid order → confirm → `WalletService.payWithWallet` (credit-first) + audit. (3) **FILE_COMPLAINT** (`complaintFlow`): identify order → dedupe vs open `ComplaintCase` → match/pick a `ComplaintType` → optional photo (`attachments` threaded through the workflow) → confirm → `RecoveryService.openCase`; opens+routes to CX, never resolves. (4) **SUBMIT_FEEDBACK** (`feedbackFlow`): rate a delivered order 1–5 → `FeedbackService.submitFeedback` (≥4 satisfied/3 neutral); ≤2 offers to open a complaint. (5) **Phone change requires OTP** (`_startPhoneOtp` + `verify-phone-otp`): `sendSmsOtp` the new number, write only on a matching code (address change stays no-OTP). All these controller-style services are driven with a synthetic `{body,user}` request (they never touch `res`). **Phase D (done):** every in-app bot turn now carries `quickActions[]` (`{label,message}` chips; tapping sends `message` as the next message — confirm step→Yes/No, mid-collection→Talk To Staff, answered→main menu, handoff→none). CRM inbound framing (in-app): `handleCustomerMessage` accepts an optional `crmContext` that frames an AMBIGUOUS reply into the right workflow (`_crmFrameToIntent`: reactivation→booking/human, reorder→booking, feedback/post-delivery→feedback, lead→booking); passed via the normal customer `POST /bot/message` (`crmContext` body field) so the app can frame the first reply when it deep-links the in-app assistant from a CRM nudge. **Two-bot boundary (client-confirmed):** the in-app bot lives HERE; the WhatsApp bot is a SEPARATE repo that consumes this backend through the EXISTING REST APIs (order status, place order, open case, etc.) and owns its own conversation there — so there is NO special WhatsApp bridge endpoint in this repo (an earlier `/bot/internal/crm-reply` was removed as having no consumer). A stateless "understand + act" endpoint for WhatsApp is intentionally not built. Reuses the Phase 4 `Conversation`/`ChatMessage` models (`type: 'support'`, sender `bot`) and `conversation.service.js` (`getOrCreateSupport`). Multi-turn flows persist on `conversation.botState`. A loop guard (`_applyLoopGuard` in `_runSingle`, V1.1) stops any flow from re-asking the same step forever: it counts no-advance turns in `botState.slots._stall` and, after the 2nd, stops repeating and offers a human via the existing `offered-handoff` step. Mid-flow the customer can **cancel** any flow (`_isCancel`: cancel/never mind/start over — not "no") or ask a **side-question** (a clear pricing/turnaround/service-info question during a collect step is answered, then the flow resumes where it left off); slot corrections work because the flow re-ingests the LLM's slots every turn. **Reply styler (Part E, optional):** `_maybeStyle` can lightly re-word a single-line prose reply via `BotIntentService.styleReply` — it tokenizes all data (₦/codes/times/numbers) first and falls back to the exact deterministic text if any token doesn't survive, and skips multi-line/link/short replies; gated by `BOT_STYLE_REPLIES` (set `false` to disable) and a no-op without an LLM provider. `classify()` also returns `intents[]` so a compound read-only request ("my balance and order status") answers each batched informational intent (order-status/wallet/offers/referral) in one turn — actions, escalation, and mid-flow steps are never batched. Order-status is delay-aware: an overdue order or a "why is it late" message appends an empathetic line + a "connect you to a person?" offer (a `yes` next turn hands off; it never invents a delay reason). Handoff posts ONE queue notice (no duplicate bubble), and the customer gets a one-time "you're now connected" system message on the first staff reply (`conversation.agentJoinedAt` / `ConversationService.markAgentJoined`). Only CX/admin can close a support chat (`POST /bot/:id/close`, `customerExperienceAuth`); the bot/customer never close and there's no auto-close. Closing is audited (`closedAt`/`closedBy`/`closeReason`), posts a one-time "chat closed" system message, emits it plus a `conversation:closed` socket event (rooms `user:<id>` + `staff:support`), is idempotent, and only targets open SUPPORT chats; the customer's next message then starts a fresh bot thread. Request layer `services/botApi.service.js` → `controllers/bot.controller.js` → `routes/bot.js` at `/api/bot` (customer: message/conversation/handoff via `auth`; staff: queue/reply/close via `customerExperienceAuth`). Real-time via **WebSockets** (`config/socket.js`, socket.io on the same HTTP server, JWT handshake, rooms `user:<id>` + `staff:support`; `emitChatMessage` is a non-fatal push layer — REST stays source of truth).

### API docs

Swagger UI is set up in `swagger/swagger.js` (served at `/api-docs`); endpoint documentation is written as `@swagger` JSDoc comments directly in the `routes/*.js` files, with shared component schemas in `swagger/schemas.js`. Keep these comments up to date when changing route contracts.

**Swagger response pattern (required for every route).** The frontend reads these docs to know the exact shape of what the backend returns — so every response must show a real, example-filled shape, never a bare `{ description: ... }` or a placeholder `type: object`.

- **Model shapes live once, in `swagger/schemas.js`** as reusable `components.schemas` entries (`Offer`, `CustomerOffer`, `Referral`, `ReferralPage`, `Feedback`, `ComplaintCase`, `ComplaintType`, `RecoveryAction`/`RecoveryCredit`, `Conversation`, `ChatMessage`, `CommunicationTemplate`, `CommunicationLog`, `WalletCredit`, `WalletTransaction`, plus composites like `OfferPage`/`OfferQuote`). Each field carries a realistic `example` and enums are spelled out. Add a new schema here when you add a model; never inline a full model shape in a route.
- **The envelope has TWO levels — `success` and `message` are NEVER siblings.** A service returns
  `BaseService.sendSuccessResponse({ message: payload })` → `{ success, data: { message } }`, and the
  controller puts `result.data` under its own `data` key. So the payload is at **`data.message`**:
  ```json
  { "success": true, "data": { "message": { ... } } }
  ```
  This was wrong in this file (and in 112 route blocks) until 2026-09-25, and the frontend had to find
  the real shape with a network capture. If you ever write `success` and `message` as siblings, it is a bug.
- **Routes reference schemas, never redefine them.** Every controller replies through `base.controller.js`, so wrap the payload in the standard success envelope and `$ref` the schema:
  ```yaml
  responses:
    200:
      description: <what it is>
      content:
        application/json:
          schema:
            type: object
            properties:
              success: { type: boolean, example: true }
              data:
                type: object
                properties:
                  message: { $ref: '#/components/schemas/<Schema>' }   # or array of $ref, or a {data,pagination} wrapper
    400:
      description: <when>
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }
  ```
  Lists use `message: { type: array, items: { $ref: ... } }`; paginated endpoints use `message: { data: [ $ref ], pagination: {total,page,limit,pages} }` — both still nested under the outer `data`.
  A service that returns extra top-level keys (e.g. `sendSuccessResponse({ message, resetToken })`) puts
  ALL of them under `data`, beside `message`, never above it.
- **Examples must match reality.** Confirm the actual response key names and shape from the service/controller (`sendSuccessResponse({ message: ... })`) before documenting — don't assume. `ErrorResponse` is the shared failure envelope (`{ success:false, data:{ error } }`) and was always correct, which is exactly why the success-side error went unnoticed for so long: failures nested, successes didn't.
- **Verify before claiming the docs are right.** Build the spec and assert the shape rather than eyeballing it:
  ```bash
  node -e "const s=require('swagger-jsdoc')({definition:{openapi:'3.0.0',info:{title:'t',version:'1'},components:{}},apis:['./routes/**/*.js','./swagger/**/*.js']});
  let bad=[];const walk=(n,w)=>{if(!n||typeof n!=='object')return;
   if(n.properties&&n.properties.success&&n.properties.message)bad.push(w);
   for(const k of Object.keys(n))walk(n[k],w)};
  for(const[p,o]of Object.entries(s.paths))for(const[m,op]of Object.entries(o))walk(op.responses,m+' '+p);
  console.log('wrong envelopes:',bad.length,bad.slice(0,5))"
  ```
- **`swagger/swagger.js` hardcodes `servers` to the deployed Render URL**, so "Try it out" from ANY
  environment — including a local `/api-docs` — sends the request to production. Keep that in mind before
  telling anyone an endpoint is broken locally.
