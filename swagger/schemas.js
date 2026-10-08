/**
 * @swagger
 * components:
 *   schemas:
 *     Plan:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 65a7d3e9b8f9c10012a9c321
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         duration:
 *           type: string
 *         price:
 *           type: integer
 *         monthlyLimits:
 *           type: integer
 *           description: Items covered per month.
 *         freePickupDeliveryPerWeek:
 *           type: integer
 *           description: Free pickup/delivery legs per rolling week (pickup & delivery counted separately). Editable per plan.
 *           example: 4
 *         features:
 *           type: array
 *           items:
 *             type: string
 *         paystackPlanCode:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */











































/**
 * @swagger
 * components:
 *   schemas:
 *     PaginationMeta:
 *       type: object
 *       properties:
 *         totalDocs:
 *           type: integer
 *           example: 25
 *         limit:
 *           type: integer
 *           example: 10
 *         page:
 *           type: integer
 *           example: 1
 *         totalPages:
 *           type: integer
 *           example: 3
 *         hasNextPage:
 *           type: boolean
 *           example: true
 *         hasPrevPage:
 *           type: boolean
 *           example: false
 *
 *     PaginatedPlans:
 *       type: object
 *       properties:
 *         docs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Plan'
 *         totalDocs:
 *           type: integer
 *         limit:
 *           type: integer
 *         page:
 *           type: integer
 *         totalPages:
 *           type: integer
 *         hasNextPage:
 *           type: boolean
 *         hasPrevPage:
 *           type: boolean
 *
 *     PaginatedResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           $ref: '#/components/schemas/PaginatedPlans'
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ProfileDuplicateReport:
 *       type: object
 *       description: >
 *         Client item #9 — every phone number that maps to more than one CRM card, with what a merge
 *         would do and what stops it. The report writes nothing.
 *       properties:
 *         totalProfiles: { type: integer, example: 412 }
 *         duplicatePhones: { type: integer, example: 6 }
 *         mergeable: { type: integer, example: 5, description: Groups with no blockers }
 *         blocked: { type: integer, example: 1 }
 *         note: { type: string, example: "Nothing has been merged. Merge one phone at a time with POST /api/admin/profile-duplicates/merge." }
 *         groups:
 *           type: array
 *           description: Worst first — the groups a human must look at before anything else.
 *           items:
 *             type: object
 *             properties:
 *               phone: { type: string, example: "08031234567" }
 *               keepId: { type: string, example: 665f1c2ab9e77a0012d4e300, description: The OLDER card, which survives }
 *               absorbIds:
 *                 type: array
 *                 items: { type: string, example: 665f1c2ab9e77a0012d4e301 }
 *               mergeable: { type: boolean, example: true }
 *               cards:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: 665f1c2ab9e77a0012d4e300 }
 *                     fullName: { type: string, nullable: true, example: "Tunde Adeyemi" }
 *                     phoneNumber: { type: string, example: "8031234567" }
 *                     normalizedPhone: { type: string, example: "8031234567" }
 *                     userId: { type: string, nullable: true, example: 64d3c9c0f1b2a8e9d0f12345 }
 *                     hasAccount: { type: boolean, example: false }
 *                     stage: { type: string, example: lead }
 *                     totalOrders: { type: integer, example: 0 }
 *                     totalSpent: { type: number, example: 0 }
 *                     leadSource: { type: string, example: lead }
 *                     createdAt: { type: string, format: date-time }
 *                     role: { type: string, enum: [survives, absorbed], example: survives }
 *               willBecome:
 *                 type: object
 *                 description: What the surviving card looks like after the merge.
 *                 properties:
 *                   userId: { type: string, nullable: true, example: 64d3c9c0f1b2a8e9d0f12345 }
 *                   referralCodeComesFrom: { type: string, example: "the account card" }
 *                   stage: { type: string, example: active }
 *                   totalOrders: { type: integer, example: 4 }
 *                   totalSpent: { type: number, example: 36000 }
 *                   tags: { type: array, items: { type: string }, example: ["express-user"] }
 *                   firstOrderAt: { type: string, format: date-time, nullable: true }
 *                   lastOrderAt: { type: string, format: date-time, nullable: true }
 *               carriesOver:
 *                 type: object
 *                 properties:
 *                   scheduledMessages: { type: integer, example: 2 }
 *                   messageLogs: { type: integer, example: 7 }
 *                   walletBalance: { type: number, nullable: true, example: 2500 }
 *                   ordersOnTheAccount: { type: integer, nullable: true, example: 4 }
 *                   walletNote: { type: string, example: "The wallet belongs to the account, and the account moves to the surviving card, so the balance follows untouched." }
 *               blockers:
 *                 type: array
 *                 description: Non-empty means the merge is REFUSED until a human decides.
 *                 items:
 *                   type: object
 *                   properties:
 *                     code: { type: string, enum: [two-accounts], example: two-accounts }
 *                     message: { type: string, example: "Both cards are linked to DIFFERENT user accounts..." }
 *                     userIds: { type: array, items: { type: string } }
 *
 *     CrmProfile:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 665f1c2ab9e77a0012d4e9f1
 *         userId:
 *           type: string
 *           nullable: true
 *           description: Linked user account — null for WhatsApp/walk-in leads without an account
 *           example: 64d3c9c0f1b2a8e9d0f12345
 *         fullName:
 *           type: string
 *           example: John Doe
 *         phoneNumber:
 *           type: string
 *           example: "+2348151128383"
 *         normalizedPhone:
 *           type: string
 *           example: "2348151128383"
 *         email:
 *           type: string
 *           example: john@example.com
 *         stage:
 *           type: string
 *           enum: [lead, first-order, active, loyal, dormant, reactivated]
 *           example: active
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *             enum: [whatsapp, website, walk-in, express-user, standard-user, high-volume, low-volume, high-frequency, low-frequency, new-customer, repeat-customer, loyal-customer, reactivated-customer, fresh-lead, prospect, cold-lead, complaint, recovery-required, churned]
 *           example: [website, repeat-customer, standard-user, low-volume, high-frequency]
 *         channel:
 *           type: string
 *           enum: [whatsapp, website, office]
 *           example: website
 *         totalOrders:
 *           type: integer
 *           example: 3
 *         expressOrders:
 *           type: integer
 *           example: 1
 *         totalSpent:
 *           type: number
 *           example: 42500
 *         firstOrderAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastOrderAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         nextFollowUpAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: When the next automated follow-up fires — "what happens next"
 *         wasDormant:
 *           type: boolean
 *           example: false
 *         dormantSince:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         broadcastLists:
 *           type: object
 *           properties:
 *             prospect:
 *               $ref: '#/components/schemas/CrmBroadcastMembership'
 *             churn:
 *               $ref: '#/components/schemas/CrmBroadcastMembership'
 *         stageHistory:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               from: { type: string, example: first-order }
 *               to: { type: string, example: active }
 *               note: { type: string, example: Order delivered }
 *               changedBy:
 *                 type: string
 *                 nullable: true
 *                 description: Staff user id — null when the change was automatic
 *               changedAt: { type: string, format: date-time }
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     CrmBroadcastMembership:
 *       type: object
 *       properties:
 *         active:
 *           type: boolean
 *           example: false
 *         joinedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         lastSentAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *
 *     CrmFollowUp:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 665f1c2ab9e77a0012d4e9f3
 *         profileId:
 *           type: string
 *           example: 665f1c2ab9e77a0012d4e9f1
 *         workflow:
 *           type: string
 *           enum: [lead, post-delivery, reactivation, broadcast]
 *           example: post-delivery
 *         messageType:
 *           type: string
 *           enum: [lead-welcome, lead-qualify, lead-offer, lead-close, lead-reminder-1, lead-reminder-2, lead-mark-prospect, order-ready, delivery-confirmation, feedback-request, reorder-prompt, reactivation-1, reactivation-2, reactivation-3, reactivation-mark-churned, prospect-broadcast, churn-broadcast]
 *           example: feedback-request
 *         dueAt:
 *           type: string
 *           format: date-time
 *           example: 2026-07-28T10:15:00.000Z
 *         status:
 *           type: string
 *           enum: [pending, sent, cancelled, failed]
 *           example: pending
 *         cancelIfOrdered:
 *           type: boolean
 *           example: true
 *         sentAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         channelUsed:
 *           type: string
 *           nullable: true
 *           example: whatsapp
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     CrmMessageLog:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 665f1c2ab9e77a0012d4e9f4
 *         profileId:
 *           type: string
 *           example: 665f1c2ab9e77a0012d4e9f1
 *         workflow:
 *           type: string
 *           example: post-delivery
 *         messageType:
 *           type: string
 *           example: feedback-request
 *         channel:
 *           type: string
 *           example: sms
 *         content:
 *           type: string
 *           example: Hi John, how did we do on your last order?
 *         success:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     CrmSettings:
 *       type: object
 *       properties:
 *         templates:
 *           type: object
 *           additionalProperties:
 *             type: string
 *           example:
 *             lead-welcome: "Hi {{firstName}}! 👋 Welcome to Chuvi Laundry."
 *             order-ready: "Hi {{firstName}}, your order is clean, pressed and ready."
 *         thresholds:
 *           type: object
 *           properties:
 *             dormantDays: { type: number, example: 30 }
 *             highVolumeAvgAmount: { type: number, example: 15000 }
 *             highFrequencyPerMonth: { type: number, example: 2 }
 *             expressUserRatio: { type: number, example: 0.5 }
 *             prospectBroadcastDays: { type: number, example: 14 }
 *             churnBroadcastDays: { type: number, example: 30 }
 *         leadSchedule:
 *           type: array
 *           description: "Admin-configurable lead-nurture sequence + delivery timing. Reduced to 3 messages (2026-08-28): Welcome Offer → Offer 2 → Offer 3, then mark-prospect. Enabled steps are staggered — each has a distinct delayMinutes so messages never all fire in the same minute."
 *           items:
 *             $ref: '#/components/schemas/CrmScheduleStep'
 *           example:
 *             - { messageType: lead-welcome, enabled: true, delayMinutes: 0, cancelIfOrdered: true }
 *             - { messageType: lead-offer, enabled: true, delayMinutes: 2880, cancelIfOrdered: true }
 *             - { messageType: lead-close, enabled: true, delayMinutes: 7200, cancelIfOrdered: true }
 *             - { messageType: lead-mark-prospect, enabled: true, delayMinutes: 11520, cancelIfOrdered: true }
 *         postDeliverySchedule:
 *           type: array
 *           description: "Admin-configurable post-delivery timing (2026-08-28). Anchor = order delivered. Order Ready → Delivery Confirmed → Feedback Request (Order Ready has its own trigger; see orderReadyDelayMinutes). The feedback message deep-links to that order's feedback screen."
 *           items:
 *             $ref: '#/components/schemas/CrmScheduleStep'
 *           example:
 *             - { messageType: delivery-confirmation, enabled: true, delayMinutes: 60, cancelIfOrdered: false }
 *             - { messageType: feedback-request, enabled: true, delayMinutes: 1440, cancelIfOrdered: false }
 *         reactivationSchedule:
 *           type: array
 *           description: "Admin-configurable reactivation timing (2026-08-28). Anchor = customer went dormant."
 *           items:
 *             $ref: '#/components/schemas/CrmScheduleStep'
 *           example:
 *             - { messageType: reactivation-1, enabled: true, delayMinutes: 0, cancelIfOrdered: true }
 *             - { messageType: reactivation-2, enabled: true, delayMinutes: 20160, cancelIfOrdered: true }
 *             - { messageType: reactivation-3, enabled: true, delayMinutes: 60480, cancelIfOrdered: true }
 *             - { messageType: reactivation-mark-churned, enabled: true, delayMinutes: 80640, cancelIfOrdered: true }
 *         orderReadyDelayMinutes:
 *           type: number
 *           description: "Minutes after an order becomes ready before the Order Ready message sends (0 = immediately)."
 *           example: 0
 *
 *     CrmScheduleStep:
 *       type: object
 *       properties:
 *         messageType: { type: string, example: feedback-request }
 *         enabled: { type: boolean, example: true }
 *         delayMinutes: { type: number, description: Minutes after the workflow's anchor event this step fires, example: 1440 }
 *         cancelIfOrdered: { type: boolean, description: Drop this step if the customer books before it fires, example: true }
 *
 *     CrmError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         data:
 *           type: object
 *           properties:
 *             error:
 *               type: string
 *               example: Customer profile not found
 */

