const IntakeUserService = require("../services/intake-user.service");
const BaseController = require("./base.controller");


class IntakeUserController extends BaseController {
  async createBookOrder(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.createBookOrder(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async flagOrder(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.flagOrder(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async proceedToTag(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.proceedToTag(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async confirmTagItem(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.confirmTagItem(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async undoConfirmTagItem(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.undoConfirmTagItem(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async proceedToSortAndPretreat(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.proceedToSortAndPretreat(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async sendTopUpRequest(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.sendTopUpRequest(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async adjustWallet(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.adjustWallet(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async getUserWallet(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.getUserWallet(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async getPickableOrders(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.getPickableOrders(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async getDeliverableOrders(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.getDeliverableOrders(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async assignRiderTopDeliveryOrder(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.assignRiderTopDeliveryOrder(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async assignRiderTopPickupOrder(req, res) {
    const intakeUserService = new IntakeUserService();
    const result = await intakeUserService.assignRiderTopPickupOrder(req);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
}

module.exports = IntakeUserController;