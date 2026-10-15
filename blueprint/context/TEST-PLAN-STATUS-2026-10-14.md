# V1 Test Plan (Back End, 14 Oct 2026): where the code stands

Source: client PDF `CHUVI_V1_Test_Plan_Back_End.pdf` (T1 to T12, rules R1 to R24),
**revised version of 14 Oct** (R2, R3, R5, R6, R7, R17, R24 changed; T1.13, T2.13, T3 and
T8 rewritten). Rows below follow the revised plan.
Method: every step was checked against the code on `main` at 8d28b8e (feature 21
live). This is a **code review, not yet a run**. "Pass" means the code does what
the Expected line says. It still has to be run end to end on testingdb before we
send "Digital pass".

Legend: **Pass** · **Partial** (built, but differs from the Expected line) ·
**Fail** (built, and does something else) · **Not built**.
⚠ = the plan changes a rule the client gave us earlier; confirm before building.

## Summary

| | Pass | Partial | Fail | Not built |
|---|---|---|---|---|
| Steps (about 110) | ~40 | ~25 | ~12 | ~33 |

Biggest gaps: recount cover (R17), station rejections and the second rejection
going to admin (R2, R5), damage case (R6), "looks dirty" (R8), per-piece routes
(R4), cancellation by admin only (R12), "customer not available" flows (R22),
payment timers and pay-by time (B9, R21), quiet hours (R23), and most of the
R24 settings.

**One live bug found (P1), FIXED 14 Oct (fix/admin-only-hold-release):** S1 could release the "Count differs from rider" hold.
The hold type is seeded `requiresAdminApproval: true`, but nothing enforces it:
`intake-user.service.js releaseFromHold` never reads the hold type. This breaks
the client's locked rule (admin only) and is T3.04.

## T1 · Amaka's first order

| Step | Result | What happens now |
|---|---|---|
| T1.01 | Partial | Signing up on a referral link links the account. No admin view per rep of who signed up, who paid and how much (not found). |
| T1.02 | Pass | Offers and First Experience as built (B15). |
| T1.03 | Pass | One total; each offer is its own line in `pricing.breakdown`. |
| T1.04 | Partial | Paystack and the order turning Paid work. **No "booking received" SMS** exists. |
| T1.05 | Pass | S1 assigns; the job shows only on that rider's list. |
| T1.06 | **Fail** | Change Items has no "pickup confirmed" check, so S1 can change items before pickup. |
| T1.07 | **Fail** | Start pickup **requires the customer's phone number** (as do picked up, delivered and failed). |
| T1.08 | Partial | Flag (no stop) and SMS work, but the rider must type a reason. The SMS text differs: "we collected 11 item(s) … (you booked 10)", with no phone number to call. |
| T1.09 | Pass | Rider and S1 agree, so there is no hold. |
| T1.10 | Not built | No recount cover (revised R17: both limits, 10% of the bill and a naira amount; launch 10% and N200, test 10% and N600). N600 more raises a payment hold plus a link SMS (with the ₦ sign). The SMS always goes out. No mismatch record. The change saves only piece counts and totals, not the old and new items. |
| T1.11 | Pass | One piece record per tag; colour White/Light/Dark. |
| T1.12 | Pass | S1 to S2 sends the whole order; `pushedAt` saved; after tagging only admin can change items. |
| T1.13 | Pass | Revised plan: S2 checks the list and taps All received. Confirming the S1 to S2 handoff with nothing rejected receives every piece and saves the time. |
| T1.14 | Pass | S2 can set stain, fabric and damage marks after accepting. |
| T1.15 | Pass | Pretreatment saved per piece; pieces move one by one. |
| T1.16 | Pass | `pushedAt` lets the screen turn red; 30 min is a front-end rule. |
| T1.17 | Pass | Partial sends are allowed between S2, S3 and S4. |
| T1.18 | Partial | Press is one action, but the order status is still named `ironing`. |
| T1.19 | Pass | QC gets the order only when every piece is there. |
| T1.20 | Partial | Ready only at pack. **No Ready SMS.** |
| T1.21 | Partial | Delivery works, but needs the customer's phone. **No Delivered SMS** (only the CRM delivery message, 1 hour later). |
| T1.22 | Pass | Addresses and rider log with names and times. |
| T1.23 | Partial | The feedback delay is an admin setting (CRM post-delivery, default 1 day). Quiet hours are not enforced for it. |
| T1.24 | Pass | One status computed from the pieces. |

