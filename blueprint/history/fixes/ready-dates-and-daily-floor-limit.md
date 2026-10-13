# Fix: Ready dates and daily floor limit

**Type:** Fix
**Status:** verified
**Branch:** `fix/ready-dates-and-daily-floor-limit` (stacked on
`fix/registration-welcome-sms-and-schedule-save`; its PR lands after item 6's)

Launch item 3 (client items 1, 2, 9), plus 3b (the daily floor limit) and two carry-overs
from the item 2 answers. Every rule below is the client's binding answer of 11–12 Oct 2026,
quoted in `blueprint/context/LAUNCH-FIXES-2026-10-11.md` ("Questions sent to the client",
"Daily floor limit", "Orders bigger than one day's room", "Item 3 scope").

## The problem

| # | Today | Client rule |
|---|---|---|
| 1 | `calculateDueDate` (util/helper.js) counts **whole working days from the BOOKING time**. There's no half day, so Express booked Sunday reads "ready Mon 12 Oct". | Count from the day **after pickup**: Tue–Sat 1, **Sun ½**, **Mon 0**. Ready **by 19:00** on the day the count is reached. Examples: Sun pickup + 1 → Tue; Sat pickup + 1 → Tue; Sat pickup + 2 → Wed. |
| 2 | Same-day ("Ready Today") is gated by **booking before 10:00**. | Ready Today counts the pickup day itself, is offered only for a **pickup before 12:00**, and **never on Sunday**. |
| 3 | `getAvailability` returns **one** Anytime answer for "now", so every date (closed Monday included) says "first thing Sunday". | Anytime is **per date**. A closed day says "Closed that day", the same as a window. |
| 4 | The ready date is shown before the customer picks a pickup time. | Work it out **from the pickup day and time** the customer picks, so the screen can show it under the pickup time. |
| 5 | **No working floor limit.** `postBookOrder` reads the speed capacities from `AdminOrderDetails`, where those fields are commented out, so every gate and decrement is a silent no-op. They also only ran for plan orders, counted lines rather than pieces, and never reset. | **Floor limit in pieces, as settings:** 150/day; inside it **Ready Today 30**, **Express 50**; Regular gets the rest. Sunday is half, Monday 0. Every piece counts the same. |
| 6 | — | **Regular is never refused and never waits for an empty day.** It fills the room left on its first possible ready day, then each next working day (Sun 75, Mon skipped), until every piece fits. The ready date is the last day used. The customer sees one date ("Ready Thursday instead of Wednesday"); the split is internal. |
| 7 | — | **Ready Today / Express are never split** and are never offered with a later date. Confirmed wording (12 Oct), always using the speed's on-screen name: <ul><li>Express with no room → "Express is full for <ready day>. Choose Standard, or pick another pickup day."</li><li>Ready Today with no room → "Full today".</li><li>Too many pieces → "Too many pieces for <speed>. Choose <only the speeds that still fit>, or call us on +234 707 325 4943." Example: a 40-piece order that fits Express reads "Too many pieces for Ready Today. Choose Express or Standard, or call us on +234 707 325 4943."</li></ul> |
| 7b | Express must be booked before 14:00. | **Removed** (client, 12 Oct): Express counts from the pickup day, and its 50-piece share protects the floor. |
| 8 | — | **Quick Booking** counts the number entered at booking, and Intake's count corrects it. A booked order **keeps its date**; a changed count only affects later bookings. |
| 9 | A non-heavy **set item** (a suit) is accepted on a plan. | Heavy **and set** items are not covered by plans. |
| 10 | The 200-piece refusals use our wording (`util/catalogItems.js`, `util/quickBooking.js`). | "For more than 200 pieces, call or WhatsApp us on +234 707 325 4943 and we will plan it with you." |

## The fix

### A. One pure ready-date engine (`util/bookingWindow.js`, the existing pure scheduling module)

No database, and `now` is a parameter, like the rest of that file:
- **`dayWeight(date, settings)`**: 0 when the day isn't a working day; ½ for a half day; 1 otherwise. The half days come from a new `halfDays` setting (default `['sun']`) beside `workingDays`, so the half day isn't buried in code.
- **`earliestReadyDay({ speed, pickupAt, settings })`**:
  - Ready Today = the pickup day.
  - Express needs a weight sum ≥ 1, and Regular ≥ 2, counted from the day after pickup.
- **`readyTodayAllowed(pickupAt, settings)`**: pickup before 12:00, not on a half day, on a working day.
- **`dailyLimit(date, pool, limits, settings)`**: the floor, Ready Today and Express limits × the day's weight, rounded down.
- **`allocateFloor({ speed, pieces, firstDay, usage, limits, settings })`**:
  - Regular spreads, as the client described.
  - Ready Today / Express must fit whole, in both their share and the day's floor total. Otherwise they return `full` (no room left) or `too-many-pieces` (the order is bigger than the room left).
  - Returns `{ ok, allocation: [{ date, pieces }], readyDay }`.
- `calculateDueDate` and `deliveryDayForSpeed` are replaced by this engine on every path.

### B. Settings (`AdminSetting`, seeded by `config/setup.js`, admin-editable)

- `floorLimits: { dailyPieces: 150, sameDayPieces: 30, expressPieces: 50 }`.
- `halfDays: ['sun']`.
- They're editable through the existing admin order-settings endpoint, with validation (whole numbers ≥ 0; a fast share can't exceed the floor).
- The dead `*Capacity` gates and the decrement in `postBookOrder` are removed. The fields stay on the schema, unread, so old documents aren't touched.

### C. Orders keep their split

- New `floorAllocation: [{ date: 'YYYY-MM-DD', pieces, speed }]` on `BookOrder`, with an index on `floorAllocation.date`.
- **Usage for a day** = the sum of `floorAllocation` for that date over orders that are not cancelled. A cancelled order frees its pieces with no extra code.
- `deliveryDate` = the ready day at 19:00. It's still the internal deadline: the queue sort, the SLA clocks, overdue and the hold breach all read it unchanged. The customer-facing `deliveryPromise` keeps reading it.

### D. Booking paths use it (app `postBookOrder`, assistant through `createOrder`, S1 counter `createBookOrder`)

- **The pickup instant** is, in order:
  1. the resolved pickup window's start on its date;
  2. else the Anytime service start for the chosen date;
  3. else `pickupDate`/`pickupTime`;
  4. else now.

  A counter (walk-in) order's pickup is now.
- **Pieces:** the sum of item quantities, or the Quick Booking count.
- Refusals happen before any order exists:
  - Ready Today after the noon pickup cut-off or on a half day: "<Ready Today> needs a pickup before 12:00, and isn't available on Sundays. Choose <the speeds that fit>."
  - The client's confirmed full / too-many texts (problem row 7).
  - Regular is never refused.
- **Speed names in every message** come from the on-screen display names (`getDisplayNames` → `deliverySpeeds`), so "Standard"/"Regular" and "Ready Today" read exactly as the speed button does (client, 12 Oct). "Choose …" lists only the speeds that still fit this order on this pickup.
- **Removed:** the Express booking-before-14:00 cut-off (client, 12 Oct).

### E. What the screens read

