const WashAndDryService = require("../services/washAndDry.service");
const BaseController = require("./base.controller");

class WashAndDryController extends BaseController {
  async getDashboard(req, res) {
    const result = await WashAndDryService.getDashboard(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // Wash Queue
  async getWashQueue(req, res) {
    const result = await WashAndDryService.getWashQueue(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async getWashQueueOrderDetails(req, res) {
    const result = await WashAndDryService.getWashQueueOrderDetails(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async confirmItemForWashing(req, res) {
    const result = await WashAndDryService.confirmItemForWashing(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async undoConfirmItemForWashing(req, res) {
    const result = await WashAndDryService.undoConfirmItemForWashing(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async sendToHold(req, res) {
    const result = await WashAndDryService.sendToHold(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // Active Wash
  async getActiveWash(req, res) {
    const result = await WashAndDryService.getActiveWash(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async moveToDrying(req, res) {
    const result = await WashAndDryService.moveToDrying(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  //  Active Dry
  async getActiveDry(req, res) {
    const result = await WashAndDryService.getActiveDry(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async washAndDryComplete(req, res) {
    const result = await WashAndDryService.washAndDryComplete(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // Hold
  async getHoldQueue(req, res) {
    const result = await WashAndDryService.getHoldQueue(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async releaseFromHold(req, res) {
    const result = await WashAndDryService.releaseFromHold(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  //  History
  async getHistoryList(req, res) {
    const result = await WashAndDryService.getHistoryList(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async getOrderTimeline(req, res) {
    const result = await WashAndDryService.getOrderTimeline(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
}

module.exports = WashAndDryController;