// ═══════════════════════════════════════════════════════════════════════════
// Shared response envelopes
//
// Every controller replies through base.controller.js, so the shape is always
// `{ success: boolean, message: <payload> }` on success and
// `{ success: false, data: { error } }` on failure. The schemas below are the
// single source of truth for the payloads — reference them from routes with
// `$ref: '#/components/schemas/<Name>'` inside a wrapped success envelope so the
// frontend sees the real data shape and realistic example values.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: false }
 *         data:
 *           type: object
 *           properties:
 *             error: { type: string, example: "Something went wrong" }
 *
 *     # ── Order pricing receipt ────────────────────────────────────────────
 *     OrderPricing:
 *       type: object
 *       description: >
 *         Frozen price receipt captured on the order at booking — every line that
 *         raised (tier uplift, delivery/pickup/speed fees) or lowered (offer
 *         discount, waived fees, wallet credit) the price, so the customer sees the
 *         full breakdown of what they paid for and what they gained. For orders
 *         placed before this snapshot existed a best-effort version is built at read
 *         time with `reconstructed:true` and unknown figures set to null.
 *       properties:
 *         itemsBase: { type: number, description: Item subtotal before the tier multiplier, example: 4000 }
 *         serviceTier: { type: string, enum: [classic, premium, vip], description: "The ORDER's care tier. Individual items may override it — see tierLines.", example: premium }
 *         tierMultiplier: { type: number, nullable: true, description: "Multiplier applied for the tier. NULL when the order mixes tiers (no single multiplier describes it) or on a reconstructed receipt — read tierLines instead.", example: 1.5 }
 *         isMixedTier: { type: boolean, description: "True when the items are not all on one care tier. Show the per-item breakdown rather than a single tier badge.", example: true }
 *         tiersUsed: { type: array, items: { type: string, enum: [classic, premium, vip] }, description: Every care tier present on the order., example: [classic, vip] }
 *         tierLines:
 *           type: array
 *           description: "One line per booked item line, priced at that item's own care tier (falling back to the order's). linePrice = basePrice x tierMultiplier."
 *           items:
 *             type: object
 *             properties:
 *               type: { type: string, description: Item name, example: shirt }
 *               quantity: { type: number, example: 2 }
 *               serviceTier: { type: string, enum: [classic, premium, vip], example: vip }
 *               unitPrice: { type: number, description: Per-piece price after the service-type multiplier and rounding, example: 1000 }
 *               basePrice: { type: number, description: unitPrice x quantity, at CLASSIC, example: 2000 }
 *               tierMultiplier: { type: number, example: 2 }
 *               linePrice: { type: number, description: What this line actually costs, example: 4000 }
 *         tierUplift: { type: number, nullable: true, description: itemsSubtotal - itemsBase — what the tier upgrades added, example: 2000 }
 *         itemsSubtotal: { type: number, description: Item subtotal after the tier multiplier, example: 6000 }
 *         speedCharge: { type: number, nullable: true, description: Express / same-day surcharge, example: 1000 }
 *         pickupFee: { type: number, nullable: true, example: 500 }
 *         deliveryFee: { type: number, nullable: true, example: 500 }
 *         feesTotal: { type: number, description: speedCharge + pickupFee + deliveryFee (== order.deliveryAmount), example: 2000 }
 *         grossTotal: { type: number, nullable: true, description: itemsSubtotal + feesTotal, before any discount, example: 8000 }
 *         offerDiscount: { type: number, nullable: true, description: Discount from applied offer(s), example: 800 }
 *         freePickupWaived: { type: number, nullable: true, description: Pickup fee waived by an offer, example: 0 }
 *         freeDeliveryWaived: { type: number, nullable: true, description: Delivery fee waived by an offer, example: 500 }
 *         appliedOffers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               offerId: { type: string, example: 64c0aa11e3c3b4a1d2f1ca10 }
 *               name: { type: string, example: "Weekend 10% off" }
 *               type: { type: string, enum: [baseline, personal, promotion], description: "baseline = a standing policy the client calls a General offer, applied by rule with no selection.", example: baseline }
 *         creditApplied: { type: number, nullable: true, description: Wallet reward credit used, example: 1000 }
 *         orderTotal: { type: number, description: Amount the order was billed after offers and credit (== order.amount), example: 5700 }
 *         youSaved: { type: number, nullable: true, description: offerDiscount + waived fees + creditApplied, example: 2300 }
 *         coveredBySubscription: { type: boolean, example: false }
 *         reconstructed: { type: boolean, description: true = best-effort shape for an order booked before pricing capture, example: false }
 *         note: { type: string, description: Present only on reconstructed receipts, example: "Approximate — this order predates itemized pricing capture." }
 *
 *     # ── Order cancellation ───────────────────────────────────────────────
 *     CancellationRequest:
 *       type: object
 *       description: A customer's request to cancel an Amber-window order; Customer Experience approves (runs the unwind, optional fee) or rejects it.
 *       properties:
 *         _id: { type: string, example: 64c0aa11e3c3b4a1d2f1ca10 }
 *         orderId: { type: string, description: The order (populated in the CX queue), example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *         userId: { type: string, description: The customer (populated in the CX queue), example: 64d3c9c0f1b2a8e9d0f12345 }
 *         reason: { type: string, example: "Change of plans" }
 *         status:
 *           type: string
 *           enum: [pending, approved, rejected, superseded]
 *           description: "'superseded' = the order was cancelled through another path, so the request is moot"
 *           example: pending
 *         tierAtRequest: { type: string, description: Cancellation window when submitted, example: amber }
 *         reviewedBy: { type: string, nullable: true, description: CX officer who decided, example: 64d3c9c0f1b2a8e9d0f19999 }
 *         reviewedAt: { type: string, format: date-time, nullable: true }
 *         decisionNote: { type: string, nullable: true, example: "Rider already dispatched; part-fee applied" }
 *         feeApplied: { type: number, description: Fee withheld from the cash refund (approval only), example: 500 }
 *         cashRefunded: { type: number, description: Cash refunded to wallet on approval, example: 4500 }
 *         creditsReversed: { type: number, description: Reward credit restored on approval, example: 0 }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     CancellationRequestPage:
 *       type: object
 *       description: Paginated list of cancellation requests (CX queue).
 *       properties:
 *         data:
 *           type: array
 *           items: { $ref: '#/components/schemas/CancellationRequest' }
 *         pagination:
 *           type: object
 *           properties:
 *             total: { type: integer, example: 3 }
 *             page: { type: integer, example: 1 }
 *             limit: { type: integer, example: 20 }
 *             pages: { type: integer, example: 1 }
 *
 *     # ── Wallet & Credit ──────────────────────────────────────────────────
 *     WalletCredit:
 *       type: object
 *       description: One reward-credit grant inside the customer wallet (service value, never withdrawable as cash).
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e001 }
 *         userId: { type: string, example: 64d3c9c0f1b2a8e9d0f12345 }
 *         type:
 *           type: string
 *           enum: [laundry, referral, recovery, promotional]
 *           example: referral
 *         amount: { type: number, description: Original granted value, example: 1500 }
 *         remaining: { type: number, description: Value still available to spend, example: 1500 }
 *         sourceSystem:
 *           type: string
 *           enum: [offer, referral, recovery, admin, order]
 *           example: referral
 *         sourceRef:
 *           type: string
 *           description: Dedupe key — same sourceSystem+sourceRef never credits twice
 *           example: referral-665f1c2ab9e77a0012d4e777
 *         note: { type: string, nullable: true, example: "Referral reward — 5% of friend's first order" }
 *         expiresAt: { type: string, format: date-time, example: 2026-09-02T00:00:00.000Z }
 *         status:
 *           type: string
 *           enum: [active, exhausted, expired, reversed]
 *           example: active
 *         usedBy:
 *           type: array
 *           description: Per-order consumption, so a cancelled order can be reversed exactly
 *           items:
 *             type: object
 *             properties:
 *               orderId: { type: string, example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *               amount: { type: number, example: 500 }
 *               usedAt: { type: string, format: date-time }
 *               reversed: { type: boolean, example: false }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     WalletAdjustmentRequest:
 *       type: object
 *       description: "A staff wallet adjustment that exceeded the operator's role limit and is waiting for an admin. Nothing moves in the wallet until it is approved; approval then runs the same code path as a within-limit adjustment, so it produces an identical ledger line."
 *       properties:
 *         _id: { type: string, example: 64d3c9c0f1b2a8e9d0f12345 }
 *         userId: { type: string, description: The customer whose wallet would move (populated on list), example: 64d3c9c0f1b2a8e9d0f54321 }
 *         amount: { type: integer, description: Always positive; the direction is in `type`., example: 10000 }
 *         type: { type: string, enum: [credit, debit], example: credit }
 *         reason: { type: string, example: "Refund for a damaged shirt" }
 *         requestedBy: { type: string, description: The operator who asked (populated on list), example: 64d3c9c0f1b2a8e9d0f99999 }
 *         requestedByRole: { type: string, enum: [intake-and-tag, customer-experience, qc, press, wash-and-dry, sort-and-pretreat, rider, admin], example: intake-and-tag }
 *         roleLimitAtRequest: { type: integer, description: "The role's limit AT THE TIME, stored so changing the setting later never rewrites why approval was needed.", example: 5000 }
 *         orderId: { type: string, nullable: true, example: 64d3c9c0f1b2a8e9d0f11111 }
 *         status: { type: string, enum: [pending, approved, rejected], example: pending }
 *         decidedBy: { type: string, nullable: true, example: 64d3c9c0f1b2a8e9d0f22222 }
 *         decidedAt: { type: string, format: date-time, nullable: true, example: "2026-10-07T12:05:00.000Z" }
 *         decisionNote: { type: string, nullable: true, example: "Approved — matches the complaint record." }
 *         walletTransactionId: { type: string, nullable: true, description: The ledger line the approval produced., example: 64d3c9c0f1b2a8e9d0f33333 }
 *         balanceAfter: { type: integer, nullable: true, example: 12500 }
 *         createdAt: { type: string, format: date-time, example: "2026-10-07T11:40:00.000Z" }
 *
 *     WalletTransaction:
 *       type: object
 *       description: A single cash or credit movement on the wallet ledger.
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e010 }
 *         userId: { type: string, example: 64d3c9c0f1b2a8e9d0f12345 }
 *         type:
 *           type: string
 *           enum: [credit, debit, reversal, expiry, manual-adjustment]
 *           example: credit
 *         amount: { type: number, example: 1500 }
 *         description: { type: string, example: "Referral reward credit" }
 *         reference: { type: string, nullable: true, example: T513406671019712 }
 *         status:
 *           type: string
 *           enum: [pending, success, failed]
 *           example: success
 *         sourceSystem:
 *           type: string
 *           nullable: true
 *           enum: [offer, referral, recovery, admin, order]
 *           example: referral
 *         creditType:
 *           type: string
 *           nullable: true
 *           description: Set on credit movements; unset means a cash movement
 *           enum: [laundry, referral, recovery, promotional]
 *           example: referral
 *         relatedOrderId: { type: string, nullable: true }
 *         relatedCreditId: { type: string, nullable: true }
 *         balanceAfter: { type: number, nullable: true, description: Cash balance after this movement, when known }
 *         reason: { type: string, nullable: true, description: Mandatory on manual adjustments }
 *         performedBy: { type: string, nullable: true, description: Staff id on manual adjustments }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     HoldType:
 *       type: object
 *       description: >
 *         A kind of hold, with its own time limit. Client section B (6 Oct brief reply):
 *         the limit depends on the KIND of hold, not on the order's delivery speed —
 *         a payment hold lasts days while an operational one lasts hours.
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e500 }
 *         key:
 *           type: string
 *           example: payment
 *           description: Permanent identifier stored on the order. Derived from the name at creation and never changed.
 *         name: { type: string, example: "Awaiting payment" }
 *         description: { type: string, nullable: true }
 *         slaHours:
 *           type: number
 *           nullable: true
 *           example: 48
 *           description: "Hours before it is Overdue. NULL means it follows the order's delivery speed (2/4/6) — not that it has no limit."
 *         effectiveLimit:
 *           type: string
 *           example: "48 hours"
 *           description: The limit in words, including the delivery-speed fallback spelled out.
 *         stations:
 *           type: array
 *           items: { type: string, enum: [admin, intake-and-tag, sort-and-pretreat, wash-and-dry, press, qc, customer-experience] }
 *           description: Who may raise it. Empty means any station.
 *         judgeByOwnLimitOnly:
 *           type: boolean
 *           example: true
 *           description: True on the payment hold — the promised delivery date must not drag it into Overdue.
 *         escalateToAdmin: { type: boolean, example: true }
 *         isSystem: { type: boolean, example: true, description: Seeded and used by code; cannot be deleted or switched off. }
 *         systemRaisedOnly: { type: boolean, example: true, description: Raised by the system, never by a person. }
 *         active: { type: boolean, example: true }
 *         ordersOnHoldNow: { type: integer, example: 3, description: Holds sitting on this type right now (list endpoint only). }
 *
 *     StaffAccount:
 *       type: object
 *       description: A non-customer account and whether they can currently work.
 *       properties:
 *         _id: { type: string, example: 64d3c9c0f1b2a8e9d0f99999 }
 *         fullName: { type: string, example: "Emma Okay" }
 *         email: { type: string, example: emma@chuvi.com }
 *         phoneNumber: { type: string, nullable: true, example: "08081299759" }
 *         userType:
 *           type: string
 *           enum: [admin, intake-and-tag, sort-and-pretreat, wash-and-dry, press, qc, rider, customer-experience]
 *           example: rider
 *         role:
 *           type: string
 *           description: Same value as userType, under the name the UI uses.
 *           example: rider
 *         status:
 *           type: string
 *           enum: [active, inactive, pending, suspended]
 *           example: suspended
 *         canWork:
 *           type: boolean
 *           example: false
 *           description: True only when status is 'active'. Anyone else cannot sign in or be assigned work.
 *         statusReason: { type: string, nullable: true, example: "Left the company on 6 October." }
 *         statusChangedAt: { type: string, format: date-time, nullable: true }
 *         image: { type: string, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *
 *     AdminWalletTransaction:
 *       description: >
 *         A ledger line as the ADMIN ledger returns it — the WalletTransaction plus the
 *         customer and the operator resolved to names, so the Money page needs no second
 *         lookup. `userId` and `performedBy` stay plain ids beside them.
 *       allOf:
 *         - $ref: '#/components/schemas/WalletTransaction'
 *         - type: object
 *           properties:
 *             customer:
 *               type: object
 *               nullable: true
 *               properties:
 *                 _id: { type: string, example: 64d3c9c0f1b2a8e9d0f12345 }
 *                 fullName: { type: string, example: "Ikechukwu Ijeomah" }
 *                 phoneNumber: { type: string, example: "08081299759" }
 *             operator:
 *               type: object
 *               nullable: true
 *               description: Who moved the money. Null for automatic/system movements.
 *               properties:
 *                 _id: { type: string, example: 64d3c9c0f1b2a8e9d0f99999 }
 *                 fullName: { type: string, example: "Emma Okay" }
 *                 role: { type: string, example: intake-and-tag }
 *
 *     # ── Offer System ─────────────────────────────────────────────────────
 *     OfferBenefit:
 *       type: object
 *       properties:
 *         benefitType:
 *           type: string
 *           enum: [order-discount, free-pickup, free-delivery, free-items, extra-laundry-credit]
 *           example: order-discount
 *         percent: { type: number, nullable: true, example: 10 }
 *         amount: { type: number, nullable: true, description: Fixed discount amount }
 *         minPaidItems: { type: integer, nullable: true }
 *         freeItemCount: { type: integer, nullable: true }
 *         eligibleItemTypes: { type: array, items: { type: string } }
 *         maxFreeValue: { type: number, nullable: true }
 *         minOrderValue: { type: number, nullable: true }
 *         creditAmount: { type: number, nullable: true, description: Extra laundry credit value }
 *
 *     Offer:
 *       type: object
 *       description: An offer created once in the admin Offer Builder; linked to customers by the system.
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e100 }
 *         name: { type: string, example: Second Order Offer }
 *         headline: { type: string, example: "10% off your next wash" }
 *         description: { type: string, example: "A little thank-you for coming back." }
 *         type:
 *           type: string
 *           enum: [personal, promotional, baseline]
 *           example: personal
 *         triggers:
 *           type: array
 *           description: "§4 multi-trigger — the events that can MINT this personal offer. Any one of them assigns it (OR). Empty for promotional/baseline offers."
 *           items:
 *             type: string
 *             enum: [first-experience, second-order, loyalty, referral-reward, recovery, reactivation, manual, level-promoter, level-ambassador, level-champion]
 *           example: [first-experience, referral-reward]
 *         trigger:
 *           type: string
 *           nullable: true
 *           description: "DEPRECATED single-trigger field, kept for back-compat; mirrors triggers[0]. New builders should send triggers[]."
 *           enum: [first-experience, second-order, loyalty, referral-reward, recovery, reactivation, manual, level-promoter, level-ambassador, level-champion]
 *           example: first-experience
 *         benefits:
 *           type: array
 *           items: { $ref: '#/components/schemas/OfferBenefit' }
 *         rules:
 *           type: object
 *           description: "Multi-criteria targeting (§4). stages / tags / customerGroups: OR within a category, AND across categories, an EMPTY category = no constraint. Evaluated at assignment AND re-checked at booking."
 *           properties:
 *             stages: { type: array, items: { type: string }, example: [lead, first-order] }
 *             tags: { type: array, items: { type: string }, example: [student, young-professional] }
 *             customerGroups: { type: array, items: { type: string }, description: "Admin-managed CRM tag values treated as customer groups; matched against the customer's tags like `tags`.", example: [high-volume] }
 *             minOrders: { type: integer, nullable: true }
 *             maxOrders: { type: integer, nullable: true }
 *             daysSinceLastOrder: { type: integer, nullable: true }
 *             minOrderValue: { type: number, nullable: true }
 *             minItems: { type: integer, nullable: true }
 *             firstOrderOnly: { type: boolean, example: false }
 *             serviceTypes: { type: array, items: { type: string } }
 *             oneUsePerCustomer: { type: boolean, example: true }
 *         startDate: { type: string, format: date-time, nullable: true }
 *         expiryDate: { type: string, format: date-time, nullable: true }
 *         customerWindowDays: { type: integer, example: 14 }
 *         usageLimit: { type: integer, nullable: true, description: "Global redemption cap across ALL customers. null/absent = unlimited; 0 = none allowed (never usable)." }
 *         usedCount: { type: integer, example: 42 }
 *         status:
 *           type: string
 *           enum: [draft, active, paused, expired, archived]
 *           example: active
 *         stackableWithPersonal: { type: boolean, example: false }
 *         creditExpiryDays: { type: integer, nullable: true }
 *         displayRules: { type: array, items: { type: string }, description: "Display-ready rule summary (customer offers page only).", example: ["Minimum order ₦2,000", "Wash & Fold only", "One use per customer"] }
 *         expiresInDays: { type: integer, nullable: true, description: "Whole days until expiry, rounded up; 0 if past, null if no expiry (customer offers page only).", example: 8 }
 *         remainingUses: { type: integer, nullable: true, description: "GLOBAL uses left before the cap (scarcity, not per-customer); null = unlimited (customer offers page only).", example: 24 }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     CustomerOffer:
 *       type: object
 *       description: The link between one customer and one offer (assigning an offer never copies it).
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e120 }
 *         userId: { type: string, example: 64d3c9c0f1b2a8e9d0f12345 }
 *         offerId:
 *           oneOf:
 *             - { type: string, example: 665f1c2ab9e77a0012d4e100 }
 *             - { $ref: '#/components/schemas/Offer' }
 *           description: Offer id, or the populated Offer document on the my-offers page
 *         status:
 *           type: string
 *           enum: [assigned, viewed, attached, redeemed, expired, cancelled]
 *           example: assigned
 *         milestoneKey: { type: string, nullable: true, example: loyalty-10 }
 *         expiresAt: { type: string, format: date-time, example: 2026-08-02T00:00:00.000Z }
 *         orderId: { type: string, nullable: true }
 *         note: { type: string, nullable: true }
 *         viewedAt: { type: string, format: date-time, nullable: true }
 *         attachedAt: { type: string, format: date-time, nullable: true }
 *         redeemedAt: { type: string, format: date-time, nullable: true }
 *         cancelledAt: { type: string, format: date-time, nullable: true, description: Set when the offer was cancelled, whether manually or because its offer was deleted., example: "2026-10-07T11:42:00.000Z" }
 *         displayRules: { type: array, items: { type: string }, description: "Display-ready rule summary (my-offers rewards only).", example: ["Minimum order ₦2,000", "One use per customer"] }
 *         expiresInDays: { type: integer, nullable: true, description: "Whole days until this linkage expires, rounded up; 0 if past (my-offers rewards only).", example: 5 }
 *         remainingUses: { type: integer, nullable: true, description: "GLOBAL uses left on the underlying offer; null = unlimited (my-offers rewards only)." }
 *         createdAt: { type: string, format: date-time }
 *
 *     OfferPage:
 *       type: object
 *       description: The customer Offer page — three sections.
 *       properties:
 *         rewards:
 *           type: array
 *           description: Personal offers currently linked to the customer (Offer populated)
 *           items: { $ref: '#/components/schemas/CustomerOffer' }
 *         promotions:
 *           type: array
 *           description: >
 *             Promotional campaigns the customer currently qualifies for. A
 *             one-use promo the customer has ALREADY USED is OMITTED for that
 *             customer (hidden, not greyed-out); other customers who haven't used
 *             it still see it. Repeatable promos always appear.
 *           items: { $ref: '#/components/schemas/Offer' }
 *         baseline:
 *           type: array
 *           description: Permanent baseline benefits
 *           items: { $ref: '#/components/schemas/Offer' }
 *
 *     OfferQuote:
 *       type: object
 *       description: Booking-time pricing once offers are applied.
 *       properties:
 *         baseline: { type: array, items: { $ref: '#/components/schemas/Offer' } }
 *         personal: { $ref: '#/components/schemas/Offer', nullable: true }
 *         promotion: { $ref: '#/components/schemas/Offer', nullable: true }
 *         totalDiscount: { type: number, example: 600 }
 *         freePickup: { type: boolean, example: false }
 *         freeDelivery: { type: boolean, example: true }
 *         creditPromised: { type: number, example: 0 }
 *         rejected:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               which: { type: string, example: personal }
 *               reason: { type: string, example: "Minimum order value ₦2000" }
 *               requirement:
 *                 type: object
 *                 nullable: true
 *                 description: "Structured shortfall for order-level rules (minOrderValue/minItems/serviceType); null for rules the customer can't act on (expiry, profile, capacity, stacking)."
 *                 properties:
 *                   type: { type: string, enum: [minOrderValue, minItems, serviceType], example: minOrderValue }
 *                   needed: { oneOf: [{ type: number }, { type: array, items: { type: string } }], example: 2000 }
 *                   current: { oneOf: [{ type: number }, { type: string }], example: 1400 }
 *                   shortfall: { type: number, nullable: true, description: "Only for numeric rules (minOrderValue/minItems).", example: 600 }
 *               unlockMessage: { type: string, nullable: true, description: "Actionable hint; null when the rejection isn't customer-actionable.", example: "Spend ₦600 more to use this offer." }
 *         payable: { type: number, example: 6400 }
 *
 *     OfferBookingOption:
 *       type: object
 *       description: One offer evaluated against the current draft cart for the booking screen.
 *       properties:
 *         customerOfferId: { type: string, nullable: true, description: Present for personal rewards (the linkage id); absent for promotions/baselines. }
 *         offerId: { type: string, example: 64c0aa11e3c3b4a1d2f1ca10 }
 *         name: { type: string, example: "Weekend 10% off" }
 *         displayRules: { type: array, items: { type: string }, example: ["10% off your order", "Min order ₦2000"] }
 *         expiresInDays: { type: integer, nullable: true, example: 5 }
 *         remainingUses: { type: integer, nullable: true, description: "Global uses left (null = unlimited)", example: null }
 *         stackableWithPersonal: { type: boolean, description: "Promotions only — whether it may combine with a personal offer.", example: false }
 *         preselected: { type: boolean, description: "True if passed as customerOfferId/promoOfferId.", example: true }
 *         applicable: { type: boolean, example: true }
 *         reason: { type: string, nullable: true, description: "Why it can't apply to this cart (null when applicable).", example: "Minimum order value ₦2000" }
 *         requirement:
 *           type: object
 *           nullable: true
 *           description: "Structured shortfall for order-level rules; null when not customer-actionable."
 *           properties:
 *             type: { type: string, enum: [minOrderValue, minItems, serviceType], example: minOrderValue }
 *             needed: { oneOf: [{ type: number }, { type: array, items: { type: string } }], example: 2000 }
 *             current: { oneOf: [{ type: number }, { type: string }], example: 1400 }
 *             shortfall: { type: number, nullable: true, example: 600 }
 *         unlockMessage: { type: string, nullable: true, example: "Spend ₦600 more to use this offer." }
 *         benefit:
 *           type: object
 *           nullable: true
 *           description: "Projected benefit if applied (null when not applicable)."
 *           properties:
 *             discount: { type: number, example: 600 }
 *             freePickup: { type: boolean, example: false }
 *             freeDelivery: { type: boolean, example: true }
 *             creditPromised: { type: number, example: 0 }
 *
 *     OfferBookingOptions:
 *       type: object
 *       description: Booking screen payload — the priced quote for the current selection plus every offer evaluated against the cart.
 *       properties:
 *         selected: { $ref: '#/components/schemas/OfferQuote' }
 *         personal: { type: array, items: { $ref: '#/components/schemas/OfferBookingOption' } }
 *         promotions: { type: array, items: { $ref: '#/components/schemas/OfferBookingOption' } }
 *         baseline: { type: array, items: { $ref: '#/components/schemas/OfferBookingOption' } }
 *         checkoutPrompt:
 *           type: object
 *           description: >
 *             Client item #6(a) — render `message` VERBATIM when `show` is true. The backend decides
 *             whether the customer actually has a usable personal offer on this cart, so the prompt and
 *             the eligibility rule cannot disagree. `show:false` means do not prompt.
 *           properties:
 *             show: { type: boolean, example: true }
 *             message: { type: string, nullable: true, example: "You have a first time offer. Tap to use it." }
 *             customerOfferId: { type: string, nullable: true, example: 665f1c2ab9e77a0012d4e100 }
 *             offerName: { type: string, nullable: true, example: "First Experience" }
 *             billValue: { type: number, nullable: true, example: 2000, description: What tapping it takes off THIS bill }
 *             count: { type: integer, example: 2, description: How many personal offers are usable right now }
 *         autoApply:
 *           type: object
 *           nullable: true
 *           description: >
 *             Client item #6(b) — the personal offer Quick Booking applies without asking: the one worth
 *             MORE on THIS bill (discount + any pickup/delivery fee it waives; a promised future credit
 *             is NOT counted). Ties go to the offer expiring soonest. The others are untouched and
 *             survive for a later order (`otherOffersKept`). Exposed on the normal booking screen too so
 *             both paths visibly agree about which one is "best".
 *           properties:
 *             customerOfferId: { type: string, example: 665f1c2ab9e77a0012d4e100 }
 *             offerId: { type: string, example: 665f1c2ab9e77a0012d4e0aa }
 *             name: { type: string, example: "First Experience" }
 *             billValue: { type: number, example: 2000 }
 *             otherOffersKept: { type: integer, example: 1 }
 *
 *     # ── Referral ─────────────────────────────────────────────────────────
 *     Referral:
 *       type: object
 *       description: One record per referred customer.
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e200 }
 *         referrerId: { type: string, example: 64d3c9c0f1b2a8e9d0f12345 }
 *         referredUserId: { type: string, example: 64d3c9c0f1b2a8e9d0f99999 }
 *         code: { type: string, example: CHUVIA1B2C3 }
 *         source: { type: string, enum: [code, link], example: link }
 *         status:
 *           type: string
 *           enum: [pending, registered, first-order, completed, rewarded]
 *           example: rewarded
 *         firstOrderId: { type: string, nullable: true }
 *         firstOrderDate: { type: string, format: date-time, nullable: true }
 *         firstOrderValue: { type: number, nullable: true, example: 8000 }
 *         rewardStatus:
 *           type: string
 *           enum: [none, deferred, granted]
 *           example: granted
 *         rewardAmount: { type: number, nullable: true, example: 400 }
 *         rewardCreditId: { type: string, nullable: true }
 *         welcomeCreditId: { type: string, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     ReferralLevel:
 *       type: object
 *       description: The customer's permanent advocacy standing plus this month's activity-gated perk state.
 *       properties:
 *         current: { type: string, enum: [member, promoter, ambassador, champion], example: ambassador }
 *         name: { type: string, example: Ambassador }
 *         lifetimeReferrals: { type: integer, example: 9 }
 *         monthlyReferrals: { type: integer, example: 2 }
 *         rewardPercent: { type: number, example: 10 }
 *         benefits:
 *           type: object
 *           properties:
 *             rewardPercent: { type: number, example: 10 }
 *             exclusiveOffer: { type: boolean, example: true }
 *             monthlyFreeLaundry: { type: number, example: 5000 }
 *             monthlyTarget: { type: integer, example: 3 }
 *             monthlyPerkActive: { type: boolean, example: false, description: "true when this month's referral target is met and the free-laundry perk is active" }
 *         nextLevel:
 *           type: object
 *           nullable: true
 *           description: null when already at the top level.
 *           properties:
 *             key: { type: string, example: champion }
 *             name: { type: string, example: Champion }
 *             lifetimeTarget: { type: integer, example: 15 }
 *             referralsToGo: { type: integer, example: 6 }
 *             monthlyTarget: { type: integer, example: 5 }
 *             rewardPercent: { type: number, example: 15 }
 *         progressPercent: { type: integer, example: 60 }
 *
 *     RewardSettingLevel:
 *       type: object
 *       description: One configured advocacy tier on the RewardSetting ladder (admin-editable). Distinct from ReferralLevel, which is a customer's derived standing.
 *       properties:
 *         key: { type: string, enum: [member, promoter, ambassador, champion], example: ambassador }
 *         name: { type: string, example: Ambassador }
 *         lifetimeTarget: { type: integer, example: 8, description: Lifetime successful referrals to permanently unlock this tier }
 *         monthlyTarget: { type: integer, example: 3, description: Referrals in a month to activate the monthly free-laundry perk }
 *         rewardPercent: { type: number, example: 10 }
 *         monthlyFreeLaundryAmount: { type: number, example: 5000 }
 *         offerTrigger: { type: string, nullable: true, example: level-ambassador, description: OFFER_TRIGGER for the tier's exclusive offer (null = none) }
 *
 *     RewardSetting:
 *       type: object
 *       description: Singleton admin config for the reward economy — complaint SLA & reopen window, recovery approval threshold, credit expiry, and referral rewards/levels.
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e900 }
 *         creditExpiryDays:
 *           type: object
 *           description: Default credit lifetime in days, by credit type.
 *           properties:
 *             referral: { type: integer, example: 45 }
 *             recovery: { type: integer, example: 90 }
 *             promotional: { type: integer, example: 30 }
 *             laundry: { type: integer, example: 90 }
 *         recoveryApprovalThreshold: { type: number, example: 10000, description: Recovery compensation above this needs Admin/Founder approval }
 *         complaintReviewHours: { type: integer, example: 24 }
 *         complaintResolutionHours: { type: integer, example: 72 }
 *         complaintConfirmWindowHours: { type: integer, example: 48, description: Hours a customer has to confirm a resolved complaint before CX may close it }
 *         complaintReopenDays: { type: integer, example: 7, description: Days a customer may reopen a closed complaint }
 *         referralRewardPercent: { type: number, example: 5 }
 *         referralRewardMax: { type: number, nullable: true, example: null, description: Per-referral reward ceiling in naira (null = no ceiling) }
 *         referralMonthlyCap: { type: number, nullable: true, example: null, description: Monthly cap on total referral rewards per customer (null = off) }
 *         referralWelcomeAmount: { type: number, example: 0, description: Welcome credit for a referred customer on signup (0 = disabled) }
 *         referralLevels:
 *           type: array
 *           items: { $ref: '#/components/schemas/RewardSettingLevel' }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     ReferralPage:
 *       type: object
 *       properties:
 *         referralCode: { type: string, example: CHUVIA1B2C3 }
 *         referralLink: { type: string, example: "https://www.chuvilaundry.com/auth/signup?ref=CHUVIA1B2C3" }
 *         totalSuccessfulReferrals: { type: integer, example: 3 }
 *         pendingReferrals: { type: integer, example: 1 }
 *         totalRewardsEarned: { type: number, example: 1500 }
 *         level: { $ref: '#/components/schemas/ReferralLevel' }
 *         history:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               referredName: { type: string, example: Ada Obi }
 *               referralDate: { type: string, format: date-time }
 *               status: { type: string, enum: [pending, registered, first-order, completed, rewarded], example: completed }
 *               rewardStatus: { type: string, enum: [none, deferred, granted], example: granted }
 *               rewardAmount: { type: number, example: 400 }
 *
 *     # ── Feedback & Recovery ──────────────────────────────────────────────
 *     Feedback:
 *       type: object
 *       description: One satisfaction response per delivered order.
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e300 }
 *         userId: { type: string, example: 64d3c9c0f1b2a8e9d0f12345 }
 *         orderId: { type: string, example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *         type: { type: string, enum: [satisfied, neutral, complaint], example: complaint }
 *         rating: { type: integer, minimum: 1, maximum: 5, nullable: true, example: 2 }
 *         npsScore: { type: integer, minimum: 0, maximum: 10, nullable: true, example: 9, description: "The 0-10 recommend answer. Null when the question was not asked on this order (it is throttled to once per customer per 30 days). 0 is a real answer, not an absence." }
 *         npsAskedAt: { type: string, format: date-time, nullable: true }
 *         npsAnsweredAt: { type: string, format: date-time, nullable: true, description: "Set only when a score actually came back." }
 *         comment: { type: string, nullable: true, example: "Two shirts came back with the stain still there." }
 *         status: { type: string, enum: [pending, completed], example: completed }
 *         complaintCaseId: { type: string, nullable: true, example: 665f1c2ab9e77a0012d4e400 }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     FeedbackPrompt:
 *       type: object
 *       description: What the feedback screen should ask for one delivered order. The backend owns the NPS throttle.
 *       properties:
 *         bookOrderId: { type: string, example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *         oscNumber: { type: string, example: OSC-20261004-631233 }
 *         askRating: { type: boolean, example: true }
 *         ratingScale:
 *           type: object
 *           properties:
 *             min: { type: integer, example: 1 }
 *             max: { type: integer, example: 5 }
 *         askNps: { type: boolean, example: true, description: "False when this customer was already asked inside the window." }
 *         npsQuestion: { type: string, nullable: true, example: "How likely are you to recommend CHUVI to a friend?" }
 *         npsScale:
 *           type: object
 *           nullable: true
 *           properties:
 *             min: { type: integer, example: 0 }
 *             max: { type: integer, example: 10 }
 *         npsSkippedReason: { type: string, nullable: true, example: "Already asked within the last 30 days" }
 *         askComment: { type: boolean, example: true }
 *
 *     RecoveryMonthlyReport:
 *       type: object
 *       description: The §2 N2 admin dashboard for one Lagos month.
 *       properties:
 *         month: { type: string, example: '2026-10' }
 *         from: { type: string, format: date-time, description: Inclusive start of the Lagos month }
 *         to: { type: string, format: date-time, description: EXCLUSIVE end (start of the next Lagos month) }
 *         feedback:
 *           type: object
 *           properties:
 *             npsScore: { type: integer, minimum: -100, maximum: 100, example: 40, description: "Share of 9-10 answers minus the share of 0-6 answers." }
 *             npsResponses: { type: integer, example: 10, description: "Number of 0-10 answers. NOT the same as feedbackReceived — the NPS question is throttled." }
 *             npsBreakdown:
 *               type: object
 *               properties:
 *                 promoters: { type: integer, example: 6 }
 *                 passives: { type: integer, example: 2 }
 *                 detractors: { type: integer, example: 2 }
 *             averageRating: { type: number, example: 4.3 }
 *             ratingResponses: { type: integer, example: 10 }
 *             feedbackReceived: { type: integer, example: 10 }
 *             deliveredOrders: { type: integer, example: 20 }
 *             feedbackSharePct: { type: integer, example: 50 }
 *         complaints:
 *           type: object
 *           properties:
 *             complaintsOpened: { type: integer, example: 7 }
 *             resolved: { type: integer, example: 5 }
 *             stillOpen: { type: integer, example: 3, description: "Open at the END of the chosen month, so past months stay meaningful." }
 *             averageTimeToResolveHours: { type: number, example: 31.5 }
 *             averageTimeToResolveLabel: { type: string, nullable: true, example: "1.3 days" }
 *         recovery:
 *           type: object
 *           properties:
 *             recoveriesGiven: { type: integer, example: 6 }
 *             recoveryBreakdown:
 *               type: object
 *               properties:
 *                 offers: { type: integer, example: 2 }
 *                 credits: { type: integer, example: 3 }
 *                 refunds: { type: integer, example: 1 }
 *             recoveryCost: { type: integer, example: 12500, description: "Naira value of credits and cash refunds. Offers carry no naira until redeemed." }
 *             recoveryCostBreakdown:
 *               type: object
 *               properties:
 *                 credits: { type: integer, example: 9500 }
 *                 refunds: { type: integer, example: 3000 }
 *             customersRecovered: { type: integer, example: 5 }
 *             orderedAgainAfterRecovery:
 *               type: integer
 *               example: 3
 *               description: >
 *                 Distinct customers who received a recovery this month and then placed a real order
 *                 (not cancelled, never a recovery order itself) WITHIN `orderedAgainWindowDays` of it.
 *                 Client decision 2026-10-08: the window is 60 days. The order itself may fall outside
 *                 the report month — it is the RECOVERY that must be in the month.
 *             orderedAgainWindowDays:
 *               type: integer
 *               example: 60
 *               description: The window the figure above was measured over, so the card can state it.
 *         complaintsByType:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               complaintTypeId: { type: string, nullable: true, example: 665f1c2ab9e77a0012d4e350 }
 *               name: { type: string, example: "Stain Remains" }
 *               count: { type: integer, example: 4 }
 *         lowRatedOrders:
 *           type: array
 *           description: Orders rated 1 or 2 stars, with the phone number, so the office can call them.
 *           items:
 *             type: object
 *             properties:
 *               bookOrderId: { type: string, example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *               oscNumber: { type: string, nullable: true, example: OSC-20261004-631233 }
 *               customerName: { type: string, nullable: true, example: "Ikechukwu Ijeomah" }
 *               phoneNumber: { type: string, nullable: true, example: "08081299759" }
 *               rating: { type: integer, example: 2 }
 *               comment: { type: string, nullable: true, example: "Two shirts came back with the stain still there." }
 *               ratedAt: { type: string, format: date-time }
 *               hasComplaint: { type: boolean, example: true }
 *
 *     ComplaintType:
 *       type: object
 *       description: Admin-managed complaint category.
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e350 }
 *         name: { type: string, example: "Stain Remains" }
 *         description: { type: string, nullable: true, example: "A stain the customer flagged is still visible after cleaning." }
 *         active: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     RecoveryAction:
 *       type: object
 *       properties:
 *         action: { type: string, enum: [rewash, rework, repair, replace, compensate], example: rewash }
 *         note: { type: string, nullable: true, example: "Re-treating the collar stain." }
 *         completed: { type: boolean, example: false }
 *         completedAt: { type: string, format: date-time, nullable: true }
 *         addedBy: { type: string, nullable: true }
 *
 *     RecoveryCredit:
 *       type: object
 *       description: Compensation credit on a complaint case, with its approval gate.
 *       properties:
 *         amount: { type: number, example: 5000 }
 *         reason: { type: string, example: "Colour ran onto two shirts; photos attached." }
 *         status: { type: string, enum: [pending-approval, approved, rejected], example: pending-approval }
 *         requestedBy: { type: string, nullable: true }
 *         approvedBy: { type: string, nullable: true }
 *         decidedAt: { type: string, format: date-time, nullable: true }
 *         walletCreditId: { type: string, nullable: true }
 *
 *     RecoveryCompensation:
 *       type: object
 *       description: "§7: one compensation on a case — wallet credit (in-system) or cash (recorded for manual transfer). A case may have several."
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e777 }
 *         type: { type: string, enum: [wallet-credit, cash], example: wallet-credit }
 *         amount: { type: number, example: 5000 }
 *         reason: { type: string, example: "Colour ran onto two shirts" }
 *         evidence: { type: array, items: { type: string }, example: ["https://cdn.chuvi.com/complaints/photo1.jpg"] }
 *         status: { type: string, enum: [pending-approval, approved, rejected], example: approved }
 *         requestedBy: { type: string, nullable: true }
 *         approvedBy: { type: string, nullable: true }
 *         decidedAt: { type: string, format: date-time, nullable: true }
 *         rejectionReason: { type: string, nullable: true }
 *         walletCreditId: { type: string, nullable: true, description: Set for approved wallet-credit compensation }
 *         bankDetails:
 *           type: object
 *           nullable: true
 *           description: Present for cash compensation (manual transfer target)
 *           properties:
 *             accountName: { type: string, example: "John Doe" }
 *             accountNumber: { type: string, example: "0123456789" }
 *             bankName: { type: string, example: "GTBank" }
 *         paidOut: { type: boolean, example: false, description: "Cash only: whether the manual bank transfer has been made. approved ≠ paid." }
 *         paidOutAt: { type: string, format: date-time, nullable: true }
 *         paidOutBy: { type: string, nullable: true, description: Admin who recorded the transfer }
 *         paidOutReference: { type: string, nullable: true, example: "GTB txn 9930112" }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     TimelineOrderItem:
 *       type: object
 *       description: "One line item with its per-station statuses. The raw order item subdoc is returned, so additional fields may be present."
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e123 }
 *         type: { type: string, example: Shirt }
 *         price: { type: number, example: 500 }
 *         quantity: { type: integer, example: 2 }
 *         tagStatus: { type: string, enum: [pending, complete], example: complete }
 *         colorGroup: { type: string, nullable: true, enum: [white, colored], example: white }
 *         fabricType: { type: string, nullable: true, example: light }
 *         sortStatus: { type: string, enum: [pending, complete, not_required], example: complete }
 *         pretreatStatus: { type: string, enum: [pending, complete, not_required], example: pending }
 *         washStatus: { type: string, enum: [pending, complete], example: pending }
 *         ironStatus: { type: string, enum: [pending, complete], example: pending }
 *         pressStatus: { type: string, enum: [pending, complete], example: pending }
 *         qcStatus: { type: string, enum: [pending, passed, failed], example: pending }
 *         itemNote: { type: string, example: "small stain on collar" }
 *
 *     ItemSetPiece:
 *       type: object
 *       description: "One individually-priced piece inside a Set."
 *       properties:
 *         _id: { type: string, example: 64c1f9a2e3c3b4a1d2f1c1a5 }
 *         name: { type: string, example: "Agbada (outer)" }
 *         price: { type: number, example: 3500 }
 *         isHeavy: { type: boolean, example: true }
 *       required: [name, price]
 *
 *     ItemSet:
 *       type: object
 *       description: "A named catalog group of individually-priced pieces. No set-level price — an order total is the sum of ONLY the selected pieces, and each selected piece is booked as its own countable order item. When returned inside the catalog browse (get-order-items) each set also carries kind:'set'."
 *       properties:
 *         _id: { type: string, example: 64c1f9a2e3c3b4a1d2f1c1a0 }
 *         name: { type: string, example: "Agbada Set" }
 *         active: { type: boolean, example: true }
 *         pieces:
 *           type: array
 *           items: { $ref: '#/components/schemas/ItemSetPiece' }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *       required: [name, pieces]
 *
 *     HandoffItem:
 *       type: object
 *       description: "A readable per-piece item reference. Items are tracked one physical piece per record, so 5 shirts are 5 HandoffItems each with quantity 1 and its own tag. itemId is still sent back to push/confirm; name + quantity are for display."
 *       properties:
 *         itemId: { type: string, example: 64d1f9a2e3c3b4a1d2f1c1b7 }
 *         tagId: { type: string, example: "TAG-03" }
 *         name: { type: string, example: Shirt }
 *         quantity: { type: number, example: 1 }
 *
 *     Handoff:
 *       type: object
 *       description: "A confirmed record of items moving from one station to the next (split production flow). Created 'pending' by the pushing station; the receiving station confirms the exact count. A pending handoff becomes 'superseded' when the same items leave the source station by another route (e.g. a later push to a different station) — it can never be confirmed, so it stops being listed as incoming and clears itself on the next read of the incoming queue."
 *       properties:
 *         handoffId: { type: string, example: 64d1f9a2e3c3b4a1d2f1c1a0 }
 *         fromStation: { type: string, example: sort-and-pretreat-station }
 *         toStation: { type: string, example: wash-and-dry-station }
 *         count: { type: number, description: "Number of physical pieces in the handoff.", example: 3 }
 *         status: { type: string, enum: [pending, confirmed, rejected, superseded], example: pending }
 *         supersededAt: { type: string, format: date-time, nullable: true, description: "Set when this handoff was overtaken; it is no longer actionable.", example: "2026-10-07T09:15:00.000Z" }
 *         supersededBy: { type: string, nullable: true, description: "The handoff that overtook this one, when it was superseded by a new push.", example: 64d1f9a2e3c3b4a1d2f1c1b7 }
 *         summary: { type: string, description: "Readable roll-up by item name.", example: "2 Shirts, 1 Trouser" }
 *         items:
 *           type: array
 *           items: { $ref: '#/components/schemas/HandoffItem' }
 *         itemIds:
 *           type: array
 *           description: "Raw piece ids (kept for machine use; prefer items[])."
 *           items: { type: string, example: 64d1f9a2e3c3b4a1d2f1c1b7 }
 *
 *     PendingHandoff:
 *       type: object
 *       description: "One pending handoff in a station's inbound queue."
 *       properties:
 *         orderId: { type: string, example: 64d1f9a2e3c3b4a1d2f1c000 }
 *         oscNumber: { type: string, example: "OSC-20260828-551210" }
 *         fullName: { type: string, example: "Jude Victor" }
 *         handoffId: { type: string, example: 64d1f9a2e3c3b4a1d2f1c1a0 }
 *         fromStation: { type: string, example: sort-and-pretreat-station }
 *         toStation: { type: string, example: wash-and-dry-station }
 *         count: { type: number, example: 3 }
 *         summary: { type: string, example: "2 Shirts, 1 Trouser" }
 *         items:
 *           type: array
 *           items: { $ref: '#/components/schemas/HandoffItem' }
 *         itemIds: { type: array, items: { type: string } }
 *         pushedAt: { type: string, format: date-time }
 *
 *     OrderSplitState:
 *       type: object
 *       description: "Where every physical piece in an order currently sits across the 5 stations, plus pending handoffs. Counts are per piece."
 *       properties:
 *         orderId: { type: string, example: 64d1f9a2e3c3b4a1d2f1c000 }
 *         oscNumber: { type: string, example: "OSC-20260828-551210" }
 *         stageStatus: { type: string, example: washing }
 *         stationStatus: { type: string, example: wash-and-dry-station }
 *         countByStation:
 *           type: object
 *           additionalProperties: { type: number }
 *           example: { "wash-and-dry-station": 2, "pressing-and-ironing-station": 1 }
 *         stations:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               station: { type: string, example: wash-and-dry-station }
 *               count: { type: number, example: 2 }
 *               summary: { type: string, example: "2 Shirts" }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     itemId: { type: string, example: 64d1f9a2e3c3b4a1d2f1c1b7 }
 *                     tagId: { type: string, example: "TAG-03" }
 *                     name: { type: string, example: Shirt }
 *                     quantity: { type: number, example: 1 }
 *                     onHold: { type: boolean, example: false }
 *         pendingHandoffs:
 *           type: array
 *           items: { $ref: '#/components/schemas/Handoff' }
 *
 *     DispatchQueueOrder:
 *       description: "A row in the pickup or delivery work queue. `needsRider` is the actionable flag — intake-and-tag assigns the rider, so an order sits here with no rider until they do. `waitingMinutes` counts from order creation; an unassigned paid leg raises a staff notification at 30 minutes and an email escalation at 60 (both tunable in AdminSetting)."
 *       allOf:
 *         - $ref: '#/components/schemas/BookOrder'
 *         - type: object
 *           properties:
 *             needsRider:
 *               type: boolean
 *               description: True when no rider is assigned to this leg yet.
 *               example: true
 *             rider:
 *               type: object
 *               nullable: true
 *               description: Assigned rider, or null.
 *               properties:
 *                 _id: { type: string, example: 64d1f9a2e3c3b4a1d2f1c000 }
 *                 fullName: { type: string, example: "Chidi Okafor" }
 *                 phoneNumber: { type: string, example: "08012345678" }
 *             paid:
 *               type: boolean
 *               description: paymentStatus === success. Unpaid rows are shown, not hidden.
 *               example: true
 *             itemCount: { type: integer, example: 3 }
 *             waitingMinutes: { type: integer, example: 95 }
 *             waitingDays: { type: integer, example: 0 }
 *             legStatus:
 *               type: string
 *               nullable: true
 *               description: "This leg's own status (`dispatchDetails.<leg>.status`). Filter the queue on it with `?legStatus=`."
 *               example: scheduled
 *             failed:
 *               type: boolean
 *               description: "True when this leg's status is `failed`. A failed run keeps its stage and its rider, so without this flag it is indistinguishable from a healthy assigned one."
 *               example: false
 *             legNote:
 *               type: string
 *               nullable: true
 *               description: The rider's note for this leg — on a failed run, why it failed.
 *               example: "Customer not at home, phone switched off"
 *             landmark:
 *               type: string
 *               nullable: true
 *               description: "This leg's address landmark, lifted out of the structured address so a row can show it beside the street."
 *               example: "Opposite the blue mosque"
 *             landmarkMissing:
 *               type: boolean
 *               description: "True when this leg's address has no landmark. The customer app does not ask for one yet (staff intake does), so a customer-placed order can reach the rider with no directions; where the address matches one the customer has saved, the landmark is borrowed from it automatically."
 *               example: false
 *             tagPrinted:
 *               type: boolean
 *               description: "DELIVERY queue only. Whether the dispatch tag has been printed. Absent on the pickup queue — pickups are never tagged."
 *               example: false
 *             needsTag:
 *               type: boolean
 *               description: "DELIVERY queue only. The actionable flag: true means a rider CANNOT be assigned yet because no tag has been printed."
 *               example: true
 *             printCount:
 *               type: integer
 *               description: "DELIVERY queue only. Times the tag has been printed; reprints are allowed but counted."
 *               example: 0
 *             reprintFlagged:
 *               type: boolean
 *               description: "DELIVERY queue only. True past the reprint review threshold (3), so repeated reprints get looked at."
 *               example: false
 *
 *     MonthlyLeadReport:
 *       type: object
 *       description: >
 *         One month of lead performance, as plain counts and naira totals. No
 *         percentages — every rate the founder wants is worked out by hand from these
 *         numbers. `leadsEntered` counts GENUINE leads only (not cards auto-created by
 *         an order, not backfilled cards). `booked` counts LEADS who placed an order
 *         this month (deduplicated — a lead who booked twice is one), and `revenue`
 *         sums every qualifying order; both exclude cancelled and recovery orders.
 *
 *         Subscriptions: a lead who converts by buying a PLAN is credited with that
 *         plan's FIRST payment, and their draw-down orders count ₦0 so the same money
 *         is never counted twice. Renewals are deliberately NOT counted — this report
 *         measures the sales reps' conversion for the effort spent in that window, so
 *         each month's figure stays stable and comparable instead of creeping upward
 *         for as long as a customer stays subscribed. Ongoing customer value belongs in
 *         a customer/CRM revenue view, not here.
 *       properties:
 *         month: { type: string, example: "2026-09" }
 *         timezone:
 *           type: string
 *           example: "Africa/Lagos"
 *           description: Month boundaries are Lagos time, not UTC.
 *         leadsEntered:
 *           type: integer
 *           example: 12
 *           description: Genuine leads that entered this month.
 *         coldLeads:
 *           type: integer
 *           example: 3
 *           description: Of this month's leads, how many staff have marked `cold-lead`.
 *         leadsStillBeingWorked:
 *           type: integer
 *           example: 4
 *           description: Of this month's leads, how many are still open — not cold, not yet booked.
 *         fromThisMonthsLeads:
 *           type: object
 *           description: This month's leads who booked in this same month.
 *           properties:
 *             booked: { type: integer, example: 5 }
 *             revenue: { type: integer, example: 42500 }
 *         fromEarlierLeads:
 *           type: object
 *           description: Leads that entered in OTHER months but booked in this one.
 *           properties:
 *             booked: { type: integer, example: 3 }
 *             revenue: { type: integer, example: 18900 }
 *             byCohort:
 *               type: array
 *               description: Which earlier month each of those leads came from, newest first.
 *               items:
 *                 type: object
 *                 properties:
 *                   month: { type: string, example: "2026-08" }
 *                   booked: { type: integer, example: 2 }
 *                   revenue: { type: integer, example: 12400 }
 *         subscriptionConversions:
 *           type: integer
 *           description: >
 *             Leads who converted this month by buying a subscription, and whose first
 *             payment is included in the revenue above. First charges only — renewals
 *             are never counted.
 *           example: 1
 *         subscriptionDrawDownOrders:
 *           type: integer
 *           description: >
 *             Orders in this month that a subscription paid for, and which therefore
 *             contributed ₦0. Shown so the revenue figures can be read without
 *             wondering what was excluded — a ₦0 order would otherwise be
 *             indistinguishable from a genuinely free one.
 *           example: 4
 *       example:
 *         month: "2026-09"
 *         timezone: "Africa/Lagos"
 *         leadsEntered: 12
 *         coldLeads: 3
 *         leadsStillBeingWorked: 4
 *         fromThisMonthsLeads: { booked: 5, revenue: 42500 }
 *         fromEarlierLeads:
 *           booked: 3
 *           revenue: 18900
 *           byCohort:
 *             - { month: "2026-08", booked: 2, revenue: 12400 }
 *             - { month: "2026-07", booked: 1, revenue: 6500 }
 *         subscriptionConversions: 1
 *         subscriptionDrawDownOrders: 4
 *
 *     StationScopedOrder:
 *       description: "An order as ONE station sees it. Under split-flow an order's pieces can sit at several stations at once, so `items` here contains ONLY the pieces currently at the station serving the request — not the whole order. A station that was handed 3 of 10 pieces sees exactly those 3. Use `totalItemCount` and `itemsElsewhere` for whole-order context, or GET /orders/{id}/split-state for the full per-station breakdown. Derived flags on these endpoints (allItemsConfirmed, allItemsSorted, allItemsPretreated, readyToSend, confirmedItemCount, flaggedItemCount, itemCount) are scoped the same way — `allItemsConfirmed: true` means every piece AT THIS STATION is confirmed, which is the gate for pushing them on."
 *       allOf:
 *         - $ref: '#/components/schemas/BookOrder'
 *         - type: object
 *           properties:
 *             itemsAtStationCount:
 *               type: integer
 *               description: "How many pieces this station currently holds (equals items.length)."
 *               example: 3
 *             totalItemCount:
 *               type: integer
 *               description: "Total pieces in the whole order, across every station."
 *               example: 10
 *             itemsElsewhere:
 *               type: object
 *               description: "Piece counts at every OTHER station, keyed by station."
 *               additionalProperties: { type: integer }
 *               example: { "sort-and-pretreat-station": 7 }
 *             allItemsConfirmed:
 *               type: boolean
 *               description: >
 *                 Every piece AT THIS STATION is confirmed. Returned by the queue
 *                 lists AND by Active Wash / Active Dry. On those two it is always
 *                 true — an order only reaches them once the last piece is
 *                 confirmed (that confirmation is what stamps
 *                 `washDetails.startedAt`, which those lists select on). It is sent
 *                 anyway so a shared station card never reads it as undefined and
 *                 renders a "waiting confirmation" state that cannot clear.
 *               example: true
 *             confirmedItemCount:
 *               type: integer
 *               description: "How many of this station's pieces are confirmed."
 *               example: 3
 *             canMoveToDrying:
 *               type: boolean
 *               description: >
 *                 WASH & DRY only. The actionable next step on Active Wash: true
 *                 until the order is moved to drying, then false (and it appears on
 *                 Active Dry instead). Drive the button from this, not from
 *                 allItemsConfirmed — confirmation is already done by then.
 *                 Target: PATCH /wash-dry/order/active-wash/{id}/move-to-drying
 *               example: true
 *
 *     DispatchTag:
 *       type: object
 *       description: >
 *         The ORDER-LEVEL dispatch tag a rider carries to the customer's door. One per
 *         order, and only for an order leaving the office by rider delivery — a customer
 *         collecting in person needs none. This is NOT the per-piece intake item tag
 *         (items[].tagId); it exists so the rider can positively identify the order to
 *         someone they have never met, somewhere they don't control.
 *       properties:
 *         orderId: { type: string, example: 68cf1a2b4d5e6f7a8b9c0d1e }
 *         ref:
 *           type: string
 *           description: "Tag reference — the order's own OSC number, so there is no second numbering scheme to reconcile."
 *           example: "OSC-20260428-321782"
 *         orderReference: { type: string, example: "OSC-20260428-321782" }
 *         customerName: { type: string, example: "Jude Victor" }
 *         customerPhone: { type: string, example: "08012345678" }
 *         deliveryAddress:
 *           allOf:
 *             - $ref: '#/components/schemas/OrderAddress'
 *           nullable: true
 *           description: "Normalised to the structured shape even for legacy string orders. null only if the order carries no delivery address."
 *         contents:
 *           type: string
 *           description: "Readable roll-up of what is in the order, by item name."
 *           example: "5 Shirts, 3 Trousers"
 *         itemCount:
 *           type: number
 *           description: "Total physical pieces (items are stored one piece per record)."
 *           example: 8
 *         items:
 *           type: array
 *           description: "Per-piece breakdown, same shape the handoff payloads use."
 *           items: { $ref: '#/components/schemas/HandoffItem' }
 *         paymentState:
 *           type: string
 *           enum: [paid, unpaid]
 *           description: "Normally 'paid' — laundry is prepaid by card, wallet or subscription."
 *           example: paid
 *         amountDue:
 *           type: number
 *           nullable: true
 *           description: >
 *             The outstanding figure, or null when there is nothing owed. null rather
 *             than 0 on purpose, so the tag prints no figure at all and a rider can
 *             never read a "₦0" as an instruction to collect zero. Derived from
 *             paymentStatus, never from amount alone — a subscription order has an
 *             amount but is already paid.
 *           example: null
 *         paymentNotice:
 *           type: string
 *           description: >
 *             The payment situation in words the rider can act on. There is no
 *             cash-on-delivery workflow: an outstanding amount means "ask the customer
 *             to settle it in the app", never "collect cash". Print this next to
 *             amountDue so a bare figure cannot be misread as a collection instruction.
 *           example: "Paid in full — nothing to collect."
 *         deliveryNote:
 *           type: string
 *           description: "Special delivery instruction, e.g. call on arrival / leave with the gateman."
 *           example: "Call on arrival, gate is usually locked"
 *         printedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: "null until the tag has been printed at least once."
 *           example: "2026-09-24T14:22:10.000Z"
 *         printCount:
 *           type: number
 *           description: "Increments on every print, so repeated reprints are visible."
 *           example: 1
 *         reprintFlagged:
 *           type: boolean
 *           description: "true once printCount passes the review threshold (3) — surface it so repeated reprints get looked at."
 *           example: false
 *
 *     OrderAddress:
 *       type: object
 *       description: "Structured order address. Staff intake (createBookOrder with isPickUp/isDelivery) REQUIRES label + address + landmark. Customer/app and bot bookings may send a plain string, which is stored as { label:'', address, landmark:'' }; legacy orders may still return a plain string, so consumers should accept either shape."
 *       properties:
 *         label: { type: string, example: "Home" }
 *         address: { type: string, example: "12 Lagos Street, Yaba" }
 *         landmark: { type: string, example: "Opposite GTBank" }
 *       required: [label, address, landmark]
 *
 *     TimelineOrder:
 *       type: object
 *       description: "Order header returned by ALL 6 station timeline endpoints (intake, sort & pretreat, wash & dry, press, qc, rider). Single shared shape (buildTimelineOrderView) — includes the full items[] plus addresses and note."
 *       properties:
 *         _id: { type: string, example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *         oscNumber: { type: string, example: "OSC-20260428-321782" }
 *         fullName: { type: string, example: "Jude Victor" }
 *         serviceType: { type: string, example: wash-and-iron }
 *         serviceTier: { type: string, example: standard }
 *         amount: { type: number, example: 4500 }
 *         stage:
 *           type: object
 *           properties:
 *             status: { type: string, example: washing }
 *         stationStatus: { type: string, example: wash-and-dry }
 *         trackingStatus: { type: string, enum: [in_progress, completed, delivery_failed, pickup_failed], example: in_progress }
 *         qcDetails: { type: object, nullable: true }
 *         dispatchDetails: { type: object, nullable: true }
 *         items: { type: array, items: { $ref: '#/components/schemas/TimelineOrderItem' } }
 *         pickupAddress: { oneOf: [ { $ref: '#/components/schemas/OrderAddress' }, { type: string } ], nullable: true }
 *         deliveryAddress: { oneOf: [ { $ref: '#/components/schemas/OrderAddress' }, { type: string } ], nullable: true }
 *         extraNote: { type: string, nullable: true, example: "Handle with care" }
 *         createdAt: { type: string, format: date-time }
 *
 *     BookOrderSummary:
 *       type: object
 *       description: "Compact order view used by the recovery dashboard — incl. §6 recovery-order fields."
 *       properties:
 *         _id: { type: string, example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *         oscNumber: { type: string, example: OSC-2026-00456 }
 *         amount: { type: number, example: 0 }
 *         stage:
 *           type: object
 *           properties:
 *             status: { type: string, example: queue }
 *             note: { type: string, example: "Recovery order created" }
 *             updatedAt: { type: string, format: date-time }
 *         stationStatus: { type: string, example: intake-and-tag-station }
 *         isRecoveryOrder: { type: boolean, example: true }
 *         recoveryActionType: { type: string, enum: [rewash, rework, repair, replace], example: rewash }
 *         recoveryForComplaintId: { type: string, nullable: true }
 *         recoveryForOrderId: { type: string, nullable: true }
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type: { type: string, example: shirt }
 *               price: { type: number, example: 0 }
 *               quantity: { type: integer, example: 2 }
 *         createdAt: { type: string, format: date-time }
 *
 *     ComplaintCase:
 *       type: object
 *       description: A complaint owned by a Customer Experience officer, moving through the recovery state machine.
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e400 }
 *         userId: { type: string, example: 64d3c9c0f1b2a8e9d0f12345 }
 *         orderId: { type: string, example: 64b9a7f6e3c3b4a1d2f1c9b0 }
 *         feedbackId: { type: string, nullable: true }
 *         complaintTypeId:
 *           oneOf:
 *             - { type: string }
 *             - { $ref: '#/components/schemas/ComplaintType' }
 *           description: Primary (first) type — kept for backward compatibility. Prefer complaintTypeIds.
 *         complaintTypeIds:
 *           type: array
 *           description: "All complaint types cited (§5 multi-type). Ids, or populated ComplaintType objects on case reads."
 *           items:
 *             oneOf:
 *               - { type: string }
 *               - { $ref: '#/components/schemas/ComplaintType' }
 *         affectedItems: { type: array, items: { type: string }, example: ["Blue shirt", "White trousers"] }
 *         description: { type: string, example: "Stain still visible on two items after cleaning." }
 *         photos: { type: array, items: { type: string }, example: ["https://cdn.chuvi.com/complaints/abc.jpg"] }
 *         status:
 *           type: string
 *           enum: [submitted, under-review, awaiting-item, item-received, recovery-in-progress, ready, resolved, customer-confirmed, closed, reopened]
 *           example: under-review
 *         assignedTo: { type: string, nullable: true, description: CX officer who owns the case }
 *         recoveryActions: { type: array, items: { $ref: '#/components/schemas/RecoveryAction' } }
 *         compensations: { type: array, description: "§7 full compensation history (wallet credit + cash)", items: { $ref: '#/components/schemas/RecoveryCompensation' } }
 *         recoveryCredit: { $ref: '#/components/schemas/RecoveryCredit', nullable: true, description: "Deprecated — single-credit field for pre-§7 cases only" }
 *         recoveryOfferTriggered: { type: boolean, example: false }
 *         conversationId: { type: string, nullable: true, example: 665f1c2ab9e77a0012d4e500 }
 *         firstReviewDueAt: { type: string, format: date-time, nullable: true, description: SLA — 24h }
 *         resolutionDueAt: { type: string, format: date-time, nullable: true, description: SLA — 72h }
 *         reviewedAt: { type: string, format: date-time, nullable: true }
 *         resolvedAt: { type: string, format: date-time, nullable: true }
 *         confirmedAt: { type: string, format: date-time, nullable: true }
 *         confirmationDueAt: { type: string, format: date-time, nullable: true, description: "§5 — customer must confirm by this time (48h after resolved) or CX may close" }
 *         confirmationReminderSentAt: { type: string, format: date-time, nullable: true }
 *         closedAt: { type: string, format: date-time, nullable: true }
 *         closedBy: { type: string, nullable: true, description: CX/admin who closed it (null when customer-confirmed) }
 *         closeReason: { type: string, nullable: true }
 *         confirmed: { type: boolean, description: "true = closed by customer confirmation; false = CX-closed after silence", example: true }
 *         recoveryRating: { type: integer, minimum: 1, maximum: 5, nullable: true, description: "§5 post-recovery satisfaction", example: 5 }
 *         recoveryRatingComment: { type: string, nullable: true }
 *         reopenedAt: { type: string, format: date-time, nullable: true }
 *         reopenCount: { type: integer, example: 0 }
 *         escalated: { type: boolean, example: false }
 *         escalationReason:
 *           type: string
 *           nullable: true
 *           enum: [missing-item, serious-damage, replacement-required, compensation-required, complaint-reopened, review-overdue, resolution-overdue, customer-rejected]
 *         escalatedAt: { type: string, format: date-time, nullable: true }
 *         statusHistory:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               from: { type: string, example: submitted }
 *               to: { type: string, example: under-review }
 *               note: { type: string, nullable: true }
 *               changedBy: { type: string, nullable: true }
 *               changedAt: { type: string, format: date-time }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     Conversation:
 *       type: object
 *       description: An in-app conversation thread (complaint chat, and later the support bot).
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e500 }
 *         userId: { type: string, example: 64d3c9c0f1b2a8e9d0f12345 }
 *         type: { type: string, enum: [complaint, support], example: complaint }
 *         complaintCaseId: { type: string, nullable: true, example: 665f1c2ab9e77a0012d4e400 }
 *         orderId: { type: string, nullable: true }
 *         mode: { type: string, enum: [bot, human], example: human }
 *         open: { type: boolean, example: true }
 *         agentJoinedAt: { type: string, format: date-time, nullable: true, description: When a staff member first engaged a handed-off chat }
 *         assignedRole: { type: string, enum: [cx, admin], nullable: true, description: "Who owns the human handling — CX on first reply, admin if an admin takes over (§2)." }
 *         assignedTo: { type: string, nullable: true, description: Staff/admin user id currently owning the conversation }
 *         adminJoinedAt: { type: string, format: date-time, nullable: true, description: When an admin took ownership }
 *         escalation:
 *           type: object
 *           description: CX → Admin escalation (§2). Customers can never trigger this.
 *           properties:
 *             escalated: { type: boolean, example: false }
 *             escalatedBy: { type: string, nullable: true, description: CX user id who escalated }
 *             reason: { type: string, nullable: true, example: "Refund above my approval limit" }
 *             urgency: { type: string, enum: [low, normal, high, urgent], nullable: true, example: high }
 *             escalatedAt: { type: string, format: date-time, nullable: true }
 *         closedAt: { type: string, format: date-time, nullable: true }
 *         closedBy: { type: string, nullable: true, description: Staff user id who closed it }
 *         closeReason: { type: string, nullable: true, example: "Resolved — order re-delivered" }
 *         lastMessageAt: { type: string, format: date-time, nullable: true }
 *         unreadForCustomer: { type: integer, example: 0 }
 *         unreadForStaff: { type: integer, example: 1 }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     ChatMessage:
 *       type: object
 *       description: One message inside a Conversation.
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e510 }
 *         conversationId: { type: string, example: 665f1c2ab9e77a0012d4e500 }
 *         senderType: { type: string, enum: [customer, staff, bot, system], example: staff }
 *         senderId: { type: string, nullable: true, description: Set for customer/staff; null for system/bot }
 *         text: { type: string, nullable: true, example: "We're re-washing the two shirts and will re-deliver tomorrow." }
 *         attachments: { type: array, items: { type: string }, example: [] }
 *         readByCustomer: { type: boolean, example: false }
 *         readByStaff: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time }
 *
 *     BotReply:
 *       type: object
 *       description: The in-app assistant's response to a customer message.
 *       properties:
 *         conversationId: { type: string, example: 665f1c2ab9e77a0012d4e900 }
 *         mode: { type: string, enum: [bot, human], example: bot }
 *         handledBy: { type: string, enum: [bot, handoff, human], example: bot }
 *         intent: { type: string, nullable: true, description: "The resolved intent — usually one of: greeting, about, order-status, wallet-balance, view-offers, referral-info, apply-referral-code, update-details, booking-guide, submit-feedback, file-complaint, talk-to-human, pricing, turnaround, service-info, policy, payment-status, reward-status, apply-payment, unknown. For a COMPOUND read-only request it is a '+'-joined string, e.g. 'wallet-balance+order-status'. Don't hard-switch on exact values.", example: order-status }
 *         replies:
 *           type: array
 *           description: "Bot messages posted in reply (empty once handed to a human). A compound request returns ONE combined message; single requests one. Render the whole array; dedupe against socket pushes by _id. A reply's `text` may contain a Paystack checkout URL (card payment for a booking) — render URLs tappable/openable; the order stays PENDING until the payment webhook confirms."
 *           items:
 *             type: object
 *             properties:
 *               _id: { type: string, example: 665f1c2ab9e77a0012d4e920 }
 *               senderType: { type: string, example: bot }
 *               text: { type: string, example: "Order CHUVI-1042: out for delivery\nEstimated delivery: Mon Jul 20 2026" }
 *               createdAt: { type: string, format: date-time }
 *         quickActions:
 *           type: array
 *           description: "Context-aware tappable chips for this turn. Tapping one sends its `message` back as the next customer message (no separate action protocol). A confirm/offer step → Yes/No; the payment step → Pay from wallet / Pay by card; the delivery-speed step → Standard / Express / Same-day; a mid-collection step → Talk To Staff; a completed answer → the main menu; a handoff → empty. Always render whatever chips arrive; don't hard-code the set."
 *           items:
 *             type: object
 *             properties:
 *               label: { type: string, example: Book Laundry }
 *               message: { type: string, example: "I want to book a pickup" }
 *
 *     # ── Communication ────────────────────────────────────────────────────
 *     CommunicationTemplate:
 *       type: object
 *       description: Admin-managed message template rendered by the communication layer.
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e600 }
 *         key: { type: string, example: offer-available }
 *         name: { type: string, example: Offer Available }
 *         title: { type: string, example: "A new reward is waiting 🎁" }
 *         body: { type: string, example: "Hello {{firstName}}, you have a new offer: {{offerName}}. Tap to view it." }
 *         smsBody: { type: string, nullable: true, example: "Hi {{firstName}}, a new Chuvi reward is waiting for you." }
 *         channels: { type: array, items: { type: string, enum: [in-app, sms] }, example: [in-app] }
 *         page: { type: string, nullable: true, example: offers }
 *         active: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     CommunicationLog:
 *       type: object
 *       description: One delivery-ledger entry per message per channel.
 *       properties:
 *         _id: { type: string, example: 665f1c2ab9e77a0012d4e610 }
 *         userId: { type: string, example: 64d3c9c0f1b2a8e9d0f12345 }
 *         messageType: { type: string, example: offer-available }
 *         sourceSystem: { type: string, enum: [crm, offer, order, feedback, recovery, referral, broadcast, system], example: offer }
 *         templateKey: { type: string, nullable: true, example: offer-available }
 *         relatedRef: { type: string, nullable: true, example: 665f1c2ab9e77a0012d4e120 }
 *         relatedModel: { type: string, nullable: true, example: CustomerOffer }
 *         channel: { type: string, enum: [in-app, sms], example: in-app }
 *         status: { type: string, enum: [pending, sent, delivered, read, failed], example: read }
 *         content:
 *           type: object
 *           properties:
 *             title: { type: string, example: "A new reward is waiting 🎁" }
 *             body: { type: string, example: "Hello Ada, you have a new offer: Second Order Offer." }
 *         notificationId: { type: string, nullable: true }
 *         error: { type: string, nullable: true }
 *         retryCount: { type: integer, example: 0 }
 *         sentAt: { type: string, format: date-time, nullable: true }
 *         readAt: { type: string, format: date-time, nullable: true }
 *         createdAt: { type: string, format: date-time }
 */