- **`POST /api/offers/booking-options`** gains **`speeds`**, built for the draft's pickup choice and piece count. One row per speed: `{ speed, available, readyDate, readyText, movedFrom, unavailableReason, message }`.
  - `readyText`, for example: "Ready Thursday 15 October, by 7:00 PM".
  - `movedFrom` is set when Regular's first possible day had no room at all, so the screen can say "Ready Thursday instead of Wednesday".
  - `unavailableReason` ∈ `full` | `too-many-pieces` | `pickup-rule` (Ready Today: pickup at or after noon, a half day, or a closed day) | `not-available` (no ready day within reach). **Deviation (F-59):** the spec first listed `pickup-after-noon` / `half-day` / `cutoff-passed`. The client removed the Express cut-off (so `cutoff-passed` can't happen), and one `pickup-rule` covers both Ready Today refusals, which share one sentence.
  - `message` is the sentence to show as it comes.
- **`GET` availability** gains **`anytimeByDate`**: one row per date in the horizon, with `{ date, open, servesFrom, note }`. A closed day says "Closed that day". The existing `anytime` field stays for older app builds.
- **The assistant's speed list** (`services/bot/parsers.js` `_availableSpeeds`) is built from the same rows, so it never offers a speed the booking would refuse. Its reroute (`services/bot/booking.flow.js`) also recognises the new refusal texts.

### F. Recount and edits keep the date (rule 8)

- When Intake's count (Quick Booking) or an item edit changes the piece total, `floorAllocation` is corrected:
  - extra pieces go on the order's **last** allocated day;
  - removed pieces come off the last days first.
- **`deliveryDate` is never moved.** That day may go over its limit; the client accepted that ("keep their date").

### G. Carry-overs

- **Plans refuse set items:** any item booked from a set (`fromSet`, or matching a set's name), heavy or not. Message: "Your subscription plan does not cover set or heavy items. "<item>" is not covered. Please remove it or pay per item."
- **Both 200-piece refusals** use the client's exact text.

**Confirmed by the client on 12 Oct**, and written into the code comments:
- A day's limit counts the pieces **ready** that day.
- One shared pool of 150: Ready Today and Express come out of it, and Regular uses the rest.
- A fast speed needs room in both its share and the floor total.
- Two customers booking the last few pieces at the same moment can push a day a few pieces over. That's accepted, so no lock is added.

**Must not break:**
- window and Anytime pickup booking, fees and the same-day disclosure;
- Quick Booking (nothing paid at booking);
- plan, wallet and card billing;
- the queue sort, SLA and hold clocks (they read `deliveryDate`);
- D7 delivery-window confirmation at READY;
- the S1 counter's payment methods.

**Out of scope:** Anytime Intake alert / all-windows-full → Urgent (launch item 4).

## Build steps

1. [x] **Engine and settings.** Section A, plus the `floorLimits` / `halfDays` settings,
   their seed, and admin edit and validation (B).
   **Done when** briefCheck proves:
   - the client's three examples;
   - the Ready Today noon/Sunday rule;
   - the 40-left + 180-piece spread (40 Tue + 140 Wed → Wed);
   - Sunday 100 (75 Sun + 25 Tue → Tue);
   - Express too-many vs full, with the confirmed texts and display names, listing only the speeds that still fit (40 pieces → "Choose Express or Standard");
   - limits halve on Sunday and are 0 on Monday.
2. [x] **Orders store their split and booking uses it.** Sections C and D on all three paths; the dead capacity code removed.
   **Done when** on testingdb:
   - a Regular booking past a day's room spreads and stores the split, and `deliveryDate` is the last day at 19:00;
   - Express is refused with the client's texts;
   - Ready Today is refused after noon pickup and on Sunday;
   - a cancelled order frees its pieces;
   - a counter booking counts.
3. [x] **Screens.** Section E: `speeds` on booking-options, `anytimeByDate` on availability, and the assistant's speed list and reroute. Swagger updated.
   **Done when:**
   - booking-options shows each speed's ready date or reason for a given pickup and count;
   - a closed Monday's Anytime says "Closed that day";
   - the envelope check reports 0 wrong.
4. [x] **Recount keeps the date.** Section F.
   **Done when:** an Intake recount of a Quick Booking from 10 to 40 pieces keeps `deliveryDate`, moves the extra 30 onto its last day, and a later booking sees them.
5. [x] **Carry-overs.** Section G.
   **Done when:** a plan booking with a non-heavy set item is refused, and both 200-piece refusals read the client's text.
6. [x] **Added at the user's request (2026-10-12):**
   - **Boot seeds the new settings.** `config/setup.js` `ensureSchedulingSettings` writes `halfDays` and `floorLimits` when they're absent, so the admin settings screen shows them before the first save. It never overwrites a saved value.
   - **Recovery (redo) orders take floor space.** `recovery.service.createRecoveryOrder` gives a redo a ready date and a split, counted from now. It keeps the original speed if that speed has room, else Regular, so a redo is never blocked; a failure here is non-fatal. Before this, redos had no ready date and didn't count against the floor.

   **Done when:** a redo holds its pieces and has a 19:00 ready date; boot seeds both settings onto an existing document without overwriting an admin's value.
7. [x] **Review round 1 repairs (changes-requested: F-56 [P1], F-57 [P2]).**
   - **F-56:** a text pickup time ("evening", "2-4pm", unreadable text) no longer counts as an early
     pickup, so Ready Today isn't offered for it.
   - **F-57:** an Anytime pickup on a closed day counts from the next opening.
   - F-58 to F-61 [P3] are logged for the clean-up batch, as agreed (2026-10-12: fix P0–P2 before
     `/complete`, batch the P3s).

   **Done when:** briefCheck covers both (504/0); readyDateStaging 28/0.
8. [x] **Review round 2 repairs (changes-requested: F-56 reopened, F-62 [P1] new).** One simple
   rule replaces the patched parser: take the first time in the text; an am/pm is used as written,
   and a bare hour is a pickup hour (1–7 pm, 12 noon, 8–11 morning). F-57 closed.
   **Done when:** every phrase the reviewer listed is refused, and the morning cases are allowed
   (briefCheck 504/0).
9. [x] **Review round 3 repairs (changes-requested: F-63 [P1] new; F-56/F-62 closed).** The parser
   now covers every pattern found in rounds 1–3:
   - dates and counts are skipped;
   - a range is read from its start;
   - a late word (evening, tonight…) makes the time late even beside a bare number;
   - "12am" never reads as midnight.

   F-64 [P3] is fixed in the same change.
   **Done when:** 63 phrases probed with 0 wrong; briefCheck 504/0; readyDateStaging 28/0.
10. [x] **All remaining item 3 findings fixed at the user's request (2026-10-13): F-65 [P2], F-58,
    F-59, F-60, F-61, F-66 [P3].**
    - The pickup-time reader handles written dates, ranges against a later am/pm, hour 0, "noon"
      as a morning end, whole-word month names and "930am".
    - The admin floor-limit field accepts numbers only.
    - The assistant states a refusal once.
    - The dead date code is removed.
    - The constant replaces the literal; the unused option is dropped.
    - The spec deviation and the admin frontend note are recorded.

    **Done when:** 89 phrases probed with 0 wrong; briefCheck 504/0; readyDateStaging 32/0 (adds the
    admin scenario); windowBooking 35/0; quickBooking 67/0; counterPayment 51/0; Swagger 0 wrong.
11. [x] **Round-5 findings fixed (2026-10-13): F-65, F-67, F-68 [P2], F-59 [P3].** Policy change:
    Ready Today reads a pickup time only when it is written PLAINLY: time numbers, am/pm, and a short
    list of plain words (around, by, between, morning, noon, evening, tomorrow…). Anything else is
    treated as unreadable. That covers a negation ("not before noon"), a dot time ("8.30pm"), a
    month-first date ("Oct 10 around 2") and "o clock pm". Unreadable counts as 12:00, so Ready Today
    is withheld; it never makes a wrong promise. Express and Regular are unaffected. Written dates are
    still stripped first, so a plain time after a date is still read.
    - A range start loses to any later time written with am/pm OR a colon ("9-10 at 15:00" → 15:00);
      "10:00-12:00" still reads 10:00.
    - The unguarded "before/by noon" word entry is removed.
    - AGENTS.md's bot speed sentence describes the ready-date engine; the unused helper import is dropped.

    **Done when:** 104 phrases probed with 0 wrong; briefCheck 504/0 (new phrases added to the
    lists); readyDateStaging 32/0; windowBooking 35/0; quickBooking 67/0; Swagger 0 wrong.
12. [x] **Round-6 findings fixed (2026-10-13): F-69, F-70 [P2], F-71 [P3] in part.**
    - A bare range start shares its end's "pm" when it is earlier on the clock: "8-10pm", "between 8
      and 10pm", "9 or 10pm" → evening, refused. "11-1pm" and "10-12pm" stay morning.
    - A seconds field is read past, so "9:00:00 pm" keeps its pm.
    - Weekday names ("Wednesday 9am", "wed morning") are plain words. The other F-71 phrasings ("9ish",
      "0900", "9.30am", "by 12") are still refused, which is the safe direction.

    **Done when:** 58-phrase two-way probe 0 wrong; briefCheck passes with the new phrases;
    readyDateStaging, windowBooking, quickBooking unchanged; Swagger 0 wrong.
13. [x] **Round-7 finding fixed (2026-10-13): F-72 [P2].** The assistant never counts ready dates from
    "now" because it couldn't read the pickup day.
    - `_writtenPickupDate` reads "20 October", "20th of Oct", "Oct 20", "20/10" (day first), "the
      20th" and "in 3 days" as the next such day. An impossible date, an explicit past date, or one
      that passed in the last 60 days is null, never guessed.
    - The offline date parser reads written dates only on the day question, so an address ("12/4
      Allen Avenue") is never a day.
    - The booking flow drops a day it can't resolve ("next week") and asks again, naming what it
      couldn't read; the loop guard still applies.

    **Done when:** briefCheck 507/0 (three F-72 checks); botStaging unchanged from before (5/9, the four
    warnings are the known testingdb price and no LLM/SMS credits); Swagger 0 wrong.
14. [x] **Round-8 findings fixed (2026-10-13): F-73 [P2], F-74 [P3]; F-72 re-marked fixed.**
    - A written date never overrides a named weekday: both are read, and they must agree, or the day
      is asked again. "10/11 am" is a time range and "3 may be" is not a date.
    - The resolved day is kept (`bDay`) so a chat crossing midnight doesn't re-read it; a kept day
      that has passed is asked again; confirm places only with a pickup day.
    - "the 3rd floor" is not a date.

    **Done when:** frozen-clock probe of 16 day answers correct (one ambiguous answer re-asked);
    briefCheck 510/0; botStaging unchanged (5/9).
15. [x] **Round-9 findings fixed (2026-10-13): F-78 [P2], F-79 [P3], F-80 [P3].** (Renumbered from the
    reviewer's F-75–F-77, which clashed with item 5's F-75.)
    - A weekday beside "24th" reads the date, so the agreement check runs; "Saturday next week" is
      next week's Saturday, not the coming one.
    - "around 9 may work" and "may 10 am" aren't May dates.
    - Dropping the day also clears the speed chosen for it.

    **Done when:** frozen-clock probe of 22 day answers 0 wrong; briefCheck 513/0; botStaging
    unchanged (5/9).
16. [x] **Round-10 findings fixed (2026-10-13): F-78 [P2] again, F-81 [P3].**
    - "saturday 24" (a bare 13–31 right after the weekday, then only a time word or the end) reads
      the date; a house number, a slash pair or a count never does.
    - "not next week" keeps the coming weekday.
    - Away from the day question, a slash pair beside a weekday is not read.
    - Safeguard for the whole class: the booking summary shows the pickup DATE read ("Wednesday 14
      October"), not the customer's words, so a misread day is caught before "yes".

    **Done when:** frozen-clock probe of 28 day answers 0 wrong; briefCheck 516/0; botStaging
    unchanged (5/9), with the summary showing the date.

## Verify

- briefCheck: the pure engine (every client example above), set-item refusal and the 200 text.
- `readyDateStaging.js` on testingdb (SMS and Paystack stubbed): every "Done when" in steps 2, 4 and 5. Also reruns `quickBookingStaging`, `windowBookingStaging`, `counterPaymentStaging`, `holdsStaging`, `planProbe` and the other booking staging scripts.
- Swagger envelope check (0 wrong). Boot on `PORT=7999`.
- **Results (2026-10-12):**
  - briefCheck **501/0** (23 new item 3 checks: every client example, the confirmed messages, the
    display names, Anytime per date, the recount, the 200 text; 3 older source-text checks repointed
    at the engine or widened).
  - `readyDateStaging.js` on testingdb: **28/0** (with step 6: the redo order and the boot seed). Its
    first run caught a real bug: a recount didn't move the split, because sub-documents were spread
    instead of copied. Fixed.
  - After step 6: recoveryReportStaging 52/0, regNotBookedStaging 33/0, briefCheck 501/0.
  - Existing scripts, all green: quickBookingStaging 67/0, windowBooking 35/0, counterPayment 51/0,
    holds 48/0, itemEdit 20/0, bookingContext 30/0, subLogistics 20/0, tierPricing 33/0,
    freeLogistics 23/0, dispatch 80/0, handoff 54/0, phase12 14/0, dashboardDecisions 45/0,
    dispatchTag 46/0, stationFlow 97/0, plan probe 5/5.
  - botStaging shows **5/9, identical on the pre-item-3 commit** (b6bdb30, run in a temporary
    worktree): an existing quirk in its wallet and card checks, not caused by this work.
  - Swagger 0 wrong. Boot on 7999 ok (unauthenticated booking-options → 401).
- **Deviation:** the spec's `floorAllocation` entries were `{ date, pieces, speed }`. They are
  `{ date, pieces }`; usage groups by the order's own `deliverySpeed`, so the speed isn't stored twice.
  Nothing changes an order's speed after booking today; a future speed-change feature must recompute
  the split.
- **Independent review: required.** This changes order dates, what customers are promised, and booking refusals across every channel. It's unusually broad.

## Frontend impact (to send them)

- **Admin → order settings:** `GET /api/admin/order-management` no longer returns `standardCapacity`, `sameDayCapacity`, `expressCapacity` or `standardDeliveryPeriod`, which booking never read. It returns **`floorLimits`** (`dailyPieces` 150, `sameDayPieces` 30, `expressPieces` 50) and **`halfDays`** (`["sun"]`). Edit them through `PUT /api/admin/update-admin-setting`. Each value must be a whole number, 0 or more, and neither share may exceed the daily limit. A blank field is refused (F-58).

- **booking-options → `speeds`:**
  - Show `readyText` under the pickup time.
  - Grey out a row with `available: false` and show its `message` ("Full today" / "Too many pieces for Express…").
  - When `movedFrom` is set, say "Ready <day> instead of <movedFrom day>".
- **availability → `anytimeByDate`:** show each date's Anytime row; a closed day reads "Closed that day".
- **Ready Today** is offered only for a pickup before 12:00 and never on Sunday. The old "book before 10am" rule is gone.
- **Express** can now be booked at any hour; the "book before 2 PM" rule is gone.
- Every speed message uses the speed's on-screen name, so show `message` as it comes.
- The order's `deliveryPromise.text` now follows the new ready day.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":22715,"specSha256":"31c19108c02c39c493a9ce14e98e217783da628f94dc7e5efe39b5701f6e5daf","branch":"refs/heads/fix/ready-dates-and-daily-floor-limit","head":"f30c3d3f24b756df7aa80aae1364470a2c5b090d","baseRef":"refs/heads/main","baseCommit":"41d4683a1c6aeaba148ddb0ebfccb2f1a06771fa","sourceTree":"3d0d3c3872f56217324ef51b9065f9f479d1b5f7","landing":"local-merge","absentOptional":[]} -->

## Findings

### ready-dates-and-daily-floor-limit/F-56 [P1] closed - Ready Today's noon rule is skipped when the pickup time is a word or a bare-hour range (assistant and legacy `pickupTime` path)

**File:** util/bookingWindow.js:802-845 (`slotStartMinutes`, `pickupInstant` legacy branch); reached from services/bot/parsers.js:257-266 and services/bookOrder.service.js:1761-1764
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** The client's binding rule (11 Oct) is that Ready Today is only offered for a pickup before 12:00. On the legacy path (no `pickupTiming`, which is how the assistant books), `slotStartMinutes` reads only the first number in `pickupTime`, and anything it can't read falls back to `anytimeOpenFrom` (08:00). The assistant's own time parser (`_parseDateTimeFromText`, parsers.js:184-191) produces `afternoon`, `evening`, `night` and `noon`. All of these become 08:00, so "pick up tomorrow evening" offers Ready Today and then books it, with a 19:00 ready time on the same day as an evening pickup. A range like `2-4pm` (from an LLM slot or a legacy free-text `pickupTime`) becomes 02:00. Offline probe (TZ=Africa/Lagos, pickupDate 2026-10-14, now 07:00): `afternoon`, `evening`, `2-4pm`, `between 2 and 4pm` and `12am` all return `readyTodayAllowed: true`. `4pm-6pm`, `after 3pm` and `12pm-2pm` are refused correctly. The booking screen (`speedOptionsForDraft`) and `postBookOrder` share this reader, so both offer the speed and accept the booking.
**Suggested fix:** In `slotStartMinutes`, map the named periods to a start time (morning 08:00, noon/midday 12:00, afternoon 12:00, evening 16:00, night 18:00). For a range, use the meridiem of the end time when the start has none (`2-4pm` → 14:00). When the time still can't be read, don't let the 08:00 default make Ready Today possible: treat it as not-before-noon for the Ready Today check only, and keep 08:00 for the day count. Add briefCheck cases for each phrase. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. `slotStartMinutes` now reads ranges whose am/pm sits only on the end ('2-4pm' = 14:00, '11-1pm' = 11:00) and the assistant's own words (morning 08:00, noon/afternoon 12:00, evening 16:00, night 19:00). Text it can't read returns `UNREADABLE_SLOT`, which `pickupInstant` treats as 12:00, so it can never make Ready Today look possible; an empty time still means the opening hour. briefCheck covers both sides (504/0).
Reopened 2026-10-13 by /audit independent round 2 (6837e64): the assistant words and `2-4pm` are fixed, but a bare hour with no am/pm is still read as morning. Offline probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00): `between 2 and 4pm` → 02:00, `around 2` / `2` / `2:30` / `after 3` / `3 o'clock` → 02:00–03:00, all `readyTodayAllowed: true`. `between 2 and 4pm` was in this finding's original probe list, and the LLM slot schema (services/botIntent.service.js:111-113) itself gives "around 10" as the expected shape, so bare hours are a normal assistant output. Repair: accept `and` as a range separator (`between 2 and 4pm` → 14:00), and read a bare start hour 1–7 with no am/pm as pm (business hours are 08:00–17:00), or treat it as `UNREADABLE_SLOT` for Ready Today; keep `around 10` / `10` at 10:00. Add these phrases to the briefCheck F-56 lists (briefCheck.js:2642-2645).
Fixed again 2026-10-13 (round 2 reopened it for bare hours). `slotStartMinutes` now takes the FIRST time in the text: an explicit am/pm is used as written; a bare hour is read as a pickup hour (pickups run 08:00–19:00), so 1–7 are pm, 12 is noon, 8–11 are morning; 24-hour times as written; the assistant's words understood; anything else is UNREADABLE (treated as 12:00). "around 2", "2:30", "after 3", "3 o'clock", "between 2 and 4pm" → 14:00–15:00, refused; "morning", "9am", "10am-12pm", "11-1pm", "around 10", "09:00", "9 a.m.", empty → allowed. briefCheck lists widened (504/0); readyDateStaging 28/0, windowBookingStaging 35/0.
Closed 2026-10-13 by /audit independent round 3 (f0f196a). util/bookingWindow.js:820-839 re-examined; offline probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00): "around 2", "2", "2:30", "after 3", "3 o'clock", "between 2 and 4pm", "2-4pm", "1 to 3pm", "2 - 4", "1:00", "7", "1 p.m.", "2p.m", "afternoon", "evening", "night", "noon", "midday", "15:00", "sometime soon", "asap" all → 12:00 or later, Ready Today refused; "morning", "9am", "10am-12pm", "11-1pm", "11:30-1pm", "around 10", "09:00", "9 a.m.", "8:30", "11:59", empty → allowed. Every phrase in this finding is now read correctly. A word that is overridden by a bare 8–11 in the same text ("evening, around 8") and an explicit "12am" are a different mechanism, recorded as F-63.

### ready-dates-and-daily-floor-limit/F-57 [P2] closed - Anytime on a closed or past date counts the ready date from now, so it can fall before the pickup

**File:** util/bookingWindow.js:824-834 (`pickupInstant` Anytime branch)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `resolveLeg` accepts an Anytime pickup on any date. It doesn't check working days or past dates for Anytime, and that hasn't changed. When `anytimeOnDate` says "Closed that day", `pickupInstant` falls back to `anytimeServiceStart({ now })`, which is the next service time from NOW, not from the chosen date. Offline probe: on Saturday 17 Oct at 10:00, an Anytime pickup for closed Monday 19 Oct gives a pickup instant of Sat 10:00. Ready Today is then "Ready Saturday 17 October", Express Tue 20 and Standard Wed 21. The pickup is stored for Monday. So `deliveryDate` lands before or at the pickup, the order reads overdue, the hold-breach date branch fires, and the customer is promised too early. The new screen marks the day "Closed that day", but older app builds still read the single `anytime` field, which this delta keeps for them. Those builds offered Anytime on every date, including Monday. That's how the client's item 2 complaint came about.
**Suggested fix:** When the chosen Anytime date is closed, count from the next working day's `anytimeOpenFrom` on or after that date (`nextWorkingDay(date)`), not from now. A past date falls back to now, which is fine. Or refuse an Anytime leg on a closed day in `resolveLeg`, the way the window branch already does. Nothing current is lost.
**Resolution:**
Fixed 2026-10-12. `pickupInstant` counts an Anytime pickup on a closed or finished day from the first Anytime opening ON OR AFTER that day (Anytime on closed Monday → Tuesday 08:00), never from now. briefCheck covers it; readyDateStaging 28/0, windowBookingStaging 35/0, quickBookingStaging 67/0.
Closed 2026-10-13 by /audit independent round 2 (6837e64). util/bookingWindow.js:856-872 re-examined; offline probe (TZ=Africa/Lagos, 5 pieces, empty usage): Anytime on closed Mon 19 Oct booked Sat 17 Oct 10:00 (Date and 'YYYY-MM-DD' string) → pickup Tue 20 Oct 08:00, Ready Today Tue 19:00 / Express Wed / Standard Thu; Anytime today Mon 10:00 → Tue 08:00; Sat 18:00 for Sat → Sun 08:00 (Ready Today refused, half day); past Mon from Tue 10:00 → now, from Tue 18:00 → Wed 08:00; no date on Mon → Tue 08:00. Every ready date is on or after the pickup instant; no new defect found in the branch.

### ready-dates-and-daily-floor-limit/F-58 [P3] closed - The admin floor-limit validation accepts blank, null and true as numbers

**File:** services/admin.service.js:1504
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** `Number.isInteger(Number(v))` treats `""` and `null` as 0 and `true` as 1. If an admin form sends a cleared field as `""`, it saves `dailyPieces: 0` without complaint. Every Ready Today and Express row then reads full, and every Regular order collapses onto its first day. Only admins can reach this, so the impact is small, but the stated rule is "whole numbers ≥ 0" and these values aren't numbers.
**Suggested fix:** Accept only `typeof v === 'number'`, or a non-empty digit string, before `Number.isInteger`. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13. Each floor limit must be a real number or a string of digits before the whole-number check, so "", null and true are refused and nothing is saved. readyDateStaging scenario 12 (32/0).
Closed 2026-10-13 by /audit independent round 5 (9eb60ba). services/admin.service.js:1503-1517 re-examined: only a finite number or a trimmed digit string passes, then the integer / ≥ 0 check; "", null, true, "1.5" and -1 are refused; the shares-vs-floor check still runs on the coerced numbers. No new defect.

### ready-dates-and-daily-floor-limit/F-59 [P3] closed - Spec and contract drift, plus dead scheduling code left behind

**File:** swagger/schemas.js (SpeedOption `unavailableReason`); services/admin.service.js:1359-1363; util/helper.js:219; util/bookingWindow.js:452-476; util/queueSort.js:16; services/bookingWindow.service.js:68-74,152
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:**
- Spec section E promises `unavailableReason` ∈ `full | too-many-pieces | pickup-after-noon | half-day | cutoff-passed`. The code and Swagger send `full | too-many-pieces | pickup-rule | not-available`, and the spec's Deviation list doesn't record the change.
- The admin GET order-settings response no longer returns `standardCapacity`, `sameDayCapacity`, `expressCapacity` or `standardDeliveryPeriod`, and now returns `floorLimits` and `halfDays`. The spec's "Frontend impact" section doesn't mention the admin screen.
- `calculateDueDate` and `deliveryDayForSpeed` have no callers left outside briefCheck, even though the spec says the engine replaces them. The comments in queueSort.js:16 and the deliveryPromise/deliveryDayForSpeed blocks still say `calculateDueDate` sets `deliveryDate`.
- `excludeOrderId` is never passed.
- `getFloorUsage` matches the literal `'cancelled'` instead of `ORDER_STATUS.CANCELLED`, which AGENTS.md says to use.
**Suggested fix:**
- Record the reason values as a spec deviation, or rename them.
- Add the admin settings change to the frontend notes.
- Delete `calculateDueDate`, `deliveryDayForSpeed` and their briefCheck checks, and fix the comments.
- Drop `excludeOrderId`, or use it.
- Use the constant.

Nothing current is lost.
**Resolution:**
Fixed 2026-10-13. Removed `calculateDueDate` (util/helper.js), `deliveryDayForSpeed` and `SPEED_WORKING_DAYS`; their briefCheck checks are now equivalent checks on the engine (a ready day lands on a working day; 19:00 deadline; the client's Saturday example). The "19:00 is a sentinel" note moved onto `readyDeadline`; the queueSort and deliveryPromise comments are corrected. `excludeOrderId` dropped. `getFloorUsage` uses `ORDER_STATUS.CANCELLED`. The spec records the real `unavailableReason` values as a deviation (full | too-many-pieces | pickup-rule | not-available, matching Swagger), and the frontend notes now include the admin settings change.
Reopened 2026-10-13 by /audit independent round 5 (9eb60ba). The code removal is complete: no .js file in the repo (root scripts included) imports or calls `calculateDueDate`, `deliveryDayForSpeed`, `SPEED_WORKING_DAYS` or `excludeOrderId`. The constant, the spec deviation and the admin frontend note are verified. Two leftovers keep it open. AGENTS.md:429 still tells agents that the bot's speed step uses `calculateDueDate` ("same-day <10am, express <2pm"), which is the stale-reference defect this finding covers. And the removal left util/helper.js:3 importing `DELIVERY_SPEED`, which nothing there uses now. Fix: reword that AGENTS.md sentence to describe the ready-date engine (pickup before 12:00, no Express cut-off, floor limit) and drop the import.
Fixed 2026-10-13 (round 6 candidate). The AGENTS.md bot sentence now says the speed step offers what `BookingWindowService.speedOptionsFor` allows (launch item 3: Ready Today only for a pickup before 12:00 and never Sunday, no Express cut-off, the daily floor limit), and the unused `DELIVERY_SPEED` import is gone from util/helper.js.
Closed 2026-10-13 by /audit independent round 6 (ddce526). AGENTS.md's In-app bot paragraph now describes `BookingWindowService.speedOptionsFor` (pickup before 12:00, never a half day, no Express cut-off, floor limit 150/30/50) and no longer mentions `calculateDueDate`. util/helper.js no longer imports `DELIVERY_SPEED` and has no other use of it; the module loads. A repo-wide search finds no code reference to `calculateDueDate`, `deliveryDayForSpeed`, `SPEED_WORKING_DAYS` or `excludeOrderId` outside comments and blueprint history. No new defect.

### ready-dates-and-daily-floor-limit/F-60 [P3] closed - The assistant repeats the refused speed's reason twice

**File:** services/bot/booking.flow.js:238-241 with services/bot/parsers.js:281-285
**Found:** 2026-10-12 by /audit independent (scope: current; lens: quality)
**Why it matters:** When the customer asks for a speed that isn't available, `note` puts that row's `message` at the start of the reply. Then `_speedOfferText(avail)` adds `(message)` for every unavailable row, including the same one. So "Too many pieces for Express…" appears twice in one reply.
**Suggested fix:** Pass the refused speed to `_speedOfferText` and skip it in the notes, or drop the leading `note`. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13. `_speedOfferText` takes `skipNoteFor`, and the speed step passes the refused speed, so its reason leads the reply once and is left out of the list. In briefCheck.
Closed 2026-10-13 by /audit independent round 5 (9eb60ba). services/bot/parsers.js:281-293 and services/bot/booking.flow.js:238-245 re-examined. The refused row is left out of the notes only when the reply already leads with it; other greyed-out rows keep their note, and an undefined `refused` keeps every note. The briefCheck F-60 check passes.

### ready-dates-and-daily-floor-limit/F-61 [P3] closed - The item 3 wiring checks in briefCheck only match source text

**File:** briefCheck.js (the new item 3 block: `speedOptionsFor(` on both paths, `const setItem = post.items.find(...)`, `floorAllocation: adjustAllocation(`, the cut-off text and the admin message checks)
**Found:** 2026-10-12 by /audit independent (scope: current; lens: tests)
**Why it matters:** The engine assertions call the real functions, which is good. The checks that it's wired into `postBookOrder`, the counter, the plan set refusal, the recount and the admin validation are regexes over the source, like F-06 and F-08. Behavioural cover for those paths exists only in `readyDateStaging.js` and the other staging scripts, which need a testing database and aren't part of any offline gate. No offline check covers the F-56/F-57 pickup-instant edge cases.
**Suggested fix:** When `/tests` adds a runner, drive `speedOptionsFor` / `postBookOrder` with stubbed models. For now, add pure `pickupInstant` cases to briefCheck. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 as far as an offline gate allows. Every pickup-time case from all review rounds (F-56/57/62/63/64/65/66) is a pure `pickupInstant` call in briefCheck, plus the F-60 reply text, plus the engine checks that replaced the old date code. The DB-backed wiring (booking, counter, recount, recovery, admin validation) is covered by readyDateStaging.js (32/0). A unit runner would let those move offline too (`/tests`).
Closed 2026-10-13 by /audit independent round 5 (9eb60ba). The suggested interim fix, pure `pickupInstant` cases in briefCheck, is in place (briefCheck.js:2626-2645) and passes (504/0). The DB-backed wiring is still checked by source text plus staging, which the finding accepted until `/tests` adds a runner. The new unsafe phrases found this round are recorded under F-65 (reopened), F-67 and F-68, not as a test gap.

### ready-dates-and-daily-floor-limit/F-62 [P1] closed - The F-56 range repair reads a midday range starting at 12 ('12-2pm') as midnight, so it now allows Ready Today

**File:** util/bookingWindow.js:832 (`slotStartMinutes` range branch)
**Found:** 2026-10-13 by /audit independent round 2 (scope: current; lens: quality)
**Why it matters:** The new rule picks the start's meridiem as `pm` only when start ≤ end, else `am`. For `12-2pm`, 12 > 2, so it becomes `12am` and `toMin` turns that into 00:00. Offline probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00): `12-2pm` → 00:00, `12:30-2pm` → 00:30, `12 - 3pm` → 00:00, all `readyTodayAllowed: true`. On the round-1 commit (1869a23) the same inputs read 12:00 / 12:30 and were refused, so this is a regression introduced by 6837e64. It breaks the client's binding noon rule on the same assistant (LLM slot) and legacy free-text `pickupTime` paths as F-56, and since `pickupInstant` returns 00:00 on the pickup day the booking accepts Ready Today for an afternoon pickup.
**Suggested fix:** In the range branch, when the start has no am/pm and its hour is 12, read it as 12:00 (noon) — e.g. treat `ap2 === 'pm' && (start <= end || start === 12)` as pm. Add `12-2pm` and `12:30-2pm` to the briefCheck "do not allow" list. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13. The range rule that read "12-2pm" as 00:00 is gone; with the first-time rule a bare 12 is noon, so "12-2pm", "12:30-2pm", "12 - 3pm" → 12:00/12:30, refused. Covered by the same briefCheck list.
Closed 2026-10-13 by /audit independent round 3 (f0f196a). The range branch is gone; util/bookingWindow.js:824-835 reads the first time only, and a bare 12 stays 12. Offline probe: "12-2pm" → 12:00, "12:30-2pm" → 12:30, "12 - 3pm" → 12:00, "12pm-2pm" → 12:00, "12", "12:00", "12:15", "after 12" → 12:00 or later, all refused. briefCheck.js:2643-2646 covers the three phrases (504/0).

### ready-dates-and-daily-floor-limit/F-63 [P1] closed - An evening/night word is ignored when the text also holds a bare 8–11, and "12am" reads as midnight, so Ready Today is offered for an evening pickup

**File:** util/bookingWindow.js:824-837 (`slotStartMinutes`: the number branch returns before the `SLOT_WORDS` loop); reached from services/bot/parsers.js:262-265 and services/bookOrder.service.js:1763-1764
**Found:** 2026-10-13 by /audit independent round 3 (scope: current; lens: quality)
**Why it matters:** The first-time rule returns as soon as it finds a number, so the words are only read when there is no digit at all. A bare 8–11 is taken as morning even when the same text says evening or night. Offline probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00, 5 pieces, empty floor): "evening, around 8", "8 in the evening", "by 8 this evening", "9 tonight", "10 at night", "11 in the evening" → 08:00–11:00, Ready Today available, "Ready Wednesday 14 October, by 7:00 PM". An explicit "12am" / "12 am" / "12a.m." / "12:30am" → 00:00–00:30, Ready Today available; Nigerian customers commonly write "12am" for noon, and midnight is outside the 08:00–19:00 pickup hours either way. The LLM slot keeps the time "as said" (services/botIntent.service.js:111-113), so these phrases reach `pickupInstant` unchanged, and `postBookOrder` accepts the booking with a 19:00 ready time before the requested pickup. This is the harm F-56 was raised for (client's binding noon rule), through a mechanism F-56's phrase list did not include; it was already present on 6837e64, so it is not a regression of f0f196a.
**Suggested fix:** In `slotStartMinutes`, when the text also contains `evening`, `night` or `tonight` and the hour has no am/pm, add 12 to a bare 8–11 (or return the larger of the number reading and the word's minutes). Read a bare "12am"/"12:xx am" as UNREADABLE (treated as 12:00), since no pickup runs at midnight. Add "evening, around 8", "9 tonight" and "12am" to the briefCheck F-56/F-62 "do not allow" list. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13. `slotStartMinutes` now checks for a late word (afternoon, evening, tonight, night, noon, midday) anywhere in the text: a bare 8–11 beside one is read as pm ("9 tonight" → 21:00), and any non-"am" time with a late word is never earlier than 12:00 ("evening, around 8"). "12am" / "12:30am" are treated as unreadable (counted as 12:00), never midnight. Ranges are read from their START with the pickup-hour rule ("11-1pm" → 11:00, "8-10 in the evening" → late). 63 phrases from rounds 1–3 probed, 0 wrong; briefCheck lists extended (504/0); readyDateStaging 28/0, windowBookingStaging 35/0.
Closed 2026-10-13 by /audit independent round 4 (2c8eb76). util/bookingWindow.js:822-868 re-examined; offline probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00): "8 in the evening", "9 tonight", "evening, around 8", "8-10 in the evening", "by 8 this evening", "10 at night", "11 in the evening" → 20:00–23:00; "12am", "12 am", "12a.m.", "12:30am" → 12:00; all Ready Today refused. All 46 earlier late phrases (bare 1–7, "12-2pm", words, 24-hour, unreadable) still refused and all morning cases still allowed. The new rule's own residual mis-reads are a different mechanism, recorded as F-65 (unsafe, unusual inputs) and F-66 (conservative).

### ready-dates-and-daily-floor-limit/F-64 [P3] closed - The first number in the text wins even when it is a date or a count, so a morning time after it is ignored

**File:** util/bookingWindow.js:824 (`slotStartMinutes` first-match regex)
**Found:** 2026-10-13 by /audit independent round 3 (scope: current; lens: quality)
**Why it matters:** The regex has no word boundaries and takes the first one-or-two digits. Offline probe: "14 Oct 9am" → 14:00, "Oct 14, 3pm" → 14:00, "20/10 at 9am" → 20:00, "2 bags at 9am" → 14:00, "2026-10-14 09:00" → 20:00, "930am" → unreadable (12:00). Each of these refuses Ready Today for a genuine morning pickup. The error is in the safe direction (no wrong promise; Express and Regular count from the pickup DAY, so they are unaffected), and the assistant's slot schema keeps the date in `pickupDate`, so a date inside `pickupTime` is unusual.
**Suggested fix:** Prefer a time that carries am/pm or a colon anywhere in the text before falling back to the first bare number, and skip numbers followed by `/`, `-<digit>` or a month name. Add one or two of these phrases to the briefCheck "still allowed" list. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 in the same change (it was the same parser). Numbers that are dates or counts are skipped (followed by "/", st/nd/rd/th, a month, or bags/pieces/items/kg/clothes/shirts; or preceded by a digit or "/"). Among the rest the parser prefers a range start, then a time with am/pm, then one with a colon: "14 Oct 9am", "20/10 at 9am", "2 bags at 9am" → 09:00, Ready Today allowed. In briefCheck.
Closed 2026-10-13 by /audit independent round 4 (2c8eb76). util/bookingWindow.js:825-852 re-examined; offline probe: "14 Oct 9am", "20/10 at 9am", "2 bags at 9am", "may 9am", "3 pieces 10am", "call 0801 234 5678 at 9am" → 09:00–10:00, allowed; "Oct 14, 3pm", "Mar 3pm", "5 shirts at 3pm" → 15:00, refused; "between 9 and 11" → 09:00, "11-1pm" → 11:00 (range start). "930am" is still unreadable (12:00, conservative) and is folded into F-66. The range-start rule this repair added outranks an explicit time and so mis-reads dash dates in the unsafe direction; that is a new mechanism, recorded as F-65.

### ready-dates-and-daily-floor-limit/F-65 [P2] closed - A dash-written date is read as a range start that outranks the real time, and "00:xx" reads as an early time, so Ready Today can be offered for an afternoon pickup

**File:** util/bookingWindow.js:847 and 851-852 (`rangeStart` pick order), util/bookingWindow.js:857-861 (hour 0); reached from services/bot/parsers.js:262-265 and services/bookOrder.service.js:1764
**Found:** 2026-10-13 by /audit independent round 4 (scope: current; lens: quality)
**Why it matters:** The round-3 repair reads "N-M" as a range from N and, by design ("11-1pm"), lets the range start win over a later time with am/pm or a colon. A date written with dashes also looks like "N-M". Offline probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00, 5 pieces, empty floor): "2026-10-14 15:00" and "2026-10-14T15:00:00" → 10:00 (the month), "9-10 at 3pm" (9 Oct, 3pm) → 09:00; all `readyTodayAllowed: true`, so the screen and `postBookOrder` would offer and accept Ready Today with a 19:00 ready time for a 15:00 pickup. Separately, hour 0 has no rule: "00:30", "0:15", "00:00" → 00:00–00:30, Ready Today allowed; these are the 24-hour spelling of "12:30am", which the F-63 repair deliberately treats as unreadable. This is the wrong-promise harm of F-56/F-63, but the inputs are unusual: the app sends a slot label ("10am-12pm") and the LLM slot keeps the time "as said" with the date in `pickupDate`, so a full date or "00:30" inside `pickupTime` should be rare. Not a regression of the pre-item-3 code (Ready Today did not read `pickupTime` before).
**Suggested fix:** In the candidate loop, skip a number that is part of a dashed date: preceded by "-" + digit, or followed by "-\d{1,2}-" or "-\d{1,2}T", or the first part of a 4-digit year run (already skipped). Treat a range start as winning only over the range's own end (the next candidate), not over a later separate time with am/pm or a colon. Treat hour 0 with no "pm" like "12am": `UNREADABLE_SLOT`. Add "2026-10-14 15:00" and "00:30" to the briefCheck "do not allow" list. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13. Written dates ("2026-10-14", "2026-10-14T…", "14-10-2026") are removed before the time is read. A range start outranks only its own end, never a later separate time with am/pm ("9-10 at 3pm" → 15:00). Hour 0 without "pm" is unreadable, like "12am" ("00:30" refused). 89 phrases from all rounds probed, 0 wrong; briefCheck lists extended (504/0).
Reopened 2026-10-13 by /audit independent round 5 (9eb60ba). The listed inputs are fixed: "2026-10-14 15:00", "2026-10-14T15:00:00", "9-10 at 3pm", "00:30" and "0:15" all read 12:00 or later. But a range start still outranks a later, separate time written with a colon, which the suggested fix named. util/bookingWindow.js:856-858 only checks for a later am/pm. Offline probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00): "9-10 at 15:00" and "9-10 15:00" read 09:00, and "10-14 at 15:00" and "10-11 at 2:30" read 10:00. All of them allow Ready Today, and they read the same on 2c8eb76. Fix: in `laterAmPm`, treat a later candidate that has a colon the same as one with am/pm. Keep "10:00-12:00" reading 10:00, because that colon time is the range's own end.
Fixed 2026-10-13 (round 6 candidate). A range start now wins only when no later candidate after the range's own end carries am/pm OR a colon: "9-10 at 15:00", "9-10 15:00" → 15:00, "10-11 at 2:30" → 14:30, all refused; "10:00-12:00" and "11-1pm" still read 10:00 / 11:00. In briefCheck.
Closed 2026-10-13 by /audit independent round 6 (ddce526). util/bookingWindow.js:893-902 re-examined: `laterTime` now matches a later candidate (after the range's own end) with am/pm OR a colon. Offline probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00): "9-10 at 15:00", "9-10 15:00", "10-11 at 2:30", "10-14 at 15:00", "9-10 at 3pm", "2026-10-14 15:00", "2026-10-14T15:00:00", "00:30", "0:15", "00:00" → 12:00 or later, all refused; "10:00-12:00", "11-1pm", "11:30-1pm", "10am-12pm", "2026-10-14 09:00", "14-10-2026 9am" → morning, allowed. Every phrase in this finding is read correctly. The range START still takes no meridiem from its own end ("8-10pm" → 08:00); that is a different mechanism, recorded as F-69.

### ready-dates-and-daily-floor-limit/F-66 [P3] closed - Natural morning phrases with "noon" or a filler word are refused Ready Today

**File:** util/bookingWindow.js:822 (`LATE_WORDS` includes noon/midday), 813-819 (`SLOT_WORDS` checks noon before morning), 825 (`NOT_A_TIME_AFTER` month prefixes have no word boundary)
**Found:** 2026-10-13 by /audit independent round 4 (scope: current; lens: quality)
**Why it matters:** Same offline probe: "before noon", "morning, before noon" → 12:00; "10-12 noon", "between 10 and noon", "10 or noon" → 22:00 (the bare 10 gets +12 because "noon" is a late word); "good afternoon, around 9" → 21:00; "around 9 maybe", "9 marks" → unreadable ("may"/"mar"/"jun" match as month prefixes); "930am" → unreadable. All refuse Ready Today for what is a morning pickup. This is the safe direction (no wrong promise; Express and Regular are unaffected), so it is only a conservative refusal. The assistant's own `_parseDateTimeFromText` also maps "before noon" to `noon`.
**Suggested fix:** Treat noon/midday as a late word only when no bare 8–11 sits before it in a range ("10-12 noon", "between 10 and noon" → 10:00), read "before noon"/"by noon" as morning, add `\b` after the month prefixes, and accept a 3–4 digit "930am". Nothing current is lost.
**Resolution:**
Fixed 2026-10-13. "before/by/until noon" read as morning. "noon"/"midday" no longer push a bare 8–11 into the evening ("10-12 noon", "between 10 and noon", "10 or noon" → 10:00); only afternoon/evening/night/tonight do. Month names need a whole word ("9 maybe", "9 marks" → 09:00). "930am"/"1030pm" are read as 9:30/22:30 (only with am/pm, so a phone number never becomes a time). In briefCheck.
Closed 2026-10-13 by /audit independent round 5 (9eb60ba). util/bookingWindow.js:800-819, 830 and 877 re-examined. Probe: "before noon", "morning, before noon", "by noon", "10-12 noon", "between 10 and noon", "10 or noon", "around 9 maybe", "9 marks" and "930am" read 09:00–10:00 and are allowed. "1030pm", "130pm", "1230am" and "good afternoon, around 9" are refused. Every phrase in this finding now reads as a morning. The new before-noon rule doesn't notice a negation ("not before noon"). That is a different, unsafe mechanism, recorded as F-67.

### ready-dates-and-daily-floor-limit/F-67 [P2] closed - The new "before/by noon = morning" rule ignores a negation and an evening word, so "not before noon" offers Ready Today

**File:** util/bookingWindow.js:802 (`SLOT_WORDS` first entry) and 877-878; reached from services/bot/parsers.js:262-265 and services/bookOrder.service.js:1762-1765
**Found:** 2026-10-13 by /audit independent round 5 (scope: current; lens: quality)
**Why it matters:** The F-66 repair maps any "before|by|until|till noon/midday" to 10:00 without checking for a negation. Line 877 has a `!evening` guard, but line 878 undoes it: its loop checks the same pattern first, with no guard. Offline probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00) read these as 10:00, so Ready Today is allowed:
- "not before noon"
- "not by noon"
- "anytime but before noon" (ambiguous)
- "afternoon, by noon"
- "by noon or evening"

On 2c8eb76 all five read 12:00–16:00 and were refused, so this is a regression of 9eb60ba. "Not before noon" means an afternoon pickup. The LLM slot keeps the time "as said" (services/botIntent.service.js:113), so the phrase reaches `pickupInstant` unchanged. `postBookOrder` would then accept Ready Today with a 19:00 ready time for a pickup after 12:00, against the client's binding noon rule.
**Suggested fix:**
- Use the before-noon reading only when "not" or "n't" doesn't come before it. For example, match `/\bnot\s+(before|by|until|till)\s+(noon|midday)/` first and return 12:00.
- Drop the unguarded first `SLOT_WORDS` entry, so line 877, with its `!evening` guard, is the only place the rule applies.
- Add "not before noon" and "by noon or evening" to the briefCheck late list.

Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 6 candidate). The unguarded "before/by noon" `SLOT_WORDS` entry is removed, so only the guarded rule applies. And Ready Today now reads a pickup time only when the text is plain (time numbers, am/pm and a short list of plain words); "not", "but", "anytime" and other words make it unreadable (12:00, refused). "not before noon", "not by noon", "anytime but before noon", "afternoon, by noon", "by noon or evening" are all refused; "before noon" and "by noon" alone are still allowed. Spec step 11; in briefCheck.
Closed 2026-10-13 by /audit independent round 6 (ddce526). util/bookingWindow.js:800-809, 852-861, 870 and 918 re-examined: the unguarded `SLOT_WORDS` entry is gone, the only before-noon rule (line 918) requires no evening word, and the plain-text gate turns "not", "but", "anytime" into UNREADABLE (12:00). Probe: "not before noon", "not by noon", "anytime but before noon", "afternoon, by noon", "by noon or evening", "not 9am", "no morning", "except morning", "morning? no evening" → 12:00 or later, refused; "before noon", "by noon", "until noon", "till noon", "morning, before noon" → 10:00, allowed. No new defect in this mechanism.

