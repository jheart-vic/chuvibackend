/**
 * Client decisions A1–A5 and A7 (reply to the 6 Oct brief, 2026-10-07).
 *
 *   A1  dormant rate: unchanged figure, card renamed "Dormant share of customers"
 *   A2  average daily revenue: divide by ALL 7 days, not just trading days
 *   A3  revenue per item: total ÷ total, not the average of daily rates
 *   A4  processing time: tagged-and-pushed-to-S2 → S5 Ready, for orders Ready TODAY
 *   A5  every production queue sorted by delivery deadline, earliest first
 *   A7  "delivery address is the same as pickup" fills the delivery details
 *
 * Each of these CHANGES A NUMBER THE CLIENT LOOKS AT, and three of them make a
 * figure go down (A2 and A3 by arithmetic, A4 because it excludes orders tagged
 * before the measurement existed). So each is checked against hand-computable
 * data rather than "it returns something".
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Deletes what it creates.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node dashboardDecisionsStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')

const BookOrderModel = require('./models/bookOrder.model')
const PaymentModel = require('./models/payment.model')
const UserModel = require('./models/user.model')

const AdminService = require('./services/admin.service')
const QcService = require('./services/qc.service')
const { QUEUE_SORT } = require('./util/queueSort')
const {
    ORDER_STATUS,
    DELIVERY_SPEED,
    SERVICE_TIERS,
    ORDER_CHANNEL,
    ORDER_SERVICE_TYPE,
    PAYMENT_ORDER_STATUS,
    ROLE,
} = require('./util/constants')

const admin = new AdminService()
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

const STAMP = Date.now()
const HOUR = 3600 * 1000
const created = { orders: [], payments: [], users: [] }

// getDashboardStats is declared (req, res) but RETURNS an envelope and never
// touches res — drive it like the other services and read the return value.
const dash = async () => {
    const r = await admin.getDashboardStats({
        query: {},
        params: {},
        user: { id: new mongoose.Types.ObjectId().toString() },
    })
    if (!r?.success) throw new Error(`dashboard refused: ${JSON.stringify(r?.data)}`)
    return r.data?.message ?? r.data
}

const mkOrder = async (tag, over = {}) => {
    const o = await BookOrderModel.create({
        fullName: `STG A ${tag}`,
        phoneNumber: '08050000055',
        serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
        serviceTier: SERVICE_TIERS.CLASSIC,
        deliverySpeed: DELIVERY_SPEED.STANDARD,
        channel: ORDER_CHANNEL.OFFICE,
        amount: 5000,
        oscNumber: `OSC-A${STAMP}-${tag}`,
        paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
        items: [{ type: 'shirt', price: 1000, quantity: 1 }],
        stage: { status: ORDER_STATUS.QUEUE },
        ...over,
    })
    created.orders.push(o._id)
    return o
}

async function run() {
    // ── A2 + A3: the two figures that are about to drop ──────────────────────
    // Build a clean 7-day window we can compute by hand. Everything else in the
    // DB would poison the arithmetic, so park any existing paid orders and
    // payments inside the window for the duration and put them back after.
    console.log('\nA2 / A3 — average daily revenue and revenue per item')
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * HOUR)
    const parkedOrders = await BookOrderModel.find({
        paymentDate: { $gte: sevenDaysAgo },
    })
        .select('_id')
        .lean()
    if (parkedOrders.length) {
        await BookOrderModel.updateMany(
            { _id: { $in: parkedOrders.map((p) => p._id) } },
            { $unset: { paymentDate: '' } },
        )
    }
    const parkedPayments = await PaymentModel.find({
        createdAt: { $gte: sevenDaysAgo },
        status: 'success',
    })
        .select('_id')
        .lean()
    if (parkedPayments.length) {
        await PaymentModel.updateMany(
            { _id: { $in: parkedPayments.map((p) => p._id) } },
            { $set: { status: 'parked-by-staging' } },
        )
    }
    console.log(
        `  (parked ${parkedOrders.length} paid order(s) and ${parkedPayments.length} payment(s) for the run)`,
    )

    try {
        // Two trading days in the last seven.
        //   Monday-ish: ₦60,000 across 40 garments  → ₦1,500 / garment
        //   Wednesday:  ₦30,000 across 15 garments  → ₦2,000 / garment
        // Old A3 (average of daily rates): (1500 + 2000) / 2 = ₦1,750
        // New A3 (total ÷ total):          90,000 / 55       = ₦1,636
        // Old A2 (trading days):  90,000 / 2 = ₦45,000
        // New A2 (all 7 days):    90,000 / 7 = ₦12,857
        const dayA = new Date(Date.now() - 4 * 24 * HOUR)
        const dayB = new Date(Date.now() - 2 * 24 * HOUR)

        const o1 = await mkOrder('REV1', {
            amount: 60000,
            items: [{ type: 'shirt', price: 1000, quantity: 40 }],
        })
        const o2 = await mkOrder('REV2', {
            amount: 30000,
            items: [{ type: 'shirt', price: 1000, quantity: 15 }],
        })
        await BookOrderModel.updateOne({ _id: o1._id }, { $set: { paymentDate: dayA } })
        await BookOrderModel.updateOne({ _id: o2._id }, { $set: { paymentDate: dayB } })

        const mkPayment = async (amount, when) => {
            const p = await PaymentModel.create({
                reference: `STG-A-${STAMP}-${amount}`,
                userId: new mongoose.Types.ObjectId(),
                amount,
                status: 'success',
                type: 'order',
            })
            created.payments.push(p._id)
            // createdAt is immutable under Mongoose timestamps — the raw driver
            // is the only way to backdate it (learned in recoveryReportStaging).
            await PaymentModel.collection.updateOne(
                { _id: p._id },
                { $set: { createdAt: when } },
            )
            return p
        }
        await mkPayment(60000, dayA)
        await mkPayment(30000, dayB)

        const d1 = await dash()
        ok(
            d1.revenueDaysCounted === 7,
            `the divisor is all 7 days (got ${d1.revenueDaysCounted})`,
        )
        ok(
            d1.revenueDaysWithSales === 2,
            `and it reports 2 of them took money (got ${d1.revenueDaysWithSales})`,
        )
        ok(
            d1.avgDailyRevenue7Days === Math.round(90000 / 7),
            `*** A2: ₦90,000 over 7 days = ₦${Math.round(90000 / 7).toLocaleString()} *** (got ₦${d1.avgDailyRevenue7Days?.toLocaleString()})`,
        )
        ok(
            d1.avgDailyRevenue7Days !== 45000,
            'and NOT ₦45,000, which is what dividing by trading days used to give',
        )

        ok(
            d1.avgRevenuePerItem7Days === Math.round(90000 / 55),
            `*** A3: ₦90,000 ÷ 55 garments = ₦${Math.round(90000 / 55)} *** (got ₦${d1.avgRevenuePerItem7Days})`,
        )
        ok(
            d1.avgRevenuePerItem7Days !== 1750,
            'and NOT ₦1,750, the old average-of-daily-rates answer',
        )
        ok(
            d1.totalItems7Days === 55,
            `the garment count behind it is published (got ${d1.totalItems7Days})`,
        )
        ok(
            d1.avgCostPerItem7Days === d1.avgRevenuePerItem7Days,
            'the old `avgCostPerItem7Days` key still mirrors it, so the live screen does not go blank on deploy',
        )
    } finally {
        if (parkedOrders.length) {
            // restore by re-stamping; the exact old value is not needed for the
            // other harnesses, only that these rows leave the 7-day window
            await BookOrderModel.updateMany(
                { _id: { $in: parkedOrders.map((p) => p._id) } },
                { $set: { paymentDate: new Date(Date.now() - 400 * 24 * HOUR) } },
            )
        }
        if (parkedPayments.length) {
            await PaymentModel.updateMany(
                { _id: { $in: parkedPayments.map((p) => p._id) } },
                { $set: { status: 'success' } },
            )
        }
    }

    // ── A4: the processing-time clock ────────────────────────────────────────
    console.log('\nA4 — tagged-and-pushed-to-S2 → S5 Ready, for orders Ready today')
    const now = new Date()
    // 5 hours of production, finished an hour ago
    const timed = await mkOrder('TIME1', {
        productionStartedAt: new Date(now - 6 * HOUR),
        qcDetails: { packCompletedAt: new Date(now - 1 * HOUR) },
        stage: { status: ORDER_STATUS.READY },
    })
    // Ready today but tagged before the measurement existed — must be EXCLUDED,
    // not guessed at, and must be counted so the screen can say why.
    const legacy = await mkOrder('TIME2', {
        qcDetails: { packCompletedAt: new Date(now - 2 * HOUR) },
        stage: { status: ORDER_STATUS.READY },
    })
    // Became Ready YESTERDAY — outside the window entirely.
    const yesterday = await mkOrder('TIME3', {
        productionStartedAt: new Date(now - 30 * HOUR),
        qcDetails: { packCompletedAt: new Date(now - 26 * HOUR) },
        stage: { status: ORDER_STATUS.READY },
    })

    const d2 = await dash()
    ok(
        d2.ordersProcessedToday === 1,
        `only the one order with both stamps, Ready today, counts (got ${d2.ordersProcessedToday})`,
    )
    ok(
        Math.round(d2.avgProcessingTime / HOUR) === 5,
        `*** 5 hours from push-to-S2 to Ready *** (got ${(d2.avgProcessingTime / HOUR).toFixed(2)}h)`,
    )
    ok(
        d2.ordersReadyTodayAwaitingStamp === 1,
        `and the order tagged before this existed is reported, not silently dropped (got ${d2.ordersReadyTodayAwaitingStamp})`,
    )

    // the old definition would have measured from createdAt — which for these
    // fixtures is "seconds ago", so it would read ~0 rather than 5 hours
    ok(
        d2.avgProcessingTime > 4 * HOUR,
        'it is NOT measuring from order creation any more (that would read ~0 here)',
    )

    // ── A4, the other half: WHEN the clock starts ───────────────────────────
    // The client CORRECTED themselves on 2026-10-08: not at tagging, but when
    // the order is cleared for production — clothes at Intake AND the money
    // complete, WHICHEVER HAPPENS LAST. So the interesting cases are the two
    // orderings, and the fact that neither half alone is enough.
    console.log('\nA4 — the clock starts when clothes AND money are both in')
    const { markProductionClearedIfReady, isClearedForProduction } = require('./util/productionClock')

    // (a) paid in the app, clothes not here yet → NOT cleared
    const waiting = await mkOrder('CLOCK_A', {
        stage: { status: ORDER_STATUS.PENDING },
        paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
    })
    await markProductionClearedIfReady(waiting._id)
    let row = await BookOrderModel.findById(waiting._id).select('productionStartedAt').lean()
    ok(!row.productionStartedAt, 'paid but not yet collected: the clock has NOT started')

    // …the clothes arrive → it starts
    await BookOrderModel.updateOne({ _id: waiting._id }, { $set: { 'stage.status': ORDER_STATUS.QUEUE } })
    await markProductionClearedIfReady(waiting._id)
    row = await BookOrderModel.findById(waiting._id).select('productionStartedAt').lean()
    ok(!!row.productionStartedAt, '*** the clothes arriving starts it, because the money was already in ***')
    const startedA = row.productionStartedAt

    // (b) clothes here, unpaid → NOT cleared until payment
    const unpaid = await mkOrder('CLOCK_B', {
        stage: { status: ORDER_STATUS.QUEUE },
        paymentStatus: PAYMENT_ORDER_STATUS.PENDING,
    })
    await markProductionClearedIfReady(unpaid._id)
    row = await BookOrderModel.findById(unpaid._id).select('productionStartedAt').lean()
    ok(!row.productionStartedAt, 'clothes here but unpaid: the clock has NOT started')
    await BookOrderModel.updateOne({ _id: unpaid._id }, { $set: { paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS } })
    await markProductionClearedIfReady(unpaid._id)
    row = await BookOrderModel.findById(unpaid._id).select('productionStartedAt').lean()
    ok(!!row.productionStartedAt, '*** payment clearing starts it, because the clothes were already here ***')

    // an admin waiver counts as the money being complete — their rule is that
    // such an order DOES go into production, and is stopped again at dispatch
    const waived = await mkOrder('CLOCK_C', {
        stage: { status: ORDER_STATUS.QUEUE },
        paymentStatus: PAYMENT_ORDER_STATUS.PENDING,
        paymentWaivedAt: new Date(),
    })
    await markProductionClearedIfReady(waived._id)
    row = await BookOrderModel.findById(waived._id).select('productionStartedAt').lean()
    ok(!!row.productionStartedAt, 'an admin waiver also clears it for production')

    // never restarted
    await markProductionClearedIfReady(waiting._id)
    row = await BookOrderModel.findById(waiting._id).select('productionStartedAt').lean()
    ok(String(row.productionStartedAt) === String(startedA), 'a second trigger does NOT restart a running clock')

    // and a cancelled order never clears, however it was paid
    ok(
        isClearedForProduction({ stage: { status: ORDER_STATUS.CANCELLED }, paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS }) === false,
        'a cancelled order is never cleared for production',
    )

    // the tagging push no longer stamps anything — the rule they reversed
    const fsrc = require('fs').readFileSync('services/handoff.service.js', 'utf8')
    ok(
        !/order.productionStartedAt = new Date()/.test(fsrc),
        'the handoff push no longer starts the clock (the reversed rule is gone)',
    )


    // ── A5: queue order ──────────────────────────────────────────────────────
    console.log('\nA5 — production queues sort by delivery deadline, earliest first')
    ok(
        QUEUE_SORT.deliveryDate === 1 && QUEUE_SORT.createdAt === 1,
        `the shared sort is deadline-then-age (${JSON.stringify(QUEUE_SORT)})`,
    )
    const fs = require('fs')
    const stationFiles = [
        'services/sortAndPretreat.service.js',
        'services/washAndDry.service.js',
        'services/pressAndIron.service.js',
        'services/qc.service.js',
    ]
    for (const f of stationFiles) {
        const src = fs.readFileSync(f, 'utf8')
        ok(
            /require\('\.\.\/util\/queueSort'\)/.test(src),
            `${f.split('/')[1]} reads the shared sort`,
        )
    }
    // §3 Q6: Sort & Pretreat was the odd one out, showing NEWEST first.
    const sp = fs.readFileSync('services/sortAndPretreat.service.js', 'utf8')
    const queueBlock = sp.slice(sp.indexOf('async getOrderQueue'), sp.indexOf('async getOrderQueue') + 2500)
    ok(
        /sort: QUEUE_SORT/.test(queueBlock),
        '*** Sort & Pretreat no longer shows newest-first — the Q6 inconsistency is gone ***',
    )

    // and it really orders that way against the database
    const far = await mkOrder('Q_FAR', {
        deliveryDate: new Date(now.getTime() + 72 * HOUR),
        stage: { status: ORDER_STATUS.SORT_AND_PRETREAT },
    })
    const near = await mkOrder('Q_NEAR', {
        deliveryDate: new Date(now.getTime() + 6 * HOUR),
        stage: { status: ORDER_STATUS.SORT_AND_PRETREAT },
    })
    const rows = await BookOrderModel.find({
        _id: { $in: [far._id, near._id] },
    })
        .sort(QUEUE_SORT)
        .select('oscNumber deliveryDate')
        .lean()
    ok(
        rows[0]?.oscNumber === `OSC-A${STAMP}-Q_NEAR`,
        'the order due soonest comes first, even though it was created last',
    )

    // ── A7: delivery address same as pickup ──────────────────────────────────
    console.log('\nA7 — "delivery address is the same as pickup"')
    const BookOrderService = require('./services/bookOrder.service')
    const customer = await UserModel.create({
        email: `stg_a_cust_${STAMP}@example.com`,
        fullName: 'STG A Customer',
        phoneNumber: `0806${String(STAMP).slice(-7)}`,
        userType: ROLE.USER,
        isVerified: true,
    })
    created.users.push(customer._id)

    const pickup = {
        label: 'Home',
        address: '12 Adeola Odeku Street, Victoria Island',
        landmark: 'Opposite the blue filling station',
    }
    const svc = new BookOrderService()
    const booked = await svc.createOrder({
        userId: String(customer._id),
        payload: {
            fullName: 'STG A Customer',
            phoneNumber: customer.phoneNumber,
            serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
            serviceTier: SERVICE_TIERS.CLASSIC,
            deliverySpeed: DELIVERY_SPEED.STANDARD,
            channel: ORDER_CHANNEL.WEBSITE,
            billingType: 'pay-per-item',
            paymentMethod: 'wallet',
            items: [{ type: 'shirt', price: 1000, quantity: 2 }],
            isPickUp: true,
            pickupAddress: pickup,
            deliverySameAsPickup: true,
            pickupDate: new Date(Date.now() + 24 * HOUR),
            pickupTime: '10am-12pm',
        },
    })
    if (booked?.success && booked.data?.order?._id) {
        created.orders.push(booked.data.order._id)
    }
    ok(
        booked?.success === true,
        `booking with the tick box succeeds without any delivery fields${booked?.success ? '' : ` — ${JSON.stringify(booked?.data)}`}`,
    )
    const bookedOrder = booked?.data?.order
    ok(
        bookedOrder?.deliveryAddress?.address === pickup.address,
        'the delivery address was filled from the pickup address',
    )
    ok(
        bookedOrder?.deliveryAddress?.landmark === pickup.landmark,
        '*** including the landmark, so the delivery landmark rule is satisfied by the copy ***',
    )
    ok(bookedOrder?.isDelivery === true, 'and isDelivery defaulted to true')

    // without the tick box and without a delivery landmark, it is still refused
    const refused = await svc.createOrder({
        userId: String(customer._id),
        payload: {
            fullName: 'STG A Customer',
            phoneNumber: customer.phoneNumber,
            serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
            serviceTier: SERVICE_TIERS.CLASSIC,
            deliverySpeed: DELIVERY_SPEED.STANDARD,
            channel: ORDER_CHANNEL.WEBSITE,
            billingType: 'pay-per-item',
            paymentMethod: 'wallet',
            items: [{ type: 'shirt', price: 1000, quantity: 2 }],
            isPickUp: true,
            isDelivery: true,
            pickupAddress: pickup,
            deliveryAddress: { address: '9 Somewhere Else Road' },
            pickupDate: new Date(Date.now() + 24 * HOUR),
            pickupTime: '10am-12pm',
        },
    })
    ok(
        refused?.success === false &&
            /landmark/i.test(JSON.stringify(refused?.data || '')),
        'a different delivery address with no landmark is still refused',
    )

    // ── A1: the dormant card ─────────────────────────────────────────────────
    console.log('\nA1 — dormant rate unchanged, card renamed')
    const CrmService = require('./services/crm.service')
    const metrics = (await CrmService.getMetrics({ query: {} })).data?.message
    ok(
        metrics?.dormantRateLabel === 'Dormant share of customers',
        `the card name ships from the backend (got "${metrics?.dormantRateLabel}")`,
    )
    ok(
        typeof metrics?.dormantRate === 'number',
        'the figure itself is untouched and still a number',
    )
    ok(
        metrics?.dormantWindowDays === 30,
        `and the 30-day window is published beside it (got ${metrics?.dormantWindowDays})`,
    )
}

/**
 * A SERVICE TYPE'S NAME IS A PRICING KEY (client decision 2026-10-09, option 1).
 *
 * An order stores `serviceType: "wash-and-iron"` and pricing finds its price by
 * matching that string against `serviceTypes[].name`. The fallback when nothing
 * matches is a multiplier of **1**, so renaming a type did not throw — it
 * silently under-priced every order already placed under the old name.
 * `updateAdminSettings` $sets whatever it is given with `runValidators: false`,
 * so nothing stopped it.
 *
 * The guard is written against the CONSEQUENCE, not the word "rename": it
 * refuses when a name orders depend on would DISAPPEAR. That also catches
 * delete-and-re-add, which has the identical effect and walks straight through
 * a pairwise name comparison — asserted below, because that bypass is the whole
 * reason the check is shaped this way.
 */
