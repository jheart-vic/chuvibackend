# CHUVI: Sunday data clear, the plan

We run this only after you say "go" on Sunday evening, after the floor test. It takes about 30 minutes.
Please make sure nobody uses the apps while it runs.

## 1. Full backup first
- We export every table in the database to dated files kept off the server.
- We check that the number of records in the backup matches the live database before we go on.
- If anything goes wrong at any step, we restore from this backup.

## 2. Paystack: your test plan
- We cancel the Student Plan subscription on your card at Paystack, so it is never charged again.
- We do the same for any other test subscription, then check in the Paystack dashboard that none are left
  active.

## 3. Clear everything that is test data
Deleted:
- **People:** all customer, staff and rep accounts, except your own admin login. This also removes their
  referral codes and wallets.
- **Orders:** all orders, with their holds, payments, recounts and history.
- **Money:** all wallet balances, reward credit, wallet requests and top-up proofs.
- **Plans:** all subscriptions.
- **Referrals:** all referral records.
- **CRM:** all leads and CRM cards, and every queued follow-up message.
- **Customer care:** all complaints, feedback, chats with the assistant and customer care, and customer
  care tasks.
- **Messages and logs:** all notifications, message logs, refused sign-ups, staff activity and audit logs.
- **Reports:** the reports are worked out from the records above, so they start from zero.
- **Smart Book:** expenses and supplies (test entries).

Kept, unchanged:
- your admin login;
- items and prices, item sets;
- offers, plans, booking windows;
- hold types, complaint types;
- display names and every limit and setting;
- message templates.

You correct the settings on Monday and create the real staff and rep accounts.

## 4. Order numbers start fresh
The first real order is **OSC-20261020-001**: OSC, the order's date, then a running serial (002, 003…).

## 5. Check
- We count the records again, so you can see that only your login and the settings remain.
- We sign in with your admin login, open the booking screen, the price list, offers, plans and windows.

## 6. Paystack live
After the clear, Paystack is switched to the **live** keys, and the payment webhook is set in the Paystack
live dashboard. On Monday you make one real N100 payment: from the payment link to the tagging queue. We then
cancel that order.

## Your answers (15 Oct), now in the plan
1. **Admin login: Ijeomahikechukwup@gmail.com.** That email already has an account here (made as a rider), so
   on Sunday it becomes the admin and every other account is deleted, admin@chuvi.com included. It keeps the
   password you set; you can also reset it with Forgot password. Nobody else has it.
2. **Order numbers:** the format you use, OSC, the date, then a running serial. The first real order reads
   **OSC-20261020-001**, then 002, 003 and so on. No CHVI. (Built: from now on every order is numbered this way;
   the clear sets the serial back to 0.)
3. **Expenses and supplies:** cleared as test entries.

## Rehearsed (15 Oct)
On a copy of our test database, never on live: full backup (every count verified), restore of that backup into
a fresh database, then the clear itself. Result: only the kept admin remained, every test table was empty, the
settings and price list were untouched, and the next order numbers came out as OSC-20261020-001 and 002. The
copy was then deleted.
On live we have only counted (nothing changed): 56 accounts and about 6,600 test records would go; one Paystack
subscription is still active and would be switched off first.
