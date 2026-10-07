# CHUVI — answers to the questions in the 6 Oct brief (§3)

Written for the client. Each answer gives the rule in plain words, the exact
condition in the code, and one worked example with real numbers — the form the
brief asked for.

*This file is the working draft of §3 of the final deliverable. Q1, Q2 and Q3 are
answered (Q2 and Q3 are the two that 4.5 was waiting on). Q4–Q8 to follow.*

---

## First, the three Group 4 items you asked about

**4.3 Admin notifications — DONE.** An admin is now notified of every wallet
adjustment and every adjustment request, and the message names the customer, the
amount and the operator who did it.

*The list you asked for — what notifies an admin today.* We counted every
notification the system can send: **87 places in total, and only 6 of them reach an
admin.** Those 6 are:

| Event | Who gets it |
|---|---|
| Wallet adjusted by a staff member | every active admin |
| Wallet adjustment needs approval (over the operator's limit) | every active admin |
| Adjustment request approved | the operator who asked |
| Adjustment request rejected (with the reason) | the operator who asked |
| **Pickup marked as failed by a rider** | Intake & Tag, Customer Experience, admin |
| **Delivery marked as failed by a rider** | Intake & Tag, Customer Experience, admin |

The other 81 go to the customer, or to one named staff member or station. The last
two in that table are new this week — see 4.3's note below. **Mark on this list what
else you want an admin to hear about and we will wire it up; the mechanism now
exists, so each one is small.**

Two things we found while answering this:

- **The failed-pickup and failed-delivery notices used to go to the rider who
  pressed the button, and to nobody else.** The office was never told a pickup had
  failed. Fixed.
- **Admin wallet top-ups and deductions were running on their own, older copy of
  the money code** (a non-atomic balance update, and a ledger line without the
  operator or the resulting balance). They now go through the same single path as a
  staff adjustment, so an admin's ₦5,000 credit and an operator's are recorded
  identically.

**4.4 Holds: Active and Overdue — DONE and verified against the database.**

- **Rule in plain words.** Active = on hold and still inside its time limit.
  Overdue = on hold and past it. No order is ever in both, and Active + Overdue
  always equals every order on hold.
- **The exact condition.** One definition, in `util/holdSla.js`. A hold has
  breached when **either** it has been on hold longer than its delivery speed
  allows — **same-day 2 hours, express 4 hours, standard 6 hours**, measured from
  the moment it went on hold — **or** it is already past its promised delivery
  date. Overdue is that condition; Active is its exact opposite. Both the cards and
  the lists behind them read the same clause, so they cannot drift apart.
- **Worked example — your own test.** With 3 breached holds and nothing else on
  hold: **Active 0, Overdue 3.** We then added 2 holds that were 1 hour old:
  Active 2, Overdue 3, total on hold 5. Your OSC-20260609-931296 at 2845 hours is
  in Overdue and **not** in Active.
- **One more defect this turned up.** The "SLA Breached" badge on each row was
  calculated separately from the cards, with its own copy of the time limits, and
  it ignored the delivery-date rule. So a row could be counted as Overdue but still
  show as not breached (and vice versa) — which is part of what you were seeing.
  The badge and the bucket now come from the same rule.

**4.5 CRM dormant rate 100% — see Q2 below. In short: the figure is arithmetically
correct, and it is telling you something true.** It is not the old 125% bug (that
one was a genuine fault and was fixed on 23 September). We have deliberately not
changed the formula, because the right definition is your call — Q2 and Q3 give you
what you need to make it.

---

## Q1 — The four figures on the admin dashboard

### 1. Average daily revenue (7 days)

- **Rule in plain words.** Of the last 7 days, we look only at the days that
  actually took money, and average those. A day with no sales is left out rather
  than counted as a zero.
- **The exact formula.** Sum of successful payments per day ÷ the number of days
  in the window that had any payment. It reads **payments** (status `success`,
  type `order` or `subscription`), not orders — so a subscription purchase counts,
  and an order that was never paid for does not.
- **Worked example.** In the last 7 days you took ₦12,000 on Monday, ₦18,000 on
  Wednesday and ₦9,000 on Friday, and nothing on the other four days.
  The figure reads **(12,000 + 18,000 + 9,000) ÷ 3 = ₦13,000.**
  It does **not** read ₦5,571 (which is the same money ÷ 7).
- **Worth knowing.** This makes the number "an average trading day", not "an
  average day". If you want it to include quiet days, say so — it is a one-line
  change, but it will make the figure drop sharply, so we would rather you decide
  than discover it.

### 2. Average processing time

- **Rule in plain words.** For the orders delivered **today**, the average time
  from when the order was created to the moment it was marked delivered.
- **The exact formula.** For each order now sitting at `delivered` whose record
  was last touched today: (the time of the `delivered` entry in the order's own
  history) − (the time the order was created). Those gaps are averaged. The result
  is in milliseconds and the dashboard converts it for display.
- **Worked example.** Three orders are delivered today. One was created 26 hours
  before delivery, one 20 hours, one 14 hours. The figure reads
  **(26 + 20 + 14) ÷ 3 = 20 hours.**
- **Three things to know, because they explain odd readings.**
  1. It is **today only**. Before the first delivery of the day it reads 0, and a
     single unusual order can swing it.
  2. It counts from when the **order was created**, not from when the laundry
     reached the building. A customer who books on Monday for a Thursday pickup
     adds three idle days to the average.
  3. The day filter is "the record was last modified today". If anyone edits an
     old delivered order today, that old order is pulled into today's average.
     **This one we would call a flaw rather than a design choice — tell us if you
     want it changed to "delivered today" and we will.**

### 3. Average daily revenue per item

- **Rule in plain words.** For each of the last 7 days, how much money the day
  took per garment; then the average of those daily figures, again only over days
  that had any.
- **The exact formula.** Per day: total order value ÷ total number of garments on
  those orders (paid orders only, dated by when they were paid). Then: the sum of
  those daily per-garment figures ÷ the number of days that had garments.
- **Worked example.** Monday: ₦60,000 across 40 garments = ₦1,500 each.
  Wednesday: ₦30,000 across 15 garments = ₦2,000 each. No other day took anything.
  The figure reads **(1,500 + 2,000) ÷ 2 = ₦1,750.**
  Note this is **not** the same as ₦90,000 ÷ 55 garments (= ₦1,636). It is the
  average of the daily rates, which treats a quiet day and a busy day as equal.
  Tell us which of the two you want the card to show.
- **Naming.** In the code this figure is called "cost per item", but it is
  **revenue** per garment — what you earned, not what it cost you. We have left the
  behaviour alone and are flagging the name.

### 4. How long a hold lasts before it expires

- **Rule in plain words.** A hold has a time limit set by the order's delivery
  speed, counted from the moment it went on hold. It also expires immediately if
  the order is already past the delivery date you promised the customer, whichever
  comes first.
- **The exact limits.** Same-day **2 hours**, express **4 hours**, standard
  **6 hours** (`util/holdSla.js` — the same table the Active and Overdue cards
  use, so they can never disagree).
- **Worked example.** A standard order goes on hold at 09:00. At 14:00 it is 5
  hours old, still inside its 6 hours, so it is **Active**. At 15:30 it is past 6
  hours, so it becomes **Overdue**. A same-day order that went on hold at 09:00 is
  already Overdue by 11:01.
- **A separate figure, often confused with this one.** "Expiring today" counts
  holds whose **promised delivery date** falls today. That is about the customer's
  deadline, not the hold timer, so an order can be inside its hold limit and still
  be in "Expiring today".
- **These limits are currently fixed in the code.** If you want them editable from
  settings, like the wallet limits now are, say so.

---

## Q2 — The CRM dashboard figures, and your three screen values

First the figures themselves. Two facts drive almost everything on that screen, and
both of your three puzzles come straight out of them:

> **Fact 1. `totalOrders` on a customer counts orders we have DELIVERED.**
> It goes up at delivery, not at booking.
>
> **Fact 2. The customer's STAGE moves at BOOKING, and dormancy overrides it.**
> A customer who goes quiet becomes Dormant regardless of how many orders they have
> had, so they leave the Active and Loyal buckets entirely.

| Figure | Rule | Exact formula |
|---|---|---|
| Customers | People we have delivered to at least once | profiles with `totalOrders ≥ 1` |
| Lead conversion rate | Share of everyone in the notebook who became a customer | customers ÷ all profiles |
| Repeat customer rate | Share of customers who came back | profiles with `totalOrders ≥ 2` ÷ profiles with `totalOrders ≥ 1` |
| Dormant rate | Share of customers who have gone quiet | profiles at stage Dormant **with ≥ 1 delivered order** ÷ customers |
| Reactivated rate | Of everyone who ever went quiet, how many came back | came-back ÷ ever-dormant |
| Revenue per customer | Average spend of a delivered customer | total `totalSpent` of customers ÷ customers |
| Stages | The live count in each bucket | a straight count per stage, **not** filtered |

### "First Order 8, but Customers 4"

**Both numbers are right, and they are measuring two different moments.**
A customer moves into the **First Order** stage the moment they **book**.
The **Customers** figure counts only people we have **delivered** to.

So: 8 people have placed a first order; 4 of them have had an order delivered.
The gap of 4 is "booked, not yet delivered" — which is exactly the number you would
want to see on a production board.

**Worked example.** Ada books on Monday → she is in First Order immediately, and
Customers does not move. We deliver on Thursday → her `totalOrders` becomes 1 and
Customers goes up by one.

### "Lead revenue ₦19,500, but total revenue ₦18,300"

**Expected, because the two count money at different moments.**

- The **Monthly Lead Report** counts revenue as the **booked value** of the order,
  in the month it was placed. That was your own decision in September, so the report
  measures what the sales effort in that window produced.
- The **CRM dashboard's** revenue accrues **on delivery** (a customer's `totalSpent`
  goes up when the order is delivered).

