const BotApiService = require('../services/botApi.service')
const BaseController = require('./base.controller')

const send = (res, result) =>
    result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data)

class BotController extends BaseController {
    async sendMessage(req, res) {
        return send(res, await new BotApiService().sendMessage(req))
    }
    async getConversation(req, res) {
        return send(res, await new BotApiService().getConversation(req))
    }
    async requestHandoff(req, res) {
        return send(res, await new BotApiService().requestHandoff(req))
    }
    async queue(req, res) {
        return send(res, await new BotApiService().queue(req))
    }
    async staffReply(req, res) {
        return send(res, await new BotApiService().staffReply(req))
    }
    async closeConversation(req, res) {
        return send(res, await new BotApiService().closeConversation(req))
    }
}

module.exports = BotController
