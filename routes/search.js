const router = require('express').Router()
const SearchController = require('../controllers/search.controller')
const adminAuth = require('../middlewares/adminAuth')
const riderAuth = require('../middlewares/riderAuth')
const sortAndPretreatAuth = require('../middlewares/sortAndPretreatAuth')
const washAndDryAuth = require('../middlewares/washAndDryAuth')
const pressAndIronAuth = require('../middlewares/pressAndIronAuth')
const intakeUserAuth = require('../middlewares/intakeUserAuth')
const qcAuth = require('../middlewares/qcAuth')
const multiAuth = require('../middlewares/multiAuth')

const {
    ROUTE_SEARCH_ORDERS,
    ROUTE_SEARCH_ORDER_DETAIL,
} = require('../util/page-route')
const { ROLE } = require('../util/constants')

/**
 * @swagger
 * /search/search-orders:
 *   get:
 *     summary: Search orders by OSC number, phone number, or customer name
 *     description: |
 *       Searches book orders using a free-text term matched against oscNumber,
 *       phoneNumber, and fullName fields. Results can additionally be filtered
 *       to a date range (last 7 days, 30 days, 90 days, this year, or a custom
 *       start/end date window). Requires admin authentication.
 *     tags:
 *       - Search
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: >
 *           Search term matched against Order ID (oscNumber), phone number, or
 *           customer name. Leave empty to return all orders within the chosen
 *           date range.
 *         example: OSC-2024-001
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [7days, 30days, 90days, thisYear, custom]
 *         description: >
 *           Predefined date range for filtering. Use 'custom' together with
 *           startDate and endDate to define an arbitrary window.
 *         example: 7days
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start of custom date range (ISO format). Required when range is 'custom'.
 *         example: "2026-01-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End of custom date range (ISO format). Required when range is 'custom'.
 *         example: "2026-03-31"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of results per page.
 *     responses:
 *       200:
 *         description: Search results returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 50
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "663f1a2b4c8e4a001f9d0001"
 *                           oscNumber:
 *                             type: string
 *                             example: "OSC-2024-001"
 *                           fullName:
 *                             type: string
 *                             example: "Jane Doe"
 *                           phoneNumber:
 *                             type: string
 *                             example: "+2348012345678"
 *                           stage:
 *                             type: object
 *                             properties:
 *                               status:
 *                                 type: string
 *                                 example: "pending"
 *                           paymentStatus:
 *                             type: string
 *                             example: "success"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-03-23T09:40:00.000Z"
 *       400:
 *         description: Bad request – missing or invalid query parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

router.get(
    ROUTE_SEARCH_ORDERS,
    multiAuth(
        ROLE.ADMIN,
        ROLE.INTAKE_AND_TAG,
        ROLE.SORT_AND_PRETREAT,
        ROLE.WASH_AND_DRY,
        ROLE.PRESS,
        ROLE.QC,
    ),
    (req, res) => {
        const searchController = new SearchController()
        return searchController.searchOrders(req, res)
    },
)

/**
 * @swagger
 * /search/search-orders/:id:
 *   get:
 *     summary: Get full detail of a single order (drill-down from search results)
 *     description: |
 *       Returns the complete order document for the given MongoDB `_id`,
 *       with the linked user's name, email, phone, and avatar populated.
 *       Use the `_id` returned in the search-orders response.
 *     tags:
 *       - Search
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the order
 *         example: "663f1a2b4c8e4a001f9d0001"
 *     responses:
 *       200:
 *         description: Order detail returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Full BookOrder document with populated userId
 *       400:
 *         description: Missing or invalid order id
 *       404:
 *         description: Order not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get(
    ROUTE_SEARCH_ORDER_DETAIL,
    multiAuth(
        ROLE.ADMIN,
        ROLE.INTAKE_AND_TAG,
        ROLE.SORT_AND_PRETREAT,
        ROLE.WASH_AND_DRY,
        ROLE.PRESS,
        ROLE.QC,
    ),
    (req, res) => {
        const searchController = new SearchController()
        return searchController.getSearchedOrderDetail(req, res)
    },
)

module.exports = router
