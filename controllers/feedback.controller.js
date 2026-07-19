const FeedbackService = require('../services/feedback.service')
const RecoveryApiService = require('../services/recoveryApi.service')
const BaseController = require('./base.controller')

const send = (res, result) =>
    result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data)

class FeedbackController extends BaseController {
    // ── feedback (customer + staff list) ──
    async submitFeedback(req, res) {
        return send(res, await new FeedbackService().submitFeedback(req))
    }
    async getFeedbackForOrder(req, res) {
        return send(res, await new FeedbackService().getFeedbackForOrder(req))
    }
    async listFeedback(req, res) {
        return send(res, await new FeedbackService().listFeedback(req))
    }

    // ── complaint types ──
    async listComplaintTypes(req, res) {
        return send(res, await new RecoveryApiService().listComplaintTypes(req))
    }
    async createComplaintType(req, res) {
        return send(res, await new RecoveryApiService().createComplaintType(req))
    }
    async updateComplaintType(req, res) {
        return send(res, await new RecoveryApiService().updateComplaintType(req))
    }

    // ── customer complaint views ──
    async myComplaints(req, res) {
        return send(res, await new RecoveryApiService().myComplaints(req))
    }
    async getMyComplaint(req, res) {
        return send(res, await new RecoveryApiService().getMyComplaint(req))
    }
    async confirmResolution(req, res) {
        return send(res, await new RecoveryApiService().confirmResolution(req))
    }
    async rejectResolution(req, res) {
        return send(res, await new RecoveryApiService().rejectResolution(req))
    }
    async customerListMessages(req, res) {
        return send(res, await new RecoveryApiService().listMessages(req, { staff: false }))
    }
    async customerPostMessage(req, res) {
        return send(res, await new RecoveryApiService().postMessage(req, { staff: false }))
    }

    // ── CX / staff case management ──
    async listCases(req, res) {
        return send(res, await new RecoveryApiService().listCases(req))
    }
    async getCase(req, res) {
        return send(res, await new RecoveryApiService().getCase(req))
    }
    async assignCase(req, res) {
        return send(res, await new RecoveryApiService().assignCase(req))
    }
    async transition(req, res) {
        return send(res, await new RecoveryApiService().transition(req))
    }
    async addAction(req, res) {
        return send(res, await new RecoveryApiService().addAction(req))
    }
    async completeAction(req, res) {
        return send(res, await new RecoveryApiService().completeAction(req))
    }
    async requestCredit(req, res) {
        return send(res, await new RecoveryApiService().requestCredit(req))
    }
    async approveCredit(req, res) {
        return send(res, await new RecoveryApiService().approveCredit(req))
    }
    async rejectCredit(req, res) {
        return send(res, await new RecoveryApiService().rejectCredit(req))
    }
    async escalate(req, res) {
        return send(res, await new RecoveryApiService().escalate(req))
    }
    async staffListMessages(req, res) {
        return send(res, await new RecoveryApiService().listMessages(req, { staff: true }))
    }
    async staffPostMessage(req, res) {
        return send(res, await new RecoveryApiService().postMessage(req, { staff: true }))
    }
}

module.exports = FeedbackController
