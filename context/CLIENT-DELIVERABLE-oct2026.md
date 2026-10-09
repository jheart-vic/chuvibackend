# CHUVI — Developer Brief of 6 October 2026: full response

**Backend only.** Anything marked "frontend" is in the app team's repo, not ours.

This is the single response you asked for, in the three parts of your brief:
§1 the 22 fixes, §2 the two new features, §3 the eight questions. Every answer
in §3 describes the code **as it now runs**, not as it ran when you wrote the
brief — several of the figures changed because of decisions you gave us after it.

Where an answer differs from what we told you on 7 October, it is marked
**CHANGED**, with the reason.

---

## §1 — The 22 fixes

**All 22 are resolved.** Five of them turned out not to be what the report
described, and those are the ones worth reading.

| # | What you reported | Outcome |
|---|---|---|
| 1.1 | Cards stay in a queue after being moved | **Fixed.** Also 1.2 — same incident |
| 1.2 | S1→S2 "Accept all" does nothing | **Fixed.** This was the actual cause of 1.1 |
| 1.3 | S3 stuck on "Waiting for confirmation" | **Fixed** |
| 1.4 | Flag / Move to Hold do nothing | **Fixed** (backend). The UI must now show the error it receives — frontend |
| 1.5 | S2 cannot sort part of an order, cannot skip pretreatment | **Fixed.** New bulk-sort action |
| 1.6 | Care tier cannot be set per item | **Fixed** |
| 1.7 | Tag text too faint | Frontend only |
| 1.8 | No feedback on Refresh | Frontend only |
| 2.1 | Offers do not save | **The save was never broken** — see below |
| 2.2 | Free pickup/delivery still charged ₦2,000 | **Fixed. This was a real bug** |
| 2.3 | Wallet adjustment missing from the ledger | **Fixed**, and it was worse than reported |
| 2.4 | No per-role wallet limits | **Built** |
| 2.5 | "Cannot create plan" | **The plan was being created every time** — see below |
| 3.1 | Rider assignment does not save | **Fixed.** Nothing was validating the rider |
| 3.2 | Failed pickups filter | **Fixed**, and the reason was being discarded |
| 3.3 | Landmark missing on pickup address | **Fixed** |
| 4.1 | Template save returns 400 | **Reproduced and fixed** |
| 4.2 | No list of keys and target pages | **Built** — the list is now generated from the code |
| 4.3 | Admin notifications | **Done** |
| 4.4 | Holds showing in both Active and Overdue | **Fixed**, and two more copies of the rule were found |
| 4.5 | CRM dormant rate reads 100% | **The figure was correct.** See §3 Q2 |
| 4.6 | Names shown as code text; phone formats | **Fixed**, and the phone handling was splitting customer records |

### The five that were not what the report said

**2.1 — "Offers do not save." The save was never broken.** We replayed your exact
test: created the three offers you named, left the screen, came back, edited each,
deleted one. Everything persisted correctly. Three separate things were happening:

1. A new offer is created as a **draft**, and a list filtered to "active" cannot
   show it. That is the "gone after refresh" report. It is a workflow and screen
   issue, not lost data.
2. **There was no way to load a single offer.** The edit screen had nothing to
   re-read one offer from, which is the likeliest source of "it still holds the
   old details". We added it.
3. **There was no delete at all.** We added one: an offer never given to anyone is
   deleted; one with finished history is archived so the history survives; one
   customers currently hold is refused and tells you how many hold it.

**2.2 — a real bug, and it cost you money.** Free pickup and delivery was
advertised and ₦2,000 was still charged. The cause: the booking code only applied
an offer when the customer had **selected** one. Your "General" offers apply by
rule and have nothing to select, so every one of them was skipped. Fixed —
offers are now always evaluated.

**2.3 — worse than reported.** The adjustment was missing from the ledger, which
we fixed; but the customer's own transaction history was reading only one of the
two places money is recorded, so a manual adjustment never appeared to them at
all. **Your original complaint — "the money has no record" — was still true after
the first fix.** Both halves are now done.

**2.5 — "cannot create plan". The plan was created every time.** The plan saved,
then the audit-log write failed on an internal category that did not exist, and
the error from that failure was shown to you as "something went wrong". Pressing
retry then hit "plan title already exists". We found the same fault on three more
actions — update plan, delete plan and **cancel subscription**, where a
cancellation reported failure after the payment provider had already been told.

