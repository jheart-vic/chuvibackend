const BookOrderModel = require("../models/bookOrder.model");
const sortAndPretreatModel = require("../models/sortAndPretreatUser.model");
const {
  ORDER_STATUS,
  ORDER_SERVICE_TYPE,
  COLOR_GROUP,
  FABRIC_TYPE,
  PRETREATMENT_OPTIONS,
  DAMAGE_RISK_FLAGS,
} = require("../util/constants");
const BaseService = require("./base.service");

class SortAndPretreatService extends BaseService {

  // ─────────────────────────────────────────────────────────────────────────
  // ORDER QUEUE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET ORDER QUEUE
   * Fetches all orders in SORT_AND_PRETREAT stage (FIFO).
   * GET /sort/queue
   */
  async getOrderQueue(req) {
    try {
      const userId = req.user.id;
      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const { page = 1, limit = 20, search = "" } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const query = { "stage.status": ORDER_STATUS.SORT_AND_PRETREAT };
      if (search) {
        query.$or = [
          { oscNumber:   { $regex: search, $options: "i" } },
          { fullName:    { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
        ];
      }

      const [orders, total] = await Promise.all([
        BookOrderModel.find(query)
          .sort({ "stage.updatedAt": 1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        BookOrderModel.countDocuments(query),
      ]);

      return BaseService.sendSuccessResponse({
        message: { orders, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } },
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to fetch order queue" });
    }
  }

  /**
   * GET SINGLE ORDER DETAILS
   * Returns full order + items when operator clicks into a queue item.
   * GET /sort/:id
   */
  async getOrderDetails(req) {
    try {
      const orderId = req.params.id;
      const userId = req.user.id;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findOne({
        _id: orderId,
        "stage.status": ORDER_STATUS.SORT_AND_PRETREAT,
      }).lean();

      if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not in sort & pretreat stage" });

      const allItemsSorted     = order.items.every((i) => i.sortStatus === "complete");
      const allItemsPretreated = order.items.every((i) => i.pretreatStatus === "complete");
      const readyToSend        = allItemsSorted && allItemsPretreated;

      return BaseService.sendSuccessResponse({ message: { order, allItemsSorted, allItemsPretreated, readyToSend } });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to fetch order details" });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ITEM SORT DETAILS (auto-save selections)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * UPDATE ITEM SORT & PRETREAT DETAILS
   * Auto-saves colorGroup, fabricType, pretreatmentOptions, damageRiskFlags,
   * and itemNote as the operator makes selections. All fields optional per call.
   * PATCH /sort/:id/items/:itemId/sort-details
   */
  async updateItemSortDetails(req) {
    try {
      const orderId = req.params.id;
      const itemId  = req.params.itemId;
      const userId  = req.user.id;
      const post    = req.body;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });
      if (!itemId)  return BaseService.sendFailedResponse({ error: "Item ID is required" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findOne({ _id: orderId, "stage.status": ORDER_STATUS.SORT_AND_PRETREAT });
      if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not in sort & pretreat stage" });

      const item = order.items.id(itemId);
      if (!item) return BaseService.sendFailedResponse({ error: "Item not found in order" });

      const allowedColorGroups   = Object.values(COLOR_GROUP);
      const allowedFabricTypes   = Object.values(FABRIC_TYPE);
      const allowedPretreatments = Object.values(PRETREATMENT_OPTIONS);
      const allowedDamageFlags   = Object.values(DAMAGE_RISK_FLAGS);

      if (post.colorGroup !== undefined && !allowedColorGroups.includes(post.colorGroup)) {
        return BaseService.sendFailedResponse({ error: `colorGroup must be one of: ${allowedColorGroups.join(", ")}` });
      }
      if (post.fabricType !== undefined && !allowedFabricTypes.includes(post.fabricType)) {
        return BaseService.sendFailedResponse({ error: `fabricType must be one of: ${allowedFabricTypes.join(", ")}` });
      }
      if (post.pretreatmentOptions !== undefined) {
        if (!Array.isArray(post.pretreatmentOptions)) return BaseService.sendFailedResponse({ error: "pretreatmentOptions must be an array" });
        const invalid = post.pretreatmentOptions.filter((o) => !allowedPretreatments.includes(o));
        if (invalid.length) return BaseService.sendFailedResponse({ error: `Invalid pretreatmentOptions: ${invalid.join(", ")}` });
      }
      if (post.damageRiskFlags !== undefined) {
        if (!Array.isArray(post.damageRiskFlags)) return BaseService.sendFailedResponse({ error: "damageRiskFlags must be an array" });
        const invalid = post.damageRiskFlags.filter((f) => !allowedDamageFlags.includes(f));
        if (invalid.length) return BaseService.sendFailedResponse({ error: `Invalid damageRiskFlags: ${invalid.join(", ")}` });
      }
      if (post.itemNote !== undefined && typeof post.itemNote !== "string") {
        return BaseService.sendFailedResponse({ error: "itemNote must be a string" });
      }

      const setPayload = {};
      if (post.colorGroup          !== undefined) setPayload["items.$.colorGroup"]          = post.colorGroup;
      if (post.fabricType          !== undefined) setPayload["items.$.fabricType"]          = post.fabricType;
      if (post.pretreatmentOptions !== undefined) setPayload["items.$.pretreatmentOptions"] = post.pretreatmentOptions;
      if (post.damageRiskFlags     !== undefined) setPayload["items.$.damageRiskFlags"]     = post.damageRiskFlags;
      if (post.itemNote            !== undefined) setPayload["items.$.itemNote"]            = post.itemNote;

      if (Object.keys(setPayload).length === 0) return BaseService.sendFailedResponse({ error: "No valid fields provided to update" });

      await BookOrderModel.updateOne({ _id: orderId, "items._id": itemId }, { $set: setPayload });

      return BaseService.sendSuccessResponse({ message: "Item details saved successfully" });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to update item sort details" });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MARK SORTED / PRETREATED
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * MARK ITEM AS SORTED
   * PATCH /sort/:id/items/:itemId/mark-sorted
   */
  async markItemAsSorted(req) {
    try {
      const orderId = req.params.id;
      const itemId  = req.params.itemId;
      const userId  = req.user.id;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });
      if (!itemId)  return BaseService.sendFailedResponse({ error: "Item ID is required" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findOne({ _id: orderId, "stage.status": ORDER_STATUS.SORT_AND_PRETREAT });
      if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not in sort & pretreat stage" });

      const item = order.items.id(itemId);
      if (!item) return BaseService.sendFailedResponse({ error: "Item not found in order" });
      if (item.sortStatus === "complete") return BaseService.sendFailedResponse({ error: "Item is already marked as sorted" });

      await BookOrderModel.updateOne(
        { _id: orderId, "items._id": itemId },
        {
          $set:  { "items.$.sortStatus": "complete" },
          $push: { "items.$.actionLog": { action: "sorted", note: "", timestamp: new Date() } },
        }
      );

      const updatedOrder   = await BookOrderModel.findById(orderId).lean();
      const allItemsSorted = updatedOrder.items.every((i) => i.sortStatus === "complete");

      return BaseService.sendSuccessResponse({ message: { message: "Item marked as sorted", allItemsSorted } });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to mark item as sorted" });
    }
  }

  /**
   * UNDO ITEM SORTED
   * PATCH /sort/:id/items/:itemId/undo-sorted
   */
  async undoMarkItemAsSorted(req) {
    try {
      const orderId = req.params.id;
      const itemId  = req.params.itemId;
      const userId  = req.user.id;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });
      if (!itemId)  return BaseService.sendFailedResponse({ error: "Item ID is required" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findOne({ _id: orderId, "stage.status": ORDER_STATUS.SORT_AND_PRETREAT });
      if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not in sort & pretreat stage" });

      const item = order.items.id(itemId);
      if (!item) return BaseService.sendFailedResponse({ error: "Item not found in order" });

      await BookOrderModel.updateOne(
        { _id: orderId, "items._id": itemId },
        {
          $set:  { "items.$.sortStatus": "pending" },
          $push: { "items.$.actionLog": { action: "undo_sorted", note: "", timestamp: new Date() } },
        }
      );

      return BaseService.sendSuccessResponse({ message: "Item sort undone successfully" });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to undo item sort" });
    }
  }

  /**
   * MARK ALL ITEMS AS SORTED
   * PATCH /sort/:id/mark-all-sorted
   */
  async markAllItemsAsSorted(req) {
    try {
      const orderId = req.params.id;
      const userId  = req.user.id;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findOne({ _id: orderId, "stage.status": ORDER_STATUS.SORT_AND_PRETREAT });
      if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not in sort & pretreat stage" });

      const now          = new Date();
      const updatedItems = order.items.map((item) => ({
        ...item.toObject(),
        sortStatus: "complete",
        actionLog: [...(item.actionLog || []), { action: "sorted", note: "bulk", timestamp: now }],
      }));

      await BookOrderModel.updateOne({ _id: orderId }, { $set: { items: updatedItems } });

      return BaseService.sendSuccessResponse({ message: { message: "All items marked as sorted", allItemsSorted: true } });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to mark all items as sorted" });
    }
  }

  /**
   * MARK ITEM AS PRETREATED
   * PATCH /sort/:id/items/:itemId/mark-pretreated
   */
  async markItemAsPretreated(req) {
    try {
      const orderId = req.params.id;
      const itemId  = req.params.itemId;
      const userId  = req.user.id;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });
      if (!itemId)  return BaseService.sendFailedResponse({ error: "Item ID is required" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findOne({ _id: orderId, "stage.status": ORDER_STATUS.SORT_AND_PRETREAT });
      if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not in sort & pretreat stage" });

      const item = order.items.id(itemId);
      if (!item) return BaseService.sendFailedResponse({ error: "Item not found in order" });
      if (item.pretreatStatus === "complete") return BaseService.sendFailedResponse({ error: "Item is already marked as pretreated" });

      await BookOrderModel.updateOne(
        { _id: orderId, "items._id": itemId },
        {
          $set:  { "items.$.pretreatStatus": "complete" },
          $push: { "items.$.actionLog": { action: "pretreated", note: "", timestamp: new Date() } },
        }
      );

      const updatedOrder       = await BookOrderModel.findById(orderId).lean();
      const allItemsSorted     = updatedOrder.items.every((i) => i.sortStatus === "complete");
      const allItemsPretreated = updatedOrder.items.every((i) => i.pretreatStatus === "complete");
      const readyToSend        = allItemsSorted && allItemsPretreated;

      return BaseService.sendSuccessResponse({
        message: { message: "Item marked as pretreated", allItemsSorted, allItemsPretreated, readyToSend },
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to mark item as pretreated" });
    }
  }

  /**
   * UNDO ITEM PRETREATED
   * PATCH /sort/:id/items/:itemId/undo-pretreated
   */
  async undoMarkItemAsPretreated(req) {
    try {
      const orderId = req.params.id;
      const itemId  = req.params.itemId;
      const userId  = req.user.id;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });
      if (!itemId)  return BaseService.sendFailedResponse({ error: "Item ID is required" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findOne({ _id: orderId, "stage.status": ORDER_STATUS.SORT_AND_PRETREAT });
      if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not in sort & pretreat stage" });

      const item = order.items.id(itemId);
      if (!item) return BaseService.sendFailedResponse({ error: "Item not found in order" });

      await BookOrderModel.updateOne(
        { _id: orderId, "items._id": itemId },
        {
          $set:  { "items.$.pretreatStatus": "pending" },
          $push: { "items.$.actionLog": { action: "undo_pretreated", note: "", timestamp: new Date() } },
        }
      );

      return BaseService.sendSuccessResponse({ message: "Item pretreat status undone successfully" });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to undo item pretreat status" });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FLAG ITEM FOR REVIEW
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * FLAG ITEM FOR REVIEW
   * PATCH /sort/:id/items/:itemId/flag
   */
  async flagItemForReview(req) {
    try {
      const orderId    = req.params.id;
      const itemId     = req.params.itemId;
      const userId     = req.user.id;
      const { note }   = req.body;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });
      if (!itemId)  return BaseService.sendFailedResponse({ error: "Item ID is required" });
      if (!note)    return BaseService.sendFailedResponse({ error: "A note is required when flagging an item" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findOne({ _id: orderId, "stage.status": ORDER_STATUS.SORT_AND_PRETREAT });
      if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not in sort & pretreat stage" });

      const item = order.items.id(itemId);
      if (!item) return BaseService.sendFailedResponse({ error: "Item not found in order" });

      await BookOrderModel.updateOne(
        { _id: orderId, "items._id": itemId },
        {
          $set:  { "items.$.flaggedForReview": true, "items.$.flagNote": note },
          $push: { "items.$.actionLog": { action: "flagged", note, timestamp: new Date() } },
        }
      );

      return BaseService.sendSuccessResponse({ message: "Item flagged for review successfully" });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to flag item for review" });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SEND TO NEXT STAGE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * SEND ORDER TO NEXT STAGE
   * Active only when ALL items have both sortStatus and pretreatStatus = complete.
   * Routes to WASHING (WASHING_ONLY / WASH_AND_IRON) or IRONING (IRONING_ONLY).
   * PATCH /sort/:id/send-to-next-stage
   */
  async sendToNextStage(req) {
    try {
      const orderId = req.params.id;
      const userId  = req.user.id;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findOne({ _id: orderId, "stage.status": ORDER_STATUS.SORT_AND_PRETREAT });
      if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not in sort & pretreat stage" });

      const allItemsSorted     = order.items.every((i) => i.sortStatus === "complete");
      const allItemsPretreated = order.items.every((i) => i.pretreatStatus === "complete");

      if (!allItemsSorted || !allItemsPretreated) {
        return BaseService.sendFailedResponse({
          error: "All items must be marked as sorted and pretreated before sending to the next stage",
        });
      }

      const nextStatus =
        order.serviceType === ORDER_SERVICE_TYPE.IRONING_ONLY
          ? ORDER_STATUS.IRONING
          : ORDER_STATUS.WASHING;

      order.stage.status    = nextStatus;
      order.stage.note      = "";
      order.stage.updatedAt = new Date();
      order.stageHistory.push({ status: nextStatus, note: "", updatedAt: new Date() });

      await order.save();

      return BaseService.sendSuccessResponse({
        message: `Order ${order.oscNumber} successfully sent to ${nextStatus}`,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to send order to next stage" });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FLAGGED ORDERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET FLAGGED ORDERS
   * Orders currently on HOLD — "Flagged Items" dashboard section.
   * GET /sort/flagged
   */
  async getFlaggedOrders(req) {
    try {
      const userId = req.user.id;
      const user   = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const { page = 1, limit = 20, search = "" } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const query = { "stage.status": ORDER_STATUS.HOLD };
      if (search) {
        query.$or = [
          { oscNumber:   { $regex: search, $options: "i" } },
          { fullName:    { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
        ];
      }

      const [orders, total] = await Promise.all([
        BookOrderModel.find(query).sort({ "stage.updatedAt": -1 }).skip(skip).limit(Number(limit)).lean(),
        BookOrderModel.countDocuments(query),
      ]);

      return BaseService.sendSuccessResponse({
        message: { orders, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } },
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to fetch flagged orders" });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SORTED & PRETREATED LIST
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET SORTED & PRETREATED ORDERS LIST
   * Orders that have passed through S&P and moved on to washing/ironing/beyond.
   * GET /sort/completed
   */
  async getSortedAndPretreatdOrders(req) {
    try {
      const userId = req.user.id;
      const user   = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const { page = 1, limit = 20, search = "", startDate, endDate } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const query = {
        "stageHistory.status": ORDER_STATUS.SORT_AND_PRETREAT,
        "stage.status": { $nin: [ORDER_STATUS.SORT_AND_PRETREAT, ORDER_STATUS.HOLD, ORDER_STATUS.QUEUE, ORDER_STATUS.PENDING] },
      };

      if (search) {
        query.$or = [
          { oscNumber:   { $regex: search, $options: "i" } },
          { fullName:    { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
        ];
      }
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate)   query.createdAt.$lte = new Date(endDate);
      }

      const [orders, total] = await Promise.all([
        BookOrderModel.find(query).sort({ updatedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
        BookOrderModel.countDocuments(query),
      ]);

      return BaseService.sendSuccessResponse({
        message: { orders, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } },
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to fetch sorted orders" });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WASHING VIEW (read-only status monitor)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET ORDERS IN WASHING STAGE
   * Read-only. S&P operator monitors orders currently at the Wash & Dry station.
   * GET /sort/washing
   */
  async getWashingOrders(req) {
    try {
      const userId = req.user.id;
      const user   = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const { page = 1, limit = 20, search = "" } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const query = { "stage.status": ORDER_STATUS.WASHING };
      if (search) {
        query.$or = [
          { oscNumber:   { $regex: search, $options: "i" } },
          { fullName:    { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
        ];
      }

      const [orders, total] = await Promise.all([
        BookOrderModel.find(query)
          .select("oscNumber fullName phoneNumber serviceType serviceTier amount stage stageHistory items createdAt")
          .sort({ "stage.updatedAt": 1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        BookOrderModel.countDocuments(query),
      ]);

      return BaseService.sendSuccessResponse({
        message: { orders, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } },
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to fetch washing orders" });
    }
  }

  /**
   * GET SINGLE ORDER DETAILS (WASHING VIEW)
   * GET /sort/washing/:id
   */
  async getWashingOrderDetails(req) {
    try {
      const orderId = req.params.id;
      const userId  = req.user.id;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findOne({ _id: orderId, "stage.status": ORDER_STATUS.WASHING }).lean();
      if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not currently in washing stage" });

      return BaseService.sendSuccessResponse({ message: { order } });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to fetch order details" });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // IRONING VIEW (read-only status monitor)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET ORDERS IN IRONING STAGE
   * Read-only. S&P operator monitors orders currently at the Press & Iron station.
   * Note: contains both IRONING_ONLY orders (came directly from S&P) and
   * WASH_AND_IRON orders (came from Wash & Dry station).
   * GET /sort/ironing
   */
  async getIroningOrders(req) {
    try {
      const userId = req.user.id;
      const user   = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const { page = 1, limit = 20, search = "" } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const query = { "stage.status": ORDER_STATUS.IRONING };
      if (search) {
        query.$or = [
          { oscNumber:   { $regex: search, $options: "i" } },
          { fullName:    { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
        ];
      }

      const [orders, total] = await Promise.all([
        BookOrderModel.find(query)
          .select("oscNumber fullName phoneNumber serviceType serviceTier amount stage stageHistory items createdAt")
          .sort({ "stage.updatedAt": 1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        BookOrderModel.countDocuments(query),
      ]);

      return BaseService.sendSuccessResponse({
        message: { orders, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } },
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to fetch ironing orders" });
    }
  }

  /**
   * GET SINGLE ORDER DETAILS (IRONING VIEW)
   * GET /sort/ironing/:id
   */
  async getIroningOrderDetails(req) {
    try {
      const orderId = req.params.id;
      const userId  = req.user.id;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findOne({ _id: orderId, "stage.status": ORDER_STATUS.IRONING }).lean();
      if (!order) return BaseService.sendFailedResponse({ error: "Order not found or not currently in ironing stage" });

      return BaseService.sendSuccessResponse({ message: { order } });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to fetch order details" });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HISTORY
  // ─────────────────────────────────────────────────────────────────────────

/**
   * GET HISTORY LIST
   * All orders that have ever passed through S&P station, paginated.
   * GET /sort/history
   */
  async getHistoryList(req) {
    try {
      const userId = req.user.id;
      const user   = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const { page = 1, limit = 20, search = "", startDate, endDate } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const query = { "stageHistory.status": ORDER_STATUS.SORT_AND_PRETREAT };

      if (search) {
        query.$or = [
          { oscNumber:   { $regex: search, $options: "i" } },
          { fullName:    { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
        ];
      }
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate)   query.createdAt.$lte = new Date(endDate);
      }

      const [orders, total] = await Promise.all([
        BookOrderModel.find(query)
          .select("oscNumber fullName phoneNumber serviceType serviceTier amount stage stageHistory createdAt updatedAt")
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        BookOrderModel.countDocuments(query),
      ]);

      return BaseService.sendSuccessResponse({
        message: { orders, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } },
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to fetch history list" });
    }
  }

  /**
   * GET ORDER TIMELINE
   * Returns two things:
   *
   * 1. pipeline — the fixed ordered stepper the frontend renders:
   *      Intake → Tagged → Pretreated → Washing → Ironed → QC Passed → Ready → Delivered
   *    Each step has: { key, label, completed, timestamp }
   *    Completed steps show their timestamp; pending steps show null (renders as "—").
   *
   * 2. itemTimeline — granular per-item action log (sorted, pretreated, flagged, etc.)
   *    for the detailed audit section below the stepper.
   *
   * GET /sort/history/:id/timeline
   */
  async getOrderTimeline(req) {
    try {
      const orderId = req.params.id;
      const userId  = req.user.id;

      if (!orderId) return BaseService.sendFailedResponse({ error: "Order ID is required" });

      const user = await sortAndPretreatModel.findById(userId);
      if (!user) return BaseService.sendFailedResponse({ error: "User not found" });

      const order = await BookOrderModel.findById(orderId).lean();
      if (!order) return BaseService.sendFailedResponse({ error: "Order not found" });

      // ── Fixed pipeline definition ────────────────────────────────────────
      // Maps each step label to the ORDER_STATUS value that marks it complete.
      // Order matters — this is the sequence the frontend stepper renders.
      const PIPELINE = [
        { key: "intake",     label: "Intake",      status: ORDER_STATUS.PENDING         },
        { key: "tagged",     label: "Tagged",       status: ORDER_STATUS.QUEUE           },
        { key: "pretreated", label: "Pretreated",   status: ORDER_STATUS.SORT_AND_PRETREAT },
        { key: "washing",    label: "Washing",      status: ORDER_STATUS.WASHING         },
        { key: "ironed",     label: "Ironed",       status: ORDER_STATUS.IRONING         },
        { key: "qc_passed",  label: "QC Passed",    status: ORDER_STATUS.QC              },
        { key: "ready",      label: "Ready",        status: ORDER_STATUS.READY_FOR_DELIVERY },
        { key: "delivered",  label: "Delivered",    status: ORDER_STATUS.DELIVERED       },
      ];

      // Build a lookup: status → timestamp from stageHistory
      const stageTimestampMap = {};
      for (const entry of order.stageHistory || []) {
        // Keep the earliest timestamp if a status appears more than once
        if (!stageTimestampMap[entry.status]) {
          stageTimestampMap[entry.status] = entry.updatedAt;
        }
      }
      // Intake timestamp = order creation
      stageTimestampMap[ORDER_STATUS.PENDING] = stageTimestampMap[ORDER_STATUS.PENDING] || order.createdAt;

      // Build the pipeline array
      const pipeline = PIPELINE.map((step) => {
        const timestamp = stageTimestampMap[step.status] || null;
        return {
          key:       step.key,
          label:     step.label,
          completed: !!timestamp,
          timestamp: timestamp || null,
        };
      });

      // ── Per-item action log (granular audit trail) ───────────────────────
      const itemTimeline = [];
      for (const item of order.items || []) {
        for (const log of item.actionLog || []) {
          itemTimeline.push({
            itemId:   item._id,
            itemType: item.type,
            action:   log.action,
            note:     log.note || "",
            timestamp: log.timestamp,
          });
        }
      }
      itemTimeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // ── Current status for the badge (e.g. "In progress") ───────────────
      const isDelivered  = order.stage.status === ORDER_STATUS.DELIVERED;
      const trackingStatus = isDelivered ? "completed" : "in_progress";

      return BaseService.sendSuccessResponse({
        message: {
          order: {
            _id:           order._id,
            oscNumber:     order.oscNumber,
            fullName:      order.fullName,
            phoneNumber:   order.phoneNumber,
            serviceType:   order.serviceType,
            serviceTier:   order.serviceTier,
            amount:        order.amount,
            stage:         order.stage,
            trackingStatus,
            items:         order.items,
            createdAt:     order.createdAt,
          },
          pipeline,
          itemTimeline,
        },
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to fetch order timeline" });
    }
  }
}


module.exports = new SortAndPretreatService();