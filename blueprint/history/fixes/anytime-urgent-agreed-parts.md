# Fix: Anytime (Urgent) agreed parts

**Type:** Fix
**Status:** verified
**Branch:** fix/anytime-urgent-agreed-parts

Launch item 4 (client item 13, `blueprint/context/LAUNCH-FIXES-2026-10-11.md`). Anytime is shown as
"Urgent" on screen; the stored value stays `anytime`.

## The problem

The client listed what was agreed on 8 October (D2, D3) and asked where the code differs:

| Agreed | Code today |
|---|---|
| 8:00–17:00 on working days; outside that, first thing next working day | Built (`isAnytimeOpen`, `anytimeServiceStart`, `anytimeOnDate`) |
| Done inside a window → the difference goes back to the wallet | Built (`settleAnytimeRefund`) |
| Alerts Intake and Tag at once | **Not built.** No notification is sent. |
| Goes to the top of the pickup list | **Not built.** The pickup queue sorts oldest first. |
| Windows full → the window price, offer kept | **Not built.** A full day refuses: "…is full and we have no other window free. Please choose Anytime." Anytime then charges the Anytime price, and a free-pickup offer doesn't apply to it. |
| Tell the screen when Urgent can't happen now and when it opens ("Urgent opens at 8:00 AM tomorrow") | **Partly built.** `anytime.open` / `servesFrom` exist, but there is no ready-to-show opening text, and closed dates in `anytimeByDate` give no opening time. |

Binding client answer (11 Oct, Q2): "When every window on the day the customer picks is full, show
Urgent at the window price, with their offer kept. Also show the next day that has an open window …
'Today's windows are full. Book Urgent at the window price, ₦500, and keep your offer. Or pick another
day.' This only shows during Urgent hours. Outside them, show the next open window."

"The rider goes at once if free, else joins the current or a new run" is Intake's assignment work and
needs no code; the alert and the top-of-list order support it.

## The fix

1. **Urgent opens at.**
   - `anytime` (the "now" answer) gains `opensAt` (when it next opens, null while open) and
     `opensAtText`: "8:00 AM tomorrow", "8:00 AM Tuesday", or "8:00 AM today" before opening.
   - Each closed `anytimeByDate` row gains the same two fields, for the next opening on or after
     that date.
2. **All windows full → Urgent at the window price, offer kept.**
   - In availability, each `anytimeByDate` row gains `windowsFull` (the day has windows, and every
     one that is still bookable is full).
   - When `windowsFull` and Urgent runs that date (`open`), the row's `fee` is the WINDOW price.
     `urgentAtWindowPrice: true` and `message` carry the client's sentence: "<Day>'s windows are
     full. Book Urgent at the window price, ₦<fee>, and keep your offer. Or pick another day."
     `nextOpenWindow` gives `{ date, windowId, windowName }`.
   - Outside Urgent hours (`open` false) no Urgent offer is made, but `nextOpenWindow` still shows.
   - At booking, `resolveLeg` (Anytime) applies the same rule on the server:
     - the pickup leg's `fee` is the window price, stamped `windowsFull: true`;
     - `windowWasBookableAtBooking` is false, since the window price is already charged and no
       refund is owed.
   - Booking and re-pricing treat that pickup as a WINDOW pickup for offers, so a free-pickup offer
     still waives it ("keep your offer").
   - The delivery leg has no date or window at booking, so this applies to pickup only.
3. **Intake alert.** When an order is placed with an Urgent pickup, Intake and Tag (and admin) get a
   notification at once: "Urgent pickup booked: <OSC> — <address>". Fire-and-forget, so it never
   fails the booking.
4. **Top of the pickup list.**
   - The order is stamped `urgentPickup: true` when its pickup is Urgent.
   - Intake's pickup dispatch queue sorts urgent first, then oldest (`{ urgentPickup: -1, createdAt: 1 }`).
   - Each row gets an `urgent` flag.
   - The rider's assigned pickups use the same order.