### ready-dates-and-daily-floor-limit/F-68 [P2] closed - Evening times written with a dot, and dates written month first, are still read as a morning time, so Ready Today is offered

**File:** util/bookingWindow.js:835 (the candidate regex reads only `:` minutes) and 839-840 (a month is looked for only AFTER the number); reached from services/bot/parsers.js:262-265 and services/bookOrder.service.js:1762-1765
**Found:** 2026-10-13 by /audit independent round 5 (scope: current; lens: quality)
**Why it matters:** Offline probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00, empty floor). Every phrase below allows Ready Today:
- "8.30pm", "9.30pm", "10.30pm" and "11.30pm" read 08:00–11:00. The "30pm" part is dropped as hour 30, so the bare 8–11 wins.
- "Oct 9, 3" reads 09:00 and "Oct 10 around 2" reads 10:00. The day number before the time is taken as the hour.
- "9 o clock pm" reads 09:00 and "9:30 p m" reads 09:30.

"8.30pm" with a dot is a common way to write a time in Nigeria, and the LLM keeps the time as said. This is the same wrong-promise harm as F-56, F-63 and F-65, through a less common input. Express and Regular are unaffected, because they count from the pickup day. It is not a regression of 9eb60ba: every one of these reads the same on 2c8eb76, and earlier probes missed them.
**Suggested fix:**
- Accept `.` as a minutes separator: `(?:[:.](\d{2}))?`.
- Skip a number that comes straight after a month name, for example by testing the text before it with `/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*$/i`.
- Optionally allow a space inside "p m".
- Add "8.30pm" and "Oct 10 around 2" to the briefCheck late list.

Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 6 candidate) by the plain-text gate, which refuses rather than guesses: a dot between digits ("8.30pm"…"11.30pm") and leftover words ("o clock", a split "p m") make the text unreadable (12:00, refused). Month-first dates ("Oct 10", "Oct 9,") are stripped as written dates first, so "Oct 10 around 2" → 14:00, refused, and "Oct 10 9am" is still allowed. 104 phrases probed, 0 wrong. In briefCheck.
Closed 2026-10-13 by /audit independent round 6 (ddce526). util/bookingWindow.js:824-835 (WRITTEN_DATES now strips month-first and day-first written dates, slash dates and counts) and 852-861 (`isPlainTimeText`: a digit-dot-digit or any word outside `PLAIN_WORDS` is UNREADABLE) re-examined. Probe: "8.30pm", "9.30pm", "10.30pm", "11.30pm", "Oct 9, 3", "Oct 10 around 2", "9 o clock pm", "9:30 p m", "half past 8 pm", "quarter to 9 pm", "nine pm", "two pm" → 12:00 or later, refused; "Oct 10 9am", "14 Oct 9am", "20/10 at 9am", "2 bags at 9am" → 09:00, allowed. Every phrase in this finding is read correctly. The gate admits a seconds field ("9:00:00 pm") that the reader then mis-reads; that is a different mechanism, recorded as F-70.

