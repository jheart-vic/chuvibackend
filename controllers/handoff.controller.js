const BaseController = require('./base.controller')
const HandoffService = require('../services/handoff.service')

class HandoffController extends BaseController {
    async push(req, res) {
        const service = new HandoffService()
        const result = await service.push(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async confirm(req, res) {
        const service = new HandoffService()
        const result = await service.confirm(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async pendingQueue(req, res) {
        const service = new HandoffService()
        const result = await service.pendingQueue(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async splitState(req, res) {
        const service = new HandoffService()
        const result = await service.splitState(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
}

module.exports = HandoffController
