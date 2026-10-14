// Client 2026-10-14 (feature 21): "Send a reminder SMS on day 5, two days
// before the deadline." A customer whose renewal failed keeps their unused
// items only if they subscribe to the same plan again within 7 days.
//
// Daily at 10:00 Lagos (node-cron fires on process time, which server.js pins
// to Africa/Lagos). Each failure is reminded ONCE (`renewalReminderSentAt`,
// claimed before sending), only while the deadline is still ahead and there are
// items to keep.
const cron = require('node-cron')
const SubscriptionModel = require('../models/subscription.model')
const UserModel = require('../models/user.model')
const PlanModel = require('../models/plan.model')
const sendSms = require('../util/sendSms')
const { GRACE_MS, renewalReminderSms, unusedItems } = require('../util/subscriptionAccess')
const { startOfDay } = require('../util/lagosDay')

const DAY_MS = 24 * 60 * 60 * 1000

// Review F-96: "day 5" is the 5th CALENDAR day after the failure, in Lagos —
// not 5 × 24 hours, which pushed a failure after 10:00 to day 6, when only
// about a day was left.
const calendarDaysSince = (from, now) => Math.round((startOfDay(now) - startOfDay(from)) / DAY_MS)

async function sendRenewalReminders(now = new Date()) {
    const candidates = await SubscriptionModel.find({
        status: 'failed',
        failedAt: { $lte: new Date(now.getTime() - 4 * DAY_MS), $gt: new Date(now.getTime() - GRACE_MS) },
        renewalReminderSentAt: null,
        remainingItems: { $gt: 0 },
    }).lean()
    const due = candidates.filter((s) => calendarDaysSince(s.failedAt, now) === 5)
    let sent = 0
    for (const sub of due) {
        try {
            const claimed = await SubscriptionModel.updateOne(
                { _id: sub._id, renewalReminderSentAt: null },
                { $set: { renewalReminderSentAt: now } },
            )
            // The number they'd keep: unused, capped at half the plan (F-100).
            const plan = await PlanModel.findById(sub.planId).select('monthlyLimits').lean()
            if (!claimed.modifiedCount || unusedItems(sub, plan?.monthlyLimits) <= 0) continue
            const owner = await UserModel.findById(sub.userId).select('phoneNumber').lean()
            if (owner?.phoneNumber) {
                await sendSms(owner.phoneNumber, renewalReminderSms(sub, plan?.monthlyLimits))
                sent += 1
            }
        } catch (err) {
            console.error(`renewal reminder failed for ${sub._id}:`, err?.message)
        }
    }
    return { due: due.length, sent }
}

cron.schedule('0 10 * * *', async () => {
    try {
        const r = await sendRenewalReminders()
        console.log(`✅ renewal reminders: ${r.sent} sent of ${r.due} due`)
    } catch (err) {
        console.error('renewal reminder cron error:', err)
    }
})

module.exports = { sendRenewalReminders, calendarDaysSince }
