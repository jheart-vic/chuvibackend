const cron = require('node-cron')
const RecoveryService = require('../services/recovery.service')

// Hourly: escalate complaint cases past their first-review (24h) or resolution
// (72h) SLA to a manager.
cron.schedule('20 * * * *', async () => {
    try {
        const escalated = await RecoveryService.checkSla()
        if (escalated > 0) {
            console.log(`✅ Complaint SLA sweep escalated ${escalated} case(s)`)
        }
    } catch (err) {
        console.error('Complaint SLA cron error:', err)
    }
})
