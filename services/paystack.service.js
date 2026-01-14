const SubscriptionModel = require("../models/subscription.model");
const UserModel = require("../models/user.model");
// const connectRedis = require("../util/cache");
const validateData = require("../util/validate");
const BaseService = require("./base.service");
const axios = require("axios");
const paystackAxios = require("./paystack.client.service");

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
        // type: "string|required",
        orderId: "string|required",
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

      const { email, amount } = post;

      //   if(isUserSubscribed?.status && isUserSubscribed?.data.length > 0){
      //     return BaseService.sendFailedResponse({error: 'You are already subscribed to this plan'})
      //   }

      const response = await paystackAxios.post(
        "/transaction/initialize",
        {
          email,
          amount, // e.g. 4500000 for ₦45,000.00
          metadata: {
            userId,
            type: "order_payment",
            orderId: post.orderId,
            paymentMethod,
          }, // VERY helpful for mapping webhooks -> user
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
  async checkIfCustomerHasSubscription(customerCode, paystackSubscriptionId) {
    try {
      const response = await axios.get(
        // `https://api.paystack.co/subscription?customer=${customerCode}`,
        `https://api.paystack.co/subscription`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          },
          // params: {
          //   customer: customerCode,  // Pass customerCode to filter subscriptions
          // },
        }
      );
      function hasActiveSubscription(subscriptions, customerCode) {
        return subscriptions.some(
          (sub) =>
            sub.customer.customer_code === customerCode &&
            sub.status === "active"
        );
      }

      const userHasSub = hasActiveSubscription(
        response.data.data,
        customerCode
      );

      return userHasSub;
    } catch (error) {
      console.error("Error checking subscription status:", error);
      return false; // If there's an error, assume no active subscription
    }
  }
  async disableSubscription(paystackSubscriptionId, token) {
    const resp = await paystackAxios.post(
      "/subscription/disable",
      {
        code: paystackSubscriptionId,
        token,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    return resp.data;
  }
  isInputEmail(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(input.trim());
  }
}

module.exports = PaystackService;
