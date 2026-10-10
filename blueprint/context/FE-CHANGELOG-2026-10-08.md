# Backend changes for the frontend — 8 October 2026

Everything here landed **after** `FE-CHANGELOG-2026-10-07.md`. That file is still valid and its three
breaking items still apply; this one does not repeat them.

**Read §1 first.** Those four are the only ones that can make a screen show a wrong number, a blank,
or an error where it used to succeed. §2 is new surface you can pick up when you want it. §3 answers
the two "missing endpoint" reports.

---

## §1 — Things that need an FE change

### 1.1 BREAKING · `avgProcessingTime` can now be `null`

On the admin dashboard, `data.message.avgProcessingTime` used to always be a number. It is now
**`null`** whenever no order became Ready today with a recorded production start, and a new sibling
`processingTimeNote` carries the text to print:

```json
{ "avgProcessingTime": null, "processingTimeNote": "Not enough data yet" }
```

When there IS data, `avgProcessingTime` is the number and `processingTimeNote` is `null`.

This is the client's own instruction: a `0` is indistinguishable from an instant turnaround, and the
figure is **0 on day one for everyone**, because it measures a timestamp (`productionStartedAt`) that
did not exist before this deploy. Orders tagged before it are excluded rather than guessed at, and
`ordersReadyTodayAwaitingStamp` tells you how many were left out, so the card can say "based on 4 of
11 orders" instead of looking broken.

**If you render `avgProcessingTime` without a null guard you will print "null" or crash.**

### 1.2 `avgCostPerItem7Days` is deprecated — move to `avgRevenuePerItem7Days`

The client corrected both the maths and the name. The figure is **revenue** per garment, not cost, and
it is now **total ÷ total** rather than the average of each day's rate. On their own test data the card
moves from ₦1,750 to ₦1,636 — the same money, a less misleading average.

- new: `avgRevenuePerItem7Days`, `totalItems7Days`, `avgRevenuePerItem7DayBreakdown`
- `avgCostPerItem7Days` is **kept as a mirror of the new value for one release** so the live screen
  does not go blank on deploy. It will be removed — switch the binding.

### 1.3 Two dashboard numbers deliberately go DOWN, and one label now ships from the backend

Not breaking, but the client will see it, so the screen should explain itself.

- **Average daily revenue now divides by all 7 days**, not just the days that took money. On 2 trading
  days in 7 the card falls from ₦45,000 to ₦12,857. New `revenueDaysWithSales` + `revenueDaysCounted`
  are there so you can print "2 of 7 days took money".
- **The dormant-rate card is renamed from the backend.** Use `dormantRateLabel`, `dormantRateBasis` and
  `dormantWindowDays` instead of a hard-coded title, so the UI and the API can never disagree about
  what the number means. The figure and the 30-day window are unchanged — they were always correct.

### 1.4 BREAKING-ish · Creating a counter order can now return 400

`POST /api/intake-user/create-book-order` used to succeed whenever the payload validated, because it
stamped every counter order as paid. It now actually settles the payment, so there are three new
**400** cases — and in all three **no order is created and no money moves**:

| Why | What the message says |
|---|---|
| unknown `paymentMethod` | `"bitcoin" is not a counter payment method. Pick one of: cash, POS, bank transfer, wallet.` |
| `wallet` on a walk-in with no account | `This order has no customer account on file, so there is no wallet to charge…` |
| `wallet` cannot cover the bill | `The wallet covers ₦3,500 of this ₦5,000 order. Choose how the remaining ₦1,500 is paid…` |

The third one is the normal flow, not an error state: show the message, let the operator pick, and
resend with `secondaryPaymentMethod`. See §2.1 for the request fields.

---

## §2 — New surface you can use

### 2.1 Counter payment from the wallet (client item #8)

`POST /api/intake-user/create-book-order` takes three new OPTIONAL fields:

| field | values | meaning |
|---|---|---|
| `paymentMethod` | `cash` · `pos` · `bank-transfer` · `wallet` | Omitted means `cash`, which is what a counter order was implicitly treated as before, so existing calls are unaffected. `"transfer"` and `"card"` are accepted as aliases. `paystack` is **not** a counter tender. |
| `secondaryPaymentMethod` | `cash` · `pos` · `bank-transfer` | Only with `paymentMethod: wallet`, to settle the part the wallet cannot cover. |
| `useCredit` | boolean, default **false** | Opt in to spending the customer's reward credit (referral / recovery / promotional) on this bill. Defaults to false on purpose — staff must not spend a customer's reward without asking. Credit only counts towards wallet sufficiency when this is true. |

With `wallet`, the customer's balance is **really debited** and a `WalletTransaction` ledger line is
written, which is the whole point of the item. The customer is resolved by **phone number** (it used
to be by full name alone, which collides).