### ready-dates-and-daily-floor-limit/F-69 [P2] closed - A range whose am/pm is only on its end ("8-10pm", "between 8 and 10pm") is read from a MORNING start, so Ready Today is offered for an evening pickup

**File:** util/bookingWindow.js:889-902 (`rangeStart` pick) and 908-911 (a bare 8–11 start stays morning); reached from services/bot/booking.flow.js:77 → services/bot/parsers.js:263 and services/bookOrder.service.js:1764
**Found:** 2026-10-13 by /audit independent round 6 (scope: current; lens: quality)
**Why it matters:** A range is read from its start, and the start takes no meridiem from its own end. A bare 8–11 start is therefore read as morning even when the end says pm and is later on the same clock. Offline probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00, empty floor): "8-10pm", "8 - 10 pm", "8 to 10pm", "between 8 and 10pm", "8 and 9pm" → 08:00; "9-11pm", "9 or 10pm" → 09:00; "10-11pm" → 10:00. All `readyTodayAllowed: true`, so the booking screen offers Ready Today and `postBookOrder` accepts it with a 19:00 ready time for a pickup at 20:00 or later. These are ordinary ways to write an evening slot, they pass the new plain-text gate (only digits, "to", "and", "between", "or", am/pm), and neither the assistant (booking.flow.js:77 keeps the slot as said) nor the legacy `pickupTime` path checks the time against pickup hours. Same wrong-promise harm as F-56/F-63/F-65 against the client's binding noon rule. Not a regression of ddce526: on f0f196a, 2c8eb76 and 9eb60ba the first five phrases already read 08:00–10:00 (archived copies probed); "9 or 10pm" read 22:00 on 2c8eb76 and regressed in 9eb60ba. Earlier probe lists only covered "8-10 in the evening" and "11-1pm".
**Suggested fix:** In `slotStartMinutes`, when the picked candidate is a range start with no am/pm and the range's own end (`found[1]`) carries "pm" with an hour below 12, and start hour < end hour, read the start as pm. This keeps "10-12pm" / "10am-12pm" (end 12, noon) and "11-1pm" (start > end) as morning. Add "8-10pm", "9-11pm", "between 8 and 10pm" and "9 or 10pm" to the briefCheck late list, and "10-12pm" to the allowed list. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 7 candidate). In `slotStartMinutes`, a bare range start takes its own end's "pm" when the end hour is below 12 and the start is not later on the clock: "8-10pm", "8 - 10 pm", "8 to 10pm", "between 8 and 10pm", "8 and 9pm", "9-11pm", "9 or 10pm", "10-11pm" → 20:00–22:00, refused. "11-1pm" (start > end), "10-12pm" and "10am-12pm" (end at noon) stay morning. Spec step 12; in briefCheck.
Closed 2026-10-13 by /audit independent round 7 (e7063c9). util/bookingWindow.js:915-917 re-examined: the end is the candidate right after the picked range start, and the shift applies only to a bare start with a pm end below 12 that is not later on the clock. Probe (TZ=Africa/Lagos, pickupDate Wed 14 Oct, now Tue 07:00): every phrase in this finding plus "8-10PM", "8-10 p.m.", "8:00 - 10:00 PM", "8:30-10pm", "9:30 - 11:30 pm", "11-11:30pm", "7-9pm", "07-09 pm", "8 – 10 pm", "8 to 10:30 pm", "8-9 or 10pm", "8 or 9 or 10pm", "8 to 9 or 10 pm", "8-10pm or 9", "Oct 14, 8-10pm", "08:00-10:00pm" → 19:00–23:00, refused. "10-12pm", "11-1pm", "11-12pm", "10am-12pm", "10:00 AM - 12:00 PM", "9 to 5pm", "9-10am" → morning, allowed. No new mis-read from the repair in 148 late phrases.

