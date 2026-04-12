const AdminService = require("../services/admin.service");
const BaseController = require("./base.controller");


class AdminController extends BaseController {

    async getDashboardStats(req, res) {
      const adminService = new AdminService();
      const result = await adminService.getDashboardStats(req, res);
  
      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
}

module.exports = AdminController;