The success response gains `data.payment` **beside** `data.message`, not inside it:

```json
{ "success": true, "data": {
    "message": { "...the order..." },
    "payment": {
      "tenders": [ { "method": "wallet", "amount": 3500 }, { "method": "cash", "amount": 1500 } ],
      "creditApplied": 0, "cashFromWallet": 3500,
      "paymentIds": ["..."], "summary": "₦3,500 by wallet + ₦1,500 by cash"
    } } }
```

The order itself now carries a `counterPayment` block with the same tender list, so an order detail
screen can show how the money arrived. A wallet-only order is stamped `billingType: pay-from-wallet`;
a **split** order stays `pay-per-item`, because the wallet only part-paid it.

### 2.2 Offers at checkout (client item #6)

`POST /api/offers/booking-options` gains two keys:

- **`checkoutPrompt`** — `{ show, message, customerOfferId, offerName, billValue, count }`.
  When `show` is true, render `message` **verbatim**; it is the client's exact wording
  ("You have a first time offer. Tap to use it."). The backend decides whether the customer really has
  a usable offer on this cart, so the prompt and the eligibility rule cannot drift apart.
- **`autoApply`** — the personal offer Quick Booking will apply without asking: the one worth **more on
  this bill** (discount plus any pickup/delivery fee it waives; a promised future credit is not
  counted). Ties go to the offer expiring soonest. `otherOffersKept` is how many survive for later.
  It is exposed on the normal booking screen too so both paths visibly agree about which is "best".

Personal offers in `personal[]` now also carry `expiresAt` (the linkage's own expiry, not just the
derived `expiresInDays`).

### 2.3 Duplicate CRM profiles (client item #9)

- `GET /api/admin/profile-duplicates` — the report. **Writes nothing.** Every phone number that maps to
  more than one CRM card, with the older card that would survive, exactly what the merged card would
  look like, what carries over (orders, wallet balance, scheduled + logged messages), and `blockers[]`.
- `POST /api/admin/profile-duplicates/merge` — `{ phone }` or `{ keepId }`, plus an optional `note`.
  One phone number per call. Refuses with its reason, before writing anything, when a pair cannot be
  combined (today: both cards linked to different user accounts — two logins and two wallets).

### 2.4 Staff suspension (this was your report — it was real)

Every reader of `User.status` already existed and **nothing could ever write it**, so suspension was
unreachable. Now:

- `GET /api/admin/staff` — list, filter by role/status/search, with `canWork` and counts per status.
- `PATCH /api/admin/staff/:id/status` — the only writer of `User.status`. Reason required for anything
  but `active`. Idempotent (`changed: false` on a repeat).

It bites at **sign-in**, at assignment, and in the riders list. It deliberately does not reassign work
already given to that person; the response says so in `effect`.

### 2.5 Hold types (client section B)

Admin-created hold types with their own editable time limits and the stations allowed to raise them:
`GET|POST /api/admin/hold-types`, `PUT|DELETE /api/admin/hold-types/:id`, schema `HoldType`.

Two things worth knowing:

- `slaHours: null` means **"follow the order's delivery speed"**, and every operational type seeds that
  way — so nothing changes on the floor until an admin sets a number.
- The order-level hold block is **`orderHold`**, not `holdDetails`. `holdDetails` is on the ITEM and an
  item hold does **not** put the order on hold, so Holds Management is order-level only.

### 2.6 Customer transaction list now includes manual adjustments

`GET /api/wallet/fetch-user-transactions` read only the `Payment` collection. A manual adjustment
writes a `WalletTransaction` and no `Payment`, so **the customer never saw it** — the client's original
"the money has no record" complaint was still true. It is now a union of both, and each row carries
**`source: 'payment' | 'wallet'`**. Amounts are shown positive with `alertType` beside them; direction
comes from the sign, never the type. Do not assume every row has Payment-only fields such as
`reference` or `channel`.

---

## §3 — Your two "missing endpoint" reports

Both were a **stale deploy**, not a gap:

1. `GET /api/admin/wallet-transactions` exists (built 7 Oct) — the admin-side wallet ledger, filterable
   by `userId`/`search`/`type`/`status`/`from`/`to`, with customer and operator resolved to names and
   `totals {credit,debit,net}` over the whole filtered set.
2. Phone normalisation shipped with brief 4.6.

Everything from 7 Oct onwards is now on `origin/main` (PR #242). If you are testing against something
older, that is the explanation for both.

Also: the dormant-rate and Q1–Q8 answers you asked for again are written up in
`blueprint/context/CLIENT-ANSWERS-oct2026.md`.