### ready-dates-and-daily-floor-limit/F-70 [P2] closed - The plain-text gate admits a seconds field, and the reader then drops its am/pm, so "9:00:00 pm" reads 09:00

**File:** util/bookingWindow.js:857-858 (`isPlainTimeText` accepts `(?::\d{2}){0,2}`) and 875-879 (the candidate regex reads only one `:mm`, and the trailing ":00 pm" candidate is skipped because it follows ":")
**Found:** 2026-10-13 by /audit independent round 6 (scope: current; lens: quality)
**Why it matters:** Offline probe (same setup): "9:00:00 pm" → 09:00, "9:30:00 PM" → 09:30, "10:00:00 pm" → 10:00, all Ready Today allowed. The gate deliberately lets a seconds field through as "plain", but the reader matches "9:00", sees no am/pm directly after it, and skips the "00 pm" part, so a bare 9 is read as morning. The input is unusual (a 12-hour timestamp with seconds, e.g. pasted or reformatted by the LLM), so it is less likely than F-69, but it is the same wrong-promise direction. On 2c8eb76 "9:00:00 pm" read 12:00 (refused); it regressed in 9eb60ba and ddce526 keeps it.
**Suggested fix:** Either let the candidate regex take optional seconds before the meridiem (`(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)?`), or make the gate refuse a seconds field (`(?::\d{2})?` instead of `{0,2}`) so it reads as UNREADABLE. Add "9:00:00 pm" to the briefCheck late list. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 7 candidate). The candidate regex reads past a seconds field (`(?::\d{2})?`), so "9:00:00 pm", "9:30:00 PM", "10:00:00 pm" keep their pm and are refused; "9:00:00 am" is still allowed. In briefCheck.
Closed 2026-10-13 by /audit independent round 7 (e7063c9). util/bookingWindow.js:878 re-examined: the optional non-capturing seconds group sits between `:mm` and the meridiem, so the pm is captured. Probe: "9:00:00 pm" → 21:00, "9:30:00 PM" → 21:30, "10:00:00 pm" → 22:00, "21:00:00" → 21:00, all refused; "9:00:00 am" → 09:00, allowed; a malformed "9:00:00:00 pm" is not plain → 12:00, refused. The seconds group adds no new reading for other inputs (it only matches a second `:dd`).

