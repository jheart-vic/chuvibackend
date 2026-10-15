**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |**DONE 15 Oct** (fix/v1-batch-1) |# V1 launch plan — client reply of 15 Oct 2026 ("Everything by Saturday, in 3 batches")

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
| 1a | Change Items refused before pickup is confirmed | BE+FE | |
| 1b | Change Items refused on plan orders (admin settles them by hand) | BE+FE | |
| 1c | No rider customer-phone check (start, picked up, delivered, failed) | BE+FE | |
| 1d | A reason on every rejection and hold | BE+FE | |
| 1e | No Ready Today on Quick Booking | BE+FE | |
| 1f | Payment holds never Overdue | BE | |
| 1g | SMS cleanup: N not ₦, no dashes (central, in util/sendSms.js) | BE | |
| 2 | No cash at the counter; POS default; S1 enters the POS receipt number | BE+FE | |
| 3 | Rep tracking report: per rep link, who signed up, who paid, how much | BE+FE | |
| 4 | Lead report counts only leads entered by staff | BE | |
| 5 | SMS texts below (4 new + rewordings) | BE | |
| 6 | Sign-up phone check: real Nigerian mobile only | BE(+FE msg) | |
| 7 | One phone one account; refuse used phone/email; admin sees attempts with the referral code | BE+FE | |
| 8 | Google as main sign-up button; Quick Booking as main booking | FE only | — |
| **Batch 2 — very important, by Saturday** | | | |
| 9 | Recount cover (10% + naira amount, settings), mismatch record + limit (3 in 60 days, no cover after), Change Items keeps old and new items | BE+FE | |
| 10 | Only admin cancels; S1 escalates; N2,000 trips by payment link; return only after paid; "Returned unwashed" | BE+FE | |
| 11 | Quick Booking pay-by time, expired link note, new ready date when paid late or count > 2× booking | BE | |
| 12 | Unpaid bills as settings: reminders 3 h + 9 AM next day; customer care tasks 24 h + 72 h; admin flag 7 days | BE+FE | |
| 13 | Riders: failed pickup → Needs rider + failure count; 2 failures → call task; failed delivery → "Ready, waiting redelivery" + SMS, first redelivery free then a fee; "Collected"; "Possible missing item" alert | BE+FE | |
| 14 | Quiet hours 9 PM–7 AM for SMS and feedback (queued to 7 AM) | BE+FE | |
| 14a | Assistant: no price estimate (point to Book), no payment in chat; "talk to someone" opens a complaint | BE | |
| 14b | Reward credit on by default at Pay, switch to turn it off | BE+FE | |
| **Batch 3 — launch week, after 7 PM** | | | |
| 15 | S2 receipt: hold one piece ("Something is missing"), receive the rest; S1 sends one fixed piece | BE+FE | |
| 16 | S2 corrects S1's colour and stain tags (White, Light, Dark) | BE+FE | |
| 17 | Routes enforced by service; second rejection of a piece → admin; missing-piece message names tag and place | BE | |
| 18 | Iron Only dirty piece: suggestion to S1, per-piece service change, payment link, cancelled after 3 h unpaid, pressed as booked | BE+FE | |
| 19 | Damage: "Customer informed" before admin can release; partial delivery approval | BE+FE | |
| 20 | Window prices per window + an Urgent price; 3 PM check of orders due today not at QC | BE+FE | |
| **Also** | | | |
| X1 | Run T1–T12 digitally by Sun 10 AM | BE+FE | |
| X2 | Data-clear script, dry run on testingdb, run Sun night | BE | |
| X3 | 7 PM progress line daily | — | |

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
- FE1 `lastOrderChoices` should include `billingType` (wallet / card memory).
- FE2 Test accounts with a cancelled-but-paid plan and with a failed renewal (testingdb).
- FE3 canEnterReferralCode / welcomeOffer.active false on a test customer with orders — expected; they need a fresh account (email code unreadable).
- FE4 One real Google sign-up with a rep link, end to end.
Still open from before (backend bugs):
- FE5 Delivered order's cancellationVerdict.tier is red, not none.
- FE6 Assigning a pickup rider to an already collected order returns 200 and resets pickup status.
- FE7 GET /rider/assigned-deliveries has no delivery date or promise.
- FE8 GET /press-iron/orders/queue still returns started orders.
- FE9 hasComplaint false in the low-rated list for an order with a complaint.
- FE10 Held pieces don't appear in the Hold lists of the station they are assigned to.
- FE11 Phone backfill: 5 CRM profiles with unparseable numbers, 12 with none (data; cleared Sunday anyway?).
For the 14 Oct client brief they need: B1/B2 (orders failing to load; white screen after Paystack),
F5 (QB unpaid order: bill breakdown fields, pay-by time, Pay endpoint with a fresh link), Update 5
(per-window price + Urgent price field names = Batch 3 item 20), Update 4 (72 h task setting = item 12),
Update 7 / Q8 (staff-only lead report = item 4 done; Prospect tag answer = our H2), F17/F19/F23/F26/F28/F40.
