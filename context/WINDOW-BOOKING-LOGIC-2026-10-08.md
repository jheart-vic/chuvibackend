# Window booking for pickup and delivery — the logic, before we build

As asked: the full logic in writing first. Nothing in item 3 has been built.

Items 1 and 2 of your reply are answered and already in the code — see §7 at the end, including one
place where **our own earlier answer to you was wrong**.

This document is in four parts: what exists today (§1), the logic we will build (§2–§5), the eight
decisions we need from you (§6), and the two items already done (§7).

---

## §1 — What exists today, because two of your assumptions do not hold

### 1.1 Delivery timing: the customer does not choose it at all

You asked: *"If the customer chooses delivery timing in the app today, use the same window choice. If
not, tell me how delivery timing is set now."*

**They do not choose it.** There is no delivery time anywhere in the system — no field, no setting, no
screen. What happens instead:

- the customer picks a delivery **speed**: standard, express or same-day;
- the system computes a delivery **date** from that speed — standard = +2 days, express = +1 day,
  same-day = today;
- and that date is stamped **at 7:00 PM** in every case.

So today a delivery is a *date* with an implied "by 7pm", never a time the customer agreed to. Adding
delivery windows is genuinely new work, not a re-use of something already there.

**This collides with your proposed windows and you need to decide it (decision D1).** Your evening
window ends at 6:30 PM, but every delivery promise in the system today says "by 7pm". If delivery
moves into windows, the latest a customer can be promised becomes 6:30 PM, and same-day orders lose
the half-hour they currently have.

### 1.2 Pickup windows exist on screen but are not enforced

There is a setting called `pickupTimeSlots`, currently `["10am-12pm", "4pm-6pm"]`, and the app offers
those two choices. But:

- the chosen value is stored as **free text**, and nothing validates it — a booking can arrive with
  any string, or none at all;
- there is **no cutoff**, so a customer can pick "10am-12pm" at 11:45 AM and the system accepts it;
- there is **no limit**, so all 40 of tomorrow's pickups can land in the same two-hour window;
- the two windows are **hard-coded defaults**, not the day/time/cutoff structure you described.

In other words the current slots are a label on the order, not a promise the system keeps. Everything
in §2 below is new.

### 1.3 Your prices match today's prices exactly

Today pickup is ₦500 and delivery is ₦500, flat — ₦1,000 together. That is precisely your "inside a
window" price. So **window bookings cost what bookings cost today, and the new charge is the
outside-window one.** Nobody paying today pays more unless they choose "anytime". Worth knowing before
you announce it.

---

## §2 — Windows

Each window is a record you control, with: **name**, **start time**, **end time**, **days it runs**,
**cutoff in minutes**, and an on/off switch. You can add, edit or disable any of them.

Starting values, as you specified:

| Name | Start | End | Days | Cutoff |
|---|---|---|---|---|
| Morning | 9:00 AM | 12:00 PM | Tue–Sun | 60 min |
| Evening | 3:30 PM | 6:30 PM | Tue–Sun | 60 min |

**Note this replaces today's 10am–12pm / 4pm–6pm.** Any customer used to the old times sees different
ones from the day it ships.

### 2.1 Which windows a customer is offered

When the customer reaches the timing step, the system builds the list like this, in order:

1. Take every **enabled** window whose **days** include the date being offered.
2. Drop any window whose **start time minus its cutoff** has already passed for that date.
   *Morning (9:00, 60 min cutoff) stops being offered at 8:00 AM.*
3. Drop any window that is **full** (§4).
4. If nothing survives for today, move to the next day that has windows and repeat.
5. Always offer **"Anytime (outside window)"** alongside whatever survived.

So the customer always sees at least one choice, and never a window they cannot actually have.

### 2.2 Worked example — a customer opening the app at 11:30 AM on a Thursday

- Morning (9:00 AM): cutoff was 8:00 AM, already gone. Not offered.
- Evening (3:30 PM): cutoff is 2:30 PM, still ahead. **Offered — today, 3:30–6:30 PM, ₦500.**
- Anytime: **offered — ₦1,000.**

Same customer at 5:00 PM the same day:

- Both of today's windows are past their cutoffs.
- Friday Morning (9:00 AM–12:00 PM) is **offered**, ₦500.
- Anytime is **offered**, ₦1,000 — and here we need decision **D2**: does "anytime" mean *today, at
  some point*, or *no time commitment, soonest we can*? They are different promises and the price is
  the same.

---

## §3 — Price

Four settings, exactly as you asked, with your starting values:

