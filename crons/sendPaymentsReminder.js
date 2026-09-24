const cron = require("node-cron");
const SubscriptionModel = require("../models/subscription.model");
const PlanModel = require("../models/plan.model");
const sendEmail = require('../util/emailService')

// 10:00 LAGOS TIME. server.js pins the process to Africa/Lagos and node-cron
// fires on process local time, so the hour here is Lagos wall-clock.
//
// Emails each expired subscriber ONCE, inviting them to renew. The send-once
// guard is `expiryReminderSentAt`: without it this query ("every subscription
// with status expired") would mail the same people every single day forever,
// because expired subscriptions are never removed.
cron.schedule("0 10 * * *", async () => {
  try {
    const expired = await SubscriptionModel.find({
      status: "expired",
      expiryReminderSentAt: { $exists: false },
    }).populate("planId", "name");

    if (!expired.length) return;

    let sent = 0;
    for (const sub of expired) {
      // The subscription carries its own required `email`, so there is nothing
      // to populate from the user. (The previous version populated "user",
      // which is not a field on this schema — `userId` is — so it threw on the
      // first record and the catch below swallowed it every night.)
      if (!sub.email) {
        console.warn(`⚠️ Subscription ${sub._id} has no email — skipped`);
        continue;
      }

      const planName = sub.planId?.name ? ` ${sub.planId.name}` : "";

      // sendEmail requires `html` and ignores `text` — it returns false and logs
      // "Missing email fields" without it.
      const ok = await sendEmail({
        to: sub.email,
        subject: "Your Chuvi laundry plan has expired",
        html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;">
        <h2 style="color: #1A73E8;">Your${planName} plan has expired</h2>
        <p>Your laundry plan has come to an end, so your monthly items and free
        pickups are no longer available.</p>
        <p>Renew in the Chuvi app to pick up where you left off.</p>
        <p style="margin-top: 24px; color: #777; font-size: 13px;">
          If you have already renewed, you can ignore this message.
        </p>
      </div>`,
      });

      // Only mark it sent when the send actually succeeded, so a transient
      // provider failure is retried tomorrow rather than silently dropped.
      if (ok !== false) {
        sub.expiryReminderSentAt = new Date();
        await sub.save();
        sent++;
      }
    }

    if (sent > 0) console.log(`✅ Expiry reminder emailed to ${sent} subscriber(s)`);
  } catch (err) {
    console.error("Reminder cron error:", err);
  }
});
