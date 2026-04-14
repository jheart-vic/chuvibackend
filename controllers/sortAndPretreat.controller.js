const SortAndPretreatService = require("../services/sortAndPretreat.service");
const BaseController = require("./base.controller");

class SortAndPretreatController extends BaseController {
  // ── Order Queue ────────────────────────────────────────────────────────────
  async getOrderQueue(req, res) {
    const result = await SortAndPretreatService.getOrderQueue(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async getOrderDetails(req, res) {
    const result = await SortAndPretreatService.getOrderDetails(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // ── Item Sort Details ──────────────────────────────────────────────────────
  async updateItemSortDetails(req, res) {
    const result = await SortAndPretreatService.updateItemSortDetails(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // ── Mark Sorted / Pretreated ───────────────────────────────────────────────
  async markItemAsSorted(req, res) {
    const result = await SortAndPretreatService.markItemAsSorted(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async undoMarkItemAsSorted(req, res) {
    const result = await SortAndPretreatService.undoMarkItemAsSorted(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async markAllItemsAsSorted(req, res) {
    const result = await SortAndPretreatService.markAllItemsAsSorted(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async markItemAsPretreated(req, res) {
    const result = await SortAndPretreatService.markItemAsPretreated(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async undoMarkItemAsPretreated(req, res) {
    const result = await SortAndPretreatService.undoMarkItemAsPretreated(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // ── Flag Item ──────────────────────────────────────────────────────────────
  async flagItemForReview(req, res) {
    const result = await SortAndPretreatService.flagItemForReview(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // ── Send to Next Stage ─────────────────────────────────────────────────────
  async sendToNextStage(req, res) {
    const result = await SortAndPretreatService.sendToNextStage(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // ── Flagged Orders ─────────────────────────────────────────────────────────
  async getFlaggedOrders(req, res) {
    const result = await SortAndPretreatService.getFlaggedOrders(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // ── Sorted & Pretreated List ───────────────────────────────────────────────
  async getSortedAndPretreatdOrders(req, res) {
    const result = await SortAndPretreatService.getSortedAndPretreatdOrders(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // ── Washing View ───────────────────────────────────────────────────────────
  async getWashingOrders(req, res) {
    const result = await SortAndPretreatService.getWashingOrders(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async getWashingOrderDetails(req, res) {
    const result = await SortAndPretreatService.getWashingOrderDetails(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // ── Ironing View ───────────────────────────────────────────────────────────
  async getIroningOrders(req, res) {
    const result = await SortAndPretreatService.getIroningOrders(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async getIroningOrderDetails(req, res) {
    const result = await SortAndPretreatService.getIroningOrderDetails(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  // ── History ────────────────────────────────────────────────────────────────
  async getHistoryList(req, res) {
    const result = await SortAndPretreatService.getHistoryList(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }

  async getOrderTimeline(req, res) {
    const result = await SortAndPretreatService.getOrderTimeline(req);
    return result.success
      ? BaseController.sendSuccessResponse(res, result.data)
      : BaseController.sendFailedResponse(res, result.data);
  }
}

module.exports = SortAndPretreatController;