Must not break:
- the narrowed Anytime refund (D2c);
- same-day's forced Anytime pickup, which still pays the Anytime price unless the windows are full;
- the D3 move to another window when only the chosen window is full;
- item 1's window-only free rule for an Urgent pickup the customer chose while windows were open.

## Build steps

1. [x] **Opening text and the full-windows rule in availability and booking**: steps 1 and 2 above.
   **Done when:** a staging script on testingdb shows:
   - a closed date says when Urgent opens;
   - with every window on a date full, availability offers Urgent at the window price with the
     client's message and the next open window;
   - booking Urgent that day charges the window price, a free-pickup offer waives it, and no
     refund is owed;
   - with a window open, Urgent still charges the Anytime price and the offer doesn't waive it.
2. [x] **Intake alert and top of the list**: steps 3 and 4.
   **Done when:** staging shows the notification written for Intake, and an urgent order listed
   before an older non-urgent one in the pickup queue.

3. [x] **Review fixes (2026-10-13): F-85, F-86 [P2], F-87, F-88 [P3].**
   - The booking-options quote prices a full-windows Urgent pickup as the booking does: the window
     fee, with the offer kept.
   - The same-day disclosure says so too.
   - The full-windows rule runs for the pickup leg only (as step 2 says).
   - The true no-refund reason is stored.
   - Staging now covers re-pricing.

   **Done when:** urgentStaging 17/0; briefCheck 528/0; booking suite green.

Then briefCheck, the booking staging suite, and Swagger 0 wrong.

**Result (2026-10-13):** urgentStaging 14/0 (testingdb); briefCheck 525/0 (8 item 4 checks); readyDate 32,
quickBooking 67, windowBooking 35, counterPayment 51, freeLogistics 23, googleProfile 11, intakeUnpaid 11;
Swagger 0 wrong, with the new availability fields documented.

## Verify

- `node urgentStaging.js` (testingdb).
- `node briefCheck.js`; windowBooking, quickBooking, readyDate, counterPayment staging; Swagger check.

## Frontend impact (to send them)

- Urgent greyed out: use `anytime.open` / `anytimeByDate[i].open` and show `opensAtText` ("Urgent opens
  at 8:00 AM tomorrow").
- Full day: when `anytimeByDate[i].urgentAtWindowPrice`, show its `message` and fee, plus
  `nextOpenWindow` as "or pick another day".
- Intake pickup list: show the `urgent` badge; urgent rows come first.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":6361,"specSha256":"9bdce21aaca1e2707acc2504edab99ff8f426b2b750a6371c39e57340d4612ce","branch":"refs/heads/fix/anytime-urgent-agreed-parts","head":"ffdfc99b42da6b7aa0a85df50997c3077b205cdc","baseRef":"refs/heads/main","baseCommit":"c0c17793ed8c96889143030271ded995deb5f949","sourceTree":"b514fc9c282abf4035d0d04fb06529897de5ccef","landing":"local-merge","absentOptional":[]} -->

## Findings

### anytime-urgent-agreed-parts/F-85 [P2] closed - The booking-screen offer quote still treats a full-windows Urgent pickup as Anytime, so it shows the pickup charged and tells the customer to "choose a time window"

**File:** services/offer.service.js:472-489 (draft timing used as sent), 915 (`computeBenefits` window-only rule), 722-737 (`window-only` fees line); booking side services/bookOrder.service.js:109 and 842
**Found:** 2026-10-13 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `GET /offers/booking-options` (`getBookingOptions` → `validateAndPrice`) is the quote the booking screen shows before confirm. It only re-resolves the pickup timing for the same-day rule; it never applies the new windows-full rule. A customer who picks Urgent on a day whose windows are all full (exactly what availability now invites with "…and keep your offer") sends `pickupTiming: anytime`, so the quote marks the free-pickup offer `anytimeKeptPickup`, leaves the pickup in `selected`'s total, and the fees line reads "Free pickup is for window bookings only. Choose a time window to save ₦…" — on a day with no window to choose. The order (`_priceWithOffers` via `offerPickupTiming`) then waives the pickup. The screen's total and message contradict both the availability message and the real charge on a realistic input (a busy day plus any free-pickup offer, including the Always-Free baseline). The same-day forced-Anytime case on a full day has the same mismatch (its stored `scheduling.disclosure` also still says "charged at the Anytime rate").
**Suggested fix:** In `getBookingOptions` (and the `validateAndPrice` quote route), when the resolved pickup timing is Anytime, apply the same rule as `resolveLeg` — `W.allWindowsFull(...) && W.anytimeOnDate(...).open` for `draft.pickupDate` (default today) against `getBookedCounts` — and price the draft as a WINDOW pickup with the window fee as `pickupAmount`, skipping the window-only fees line. Best as one shared helper used by `resolveLeg` and the quote so they cannot drift. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 2 candidate). `OfferService.getBookingOptions` now asks `BookingWindowService.pickupWindowsFullOn(draft.pickupDate)` (the same test `resolveLeg` and availability use) and, when every window is full and Urgent runs that day, prices the pickup as a WINDOW pickup at the window fee, so the quote waives it under a free-pickup offer and never shows "choose a time window". The same-day disclosure, stored at booking and returned by availability, says the window price with the offer kept when the windows are full. urgentStaging: the booking-options quote returns "You get free pickup on this order" (17/0).
Closed 2026-10-13 by /audit independent round 2 (ffdfc99). offer.service.js:492-499 runs after the same-day resolution, uses `pickupWindowsFullOn` (bookingWindow.service.js:462-470: the same `allWindowsFull && anytimeOnDate().open` test and the same `new Date(date)` → `startOfDay` day as `resolveLeg`:503,515-517), switches the draft to WINDOW with `pickupAmount` = the window fee and clears `pickupForcedAnytime`, so `computeBenefits` sets `freePickup` and `buildFeesLine` returns `free-reached`, matching `_priceWithOffers` via `offerPickupTiming`. Both same-day disclosures (bookOrder.service.js:1759-1762, bookingWindow.service.js:401-404) now say the window price. The repair's one side effect on the Quick Booking re-pick is recorded separately as F-89 [P3]; it does not reopen this finding.

