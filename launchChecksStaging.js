/**
 * Client's launch checks (16 Oct) — DB verification on testingdb.
 *   1  Rep report lists each paid order with its date and amount, one week at a time
 *   2  The Iron Only texts are the client's words (payment link, pressed as booked)
 *
 * SAFETY: refuses unless STAGING_OK=1; hard-refuses laundrydb. Cleans up.
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node launchChecksStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')

let PASS = 0,
    FAIL = 0
const ok = (c, m) => {
    if (c) {
        PASS++
        console.log('  ✓', m)
    } else {
        FAIL++
        console.log('  ✗ FAIL:', m)
    }
}

async function main() {
    if (process.env.STAGING_OK !== '1') {
        console.error('Refusing to run: set STAGING_OK=1.')
        process.exit(2)
    }
    const url = process.env.MONGODB_URL
    const dbName = (String(url).match(/\/([A-Za-z0-9_-]+)(\?|$)/) || [])[1] || '<unknown>'
    console.log('Target DB name:', dbName)
    if (/laundrydb/i.test(dbName)) {
        console.error('*** LIVE database. Refusing. ***')
        process.exit(2)
    }
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })
    const UserModel = require('./models/user.model')
    const BookOrderModel = require('./models/bookOrder.model')
    const ReferralModel = require('./models/referral.model')
    const RepReportService = require('./services/repReport.service')
    const U = require('./util/ironOnlyUpgrade')
    const stamp = Date.now()
    const created = { users: [], orders: [], referrals: [] }
    try {
        console.log('\n1. Rep report, one week at a time')
        const rep = await UserModel.create({ email: `lc_rep_${stamp}@example.com`, fullName: 'Ada Rep', userType: 'user', referralCode: `LC${stamp}` })
        const cust = await UserModel.create({ email: `lc_c_${stamp}@example.com`, fullName: 'Amaka Obi', userType: 'user' })
        created.users.push(rep._id, cust._id)
        const ref = await ReferralModel.create({ referrerId: rep._id, referredUserId: cust._id, code: rep.referralCode, createdAt: new Date('2026-10-12T10:00:00+01:00') }).catch((e) => { throw new Error('referral create: ' + e.message) })
        created.referrals.push(ref._id)
        const mkOrder = async (paidAt, amount, extra = {}) => {
            const o = await BookOrderModel.create({
                userId: cust._id, fullName: 'Amaka Obi', phoneNumber: '08051230123', serviceType: 'wash-and-iron', serviceTier: 'classic',
                deliverySpeed: 'standard', channel: 'website', amount, oscNumber: `LC-${stamp}-${created.orders.length}`, paymentStatus: 'success', paymentDate: paidAt,
                stage: { status: 'queue' }, items: [{ type: 'shirt', price: 1, quantity: 1 }], ...extra,
            })
            created.orders.push(o._id)
            return o
        }
        const a = await mkOrder(new Date('2026-10-14T12:00:00+01:00'), 6600)
        const b = await mkOrder(new Date('2026-10-21T12:00:00+01:00'), 4000)
        await mkOrder(new Date('2026-10-22T12:00:00+01:00'), 9000, { stage: { status: 'cancelled' } })
        let r = await RepReportService.repLinks({ week: '2026-10-12', referrerId: String(rep._id) })
        let row = r.data?.message?.reps?.[0]
        ok(r.success && row && row.orders.length === 1 && row.orders[0].oscNumber === a.oscNumber && row.orders[0].amount === 6600 && row.orders[0].paidAt, `week of 12 Oct: one paid order, with its date and amount (${JSON.stringify(row?.orders?.map((o) => o.oscNumber + ' N' + o.amount))})`)
        ok(row && row.signups === 1 && row.totalPaid === 6600, 'that week: 1 sign-up, N6,600 paid')
        r = await RepReportService.repLinks({ week: '2026-10-19', referrerId: String(rep._id) })
        row = r.data?.message?.reps?.[0]
        ok(row && row.orders.length === 1 && row.orders[0].oscNumber === b.oscNumber && row.signups === 0 && row.totalPaid === 4000, 'week of 19 Oct: the later order only (the cancelled one is not counted); the earlier sign-up is not counted again')
        r = await RepReportService.repLinks({ referrerId: String(rep._id) })
        row = r.data?.message?.reps?.[0]
        ok(row && row.orders.length === 2 && row.totalPaid === 10600 && row.customers[0].orders.length === 2, 'no week: all time, both paid orders listed per rep and per customer')

        console.log('\n2. Iron Only texts (client 16 Oct)')
        const until = new Date()
        until.setHours(15, 15, 0, 0)
        const link = U.SMS_TEXT.paymentLink({ fullName: 'Emeka Obi' }, { type: 'shirt', tagId: 'TAG 03' }, 300, 'https://pay/x', until)
        ok(link === 'Emeka, your shirt (TAG 03) looks dirty, and pressing it without washing will not look good. Pay N300 to wash and iron it: https://pay/x If it is not paid by 3:15 PM, we will press it as you booked.', `payment link: "${link}"`)
        const pab = U.SMS_TEXT.pressedAsBooked({ fullName: 'Emeka Obi' }, [{ type: 'shirt', tagId: 'TAG 03' }])
        ok(pab === 'Emeka, we pressed your shirt (TAG 03) as you booked, without washing. The rest of your order carries on. Questions? Call or WhatsApp 07073254943.', `pressed as booked: "${pab}"`)
        ok(![link, pab].some((t) => /[₦–—]/.test(t)), 'N, no dashes')
    } catch (e) {
        FAIL++
        console.error('  ✗ CRASH:', e)
    } finally {
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        await ReferralModel.deleteMany({ _id: { $in: created.referrals } })
        await UserModel.deleteMany({ _id: { $in: created.users } })
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed`)
        process.exit(FAIL ? 1 : 0)
    }
}
main()
