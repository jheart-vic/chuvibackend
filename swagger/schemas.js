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
 *           enum: [pending, approved, rejected]
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
 *         trigger:
 *           type: string
 *           nullable: true
 *           enum: [first-experience, second-order, loyalty, referral-reward, recovery, reactivation, manual]
 *           example: second-order
 *         benefits:
 *           type: array
 *           items: { $ref: '#/components/schemas/OfferBenefit' }
 *         rules:
 *           type: object
 *           properties:
 *             stages: { type: array, items: { type: string }, example: [first-order] }
 *             tags: { type: array, items: { type: string } }
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
 *         usageLimit: { type: integer, nullable: true, description: Global redemption cap; null = unlimited }
 *         usedCount: { type: integer, example: 42 }
 *         status:
 *           type: string
 *           enum: [draft, active, paused, expired, archived]
 *           example: active
 *         stackableWithPersonal: { type: boolean, example: false }
 *         creditExpiryDays: { type: integer, nullable: true }
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
 *           description: Promotional campaigns the customer currently qualifies for
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
 *               which: { type: string, example: promotion }
 *               reason: { type: string, example: "This promotion cannot be combined with a personal reward" }
 *         payable: { type: number, example: 6400 }
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
 *     ReferralPage:
 *       type: object
 *       properties:
 *         referralCode: { type: string, example: CHUVIA1B2C3 }
 *         referralLink: { type: string, example: "https://www.chuvilaundry.com/join?ref=CHUVIA1B2C3" }
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
 *           description: Id, or the populated ComplaintType on case reads
 *         affectedItems: { type: array, items: { type: string }, example: ["Blue shirt", "White trousers"] }
 *         description: { type: string, example: "Stain still visible on two items after cleaning." }
 *         photos: { type: array, items: { type: string }, example: ["https://cdn.chuvi.com/complaints/abc.jpg"] }
 *         status:
 *           type: string
 *           enum: [submitted, under-review, awaiting-item, item-received, recovery-in-progress, ready, resolved, customer-confirmed, reopened]
 *           example: under-review
 *         assignedTo: { type: string, nullable: true, description: CX officer who owns the case }
 *         recoveryActions: { type: array, items: { $ref: '#/components/schemas/RecoveryAction' } }
 *         recoveryCredit: { $ref: '#/components/schemas/RecoveryCredit', nullable: true }
 *         recoveryOfferTriggered: { type: boolean, example: false }
 *         conversationId: { type: string, nullable: true, example: 665f1c2ab9e77a0012d4e500 }
 *         firstReviewDueAt: { type: string, format: date-time, nullable: true, description: SLA — 24h }
 *         resolutionDueAt: { type: string, format: date-time, nullable: true, description: SLA — 72h }
 *         reviewedAt: { type: string, format: date-time, nullable: true }
 *         resolvedAt: { type: string, format: date-time, nullable: true }
 *         confirmedAt: { type: string, format: date-time, nullable: true }
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
 *         intent: { type: string, nullable: true, enum: [greeting, order-status, wallet-balance, view-offers, referral-info, apply-referral-code, update-details, booking-guide, submit-feedback, file-complaint, talk-to-human, unknown], example: order-status }
 *         replies:
 *           type: array
 *           description: One or more bot messages posted in reply (empty once handed to a human).
 *           items:
 *             type: object
 *             properties:
 *               _id: { type: string, example: 665f1c2ab9e77a0012d4e920 }
 *               senderType: { type: string, example: bot }
 *               text: { type: string, example: "Order CHUVI-1042: out for delivery\nEstimated delivery: Mon Jul 20 2026" }
 *               createdAt: { type: string, format: date-time }
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
