const CommunicationAdminService = require('../services/communicationAdmin.service')
const BaseController = require('./base.controller')

class CommunicationController extends BaseController {
    async listTemplates(req, res) {
        const service = new CommunicationAdminService()
        const result = await service.listTemplates(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async createTemplate(req, res) {
        const service = new CommunicationAdminService()
        const result = await service.createTemplate(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async updateTemplate(req, res) {
        const service = new CommunicationAdminService()
        const result = await service.updateTemplate(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getLogs(req, res) {
        const service = new CommunicationAdminService()
        const result = await service.getLogs(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async retryFailed(req, res) {
        const service = new CommunicationAdminService()
        const result = await service.retryFailed(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
}

module.exports = CommunicationController
