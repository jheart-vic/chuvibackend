# V1 launch plan — client reply of 15 Oct 2026 ("Everything by Saturday, in 3 batches")

Source: client PDF `CHUVI_V1_Everything_by_Saturday.pdf` (Downloads), their answer to our
V1 System Report (`report/CHUVI-V1-System-Report-2026-10-14.pdf`). Binding.

## Schedule
- Thu 15 to Sat 17 Oct: we build. **Saturday night is the hard deadline.**
- **Sun 18, 12:30 PM:** client floor test at Agulu. **Clear the data on Sunday night after their test**
  (keep staff, price list, settings, customers with zero balances; delete orders, holds, wallet balances,
  reward credit, test offers, chats, test plans/subscriptions, rep links on test sign-ups — B41).
- Mon 19: client configures and runs a final check. Tue 20: live use starts.
- Work top down; the frontend builds each screen as an item lands.

## Rules for the weekend
- Run T1 to T12 digitally by **Sunday 10 AM**; send screen recordings of anything that fails.
- Anything that fails the Sunday test stays out of launch (switched off or rolled back).
- Batch 3 updates in launch week go live **after 7 PM** and **never wipe data**.
- Send a short progress line **every evening at 7 PM**.

## Confirmations (binding)
No cash: confirmed. Only admin cancels: confirmed. New ready date when the count is more than twice the
booking: confirmed. Express and Ready Today at N0: intended. Urgent will cost more than a window (client
sets it in admin). Prospect tag: answered by our H2.

## Settings the client fixes on Monday (not our work)
Remove Drffg. First Experience with one minimum (N4,000). Customer experience limits N5,000. A "Damaged"
hold type, admin only. Plans, windows, Always Free and prices from their configuration sheet.

## User decisions (15 Oct)
1. Batch 2 by Saturday is best effort; fine.
2. One phone, one account: **follow the client** (reverses our 13 Oct "shared phones allowed").
3. Lead report origin marker: fine (new leads marked from now; old data is cleared Sunday).
4. The assistant items (no price estimate, "talk to someone" opens a complaint) and reward credit on by
   default at Pay → **added to Batch 2**.

## Status board

| # | Item | BE/FE | Status |
|---|---|---|---|
| **Batch 1 — must be in** | | | |
| 1a | Change Items refused before pickup is confirmed | BE+FE | DONE 15 Oct (b1) |
| 1b | Change Items refused on plan orders (admin settles them by hand) | BE+FE | DONE 15 Oct (b1) |
| 1c | No rider customer-phone check (start, picked up, delivered, failed) | BE+FE | DONE 15 Oct (b1) |
| 1d | A reason on every rejection and hold | BE+FE | DONE 15 Oct (b1) |
| 1e | No Ready Today on Quick Booking | BE+FE | DONE 15 Oct (b1) |
| 1f | Payment holds never Overdue | BE | DONE 15 Oct (b1) |
| 1g | SMS cleanup: N not ₦, no dashes (central, in util/sendSms.js) | BE | DONE 15 Oct (b1) |
| 2 | No cash at the counter; POS default; S1 enters the POS receipt number | BE+FE | DONE 15 Oct (b1) |
| 3 | Rep tracking report: per rep link, who signed up, who paid, how much | BE+FE | DONE 15 Oct (b1) |
| 4 | Lead report counts only leads entered by staff | BE | DONE 15 Oct (b1) |
| 5 | SMS texts below (4 new + rewordings) | BE | DONE 15 Oct (b1) |
| 6 | Sign-up phone check: real Nigerian mobile only | BE(+FE msg) | DONE 15 Oct (b1) |
| 7 | One phone one account; refuse used phone/email; admin sees attempts with the referral code | BE+FE | DONE 15 Oct (b1) |
| 8 | Google as main sign-up button; Quick Booking as main booking | FE only | — |
| **Batch 2 — very important, by Saturday** | | | |
| 9 | Recount cover (10% + naira amount, settings), mismatch record + limit (3 in 60 days, no cover after), Change Items keeps old and new items | BE+FE | DONE 16 Oct (b2) |
| 10 | Only admin cancels; S1 escalates; N2,000 trips by payment link; return only after paid; "Returned unwashed" | BE+FE | DONE 16 Oct (b2) |
| 11 | Quick Booking pay-by time, expired link note, new ready date when paid late or count > 2× booking | BE | DONE 16 Oct (b2) |
| 12 | Unpaid bills as settings: reminders 3 h + 9 AM next day; customer care tasks 24 h + 72 h; admin flag 7 days | BE+FE | DONE 16 Oct (b2) |
| 13 | Riders: failed pickup → Needs rider + failure count; 2 failures → call task; failed delivery → "Ready, waiting redelivery" + SMS, first redelivery free then a fee; "Collected"; "Possible missing item" alert | BE+FE | DONE 16 Oct (b2) |
| 14 | Quiet hours 9 PM–7 AM for SMS and feedback (queued to 7 AM) | BE+FE | DONE 16 Oct (b2) |
| 14a | Assistant: no price estimate (point to Book), no payment in chat; "talk to someone" opens a complaint | BE | DONE 16 Oct (b2) |
| 14b | Reward credit on by default at Pay, switch to turn it off | BE+FE | DONE 16 Oct (b2) |
| **Batch 3 — launch week, after 7 PM** | | | |
| 15 | S2 receipt: hold one piece ("Something is missing"), receive the rest; S1 sends one fixed piece | BE+FE | built, switch s2PartialReceipt (off) |
| 16 | S2 corrects S1's colour and stain tags (White, Light, Dark) | BE+FE | done b3a |
| 17 | Routes enforced by service; second rejection of a piece → admin; missing-piece message names tag and place | BE |  b3a: 2nd rejection + message; routes built, switch routesByService (off) |
| 18 | Iron Only dirty piece: suggestion to S1, per-piece service change, payment link, cancelled after 3 h unpaid, pressed as booked | BE+FE | built, switch ironOnlyUpgrade (off) |
| 19 | Damage: "Customer informed" before admin can release; partial delivery approval | BE+FE | built, switch damageCase (off) |
| 20 | Window prices per window + an Urgent price; 3 PM check of orders due today not at QC | BE+FE | done b3a |
| **Also** | | | |
| X1 | Run T1–T12 digitally by Sun 10 AM | BE+FE | |
| X2 | Data-clear script, dry run on testingdb, run Sun night | BE | |
| X3 | 7 PM progress line daily | — | |

