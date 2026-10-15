/**
 * Review fixes on V1 batches 1+2 (15 Oct 2026) — DB verification on testingdb.
 *
 *   1  Security: a self-registered staff/admin account starts inactive and
 *      cannot log in; the public admin seed route is closed
 *   2  P0: a payment hold raised by staff never spends reward credit
 *   3  P0: cancelling an order on a payment hold closes the hold; paying the
 *      return fee keeps it cancelled (never back to the queue)
 *   4  P0/P1: reward credit at Pay is spent once (double tap) and a recount
 *      DOWN gives the credit back as credit, not wallet cash
 *   5  P1: an unpaid redelivery fee blocks rider assignment
 *   6  P1: a finished order cannot be escalated or approved for cancellation
 *   7  P2: S1's delivery list shows the return of a cancelled bag
 *
 * SMS, email and Paystack stubbed. SAFETY: refuses unless STAGING_OK=1;
 * refuses NODE_ENV=production without STAGING_FORCE=1; hard-refuses laundrydb.
 * Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node reviewFixStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
delete process.env.ADMIN_SEED_ENABLED
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: Object.assign(async () => ({ stubbed: true }), { cleanSmsText: (t) => t }) }
const emailPath = require.resolve('./util/emailService')
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: async () => ({ stubbed: true }) }
const clientPath = require.resolve('./services/paystack.client.service')
require.cache[clientPath] = {
    id: clientPath,
    filename: clientPath,
    loaded: true,
    exports: {
        post: async () => ({ data: { status: true, data: { authorization_url: 'https://pay.stub/x', reference: 'r' } } }),
        get: async () => ({ data: { status: true, data: { status: 'abandoned' } } }),
    },
}

const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const WalletModel = require('./models/wallet.model')
const WalletCreditModel = require('./models/walletCredit.model')
const CancellationRequestModel = require('./models/cancellationRequest.model')
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
    const created = { orders: [], users: [] }
    const BookOrderService = require('./services/bookOrder.service')
    const IntakeUserService = require('./services/intake-user.service')
    const PaymentHoldService = require('./services/paymentHold.service')
    const PaystackService = require('./services/paystack.service')
    const WalletCreditService = require('./services/walletCredit.service')
    const AuthService = require('./services/auth.service')
    const book = new BookOrderService()
    const intake = new IntakeUserService()
    try {
        const settings = await require('./models/adminSetting.model').findOne().lean()
        const svc = settings?.serviceTypes?.[0]
        if (!svc) {
            console.log('SKIPPED (settings unseeded).')
            return
        }
        let pn = 0
        const mkUser = async (userType, extra = {}) => {
            pn++
            const u = await UserModel.collection.insertOne({
                fullName: `STG RF ${userType} ${pn}`,
                email: `stg-rf-${pn}-${ts}@example.com`,
                phoneNumber: `0806${tail}${pn}`.slice(0, 11),
                userType,
                status: 'active',
                isVerified: true,
                createdAt: new Date(),
                ...extra,
            })
            created.users.push(u.insertedId)
            return { _id: u.insertedId, id: String(u.insertedId) }
        }
        const s1 = await mkUser(C.ROLE.INTAKE_AND_TAG)
        const admin = await mkUser(C.ROLE.ADMIN)
        const rd = await mkUser(C.ROLE.RIDER)
        const cust = await mkUser(C.ROLE.USER)
        let on = 0
        const mkOrder = async (extra = {}) => {
            on++
            const r = await BookOrderModel.collection.insertOne({
                userId: cust._id,
                fullName: 'Amaka Obi',
                phoneNumber: '08060000000',
                amount: 5800,
                oscNumber: `STGRF-${ts}-${on}`,
                serviceType: svc.name,
                serviceTier: 'classic',
                deliverySpeed: 'standard',
                billingType: C.BILLING_TYPE.PAY_PER_ITEM,
                isPickUp: true,
                isDelivery: true,
                items: Array.from({ length: 4 }, () => ({ _id: new mongoose.Types.ObjectId(), type: 'Shirt', price: 1, quantity: 1, actionLog: [] })),
                stage: { status: C.ORDER_STATUS.QUEUE, note: '', updatedAt: new Date() },
                stageHistory: [],
                stationStatus: C.STATION_STATUS.INTAKE_AND_TAG_STATION,
                paymentStatus: 'pending',
                dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP }, delivery: {} },
                handoffs: [],
                createdAt: new Date(),
                ...extra,
            })
            created.orders.push(r.insertedId)
            return r.insertedId
        }
        const credit = (amount) =>
            WalletCreditService.grantCredit({ userId: cust._id, type: 'promotional', amount, sourceSystem: 'admin', sourceRef: `stg-rf-${ts}-${Math.random()}`, note: 'STG' })
        const creditLeft = async () => (await WalletCreditModel.find({ userId: cust._id }).lean()).reduce((n, c) => n + (c.remaining || 0), 0)
        const asStaff = (u, role, params = {}, body = {}) => ({ params, body, query: {}, user: { id: u.id, userType: role } })

        // ── 1 security ─────────────────────────────────────────────────────
        console.log('\n1. Security')
        const auth = new AuthService()
        const em = `stg-rf-admin-${ts}@example.com`
        const reg = await auth.createUser({ body: { email: em, password: 'Secret123!', fullName: 'Not An Admin', phoneNumber: '08069999999', userType: C.ROLE.ADMIN } })
        const made = await UserModel.findOne({ email: em }).lean()
        if (made) created.users.push(made._id)
        ok(reg.success && made?.status === 'inactive', 'a public sign-up as admin is created INACTIVE')
        await UserModel.updateOne({ _id: made._id }, { $set: { isVerified: true } })
        const login = await auth._handleLogin({ email: em, password: 'Secret123!', userType: C.ROLE.ADMIN })
        ok(!login.success && /not active/i.test(login.error || ''), `…and cannot log in until an admin activates it (${login.error})`)
        const seed = await auth.registerAdmin({}, {})
        ok(!seed.success && seed.data?.error === 'Not available.', 'the public admin seed route is closed')
        const noUser = await auth.adminLogin({ body: { email: `nobody-${ts}@example.com`, password: 'x' } }, { cookie() {} })
        ok(!noUser.success && /not found/i.test(String(noUser.data?.error || '')), `admin login with an unknown email says "not found", no crash (${noUser.data?.error})`)

        // ── 2 hold link never spends credit ────────────────────────────────
        console.log('\n2. A staff-raised payment link keeps the credit')
        await credit(10000)
        const before2 = await creditLeft()
        const o2 = await mkOrder()
        const h2 = await PaymentHoldService.raise({ orderId: o2, actorId: s1.id })
        const d2 = await BookOrderModel.findById(o2).lean()
        ok(h2.success && (await creditLeft()) === before2 && d2.paymentStatus === 'pending' && d2.stage.status === 'hold', 'raising the bill hold spends no credit and the order waits for payment')

        // ── 3 cancel on a hold; return fee paid stays cancelled ────────────
        console.log('\n3. Cancelled on a payment hold')
        await book.escalateCancellation(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o2) }, { reason: 'Customer rejected bill' }))
        const req2 = await CancellationRequestModel.findOne({ orderId: o2 }).lean()
        await book.approveCancellationRequest(asStaff(admin, C.ROLE.ADMIN, { id: String(req2._id) }, {}))
        const c2 = await BookOrderModel.findById(o2).lean()
        ok(c2.stage.status === 'cancelled' && c2.paymentHold.clearedAt && !c2.orderHold?.holdTypeKey && c2.cancellation.returnFeeDue === 2000,
            'cancelling closes the payment hold; the return fee (N2,000) is owed')
        ok((await creditLeft()) === before2, 'the return-fee link spent no credit')
        await BookOrderModel.updateOne({ _id: o2 }, { $set: { paymentStatus: 'success' } })
        await PaymentHoldService.clear({ orderId: o2, source: 'paystack' })
        ok((await BookOrderModel.findById(o2).lean()).stage.status === 'cancelled', 'paying the return fee keeps the order cancelled (not back to the queue)')

        // ── 4 credit at Pay: once; recount down gives it back as credit ───
        console.log('\n4. Reward credit at Pay')
        const o4 = await mkOrder({ amount: 3000 })
        const pay = new PaystackService()
        const [p1, p2] = await Promise.all([
            pay.initializePayment({ body: { transactionType: 'order', orderId: String(o4) }, user: { id: cust.id } }),
            pay.initializePayment({ body: { transactionType: 'order', orderId: String(o4) }, user: { id: cust.id } }),
        ])
        const d4 = await BookOrderModel.findById(o4).lean()
        const spent = (await WalletCreditModel.find({ userId: cust._id }).lean()).flatMap((c) => c.usedBy || []).filter((u) => String(u.orderId) === String(o4)).reduce((n, u) => n + u.amount, 0)
        ok(p1.success && p2.success && spent === 3000 && d4.creditPaidAtPay === 3000 && d4.paymentStatus === 'success', `a double tap spends the credit once (spent N${spent})`)
        const o5 = await mkOrder({ amount: 5000, dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP }, delivery: {} } })
        await BookOrderModel.updateOne({ _id: o5 }, { $set: { amount: 5000 } })
        // part-pay o5 with N1,000 credit only (leave just 1,000 credit)
        const left = await creditLeft()
        if (left > 1000) {
            const credits = await WalletCreditModel.find({ userId: cust._id, remaining: { $gt: 0 } })
            let drop = left - 1000
            for (const c of credits) {
                const take = Math.min(c.remaining, drop)
                await WalletCreditModel.updateOne({ _id: c._id }, { $inc: { remaining: -take } })
                drop -= take
                if (drop <= 0) break
            }
        }
        await pay.initializePayment({ body: { transactionType: 'order', orderId: String(o5) }, user: { id: cust.id } })
        const d5 = await BookOrderModel.findById(o5).lean()
        ok(d5.creditPaidAtPay === 1000 && d5.balanceDue === 4000, 'N1,000 credit, the link asks N4,000')
        const walletBefore = (await WalletModel.findOne({ userId: cust._id }).lean())?.balance || 0
        await book.applyItemEdit(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o5) }, { items: [{ type: 'Shirt', price: 1, quantity: 1 }], reason: 'fewer' }))
        const walletAfter = (await WalletModel.findOne({ userId: cust._id }).lean())?.balance || 0
        const d5b = await BookOrderModel.findById(o5).lean()
        ok(walletAfter === walletBefore && (await creditLeft()) >= 1000 && !d5b.creditPaidAtPay, 'a recount DOWN gives the credit back as credit; no credit turns into wallet cash')

        // ── 5 redelivery fee blocks assignment ─────────────────────────────
        console.log('\n5. Redelivery fee')
        const o6 = await mkOrder({
            stage: { status: C.ORDER_STATUS.READY, updatedAt: new Date() },
            paymentStatus: 'pending',
            balanceDue: 1000,
            dispatchTag: { printedAt: new Date(), printCount: 1 },
            dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP }, delivery: { status: 'failed', redeliveryFees: [{ amount: 1000, at: new Date() }] } },
        })
        const a6 = await intake.assignRiderTopDeliveryOrder(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o6), riderId: rd.id }))
        ok(!a6.success && a6.data?.redeliveryFee === true, `a rider cannot be assigned while the redelivery fee is unpaid (${a6.data?.error})`)

        // ── 6 finished orders ──────────────────────────────────────────────
        console.log('\n6. Finished orders')
        const o7 = await mkOrder({ stage: { status: 'delivered', updatedAt: new Date() }, paymentStatus: 'success' })
        const e7 = await book.escalateCancellation(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o7) }, { reason: 'x' }))
        ok(!e7.success && /already complete/.test(e7.data?.error || ''), 'a delivered order cannot be escalated for cancellation')
        await CancellationRequestModel.create({ orderId: o7, userId: cust._id, reason: 'x', source: 'customer' })
        const r7 = await CancellationRequestModel.findOne({ orderId: o7 }).lean()
        const a7 = await book.approveCancellationRequest(asStaff(admin, C.ROLE.ADMIN, { id: String(r7._id) }, {}))
        ok(!a7.success && (await BookOrderModel.findById(o7).lean()).stage.status === 'delivered', 'nor approved: it stays delivered')

        // ── 7 returns on the delivery list ─────────────────────────────────
        console.log('\n7. Returns on S1\'s delivery list')
        const list = await intake.getDeliverableOrders({ query: { limit: 200, search: `STGRF-${ts}` }, user: { id: s1.id } })
        const rows = list.data?.message?.data || []
        ok(rows.some((r) => String(r._id) === String(o2)), 'the cancelled bag waiting to go back is listed')
        ok(!rows.some((r) => String(r._id) === String(o7)), 'a delivered order is not')
    } finally {
        for (const m of ['activity.model', 'audit.log.model', 'payment.model', 'walletTransaction.model', 'notification.model']) {
            try {
                const M = require(`./models/${m}`)
                await M.deleteMany({ $or: [{ orderId: { $in: created.orders } }, { order: { $in: created.orders } }, { userId: { $in: created.users } }, { relatedOrderId: { $in: created.orders } }] })
            } catch {}
        }
        await CancellationRequestModel.deleteMany({ orderId: { $in: created.orders } })
        try {
            await require('./models/careTask.model').deleteMany({ orderId: { $in: created.orders } })
        } catch {}
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        await WalletCreditModel.deleteMany({ userId: { $in: created.users } })
        await WalletModel.deleteMany({ userId: { $in: created.users } })
        try {
            const CrmProfileModel = require('./models/crmProfile.model')
            await CrmProfileModel.deleteMany({ userId: { $in: created.users } })
        } catch {}
        await UserModel.deleteMany({ _id: { $in: created.users } })
        await mongoose.disconnect()
        console.log(`reviewFixStaging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
    }
}

main().then(
    () => process.exit(FAIL ? 1 : 0),
    (e) => {
        console.error(e)
        process.exit(1)
    },
)
