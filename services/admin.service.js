const BaseService = require("./base.service");

class AdminService extends BaseService {
  async getDashboardStats(req, res) {
    try {
        const response = {}
        response['totalActiveOrders'] = 20;
        response['revenueToday'] = 20;
        response['avgProcessingTime'] = 20;
        response['overdueOrders'] = 20;
    }catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Something went wrong. Please try again later." });
    }
  }
}

module.exports = AdminService;