### ready-dates-and-daily-floor-limit/F-71 [P3] closed - The plain-text gate refuses some ordinary morning phrasings (weekday names, "9ish", "o'clock", "before 12")

**File:** util/bookingWindow.js:847-861 (`PLAIN_WORDS`, `isPlainTimeText`) and 908-918
**Found:** 2026-10-13 by /audit independent round 6 (scope: current; lens: quality)
**Why it matters:** Same offline probe: "Wed 9am", "Wednesday 9am", "wednesday morning", "9ish", "9 o'clock", "0900", "9.30am", "10:00 hrs", "sometime in the morning", "first thing", "morning time", "early" → UNREADABLE (12:00); "before 12" and "by 12" → 12:00. All refuse Ready Today for what is a morning pickup. This is the safe direction (no wrong promise; Express and Regular count from the pickup day and are unaffected), and the app's own slot labels ("10am-12pm", "10:00 AM - 12:00 PM", "8:00 - 10:00") all pass, so the impact is that the assistant withholds Ready Today for some customers who would qualify. A weekday name in the time slot is plausible from the assistant, whose slot keeps the phrase as said.
**Suggested fix:** Add the weekday names (and short forms), "o'clock"/"oclock", "time", "sometime", "first", "thing" and "hrs" to `PLAIN_WORDS` (strip the apostrophe before splitting), let "9ish" split as "9" + "ish", and read "before 12" / "by 12" like "before noon". Never add a word that can negate or shift a time ("not", "after", "but", "except", "later"). Optional; nothing current is lost.
**Resolution:**
Partly fixed 2026-10-13 (round 7 candidate). Weekday names and short forms, plus "sometime", are plain words, so "Wed 9am", "Wednesday 9am", "wednesday morning" and "sometime in the morning" are allowed; "sunday 8-10pm" and "wed evening" are still refused. The rest ("9ish", "o'clock", "0900", "9.30am", "10:00 hrs", "first thing", "before 12", "by 12") are left refused on purpose: the safe direction, and each extra reading rule has introduced a new mis-read in earlier rounds.
Closed 2026-10-13 by /audit independent round 7 (e7063c9). util/bookingWindow.js:847-853 re-examined. The weekday words only make the text "plain"; they never set a time, and the pickup DAY still comes from `pickupDate`, so they cannot shift a reading. Probe: "Wednesday 9am", "Wed 9am", "wednesday morning", "sometime in the morning" → allowed; "sunday 8-10pm", "wednesday 8-10pm", "wed 9pm", "wed evening" → refused. The remaining refusals were re-probed and are exactly the ones the resolution names ("9ish", "9 o'clock", "0900", "9.30am", "first thing in the morning", "by 12", "before 12"), all 12:00 → refused, the safe direction; Express and Regular are unaffected. The resolution is honest and matches the code and spec step 12, and the app's slot labels all pass, so the residue is accepted reviewer judgement for a P3, not a hidden defect. Listed under Remaining risk in review.md.

### ready-dates-and-daily-floor-limit/F-72 [P2] closed - The assistant drops a pickup day it cannot resolve ("20 October", "the 20th"), so the speeds and the booking count from NOW and Ready Today is offered for a later pickup

**File:** services/bot/parsers.js:263 and 317-344 (`_resolvePickupDate` only knows today / tomorrow / day after tomorrow / a weekday name), services/bot/booking.flow.js:76 (bDate accepts the LLM's `pickupDate` slot as said) and 325-326 (`pickupDate` left off the payload when unresolved), util/bookingWindow.js:975 (`pickupInstant` falls back to now and ignores `pickupTime` when there is no `pickupDate`)
**Found:** 2026-10-13 by /audit independent round 7 (scope: current; lens: quality)
**Why it matters:** The LLM slot description asks for the day "exactly as said", so "20 October", "Oct 20", "the 20th", "20/10", "next week" or "in 3 days" fill `bDate` and the flow moves on to the speed step. `_resolvePickupDate` returns null for all of them, so `_availableSpeeds` and `_placeBooking` pass no `pickupDate`, and `pickupInstant` returns `now`, dropping the time too. Offline probe (TZ=Africa/Lagos, now Tue 13 Oct 09:00, pickupTime "4pm", empty floor): each of those phrases gives Ready Today "Ready Tuesday 13 October, by 7:00 PM", Express "Wednesday 14 October", Standard "Thursday 15 October" — ready dates days before the pickup, and Ready Today for a 4pm pickup. `postBookOrder` gets the same missing date and accepts the order with `deliveryDate` today 19:00 and the floor split on the wrong days, so the order reads overdue before pickup and occupies other days' room. Same wrong-promise harm as F-57 (closed for Anytime) against item 3's own rule that the ready date is worked out from the pickup day and time the customer picks (spec problem row 4, client item 9). The old code also counted from the booking time, so the class pre-exists, but item 3 now shows a specific dated promise and enforces Ready Today from this instant. "next Friday" and "tomorrow" resolve correctly.
**Suggested fix:** Smallest: when `bDate` is set but `_resolvePickupDate(bDate)` is null, do not reach the speed step on `now` — re-ask the day in a form the resolver understands ("Which day? e.g. tomorrow or Saturday"), reusing the existing `collect-datetime` step and the loop guard. Optionally teach `_resolvePickupDate` written dates ("20 October", "Oct 20", "20/10", "the 20th") by reusing the date patterns already in util/bookingWindow.js. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 8 candidate). Both parts of the suggested fix:
- services/bot/parsers.js `_writtenPickupDate` reads "20 October", "20th of Oct", "Oct 20", "20/10" (day first), "the 20th" and "in 3 days" as the next such day, and `_resolvePickupDate` uses it first. An impossible date ("31/02"), an explicit past date ("10/10/2026"), or one without a year that passed in the last 60 days ("12 October" on the 13th) is null; only a date well behind ("5/1" in October) rolls to next year. A bare ordinal needs "the", so "3rd floor" is not a date. `_parseDateTimeFromText` reads written dates only on the `collect-datetime` step, so an address like "12/4 Allen Avenue" is never taken as a day.
- services/bot/booking.flow.js drops a day phrase that `_resolvePickupDate` can't turn into a date ("next week", "asap") and asks again at `collect-datetime` ("I couldn't pin down the day from …"), so neither the speed step nor `_placeBooking` runs without a real pickup date. The loop guard still caps repeats.

briefCheck has three F-72 checks (507/0); botStaging gives the same result with and without the change (5/9; the four warnings are the testingdb ₦700 price and no OpenAI/SMS credits).
Reopened 2026-10-13 by /audit independent round 8 (b4e314c). The original defect is gone for every phrase this finding lists: offline probe (TZ=Africa/Lagos, now Tue 13 Oct) "20 October", "20th of Oct", "Oct 20", "oct. 20th", "20/10", "20/10/26", "the 20th", "Tuesday 20th October" → Tue 20 Oct; "in 3 days" → Fri 16 Oct; "next week", "asap", "sat", "20th", "in two days", "2026-10-20" → null, and a stubbed bookingFlow run re-asks at `collect-datetime` ("I couldn't pin down the day from "next week"…") instead of reaching the speed step; month/year roll-overs and impossible dates (31/02, 29/02) behave as documented. It cannot close, because the repair introduced a new wrong-date defect (F-73, P2: a written date now outranks a weekday the customer named, so "saturday 10/11 am" resolves to 10 November), and the resolution's guarantee that "neither the speed step nor `_placeBooking` runs without a real pickup date" does not hold on the confirm path (F-74, P3). Close together with F-73 once that regression is repaired and re-reviewed.
Fixed again 2026-10-13 (round 9 candidate) together with F-73 and F-74, which were the only blockers: the original phrases still resolve, and the confirm path now needs a pickup day.
Closed 2026-10-13 by /audit independent round 9 (81cd5ea). services/bot/parsers.js:326-429 and services/bot/booking.flow.js:78-99, 172-184, 261, 298, 354 re-examined. I froze the clock (TZ=Africa/Lagos, Tue 13 Oct 09:00): "20 October", "oct 20 morning", "the 20th", "20/10 at 9am", "20/10/2026", "october 20th by 9" all resolve to Tue 20 Oct, and "in 3 days" to Fri 16 Oct. "next week", "any day", "12 october", "10/10", "31/02" return null. A stubbed bookingFlow re-asks at `collect-datetime` and never reaches the speed step without a day. On the confirm path, "yes" with a day that has passed creates nothing (placed 0) and asks for the day again. The original defect (counting from NOW for an unread day) is gone. This repair did not introduce F-78; the same weekday answers resolved the same way on b6bdb30.

### ready-dates-and-daily-floor-limit/F-73 [P2] closed - The new written-date reader outranks a weekday the customer named, so an hour pair ("saturday 10/11 am") or "3 may be 4" books the pickup on the WRONG date

**File:** services/bot/parsers.js:181 (`written` checked before the weekday names in `_parseDateTimeFromText`), 395-396 (`_resolvePickupDate` tries `_writtenPickupDate` before today/tomorrow/weekday), 345 and 353 (any "N may"/"N/M" is a date), 337-342 (`nextOf` rolls a date >60 days behind into next year); reached from services/bot/booking.flow.js:75-76 → 244/281 (speeds) and 337-338 (`_placeBooking` pickupDate)
**Found:** 2026-10-13 by /audit independent round 8 (scope: current; lens: quality)
**Why it matters:** On the day question (`collect-datetime`, where `written` is on) the offline parser now returns the first written-date match even when the same answer names a weekday. Offline probe (TZ=Africa/Lagos, now Tue 13 Oct), stubbed bookingFlow: "saturday 10/11 am" (10 or 11 o'clock) → datePhrase "10/11" → speeds counted from **Tue 10 Nov 11:00**; "saturday at 11/12" → **Fri 11 Dec**; "friday by 3 may be 4pm" ("3, maybe 4") → "3 may" → **Mon 3 May 2027**. The flow reaches `collect-speed` with ready dates weeks or months out, the confirm summary shows only the raw phrase ("10/11 11am"), and a "yes" places the order with that pickupDate and floor split. Before b4e314c the same answers resolved to the named Saturday/Friday, so this is a regression from the F-72 repair. A slash between alternative hours and "may be" written as two words are ordinary Nigerian-English phrasings; the path is the documented rules-only fallback (no LLM key, LLM failure, or an LLM turn that leaves `pickupDate` empty), and an LLM `pickupDate` that keeps such a phrase verbatim hits the same precedence in `_resolvePickupDate`. Wrong promise and wrong persisted pickup date on a realistic input. "saturday 9/10 am" escapes only because 9 Oct is in the past.
**Suggested fix:** Smallest: in both `_parseDateTimeFromText` and `_resolvePickupDate`, when the text names a weekday (or today/tomorrow), use the written date only if it falls on that weekday; otherwise prefer the weekday (or re-ask on a real conflict such as "Saturday 20 October" when the 20th is a Tuesday). Also skip a slash pair followed by am/pm, and do not read "N may" when followed by "be". Add "saturday 10/11 am", "saturday at 11/12" and "friday by 3 may be 4pm" to the F-72 briefCheck lists. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 9 candidate). services/bot/parsers.js: `_parseDateTimeFromText` keeps a written date BESIDE a named day ("saturday 20 october"), never in place of it; `_resolvePickupDate` resolves both and uses the written date only when they agree (same weekday, or the same date for today/tomorrow), otherwise null so the day is asked again ("Saturday 31 October" agrees when the 31st is a Saturday; "saturday 20 october" when the 20th is a Tuesday is re-asked). A slash pair followed by am/pm ("10/11 am", "9/10am") is a time range, not a date, and "N may be" is not a date. Probe (clock frozen Tue 13 Oct 09:00): "saturday 10/11 am" → Sat 17 Oct, "friday by 3 may be 4pm" → Fri 16 Oct, "saturday at 11/12" → asked again, "tomorrow 20/10" → asked again, "Tuesday 20th October" → Tue 20 Oct. briefCheck: two F-73 checks, clock-independent (510/0).
Closed 2026-10-13 by /audit independent round 9 (81cd5ea). services/bot/parsers.js:187-190 (the written date sits beside the named day), 349 (`(?!\s+be\b)`), 358 (the slash pair before am/pm) and 420-425 (the agreement check) re-examined. Frozen-clock probe (Tue 13 Oct 09:00), offline parse and LLM-verbatim resolve gave the same results:
- Resolve correctly: "saturday 10/11 am" → Sat 17 Oct, "friday by 3 may be 4pm" → Fri 16 Oct, "Saturday 24 October" / "saturday 24th october" / "saturday the 24th" / "saturday 24/10" → Sat 24 Oct, "tuesday 13 october" → today, "tomorrow 14/10" → Wed 14.
- Asked again: "saturday at 11/12", "tomorrow 20/10", "thursday 1/11" (1 Nov is a Sunday), "saturday 2 may work". Asking again is the safe direction.
- End to end: a stubbed bookingFlow offers speeds from Sat 17 Oct for "saturday 10/11 am" and stores `bDay` 17 Oct.

