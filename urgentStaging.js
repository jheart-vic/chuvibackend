/**
 * Urgent (Anytime) agreed parts — launch item 4 (client item 13, Q2) — DB verification.
 *
 *   1  a closed date says when Urgent next opens
 *   2  every window on a date full → availability offers Urgent at the WINDOW price,
 *      with the client's message
 *   3  booking Urgent that day → the window price, a free-pickup offer still waives it
 *      ("keep your offer"), and no refund is owed
 *   4  a window with room → Urgent keeps the Anytime price and the offer does not waive it
 *   5  an Urgent pickup is stamped urgentPickup and Intake is notified
 *   6  Intake's pickup list puts the Urgent order before an older ordinary one
 *
 * Switches the DB's own booking windows off for the run and restores them after.
 * SMS stubbed. SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production
 * without STAGING_FORCE=1; hard-refuses laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node urgentStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: async () => ({ stubbed: true }) }
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const BookingWindowModel = require('./models/bookingWindow.model')
const OfferModel = require('./models/offer.model')
const CustomerOfferModel = require('./models/customerOffer.model')
const UserModel = require('./models/user.model')
const WalletModel = require('./models/wallet.model')
const NotificationModel = require('./models/notification.model')
const AdminSettingModel = require('./models/adminSetting.model')
const OrderItemModel = require('./models/orderItem.model')
const BookOrderService = require('./services/bookOrder.service')
const BookingWindowService = require('./services/bookingWindow.service')
const IntakeUserService = require('./services/intake-user.service')
const W = require('./util/bookingWindow')
const C = require('./util/constants')

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
    const ts = Date.now()
    const TAG = `URG${ts}`
    const created = { orders: [], users: [], offers: [], windows: [] }
    const switchedOff = (await BookingWindowModel.find({ isActive: true }).select('_id').lean()).map((w) => w._id)
    const book = new BookOrderService()
    try {
        const settings = await AdminSettingModel.findOne()
        const anItem = await OrderItemModel.findOne()
        const aService = settings?.serviceTypes?.[0]
        if (!settings || !anItem || !aService) {
            console.log('SKIPPED (settings/catalog unseeded).')
            return
        }
        const sched = await BookingWindowService.getSchedulingSettings()
        const windowFee = W.legFee({ timing: C.BOOKING_TIMING.WINDOW, leg: 'pickup', settings: sched })
        const anytimeFee = W.legFee({ timing: C.BOOKING_TIMING.ANYTIME, leg: 'pickup', settings: sched })
        console.log(`  window fee ₦${windowFee} · Urgent fee ₦${anytimeFee}`)
        ok(windowFee !== anytimeFee, 'the two fees differ (otherwise the price checks prove nothing)')

        // Only our window is active for the run; limit 0 = full every day.
        await BookingWindowModel.updateMany({ _id: { $in: switchedOff } }, { $set: { isActive: false } })
        const win = await BookingWindowModel.create({
            name: `${TAG} Evening`, startTime: '15:00', endTime: '18:30',
            days: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'], cutoffMinutes: 60, limit: 0, isActive: true,
        })
        created.windows.push(win._id)

        const now = new Date()
        let day = W.nextWorkingDay(W.addDays(W.startOfDay(now), 1), sched.workingDays)
        while (!W.windowRunsOn(win, day, sched.workingDays)) day = W.nextWorkingDay(W.addDays(day, 1), sched.workingDays)

        console.log('\n[1–2] Availability')
        const avail = (await BookingWindowService.getAvailability({ leg: 'pickup', horizonDays: 7 })).data.message
        const closed = avail.anytimeByDate.find((r) => r.open === false && r.note === 'Closed that day')
        ok(!closed || /^\d{1,2}:\d{2} (AM|PM) /.test(closed.opensAtText || ''), `a closed date says when Urgent opens (${closed ? closed.opensAtText : 'no closed date in range'})`)
        ok('opensAtText' in avail.anytime, `the "now" answer carries opensAtText (${avail.anytime.opensAtText})`)
        const row = avail.anytimeByDate.find((r) => r.date === W.dateKey(day))
        ok(row && row.windowsFull === true && row.urgentAtWindowPrice === true && row.fee === windowFee,
            `every window full on ${row?.date} → Urgent at the window price ₦${row?.fee}`)
        ok(row && /windows are full\. Book Urgent at the window price, ₦[\d,]+, and keep your offer\. Or pick another day\./.test(row.message || ''),
            `with the client's sentence ("${row?.message}")`)

        // A free-pickup offer for everyone.
        const offer = await OfferModel.create({
            name: `${TAG} free pickup`, headline: 'Free pickup', description: 'staging', type: C.OFFER_TYPE.BASELINE,
            status: C.OFFER_STATUS.ACTIVE, benefits: [{ benefitType: C.OFFER_BENEFIT_TYPE.FREE_PICKUP }], rules: { minOrderValue: 0 },
        })
        created.offers.push(offer._id)
        const customer = await UserModel.create({ email: `urg${ts}@example.com`, fullName: `${TAG} Customer`, userType: C.ROLE.USER, isVerified: true })
        const intake = await UserModel.create({ email: `urgin${ts}@example.com`, fullName: `${TAG} Intake`, userType: C.ROLE.INTAKE_AND_TAG, status: C.GENERAL_STATUS.ACTIVE, isVerified: true })
        created.users.push(customer._id, intake._id)

        const place = async (extra = {}) => {
            const r = await book.createOrder({
                userId: String(customer._id),
                payload: {
                    fullName: `${TAG} Customer`,
                    items: [{ type: anItem.name, price: anItem.price, quantity: 2 }],
                    serviceType: aService.name, serviceTier: C.SERVICE_TIERS.CLASSIC, deliverySpeed: 'standard',
                    isPickUp: true, isDelivery: false,
                    pickupAddress: { label: 'Home', address: '1 Urgent Road', landmark: 'By the mast' },
                    phoneNumber: '08000000000', billingType: C.BILLING_TYPE.PAY_PER_ITEM,
                    pickupTiming: C.BOOKING_TIMING.ANYTIME, pickupDate: day,
                    ...extra,
                },
            })
            if (r?.data?.order?._id) created.orders.push(r.data.order._id)
            return r
        }

        console.log('\n[3] Booking Urgent on the full day')
        const older = await BookOrderModel.create({
            userId: customer._id, oscNumber: `OSC-${TAG}-OLD`, fullName: `${TAG} Customer`, phoneNumber: '08000000000',
            serviceType: aService.name, serviceTier: C.SERVICE_TIERS.CLASSIC, deliverySpeed: 'standard', amount: 1000,
            isPickUp: true, isDelivery: false, stage: { status: C.ORDER_STATUS.PENDING },
            pickupAddress: { label: 'Home', address: '2 Older Road', landmark: 'x' }, createdAt: new Date(ts - 3600000),
        })
        created.orders.push(older._id)
        const r1 = await place()
        ok(r1?.success, `booking works (${r1?.success ? 'ok' : JSON.stringify(r1?.data)})`)
        const o1 = r1.data.order
        ok(o1.scheduling?.pickup?.windowsFull === true && o1.scheduling.pickup.fee === windowFee,
            `the pickup is charged the window price ₦${o1.scheduling?.pickup?.fee}`)
        ok(o1.pricing?.freePickupWaived === windowFee, `the free-pickup offer still waives it (waived ₦${o1.pricing?.freePickupWaived}) — offer kept`)
        ok(o1.scheduling.pickup.windowWasBookableAtBooking === false, 'no Urgent refund can be owed')

        // Review F-88: re-pricing (item edit / Quick Booking count) keeps the window
        // fee and the offer for a full-windows Urgent pickup.
        const stored = await BookOrderModel.findById(o1._id).lean()
        const rep = await book._repriceForItems({
            order: stored,
            items: [{ type: anItem.name, price: anItem.price, quantity: 3 }],
            adminOrderSetting: settings.toObject ? settings.toObject() : settings,
        })
        ok(rep?.breakdown?.freePickup === true && rep.pricing?.pickupFee === windowFee && rep.pricing?.freePickupWaived === windowFee,
            `a re-price keeps the window fee ₦${rep?.pricing?.pickupFee} and the offer (waived ₦${rep?.pricing?.freePickupWaived})`)

        // Review F-85: the booking-screen quote prices it the same way.
        const OfferService = require('./services/offer.service')
        const quote = await OfferService.getBookingOptions(String(customer._id), {
            amount: 2 * anItem.price, isPickUp: true, isDelivery: false, pickupTiming: C.BOOKING_TIMING.ANYTIME,
            pickupDate: day, pickupAmount: anytimeFee, deliverySpeed: 'standard', serviceType: aService.name,
            items: [{ type: anItem.name, price: anItem.price, quantity: 2 }],
        })
        const feesMsg = JSON.stringify(quote?.feesLine || quote?.fees || '')
        ok(quote?.selected?.freePickup === true && !/window bookings only/.test(JSON.stringify(quote)),
            `the booking-options quote waives the pickup and never says "choose a time window" (${feesMsg.slice(0, 80)})`)

        // Review F-86: the delivery leg never advertises the window price.
        const davail = (await BookingWindowService.getAvailability({ leg: 'delivery', horizonDays: 7 })).data.message
        const drow = davail.anytimeByDate.find((r) => r.date === W.dateKey(day))
        ok(drow && drow.urgentAtWindowPrice === false && drow.windowsFull === false && !drow.message,
            'delivery availability never offers Urgent at the window price')

        console.log('\n[5] Urgent flag and Intake alert — only once paid')
        const s0 = await BookOrderModel.findById(o1._id).lean()
        await sleep(1000)
        const early = await NotificationModel.findOne({ userId: intake._id, title: 'Urgent pickup booked' }).lean()
        ok(s0.paymentStatus !== C.PAYMENT_ORDER_STATUS.SUCCESS && s0.urgentPickup !== true && !early,
            'an unpaid card order (checkout not finished) is NOT marked urgent and alerts no one')
        // The customer pays: the same call the Paystack webhook / wallet / bank approval makes.
        await BookOrderModel.updateOne({ _id: o1._id }, { $set: { paymentStatus: C.PAYMENT_ORDER_STATUS.SUCCESS } })
        const { markUrgentPickupIfReady } = require('./util/urgentPickup')
        const first = await markUrgentPickupIfReady(await BookOrderModel.findById(o1._id))
        const again = await markUrgentPickupIfReady(await BookOrderModel.findById(o1._id))
        const s1 = await BookOrderModel.findById(o1._id).lean()
        ok(first === true && again === false && s1.urgentPickup === true, 'once paid it is stamped urgentPickup, exactly once')
        const notes = await NotificationModel.find({ userId: intake._id, title: 'Urgent pickup booked' }).lean()
        ok(notes.length === 1 && notes[0].body.includes(o1.oscNumber), `Intake is notified once ("${notes[0]?.body?.slice(0, 60)}…")`)

        console.log('\n[6] Top of the pickup list')
        const svc = new IntakeUserService()
        const list = (await svc.getPickableOrders({ query: { page: 1, limit: 50, search: TAG } })).data.message.data
        const iUrgent = list.findIndex((x) => String(x._id) === String(o1._id))
        const iOlder = list.findIndex((x) => String(x._id) === String(older._id))
        ok(iUrgent >= 0 && iOlder >= 0 && iUrgent < iOlder && list[iUrgent].urgent === true,
            `the Urgent order (#${iUrgent + 1}) is listed before the older ordinary one (#${iOlder + 1}), badged urgent`)

        console.log('\n[4] A window with room → the Anytime price, offer does not waive it')
        await BookingWindowModel.updateOne({ _id: win._id }, { $set: { limit: 10 } })
        const r2 = await place()
        const o2 = r2.data?.order
        ok(r2?.success && !o2.scheduling?.pickup?.windowsFull && o2.scheduling.pickup.fee === anytimeFee,
            `Urgent with a window open is charged the Urgent price ₦${o2?.scheduling?.pickup?.fee}`)
        ok(o2 && (o2.pricing?.freePickupWaived || 0) === 0, 'and the free-pickup offer does not waive it (window-only rule, item 1)')
    } catch (e) {
        FAIL++
        console.error('STAGING ERROR', e)
    } finally {
        await BookingWindowModel.updateMany({ _id: { $in: switchedOff } }, { $set: { isActive: true } })
        await BookingWindowModel.deleteMany({ _id: { $in: created.windows } })
        const db = mongoose.connection.db
        for (const coll of ['activities', 'auditlogs', 'audits']) {
            await db.collection(coll).deleteMany({ orderId: { $in: created.orders } }).catch(() => {})
        }
        for (const coll of ['notifications', 'crmprofiles', 'wallets', 'customeroffers', 'crmscheduledmessages']) {
            await db.collection(coll).deleteMany({ userId: { $in: created.users } }).catch(() => {})
        }
        // The alert also went to the DB's other Intake/admin users: remove it by OSC number.
        const oscs = (await BookOrderModel.find({ _id: { $in: created.orders } }).select('oscNumber').lean()).map((o) => o.oscNumber)
        for (const osc of oscs) await NotificationModel.deleteMany({ title: 'Urgent pickup booked', body: new RegExp(osc) }).catch(() => {})
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        await OfferModel.deleteMany({ _id: { $in: created.offers } })
        await CustomerOfferModel.deleteMany({ userId: { $in: created.users } })
        await WalletModel.deleteMany({ userId: { $in: created.users } })
        await UserModel.deleteMany({ _id: { $in: created.users } })
        const restored = await BookingWindowModel.countDocuments({ _id: { $in: switchedOff }, isActive: true })
        console.log(`\n  windows restored: ${restored}/${switchedOff.length}`)
        console.log(`urgentStaging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
        await mongoose.disconnect()
    }
}

main().catch(async (e) => {
    console.error('STAGING ERROR', e.message)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
})