### anytime-urgent-agreed-parts/F-86 [P2] closed - Delivery-leg availability offers "Urgent at the window price, keep your offer", but booking always charges the Urgent delivery price

**File:** services/bookingWindow.service.js:351-374 (rule applied for any `leg`); booking side services/bookOrder.service.js:1734-1744
**Found:** 2026-10-13 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `GET /bookOrder/booking-availability` takes `leg=pickup|delivery` (required). The new `anytimeByDate` logic runs for both legs, so with today's windows full the delivery response says `urgentAtWindowPrice: true`, `fee: 500` and "Today's windows are full. Book Urgent at the window price, ₦500, and keep your offer." But `postBookOrder` prices a delivery Anytime leg at `legFee(anytime, delivery)` with no windows-full check, and offers keep the window-only rule for it. Offline probe (stubbed settings/windows/counts, Fri 10:00, one full window): delivery row fee 500 with the message, booking delivery Urgent fee 1000. The spec says the rule is pickup-only because the delivery leg has no date or window at booking. A screen showing the delivery availability as instructed ("when urgentAtWindowPrice, show its message and fee") promises a price and an offer the order does not honour.
**Suggested fix:** Compute `windowsFull`/`urgentAtWindowPrice`/`message`/`nextOpenWindow` only when `leg === DISPATCH_LEG.PICKUP` (leave them false/null for delivery), and say so in the Swagger field descriptions. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 2 candidate). Availability computes `windowsFull` (and so `urgentAtWindowPrice`, `message`, the window fee) for the PICKUP leg only, as the spec says (current-feature.md:52); a delivery request always shows the Urgent delivery price. urgentStaging checks the delivery row; briefCheck has a source check.
Closed 2026-10-13 by /audit independent round 2 (ffdfc99). bookingWindow.service.js:358-360 gates `windowsFull` on `leg === DISPATCH_LEG.PICKUP`, so `urgentAtWindowPrice`, `message`, `nextOpenWindow` and the window `fee` stay false/null/Urgent-price for `leg=delivery`; `resolveLeg` is only called for the pickup leg (bookOrder.service.js:1708). urgentStaging.js:178-181 asserts the delivery row.

