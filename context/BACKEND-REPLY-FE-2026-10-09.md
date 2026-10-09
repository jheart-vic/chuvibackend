# Backend reply to the frontend — 9 October 2026

Written for the frontend developer. Every item below was traced to the line that causes it. All five
reported issues are real and reproduce in the code; none was a stale deploy this time.

---

## Part 1 · The five reported bugs

### 1.1 Single-item holds cannot be cleared — CONFIRMED, and worse than reported

You are right that there is no way to clear an item hold. There are three separate causes, and the
first one makes some holds **unreleasable by anybody**.

**(a) Every station offers "Admin" as the assignee, and no admin release path exists.**
Each station's `sendToHold` validates `assignTo` against a `stationMap` that always includes
`ROLE.ADMIN` → `admin-station`:

| Station | Allowed `assignTo` |
|---|---|
| Sort & Pretreat | admin · intake-and-tag |
| Wash & Dry | admin · sort-and-pretreat · intake-and-tag |
| Press & Iron | admin · wash-and-dry · sort-and-pretreat · intake-and-tag |
| QC | admin · press · wash-and-dry · sort-and-pretreat · intake-and-tag |

Release is the mirror image: each station's `releaseFromHold` only clears items where
`holdDetails.assignTo === <that station's own role>`. **There is no admin station service**, and
`services/admin.service.js` never touches `items.holdDetails` anywhere — I grepped it. So an item
hold assigned to Admin — the first option on every station's list — can be released by no endpoint
in the system.