The pickup-time reader refuses the raw "10/11 am" (12:00, the safe direction), and the offline time phrase is "11am". This repair introduced no wrong date. The remaining wrong-date answers are a weekday beside a bare ordinal or "next week" (F-78, which was already there on b6bdb30) and "N may" with no named day (F-79).

### ready-dates-and-daily-floor-limit/F-74 [P3] closed - The confirm "yes" places the booking with no pickup date when the saved day stops resolving between turns, and "the 13th" rolls to next month after midnight

**File:** services/bot/booking.flow.js:82-85 (an unresolved `bDate` is nulled every turn, including the confirm turn) and 157-166 (confirm "yes" calls `_placeBooking` without re-checking the date); services/bot/booking.flow.js:337-338 (`pickupDate` omitted when unresolved → `pickupInstant` counts from now); services/bot/parsers.js:365-372 and 337-342
**Found:** 2026-10-13 by /audit independent round 8 (scope: current; lens: quality)
**Why it matters:** `bDatePhrase` is re-resolved against the current clock every turn. A written date resolves on the day it is said but not after midnight: "13 October" said on the 13th becomes null on the 14th (passed <60 days). Stubbed probe: step `confirm`, persisted `bDatePhrase: "12 october"` (now unresolvable), reply "yes" → `_placeBooking` is called with `bDate: null`, so the order is placed with no pickupDate and the ready date counts from now — the F-72 harm, contrary to the F-72 resolution's guarantee. "the 13th" persisted across midnight instead rolls to 13 November (wrong date). Needs a booking conversation that spans midnight, so unusual; recorded P3. Separately, the comment "3rd floor is never a date" is only true without "the": "the 3rd floor" on the day question reads as 3 November (low realism at that step).
**Suggested fix:** In the confirm branch, if `bDate` is null (or `unreadDay` is set), return to `collect-datetime` instead of calling `_placeBooking`; optionally persist the resolved ISO date alongside the phrase so it never drifts between turns. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 9 candidate). services/bot/booking.flow.js keeps the resolved day as `bDay` (ISO) beside `bDatePhrase` and reuses it while the phrase is unchanged, so a chat that crosses midnight never re-reads "13 October" or "the 13th" against a new clock. A kept day that has passed is dropped and asked again. The confirm "yes" places only with a pickup day (`isAffirmative(text) && pickupDay`); otherwise the re-summary asks for the day. `_availableSpeeds` and `_placeBooking` take that day directly. "the 3rd floor" (and gate/street/estate… after an ordinal) is not a date. In briefCheck; botStaging unchanged (5/9, the known testingdb/credit warnings; the booking order is still created).
Closed 2026-10-13 by /audit independent round 9 (81cd5ea). services/bot/booking.flow.js:45-99 (`bDay` is reused only while `bDatePhrase` is unchanged; a passed day is dropped), 180 (`isAffirmative(text) && pickupDay`), 354 and 451 (the reroute keeps `bDay`), and services/bot/parsers.js:370 (place words after an ordinal) re-examined.

Stubbed multi-turn probes:
- "the 13th" said Tue 09:00, then "yes" at Wed 00:30: nothing placed; asked for the day again.
- "today" said Sat, then "yes" at Sun 00:20: nothing placed; asked again.
- "20 October" said Tue 23:50, then "yes" at Wed 00:10: placed with pickupDate Tue 20 Oct 12:00 and pickupTime "4pm". The kept day did not drift.
- "the 3rd floor, saturday" and "saturday, 3rd floor" → Sat 17 Oct.

The original defect is gone. After the day is asked again, the speed chosen earlier is kept and not re-checked. That was already true on b4e314c, where "today" silently became the new day. It is recorded separately as F-80 [P3]: the booking still refuses the speed and reroutes, so no wrong value is stored.

### ready-dates-and-daily-floor-limit/F-78 [P2] closed - A weekday next to a bare ordinal or "next week" ("Saturday 24th", "next week Saturday") resolves to the COMING weekday, so the assistant quotes and books the pickup a week early

**File:** services/bot/parsers.js:370 (a bare ordinal is read only after "the"), 406-416 (a weekday is always its next occurrence, and "next week" is ignored) and 420-427 (the agreement check runs only when a written date was read); reached from services/bot/booking.flow.js:78-99 → 261/298 (speeds) and 354 (`_placeBooking` pickupDate)
**Found:** 2026-10-13 by /audit independent round 9 (scope: current; lens: quality)
**Why it matters:** The round-9 rule is that a named weekday and a written date must agree, or the day is asked again. The most common way to write the date beside a weekday is a bare ordinal, and that is never read as a date, so the check never runs. "next week" is dropped too.

Frozen-clock probe (TZ=Africa/Lagos, Tue 13 Oct 09:00). The offline parse and an LLM `pickupDate` kept verbatim agree:
- "Saturday 24th", "next week saturday", "saturday next week" → Sat 17 Oct (meant: Sat 24 Oct).
- "friday 23rd" → Fri 16 Oct.
- "saturday 31st" → Sat 17 Oct.

In the stubbed bookingFlow, the speeds are counted from Sat 17 Oct (Same Day "ready Saturday 17 October"), `bDay` is stored as 17 Oct, and "yes" would place the order with that pickupDate and floor split. The confirm summary shows only "saturday".

These answers are ordinary Nigerian English, so this is a wrong promise and a wrong stored pickup date on a realistic input. The resolver behaved the same on b6bdb30 (weekday only), so the problem existed before this item, like F-72. Item 3 now gives a dated promise from this day and enforces Ready Today and the floor from it. A customer may notice the wrong date in the speed list, which was also true of F-73.
**Suggested fix:** Smallest:
- When a weekday is named, also read a bare ordinal next to it (`\b(\d{1,2})(st|nd|rd|th)\b`, keeping the existing place-word exclusions) as a written date. The existing agreement check then resolves "Saturday 24th" to 24 Oct and asks again for "saturday 23rd".
- When "next week" appears with a weekday, add 7 days if that lands in the next calendar week, or simply return null so the day is asked again.

Add "Saturday 24th", "friday 23rd" and "next week saturday" to the F-73 briefCheck check. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 10 candidate). services/bot/parsers.js: beside a named weekday a bare ordinal is read as a date ("Saturday 24th", "friday 23rd"), so the weekday/date agreement check runs ("saturday 25th" when the 25th is a Sunday is asked again); and beside a weekday it is read on any turn, not only the day question ("book for saturday 24th please"). "<weekday> next week" / "next week <weekday>" is that day in the week starting next Monday (Tue 13 Oct: "saturday next week" → Sat 24, "monday next week" → Mon 19); `_parseDateTimeFromText` keeps "next week" with the weekday. Probe (clock frozen Tue 13 Oct 09:00): 22 day answers, 0 wrong. briefCheck F-78 check is clock-independent (513/0).

Reopened 2026-10-13 by /audit independent round 10 (01fdf64). The cases this entry named are fixed. Frozen clock (TZ=Africa/Lagos) on Tue 13, Sat 17, Sun 18 and Mon 19 Oct: "Saturday 24th", "friday 23rd", "saturday 31st", "saturday the 24th", "24th (saturday)", "next week saturday", "saturday next week", "monday/sunday/tuesday next week" all resolve correctly, and the stubbed flow places "Saturday 24th" with pickupDate Sat 24 Oct 12:00. Two shapes of the same defect remain:
- **The date without a suffix (base behaviour, same class as this entry).** "saturday 24", "friday 23", "saturday, 24", "saturday 24 by 10am" and "wednesday 21" still resolve to the coming weekday (Sat 17 / Fri 16 / Wed 14 Oct) on Tue 13 Oct. `_writtenPickupDate` reads no bare number (parsers.js:382-393 needs st/nd/rd/th), so the agreement check never runs. Stubbed flow: "saturday 24" quotes "Standard — ready Wednesday 21 October", the summary shows only "saturday", and "yes" places pickupDate Sat 17 Oct 12:00 — a week early. Same for an LLM `pickupDate` kept verbatim. This is as common as "Saturday 24th" in customer chat, and item 3 now gives a dated promise from it. The same is true of "saturday 2026-10-24" (an ISO date beside a weekday is not read, so Sat 17).
- **The repair's "next week" reading ignores a negation (new in this round).** `/\bnext\s+week\b/` anywhere in the text (parsers.js:187 and 430) turns "this saturday, not next week" and "saturday this week not next week" into Sat 24 Oct (meant: Sat 17). b6bdb30 and 81cd5ea gave Sat 17 here. The summary echoes "saturday next week", so a careful customer can see it; "saturday or next week" also becomes Sat 24 (ambiguous, acceptable).

**Suggested fix (round 10):** Beside a named weekday, also read a bare 13–31 not followed by am/pm, ":" or "." (`\b(1[3-9]|2\d|3[01])\b(?!\s*(?::|\.|[ap]\.?m))`) as a day of the month, so the existing agreement check runs; leave 1–12 alone (it is often an hour). Treat "next week" as next week only when it is not preceded by "not"/"or" within a few words, or return null so the day is asked again. Optionally read `YYYY-MM-DD`. Add "saturday 24" and "this saturday, not next week" to the F-78 briefCheck check. Nothing current is lost.
Fixed again 2026-10-13 (round 11 candidate). services/bot/parsers.js: beside a weekday a bare 13–31 is the day of the month when it sits right after the weekday and is followed only by a time word, punctuation or the end ("saturday 24", "friday 23", "saturday 24 by 10am", "saturday 24, 9am" → that date; "saturday 25" when the 25th is a Sunday is asked again); 1–12 stays an hour; a house number later in the sentence, a slash pair or a count is never a day. "next week" ruled out by "not"/"or" just before it ("this saturday, not next week") keeps the coming weekday (shared `NEXT_WEEK`). And as a safeguard for the whole class, the booking summary now shows the pickup DATE read ("Wednesday 14 October") instead of echoing the customer's words, so any misread day is visible before "yes". Probe (clock frozen Tue 13 Oct): 28 day answers, 0 wrong. briefCheck: three clock-independent checks (516/0).

Closed 2026-10-13 by /audit independent round 11 (f30c3d3). Frozen clock (TZ=Africa/Lagos) on Tue 13, Sat 17 and Fri 30 Oct, 116 day answers. Every shape this entry named resolves correctly: "Saturday 24th", "saturday 24", "friday 23", "saturday, 24", "saturday 24 by 10am", "saturday 24, 9am", "wednesday 21", "saturday 31", "saturday the 24", "saturday next week", "next week saturday", "monday/tuesday next week" (Mon 19 / Tue 20), and across a month end "friday 13" / "saturday 14" (Fri 13 / Sat 14 Nov) and "monday 2nd" (Mon 2 Nov). The negation is fixed: "this saturday, not next week", "saturday this week not next week", "saturday (not next week)" → Sat 17; "not this saturday, next week", "no, saturday next week" and "not until next week saturday" → Sat 24. Disagreeing pairs ("saturday 14", "saturday 25", "friday 16" on Sat 17) are asked again. Stubbed bookingFlow: "saturday 24" stores `bDay` Sat 24 Oct and the summary reads "Pickup: … Saturday 24 October … Standard — ready Wednesday 28 October". `NEXT_WEEK` uses a bounded lookbehind (no backtracking risk). Some phrasings outside the time-word list after the bare number still fall back to the coming weekday; they are logged separately as F-82 [P3] because the summary now shows the resolved date before "yes".

### ready-dates-and-daily-floor-limit/F-79 [P3] closed - With no day named, "N may …" or "may N am" is read as a date in May next year