### anytime-urgent-agreed-parts/F-87 [P3] closed - A full-windows Urgent pickup records the refund refusal reason "Booked after the window had closed"

**File:** services/bookingWindow.service.js:1088-1092
**Found:** 2026-10-13 by /audit independent current (scope: current; lens: quality)
**Why it matters:** `resolveLeg` stamps `windowWasBookableAtBooking: false` on a windows-full Urgent pickup so no refund can be paid (correct). `settleAnytimeRefund` then persists `refund.reason` = "Booked after the window had closed, so there was no cheaper option that day." The real reason is that every window was full and the window price was already charged. No money is affected; the stored explanation is wrong for anyone reading it later.
**Suggested fix:** When `legData.windowsFull` is true, record "Every window was full, so Urgent was already charged the window price." (or return early with that reason). Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 2 candidate). The refund-refusal reason for a `windowsFull` leg is "Every window was full, so Urgent was already charged the window price." In briefCheck.
Closed 2026-10-13 by /audit independent round 2 (ffdfc99). bookingWindow.service.js:1115-1119 checks `legData.windowsFull` first; the windows-full leg is stamped `windowWasBookableAtBooking: false` (resolveLeg:526) so no refund is paid and the stored reason is now the true one. briefCheck 528/0.

### anytime-urgent-agreed-parts/F-88 [P3] closed - The re-price path for a full-windows Urgent pickup is only checked by source-text regex

**File:** briefCheck.js:1280-1283; urgentStaging.js (no item-edit / Quick Booking case)
**Found:** 2026-10-13 by /audit independent current (scope: current; lens: tests)
**Why it matters:** "Re-pricing keeps the offer" (`_repriceForItems` → `pickBestPersonalOffer` / `_priceWithOffers` with `offerPickupTiming`) is asserted only by counting `pickupTiming: offerPickupTiming(` occurrences in the source. No staging or offline case edits the items of (or re-prices a Quick Booking for) an order whose pickup is `windowsFull`, so a later change to the re-price inputs could drop the waiver without a failing check. The booking-options quote (F-85) and delivery-leg availability (F-86) are also untested. Same class as F-06/F-08.
**Suggested fix:** Add one urgentStaging step: a Quick Booking (or an item edit) on the full-windows Urgent order, asserting `freePickupWaived` still equals the window fee after the re-price. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 2 candidate). urgentStaging now re-prices the full-windows order through `_repriceForItems` (the item-edit and Quick Booking path) and checks it keeps the window fee and the free-pickup waiver (₦500 waived).
Closed 2026-10-13 by /audit independent round 2 (ffdfc99). urgentStaging.js:155-164 drives `_repriceForItems` on the stored full-windows order and asserts `breakdown.freePickup`, `pricing.pickupFee` = window fee and `freePickupWaived` = window fee; 166-175 asserts the booking-options quote; 177-181 the delivery row. Read only (staging not run by the reviewer; builder reports 17/0). The Quick Booking auto-pick branch (`pickBestPersonalOffer`) is not exercised by that step, see F-89.

## Independent review

**Status:** passed
**Target commit:** ffdfc99b42da6b7aa0a85df50997c3077b205cdc
**Base commit:** c0c17793ed8c96889143030271ded995deb5f949
**Base ref:** origin/main
**Spec hash:** 9bdce21aaca1e2707acc2504edab99ff8f426b2b750a6371c39e57340d4612ce
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-13T18:40:00Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-13T19:02:53Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `c0c1779..ffdfc99` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

Launch item 4, round 2. Round 1 (`9f5eebe`) requested changes: F-85 [P2], F-86 [P2], F-87 [P3],
F-88 [P3]. `ffdfc99` fixes all four (spec step 3; marked `fixed`). Verify each one and move it to
`closed`, or reopen it. New findings start at F-89.

## Commands