Booked is always ahead of delivered, so the lead figure can legitimately be the
larger of the two. The difference is work in progress.

**Worked example.** Three leads book ₦6,500 each in the month = ₦19,500 of lead
revenue. Two of those orders are delivered inside the month and the third is still
in the wash: delivered revenue is ₦13,000. Add ₦5,300 delivered from an older
customer and the dashboard reads ₦18,300 while the lead report reads ₦19,500.

Two smaller reasons they differ: the lead report **excludes** cancelled and recovery
orders, and it records a subscription draw-down order as **₦0** (the subscription
purchase is what gets credited, so the money is not counted twice).

### "Repeat rate 50%, but Active 0 and Loyal 0"

**This is Fact 2. The repeat rate is counted from delivered orders; the Active and
Loyal buckets are stages, and dormancy empties them.**

Normally a customer's stage follows their delivered order count: 1 order = First
Order, 2–4 = Active, 5+ = Loyal. But **anyone with no order for 30 days is moved to
Dormant**, and that takes them out of Active and Loyal. Your screen shows Dormant 4
and Customers 4 — so every customer you have is currently in the Dormant bucket, and
Active and Loyal are therefore empty.

Meanwhile 2 of those 4 customers have had 2 or more orders delivered, so the repeat
rate is 2 ÷ 4 = **50%**. Both figures are correct at the same time.

