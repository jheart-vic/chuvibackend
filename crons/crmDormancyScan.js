const cron = require('node-cron')
const CrmService = require('../services/crm.service')

// Daily at 01:30: customers with no order in `dormantDays` (default 30)
// become Dormant and enter the reactivation workflow.
cron.schedule('30 1 * * *', async () => {
    try {
        const count = await CrmService.runDormancyScan()
        console.log(`✅ CRM dormancy scan complete (${count} moved to dormant)`)
    } catch (err) {
        console.error('CRM dormancy cron error:', err)
    }
})