| Setting | Start |
|---|---|
| Window pickup | ₦500 |
| Window delivery | ₦500 |
| Outside-window pickup | ₦1,000 |
| Outside-window delivery | ₦1,000 |

Nothing is hard-coded; these replace today's single `pickupFee` / `deliveryFee` pair.

### 3.1 How a bill is built

The order carries a **timing type** per leg — `window` or `outside` — and each leg is charged from the
matching setting. A booking with pickup and delivery both inside windows is ₦500 + ₦500 = ₦1,000. Both
outside is ₦2,000. One of each is ₦1,500.

### 3.2 Free pickup / delivery offers

Your rule: **the free pickup and delivery offer applies to window bookings only; outside-window always
pays.** We will gate the two free-logistics benefits on the leg's timing type, so an outside-window leg
is charged even when the customer holds a free-logistics offer, and the bill says why
("Free delivery does not apply to anytime bookings").

**But there is a fairness case you should rule on (decision D3).** If every window is full and the
system moves a customer to anytime, they pay ₦2,000 *and* lose their free-logistics offer — because of
our capacity, not their choice. We recommend: when the **system** moved them, charge the outside price
but still honour the offer. When they **chose** anytime with a window available, the offer does not
apply. We can tell these two cases apart, because we record the deflection (§5).

---

## §4 — The window limit

Two settings, off by default, as you asked:

- **bags per bike** — starts at 10
- **bikes on duty** — starts at 1

Limit per window = bags per bike × bikes on duty. At the starting values, 10 bookings per window. Add a
rider, change bikes on duty to 2, and every window becomes 20. Nothing else to edit.

When a window reaches its limit it shows as **full** and drops out of the list, so the customer sees the
next window or the anytime option.

### 4.1 "A bag" is not something the system knows about — decision D4

This is the one place your spec does not map onto the data. Orders are counted in **pieces** (3 shirts
and 2 trousers is 5 pieces, which is how pricing and every station card work). There is no bag.

Three ways to read "bags per bike", and they behave very differently:

| Reading | 10-bag window holds | Risk |
|---|---|---|
| **1 order = 1 bag** (recommended) | 10 orders | A 60-piece order and a 2-piece order both count 1 |
| 1 bag = N pieces (another setting) | varies | A big order can fill a window alone |
| Rider enters real bags at pickup | accurate | Too late — the limit must apply at booking |

We recommend **1 order = 1 bag per leg**: a stop is a stop, it is what a dispatcher actually plans
around, and it is the only reading knowable at booking time. If you want very large orders to count
more, say so and we will add a "pieces per bag" setting on top.

### 4.2 Does one window hold pickups and deliveries together — decision D5

One bike does both legs. We recommend **one shared count per window per day**: a window with a limit of
10 holds 10 stops, whether those are pickups, deliveries or a mix. Counting them separately would let
20 stops into a 10-stop window.

### 4.3 There is a second limit already, and they are not the same thing

The system already has delivery **speed** capacity — standard 100, same-day 50, express 30 per day. The
window limit is a different axis, and an order can pass one and fail the other: a window with room,
but same-day already full for the day. We will check **speed capacity first, then window capacity**,
and say which one blocked it, so a customer is never told "that window is full" when the real problem
was same-day being sold out.

---

## §5 — The dashboard numbers, and why they need recording as they happen

You asked to count, each day: **how many windows filled up**, and **how many customers were moved to
another window or to anytime because a window was full.**

The first is a count of state. The second is not — and this is the part worth being careful about.

**A customer who is deflected leaves no trace in the finished order.** If someone wanted Morning, found
it full, and took Evening, the saved order just says "Evening". Nothing in it records that Morning was
their first choice. If we only measure the finished orders, the "moved" number is always zero and the
figure you want to use to decide when to add a bike is invisible.

So we record the deflection **at the moment it happens**: when the system removes a full window from
what it offers, it writes a row saying which window was full, what the customer took instead, and when.
The daily number is then a count of those rows.

(This is the same shape as the NPS question in the recovery dashboard: we had to record that the
question was *asked* separately from whether it was *answered*, because an ignored prompt leaves nothing
behind. Same lesson, same fix.)

What you will see each day:

- windows that hit their limit, named, with the time each one filled;
- customers moved **window → another window**;
- customers moved **window → anytime**;
- and, so the number means something, how many bookings there were in total.

Ten deflections out of 12 bookings is an urgent bike. Ten out of 300 is a busy Saturday morning.

---

## §6 — The eight decisions we need from you

The first three change what customers are charged or promised, so we would rather not pick for you.

