const QCService = require('../services/qc.service')
const BaseController = require('./base.controller')

class QCController extends BaseController {
    async getDashboard(req, res) {
        const result = await QCService.getDashboard(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── QC Queue ───────────────────────────────────────────────────────────────
    async getQCQueue(req, res) {
        const result = await QCService.getQCQueue(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getQCQueueOrderDetails(req, res) {
        const result = await QCService.getQCQueueOrderDetails(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async confirmItemQC(req, res) {
        const result = await QCService.confirmItemQC(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async undoConfirmItemQC(req, res) {
        const result = await QCService.undoConfirmItemQC(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async passQC(req, res) {
        const result = await QCService.passQC(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── Pack & Seal ────────────────────────────────────────────────────────────
    async getPackAndSealList(req, res) {
        const result = await QCService.getPackAndSealList(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getPackAndSealDetail(req, res) {
        const result = await QCService.getPackAndSealDetail(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async packAndSealComplete(req, res) {
        const result = await QCService.packAndSealComplete(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── Ready Orders ───────────────────────────────────────────────────────────
    async getReadyOrders(req, res) {
        const result = await QCService.getReadyOrders(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── Hold ───────────────────────────────────────────────────────────────────
    async sendToHold(req, res) {
        const result = await QCService.sendToHold(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getHoldQueue(req, res) {
        const result = await QCService.getHoldQueue(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async releaseFromHold(req, res) {
        const result = await QCService.releaseFromHold(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    // ── History ────────────────────────────────────────────────────────────────
    async getHistoryList(req, res) {
        const result = await QCService.getHistoryList(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }

    async getOrderTimeline(req, res) {
        const result = await QCService.getOrderTimeline(req)
        return result.success
            ? BaseController.sendSuccessResponse(res, result.data)
            : BaseController.sendFailedResponse(res, result.data)
    }
}

module.exports = QCController