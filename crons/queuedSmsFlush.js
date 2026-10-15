// V1 launch batch 2 (R23): every 5 minutes, send the SMS quiet hours held back.
const cron = require('node-cron')
const { flushQueuedSms } = require('../util/queuedSms')

cron.schedule('*/5 * * * *', async () => {
    try {
        const n = await flushQueuedSms()
        if (n) console.log(`[queuedSmsFlush] sent ${n} SMS held by quiet hours`)
    } catch (err) {
        console.error('[queuedSmsFlush] failed:', err?.message)
    }
})

console.log('[queuedSmsFlush] scheduled every 5 minutes (Lagos time)')
