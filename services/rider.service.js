const BookOrderModel = require("../models/bookOrder.model");
const { PICKUP_STATUS, DELIVERY_STATUS } = require("../util/constants");
const paginate = require("../util/paginate");
const BaseService = require("./base.service");

class RiderService extends BaseService {
  async getRiderAssignedDeliveries(req) {
    try {
      const riderId = req.user.id;
      const { page = 1, limit = 10 } = req.query;

      const query = {
        "dispatchDetails.pickup.rider": riderId,
      };

      const result = await paginate(BookOrderModel, query, {
        page,
        limit,
      });

      return BaseService.sendSuccessResponse({
        message: result,
      });
    } catch (error) {
      console.error("Error in getRiderAssignedDeliveries:", error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later",
      });
    }
  }

  async getOrderDetails(req) {
    try {
      const orderId = req.params.id;
      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }
      const order = await BookOrderModel.findById(orderId).populate(
        "userId",
        "fullName email phoneNumber"
      );

      return BaseService.sendSuccessResponse({
        message: order,
      });
    } catch (error) {
      console.log("Error in getOrderDetails:", error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later",
      });
    }
  }

  async startDelivery(req) {
    try {
      const orderId = req.params.id;
      const phoneNumber = req.body.phoneNumber;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }

      if (!phoneNumber) {
        return BaseService.sendFailedResponse({
          error: "Customer phone number is required",
        });
      }

      const order = await BookOrderModel.findById(orderId).populate(
        "userId",
        "phoneNumber"
      );

      if (!order) {
        return BaseService.sendFailedResponse({
          error: "Order not found",
        });
      }

      if (order.dispatchDetails.delivery.status === PICKUP_STATUS.PICKED_UP) {
        return BaseService.sendFailedResponse({
          error: "Delivery is already picked up",
        });
      }

      if (order.dispatchDetails.pickup.rider.toString() !== req.user.id) {
        return BaseService.sendFailedResponse({
          error: "You are not assigned to this delivery",
        });
      }

      if (order.userId.phoneNumber !== phoneNumber) {
        return BaseService.sendFailedResponse({
          error: "Provided phone number does not match customer's phone number",
        });
      }

      order.dispatchDetails.pickup.status = PICKUP_STATUS.PICKED_UP;
      order.dispatchDetails.pickup.updatedAt = new Date();
      order.dispatchDetails.pickup.isVerified = true;

      await order.save();

      return BaseService.sendSuccessResponse({
        message: "Delivery started successfully",
      });
    } catch (error) {
      console.error("Error in startDelivery:", error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later",
      });
    }
  }

  async getActiveDeliveries(req) {
    try {
      const riderId = req.user.id;
      const { page = 1, limit = 10 } = req.query;

      const query = {
        "dispatchDetails.delivery.rider": riderId,
        "dispatchDetails.delivery.status": PICKUP_STATUS.PICKED_UP,
      };

      const result = await paginate(BookOrderModel, query, {
        page,
        limit,
      });

      return BaseService.sendSuccessResponse({
        message: result,
      });
    } catch (error) {
      console.error("Error in getActiveDeliveries:", error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later",
      });
    }
  }

  //   async verifyPickup(req) {
  //     try {
  //       const orderId = req.params.id;
  //       const { phoneNumber } = req.body;
  //       const userId = req.user.id;

  //       if (!orderId) {
  //         return BaseService.sendFailedResponse({
  //           error: "Order ID is required",
  //         });
  //       }

  //       if (!phoneNumber) {
  //         return BaseService.sendFailedResponse({
  //           error: "Customer phone number is required",
  //         });
  //       }

  //       const order = await BookOrderModel.findById(orderId).populate(
  //         "userId",
  //         "phoneNumber"
  //       );

  //       if (!order) {
  //         return BaseService.sendFailedResponse({
  //           error: "Order not found",
  //         });
  //       }

  //       if (
  //         order.dispatchDetails.pickup.status !== PICKUP_STATUS.SCHEDULED &&
  //         order.dispatchDetails.pickup.rider.toString() !== userId
  //       ) {
  //         return BaseService.sendFailedResponse({
  //           error:
  //             "Delivery is not scheduled for pickup or you are not assigned to this delivery",
  //         });
  //       }

  //       if (order.userId.phoneNumber !== phoneNumber) {
  //         return BaseService.sendFailedResponse({
  //           error: "Provided phone number does not match customer's phone number",
  //         });
  //       }

  //       order.dispatchDetails.pickup.status = DELIVERY_STATUS.DELIVERED;
  //       order.dispatchDetails.delivery.updatedAt = new Date();

  //       await order.save();

  //       return BaseService.sendSuccessResponse({
  //         message: "Order pickup verified successfully",
  //       });
  //     } catch (error) {
  //       console.error("Error in verifyPickup:", error);
  //       return BaseService.sendFailedResponse({
  //         error: "Something went wrong. Please try again later",
  //       });
  //     }
  //   }

  async markOrderAsDelivered(req) {
    try {
      const orderId = req.params.id;
      const { phoneNumber } = req.body;
      const userId = req.user.id;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }

      if (!phoneNumber) {
        return BaseService.sendFailedResponse({
          error: "Customer phone number is required",
        });
      }

      const order = await BookOrderModel.findById(orderId).populate(
        "userId",
        "phoneNumber"
      );

      if (!order) {
        return BaseService.sendFailedResponse({
          error: "Order not found",
        });
      }

      if (order.dispatchDetails.pickup.status !== PICKUP_STATUS.PICKED_UP) {
        return BaseService.sendFailedResponse({
          error:
            "Delivery must be picked up before it can be marked as delivered",
        });
      }

      if (order.dispatchDetails.pickup.rider.toString() !== userId) {
        return BaseService.sendFailedResponse({
          error: "You are not assigned to this delivery",
        });
      }

      if (order.userId.phoneNumber !== phoneNumber) {
        return BaseService.sendFailedResponse({
          error: "Provided phone number does not match customer's phone number",
        });
      }

      order.dispatchDetails.delivery.status = DELIVERY_STATUS.DELIVERED;
      order.dispatchDetails.delivery.updatedAt = new Date();

      await order.save();

      return BaseService.sendSuccessResponse({
        message: "Order marked as delivered successfully",
      });
    } catch (error) {
      console.error("Error in markOrderAsDelivered:", error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later",
      });
    }
  }

  async markOrderDeliveryAsFailed(req) {
    try {
      const orderId = req.params.id;
      const { phoneNumber } = req.body;
      const note = req.body.note || "";
      const userId = req.user.id;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }

      if (!phoneNumber) {
        return BaseService.sendFailedResponse({
          error: "Customer phone number is required",
        });
      }

      const order = await BookOrderModel.findById(orderId).populate(
        "userId",
        "phoneNumber"
      );

      if (!order) {
        return BaseService.sendFailedResponse({
          error: "Order not found",
        });
      }

      if (order.dispatchDetails.pickup.status !== PICKUP_STATUS.PICKED_UP) {
        return BaseService.sendFailedResponse({
          error: "Delivery must be picked up before it can be marked as failed",
        });
      }

      if (order.dispatchDetails.pickup.rider.toString() !== userId) {
        return BaseService.sendFailedResponse({
          error: "You are not assigned to this delivery",
        });
      }

      if (order.userId.phoneNumber !== phoneNumber) {
        return BaseService.sendFailedResponse({
          error: "Provided phone number does not match customer's phone number",
        });
      }

      order.dispatchDetails.delivery.status = DELIVERY_STATUS.FAILED;
      order.dispatchDetails.delivery.updatedAt = new Date();
      order.dispatchDetails.delivery.note = note;

      await order.save();

      return BaseService.sendSuccessResponse({
        message: "Order marked as failed successfully",
      });
    } catch (error) {
      console.error("Error in markOrderDeliveryAsFailed:", error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later",
      });
    }
  }
}

module.exports = RiderService;
