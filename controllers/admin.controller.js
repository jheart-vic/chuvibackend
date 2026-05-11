const AdminService = require('../services/admin.service')
const BaseController = require('./base.controller')

class AdminController extends BaseController {
    async getDashboardStats(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getDashboardStats(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async orderManagement(req, res) {
        const adminService = new AdminService()
        const result = await adminService.orderManagement(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getOrderDetails(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getOrderDetails(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getPaymentVerificationQueue(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getPaymentVerificationQueue(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async acceptPaymentVerification(req, res) {
        const adminService = new AdminService()
        const result = await adminService.acceptPaymentVerification(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async rejectPaymentVerification(req, res) {
        const adminService = new AdminService()
        const result = await adminService.rejectPaymentVerification(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getOrdersByState(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getOrdersByState(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getDispatchAdminDataCount(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getDispatchAdminDataCount(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getHoldOrders(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getHoldOrders(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async reAssignOrderStation(req, res) {
        const adminService = new AdminService()
        const result = await adminService.reAssignOrderStation(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async addFund(req, res) {
        const adminService = new AdminService()
        const result = await adminService.addFund(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async deductFund(req, res) {
        const adminService = new AdminService()
        const result = await adminService.deductFund(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getAuditLite(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getAuditLite(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async searchWallet(req, res) {
        const adminService = new AdminService()
        const result = await adminService.searchWallet(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async searchOrders(req, res) {
         const adminService = new AdminService()
        const result = await adminService.searchOrders(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getOrderDetail(req, res) {
         const adminService = new AdminService()
        const result = await adminService.getSearchedOrderDetail(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
}

module.exports = AdminController