**Worked example.** Chidi had 3 orders delivered, the last one 45 days ago. He
counts in the repeat rate (3 ≥ 2) but his stage is Dormant, not Active.

### So: the dormant rate of 100% (item 4.5)

- **Rule.** Dormant customers ÷ customers = people we have delivered to who have
  not ordered in **30 days**, as a share of everyone we have delivered to.
- **Exact formula.** `count(stage = dormant AND totalOrders ≥ 1) ÷ count(totalOrders ≥ 1)`.
- **Worked example — your screen.** 4 dormant ÷ 4 customers = **100%**.
- **What it means.** Every customer you have ever delivered to has been quiet for
  more than 30 days. On a system still in testing, with the orders dating from July
  and August, that is simply true. The figure is not broken; it is reporting a real
  and uncomfortable fact about the current data.
- **It can no longer exceed 100%.** The old 125% came from counting leads who had
  never ordered in the top half of the sum. That was fixed on 23 September; the two
  halves now describe the same group of people.

**The decision we need from you.** "Dormant rate" can reasonably mean either:

1. **(what it does today)** of the customers we have served, how many have gone
   quiet — a loyalty measure; or
2. of **everyone** in the notebook including leads who never ordered, how many are
   quiet — a pipeline-health measure. On your data that would be 4 ÷ (every profile
   in the notebook), so a much smaller number; we will read the exact figure off
   your live data before changing anything.

