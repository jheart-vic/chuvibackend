/**
 * "Ready by" on every list (FE 17 Oct) — DB verification.
 *
 * Each list below must carry `readyBy` ({ text: "Ready by Wed 4 PM", at }) and
 * `speedLabel` on its rows, as the station lists already do:
 *   Intake: get-pending-orders, pickable-orders, deliverable-orders,
 *           tagging-queue, quick-bookings, orders/hold
 *   Admin:  hold-orders
 *   Rider:  assigned-pickups, active-pickups, assigned-deliveries,
 *           active-deliveries, order detail
 *
 * SMS stubbed. SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production
 * without STAGING_FORCE=1; hard-refuses laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node readyByListsStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: async () => ({ stubbed: true }) }
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const IntakeUserService = require('./services/intake-user.service')
const AdminService = require('./services/admin.service')
const RiderService = require('./services/rider.service')
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
    const created = { orders: [], users: [] }
    try {
        const mkUser = async (userType, n) => {
            const u = await UserModel.collection.insertOne({
                fullName: `STG RB ${userType} ${ts}`,
                email: `stg-rb-${n}-${ts}@example.com`,
                phoneNumber: `0807${String(ts).slice(-6)}${n}`,
                userType,
                createdAt: new Date(),
            })
            created.users.push(u.insertedId)
            return String(u.insertedId)
        }
        const s1 = await mkUser(C.ROLE.INTAKE_AND_TAG, 1)
        const admin = await mkUser(C.ROLE.ADMIN, 2)
        const rider = await mkUser(C.ROLE.RIDER, 3)

        // Ready Wednesday 21 Oct 2026, 16:00 Lagos.
        const readyAt = new Date(2026, 9, 21, 16, 0, 0)
        let n = 0
        const mkOrder = async (extra = {}, itemExtra = {}) => {
            n++
            const osc = `STGRB${ts}${n}`
            const r = await BookOrderModel.collection.insertOne({
                fullName: 'STG RB customer',
                phoneNumber: '08070000000',
                amount: 1200,
                oscNumber: osc,
                serviceType: C.ORDER_SERVICE_TYPE.WASH_AND_IRON,
                deliverySpeed: C.DELIVERY_SPEED.EXPRESS,
                deliveryDate: readyAt,
                items: [{ _id: new mongoose.Types.ObjectId(), type: 'Shirt', price: 600, quantity: 1, actionLog: [], ...itemExtra }],
                stage: { status: C.ORDER_STATUS.QUEUE, note: '', updatedAt: new Date() },
                stageHistory: [],
                stationStatus: C.STATION_STATUS.INTAKE_AND_TAG_STATION,
                paymentStatus: C.PAYMENT_ORDER_STATUS.SUCCESS,
                channel: C.ORDER_CHANNEL.WEBSITE,
                handoffs: [],
                createdAt: new Date(),
                ...extra,
            })
            created.orders.push(r.insertedId)
            return { id: String(r.insertedId), osc }
        }
        const stage = (status) => ({ status, note: '', updatedAt: new Date() })

        const intake = new IntakeUserService()
        const adminSvc = new AdminService()
        const riderSvc = new RiderService()
        const asIntake = (q = {}) => ({ query: q, params: {}, body: {}, user: { id: s1, userType: C.ROLE.INTAKE_AND_TAG } })
        const asRider = (q = {}, params = {}) => ({ query: q, params, body: {}, user: { id: rider, userType: C.ROLE.RIDER } })

        const rowsOf = (r) => r?.data?.message?.data || []
        const check = (label, res, osc) => {
            const row = rowsOf(res).find((o) => o.oscNumber === osc)
            ok(!!row, `${label}: the order is listed (${res?.data?.error || 'ok'})`)
            if (!row) return
            ok(row.readyBy?.text === 'Ready by Wed 4 PM', `${label}: readyBy "${row.readyBy?.text}"`)
            ok(typeof row.speedLabel === 'string' && row.speedLabel.length > 0, `${label}: speedLabel "${row.speedLabel}"`)
        }

        console.log('\nIntake lists')
        const pending = await mkOrder({ stage: stage(C.ORDER_STATUS.PENDING) })
        check('get-pending-orders', await intake.getPendingOrders(asIntake({ search: pending.osc })), pending.osc)

        const tagging = await mkOrder({ stage: stage(C.ORDER_STATUS.QUEUE) })
        check('tagging-queue', await intake.getTaggingQueue(asIntake({ search: tagging.osc })), tagging.osc)

        const quick = await mkOrder({ stage: stage(C.ORDER_STATUS.PENDING), itemsPending: true, quickBooking: true })
        check('quick-bookings', await intake.getQuickBookingQueue(asIntake({ search: quick.osc })), quick.osc)

        const pick = await mkOrder({
            stage: stage(C.ORDER_STATUS.PENDING),
            isPickUp: true,
            dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PENDING } },
        })
        check('pickable-orders', await intake.getPickableOrders(asIntake({ search: pick.osc })), pick.osc)

        const deliv = await mkOrder({
            stage: stage(C.ORDER_STATUS.READY),
            isDelivery: true,
            dispatchDetails: { delivery: { status: C.DELIVERY_STATUS.READY } },
        })
        check('deliverable-orders', await intake.getDeliverableOrders(asIntake({ search: deliv.osc })), deliv.osc)

        const held = await mkOrder(
            { stage: stage(C.ORDER_STATUS.WASHING), stationStatus: C.STATION_STATUS.WASH_AND_DRY_STATION },
            {
                currentStation: C.STATION_STATUS.WASH_AND_DRY_STATION,
                flaggedForReview: true,
                holdDetails: { reason: 'quality_not_met', note: 'stg', assignTo: C.ROLE.INTAKE_AND_TAG, heldAt: new Date(), heldByStation: C.STATION_STATUS.WASH_AND_DRY_STATION },
            },
        )
        check('orders/hold (Intake)', await intake.getHoldQueue(asIntake({ search: held.osc })), held.osc)

        console.log('\nStation hold lists')
        const stations = [
            ['qc', require('./services/qc.service'), C.STATION_STATUS.QC_STATION, C.ORDER_STATUS.QC],
            ['sort', require('./services/sortAndPretreat.service'), C.STATION_STATUS.SORT_AND_PRETREAT_STATION, C.ORDER_STATUS.SORTING || 'sorting'],
            ['wash', require('./services/washAndDry.service'), C.STATION_STATUS.WASH_AND_DRY_STATION, C.ORDER_STATUS.WASHING],
            ['press', require('./services/pressAndIron.service'), C.STATION_STATUS.PRESSING_AND_IRONING_STATION, C.ORDER_STATUS.IRONING],
        ]
        for (const [name, svc, station, status] of stations) {
            const o = await mkOrder(
                { stage: stage(status), stationStatus: station },
                {
                    currentStation: station,
                    flaggedForReview: true,
                    holdDetails: { reason: 'quality_not_met', note: 'stg', assignTo: C.ROLE.INTAKE_AND_TAG, heldAt: new Date(), heldByStation: station },
                },
            )
            check(`orders/hold (${name})`, await svc.getHoldQueue(asIntake({ search: o.osc })), o.osc)
        }

        console.log('\nAdmin hold rows')
        const adminRes = await adminSvc.getHoldOrders({ query: { type: 'activeHolds', limit: 500 }, user: { id: admin, userType: C.ROLE.ADMIN } })
        check('hold-orders (admin)', adminRes, held.osc)

        console.log('\nRider lists and detail')
        const rp = await mkOrder({
            stage: stage(C.ORDER_STATUS.PENDING),
            isPickUp: true,
            dispatchDetails: { pickup: { status: C.PICKUP_STATUS.SCHEDULED, rider: new mongoose.Types.ObjectId(rider) } },
        })
        check('assigned-pickups', await riderSvc.getRiderAssignedPickups(asRider()), rp.osc)
        const ap = await mkOrder({
            stage: stage(C.ORDER_STATUS.PENDING),
            isPickUp: true,
            dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKUP_IN_PROGRESS, rider: new mongoose.Types.ObjectId(rider) } },
        })
        check('active-pickups', await riderSvc.getActivePickups(asRider()), ap.osc)
        const rd = await mkOrder({
            stage: stage(C.ORDER_STATUS.READY),
            isDelivery: true,
            dispatchDetails: { delivery: { status: C.DELIVERY_STATUS.READY, rider: new mongoose.Types.ObjectId(rider) } },
        })
        check('assigned-deliveries', await riderSvc.getRiderAssignedDeliveries(asRider()), rd.osc)
        const ad = await mkOrder({
            stage: stage(C.ORDER_STATUS.OUT_FOR_DELIVERY),
            isDelivery: true,
            dispatchDetails: { delivery: { status: C.DELIVERY_STATUS.OUT_FOR_DELIVERY, rider: new mongoose.Types.ObjectId(rider) } },
        })
        check('active-deliveries', await riderSvc.getActiveDeliveries(asRider()), ad.osc)

        const det = await riderSvc.getOrderDetails(asRider({}, { id: rd.id }))
        const d = det?.data?.message
        ok(d?.readyBy?.text === 'Ready by Wed 4 PM', `rider order detail: readyBy "${d?.readyBy?.text}" (${det?.data?.error || 'ok'})`)
        ok(typeof d?.speedLabel === 'string' && d.speedLabel.length > 0, `rider order detail: speedLabel "${d?.speedLabel}"`)
        ok(d?.deliveryPromise !== undefined, 'rider order detail still has its deliveryPromise')
    } finally {
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        await UserModel.deleteMany({ _id: { $in: created.users } })
        await mongoose.disconnect()
        console.log(`readyByListsStaging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
    }
}

main().then(
    () => process.exit(FAIL ? 1 : 0),
    (e) => {
        console.error(e)
        process.exit(1)
    },
)