- `git rev-parse HEAD`: pass (ffdfc99b42da6b7aa0a85df50997c3077b205cdc = Target commit)
- `git merge-base origin/main HEAD`: pass (c0c17793ed8c96889143030271ded995deb5f949 = Base commit)
- `git status --porcelain`: pass (only `blueprint/context/review.md` modified)
- `sha256sum blueprint/context/current-feature.md`: pass (9bdce21a… matches Spec hash)
- `git diff c0c1779..ffdfc99` (13 files): reviewed in full
- `node briefCheck.js`: pass (528 passed, 0 failed)
- Swagger envelope check (AGENTS.md): pass (wrong envelopes: 0)
- Module-load check of bookOrder, bookingWindow, offer, intake-user, rider services, util/bookingWindow, bookOrder model: pass
- Offline probe (scratchpad) of `anytimeOnDate`/`opensAtText`/`allWindowsFull` with stubbed settings and windows: pass (closed-today → "8:00 AM tomorrow", Sunday evening → "8:00 AM Tuesday", Monday → next opening; full at limit, not full below it, not full after every cut-off)
- `urgentStaging.js` and the booking staging suite: not run (DB-backed; reviewer forbidden), read only

## Evidence

- F-85 closed: offer.service.js:492-499 applies `pickupWindowsFullOn` (bookingWindow.service.js:462-470), the same test and day derivation as `resolveLeg` (503, 515-517); the quote waives the pickup at the window fee and the fees line is `free-reached`. Both same-day disclosures now say the window price (bookOrder.service.js:1759-1762; bookingWindow.service.js:401-404).
- F-86 closed: availability gates `windowsFull` on `leg === DISPATCH_LEG.PICKUP` (bookingWindow.service.js:358-360); `resolveLeg` is only called for the pickup leg (bookOrder.service.js:1708).
- F-87 closed: the refund refusal checks `legData.windowsFull` first (bookingWindow.service.js:1115-1119).
- F-88 closed: urgentStaging.js:155-181 covers re-pricing via `_repriceForItems`, the booking-options quote, and the delivery row.
- Booking: `resolveLeg` stamps window fee, `windowsFull`, `windowWasBookableAtBooking: false`; `offerPickupTiming` (bookOrder.service.js:109) feeds both `_priceWithOffers` and the Quick Booking pick. Item 1's window-only rule still holds for an Urgent pickup with a window open.
- Intake alert: `notifyRoles` is non-throwing and `.catch`-guarded, after the order is created (bookOrder.service.js:2363-2384). Urgent-first sorts are pickup-only on Intake (intake-user.service.js:1422) and on the rider's assigned pickups (rider.service.js:395), as the spec says.
- Security: no new routes or auth changes. The only new client-read input is `draft.pickupDate` on the quote, which affects only that customer's own quote.
- Performance: the quote makes 3 more small reads when the pickup is Urgent; availability reads booked counts for 8 more days and does in-memory work per row. No unbounded work.

## Findings

- F-85 [P2] closed, F-86 [P2] closed, F-87 [P3] closed, F-88 [P3] closed
- F-89 [P3] open: the Quick Booking re-pick applies the windows-full quote rule to an ordinary Urgent order using today's windows, so it can rank a free-pickup offer that the charge then ignores (narrow, does not block)

## Remaining risk

- `urgentStaging.js` (17/0) and the booking staging suite were not run by the reviewer (DB-backed, forbidden here); DB behaviour rests on the builder's run plus code reading.
- No test runner, lint, or typecheck exists; `briefCheck.js` is the only offline assertion signal.
- The Urgent alert fires at creation even for an unpaid card order that may be abandoned. The spec says nothing about this; it is a product question, not a defect.
- A `leg=delivery` availability request with `deliverySpeed=same-day` keeps the "Anytime rate" same-day disclosure even when today's pickup windows are full (it quotes a higher price than the customer is charged, never a lower one; the pickup response carries the correct text).
- `POST /offers/validate` (`validateAndPrice` on the raw body) still applies neither the same-day nor the windows-full timing rule; this was already true on c0c1779, so it is a risk only if a screen uses that route as its quote.
- `urgentStaging.js` switches off every active booking window on its target DB during the run, then turns them back on; safe on testingdb only.
