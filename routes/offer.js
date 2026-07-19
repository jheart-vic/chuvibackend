const router = require('express').Router()
const OfferController = require('../controllers/offer.controller')
const auth = require('../middlewares/auth')
const adminAuth = require('../middlewares/adminAuth')
const {
    ROUTE_OFFERS,
    ROUTE_OFFER_BY_ID,
    ROUTE_OFFER_PERFORMANCE,
    ROUTE_OFFER_ASSIGN,
    ROUTE_OFFER_CANCEL_LINKAGE,
    ROUTE_OFFER_MY_OFFERS,
    ROUTE_OFFER_VIEW,
    ROUTE_OFFER_VALIDATE,
    ROUTE_OFFER_ATTACH,
} = require('../util/page-route')

const controller = new OfferController()

// NOTE: specific paths are registered before "/:id" so Express never
// swallows them as an offer id.

/**
 * @swagger
 * /offers/my-offers:
 *   get:
 *     summary: Customer Offer Page — Your Rewards / Current Promotions / Always Available
 *     description: >
 *       Personal offers linked to the customer (live linkages), promotional
 *       campaigns the customer currently qualifies for, and permanent baseline
 *       benefits.
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The three offer sections
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     rewards:
 *                       type: array
 *                       description: CustomerOffer linkages with the offer populated
 *                       items: { type: object }
 *                     promotions:
 *                       type: array
 *                       items: { type: object }
 *                     baseline:
 *                       type: array
 *                       items: { type: object }
 *       500:
 *         description: Server error
 */
router.get(ROUTE_OFFER_MY_OFFERS, [auth], controller.myOffers)

/**
 * @swagger
 * /offers/my-offers/{id}/view:
 *   post:
 *     summary: Mark a linked offer as viewed (customer opened it)
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: CustomerOffer linkage id
 *     responses:
 *       200:
 *         description: Updated linkage
 *       400:
 *         description: Offer not found
 */
router.post(ROUTE_OFFER_VIEW, [auth], controller.viewOffer)

/**
 * @swagger
 * /offers/validate:
 *   post:
 *     summary: Price an order draft with offers applied (booking-time quote)
 *     description: >
 *       Applies active baseline benefits automatically, plus at most one
 *       personal offer (via customerOfferId) and one promotion (via
 *       promoOfferId; only combinable with a personal offer when the promo is
 *       flagged stackable). Eligibility is re-checked here. Ineligible offers
 *       come back under `rejected` with a reason instead of failing the call.
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: number, example: 6000, description: Items subtotal }
 *               itemCount: { type: integer, example: 7 }
 *               serviceType: { type: string, example: wash-and-iron }
 *               deliveryAmount: { type: number, example: 1000 }
 *               pickupAmount: { type: number, example: 500 }
 *               items:
 *                 type: array
 *                 description: Needed for free-items benefits
 *                 items:
 *                   type: object
 *                   properties:
 *                     type: { type: string, example: shirt }
 *                     price: { type: number, example: 800 }
 *                     quantity: { type: integer, example: 3 }
 *               customerOfferId: { type: string, description: Personal offer linkage to apply }
 *               promoOfferId: { type: string, description: Promotional offer to apply }
 *     responses:
 *       200:
 *         description: Pricing breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message:
 *                   type: object
 *                   properties:
 *                     baseline: { type: array, items: { type: object } }
 *                     personal: { type: object, nullable: true }
 *                     promotion: { type: object, nullable: true }
 *                     totalDiscount: { type: number, example: 600 }
 *                     freePickup: { type: boolean }
 *                     freeDelivery: { type: boolean }
 *                     creditPromised: { type: number, example: 0 }
 *                     rejected:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           which: { type: string, example: promotion }
 *                           reason: { type: string, example: "This promotion cannot be combined with a personal reward" }
 *                     payable: { type: number, example: 6400 }
 *       500:
 *         description: Server error
 */
router.post(ROUTE_OFFER_VALIDATE, [auth], controller.validateOffer)

/**
 * @swagger
 * /offers/attach:
 *   post:
 *     summary: Attach a personal offer to the customer's order
 *     description: >
 *       Links the selected reward to a created order (one personal reward per
 *       order). The offer is only consumed (REDEEMED) when the order is
 *       delivered; a cancelled order releases it.
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerOfferId, bookOrderId]
 *             properties:
 *               customerOfferId: { type: string }
 *               bookOrderId: { type: string }
 *     responses:
 *       200:
 *         description: Linkage now attached to the order
 *       400:
 *         description: Offer/order not found, expired, already used, or another reward already on the order
 */
router.post(ROUTE_OFFER_ATTACH, [auth], controller.attachOffer)