We recommend keeping (1) and renaming the card **"Dormant share of customers"**, so
the number cannot be mistaken for a pipeline figure. **Also tell us whether 30 days
is the right dormancy window** — it is editable in settings, and on laundry it may
be short.

---

## Q3 — The customer stages, and what moves someone between them

- **Rule in plain words.** Every person in the notebook sits in exactly one stage.
  A lead becomes First Order when they book, Active when they are coming back,
  Loyal when they are a regular, Dormant when they go quiet, and Reactivated when a
  dormant customer returns.
- **The exact conditions.**

| Stage | When someone enters it |
|---|---|
| **Lead** | Created without an order — a WhatsApp enquiry, a walk-in, a sign-up |
| **First Order** | **At booking** of their first order, and afterwards while 1 order has been delivered |
| **Active** | 2–4 delivered orders |
| **Loyal** | 5 or more delivered orders |
| **Dormant** | Has at least 1 delivered order and **no order for 30 days** (a daily scan does this). This overrides Active and Loyal. |
| **Reactivated** | A Dormant customer orders again. They stay Reactivated rather than returning to Active, so you can see the recovery. |

- **Worked example.** Ngozi enquires on WhatsApp → **Lead**. She books → **First
  Order**. Her 2nd order is delivered → **Active**. Her 5th → **Loyal**. She then
  goes 31 days without ordering → **Dormant** (and leaves Loyal). She books again →
  **Reactivated**.
- **Two notes.** Staff can correct a stage by hand, but the system refuses to set
  anyone to Active, Loyal, Dormant or Reactivated if they have no delivered order —
  that rule exists because a staff member doing exactly that is what produced the
  125% dormant rate in September. And the **Stages** panel is a straight count of
  everyone, leads included, which is why it will not tie back to the Customers
  figure.

---

## Q4 — The two ways an order enters the system

- **Rule in plain words.** There are exactly two doors. The **customer books in the
  app** and we go and collect the laundry — so the order exists before the clothes
  do. Or **a staff member creates the order at the counter**, with the clothes
  already in front of them.
- **The exact difference.**

| | Customer books in the app | Staff creates at the counter |
|---|---|---|
| Endpoint | `POST /bookOrder/create-book-order` | `POST /intake-user/create-book-order` |
| Starts at | **Pending** — waiting for a rider to collect | **Queue** — the clothes are here, ready to tag |
| Channel recorded | website / whatsapp | **office** |
| Payment | whatever the customer chose (card, wallet, their plan) — and a card order stays unpaid until the bank confirms | marked **paid at the counter**, pay-per-item |
| Who is recorded | the customer's own account | the customer **and** the staff member who took it in (`intakeStaffId`) |
| Address | pickup address required | pickup and delivery addresses required, with label and landmark |

- **The same in both.** Pricing is identical — one shared calculation, so the same
  basket costs the same through either door (that was fixed this week as part of the
  per-item care tier work; the two doors had quietly drifted apart). The order
  reference, the per-garment tags, and every station step afterwards are the same.
- **Worked example.** Ada books 5 shirts in the app on Monday → the order is created
  at **Pending** with no clothes in the building. A rider collects on Tuesday and it
  moves to Queue. Meanwhile Musa walks in with 5 shirts → his order is created
  directly at **Queue**, already paid, and can be tagged immediately.
