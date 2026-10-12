# Launch fixes — client testing round, 11 Oct 2026

The client started testing the customer app and sent 15 corrections. The frontend built
their parts and listed ours. **All of this must ship BEFORE subscription rollover (build
plan item 21), which must be live before the first renewals in early November 2026.**

These are corrections, so each work item goes through `/fix` (archived under
`blueprint/history/fixes/`), not the build plan.

## Status board (update as items land)

| # | Work item | Client items | Est. days | Status |
|---|---|---|---|---|
| 1 | Booking screen data + window-only free rule | 10, 11, 12, 14, 15 + FE labels | 2 | **DONE 2026-10-11** — archive `blueprint/history/fixes/booking-screen-data-and-window-only-free-rule.md`, review PASSED (2nd round; F-09..F-15 found and closed). Branch `fix/booking-screen-data-and-window-only-free-rule`, lands as a PR after the 3 earlier stacked fix PRs. Also fixed a LIVE bug: `OFFER_TRIGGER` not imported in offer.service.js since 620cca4. F-16 [P3] (window-only line wording) left open. |
| 2 | Quick Booking: nothing paid at booking | 3 | 1 | **DONE 2026-10-12** — archive `blueprint/history/fixes/quick-booking-nothing-paid-at-booking.md`, review PASSED (round 10). Branch `fix/quick-booking-nothing-paid-at-booking`, lands as a PR after the S1 PR; conflicts with the booking hotfix (dced480) in `bookOrder.service.js` — keep this branch's version. Grew well past client item 3: it also closes holes still live on `main` until it merges (F-38 re-used Paystack reference activates a plan, F-45 free `subscribe-plan`, F-49 every `charge.failed` returns 500, hotfix F-28 plan-items race). FE notes: FE-CHANGELOG-2026-10-11 §3. Open: F-47 [P3] (→ item 9). Client to confirm: plans count pieces; F-20 (offer honoured at re-price after expiry); 200-piece cap. |
| 3 | Ready date (Sun ½, Mon 0, from the day after pickup, ready by 19:00) + Ready Today rule (pickup before 12:00, not Sunday) + Anytime per date **+ 3b daily floor limit** (+ set items on plans, 200-piece message) | 1, 2, 9 + item-2 answers | 2 → **3.5–4** | Ready to spec (Q1 and 3b answered 12 Oct; one small question open: an order larger than a day's whole limit) |
| 4 | Anytime agreed parts (Intake alert, top of list, all-windows-full → Urgent at window price + offer kept + next open day, "Urgent opens at") | 13 | 1.5–2 | Ready to spec (Q2 answered) |
| 5 | Google sign-up: terms, referral code, phone normalisation | 5 | 1 | Not started |
| 6 | Follow-up messages: registration welcome by SMS + in-app (editable CRM template, first name + offer end day) + **schedule save bug** | 4 | 0.5 | Ready to spec (Q3 answered) |
| 7 | Written explanations for 1 and 7a–7p | 1, 7 | 1 | Not started |
| 8 | Clear test data, keep settings | 8 | 0.5 | Run LAST, at the client's time (likely Thursday night) |
| 9 | Subscription rollover | build plan 21 | 3.5–4.5 | After 1–8. Rules in memory `chuvi-subscription-rollover` |

Total for 1–8 ≈ 9–10 days. Item 6 needs no frontend work (FE already built the settings
group, schedule card and the per-customer Scheduled Follow-ups tab).

## Questions sent to the client — ANSWERED 2026-10-11 (binding)

1. **Does the pickup day itself count?** → **Yes, start the day AFTER pickup, even for a
   morning pickup** (Express picked up Sunday morning → ready Tuesday). **Ready by 7:00 PM on
   the day the count is reached**, even if reached at midday.
   **Exception — Ready Today (the speed stored as `same-day`, renamed on screen):** counts the
   pickup day itself; **only offered when the pickup is before 12 noon, and never on Sundays**
   (half day). ⚠️ Today same-day is gated by BOOKING before 10am — this replaces that gate with
   PICKUP before 12:00 and no Sundays.
2. **All windows full** → **Yes.** When every window on the chosen day is full, show **Urgent at
   the WINDOW price with the offer kept**, AND show the **next day with an open window**. Example
   text: "Today's windows are full. Book Urgent at the window price, ₦500, and keep your offer. Or
   pick another day." **Only during Urgent hours; outside them, show the next open window.**
3. **Registration welcome** → **SMS + in-app notification** (the email stays as it is). The SMS
   text goes in the CRM templates, editable, with placeholders for **first name** and **the day
   the offer ends**.

Status board effect: items 3, 4 and 6 are no longer waiting on the client.

## Item 2 follow-up questions — ANSWERED 2026-10-12 (binding)

Verbatim:

> 1. Yes. Plan items count pieces. A line of 3 shirts uses 3 plan items. Heavy and set items
>    (duvets, suits and the like) are still not covered by plans.
> 2. Yes. If the offer was valid when they booked, honour it, even if it expires before we
>    count. The minimum amount is still checked on the counted bill. If the booking is
>    cancelled, the offer goes with it, and a new booking made after the offer ends does not
>    get it.
> 3. 200 is enough for one booking. Above 200, show: "For more than 200 pieces, call or
>    WhatsApp us on +234 707 325 4943 and we will plan it with you." Also, please confirm
>    that a large order pushes the ready date out when the floor is full, instead of
>    promising the normal time.

Checked against item 2's code (2026-10-12):

1. Pieces: matches. Heavy items are refused on a plan, including heavy set pieces.
   **Gap:** a set item that is not marked heavy (a suit) is still accepted on a plan, so
   set items need refusing too.
2. Matches F-20 as built: the offer is honoured at the re-price, and the basket minimum is
   checked on the counted bill. On cancel, `releaseForOrder` returns a personal offer to the
   customer only while it is still valid; past its end it becomes `expired`, and a new
   booking can't use an ended offer. Promotions are removed (F-21). Reading used: "goes with
   it" means the grace ends with that booking.
3. The cap stays at 200. **Gap:** both refusals (`util/catalogItems.js`,
   `util/quickBooking.js`) need the client's exact text.
   **Capacity: NO, it does not push the ready date out today.** `postBookOrder` reads the
   speed capacities from `AdminOrderDetails`, but those fields are commented out of that
   schema (they live on `AdminSetting`). So `sameDayCapacity` etc. are `undefined`, and
   every gate (`items.length > undefined`) and decrement is a silent no-op. The gates only
   exist in the plan branch anyway, they count lines rather than pieces, and the counters are
   never reset. Even when they worked, a full floor refused same-day/express and only
   added a message for standard; the stored ready date never moved. A real "floor full →
   later ready date" rule is new work that needs client numbers (see the item 3 notes).

## Daily floor limit (item 3b) — ANSWERED 2026-10-12 (binding)

Verbatim:

> 1. One number for the whole floor, counted in pieces, as a setting I can change. Start at
>    150 pieces a day. Inside that, the fast speeds get their own smaller limits, also
>    settings:
>    • Ready Today: 30 pieces a day
>    • Express: 50 pieces a day
>    • Regular uses the rest
>    Sunday is a half day, so it gets half the limit. Monday gets nothing. For now count
>    every piece the same, whatever the service.
> 2. When a day is full, show the next day with room before they book, for example "Ready
>    Thursday instead of Wednesday". Do not refuse the order.
> 3. When Ready Today or Express is full for a day, grey that speed out with "Full today".
>    Do not offer it with a later date. Regular still shows, with its date moved if needed.
> 4. Yes. For Quick Booking, count the number the customer enters when they book, and
>    correct it when Intake counts. Once a customer has booked, keep their date even if the
>    count changes. The new count only affects the bookings after them.

## Item 3 scope (to spec with `/fix` — builds 3 and 3b together)

**From the 11 Oct answers (Q1):**
- **Ready date:** count from the day AFTER pickup, with day weights Tue–Sat 1, Sun 0.5,
  Mon 0. The order is ready by 19:00 on the day the count is reached.
- **Ready Today:** counts the pickup day itself. Offered only for a pickup before 12:00,
  never on Sunday. This replaces the "booked before 10am" gate.
- **Anytime per date:** availability per date, not one "now" answer.

**From the 12 Oct answers (3b, daily floor limit):**
- **Settings:**
  - floor limit **150 pieces/day**;
  - **Ready Today 30**, **Express 50** inside it;
  - Regular uses the rest;
  - Sunday is half of each limit, Monday 0;
  - every piece counts the same.
- **Day full:**
  - **Regular** moves to the next day with room and shows the new date before booking
    ("Ready Thursday instead of Wednesday"). Never refused.
  - **Ready Today / Express** are greyed out with "Full today" and never offered with a
    later date.
- **Quick Booking** counts the entered number at booking, and Intake's count corrects
  it. A booked order **keeps its date**; a changed count affects only later bookings.
- **Replaces** the dead per-speed counters (`AdminOrderDetails` / `AdminSetting`
  `*Capacity`), which never worked.

**Carried from the 12 Oct item-2 answers (small, unrelated to dates):**
- Refuse **set items** on a plan, not only heavy ones.
- Above 200 pieces, both refusals read exactly: "For more than 200 pieces, call or WhatsApp
  us on +234 707 325 4943 and we will plan it with you."

**Builder readings to state in the spec (confirm if the client disagrees):**
- **What a day's limit counts:** the pieces of orders whose READY date is that day. A day is
  "full" for an order when the order's pieces don't fit in what's left.
- **"Regular uses the rest":** one shared pool of 150. Ready Today and Express are capped at
  30 and 50 inside it, and Regular takes whatever is left (not a fixed 70).
- **Cancelled orders free their pieces;** every booking channel counts (app, assistant, S1
  counter, plans).
- **An order bigger than a day's whole limit** (151–200 pieces, or more than 75 on a
  Sunday) can never "fit". Proposed: it takes the first day with nothing booked yet for its
  speed pool. **Ask the client:** spread it over several days, or take the first empty day?

