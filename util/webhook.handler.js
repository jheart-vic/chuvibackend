const SubscriptionModel = require("../models/subscription.model");
const UserModel = require('../models/user.model')
const PaymentModel = require('../models/payment.model')
const { addMonths } = require("./helper");
const BookOrderModel = require("../models/bookOrder.model");
const NotificationModel = require("../models/notification.model");
const { NOTIFICATION_TYPE } = require("./constants");
const PlanModel = require("../models/plan.model");

async function handleChargeSuccess(data) {
  try {
    // console.log({ data }, "handleChargeSuccess");
    const metadata = data.metadata || {};
    const reference = data.reference;
    const userEmail = data.customer?.email;

    if (!userEmail) {
      console.log("No user email in charge.success");
      return;
    }

    // 1️⃣ Find user
    const user = await UserModel.findOne({ email: userEmail });
    if (!user) {
      console.log("User not found for email:", userEmail);
      return;
    }

    // 2️⃣ Prevent duplicate payments
    const existingPayment = await PaymentModel.findOne({ reference });
    if (existingPayment) {
      console.log("Payment already recorded:", reference);
      return;
    }

    // 3️⃣ Save payment
    await PaymentModel.create({
      user: user._id,
      amount: data.amount / 100,
      reference,
      status: "success",
      type: metadata.transactionType,
      channel: data.channel,
      paidAt: new Date(data.paid_at),
      metadata,
    });

    // ==========================
    // 🛒 ORDER PAYMENT FLOW
    // ==========================
    if (metadata.transactionType === "order") {
      await handleOrderPayment(metadata, reference);
      return;
    }

    if (metadata.transactionType === "subscription") {
      if (!data.subscription) {
        await handleNormalSubscription(data, user);
        return;
      }

      const subscriptionCode = data.subscription.subscription_code;

      let subscription = await SubscriptionModel.findOne({
        subscriptionCode,
      });

      // 4️⃣ Create subscription if it doesn't exist
      // if (!subscription) {
      //   console.log("Creating new subscription");

      //   subscription = await SubscriptionModel.create({
      //     userId: metadata.payerId || user._id,
      //     planId: metadata.planId,
      //     status: "active",
      //     startDate: new Date(data.paid_at),
      //     subscriptionCode: subscriptionCode,
      //     paystackSubscriptionId: data.subscription.id,
      //     lastPaymentAt: new Date(data.paid_at),
      //     currentPeriodEnd: new Date(data.subscription.next_payment_date),
      //     nextPaymentDate: new Date(data.subscription.next_payment_date),
      //   });

      //   return;
      // }

      // subscription.status = "active";
      // subscription.lastPaymentAt = new Date(data.paid_at);
      // subscription.currentPeriodEnd = new Date(
      //   data.subscription.next_payment_date
      // );
      // subscription.nextPaymentDate = new Date(
      //   data.subscription.next_payment_date
      // );

      // await subscription.save();
    }
  } catch (error) {
    console.error("Error in handleChargeSuccess:", error);
  }
}

async function handlePaymentFailed(data) {
  try {
    if (!data.subscription) return;

    await SubscriptionModel.findOneAndUpdate(
      { subscriptionCode: data.subscription.subscription_code },
      { status: "failed" }
    );
  } catch (error) {
    console.error("Error in handlePaymentFailed:", error);
    return;
  }
}

async function handleSubscriptionDisable(data) {
  console.log(data, 'handleSubscriptionDisable')
  try {
    await SubscriptionModel.findOneAndDelete(
      { subscriptionCode: data.subscription_code }
    );
  } catch (error) {
    console.error("Error in handleSubscriptionDisable:", error);
    return;
  }
}

async function handleSubscriptionCreate(data) {
  try {
    const email = data.customer.email;
    const planCode = data.plan.plan_code;
    const authorizationCode = data.authorization.authorization_code;
    const customerCode = data.customer.customer_code || ""
    // console.log(data, "handle subscription create");

    const user = await UserModel.findOne({ email });
    if (!user) {
      console.warn(
        "User not found for subscription.create, cannot create subscription",
        data.customer.email
      );
      return;
    }

    const filter = {
      userId: user._id,
      paystackAuthorizationToken: authorizationCode,
      paystackSubscriptionId: planCode,
    };
    user.customerCode = customerCode
    await user.save()

    const subscription = await SubscriptionModel.findOne(filter);
    console.log(
      { paystackSubscriptionCode: planCode, subscription },
      "handleSubscriptionCreate"
    );

    if (subscription) {
      subscription.subscriptionCode = data.subscription_code;
      subscription.paystackSubscriptionId = planCode;
      subscription.paystackEmailToken = data.email_token | ""
      subscription.status = data.status || "active";
      subscription.nextPaymentDate = data.next_payment_date
        ? new Date(data.next_payment_date)
        : null;
      subscription.paystackAuthorizationToken = authorizationCode;

      await subscription.save();
      console.log(
        "✅ Subscription updated with Paystack subscription_code:",
        subscription.subscriptionCode
      );
    } else {
      // console.log(new Date(), "Creating create subscription with start date");
      // await SubscriptionModel.create({
      //   nextPaymentDate: data.next_payment_date,
      //   status: "active",
      //   subscriptionCode: data.subscription_code,
      //   paystackSubscriptionId: data.plan.plan_code,
      //   paystackAuthorizationToken: authorizationCode,
      //   user: user._id,
      //   currentPeriodEnd: new Date(data.next_payment_date),
      // });
    }
  } catch (error) {
    console.error("Error in handleSubscriptionCreate:", error);
  }
}

