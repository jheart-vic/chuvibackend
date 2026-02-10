const crypto = require("crypto");
const UserModel = require("../models/user.model.js");
const axios = require("axios");
const PaymentModel = require("../models/payment.model.js");
const WalletTransactionModel = require("../models/walletTransaction.model.js");
const WalletModel = require("../models/wallet.model.js");
const PlanModel = require("../models/plan.model.js");
const SubscriptionModel = require("../models/subscription.model.js");
const handlePaystackEvent = require("./webhook.handler.js");


const webhookFunction = async (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers["x-paystack-signature"];

  // ✅ Ensure raw body for signature verification (middleware must provide rawBody)
  const hash = crypto
    .createHmac("sha512", secret)
    .update(req.body) // raw body, not parsed JSON
    // .update(req.rawBody) // raw body, not parsed JSON
    .digest("hex");

  console.log("called webhook1....")
  if (hash !== signature) {
    return res.status(401).send("Unauthorized: Invalid signature");
  }
  console.log("called webhook2....")


  try {
    // const event = req.body;
    const event = JSON.parse(req.body.toString());
  console.log("called webhook3....")

    if (!event || !event.event || !event.data) {
      console.warn("Received malformed or test webhook:", event);
      return res.sendStatus(200); // Accept it silently so Paystack doesn't retry
    }

  console.log("called webhook4....")
    handlePaystackEvent(event)

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error processing webhook:", err.message);
    return res.status(500).send("Internal Server Error");
  }
};

module.exports = webhookFunction;
