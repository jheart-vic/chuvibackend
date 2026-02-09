const PlanModel = require("../models/plan.model");
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

      const planExist = await PlanModel.findOne({ title: post.title });

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
  async activateSubscription(userId, planId) {
    const plan = await PlanModel.findById(planId);
    const user = await UserModel.findById(userId);

    const subscription = new SubscriptionModel({
      userId: userId,
      plan: planId,

      remainingItems: plan.monthlyLimits,

      startDate: new Date(),
      expiresAt: addMonths(new Date(), 1),
    });

    await subscription.save();
    return subscription;
  }
  async upgradeSubscription(sub, newPlan) {
    // Disable old
    await disableSubscription(sub);

    // Create new
    const res = await createSubscription(
      sub.paystackCustomerCode,
      newPlan.paystackPlanCode
    );

    // Update DB
    sub.plan = newPlan._id;

    sub.paystackSubscriptionCode = res.subscription_code;
    sub.paystackEmailToken = res.email_token;

    sub.remainingItems = newPlan.monthlyLimits;

    await sub.save();
  }
  async requestDowngrade(userId, newPlanId) {
    const sub = await UserSubscription.findOne({ user: userId });

    sub.pendingPlan = newPlanId;

    await sub.save();
  }
  async applyDowngrade(sub) {
    const newPlan = await SubscriptionPlan.findById(sub.pendingPlan);

    await disableSubscription(sub);

    const res = await createSubscription(
      sub.paystackCustomerCode,
      newPlan.paystackPlanCode
    );

    sub.plan = newPlan._id;
    sub.pendingPlan = null;

    sub.paystackSubscriptionCode = res.subscription_code;
    sub.paystackEmailToken = res.email_token;

    sub.remainingItems = newPlan.monthlyLimits;

    await sub.save();
  }
  async cancelSubscription(userId) {
    const sub = await UserSubscription.findOne({ user: userId });

    await disableSubscription(sub);

    sub.status = "cancelled";

    await sub.save();
  }

  async getCurrentSubscription(req) {
    try {
      const userId = req.user.id;

      const userSubscription = await SubscriptionModel.findOne({
        userId,
        status: "active",
      });

      if (!userSubscription) {
        return BaseService.sendFailedResponse({
          error: "No active subscription found",
        });
      }

      return BaseService.sendSuccessResponse({ message: userSubscription });
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
          description: "Great for professional, couples and families who want maximum convenience.",
          duration: "monthly",
          price: 12000,
          monthlyLimits: 60,
          interval: "monthly",
          paystackPlanCode: "PLN_ai0qlsa3hnrajzc",
          features: [
            "Full wash and iron service",
            "Express service on request",
            "Priority packaging and handling",
            "Free hanger and delivery shirts"
          ],
        },
        {
          title: "VIP plan",
          description: "ideal for executives, large families and customers wh want full premium care.",
          duration: "monthly",
          price: 18000,
          monthlyLimits: 100,
          interval: "monthly",
          paystackPlanCode: "PLN_hds1da4kwf6fhct",
          features: [
            "Flexible unlimited pickups (for very high item limit)",
            "Premium wash and iron for all items",
            "Same-day or next-day delivery",
            "Special handling for delicate fabrics"
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