- **Worth knowing.** A customer-app order can sit at Pending for days if the rider
  leg does not happen, and the average-processing-time figure counts from the moment
  the order was created (see Q1) — so these two doors do not contribute to that
  figure on equal terms.

---

## Q5 — How lead follow-up is scheduled

- **Rule in plain words.** The moment a lead is created, the whole follow-up
  sequence is written into a queue with a time against each message. A background
  job sends whatever is due. **If the lead books, every remaining message is
  cancelled automatically.**
- **The exact schedule** (editable in CRM settings — these are the defaults, counted
  from when the lead was created):

| Step | When | Cancelled if they order? |
|---|---|---|
| Welcome | immediately | yes |
| Offer | **+2 days** | yes |
| Closing nudge | **+5 days** | yes |
| Mark as prospect (stops 1-to-1 chasing, moves them to the broadcast list) | **+8 days** | yes |

- Two other sequences work the same way: **after delivery** — a confirmation at
  +1 hour and a feedback request at +1 day; and **reactivation** when a customer goes
  quiet — at the moment they become dormant, then +14 days, +42 days, and marked
  churned at +56 days.
- Prospect broadcasts go out every **14 days**, churn broadcasts every **30 days**.
- **Worked example.** A WhatsApp enquiry arrives on Monday 09:00. The welcome goes
  out at once; the offer is queued for Wednesday 09:00; the closing nudge for
  Saturday 09:00. If they book on Tuesday, the Wednesday and Saturday messages are
  cancelled and never send — and they move from Lead to First Order.
- **Worth knowing.** Marking a lead **cold** by hand also stops the sequence
  immediately, cancels the queued messages, and keeps the nurture job from picking
  them up again.

---

## Q6 — The order the cards appear in, in each queue

- **Rule in plain words.** Every station list is sorted by time, but **the stations do
  not currently agree on which direction.** Two show the newest first and the rest
  show the oldest first.
- **Exactly what each one does today.**

| Screen | Sorted by | Reads as |
|---|---|---|
| Sort & Pretreat (all its lists) | last updated, **newest first** | most recently touched at the top |
| Wash & Dry queue | moment it arrived at the station, **oldest first** | first in, first out |
| Active Wash / Active Drying | when washing/drying started, **oldest first** | longest running at the top |
| Press & Iron queue | moment it arrived, **oldest first** | first in, first out |
| Pickup and Delivery queues | order creation time, **oldest first** | longest waiting at the top |

- **Worked example.** Three orders reach Sort & Pretreat at 09:00, 10:00 and 11:00.
  **Sort & Pretreat shows 11:00 at the top.** When those same three move to Wash,
  **Wash shows 09:00 at the top.** Same three orders, opposite order, one screen
  apart.
- **Our recommendation.** Make every production queue **oldest first**, because the
  longest-waiting order is the one at risk of breaching its delivery promise, and
  staff should meet it first. That means changing Sort & Pretreat to match the rest.
  **It is a small change, but it changes what staff see first, so we would rather you
  decide than have us flip it quietly.** If you would prefer the queues sorted by
  *delivery deadline* rather than arrival time, that is also possible and arguably
  better — tell us which.

---

## Q7 — How offers work with orders

- **Rule in plain words.** There are three kinds of offer, and they are applied in a
  fixed order every time an order is priced: standing policies first, then one
  personal offer the customer holds, then one promotion code.
- **The exact rules.**

| Kind | How it reaches an order | How many can apply |
|---|---|---|
| **General / baseline** (e.g. "free pickup over ₦8,000") | **Automatically, by rule.** No code to enter and nothing to select — if the order meets the conditions, it applies. | **all** that qualify |
| **Personal** (given to one customer) | The customer selects it; it is tied to them by a linkage record | **one** per order |
| **Promotional** (a shared code) | Entered as a code | **one** per order, and a one-per-customer promo is refused the second time |

- Every applied offer is recorded on the order itself with its name and its kind, so
  a receipt can say *why* pickup was free. Anything that was rejected is recorded
  too, with the reason, so "why didn't my code work" is answerable.
