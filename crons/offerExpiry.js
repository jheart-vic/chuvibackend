const cron = require('node-cron')
const OfferService = require('../services/offer.service')

// Daily at 02:45: expire offers past their expiry date and customer-offer
// linkages past their personal use-by window.
cron.schedule('45 2 * * *', async () => {
    try {
        const { offersExpired, linkagesExpired } = await OfferService.expireDue()
        if (offersExpired > 0 || linkagesExpired > 0) {
            console.log(
                `✅ Offer expiry: ${offersExpired} offer(s), ${linkagesExpired} customer offer(s)`,
            )
        }
    } catch (err) {
        console.error('Offer expiry cron error:', err)
    }
})