## Client reply, 15 Oct night — Batch 3 part 2 switches + final-check report (BINDING)
Agrees: final check now, then part 2 behind switches that stay off.
1. **One switch per part, not one for all:** (a) S2 holds one piece at receipt, (b) routes by service,
   (c) Iron Only per-piece upgrade, (d) damage case with "Customer informed". A part that fails stays off alone.
2. Say what happens to an order **in the middle of the floor** when a switch is turned on or off. No order
   may get stuck or lose a piece.
3. Part 2 ready by **Sat 12 noon** → floor test Sun with the switches on. Passes are switched on for Tuesday;
   fails stay off (paper way until fixed).
Final-check report wanted: (a) one line per Batch 1, 2 and 3-part-1 item: tested how + result; (b) live
read-only smoke test: what was checked, nothing changed; (c) Batch 2 "Change Items history" and "Possible
missing item" alert: done or not; (d) written Sunday clear plan with admin Ijeomahikechukwup@gmail.com.
**Code freeze: Saturday 9 PM.**

## Client answers, 15 Oct night — holds, rider cards, recovery credit, word list (BINDING, verbatim)
1. HOLDS. Your recommendation is right.
Admin only: count disputes, "Possible missing item", damage (only after customer care taps "Customer informed"), and a piece rejected twice.
Payment holds: they clear when paid. S1 can record a POS or transfer payment with its reference. Admin can waive with a reason.
Every other hold: the station it is assigned to, with a note. Admin can release any hold.

2. RIDER CARDS. Yes, with two small changes.
Show a red "Urgent pickup" or "Urgent delivery" badge when the timing is Urgent, and put those jobs at the top.
Show the speed on pickups and on deliveries, using the speed's display name from admin settings (for example "Ready in 24 hours"), not the word Express.
Both show when both apply.

3. CLOSING A COMPLAINT WITH A DISCOUNT. Yes.
Customer care gives recovery credit for the next order, never money off an unpaid bill.
Most per case: N5,000. Above that, it goes to admin to approve.
The credit lasts 90 days.
One SMS: "{firstName}, we are sorry about your order {orderCode}. We have added N{amount} credit to your CHUVI wallet for your next order. It is valid for 90 days."

