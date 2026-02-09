
const UserModel = require("../models/user.model");
// const connectRedis = require("../util/cache");
const validateData = require("../util/validate");
const BaseService = require("./base.service");
const axios = require("axios");
const paystackAxios = require("./paystack.client.service");
const SubscriptionModel = require("../models/subscription.model");
const PlanModel = require("../models/plan.model");
const BookOrderModel = require("../models/bookOrder.model");

class PaystackService extends BaseService {
//   constructor() {
//     super();
//     this.axiosInstance = axios.create({
//       baseURL: "https://api.paystack.co",
//       headers: {
//         Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
//         "Content-Type": "application/json",
//       },
//     });
//   }

  async initializePayment(req) {
    try {
      const post = req.body;
      const userId = req.user.id;

      const validateRule = {
        email: "string|required",
        amount: "integer|required",
        transactionType: "string|required|in:order,subscription",
        // orderId: "string|required",
      };

      const paymentMethod = "paystack";

      const validateMessage = {
        required: ":attribute is required",
        "string.string": ":attribute must be a string.",
      };

      const validateResult = validateData(post, validateRule, validateMessage);

      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const user = await UserModel.findById(userId);
      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      let plan = null
      let subscription = null

      const { email, amount, transactionType, orderId, planId } = post;

      if(transactionType === 'order'){
        if(!orderId){
          return BaseService.sendFailedResponse({error: 'Please provide order id'})
        }
        const order = await BookOrderModel.findById(orderId)

        if(!order){
          return BaseService.sendFailedResponse({error: 'Order not found'})
        }
      }

      if(transactionType === 'subscription'){
        if(!planId){
          return BaseService.sendFailedResponse({error:'Please provide a plan id'})
        }
        plan = await PlanModel.findById(planId);

        if(!plan){
          return BaseService.sendFailedResponse({error: 'Plan not found'})
        }

        subscription = await SubscriptionModel.create({
          userId: userId,
          plan: planId,
          status: "pending",
          remainingItems: plan.monthlyLimits
        });
      }


      const response = await paystackAxios.post(
        "/transaction/initialize",
        {
          email,
          amount,
          ...(plan && {plan: plan.paystackPlanCode}),
          metadata: {
            userId,
            transactionType: transactionType,
            paymentMethod,
            ...(orderId && {orderId: post.orderId}),
            ...(plan && {plan: plan.paystackPlanCode}),
            ...(subscription && {subscriptionId: subscription?._id}),
          },
          // callback_url: 'https://yourapp.com/pay/callback' // optional
        }
      );

     

      return BaseService.sendSuccessResponse({ message: response.data });
    } catch (error) {
      console.error("Initialize payment failed:", error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
  async createCustomer(user) {
    const res = await paystackAxios.post(
      "/customer",
      {
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
      }
    );
  
    return res.data.data.customer_code;
  }
  async createSubscription(customerCode, planCode) {
    const res = await paystackAxios.post(
      "/subscription",
      {
        customer: customerCode,
        plan: planCode,
      }
    );
  
    return res.data.data;
  }

  async disableSubscription(sub) {
    await paystackAxios.post(
      "/disable",
      {
        code: sub.paystackSubscriptionCode,
        token: sub.paystackEmailToken,
      },
    );
  }
  
  
}

module.exports = PaystackService;