**D1 · The 7 PM promise vs the 6:30 PM window.** Every delivery today is promised "by 7pm". Your
evening window ends at 6:30. Do deliveries move into windows (and the promise becomes 6:30), or does
delivery keep its current "by 7pm, no stated time" behaviour and only **pickup** gets windows? We
recommend windows on both legs with the evening window extended to 7:00 PM, so no existing promise gets
worse.

**D2 · What "anytime" promises.** Is it *today at some point*, or *no time commitment, soonest we can*?
We recommend the second, with a daily cutoff — otherwise an anytime booking at 9 PM implies a rider
tonight.

**D3 · The customer the system moved.** When every window is full and we push someone to anytime, do
they pay ₦2,000 and lose their free-logistics offer? We recommend charging the outside price but
honouring the offer, since it was our capacity, not their choice.

**D4 · What a "bag" is.** See §4.1. We recommend 1 order = 1 bag per leg.

**D5 · One window count or two.** See §4.2. We recommend one shared count per window per day.

**D6 · Monday.** Your windows run Tuesday to Sunday, so **Monday has no windows at all**. As written,
every Monday booking is outside-window at double price. Is that intended — or should a Monday customer
be offered Tuesday Morning at the window price? We recommend offering the next available window, and
only charging the outside price if they actually choose anytime.

**D7 · When the delivery window is chosen.** A standard order is delivered two days later, so at
booking the customer does not yet know the delivery day — and your evening window does not exist on a
Monday. Do they pick a delivery window **at booking** (for a day two days out), or does the system ask
them to confirm one **when the order is ready**? We recommend confirming at ready: it is the only point
where the day is certain and the window has real capacity, and it gives you a second contact with the
customer.

**D8 · Who may change the timing after booking.** If Intake edits an order and the bill is recalculated
(item #7, already specified), can the timing type change too — and who can do it after tagging starts?
We recommend the same rule as the rest of item #7: anyone before tagging, admin only after.

---

## §7 — Items 1 and 2 of your reply: done

### 7.1 The First Experience clock now starts at registration — **and we owe you a correction**

Your answer (b) is in the code. The offer and its clock now start when the account is opened, for
everyone, and a lead one of your reps entered gets both the moment that person registers.

**But what we told you about today's behaviour was wrong, and the truth is worse.** We said that for a
lead you enter, the clock starts the day the rep types the number in. It does not. A lead with no
account **cannot hold an offer at all**, and the offer was only ever handed out at the instant the lead
card was first created — so:

> **a lead your reps entered, who later registered, got no First Experience offer, and never would
> have.** Not an expired one. None.

That is now fixed by the same change. It is worth checking whether any of the leads your reps entered
have since registered, because those people are owed the offer and can be given it manually.

Two more things in that section:

- **Offer length is already a setting**, not a fixed 3 days — it is the offer's own "customer window
  days". Set it to 3 now, change it to 7 whenever you like, no deploy. Exactly what you asked for.
- **"If a staff member creates the account, that counts as registration"** — agreed, and it is true
  automatically, because every account in the system is created through one path. However: **there is
  currently no way for staff to create a customer account at all.** When you book for someone at the
  counter today, the order is attached to their phone number with no account behind it — so no account,
  no offer. If you want "we book for them" to also open an account, that is a small new piece of work;
  tell us and we will add it.

### 7.2 First order only, ₦4,000 minimum, ₦1,000 second-order credit — all configuration, confirmed

We checked each one against the code rather than assuming:

| What you asked for | How it is set |
|---|---|
| First order only | A "first order only" rule on the offer |
| ₦4,000 minimum | A minimum order value, checked **on the bill** at booking |
| ₦1,000 credit on delivery of the first order | A credit benefit — it pays out when the order is **delivered**, which is already how it works |
| Credit lasts 30 days | A credit expiry setting on the offer |
| Free pickup + delivery | Two benefits on the same offer |

No new code. We will set the offer up and show you.

### 7.3 The three notifications — agreed, building it

Agreed as recommended: "hold reassigned" and both "released from hold" go to the station that is
**affected** and never to the person who performed the action. If an Intake operator releases a hold on
an order sitting with Wash & Dry, Wash & Dry is told and Intake is not.

This goes in with the rest of the notification work (your section 10), which is roughly forty places in
the code and is next in the queue.

---

## What we need back

Answers to **D1–D8**. D1, D2 and D3 are the ones that change what a customer pays or is promised; the
other five we have recommended and will build as recommended if you would rather not spend time on
them.

We will not start building item 3 until D1–D5 are settled, since each of them changes the shape of the
data.
