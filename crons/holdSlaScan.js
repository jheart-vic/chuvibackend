const cron = require('node-cron')
const AdminService = require('../services/admin.service')

// Client section B.3 (6 Oct brief reply): "When a hold passes its limit, it
// becomes Overdue and is escalated to the admin."
//
// Overdue itself needs no job — it is computed from the clock every time the
// cards are read, which is what keeps Active and Overdue exact complements
// (item 4.4). What DOES need a job is the escalation: somebody has to be TOLD,
// once, when a hold crosses its line. Without this a payment hold could sit for
// 48 hours and only be noticed if an admin happened to open the Holds screen.
//
// Every 20 minutes rather than hourly: the shortest limit in the system is 2
// hours (same-day operational holds), so an hourly sweep could let a breach sit
// unseen for half its own lifetime.
cron.schedule('*/20 * * * *', async () => {
    try {
        const escalated = await new AdminService().escalateOverdueHolds()
        if (escalated > 0) {
            console.log(`✅ Hold SLA sweep escalated ${escalated} hold(s)`)
        }
    } catch (err) {
        console.error('Hold SLA cron error:', err)
    }
})
