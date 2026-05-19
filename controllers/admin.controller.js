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
    async getAdminOrderDetails(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getAdminOrderDetails(req, res)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async updateOrderDetails(req, res) {
        const adminService = new AdminService()
        const result = await adminService.updateOrderDetails(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async updateAdminSettings(req, res) {
        const adminService = new AdminService()
        const result = await adminService.updateAdminSettings(req, res)

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
    async addItem(req, res) {
        const adminService = new AdminService()
        const result = await adminService.addItem(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async updateItem(req, res) {
        const adminService = new AdminService()
        const result = await adminService.updateItem(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getItems(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getItems(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getItem(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getItem(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async deleteItem(req, res) {
        const adminService = new AdminService()
        const result = await adminService.deleteItem(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
}

module.exports = AdminController
