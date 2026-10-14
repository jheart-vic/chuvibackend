# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-101 [P3] open - Risk fixes A and B have behavioural checks only for their happy paths; their refusal paths are checked by source regex alone

**File:** rolloverStaging.js (scenario 13); briefCheck.js:2967-2975
**Found:** 2026-10-14 by /audit independent (scope: current; lens: tests)
**Why it matters:** The safety of fix B rests on what it refuses: two code-less candidates, a candidate on another plan code, an `expired` (replaced) code-less plan, and another customer's plans. Fix A rests on skipping a code already stored on any record and an ended Paystack subscription. Scenario 13 drives only the accept path of each (A: old `attention` code taken by the failed record, new one picked; B: one candidate adopted). The briefCheck entries match source text, so a later edit that drops the `paystackSubscriptionId` or `status` filter, or the `taken` skip, would still pass both. This review confirmed the current refusal paths by reading and by an offline stub probe (two candidates → reported, filter carries `userId`, `subscriptionCode: {$in:[null,'']}`, `status: {$in:[active,cancelled,failed]}`, `paystackSubscriptionId`), so nothing is wrong today.
**Suggested fix:** Add to scenario 13: two code-less plans → reported unapplied, nothing adopted; a code-less plan on another plan code → reported; an `expired` code-less plan → reported; for A, a non-ended same-plan code stored on another customer's record is never picked. Nothing current is lost.
**Resolution:**

### F-102 [P3] open - Paystack's "ended" status list and the get-then-disable sequence are copied in several places

**File:** util/webhook.handler.js:647 and :683; crons/reconcilePaystack.js:77; services/subscription.service.js:278, :341, :429
**Found:** 2026-10-14 by /audit independent (scope: current; lens: quality)
**Why it matters:** `['cancelled', 'complete', 'completed', 'non-renewing']` now appears six times, and "GET the subscription, disable unless ended, 10 s timeout" is written out in `closeOtherPlans`, reconcile Task 2b and `cancelSubscription`. `PAYSTACK_STATUS_MAP` already lives in util/subscriptionAccess.js. If Paystack's status set changes, or one copy is edited (e.g. to add `attention` handling), the switch-off paths can disagree about whether a subscription can still charge.
**Suggested fix:** Export one `PAYSTACK_ENDED` list (or `isPaystackEnded(status)`) and, optionally, one `disableOnPaystack(code, token)` helper from util/subscriptionAccess.js, and use them in the six places. Behaviour unchanged; nothing current is lost.
**Resolution:**
