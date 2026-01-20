const BaseController = require("./base.controller");
const UserService = require("../services/auth.service");

class UserController extends BaseController {

  async createUser(req, res) {
    const service = new UserService();
    const result = await service.createUser(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async resendOtp(req, res) {
    const service = new UserService();
    const result = await service.resendOtp(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async loginUser(req, res) {
    const service = new UserService();
    const result = await service.loginUser(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async googleSignup(req, res) {
    const service = new UserService();
    const result = await service.googleSignup(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async appleSignup(req, res) {
    const service = new UserService();
    const result = await service.appleSignup(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async verifyOTP(req, res) {
    const service = new UserService();
    const result = await service.verifyOTP(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async getUser(req, res) {
    const service = new UserService();
    const result = await service.getUser(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async forgotPassword(req, res) {
    const service = new UserService();
    const result = await service.forgotPassword(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async resetPassword(req, res) {
    const service = new UserService();
    const result = await service.resetPassword(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async sendOTP(req, res) {
    const service = new UserService();
    const result = await service.sendOTP(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async verifyEmail(req, res) {
    const service = new UserService();
    const result = await service.verifyEmail(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async adminLogin(req, res) {
    const service = new UserService();
    const result = await service.adminLogin(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async registerAdmin(req, res) {
    const service = new UserService();
    const result = await service.registerAdmin(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
}

module.exports = UserController;

