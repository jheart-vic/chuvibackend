const BookOrderService = require("../services/bookOrder.service");
const BookingWindowService = require("../services/bookingWindow.service");
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

    // Client item #7: Intake enters the real items; the bill is recalculated
    // through the same pricing + offers, and the difference becomes a payment
    // hold or goes back to the wallet. After tagging, admin only.
    async applyItemEdit(req, res) {
      const bookOrderService = new BookOrderService();
      const result = await bookOrderService.applyItemEdit(req);

      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }

    // Window booking (client D1–D5): what times this customer can actually
    // choose for one leg. A GET that intentionally WRITES — every full window
    // it drops is recorded as a deflection, because a customer moved off a full
    // window leaves no trace on the order they end up with.
    async getBookingAvailability(req, res) {
      const result = await BookingWindowService.getAvailability({
        userId: req.user?.id || null,
        leg: req.query?.leg,
        horizonDays: req.query?.days ? Number(req.query.days) : undefined,
        deliverySpeed: req.query?.deliverySpeed || null,
      });

      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
  }

module.exports = BookOrderController;