## T2 · Emeka, Quick Booking through the assistant

| Step | Result | What happens now |
|---|---|---|
| T2.01 | Pass | The bot offers only the services set up. |
| T2.02 | **Fail** | The bot answers "how much" with a per-piece price. The plan wants no estimate. |
| T2.03 | Not verified | Asking again on a "morning … 2 PM" clash: needs a bot run. |
| T2.04 | Partial | Display names, real prices and ready dates are built. Ready Today is **not** blocked for Quick Booking. |
| T2.05 | Partial | Booking is saved; **no "booking received" SMS**. |
| T2.06 | **Fail** | "Talk to someone" hands the chat to a person; it does **not** open a complaint. |
| T2.07 | Partial | As T1.08. |
| T2.08 | Pass | No hold when the rider and S1 agree. |
| T2.09 | Pass | One piece record per item. |
| T2.10 | Pass | Bill made and Paystack link created (Quick Booking item 6). |
| T2.11 | **Fail** | Bill SMS has **no pay-by time, no ready date and no expired-link note**, and uses ₦. |
| T2.12 | Partial | The payment hold sits apart from the floor holds. Payment holds **do** turn Overdue after 48 h. A "check payment / resend link" action is not confirmed. |
| T2.13 | **Fail** | Reminders are hard-coded at 6 h and 24 h, and the admin alert at 48 h. **No officer task.** Not settings. |
| T2.14 | Partial | Pay in the app creates a new link. Reward credit is opt-in (asked), not on by default. |
| T2.15 | Pass | The webhook clears the hold and the order goes to tagging by itself. |
| T2.16 | Pass | As T1. |
| T2.17 | Partial | A rejected piece goes to the sending station's holds. **No reason is required.** |
| T2.18 | Pass | Fixed piece can be sent again. |
| T2.19 | **Fail** | "Delivery failed" goes back to **Ready**. No "Ready, waiting redelivery", **no SMS, no failure count**. |
| T2.20 | Not built | No redelivery fee rule (first free, then charged). |
| T2.21 | Pass | A low score appears on the customer experience feedback list. |

## T3 · Obinna: missing piece, damaged piece

| Step | Result | What happens now |
|---|---|---|
| T3.01 | **Fail** | Ready Today is not blocked on Quick Booking. |
| T3.02 | Pass | |
| T3.03 | Partial | Hold raised and admin alerted, but the hold is named "Count differs from rider count" and there is **no "Possible missing item"** alert. |
| T3.04 | Pass | Fixed 14 Oct: non-admins get "Only admin can release this." (requiresAdmin true) at Intake and at every station; S1 also can no longer release an unpaid payment hold. |
| T3.05 | Pass | Admin resolves, with name and time. |
| T3.06 | Pass | S1 marks the transfer paid with a reference (admin notified, bank-check list). |
| T3.07 | Partial | Routes are **not enforced by service**. Any forward move is allowed, so a front-end mistake could send T3 to S4. |
| T3.08 | Partial | Revised R6: damage now HOLDS the piece. S3 can hold one piece with a reason and the other pieces move on (item-level holds). There is no "Damaged" hold type and **no damage case** for customer experience with admin copied. |
| T3.09 | Pass | QC cannot receive the order while a piece is held (whole-order gate into QC, and held pieces cannot move). |
| T3.10 | Not built | No "Customer informed" step, so nothing makes admin release wait for it. The admin-only release itself now exists (14 Oct fix), so a "Damaged" hold type marked admin-only would cover "only admin releases". No partial delivery approval and no free second trip. |
| T3.11 | Partial | Customer experience can grant compensation on a case with a reason. It goes in as **recovery credit**, not a wallet refund, and the limit setting is N10,000, not N5,000. |
| T3.12 | Partial | Per-rider history exists. An admin filter by rider and date is not confirmed. |

## T4 · Iron Only with a dirty shirt