/**
 * @swagger
 * /offers/assign:
 *   post:
 *     summary: Manually assign an offer to a customer (admin)
 *     description: Staff override — bypasses profile eligibility but still enforces active status, date window, usage limit and one-use-per-customer.
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, offerId]
 *             properties:
 *               userId: { type: string }
 *               offerId: { type: string }
 *               note: { type: string, example: "Goodwill after delayed order" }
 *     responses:
 *       200:
 *         description: Created linkage
 *       400:
 *         description: Validation error, unknown user/offer, or customer already has this offer
 */
router.post(ROUTE_OFFER_ASSIGN, [adminAuth], controller.assignOffer)

/**
 * @swagger
 * /offers/customer-offers/{id}/cancel:
 *   post:
 *     summary: Cancel a customer-offer linkage (admin correction)
 *     description: Requires a reason. Redeemed linkages cannot be cancelled here — use the order correction flow.
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, example: "Assigned in error" }
 *     responses:
 *       200:
 *         description: Cancelled linkage
 *       400:
 *         description: Not found, redeemed, or missing reason
 */
router.post(ROUTE_OFFER_CANCEL_LINKAGE, [adminAuth], controller.cancelLinkage)

/**
 * @swagger
 * /offers:
 *   get:
 *     summary: List offers in the Offer Builder (admin)
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [personal, promotional, baseline] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, active, paused, expired, archived] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated offers
 *   post:
 *     summary: Create an offer (admin Offer Builder)
 *     description: >
 *       Offers are created once here and linked to many customers by the
 *       system. Personal offers need a trigger (first-experience,
 *       second-order, loyalty, referral-reward, recovery, reactivation, or
 *       manual for staff-assigned). New offers start as draft unless a status
 *       is given.
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, headline, type, benefits]
 *             properties:
 *               name: { type: string, example: Second Order Offer }
 *               headline: { type: string, example: "10% off your next wash" }
 *               description: { type: string }
 *               type: { type: string, enum: [personal, promotional, baseline] }
 *               trigger:
 *                 type: string
 *                 enum: [first-experience, second-order, loyalty, referral-reward, recovery, reactivation, manual]
 *                 description: Personal offers only
 *               benefits:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     benefitType:
 *                       type: string
 *                       enum: [order-discount, free-pickup, free-delivery, free-items, extra-laundry-credit]
 *                     percent: { type: number, example: 10 }
 *                     amount: { type: number, description: Fixed discount amount }
 *                     minPaidItems: { type: integer }
 *                     freeItemCount: { type: integer }
 *                     eligibleItemTypes: { type: array, items: { type: string } }
 *                     maxFreeValue: { type: number }
 *                     minOrderValue: { type: number }
 *                     creditAmount: { type: number, description: Extra laundry credit value }
 *               rules:
 *                 type: object
 *                 properties:
 *                   stages: { type: array, items: { type: string } }
 *                   tags: { type: array, items: { type: string } }
 *                   minOrders: { type: integer }
 *                   maxOrders: { type: integer }
 *                   daysSinceLastOrder: { type: integer }
 *                   minOrderValue: { type: number }
 *                   minItems: { type: integer }
 *                   firstOrderOnly: { type: boolean }
 *                   serviceTypes: { type: array, items: { type: string } }
 *                   oneUsePerCustomer: { type: boolean, default: true }
 *               startDate: { type: string, format: date-time }
 *               expiryDate: { type: string, format: date-time }
 *               customerWindowDays: { type: integer, default: 14, description: Days a customer has to use it once linked }
 *               usageLimit: { type: integer, description: Global redemption cap }
 *               status: { type: string, enum: [draft, active, paused, expired, archived], default: draft }
 *               stackableWithPersonal: { type: boolean, default: false, description: Promos only — may combine with a personal reward }
 *               creditExpiryDays: { type: integer, description: Overrides the RewardSetting default for granted credit }
 *     responses:
 *       200:
 *         description: Created offer
 *       400:
 *         description: Validation error
 */
router.get(ROUTE_OFFERS, [adminAuth], controller.listOffers)
router.post(ROUTE_OFFERS, [adminAuth], controller.createOffer)

/**
 * @swagger
 * /offers/{id}/performance:
 *   get:
 *     summary: Offer performance — linkage counts and redemption rate (admin)
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Offer with byStatus counts and redemptionRate %
 *       400:
 *         description: Offer not found
 */
router.get(ROUTE_OFFER_PERFORMANCE, [adminAuth], controller.getOfferPerformance)

/**
 * @swagger
 * /offers/{id}:
 *   put:
 *     summary: Update an offer — edit fields or change status (admin)
 *     description: Activate (status=active), pause, expire or archive by setting status. All builder fields are editable.
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Any subset of the create fields
 *     responses:
 *       200:
 *         description: Updated offer
 *       400:
 *         description: Offer not found or validation error
 */
router.put(ROUTE_OFFER_BY_ID, [adminAuth], controller.updateOffer)

module.exports = router
