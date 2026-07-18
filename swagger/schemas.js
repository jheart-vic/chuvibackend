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