| Step | Result | What happens now |
|---|---|---|
| T4.01 | Pass | Wallet payment. |
| T4.02 | Partial | Route not enforced (see T3.07). |
| T4.03 to T4.05 | Not built | No "Looks dirty", no suggestion for S1, **no per-piece service** (the order has one service), no difference link. |
| T4.06 | Partial | Blocked, but the message is generic ("all items must be at …"). It does not name TAG 03 and where it is. |
| T4.07 | Pass | |
| T4.08 | Not built | 3-hour link expiry, "pressed as booked", note and message. |

## T5 · Obinna isn't home, then hands over more

| Step | Result | What happens now |
|---|---|---|
| T5.01 | Pass | |
| T5.02 | **Fail** | Pickup is set to `failed`. It does not go back to Needs rider, and no failure is recorded against the customer. |
| T5.03 | Not built | No "2 failed pickups: call customer" task. |
| T5.04 | Partial | As T1.08. |
| T5.05 | Partial | Charged in full with link and payment hold (correct, as there is no cover yet). No mismatch record. |
| T5.06 | Pass | |
| T5.07 | Pass | QC rejection goes to S4's holds. |
| T5.08 | Not built | Second rejection does not go to admin; no "Only admin can release this". |
| T5.09 | Pass | |
| T5.10 | Partial | Counts match the lists (B33). Payment holds **do** become Overdue at 48 h. |

## T6 · Amaka brings fewer shirts

| Step | Result | What happens now |
|---|---|---|
| T6.01 | Pass | Self drop off creates no rider job. |
| T6.02 | Partial | N600 goes back to the wallet automatically and an SMS is sent (with ₦). No mismatch record. |
| T6.03 | Not built | No Ready SMS (with collection hours). |
| T6.04 | Not built | No "Collected" status: it ends as Delivered. |

## T7 · Ifeoma walks in, Ready Today

| Step | Result | What happens now |
|---|---|---|
| T7.01 | Pass | Walk-in Ready Today with the limit (launch item 3). |
| T7.02 | **Fail** ⚠ | **Cash is allowed and is the default** (earlier client ruling). The plan says no cash. A POS receipt number is not required. |
| T7.03 | Not built | No 3 PM check of orders due today that are not at QC (the admin "due today" count exists, with no alert). |
| T7.04 | Not built | No Collected status. |

## T8 · Kene, transfer and wrong tag

| Step | Result | What happens now |
|---|---|---|
| T8.01 | Pass | Walk-in transfer confirmed by S1, no admin step. |
| T8.02 | Pass | Sent, untagged piece included (see T8.04). |
| T8.03 | Not built | Revised R7: S2 may correct S1's colour and stain tags. Today S2 cannot change the tag colour (it only has its own two-value `colorGroup`, white or coloured, against R10). Keeping both versions is "after launch". |
| T8.04 | **Fail** | Revised R2: hold only the untagged piece at receipt and receive the rest. Today the S1 to S2 handoff is whole-order: "accept every item or reject every item", so S2 cannot receive TAG 01 and TAG 02 while holding TAG 03. A "Something is missing" reason is not required either. |
| T8.05 | **Fail** | Sending one fixed piece from S1 to S2 is refused by the same whole-order gate ("must include every item in the order"). |
| T8.06 | Not built | Second rejection of the same piece does not go to admin. |
| T8.07 | Pass | Admin resolves; names and times saved. |

## T9 · Amaka rejects her bill

| Step | Result | What happens now |
|---|---|---|
| T9.01 | Pass | |
| T9.02 | **Fail** ⚠ | **S1 can cancel** (before processing), and there is no "Escalate for cancellation" for S1. Customer cancellation requests are approved by customer experience, not admin. |
| T9.03 | Partial | Admin cancel works with a reason, and the pickup and delivery fee is worked out, but it is charged from the wallet, not sent as a payment link. |
| T9.04 | Not built | Nothing blocks the return before she pays. |
| T9.05 | Not built | No "Returned unwashed" status. |

## T10 · Wallet money

