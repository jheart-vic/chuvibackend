# Current Feature: §4 — Offer multi-criteria targeting (LAST piece of the client brief)

Branch: `bot-polising` (all prior work uncommitted per client — see session.md).
This is the ONLY remaining part of the client "Fix & Improvement Brief". Sections
§1, §2, §3, §5, §6, §7, §8 are DONE + verified (details in session.md).

## What the client asked (§4 targeting bullets)

- Admin can select MULTIPLE triggers, stages, tags and customer groups.
- Multiple choices inside one category = OR; different categories = AND.
- Example: Trigger = First Order OR Referral; Stage = Lead OR First Order;
  Tag = Student OR Young Professional. The customer must meet one trigger AND one
  selected stage AND one selected tag.
- (The stacking / one-personal / baseline / no-reuse-until-new-event bullets in §4
  are ALREADY built — see summary.md Offer quick reference + the booking-options
  work in session.md.)

## Locked design decision (from the client, already agreed)

- All four categories become arrays; **OR within a category, AND across categories,
  and an EMPTY category = "no constraint" (skipped).**
- `triggers[]` = the events that can MINT/assign the offer. `stages[]` / `tags[]` /
  `customerGroups[]` = eligibility GATES, evaluated at assignment AND re-checked at
  booking/redeem (drives the "why it can't apply" reason already surfaced by the
  §4 booking-options work).
- One shared matching function used at both assignment and booking so they can't drift.
- Backward-compatible: migrate the single `trigger` → `triggers:[trigger]`, keep
  reading the old field.

## KEY FINDING — most of this already works

`services/offer.service.js` `checkProfileRules(offer, stats)` ALREADY treats
`rules.stages[]` and `rules.tags[]` as **OR-within** (stage ∈ list; tag overlap),
**AND-across** (both must pass), and **empty = skipped**. So stages + tags are DONE.
`offer.model.js` already has `rules.stages[]` and `rules.tags[]`.

So the ACTUAL remaining work is just:
1. **Multi-trigger** (`trigger` single → `triggers[]`).
2. **`customerGroups[]`** — a NEW 4th dimension (needs one definition decision, below).

## OPEN DECISION to resolve at the START of §4

**What is a "customer group"?** The brief lists tags AND customer groups as separate
categories, but the example puts Student/Young-Professional under TAGS. So
customerGroups is underspecified. Options to put to the client:
  (a) another set of CRM tags, admin-managed as "groups" (simple; slightly redundant
      with tags) — evaluate against `stats.tags` like tags;
  (b) a distinct profile dimension — e.g. service TIER (classic/premium/vip), or
      subscription status, or channel (website/whatsapp/office);
  (c) a real CRM "segment" field added to CrmProfile.
Recommendation: (a) unless the client wants a specific non-tag dimension. Confirm
before building this part; multi-trigger can proceed regardless.

## Implementation plan

### 1. Multi-trigger
- `models/offer.model.js`: add `triggers: [{ type: String, enum: OFFER_TRIGGER }]`.
  Keep `trigger` (deprecated). Update the `{ trigger:1, status:1 }` index → also index
  `triggers`.
- `offer.service.getActiveOfferForTrigger(trigger)`: query offers where
  `triggers: trigger` OR legacy `trigger: trigger`, still "newest ACTIVE" pick.
  (Find the method — it's what handleTrigger calls at ~line 239.)
- `services/offerApi.service.validateOfferPayload` (admin builder create/update):
  accept `triggers[]`; validate each ∈ OFFER_TRIGGER. If only `trigger` sent, normalise
  to `[trigger]`. If only `triggers[]` sent, set `trigger = triggers[0]` for back-compat.
- Migration: one-time backfill in `config/setup.js` (or a throwaway) — for offers with
  `trigger` and empty `triggers`, set `triggers = [trigger]`.

### 2. customerGroups (after the decision)
- `offer.model.js` `rules.customerGroups: [String]` (if option a/c) or a typed field.
- `checkProfileRules`: add the AND-across clause, OR-within, empty-skip — mirror the
  existing stages/tags pattern exactly. Pull the compared value from `stats` (extend
  `getCustomerStats` if the dimension isn't already there).

### 3. Shared matching (already effectively shared)
- `checkProfileRules` is already called at assignment (`handleTrigger`), in
  `getCustomerOffers`, `getBookingOptions`, and `_offerRejection` (validate). Adding
  customerGroups there covers all paths automatically. No new function needed — just
  keep everything going through `checkProfileRules`.

### 4. Swagger
- `swagger/schemas.js` Offer schema: add `triggers[]` + `rules.customerGroups[]`.
- Offer builder route bodies (routes/offer.js create/update): document `triggers[]`.

## Verify (throwaway script, dev DB — pattern in session.md / scratchpad)
- Multi-trigger: an offer with `triggers:['first-experience','referral-reward']` is
  minted by EITHER trigger; not by a third.
- OR-within/AND-across: offer with stages:[lead,first-order] + tags:[student,young-pro]
  → customer matching one stage AND one tag is eligible; missing the tag → rejected
  with reason; empty category → no constraint.
- Legacy back-compat: an offer with only `trigger` still mints.
- customerGroups (once defined): analogous.

## Deliverables checklist — ALL DONE (verified 19/19 + boot), uncommitted
- [x] offer.model triggers[] + rules.customerGroups[] (customerGroups = admin-managed
      CRM tag list, per client decision option (a) — matched against customer's tags)
- [x] getActiveOfferForTrigger matches triggers[] ($or with legacy trigger)
- [x] offerApi.validateOfferPayload accepts/normalises triggers[] (+ normaliseTriggers
      helper keeps legacy `trigger` == triggers[0]; personal needs ≥1 trigger)
- [x] checkProfileRules gains customerGroups clause (OR-within, AND-across, empty-skip)
- [x] trigger→triggers[] backfill (config/setup.js backfillOfferTriggers, idempotent)
- [x] Swagger Offer schema + builder create route + rules.customerGroups
- [x] Verify script (scratchpad/verify_s4.js) 19/19 + boot :7994 clean

## §4 DONE — the entire client "Fix & Improvement Brief" (all 8 sections) is complete.

## Housekeeping reminders for the fresh session
- EVERYTHING since the appliedOffers hotfix is UNCOMMITTED (7 brief sections). The
  client is reviewing before commit. Do NOT commit unless asked.
- §3C deep-link FE routes in `util/deepLink.js` PAGE_ROUTES are best-guess — the client
  may hand over exact paths to correct.
- appliedOffers CastError hotfix (models/bookOrder.model.js pricing.appliedOffers using
  `type:{type:String}`) is a production fix sitting uncommitted — flag for a standalone commit.
- Verification scripts are in the session scratchpad (outside the repo), not committed.
