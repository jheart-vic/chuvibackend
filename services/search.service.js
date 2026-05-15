const BaseService = require('./base.service')
const BookOrderModel = require('../models/bookOrder.model')

class SearchService extends BaseService {
    async searchOrders(req) {
        try {
            const {
                q,
                range,
                startDate,
                endDate,
                page: rawPage,
                limit: rawLimit,
            } = req.query

            const page  = parseInt(rawPage)  || 1
            const limit = parseInt(rawLimit) || 10
            const skip  = (page - 1) * limit

            // ── 1. Build date filter ──────────────────────────────────────────
            const now = new Date()
            let dateFilter = {}

            if (range && range !== 'custom') {
                let from = null

                switch (range) {
                    case '7days':
                        from = new Date(now)
                        from.setDate(now.getDate() - 7)
                        break
                    case '30days':
                        from = new Date(now)
                        from.setDate(now.getDate() - 30)
                        break
                    case '90days':
                        from = new Date(now)
                        from.setDate(now.getDate() - 90)
                        break
                    case 'thisYear':
                        from = new Date(now.getFullYear(), 0, 1) // Jan 1 of current year
                        break
                    default:
                        break
                }

                if (from) {
                    dateFilter = { createdAt: { $gte: from, $lte: now } }
                }
            } else if (range === 'custom') {
                if (!startDate || !endDate) {
                    return BaseService.sendFailedResponse({
                        error:
                            'Please provide both startDate and endDate for a custom range',
                    })
                }

                const from = new Date(startDate)
                const to   = new Date(endDate)

                // Set end-of-day on the to date so the full day is included
                to.setHours(23, 59, 59, 999)

                if (isNaN(from.getTime()) || isNaN(to.getTime())) {
                    return BaseService.sendFailedResponse({
                        error: 'Invalid startDate or endDate format',
                    })
                }

                if (from > to) {
                    return BaseService.sendFailedResponse({
                        error: 'startDate must not be after endDate',
                    })
                }

                dateFilter = { createdAt: { $gte: from, $lte: to } }
            }

            // ── 2. Build text / identifier filter ────────────────────────────
            let searchFilter = {}

            if (q && q.trim() !== '') {
                const term = q.trim()

                // Escape special regex characters to prevent injection
                const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const regex   = new RegExp(escaped, 'i')

                searchFilter = {
                    $or: [
                        { oscNumber:   regex },
                        { phoneNumber: regex },
                        { fullName:    regex },
                    ],
                }
            }

            // ── 3. Merge filters ─────────────────────────────────────────────
            const filter = {
                ...searchFilter,
                ...dateFilter,
            }

            // ── 4. Query database ────────────────────────────────────────────
            const [orders, total] = await Promise.all([
                BookOrderModel.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                BookOrderModel.countDocuments(filter),
            ])

            // ── 5. Return response ───────────────────────────────────────────
            return BaseService.sendSuccessResponse({
                message: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    data: orders,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }

    async getSearchedOrderDetail(req) {
        try {
            const { id } = req.params

            if (!id) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide a valid order id',
                })
            }

            const order = await BookOrderModel.findById(id)
                .populate('userId', 'fullName email phoneNumber image')
                .lean()

            if (!order) {
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })
            }

            return BaseService.sendSuccessResponse({
                message: order,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({ error })
        }
    }
}

module.exports = SearchService