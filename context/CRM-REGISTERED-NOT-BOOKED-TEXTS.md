# "Registered but never booked" — the three message texts, VERBATIM

Supplied by the client 2026-10-08, **revised the same day** to drop every mention of "in a pickup
window" so the sequence can go live BEFORE window booking. **Copy these exactly. Do not paraphrase,
do not re-word, do not "improve" the punctuation.**

These are the DEFAULTS seeded into CRM settings. Seeding is idempotent — it must never overwrite a
text an admin has since edited. **When window booking goes live the client edits these themselves in
CRM settings**; we do not re-seed them.

`{name}` is the customer's **first name**.

---

## Message 1
First send window after **24 hours from registration**.

```
Hello {name}, this is CHUVI. Your first order offer is still open: book any order from ₦4,000 and we pick up and deliver for free. After your first wash, we also add ₦1,000 to your CHUVI wallet for your next order.
To book: go to www.chuvilaundry.com, tap Book, choose your items and pick a pickup time.
For example, one duvet and two bedsheets come to ₦4,000.
Reply here if you want us to help you book.
```

## Message 2
**18:00–20:00** window on the day **before** the offer ends.

```
Hello {name}, your free pickup and delivery ends tomorrow.
Is there a duvet, bedsheets or white clothes you have been planning to give out? Book any order from ₦4,000 and we will come for it and bring it back clean, at no transport cost.
Book here: www.chuvilaundry.com
Or reply here and we will help you book.
```

## Message 3
**06:00–08:00** window on the day the offer **ends**.

```
Hello {name}, today is the last day of your free pickup and delivery.
Book any order from ₦4,000 today and we pick up and deliver for free, plus ₦1,000 in your CHUVI wallet for your next wash.
Book here: www.chuvilaundry.com
After today, pickup and delivery are free only on orders from ₦8,000.
```

---

## Scheduling rules

1. **Global send windows for every follow-up and offer message** — the workflows
   **lead · registered-not-booked · reactivation · prospect broadcast**: **06:00–08:00 or
   18:00–20:00 only**, both admin settings. A message due outside a window **waits for the next
   one**.
   **EXEMPT, and they send immediately: order-ready, delivery-confirmation and feedback-request**
   (the client's rule names only follow-up and offer messages; "order and payment messages still go
   out at once").
2. **Message 1** — first send window at or after 24h from registration.
3. **Message 2** — evening window on the day before the offer ends.
4. **Message 3** — morning window on the day the offer ends.
5. **Edge case the client specified: if the offer ends before 08:00**, send message 3 the evening
   before and message 2 the morning before that. Both shift back one slot; neither is dropped.
6. **Day 7** → move to the prospect list.
7. The sequence **stops the moment they book**.

**Nothing may hardcode "3 days" or "+66h".** The offer length is `offer.customerWindowDays`
(admin-editable) and the customer's First Experience linkage carries `expiresAt`, so every time
above is derived from the offer's real end.

### Their worked example — the harness case
Ada registers **Friday 15:00**; her offer ends **Monday 15:00**:

| Message | Due |
|---|---|
| 1 | Saturday evening (first window ≥ 24h after registration) |
| 2 | Sunday evening (day before the offer ends) |
| 3 | Monday morning (day the offer ends) |

### Dependency the client has taken on
Message 3's last line — *"After today, pickup and delivery are free only on orders from ₦8,000"* —
is only true once a BASELINE free-pickup/delivery offer with a ₦8,000 minimum is active.
**The client said they will switch that on in admin before the sequence starts.** If it is not on,
that line promises something the app will not do. Worth confirming on the day.
