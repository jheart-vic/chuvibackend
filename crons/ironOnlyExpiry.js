// V1 batch 3 part 2 (R8): every 5 minutes, an unpaid "looks dirty" wash link past
// its time (setting ironOnlyAnswerMinutes, 3 hours) is cancelled and the piece is
// pressed as booked; a paid one is settled (safety net for every payment path).
const cron = require('node-cron')

cron.schedule('*/5 * * * *', async () => {
    try {
        const { expireDue } = require('../util/ironOnlyUpgrade')
        const r = await expireDue()
        if (r.expired) console.log(`Iron Only links expired: ${r.expired}`)
    } catch (err) {
        console.error('iron only expiry failed:', err?.message)
    }
})
