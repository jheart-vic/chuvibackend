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
    async updateBookOrderPaymentStatus(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.updateBookOrderPaymentStatus(req);

      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async cancelOrder(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.cancelOrder(req);

      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async staffCancelOrder(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.staffCancelOrder(req);

      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async requestCancellation(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.requestCancellation(req);

      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async getCancellationRequests(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.getCancellationRequests(req);

      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async approveCancellationRequest(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.approveCancellationRequest(req);

      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async rejectCancellationRequest(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.rejectCancellationRequest(req);

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
    async getBookOrder(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.getBookOrder(req);
  
      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
  }

module.exports = BookOrderController;