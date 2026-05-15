const SearchService = require('../services/search.service')
const BaseController = require('./base.controller')

class SearchController extends BaseController {
    async searchOrders(req, res) {
        const searchService = new SearchService()
        const result = await searchService.searchOrders(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getSearchedOrderDetail(req, res) {
        const searchService = new SearchService()
        const result = await searchService.getSearchedOrderDetail(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
}

module.exports = SearchController