**4.5 — the dormant rate of 100% was right.** See §3 Q2. We have renamed the card
to **"Dormant share of customers"**, which is what it measures.

---

## §2 — The two new features

### N2 — Recovery, complaints and feedback dashboard: **built**

One dashboard covering complaints, recovery actions and feedback, with the
figures from your worked example reconciling exactly (4.3 / NPS 40 / 50%).

Two things to know:

- **The 0–10 "would you recommend us" question did not exist.** It is new. A
  score of 0 is a real answer, so there is no default — an unanswered prompt and
  a score of zero are different things.
- **We count how many people were ASKED separately from how many answered.** An
  ignored prompt leaves no record of its own, so without this the response rate
  would silently flatter itself.

### N1 — Quick Booking, including time windows: **built**

Built as one piece with the pickup/delivery windows, as you chose. In summary:

- Booking captures the item count, service, delivery speed, address with
  landmark, and the time window or "Anytime".
- The rider records the **true** count at the door. If it differs from the
  customer's he must give a reason; the order is flagged and the customer is
  texted, but the pickup is **never blocked**.
- If **Intake's** count differs from the **rider's**, the order **stops** and
  needs an **admin** to approve it, as you instructed.
- Intake enters the real items and **the system computes the bill. Staff cannot
  type an amount** — there is no field for one.
- The order then sits on a **payment hold**: a text and an in-app payment link go
  out, reminders follow at **6 hours and 24 hours**, and an **admin is alerted at
  48 hours**.
- **Tags never print before payment.** This applies to an ordinary unpaid booking
  too, exactly as you asked — intake yes, tag no.
- Card payment clears the hold by itself. A **bank transfer** is approved by
  Intake or an admin; **every approval notifies an admin and appears on a daily
  bank-check list** for matching against your statement.
- An admin can **waive** a payment hold with a reason. The order is then processed
  unpaid but **cannot be dispatched** until it is paid.
- **Editing an order** works on both booking types. The bill is recalculated
  through the same pricing and offers; if it goes **up** the difference becomes a
  payment hold, if it goes **down** the difference returns to the customer's
  wallet. Every change records who made it and why, and the customer is texted
  the new bill. **After tagging, only an admin can edit.**
- **Cancellation:** free before pickup. After pickup but before payment,
  **₦1,000 + ₦1,000** is due before the clothes go back — **charged even if the
  order had free pickup**, because the trip was still made. After payment, the
  laundry fee returns to the wallet and both trips are kept. **Once tagging has
  begun, never.**

### Time windows — four things you should know before you announce it

**1. A window booking costs exactly what a booking costs today.** Your ₦1,000
"inside a window" figure is the current ₦500 pickup + ₦500 delivery. **Nobody
pays more unless they choose Anytime.** We mention it because "window pricing"
sounds like a price rise and it is not one.

**2. Delivery dates on weekend orders move by one day.** You told us Monday is
not a working day. The system used to count plain calendar days, so a standard
order placed on **Saturday** was promised for **Monday** — a day nobody is
working. It was also quietly marking those orders **overdue** on that Monday,
flagging your team for lateness on a closed day. It now counts working days only,
so a Saturday order is promised for **Tuesday**. Nothing got slower; the date is
now honest. If you would rather keep the shorter promise, tick Monday as a
working day — that is a setting you control.

**3. "Windows that filled and customers moved" had to be recorded as it happens.**
It cannot be worked out from the orders afterwards: a customer who was moved
leaves no trace, because their order simply shows the window they ended up with.
We now write a record at the moment a full window is taken off the list.

**4. The Anytime refund needed one extra thing recorded at booking.** Your rule
is to refund only when the customer booked Anytime **while that day's window
could still be booked** and the job was then done inside that window. Once the
day is over, whether the window was still bookable at the time cannot be
reconstructed — so it is now stamped on the order at booking. Your examples both
work: booked 11:00 and picked up 16:00 refunds; booked 14:30 and picked up 16:00
does not.

---

## §3 — Your eight questions

### Q1 — The four figures on the admin dashboard

#### 1. Average daily revenue (7 days) — **CHANGED at your instruction**

- **Rule.** Total money taken in the last 7 days, divided by **all 7 days**.
- **Formula.** Sum of successful payments over the window ÷ 7. It reads
  **payments**, not orders, so a subscription purchase counts and an unpaid order
  does not.