**File:** services/bot/parsers.js:349 (`N may` is excluded only before "be") and 353 (month-first `may N` has no am/pm guard, unlike the slash pair at 358)
**Found:** 2026-10-13 by /audit independent round 9 (scope: current; lens: quality)
**Why it matters:** Frozen-clock probe (Tue 13 Oct) on the day question: "around 9 may work" → Sun 9 May 2027, and "may 10 am" → Mon 10 May 2027. The stubbed flow then offers "Express — ready Tuesday 11 May". When a weekday or today/tomorrow is also named, the agreement check asks again ("saturday 2 may work", "tomorrow 9 may be ok" are safe). The harm therefore needs an answer to "Which day?" with no day in it. That is unlikely, and the May date is plain to see in the speed list. Recorded as P3.
**Suggested fix:** Treat a written date with no year that is more than about 120 days ahead as unread (null, ask again), or add the same `(?!\s*[ap]\.?m)` guard to the month-first pattern and skip "may" followed by a verb-like word. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 10 candidate). "N may" is 9 May only when nothing but punctuation, a year, a time or at/by/around/in/morning/afternoon/evening/from follows ("9 may", "10 may at 9am" still dates; "around 9 may work" is not). A month-first day followed by am/pm is a time ("may 10 am" is not 10 May). In briefCheck.

Closed 2026-10-13 by /audit independent round 10 (01fdf64). Frozen clock Tue 13 Oct: "around 9 may work", "may 10 am" and "10 may be ok" → no date (null); "9 may", "9 May 2027", "9 may at 10am", "may 10", "may 10th", "sat 1 may" still read as May dates. "saturday, 10 may be better", "I may be free saturday 10am" and "may i book for saturday" → Sat 17 Oct. `MAY_IS_MONTH` is anchored and has no backtracking risk. No new defect found in the repair.

### ready-dates-and-daily-floor-limit/F-80 [P3] closed - After a passed pickup day is asked again, the speed chosen earlier is kept unchecked, and the summary falls back to "Same-day — ready today" for a speed the booking will refuse

**File:** services/bot/booking.flow.js:93-97 (the passed day is dropped, but `bSpeed` is kept), 260 (the speed step is skipped while `bSpeed` is set), 295-298 and services/bot/parsers.js:304-318 (`_describeSpeed` falls back to fixed wording when the chosen row is unavailable)
**Found:** 2026-10-13 by /audit independent round 9 (scope: current; lens: quality)
**Why it matters:** Stubbed probe:
1. "today" said Sat 17 Oct 09:00, with Same Day chosen.
2. "yes" at Sun 00:20: correctly asks for the day again.
3. "today" (now Sunday): the summary reads "Delivery: Same-day (+₦2,000) — ready today", although Ready Today is refused on Sundays.
4. "yes": `postBookOrder` refuses with the client's sentence, and the flow reroutes to the speed step.

So no wrong order is stored. The summary still shows a promise the business won't keep, and the customer only learns at "yes". This needs a chat that crosses midnight. b4e314c behaved the same way (it silently re-read "today" as the new day).
**Suggested fix:** Clear `bSpeed` whenever the pickup day is dropped or changes (the `pickupDay < today` branch, and an unread day), so the speed list is offered again for the new day. Optionally, when the chosen row is not available at the summary, drop `bSpeed` and re-offer instead of using the fixed fallback wording. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 10 candidate). services/bot/booking.flow.js clears `bSpeed` whenever the pickup day is dropped (unread or passed), so the speed is chosen again from the speeds for the new day. In briefCheck; botStaging unchanged (5/9, the booking order is still created).

Closed 2026-10-13 by /audit independent round 10 (01fdf64). Stubbed flow with the clock frozen: "today" + Same Day on Sat 17 Oct 09:00; "yes" at Sun 00:20 asks for the day again with `bSpeed` null; "today" (Sunday) now returns `collect-speed` with "Same Day needs a pickup before 12:00, and isn't available on Sundays" and offers only Express (ready Tue 20 Oct) and Standard (ready Wed 21 Oct). The stale "Same-day — ready today" summary is gone. booking.flow.js:99 only runs inside `if (bDate)`, so a speed is never cleared while a valid day is kept. No new defect found. The briefCheck F-80 check matches source text, not behaviour (see the round-10 receipt).

### ready-dates-and-daily-floor-limit/F-81 [P3] closed - Beside a named weekday, a written date is now read on every turn, so a slash house number ("No 17/4 Allen Avenue, saturday") can become the pickup date

**File:** services/bot/parsers.js:194 (`written || datePhrase`), 368-378 (the `N/M` reader); reached from services/bot/booking.flow.js:78-87 on any step, including the first message
**Found:** 2026-10-13 by /audit independent round 10 (scope: current; lens: quality)
**Why it matters:** Round 7 kept written dates to the day question so that an address is never read as a day (parsers.js:172-174). The F-78 repair lifts that limit whenever a weekday is named. Frozen clock Tue 13 Oct, stubbed flow, no LLM slots (rules-only mode, or an LLM that leaves `pickupDate` empty), first message "book 5 shirts wash and iron saturday, pickup at No 17/4 Allen Avenue": `bDatePhrase` = "saturday 17/4" and `bDay` = Sat 17 Apr 2027, because 17 April 2027 is a Saturday. Every later speed quote counts from April, and "yes" would store that pickupDate. When the slash pair is not on that weekday ("No 12/4 …", "5/7 Adeola Odeku street"), the agreement check returns null and the day is asked again, which is safe. So about 1 in 7 such addresses gives a wrong date. It needs an `N/M` house number with M ≤ 12 next to a weekday, with no LLM date slot, and the April date is plain in the speed list. Recorded as P3. With an LLM, `slots.pickupDate` ("saturday") takes precedence (booking.flow.js:79).
**Suggested fix:** Off the day question, read only the weekday-adjacent forms that cannot be an address (an ordinal or a month name: "saturday 24th", "saturday 24 oct"), and keep the `N/M` reader for the day question; or drop a written date more than ~60 days ahead when it only came from a non-day turn. Nothing current is lost.
**Resolution:**
Fixed 2026-10-13 (round 11 candidate). Away from the day question, `_parseDateTimeFromText` reads only a day-of-month or a month name beside a weekday, never a slash pair (`_writtenPickupDate(..., { slash: false })`): "book 5 shirts … saturday, pickup at No 17/4 Allen Avenue" keeps the coming Saturday, and the summary shows that date. In briefCheck.

Closed 2026-10-13 by /audit independent round 11 (f30c3d3). Frozen clock Tue 13 Oct: off the day question "book 5 shirts wash and iron saturday, pickup at No 17/4 Allen Avenue", "saturday, no 17/4 allen avenue" and "saturday 24/10" keep Sat 17 Oct (no slash pair is read); "20/10" off the day question is not a day. On the day question "saturday 17/10", "saturday 24/10", "20/10" and "1/11" still resolve correctly, and "saturday 10/11 am" stays a time range. `_resolvePickupDate` re-reads only the stored phrase, which no longer holds the slash text, so the pair cannot return on a later turn. The repair added no new slash defect; the new bare-number reading has its own address edge case, logged as F-83 [P3].

## Independent review

**Status:** passed
**Target commit:** f30c3d3f24b756df7aa80aae1364470a2c5b090d
**Base commit:** b6bdb3057579fd520caa8c65f8270eda6050cd56
**Base ref:** origin/main
**Spec hash:** 31c19108c02c39c493a9ce14e98e217783da628f94dc7e5efe39b5701f6e5daf
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** runtime default (exact model not known until reviewer starts)
**Requested execution:** automatic
**Requested at:** 2026-10-13T16:45:00Z
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-10-13T16:56:15Z
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

## Handoff

Review the active spec and the complete `b6bdb30..f30c3d3` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

Round 11 (launch item 3). Round 10 (`01fdf64`) closed F-79 and F-80, reopened F-78 [P2] and found F-81
[P3]. `f30c3d3` fixes both (spec step 16), and the booking summary now shows the pickup DATE read
instead of the customer's words, as a safeguard for misread days. Verify F-78 and F-81 and move them to
`closed`, or reopen them. New findings start at F-82. Behaviour already on the base commit that this
item didn't touch is risk, not a blocking defect. F-06, F-08, F-47 and F-55 belong to other items.
origin/main has moved past the merge base with four commits (e2a72af, a1a4039, d0f3cc0, 41d4683 =
item 5); they are not part of this work item.

## Commands

- `git rev-parse HEAD` / `git merge-base HEAD origin/main` / `git status --porcelain` / `sha256sum blueprint/context/current-feature.md`: pass (f30c3d3…, b6bdb30…, only review.md dirty, spec 31c19108…)
- `git diff b6bdb30..f30c3d3` (full delta, 26 files) and `git diff 01fdf64..f30c3d3` (this round): pass (reviewed)
- `node briefCheck.js`: pass (516 passed, 0 failed)
- Swagger envelope check from AGENTS.md: pass (wrong envelopes: 0)
- Module-load check (parsers, booking.flow, util/bookingWindow, bookingWindow.service, bookOrder.service, botOrchestrator.service): pass (no DB connection)
- Offline frozen-clock day-answer probe of `_parseDateTimeFromText` → `_resolvePickupDate` (TZ=Africa/Lagos, clocks Tue 13 / Sat 17 / Fri 30 Oct 2026, scratch dir): pass (116 answers; 0 wrong on every F-78/F-81 shape; residual mis-reads logged as F-82/F-83 [P3])
- Offline stubbed `bookingFlow` probe (models, savedDefaults and speedOptionsFor stubbed in memory; no DB): pass (summary shows the resolved date)
- Offline two-direction probe of the `util/bookingWindow.js` pickup-time reader via `pickupInstant` + `readyTodayAllowed`: pass (50 phrases, 0 wrong)

## Evidence

- F-78 closed: "saturday 24", "friday 23", "saturday, 24", "saturday 24 by 10am", "saturday 24, 9am", "wednesday 21", "saturday 31", "Saturday 24th", "saturday next week" → the meant date; "this saturday, not next week" → Sat 17 Oct; "not this saturday, next week" → Sat 24; month end "friday 13" / "saturday 14" → 13/14 Nov; disagreeing pairs ("saturday 14", "saturday 25") re-ask.
- F-81 closed: off the day question "… saturday, pickup at No 17/4 Allen Avenue" and "saturday 24/10" keep Sat 17 Oct; on the day question slash dates still read and "saturday 10/11 am" stays a time range.
- Stubbed flow, Tue 13 Oct: "saturday 24" → `bDay` 2026-10-24, summary "Saturday 24 October … Standard — ready Wednesday 28 October, by 7:00 PM"; "saturday 24 10am" → summary "Saturday 17 October 10am" (visible mis-read, F-82); "saturday 24, allen avenue" → "Saturday 24 October" (F-83); "saturday 14" → re-ask echoing "saturday saturday 14" (F-84). Confirm places only with `pickupDay`, and the summary, the speed rows and `_placeBooking` all use the same `pickupDay`.
- Pickup-time reader: 20 morning phrases allowed Ready Today and 30 late/unreadable phrases refused, including "8-10pm", "9:00:00 pm", "8.30pm", "12am", "00:30", "9-10 at 15:00", "not before noon".
- Full delta re-read for security/performance: booking-options speeds stay behind the existing customer auth and are non-fatal; `getFloorUsage` is one bounded aggregate over 130 days on the indexed `floorAllocation.date`; no new trust boundary, secret or DB write path in this round (parsers.js and booking.flow.js copy only).

## Findings

- F-78 [P2] closed (re-verified against f30c3d3)
- F-81 [P3] closed (re-verified against f30c3d3)
- F-82 [P3] open (new): "saturday 24 10am" / "saturday 24 noon" etc. still resolve to the coming weekday; base behaviour, shown at confirm
- F-83 [P3] open (new): off the day question "saturday 24, Allen Avenue" can read the house number as the date; shown at confirm
- F-84 [P3] open (new): the re-ask echoes the weekday twice ("saturday saturday 14")
- No P0/P1 open or fixed; no new P2. F-06, F-08, F-47, F-55 belong to other items and were not touched.

## Remaining risk

- No test runner exists (`npm test` is a placeholder): the tests lens relies on briefCheck, and its round-10 summary check matches source text rather than behaviour (same pattern as F-06/F-08).
- Staging scripts (readyDateStaging, botStaging and the booking staging suite) were not run in this review (no DB allowed); the DB-backed floor usage, refusals and placement rely on the builder's recorded runs.
- A customer who spots a wrong date at confirm can only say "no" and start over: a date given at the confirm step does not replace the kept `bDatePhrase` (`if (!bDate)`, booking.flow.js:79). This is behaviour from before this item, but the new date-in-summary safeguard depends on it.
- "next saturday" and a same-weekday answer ("friday" on a Friday) resolve to the coming/next occurrence as before; the summary now shows which date was read.
- Literal "am" pickup times are taken as written (risk, not a defect, per the request).
