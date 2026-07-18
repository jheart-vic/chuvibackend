const CrmService = require('../services/crm.service')
const BaseController = require('./base.controller')

class CrmController extends BaseController {
    // ── Staff tier (intake-and-tag + admin) ────────────────────────────────
    async getCustomers(req, res) {
        const result = await CrmService.getCustomers(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getCustomerCard(req, res) {
        const result = await CrmService.getCustomerCard(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async addManualTag(req, res) {
        const result = await CrmService.addManualTag(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async removeManualTag(req, res) {
        const result = await CrmService.removeManualTag(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async correctStage(req, res) {
        const result = await CrmService.correctStage(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async createWalkInLead(req, res) {
        const result = await CrmService.createWalkInLead(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async updateFollowUp(req, res) {
        const result = await CrmService.updateFollowUp(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── Admin tier ─────────────────────────────────────────────────────────
    async getMetrics(req, res) {
        const result = await CrmService.getMetrics(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getBroadcastList(req, res) {
        const result = await CrmService.getBroadcastList(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getSettings(req, res) {
        const result = await CrmService.getSettings(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async updateSettings(req, res) {
        const result = await CrmService.updateSettings(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── Internal (WhatsApp bot, shared-secret auth) ────────────────────────
    async registerBotLead(req, res) {
        const result = await CrmService.registerBotLead(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
}

module.exports = CrmController
