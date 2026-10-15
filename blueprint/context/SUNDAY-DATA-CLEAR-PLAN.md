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

Kept, unchanged:
- your admin login;
- items and prices, item sets;
- offers, plans, booking windows;
- hold types, complaint types;
- display names and every limit and setting;
- message templates.

You correct the settings on Monday and create the real staff and rep accounts.

## 4. Order numbers start fresh
The first real order is **OSC-001**, then OSC-002, and so on.
(Today's numbers carry a date and a random part. We change them to a running number from this point.)

## 5. Check
- We count the records again, so you can see that only your login and the settings remain.
- We sign in with your admin login, open the booking screen, the price list, offers, plans and windows.

## 6. Paystack live
After the clear, Paystack is switched to the **live** keys, and the payment webhook is set in the Paystack
live dashboard. On Monday you make one real N100 payment: from the payment link to the tagging queue. We then
cancel that order.

## Please confirm before Sunday
1. **Your admin login.** The only admin account today is `admin@chuvi.com`. Is that yours, or do you want a
   different email? It still has the default password from setup, so please change it now.
2. **Order numbers.** Is "OSC-001, OSC-002…" the format you want?
3. **Expenses and supplies** (Smart Book records): clear them as test data, or keep them?
