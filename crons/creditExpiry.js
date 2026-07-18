const cron = require('node-cron')
const WalletCreditService = require('../services/walletCredit.service')

// Daily at 02:15: expire overdue wallet credits (referral/recovery/promo/
// laundry) and log the unused value as expiry transactions.
cron.schedule('15 2 * * *', async () => {
    try {
        const processed = await WalletCreditService.expireDueCredits()
        if (processed > 0) {
            console.log(`✅ Credit expiry processed ${processed} credit(s)`)
        }
    } catch (err) {
        console.error('Credit expiry cron error:', err)
    }
})