**(b) Admin's existing `resolve-hold` cannot see item holds.**
`AdminService.resolveOrderHold` ([services/admin.service.js:2261](services/admin.service.js#L2261))
finds the order with `{'stage.status': ORDER_STATUS.HOLD}`. Since the client's 2026-10-08 ruling
made S2–S5 holds per-PIECE, those holds deliberately no longer set the order's stage to `hold`. So
the admin endpoint returns "Order not found or not currently on hold" for exactly the holds you need
it for. It was built for order-level holds and never updated.

**(c) Release is all-or-nothing, and has no `itemId`.**
`PATCH <station>/order/:id/release-from-hold` takes an order id only. It loops every item assigned to
that role and releases **all of them**. Two pieces held on one order for different reasons cannot be
released separately.

Worth knowing about Intake's version specifically
([services/intake-user.service.js:2394](services/intake-user.service.js#L2394)): because the four
production stations assign their holds to Intake, Intake is the usual release door — but its release
also **wipes every tag** (`tagStatus: 'pending'`, `tagId: ''`, `tagState: []`, `tagColor: null`) and
forces the whole order back to `QUEUE` at the tagging station. That behaviour is correct for a hold
Intake itself raised. It is wrong for a Wash-raised hold on one piece: releasing it sends the entire
order back to re-tagging.

**Who clears it, and how — my proposal, needs your sign-off because it changes your screens:**

1. **New `PATCH /api/admin/order/:id/item-hold/:itemId/release`** (adminAuth). Admin can release any
   item hold regardless of assignee. This is the missing door and closes (a) and (b).
2. **Add an optional `itemId` to every station's release**, so one piece can be released without the
   others. No `itemId` keeps today's "release all mine" behaviour, so nothing you have already built
   breaks.
3. **Split Intake's tag-reset out of the generic release.** The reset should apply only when the hold
   was raised *by* Intake (`heldByStation === intake-and-tag-station`), not when Intake is merely the
   assignee for another station's hold.
4. The release returns the order through `presentOrder` so your screen can re-render from the
   response without a second fetch.

Tell me if you would rather the admin release live under the existing Holds Management route shape
instead; it is the same work either way.

### 1.2 Press queue returns started orders while the counter says 0 — CONFIRMED

This is brief 1.1 again. **Wash was fixed for it and Press never was.** Press has three queries for
one screen and all three disagree:

| What | Filter |
|---|---|
| `pressQueue` counter ([pressAndIron.service.js:52](services/pressAndIron.service.js#L52)) | `$elemMatch: {currentStation: HERE, pressConfirmedAt: {$exists:false}}` — item-level |
| `recentQueue` on the dashboard ([:76](services/pressAndIron.service.js#L76)) | `{'items.currentStation': HERE}` — unfiltered |
| `getPressQueue` list ([:118](services/pressAndIron.service.js#L118)) | `{'items.currentStation': HERE}` — unfiltered |

Once the operator confirms the pieces, `pressConfirmedAt` is stamped and the counter drops to 0 —
but the order is still at the station, so both lists keep showing it. It is also now in Active Press,
so it appears twice on one screen.

Compare Wash, where all three use the identical
`{'items.currentStation': HERE, 'washDetails.startedAt': {$exists:false}}`, with a comment saying
exactly why ([washAndDry.service.js:155](services/washAndDry.service.js#L155)).

**Fix: make the two Press lists match the counter.** I will align all three on the same predicate the
way Wash is aligned. No API shape change — the list simply stops returning started orders, and your
counter and list will agree. This is a backend fix; nothing needed from you.

### 1.3 Rider list sends no delivery date or promise — CONFIRMED

`deliveryPromise` is derived in `presentOrder` ([util/orderView.js:77](util/orderView.js#L77)), which
is the one outward shape so that no read path forgets it. **`rider.service.js` never calls
`presentOrder`** — only `admin`, `bookOrder` and `intake-user` do. On top of that, the `select` on
both rider delivery lists
([rider.service.js:54](services/rider.service.js#L54) and [:91](services/rider.service.js#L91))
omits `deliveryDate` entirely, so the field is not even fetched.

So the rider gets neither the raw date nor the promise text. That is a straight gap, not a decision.

**Fix:** add `deliveryDate` to the `select` and run the rows through `presentOrder` on
`getRiderAssignedDeliveries`, `getActiveDeliveries`, `getRiderAssignedPickups`, `getActivePickups`
and `getOrderDetails`. You will then get `deliveryPromise: {text, confirmed, …}` on rider rows, the
same object the customer app already renders. **Render `deliveryPromise.text`; do not format
`deliveryDate` as a time** — it is pinned to 19:00 as an end-of-day sentinel, which is the trap B1
was about.

### 1.4 Count mismatch returns 400 where the changelog said 200 — CONFIRMED as a 400, needs a ruling

The code is deliberate ([intake-user.service.js:764](services/intake-user.service.js#L764)): when
Intake's count differs from the rider's, it raises the hold and then returns
`sendFailedResponse(...)`, which is **HTTP 400**. The changelog described the behaviour ("the order
stops on a hold and the response carries `countMismatch: true`") but never stated a status code, so
you reasonably read it as a success. That is a documentation failure on my side.

The good news: **the extra fields do survive the failure envelope.** `sendFailedResponse` spreads
whatever it is given ([base.service.js:66](services/base.service.js#L66)), so you get:

```json
{ "success": false,
  "data": { "error": "Your count of 8 does not match the rider's count of 10. …",
            "countMismatch": true, "riderCount": 10, "intakeCount": 8,
            "holdRaised": true, "requiresAdminApproval": true, "statusCode": 400 } }
```

**My recommendation: keep the 400 and branch on `data.countMismatch === true`.** The reason is that
the requested action genuinely did not happen — the order did *not* proceed to tag — and a 200 would
make every other caller treat a blocked order as a success. The sentence in `error` is written for
the operator and can be shown as-is.

I will change it to 200 with a `blocked: true` payload if you prefer, but it has to be one or the
other and decided now, because the same shape applies to the rider's `requiresCountReason` refusal
([rider.service.js:626](services/rider.service.js#L626)). **Your call — say which and I will make
both consistent and correct the changelog either way.**

### 1.5 `hasComplaint` false for a counted complaint — CONFIRMED, real bug

`_lowRatedOrders` reads a back-reference on the Feedback document:
`hasComplaint: Boolean(f.complaintCaseId)`
([recoveryReport.service.js:388](services/recoveryReport.service.js#L388)).

That field is written in **exactly one place** — inside `submitFeedback`, and only when the same call
carried `type: 'complaint'` ([feedback.service.js:259](services/feedback.service.js#L259)).

Every other way a complaint is opened calls `RecoveryService.openCase` directly and never writes back
to the Feedback row: the in-app bot's complaint flow, a CX or admin opening a case, and — the common
one — a customer who rates 1–2 stars and *then* accepts the offer to open a complaint. The complaint
counts in the report's complaint figures because those read `ComplaintCase` directly; only the
low-rated row's flag goes by the stale back-reference.

**Fix: stop trusting the back-reference.** `_lowRatedOrders` will query `ComplaintCase` for
`orderId ∈ <the low-rated order ids>` and derive `hasComplaint` from that, which is correct whichever
door the complaint came through. I will also set `feedback.complaintCaseId` inside `openCase` when a
`feedbackId` is supplied, so the link is repaired going forward — but the report will no longer
depend on it. Existing rows are fixed by the query change, with no backfill needed.

---

## Part 2 · N1 — what is blocked, and one thing that is not

### Count-only booking — CONFIRMED a backend gap, I will build it

You are right. `createOrder` requires a full item list:
`items: 'array|required'`, `items.*.type|price|quantity: required`
([bookOrder.service.js:1222](services/bookOrder.service.js#L1222)), with a hard refusal at
[:882](services/bookOrder.service.js#L882) — *"items is required and must list the actual pieces
received."* And `counts.customer` is never written at booking, so the count-only path does not exist
at all. The window/Anytime half of N1 shipped; this half did not.

The client's locked spec (2026-10-07) is that Quick Booking captures **service type + delivery speed
+ landmark + pickup window + the count** — not an item list. The real pieces are entered by Intake
afterwards, which is why Intake's four steps end in a system-computed bill and a payment hold.

**This is mine to build.** It needs: a count-accepting booking path that writes `counts.customer`,
an estimate from the count (the bill is the one Intake computes later), the capacity gates run on
the count instead of `items.length` — they currently all read `post.items.length` — and the order
left in a state Intake's "enter items" step already understands.

### Rider pickup photo — NOT a backend gap. The client ruled it out.

This one I need you to stop building rather than wait on me. The 6 October brief did say
"rider confirms count + photo", but when the client answered our five N1 questions on 2026-10-07 they
overruled it in writing:

> **No rider photo.** Rider RECORDS the count; if it differs from the customer's he must change it and
> give a reason → flag "count changed at pickup", does NOT stop the order, customer gets an SMS with
> the rider's count.

That is recorded at `context/feature.md:809` and quoted in the code at
[rider.service.js:600](services/rider.service.js#L600). `PUT /api/rider/mark-pickup/{id}` therefore
takes `itemCount` + `countReason` and no photo, on purpose.

If the client has since changed their mind, say so and I will add photo upload — it is small. But
nothing is blocked on me today, and the current behaviour is the client's decision, not an omission.

### The Quick Booking card at Intake

Tell me what that card needs to show and I will confirm whether an endpoint exists. If it is "orders
booked by count that are waiting for their real items to be entered", that is a new filtered list and
I will add it alongside the count-only booking work, since it is the same state.

---

## Part 3 · The four things you could not test live

Three of them are now testable — the backend is deployed:

- **Rider count mismatch with a reason** — live. Note 1.4 above: it is a **400**, not a 200, and the
  reason requirement only bites when the count differs from the customer's.
- **Flag/Hold at Wash** — live, but read 1.1 first. Raising the hold works; **do not assign it to
  Admin while testing**, or you will create a hold you cannot clear. Assign to Intake until the admin
  release ships.
- **Dispatch refusal for a waived order** — live. The asymmetry is deliberate: a waiver OPENS tagging
  and CLOSES dispatch, so a waived order processes but is stopped at dispatch.
- **Item editing** — live.

**Offers: the ₦4,000 / ₦3,900 / ₦8,000 cases need a fresh account, which you could not create.**
That is a real blocker and it is mine — no staff endpoint creates a customer account, which I already
flagged to the client separately. Tell me how many test accounts you want and I will create them
directly against the database with known phone numbers and no offers attached, so the First
Experience trigger fires cleanly on each.

---

## STATUS — all five are FIXED (9 October, later)

`briefCheck` **359/359** · swagger **74 schemas / 308 paths / 0 wrong envelopes**.
Full FE-facing contracts are in the addendum at the end of
`context/FE-CHANGELOG-2026-10-09.md`.

| | Item | Done | Anything for you |
|---|---|---|---|
| 1 | Item holds — NEW `PATCH /admin/order/{id}/release-item-hold`, optional `itemId` on all five station releases, Intake's tag-wipe scoped to its own holds | ✅ | New endpoint to wire into Holds Management |
| 2 | Press queue list aligned to its counter (one predicate, as Wash) | ✅ | Nothing — no shape change |
| 3 | `deliveryDate` + `deliveryPromise` on all five rider reads | ✅ | Render `deliveryPromise.text` |
| 4 | Count mismatch stays **400**, now documented with its body in swagger | ✅ | Branch on `data.countMismatch` |
| 5 | `hasComplaint` derived from `ComplaintCase` | ✅ | Nothing — no shape change |
| 6 | Count-only Quick Booking | ⏳ next | Confirm what the Intake card shows |
| 7 | Test customer accounts for the offer cases | ⏳ | **How many** |

I took the 400 decision myself rather than hold the fix — the reasoning is in
1.4 above, and it is a one-line change if you disagree.

**A regression I nearly shipped, for the record:** gating the station releases on
"is a piece of mine held" refused the ORDER-level holds that admin's
`send-to-hold` raises — it parks the whole order at a station and creates no item
hold, and the station release is how those were always cleared. Both paths now
work and the gate asserts it.

Rider pickup photo is not on the list, by the client's decision.

### Still to run: the DB harnesses
The offline gate is green, but `stationFlowStaging` (97), `holdsStaging` (48),
`recoveryReportStaging` (52) and `dispatchStaging` (46) cover exactly this code
and need the testingdb URI, which is passed inline and never written to `.env`.
Nothing here is verified against a live database until those run.