- **Worked example.** A ₦9,000 basket, with "Always Free at ₦8,000" active as a
  general policy and the customer holding a ₦500 personal reward. The general policy
  waives pickup (₦1,000) and delivery (₦1,000) because the basket is over ₦8,000;
  the personal offer takes ₦500 off. Total: **₦8,500** instead of ₦11,000, and the
  summary lists both offers by name.
- **Two things we fixed this week, both in this area.** General/baseline offers were
  being **skipped entirely at booking** — the app advertised free pickup and then
  charged ₦2,000 anyway, because the pricing step only looked for offers the customer
  had *selected*, and a general policy has nothing to select. And the summary had no
  way to show *which* offer made a fee free. Both corrected.
- **Worth knowing.** A new offer is created as a **draft**. Drafts are deliberately
  invisible to customers — so an offer must be activated before it does anything.
  (This is also what was behind "offers do not save": the offer saved correctly, but
  a list filtered to active offers could not show it.)

---

## Q8 — What feedback and complaints do today

### Feedback

- **Rule in plain words.** After an order is delivered, the customer is asked to
  rate it. A good or neutral rating is simply recorded. **A poor rating is treated as
  a complaint, not as a statistic** — the system offers to open a case there and then.
- **The exact conditions.** A feedback request goes out **1 day after delivery**
  (configurable). Ratings are 1–5. **4 or 5 → recorded as satisfied; 3 → neutral;
  1 or 2 → the customer is offered a complaint.** Only a satisfied rating makes the
  customer eligible for the referral reward.
- **Worked example.** We deliver on Monday. Tuesday the customer is asked to rate.
  They give 2 and say an item is still stained → the assistant offers to open a
  complaint, and on "yes" a case is created and routed to Customer Experience.
- **What does not exist yet:** an **NPS question (0–10)**. The brief's new Recovery
  dashboard asks for it, including a limit of once per customer every 30 days. That
  is new work, not a setting.

### Complaints

- **Rule in plain words.** A complaint becomes a case with its own clock. Staff move
  it through fixed steps, and nothing is closed until the customer confirms.
- **The exact steps.** Submitted → Under review → (Awaiting item → Item received) →
  Recovery in progress → Ready → Resolved → **Customer confirmed** → Closed, with
  Reopened available if it comes back.
- **The two clocks.** First review is due **24 hours** after the case is opened;
  resolution is due **72 hours** (both configurable). Passing either one flags the
  case as escalated so it cannot sit quietly.
- **The five ways to put it right:** rewash, rework, repair, replace, compensate.
- **Worked example.** A case opened Monday 10:00 must be looked at by Tuesday 10:00
  and resolved by Thursday 10:00. Staff choose a rewash, the item is redone and
  marked Ready, the customer confirms, and the case closes. If nobody touches it by
  Tuesday 10:00 it is flagged as review-overdue.
- **Hard limits that stay.** The in-app assistant can open a complaint and capture
  the details, but it can **never** approve money, release credit, or resolve a case.
  Those always reach a person.
- **What does not exist yet:** the single dashboard that puts all of this on one
  screen — complaints opened/resolved/open, average time to resolve, recoveries
  given and their cost, and the list of 1–2 star orders. That is §2's second new
  feature.

---

## The decisions we need back from you

1. **Dormant rate (4.5):** keep it as "share of customers", and rename the card? And
   is **30 days** the right dormancy window for laundry?
2. **Average daily revenue (Q1):** keep dividing by trading days, or by all 7?
3. **Average revenue per item (Q1):** average of daily rates (today) or total ÷ total?
4. **Average processing time (Q1):** we recommend changing the day filter to
   "delivered today" — confirm.
5. **Queue order (Q6):** make every queue oldest-first? Or sort by delivery deadline?
6. **Hold limits (Q1/4.4):** leave at 2h / 4h / 6h in code, or make them editable in
   settings like the wallet limits now are?
7. **Landmark:** now required on both pickup and delivery, as you asked — the app
   must collect it (see the frontend changelog).
