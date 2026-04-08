const BaseController = require("./base.controller");
const AuthService = require("../services/auth.service");

class AuthController extends BaseController {

  async createUser(req, res) {
    const service = new AuthService();
    const result = await service.createUser(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async resendOtp(req, res) {
    const service = new AuthService();
    const result = await service.resendOtp(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async loginUser(req, res) {
    const service = new AuthService();
    const result = await service.loginUser(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async googleSignup(req, res) {
    const service = new AuthService();
    const result = await service.googleSignup(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async appleSignup(req, res) {
    const service = new AuthService();
    const result = await service.appleSignup(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async verifyOTP(req, res) {
    const service = new AuthService();
    const result = await service.verifyOTP(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async forgotPassword(req, res) {
    const service = new AuthService();
    const result = await service.forgotPassword(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async resetPassword(req, res) {
    const service = new AuthService();
    const result = await service.resetPassword(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async verifyResetPasswordOtp(req, res) {
    const service = new AuthService();
    const result = await service.verifyResetPasswordOtp(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async verifyEmail(req, res) {
    const service = new AuthService();
    const result = await service.verifyEmail(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  // Admin related controllers
  async adminLogin(req, res) {
    const service = new AuthService();
    const result = await service.adminLogin(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async registerAdmin(req, res) {
    const service = new AuthService();
    const result = await service.registerAdmin(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }


  // Intake staff related controllers
  async createIntakeUser(req, res) {
    const service = new AuthService();
    const result = await service.createIntakeUser(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async resendIntakeUserOtp(req, res) {
    const service = new AuthService();
    const result = await service.resendIntakeUserOtp(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async loginIntakeUser(req, res) {
    const service = new AuthService();
    const result = await service.loginIntakeUser(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async googleIntakeUserSignup(req, res) {
    const service = new AuthService();
    const result = await service.googleIntakeUserSignup(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async appleIntakeUserSignup(req, res) {
    const service = new AuthService();
    const result = await service.appleIntakeUserSignup(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async verifyIntakeUserOTP(req, res) {
    const service = new AuthService();
    const result = await service.verifyIntakeUserOTP(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async forgotIntakeUserPassword(req, res) {
    const service = new AuthService();
    const result = await service.forgotIntakeUserPassword(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async resetIntakeUserPassword(req, res) {
    const service = new AuthService();
    const result = await service.resetIntakeUserPassword(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async verifyIntakeUserResetPasswordOtp(req, res) {
    const service = new AuthService();
    const result = await service.verifyIntakeUserResetPasswordOtp(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async sendIntakeUserOTP(req, res) {
    const service = new AuthService();
    const result = await service.sendIntakeUserOTP(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // QC staff related controllers
  async createQCUser(req, res) {
    const service = new AuthService();
    const result = await service.createQCUser(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async resendQCUserOtp(req, res) {
    const service = new AuthService();
    const result = await service.resendQCUserOtp(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async loginQCUser(req, res) {
    const service = new AuthService();
    const result = await service.loginQCUser(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async googleQCUserSignup(req, res) {
    const service = new AuthService();
    const result = await service.googleQCUserSignup(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async appleQCUserSignup(req, res) {
    const service = new AuthService();
    const result = await service.appleQCUserSignup(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async verifyQCUserOTP(req, res) {
    const service = new AuthService();
    const result = await service.verifyQCUserOTP(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async forgotQCUserPassword(req, res) {
    const service = new AuthService();
    const result = await service.forgotQCUserPassword(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async resetQCUserPassword(req, res) {
    const service = new AuthService();
    const result = await service.resetQCUserPassword(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
  async verifyQCUserResetPasswordOtp(req, res) {
    const service = new AuthService();
    const result = await service.verifyQCUserResetPasswordOtp(req, res);

    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
}

module.exports = AuthController;

