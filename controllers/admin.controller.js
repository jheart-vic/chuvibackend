const AdminService = require('../services/admin.service')
const ProfileMergeService = require('../services/profileMerge.service')
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
    async getAdminSetting(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getAdminSetting(req, res)
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
    async getWalletAdjustmentRequests(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getWalletAdjustmentRequests(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async approveWalletAdjustment(req, res) {
        const adminService = new AdminService()
        const result = await adminService.approveWalletAdjustment(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async rejectWalletAdjustment(req, res) {
        const adminService = new AdminService()
        const result = await adminService.rejectWalletAdjustment(req)
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
    async resolveOrderHold(req, res) {
        const adminService = new AdminService()
        const result = await adminService.resolveOrderHold(req, res)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async adminSendToHold(req, res) {
        const adminService = new AdminService()
        const result = await adminService.adminSendToHold(req, res)

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
    async listWalletTransactions(req, res) {
        const adminService = new AdminService()
        const result = await adminService.listWalletTransactions(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async listHoldTypes(req, res) {
        const adminService = new AdminService()
        const result = await adminService.listHoldTypes(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // Client item #9 — phone-split CRM profiles. The report NEVER writes; the
    // merge refuses with its reason when a pair cannot be combined.
    async listProfileDuplicates(req, res) {
        const svc = new ProfileMergeService()
        const result = await svc.findDuplicates(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async mergeProfileDuplicate(req, res) {
        const svc = new ProfileMergeService()
        const result = await svc.mergeDuplicate(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async createHoldType(req, res) {
        const adminService = new AdminService()
        const result = await adminService.createHoldType(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async updateHoldType(req, res) {
        const adminService = new AdminService()
        const result = await adminService.updateHoldType(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async deleteHoldType(req, res) {
        const adminService = new AdminService()
        const result = await adminService.deleteHoldType(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async listStaff(req, res) {
        const adminService = new AdminService()
        const result = await adminService.listStaff(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async setStaffStatus(req, res) {
        const adminService = new AdminService()
        const result = await adminService.setStaffStatus(req)

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
    async addOrderSet(req, res) {
        const adminService = new AdminService()
        const result = await adminService.addOrderSet(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async updateOrderSet(req, res) {
        const adminService = new AdminService()
        const result = await adminService.updateOrderSet(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getOrderSets(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getOrderSets(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getOrderSet(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getOrderSet(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async deleteOrderSet(req, res) {
        const adminService = new AdminService()
        const result = await adminService.deleteOrderSet(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
    async getAuditLogs(req, res) {
        const adminService = new AdminService()
        const result = await adminService.getAuditLogs(req)

        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
}

module.exports = AdminController
