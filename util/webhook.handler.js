const SubscriptionModel = require("../models/subscription.model");
const { addMonths } = require("./helper");

async function onSubscriptionCreated(data) {
  const { userId } = data.metadata;

  const subCode = data.subscription_code;
  const customerCode = data.customer.customer_code;
  const emailToken = data.email_token;

  await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      paystackCustomerCode: customerCode,
      paystackEmailToken: emailToken,
      paystackSubscriptionCode: data.subscription_code,
      status: "active",
      startDate: new Date(),
      expiresAt: addMonths(new Date(), 1),
    }
  );
}

async function onChargeSuccess(data) {
  // First payment
  if (data.metadata?.transactionType === "subscription") {
    const sub = await SubscriptionModel.findById(data.metadata.subscriptionId);

    sub.paystackSubscriptionCode = data.subscription.subscription_code;

    await sub.save();

    await activateSubscription(sub, data);

    return;
  }

  // Recurring payment
  if (data.subscription?.subscription_code) {
    const sub = await SubscriptionModel.findOne({
      paystackSubscriptionCode: data.subscription.subscription_code,
    });

    if (!sub) return;

    await renewSubscription(sub, data);

    return;
  }

  // Order
  if (data.metadata?.type === "order") {
    await handleOrderPayment(data);
  }
}

// async function onChargeSuccess(data) {
//   const subCode = data.subscription?.subscription_code;

//   if (!subCode) return;

//   const sub = await SubscriptionModel.findOne({
//     paystackSubscriptionCode: subCode,
//   }).populate("plan");

//   if (!sub) return;

//   if (sub.lastPaymentReference === reference) return;

//   // Renew
//   sub.startDate = new Date();
//   sub.expiresAt = addMonths(new Date(), 1);

//   // Reset limits
//   sub.remainingItems = sub.plan.monthlyLimits;

//   sub.status = "active";

//   await sub.save();

//   // First payment
//   if (data.metadata?.type === "subscription") {
//     const sub = await Subscription.findById(data.metadata.subscriptionId);

//     sub.paystackSubscriptionCode = data.subscription.subscription_code;

//     await sub.save();

//     await activateSubscription(sub, data);

//     return;
//   }

//   // Recurring payment
//   if (data.subscription?.subscription_code) {
//     const sub = await Subscription.findOne({
//       paystackSubscriptionCode: data.subscription.subscription_code,
//     });

//     if (!sub) return;

//     await renewSubscription(sub, data);

//     return;
//   }

//   // Order
//   if (data.metadata?.type === "order") {
//     //   await handleOrderPayment(data);
//   }
// }

async function onPaymentFailed(data) {
  const subCode = data.subscription?.subscription_code;

  if (!subCode) return;

  await SubscriptionModel.updateOne(
    { paystackSubscriptionCode: subCode },
    { status: "expired" }
  );
}

async function onSubscriptionDisabled(data) {
  const subCode = data.subscription_code;

  await SubscriptionModel.updateOne(
    { paystackSubscriptionCode: subCode },
    { status: "cancelled" }
  );
}

async function onSubscriptionExpired(data) {
  const subCode = data.subscription_code;

  await SubscriptionModel.updateOne(
    { paystackSubscriptionCode: subCode },
    { status: "expired" }
  );
}

async function activateSubscription(sub, data) {
  // Prevent double activation
  if (sub.status === "active") return;

  // Save Paystack IDs
  sub.paystackSubscriptionCode = data.subscription.subscription_code;

  sub.paystackEmailToken = data.subscription.email_token;

  sub.paystackCustomerCode = data.customer?.customer_code;

  // Billing cycle
  const start = new Date();

  sub.status = "active";
  sub.startDate = start;
  sub.expiresAt = addMonths(start, 1);

  // Reset laundry limits
  sub.remainingItems = sub.plan.monthlyLimits;

  // Payment tracking
  sub.lastPaymentReference = data.reference;
  sub.lastPaidAt = new Date(data.paid_at);

  await sub.save();
}

async function renewSubscription(sub, data) {
  // Idempotency (no double credit)
  if (sub.lastPaymentReference === data.reference) {
    return;
  }

  const now = new Date();

  // If expired before payment (grace case)
  if (!sub.expiresAt || sub.expiresAt < now) {
    sub.expiresAt = addMonths(now, 1);
  } else {
    // Normal renewal
    sub.expiresAt = addMonths(sub.expiresAt, 1);
  }

  // Reset laundry limits
  sub.remainingItems = sub.plan.monthlyLimits;

  // Reactivate
  sub.status = "active";

  // Save billing info
  sub.lastPaymentReference = data.reference;
  sub.lastPaidAt = new Date(data.paid_at);

  await sub.save();
}

async function handlePaystackEvent(event) {
  const data = event.data;
  console.log("called webhook5....");

  switch (event.event) {
    case "subscription.create":
      console.log("called subscription.create....");
      await onSubscriptionCreated(data);
      break;

    case "charge.success":
      console.log("called charge.success....");
      await onChargeSuccess(data);
      break;

    case "invoice.payment_failed":
      console.log("called onPaymentFailed....");
      await onPaymentFailed(data);
      break;
      
      case "subscription.disable":
        console.log("called subscription.disabled...");
      await onSubscriptionDisabled(data);
      break;

    case "subscription.not_renew":
      await onSubscriptionExpired(data);
      break;

    default:
      console.log("Unhandled event:", event.event);
  }
}

module.exports = handlePaystackEvent;
