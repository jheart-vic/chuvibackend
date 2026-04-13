const ActivityModel = require("../models/activity.model");
const BookOrderModel = require("../models/bookOrder.model");
const PaymentModel = require("../models/payment.model");
const SubscriptionModel = require("../models/subscription.model");
const {
  ORDER_STATUS,
  PAYMENT_ORDER_STATUS,
  DELIVERY_STATUS,
  PICKUP_STATUS,
} = require("../util/constants");
const paginate = require("../util/paginate");
const BaseService = require("./base.service");

class AdminService extends BaseService {
  async getDashboardStats(req, res) {
    try {
      const now = new Date();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);

      const yesterdayEnd = new Date(todayEnd);
      yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      let todayRevenue = 0;
      let yesterdayRevenue = 0;
      let percentageChange = 0;


      const revenueTodayVerifiedAgg = await BookOrderModel.aggregate([
        {
          $match: {
            paymentDate: { $gte: todayStart, $lte: todayEnd },
            paymentStatus: PAYMENT_ORDER_STATUS.PAID,
            isVerified: true
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" }
          }
        }
      ]);
      
      const revenueTodayVerified = revenueTodayVerifiedAgg[0]?.total || 0;

      const revenueComparisonAgg = await BookOrderModel.aggregate([
        {
          $match: {
            paymentDate: { $gte: yesterdayStart, $lte: todayEnd },
            paymentStatus: PAYMENT_ORDER_STATUS.PAID,
            isVerified: true
          }
        },
        {
          $project: {
            amount: 1,
            period: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$paymentDate", todayStart] },
                    { $lte: ["$paymentDate", todayEnd] }
                  ]
                },
                "today",
                "yesterday"
              ]
            }
          }
        },
        {
          $group: {
            _id: "$period",
            total: { $sum: "$amount" }
          }
        }
      ]);

      revenueComparisonAgg.forEach(item => {
        if (item._id === "today") todayRevenue = item.total;
        if (item._id === "yesterday") yesterdayRevenue = item.total;
      });

      if (yesterdayRevenue === 0) {
        percentageChange = todayRevenue > 0 ? 100 : 0;
      } else {
        percentageChange =
          ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;
      }

    //   const revenueTodayVerified = todayRevenue;

      const revenueTodayChange = Number(percentageChange.toFixed(2));


      const activities = await ActivityModel.find()
        .sort({ createdAt: -1 })
        .limit(10);

      const totalActiveOrders = await BookOrderModel.countDocuments({
        "stage.status": { $ne: ORDER_STATUS.DELIVERED },
      });

      const avgProcessingTimeAgg = await BookOrderModel.aggregate([
        {
          $match: {
            "stage.status": ORDER_STATUS.DELIVERED,
          },
        },
        {
          $project: {
            processingTime: {
              $subtract: ["$updatedAt", "$createdAt"],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: "$processingTime" },
          },
        },
      ]);

      const avgProcessingTime = avgProcessingTimeAgg[0]?.avgTime || 0;

      const overdueOrders = await BookOrderModel.countDocuments({
        deliveryDate: { $lt: now },
        "stage.status": { $ne: ORDER_STATUS.DELIVERED },
      });

      const dueToday = await BookOrderModel.countDocuments({
        deliveryDate: { $gte: todayStart, $lte: todayEnd },
        "stage.status": { $ne: ORDER_STATUS.DELIVERED },
      });

      const bottleneckAgg = await BookOrderModel.aggregate([
        {
          $match: {
            "stage.status": { $ne: ORDER_STATUS.DELIVERED },
          },
        },
        {
          $group: {
            _id: "$stage.status",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]);

      const bottleNeckStation = bottleneckAgg[0] || null;

      const readyAndWaiting = await BookOrderModel.countDocuments({
        "stage.status": ORDER_STATUS.READY,
        "dispatchDetails.delivery.status": { $ne: DELIVERY_STATUS.DELIVERED },
      });

      const pendingPayment = await BookOrderModel.countDocuments({
        paymentStatus: PAYMENT_ORDER_STATUS.PENDING,
      });

      const activeHolds = await BookOrderModel.countDocuments({
        "stage.status": ORDER_STATUS.HOLD,
      });

      const overdueHolds = await BookOrderModel.countDocuments({
        "stage.status": ORDER_STATUS.HOLD,
        deliveryDate: { $lt: now },
      });

      const deliveryIssues = await BookOrderModel.countDocuments({
        "stage.status": ORDER_STATUS.OUT_FOR_DELIVERY,
        // deliveryDate: { $lt: now }
        "dispatchDetails.delivery.status": DELIVERY_STATUS.FAILED,
      });

      const avgCostPerItem7DaysAgg = await BookOrderModel.aggregate([
        {
          $match: {
            paymentDate: { $gte: sevenDaysAgo, $lte: todayEnd },
            paymentStatus: PAYMENT_ORDER_STATUS.PAID
          }
        },
        {
          $unwind: "$items"
        },
        {
          $group: {
            _id: {
              day: { $dayOfMonth: "$paymentDate" },
              month: { $month: "$paymentDate" },
              year: { $year: "$paymentDate" }
            },
            dailyRevenue: { $sum: "$amount" },
            dailyItems: { $sum: "$items.quantity" }
          }
        },
        {
          $project: {
            dailyCostPerItem: {
              $cond: [
                { $eq: ["$dailyItems", 0] },
                0,
                { $divide: ["$dailyRevenue", "$dailyItems"] }
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            avgCostPerItem: { $avg: "$dailyCostPerItem" }
          }
        }
      ]);
      
      const avgCostPerItem7Days = avgCostPerItem7DaysAgg[0]?.avgCostPerItem || 0;

      const totalSubscribers = await SubscriptionModel.countDocuments({ status: "active" });

      const monthlyRevenueAgg = await SubscriptionModel.aggregate([
        {
          $match: {
            status: "active", // or include expired/cancelled if needed
            lastPaymentAt: { $ne: null }
          }
        },
        {
          $lookup: {
            from: "plans", // collection name (important: lowercase plural)
            localField: "planId",
            foreignField: "_id",
            as: "plan"
          }
        },
        {
          $unwind: "$plan"
        },
        {
          $group: {
            _id: {
              year: { $year: "$lastPaymentAt" },
              month: { $month: "$lastPaymentAt" }
            },
            totalRevenue: { $sum: "$plan.price" },
            totalSubscriptions: { $sum: 1 }
          }
        },
        {
          $sort: {
            "_id.year": -1,
            "_id.month": -1
          }
        }
      ]);
    //   monthlyRevenueAgg = [           ///sample docs
    //     {
    //       "_id": { "year": 2026, "month": 4 },
    //       "totalRevenue": 250000,
    //       "totalSubscriptions": 120
    //     }
    //   ]

    const planDistributionAgg = await SubscriptionModel.aggregate([
        {
          $match: {
            status: "active"
          }
        },
        {
          $group: {
            _id: "$planId",
            count: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: "plans",
            localField: "_id",
            foreignField: "_id",
            as: "plan"
          }
        },
        {
          $unwind: "$plan"
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$count" },
            plans: {
              $push: {
                planId: "$_id",
                title: "$plan.title",
                count: "$count"
              }
            }
          }
        },
        {
          $unwind: "$plans"
        },
        {
          $project: {
            _id: 0,
            planId: "$plans.planId",
            title: "$plans.title",
            count: "$plans.count",
            percentage: {
              $multiply: [
                { $divide: ["$plans.count", "$total"] },
                100
              ]
            }
          }
        },
        {
          $sort: { percentage: -1 }
        }
      ]);

    //   const planDistributionAgg = [         //sample docs
    //     {
    //       "planId": "abc123",
    //       "title": "Premium",
    //       "count": 80,
    //       "percentage": 66.67
    //     },
    //     {
    //       "planId": "xyz456",
    //       "title": "Standard",
    //       "count": 40,
    //       "percentage": 33.33
    //     }
    //   ]

      const response = {};
      response["totalActiveOrders"] = totalActiveOrders;
      response["revenueTodayVerified"] = revenueTodayVerified;
      response["avgProcessingTime"] = avgProcessingTime;
      response["overdueOrders"] = overdueOrders;
      response["dueToday"] = dueToday;
      response["bottleNeckStation"] = bottleNeckStation;
      response["readyAndWaiting"] = readyAndWaiting;
      response["pendingPayment"] = pendingPayment;
      response["activeHolds"] = activeHolds;
      response["overdueHolds"] = overdueHolds;
      response["deliveryIssues"] = deliveryIssues;
      response["activities"] = activities;
      response["avgCostPerItem7Days"] = avgCostPerItem7Days;
      response["revenueTodayVerified"] = revenueTodayVerified;
      response["revenueTodayChange"] = revenueTodayChange;
      response["totalSubscribers"] = totalSubscribers;
      response["monthlyRevenueAgg"] = monthlyRevenueAgg;
      response["planDistributionAgg"] = planDistributionAgg;

      return BaseService.sendSuccessResponse({ message: response });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }

  async orderManagement(req, res) {
    try {
      const { type, page = 1, limit = 10 } = req.query;

      const skip = (page - 1) * limit;

      const now = new Date();

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      let filter = {};

      switch (type) {
        case "active":
          filter = {
            "stage.status": { $ne: ORDER_STATUS.DELIVERED },
          };
          break;

        case "overdue":
          filter = {
            deliveryDate: { $lt: now },
            "stage.status": { $ne: ORDER_STATUS.DELIVERED },
          };
          break;

        case "dueToday":
          filter = {
            deliveryDate: { $gte: todayStart, $lte: todayEnd },
            "stage.status": { $ne: ORDER_STATUS.DELIVERED },
          };
          break;

        case "holds":
          filter = {
            "stage.status": ORDER_STATUS.HOLD,
          };
          break;

        case "assignedForDelivery":
          filter = {
            "stage.status": {
              $in: [ORDER_STATUS.OUT_FOR_DELIVERY],
            },
          };
          break;

        case "pendingPayment":
          filter = {
            paymentStatus: PAYMENT_ORDER_STATUS.PENDING,
          };
          break;

        default:
          return BaseService.sendFailedResponse({
            error: "Invalid type supplied",
          });
      }

      const [orders, total] = await Promise.all([
        BookOrderModel.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),

        BookOrderModel.countDocuments(filter),
      ]);

      const response = {
        data: orders,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      };

      return BaseService.sendSuccessResponse({ message: response });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }
  //   async orderManagement(req, res) {
  //     try {
  //       const now = new Date();

  //       const todayStart = new Date();
  //       todayStart.setHours(0, 0, 0, 0);

  //       const todayEnd = new Date();
  //       todayEnd.setHours(23, 59, 59, 999);

  //       const [
  //         totalActiveOrders,
  //         overdueOrders,
  //         dueToday,
  //         activeHolds,
  //         assignedForDelivery,
  //         pendingPayment,
  //       ] = await Promise.all([
  //         // Active Orders (not delivered)
  //         BookOrderModel.find({
  //           "stage.status": { $ne: ORDER_STATUS.DELIVERED },
  //         }),

  //         // Overdue Orders
  //         BookOrderModel.find({
  //           deliveryDate: { $lt: now },
  //           "stage.status": { $ne: ORDER_STATUS.DELIVERED },
  //         }),

  //         // Due Today
  //         // BookOrderModel.find({
  //         //   deliveryDate: { $gte: todayStart, $lte: todayEnd },
  //         //   "stage.status": { $ne: ORDER_STATUS.DELIVERED }
  //         // }),
  //         BookOrderModel.find({
  //           deliveryDate: {
  //             $gte: todayStart,
  //             $lte: todayEnd,
  //           },
  //           "stage.status": { $ne: ORDER_STATUS.DELIVERED },
  //         }),

  //         // Active Holds
  //         BookOrderModel.find({
  //           "stage.status": ORDER_STATUS.HOLD,
  //         }),

  //         // Assigned for Delivery
  //         BookOrderModel.find({
  //           "stage.status": {
  //             $in: [
  //               ORDER_STATUS.OUT_FOR_DELIVERY,
  //               //   ORDER_STATUS.READY
  //             ],
  //           },
  //         }),

  //         // Pending Payment
  //         BookOrderModel.find({
  //           paymentStatus: PAYMENT_ORDER_STATUS.PENDING,
  //         }),
  //       ]);

  //       const response = {
  //         totalActiveOrders,
  //         overdueOrders,
  //         dueToday,
  //         activeHolds,
  //         assignedForDelivery,
  //         pendingPayment,
  //       };

  //       return BaseService.sendSuccessResponse({ message: response });
  //     } catch (error) {
  //       console.log(error);
  //       return BaseService.sendFailedResponse({
  //         error: "Something went wrong. Please try again later.",
  //       });
  //     }
  //   }

  async getOrderDetails(req, res) {
    try {
      const { orderId } = req.params;
      if (!orderId) {
        return BaseService.sendFailedResponse({
          error: "Order ID is required",
        });
      }

      const order = await BookOrderModel.findById(orderId);

      if (!order) {
        return BaseService.sendFailedResponse({
          error: "Order not found",
        });
      }

      return BaseService.sendSuccessResponse({ message: order });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }
  async getPaymentVerificationQueue(req, res) {
    try {
      const result = await paginate(
        PaymentModel,
        {},
        {
          page: req.query.page,
          limit: req.query.limit,
          sort: { createdAt: -1 },
        }
      );
      return BaseService.sendSuccessResponse({ message: result });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }

  async acceptPaymentVerification(req, res) {
    try {
      const { paymentId } = req.params;
      const adminId = req.user.id;
      if (!paymentId) {
        return BaseService.sendFailedResponse({
          error: "Payment ID is required",
        });
      }

      const payment = await PaymentModel.findById(paymentId);

      if (!payment) {
        return BaseService.sendFailedResponse({
          error: "Payment not found",
        });
      }

      if (!payment.status == PAYMENT_ORDER_STATUS.SUCCESS) {
        return BaseService.sendSuccessResponse({
          error: "Payment already resolved as successful",
        });
      }

      payment.status = PAYMENT_ORDER_STATUS.SUCCESS;
      payment.verifiedBy = adminId;
      payment.verifiedAt = new Date();
      await payment.save();

      // If it's an order payment, update the order's payment status
      if (payment.type === "order" && payment.order) {
        await BookOrderModel.findByIdAndUpdate(payment.order, {
          paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
        });
      }

      return BaseService.sendSuccessResponse({
        message: "Payment verified successfully",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }
  async rejectPaymentVerification(req, res) {
    try {
      const { paymentId } = req.params;
      const adminId = req.user.id;
      if (!paymentId) {
        return BaseService.sendFailedResponse({
          error: "Payment ID is required",
        });
      }

      const payment = await PaymentModel.findById(paymentId);

      if (!payment) {
        return BaseService.sendFailedResponse({
          error: "Payment not found",
        });
      }

      if (!payment.status == PAYMENT_ORDER_STATUS.FAILED) {
        return BaseService.sendSuccessResponse({
          error: "Payment already resolved as failed",
        });
      }

      payment.status = PAYMENT_ORDER_STATUS.FAILED;
      payment.verifiedBy = adminId;
      payment.verifiedAt = new Date();
      await payment.save();

      // If it's an order payment, update the order's payment status
      if (payment.type === "order" && payment.order) {
        await BookOrderModel.findByIdAndUpdate(payment.order, {
          paymentStatus: PAYMENT_ORDER_STATUS.FAILED,
        });
      }

      return BaseService.sendSuccessResponse({
        message: "Payment rejected successfully",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }
}

module.exports = AdminService;
