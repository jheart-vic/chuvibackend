const PressAndIronService = require('../services/pressAndIron.service')
const BaseController = require('./base.controller')

class PressAndIronController extends BaseController {
    async getDashboard(req, res) {
        const result = await PressAndIronService.getDashboard(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getPressQueue(req, res) {
        const result = await PressAndIronService.getPressQueue(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getPressQueueOrderDetails(req, res) {
        const result = await PressAndIronService.getPressQueueOrderDetails(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async confirmItemForPressing(req, res) {
        const result = await PressAndIronService.confirmItemForPressing(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async undoConfirmItemForPressing(req, res) {
        const result = await PressAndIronService.undoConfirmItemForPressing(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async sendToHold(req, res) {
        const result = await PressAndIronService.sendToHold(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getActivePress(req, res) {
        const result = await PressAndIronService.getActivePress(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async pressDone(req, res) {
        const result = await PressAndIronService.pressDone(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getHoldQueue(req, res) {
        const result = await PressAndIronService.getHoldQueue(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async releaseFromHold(req, res) {
        const result = await PressAndIronService.releaseFromHold(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getHistoryList(req, res) {
        const result = await PressAndIronService.getHistoryList(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getOrderTimeline(req, res) {
        const result = await PressAndIronService.getOrderTimeline(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
}

module.exports = PressAndIronController