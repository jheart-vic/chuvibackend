
const UserModel = require("../models/user.model");
// const connectRedis = require("../util/cache");
const validateData = require("../util/validate");
const BaseService = require("./base.service");
const axios = require("axios");
const paystackAxios = require("./paystack.client.service");
const SubscriptionModel = require("../models/subscription.model");
const PlanModel = require("../models/plan.model");
const BookOrderModel = require("../models/bookOrder.model");
const { generateReferenceId, getObjectId } = require("../util/helper");
const PaymentModel = require("../models/payment.model");
const createAuditLog = require("../util/createAuditLog");
const { orderPayableGate, amountDue } = require("../util/paymentGate");


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
        // Already paid: no checkout, or the money would be taken with nothing
        // to credit it against (F-34).
        if(order.paymentStatus === 'success'){
          return BaseService.sendFailedResponse({error: 'This order has already been paid.'})
        }
        // A Quick Booking has no bill until Intake counts (review F-24).
        const payable = orderPayableGate(order)
        if(!payable.ok){
          return BaseService.sendFailedResponse({error: payable.error})
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

        subExists = await SubscriptionModel.findOne({userId, status: 'active'})

        if(subExists && subExists.status == 'active'){
            return BaseService.sendFailedResponse({error: 'You are already subscribed. Please cancel your current subscription to subscribe to a new plan'})
        }
      }

      // V1 launch batch 2 (B13, T2.14): "Reward credit applied by default
      // unless he switches it off." Credit goes first (oldest expiry), and the
      // card is asked only for the rest. Applied to THIS order, so a later
      // cancellation gives it back. Send useCredit: false to keep it.
      if (transactionType === 'order' && String(order.userId) === String(userId)) {
        const optOut = post.useCredit === false || post.useCredit === 'false'
        // Review 15 Oct (P1): once per order — a double tap must not spend twice.
        const claimed = optOut
          ? null
          : await BookOrderModel.updateOne(
              { _id: order._id, creditPaidAtPay: { $exists: false }, paymentStatus: { $ne: 'success' } },
              { $set: { creditPaidAtPay: 0 } },
            )
        if (claimed?.modifiedCount) {
          const WalletCreditService = require('./walletCredit.service')
          const due = amountDue(order)
          const { applied } = await WalletCreditService.applyCreditsToAmount(userId, order._id, due, `Order ${order.oscNumber}`)
          await BookOrderModel.updateOne({ _id: order._id }, { $set: { creditPaidAtPay: applied || 0 } })
          if (applied > 0) {
            const left = Math.max(0, due - applied)
            if (left <= 0) {
              await BookOrderModel.updateOne(
                { _id: order._id },
                { $set: { paymentStatus: 'success', paymentDate: new Date(), paymentMethod: 'wallet', billingType: 'pay-from-wallet' }, $unset: { balanceDue: '' } },
              )
              try {
                const PaymentHoldService = require('./paymentHold.service')
                await PaymentHoldService.clear({ orderId: order._id, source: 'reward-credit', actorId: userId })
                // Review 15 Oct (P1): the same follow-ups as a card payment.
                const fresh = await BookOrderModel.findById(order._id)
                await require('../util/urgentPickup').markUrgentPickupIfReady(fresh)
                await require('../util/orderSms').bookingReceived(fresh)
                await require('../util/redeliveryFee').markRedeliveryFeesPaid(order._id).catch(() => {})
                await require('../util/ironOnlyUpgrade').settleIfPaid(order._id)
                await require('../util/readyDateRecalc').afterQuickBookingPaid(order._id)
              } catch (e) {
                console.error('credit-paid order follow-up failed:', e?.message)
              }
              return BaseService.sendSuccessResponse({
                message: { coveredByCredit: true, creditApplied: applied, amountToPay: 0, orderId: order._id },
              })
            }
            // The rest is a balance on the order, so the link asks only for it.
            await BookOrderModel.updateOne({ _id: order._id }, { $set: { balanceDue: left } })
            order.balanceDue = left
          }
        }
      }

      const reference = generateReferenceId()
      let amount = 0
      // An order pays its outstanding balance when one is set (F-30).
      amount = transactionType === 'subscription' ? plan.price * 100 : amountDue(order) * 100

      if(transactionType == 'order' && orderId){
        const orderPaymentExists = await PaymentModel.findOne({userId, order: orderId})
        // A second payment is right when the bill went up after the first (F-30).
        if(orderPaymentExists && orderPaymentExists.status == 'success' && !(Number(order.balanceDue) > 0)){
          return BaseService.sendFailedResponse({error: "You have already made a payment for this order."})
        }
      }

      await PaymentModel.create({
        userId: userId,
        amount: 0,
        reference,
        status: 'pending',
        ...(subExists && {subscription: subExists?._id}),
        ...(orderId && {order: orderId}),
        type: transactionType,
        ...(transactionType == 'wallet-top-up' && {alertType: 'credit'}),
        // What THIS checkout asked for, recorded server-side: the webhook
        // never credits more than this, and a subscription must match its
        // plan (review F-38/F-39). The event's own metadata is not trusted.
        metadata: {
          expectedAmount: amount / 100,
          ...(plan && { planId: String(plan._id) }),
        },
    })

      // A checkout Paystack refuses must not leave a reusable pending row (F-38).
      const initialize = (url, body) => paystackAxios.post(url, body).catch(async (err) => {
        await PaymentModel.updateOne({ reference }, { $set: { status: 'failed', 'metadata.initRefused': true } }).catch(() => {})
        throw err
      })
      const response = await initialize(
        "/transaction/initialize",
        {
          email,
          amount,
          reference,
          ...(plan && {plan: plan.paystackPlanCode}),
          metadata: {
            userId,
            transactionType: transactionType,
            amount: amount / 100,
            paymentMethod,
            ...(orderId && {orderId: post.orderId}),
            ...(plan && {paystackPlan: plan.paystackPlanCode}),
            ...(plan && {planId: plan._id}),
            // ...(plan && {paystackSubscriptionCode: plan.paystackPlanCode}),
            ...(subExists && {subscriptionId: subExists?._id}),
          },
          // B2 (FE 15 Oct, white screen after Paystack): the page Paystack sends
          // the customer back to is a setting now; that page should call
          // GET /users/check-payment?reference=… to show the result.
          callback_url: process.env.PAYSTACK_CALLBACK_URL || "https://www.chuvilaundry.com/user/payment/callback",
        }
      );
      await createAuditLog({userId: getObjectId(user._id), action: `Initialized ${transactionType} payment with reference ${reference}`, category: 'payment'})

      return BaseService.sendSuccessResponse({ message: response.data });
    } catch (error) {
      console.error("Initialize payment failed:", error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
  /**
   * CHECK PAYMENT (V1 launch batch 2: B9 "Check payment asks Paystack again",
   * B2 the page after Paystack). Asks Paystack for the transaction by its
   * reference — or the latest checkout of an order — and, if Paystack says it
   * succeeded, settles it through the SAME handler the webhook uses (which
   * claims the reference once, so a webhook arriving later does nothing twice).
   * Customers may check only their own payments; staff any.
   */
  async checkPayment(req) {
    try {
      const { reference: ref, orderId } = req.query || {}
      const role = req.user?.userType
      const isStaff = role && role !== 'user'
      let payment = null
      if (ref) payment = await PaymentModel.findOne({ reference: String(ref) }).lean()
      else if (orderId) payment = await PaymentModel.findOne({ order: orderId }).sort({ createdAt: -1 }).lean()
      else return BaseService.sendFailedResponse({ error: 'Send reference or orderId.' })
      if (!payment) return BaseService.sendFailedResponse({ error: 'No payment found for that.' })
      if (!isStaff && String(payment.userId) !== String(req.user?.id)) {
        return BaseService.sendFailedResponse({ error: 'No payment found for that.' })
      }
      if (payment.status === 'success') {
        return BaseService.sendSuccessResponse({ message: { reference: payment.reference, status: 'success', alreadySettled: true } })
      }
      const res = await paystackAxios.get(`/transaction/verify/${encodeURIComponent(payment.reference)}`)
      const data = res?.data?.data || {}
      if (data.status === 'success') {
        const { handleChargeSuccess } = require('../util/webhook.handler')
        await handleChargeSuccess(data)
        const after = await PaymentModel.findOne({ reference: payment.reference }).lean()
        return BaseService.sendSuccessResponse({
          message: { reference: payment.reference, status: after?.status || 'success', paystackStatus: 'success', settledNow: true },
        })
      }
      return BaseService.sendSuccessResponse({
        message: { reference: payment.reference, status: payment.status, paystackStatus: data.status || 'unknown' },
      })
    } catch (error) {
      console.error('check payment failed:', error?.response?.data || error?.message)
      return BaseService.sendFailedResponse({ error: 'Could not check this payment with Paystack. Tap to try again.' })
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
