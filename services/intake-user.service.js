const ActivityModel = require("../models/activity.model");
const BookOrderModel = require("../models/bookOrder.model");
const IntakeUserModel = require("../models/intakeUser.model");
const UserModel = require("../models/user.model");
const WalletModel = require("../models/wallet.model");
const {
  PAYMENT_ORDER_STATUS,
  BILLING_TYPE,
  ORDER_CHANNEL,
  ORDER_STATUS,
  PICKUP_STATUS,
  DELIVERY_STATUS,
  ACTIVITY_TYPE,
  STATION_STATUS,
} = require("../util/constants");
const BaseService = require("./base.service");

class IntakeUserService extends BaseService {
  async createBookOrder(req, res) {
    try {
      const post = req.body;
      const userId = req.user.id;

      const user = await IntakeUserModel.findById(userId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const validateRule = {
        fullName: "string|required",
        phoneNumber: "string|required",
        pickupAddress: "string|required",
        serviceType: "string|required",
        serviceTier: "string|required",
        isPickUpOnly: "boolean|required",
        isPickUpAndDelivery: "boolean|required",
        deliverySpeed: "string|required",
        items: "array|required",
        "items.*.type": "string|required",
        "items.*.price": "integer|required",
        "items.*.quantity": "integer|required",
      };

      const validateMessage = {
        required: ":attribute is required",
        int: ":attribute must be an integer.",
        array: ":attribute must be an array.",
      };

      const validateResult = validateData(post, validateRule, validateMessage);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      let totalPrice = post.items.reduce((sum, item) => {
        const price = Number(item.price);
        const quantity = Number(item.quantity);

        return sum + price * quantity;
      }, 0);

      let extraDeliveryCost = 0;

      if (post.deliverySpeend == DELIVERY_SPEED.EXPRESS) {
        extraDeliveryCost = 300;
      } else if (post.deliverySpeed == DELIVERY_SPEED.SAME_DAY) {
        extraDeliveryCost = 500;
      }

      totalPrice += extraDeliveryCost * post.items.length;

      const oscNumber = generateOscNumber();
      const newOrderItem = {
        oscNumber,
        amount: totalPrice,
        paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
        billingType: BILLING_TYPE.PAY_PER_ITEM,
        intakeStaffId: userId,
        channel: ORDER_CHANNEL.OFFICE,
        stage: {
          status: ORDER_STATUS.QUEUE,
        },
        stageHistory: [{
          status: ORDER_STATUS.QUEUE,
          updatedAt: new Date(),
          note: 'Order Created'
        }],
        ...post,
      };
      const newOrder = new BookOrderModel(newOrderItem);
      await newOrder.save();

      await NotificationModel.create({
        userId: userId,
        title: "Order Created Successfully",
        body: `Your have successfully created an order for ${post.fullName}.`,
        subBody: `Order ID: ${oscNumber}.`,
        type: NOTIFICATION_TYPE.ORDER_CREATED,
      });

      await ActivityModel.create({
        title: "New Order Registered",
        description: `Order ${oscNumber} created for a customer ${post.fullName}.`,
        type: ACTIVITY_TYPE.ORDER_CREATED,
      });

      return BaseService.sendSuccessResponse({
        message: newOrder,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async flagOrder(req) {
    try {
      const orderId = req.params.id;
      const post = req.body;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }
      const order = await BookOrderModel.findById(orderId);
      if (!order) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }

      const userId = req.user.id;

      const user = await IntakeUserModel.findById(userId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const validateRule = {
        message: "string|required",
      };

      const validateMessage = {
        required: ":attribute is required",
        string: ":attribute must be an string.",
      };

      const validateResult = validateData(post, validateRule, validateMessage);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      order.stage.status = ORDER_STATUS.HOLD;
      order.stage.note = message;

      order.stageHistory.push({
        status: ORDER_STATUS.HOLD,
        note: message,
        updatedAt: new Date(),
      });

      await order.save();

      await ActivityModel.create({
        title: "Order Flagged",
        description: `Order ${order.oscNumber} has been flagged with the following message: ${message}`,
        type: ACTIVITY_TYPE.ORDER_FLAGGED,
      });

      return BaseService.sendSuccessResponse({
        message: "Order flagged successfully",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to flag order" });
    }
  }
  async proceedToTag(req) {
    try {
      const orderId = req.params.id;
      const userId = req.user.id;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }
      const order = await BookOrderModel.findById(orderId);
      if (!order) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }

      const user = await IntakeUserModel.findById(userId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      order.stage.status = ORDER_STATUS.QUEUE;
      order.stage.note = "";
      order.stageHistory.push({
        status: ORDER_STATUS.QUEUE,
        note: "",
        updatedAt: new Date(),
      });
      order.stationStatus = STATION_STATUS.INTAKE_AND_TAG_STATION;

      await order.save();

      await ActivityModel.create({
        title: "Order moved to tag and queue",
        description: `A order ${oscNumber} has been moved to tag and queue`,
        type: ACTIVITY_TYPE.TAG_AND_QUEUE,
      });

      return BaseService.sendSuccessResponse({
        message: "Order moved to tag and queue successfully",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to flag order" });
    }
  }
  async confirmTagItem(req) {
    try {
      const orderId = req.params.id;
      const itemId = req.params.itemId;
      const userId = req.user.id;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }
      if (!itemId) {
        return BaseService.sendFailedResponse({
          error: "item ID is required",
        });
      }
      const order = await BookOrderModel.findById(orderId);
      if (!order) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }

      const post = req.body;

      const user = await IntakeUserModel.findById(userId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const validateRule = {
        tagState: "string|required",
        tagColor: "string|required",
        tagStatus: "string|required",
        tagId: "string|required",
      };

      const validateMessage = {
        required: ":attribute is required",
        string: ":attribute must be an string.",
      };

      const validateResult = validateData(post, validateRule, validateMessage);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const { tagState, tagColor, tagStatus, tagId } = post;

      await BookOrderModel.updateOne(
        { "items._id": itemId },
        {
          $set: {
            "items.$.tagState": tagState,
            "items.$.tagColor": tagColor,
            "items.$.tagStatus": tagStatus,
            "items.$.tagId": tagId,
          },
        }
      );

      await ActivityModel.create({
        title: "Order Item Tagged",
        description: `An item with ${tagId} order ${oscNumber} has been tagged`,
        type: ACTIVITY_TYPE.ORDER_CONFIRM,
      });

      return BaseService.sendSuccessResponse({
        message: "Tag successfully confirmed",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to flag order" });
    }
  }
  async undoConfirmTagItem(req) {
    try {
      const orderId = req.params.id;
      const itemId = req.params.id;
      const userId = req.user.id;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }
      if (!itemId) {
        return BaseService.sendFailedResponse({
          error: "item ID is required",
        });
      }
      const order = await BookOrderModel.findById(orderId);
      if (!order) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }

      const post = req.body;

      const user = await IntakeUserModel.findById(userId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      await BookOrderModel.updateOne(
        { "items._id": itemId },
        {
          $set: {
            "items.$.tagState": "",
            "items.$.tagColor": "",
            "items.$.tagStatus": "",
            "items.$.tagId": "",
          },
        }
      );

      await ActivityModel.create({
        title: "Order Item Tag Undone",
        description: `An item with ${itemId} order ${oscNumber} has been undone from tagging`,
        type: ACTIVITY_TYPE.ORDER_CONFIRM,
      });

      return BaseService.sendSuccessResponse({
        message: "Tag successfully undone",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to flag order" });
    }
  }
  async proceedToSortAndPretreat(req) {
    try {
      const orderId = req.params.id;
      const userId = req.user.id;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }
      const order = await BookOrderModel.findById(orderId);
      if (!order) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }

      const user = await IntakeUserModel.findById(userId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      order.stage.status = ORDER_STATUS.SORT_AND_PRETREAT;
      order.stage.note = "";
      order.stageHistory.push({
        status: ORDER_STATUS.SORT_AND_PRETREAT,
        note: "",
        updatedAt: new Date(),
      });
      order.stationStatus = STATION_STATUS.SORT_AND_PRETREAT_STATION;

      await order.save();

      await ActivityModel.create({
        title: "Order moved to sort and pretreat",
        description: `A order ${oscNumber} has been moved to sort and pretreat`,
        type: ACTIVITY_TYPE.SORT_AND_PRETREAT,
      });

      return BaseService.sendSuccessResponse({
        message: `Order ${order.oscNumber} successfully sent`,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to flag order" });
    }
  }
  async sendTopUpRequest(req) {
    try {
      const orderId = req.params.id;
      const userId = req.user.id;
      const post = req.body;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }
      const order = await BookOrderModel.findById(orderId).populate("userId");
      if (!order) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }

      const user = await IntakeUserModel.findById(userId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const validateRule = {
        message: "string|required",
        amount: "integer|required",
      };

      const validateMessage = {
        required: ":attribute is required",
        string: ":attribute must be an string.",
        integer: ":attribute must be an number.",
      };

      const validateResult = validateData(post, validateRule, validateMessage);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      //   send message either SMS or Whatsapp to a user
      await ActivityModel.create({
        title: "Wallet Adjustment request",
        description: `Credit ${amount} to ${order.userId.fullName} with ${order.userId.phoneNumber}`,
        type: ACTIVITY_TYPE.TOP_UP_REQUEST,
      });

      return BaseService.sendSuccessResponse({
        message: "Order moved to sort and pretreat successfully",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to flag order" });
    }
  }
  async adjustWallet(req) {
    try {
      const orderId = req.params.id;
      const userId = req.params.userId;
      const post = req.body;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }
      const order = await BookOrderModel.findById(orderId);
      if (!order) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }

      const user = await IntakeUserModel.findById(userId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const validateRule = {
        message: "string|required",
        amount: "integer|required",
        type: "string|required|in:credit,debit",
      };

      const validateMessage = {
        required: ":attribute is required",
        string: ":attribute must be an string.",
        integer: ":attribute must be an number.",
      };

      const validateResult = validateData(post, validateRule, validateMessage);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const { type, message, amount } = post;

      const wallet = await WalletModel.findOne({ userId });

      if (!wallet) {
        return BaseService.sendFailedResponse({ error: "Wallet not found" });
      }

      if (type === "credit") {
        wallet.balance += amount;
        wallet.save();
      } else {
        if (wallet.balance < amount) {
          return BaseService.sendFailedResponse({
            error: "Insufficient balance",
          });
        }
        wallet.balance -= amount;
        wallet.save();
      }

      order.adjustWallet.message = message;
      order.adjustWallet.amount = amount;
      order.save();

      await ActivityModel.create({
        title: "Wallet Adjustment",
        description: `${type === "credit" ? "Credited" : "Debited"} ${amount} to wallet of ${order.userId.fullName} with ${order.userId.phoneNumber}. Reason: ${message}`,
        type: ACTIVITY_TYPE.WALLET_ADJUSTMENT,
      });

      return BaseService.sendSuccessResponse({
        message: `Wallet ${type} request successful of ${amount}
        Reason: ${message}`,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to flag order" });
    }
  }
  async getUserWallet(req) {
    try {
      const userId = req.params.id;

      if (!userId) {
        return BaseService.sendFailedResponse({
          error: "User ID is required",
        });
      }

      const user = await UserModel.findById(userId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const wallet = await WalletModel.findOne({ userId });

      if (!wallet) {
        return BaseService.sendFailedResponse({ error: "Wallet not found" });
      }

      return BaseService.sendSuccessResponse({
        message: wallet.balance,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error: "Failed to flag order" });
    }
  }
  async getPickableOrders(req) {
    try {
      const orders = await BookOrderModel.find({
        isPickUpAndDelivery: true,
        "stage.status": ORDER_STATUS.PENDING,
      });

      return BaseService.sendSuccessResponse({
        message: orders,
      });
    } catch (error) {
      return BaseService.sendFailedResponse({
        error: "Failed to get pickable orders",
      });
    }
  }
  async getDeliverableOrders(req) {
    try {
      const orders = await BookOrderModel.find({
        isPickUpAndDelivery: true,
        "stage.status": ORDER_STATUS.READY,
      });

      return BaseService.sendSuccessResponse({
        message: orders,
      });
    } catch (error) {
      return BaseService.sendFailedResponse({
        error: "Failed to get deliverable orders",
      });
    }
  }
  async assignRiderTopPickupOrder(req) {
    try {
      const orderId = req.params.id;
      const riderId = req.params.riderId;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }
      if (!riderId) {
        return BaseService.sendFailedResponse({
          error: "Rider ID is required",
        });
      }
      const order = await BookOrderModel.findById(orderId);
      if (!order) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }

      order.dispatchDetails.pickup.rider = riderId;
      order.dispatchDetails.pickup.status = PICKUP_STATUS.SCHEDULED;

      await order.save();

      await ActivityModel.create({
        title: "Dispach Run Created",
        description: `Order ${order.oscNumber}: ${order.items.length} assigned for pickup`,
        type: ACTIVITY_TYPE.ORDER_PICKED,
      });

      return BaseService.sendSuccessResponse({
        message: "Rider successfully assigned to order",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: "Failed to assign rider to order",
      });
    }
  }
  async assignRiderTopDeliveryOrder(req) {
    try {
      const orderId = req.params.id;
      const riderId = req.params.riderId;

      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }
      if (!riderId) {
        return BaseService.sendFailedResponse({
          error: "Rider ID is required",
        });
      }
      const order = await BookOrderModel.findById(orderId);
      if (!order) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }

      order.dispatchDetails.delivery.rider = riderId;
      order.dispatchDetails.delivery.status = DELIVERY_STATUS.OUT_FOR_DELIVERY;

      await order.save();

      await ActivityModel.create({
        title: "Dispach Run Created",
        description: `Order ${order.oscNumber}: ${order.items.length} assigned for delivery`,
        type: ACTIVITY_TYPE.ORDER_DELIVERED,
      });

      return BaseService.sendSuccessResponse({
        message: "Rider successfully assigned to order",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: "Failed to assign rider to order",
      });
    }
  }
}

module.exports = IntakeUserService;
