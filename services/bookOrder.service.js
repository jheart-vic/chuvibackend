const BaseService = require("./base.service");
const UserModel = require("../models/user.model");
const validateData = require("../util/validate");
const BookOrderModel = require("../models/bookOrder.model");
const AdminOrderDetailsModel = require("../models/adminOrderDetails.model");
const { generateOscNumber } = require("../util/helper");
const NotificationModel = require("../models/notification.model");
const { NOTIFICATION_TYPE, ORDER_STATUS } = require("../util/constants");

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
        // deliverySpeed: "string|required",
        isPickUpOnly: "boolean|required",
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

      const totalPrice = post.items.reduce((sum, item) => {
        const price = Number(item.price);
        const quantity = Number(item.quantity);

        return sum + price * quantity;
      }, 0);

      const oscNumber = generateOscNumber();
      const newOrderItem = {
        oscNumber,
        amount: totalPrice,
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

      return BaseService.sendSuccessResponse({
        message: newOrder,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async getBookOrderDetails(req, res) {
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
      ){
        return BaseService.sendFailedResponse({
          error: "Please provide a valid stage for the book order",
        })
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
          title = "Picked Up"
          break;
        case ORDER_STATUS.WASHING:
          message = "Your laundry is being washed";
          title = "Washing"
          break;
        case ORDER_STATUS.IRONING:
          message = "Your laundry is being ironed";
          title = "Ironing"
          break;
        case ORDER_STATUS.DELIVERED:
          message = "Your order has been delivered successfully";
          title = "Delivered"
          break;
        case ORDER_STATUS.OUT_FOR_DELIVERY:
          message = "Your order is out for delivery";
          title = 'Delivered'
        case ORDER_STATUS.RECEIVED:
          message = "Your order has been received";
          title = "Received"
        case ORDER_STATUS.READY:
          message = "Your order is ready for pickup";
          title = "Ready"
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
      const scope = req.query.scope || "user"; // default to user scope

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
      const bookOrderId = req.params.id

      if(!bookOrderId){
        return BaseService.sendFailedResponse({error: 'Please provide a valid book order id'})
      }
      const bookOrder = await BookOrderModel.findById(bookOrderId)

      if(!bookOrder){
        return BaseService.sendFailedResponse({error: 'Book order not found'})
      }

      // 5️⃣ Send response
      return BaseService.sendSuccessResponse({
        message: bookOrder
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
}

module.exports = BookOrderService;


// async function createOrder(userId, items) {
//   const subscription = await UserSubscription.findOne({ user: userId })
//     .populate("plan");

//   if (!subscription) {
//     throw new Error("No active subscription");
//   }

//   const plan = subscription.plan;
//   const remaining = subscription.remainingItems;

//   // 1️⃣ Check Restricted Items
//   for (let item of items) {
//     if (plan.restrictedItems.includes(item.type)) {
//       throw new Error(`${item.type} is not allowed in your plan`);
//     }
//   }

//   // 2️⃣ Check Limits
//   for (let item of items) {
//     const available = remaining[item.type] || 0;

//     if (item.quantity > available) {
//       throw new Error(
//         `Not enough ${item.type}. Available: ${available}`
//       );
//     }
//   }

//   // 3️⃣ Deduct Balance
//   for (let item of items) {
//     remaining[item.type] -= item.quantity;
//   }

//   // 4️⃣ Save Updated Subscription
//   subscription.remainingItems = remaining;
//   await subscription.save();

//   // 5️⃣ Calculate Total
//   let total = 0;
//   items.forEach(i => {
//     total += i.price * i.quantity;
//   });

//   // 6️⃣ Create Order
//   const order = new Order({
//     user: userId,
//     items,
//     totalAmount: total,
//   });

//   await order.save();

//   return order;
// }




// let extraCharge = 0;

// for (let item of items) {
//   const available = remaining[item.type] || 0;

//   if (item.quantity > available) {
//     const excess = item.quantity - available;

//     extraCharge += excess * item.price;

//     remaining[item.type] = 0;
//   } else {
//     remaining[item.type] -= item.quantity;
//   }
// }



// const cron = require("node-cron");

// cron.schedule("0 0 1 * *", async () => {
//   const subscriptions = await UserSubscription.find()
//     .populate("plan");

//   for (let sub of subscriptions) {
//     sub.remainingItems = sub.plan.monthlyLimits;
//     sub.startDate = new Date();
//     sub.expiresAt = addMonths(new Date(), 1);

//     await sub.save();
//   }
// });





// Step 1: Calculate Remaining Days
// function getRemainingDays(expiresAt) {
//   const now = new Date();
//   const diff = expiresAt - now;

//   return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
// }

// Step 2: Calculate Prorated Price
// function calculateUpgradePrice(oldPlan, newPlan, remainingDays) {
//   const daysInMonth = 30;

//   const oldDaily = oldPlan.price / daysInMonth;
//   const newDaily = newPlan.price / daysInMonth;

//   const oldValueLeft = oldDaily * remainingDays;
//   const newValueLeft = newDaily * remainingDays;

//   return Math.max(0, newValueLeft - oldValueLeft);
// }


// Fair charging ✅

// Step 3: Upgrade API
// async function upgradePlan(userId, newPlanId) {
//   const sub = await UserSubscription.findOne({ user: userId })
//     .populate("plan");

//   if (!sub) throw new Error("No subscription");

//   const newPlan = await SubscriptionPlan.findById(newPlanId);

//   if (newPlan.price <= sub.plan.price) {
//     throw new Error("Use downgrade instead");
//   }

//   // Calculate cost
//   const remainingDays = getRemainingDays(sub.expiresAt);

//   const amountToPay = calculateUpgradePrice(
//     sub.plan,
//     newPlan,
//     remainingDays
//   );

//   // 👉 Initiate Paystack Here

//   return {
//     payAmount: amountToPay,
//     newPlan,
//   };
// }

// Step 4: After Paystack Confirms (Webhook)
// async function completeUpgrade(userId, newPlanId) {
//   const sub = await UserSubscription.findOne({ user: userId })
//     .populate("plan");

//   const newPlan = await SubscriptionPlan.findById(newPlanId);

//   // Recalculate balance
//   const newBalance = {};

//   for (let item in newPlan.monthlyLimits) {
//     const oldLimit = sub.plan.monthlyLimits[item] || 0;
//     const oldRemaining = sub.remainingItems[item] || 0;

//     // Carry unused + extra
//     const used = oldLimit - oldRemaining;

//     newBalance[item] = Math.max(
//       newPlan.monthlyLimits[item] - used,
//       0
//     );
//   }

//   sub.plan = newPlan._id;
//   sub.remainingItems = newBalance;

//   await sub.save();
// }