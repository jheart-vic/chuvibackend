const cron = require('node-cron')
const DispatchAlertService = require('../services/dispatchAlert.service')

// Every 5 minutes: flag paid pickups / ready deliveries left without a rider.
cron.schedule('*/5 * * * *', async () => {
    try {
        const { alerted, escalated } = await DispatchAlertService.sweep()
        if (alerted || escalated) {
            console.log(
                `✅ Unassigned dispatch sweep: ${alerted} alerted, ${escalated} escalated`,
            )
        }
    } catch (err) {
        console.error('Unassigned dispatch cron error:', err)
    }
})