- **Worked example.** ₦12,000 Monday, ₦18,000 Wednesday, ₦9,000 Friday, nothing
  on the other four days: **₦39,000 ÷ 7 = ₦5,571.**
- **This is lower than before, and deliberately so.** It previously divided by
  trading days only and read ₦13,000 on the same money. The card now also tells
  the screen "3 of 7 days took money", so a figure that halved is explainable
  rather than looking broken.

> **One correction we found while writing this answer, and fixed.** The daily
> revenue figures were grouping by **UTC days, not Lagos days**. Money taken
> between midnight and 1am Lagos time was being counted under the **previous**
> day. So "today's revenue" read low for the first hour of each day, and the
> 7-day breakdown attributed some evenings to the wrong date. The totals were
> never wrong — only which day they landed on. Now corrected to Lagos
> throughout, with a check so it cannot come back.

#### 2. Average processing time — **CHANGED twice, at your instruction**

- **Rule.** For orders that became **Ready today**, the average time from when
  the order was **cleared for production** to the moment it was marked Ready.
- **Cleared for production** means the clothes are at Intake **and** the money is
  complete — whichever happens **last**. An admin waiver counts as money
  complete.
- **Formula.** (time marked Ready) − (time cleared for production), averaged over
  orders marked Ready today.
- **Worked example.** Three orders become Ready today, cleared for production 9,
  11 and 13 hours earlier: **(9 + 11 + 13) ÷ 3 = 11 hours.**
- **The card reads "Not enough data yet", not 0,** until there are orders to
  measure. We also publish how many orders the figure is based on, and how many
  became Ready today but started before this measurement existed and so cannot be
  included.
- **It starts from your deploy.** Orders processed before it cannot be
  reconstructed, and we would rather exclude them than guess.
- **The flaw we flagged is gone.** It used to filter on "the record was changed
  today", so editing an old delivered order dragged it into today's average.

#### 3. Average revenue per item (7 days) — **CHANGED at your instruction**

- **Rule.** Total money ÷ total garments over the 7 days. One pooled figure, not
  an average of daily rates.
- **Formula.** 7-day revenue ÷ 7-day garment count.
- **Worked example.** Monday ₦60,000 / 40 garments, Wednesday ₦30,000 / 15:
  **₦90,000 ÷ 55 = ₦1,636.** The old method gave ₦1,750 by averaging the two
  daily rates, which treated a quiet day as equal to a busy one.
- **The naming is corrected.** It was called "cost per item" and it is revenue.
  The old name still appears for one release so the current screen does not go
  blank, then it goes.

#### 4. How long a hold lasts — **CHANGED at your instruction**

- **Rule.** A hold's limit now depends on the **kind** of hold, not the order's
  delivery speed. Each kind of hold has its own limit, which **you can edit**.
- **Operational holds** (a station raising a problem) still follow the delivery
  speed: same-day **2 hours**, express **4 hours**, standard **6 hours** — and
  **those three numbers are now editable in settings**.
- **The payment hold is its own kind, starting at 48 hours**, and it is judged
  **only by its own limit** — the promised delivery date does not drag it
  overdue, because on a Quick Booking that date does not exist yet.
- **Worked example.** A standard order goes on hold at 09:00: at 14:00 it is
  Active, at 15:30 it is Overdue. A same-day order held at 09:00 is Overdue by
  11:01. An order awaiting payment from 09:00 Monday is Overdue at 09:00
  Wednesday.
- **Overdue holds now escalate to an admin** — once each, not on every sweep.
- **"Expiring today" is a different figure** and is often confused with this one:
  it counts holds whose **promised delivery date** is today. An order can be
  inside its hold limit and still appear there.

### Q2 — The CRM figures, and your three screen values

Two facts explain all three:

1. **A customer's order count counts orders we have DELIVERED.** It rises at
   delivery.
2. **Their stage moves at BOOKING.** And the 30-day dormancy scan overrides the
   count-based stage.

So a customer can sit in "First Order" with a delivered count of zero: they have
booked, nothing has been delivered yet. That is your "First Order 8 but Customers
4". The revenue difference is the same shape — lead revenue counts what was
booked, total revenue counts what was paid.

**The dormant rate of 100% was correct.** Every customer who had taken a delivery
had been quiet for more than 30 days. 4 ÷ 4 is a true 100%. We have renamed the
card **"Dormant share of customers"** so it cannot be read as "all our customers
are gone", and the 30-day window is now shown beside it.