4. WORD LISTS.
a. Staff screens and history lines, please use these everywhere:
Stations: Intake and Tag, Sort and Pretreat, Wash and Dry, Press, Quality Check and Pack, Rider, Customer Care, Admin.
Statuses: Booked, Needs rider, Rider on the way, Picked up, Waiting for payment, At Intake, Sorting, Washing, Pressing, Quality check, Ready, Out for delivery, Ready waiting redelivery, Delivered, Collected, Returned unwashed, Cancelled.
Hold words: On hold, Waiting for admin, Customer informed.
Buttons: Start pickup, Picked up, Customer not available, Send to (next station), Receive all, Report problem, Fixed send again, Mark ready, Assign rider, Out for delivery, Delivered, Customer collected, Escalate for cancellation, Send payment link, Check payment.
History lines: "[time] [station]: [what happened] by [staff name]". Example: "10:42 Intake and Tag: 6 pieces counted by Chioma".
Same words everywhere: "Care level" (never tier), "Urgent" (never Anytime), "Holds", and speeds by their display names.
b. The "includes" lines under items: after launch.
Saturday 12 noon for all screens and the switches.

## Client, 15 Oct night — hold release FINAL (supersedes "the station that raised it releases it")
"Keep it as today. Your way is right. The station the hold is assigned to (the one that fixes it) releases it with
'Fixed, send again' and a note. The station that raised it sees 'Monitoring' and must accept the piece again when it
comes back, so it keeps the final word. When a station holds a piece for its own reason, it releases it itself. A
second rejection of the same piece goes to admin only. Admin only: count disputes, 'Possible missing item', and damage
(after customer care taps 'Customer informed'). Admin can release any hold."

## Client, 16 Oct — part 2 next steps + how the after-launch brief is built (BINDING)
1. All four switches stay OFF until Sunday; turned on for the 12:30 floor test. Anything that fails stays off for
   Tuesday and moves into the after-launch brief as a fix.
2. "A few small checks from today" coming later today: finish before the code freeze, Saturday 9 PM.
3. FE builds part 2 screens + the Switches page by Saturday 12 noon.
4. After-launch brief tonight: quote EACH part with price and number of days.
5. Nothing in the brief touches live before launch. Launch Tue, watch Tue + Wed, client gives the go Wed night.
6. Asked: do we have a TEST SITE? If yes, build the brief there from Thu 22, test data only (Paystack test keys, no
   SMS to real customers).
7. When it passes on the test site, plan the move to live together: after 7 PM or on a Monday, never wiping data,
   behind a switch where possible.

## Client, 16 Oct — launch checks (DONE fix/v1-launch-checks) + TEST SITE: YES (BINDING)
Checks: (1) Iron Only SMS now the client's verbatim texts (payment link, pressed as booked); no other new SMS in
part 2. (2) Photos of damaged/dirty pieces: nothing before launch (WhatsApp from the office phone; after-launch brief).
(3a) Google sign-up keeps the rep's referral code (googleSignup + completeProfile) — confirmed. (3b) Rep report now
lists each paid order (osc, paid date, amount), `week=` one week at a time — BUILT. (3c) Serial: Sunday clear → 0;
Monday's N100 test takes 001; after it is cancelled run `resetOrderSerial.js` (RESET_LIVE="RESET CHUVI SERIAL",
refuses while any order is not cancelled) → Tuesday's first order OSC-20261020-001.
TEST SITE (client yes): set up WEDNESDAY 21, ready Thursday 22; until Sat 9 PM all time goes to launch. Nothing on
live changes. Tell the client the MONTHLY PRICE before paying; need not be always on (pay for always-on only if it
slows work). Own address (e.g. test.chuvilaundry.com), "TEST SITE" banner on every page, hidden from Google, staff
login only. Copy settings from live AFTER Monday's configuration (items, prices, offers, plans, windows), dummy
customers only, no real customer data. Paystack test keys; webhooks to the test server only. Same CHUVI hosting
account as live. Sunday floor test on live as planned; data clear Sunday night after the client's go.

## SMS texts (client, verbatim — words in braces are placeholders; N, no dashes)

