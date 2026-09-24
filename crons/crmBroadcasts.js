const cron = require('node-cron')
const CrmService = require('../services/crm.service')

// Daily at 10:00 LAGOS TIME: send marketing broadcasts to list members who are
// due — prospect list every `prospectBroadcastDays` (default 14), churn list
// every `churnBroadcastDays` (default 30). Per-profile lastSentAt enforces
// spacing.
//
// This read '0 9' while the process ran in UTC, which landed at 10:00 Lagos —
// the intended send time, by accident. server.js now pins the process to
// Africa/Lagos, so the hour is stated directly. node-cron fires on process
// local time, so this is 10:00 WAT.
cron.schedule('0 10 * * *', async () => {
    try {
        const sent = await CrmService.runBroadcasts()
        if (sent > 0) {
            console.log(`✅ CRM broadcasts sent to ${sent} profile(s)`)
        }
    } catch (err) {
        console.error('CRM broadcast cron error:', err)
    }
})
