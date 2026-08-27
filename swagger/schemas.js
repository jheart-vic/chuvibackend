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
 *         itemPerMonth:
 *           type: integer
 *         price:
 *           type: integer
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
 *             enum: [whatsapp, website, walk-in, express-user, standard-user, high-volume, low-volume, high-frequency, low-frequency, new-customer, repeat-customer, loyal-customer, reactivated-customer, fresh-lead, prospect, complaint, recovery-required, churned]
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
 *           enum: [lead-welcome, lead-qualify, lead-offer, lead-close, lead-reminder-1, lead-reminder-2, lead-mark-prospect, delivery-confirmation, feedback-request, reorder-prompt, reactivation-1, reactivation-2, reactivation-3, reactivation-mark-churned, prospect-broadcast, churn-broadcast]
 *           example: reorder-prompt
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
 *             reorder-prompt: "Hi {{firstName}}, laundry basket filling up again?"
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
 *           description: "Admin-configurable lead-nurture sequence + delivery timing (§3). Enabled steps are staggered — each has a distinct delayMinutes so messages never all fire in the same minute."
 *           items:
 *             type: object
 *             properties:
 *               messageType: { type: string, enum: [lead-welcome, lead-qualify, lead-offer, lead-close, lead-reminder-1, lead-reminder-2, lead-mark-prospect], example: lead-reminder-1 }
 *               enabled: { type: boolean, example: true }
 *               delayMinutes: { type: number, description: Minutes after lead creation this step fires, example: 1440 }
 *               cancelIfOrdered: { type: boolean, description: Drop this step if the lead books before it fires, example: true }
 *           example:
 *             - { messageType: lead-welcome, enabled: true, delayMinutes: 0, cancelIfOrdered: true }
 *             - { messageType: lead-qualify, enabled: true, delayMinutes: 2, cancelIfOrdered: true }
 *             - { messageType: lead-offer, enabled: true, delayMinutes: 5, cancelIfOrdered: true }
 *             - { messageType: lead-close, enabled: true, delayMinutes: 10, cancelIfOrdered: true }
 *             - { messageType: lead-reminder-1, enabled: true, delayMinutes: 1440, cancelIfOrdered: true }
 *             - { messageType: lead-reminder-2, enabled: true, delayMinutes: 4320, cancelIfOrdered: true }
 *             - { messageType: lead-mark-prospect, enabled: true, delayMinutes: 8640, cancelIfOrdered: true }
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
 *         serviceTier: { type: string, enum: [classic, premium, vip], example: premium }
 *         tierMultiplier: { type: number, nullable: true, description: Multiplier applied for the chosen tier (null on reconstructed), example: 1.5 }
 *         tierUplift: { type: number, nullable: true, description: itemsSubtotal - itemsBase, example: 2000 }
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
 *               type: { type: string, enum: [personal, promotion], example: personal }
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
 *         comment: { type: string, nullable: true, example: "Two shirts came back with the stain still there." }
 *         status: { type: string, enum: [pending, completed], example: completed }
 *         complaintCaseId: { type: string, nullable: true, example: 665f1c2ab9e77a0012d4e400 }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
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
