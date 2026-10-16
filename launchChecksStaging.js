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
const SMS = []
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: Object.assign(async (to, body) => { SMS.push({ to, body }); return { stubbed: true } }, { cleanSmsText: (t) => t }) }
const emailPath = require.resolve('./util/emailService')
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: async () => ({ stubbed: true }) }
// Paystack answers exactly as the real API does: { status, message, data: { authorization_url, ... } }.
const clientPath = require.resolve('./services/paystack.client.service')
require.cache[clientPath] = {
    id: clientPath, filename: clientPath, loaded: true,
    exports: {
        post: async () => ({ data: { status: true, message: 'Authorization URL created', data: { authorization_url: 'https://checkout.paystack.com/real-shape', access_code: 'x', reference: 'r1' } } }),
        get: async () => ({ data: { status: true, data: { status: 'abandoned' } } }),
    },
}
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

        console.log('\n3. Staff-raised payment links carry the Paystack link (FE 16 Oct: paymentUrl was null)')
        {
            const PaymentHoldService = require('./services/paymentHold.service')
            const o = await mkOrder(null, 7900, { paymentStatus: 'pending', paymentDate: undefined, oscNumber: `LC-PAY-${stamp}` })
            SMS.length = 0
            const r = await PaymentHoldService.raise({ orderId: o._id, actorId: rep._id })
            ok(r.success && r.data.message.paymentUrl === 'https://checkout.paystack.com/real-shape', `payment hold: paymentUrl is the Paystack link (${r.data?.message?.paymentUrl})`)
            ok(SMS.some((m) => m.body.includes('https://checkout.paystack.com/real-shape')), 'and the SMS carries it')
            await new Promise((res) => setTimeout(res, 50))
            await require('./models/bookOrder.model').updateOne({ _id: o._id }, { $unset: { 'paymentHold.linkResentAt': 1 } })
            const rs = await PaymentHoldService.resendLink({ orderId: o._id, actorId: rep._id })
            ok(rs.success && rs.data.message.paymentUrl === 'https://checkout.paystack.com/real-shape', 'resend: paymentUrl is the Paystack link')
        }

        console.log('\n4. Bad tag values (FE 16 Oct: start delivery failed on "blue" / "STAINED")')
        {
            const IntakeService = require('./services/intake-user.service')
            const RiderService = require('./services/rider.service')
            const BookOrderModel = require('./models/bookOrder.model')
            const s1 = await UserModel.create({ email: `lc_s1_${stamp}@example.com`, fullName: 'Ifeanyi Intake', userType: 'intake-and-tag' })
            const riderU = await UserModel.create({ email: `lc_r_${stamp}@example.com`, fullName: 'Tochuku Rider', userType: 'rider' })
            created.users.push(s1._id, riderU._id)
            const t = await mkOrder(new Date(), 3000, { oscNumber: `LC-TAG-${stamp}`, items: [{ type: 'shirt', price: 1, quantity: 1 }] })
            const tReq = (body) => ({ params: { id: String(t._id), itemId: String(t.items[0]._id) }, user: { id: String(s1._id), userType: 'intake-and-tag' }, body })
            let r = await new IntakeService().confirmTagItem(tReq({ tagColor: 'blue', tagState: [], tagStatus: 'complete', tagId: 'TAG 01' }))
            ok(!r.success && /White, Light or Dark/.test(r.data?.error || ''), `"blue" refused: "${r.data?.error}"`)
            r = await new IntakeService().confirmTagItem(tReq({ tagColor: 'Dark', tagState: ['STAINED'], tagStatus: 'complete', tagId: 'TAG 01' }))
            const it = (await BookOrderModel.findById(t._id).lean()).items[0]
            ok(r.success && it.tagColor === 'dark' && it.tagState[0] === 'stained', `"Dark" / "STAINED" saved as dark / stained (${it.tagColor}, ${it.tagState})`)
            const bad = await mkOrder(new Date(), 3000, { oscNumber: `LC-BAD-${stamp}`, stage: { status: 'ready' }, items: [{ type: 'shirt', price: 1, quantity: 1 }] })
            await BookOrderModel.collection.updateOne({ _id: bad._id }, { $set: { 'items.0.tagColor': 'blue', 'items.0.tagState': ['STAINED'], 'dispatchDetails.delivery': { rider: riderU._id, status: 'ready' } } })
            r = await new RiderService().startDelivery({ params: { id: String(bad._id) }, user: { id: String(riderU._id), userType: 'rider' }, body: {} })
            ok(r.success, `start delivery works on an order that already holds old bad tag values ${r.success ? '' : r.data?.error}`)
        }

        console.log('\n5. POS option and tag search (FE 16 Oct)')
        {
            const PaymentHoldService = require('./services/paymentHold.service')
            const BookOrderModel = require('./models/bookOrder.model')
            const SearchService = require('./services/search.service')
            const o = await mkOrder(null, 4700, { paymentStatus: 'pending', paymentDate: undefined, oscNumber: `LC-POS-${stamp}`, items: [{ type: 'shirt', price: 1, quantity: 1, tagId: `TG${stamp}` }] })
            let r = await PaymentHoldService.approveTransfer({ orderId: o._id, reference: '', method: 'pos', actor: { id: String(rep._id), userType: 'intake-and-tag' } })
            ok(!r.success && /POS receipt number/.test(r.data?.error || ''), 'POS needs the receipt number')
            r = await PaymentHoldService.approveTransfer({ orderId: o._id, reference: 'POS-778812', method: 'pos', actor: { id: String(rep._id), userType: 'intake-and-tag' } })
            const f = await BookOrderModel.findById(o._id).lean()
            ok(r.success && f.paymentStatus === 'success' && f.paymentMethod === 'pos' && f.posPaymentApproval?.receiptNumber === 'POS-778812' && !f.bankTransferApproval?.approvedAt, 'method pos: paid by POS with its receipt, not as a transfer')
            const bc = await PaymentHoldService.bankCheckList({})
            ok(bc.success && !JSON.stringify(bc.data).includes(`LC-POS-${stamp}`) && r.data.message.onBankCheckList === false && r.data.message.method === 'pos', 'not on the bank-check list, and the reply says so')
            const sr = await new SearchService().searchOrders({ query: { q: `TG${stamp}` } })
            const hit = (sr.data?.message?.data || []).find((x) => String(x._id) === String(o._id))
            ok(hit && hit.matchedPieces?.[0]?.tagId === `TG${stamp}`, 'a tag number finds the order, with the matching piece')
        }

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
