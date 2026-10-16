/**
 * Reset the running order serial to 0 (client 16 Oct): "The order serial resets after my N100 test on
 * Monday, so the first real order is OSC-20261020-001."
 *
 * Order numbers are OSC-<Lagos date>-<running serial> (util/orderNumber.js). Sunday's data clear sets the
 * serial to 0, so Monday's N100 test order takes 001; run this AFTER that test order is cancelled, and the
 * first order on Tuesday is OSC-20261020-001.
 *
 * SAFETY
 *   * Dry run by default: shows the orders that exist and what the next number would be. --execute resets.
 *   * Refuses while any order that is NOT cancelled exists (a real order would then share a serial with a
 *     later one on another day's date). Cancel the test order first.
 *   * On the live database (laundrydb) it also needs RESET_LIVE="RESET CHUVI SERIAL".
 *
 * Run:  node resetOrderSerial.js                 (dry run)
 *       RESET_LIVE="RESET CHUVI SERIAL" node resetOrderSerial.js --execute
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')

async function main() {
    const execute = process.argv.includes('--execute')
    const url = process.env.MONGODB_URL
    if (!url) {
        console.error('MONGODB_URL not set.')
        process.exit(2)
    }
    const dbName = (String(url).match(/\/([A-Za-z0-9_-]+)(\?|$)/) || [])[1] || '<unknown>'
    const live = /laundrydb/i.test(dbName)
    console.log(`Database: ${dbName}${live ? '  (LIVE)' : ''}`)
    if (execute && live && process.env.RESET_LIVE !== 'RESET CHUVI SERIAL') {
        console.error('Live database: set RESET_LIVE="RESET CHUVI SERIAL" to confirm. Nothing changed.')
        process.exit(2)
    }
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })
    const { CounterModel, SERIAL_KEY, lagosYmd } = require('./util/orderNumber')
    const BookOrderModel = require('./models/bookOrder.model')

    const counter = await CounterModel.findById(SERIAL_KEY).lean()
    const orders = await BookOrderModel.find({}).select('oscNumber stage.status createdAt').sort({ createdAt: 1 }).lean()
    const open = orders.filter((o) => o.stage?.status !== 'cancelled')
    console.log(`Serial now: ${counter?.seq ?? 0}. Orders on the database: ${orders.length} (${open.length} not cancelled).`)
    for (const o of orders.slice(-10)) console.log(`  ${o.oscNumber}  ${o.stage?.status}`)
    if (open.length) {
        console.error(`Refusing: ${open.length} order(s) are not cancelled (${open.slice(0, 5).map((o) => o.oscNumber).join(', ')}). Cancel the test order first. Nothing changed.`)
        await mongoose.disconnect()
        process.exit(1)
    }
    if (!execute) {
        console.log(`Dry run. With --execute the serial goes to 0 and the next order is OSC-${lagosYmd()}-001 (dated the day it is made).`)
        await mongoose.disconnect()
        return
    }
    await CounterModel.updateOne({ _id: SERIAL_KEY }, { $set: { seq: 0 } }, { upsert: true })
    const after = await CounterModel.findById(SERIAL_KEY).lean()
    console.log(`Done. Serial is ${after.seq}. The next order will be OSC-<its Lagos date>-001.`)
    await mongoose.disconnect()
}

main().catch(async (e) => {
    console.error('Failed:', e.message)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
})
