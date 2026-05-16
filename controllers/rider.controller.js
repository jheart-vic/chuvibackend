const RiderService = require('../services/rider.service')
const BaseController = require('./base.controller')

class RiderController extends BaseController {
    async getRiderAssignedDeliveries(req, res) {
        const riderService = new RiderService()
        const result = await riderService.getRiderAssignedDeliveries(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getOrderDetails(req, res) {
        const riderService = new RiderService()
        const result = await riderService.getOrderDetails(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async startDelivery(req, res) {
        const riderService = new RiderService()
        const result = await riderService.startDelivery(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getActiveDeliveries(req, res) {
        const riderService = new RiderService()
        const result = await riderService.getActiveDeliveries(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getRiderAssignedPickups(req, res) {
        const riderService = new RiderService()
        const result = await riderService.getRiderAssignedPickups(req)
        if (!result.success)
            return BaseController.sendFailedResponse(res, result.data)
        return BaseController.sendSuccessResponse(res, result.data)
    }
    async getActivePickups(req, res) {
        const riderService = new RiderService()
        const result = await riderService.getActivePickups(req)
        if (!result.success)
            return BaseController.sendFailedResponse(res, result.data)
        return BaseController.sendSuccessResponse(res, result.data)
    }
    async markOrderAsDelivered(req, res) {
        const riderService = new RiderService()
        const result = await riderService.markOrderAsDelivered(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async markOrderDeliveryAsFailed(req, res) {
        const riderService = new RiderService()
        const result = await riderService.markOrderDeliveryAsFailed(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async startPickup(req, res) {
        const riderService = new RiderService()
        const result = await riderService.startPickup(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async markPickupAsFailed(req, res) {
        const riderService = new RiderService()
        const result = await riderService.markPickupAsFailed(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async markAsPickedUp(req, res) {
        const riderService = new RiderService()
        const result = await riderService.markAsPickedUp(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getRiderHistory(req, res) {
        const riderService = new RiderService()
        const result = await riderService.getHistoryList(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getOrderTimeline(req, res) {
        const riderService = new RiderService()
        const result = await riderService.getOrderTimeline(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
}

module.exports = RiderController
