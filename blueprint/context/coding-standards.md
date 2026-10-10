# Coding Standards

> Tuned by `/adopt` on 2026-10-09 to the conventions this codebase actually uses.
> The full architecture notes (pipeline, payments, time zone, CRM, bot, Swagger
> pattern) live in `AGENTS.md`; this file is the short rulebook.

## Stack

- Node.js 20.x, Express 4, CommonJS (`require` / `module.exports`), npm.
- MongoDB through Mongoose 8. No TypeScript, no build step, no linter.

## Project Structure

- Layered flow, always: `routes/` -> `controllers/` -> `services/` -> `models/`.
- Routes mount under `/api` in `routes/index.js`; path strings live in
  `util/page-route.js`.
- Shared enums (roles, statuses, service types, tiers, payment methods) live in
  `util/constants.js`. Use the constants, never string literals, and add any new
  constant to its explicit `module.exports` list.
- Pure, clock-free rules go in `util/` modules that take `now` as a parameter, so
  they can be asserted offline (`util/bookingWindow.js`, `util/crmSendWindow.js`).
- Seeds and per-field backfills go in `config/setup.js`. Seeding is not migrating:
  a new settings field needs an idempotent backfill for existing documents.
- Crons live in `crons/` and only run if required at the top of `server.js`.

## Naming

- Files: camelCase or dotted (`bookOrder.service.js`, `walletCredit.model.js`).
- Services: classes or singletons exported per file; functions camelCase.
- Constants: SCREAMING_SNAKE_CASE objects in `util/constants.js`.
- Route paths: kebab-case.

## Responses and Errors

- Services return `BaseService.sendSuccessResponse({ message })` or
  `sendFailedResponse`; controllers wrap through `base.controller.js`. The success
  payload is at `data.message`.
- Throw `AppError` (`util/appError.js`) for operational errors; the central
  handler is `controllers/error.controller.js`.
- Validate request bodies with `validatorjs` through `util/validate.js`.

## Auth and Trust

- JWT from the `accessToken` cookie or a Bearer header (`middlewares/auth.js`).
- Each station has its own middleware that also admits admin; `multiAuth.js`
  takes a role list. Scope customer queries by `req.user`, never a client-sent id.
- Internal bot endpoints use the `x-bot-secret` header.

## Data and Money

- No Mongo transactions. Use per-document atomic guards and compensating updates
  (see `walletCredit.service`).
- Cross-system calls go through fire-and-forget hooks (`util/crmHooks.js`,
  `offerHooks.js`, `referralHooks.js`, `recoveryHooks.js`). A downstream failure
  must never break the calling flow.
- Dates are Lagos time. Bucket days and months with `util/lagosDay.js` (exclusive
  upper bounds), not hand-rolled `setHours`.
- Migrations are additive. Never reset or drop existing data.
- Every manual correction records a reason and an audit log entry.
- Responses populate human-readable identity (names, phone, `oscNumber`), never
  bare ObjectIds.

## API Docs

- Every route carries `@swagger` JSDoc with a real, example-filled response shape.
- Model shapes live once in `swagger/schemas.js`; routes `$ref` them inside the
  two-level envelope. Run the envelope check in `AGENTS.md` after route changes.

## Testing

There is no test runner. `npm test` is the npm placeholder and fails. Verification
today is `node briefCheck.js` (offline assertions) plus the root `*Staging.js`
scripts, which drive real flows against the dev DB with synthetic data and clean
up after themselves. Money paths must be verified end-to-end this way before shipping.

The blueprint installs no test runner; testing is opt-in at the project level,
because the overlay can't know your stack. Adding unit testing is an explicit
setup task the AI can do through the normal workflow, either as a build-plan item
or with `/tests`. The setup should choose the stack-native runner, wire the
scripts or commands, add a small example test, and update the Commands section
of `AGENTS.md`.

When `AGENTS.md` declares a `Verify` command, treat it as the umbrella automated
gate. It combines only the checks this project actually has, in this order when
available: typecheck, tests, then build. The command does not enable an absent
test runner or replace focused evidence. It gives local work and optional CI one
exact command to run. `/ci` owns Verify and CI setup. `/tests` adds the real test
command to Verify when it already exists, but never creates CI only because
testing was configured.

**The opt-in switch is one signal: a `test` command in the Commands section of
`AGENTS.md`.** Declare one and **tests become a gate for logic-bearing steps**,
not an optional extra; leave it out and the loop verifies logic with the evidence
it already uses (run it, a screenshot, the build). Adding the runner is itself a
deliberate step, never a silent mid-step install. This is the single definition
of the switch; the skills and `ai-interaction.md` only point back here.

- **What to test (the scope rule):** pure logic where a wrong answer is possible -
  parsers, formatters, validators, id/slug builders, server actions. These have
  assertable inputs and outputs and real edge cases (empty, missing, malformed).
- **What not to test:** UI components and integration-level surfaces (render or
  export routes, anything driving a real browser or external service). Verify those
  with a screenshot and the build, not brittle unit tests.
- **The gate (when a runner is configured):** a build step that adds in-scope logic
  must ship a passing test in the same reviewable diff. The project's test command
  must be green before the step is approved, before any checkpoint commit, and
  before `/complete` merges. UI and integration-only steps are exempt and ride on
  screenshot plus build evidence.
- **When it's named:** the `/feature` spec's Testing section predicts the coverage,
  `/implement` writes the test with the step, and if a step surfaces logic the spec
  didn't foresee, add a focused test then.
- An empty suite should fail, not pass, so "no tests ran" never looks like "passed".
- Test files live next to source files (for example `feature.test.ts`).
- Run them via the project's test command (see Commands in `AGENTS.md`), not a
  hardcoded tool name.

Stack binding, if a runner is ever added: Node's built-in `node:test` or Jest
for CommonJS, with the pure `util/` modules as the first targets because they
already take `now` as a parameter.

## Browser Verification

This repo is API-only, so evidence for a change is a booted server (`PORT=7999`),
real API responses, the Swagger spec, and the staging scripts. The section below
applies only if a browser harness is ever added.

- Browser automation is separately opt-in through `/tests browser`. That setup
  reuses a compatible runner or prefers Playwright for supported projects, then
  documents the exact command as `Browser tests` in `AGENTS.md`.
- When `Browser tests` is declared, add focused coverage for stable behavioral
  done-whens when it is proportionate, and run the documented command during
  `/check`. Do not assume it proves visual fidelity, real authenticated-profile
  behavior, browser chrome, or another claim the test does not observe.
- If no Browser tests command is declared, do not add a runner silently in the
  middle of an unrelated feature. Use the available dev server, browser
  screenshots, build output, API output, or manual evidence instead.
- Browser tests are not part of the default Verify command or CI unless the user
  separately chooses that slower gate.
- Browser evidence is especially important for flows that click, type, submit,
  navigate, download files, render complex layouts, or depend on client-side
  state.

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
