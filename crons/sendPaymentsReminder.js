const cron = require("node-cron");
const SubscriptionModel = require("../models/subscription.model");
import { sendEmail } from "../utils/email.js";

cron.schedule("0 9 * * *", async () => {
  try {
    const expired = await SubscriptionModel
      .find({ status: "expired" })
      .populate("user");

    for (const sub of expired) {
      await sendEmail({
        to: sub.user.email,
        subject: "Subscription Expired",
        text: "Please renew your laundry plan.",
      });
    }

    console.log("✅ Reminder emails sent");
  } catch (err) {
    console.error("Reminder cron error:", err);
  }
});
