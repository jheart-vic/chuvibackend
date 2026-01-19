const PlanModel = require("../models/plan.model");
const SubscriptionModel = require("../models/subscription.model");
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
        itemPerMonth: "int|required",
        price: "int|required",
        features: "array|required",
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
  async subscribePlan(req) {
    try {
      const { email, planId } = req.body;

      const plan = await PlanModel.findById(planId);
      if (!plan) {
        return BaseService.sendFailedResponse({ error: "Plan not found" });
      }

      const response = await paystackAxios.post("/transaction/initialize", {
        email,
        amount: plan.price * 100,
        plan: plan.paystackPlanCode,
        callback_url: `${process.env.BASE_URL}/success`,
      });

      return BaseService.sendSuccessResponse({ message: response.data });
    } catch (error) {
      console.log("Error in:", error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
  async cancelSubscription(req) {
    try {
      const { subscriptionCode, emailToken } = req.body;

      await paystackAxios.post("/subscription/disable", {
        code: subscriptionCode,
        token: emailToken,
      });

      await SubscriptionModel.findOneAndUpdate(
        { paystackSubscriptionCode: subscriptionCode },
        { status: "cancelled" }
      );

      return BaseService.sendSuccessResponse({ message: response.data });
    } catch (error) {
      console.log("Error in:", error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
  async getCurrentSubscription(req) {
    try {
      const userId = req.user.id

      const userSubscription = await SubscriptionModel.findOne({ userId, status: "active" });

      if (!userSubscription) {
        return BaseService.sendFailedResponse({ error: "No active subscription found" });
      }



      return BaseService.sendSuccessResponse({ message: userSubscription });
    } catch (error) {
      console.log("Error in:", error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
}

module.exports = SubscriptionService;