async function handleInvoiceFailed(data) {
  try {
    if (!data.subscription) return;

    await SubscriptionModel.findOneAndUpdate(
      { subscriptionCode: data.subscription.subscription_code },
      { status: "failed" }
    );
  } catch (error) {
    console.error("Error in handleInvoiceFailed:", error);
    return;
  }
}

async function handleNormalSubscription(data) {
  try {
    const email = data.customer.email;
    const planCode = data.plan.plan_code;
    const authorizationCode = data.authorization.authorization_code;
    const metadata = data.metadata || {};

    const user = await UserModel.findOne({ email });

    if (!user) {
      console.warn(
        "User not found for subscription.create, cannot create subscription",
        data.customer.email
      );
      return;
    }

    const filter = {
      user: user._id,
      paystackSubscriptionId: planCode,
      paystackAuthorizationToken: authorizationCode,
    };

    let subscription = await SubscriptionModel.findOne(filter);
    console.log(
      { paystackSubscriptionCode: planCode, subscription },
      "handleNormalSubscription"
    );

    const planId = metadata.planId
    const paystackId = metadata.paystackPlan

      if(!planId || !paystackId){
        console.warn("No planId in metadata for normal subscription, cannot set limits");
        return;
      }

      const plan = await PlanModel.findOne({paystackPlanCode: paystackId})

    if (!subscription) {
      console.log(
        "Subscription does not exist, creating new subscription from webhook"
      );

      // Optional: fallback values if you have a mapping table or default plan/coach
      console.log(
        new Date(),
        "Creating handle normal subscription with start date"
      );

      const nextPaymentDate = generateNextPaymentDate("monthly");

      

      subscription = await SubscriptionModel.create({
        paystackSubscriptionId: paystackId || null,
        startDate: new Date(data.paid_at),
        planId: planId,
        lastPaymentAt: new Date(data.paid_at),
        userId: user._id,
        paystackAuthorizationToken: authorizationCode,
        status: "active",
        currentPeriodEnd: nextPaymentDate,
        nextPaymentDate: nextPaymentDate,
        remainingItems: plan.monthlyLimits
      });

      return;
    } else {
      subscription.status = "active";
      (subscription.paystackSubscriptionId = paystackPlan || null),
        (subscription.startDate = new Date(data.paid_at)),
        (subscription.planId = planId),
        (subscription.monthlyLimits = plan.monthlyLimits),
        (subscription.userId = user._id),
        (subscription.lastPaymentAt = new Date(data.paid_at));
      await subscription.save();
    }
  } catch (error) {
    console.error("Error in handleNormalSubscription:", error);
  }
}

async function handleOrderPayment(metadata, reference) {
  try {
    const { orderId } = metadata;

    if (!orderId) {
      console.warn("Order payment missing orderId in metadata");
      return;
    }

    const order = await BookOrderModel.findById(orderId);
    if (!order) {
      console.warn(`Order ${orderId} not found`);
      return;
    }

    // 🔒 Idempotency guard
    if (order.paymentStatus === "success") {
      return;
    }

    order.paymentStatus = "success";
    order.reference = reference;
    order.paymentDate = new Date();
    order.paymentMethod = "paystack";

    await order.save();

    // 🔔 Optional notification
    await NotificationModel.create({
      userId: order.userId,
      title: "Payment Successful",
      body: "Your order payment was successful and is being processed.",
      subBody: "Your order payment was successful and is being processed.",
      type: NOTIFICATION_TYPE.PAYMENT_APPROVED
    });
  } catch (error) {
    console.error("Error in handleOrderPayment:", error);
    return;
  }
}

function generateNextPaymentDate(duration, startDate = new Date()) {
  const next = new Date(startDate);

  if (duration === "monthly") next.setMonth(next.getMonth() + 1);
  if (duration === "yearly") next.setFullYear(next.getFullYear() + 1);

  return next.toISOString().replace("Z", "+00:00");
}

module.exports = {
  handleChargeSuccess,
  handlePaymentFailed,
  handleSubscriptionDisable,
  handleSubscriptionCreate,
  handleInvoiceFailed,
};