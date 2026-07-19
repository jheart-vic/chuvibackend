# Current Feature: Phase 3 — Offer System

Branch: `feature-wallet-credits` (Phases 1–2 committed/complete before this).

## What it is

The "smart offer linker": staff create offers ONCE in the Offer Builder (admin
dashboard); the system finds the matching existing offer when a CRM event
fires, checks eligibility, links it to the customer, and applies the benefit at
booking. Automated systems NEVER invent offers.

## Binding rules (client decisions)

- Baseline benefits always apply; max ONE personal offer per order; promos
  don't combine with personal offers unless the promo has
  `stackableWithPersonal: true`. One promo per order.
- Eligibility checked at assignment AND again at booking.
- REDEEMED only when the connected order is delivered; cancelled orders release
  the linkage (never consume it).
- Loyalty/referral rewards never assigned twice for the same event
  (milestoneKey dedupe).
- Per-offer credit expiry override (`creditExpiryDays`); defaults from
  RewardSetting.

## Deliverables checklist

- [x] Constants: OFFER_TYPE (personal/promotional/baseline), OFFER_STATUS
  (draft/active/paused/expired/archived), CUSTOMER_OFFER_STATUS
  (assigned/viewed/attached/redeemed/expired/cancelled), OFFER_TRIGGER
  (first-experience/second-order/loyalty/referral-reward/recovery/reactivation/manual),
  OFFER_BENEFIT_TYPE (order-discount/free-pickup/free-delivery/free-items/extra-laundry-credit)
- [x] models/offer.model.js — builder fields: name, headline, description, type,
  trigger (personal only), benefits[] ({benefitType, percent?, amount?,
  minPaidItems?, freeItemCount?, eligibleItemTypes?, maxFreeValue?,
  minOrderValue?, creditAmount?}), rules {stages[], tags[], minOrders,
  maxOrders, daysSinceLastOrder, minOrderValue, minItems, firstOrderOnly,
  serviceTypes[], oneUsePerCustomer}, startDate, expiryDate, usageLimit,
  usedCount, status, stackableWithPersonal, creditExpiryDays, createdBy
- [x] models/customerOffer.model.js — userId, offerId, status, milestoneKey
  (unique w/ offerId when set), expiresAt, orderId, assignedBy, viewedAt,
  redeemedAt; index userId+status
- [x] services/offer.service.js — admin CRUD/status/performance;
  handleTrigger(trigger, {userId, milestoneKey, data}); checkEligibility;
  getCustomerOffers (rewards/promotions/baseline); markViewed;
  validateAndPrice(userId, {customerOfferId?, amount, itemCount, serviceType,
  deliveryAmount, pickupAmount}) enforcing stacking; attachToOrder;
  redeemForOrder(orderId) (on delivered — also grants extra-laundry-credit via
  WalletCreditService); releaseForOrder(orderId) (cancel/correction)
- [x] util/offerHooks.js — fire-and-forget (crmHooks pattern)
- [x] CRM wiring: createLead→first-experience; handleOrderDelivered:
  totalOrders===1→second-order, %5===0→loyalty (milestoneKey `loyalty-N`);
  dormant transition (setStage→DORMANT incl. dormancy scan)→reactivation
- [x] Order wiring: crmOnOrderDelivered path also calls offer redeemForOrder
  (via hook in rider/intake delivered handlers — same spots as crmOnOrderDelivered)
- [x] routes/offer.js at /offers: admin builder CRUD + performance + manual
  assign + cancel linkage; user my-offers, view, validate. Swagger everywhere.
- [x] crons/offerExpiry.js — expire offers past expiryDate + linkages past
  their per-customer expiresAt (daily 02:45); required in server.js
- [x] Communication: assignment sends templateKey 'offer-available'
- [x] Verify with lifecycle script + PORT=7999 boot

## Design decisions

- Offer "usageLimit" = global redemption cap (usedCount incremented on
  redemption). Linkage-level one-use enforced by linkage status.
- Baseline benefits are Offer docs of type baseline with rules; validateAndPrice
  auto-applies active ones (no linkage needed).
- extra-laundry-credit benefit: promised at booking, GRANTED as wallet laundry
  credit only on redemption (order delivered), expiry from offer override or
  RewardSetting default.
- Personal-offer eligibility uses CrmProfile stats when available (totalOrders,
  stage, tags, lastOrderAt), falling back to zero-history for new users.
- No booking-amount mutation inside bookOrder.service yet — the app calls
  /offers/validate to quote, then attaches the offer; deeper integration into
  order creation comes with the frontend work. attachToOrder revalidates.