async function serviceTypeNameGuard() {
    console.log('\nService type names are pricing keys, not labels')
    const AdminSettingModel = require('./models/adminSetting.model')
    const before = await AdminSettingModel.findOne({}).lean()
    const saved = (before.serviceTypes || []).map((s) => ({
        name: s.name,
        pricePerPiece: s.pricePerPiece,
    }))
    if (!saved.length) {
        ok(false, 'no service types configured — cannot test the guard')
        return
    }
    const used = saved[0].name

    // An order that depends on the first service type.
    const order = await BookOrderModel.create({
        oscNumber: `OSC-A${STAMP}-STG-RENAME`,
        fullName: 'Rename Guard',
        phoneNumber: '08050000913',
        serviceType: used,
        serviceTier: SERVICE_TIERS.CLASSIC,
        deliverySpeed: DELIVERY_SPEED.STANDARD,
        channel: ORDER_CHANNEL.OFFICE,
        amount: 1000,
        items: [{ type: 'shirt', price: 700, quantity: 1 }],
    })
    created.orders.push(order._id)

    try {
        let res = await admin.updateAdminSettings({
            body: {
                serviceTypes: saved.map((t) =>
                    t.name === used ? { ...t, name: 'Wash & Press' } : t,
                ),
            },
        })
        ok(
            !res.success && /cannot be changed or removed/i.test(res.data?.error || ''),
            'renaming an in-use service type is refused',
        )
        ok(
            res.data?.blockedServiceTypes?.[0]?.name === used &&
                res.data.blockedServiceTypes[0].orders >= 1,
            'the refusal names the type and how many orders depend on it',
        )
        ok(
            res.data?.useInstead === '/api/admin/display-names',
            'and points the admin at the renaming feature instead',
        )

        res = await admin.updateAdminSettings({
            body: {
                serviceTypes: [
                    ...saved.filter((t) => t.name !== used),
                    { name: 'Wash And Press', pricePerPiece: 700 },
                ],
            },
        })
        ok(
            !res.success && /cannot be changed or removed/i.test(res.data?.error || ''),
            'delete-and-re-add under a new name is refused too (the bypass)',
        )

        // What must STILL work, or the guard has broken normal admin work.
        res = await admin.updateAdminSettings({
            body: {
                serviceTypes: saved.map((t) =>
                    t.name === used ? { ...t, pricePerPiece: 777 } : t,
                ),
            },
        })
        const priced = await AdminSettingModel.findOne({}).lean()
        ok(
            res.success &&
                priced.serviceTypes.find((t) => t.name === used)?.pricePerPiece === 777,
            'changing a service type PRICE is still allowed',
        )

        res = await admin.updateAdminSettings({
            body: {
                serviceTypes: [...saved, { name: `stg-${STAMP}-starch`, pricePerPiece: 900 }],
            },
        })
        ok(res.success, 'adding a NEW service type is still allowed')

        res = await admin.updateAdminSettings({ body: { serviceTypes: saved } })
        const pruned = await AdminSettingModel.findOne({}).lean()
        ok(
            res.success &&
                !pruned.serviceTypes.some((t) => t.name === `stg-${STAMP}-starch`),
            'removing an UNUSED service type is still allowed',
        )

        res = await admin.updateAdminSettings({ body: { pickupFee: before.pickupFee } })
        ok(res.success, 'a settings update that sends no serviceTypes is unaffected')
    } finally {
        // The harness edits the real settings document, so put the service
        // types and their prices back exactly as they were found.
        await AdminSettingModel.updateOne(
            { _id: before._id },
            { $set: { serviceTypes: before.serviceTypes } },
        )
        const after = await AdminSettingModel.findOne({}).lean()
        ok(
            JSON.stringify(after.serviceTypes.map((t) => [t.name, t.pricePerPiece])) ===
                JSON.stringify(before.serviceTypes.map((t) => [t.name, t.pricePerPiece])),
            'service types restored exactly as found',
        )
    }
}

async function cleanup() {
    await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
    await PaymentModel.deleteMany({ _id: { $in: created.payments } })
    await UserModel.deleteMany({ _id: { $in: created.users } })
    const left = await BookOrderModel.countDocuments({
        oscNumber: new RegExp(`OSC-A${STAMP}-`),
    })
    ok(left === 0, 'cleanup left nothing behind')
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
    if (!url) {
        console.error('MONGODB_URL not set.')
        process.exit(2)
    }
    const dbName = (url.match(/\/([A-Za-z0-9_-]+)(\?|$)/) || [])[1] || '<unknown>'
    console.log('Target DB name:', dbName)
    if (/laundrydb/i.test(dbName)) {
        console.error('*** "laundrydb" is the LIVE database. Refusing. ***')
        process.exit(2)
    }
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })
    try {
        await run()
        await serviceTypeNameGuard()
    } catch (error) {
        FAIL++
        console.error('\n  ✗ THREW:', error)
    } finally {
        try {
            await cleanup()
        } catch (error) {
            FAIL++
            console.error('  ✗ cleanup failed:', error.message)
        }
        await mongoose.disconnect()
    }
    console.log(`\n${PASS} passed, ${FAIL} failed`)
    process.exit(FAIL ? 1 : 0)
}

main()