| Step | Result | What happens now |
|---|---|---|
| T10.01 | Pass | Paystack top-up is instant. |
| T10.02 | Pass | Transfer top-up (upload proof) lands in admin's verification queue; S1 cannot approve it. |
| T10.03 | Pass | Admin accepts, with name and time. |
| T10.04 | Pass | Admin rejects with a reason; customer notified. |
| T10.05 | Partial | Limits are per role and settable, but the seeded customer experience limit is N10,000 (needs 5,000). The case compensation route is separate from wallet adjust. |
| T10.06 | Pass | Every credit row carries a note (B13 fix). |

## T11 · Plans

| Step | Result | What happens now |
|---|---|---|
| T11.01 | Pass | |
| T11.02 | Pass | |
| T11.03 | **Fail** | Change Items on a plan order prices it as money. It must return plan items, or be refused on plan orders (the client's fallback). |
| T11.04 | Not built | Plan items first, then a link for the rest. |

## T12 · Time rules

| Step | Result | What happens now |
|---|---|---|
| T12.01 | Not built | No quiet hours for SMS. |
| T12.02 | Not built | No pay-by time or ready-date recompute from the payment time. |
| T12.03 | Not built ⚠ | Ready date is **kept** on any count change (client ruling 12 Oct). The plan now wants a recompute when the count is more than 2× the booking. |
| T12.04 | Not built | No cover, so no repeat-mismatch limit or alert. |
| T12.05 | Not built | No 9 AM next-day reminder. |
| T12.06 | Pass | Feature 21, live 14 Oct. |
| T12.07 | Not built | Feedback is not held back during quiet hours. |

## Checks and settings

- **R24 settings:**
  - Exist: daily limit 150, Ready Today 30, Express 50; speed display names; per hold-type time limit; feedback delay (CRM schedule); refund limits per role.
  - Missing: recount cover; repeat mismatch limit; pay-by time; reminders (3 h, 9 AM); officer task 24 h; admin flag 7 days; Quick Booking 2× trigger; Iron Only answer time; due-today time; quiet hours.
- **SMS templates in admin:** CRM and communication templates are editable. Order SMS (bill, count, refund, payment) are written in code. Many use ₦ and dashes.
- **Names, not codes:** hold reasons come from hold types (names). Some history events still show internal station keys.
- **Errors:** every endpoint returns `{ success:false, data:{ error } }`.

## Proposed order of work (backend only)

1. **Today (fixes, about 1 day):** ~~the P1 admin-only hold release~~ (done 14 Oct); no Change Items before pickup; Change Items refused on plan orders (R18 fallback); no customer phone check at pickup or delivery; a reason required on every rejection and hold; Quick Booking without Ready Today; payment holds never Overdue; SMS cleanup at the single sender (N for ₦, no dashes).
2. **Counts and riders (about 2 days):** R22 rider SMS text; "Count dispute" and "Possible missing item"; not available at pickup goes back to Needs rider, with failures counted and an officer task after 2; delivery failed goes to "Ready, waiting redelivery" with an SMS and the redelivery fee; Collected; Returned unwashed.
3. **Money (about 2 to 3 days):** R17 cover, mismatch record and repeat limit; Change Items saving old and new items; R12 escalate and admin-only cancel with a pickup and delivery link, return blocked until paid; R16 no cash and POS receipt number; R20 limit 5,000.
4. **Timers and messages (about 2 days):** payment reminders, officer tasks (24 h then 72 h) and admin flag as settings; pay-by time and ready-date recompute (R21); 2× trigger; booking received, ready and delivered SMS; 3 PM due-today alert; quiet hours queue; R24 settings.
5. **Stations (about 3 days):** per-piece hold at S2 receipt with the rest received, and S2 correcting colour and stain tags (revised R2, R7); second rejection of a piece to admin (R2, R5); route per piece and per-piece service (R4, R8); damage hold, damage case, "Customer informed" before admin release, partial delivery with a free second trip (revised R6); Looks dirty with a 3-hour link (R8); R10 colours at S2; missing-piece message.
6. **Rep tracking report** (about half a day).

Estimate: **about 10 to 12 working days of backend work**, plus front end, plus
one full digital run. It cannot all land before Friday's launch, so the client
needs to choose what must be in for launch.
