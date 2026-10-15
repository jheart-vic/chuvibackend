// V1 launch batch 3 (B34): at the set hour (default 3 PM, Lagos), alert admin to
// every order due today that has not reached QC. Runs hourly; acts once a day.
const cron = require('node-cron')
const { runDueTodayAlert } = require('../util/dueTodayCheck')

cron.schedule('0 * * * *', async () => {
    try {
        const r = await runDueTodayAlert()
        if (r.ran) console.log(`[dueTodayCheck] ${r.count} order(s) due today not at QC`)
    } catch (err) {
        console.error('[dueTodayCheck] failed:', err?.message)
    }
})

console.log('[dueTodayCheck] scheduled hourly (Lagos time)')
