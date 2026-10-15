# CHUVI V1: final check, 15 Oct 2026

All tests below run the real system code against our test database, never against live. Each test creates
its own customers and orders, checks the result, then deletes what it made. In total: 566 quick checks and
21 test runs, all passed. Your floor test on Sunday is the real check.

## a. Each item: how it was tested, and the result

**Batch 1**
| # | Item | Tested how | Result |
|---|---|---|---|
| 1a | Change Items refused before pickup is confirmed | Batch 1 test: S1 tries to change items before pickup | Refused. Pass |
| 1b | Change Items refused on plan orders | Batch 1 test: change on a plan order | Refused, admin settles. Pass |
| 1c | No rider customer phone check | Batch 1 test: start, picked up, delivered, failed with no phone code | Works. Pass |
| 1d | A reason on every rejection and hold | Batch 1 test: rejection without a reason; hold tests | Refused without a reason. Pass |
| 1e | No Ready Today on Quick Booking | Batch 1 test + Quick Booking test (67 checks) | Not offered, refused if sent. Pass |
| 1f | Payment holds never Overdue | Batch 1 test: old payment hold | Never shows Overdue. Pass |
| 1g | SMS: N not ₦, no dashes | Direct check of the SMS cleaner | "N4,500", "15:00 to 18:30". Pass |
| 2 | No cash; POS or transfer reference required | Counter payment test (54 checks) | Cash refused, reference required. Pass |
| 3 | Rep tracking report | Batch 1 test: sign-ups, paid customers, money per rep link | Correct counts. Pass |
| 4 | Lead report counts only staff-entered leads | Batch 1 test | Only staff leads counted. Pass |
| 5 | Your SMS texts | Batch 1 test: every SMS captured and compared with your wording | Match. Pass |
| 6 | Sign-up: real Nigerian mobile only | Batch 1 test: bad and good numbers | Bad numbers refused with a clear message. Pass |
| 7 | One phone, one account; admin sees refused attempts with the referral code | Batch 1 test: email form and Google phone step | Refused and logged. Pass |
| 8 | Google main sign-up button; Quick Booking main booking | Screens (frontend) | Frontend |

**Batch 2**
| # | Item | Tested how | Result |
|---|---|---|---|
| 9 | Recount cover, mismatch record and limit, Change Items keeps old and new items | Batch 2 test | Covered within limits, recorded, no cover after the repeat limit. Pass |
| 10 | Only admin cancels; S1 escalates; trips by payment link; return after paid; "Returned unwashed" | Batch 2 test + review test | Pass |
| 11 | Quick Booking pay-by time, expired link note, new ready date | Batch 2 test + ready date test (32 checks) | Pass |
| 12 | Unpaid bill reminders, tasks and admin flag as settings | Batch 2 test with short test timings | Each step fires; tasks close on payment. Pass |
| 13 | Riders: needs rider, failure count, call task, waiting redelivery, fee from 2nd, "Collected", "Possible missing item" | Batch 2 test + dispatch test (80 checks) | Pass |
| 14 | Quiet hours 9 PM to 7 AM | Batch 2 test | SMS queued to 7 AM, follow-ups paused. Pass |
| 14a | Assistant: no estimate, no payment in chat, "talk to someone" opens a complaint | Batch 2 test + a new check today | Today's check found "use my balance" still paid from the wallet in chat. Fixed tonight: the assistant now points to Orders, Pay. Pass |
| 14b | Reward credit on by default at Pay | Batch 2 test + review test | Used once, given back as credit on a recount down. Pass |

**Batch 3 part 1**
| # | Item | Tested how | Result |
|---|---|---|---|
| 16 | S2 corrects colour (White, Light, Dark) and stain tags | Batch 3 test | Corrected, wash group follows, S2's name recorded. Pass |
| 17 (part) | Second rejection of a piece goes to admin; missing piece names tag and station | Batch 3 test + handoff test (54 checks) | "TAG 03 is at Wash & Dry"; stations get "Only admin can release this." Pass |
| 20 | Price per window, Urgent price; 3 PM check of orders due today not at QC | Batch 3 test + window and Urgent tests | Window price charged, blank uses the general price; list and one alert a day. Pass |