### The client's answers, verbatim

> Thank you. Answers:
>
> *1. Counting days*
> Yes. Start counting the day after pickup, even for a morning pickup. Your example is right: Express picked up Sunday morning is ready Tuesday. The order is ready by 7:00 PM on the day the count is reached, even if it is reached at midday.
>
> One exception: Ready Today (the speed now called Same Day). It counts the pickup day itself. It is only offered when the pickup is before 12 noon, and not on Sundays, because Sunday is our half day.
>
> *2. When every window is full*
> Yes. When every window on the day the customer picks is full, show Urgent at the window price, with their offer kept. Also show the next day that has an open window, so they can choose. For example:
> "Today's windows are full. Book Urgent at the window price, ₦500, and keep your offer. Or pick another day."
> This only shows during Urgent hours. Outside them, show the next open window.
>
> *3. Welcome message*
> Send it by SMS and as an in app notification, so they see it on their phone even before they open the app. The email can stay as it is. Please put the SMS text in the CRM templates so I can edit it, with the system filling in their first name and the day their offer ends.

## What the code does today (found while triaging, 11 Oct)

- **Ready date:** `calculateDueDate` (util/helper.js) counts WHOLE working days from the
  BOOKING time, not hours and not from pickup. Monday is already skipped. The client's
  "Mon 12 Oct" was the frontend's own estimate (their item 25). No half-day concept exists.
  Proposed rule: day weights Tue–Sat 1, Sun 0.5, Mon 0; count from the day AFTER pickup
  until the total reaches the speed's days (express 1, standard 2). Matches all three of
  the client's examples.
