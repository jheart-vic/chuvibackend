/**
 * V1 launch batch 1 (client 15 Oct 2026) — DB verification on testingdb.
 *
 *   1  Change Items: refused before pickup (S1) and on plan orders; after pickup
 *      an increase raises the hold with the "Payment link after recount" SMS,
 *      a decrease refunds with the "Wallet refund" SMS
 *   2  Riders: no customer phone check; rider count differs → client's SMS;
 *      failed pickup / delivery → "Customer not available" SMS; delivered →
 *      "Delivered" SMS once
 *   3  Handoff rejection needs a reason
 *   4  Quick Booking: no Ready Today (screen rows and booking); booking received
 *      SMS at booking; the bill SMS carries pay-by and the expired-link note
 *   5  Payment holds are never Overdue
 *   6  Rep link report counts sign-ups, paid customers and money
 *   7  Lead report counts only staff-entered leads
 *   8  Sign-up: Nigerian mobile only; one phone one account, refusals logged
 *      with the referral code (email form and Google phone step)
 *
 * SMS, email and Paystack are stubbed (SMS captured). SAFETY: refuses unless
 * STAGING_OK=1; refuses NODE_ENV=production without STAGING_FORCE=1; hard-refuses
 * laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node batch1Staging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const SENT = []
const smsPath = require.resolve('./util/sendSms')
const realSms = require('./util/sendSms')
require.cache[smsPath] = {
    id: smsPath,
    filename: smsPath,
    loaded: true,
    exports: Object.assign(async (to, text) => SENT.push({ to, text: realSms.cleanSmsText(text) }), {
        cleanSmsText: realSms.cleanSmsText,
    }),
}
const emailPath = require.resolve('./util/emailService')
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: async () => ({ stubbed: true }) }
const P = require('./services/paystack.service')
P.prototype.initializePayment = async () => ({ success: true, data: { message: { authorization_url: 'https://pay.stub/x' } } })

const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const WalletModel = require('./models/wallet.model')
const ReferralModel = require('./models/referral.model')
const CrmProfileModel = require('./models/crmProfile.model')
const SignupAttemptModel = require('./models/signupAttempt.model')
const AdminSettingModel = require('./models/adminSetting.model')
const BookOrderService = require('./services/bookOrder.service')
const RiderService = require('./services/rider.service')
const HandoffService = require('./services/handoff.service')
const BookingWindowService = require('./services/bookingWindow.service')
const RepReportService = require('./services/repReport.service')
const CrmService = require('./services/crm.service')
const AuthService = require('./services/auth.service')
const UserService = require('./services/user.service')
const H = require('./util/holdSla')
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
const lastSms = (to) => [...SENT].reverse().find((s) => !to || String(s.to).replace(/\D/g, '').endsWith(String(to).replace(/\D/g, '').slice(-10)))

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
    const tail = String(ts).slice(-6)
    const created = { orders: [], users: [], phones: [] }
    const book = new BookOrderService()
    const rider = new RiderService()
    const handoff = new HandoffService()
    try {
        const settings = await AdminSettingModel.findOne().lean()
        const svc = settings?.serviceTypes?.[0]
        if (!svc) {
            console.log('SKIPPED (settings unseeded).')
            return
        }

        let pn = 0
        const phone = () => `0803${tail}${String(++pn).padStart(1, '0')}`.slice(0, 11)
        const mkUser = async (userType, extra = {}) => {
            const ph = extra.phoneNumber === undefined ? phone() : extra.phoneNumber
            const u = await UserModel.collection.insertOne({
                fullName: `STG B1 ${userType} ${pn}`,
                email: `stg-b1-${pn}-${ts}@example.com`,
                ...(ph ? { phoneNumber: ph } : {}),
                userType,
                status: 'active',
                isVerified: true,
                createdAt: new Date(),
                ...extra,
            })
            created.users.push(u.insertedId)
            if (ph) created.phones.push(ph)
            return { _id: u.insertedId, id: String(u.insertedId), phoneNumber: ph }
        }
        const s1 = await mkUser(C.ROLE.INTAKE_AND_TAG)
        const rd = await mkUser(C.ROLE.RIDER)
        const cust = await mkUser(C.ROLE.USER)
        let on = 0
        const mkOrder = async (extra = {}) => {
            on++
            const r = await BookOrderModel.collection.insertOne({
                userId: cust._id,
                fullName: 'Amaka Obi',
                phoneNumber: cust.phoneNumber,
                amount: 8000,
                oscNumber: `STGB1-${ts}-${on}`,
                serviceType: svc.name,
                serviceTier: 'classic',
                deliverySpeed: 'standard',
                billingType: C.BILLING_TYPE.PAY_PER_ITEM,
                isPickUp: true,
                isDelivery: true,
                items: Array.from({ length: 10 }, () => ({ _id: new mongoose.Types.ObjectId(), type: 'Shirt', price: 600, quantity: 1, actionLog: [] })),
                stage: { status: C.ORDER_STATUS.PENDING, note: '', updatedAt: new Date() },
                stageHistory: [],
                stationStatus: C.STATION_STATUS.INTAKE_AND_TAG_STATION,
                paymentStatus: C.PAYMENT_ORDER_STATUS.SUCCESS,
                dispatchDetails: { pickup: { status: C.PICKUP_STATUS.SCHEDULED, rider: rd._id }, delivery: {} },
                handoffs: [],
                createdAt: new Date(),
                ...extra,
            })
            created.orders.push(r.insertedId)
            return r.insertedId
        }
        const edit = (id, items, role = C.ROLE.INTAKE_AND_TAG) =>
            book.applyItemEdit({ params: { id: String(id) }, body: { items, reason: 'recount' }, user: { id: s1.id, userType: role } })
        const shirts = (n) => [{ type: 'Shirt', price: 600, quantity: n }]

        console.log('\n1. Change Items')
        const o1 = await mkOrder()
        const r1 = await edit(o1, shirts(11))
        ok(!r1.success && r1.data?.pickupNotConfirmed === true, `refused before pickup (${r1.data?.error})`)
        const o2 = await mkOrder({ billingType: C.BILLING_TYPE.PAY_FROM_SUBSCRIPTION, 'dispatchDetails': { pickup: { status: C.PICKUP_STATUS.PICKED_UP } } })
        const r2 = await edit(o2, shirts(4), C.ROLE.ADMIN)
        ok(!r2.success && r2.data?.planOrder === true, `refused on a plan order, even for admin (${r2.data?.error})`)
        const picked = { dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP, rider: rd._id }, delivery: {} } }
        const o3 = await mkOrder(picked)
        SENT.length = 0
        const r3 = await edit(o3, shirts(11))
        const o3d = await BookOrderModel.findById(o3).lean()
        ok(r3.success && o3d.paymentHold?.raisedAt, 'after pickup an increase is allowed and raises the payment hold')
        ok(SENT.length === 1 && /^Amaka, we counted 11 pieces in your bag, so N[\d,]+ is left to pay: https:\/\/pay\.stub\/x We start washing once it is paid\.$/.test(SENT[0].text),
            `one SMS, the client's recount text: "${SENT[0]?.text}"`)
        const o4 = await mkOrder({ ...picked, amount: 999999999 }) // above any 9-shirt bill on testingdb's prices
        SENT.length = 0
        const r4 = await edit(o4, shirts(9))
        ok(r4.success && SENT.length === 1 && /^Amaka, we counted fewer pieces than you booked, so N[\d,]+ is back in your CHUVI wallet for your next order\.$/.test(SENT[0].text),
            `a decrease refunds with the client's wallet refund text: "${SENT[0]?.text}"`)

        console.log('\n2. Riders')
        const o5 = await mkOrder({ quickBooking: false, counts: { customer: 10 } })
        const asRider = (id, body = {}) => ({ params: { id: String(id) }, body, user: { id: rd.id } })
        const r5 = await rider.startPickup(asRider(o5))
        ok(r5.success, `start pickup with no phone number (${r5.data?.error || 'ok'})`)
        SENT.length = 0
        const r5b = await rider.markAsPickedUp(asRider(o5, { itemCount: 11, countReason: 'customer added one' }))
        ok(r5b.success && SENT.some((s) => s.text === 'Amaka, our rider collected 11 pieces. Reply or call 07073254943 if this is wrong.'),
            'picked up, no phone; the rider-count SMS is the client\'s text')
        const o6 = await mkOrder()
        SENT.length = 0
        const r6 = await rider.markPickupAsFailed(asRider(o6, { note: 'gate locked' }))
        ok(r6.success && SENT.some((s) => s.text === 'Amaka, our rider came for your CHUVI pickup but could not reach you. Reply or call 07073254943 to pick a new time.'),
            'failed pickup, no phone, "Customer not available" SMS')
        const outForDelivery = {
            stage: { status: C.ORDER_STATUS.OUT_FOR_DELIVERY, updatedAt: new Date() },
            dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP }, delivery: { status: C.DELIVERY_STATUS.OUT_FOR_DELIVERY, rider: rd._id } },
        }
        const o7 = await mkOrder(outForDelivery)
        SENT.length = 0
        const r7 = await rider.markOrderDeliveryAsFailed(asRider(o7, { note: 'not home' }))
        ok(r7.success && SENT.some((s) => /could not reach you/.test(s.text) && /CHUVI delivery/.test(s.text)), 'failed delivery, no phone, "Customer not available" (delivery) SMS')
        const o8 = await mkOrder(outForDelivery)
        SENT.length = 0
        const r8 = await rider.markOrderAsDelivered(asRider(o8))
        ok(r8.success && SENT.filter((s) => /has been delivered/.test(s.text)).length === 1, 'delivered, no phone, one "Delivered" SMS')
        const OrderSms = require('./util/orderSms')
        await OrderSms.delivered(await BookOrderModel.findById(o8).lean())
        ok(SENT.filter((s) => /has been delivered/.test(s.text)).length === 1, '"Delivered" never goes twice')

        console.log('\n3. Handoff rejection needs a reason')
        const tagged = Array.from({ length: 3 }, () => ({
            _id: new mongoose.Types.ObjectId(), type: 'Shirt', price: 600, quantity: 1, tagStatus: 'complete', tagId: 'T', tagColor: 'white',
            currentStation: C.STATION_STATUS.INTAKE_AND_TAG_STATION, actionLog: [],
        }))
        const o9 = await mkOrder({ items: tagged, stage: { status: C.ORDER_STATUS.QUEUE, updatedAt: new Date() } })
        const pushed = await handoff.push({
            params: { id: String(o9) },
            body: { fromStation: C.STATION_STATUS.INTAKE_AND_TAG_STATION, toStation: C.STATION_STATUS.SORT_AND_PRETREAT_STATION },
            user: { id: s1.id },
        })
        const hid = String(pushed.data?.message?.handoffId)
        const all = tagged.map((i) => String(i._id))
        const r9 = await handoff.confirm({ params: { id: String(o9), hid }, body: { rejectedItems: all }, user: { id: s1.id } })
        ok(!r9.success && r9.data?.reasonRequired === true, `rejecting without a reason is refused (${r9.data?.error})`)
        const r9b = await handoff.confirm({ params: { id: String(o9), hid }, body: { rejectedItems: all, note: 'Wrong colour on tag' }, user: { id: s1.id } })
        ok(r9b.success, 'with a reason it goes through')

        console.log('\n4. Quick Booking')
        const draft = await BookingWindowService.speedOptionsForDraft({ itemCount: 5 })
        const sd = draft.speeds.find((s) => s.speed === C.DELIVERY_SPEED.SAME_DAY)
        ok(sd && sd.available === false && sd.unavailableReason === 'quick-booking', `Ready Today is not offered on the screen (${sd?.message})`)
        const address = { label: 'Home', address: '1 Test Road', landmark: 'By the mast' }
        const qb = (extra) =>
            book.createOrder({
                userId: cust.id,
                payload: {
                    fullName: 'Amaka Obi', phoneNumber: cust.phoneNumber, serviceType: svc.name, serviceTier: 'classic',
                    deliverySpeed: 'standard', isPickUp: true, isDelivery: true, pickupAddress: address, deliveryAddress: address,
                    billingType: C.BILLING_TYPE.PAY_PER_ITEM, itemCount: 5, ...extra,
                },
            })
        const r10 = await qb({ deliverySpeed: 'same-day' })
        ok(!r10.success && r10.data?.unavailableReason === 'quick-booking', `a same-day Quick Booking is refused (${r10.data?.error})`)
        SENT.length = 0
        const r11 = await qb({})
        const qbOrder = r11.data?.message?._id ? await BookOrderModel.findById(r11.data.message._id).lean() : await BookOrderModel.findOne({ userId: cust._id, quickBooking: true }).sort({ createdAt: -1 }).lean()
        if (qbOrder) created.orders.push(qbOrder._id)
        ok(r11.success && SENT.some((s) => /^Hi Amaka, we have your CHUVI booking OSC-.+\. Our rider comes .+\. Questions\? Call or WhatsApp 07073254943\.$/.test(s.text)),
            `booking received SMS at booking: "${SENT.find((s) => /booking/.test(s.text))?.text}"`)
        if (qbOrder) {
            await BookOrderModel.updateOne({ _id: qbOrder._id }, { $set: { 'dispatchDetails.pickup.status': C.PICKUP_STATUS.PICKED_UP } })
            SENT.length = 0
            const r12 = await edit(qbOrder._id, [{ type: 'Shirt', price: 600, quantity: 4 }, { type: 'Trousers', price: 700, quantity: 2 }])
            const bill = SENT[0]?.text || ''
            ok(r12.success && SENT.length === 1 && /^Amaka, your CHUVI bill is N[\d,]+ for 6 pieces plus pickup and delivery\. Pay by 12 noon [A-Z][a-z]{2} to keep your ready date of [A-Z][a-z]{2} 7 PM: https:\/\/pay\.stub\/x If this link has expired, open the CHUVI app, go to Orders and tap Pay\.$/.test(bill),
                `the bill SMS is the client's text: "${bill}"`)
        }

        console.log('\n5. Payment holds are never Overdue')
        const old = new Date(Date.now() - 100 * 3600 * 1000)
        const o13 = await mkOrder({
            stage: { status: C.ORDER_STATUS.HOLD, updatedAt: old },
            orderHold: { holdTypeKey: 'payment' },
            paymentHold: { raisedAt: old, amount: 5000 },
            paymentStatus: C.PAYMENT_ORDER_STATUS.PENDING,
            deliveryDate: old,
        })
        const rules = await H.loadHoldRules()
        const overdue = await BookOrderModel.countDocuments({ $and: [{ _id: o13 }, H.overdueHoldsFilter(new Date(), rules)] })
        const active = await BookOrderModel.countDocuments({ $and: [{ _id: o13 }, H.activeHoldsFilter(new Date(), rules)] })
        ok(overdue === 0 && active === 1, `a 100-hour payment hold past its date is Active, not Overdue (overdue ${overdue}, active ${active})`)
        ok(H.isHoldBreached(await BookOrderModel.findById(o13).lean(), new Date(), rules) === false, '…and its row agrees')
        const o14 = await mkOrder({ stage: { status: C.ORDER_STATUS.HOLD, updatedAt: old }, orderHold: { holdTypeKey: 'other' } })
        const overdue14 = await BookOrderModel.countDocuments({ $and: [{ _id: o14 }, H.overdueHoldsFilter(new Date(), rules)] })
        ok(overdue14 === 1, 'an ordinary hold that old is still Overdue')

        console.log('\n6. Rep link report')
        const rep = await mkUser(C.ROLE.USER, { referralCode: `REPB1${tail}` })
        const f1 = await mkUser(C.ROLE.USER)
        const f2 = await mkUser(C.ROLE.USER)
        await ReferralModel.create([
            { referrerId: rep._id, referredUserId: f1._id, code: `REPB1${tail}` },
            { referrerId: rep._id, referredUserId: f2._id, code: `REPB1${tail}` },
        ])
        const paidOrder = await mkOrder({ userId: f1._id, amount: 6000 })
        await mkOrder({ userId: f2._id, amount: 4000, paymentStatus: C.PAYMENT_ORDER_STATUS.PENDING })
        void paidOrder
        const rr = await RepReportService.repLinks({ referrerId: rep.id })
        const row = rr.data?.message?.reps?.[0]
        ok(rr.success && row?.signups === 2 && row.paidCustomers === 1 && row.totalPaid === 6000 && row.customers.length === 2,
            `rep row: ${row?.signups} sign-ups, ${row?.paidCustomers} paid, N${row?.totalPaid}`)

        console.log('\n7. Lead report counts only staff leads')
        const month = new Date().toLocaleDateString('en-CA').slice(0, 7)
        const leads = async () => (await CrmService.monthlyLeadReport({ query: { month } })).data?.message
        const before = await leads()
        const staffPhone = phone()
        const botPhone = phone()
        created.phones.push(staffPhone, botPhone)
        await CrmService.createWalkInLead({ body: { fullName: 'STG B1 staff lead', phoneNumber: staffPhone }, user: { id: s1.id } })
        await CrmService.registerBotLead({ body: { fullName: 'STG B1 bot lead', phoneNumber: botPhone }, headers: { 'x-bot-secret': process.env.BOT_SECRET } })
        const after = await leads()
        const key = Object.keys(after || {}).find((k) => /leadsEntered/i.test(k))
        const diff = (after?.[key] ?? NaN) - (before?.[key] ?? NaN)
        ok(diff === 1, `one more lead entered (the staff one), not two (${key}: ${before?.[key]} → ${after?.[key]})`)

        console.log('\n8. Sign-up phone rules')
        const auth = new AuthService()
        const signup = (body) => auth.createUser({ body: { password: 'Secret123!', fullName: 'STG B1 Signup', userType: C.ROLE.USER, ...body } })
        const bad = await signup({ email: `stg-b1-bad-${ts}@example.com`, phoneNumber: '08231234567' })
        ok(!bad.success && bad.data?.code === 'INVALID_PHONE', `a non-mobile number is refused (${bad.data?.error})`)
        const dupe = await signup({ email: `stg-b1-dupe-${ts}@example.com`, phoneNumber: cust.phoneNumber.replace(/^0/, '+234'), referralCode: `REPB1${tail}` })
        ok(!dupe.success && dupe.data?.code === 'PHONE_ALREADY_REGISTERED', `a phone already in use is refused, in any written form (${dupe.data?.error})`)
        const logged = await SignupAttemptModel.findOne({ email: `stg-b1-dupe-${ts}@example.com` }).lean()
        ok(logged?.reason === 'phone-in-use' && logged.referralCode === `REPB1${tail}` && String(logged.existingUserId) === cust.id,
            'the attempt is logged for admin with the referral code and the account that holds the number')
        const list = await RepReportService.signupAttempts({})
        ok(list.success && list.data.message.data.some((r) => r.email === `stg-b1-dupe-${ts}@example.com`), 'admin sees it in the refused sign-ups list')
        const g = await mkUser(C.ROLE.USER, { phoneNumber: null, servicePlatform: 'google' })
        const us = new UserService()
        const gp = await us.completeProfile({ user: { id: g.id }, body: { phoneNumber: cust.phoneNumber, referralCode: `REPB1${tail}` } })
        ok(!gp.success && gp.data?.code === 'PHONE_ALREADY_REGISTERED', `Google phone step refuses a number in use (${gp.data?.error})`)
        ok(await SignupAttemptModel.exists({ attemptUserId: g._id, method: 'google', referralCode: `REPB1${tail}` }), '…and logs it')
        const okPhone = phone()
        created.phones.push(okPhone)
        const good = await signup({ email: `stg-b1-good-${ts}@example.com`, phoneNumber: okPhone })
        ok(good.success, `a new valid mobile signs up (${good.data?.error || 'ok'})`)
        const goodUser = await UserModel.findOne({ email: `stg-b1-good-${ts}@example.com` }).lean()
        if (goodUser) created.users.push(goodUser._id)
    } finally {
        const models = ['activity.model', 'notification.model', 'audit.log.model', 'payment.model', 'walletTransaction.model']
        for (const m of models) {
            try {
                const M = require(`./models/${m}`)
                await M.deleteMany({ $or: [{ orderId: { $in: created.orders } }, { order: { $in: created.orders } }, { userId: { $in: created.users } }] })
            } catch {}
        }
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        await ReferralModel.deleteMany({ $or: [{ referrerId: { $in: created.users } }, { referredUserId: { $in: created.users } }] })
        await SignupAttemptModel.deleteMany({ email: new RegExp(`stg-b1-.*-${ts}@example\\.com`) })
        await SignupAttemptModel.deleteMany({ attemptUserId: { $in: created.users } })
        const { normalizePhone } = require('./util/helper')
        const profiles = await CrmProfileModel.find({ $or: [{ normalizedPhone: { $in: created.phones.map(normalizePhone) } }, { userId: { $in: created.users } }] }).select('_id').lean()
        try {
            await require('./models/crmScheduledMessage.model').deleteMany({ profileId: { $in: profiles.map((p) => p._id) } })
        } catch {}
        await CrmProfileModel.deleteMany({ _id: { $in: profiles.map((p) => p._id) } })
        await WalletModel.deleteMany({ userId: { $in: created.users } })
        try {
            await require('./models/walletCredit.model').deleteMany({ userId: { $in: created.users } })
        } catch {}
        await UserModel.deleteMany({ _id: { $in: created.users } })
        await mongoose.disconnect()
        console.log(`batch1Staging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
    }
}

main().then(
    () => process.exit(FAIL ? 1 : 0),
    (e) => {
        console.error(e)
        process.exit(1)
    },
)
