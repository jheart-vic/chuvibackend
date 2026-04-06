const PlanModel = require("../models/plan.model");
const UserModel = require("../models/user.model");
const SubscriptionModel = require("../models/subscription.model");
const validateData = require("../util/validate");
const BaseService = require("./base.service");
const paystackAxios = require("./paystack.client.service");

class SubscriptionService extends BaseService {
  async createPlan(req) {
    try {
      const post = req.body;

      const validateRule = {
        title: "string|required",
        description: "string|required",
        duration: "string|required",
        itemPerMonth: "integer|required",
        price: "integer|required",
        monthlyLimits: "integer|required",
        features: "array|required",
      };

      const validateMessage = {
        required: ":attribute is required",
        integer: ":attribute must be an integer.",
        array: ":attribute must be an array.",
      };

      const validateResult = validateData(post, validateRule, validateMessage);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const planExist = await PlanModel.findOne({
        title: { $regex: `^${post.title}$`, $options: "i" },
      });

      if (planExist) {
        return BaseService.sendFailedResponse({
          error: "Plan title already exists",
        });
      }

      const newPlan = await PlanModel.create(post);

      return BaseService.sendSuccessResponse({
        message: "Plan created successfully",
        data: newPlan,
      });
    } catch (error) {
      console.log("Error in:", error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }

  async updatePlan(req) {
    try {
      const planId = req.params.id;
      const post = req.body;

      const plan = await PlanModel.findById(planId);

      if (!plan) {
        return BaseService.sendFailedResponse({ error: "Plan not found" });
      }

      const updatedPlan = await PlanModel.findByIdAndUpdate(planId, post, {
        new: true,
      });
      return BaseService.sendSuccessResponse({
        message: "Plan updated successfully",
      });
    } catch (error) {
      console.log("Error in:", error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
  async deletePlan(req) {
    try {
      const planId = req.params.id;
      const plan = await PlanModel.findById(planId);

      if (!plan) {
        return BaseService.sendFailedResponse({ error: "Plan not found" });
      }

      await PlanModel.findByIdAndDelete(planId);
      return BaseService.sendSuccessResponse({
        message: "Plan deleted successfully",
      });
    } catch (error) {
      console.log("Error in:", error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
  async getPlans(req) {
    try {
      const plans = await PlanModel.find({});
      return BaseService.sendSuccessResponse({ message: plans });
    } catch (error) {
      console.log("Error in:", error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
  async getPlan(req) {
    try {
      const planId = req.params.id;
      const plan = await PlanModel.findById(planId);

      if (!plan) {
        return BaseService.sendFailedResponse({ error: "Plan not found" });
      }

      return BaseService.sendSuccessResponse({ message: plan });
    } catch (error) {
      console.log("Error in:", error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
  //subscription
  async subscribePlan(req) {
    const userId = req.user.id;
    const planId = req.body.planId;
    if (!planId) {
      return BaseService.sendFailedResponse({
        error: "Please provide a plan id",
      });
    }
    const plan = await PlanModel.findById(planId);
    const user = await UserModel.findById(userId);

    if (!plan) {
      return BaseService.sendFailedResponse({ error: "Plan not found" });
    }

    if (!user) {
      return BaseService.sendFailedResponse({ error: "User not found" });
    }

    const subscription = new SubscriptionModel({
      userId: userId,
      plan: planId,

      remainingItems: plan.monthlyLimits,

      startDate: new Date(),
      // expiresAt: addMonths(new Date(), 1),
    });

    await subscription.save();
    return subscription;
  }
  async cancelSubscription(req) {
    try {
      const userId = req.user.id;

      const subscription = await SubscriptionModel.findOne({
        userId: userId,
        status: "active",
      });

      if (!subscription) {
        return BaseService.sendFailedResponse({
          error: "No active subscription found",
        });
      }

      const sub_code = subscription.subscriptionCode;
      const token = subscription.paystackEmailToken;
      let subscriptionStatus = "";

      try {
        const response = await paystackAxios.get(`/subscription/${sub_code}`);
        const isSubActive = response.data.data.status;

        subscriptionStatus = isSubActive;

        if (isSubActive == "active") {
          const response = await paystackAxios.post("/subscription/disable", {
            code: sub_code,
            token: token,
          });
        }
      } catch (error) {
        const message = error.response.data.message;
        console.log(message, "error from paystack");
        return BaseService.sendFailedResponse({
          error: message || "Something went wrong disabling this subscription",
        });
      }

      await SubscriptionModel.findByIdAndDelete(subscription._id);

      return BaseService.sendSuccessResponse({
        message:
          subscriptionStatus === "active"
            ? "Subscription cancelled Successfully"
            : "You have already cancelled your subscription",
      });
    } catch (error) {
      console.error("Create plan error:", error);
      return BaseService.sendFailedResponse({ error: "Failed to cancel plan" });
    }
  }
  async getCurrentSubscription(req) {
    try {
      const userId = req.user.id;

      const user = await UserModel.findById(userId);
      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const filter = {
        userId: userId,
        status: "active",
        $or: [
          { currentPeriodEnd: { $gt: new Date() } },
          { currentPeriodEnd: { $exists: false } },
        ],
      };

      let subscription = await SubscriptionModel.findOne(filter).populate(
        "planId"
      );


      if (!subscription) {
        return BaseService.sendSuccessResponse({
          message: "No active subscription",
          subscription: null,
        });
      }

      let subscriptionList = [];

      if (user.customerCode) {
        try {
          const paystackSub = await paystackAxios.get(
            `/customer/${user.customerCode}`
          );
          subscriptionList = paystackSub.data.data.subscriptions || [];
        } catch (error) {
          console.log("Error from paystack customer check", error);

          if (error.response?.status === 404) {
            subscriptionList = [];
          } else {
            return BaseService.sendFailedResponse({
              error: "Error occured in getting the subscription status",
            });
          }
        }
      }

      // ✅ Optimized: Parallel fetching instead of sequential loop
      if (subscriptionList.length) {
        const fetchedSubscriptions = await Promise.all(
          subscriptionList.map(async (sub) => {
            try {
              const res = await paystackAxios.get(
                `/subscription/${sub.subscription_code}`
              );
              return res.data.data;
            } catch (err) {
              console.log("Error fetching subscription:", err);
              return null;
            }
          })
        );

        const matchedSub = fetchedSubscriptions.find(
          (sub) =>
            sub && sub.plan?.plan_code === subscription.paystackSubscriptionId
        );

        if (matchedSub && matchedSub.status !== "active") {
          await SubscriptionModel.findByIdAndDelete(subscription._id);
          return BaseService.sendFailedResponse({
            error:
              "Your subscription is no longer active, please subscribe again to continue enjoying our services",
          });
        }

        if (matchedSub) {
          subscription.subscriptionCode = matchedSub.subscription_code;
          subscription.nextPaymentDate = matchedSub.next_payment_date;
          subscription.status = matchedSub.status;
          subscription.paystackEmailToken = matchedSub.email_token;

          await subscription.save(); // ✅ single save
        }
      }

      subscription = subscription.toObject();

      return BaseService.sendSuccessResponse({
        message: "Subscription state retrieved successfully",
        subscription,
      });
    } catch (error) {
      console.log("Error in:", error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }

  async seedPlans(req) {
    try {
      const plans = [
        {
          title: "Student plan",
          description:
            "Perfect for students who want affordable stress-free laundry every week.",
          duration: "monthly",
          price: 12000,
          monthlyLimits: 28,
          interval: "monthly",
          paystackPlanCode: "PLN_ji8eaz56uuog89e",
          features: [
            "28 - 48 hours turnaround",
            "Up to 1 items washed and folded",
            "Eco-friendly detergents",
            "Neatly folder and packaged",
          ],
        },
        {
          title: "Standard plan",
          description:
            "Perfect for individuals and small households who need consistent laundary care.",
          duration: "monthly",
          price: 18000,
          monthlyLimits: 40,
          interval: "monthly",
          paystackPlanCode: "PLN_oj8mwjwivp0txhe",
          features: [
            "Wash, fold and basic ironing",
            "Fresh scent and stain care",
            "Flexible pickup times",
            "Weekly pickup and delivery",
          ],
        },
        {
          title: "Premium plan",
          description:
            "Great for professional, couples and families who want maximum convenience.",
          duration: "monthly",
          price: 12000,
          monthlyLimits: 60,
          interval: "monthly",
          paystackPlanCode: "PLN_ai0qlsa3hnrajzc",
          features: [
            "Full wash and iron service",
            "Express service on request",
            "Priority packaging and handling",
            "Free hanger and delivery shirts",
          ],
        },
        {
          title: "VIP plan",
          description:
            "ideal for executives, large families and customers wh want full premium care.",
          duration: "monthly",
          price: 18000,
          monthlyLimits: 100,
          interval: "monthly",
          paystackPlanCode: "PLN_hds1da4kwf6fhct",
          features: [
            "Flexible unlimited pickups (for very high item limit)",
            "Premium wash and iron for all items",
            "Same-day or next-day delivery",
            "Special handling for delicate fabrics",
          ],
        },
      ];

      // Prevent duplicates
      for (const plan of plans) {
        await PlanModel.updateOne(
          { title: plan.title },
          { $setOnInsert: plan },
          { upsert: true }
        );
      }

      return BaseService.sendSuccessResponse({
        success: true,
        message: "Plans seeded successfully",
      });
    } catch (error) {
      return BaseService.sendFailedResponse({ error: "Failed to seed plans" });
    }
  }
}

module.exports = SubscriptionService;
