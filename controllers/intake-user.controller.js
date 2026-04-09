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
}

module.exports = IntakeUserController;