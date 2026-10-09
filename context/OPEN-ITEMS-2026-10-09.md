# What is left — 9 October 2026, after the backend deploy

Source: the frontend's "CHUVI Fix Status" PDF (30 done · 1 partly · 1 waiting on backend · 1 no
change) checked item by item against this repo and against `origin/main` (`0caf0b9`, PR #244), which
is what Render deploys.

**Headline: the deploy closed two of the three questions the frontend was waiting on. One frontend
item is genuinely left (a physical printer test), one backend commit is still unmerged, and a batch
of work tested against stubs now needs re-testing for real.**

---

## 1. The one frontend item still open

**1.7 — printer check of the bolder tag.** The font was the cause and the heavier face is shipped,
but nobody has put a 40 × 60 mm label through a real printer. This cannot be closed from code or
from the browser; someone has to print one and look at it. Nothing in the backend blocks it.

---

## 2. The three "still open" questions — answered

### Q1. Dormant customer rate, and Q1–Q8
**Answered, and the document exists in this repo: `context/CLIENT-ANSWERS-oct2026.md`.** It covers
all eight questions in the form the client asked for, including how "dormant" is defined (the 30-day
dormancy scan, which OVERRIDES the count-based stage, while `totalOrders` counts only DELIVERED
orders — those two facts between them explain every CRM number the client called unexplained). It
ends with the decisions we need back.
→ **Action: send that file to the frontend, or to the client directly.** No code involved.

### Q2. Phone normalisation and wallet limit defaults — are they deployed?
**Yes. Both are on `origin/main` and therefore live:**
- phone normalisation — `util/helper.js` (canonical `0` + 10 digits; 7 real-world forms collapse to
  one, idempotent, applied on write at signup / booking / intake)
- wallet limit defaults — `ensureWalletAdjustmentLimits()` in `config/setup.js`, the idempotent
  backfill that writes 5000/10000 onto the existing settings doc only where the field is absent, so
  an admin's own limits are never overwritten

→ The frontend can now verify both against the live backend. This also unblocks **4.6 "Partly"**:
the backend now stores one format per customer, so the phone-format half of 4.6 can be finished and
closed.

### Q3. The customer cancel button
**The backend is now the stricter of the two, and the frontend's traffic light does not know it.**
`taggingBegun()` (`util/cancellationFees.js:35`) reads the ITEMS, not the stage — a `tagId` is
enough. A tag can exist while the order is still sitting in the tagging QUEUE, which the older tier
list treats as amber ("cancellable on request"). So an order the frontend paints amber will be
refused by `_cancelTier` (`services/bookOrder.service.js:105`) with:

> "Tagging has already started on this order, so it can no longer be cancelled. Please contact
> support to raise a complaint."

There is **no read-only endpoint that returns the tier** — all four callers of `_cancelTier` are
write paths (`cancelOrder`, `staffCancelOrder`, `requestCancellation`, `approveCancellationRequest`).

Two ways to settle it, client's call:
- **(a) Leave it.** The refusal message is clear and correct. Cost: the customer sees a cancel
  button that fails, on orders where they were previously told cancelling was possible.
- **(b) Backend exposes the verdict (recommended).** Add a `cancellation: { allowed, tier, reason,
  estimatedFee, refundToWallet }` block to `presentOrder`, so the one definition drives both the
  button and the refusal and they cannot drift. Small backend job — say the word and it goes in.

---

## 3. A real backend gap the PDF could not see

**`ce2380b` "Block service-type name edits" is NOT merged.** `origin/main..feature/fix` is 3 commits
(`65be927`, `5ea80ac` docs; `ce2380b` code). So the frontend's **B3 "Service type names locked"** is
locked on the screen only — the API still accepts it.

Why that matters: an order stores `serviceType: "wash-and-iron"` and pricing finds the price by
matching that string against `serviceTypes[].name`, **falling back to a multiplier of 1** when
nothing matches. `updateAdminSettings` `$set`s whatever it is given with `runValidators: false`. So
a rename never throws — it silently under-prices every order already placed under the old name. The
guard refuses when a name orders depend on would disappear (which also catches delete-then-re-add),
names the type and its order count, and points at `/api/admin/display-names`.

→ **Action: merge `feature/fix` into `main` and redeploy.** briefCheck 341/341,
dashboardDecisionsStaging 45/45 on that commit.

---

## 4. Shipped behind stubs — now needs live re-testing

The frontend tested these in the browser with the backend's reply simulated, so no real order moved.
The backend is deployed now, so each should be run once against it:

| Item | What to re-test live |
|---|---|
| B2 | payment hold raise · bank-transfer approval (reference required) · admin waiver with reason · the Bank Check List |
| B5 | change items → re-priced bill · higher total raises a payment hold · lower total refunds to wallet · failed-refund flag |
| B6 | rider's collected count + reason · intake's own count · a differing count holding the order for an admin |
| B7 | cancellation fee computed by the backend (free before pickup; both trips once collected) + its explanation and refund |
| S | dashboard figures with real data — avg revenue per item, the 7-day average, and `avgProcessingTime` |

**Two live-data notes for that pass:**
- `avgProcessingTime` can legitimately be **`null`** (`processingTimeNote: "Not enough data yet"`).
  An unguarded render prints the word "null". The PDF says S handles it; confirm against real data.
- `remaining: Infinity` serialises to **`null`** = unlimited, not zero.

Also not yet opened in a browser at all: **Quality Control and a few other screens** — covered by
the build and code checks only.

---

## 5. Housekeeping

- **Remove the three test orders** titled "CLAUDE TEST": `OSC-20261007-442410`, `-779451`,
  `-870312`. Test offers, plans, templates and wallet requests were already cleaned up.
- **Possible frontend adoption gaps** (all live since the Group 4 merge, worth one check):
  `GET /api/communication/templates/meta` — the six valid template keys as a dropdown rather than a
  free-text box (PDF 4.2 says this is done); `avgRevenuePerItem7Days`; `dormantRateLabel` (the CRM
  card title from the API — PDF 4.5 says done).
- **Two client-side config actions** that shipped messages already assume: the **First Experience
  offer**, and a **free-logistics offer with an ₦8,000 minimum** (CRM message 3 promises it and the
  promise is false until the offer exists). The client said they would set both up — confirm.
- **Two notes drafted but never sent to the client:** weekend promises get a day longer (Saturday
  standard: Monday → Tuesday), and at today's settings a window booking costs exactly what a booking
  costs now — only Anytime costs more.

---

## The short version

1. Print one tag (1.7). That is the only frontend item left.
2. Send `context/CLIENT-ANSWERS-oct2026.md` — it answers the dormant rate and Q1–Q8.
3. Tell the frontend: phone normalisation and the wallet limit defaults ARE live; finish 4.6.
4. Decide the cancel button: refusal message only, or expose the verdict on the order (recommended).
5. Merge `feature/fix` and redeploy, or B3 is screen-deep only.
6. Re-test B2 / B5 / B6 / B7 / S against the live backend, and delete the three CLAUDE TEST orders.
