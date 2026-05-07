
const UserModel = require("../models/user.model");
// const connectRedis = require("../util/cache");
const validateData = require("../util/validate");
const BaseService = require("./base.service");
const axios = require("axios");
const paystackAxios = require("./paystack.client.service");
const SubscriptionModel = require("../models/subscription.model");
const PlanModel = require("../models/plan.model");
const BookOrderModel = require("../models/bookOrder.model");
const { generateReferenceId } = require("../util/helper");
const PaymentModel = require("../models/payment.model");


class PaystackService extends BaseService {

  async initializePayment(req) {
    try {
      const post = req.body;
      const userId = req.user.id;

      const validateRule = {
        // amount: "integer|required",
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

      const email = user.email

      let plan = null
      let subExists = null

      const { transactionType, orderId, planId } = post;
      let order = null

      if(transactionType === 'order'){
        if(!orderId){
          return BaseService.sendFailedResponse({error: 'Please provide order id'})
        }
        order = await BookOrderModel.findById(orderId)

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

        subExists = await SubscriptionModel.findOne({userId})

        if(subExists && subExists.status == 'active'){
            return BaseService.sendFailedResponse({error: 'You are already subscribed. Please cancel your current subscription to subscribe to a new plan'})
        }
      }

      const reference = generateReferenceId()
      let amount = 0
      amount = transactionType === 'subscription' ? plan.price * 100 : order.amount * 100

      if(transactionType == 'order' && orderId){
        const orderPaymentExists = await PaymentModel.findOne({userId, order: orderId})
        if(orderPaymentExists.status == 'success'){
          return BaseService.sendFailedResponse({error: "You have already made a payment for this order."})
        }
      }

      await PaymentModel.create({
        userId: userId,
        amount: amount,
        reference,
        status: 'pending',
        ...(subExists && {subscription: subExists?._id}),
        ...(orderId && {order: orderId}),
        type: transactionType,
        ...(transactionType == 'wallet-top-up' && {alertType: 'credit'}),
    })


      const response = await paystackAxios.post(
        "/transaction/initialize",
        {
          email,
          amount,
          reference,
          ...(plan && {plan: plan.paystackPlanCode}),
          metadata: {
            userId,
            transactionType: transactionType,
            paymentMethod,
            ...(orderId && {orderId: post.orderId}),
            ...(plan && {paystackPlan: plan.paystackPlanCode}),
            ...(plan && {planId: plan._id}),
            // ...(plan && {paystackSubscriptionCode: plan.paystackPlanCode}),
            ...(subExists && {subscriptionId: subExists?._id}),
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
