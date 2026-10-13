/**
 * Launch item 3 — ready dates, Ready Today, Anytime per date and the daily
 * floor limit, driven through the real booking services on testingdb.
 *
 * Scenarios (floor limits set small for the run and restored after):
 *   1  Regular stores its split; deliveryDate = the last day at 19:00
 *   2  Regular spreads over days when a day fills (never refused)
 *   3  Express fills its share → refused with the client's sentence, nothing created
 *   4  Ready Today too many pieces → lists only the speeds that still fit
 *   5  a cancelled order frees its pieces
 *   6  booking-options rows match what booking enforces; Anytime per date
 *   7  a Quick Booking recount keeps the date and moves the extra pieces
 *   8  a counter (S1) booking takes floor space
 *   9  plans refuse set items; the 200-piece message is the client's
 *  10  a recovery (redo) order takes floor space and gets a ready date
 *  11  boot seeds the floor limits / half days onto an existing document
 *
 * SMS and Paystack are stubbed. SAFETY: refuses unless STAGING_OK=1; refuses
 * NODE_ENV=production without STAGING_FORCE=1; hard-refuses any DB named
 * laundrydb. Restores the settings it edits and removes what it creates.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node readyDateStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: async () => ({ stubbed: true }) }
const mongoose = require('mongoose')
const PaystackService = require('./services/paystack.service')
PaystackService.prototype.initializePayment = async () => ({ success: true, data: { message: { authorization_url: 'https://stub' } } })
const UserModel = require('./models/user.model')
const BookOrderModel = require('./models/bookOrder.model')
const AdminSettingModel = require('./models/adminSetting.model')
const PlanModel = require('./models/plan.model')
const SubscriptionModel = require('./models/subscription.model')
const ItemSetModel = require('./models/itemSet.model')
const ComplaintTypeModel = require('./models/complaintType.model')
const ComplaintCaseModel = require('./models/complaintCase.model')
const WalletModel = require('./models/wallet.model')
const BookOrderService = require('./services/bookOrder.service')
const IntakeUserService = require('./services/intake-user.service')
const BookingWindowService = require('./services/bookingWindow.service')
const W = require('./util/bookingWindow')
const { ROLE, DELIVERY_SPEED, ORDER_STATUS, SERVICE_TIERS, COMPLAINT_STATUS, RECOVERY_ACTION } = require('./util/constants')

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
const unwrap = (r) => r?.data?.message

async function main() {
    if (process.env.STAGING_OK !== '1') {
        console.error('Refusing to run: set STAGING_OK=1 to confirm this is a staging DB.')
        process.exit(2)
    }
    if (process.env.NODE_ENV === 'production' && process.env.STAGING_FORCE !== '1') {
        console.error('NODE_ENV=production — refusing without STAGING_FORCE=1.')
        process.exit(2)
    }
    const url = process.env.MONGODB_URL
    const dbName = (url.match(/\/([A-Za-z0-9_-]+)(\?|$)/) || [])[1] || '<unknown>'
    console.log('Target DB name:', dbName)
    if (/laundrydb/i.test(dbName)) {
        console.error('*** "laundrydb" is the LIVE database. Refusing. ***')
        process.exit(2)
    }
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })

    const stamp = Date.now()
    const created = { userIds: [], orderIds: [], planIds: [], setIds: [], caseIds: [], typeIds: [] }
    const original = await AdminSettingModel.findOne({}).lean()
    if (!original) {
        console.log('SKIPPED — AdminSetting unseeded; boot the app once against this DB.')
        await mongoose.disconnect()
        return
    }
    try {
        // Small limits so a few bookings fill a day. Restored in finally.
        await AdminSettingModel.updateOne({ _id: original._id }, { $set: { floorLimits: { dailyPieces: 20, sameDayPieces: 5, expressPieces: 8 }, halfDays: ['sun'] } })
        const settings = await AdminSettingModel.findOne({}).lean()
        const labels = BookingWindowService.speedLabels(settings)

        // A Tuesday at least 8 days out, so the other staging scripts' orders
        // (booked for "now") never share its days.
        let tue = W.addDays(W.startOfDay(new Date()), 8)
        while (tue.getDay() !== 2) tue = W.addDays(tue, 1)
        const wed = W.addDays(tue, 1)
        const thu = W.addDays(tue, 2)
        const fri = W.addDays(tue, 3)
        const pickupDate = W.dateKey(tue)

        const customer = await UserModel.create({ email: `rd${stamp}@example.com`, fullName: 'Ready Probe', phoneNumber: `0803${String(stamp).slice(-7)}`, userType: ROLE.USER, status: 'active', isVerified: true })
        const operator = await UserModel.create({ email: `rdop${stamp}@example.com`, fullName: 'Ready Operator', phoneNumber: `0805${String(stamp).slice(-7)}`, userType: ROLE.INTAKE_AND_TAG, status: 'active', isVerified: true })
        created.userIds.push(customer._id, operator._id)
        await WalletModel.create({ userId: customer._id, balance: 0 })
        const address = { label: 'Home', address: '1 Test Road', landmark: 'By the mast' }
        const book = async (speed, quantity, extra = {}) => {
            const r = await new BookOrderService().createOrder({
                userId: String(customer._id),
                payload: {
                    fullName: 'Ready Probe', phoneNumber: customer.phoneNumber, serviceType: settings.serviceTypes[0].name,
                    serviceTier: SERVICE_TIERS.CLASSIC, deliverySpeed: speed, isPickUp: true, isDelivery: true,
                    pickupAddress: address, deliveryAddress: address, billingType: 'pay-per-item',
                    pickupDate, pickupTime: '9am', items: [{ type: 'trousers', quantity }], ...extra,
                },
            })
            const order = r.success ? await BookOrderModel.findOne({ userId: customer._id }).sort({ createdAt: -1 }).lean() : null
            if (order) created.orderIds.push(order._id)
            return { r, order }
        }
        const day = (d) => W.dateKey(d)
        const ordersNow = () => BookOrderModel.countDocuments({ userId: customer._id })

        console.log(`\n[1] Regular stores its split (pickup ${W.dayText(tue)} 09:00, daily limit 20)`)
        const a = await book(DELIVERY_SPEED.STANDARD, 15)
        ok(a.r.success, `booked (${a.r.data?.error || 'ok'})`)
        ok(JSON.stringify(a.order?.floorAllocation) === JSON.stringify([{ date: day(thu), pieces: 15 }]), `15 pieces on ${W.dayText(thu)} (${JSON.stringify(a.order?.floorAllocation)})`)
        ok(a.order && W.isSameDay(new Date(a.order.deliveryDate), thu) && new Date(a.order.deliveryDate).getHours() === 19, 'deliveryDate = Thursday 19:00 (day after pickup counts 1, then 2)')

        console.log('\n[2] Regular spreads when the day fills — never refused')
        const b = await book(DELIVERY_SPEED.STANDARD, 10)
        ok(JSON.stringify(b.order?.floorAllocation) === JSON.stringify([{ date: day(thu), pieces: 5 }, { date: day(fri), pieces: 5 }]), `5 Thu + 5 Fri (${JSON.stringify(b.order?.floorAllocation)})`)
        ok(b.order && W.isSameDay(new Date(b.order.deliveryDate), fri), 'ready on the last day used (Friday)')

        console.log('\n[3] Express fills its share (8) → the client\'s sentence, nothing created')
        const c = await book(DELIVERY_SPEED.EXPRESS, 8)
        ok(c.r.success && JSON.stringify(c.order?.floorAllocation) === JSON.stringify([{ date: day(wed), pieces: 8 }]), 'Express 8 on Wednesday')
        const before = await ordersNow()
        const d = await book(DELIVERY_SPEED.EXPRESS, 1)
        ok(!d.r.success && d.r.data?.error === `${labels.express} is full for Wednesday. Choose ${labels.standard}, or pick another pickup day.`, `refused: "${d.r.data?.error}"`)
        ok((await ordersNow()) === before, 'no order was created')

        console.log('\n[4] Ready Today with too many pieces lists only the speeds that still fit')
        const e = await book(DELIVERY_SPEED.SAME_DAY, 6)
        ok(!e.r.success && e.r.data?.error === `Too many pieces for ${labels['same-day']}. Choose ${labels.standard}, or call us on +234 707 325 4943.`, `refused: "${e.r.data?.error}" (Express is full, so it is left out)`)
        ok(e.r.data?.unavailableReason === 'too-many-pieces' && Array.isArray(e.r.data?.speeds), 'the refusal carries the reason and every speed row')

        console.log('\n[5] A cancelled order frees its pieces')
        await BookOrderModel.updateOne({ _id: a.order._id }, { $set: { 'stage.status': ORDER_STATUS.CANCELLED } })
        const f = await book(DELIVERY_SPEED.STANDARD, 15)
        ok(JSON.stringify(f.order?.floorAllocation) === JSON.stringify([{ date: day(thu), pieces: 15 }]), `Thursday has room again (${JSON.stringify(f.order?.floorAllocation)})`)

        console.log('\n[6] booking-options rows and Anytime per date')
        const opt = await BookingWindowService.speedOptionsForDraft({ items: [{ type: 'trousers', quantity: 3 }], pickupDate, pickupTime: '9am' })
        const row = (s) => opt.speeds.find((x) => x.speed === s)
        ok(row('same-day').available && row('same-day').readyText === `Ready ${W.dayText(tue)}, by 7:00 PM`, `Ready Today: ${row('same-day').readyText || row('same-day').message}`)
        ok(!row('express').available && row('express').message.startsWith(`${labels.express} is full for Wednesday`), `Express: ${row('express').message}`)
        ok(row('standard').available && row('standard').readyText === `Ready ${W.dayText(fri)}, by 7:00 PM`, `Regular: ${row('standard').readyText}`)
        ok(opt.speeds.every((s) => !('allocation' in s)), 'the screen rows carry no internal split')
        const av = unwrap(await BookingWindowService.getAvailability({ horizonDays: 8 }))
        const closed = av.anytimeByDate.find((x) => new Date(`${x.date}T12:00:00`).getDay() === 1)
        ok(Array.isArray(av.anytimeByDate) && av.anytimeByDate.length === 9 && closed?.note === 'Closed that day' && closed.open === false, `a Monday reads "${closed?.note}"`)

        console.log('\n[7] A Quick Booking recount keeps the date and moves the extra pieces')
        const qb = await book(DELIVERY_SPEED.STANDARD, undefined, { items: undefined, itemCount: 2 })
        ok(qb.r.success && qb.order?.floorAllocation?.reduce((n, x) => n + x.pieces, 0) === 2, `Quick Booking of 2 holds 2 pieces (${JSON.stringify(qb.order?.floorAllocation)})`)
        const keptDate = qb.order && new Date(qb.order.deliveryDate).getTime()
        const edit = await new BookOrderService().applyItemEdit({ params: { id: String(qb.order._id) }, body: { items: [{ type: 'trousers', price: 700, quantity: 6 }], reason: 'Counted at Intake' }, user: { id: String(operator._id), userType: ROLE.INTAKE_AND_TAG } })
        const qbAfter = await BookOrderModel.findById(qb.order._id).lean()
        const lastBefore = qb.order.floorAllocation[qb.order.floorAllocation.length - 1]
        const lastAfter = qbAfter.floorAllocation[qbAfter.floorAllocation.length - 1]
        ok(edit.success, `Intake entered 6 pieces (${edit.data?.error || 'ok'})`)
        ok(new Date(qbAfter.deliveryDate).getTime() === keptDate, 'the ready date did not move')
        ok(qbAfter.floorAllocation.reduce((n, x) => n + x.pieces, 0) === 6 && lastAfter.date === lastBefore.date && lastAfter.pieces === lastBefore.pieces + 4, `the extra 4 went on the last day (${JSON.stringify(qbAfter.floorAllocation)})`)

        console.log('\n[8] A counter (S1) booking takes floor space')
        const counter = await new IntakeUserService().createBookOrder({
            user: { id: String(operator._id) },
            body: { fullName: 'Walk In', phoneNumber: `0802${String(stamp).slice(-7)}`, serviceType: settings.serviceTypes[0].name, serviceTier: SERVICE_TIERS.CLASSIC, isPickUp: false, isDelivery: false, deliverySpeed: DELIVERY_SPEED.STANDARD, items: [{ type: 'shirt', price: 1, quantity: 3 }], paymentMethod: 'cash' },
        })
        const co = unwrap(counter)
        if (co?._id) created.orderIds.push(co._id)
        const coDoc = co?._id ? await BookOrderModel.findById(co._id).lean() : null
        ok(counter.success && coDoc?.floorAllocation?.reduce((n, x) => n + x.pieces, 0) === 3 && new Date(coDoc.deliveryDate).getHours() === 19, `counter order holds 3 pieces, ready ${coDoc ? W.dayText(new Date(coDoc.deliveryDate)) : '?'} (${counter.data?.error || 'ok'})`)

        console.log('\n[9] Plans refuse set items; the 200-piece message is the client\'s')
        const set = await ItemSetModel.create({ name: `STG Suit ${stamp}`, pieces: [{ name: 'jacket', price: 1500 }], active: true })
        created.setIds.push(set._id)
        const plan = await PlanModel.create({ title: `STG RD ${stamp}`, description: 'probe', duration: 'monthly', price: 5000, features: ['probe'], monthlyLimits: 40, paystackPlanCode: `STGRD_${stamp}`, freePickupDeliveryPerWeek: 2 })
        created.planIds.push(plan._id)
        await SubscriptionModel.create({ email: customer.email, userId: customer._id, planId: plan._id, status: 'active', startDate: new Date(), remainingItems: 40, remainingPickupDeliveries: 2, logisticsWeekStart: new Date() })
        const s = await book(DELIVERY_SPEED.STANDARD, 1, { billingType: 'pay-from-subscription', items: [{ type: 'jacket', quantity: 1, fromSet: set.name }] })
        ok(!s.r.success && /does not cover set or heavy items/.test(s.r.data?.error || ''), `a non-heavy set item is refused on a plan (${s.r.data?.error})`)
        const big = await book(DELIVERY_SPEED.STANDARD, 201)
        ok(!big.r.success && big.r.data?.error === 'For more than 200 pieces, call or WhatsApp us on +234 707 325 4943 and we will plan it with you.', `201 pieces: "${big.r.data?.error}"`)

        console.log('\n[10] A recovery (redo) order takes floor space and gets a ready date')
        const RecoveryService = require('./services/recovery.service')
        const ctype = await ComplaintTypeModel.create({ name: `STG RD ${stamp}` })
        created.typeIds.push(ctype._id)
        const kase = await ComplaintCaseModel.create({ userId: customer._id, orderId: f.order._id, complaintTypeId: ctype._id, description: 'STG redo', status: COMPLAINT_STATUS.SUBMITTED })
        created.caseIds.push(kase._id)
        const { order: redo } = await RecoveryService.createRecoveryOrder(kase._id, { action: RECOVERY_ACTION.REWASH, createdBy: operator._id })
        if (redo?._id) created.orderIds.push(redo._id)
        const redoDoc = redo?._id ? await BookOrderModel.findById(redo._id).lean() : null
        const redoPieces = (redoDoc?.floorAllocation || []).reduce((n, x) => n + x.pieces, 0)
        ok(redoDoc?.isRecoveryOrder && redoPieces === (redoDoc.items || []).length && redoPieces > 0, `the redo holds its ${redoPieces} pieces on the floor (${JSON.stringify(redoDoc?.floorAllocation)})`)
        ok(redoDoc?.deliveryDate && new Date(redoDoc.deliveryDate).getHours() === 19, `and has a ready date: ${redoDoc?.deliveryDate ? W.dayText(new Date(redoDoc.deliveryDate)) : 'none'}`)

        console.log('\n[12] Admin floor-limit validation refuses blank, null and true (F-58)')
        const AdminService = require('./services/admin.service')
        const adminSvc = typeof AdminService === 'function' ? new AdminService() : AdminService
        for (const bad of ['', null, true]) {
            const r = await adminSvc.updateAdminSettings({ body: { floorLimits: { dailyPieces: bad } }, user: { id: String(operator._id) } })
            ok(!r.success && /whole number/.test(r.data?.error || ''), `dailyPieces=${JSON.stringify(bad)} refused (${r.data?.error})`)
        }
        ok((await AdminSettingModel.findOne({}).lean()).floorLimits.dailyPieces === 20, 'nothing was saved')

        console.log('\n[11] Boot writes the floor limits and half days onto an existing settings document')
        await AdminSettingModel.updateOne({ _id: original._id }, { $unset: { floorLimits: '', halfDays: '' } })
        await require('./config/setup')()
        const seeded = await AdminSettingModel.findOne({}).lean()
        ok(seeded.floorLimits?.dailyPieces === 150 && seeded.floorLimits?.sameDayPieces === 30 && seeded.floorLimits?.expressPieces === 50, `floorLimits seeded (${JSON.stringify(seeded.floorLimits)})`)
        ok(JSON.stringify(seeded.halfDays) === JSON.stringify(['sun']), `halfDays seeded (${JSON.stringify(seeded.halfDays)})`)
        await AdminSettingModel.updateOne({ _id: original._id }, { $set: { floorLimits: { dailyPieces: 120, sameDayPieces: 20, expressPieces: 40 } } })
        await require('./config/setup')()
        ok((await AdminSettingModel.findOne({}).lean()).floorLimits.dailyPieces === 120, 'an admin-set value is never overwritten')
    } finally {
        await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        await BookOrderModel.deleteMany({ userId: { $in: created.userIds } })
        await SubscriptionModel.deleteMany({ userId: { $in: created.userIds } })
        await WalletModel.deleteMany({ userId: { $in: created.userIds } })
        await UserModel.deleteMany({ _id: { $in: created.userIds } })
        await PlanModel.deleteMany({ _id: { $in: created.planIds } })
        await ItemSetModel.deleteMany({ _id: { $in: created.setIds } })
        await ComplaintCaseModel.deleteMany({ _id: { $in: created.caseIds } })
        await ComplaintTypeModel.deleteMany({ _id: { $in: created.typeIds } })
        const restore = {}
        const unset = {}
        for (const k of ['floorLimits', 'halfDays']) {
            if (original[k] === undefined) unset[k] = ''
            else restore[k] = original[k]
        }
        await AdminSettingModel.updateOne({ _id: original._id }, { ...(Object.keys(restore).length && { $set: restore }), ...(Object.keys(unset).length && { $unset: unset }) })
        console.log(`\nreadyDateStaging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
        await mongoose.disconnect()
    }
}

main().catch(async (e) => {
    console.error('STAGING ERROR', e.message)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
})
