const BookOrderService = require("../services/bookOrder.service");
const BaseController = require("./base.controller");

class BookOrderController extends BaseController {

    async postBookOrder(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.postBookOrder(req);
  
      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async getBookOrderDetails(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.getBookOrderDetails(req);
  
      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async updateBookOrderPaymentStatus(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.updateBookOrderPaymentStatus(req);
  
      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async updateBookOrderStage(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.updateBookOrderStage(req);
  
      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async getBookOrderHistory(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.getBookOrderHistory(req);
  
      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
  }

module.exports = BookOrderController;