- **Booking received:** Hi {firstName}, we have your CHUVI booking {orderCode}. Our rider comes {window}. Questions? Call or WhatsApp 07073254943.
- **Bill and link (Quick Booking):** {firstName}, your CHUVI bill is N{amount} for {pieces} pieces plus pickup and delivery. Pay by {payBy} to keep your ready date of {readyBy}: {link} If this link has expired, open the CHUVI app, go to Orders and tap Pay.
- **Payment link after recount:** {firstName}, we counted {pieces} pieces in your bag, so N{toPay} is left to pay: {link} We start washing once it is paid.
- **Payment reminder:** {firstName}, your CHUVI order is waiting for payment of N{amount}. Pay by {payBy} to keep your ready date: {link}
- **Rider count differs:** {firstName}, our rider collected {pieces} pieces. Reply or call 07073254943 if this is wrong.
- **Wallet refund:** {firstName}, we counted fewer pieces than you booked, so N{amount} is back in your CHUVI wallet for your next order.
- **Ready (delivery):** {firstName}, your CHUVI order {orderCode} is ready. We deliver {window}. Questions? Call or WhatsApp 07073254943.
- **Ready (collection):** {firstName}, your CHUVI order {orderCode} is ready. Collect it at our Agulu office before 7 PM, Tuesday to Sunday (Sunday from 12:30 PM).
- **Delivered:** {firstName}, your CHUVI order {orderCode} has been delivered. Thank you for choosing CHUVI. Anything not right? Call or WhatsApp 07073254943.
- **Customer not available:** {firstName}, our rider came for your CHUVI {pickupOrDelivery} but could not reach you. Reply or call 07073254943 to pick a new time.

## The three small additions to Batch 1 (verbatim)
1. Phone number check at sign up: accept only a real Nigerian mobile number (11 digits starting 070, 080,
   081, 090 or 091, or the same number with +234). Refuse anything else with a clear message.
2. Duplicates: one phone number, one account, the same as email. Refuse a phone number or email already in
   use, and show admin the attempt with the referral code that was used. Make "Sign up with Google" the main
   button so emails are real.
3. Quick Booking first: make Quick Booking the main way to book on the booking screen. Item by item booking
   stays as the second option for people who have time.

## Frontend update, 15 Oct (received during Batch 1) — to answer / fold in

Built on their side: booking-options speeds (pickupTiming/pickupWindowId/pickupDate), booking-context
(asks us to CONFIRM it is meant to be live — it is, launch item 1), Urgent fields, complete-profile with
termsAccepted/referralCode, rollover fields, floorLimits in admin order settings.

They ask:
- FE1 [coded b2] `lastOrderChoices` should include `billingType` (wallet / card memory).
- FE2 Test accounts with a cancelled-but-paid plan and with a failed renewal (testingdb).
- FE3 canEnterReferralCode / welcomeOffer.active false on a test customer with orders — expected; they need a fresh account (email code unreadable).
- FE4 One real Google sign-up with a rep link, end to end.
Still open from before (backend bugs):
- FE5 [coded b2] Delivered order's cancellationVerdict.tier is red, not none.
- FE6 [coded b2] Assigning a pickup rider to an already collected order returns 200 and resets pickup status.
- FE7 [already in code] GET /rider/assigned-deliveries has no delivery date or promise.
- FE8 [already in code] GET /press-iron/orders/queue still returns started orders.
- FE9 [coded b2] hasComplaint false in the low-rated list for an order with a complaint.
- FE10 [coded b2] Held pieces don't appear in the Hold lists of the station they are assigned to.
- FE11 Phone backfill: 5 CRM profiles with unparseable numbers, 12 with none (data; cleared Sunday anyway?).
For the 14 Oct client brief they need: B1/B2 (orders failing to load; white screen after Paystack),
F5 (QB unpaid order: bill breakdown fields, pay-by time, Pay endpoint with a fresh link), Update 5
(per-window price + Urgent price field names = Batch 3 item 20), Update 4 (72 h task setting = item 12),
Update 7 / Q8 (staff-only lead report = item 4 done; Prospect tag answer = our H2), F17/F19/F23/F26/F28/F40.

## The 14 Oct back-end brief (B1–B42) — NOT received; reconstructed from the test plan's references
B1 orders failing to load / errors never blank (FE) · B2 payment start, white screen after Paystack (FE) ·
B3 QB booking saved (W&I, count, window, speed, booking SMS) · B4 one status, route-only history · B5 QB bill ·
B6 walk-in Ready Today limit · B9 payment holds + timers · B11 speeds/names/prices/no RT on QB · B13 credit on by
default + reason lines · B14 totals add up · B15 rule 0 = no rule, Always Free · B16 assistant rules · B17 no rider
phone check · B20 Ready at pack + SMS, delivery card count, rider log, Collected · B22 piece records, colour ·
B23 whole-order send, Drafts · B27 pretreat per piece · B28 sent time / red at 30 min · B33 hold counts ·
B34 3 PM due-today · B35 piece positions · B36 counters match lists · B37 names not codes · B38 complaint on
"talk to someone", low score list · B39 feedback timing/quiet hours · B40 settings/templates · B41 data clear ·
B42 Paystack live check. Unknown (never cited): B7 B8 B10 B12 B18 B19 B21 B24–B26 B29–B32.
User 15 Oct: treat B1/B2 as the frontend described them.

