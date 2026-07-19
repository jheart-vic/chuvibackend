const ReferralApiService = require('../services/referralApi.service')
const BaseController = require('./base.controller')

const send = (res, result) =>
    result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data)

class ReferralController extends BaseController {
    async getMyReferralPage(req, res) {
        return send(res, await new ReferralApiService().getMyReferralPage(req))
    }
    async applyCode(req, res) {
        return send(res, await new ReferralApiService().applyCode(req))
    }
    async getMyHistory(req, res) {
        return send(res, await new ReferralApiService().getMyHistory(req))
    }
    async resetCode(req, res) {
        return send(res, await new ReferralApiService().resetCode(req))
    }
}

module.exports = ReferralController
