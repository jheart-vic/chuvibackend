const cron = require('node-cron')
const PaymentHoldService = require('../services/paymentHold.service')

/**
 * Payment-hold reminders — N1 Phase 3: "Reminders at 6h and 24h, admin alerted
 * at 48h."
 *
 * ⚠️ node-cron fires on PROCESS-LOCAL time, and `server.js` pins the process to
 * Africa/Lagos in its first statement, so this expression is Lagos wall-clock.
 * It is a frequency rather than a time of day, so the pin does not change its
 * meaning — but any future change to a specific hour must be written as the
 * intended LAGOS hour.
 *
 * Every 20 minutes rather than hourly: a reminder that is due at 6h should not
 * arrive at 6h59. The sweep is cheap (one indexed query, capped at 500 orders)
 * and each reminder is latched by name, so an extra sweep sends nothing twice.
 *
 * ⚠️ A new cron only runs if it is REQUIRED in `server.js`.
 */
cron.schedule('*/20 * * * *', async () => {
    try {
        const tally = await PaymentHoldService.runReminderSweep()
        if (tally.sent) {
            console.log(
                `[paymentHoldReminders] ${tally.sent} reminder(s) sent from ${tally.considered} open hold(s)`,
                tally.byLatch,
            )
        }
    } catch (error) {
        // Never let a sweep kill the process — the server is live.
        console.error('[paymentHoldReminders] sweep failed:', error?.message)
    }
})

console.log('[paymentHoldReminders] scheduled every 20 minutes (Lagos time)')