The rest of Batch 3 (items 15, 17 routes, 18, 19) is part 2, behind switches.

## b. Read only smoke test on live
What we checked, reading only:
- The live server is up, and the API documentation loads.
- The new screens' addresses exist on live (they ask for a login, an unknown address does not): the
  3 PM due-today list, rep links report, refused sign-ups, customer care tasks, payment check.
- The live database: 57 accounts, 128 orders, 1 settings record with the window and Urgent prices, 15
  hold types (the count hold now reads "Count dispute"), 1 booking window (Evening 15:00 to 18:30), 1
  active Paystack subscription (switched off on Sunday), and Ijeomahikechukwup@gmail.com present.
- The last orders were made at 1 PM today, before the new order numbers went live; the next order will
  use the new numbering.

Nothing was changed: we counted every table before and after the check, and the numbers were identical.

## c. The two Batch 2 items
- **Change Items history:** done. Each change saves the staff name, the old items and the new items.
  Tested in the Batch 2 test.
- **"Possible missing item" alert:** done. When S1 counts fewer pieces than the rider, the order goes on a
  "Count dispute" hold and admin also gets "Possible missing item". Tested in the Batch 2 test.

## d. Sunday data clear plan
We run this only after you say "go" on Sunday evening, after the floor test. About 30 minutes. Please make
sure nobody uses the apps while it runs.

1. **Full backup first.** Every table is exported to dated files kept off the server. We check the backup's
   record counts match the live database before going on. If anything goes wrong, we restore from it.
2. **Paystack.** We cancel the Student Plan subscription and any other test subscription, then check in the
   Paystack dashboard that none are left active.
3. **Clear all test data.** Deleted: all customer, staff and rep accounts except your admin login (with their
   referral codes and wallets); all orders with their holds, payments, recounts and history; wallet balances,
   reward credit, wallet requests and top-up proofs; subscriptions; referral records; CRM leads, cards and
   queued messages; complaints, feedback, chats and customer care tasks; notifications, message logs, refused
   sign-ups, staff activity and audit logs; Smart Book expenses and supplies. Reports start from zero.
   Kept unchanged: your admin login; items, prices and item sets; offers, plans and booking windows; hold
   types and complaint types; display names, limits and settings; message templates.
4. **Admin login: Ijeomahikechukwup@gmail.com.** That account becomes the only admin; every other account is
   deleted, admin@chuvi.com included. It keeps the password you set (or use Forgot password). Only you have it.
5. **Order numbers start fresh.** The first real order is **OSC-20261020-001**, then 002, 003.
6. **Check.** We count again so you can see only your login and the settings remain, then sign in with your
   admin login and open the booking screen, price list, offers, plans and windows.
7. **Paystack live.** After the clear, Paystack is switched to the live keys and the payment webhook is set in
   the live dashboard. On Monday you make one real N100 payment, from the payment link to the tagging queue;
   we then cancel that order.

Rehearsed on a copy of our test database (backup, restore, clear): only the admin remained, the settings and
price list were untouched, and the next numbers came out OSC-20261020-001 and 002.

## Batch 3 part 2: your three points
1. **One switch per part.** Four switches, all off: S2 holds one piece at receipt; routes by service; Iron
   Only per piece upgrade; damage case with "Customer informed". Each can be left off alone.
2. **Orders in the middle of the floor.** The rule we build to: a switch only changes what happens at the
   next step, never an order's past steps, and every station keeps accepting pieces moved either way. Turning
   a switch off never hides a piece: anything it put on hold can still be released the normal way. With part 2
   we send one line per switch saying exactly what happens on and off.
3. **Timing.** Part 2 ready by Saturday 12 noon for your Sunday floor test; what passes you switch on for
   Tuesday, what fails stays off. Code freeze Saturday 9 PM.
