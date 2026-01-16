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
