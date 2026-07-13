const cron = require('node-cron')
const CrmService = require('../services/crm.service')

// Every 5 minutes: send/execute all due CRM follow-ups (lead reminders,
// post-delivery messages, reactivation messages, internal state changes).
cron.schedule('*/5 * * * *', async () => {
    try {
        const processed = await CrmService.dispatchDueMessages()
        if (processed > 0) {
            console.log(`✅ CRM dispatcher processed ${processed} message(s)`)
        }
    } catch (err) {
        console.error('CRM dispatcher cron error:', err)
    }
})
