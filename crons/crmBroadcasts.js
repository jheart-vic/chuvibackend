const cron = require('node-cron')
const CrmService = require('../services/crm.service')

// Daily at 09:00: send marketing broadcasts to list members who are due —
// prospect list every `prospectBroadcastDays` (default 14), churn list every
// `churnBroadcastDays` (default 30). Per-profile lastSentAt enforces spacing.
cron.schedule('0 9 * * *', async () => {
    try {
        const sent = await CrmService.runBroadcasts()
        if (sent > 0) {
            console.log(`✅ CRM broadcasts sent to ${sent} profile(s)`)
        }
    } catch (err) {
        console.error('CRM broadcast cron error:', err)
    }
})