## Agreed order of work after Batch 2 (user, 15 Oct evening) — follow this
1. Independent review of Batch 1 + 2 (running in the background) while the DATA-CLEAR script is written
   and dry-run on testingdb (keep staff, price list, settings, customers with zero balances; delete orders,
   holds, wallet balances, reward credit, test offers, chats, test plans/subscriptions, rep links on test
   sign-ups — B41). Run for real on Sunday night after the client's test, with the user's go-ahead.
2. [DONE 15 Oct, fix/v1-batch-3a] Batch 3 LOW-RISK half → build, test, push before tomorrow's general test:
   item 20 per-window prices + Urgent price; item 20 3 PM due-today check; item 16 S2 corrects colour/stain
   tags (White, Light, Dark); item 17 second rejection of a piece → admin; item 17 missing-piece message
   names the tag and station.
3. Fix the review findings → test main → push.
4. Final check: briefCheck + all staging suites on main + a live smoke test (read-only; staging scripts
   refuse laundrydb by design). The client's general test tomorrow is the real live check.
5. [BUILT 16 Oct, fix/v1-batch-3-part2, four switches all off] Batch 3 CORE half behind an admin switch, OFF by default (turn on only after it passes): item 17 routes
   enforced per piece + item 18 per-piece service change / Iron Only "looks dirty"; item 15 S2 holds one
   piece and receives the rest; item 19 damage "Customer informed" gate + partial delivery.
6. Tomorrow: fix whatever the frontend/client general test finds.

## SUNDAY DATA CLEAR — client instructions (15 Oct, via FE) — SUPERSEDE B41
Verbatim: "Please send me the plan in writing first. Run it only after I say 'go' on Sunday evening, after our
floor test. Before you start: take a full backup of the database. CLEAR EVERYTHING that is test data: all
customers, staff and rep accounts, orders, payments, holds, wallets and credit, subscriptions, referral codes and
records, leads and CRM message queues, complaints, feedback, notifications and the reports built from them. KEEP
ONLY: my own admin login, and the settings (items and prices, offers, plans, windows, hold types, display names,
limits, message templates). I will correct the settings myself on Monday and create the real staff and rep
accounts. MY TEST PLAN: cancel the Student Plan subscription on my own card at Paystack, so it is never charged
again. ORDER NUMBERS: start the order serials fresh, so the first real order is 001. PAYSTACK: after the clear,
switch to the live keys so I can make a N100 live payment on Monday."
- Written plan for the client: `blueprint/context/SUNDAY-DATA-CLEAR-PLAN.md` (questions: which admin login —
  only admin@chuvi.com exists, with the DEFAULT password; order number format OSC-001?; expenses/supplies?).
- To build: backup script (no mongodump here → export collections as EJSON to a folder OUTSIDE the repo);
  clearTestData.js rework (delete ALL users except the client's admin, CRM too); Paystack disable of test
  subscriptions; sequential order serial (counter) reset to 0; live-keys switch is a Render env change (user).
- SECURITY found 15 Oct: anyone could self-register as admin (fixed: inactive until activated); the public
  seed route made admin@chuvi.com / Admin@1234 (closed); THE LIVE ADMIN STILL USES Admin@1234 — user to change.
- CLIENT ANSWERS (15 Oct, verbatim): "1. Admin email: please make Ijeomahikechukwup@gmail.com the admin. Only I
  will have the password. 2. Order number: please keep the format we already use, OSC, then the date, then the
  serial. The first real order should read OSC-20261020-001. Please don't add CHVI. 3. Expenses and supplies:
  clear them, they are test entries. We will not use the supplies screens at launch. Weekly costs will go into
  the reporting feature's cost form when it is built."
  → keep ONLY that admin (we never know its password: they set it with Forgot password); delete admin@chuvi.com;
    order number OSC-<YYYYMMDD of the order>-<running serial, 3 digits, never resets> starting 001; clear
    expenses and supplies.
