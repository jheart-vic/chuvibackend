const crypto = require("crypto");
const { handleSubscriptionDisable, handleSubscriptionCreate, handleChargeSuccess, handleInvoiceFailed } = require("./webhook.handler");

const webhookFunction = async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers["x-paystack-signature"];

  // ✅ Ensure raw body for signature verification (middleware must provide rawBody)
  const hash = crypto
    .createHmac("sha512", secret)
    .update(req.body) // raw body, not parsed JSON
    // .update(req.rawBody) // raw body, not parsed JSON
    .digest("hex");

  if (hash !== signature) {
    return res.status(401).send("Unauthorized: Invalid signature");
  }


  try {
    const event = JSON.parse(req.body.toString());
    if (!event?.event || !event?.data) return res.sendStatus(200);

    switch (event.event) {
      case "charge.success":
        console.log("📩 Paystack webhook 2");
        await handleChargeSuccess(event.data);
        break;

      case "subscription.create":
        console.log("📩 Paystack webhook 3: subscription.create");
        await handleSubscriptionCreate(event.data);
        break;

      case "invoice.payment_failed":
        console.log("📩 Paystack webhook 4");
        await handleInvoiceFailed(event.data);
        break;

      case "subscription.disable":
        console.log("📩 Paystack webhook 5");
        await handleSubscriptionDisable(event.data);
        break;

      default:
        break;
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(500);
  }
};

module.exports = webhookFunction;
