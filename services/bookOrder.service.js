const BaseService = require("./base.service");
const UserModel = require("../models/user.model");
const validateData = require("../util/validate");
const BookOrderModel = require("../models/bookOrder.model");
const AdminOrderDetailsModel = require("../models/adminOrderDetails.model");
const { generateOscNumber } = require("../util/helper");
const NotificationModel = require("../models/notification.model");
const SubscriptionModel = require("../models/subscription.model");
const {
  NOTIFICATION_TYPE,
  ORDER_STATUS,
  DELIVERY_SPEED,
  BILLING_TYPE,
  STANDARD_ITEMS_ENUM_TYPES,
  ACTIVITY_TYPE,
  STATION_STATUS,
} = require("../util/constants");
const ActivityModel = require("../models/activity.model");

class BookOrderService extends BaseService {
  async postBookOrder(req, res) {
    try {
      const post = req.body;
      const userId = req.user.id;

      const user = await UserModel.findById(userId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const validateRule = {
        fullName: "string|required",
        phoneNumber: "string|required",
        pickupAddress: "string|required",
        // pickupDate: "date|required",
        // pickupTime: "string|required",
        serviceType: "string|required",
        serviceTier: "string|required",
        billingType: "string|required",
        deliverySpeed: "string|required:in:express,standard,same-day",
        isPickUpAndDelivery: "boolean|required",
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

      let finalMessage = 'Order booked successfully';
      const adminOrderSettings = await AdminOrderDetailsModel.findOne({});
      const oscNumber = generateOscNumber();
      let newOrder = null


      if (post.billingType == BILLING_TYPE.PAY_FROM_SUBSCRIPTION) {
        const subscription = await SubscriptionModel.findOne({
          userId,
        }).populate("planId");
        if (!subscription) {
          return BaseService.sendFailedResponse({
            error: "No active subscription found for user",
          });
        }

        if (subscription.status !== "active") {
          return BaseService.sendFailedResponse({
            error: "Subscription is not active",
          });
        }


        if (!adminOrderSettings) {
          return BaseService.sendFailedResponse({
            error: "Admin order settings not found",
          });
        }

        const isAllStandard = post.items.every((item) => STANDARD_ITEMS_ENUM_TYPES.includes(item.type));

        if (!isAllStandard) {
          return BaseService.sendFailedResponse({
            error: "Your subscription plan only allows standard items. Please remove any non-standard items from your order.",
          });
        }

        if(post.deliverySpeed === DELIVERY_SPEED.SAME_DAY && post.items.length > adminOrderSettings.sameDayCapacity){
          return BaseService.sendFailedResponse({
            error: `Same day delivery is currently at full capacity. Please reduce your items or choose the express delivery speed.`,
          });
        }

        if(post.deliverySpeed === DELIVERY_SPEED.EXPRESS && post.items.length > adminOrderSettings.expressCapacity){
          return BaseService.sendFailedResponse({
            error: `Same day delivery is currently at full capacity. Please reduce your items or choose the standard delivery speed.`,
          });
        }

        if(post.deliverySpeed === DELIVERY_SPEED.STANDARD && post.items.length > adminOrderSettings.standardCapacity){
          finalMessage += ` We expect this to take ${adminOrderSettings.standardDeliveryPeriod} days. We appreciate your patience and understanding.`
        }

        const subscriptionPlanMonthlyLimits = subscription.planId.monthlyLimits;
        if(post.items.length > subscriptionPlanMonthlyLimits){
          return BaseService.sendFailedResponse({error: 'You selected items has exceeded your currently subscription limit. Consider upgrading or reducing your items'})
        }

        let totalPrice = post.items.reduce((sum, item) => {
          const price = Number(item.price);
          const quantity = Number(item.quantity);

          return sum + price * quantity;
        }, 0);

        let extraDeliveryCost = 0;

        totalPrice += extraDeliveryCost;
        const stage = {
          status: ORDER_STATUS.PENDING,
          updatedAt: new Date(),
        }
        const stageHistory = {
          status: ORDER_STATUS.PENDING,
          note: "Order created",
          updatedAt: new Date(),
        }

        const newOrderItem = {
          oscNumber,
          amount: totalPrice,
          deliveryAmount: extraDeliveryCost,
          stage,
          stageHistory: [stageHistory],
          stationStatus: STATION_STATUS.PENDING,
          ...post,
        };
        newOrder = new BookOrderModel(newOrderItem);
        await newOrder.save();

        await NotificationModel.create({
          userId: userId,
          title: "Order Created Successfully",
          body: `Your laundry order has been received. We will pick it up shortly.`,
          subBody: `Order ID: ${oscNumber}.`,
          type: NOTIFICATION_TYPE.ORDER_CREATED,
        });

        // update the subscription usage
        subscription.remainingItems -= post.items.length;
        await subscription.save();

        

      } else if (post.billingType == BILLING_TYPE.PAY_PER_ITEM) {
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

        totalPrice += extraDeliveryCost;

        // const oscNumber = generateOscNumber();


        const stage = {
          status: ORDER_STATUS.PENDING,
          updatedAt: new Date(),
        }
        const stageHistory = {
          status: ORDER_STATUS.PENDING,
          note: "Order created",
          updatedAt: new Date(),
        }

        const newOrderItem = {
          oscNumber,
          amount: totalPrice,
          deliveryAmount: extraDeliveryCost,
          stage,
          stageHistory: [stageHistory],
          ...post,
        };
        const newOrder = new BookOrderModel(newOrderItem);
        await newOrder.save();

        await NotificationModel.create({
          userId: userId,
          title: "Order Created Successfully",
          body: `Your laundry order has been received. We will pick it up shortly.`,
          subBody: `Order ID: ${oscNumber}.`,
          type: NOTIFICATION_TYPE.ORDER_CREATED,
        });
      }
      // update the capacity in admin order settings
      if(post.deliverySpeed === DELIVERY_SPEED.SAME_DAY){
        adminOrderSettings.sameDayCapacity -= post.items.length;
      }else if(post.deliverySpeed === DELIVERY_SPEED.EXPRESS){
        adminOrderSettings.expressCapacity -= post.items.length;
      }else if(post.deliverySpeed === DELIVERY_SPEED.STANDARD){
        adminOrderSettings.standardCapacity -= post.items.length;
      }
      await adminOrderSettings.save();

      await ActivityModel.create({
        title: "New Order Registered",
        description: `Order ${oscNumber} created for a customer ${user.fullName}.`,
        type: ACTIVITY_TYPE.ORDER_CREATED,
      });
      return BaseService.sendSuccessResponse({
        message: finalMessage,
        order: newOrder
      });

    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async getAdminOrderDetails(req, res) {
    try {
      const adminOrderDetails = await AdminOrderDetailsModel.findOne({});

      return BaseService.sendSuccessResponse({
        message: adminOrderDetails,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async updateBookOrderPaymentStatus(req, res) {
    try {
      const status = req.body.paymentStatus;
      const bookOrderId = req.params.id;

      if (!status) {
        return BaseService.sendFailedResponse({
          error: "Please provide a payment status for the book order",
        });
      }

      if (!bookOrderId) {
        return BaseService.sendFailedResponse({
          error: "Please provide a book order id",
        });
      }

      const bookOrder = await BookOrderModel.findById(bookOrderId);
      if (!bookOrder) {
        return BaseService.sendFailedResponse({
          error: "Book order not found!",
        });
      }

      if (status === "success") {
        await NotificationModel.create({
          userId: bookOrder.userId,
          title: "Payment Successful Approved",
          body: `Your payment of ${bookOrder.amount} has been successfully approved.`,
          subBody: `Order ID: ${bookOrder.oscNumber}`,
          type: NOTIFICATION_TYPE.PAYMENT_APPROVED,
        });
      }
      bookOrder.paymentStatus = status;
      await bookOrder.save();

      return BaseService.sendSuccessResponse({
        message: "Book order updated successfully",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async updateBookOrderStage(req, res) {
    try {
      const stage = req.body.stage;
      const note = req.body.note;
      const bookOrderId = req.params.id;

      if (!stage) {
        return BaseService.sendFailedResponse({
          error: "Please provide a stage for the book order",
        });
      }

      if (
        ![
          ORDER_STATUS.DELIVERED,
          ORDER_STATUS.IRONING,
          ORDER_STATUS.OUT_FOR_DELIVERY,
          ORDER_STATUS.PICKED_UP,
          ORDER_STATUS.READY,
          ORDER_STATUS.RECEIVED,
        ].includes(stage)
      ) {
        return BaseService.sendFailedResponse({
          error: "Please provide a valid stage for the book order",
        });
      }
      if (!bookOrderId) {
        return BaseService.sendFailedResponse({
          error: "Please provide a book order id",
        });
      }

      const bookOrder = await BookOrderModel.findById(bookOrderId);
      if (!bookOrder) {
        return BaseService.sendFailedResponse({
          error: "Book order not found!",
        });
      }
      bookOrder.stage.status = stage;
      bookOrder.stage.note = note;
      await bookOrder.save();

      let message = "";
      let title = "";

      switch (stage) {
        case ORDER_STATUS.PICKED_UP:
          message = "Your laundry has been picked up successfully";
          title = "Picked Up";
          break;
        case ORDER_STATUS.WASHING:
          message = "Your laundry is being washed";
          title = "Washing";
          break;
        case ORDER_STATUS.IRONING:
          message = "Your laundry is being ironed";
          title = "Ironing";
          break;
        case ORDER_STATUS.DELIVERED:
          message = "Your order has been delivered successfully";
          title = "Delivered";
          break;
        case ORDER_STATUS.OUT_FOR_DELIVERY:
          message = "Your order is out for delivery";
          title = "Delivered";
        case ORDER_STATUS.RECEIVED:
          message = "Your order has been received";
          title = "Received";
        case ORDER_STATUS.READY:
          message = "Your order is ready for pickup";
          title = "Ready";
          break;
        default:
          message = "Status updated";
      }

      await NotificationModel.create({
        userId: bookOrder.userId,
        title: title,
        body: message,
        subBody: note || "",
        type: NOTIFICATION_TYPE.ORDER_UPDATED,
      });

      return BaseService.sendSuccessResponse({
        message: "Book order stage updated successfully",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async getBookOrderHistory(req, res) {
    try {
      const page = parseInt(req.query.page) || 1; // default to page 1
      const limit = parseInt(req.query.limit) || 10; // default 10 per page
      const skip = (page - 1) * limit;
      const userId = req.user.id;
      const scope = req.query.scope || "all"; // default to user scope "user | all"

      // 2️⃣ Optional filters
      const filter = {};
      if (req.query.status) {
        filter["stage.status"] = req.query.status; // filter by order stage status
      }
      if (req.query.paymentStatus) {
        filter.paymentStatus = req.query.paymentStatus;
      }
      if (scope === "user") {
        filter.userId = userId;
      }

      // 3️⃣ Fetch orders with pagination
      const orders = await BookOrderModel.find(filter)
        .sort({ createdAt: -1 }) // latest first
        .skip(skip)
        .limit(limit)
        .lean();

      // 4️⃣ Count total for pagination meta
      const total = await BookOrderModel.countDocuments(filter);

      // 5️⃣ Send response
      return BaseService.sendSuccessResponse({
        message: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          data: orders,
        },
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async getBookOrder(req, res) {
    try {
      const bookOrderId = req.params.id;

      if (!bookOrderId) {
        return BaseService.sendFailedResponse({
          error: "Please provide a valid book order id",
        });
      }
      const bookOrder = await BookOrderModel.findById(bookOrderId);

      if (!bookOrder) {
        return BaseService.sendFailedResponse({
          error: "Book order not found",
        });
      }

      // 5️⃣ Send response
      return BaseService.sendSuccessResponse({
        message: bookOrder,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
}

module.exports = BookOrderService;