### Q3 — The customer stages, and what moves someone between them

Lead → first order → active → loyal → dormant → reactivated. Movement is by
delivered-order count, except that the dormancy scan overrides it after 30 days
of silence, and a new order moves a dormant customer to reactivated.

### Q4 — The two ways an order enters the system

A customer booking in the app, and a staff member entering one at the counter.
**One correction we owe you:** we previously said a lead entered by a rep starts
their 3-day first-order offer when the rep types the number in. **It did not.**
An entered lead has no account, so the offer could not be granted — and when that
person later registered, it never fired. **Those people got no First Experience
offer and never would have.** It now fires at **registration**, for everyone.
**Please check which entered leads have since registered — they are owed the
offer and it can be granted by hand.**

### Q5 — How lead follow-up is scheduled

A queue of messages with a due time, processed every few minutes, with the
sequence cancelled the moment the person books. Since the brief you have added
the "registered but never booked" sequence, and the global rule that follow-up
and offer messages only send **06:00–08:00 or 18:00–20:00**. Order and payment
messages are exempt — holding "your order is ready" until 6pm would be a real
harm.

### Q6 — The order cards appear in, in each queue — **CHANGED at your instruction**

- **We found a real inconsistency:** Sort & Pretreat showed **newest first** while
  Wash, Press and the dispatch queues showed **oldest first**. The same three
  orders appeared in opposite order one screen apart.
- **Now every production queue sorts by delivery deadline, earliest first**, and
  where two share a deadline, the older order first. One rule, used by all 16
  lists.
- **One thing to watch:** an order with no deadline would sort to the **front**,
  not the back. Every booking route sets one, so this cannot currently happen —
  we note it for whoever adds the next booking route.

### Q7 — How offers work with orders

- Every offer is **re-validated at the moment it is attached**, against one shared
  rule, so the screen and the final bill cannot disagree. Nothing is read from a
  stored "eligible" flag.
- The bill carries **why** an offer was refused, so a customer is never silently
  charged full price.
- Normal booking keeps manual selection plus a prompt at checkout. **Quick
  Booking applies the offer automatically** — the one worth more **on that bill**;
  the other survives for next time.
- Worth more means what comes off *this* bill: discount plus any pickup or
  delivery fee waived. **A promised future credit is deliberately not counted**,
  or a large future credit could spend today's better offer.
- **A First Experience offer always wins on a first order**, overriding that
  comparison, because it can only ever be used once.
- **The rating condition you asked us to remove did not exist.** Nothing about a
  customer's rating has ever affected a referral reward. The sentence that caused
  this was ours, describing a flag that only decides whether the app shows a
  "refer a friend" prompt. We have corrected it. The open-complaint pause **has**
  been removed as you asked, and reward **reversal on a full refund** is now
  built — it never takes a wallet below zero, and it reports to an admin anything
  it could not recover.

### Q8 — What feedback and complaints do today

Feedback is captured per delivered order, with the new 0–10 recommendation score.
Complaints open a case, route to Customer Experience and progress through a fixed
set of states; recovery actions and any credit are recorded against the case.
**The assistant can open and update a complaint but can never resolve one, never
approve a refund and never release a reward** — those always reach a person.
See §2 for the dashboard now reporting all of it.

---

## What we need from you

**1. Renaming delivery speeds, service types and care tiers.** We have built it
so you can rename what everyone **sees**. The short internal names stay in place
as reference codes. If you meant you want the underlying data itself renamed,
that is a larger piece of work and we will come back with a timeline — please
confirm which you meant. (Sent separately, with one related warning about the
current settings screen.)

**2. The weekend delivery dates.** See §2, point 2. Nothing to do unless you want
Monday ticked as a working day.

**3. Two things to switch on in admin**, which some of the messages already
assume:
- the **First Experience offer** itself (the code is ready and waiting for it);
- a **free pickup/delivery offer with an ₦8,000 minimum** — the third
  registered-but-never-booked message promises this, and the promise is not true
  until it exists.

**4. Confirm the two interpretations we had to make**, both small and both
reversible:
- we silenced the customer notification that announces an internal move between
  stations, and kept the ones that describe their garments ("being washed",
  "being ironed", "in final checks");
- we assigned the "count differs from rider" hold to Intake, since that is where
  the clothes and the disagreement physically are.
