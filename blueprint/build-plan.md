# Build Plan

List the features that make up your project, high level and in rough build order.
Keep each item to one line; the details come later in `/feature`.

Run `/feature` to spec the next unchecked item, or `/feature 2` to pick one.
Keep completed items checked and append new features as the project grows.
Do not renumber completed features; their archived specs refer to those IDs.

## Your features

Shipped before the Blueprint was adopted (2026-10-09):

- [x] 1. **Customer accounts** - email, Google and Apple sign-in, OTP, profile, addresses, phone normalisation
- [x] 2. **Order booking and pricing** - service types, tiers, speeds, capacity, item pricing and item sets
- [x] 3. **Staff laundry pipeline** - intake-and-tag to rider, station handoffs, item-level holds with SLAs
- [x] 4. **Payments and wallet** - Paystack card and webhook, wallet, bank transfer and counter payment
- [x] 5. **Subscriptions and plans** - monthly item limits and the weekly free pickup/delivery allowance
- [x] 6. **Admin panel APIs** - settings, dashboard, display names, hubs, staff, expenses, supplies, search, audit
- [x] 7. **CRM smart customer notebook** - stages, tags, workflows, broadcasts, lead reporting
- [x] 8. **Wallet and Credit** - typed reward credit sub-balances with expiry
- [x] 9. **Communication layer** - templates, in-app and SMS delivery, delivery log
- [x] 10. **Offer System** - offer builder, multi-trigger targeting, booking-time pricing
- [x] 11. **Feedback and Recovery** - complaint cases, SLA escalation, recovery orders and credits, complaint chat
- [x] 12. **Referral** - codes, first-order rewards, advocacy levels
- [x] 13. **In-app assistant bot** - intent classification, confirmed actions, human handoff, WebSockets
- [x] 14. **October 2026 developer brief** - 22 fixes, Quick Booking, booking windows, payment hold, order editing

Planned (order follows the program plan in `blueprint/context/chuvi-program-plan.md`):

- [ ] 15. **End-to-end platform validation** - scripted run of the full journey and a written baseline report
- [ ] 16. **Workforce Command and Staff OS** - vertical context, multi-role staff, training, Floor Lead, standards, staff cases
- [ ] 17. **Logistics System** - standalone dispatch vertical with jobs, missions, pricing and reconciliation
- [ ] 18. **Smart Book v2** - operations, cost, reporting and learning across every vertical
- [ ] 19. **Recurring offers** - scheduled offer windows and cadenced group notifications (deferred by client)
- [ ] 20. **WhatsApp bot reconnection** - thin channel over this backend (separate budget)

> TODO (confirm): items 15 to 18 are awaiting client sign-off on the program plan.
> Items 19 and 20 are placed last only for lack of a stated order.
