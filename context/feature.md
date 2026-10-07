# ███ STATUS BOARD — read this first (updated 2026-10-07) ███

## Where we are
Working the client PDF **"CHUVI Digital Stack Developer Brief, Oct 6 2026"**: §1 22 fixes, §2 two new
features, §3 eight questions. **BACKEND ONLY.** Agreed order: **all fixes → new features → answers**,
with the §3 answers written LAST from shipped code. Final deliverable = **ONE copy/paste block**
(§1 status · §2 status · §3 answers as rule / exact formula / worked example).

| | Item | State |
|---|---|---|
|**G1**| 1.1 cards stay in a queue | ✅ **committed** `8795099` |
| | 1.2 S1→S2 Accept all does nothing | ✅ committed (was a symptom of 1.1) |
| | 1.3 S3 "Waiting for confirmation" | ✅ fixed 2026-10-05 and **NOW DEPLOYED** — `mesage-and-alert-fix` was merged into `origin/main` on 7 Oct (PR #239, `f11a05b`) |
| | 1.4 Flag / Move to Hold do nothing | ✅ backend half committed; UI must SHOW errors (FE) |
| | 1.5 S2 partial sorting + skip pretreat | ✅ committed |
| | 1.6 per-item care tier | ✅ committed |
| | 1.7 bolder tag text · 1.8 Refresh feedback | ⬜ **FE only — not ours** |
|**G2**| 2.1 offers do not save | ✅ **done, UNCOMMITTED** |
| | 2.2 free pickup/delivery still charged | ✅ done, UNCOMMITTED (**was a real bug**) |
| | 2.3 wallet adjustment not in ledger | ✅ committed |
| | 2.4 per-role limits + approval | ✅ done, UNCOMMITTED |
| | 2.5 false "cannot create plan" | ✅ code done, UNCOMMITTED (**was a real bug — the plan WAS created**); DB harness pending a URI |
|**G3**| 3.1 rider assignment does not save | ✅ code done, UNCOMMITTED. **NOT the dispatch-tag gate — that isn't deployed.** Nothing validated the rider id |
| | 3.2 Failed pickups filter | ✅ code done, UNCOMMITTED (+ the office was never notified at all) |
| | 3.3 landmark on pickup address | ✅ code done, UNCOMMITTED |
|**G4**| 4.1 template save returns 400 | ✅ done, UNCOMMITTED — **reproduced: `channels.filter is not a function`** |
| | 4.2 keys + target pages dropdowns | ✅ backend done (`GET /communication/templates/meta`); written list = `util/commMeta.js` |
| | 4.3 admin notifications | ✅ done — notice names customer+amount+operator; **event list derived: only 6 of 87 sites reach an admin** |
| | 4.4 Holds Active/Overdue overlap | ✅ committed, **now DB-VERIFIED** (`holdsStaging.js` 22/22, their literal test) + **2 MORE SLA copies found and unified** |
| | 4.5 CRM dormant rate 100% | ✅ **ANSWERED** in `context/CLIENT-ANSWERS-oct2026.md` — figure is correct, 1 decision needed from the client |
| | 4.6 names as code text, phone formats | ✅ done, UNCOMMITTED — **`normalizePhone` itself was the profile-splitter** |
|**§2**| N1 Quick Booking · N2 Recovery dashboard | ⬜ after the fixes |
|**§3**| Q1–Q8 answers | ✅ **ALL EIGHT WRITTEN** — `context/CLIENT-ANSWERS-oct2026.md` (+ 7 decisions we need back) |
| | FE changelog | ✅ `context/FE-CHANGELOG-2026-10-07.md` — 15 endpoint claims verified against the spec |
| | Assemble the single §1+§2+§3 client block | ⬜ after §2 features |

## Verification gates — run ALL of these after any change
```bash
node briefCheck.js                                   # 101/101  offline, no DB
STAGING_OK=1 MONGODB_URL="<testing uri>" node planCreateStaging.js      # 39 (2.5)
STAGING_OK=1 MONGODB_URL="<testing uri>" node dispatchStaging.js        # 46 (3.1/3.2/3.3)
STAGING_OK=1 MONGODB_URL="<testing uri>" node templateStaging.js        # 27 (4.1/4.2)
STAGING_OK=1 MONGODB_URL="<testing uri>" node botStaging.js             # 11/11 (bot books, so the landmark rule hits it)
STAGING_OK=1 MONGODB_URL="<testing uri>" node phase12Staging.js         # 14
STAGING_OK=1 MONGODB_URL="<testing uri>" node subLogisticsStaging.js    # 20
STAGING_OK=1 MONGODB_URL="<testing uri>" node handoffStaging.js         # 54
MONGODB_URL="<uri>" node phoneFormatBackfill.js --dry   # 4.6 migration, dry first
STAGING_OK=1 MONGODB_URL="<testing uri>" node stationFlowStaging.js    # 80/80
STAGING_OK=1 MONGODB_URL="<testing uri>" node tierPricingStaging.js    # 33/33
STAGING_OK=1 MONGODB_URL="<testing uri>" node offerAdminStaging.js     # 37/37
STAGING_OK=1 MONGODB_URL="<testing uri>" node freeLogisticsStaging.js  # 23/23
STAGING_OK=1 MONGODB_URL="<testing uri>" node walletLimitStaging.js    # 39/39
STAGING_OK=1 MONGODB_URL="<testing uri>" node dispatchTagStaging.js    # 46/46 (older gate)
```
Swagger must stay **56 schemas / 285 paths, 0 wrong envelopes**:
```bash
node -e "const s=require('swagger-jsdoc')({definition:{openapi:'3.0.0',info:{title:'t',version:'1'},components:{}},apis:['./routes/**/*.js','./swagger/**/*.js']});let bad=[];const w=(n,x)=>{if(!n||typeof n!=='object')return;if(n.properties&&n.properties.success&&n.properties.message)bad.push(x);for(const k of Object.keys(n))w(n[k],x)};for(const[p,o]of Object.entries(s.paths))for(const[m,op]of Object.entries(o))w(op.responses,m+' '+p);console.log(Object.keys(s.components.schemas).length,Object.keys(s.paths).length,bad.length)"
```
**NEVER edit `.env`** — it points at the LIVE `laundrydb`. Pass `MONGODB_URL` inline. Every harness
hard-refuses a DB named `laundrydb`.

## Uncommitted right now (Groups 2, 3 and 4 — all DB-verified)
NEW: `services/walletAdjustment.service.js`, `models/walletAdjustmentRequest.model.js`,
`util/{notifyRoles,safeLog,commMeta,displayName}.js`, `phoneFormatBackfill.js`,
`offerAdminStaging.js`, `freeLogisticsStaging.js`, `walletLimitStaging.js`,
`planCreateStaging.js`, `dispatchStaging.js`, `templateStaging.js`.
MODIFIED: `briefCheck.js`, `botStaging.js`, `subLogisticsStaging.js`,
`services/{admin,auth,bookOrder,communicationAdmin,intake-user,offerApi,rider,subscription,
walletAdjustment}.service.js`, `services/bot/booking.flow.js`,
`controllers/{admin,offer,intake-user,communication}.controller.js`,
`routes/{admin,offer,intake-user,bookOrder,subscription,communication}.js`,
`models/{adminSetting,bookOrder,customerOffer,plan}.model.js`, `swagger/schemas.js`,
`util/{constants,page-route,address,helper,itemSummary}.js`, `context/*`.

## ⚠️ LOCAL `main` IS 127 COMMITS BEHIND `origin/main` — ALWAYS CHECK `origin/main`
**Trap that produced a wrong diagnosis on 2026-10-07 (user caught it).** `git show main:…` says the
dispatch-tag gate does not exist; `git show origin/main:…` says it does. `mesage-and-alert-fix` was
merged to `origin/main` on 7 Oct (PR #239, `f11a05b`), which means the dispatch tag, the wash-station
fixes (1.3) and the Lagos TZ pin ARE deployed. `git fetch` first, and never reason about "what the
client is running" from the local branch.

## THINGS TO TELL THE CLIENT (don't lose these)
1. **1.3 is fixed AND now deployed** (merged to `origin/main` 7 Oct). Answer to "what is the system
   waiting for, and from whom": **nothing** — every item was already confirmed, the screen just wasn't
   being told. It adds a `canMoveToDrying` flag the FE must key the button on.
2. **The Thursday 8 Oct deadline cannot cover all 22 + 2.** Say so explicitly; the brief asks to be
   told early.
3. **2.1 "offers do not save" — the save was never broken.** A new offer defaults to `status: draft`,
   so a list filtered to active can't show it. That half is **FE/workflow**, not a lost save.
4. **1.5 stated assumption:** marking pieces sorted also HANDS THEM OVER to S3 (that is the only way
   their worked example is self-consistent). `sendToWash:false` opts out. **Get this confirmed.**
5. **`config/setup.js` seeded the tier charges INVERTED** (premium 2 / vip 1.5 vs the model's 1.5/2),
   so a freshly seeded DB charged MORE for Premium than VIP. Seed fixed, **but setup.js only seeds
   when the doc is MISSING — CHECK THE LIVE `AdminSetting` before saying it's fixed in production.**
6. **1.4 part 3 is FE:** the backend already returns `{success:false, data:{error}}`; the UI isn't
   displaying it. This sits behind several "nothing happens" reports.
7. **3.2 — every failed pickup ever recorded lost the rider's reason** (`pickup.note` was not a field
   on the schema), **and nobody in the office was ever notified** — both failure handlers messaged only
   the rider who pressed the button. If they have been wondering why failed pickups seem to vanish,
   that is why. Also: a failed DELIVERY was overwriting the customer's special delivery instruction,
   which is the line the dispatch tag prints.
8. **3.3 — the customer app does not ask for a landmark.** Staff intake requires one; customer booking
   requires only the address. It is now borrowed automatically from the customer's saved address when
   it matches, and anything still blank is flagged `landmarkMissing`. **Making it mandatory in the app
   is a one-line backend change — do they want it?**
9. **4.1 — what the 400 was rejecting: nothing in the template.** It was the *shape* of one field —
   a channel sent as a single string (`"sms"`) instead of a list, which crashed before any validation
   ran. Also worth telling them: a template could be saved with a whitespace-only body, which would
   then send an EMPTY message to customers. Both fixed.
10. **4.6 — the phone normaliser itself was creating the duplicate profiles.** It never added the
   leading 0 back to a 10-digit number, so `8031234567` and `08031234567` were two different people to
   the CRM. Run `phoneFormatBackfill.js --dry` against live first: it lists any customer already split
   across two profiles. **Merging those is their call, not ours** — it decides which history survives.
11. **FE shape note (4.6):** item briefs now send the readable name in `name` and the stored slug in a
   new `rawType`. Anything matching on the slug must switch to `rawType`.
12. **2.5 — every plan you thought failed was actually created.** The save worked; the activity-log
   write behind it was rejected and that was reported as the plan failing, which is why the retry then
   said "Plan title already exists". **Check the plans list for duplicates/strays created during their
   4–6 Oct testing** — they are real plans. Also tell them `paystackPlanCode` is mandatory to create a
   plan (the form must collect it), and that `itemPerMonth` is no longer asked for (`monthlyLimits` is
   the field that counts).

## Hard-won lessons (do not relearn)
- **`node --check` and `require()` prove NOTHING about method bodies.** Three `ReferenceError`s in
  1.6 and the `isWashed` hoist both passed both. If you touch a branch, RUN that branch.
- **Never assume a shape.** `OFFER_TYPE` has no "general"; benefits use **`benefitType`** not `type`
  (Mongoose reserved word in a subdoc); fees live on **`AdminSetting`**, not `AdminOrderDetails`;
  `createBookOrder` returns the order at `data.message`, `postBookOrder` at `data.order`.
- **A green test can be green for the wrong reason.** Two guard-rail assertions "passed" because the
  request failed earlier for an unrelated missing field. Assert on the SPECIFIC error.
- Most route files are **CRLF** — strip `\r` before regex-matching source in a harness.

---

# Current Feature: Developer Brief — 6 October 2026 (22 fixes + 2 features + 8 answers)

**SOURCE:** client PDF "CHUVI Digital Stack Developer Brief, Oct 6 2026 · @Cyphas" — from their own
testing of the stack 4–6 Oct. Three sections: **§1** 22 fixes/changes in 4 groups, **§2** 2 new
features (N1 Quick Booking, N2 Recovery/Complaints/Feedback dashboard), **§3** 8 questions about how
the system works today.

**SCOPE DECISION (user, 2026-10-07): BACKEND ONLY.** The FE team has its own repo and the user is not
on it. Every item below is tagged with who owns it.

**AGREED ORDER (user, 2026-10-07): fixes → new features → answers.** The §3 answers are written LAST,
from the shipped code, so they describe what the client will actually be testing.

**FINAL DELIVERABLE:** ONE copy/paste block for the client containing (a) §1 per-item status, (b) §2
status, (c) the §3 answers in their requested form — *rule in plain words · exact formula/condition in
the code · one worked example with real numbers*.

**Their deadline was Thu 8 Oct evening (test Fri 9 Oct). 22 items + 2 features is not achievable in
that window — tell them early (the brief explicitly asks for this).** Proposed split: Group 1 + the
confirmed data bugs (2.3, 4.4) by Thursday; the rest the following week.

---

## TRIAGE (verified against the code 2026-10-07, not guessed)

### Bucket A — pure backend, FE changes nothing
FE's existing calls simply start behaving. No new fields, no contract change.

| # | Item | Finding / what to do |
|---|---|---|
| 1.1 | Cards stay in a queue after moving | **ROOT CAUSE FOUND: two parallel notions of "where is this order".** S2 `sortAndPretreat.service.js` queries `stage.status === sort-and-pretreat` at ORDER level (~15 sites, e.g. :87, :186, :683); S3/S4 query `items[].currentStation` at ITEM level. `handoff.service.js:351-369` only rewrites `stage.status` when `summaryStatus()` CHANGES — on a partial move it doesn't. So an order legitimately appears in S2's list AND S3's list. Fix = make `currentStation` the single source of truth, scope S2's queries, recompute every count from the SAME query that builds its list, and void stale pending handoffs. ("No manual refresh" half is FE.) |
| 1.2 | S1→S2 Accept all does nothing | **NOT a separate bug — a symptom of 1.1.** The red text is `handoff.service.js:280` (the CONFIRM-side whole-order gate), firing because the items are no longer all at S1. |
| 1.4 | Flag / Move to Hold do nothing | Both endpoints EXIST (`sortAndPretreat.service.js:998` markAsFlagged, `:1673` sendToHold). They are refused by the `stage.status` guard (same root cause as 1.1) and the FE doesn't render the refusal. Fix the guard + make the message name the reason. |
| 2.3 | Wallet adjustment not in ledger | **CONFIRMED BUG.** `intake-user.service.js:867 adjustWallet` does `wallet.balance += amount; wallet.save()` and **never writes a `WalletTransaction`** — the money genuinely has no ledger line. Also BOTH `wallet.save()` and `order.save()` are un-awaited. Route through `WalletCreditService` so every movement writes a line. |
| 4.4 | Holds Active & Overdue count the same orders | **CONFIRMED BUG.** `admin.service.js:349` `activeHolds` = ALL holds; `:353` `overdueHolds` = holds past SLA — a strict SUBSET. Same filter duplicated at `:1692/:1696`. Fix: Active must exclude the breached set so Active + Overdue = all holds. |
| 4.1 | Template save returns 400 | `communicationAdmin.service.js updateTemplate` has no explicit 400 path; a model enum rejection (likely `page`) is swallowed into a generic "Failed to update template". Make the handler name the field — that also answers their "what is the 400 rejecting". |
| 4.6 | Names as code text + phone formats | Backend stores the slug ("Shirts-/-tops-/-blouses") and two phone formats (with/without leading 0). Normalise on write + backfill. |
| 2.5 | False "cannot create plan" | Repro then fix the create response/validation. |
| 3.1 | Rider assignment does not save | **It DOES save** (`intake-user.service.js:1340` writes `dispatchDetails.delivery.rider`). Almost certainly the dispatch-tag gate at `:1331` refusing with `needsDispatchTag`, invisible because the FE swallows errors. Confirm live. |
| 4.3 | Admin notifications | Emit on wallet adjustment + adjustment request; produce the list of events that notify admin today (they asked for it). |

### Bucket B — FE is WAITING on me (ship these early)
- **1.5** S2 partial sorting — only per-item (`updateItemSortDetails` :276, `markItemAsSorted` :473) and all-items (`markAllItemsAsSorted` :665) endpoints exist; **no bulk endpoint**, which is exactly why "you cannot select a few" and why colour/pretreat can't be set on a multi-selection. NEW bulk endpoint: `itemIds[] + colorGroup + fabricType + pretreatmentOptions`. Model ALREADY has `colorGroup`/`fabricType`/`pretreatmentOptions` and a `not_required` pretreatStatus (bookOrder.model.js:62-94) → the "No pretreatment needed" path is half-built.
- **1.6** per-item care tier — touches PRICING (`roundToNearestHundred(OrderItem.price × serviceType.pricePerPiece)`, resolved once per order today and reused by booking, bot, offers, subscription draw-down). **Do LAST in Group 1 with its own DB harness** — highest money-bug risk in the brief.
- **2.1** `DELETE /api/offers/:id` — **genuinely absent** (`util/page-route.js:250-261` has no delete). Create/update code at `offerApi.service.js:125/168` is CORRECT and does persist; the "not there after refresh" is most likely offers defaulting to `status: draft` while the FE list filters to active.
- **2.2** free pickup/delivery actually ₦0 + offer name in the pricing breakdown.
- **2.4** per-role wallet-adjustment limits (admin-settable, NOT hardcoded) + approval queue above the limit, modelled on the existing top-up-request flow (`intake-user.service.js:~790`).
- **3.2** Failed-pickups filter — `PICKUP_STATUS.FAILED` already exists (`util/constants.js:32`).
- **3.3** landmark on dispatch/rider payloads — field already exists (`user.model.js:10` required; `util/address.js` structured `{label,address,landmark}`; optional on the customer booking path, `bookOrder.service.js:817`).
- **4.2** keys + target-pages list endpoint (they also want the written list).
- **N1** Quick Booking · **N2** Recovery/Complaints/Feedback dashboard (N2 needs a NEW NPS 0–10 question with a 30-day per-customer throttle — does not exist today).

### Bucket C — pure FE, nothing for me
1.7 tag font weight (rendering is FE-side) · 1.8 Refresh pressed/loading state · **1.4 part 3 "a failing button always shows a message"** (backend already returns `{success:false,data:{error}}` — the FE isn't displaying it; this sits behind several "nothing happens" reports) · 1.5 part 4 the "White fabric type" → "Fabric type" label · 2.1's Delete button + create/edit success states.

### Bucket D — blocked on a client answer
- **4.5 CRM dormant rate 100%** — the client says themselves to answer Q2/Q3 first. The 125% case was already fixed 2026-09-23 (numerator scoped to `totalOrders>=1`); 100% is now mathematically valid and may simply be TRUE for their 4 dormant / 4 converted. **Answer it in §3, do not change the formula on a guess.**

---

## TWO THINGS TO TELL THE CLIENT IMMEDIATELY

1. **1.3 (S3 stuck on "Waiting for confirmation") is ALREADY FIXED in this repo but NOT DEPLOYED.**
   Fixed 2026-10-05/06: `getActiveWash`/`getActiveDry` were not returning `allItemsConfirmed`, so a
   shared station card read `undefined` → falsy → a "waiting confirmation" that could never clear.
   Committed on `mesage-and-alert-fix`; **Render serves `main`.** Same stale-deploy pattern the FE hit
   on 2026-09-25. It adds a NEW `canMoveToDrying` flag → half Bucket B, the FE must key the button on
   it. **Merging to main may also change 3.1's behaviour** (the dispatch-tag gate ships in the same
   branch). Answer to their "what is the system waiting for, and from whom": nothing — every item was
   already confirmed; the screen just wasn't being told so.
2. **The Thursday date is not achievable for all 22 + 2.** Say so now; the brief asks to be told early.

---

## PROGRESS (2026-10-07)

**Offline regression gate: `briefCheck.js` at the repo root — `node briefCheck.js` — 29/29 green.**
(Committed rather than left in the scratchpad on purpose: it is the gate for this whole package and
must survive a context clear.) Swagger 55 schemas / 281 paths, 0 wrong envelopes.

DONE so far:
- **1.1 (part — the S3 dashboard half).** `washAndDry.service.js getDashboard`: "Recent Wash Queue"
  paginated on `{'items.currentStation': HERE}` alone while the `washQueue` COUNT beside it also
  required `'washDetails.startedAt': {$exists:false}`. That is EXACTLY the client's screenshot — tab
  reads 0, list still shows two orders already Washing. The list now uses the identical filter and
  returns the same derived fields (`allItemsConfirmed`/`confirmedItemCount`/`flaggedItemCount`) so the
  card and the tab cannot disagree.
- **4.4 holds.** NEW `util/holdSla.js` — ONE breach definition (`breachBranches`), with
  `overdueHoldsFilter` ($or) and `activeHoldsFilter` ($nor over the SAME branches) as exact
  complements, plus `isHoldBreached` for rows already in hand. Both call sites in `admin.service.js`
  (the dashboard counts ~:349 and the Holds Management list ~:1692) now use them, so Active + Overdue
  always partition the holds. The harness asserts the complement structurally, so the two can never
  drift apart again.
- **2.3 wallet ledger.** `intake-user.service.js adjustWallet` rewritten: one atomic `$inc` guarded on
  sufficient funds for a debit (no overdraw race), then a `WalletTransaction` (`manual-adjustment`,
  SIGNED amount so the ledger sums to the balance, `reason`, `performedBy`, `balanceAfter`,
  `relatedOrderId`). **If the ledger write fails the balance change is rolled back** — the ledger is
  the record, so no silent untraceable movement. Also fixed in passing: both `save()` calls were
  un-awaited; the audit log attributed the action to the CUSTOMER not the operator; and
  `order.userId.fullName` was read off an un-populated ref. Response now returns the created row;
  swagger updated to the new object shape ($ref WalletTransaction).

### 1.1 / 1.2 / 1.4 — ROOT CAUSE FOUND, REPRODUCED AND FIXED (2026-10-07, DB-verified 50/50)

**NEW `stationFlowStaging.js`** (repo root) — walks one order S1→S2→S3 through the REAL services and
asserts, after every move, that the station it LEFT stops listing it, the station it ENTERED lists it,
and **every dashboard count equals the length of the list behind it** (the client's literal
requirement). Run:
`STAGING_OK=1 MONGODB_URL="<testing uri>" node stationFlowStaging.js` → **50 passed, 0 failed.**
Safety-gated like the other harnesses (STAGING_OK, NODE_ENV, hard-refuses `laundrydb`); cleans up.

**THE HAPPY PATH WAS NEVER BROKEN.** Scenarios 1–8 pass on clean data: push → pending → confirm moves
the pieces, counts track lists exactly, a partial release shows 2 at S2 and 3 at S3 with no piece in
two places, and the order leaves S2 entirely once the last piece goes. So 1.1 was never "the queues
are wrong in general".

**THE ACTUAL CAUSE (scenario 12 reproduces the client's verbatim error string):**
`isWholeOrderGate(fromIdx, toIdx)` is `fromIdx === 0 || toIdx === SEQ.length - 1`, and the only
ordering rule on a push is `toIdx > fromIdx`. **A push may therefore SKIP a station** — which is
deliberate and must stay (a wash-only order legitimately goes S3→S5). But nothing invalidated an
earlier pending handoff when the same items left by the new route. So:
1. push S1→S2 → handoff H1 pending; 2. push S1→S3 → H2; 3. S3 confirms H2, pieces land at S3, the
order reads "washing"; 4. **H1 is still pending** → still drawn in S2's Incoming handoffs;
5. S2 taps Accept all → `isWholeAt(INTAKE)` is false → *"intake-and-tag-station →
sort-and-pretreat-station must move the whole order — all items must still be at
intake-and-tag-station"*. **That is item 1.2's screenshot exactly, and explains why
OSC-20261004-631233 showed at S3 Washing while sitting in S2's Incoming list.**

**THE FIX (three parts, all verified):**
- `HandoffSchema.status` gains **`superseded`** (+ `supersededAt`, `supersededBy`). A new push
  supersedes any earlier PENDING handoff from the same `fromStation` whose itemIds intersect it, and
  logs an Activity row. The stale card never reaches the screen.
- `confirm` checks staleness BEFORE the gates: if every claimed item has left `fromStation`, it marks
  the handoff superseded and returns a plain sentence naming where the items went, instead of the
  dead-end gate error. The `status !== 'pending'` guard now distinguishes confirmed / rejected /
  superseded rather than always saying "already confirmed".
- `pendingQueue` is **self-healing**: a pending handoff whose items have all left is never listed, and
  the read persists the supersede. **This clears the client's two already-stranded orders with no
  migration** — scenario 13 writes the damage straight to Mongo and proves the next read fixes it.

**1.4 ALSO FIXED (the part that was really backend).** S2's nine identical guards all returned
*"Order not found or not in sort & pretreat stage"* — three different situations behind one
meaningless sentence, which is exactly the brief's "a button that fails always shows a message that
says why". NEW `explainNotAtSort(orderId)` in `sortAndPretreat.service.js` does one extra read and
returns e.g. *"Order OSC-… is no longer at sort & pretreat (it is now at "queue"), so it cannot be
changed from this station."* Flag and Hold themselves were verified to work (scenarios 9–10) — they
were being refused, and the refusal was unreadable.

### 4.4 DB-VERIFIED + 4.5 ANSWERED (2026-10-07). NEW `holdsStaging.js` 22/22.
4.4's fix was only ever verified STRUCTURALLY (the filters are exact complements). Running it against
the real endpoints proved the client's literal test — **3 breached holds and nothing else → Active 0,
Overdue 3** — and that each card's list length equals the card.
- **IT ALSO FOUND TWO MORE COPIES OF THE SLA TABLE.** `util/holdSla.js` was created for 4.4 as the ONE
  definition, but the per-row **"SLA Breached" badge** in `getHoldOrders` AND the **order-detail**
  `holdMeta` each kept their own hardcoded `120/240/360` minutes — and **both ignored the
  past-delivery-date branch**. So the same order could be counted Overdue by the card and rendered
  "not breached" on its row and on its detail screen. That IS part of the client's screenshot
  (a row badged SLA Breached sitting under Active). All three now call `isHoldBreached`; briefCheck
  asserts no hardcoded minute threshold survives anywhere in `admin.service.js`.
- The harness PARKS any pre-existing holds for the run and restores them, so "and no others" is
  literally true without damaging the target DB.
- **4.5 needed no code change.** `dormantRate = count(stage=dormant AND totalOrders>=1) ÷ count(totalOrders>=1)`
  = 4÷4 = 100%, which is arithmetically valid and TRUE: every delivered customer has been quiet >30
  days. Answered in full, with the one decision the client must make (keep "share of customers" and
  rename the card, vs switch to a pipeline measure over all profiles) — plus whether 30 days is right.

### §3 ANSWERS — Q1, Q2, Q3 WRITTEN (`context/CLIENT-ANSWERS-oct2026.md`)
All three in the client's requested form (rule in plain words · exact condition · worked example).
**The two facts that explain all three of their "unexplained" CRM values:** (1) `totalOrders` counts
DELIVERED orders, while the STAGE moves at BOOKING; (2) the 30-day dormancy scan OVERRIDES the
count-based stage, so a repeat customer who goes quiet leaves Active/Loyal entirely.
- **First Order 8 vs Customers 4** → 8 have booked, 4 have been delivered to. Both right.
- **Lead revenue ₦19,500 > total ₦18,300** → the lead report counts BOOKED value, the CRM dashboard
  accrues on DELIVERY. Booked always runs ahead. (Plus the lead report excludes cancelled/recovery and
  zeroes subscription draw-downs.)
- **Repeat 50% with Active+Loyal 0** → repeat is counted from `totalOrders`; Active/Loyal are STAGES,
  and all 4 customers are in Dormant.
- **Q1 flagged three things worth the client's decision:** avg daily revenue divides by *days that had
  revenue*, not 7 (so it is "an average trading day"); avg daily revenue per item is an average of
  DAILY RATES, not total÷total (the two differ: ₦1,750 vs ₦1,636 on the worked example); and
  **avg processing time's day filter is "record last modified today", so editing an old delivered order
  pulls it into today's average — we called that a flaw, not a design choice.**

### GROUP 4 — 4.1/4.2/4.3/4.6 DONE (2026-10-07). NEW `templateStaging.js` 27/27.
Client's Group 4 text re-confirmed against this plan on 2026-10-07: identical, with two details added —
4.3's test wants the notice to name **customer + amount + operator** (it does), and 4.6 includes
**station** names as well as item names.

**4.1 — REPRODUCED. The 400 was `post.channels.filter is not a function`.**
`updateTemplate` (and `createTemplate`) called `.filter` straight on `post.channels`. A channel picker
that sends a single value as a **string** (`channels: "sms"`) instead of an array throws a TypeError,
the catch-all turns it into *"Failed to update template"*, and every save looks rejected. **That is the
answer to "what is the 400 rejecting" — nothing in the template; the shape of one field.**
- Fixed via `normalizeChannels()` (string or array, de-duped, unknown values named with the valid list).
- **Found two more by running the client's test:** (a) a whitespace-only `body` SAVED — Mongoose
  `required` passes on `"   "`, so a template could be blanked and would then render empty to every
  customer; now refused by field name. (b) `createAuditLog` runs after `template.save()` and rethrows,
  so an audit problem reported a saved template as failed — the 2.5/3.1 shape again.
- Model rejections now name the field (`describeTemplateError`), and the PUT of a WHOLE object (the
  common admin-UI pattern) is proven to save and survive a reopen.

**4.2 — NEW `GET /api/communication/templates/meta`** (adminAuth) backs both dropdowns.
`util/commMeta.js` holds the written answer the client asked for, **derived from what the code actually
sends, not invented**: 5 target pages and 13 placeholder keys, each with one line.
- `{{name}}`/`{{firstName}}` are UNIVERSAL (filled from the user doc by `CommunicationService.render`).
  **Every other key is supplied by one specific system** for one template key, so each carries
  `onlyFor` — using it elsewhere prints the raw `{{key}}` to the customer. A key an admin typed that no
  system supplies comes back `unresolved: true` so the editor can warn.
- Template keys in use: `offer-available`, `referral-reward`, `referral-level-up`,
  `referral-monthly-benefit`, `complaint-update`, `generic-announcement`.

**4.3 — the notice already names customer, amount and operator.** The list they asked for, derived by
scanning all 87 notification call sites: **only 6 reach an admin** — wallet adjusted, wallet adjustment
request, the two approve/reject notices, plus pickup-failed and delivery-failed (new in 3.2).
Everything else goes to the customer or to one named staff member/station.
- **FOUND WHILE ANSWERING IT: `admin.service.js` kept its OWN wallet add/deduct code** —
  `wallet.balance += amount` after a separate read (the non-atomic overdraw race 2.3 fixed), a ledger
  line with no `performedBy`/`balanceAfter`/`manual-adjustment` type, and no rollback. Both paths now
  delegate to `WalletAdjustmentService.applyAdjustment`, so an admin's adjustment and an operator's
  write identical ledger lines — which was 2.4's whole design point.

**4.6 — the phone normaliser WAS the profile-splitter.** `normalizePhone` only stripped a `234`
prefix, so the bare 10-digit form `8031234567` came back **unchanged** and did not match `08031234567`.
CRM links identity by normalised phone, so that one gap is enough to make one person two profiles —
exactly the client's two orders. Now canonical `0` + 10 digits; all seven real-world forms
(`0803…`, `803…`, `+234803…`, `234 803…`, `0803-123…`, `00234803…`, `+234 (0) 803…`) normalise
identically, and it is idempotent. Applied on WRITE at signup, customer booking and staff intake, plus
NEW `phoneFormatBackfill.js` (idempotent, `--dry`) which also **reports CRM profiles already split**
across one number — it does not merge them, because choosing which history survives is a business call.
- Names: NEW `util/displayName.js`. `prettifyName` turns the stored slug into
  `"Shirts / Tops / Blouses"`, `stationLabel` turns `intake-and-tag-station` into `"Intake & Tag"`.
  Applied in `util/itemSummary.js`, which is the shared brief builder behind EVERY station card, the
  dispatch tag and the handoff payloads — so the name reads the same at S1, S2 and S3 (their test).
  **Shape note for the FE: briefs now carry the readable form in `name` and the stored slug in a new
  `rawType`.** Anything matching on the slug must read `rawType`.

### GROUP 3 — DONE (2026-10-07). NEW `dispatchStaging.js` 37/37 → 46/46 with the landmark rule.

**3.1 "assigning a rider does not save" — the triage guess (the dispatch-tag gate) was WRONG, and the
real cause is worse: NOTHING checked that the id in the URL was a rider.**
`riderId` came off the route param and went straight into `$set` with `runValidators: false`. Two
failure shapes, and the second is exactly the client's words:
- not an ObjectId → Mongoose CastError on the `$set` → the catch returns "Failed to assign rider to
  order" and nothing IS written;
- **a valid ObjectId that is not a rider** (a customer, a stale/deleted staff id) → **the write
  SUCCEEDS**, but the queue populates the ref to `null`, so the row comes back reading
  `needsRider: true` again. The assignment is in the database; the screen cannot show it.
- **ROOT CAUSE UPSTREAM: there was no endpoint anywhere that listed riders** — `ROLE.RIDER` appeared in
  NO service, controller or util. The picker had no authoritative source for its ids.
- FIX: NEW `GET /api/intake-user/riders` (active riders, `?search`, `?includeInactive`, each with
  `activePickups`/`activeDeliveries`/`activeRuns` so work can be spread); NEW `resolveRider()` refusing
  by name before any write ("STG Customer is not a rider, so the order cannot be assigned to them.");
  the assigned rider is RETURNED so the row can be redrawn without a refetch.
- **Also the 2.5 false-failure class again:** the activity row, the rider's notification and the audit
  line all run AFTER the write and each rethrows, so any of them failing reported a completed
  assignment as failed. All three now go through `logSafely`. Both legs (pickup + delivery) fixed.
- The dispatch-tag gate is UNCHANGED and still refuses with `needsDispatchTag` (harness asserts it).
  **Since it is now deployed, it IS what they will hit next** — the FE must branch on that flag.

**3.2 Failed pickups — the filter did not exist, and neither did the data behind it.**
- `legStatus` query filter on both dispatch queues (comma-separated, unknown values **refused** with
  the valid list rather than silently returning everything), plus `failedCount` beside
  `needsRiderCount`, and `legStatus`/`failed`/`legNote` on every row. **`legStatus=failed` IS the
  Failed Pickups view.** A failed pickup keeps its PENDING stage AND its rider, so until now it sat in
  the queue indistinguishable from a healthy assigned run.
- **`dispatchDetails.pickup.note` WAS NOT A SCHEMA PATH.** `markPickupAsFailed` wrote it and Mongoose
  strict mode silently dropped it — **every failed pickup ever recorded lost the rider's reason.**
  Found by RUNNING the harness, not by reading. NEW `failureNote` on both legs.
- **And on the delivery leg the reason was overwriting `delivery.note` — the customer's special
  delivery instruction, which is the line the DISPATCH TAG PRINTS.** A failed delivery would put
  "customer not at home" on the reprinted tag as an instruction to the next rider. Now separate fields.
- **Nobody in the office was ever told.** Both failure handlers called
  `createNotification({ userId })` with the RIDER's own id — the person who just pressed the button —
  and no one else. Now `notifyRoles([intake-and-tag, customer-experience, admin])`. Harness asserts
  the office count goes up and the rider's does NOT.
- `NOTIFICATION_TYPE.DELIVERY_FAILED` did not exist (there was a `PICKUP_FAILED`), so every failed
  delivery was filed under the default `system`. Added.
- **NEW `util/notifyRoles.js`** — "notify everyone with role X" existed as three near-identical copies
  (admin.service's station operators, walletAdjustment's `notifyAdmins`, and this). One implementation
  now; `notifyAdmins` delegates to it. It can never throw, and it now skips suspended staff.

**3.3 Landmark — the field was always there; one list never shaped it.**
- `getRiderAssignedPickups`/`getRiderAssignedDeliveries` were the ONLY dispatch lists that never called
  `normalizeOrderAddresses`, so a legacy string address arrived with no `landmark` key at all — while
  Active Pickups, the same order one tap later, showed it. Both now normalize, select explicitly, and
  lift `pickupLandmark`/`deliveryLandmark` onto the row. The S1 queue gained `landmark` too.
- **ANSWER TO THE USER'S QUESTION: no, the customer is NOT asked for a landmark when booking.**
  `bookOrder.service` requires only `pickupAddress.address`; label/landmark are optional on the
  customer path (staff intake requires all three via `validateStructuredAddress`). Hard-requiring it
  would break every live app build that does not send it, so instead: NEW
  `enrichFromSavedAddresses()` — when the booked address matches one of the customer's SAVED addresses
  (where `landmark` IS required on the schema), the landmark and label are borrowed automatically; and
  rows that still have none carry **`landmarkMissing: true`** so the office can chase them. The
  booking request body now documents that the app should collect it. **One-line change to make it
  mandatory once the app sends it — the client's call.**

### 2.5 — DONE (2026-10-07). NEW `planCreateStaging.js` 39/39. **A REAL BUG: the plan WAS created.**

**"It says the plan cannot be created" — and every time, the plan was already in the database.**
`createPlan` writes the plan, THEN calls `createAuditLog`, which **rethrows** on failure. The audit row
carried **`category: 'subscription'`** — and **`'subscription'` was never in `AUDIT_LOG_CATEGORIES`**
(order/payment/wallet/dispatch/system/auth/pressing/qc/rider/user/sort/wash/crm/communication/offer/
recovery). So Mongoose rejected it with an enum ValidationError, the method's catch returned the
generic *"Something went wrong. Please try again later"*, and the admin's retry then hit **"Plan title
already exists"** — a screen that looks completely broken while working perfectly.
- **A repo-wide scan found exactly four such sites, all in `subscription.service.js`** (createPlan,
  updatePlan, deletePlan, cancelSubscription — lines 60/99/126/253). Every other `category:` string in
  the repo is a valid enum member. So update and delete had the identical false failure, and a
  cancellation reported failure after Paystack had already been told.
- **FIX 1 — `AUDIT_LOG_CATEGORIES.SUBSCRIPTION`.** The four call sites were right; the enum was
  incomplete. briefCheck now asserts that **no hardcoded category string remains in the file**, so a
  fifth call site can't reintroduce it with a new word.
- **FIX 2 (the structural one) — an audit log may never reverse the outcome the operator is shown.**
  New `auditSafely()` wrapper: the log failure is printed and swallowed. Applied at all four sites,
  each with the comment stating that the data is already written past that point. `createAuditLog`
  itself is **unchanged** — 127 other call sites share it and that is a separate, wider call.
- **FIX 3 — real failures now NAME themselves.** New `describeDbError()` maps duplicate-key (11000) →
  *"Plan title already exists"*, ValidationError → the field, CastError → the field and type. The plan
  write has its own try/catch, so the `title` unique index rejecting (two admins, same title, same
  moment — the pre-check is a read, not a lock) reads as a conflict instead of a server error.
- **FIX 4 — the validation rules contradicted the model, in both directions:**
  **`paystackPlanCode` is `required: true` on `plan.model.js` but was NOT validated**, so omitting it
  produced the generic error with no clue; now `string|required`. And **`itemPerMonth` was
  `integer|required` while the model field is COMMENTED OUT** (`monthlyLimits` replaced it) — the
  screen was being refused over a field the backend then threw away; now optional, and removed from the
  swagger `Plan` schema and the create-plan required list.
- **`updatePlan` gained `runValidators: true`** (a negative price or a clashing rename used to save
  silently or fail generically) and now **returns the saved plan**, so an edit screen can reload the
  authoritative row — the same gap as 2.1's missing `GET /offers/:id`.
- Fixed in passing in `cancelSubscription`: `error.response.data.message` threw on a network/timeout
  failure and landed in the outer catch, which said *"Failed to cancel plan"* — the wrong reason
  entirely; and that catch's log read `'Create plan error:'` (copy-paste).
- **Swagger:** create-plan's 400 was a `success`+`error` sibling block → now `$ref ErrorResponse`;
  update/delete gained real example-filled response shapes. Spec **56 schemas / 285 paths, 0 wrong
  envelopes**. **FOUND: a 4th envelope variant exists in the docs — 15 blocks with `success` + `error`
  as SIBLINGS** (the earlier three sweeps only looked for `success`+`message`). Docs-only, pre-existing,
  listed in session.md; not fixed here.
- **`planCreateStaging.js`** runs the client's own test plus the regression that matters: with
  `AuditLogModel.create` stubbed to throw, create/update/delete must STILL report success and the data
  must be there. Also: missing paystackPlanCode names the field, duplicate titles leave exactly one
  plan, a bad edit doesn't touch the stored price.

### 2.4 — DONE (2026-10-07). NEW `walletLimitStaging.js` 39/39, running the client's own test.

Per-role wallet adjustment limits with admin approval above them.
- **NEW `models/walletAdjustmentRequest.model.js`** + `WALLET_ADJUSTMENT_REQUEST_STATUS`
  (pending|approved|rejected). Stores `requestedByRole` AND **`roleLimitAtRequest`** — the limit AT
  THE TIME — so changing the setting later never rewrites the history of why approval was needed.
- **NEW `services/walletAdjustment.service.js` owns ALL manual balance movement.** This is the
  important design point: an operator adjusting within their limit and an admin APPROVING an
  over-limit request go through the SAME `applyAdjustment`, so an approved ₦10,000 and an allowed
  ₦3,000 produce identical ledger lines. A second copy for approval would have quietly undone 2.3.
  The 2.3 money code (atomic `$inc`, overdraw guard, ledger write, rollback on ledger failure) MOVED
  here; `intake-user.adjustWallet` now delegates.
- **Limits live in `AdminSetting.walletAdjustmentLimits`** — a **Map** of role→naira, defaulting
  intake-and-tag 5000 / customer-experience 10000, i.e. the client's own numbers. A Map, not named
  fields, so a new role gets a limit by editing settings rather than by a deploy ("It must not be
  fixed in the code, because we will change it"). `updateAdminSettings` already `$set`s whatever it
  is given, so no service change was needed. **A role with NO entry gets 0** — everything it does
  becomes a request, which is safer than inventing a default. **Admin is never limited.**
- **Over the limit returns SUCCESS, not failure** (`requiresApproval: true` + requestId + the limit).
  Telling the operator it "failed" would invite a retry and stack duplicate requests.
- Admin endpoints: `GET /api/admin/wallet-adjustment-requests` (defaults to pending),
  `POST .../:id/approve`, `POST .../:id/reject` (**note REQUIRED** — a rejection with no reason
  leaves the operator nothing to act on). Approval **claims the request atomically BEFORE** moving
  money so two admins can't pay twice, and **returns it to pending if applying fails** rather than
  leaving it reading as approved. Swagger `WalletAdjustmentRequest` schema added (56 schemas).
- **Brief 4.3 partly done here too:** admins are now notified of every adjustment AND every request
  (`notifyAdmins`, fire-and-forget).
- Verified the client's exact test (₦3,000 goes through at a ₦5,000 limit → ₦10,000 becomes a request
  with the wallet unchanged → admin approves and it moves → raise the limit in SETTINGS and the same
  ₦10,000 goes straight through), plus: no double-pay, reject-without-note refused, a role with no
  limit, an over-balance debit refused at approval with the request returned to pending, and the 2.3
  invariant **balance == sum of its ledger lines** across every line.
- **`briefCheck.js` updated** to assert the money guarantees where they now live (34/34).

### 2.2 — DONE (2026-10-07). NEW `freeLogisticsStaging.js` 23/23. **A REAL BUG, now fixed.**

**"Free pickup and delivery is offered, but ₦2,000 is still charged" — root cause found:**
`bookOrder.service._priceWithOffers` returned EARLY unless the customer had SELECTED an offer:
```js
if (!post.customerOfferId && !post.promoOfferId) return { finalTotal: itemsSubtotal + extraDeliveryCost, breakdown: null }
```
A **BASELINE** offer (the client's "General") is applied BY RULE with **no linkage and no id for the
customer to send**, so that early return skipped every one of them. `offer.service.validateAndPrice`
evaluated baselines correctly all along (`:729-743`) — **booking simply never asked it.** The app
advertised the offer and then charged the fee. Fix: always call `validateAndPrice`; it already
tolerates having no personal/promo selection.
**Finding the terminology mapping (General == BASELINE) is what made this visible** — I had been
treating the client's offers as promotional, which DO carry an id and so were never affected.

**Second half of 2.2 (the display ask, "with the name of the offer"):** `_buildPricing` built
`appliedOffers` from `breakdown.personal` and `breakdown.promotion` only — **baselines were missing**,
so a summary could show "Pickup: Free" with no offer name to explain it. Baselines are now pushed
first with `type: 'baseline'` (model comment + swagger enum updated; note `pricing.appliedOffers.type`
is a genuine field name using the explicit `{ type: String }` form to dodge the Mongoose keyword).

Verified against the client's own three cases plus four guards: above threshold → ₦2,100 items-only,
both legs recorded waived, offer named; below threshold → both fees charged; DRAFT offer → waives
nothing; archived → fees return (no accidental permanent freebie); pickup-only / delivery-only → only
the leg actually taken is waived. All four other gates re-run green afterwards (briefCheck 29 ·
tierPricing 33 · offerAdmin 37 · dispatchTag 46).

**Harness bug worth remembering: the fees live on `AdminSetting`, NOT `AdminOrderDetails`**
(`adminOrderSetting` in `bookOrder.service.js:865` is `AdminSettingModel`). Reading the wrong model
compared every total against ₦0 and produced nine meaningless failures.

### TERMINOLOGY — the client's "General" offer IS `OFFER_TYPE.BASELINE` (user-confirmed 2026-10-07)
`OFFER_TYPE` is `personal | promotional | baseline`. There is **no "general"** in the code. When the
client or an earlier note says **General**, they mean **BASELINE**: a permanent policy applied BY RULE
at booking with no per-customer linkage (`offer.service.js:729-743` — active baselines whose window +
booking rules pass set `freePickup`/`freeDelivery`/discount directly). This is also what
summary.md's deferred Feature 2 meant by "General/Promo offers only".
⇒ "Always Free at ₦8,000" and "First Experience" are BASELINE; "Recovery Thank You" is personal/
promotional. Do not re-derive this.

### 2.1 — DONE (2026-10-07). NEW `offerAdminStaging.js` 37/37, running the client's own test.

**"Offers do not save" was THREE different things, and the save itself was never broken.**
Create and update at `offerApi.service.js` DID persist — the harness runs the client's exact test
(create First Experience / Always Free at ₦8,000 / Recovery Thank You, leave, re-list, edit each,
delete one) and all three survive a re-read. What was actually wrong:
1. **A new offer defaults to `status: 'draft'`.** A list filtered to `status=active` cannot show it,
   which is the "created, then gone after refresh" report. **Not a backend bug** — the admin UI needs
   to either default its filter to all statuses or surface the draft state and an activate action.
   **Tell the client this one is FE + a workflow question, not a lost save.**
2. **There was no `GET /offers/:id`** — list/create/update only. An edit screen had nothing
   authoritative to reload a single offer from, which is the likeliest source of "the offer still
   holds the old details". **ADDED**, and it also returns `linkages {live,total,deletable}`.
3. **There was no delete at all** (confirmed: `page-route.js` had no delete route). **ADDED.**

**`DELETE /api/offers/:id` is conditional, because a `CustomerOffer` links back to its offer** —
hard-deleting one that was handed out would erase the record of a benefit someone actually received:
- never given to anyone → **really deleted** (their "delete a test offer" case)
- only finished linkages (redeemed/expired/cancelled) → **archived**, history kept, response says why
- customers currently hold it → **refused** with `requiresForce:true` + the count; repeat with
  `?force=true` to cancel those and archive. `ARCHIVED` already existed in `OFFER_STATUS`.
An archived offer is out of every customer-facing path exactly like a deleted one.

**`CustomerOffer.cancelledAt` added** (user's call, and right): every other terminal state stamps its
own time, so a cancellation could only be inferred from `updatedAt`, which any later write would
overwrite. Both cancel paths (`cancelLinkage` and the delete sweep) now stamp it; swagger updated.

**Harness bugs the run found (enum guesses — never assume a shape):** `OFFER_TYPE` is
personal|promotional|baseline (no "general"); the benefit field is **`benefitType`**, not `type`
(`type` is Mongoose's reserved keyword inside a subdocument — the same trap already commented in
`pricing.appliedOffers`). A `|| 'general'` fallback silently produced an invalid value, so the
harness now hard-fails if fewer than 3 offers are created rather than limping on.

### 1.6 — DONE (2026-10-07). NEW `tierPricingStaging.js` 33/33. GROUP 1 IS NOW COMPLETE.

Per-item care tier. **This is the one that moved money**, so it has its own harness.

- **NEW `util/itemPricing.js`** — `tierMultiplier` / `tierOfItem` / `priceItems`. The pricing maths
  existed as **THREE near-identical copies** (bookOrder pay-per-item, bookOrder pay-from-wallet,
  intake-user staff path) which **had already drifted**: two defaulted a missing tier charge to `|| 1`
  and the third to `|| 1.5` / `|| 2`, so the same basket priced differently depending on which screen
  created the order. All three now call the helper; the fallback is **1 (no uplift)** everywhere — an
  unconfigured setting must never silently charge more.
- **`items[].serviceTier`** (enum + null default) on `bookOrder.model`. **Absent = follow the order's
  tier**, which is what keeps every existing order and every existing caller byte-identical. Formula
  unchanged: `roundToNearestHundred(price × serviceTypeMultiplier) × quantity × tierMultiplier`, with
  rounding still INSIDE the per-piece unit price.
- Optional validation `'items.*.serviceTier': 'string|in:classic,premium,vip'` on both booking paths.
- `pricing` subdoc gained **`tierLines[]` / `tiersUsed[]` / `isMixedTier`**; `tierMultiplier` is
  **null when tiers are mixed** (no single multiplier describes the order). Swagger updated on the
  schema AND the booking request body.
- `util/itemSummary.js` briefs carry `serviceTier`, so the tier rides onto handoff cards, the dispatch
  tag and every station payload (the brief wants it on the tag and on the card at every station).
- **TWO REAL BUGS FOUND IN THE BUILD:**
  1. **Three `ReferenceError`s.** After the three pricing blocks were replaced, the call sites still
     passed `tierMultiplier: multiplier` — a variable that no longer existed. **`node --check` and a
     `require()` both passed**; only executing each branch caught it. Same lesson as the `isWashed`
     hoist on 2026-10-05: loading a service proves nothing about its method bodies.
  2. **`config/setup.js` seeded the tier charges INVERTED** — `premium: 2, vip: 1.5` against the
     model's own defaults of premium 1.5 / vip 2, so on a freshly seeded DB **Premium cost MORE than
     VIP**. Confirmed live: testingdb prices VIP at ×1.5. Seed corrected. **`setup.js` only seeds when
     the document is MISSING, so existing databases keep the inverted values — CHECK THE LIVE
     `AdminSetting` before telling the client this is fixed there.**
- Verified: uniform-tier baskets price identically to the old formula at all three tiers; a mixed
  basket prices per piece with an attributable uplift; the tier survives the per-piece explosion; the
  receipt carries the breakdown; the staff path agrees with the customer path to the naira; a bad tier
  is rejected.
- **Regression gates all green after the change:** `tierPricingStaging` 33 · `stationFlowStaging` 80 ·
  `briefCheck` 29 · `dispatchTagStaging` 46. Swagger 55 schemas / 282 paths, 0 bad envelopes.

### 1.5 — DONE (2026-10-07). `stationFlowStaging.js` now 80/80, incl. the client's worked example.

**NEW endpoint `PATCH /api/sort-pretreat/order/:id/items/sort`** (`ROUTE_SORT_AND_PRETREAT_BULK_SORT`
→ `SortAndPretreatService.bulkSortItems`, `sortAndPretreatAuth`). One call does the sorter's whole
gesture on ANY subset: `itemIds[]` (or `all:true`), `colorGroup`, `fabricType`,
`pretreatmentOptions[]`, `damageRiskFlags[]`, `itemNote`, `markSorted` (def. true), `sendToWash`
(def. true). The old surface only had per-ITEM (`updateItemSortDetails`, `markItemAsSorted`) and
whole-order (`markAllItemsAsSorted`, which could not set colour/pretreatment at all) — exactly the
client's complaints 1.5.1 and 1.5.2.

- **Pretreatment is no longer a fixed step.** `['no_pretreatment_needed']` sets
  `pretreatStatus: 'not_required'`, which ALREADY satisfies `itemCompleteAt` for S2 — so those pieces
  finish at S2 the instant they are sorted and there is nothing to mark done. The enum value and the
  `not_required` status both already existed; nothing could ever SET them.
- **Fabric type applies to white and coloured alike** (the "White fabric type" wording was only an FE
  label — Bucket C).
- **Colour group / fabric type / pretreatment are required at the moment a piece is marked sorted**,
  not when details are saved, so the operator can still work in stages. Errors name how many pieces.
- `'no_pretreatment_needed'` + another option is refused (it is a choice, not an extra treatment).
- Selecting a piece that is not at S2 is refused and the response NAMES them (`itemsNotAtStation`).
- **ASSUMPTION, STATED:** the brief says the 7 sorted pieces "show in the S3 Wash Queue at once" AND
  that S3 confirms receipt per batch — both are only true if marking sorted also HANDS OVER. So
  completed pieces are pushed to S3 as a normal handoff. `sendToWash:false` opts out. **Flag this to
  the client in the reply.**
- Response carries `itemsLeftAtStation`/`totalItemCount` → the order card's **"3 of 10 left"** line.
- **`markItemAsPretreated` also hands over now** ("those 3 then join the rest at S3") and — **a real
  split-flow bug fixed in passing** — its `allItemsSorted`/`allItemsPretreated`/`readyToSend` were
  computed over EVERY item in the order, so with 7 pieces already at wash `readyToSend` could never
  turn true for the 3 still here. Now station-scoped via `allAtStation`.
- Verified against the brief's own worked example (scenario 14): 10 items → select 7, Colored/Light/
  no-pretreatment → 7 ready, card reads "3 of 10 left", S3 sees a batch of 7 to confirm, S2 shows the
  3 left, those 3 set White/Delicate/Stain-treatment stay at S2, get pretreated, hand over as a
  second batch of 3, all 10 meet at S3 and the order leaves the S2 queue with count == list.

**1.1 KEY INSIGHT — 1.1.1 and 1.2 are ONE incident, and the drafts count was telling the TRUTH.**
`intakeDashboard`'s drafts count and `getDrafts` use byte-identical queries (verified), so 15 staying
15 means the orders genuinely never left `stage.status: QUEUE`. A push S1→S2 only creates a PENDING
handoff — items stay at S1 until S2 confirms — and S2's "Accept all" was failing (1.2). So nothing
moved, and the count was right. **Do not "fix" the drafts count.** Fix the confirm.

**RESOLVED — see above. (Was: needs a DB reproduction, not more reading.)** Original note: Why order
OSC-20261004-631233 can show at S3 as Washing while an S1→S2 handoff is still pending is not
derivable from the code alone (only `handoff.service.js:322` ever assigns `currentStation`). Ask the
user for the testing DB URI and extend `handoffStaging.js` to walk one order S1→S2→S3 asserting list
AND count membership at every step. **Never edit `.env` (it points at the LIVE `laundrydb`) — pass
`MONGODB_URL` inline.**

## BUILD TODOS

### Fixes — Group 1 (blocks all their testing)
- [x] F1.1 — DONE (S3 dashboard list matches its count; stale handoffs superseded + self-healing;
      DB-verified 50/50). NOT needed after all:  unify station membership on `items[].currentStation`; scope S2's ~15 `stage.status`
      queries; recompute counts from the list query; void stale pending handoffs.
- [x] F1.2 — DONE. Root cause was a station-skipping push stranding an earlier handoff; reproduced
      and fixed. Whole-order gate kept; refusals now explain themselves.
- [x] F1.4 — DONE (backend half): flag/hold verified to work; the 9 catch-all S2 refusals replaced
      with explainNotAtSort(). The "show the error in the UI" half stays with the FE (Bucket C).
- [x] F1.5 — DONE. NEW bulk sort endpoint (`itemIds[]`+colour+fabric+pretreatment) + "no pretreatment
      needed" goes straight to the S3 wash queue + the three split-order confirmations the client asks
      about (S3 confirms per batch · S5 doesn't close until every item arrived, shows "7 of 10" ·
      customer still sees ONE order with ONE status).
- [x] F1.6 — DONE. Per-item care tier + shared util/itemPricing.js. Own harness tierPricingStaging.js 33/33.
### Fixes — Group 2  ← NEXT
- [x] F2.1 — DONE. DELETE + GET /offers/:id + CustomerOffer.cancelledAt. offerAdminStaging.js 37/37.
      Draft-vs-active list behaviour is FE/workflow, not a lost save — say so to the client.
- [x] F2.2 — DONE. Baselines were skipped at booking (early return in _priceWithOffers) + missing
      from appliedOffers. freeLogisticsStaging.js 23/23.
- [x] F2.3 — wallet adjustment writes a `WalletTransaction` (CONFIRMED BUG). DONE + swagger.
- [x] F2.4 — DONE. AdminSetting.walletAdjustmentLimits (Map) + WalletAdjustmentRequest + shared
      walletAdjustment.service. walletLimitStaging.js 39/39.
- [x] F2.5 — DONE (code). The plan WAS being created; the audit log then threw and the catch
      reported failure. See the section below. NEW `planCreateStaging.js` — needs the testing URI.
### Fixes — Group 3
- [x] F3.1 — DONE. **The triage guess was WRONG** — the dispatch-tag gate is not in `main`, so it
      cannot be what the client hit. Real cause: nothing validated the rider id. NEW
      `GET /intake-user/riders` + `resolveRider` + non-fatal side effects. See below.
- [x] F3.2 — DONE. `legStatus` filter + `failedCount` + `failed`/`legNote` on the row, and the
      failure notification now reaches the OFFICE instead of the rider who pressed the button.
- [x] F3.3 — DONE. The rider's assigned-pickups/deliveries lists never normalized addresses.
### Fixes — Group 4
- [x] F4.1 — DONE. The 400 was `channels.filter is not a function` (a string, not an array). Plus a
      blankable required field and an audit write that could fail the save.
- [x] F4.2 — DONE. `GET /communication/templates/meta` + `util/commMeta.js` (the written list).
- [x] F4.3 — DONE. Notice names customer+amount+operator; event list derived (6 of 87 sites reach an
      admin); admin.service's own wallet money code routed through the shared mover.
- [x] F4.4 — holds Active excludes Overdue (CONFIRMED BUG). DONE via NEW `util/holdSla.js`.
- [ ] F4.5 — blocked on Q2/Q3; answer in §3.
- [x] F4.6 — DONE. `util/displayName.js` in the shared brief builder; `normalizePhone` fixed (it was
      the profile-splitter), applied on write, + `phoneFormatBackfill.js` which reports split profiles.
### New features
- [ ] N1 — Quick Booking (count-only booking → rider confirms count + photo → S1 finalises with real
      items + per-item tier → payment request → processing starts only after payment; <₦4,000 charged
      pickup+delivery; cancellation refunds full to wallet).
- [ ] N2 — Recovery/Complaints/Feedback dashboard (month picker + cards, built like Monthly Lead
      Report). NEW: NPS 0–10 question, max once per 30 days per customer. Cards: NPS, avg rating,
      feedback received (+ share of delivered), complaints opened/resolved/still-open/avg-time-to-
      resolve, recoveries given/cost/ordered-again. Plus complaints by type + a list of 1–2★ orders.
      Their worked example must come out at avg 4.3 · NPS 40 · feedback 10 = 50%.
### Answers (LAST)
- [ ] Q1 dashboard figures (avg daily revenue, avg processing time, avg daily revenue per item, hold
      duration before expiry)
- [ ] Q2 CRM dashboard figures + their 3 unexplained screen values (First Order 8 vs customers 4;
      lead revenue ₦19,500 > total ₦18,300; repeat 50% with Active+Loyal both 0)
- [ ] Q3 customer stages · [ ] Q4 two entry paths · [ ] Q5 lead follow-up scheduling ·
      [ ] Q6 queue card order · [ ] Q7 offers & orders · [ ] Q8 feedback & complaints today
- [ ] Assemble the SINGLE copy/paste block (§1 status · §2 status · §3 answers).

**Known traps for the answers:** `totalOrders` counts DELIVERED orders, but a lead moves to stage
`first-order` at BOOKING (`crm.service.js ~:397`, counter increments ~:428) — that alone explains
Q2's "First Order 8 vs customers 4". The 2026-07-15 `crmBackfill.js` batch and the absence of a
profile-origin marker before `leadSource` shipped (2026-09-24) distort historical months. See
`context/summary.md` + the chuvi-crm-data-caveats memory.

---

# PREVIOUS Feature (DONE 2026-09-29): CHUVI Dispatch Tag (+ 2 carried-over debts)

**STATUS 2026-09-24: ALL THREE PARTS CODE-COMPLETE. Offline-verified 119/119 across three harnesses
(`tzCheck` 14 · `dispatchTagCheck` 88 · `subRevenueCheck` 17). Swagger 55 schemas / 281 paths, all
routes load. Only DB verification (A8 / C5-live) is outstanding. UNCOMMITTED on `mesage-and-alert-fix`,
on top of the still-uncommitted Monthly Lead Reporting.**

Client answered Q1-Q6 (locked below); Part B1 was ours to decide (a deploy/config call, deliberately
kept out of the client questions) and is now done in code.

Three things in this package: **Part A** the new
client brief "CHUVI Dispatch Tag — Simple Explanation", plus the two items deliberately left open by
the Monthly Lead Reporting feature — **Part B** the Lagos/UTC timezone split-brain and **Part C**
subscription-purchase revenue. B and C are now IN PLAN rather than merely flagged.

---

## Part A — Dispatch Tag (new client brief)

One tag **per order**, printed **only** when an order is leaving the office by **rider delivery**.
It is NOT the intake item tag (per-piece, `items[].tagId`) and NOT a reprint of it. Its job is
positive identification at the customer's door: the rider is handing goods to someone they have never
met, somewhere they don't control.

### The brief's required fields — ALL already exist on the order (verified)
| Brief field | Source | Note |
|---|---|---|
| Customer full name | `bookOrder.fullName` | required on the model |
| Customer phone | `bookOrder.phoneNumber` | required |
| Delivery address | `bookOrder.deliveryAddress` | `Mixed` — structured `{label,address,landmark}`, tolerant of legacy strings → render via `util/address.js` |
| Order reference | `bookOrder.oscNumber` | required + unique + indexed |
| What's in the order | `bookOrder.items[]` | **per-piece since the explosion work** → `items.length` IS the true piece count; reuse `handoff.service`'s `summarize()` for "5 Shirts, 3 Trousers" |
| Amount due, if collecting | `paymentStatus` + `amount` + `logisticsFee` | see the amount-due rule below |
| Special delivery note | `dispatchDetails.delivery.note` | already on the model |

**No schema change is needed for the tag's CONTENT.** Only the print record itself is new.

### Where it hooks in
`qc.service.packAndSealComplete` ([qc.service.js:665](../services/qc.service.js#L665)) is today's
"packed, confirmed, ready to leave" moment — it sets `ORDER_STATUS.READY`, fires the customer
"ready for delivery" notification, and fires `crmOnOrderReady(order)`. The dispatch tag belongs at
exactly this transition. **See Q1 — whether printing GATES that transition is the one decision that
changes the shape of this build.**

### Amount-due rule (needs care)
`PAYMENT_METHOD.PAY_ON_DELIVERY` is **commented out** in `util/constants.js:114` — there is no
cash-on-delivery machinery in this backend at all. So today "amount due" resolves to:
- `paymentStatus === success` → **nothing to collect** (print no amount, not "₦0", so the rider never
  reads a zero as "collect ₦0")
- otherwise → outstanding = `amount` (+ any unpaid `logisticsFee`). The realistic live case is a
  **card booking whose Paystack webhook never confirmed** — the bot deliberately leaves those PENDING.
- Subscription draw-downs have `amount > 0` but `paymentStatus: success` → nothing to collect. Branch
  on `paymentStatus`/billing path, **never on `amount > 0`**.

### Design
- **New subdoc `bookOrder.dispatchTag`** — `{ ref, printedAt, printedBy, printCount }`. `ref` derives
  from `oscNumber` (no second numbering scheme to reconcile); `printCount` makes reprints visible.
- **Gate the tag on `order.isDelivery === true`.** Careful with the vocabulary clash: in this codebase
  `isPickUp` = *we collect from the customer*, `isDelivery` = *we deliver to the customer*. The brief's
  "a pickup doesn't need it" = the customer collects from the office = `isDelivery === false`.
  A non-delivery order must be **refused with a clear reason**, not returned empty.
- **Two endpoints**, beside the existing pack-and-seal routes (`ROUTE_QC_PACK_AND_SEAL_*`):
  - `GET /qc/order/:id/dispatch-tag` — build + return the payload (safe, repeatable, no writes)
  - `POST /qc/order/:id/dispatch-tag/print` — record the print (`printedAt`/`printedBy`/`printCount++`),
    `ActivityModel` entry + `createAuditLog`, idempotent-friendly
- **Rendering stays FE-side.** This repo is an API with no PDF/barcode dependency (only `ejs`, for
  email). Backend returns a structured, fully-resolved payload; the FE/label printer renders it. Going
  server-rendered would mean a new dependency and a print-layout owner — not in the brief.
- **Swagger** `DispatchTag` schema in `swagger/schemas.js` + both routes, example-filled per the repo rule.

### LOCKED CLIENT ANSWERS (2026-09-24) — all six in
- **Q1 → tie the gate to RIDER ASSIGNMENT, not to READY.** Client took the recommendation: `READY`
  keeps firing at pack & seal (customer message goes out immediately, no delay), but **an order cannot
  be assigned to a specific rider until its tag is printed.** Client's reasoning: nothing leaves the
  building without a tag, customer communication isn't held up, and nothing sits invisibly stuck —
  because it simply won't be assignable until someone notices and prints it.
  **⇒ `packAndSealComplete` is NOT touched at all.** The gate goes in `assignRiderTopDeliveryOrder`.
- **Q2 → option (a): the amount line is a FLAG, not a collection instruction.** Laundry is always
  prepaid (card / wallet / subscription); there is no cash-on-delivery workflow and none is being
  built. The line exists only for the occasional order whose payment didn't go through, so the rider
  knows to **prompt the customer to settle in the app**. No reconciliation work needed.
  **⇒ the printed wording must say that**, or a rider will read a figure as "collect this".
- **Q3 → reprints allowed, every one logged with timestamp + count**, and "if an order shows five
  reprints that should be visible and flaggable on our side" ⇒ `printCount` must surface on the S1
  screen, not just sit in the audit log.
- **Q4 → S1 (intake-and-tag) prints, never the rider.** Client's reasoning: S1 physically handles the
  ready, bagged order and hands it to the rider, so the tag is generated at that same handover step by
  the same person. **VERIFIED CORRECT against the code** — S1 already owns delivery rider assignment
  (`assignRiderTopDeliveryOrder`) and in-person collection (`intake-user.service.js:2148`), so S1 is
  genuinely front-of-house order RELEASE. **⇒ auth is `intakeUserAuth`, NOT `qcAuth`.**
- **Q5 → no barcode/QR now** (no scanners at any station yet); likely in V2 when operators move onto
  scanners. Client asks only that the **tag layout leave room** for one later. ⇒ nothing to build
  server-side; the payload already carries `ref` for a future barcode, and this is an FE layout note.
- **Q6 → first payment ONLY, never renewals.** See Part C.

### REWORK — DONE 2026-09-24. All four items applied; verified 88/88.
A1-A5 + A7 were built BEFORE the answers came back, assuming QC would print. Q4 says S1. So:
- [x] **R1 — the endpoints move from QC to S1.** `getDispatchTag`/`printDispatchTag` come out of
  `qc.service.js` and the two routes come out of `routes/qc.js` (`qcAuth`), and land in
  `intake-user.service.js` / `routes/intake-user.js` under **`intakeUserAuth`**. Leaving them on QC
  would give the tag to a role the client says does not do the handover.
- [x] **R2 — the payload builder goes to a shared `util/dispatchTag.js`.** It is a pure function over an
  order; putting it in a util keeps it out of whichever service happens to expose it, and lets the
  rider-assignment gate reuse the same "is this tagged" definition. Move `_dispatchTagOrder`,
  `_amountDue`, `_buildDispatchTagPayload` there, and drop the three `util/address` /
  `util/itemSummary` / `PAYMENT_ORDER_STATUS` imports added to `qc.service.js`.
- [x] **R3 — the amount line must be re-worded for Q2.** `amountDue: 4500` alone invites a rider to collect
  ₦4,500 in cash, which is exactly what the client says never happens. Add an explicit
  `paymentState: 'paid' | 'unpaid'` and a `paymentNotice` string (e.g. *"Not paid — ask the customer to
  settle in the app"*), so the printed tag can never read as a cash instruction. Keep `amountDue` as
  the number/null for display.
- [x] **R4 — page-route keys renamed.** `ROUTE_QC_DISPATCH_TAG*` → `ROUTE_DISPATCH_TAG*` (they are no
  longer QC routes), and the paths move under the intake-user mount.
      **Live paths: `GET|POST /api/intake-user/order/:id/dispatch-tag[/print]`** under `intakeUserAuth`.
- **Unchanged and still correct:** the model field, the two gates' logic, the amount-due rule
  (`amount` alone — see the note below), the per-piece contents line, `util/itemSummary.js`,
  `util/lagosDay.js`, `ACTIVITY_TYPE.DISPATCH_TAG_PRINTED`, and the 48/48 harness (it drives the
  builder, so it survives the move with an import change).

### BUILD TODOS (Part A) — A1-A5 + A7 built 2026-09-24 (offline 48/48) but SEE REWORK ABOVE
- [x] A1 — `bookOrder.model.js`: `dispatchTag { ref, printedAt, printedBy, printCount }`. Stays ABSENT
      until the first print, so `printedAt` is the test for "tagged for dispatch".
- [x] A2 — payload builder in `qc.service.js` (`_buildDispatchTagPayload`): all 7 fields, address via
      `normalizeAddress`, contents via the shared `summarize()`, amount-due per the rule above.
- [x] A3 — `_dispatchTagOrder` holds BOTH gates in one place (shared by the read and the print) so
      "may this order have a tag" has a single definition. Refuses with the reason, never an empty tag.
- [x] A4 — `GET` payload (writes nothing, repeatable) + `POST` print (print record + activity + audit +
      `printCount`, returns `reprint: true` after the first).
- [x] A5 — controller + routes + `ROUTE_QC_DISPATCH_TAG`/`_PRINT` + `ACTIVITY_TYPE.DISPATCH_TAG_PRINTED`.
      **NOTE the mount prefix is `/qc-user`, NOT `/qc`** (routes/index.js:46) — live paths are
      `GET|POST /api/qc-user/order/:id/dispatch-tag[/print]`.
- [x] A6 — **DONE. The rider-assignment gate.** In `assignRiderTopDeliveryOrder`
      (`intake-user.service.js:1167` — **verified the ONLY write path that sets
      `dispatchDetails.delivery.rider`**, so one guard closes it completely): refuse when
      `order.isDelivery && !order.dispatchTag?.printedAt`, with a message that tells the user what to do
      ("Print the dispatch tag for this order before assigning a rider"). Refuse BEFORE any write.
      `packAndSealComplete` stays untouched — READY, the customer notification and `crmOnOrderReady` all
      keep firing exactly as today.
      Returns `needsDispatchTag: true` on the refusal so the FE can route straight to the print action.
      - [x] **A6b — the gate needs a matching SIGNAL or it's a dead end.** `getDeliverableOrders` /
        `_dispatchQueue` (`intake-user.service.js:1081` / `:1010`) is the S1 screen where staff pick an
        order and assign a rider. Add `tagPrinted` (bool), `printCount` and `needsTag` to each row
        beside the existing `needsRider`/`paid` flags, plus a `needsTagCount` beside `needsRiderCount`.
        Without this, S1 hits "you must print the tag first" with nothing on the list showing which
        orders those are — the gate would read as a bug. `select` must gain `dispatchTag`.
        These fields are added ONLY on the delivery leg — pickups are never tagged, so the pickup queue
        is unchanged.
      - [x] **A6c — Q3's "flaggable".** `reprintFlagged` on the same rows + on the tag payload, once
        `printCount` exceeds `REPRINT_REVIEW_THRESHOLD` (3, a named constant in `util/dispatchTag.js`),
        so repeated reprints are visible on the screen and not only in the audit log. The audit line
        itself distinguishes a reprint and carries its number ("REPRINTED (print #2)").
- [x] A7 — Swagger `DispatchTag` schema + both routes. **55 schemas / 281 paths, spec builds.**
      REWORK: paths move to the intake-user mount, and the schema gains `paymentState`/`paymentNotice`
      (R3) + the new `tagPrinted`/`needsTag`/`printCount`/`reprintFlagged` fields on the deliverable-
      orders rows. Note in the description that `ref` is what a future barcode would encode (Q5).
- [x] A8 — **DB-VERIFIED 2026-09-29: NEW `dispatchTagStaging.js` ran 46/46 GREEN against `testingdb`**
      (all 17 scenarios). Proved what the offline harness could not:
      `dispatchTag.printedAt`/`printCount`/`printedBy`/`ref` really PERSIST in Mongo; the Activity +
      AuditLog rows are written and the reprint's audit line reads "REPRINTED (print #2)";
      `reprintFlagged` false at 3 prints / true at 4; **rider assignment REFUSED on an unprinted
      delivery order with `needsDispatchTag` and NO rider written, then ALLOWED after printing with the
      rider actually stored**; a non-delivery order is never blocked; the deliverable-orders queue
      returns `needsTag`/`tagPrinted`/`printCount` + `needsTagCount` from a real query; paid → `paid` +
      "nothing to collect", unpaid → the figure + "settle it in the app / do NOT collect cash",
      subscription order → `paid` despite amount 9000; legacy STRING address normalised; and
      `itemCount` = **5 pieces from a real 3+2 booking** through `postBookOrder`.
      All probe data removed (verified 0 leftover orders / users / dispatchTag / audit rows).
      **Harness safety:** refuses without `STAGING_OK=1`, refuses `NODE_ENV=production` without
      `STAGING_FORCE=1`, and — unlike the older harnesses — **hard-refuses any DB named `laundrydb`**
      (both gates verified). Run:
      `STAGING_OK=1 MONGODB_URL="<testing uri>" node dispatchTagStaging.js` (never edit `.env`).
      **Two harness bugs the run itself found:** the booking payload was missing the required
      `fullName`; and `postBookOrder` returns `{ message: <string>, order, offer }` — the order document
      is a SIBLING of `message`, not inside it, so the order id is at `data.order._id`.
      NOT covered (deliberately): the HTTP/auth layer — the FE clicked that through against live data.

**Two things the build found that the plan didn't have:**
- **`amount` is ALREADY the full billed total** (`bookOrder.service.js:664` = items + pickup/delivery/
  speed − discount), and on a subscriber-overflow order `amount` IS the logistics fee (`:980`). A first
  cut added `logisticsFee` on top; that could only ever double-count what the rider collects, so
  amount-due is now `amount` alone. Worth remembering — `deliveryAmount`/`logisticsFee` are breakdown
  lines, NOT extra charges.
- **`itemBrief`/`briefsForIds`/`summarize` were private to `handoff.service.js`.** Extracted to NEW
  `util/itemSummary.js` (+ `briefsForAll`/`countPieces`) so the tag's contents line is the exact same
  wording the handoff payloads use, rather than a second implementation that could drift.

---

## Part B — Lagos/UTC timezone split-brain (carried over, now in plan)

`crm.service.monthlyLeadReport` buckets on `Africa/Lagos`; **25 other places** bucket "today"/"this
month" with `setHours(0,0,0,0)` = **server-local**, which is **UTC on Render**. Nothing in the repo
sets `process.env.TZ` (verified — no matches), so the zone is whatever the host says.

**Failure mode:** the two schemes disagree for exactly one hour a day, **00:00–00:59 Lagos**. An order
at Lagos Oct-1 00:30 is UTC Sep-30 23:30 → the lead report says October, every other dashboard says
September. Small, silent, and it lands precisely on month-end reconciliation.

**Two aggravating factors:**
1. **Not reproducible locally.** On a dev machine in WAT, `setHours(0,0,0,0)` *is* Lagos midnight and
   everything agrees. The bug exists only in production; a harness for it passes locally.
2. **It hides inside an accepted caveat.** The founder has already been told "Leads Booked won't match
   `customers`" (booked vs delivered) — that explanation will absorb a genuine timezone delta and
   nobody will investigate.

### Options
- **(a) Leave it, document it.** Cheapest. The delta stays, and it stays invisible in dev.
- **(b) Pin `TZ=Africa/Lagos` on Render.** One env var, zero code, and all 26 surfaces agree
  immediately because the report is *already* Lagos. **But it is not free:** node-cron schedules run
  on server-local time, so all 12 crons shift an hour — `crmBroadcasts` and `sendPaymentsReminder`
  (`0 9 * * *`, customer-facing) move from 10am to 9am Lagos; `resetMonthlyLimits` (`0 0 1 * *`,
  subscription limits) moves from 01:00 to 00:00 Lagos; `expireSubscriptions` likewise. Most of those
  shifts move *toward* the obviously-intended behaviour, but they are behaviour changes and must be
  stated, not discovered.
- **(c) Rewrite all 25 call sites** onto a shared Lagos helper. Correct and explicit, but it is 25
  touch points across 9 services for a one-hour edge, with no way to verify the fix locally.

**Recommendation: (b) + a shared `util/lagosDay.js` for all new code**, with the cron shift written
down and the customer-facing two (`crmBroadcasts`, `sendPaymentsReminder`) re-pinned to their current
wall-clock intent if the client wants 10am kept.

### BUILD TODOS (Part B) — DONE 2026-09-24, verified 14/14 under a simulated UTC host
- [x] B1 — **chose (b), but pinned IN CODE, not in the Render dashboard.** `server.js` first statement:
      `process.env.TZ = process.env.TZ_OVERRIDE || "Africa/Lagos"`. Verified on Node 22 that a runtime
      assignment really does move `getTimezoneOffset`/`getMonth`/`setHours`, so **all ~25 legacy call
      sites become Lagos-correct without being touched.** Chosen over the env var because it is
      version-controlled, needs no dashboard access or plan, can't be lost when a service is recreated,
      and — the real reason — it makes **dev match production**, so the bug is finally reproducible
      locally instead of existing only on Render.
      - **DESIGN FLAW THE HARNESS CAUGHT:** the first cut was `process.env.TZ || "Africa/Lagos"`, which a
        host exporting `TZ=UTC` silently defeats — the exact invisible failure this is meant to prevent.
        The override is now the distinct **`TZ_OVERRIDE`**, which no platform sets by default, so the pin
        is unconditional in practice but still escapable on purpose.
- [x] B2 — audited all 11 LOADED crons under the pin. Only one needed changing: **`crmBroadcasts`
      `0 9` → `0 10`** — it read 9 and relied on the process being UTC to land at the intended 10:00
      Lagos (user-confirmed "the actual time is 10am Nigeria time"), so under the pin it would have sent
      an hour early. Everything else is overnight housekeeping or interval-based, and shifts an hour
      earlier with no customer impact: cleanUpCancelledSubs/expireSubscriptions 01:00→00:00,
      crmDormancyScan 02:30→01:30, creditExpiry 03:15→02:15, offerExpiry 03:45→02:45, reconcilePaystack
      04:00→03:00; complaintSla + crmDispatcher + unassignedDispatchScan are interval-based, unaffected.
      **`resetMonthlyLimits` 01:00→00:00 on the 1st is an improvement** — it now resets exactly at the
      Lagos month boundary the report uses.
      - **FOUND IN PASSING (not fixed, flagged):** `crons/sendPaymentsReminder.js` is DEAD — not required
        in `server.js`, and it would crash if it were (ESM `import` in a CommonJS file, pointing at a
        `utils/` directory that does not exist). Left alone deliberately: changing its schedule would
        imply it runs. Decide separately whether to fix-and-wire it or delete it.
- [x] B3 — NEW `util/lagosDay.js` — `startOfDay`/`endOfDay`/`startOfMonth`/`endOfMonth`/`daysAgo`/
      `monthRange`/`monthKey` on `Africa/Lagos`, so new code stops adding to the 25. Upper bounds are
      EXCLUSIVE (`$lt` next-day/next-month start) rather than `23:59:59.999`, which drops the final
      millisecond. `monthRange` is strict + regex-guarded (the "April 2027" bug). Verified 13/13,
      including the exact split-brain case: 23:30 UTC on Sep 30 → `monthKey` says **2026-10** while a
      naive UTC read says 2026-09.
      **The 25 existing call sites were NOT migrated and no longer need to be** — B1's pin makes
      `setHours(0,0,0,0)` mean Lagos midnight process-wide. The harness asserts the legacy pattern and
      `lagosDay` now return the IDENTICAL instant for the edge case. `lagosDay` remains the preferred
      entry point for new code (explicit, exclusive bounds, strict month parsing).
- [x] B4 — documented in CLAUDE.md: new "Time zone (all dates are Lagos time)" section — the pin and why
      it must stay first, `TZ_OVERRIDE` not `TZ`, **cron expressions are now Lagos wall-clock**, and
      `util/lagosDay.js` for new code.

---

## Part C — Subscription-purchase revenue (carried over, now in plan)

**The actual bug today, not a missing nicety:** `monthlyLeadReport`
([crm.service.js:1250-1253](../services/crm.service.js#L1250-L1253)) zeroes a subscription draw-down's
revenue, **but line 1260 still adds that lead to `booked`**. So a subscriber lead sits in the numerator
and contributes ₦0 to the money.

Why it matters more than the timezone item:
- The whole report is designed as "plain numbers, the founder does the math by hand" — and the math
  they will do is **revenue ÷ booked**. Every subscriber lead silently deflates it.
- **The error points the wrong way and grows.** Subscribers are the higher-LTV recurring customers, so
  as subscription adoption rises the report will show lead generation becoming *less* valuable exactly
  as it starts converting leads onto the better product.
- **Nothing in the payload reveals it** — no "n draw-downs excluded" field, so a ₦0 subscriber is
  indistinguishable from a genuinely free order.
- **The trigger is a sale, not a date.** It is safe only because zero subscriptions exist. The day the
  first plan sells, under-reporting starts silently with nothing failing.

**Good news on cost:** `Subscription.userId` ([subscription.model.js:5](../models/subscription.model.js#L5))
and `Payment.userId` ([payment.model.js:5](../models/payment.model.js#L5)) are both **required**, and a
subscription cannot exist without an account — so a `userId` join covers **100%** of subscription
purchases. Unlike the `leadSource` work this needs **no schema change**, just an additive query.

### LOCKED ANSWER (Q6, 2026-09-24) — FIRST PAYMENT ONLY, never renewals
Client's reasoning, which sharpens what this whole report is: **it measures the SALES REPS' conversion
rate** — how many of the leads a rep worked on in a given month turned into paying customers, for the
effort they put in during that window. Once someone converts they stop being a lead: whatever they keep
spending reflects the service they're enjoying, not the rep's lead-generation work. That ongoing value
is real but belongs in a separate customer/CRM revenue view, **not folded back into the lead number
every month.**

**Consequence worth noting:** this makes each lead's contribution a ONE-TIME figure, which means a
month's revenue number stops changing once its leads have converted — so the report becomes stable and
comparable month-to-month. Counting renewals would have made every past month's number creep upward
forever, which would have made rep-to-rep comparison meaningless.

### BUILD TODOS (Part C)
- [x] C1 — Q6 answered: first payment only.
- [x] C2 — credit the **first** successful subscription payment per subscription to the lead: query
      subscription purchases inside the report's Lagos month, join to the lead cohort by `userId`
      (100% coverage — `userId` is required on both `Subscription` and `Payment`), and bucket by the
      lead's cohort month exactly as orders are. **Must identify the FIRST charge specifically** — a
      renewal is also a successful payment against the same subscription, so the query has to
      distinguish them (by the subscription's first payment / earliest payment per `subscriptionId`),
      not just take every successful subscription payment in the month.
      **Implemented as `$sort: {createdAt: 1}` → `$group` by `subscription` taking `$first`** — sorting
      then taking the first is what makes a renewal structurally unreachable, then a second `$match`
      keeps only conversions whose FIRST payment lands in the report month. A payment with no
      `subscription` ref is excluded: without it there is no way to tell a first charge from a renewal,
      so including it would risk crediting a renewal (same conservative logic as `leadSource`
      defaulting to `order`).
- [x] C3 — a converting lead is counted in `booked` **once**: the subscription pass adds to the SAME
      `leads` Sets as the order pass, so a lead who both subscribed and paid per item appears once with
      both revenues summed. Draw-down orders still resolve to ₦0, which is now correct rather than lossy.
- [x] C4 — two plain integers added: `subscriptionConversions` (leads credited with a first payment
      this month) and `subscriptionDrawDownOrders` (orders a plan paid for, hence ₦0). No rates — the
      no-percentages rule still holds and the test still asserts it.
      **`subscriptionConversions` counts only purchases actually CREDITED to a genuine lead** — a
      walk-in's subscription is not this report's business, and counting it beside the revenue would
      imply money that isn't in the totals.
- [x] C5 — offline-verified 17/17 (`scratchpad/subRevenueCheck.js`, replays the aggregation in memory):
      subscription revenue counted at all (was ₦0); a Sep RENEWAL of an Aug subscription adds nothing;
      a lead who subscribed AND ordered is counted once with both revenues; a walk-in's subscription
      ignored; failed payments, payments with no subscription ref, and non-subscription payment types
      all ignored; draw-downs surfaced; no `rate|percent|%` anywhere; bad month still rejected.
      **DB verification against `testing_db` still outstanding** (no subscriptions exist live yet).

---

# PREVIOUS Feature (DONE 2026-09-24): CHUVI Admin Reporting — Monthly Lead Reporting + Cold-Lead Tag

**STATUS 2026-09-24: PARTS 1-6 COMPLETE & DB-VERIFIED (48/48 across 3 harnesses). Migration APPLIED to laundrydb. UNCOMMITTED on `mesage-and-alert-fix`.** Client brief: "CHUVI
Reporting — Simple Explanation". Give the founder eyes on lead performance as **plain numbers only** —
no formulas, no percentage fields, nothing calculated server-side. The founder reads the numbers and
does the math by hand.

## What the client asked for (verbatim intent)
Per month: (1) total leads entered that month; (2) of that month's leads, how many placed an order —
count, own box; (3) revenue from those same leads — own box; (4) a separate line for leads entered in
OTHER months that placed an order THIS month (count + revenue), with the originating month as a
nice-to-have.

## LOCKED CLIENT DECISIONS (2026-09-23)
- **Q1 cold leads → a TAG, not a stage.** Stages feed the customer metrics, tags don't. This is what
  stops the next staff member improvising with "dormant" again because there is nowhere else to put a
  dead lead. Client also wants the resulting number — **leads gone cold vs leads still being worked** —
  shown right beside the conversion numbers.
- **Q2 "placed an order" = BOOKED, not delivered.** The report answers whether the lead responded that
  month; that's lead generation, not fulfilment. **Label it "Leads Booked", NOT "Leads Ordered"** — it
  will NOT match `customers` on the existing CRM metrics screen (which is delivered-based, per the
  earlier client ruling), and the label must make it read as its own metric rather than a broken
  version of that one.
- **Q3 revenue = BOOKED value (`order.amount`).** Not delivered value, not collected-payment value —
  if the count is booking-based and the money is delivery-based they stop describing the same set of
  leads. Cancelled orders EXCLUDED. Recovery orders EXCLUDED (already excluded everywhere else in CRM
  accounting — it's a correction, not new business).
  **NEW POLICY, set now, not inherited:** a subscription **draw-down order counts ₦0**; the
  **subscription purchase itself** is credited to the lead, in the month the money changed hands.
  Crediting both would double-count the same revenue. No subscriptions exist yet, so this is new ground.
- **Q4 month bucket = the PLACED date**, matching Q2. Otherwise one order lands in different months
  depending on which part of the report you read.
- **Q5 months run on LAGOS TIME (WAT).** `moment-timezone` is already a dependency; WAT is UTC+1
  year-round, no DST, so no edge cases.
- **Q6 "leads entered" = GENUINE LEADS ONLY.** A backfilled record is not a lead anyone generated, and
  a profile created by its own order means nobody sourced that customer — they showed up and bought.
  Counting either inflates the number without reflecting real outreach, and would wreck conversion
  (walk-in-and-order profiles would read as instant 100% converts).

## Why Q6 needs a schema change — what the live data actually is (verified 2026-09-23)
`CrmProfile` has ONLY `createdAt`; there is NO record of how a profile came into existence. Of the 28
profiles in `laundrydb`:
- **15 backfilled** — created by `crmBackfill.js` in a single-day batch on **2026-07-15**. Their
  `createdAt` is the day the script ran.
- **3 created BY their own order** — no CRM card existed, one was auto-created the moment the order
  arrived (`crm.service.js` `handleOrderCreated` → `findOrCreateProfile`).
- **10 genuine leads** — existed as a lead before any order (7 have still never ordered).

A month report built on `createdAt` today would print **July 2026 = 17 leads entered** when the true
answer is **2**. The founder would read that as the best lead month of the year, off a script run.
**Historical months cannot be fully reconstructed**: July is correctable (the backfill batch is
unambiguous by date), Aug/Sep are approximate, and the number is exact only from the day the origin
field ships.

## BUILD TODOS (not started)
- [x] **Part 1 — cold-lead tag (Q1).** Add `CRM_TAG.COLD_LEAD='cold-lead'` to `util/constants.js` and
      put it in the EXISTING `CRM_TAG_GROUPS.LEAD_STATUS` group (currently `[FRESH_LEAD, PROSPECT]`),
      so `replaceGroupTags` swaps it correctly and `handleOrderCreated` (crm.service.js ~:391) already
      CLEARS the whole LEAD_STATUS group on booking — a cold lead who books loses the tag for free, no
      new machinery. Add it to `CRM_MANUAL_TAGS` (currently `[COMPLAINT, RECOVERY_REQUIRED]`) so staff
      may set/remove it via the existing add/remove-tag endpoints. NO new endpoint.
- [x] **Part 2 — profile origin (Q6).** `CrmProfile.leadSource` (`lead` | `order` | `backfill`) +
      `leadEnteredAt` (Date). Set at creation: `createLead` → 'lead', `findOrCreateProfile` called from
      the order hooks → 'order', `crmBackfill.js` → 'backfill'. One-off migration tags the existing 28
      (the 2026-07-15 batch → 'backfill'; profile created within ~5 min of its own first order →
      'order'; else 'lead'). Idempotent, `--dry` mode, same pattern as `stationBackfill.js`.
- [x] **Part 3 — the report endpoint.** `GET /api/crm/reports/monthly-leads?month=YYYY-MM`, `adminAuth`,
      beside the existing `/crm/metrics` (`ROUTE_CRM_METRICS`). Add `ROUTE_CRM_REPORT_MONTHLY_LEADS` to
      `util/page-route.js`. **Plain integers + naira only — NO percentages, NO computed rates.**
      Draft shape:
      `{ month, leadsEntered, coldLeads, leadsStillBeingWorked,
         fromThisMonthsLeads: { booked, revenue },
         fromEarlierLeads:    { booked, revenue, byCohort:[{month,booked,revenue}] } }`
      `byCohort` is the client's nice-to-have — cheap here because the join already groups by cohort.
- [x] **Part 4 — aggregation.** Join orders→profiles by `userId`, falling back to `normalizedPhone`
      (**verified: covers 100% of the 66 live orders — 62 via userId, 4 via phone, 0 orphans**).
      Bucket the profile's lead month against the order's PLACED month. Filters: exclude cancelled,
      exclude `isRecoveryOrder`, exclude `leadSource != 'lead'`, subscription draw-downs → ₦0.
      Month boundaries via `moment-timezone` on `Africa/Lagos`.
- [x] **Part 5 — Swagger.** `MonthlyLeadReport` schema in `swagger/schemas.js`, `$ref`'d from the route,
      with real example-filled values per the repo convention.
- [x] **Part 6 — DB verify** against `testing_db`: seeded cohorts spanning month boundaries, the
      WAT/UTC month-edge case, cancelled + recovery exclusions, a subscription draw-down at ₦0, and a
      cold-lead that books (tag must clear).

## BUILD RESULTS (2026-09-24) — 48/48 across 3 harnesses on testing_db
`coldLeadCheck` 19/19 · `leadSourceCheck` 12/12 · `leadReportCheck` 17/17. Swagger 54 schemas /
279 paths. Server boots clean. All probe data removed after every run.

**Design conflicts found + resolved during the build (NOT in the original plan):**
- **`markProspect` would have clobbered the cold-lead tag.** It does
  `replaceGroupTags(tags, LEAD_STATUS, PROSPECT)`, so the nurture cron would have silently promoted a
  dead lead back into the rotation. Now returns early on a cold lead. Part 1 also had to STOP the
  outreach on tagging (cancel pending LEAD messages, drop the prospect broadcast, clear
  nextFollowUpAt) — otherwise "cold" was cosmetic and the customer kept getting messages.
- **`leadSource` default is ORDER, not LEAD** (conservative): any future path that creates a profile
  without declaring itself is excluded from the lead count rather than inflating it.

**Bugs the harnesses caught before shipping:**
1. `crmLeadSourceBackfill` keyed orders by `userId` only — an order carrying a userId whose profile
   matched by PHONE was missed and misclassified as a genuine lead. Now indexes orders under BOTH
   keys, mirroring `findOrCreateProfile`.
2. Report `booked` counted ORDERS, not LEADS. Client asked "how many placed an order" = a count of
   leads. Now deduplicated by profile; revenue still sums every qualifying order.
3. `leadsStillBeingWorked` was derived from `stage === 'lead'` — only correct because a hook advances
   the stage on booking. Now derived from whether the lead has actually ever ordered, so it can't drift.
4. `_profilesWithAnyOrder` had `{ phoneNumber: { $exists: true } }` in its `$or` — it matched EVERY
   order with a phone, which would have zeroed "still being worked" in production. Now an `$in` on the
   cohort's phones.
5. `moment` accepts "April 2027" for 'YYYY-MM' without the strict flag. Now strict + a regex guard.

**Migration APPLIED to laundrydb (2026-09-24):** 28 profiles stamped → backfill 15, lead 10, order 3;
0 missing. Integrity checks clean (no `leadEnteredAt` on non-lead rows; no genuine lead without one).
**Live report now reads:** 2026-07 leads 2 (was 17 on raw createdAt) · 2026-08 leads 5 · 2026-09 leads 3.

**Caveat to hand the founder:** Aug/Sep origins were INFERRED by the migration's 5-minute heuristic, so
those months are approximate. Numbers are exact from 2026-09-24 onward, when `leadSource` shipped.

## OPEN / FLAGGED (not blocking the build)
- **Timezone inconsistency.** 25 other places bucket "today" with `setHours(0,0,0,0)` = SERVER local
  time (UTC on Render). This report will be the only Lagos-time surface, so around month-end it can
  disagree with the other dashboards. Flagged deliberately rather than quietly rewriting 25 call sites.
- **Subscription revenue plumbing.** Crediting the subscription PURCHASE to the lead (Q3) needs a link
  from a `Subscription`/payment back to the CRM profile. Not yet designed — no subscriptions exist, so
  it can ship after the order-based numbers.

## Files (expected)
`util/constants.js` (CRM_TAG + groups + manual tags), `models/crmProfile.model.js` (leadSource,
leadEnteredAt), `services/crm.service.js` (createLead/findOrCreateProfile origin + the report method),
`controllers/crm.controller.js`, `routes/crm.js`, `util/page-route.js`, `swagger/schemas.js`,
NEW `crmLeadSourceBackfill.js`.

---

# PREVIOUS Feature (DONE 2026-09-23): CRM dormant-rate fix
Dashboard showed **DORMANT RATE 125%**. Cause: `dormantRate: pct(dormant, converted)` counted DIFFERENT
populations — numerator was every profile at stage `dormant` (no order filter), denominator only
profiles with `totalOrders >= 1`. Live: dormant 5 / converted 4 = 125%.
- **Fix 1 (done):** numerator scoped to `{ stage: 'dormant', totalOrders: { $gte: 1 } }`
  (`crm.service.js` ~:1072) → now reads 100%, and can no longer exceed 100%. Raw `stages` breakdown
  deliberately left unscoped — it is the true stage distribution.
- **Fix 2 (done):** `correctStage` (`crm.service.js` ~:920) now BLOCKS `active`/`loyal`/`dormant`/
  `reactivated` on a profile with 0 delivered orders. `lead` + `first-order` stay allowed at 0 —
  `first-order` is the legitimate booked-but-not-delivered state set at booking time (~:397).
  Verified 7/7 cases.
- **Fix 3 (client ruling):** "converted = ordered AND we delivered to them" — the existing
  `totalOrders >= 1` denominator was already correct, NO change needed.
- **Data cleanup (done):** "Rebecca Houston" (a LEAD manually set to `dormant` by staff — the record
  that caused the 125%) restored to `lead` with a stageHistory note. Live now: dormant=4, lead=20,
  first-order=4; dormantRate 100%.

---

# PREVIOUS Feature: Split-Flow Station Scoping Fix (FE bug: whole order appears at the receiving station)

**STATUS 2026-09-01: COMPLETE & DB-VERIFIED (Parts 0-7). handoffStaging 54/54, backfillCheck 15/15, offline 24/24. UNCOMMITTED on `sub-offer-recurring-feature`.** Bug fix on top of the completed Phase-3
split-flow engine (see PREVIOUS FEATURE below). Reported by FE; confirmed in code.
Client: "ship Parts 0-7, don't worry about breaking [the FE contract] for now" → scoped items stay under `items`.

## The report
> "When a single item in an order is moved from sort-and-pretreat (S2) to wash-and-dry (S3), the whole
> order appears after confirmation instead of one." — also happens S3→S4.

## Root cause (one gap, three symptoms)
The engine stores station membership **per item** (`items[].currentStation`), but every station's read
endpoint filters at **ORDER** level and then returns the full `items[]` array.
`{ 'items.currentStation': X }` means *"this order has ≥1 item here"* — it does NOT project the matching
items. The DB data is correct; the reads and writes layered on top are not station-aware.

1. **Display** — the receiving station renders all 10 items instead of the 3 that arrived. (The report.)
2. **Blocked workflow** — `allItemsConfirmed` is computed over ALL items, so it never turns true and the
   next-station push button never enables.
3. **Data corruption (worst, invisible)** — `confirmItemForWashing` with `allItems:true` delegates to
   `util/updateOrderItemsStage.js`, which filters by STATUS ONLY, never by `currentStation`. It stamps
   `washStatus:'complete'` on items still sitting at S2. Those items then pass `itemCompleteAt()` at the
   wash gate for a station they never physically reached.

## Client rule on the gates (re-confirmed 2026-09-01 — matches D6)
- **S1→S2: hard gate.** Complete order only. S1 is where the order is defined (count, price, condition);
  nothing after it should have to question what's real.
- **S2→S3→S4: stretch zone.** Partial releases allowed.
- **S4→S5: hard gate.** Complete order only. S5 is the final release point before the customer; nothing
  partial may reach it.

**Gap found:** the gate is enforced on **push** (`handoff.service.js:106-108` + `:181-192`) but NOT on
**confirm**. `confirm` accepts `rejectedItems` as any subset (`:268`) and advances only the accepted ones
(`:331-359`) — so QC partially accepting a whole-order handoff puts 8 of 10 items at S5. That violates the
rule. Must be closed. (Earlier suggestion to instead station-scope QC's reads was WRONG — client says
everything must reach QC together. Scrapped.)

## Does this break existing orders? — NO (per locked decision), with one safety net
- `items[].currentStation` was added 2026-08-28 in `98425af` ("order split done"), only on
  `modular-branch` / `sub-offer-recurring-feature`. `main` is still at 2026-06-20. No backfill exists.
- Orders written BEFORE that commit have NO `currentStation` field, and Mongo does not match a missing
  field — so `{ 'items.currentStation': X }` silently skips them. S3/S4 queues ALREADY query that way,
  so legacy in-flight orders are already invisible there today (pre-existing, not caused by this fix).
- **But the Phase-3 arch decision records "Pre-launch, so no live pipeline/data to protect"** — so there
  should be no legacy orders at all. Part 0 below is therefore a cheap idempotent safety net for dev/test
  DBs, not a production migration. **Confirm pre-launch still holds before deploying.**
- New orders are safe: `new BookOrderModel(...)` (bookOrder.service:1025) applies the schema default at
  bookOrder.model:33-37.
- Unaffected either way: completed/delivered/cancelled orders, all history + timeline endpoints (they read
  `stageHistory`/`stage.status`), everything customer-facing, bot, wallet, CRM.

## BUILD RESULTS (2026-09-01)
Parts 0-6 done, offline-verified **24/24** (scratchpad `scopeTest.js` — stubs the two `BookOrderModel` calls
in `updateOrderItemsStage` so the target SELECTION is what's tested): hard-gate matrix incl. wash-only S3→S5;
confirm-side accept-all / reject-all / partial-refused; no item at two stations; `allAtStation` opening the
push gate; `allItems:true` touching only the 2 wash items, not all 4. All 5 station services + swagger load
clean (52 schemas, 278 paths).

**Two PRE-EXISTING bugs fixed in passing** (wash `undoConfirmItemForWashing`): it set
`washDetails.startedAt = null`, but the queue selects on `{$exists:false}` — a null left the order stuck OUT
of the wash queue while showing in Active Wash; now `$unset`. It also reset `stationStatus` to the SORT
station, which under split-flow is wrong (undoing a confirmation moves no items); now left alone.

**Part 5 refinement:** only the PRESS dashboard actually needed `$elemMatch`. Wash's mixed queries pair an
item-level condition with an ORDER-level `washDetails.*` one, so they were already correct — left as-is.

## BUILD TODOS
- [x] **Part 0 — `stationBackfill.js` (safety net, idempotent, dry-run).** Sets `items[].currentStation`
      where missing, derived from `stage.status` via the inverse of `STATION_TO_ORDER_STATUS`. Lossless
      because legacy orders were whole-order-moved (every item sits at exactly one station).
      Map: queue/pending/received/picked-up→S1 · sort-and-pretreat→S2 · washing,drying→S3 · ironing→S4 ·
      qc→S5 · hold→use `stationStatus`, else last non-hold `stageHistory` entry ·
      ready/out-for-delivery/delivered/cancelled→S5 (keeps them out of every station queue).
      Writes ONLY `items[].currentStation` — never `stage.status`. Same safety-gated pattern as
      `subLogisticsStaging.js` / `crmBackfill.js`.
- [x] **Part 1 — close the hard gate on `confirm`** (`handoff.service.js`, small + standalone, DO FIRST).
      Recompute `isWholeOrderGate` from the stored `handoff.fromStation`/`toStation`; on a gated handoff
      `rejectedItems` must be EMPTY (accept all) or the COMPLETE set (send all back) — never in between.
      Refuse before any write. Re-check `isWholeAt(fromStation)` defensively (push and confirm are separate
      requests). The existing `finalStatus = accepted.length ? 'confirmed' : 'rejected'` branch already
      handles reject-all correctly (all items → holdDetails, stay at fromStation).
      **Doing this first PROVES S1 and S5 out of scope for Parts 3-4** — under the gate they only ever hold
      whole orders, so their existing `stage.status` scoping is correct as written.
- [x] **Part 2 — NEW `util/stationScope.js`** (foundation for Parts 3+4):
      `itemsAtStation(order, station)` and `scopeOrderToStation(order, station)` → order with `items`
      replaced by the subset, plus `itemsAtStationCount`, `totalItemCount`, `itemsElsewhere` ({station:count}).
      Treats a missing `currentStation` as `SEQ[0]` in memory — the convention handoff.service already uses
      at :143, :159, :485, :540.
      **CONTRACT DECISION (confirm with FE):** the scoped subset goes under the existing `items` key
      (breaking for any FE assuming it's the whole order), whole-order context moves to the new sibling
      fields. Rationale: `items` is what the station screen renders, so it should mean "items I have".
- [x] **Part 3 — scope the WRITES** (highest severity; stops the corruption).
      `util/updateOrderItemsStage.js` + callers `washAndDry.service.js:213`, `pressAndIron.service.js:206`.
      Add a `station` param; filter targets by `currentStation === station`. Redefine `allItems:true` as
      **"all items at MY station"**. Reject explicit `itemIds` not at the caller's station (same guard
      handoff.push has at :159-165). Make `allItemsCompleted` station-scoped — which as a side effect fixes
      `washDetails.startedAt`/`pressDetails.startedAt` never firing on a partial batch (:71-74).
      Apply the same scoping to the `undo*` handlers and `sendToHold`.
- [x] **Part 4 — scope the READS, stretch zone ONLY (S2/S3/S4).**
      - **S2 `sortAndPretreat.service.js`** — KEEP the `stage.status` query (decision D3 below: sort is the
        earliest stretch station, so summaryStatus makes it correct for MEMBERSHIP). Scope only the returned
        `items[]` + recompute `allItemsSorted`/`allItemsPretreated`/`readyToSend` over the subset
        (`getOrderQueue`, `getOrderDetails`, dashboard). This also avoids any legacy-order regression.
      - **S3 `washAndDry.service.js`** — queue (:121-153), queue-details (:186-201), dashboard,
        active-wash, active-dry, hold queue.
      - **S4 `pressAndIron.service.js`** — same set (:96-131, :160-176, dashboard, hold).
      - **S5 `qc` + S1 `intake`: NO CHANGE** (whole-order gated by Part 1).
      Every derived boolean recomputed over the scoped subset — this is what re-enables the push button.
- [x] **Part 5 — `$elemMatch` on the mixed queries.** `pressAndIron.service.js:36-42` and the `washDetails`
      equivalents `washAndDry.service.js:45-72`, :560-564, :701-704. Today
      `{ 'items.currentStation':X, 'items.pressConfirmedAt':{$exists:false} }` can be satisfied by two
      DIFFERENT items. Wrap so ONE item must satisfy both.
- [x] **Part 6 — Swagger** (CLAUDE.md rule). Response contracts change (scoped `items`, new count fields,
      the new gate error on confirm) → update the `@swagger` blocks in the affected `routes/*.js` and any
      shared schema in `swagger/schemas.js`.
- [x] **Part 7 — DB verify. DONE: 54/54 in handoffStaging (scenarios 15-20 added) + 15/15 backfillCheck against testing_db. NOTE: .env still points at Atlas laundrydb — pass MONGODB_URL inline, never edit .env.** Extend the existing `handoffStaging.js` harness (already exercises split
      states). New cases: partial S2→S3 shows 3 at wash / 7 at sort with NO overlap; `allItems:true` at wash
      touches only wash items; the S3→S4 equivalent; partial confirm on a gated S4→S5 REFUSED; reject-all on
      S4→S5 returns the whole order to press; legacy order with no `currentStation` behaves after Part 0.

## Files
NEW: `util/stationScope.js`, `stationBackfill.js`. MODIFIED: `services/handoff.service.js`,
`util/updateOrderItemsStage.js`, `services/sortAndPretreat.service.js`, `services/washAndDry.service.js`,
`services/pressAndIron.service.js`, the affected `routes/*.js` + `swagger/schemas.js`, `handoffStaging.js`.
NO new endpoints. NO schema change.

## Open decision (not blocking)
`washDetails`/`pressDetails` hold a SINGLE order-level `startedAt`/`movedToDryingAt`. Under split flow two
batches of the same order can sit at S3 at different times and share one timer, so the ETA on the second
batch drifts. Options: (a) leave it, accept the drift; (b) move the timings per-item and keep `washDetails`
as a derived mirror. Recommend doing Parts 0-7 first (that's what FE is blocked on) and treating this as a
separate follow-up. Note this is the flip side of decision D2 below, which deliberately declared
order-level sub-phases "meaningless by design" for split orders.

---

# PREVIOUS Feature (COMPLETE + DB-VERIFIED): Subscriber Per-Plan Free Pickup/Delivery Allowance (Feature 1)

**STATUS 2026-08-31: COMPLETE & DB-VERIFIED (`subLogisticsStaging.js` 20/20 green against testing_db).**
₦65,000. Part of a 2-feature package (Feature 2 = Recurring Offers ₦145k, DEFERRED — see summary.md).
Only the card `logisticsPaymentUrl` link is untested (needs a PAYSTACK key loaded). See session.md for the
blow-by-blow. The TODO list below is the ORIGINAL plan, retained for reference.

## What it does
Each subscription plan gets its own editable **weekly** free pickup/delivery allowance. Pickup and delivery
count SEPARATELY (an order with both uses 2 units). Speed surcharge stays free for subscribers ALWAYS. Once the
weekly allowance is exhausted, the normal pickup/delivery fee applies per remaining leg. Replaces the current
"subscribers get everything free" behaviour (`extraDeliveryCost = 0`, bookOrder.service ~line 972).

## Locked client decisions (2026-08-31)
- **Per WEEK**, not per month. Editable **per plan** (admin panel).
- Pickup + delivery counted **separately** → both on one order = **2 units**.
- **Speed stays free always** (only pickup/delivery fee is gated by the allowance).
- Allowance exhausted → charge `AdminSetting.pickupFee` / `deliveryFee` per uncovered leg.
- Admin re-sets existing plans' numbers themselves (not our task).

## Key design point — WEEKLY reset (not monthly)
Paystack renews MONTHLY and resets `remainingItems` on renewal; the logistics allowance is WEEKLY, so it can't ride
the renewal. Plan: **lazy weekly reset at booking** — store `logisticsWeekStart` on the subscription; on each
subscription booking, if `now` is a new week vs `logisticsWeekStart`, reset `remainingPickupDeliveries =
plan.freePickupDeliveryPerWeek` and advance `logisticsWeekStart` BEFORE consuming. No cron needed.
- **Week boundary DECIDED (2026-08-31): rolling 7-day window anchored to the subscription START.** The week is NOT a
  calendar week. `logisticsWeekStart` is initialised to the subscription start (first-charge date). Lazy reset: on a
  subscription booking, while `now >= logisticsWeekStart + 7 days`, advance `logisticsWeekStart` by 7 days (in steps,
  so a gap of several weeks lands on the correct current window) and reset the counter; then consume. So each
  customer's "week" runs from their own signup anchor, e.g. a Wed-signup customer's weeks are Wed→Tue.

## BUILD TODOS (not started)
- [ ] `plan.model.js` — `freePickupDeliveryPerWeek` (Number, default 0)
- [ ] `subscription.model.js` — `remainingPickupDeliveries` (Number) + `logisticsWeekStart` (Date)
- [ ] Seed on first charge/subscribe: `remainingPickupDeliveries = plan.freePickupDeliveryPerWeek`, `logisticsWeekStart = now`
      (subscription.service subscribe + webhook.handler handleNormalSubscription create + reactivate branches)
- [ ] `bookOrder.service.js` subscription branch (~972): lazy weekly reset → legs = (isPickUp?1:0)+(isDelivery?1:0) →
      free = min(needed, remaining), decrement → charge pickupFee/deliveryFee for uncovered legs → **speed stays ₦0**.
      Deterministic tie-break when 1 unit left + both legs (free the pickup first, charge delivery) — documented.
- [ ] `admin.service.js` — expose `freePickupDeliveryPerWeek` on plan create/update (+ validate ≥ 0)
- [ ] Swagger — `Plan` schema + plan create/update request bodies
- [ ] DB verify: N/week → orders free + decremented; both-legs = 2 units; exhausted → fee charged; new week → reset;
      speed still free after exhaustion; non-subscriber unaffected.

## Files (no new endpoints)
plan.model, subscription.model, subscription.service, webhook.handler, bookOrder.service, admin.service, swagger.

---

# PREVIOUS Feature (COMPLETE): CHUVI Production Split-Flow, Structured Addresses & Set Items

**STATUS 2026-08-28: COMPLETE & DB-VERIFIED (Phases 1+2: 14/14, Phase 3: 18/18). Uncommitted on
modular-branch, ready to commit.** Client-approved package
of two features (+1 add-on). Full detail also in memory `chuvi-prodflow-setitems.md`. Combined
**₦190,000 · 9 new endpoints · ~12.5 days.** Build order (low-risk → high): (1) structured addresses
[quick], (2) Set Items [isolated catalog], (3) split production-flow engine [biggest, includes the
recovery-order requirement]. Swagger done in full detail (new `Handoff`/`ItemSet` schemas); in-code
comments kept LIGHT.

## BUILD TODOS (tracked)

### Phase 1 — Structured Addresses  ✅ DONE 2026-08-27 (scope: BOTH paths, tolerant of legacy strings)
- [x] Shared `util/address.js` — `normalizeAddress()` (string|object→structured) + `validateStructuredAddress()` (staff-intake required check). Unit-tested.
- [x] `bookOrder.model.js:172-173` — `pickupAddress`/`deliveryAddress` now `Mixed` (holds structured; no legacy-string hydration crash)
- [x] `intake-user.service.js` (staff `createBookOrder`) — REQUIRE label+address+landmark when isPickUp/isDelivery, store structured (commented validateRule left as-is; explicit check added)
- [x] `bookOrder.service.js` (customer/app/bot `postBookOrder`) — normalize `post.pickup/deliveryAddress` after validate (tolerant, string→structured, back-compat)
- [x] `services/bot/booking.flow.js:84` — "the usual" prefill coerces stored address object → display string (fixes `${bAddress}` render); bot still sends string, normalized downstream
- [x] Swagger: `OrderAddress` schema (44 total, parses) + `createBookOrder` (required) & customer booking (`oneOf` string|object) request bodies + TimelineOrder response shape
- [x] Gap closed (2026-08-27): customer `postBookOrder` now REQUIRES an address be PRESENT when isPickUp/isDelivery (presence only — label/landmark stay optional; back-compat). Bot payload now sends `deliveryAddress = pickupAddress` (single-address return) so the new isDelivery guard doesn't reject bot bookings.
- [x] DB write-path VERIFIED (phase12Staging.js, 14/14): staff intake rejects address missing landmark; customer rejects missing address when isPickUp; structured address round-trips as object; legacy string tolerated. FE note: staff intake needs label+landmark; customer app must send a delivery address when isDelivery.

### Phase 2 — Set Items  ✅ DONE 2026-08-28
- [x] `models/itemSet.model.js` — `{name*, pieces:[{name*,price*,isHeavy}], active}` (no set price; ≥1 piece enforced in service)
- [x] 5 endpoints mirroring `/admin/*-order-item`: add/update/get-all/get-one/delete (admin write; get uses `[auth]`). Routes in `page-route.js`, service `admin.service.js`, controller `admin.controller.js`. Shared `_validateSetPayload` (name + ≥1 priced piece; coerces price, defaults isHeavy). Unit-tested.
- [x] Catalog browse (`getItems`/`get-order-items`) now returns single items (`kind:'item'`) + ACTIVE sets (`kind:'set'`) in one array
- [x] Booking heavy-detection (subscription branch) also consults `ItemSet` pieces where `isHeavy` (matched by piece name vs booked item `.type`)
- [x] Optional `fromSet` tag added to order `ItemSchema` (passes through via `...post`)
- [x] Swagger: `ItemSet` + `ItemSetPiece` schemas (46 total, parses) + 5 endpoints (278 paths)
- [x] DB VERIFIED (phase12Staging.js, part of 14/14): add/get/update/delete set, pieces stored, get-order-items returns sets tagged kind:set + items tagged kind:item, no-pieces rejected. FE must branch on `kind`.

### Phase 3 — Split-Flow Engine (+ recovery add-on)
> **ARCH DECISION 2026-08-28 (client): INTEGRATED — the split-flow REPLACES the old whole-order
> mechanism (old flow was already built; client wants this to supersede it).** Pre-launch, so no live
> pipeline/data to protect. Per-item `currentStation` + `handoffs[]` become THE advance mechanism;
> `stage.status` is a COMPUTED summary (`summaryStatus`). The 5 station services keep their per-item
> work (tag/sort/wash/press/qc completion + hold + queues) which feeds the gates, but their whole-order
> "advance to next stage" step is replaced by the handoff push/confirm flow. Build order: model+engine
> first (isolated, verifiable), then integrate station-by-station.
> Verified facts: S1 done = item.tagStatus==='complete' (intake:775); sort=sort+pretreatStatus;
> wash=washStatus; press=pressStatus; qc=qcStatus==='passed'. Recovery items get S1 via schema default.
- [x] Model: `Item.currentStation` (default S1); `order.handoffs[]` (HandoffSchema); helpers `countByStation`/`isWholeAt`/`summaryStatus` + statics STATION_SEQUENCE/STATION_TO_ORDER_STATUS. Tested.
- [x] `services/handoff.service.js` engine (push/confirm/pendingQueue/splitState) + gates (whole-order S1→S2 & S4→S5, partial stretch zone) + completion checks + repeat-merge + reject→Hold. **In-memory logic test 16/16.**
- [x] `POST /orders/:id/handoff` (push → pending handoff; items advance only on confirm)
- [x] `POST /orders/:id/handoff/:hid/confirm` (accept→advance, reject→Hold+stay; recompute stage.status)
- [x] `GET /orders/handoffs/pending` (inbound queue, ?toStation filter)
- [x] `GET /orders/:id/split-state` (per-station breakdown + pending handoffs)
- [x] Controller + `routes/orders.js` (stationAuth = station roles + admin) + mounted `/orders` + page-route strings
- [x] Recovery add-on: recovery items get `currentStation`=S1 via schema default (createRecoveryOrder sets no per-item station). Verify CX+admin both start at S1 [confirm at integration].
- [x] Swagger: `Handoff`/`PendingHandoff`/`OrderSplitState` schemas + 4 endpoints (49 schemas, 282 paths, parses)
#### INTEGRATION — Option 2 (client-approved 2026-08-28): split-flow REPLACES the whole-order advance.
**Design decisions (locked):**
- **D1 stage.status = coarse computed summary** (`summaryStatus`, least-advanced station→ORDER_STATUS).
  Faithful values: QUEUE/SORT_AND_PRETREAT/WASHING/IRONING/QC. Hooks/CRM/offer/referral/bot keep reading it.
- **D2 sub-phases (washing↔drying, ironing) are WITHIN-station**, tracked by the EXISTING per-station
  detail fields (`washDetails.movedToDryingAt`, `pressDetails`, item `washStatus/pressStatus`) — NOT by
  order-level stage.status anymore. For SPLIT orders a single order-level drying/ironing is meaningless
  by design; the truth is per-item `currentStation` + `/split-state`.
- **D3 ONLY wash (S3) + press (S4) queues move to `items.currentStation`-based** selection. Refinement:
  because summaryStatus = LEAST-advanced station and sort is the earliest stretch station, ANY order with
  an item at sort has `stage.status==='sort-and-pretreat'` — so the SORT queue/guards on stage.status are
  already correct and stay. Intake (S1) + QC (S5) queues also stay (whole-order gated). So only wash+press
  need item-station-aware queries. Within-wash washing-vs-drying sub-lists use the detail fields (D2),
  and moveToDrying sets a sub-phase, not stage.status.
- **D4 the 4 between-station advances are REMOVED** (intake→sort, sort `sendToNextStage`, wash
  `washAndDryComplete`, press `pressDone`); movement happens via `/orders/:id/handoff` push+confirm.
  **KEEP:** all per-item completion actions, hold/release, qc pack&seal→dispatch (post-S5), moveToDrying
  (now sets a sub-phase, not stage.status), rider.
- **D5 notifications ported into confirm:** when the order's computed summary ENTERS a new stage, fire the
  matching customer notification (→WASHING: ORDER_WASHING, →IRONING: ORDER_IRONING, wash-only→READY, etc.).
- **D6 whole-order gates stay:** S1→S2 and S4→S5 whole-order; S2↔S3↔S4 partial (already in engine).

**Build order (station by station, read-then-edit, verify each):**
- [x] port stage-entry notifications into `handoff.confirm` (STAGE_ENTRY_NOTICE; fires to order.userId on entry)
- [x] intake→sort (S1→S2): removed `proceedToSortAndPretreat` (route+ctrl+svc+page-route). Queue stays (whole-order gated). Loads ✓
- [x] sort→wash/iron (S2→S3/S4): removed `sendToNextStage` (route+ctrl+svc+page-route). Queue stays on stage.status (sort=min-when-present). Loads ✓
- [x] wash (S3): removed `washAndDryComplete` (route+ctrl+svc+page-route); queue/active-wash/active-dry/dashboard → currentStation===WASH; moveToDrying now sets ONLY `washDetails.movedToDryingAt` + history marker (not stage.status); item guards → currentStation; completedToday → confirmed wash→press handoff today. Loads ✓
- [x] press (S4): removed `pressDone` (route+ctrl+svc+page-route); queue/active/dashboard/guards → currentStation===PRESS; completedToday → confirmed press→qc handoff today. Loads ✓
- [x] qc (S5): NO change needed — queue stays on stage.status (whole-order gated), receives via press→qc handoff confirm, pack&seal→dispatch untouched.
- [x] Swagger: removed advance route docs replaced with handoff-engine notes; engine builds (49 schemas, 278 paths). Stale sendToNextStage prose fixed.
- [x] All 5 stations verified: load + mount + engine test 16/16 + no dangling refs to removed methods.
- [x] DB VERIFICATION — `handoffStaging.js` ran against testing_db: **18 passed, 0 failed** (all matrix scenarios: gates, push/confirm, split queues, notification, reject→Hold, recovery-S1, concurrency, split-state). Cleaned up.
- [x] CONCURRENCY FIX (found by the DB run): confirm now does an ATOMIC CLAIM (updateOne guarded on handoff status==='pending' → final status) so exactly one of two concurrent confirms wins; in-memory handoff mutation removed so save can't overwrite the claim. Engine re-verified 16/16.

**PHASE 3 COMPLETE & DB-VERIFIED (2026-08-28).** The whole ₦190k package (Phases 1 addresses + 2 Set Items + 3 split-flow) is code-complete. Remaining: quick Phase 1/2 write-path DB checks (optional), then commit (uncommitted on modular-branch).

**VERIFICATION MATRIX (DB run must pass all — "passes" = this list):**
1. Full happy path: create→intake tag all→push S1→S2→confirm→sort items→push S2→S3 partial→confirm→…→QC. stage.status correct at each step; split-state accurate.
2. Each station QUEUE returns the order exactly when it has ≥1 item at that station (and not before/after).
3. Whole-order gate: S1→S2 partial rejected; S4→S5 partial rejected.
4. Partial stretch: S2→S3 subset moves, rest stay; order shows in BOTH wash and sort views.
5. Reject on confirm → item Hold + stays; release path still works.
6. Notifications: customer gets being-washed / being-ironed / ready at the right transitions (no dup, no loss).
7. wash-only + iron-only service routes (skip wash / skip … ) reach the right next station.
8. Recovery order: CX-created + admin-created both start all items at S1; flow via handoff.
9. Hooks/bot unaffected: order-status reply + a delivered order still fire CRM/referral correctly.
10. Concurrency smoke: two confirms on one order don't corrupt (last-write / re-read).
11. Dashboards count by station correctly for a split order.
12. qc pack&seal→dispatch→rider still works end-to-end.

## Feature 1 — Production Split-Flow & Structured Addresses — ₦110k · 4 new endpoints
An order can stretch across stations (some items washing while others still pressing) under one order
card, with a confirmed record at every handoff. **S1–S5 (client-confirmed):** S1=intake-and-tag,
S2=sort-and-pretreat, S3=wash-and-dry, S4=press-iron, S5=qc (rider/dispatch is post-S5). **Hard
gates:** S1→S2 and S4→S5 = whole order only; S2→S3→S4 = stretch zone (partial pushes allowed).
- **Confirmed decisions:** per-ITEM `currentStation` (not group); `stage.status` STAYS a computed
  summary (additive, keeps bot/CRM/dashboards working); structured address = sub-doc
  `{label,address,landmark}`; build the address slice FIRST.
- **Reuse (don't rebuild):** items already carry per-station status (`sortStatus`/`washStatus`/
  `ironStatus`/`qcStatus`/`holdDetails`, bookOrder.model ItemSchema); Hold exists (qc.service ~870).
- **New model bits:** `Item.currentStation` (enum STATION_STATUS); `order.handoffs[]`
  `{fromStation,toStation,itemIds[],count,status:pending|confirmed|rejected,pushedBy/At,
  confirmedBy/At,confirmedCount}`; derived helpers `countByStation`/`isWholeAt`/`summaryStatus`.
- **Endpoints (4):** `POST /orders/:id/handoff` (push; gate + per-item completion checks) ·
  `POST /orders/:id/handoff/:hid/confirm` (receiving confirms exact count; body `rejectedItems[]`→
  existing Hold; repeat-delivery merge by itemIds) · `GET /orders/handoffs/pending` (station inbound
  queue) · `GET /orders/:id/split-state` (per-station breakdown — may fold into order-detail → 3).
- **Modified (Swagger, no new route):** `createBookOrder` structured address (intake-user.service:70
  validateRule currently COMMENTED OUT; profile uses `AddressSchema{label*,address*,landmark*}`
  user.model:7-11; order stores plain `pickupAddress`/`deliveryAddress` String bookOrder.model:172-173)
  · order-detail/pipeline-progress view (intake-user.service ~1950-2025) shows split positions.
- **Add-on (+₦10k) — recovery orders honor S1→S5 (client 2026-08-27).** Recovery orders (rewash/
  rework/repair/replace) traverse the normal flow; NEITHER CX NOR ADMIN creation may skip it. ALREADY
  TRUE: `createRecoveryOrder` (recovery.service:265) sets stage=QUEUE + station=INTAKE_AND_TAG (S1),
  isRecoveryOrder; CX has no station role so can't change stages. New work = keep it true under
  split-flow: init each recovery item's `currentStation`=intake; same gates + handoff engine; create
  fixed to S1 (no "start at station X", no auto-confirmed handoff). Admin's global station access is
  unchanged (not an override). No new endpoints — wiring inside the split-flow build.

## Feature 2 — Set Items — ₦80k · 5 new endpoints
A Set = named catalog group of real, individually-priced pieces; NO set-level price; order total = sum
of ONLY the pieces selected; each selected piece recorded as its own countable order item so intake
counts stay accurate for partial sets.
- **Why cheap:** booking already TRUSTS payload `item.price` and records each line as one countable
  unit (bookOrder.service:941); catalog only consulted for heavy detection (bookOrder.service:889).
  So a Set lives entirely in the CATALOG layer — order/production layer UNCHANGED.
- **New model:** `ItemSet {name*, pieces:[{name*,price*,isHeavy}], active}` — no price field, ≥1 piece.
- **Endpoints (5, mirror /admin/*-order-item):** add-order-set · get-order-sets · get-order-set/{id} ·
  update-order-set/{id} · delete-order-set/{id}. Piece mgmt folds into add/update (pieces[] payload).
  Modified: catalog browse (`get-order-items`) also returns sets tagged `kind:'set'`.
- **Two small booking fixes:** extend heavy-detection to consult `ItemSet` piece `isHeavy`; optional
  `fromSet` tag on order ItemSchema for traceability (recommended).

## Related decisions (not part of these features)
- **Customer booking cart stays CLIENT-SIDE (localStorage), no backend** (client 2026-08-27). Only
  staff-side intake "drafts" exist (`/intake-user/drafts`, `/order/draft/:id/resume` = resume partial
  TAGGING of an already-placed QUEUE order — NOT a customer cart). `CartDraft` model (~₦25-30k) scoped
  but not wanted; revisit only if cross-device resume is requested.
- **Deep links (open, offered):** admin `template.page` is an unconstrained String → an admin can set
  a page not in `PAGE_ROUTES` (util/deepLink.js) → SMS builds a literal `/<page>` (404 risk). Known
  keys (wallet/offers/referral/complaint/order/support) route correctly (FE-confirmed 2026-08-03).
  Hardening = enum-guard the admin page field + verify `CLIENT_URL` env set in prod + ensure senders
  pass recordId. Not yet done.

---

# Previous Feature (DONE): CHUVI V1 AI Assistant — in-app bot upgrade (Phases A–D)

**STATUS 2026-08-24: MERGED TO `main`.** All bot V1/V1.1 work (Phases A–D + V1.1 parts + the 3
staging-run bug fixes: payment-step pin, OTP-step pin, styler gating) is committed and merged to
main. Post-merge, the whole orchestrator was refactored into a router + `services/bot/*` modules
(2455→561 lines, verified 11/11 — see session.md). The staging gate passed 11/11. **Next gate is NOT
backend:** the frontend team builds the two FE tasks (quickActions chips + complaint photo upload),
then INTEGRATION-TEST the live bot with REAL production data end-to-end from the app. Historical
"UNCOMMITTED" notes below predate the merge — read them as "what was built," not current git state.
Started from a client doc ("CHUVI V1 AI Assistant") that turns the read-only Phase-6 bot
into a full conversational assistant that answers AND takes actions. Approved plan file:
`C:\Users\LENOVO\.claude\plans\take-a-look-at-majestic-cherny.md`. Blow-by-blow in session.md.

## The two-bot distinction (client-confirmed — never blur this)
- **In-app bot = THIS repo.** `botIntent` + `botOrchestrator` + `Conversation`/`ChatMessage`
  support thread + sockets. Everything below is the in-app bot.
- **WhatsApp bot = SEPARATE repo.** It consumes THIS backend via the EXISTING REST APIs
  (order status, place order, open case, …) and owns its own conversation over there.
  There is NO special WhatsApp bridge endpoint here (an earlier `/bot/internal/crm-reply`
  was built then REMOVED — no consumer). Do NOT re-add one; do NOT build a stateless "brain"
  endpoint unless the client explicitly asks (would need the orchestrator decoupled from the
  in-app Conversation).

## Locked client decisions
1. The bot NOW quotes prices, places orders, opens complaints, records feedback, applies
   wallet payment, changes phone (OTP) — **each behind an explicit confirm + audit**.
2. Hard guardrails STAY (structural — never invent data; the bot has NO code path to):
   approve refunds/compensation, edit wallet balances/credits, release referral rewards,
   or resolve/close complaint cases. Those + anything unhandled → human handoff.
3. Phased build **A→D**, each shippable on its own.

## Core architecture (how the whole thing hangs together)
- LLM does TWO jobs only (`services/botIntent.service.js`): `classify()` → one `BOT_INTENT`
  (+ `intents[]` for compound, + rich `slots`), and `smallTalkReply()` for greetings/OOS.
  Keyword `rulesFallback` when no provider key / LLM fails (never hard-fails).
- `services/botOrchestrator.service.js` is the deterministic brain: routes intent → workflow.
  Multi-turn flows persist on `conversation.botState = { intent, step, slots, memory }`.
- **Reuse pattern that unblocked everything:** the controller-style services (`postBookOrder`,
  `payWithWallet`, `submitFeedback`) never touch `res` and return the plain `{success,data}`
  envelope — so the bot drives them with a synthetic `{ body, user:{id} }` request and reuses
  the EXACT production pricing/validation/credit/audit path. No money logic duplicated.
- Every write action is behind a confirm step; wallet/case/OTP verified before mutating.

## Deliverables checklist — Phases A–D ALL DONE (stub-verified; reads live-verified)

### Phase A — understanding core + conversation memory  ✅
- [x] `conversation.model.js`: added `botState.memory` (Mixed) — survives the per-turn reset.
- [x] NEW `services/botContext.service.js`: `getLastOrder`/`buildOrderSnapshot`,
      `detectReferent` (the usual / same-as-last / same place / go ahead / pronoun),
      `savedDefaults`, `loadMemory`/`mergeMemory`.
- [x] `botIntent`: expanded `slots` (items[], pickupDate, pickupTime, addressRef same/home/office,
      address, itemName, amount) + prompt extracts stated details only, never resolves refs.
- [x] `botOrchestrator`: PRESERVES `memory` across the botState reset (`_runSingle` + batch,
      `markModified`); `_updateMemory` (lastIntent + lastOrder snapshot on order-touching turns);
      `_resolveAddressRef` turns addressRef:"same" → real address from memory/profile.

### Phase B — read-only answers  ✅
- [x] New intents: pricing, turnaround, service-info, policy, payment-status, reward-status.
- [x] `pricingReply` (per-piece = `roundToNearestHundred(OrderItem.price × serviceType.pricePerPiece)`
      — the EXACT booking math; item or general list), `turnaroundReply`, `serviceInfoReply`,
      `policyReply` (curated approved facts only; null→handoff), `paymentStatusReply` (reads
      BookOrder.paymentStatus; never accuses), `rewardStatusReply` (referral ledger; never releases).
- [x] Enriched `orderStatusReply`: `STAGE_EXPLAIN` plain-language stage +
      `_readinessAndDispatchLine` ("are they ready?"/"has the rider left?") from stage+dispatchDetails.
- [x] Batching (READ_ONLY_INFO + icons), classifier prompt + rules keywords, swagger enum.

### Phase C — confirmed + audited actions  ✅
- [x] **Booking** (`bookingFlow`): BOOKING_GUIDE runs slot-fill (items→service→address→date/time→
      confirm) → `BookOrderService.createOrder({userId,payload})` (thin wrapper over postBookOrder).
      "the usual" prefills from `memory.lastOrder`. Helpers: `_placeBooking`, `_resolveBookingItems`,
      `_parseItemsFromText`, `_matchServiceType`, `_bookingEstimate`, `_resolvePickupDate`.
- [x] **Apply-payment** (`applyPaymentFlow`, intent APPLY_PAYMENT): latest unpaid order → confirm →
      `WalletService.payWithWallet(useCredit:true)` + audit. Insufficient→handoff.
- [x] **Complaint** (`complaintFlow`, FILE_COMPLAINT no longer just hands off): order → DEDUPE vs open
      ComplaintCase → match/pick ComplaintType (`_matchComplaintType`/`_pickComplaintType`) → optional
      photo (attachments threaded handleCustomerMessage→_runSingle→runWorkflow) → confirm →
      `RecoveryService.openCase`. Opens+routes to CX, never resolves.
- [x] **Feedback** (`feedbackFlow`): delivered order → 1–5 (`_parseRating`) → `FeedbackService.submitFeedback`
      (≥4 satisfied/3 neutral); ≤2 offers to open a complaint (routes into complaintFlow).
- [x] **Phone OTP** (`_startPhoneOtp` + `verify-phone-otp` step in updateDetails): sendSmsOtp(new number),
      write only on matching code; pending number under `pendingPhone` (classifier can't clobber);
      5-min expiry; SMS-send fail→handoff; address change stays no-OTP.

### Phase D — quick actions + in-app CRM framing  ✅
- [x] `quickActions[]` (`{label,message}`) on every turn via `_quickActionsForTurn` (confirm→Yes/No,
      mid-collect→Talk To Staff, answered→MAIN menu, handoff→none). Surfaced by `botApi._replyPayload`
      (sendMessage + replyToConversation bot branch). Tapping sends `message` as the next message.
- [x] `crmContext` framing: `handleCustomerMessage` optional param → block B2 frames an AMBIGUOUS reply
      (`_crmFrameToIntent`: reactivation→booking/human, reorder→booking, feedback/post-delivery→feedback,
      lead→booking); passed via the normal `POST /bot/message` body (in-app deep-link from a CRM nudge).
- [x] Booking-routing fix: classifier prompt never told the LLM to use booking-guide → added prompt line
      + offline rules branch (book my/carry my/come carry/the usual…) BEFORE order-status.

## Files touched (all uncommitted)
- `services/botOrchestrator.service.js` (biggest — all workflows + helpers + memory + quick actions + CRM frame)
- `services/botIntent.service.js` (slot schema, prompt, rules), NEW `services/botContext.service.js`
- `services/bookOrder.service.js` (createOrder wrapper), `services/botApi.service.js` (_replyPayload + crmContext)
- `models/conversation.model.js` (botState.memory)
- `util/constants.js` (new BOT_INTENTs), `util/page-route.js` (net no change — crm-reply added then removed)
- `controllers/bot.controller.js` (net no change), `routes/bot.js` (message desc + crmContext + BotReply doc)
- `swagger/schemas.js` (BotReply intent enum + quickActions), `CLAUDE.md`, `context/session.md`

## Verified
- Unit/stub: each workflow simulated (staged botState) — booking 6-turn + the-usual + cancel; apply-payment
  routing/confirm/insufficient; complaint auto-match/pick/dedupe/no-order; feedback pos/neutral/poor;
  phone-OTP send/wrong/right/expired; quickActions per turn; CRM frame 7 cases; offline routing 10/10.
- LIVE (real DB + real LLM): boot :7333 → /api-docs 200, /bot/message 401; read-path smoke (greeting,
  pricing ₦700, turnaround, service-info, order-status, wallet, offers) all correct + chips; cleaned up.
- Swagger: 41 schemas parse; quickActions + crmContext + intents + description all present.

## What later phases / commit expect (STILL TO DO)
- **WRITE actions STAGING GATE — PASSED 2026-08-24 (11/11 green).** Ran `botStaging.js` against a real
  Atlas DB (throwaway user, real LLM + Paystack + Termii). All write paths verified end-to-end:
  booking→wallet (success, pay-from-wallet, credit opt-in), booking→card (real Paystack link, stays
  PENDING), apply-payment (credit+cash, success), complaint (case opened→CX), feedback (5/5), phone-OTP
  (SMS + verify + write). Cleanup removed all records. **The run FOUND & FIXED 3 real product bugs**
  (uncommitted, in `botOrchestrator.service.js`): (1) payment-step intent hijack — typed "by card"
  hijacked the booking payment → pinned `collect-payment`; (2) OTP-step hijack — 6-digit code read as an
  order number → pinned `verify-phone-otp`; (3) reply styler mangling flow prompts + leaking a `§`
  placeholder → styler now only warms terminal replies + `§`/`?`-flip guards. Details in session.md.
  - Harness: `STAGING_OK=1 node botStaging.js --seed` (no staging DB → point MONGODB_URL at a throwaway
    local/Atlas Mongo; `--seed` seeds catalog+settings). Flags `--only=`, `--credit`, `--keep`; env
    `TERMII_API_KEY`/`STAGING_PHONE` for OTP. Safety-gated (refuses prod without `STAGING_FORCE=1`).
- Frontend work (only two real tasks): render `quickActions` chips (tap → send `message`); wire photo
  upload (`POST /api/utils/image-upload-single`) → `attachments[]` for complaints. Copy-paste FE handoff
  block is in the session (changelog + tasks).
- Then commit (client review gate — confirm first).

## NEXT WORK PACKAGE — Bot Intelligence & Fixes (V1.1) — PLANNED, NOT STARTED

Approved direction (2026-08-21, client via user): make the bot **smarter + less verbose without
scope drift**, and fix two real defects. Design principle stays: **LLM understands & phrases;
deterministic code owns every fact & action; guardrails from "Locked client decisions" unchanged.**
The LLM never generates a data answer — only (1) classify, (2) extract slots, (3) [NEW] tighten/warm
a fixed reply, (4) small-talk.

**Motivating evidence (client screenshot, WhatsApp/in-app booking):** bot repeated
*"When should we come? …"* 3× while the customer answered ("Tomorrow same address as before" + tried
to change items). Root cause in `bookingFlow`:
- `botOrchestrator.service.js:771` — on `collect-datetime` it dumps the WHOLE message into the date
  field ("Tomorrow same address as before" becomes the "date").
- `:772` — time ONLY comes from the LLM `pickupTime` slot; customer gave none → stays empty.
- `:842` — step requires BOTH date AND time → re-asks the IDENTICAL line forever (no attempt counter,
  no rephrase, no escape).

### Parts (priority order) — ALL PARTS DONE 2026-08-22/23 (stub-verified, UNCOMMITTED); live staging pending
1. **G — PAYMENT GATE (highest; a money bug). ✅ DONE.** Booking now places the order then routes to a
   `collect-payment` step (`_bookingPaymentStep`): wallet (`payWithWallet` + audit) or card (Paystack
   `initializePayment` → `authorization_url` link; order PENDING until webhook). `_placeBooking` no
   longer says "Done" for an unpaid order (≤0 → "fully covered"). Helpers `_parsePaymentChoice`,
   `_walletAvailable`; chips [Pay from wallet][Pay by card]. STILL TO DO: live staging (real money).
   **Billing follow-up DONE 2026-08-22:** (a) subscription-aware — `_placeBooking` tries `pay-from-subscription`
   first for active subscribers (reuses postBookOrder validation; rejected attempt creates no order), success →
   "covered by your plan" (no payment step), rejection → pay-per-item fallback + reason (`_subFallbackLead`);
   (b) wallet billingType label match — stamp order `billingType='pay-from-wallet'` after successful wallet
   settlement (card stays pay-per-item); (c) `_walletAvailable` hardened to the canonical
   `WalletCreditService.getCreditBalances`. Credits (all types, credit-first) confirmed covered by the shared
   `chargeWalletForOrder`. **Credit opt-in DONE 2026-08-23:** the bot now ASKS before spending reward credit
   (only when creditTotal>0) in BOTH wallet paths — `confirm-credit` (booking) / `confirm-pay-credit`
   (apply-payment); yes→credit-first, no→cash-only (else reroute). Shared `_settleWalletCharge` (charge+audit
   +billingType stamp) used by both. No longer always credit-first.
   Original problem statement: `_placeBooking` creates a `pay-per-item` order UNPAID
   and says *"Done! …you can pay in the app"* (`botOrchestrator.service.js:882,907`) — no payment
   collected, billing method hardcoded, booking declared complete with ₦0 taken. Fix: after the
   customer confirms, CONTINUE into a payment step — ask wallet vs card (offer subscription if an
   active plan). Wallet → reuse `WalletService.payWithWallet` (insufficient → top-up/card). Card →
   `initialize-payment` (`transactionType:'order'`) → send `authorization_url` as a "Pay now" chip;
   order stays PENDING until the existing Paystack webhook confirms (bot never confirms payment
   itself). Wording: "placed — awaiting payment", NOT "Done ✅", until paid. Track pending so the
   loop/handoff logic can nudge unpaid orders. Guardrail: bot gains NO new money authority (own
   wallet on own order, or a standard Paystack link the customer authorizes).
2. **C — LOOP/REPEAT GUARD (bug; stops the 3× repeat). ✅ DONE.** `_applyLoopGuard` in `_runSingle`:
   counts stalls (same step+intent = no advance) in `botState.slots._stall`; 1st → "(tap Talk To Staff)"
   hint, 2nd → stop repeating + offer human via existing `offered-handoff`. Resets on advance. General
   (all flows). NOTE: C only stops the infinite LOOP — the datetime PARSE fix that makes booking actually
   understand "tomorrow same address" is A+B (still pending).
3. **A + B — IN-FLOW UNDERSTANDING + SMART DEFAULTS. ✅ DONE 2026-08-23.** Removed the "whole message =
   date" dump; date/time now come from LLM slots → `_parseDateTimeFromText` fallback (parsed every turn,
   so "tomorrow morning" fills both). DATE-ONLY accepted → `_defaultPickupWindow` defaults the time
   (`bTimeAuto` flag, shown as "default window" at confirm). `_parseItemsFromText` reads spelled-out
   numbers; `_resolvePickupDate` handles "day after tomorrow". Verified end-to-end that the screenshot
   scenario ("Tomorrow same address as before" at collect-datetime) now ADVANCES instead of looping.
   (This is the deterministic/offline layer; the LLM already supplies the slots when up — A makes the
   flow USE them + adds a safe fallback.)
   **Booking extras DONE 2026-08-23 (on request):** (i) offline number words incl. tens/compounds
   (`_wordToNumber`, "fifty shorts"); (ii) large-quantity confirm (`confirm-qty`, >30) guarding typos;
   (iii) **delivery-speed selection** (`collect-speed`) — offers only speeds available at the current
   clock via `calculateDueDate` (same-day<10am/express<2pm/standard), charge+ETA in estimate & summary,
   and reroutes to another speed if the cut-off passes / capacity fills at placement (was hardcoded
   standard). NOTE: plan/capacity limits still count LINE ITEMS not quantity (pre-existing, not changed).
4. **D — MID-FLOW CORRECTIONS & SIDE-QUESTIONS. ✅ DONE 2026-08-23.** Mid-flow **cancel** (`_isCancel`,
   clears flow keeps memory) + **side-question** (D2 block: pricing/turnaround/service-info conf≥0.6 during
   a collect step → answer via runWorkflow then resume via runWorkflow(text:'') , stall reset). Corrections
   ("actually 2 shirts") already covered by A's per-turn slot re-ingest. (No new LLM output field needed —
   derived from existing classify intent/confidence + keywords.)
5. **E — REPLY STYLER. ✅ DONE 2026-08-23.** `botIntent.styleReply` + `_maybeStyle`: tokenize all data
   (₦/OSC/times/numbers/%) → LLM ≤2 warm sentences → require every token back or FALL BACK to exact text;
   skips multi-line/link/<25-char replies (summaries/offers/links intact); applied per reply in `_runSingle`;
   gated `BOT_STYLE_REPLIES` (default on, "false" disables), no-op without provider. Chips-first already
   shipped (Phase D). Cost: +1 LLM call per prose reply — flagged.
6. **F — GUARDRAILS STAY (standing rule, not a task).** LLM never quotes an unapproved price, invents
   order/wallet data, acts without the existing confirm+audit, approves refunds/compensation, or
   resolves a case. "Smarter" only ever = better understanding + tone.

**Do first before the bot touches a live customer: G + C (they're bugs, not enhancements).**

## Housekeeping for a fresh session
- Read summary.md + session.md + this file first (CLAUDE.md rule).
- Bot section of CLAUDE.md was rewritten to the new "acts-with-confirm" direction incl. Phase A–D status —
  trust it over any older "the bot never places an order / never quotes prices" phrasing elsewhere.
- Provider: no key in a bare `node -e` (rules path); the full app chain loads dotenv so classify() hits the
  LLM — mind token cost when smoke-testing via the app.