- **Anytime on an off day:** `getAvailability` returns ONE Anytime object for "now", not
  per date, so the screen repeats "first thing Sunday" on every date including closed Monday.
- **Quick Booking charges pickup + delivery at booking** (`util/quickBooking.js`: "logistics
  fees ... are charged normally"). Client now wants NOTHING paid at booking; trip fees go on
  the SMS bill so the free-trip offer is checked after counting. The missing Book button
  is frontend.
- **Registration welcome is a HARDCODED EMAIL** in `auth.service.js`, not a CRM template.
- **BUG: the "Registered, not booked" schedule does not save.** `crmService.updateSettings`
  reads only `leadSchedule` / `postDeliverySchedule` / `reactivationSchedule` from the body,
  so `registeredNotBookedSchedule` is silently dropped while the request returns success. The
  frontend believes it saves. The three message TEXTS do save (template keys are open).
- **Google phone step (`userService.completeProfile`) does not normalise the phone**, and takes
  no terms tick or referral code.
- **`applyCode` accepts a referral code after the first order** (client: must not).
- **"Free pickup/delivery for window bookings only" (8 Oct) is NOT enforced** — `validateAndPrice`
  waives trips for any timing. Fixed in work item 1.
- **Anytime (D2/D3) built:** 8:00–17:00 on working days, else first thing next working day;
  the narrowed refund (`settleAnytimeRefund` at rider pickup/delivery). **NOT built:** alert to
  Intake + top of the pickup list; "windows full → window price + keep offer" (a full window
  just refuses the booking).
- **Free pickups left:** `remainingPickupDeliveries` resets lazily at booking only, so a raw
  read can be last week's number — compute with `applyWeeklyReset` on a copy.
- **Display names** are admin-only (`GET /api/admin/display-names` → 403 for customers).
- Already present per the frontend: Urgent's open/closed flag (`anytime.open`) and the
  unmet-offer shortfall (`requirement.shortfall`).
- **Data clearing:** possible while keeping settings — `config/setup.js` only fills in
  missing defaults and never overwrites. No fix in this list needs the data cleared again.

## The client's message, verbatim

> Good morning. I have started testing the customer app. Everything here is a correction to what we already agreed or what is already built, not a new feature.
>
> *1. Ready date falls on our off day*
> I booked Express on Sunday and the app said "ready by Mon 12 Oct, 7:00 PM". We don't work on Mondays. On 8 October we agreed (D6) that the promised date skips days that are not ticked in Working days. Booking already skips Monday, but the ready date still lands on it.
>
> One more thing about days: Sunday is a half day for us, and Saturday is a full day. Please make the ready date follow these rules:
> • Tuesday to Saturday count as full days
> • Sunday counts as half a day
> • Monday counts as nothing
>
> Examples:
> • A 1 day order picked up Sunday evening is ready Tuesday evening.
> • A 1 day order picked up Saturday evening is ready Tuesday, because Sunday gives only half a day and Monday gives nothing.
> • A 2 day order picked up Saturday evening is ready Wednesday.
>
> How does the system count ready time now: hours from pickup, or working days? Please tell me the simplest way to give Sunday half a day.
>
> *2. Anytime on an off day*
> When I pick Mon 12 Oct, the Evening window says "Closed that day", but Anytime still says "we will come first thing on Sunday 11 Oct". D6 says no windows and no Anytime on a day that is not ticked. On a closed day, Anytime should say "Closed that day", the same as the window.
>
> *3. Quick Booking has no Book button*
> I turned on Quick Booking, entered the number of items and filled the form, but there is no button to book. It looks like the button waits for items in the cart, and with Quick Booking there is no cart.
>
> Quick Booking means: the customer books, we pick up, count, price and send the bill. Nothing is paid at booking, not even pickup and delivery. Those fees go on the SMS bill, because the free pickup and delivery offer can only be checked after counting.
>
> What we want:
> • The Book button shows once the number of items and the address are filled, with no payment step.
> • The line under the number box changes to: "Between 1 and 200. You pay nothing now. After we count your clothes, we send your bill by SMS, with pickup and delivery included."
>
> *4. Messages for people who register but don't book*
> I registered a test account and got only the welcome message. I can't find the three follow up messages in CRM settings. Please show me where they are, and make them editable like the other templates. I know message 1 goes after 24 hours, so I am watching this account.
>
> Also, please show me which template is the welcome for people who register. I want it to mention their Welcome Offer and the day it ends.
>
> And where can I see the messages waiting to go out for one customer, with the time each will go? Then I can check timing without waiting days.
>
> *5. Google sign up: phone, terms and referral code*
> People who sign up with Google never tick our Terms and Conditions, because that tick box is only on the email form. The box that asks a Google user for their phone number should have three things:
> • Phone number
> • A tick box "I agree to the Terms and Conditions". They cannot continue without it.
> • "Referral code (optional)". If they came from a rep's link, fill it in already.
>
> If they skip the code because the person who referred them is not there, they can still enter it later in Refer & Earn, any time before their first order. After the first order, no code can be added and the order is not linked to anybody.
>
> *6. Same as pickup address*
> On 7 October we agreed (item 7) that the landmark is required on pickup and delivery, with a tick box "Delivery address is the same as pickup". The landmark is there, but the tick box is not. Please add it under Delivery Address, ticked by default. Ticked: copy the pickup address and landmark. Unticked: show the delivery fields.
>
> *7. Things that take days to test*
> Some of what you built only shows itself after hours or days, so I can't test it from my desk. For each one below, please write how the system works right now: when it starts, what happens, what the customer or staff sees or receives, and which setting controls it.
>
> _Customer messages_
> a. Registered but not booked: messages 1, 2 and 3, and the prospect list on day 7
> b. Entered leads: welcome, day 2, day 5, prospect list on day 8
> c. A follow up message that falls due outside 6 to 8 AM or 6 to 8 PM
> d. After delivery: confirmation at 1 hour, feedback request at 1 day
> e. Dormant at 30 days, reactivation at 14 and 42 days, churned at 56 days
> f. Unpaid orders: reminders to the customer, and when admin is told
>
> _Rewards_
> g. Referral reward: when it is earned and where it lands
> h. Recovery offer: when it is given, where it lands, and how the 60 day "ordered again" count works
>
> _Plans_
> i. Weekly free pickups and deliveries: when the week starts and resets
> j. Renewal day: renewal, failed payment and cancel
> k. Plan rewards at months 3, 6 and 12, if built
>
> _Orders and floor_
> l. Ready date with Monday off and Sunday as a half day (point 1)
> m. Hold clocks: what happens, and what admin sees, when one runs over
> n. Complaints: the 24 hour review clock and the 72 hour resolution clock
> o. Cancel: until when a customer can cancel, and what is refunded
> p. Processing time card: how many orders before it shows a number
>
> *8. Clearing the test data*
> When testing is done this week, I want you to clear the test data so we start clean with real customers. I will tell you the exact time, likely Thursday night. Please:
> • Clear all test customers, orders, wallets, referrals, messages and staff activity.
> • Tell me if you can keep my settings (items, prices, plans, offers, windows, message templates and staff accounts) while clearing. If not, clear everything and I will set it up again.
> • Confirm that your updates after that will not reset my settings or delete customer data.
> • Tell me now if any fix in this list will need the data cleared again.
>
> *WHAT THE SCREENS NEED FROM YOU*
> I have sent wording and screen fixes to the front end developer. These parts need you:
>
> *9. Ready date from the pickup time*
> Now: The ready date shows before the customer picks a pickup time.
> What we want: Work out the ready date from the pickup day and time the customer picks, using the off day rules in point 1, so the screen can show it under the pickup time.
>
> *10. Fees line*
> Now: The fees box only shows the fee.
> What we want: Tell the screen which line applies, with the amount:
> • The gap to free pickup and delivery ("Add ₦3,200 more for free pickup and delivery")
> • Free pickup and delivery reached
> • Welcome Offer on a first order
> • Free is for window bookings only, when they chose Anytime
>
> *11. How will you pay*
> Now: The payment options show no numbers.
> What we want: Send the plan items left this month and the wallet balance, so the options can show them. When the customer has plan items left, select My plan for them.
>
> *12. Last order's choices*
> Now: Every order starts empty.
> What we want: Send the service, care level, speed and pickup choices from the customer's last order, so the screen can preselect them.
>
> *13. Anytime*
> We are renaming Anytime to "Urgent" on screen. Before that, please confirm this is how it works in your code, from what we agreed on 8 October (D2 and D3):
> • The rider goes at once if free. If not, the job joins the current run or a new one.
> • It alerts Intake and Tag at once and goes to the top of the pickup list.
> • It runs 8:00 AM to 5:00 PM on working days. Outside that, we come first thing the next working day.
> • If an Anytime pickup or delivery ends up done inside a window, the difference goes back to the wallet automatically.
> • If the windows are full, the customer pays the window price and keeps the offer.
> Tell me where your code is different.
> What we want: Tell the screen when Anytime can't happen now (at night or on an off day) and the next time it opens, so it can be greyed out with "Urgent opens at 8:00 AM tomorrow".
>
> *14. Free pickups left*
> Now: My Plan shows items left only.
> What we want: Count the free pickups and deliveries a plan customer has left this week, so My Plan can show "Free pickups left this week: 1 of 2".
>
> *15. Referral box*
> What we want: Tell the screen whether the customer's Welcome Offer is still active, and hide the code box after their first order (point 5).
>
> Please send back the list with what you have done, what you can do and by when.

## The frontend's first note, verbatim

> here is the remaining from your end
>
> Not done, and why
> Renamed speeds and labels (items 3 and 5). The customer app cannot read the renamed labels. Display Names is admin only and answers 403 for customers, so what the client renames in settings will not show up for customers. The backend must expose the labels to customers, for example in the booking options response. Until then the options show their stored names ("Same Day", "Standard").
> Welcome Offer line (item 6). Waiting for the backend's checkoutPrompt text. The field already exists but is empty. The same field is the likely home for the ₦4,000 and ₦1,000 amounts.
> Free pickups left (item 33). The plan record has no count of free pickups used. The backend needs to send it, and I need its field name.
> Welcome Offer active (item 18). I changed the title and text. The extra line "Your Welcome Offer is already waiting in My Rewards." needs the backend's active flag.
> Ready date by pickup time (item 25). The position is fixed. The date is still my estimate from the chosen speed (same-day today, express tomorrow, standard two days) until the backend sends the real one.

## The frontend's second note, verbatim

> Items 1, 2, 3, 5 and 6 are built, and part of 4 is done. The remaining parts of 4 and everything in 7 to 15 need the backend developer
>
> 4. Messages for people who register but don't book
> The three messages are already in the backend as reg-not-booked-1, -2 and -3, each with a schedule. The CRM Settings screen simply did not show them. That was a frontend gap, now fixed in CRM → Settings → "Automation & Templates":
>
> A "Registered, not booked" group with the three messages, editable like the others.
> A schedule card showing message 1 at 24 hours from sign up, and 2 and 3 counted from the day the Welcome Offer ends (evening and morning slot respectively). Saving works; I confirmed the backend accepts the change.
> The sending hours (6 to 8 AM and 6 to 8 PM), read only.
> Waiting messages per customer: open a customer in CRM → Customers → tab Scheduled Follow-ups. It lists each message with the time it will go, in Lagos time.
> Still needs the backend developer:
>
> The registration welcome message is not one of the editable templates. Only "welcome" for entered leads exists. It cannot be edited and cannot mention the Welcome Offer end date. It needs a template and a placeholder for the offer end date.
>
> For the backend developer (not frontend)
> I have no access to the answers for these, and I have not made any up:
>
> 1: how ready time is counted today, and the simplest way to give Sunday half a day.
> 7a to 7p: how each timed behaviour works right now.
> 8: clearing test data. Only the backend can do this; I can only list what I created, if wanted.
> 9 to 15:
> the ready date from pickup day and time;
> which fee line applies, with the amount;
> the plan items left and wallet balance;
> the last order's choices (I read them from order history, so this one is optional);
> the Anytime check against 8 October D2 and D3, plus when Urgent cannot happen and the next opening;
> free pickups left;
> whether the Welcome Offer is active, and hiding the referral code box after the first order.
> Two of these fields already exist: Urgent's open or closed state and the unmet-offer shortfall. The rest are missing or empty.

**Note on "Saving works":** it does NOT for the schedule — see the bug above. Tell the
frontend not to rely on it until work item 6 lands.
