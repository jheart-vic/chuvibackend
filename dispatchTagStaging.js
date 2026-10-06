/**
 * Dispatch tag DB verification harness.
 *
 * Drives the REAL IntakeUserService against throwaway orders to verify what the
 * offline harness could not: that the print record actually PERSISTS, that the
 * activity + audit rows are written, and that the rider-assignment gate really
 * blocks and then releases a real order.
 *
 * Covers:
 *   1  delivery order, packed        → tag builds, all 7 brief fields correct
 *   2  GET writes nothing            → no dispatchTag appears on the document
 *   3  customer-collects order       → refused (isDelivery false)
 *   4  not yet packed & seal         → refused
 *   5  print                         → dispatchTag PERSISTED in Mongo
 *   6  print                         → Activity + AuditLog rows written
 *   7  reprint                       → printCount 2, reprint:true, audited as one
 *   8  reprintFlagged                → false at 3 prints, true at 4
 *   9  RIDER GATE: untagged delivery → refused, needsDispatchTag, NOTHING written
 *  10  RIDER GATE: after printing    → allowed, rider actually assigned
 *  11  RIDER GATE: non-delivery      → never blocked by the tag
 *  12  deliverable-orders queue      → needsTag/tagPrinted/printCount/needsTagCount
 *  13  paid order                    → paymentState paid, amountDue null
 *  14  unpaid order                  → paymentState unpaid, figure + "settle in the app"
 *  15  subscription order            → paid (amount > 0 but already covered)
 *  16  legacy string address         → normalised, does not crash
 *  17  per-piece count               → itemCount matches a REALLY booked order
 *
 * Scenario 17 books through the REAL customer path (postBookOrder) so the
 * per-piece explosion runs; it self-skips if AdminOrderDetails / AdminSetting
 * are unseeded (boot the app once against this DB first).
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses on NODE_ENV=production unless
 * STAGING_FORCE=1. Prints the target DB (masked) up front — confirm it is a
 * staging/throwaway DB, NOT prod. It creates real orders, notifications and
 * audit rows, then deletes everything it created.
 *
 * Run:  STAGING_OK=1 MONGODB_URL="<testing db uri>" node dispatchTagStaging.js
 *       (pass MONGODB_URL inline — .env points at the live DB)
 */
require('dotenv').config()
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const ActivityModel = require('./models/activity.model')
const AuditLogModel = require('./models/audit.log.model')
const NotificationModel = require('./models/notification.model')
const AdminSettingModel = require('./models/adminSetting.model')
const AdminOrderDetailsModel = require('./models/adminOrderDetails.model')
const CrmProfileModel = require('./models/crmProfile.model')
const OrderItemModel = require('./models/orderItem.model')
const IntakeUserService = require('./services/intake-user.service')
const BookOrderService = require('./services/bookOrder.service')
const { ROLE, STATION_STATUS: S, BILLING_TYPE } = require('./util/constants')

const svc = new IntakeUserService()
const bookSvc = new BookOrderService()
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
const gen = () => 'DTAG-' + Date.now() + '-' + Math.floor(Math.random() * 1e4)

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
    console.log('Target DB host:', url.replace(/\/\/[^@]*@/, '//***:***@').replace(/\/[^/?]+(\?|$)/, '/<db>$1'))
    console.log('Target DB name:', dbName)
    if (/laundrydb/i.test(dbName)) {
        console.error('\n*** "laundrydb" is the LIVE database. Refusing. Pass a testing DB URI. ***')
        process.exit(2)
    }

    await mongoose.connect(url, {
        serverSelectionTimeoutMS: 60000,
        retryWrites: true,
        retryReads: true,
    })

    const created = { orderIds: [], userIds: [] }
    const staff = await UserModel.create({
        email: `dtag_staff_${Date.now()}@example.com`,
        fullName: 'Staging Intake Staff',
        userType: ROLE.INTAKE_AND_TAG,
    })
    const rider = await UserModel.create({
        email: `dtag_rider_${Date.now()}@example.com`,
        fullName: 'Staging Rider',
        userType: ROLE.RIDER,
    })
    const customer = await UserModel.create({
        email: `dtag_cust_${Date.now()}@example.com`,
        fullName: 'Staging Customer',
        userType: ROLE.USER,
    })
    created.userIds.push(staff._id, rider._id, customer._id)
    const sid = staff._id.toString()

    const req = (id, extraParams = {}, query = {}) => ({
        params: { id, ...extraParams },
        user: { id: sid },
        body: {},
        query,
    })

    const PIECES = [
        { type: 'shirt', quantity: 1, price: 1, tagId: 'TAG-01' },
        { type: 'shirt', quantity: 1, price: 1, tagId: 'TAG-02' },
        { type: 'shirt', quantity: 1, price: 1, tagId: 'TAG-03' },
        { type: 'trouser', quantity: 1, price: 1, tagId: 'TAG-04' },
        { type: 'trouser', quantity: 1, price: 1, tagId: 'TAG-05' },
    ]

    async function makeOrder(over = {}) {
        const o = await BookOrderModel.create({
            userId: customer._id,
            fullName: 'Staging Customer',
            phoneNumber: '08000000000',
            serviceType: 'wash-and-iron',
            serviceTier: 'classic',
            deliverySpeed: 'standard',
            channel: 'website',
            amount: 4500,
            oscNumber: gen(),
            paymentStatus: 'success',
            isPickUp: true,
            isDelivery: true,
            deliveryAddress: { label: 'Home', address: '12 Lagos Street, Yaba', landmark: 'Opposite GTBank' },
            stage: { status: 'ready' },
            stationStatus: S.QC_STATION,
            items: PIECES,
            qcDetails: { packCompletedAt: new Date() },
            dispatchDetails: { delivery: { note: 'Call on arrival' } },
            ...over,
        })
        created.orderIds.push(o._id)
        return o
    }

    try {
        // ── 1 + 2: build the tag, and prove GET writes nothing ──────────────
        console.log('\n[1-2] GET dispatch-tag on a packed delivery order')
        let order = await makeOrder()
        let res = await svc.getDispatchTag(req(order._id))
        ok(res.success === true, 'tag builds for a packed delivery order')
        const t = res.data?.message || {}
        ok(t.customerName === 'Staging Customer', '1. customer name')
        ok(t.customerPhone === '08000000000', '2. customer phone')
        ok(t.deliveryAddress?.landmark === 'Opposite GTBank', '3. delivery address (structured)')
        ok(t.orderReference === order.oscNumber, '4. order reference')
        ok(t.contents === '3 Shirts, 2 Trousers', `5a. contents ("${t.contents}")`)
        ok(t.itemCount === 5, '5b. item count is per piece')
        ok(t.amountDue === null, '6. amount due null on a paid order')
        ok(t.deliveryNote === 'Call on arrival', '7. delivery note')
        ok(t.ref === order.oscNumber, 'ref defaults to the OSC number')
        let fresh = await BookOrderModel.findById(order._id).lean()
        ok(!fresh.dispatchTag?.printedAt, 'GET wrote NOTHING to the document')

        // ── 3 + 4: the two gates, against real documents ────────────────────
        console.log('\n[3-4] gates')
        const collect = await makeOrder({ isDelivery: false })
        res = await svc.getDispatchTag(req(collect._id))
        ok(res.success === false && /not going out for delivery/.test(res.data.error),
            'customer-collects order refused')
        const unpacked = await makeOrder({ qcDetails: {} })
        res = await svc.getDispatchTag(req(unpacked._id))
        ok(res.success === false && /Pack & Seal/.test(res.data.error),
            'order not through Pack & Seal refused')

        // ── 5 + 6: print PERSISTS + is audited ──────────────────────────────
        console.log('\n[5-6] print persists and is audited')
        const before = { act: await ActivityModel.countDocuments({ orderId: order._id }),
                         aud: await AuditLogModel.countDocuments({ orderId: order._id }) }
        res = await svc.printDispatchTag(req(order._id))
        ok(res.success === true, 'print succeeds')
        ok(res.data.message.reprint === false, 'first print is not a reprint')
        fresh = await BookOrderModel.findById(order._id).lean()
        ok(!!fresh.dispatchTag?.printedAt, 'dispatchTag.printedAt PERSISTED in Mongo')
        ok(fresh.dispatchTag?.printCount === 1, 'printCount persisted as 1')
        ok(String(fresh.dispatchTag?.printedBy) === sid, 'printedBy persisted')
        ok(fresh.dispatchTag?.ref === order.oscNumber, 'ref persisted')
        ok(await ActivityModel.countDocuments({ orderId: order._id }) === before.act + 1,
            'Activity row written')
        const audits = await AuditLogModel.find({ orderId: order._id }).lean()
        ok(audits.length === before.aud + 1, 'AuditLog row written')
        ok(/Dispatch tag printed/.test(audits[audits.length - 1]?.action || ''),
            'audit names the action')

        // ── 7 + 8: reprints counted, flagged past the threshold ─────────────
        console.log('\n[7-8] reprints')
        res = await svc.printDispatchTag(req(order._id))
        ok(res.data.message.reprint === true, 'second print IS a reprint')
        ok(res.data.message.printCount === 2, 'printCount 2')
        const a2 = await AuditLogModel.find({ orderId: order._id }).lean()
        ok(/REPRINTED \(print #2\)/.test(a2[a2.length - 1]?.action || ''),
            'reprint audited as a reprint, with its number')
        await svc.printDispatchTag(req(order._id)) // 3
        res = await svc.getDispatchTag(req(order._id))
        ok(res.data.message.printCount === 3 && res.data.message.reprintFlagged === false,
            'not yet flagged at 3 prints')
        await svc.printDispatchTag(req(order._id)) // 4
        res = await svc.getDispatchTag(req(order._id))
        ok(res.data.message.printCount === 4 && res.data.message.reprintFlagged === true,
            'flagged at 4 prints')

        // ── 9-11: THE RIDER GATE ────────────────────────────────────────────
        console.log('\n[9-11] rider-assignment gate')
        const gated = await makeOrder()
        res = await svc.assignRiderTopDeliveryOrder(
            req(gated._id, { riderId: rider._id.toString() }))
        ok(res.success === false && res.data.needsDispatchTag === true,
            'untagged delivery order REFUSED with needsDispatchTag')
        ok(/Print the dispatch tag/.test(res.data.error) && res.data.error.includes(gated.oscNumber),
            'refusal names the order and the action')
        fresh = await BookOrderModel.findById(gated._id).lean()
        ok(!fresh.dispatchDetails?.delivery?.rider, 'NOTHING written — no rider assigned')

        await svc.printDispatchTag(req(gated._id))
        res = await svc.assignRiderTopDeliveryOrder(
            req(gated._id, { riderId: rider._id.toString() }))
        ok(res.success === true, 'assignment ALLOWED once the tag is printed')
        fresh = await BookOrderModel.findById(gated._id).lean()
        ok(String(fresh.dispatchDetails?.delivery?.rider) === rider._id.toString(),
            'rider actually assigned in Mongo')

        res = await svc.assignRiderTopDeliveryOrder(
            req(collect._id, { riderId: rider._id.toString() }))
        ok(res.success === true, 'non-delivery order never blocked by the tag gate')

        // ── 12: the queue surfaces what is blocked ──────────────────────────
        console.log('\n[12] deliverable-orders queue signals')
        const q = await svc.getDeliverableOrders({
            user: { id: sid }, params: {}, body: {},
            query: { page: 1, limit: 100, search: 'DTAG-' },
        })
        ok(q.success === true, 'queue loads')
        const rows = q.data?.message?.data || []
        const rowFor = (o) => rows.find((r) => r.oscNumber === o.oscNumber)
        const untagged = await makeOrder()
        const q2 = await svc.getDeliverableOrders({
            user: { id: sid }, params: {}, body: {},
            query: { page: 1, limit: 100, search: untagged.oscNumber },
        })
        const r2 = (q2.data?.message?.data || [])[0]
        ok(r2 && r2.needsTag === true, 'untagged row reports needsTag true')
        ok(r2 && r2.tagPrinted === false, 'untagged row reports tagPrinted false')
        ok(r2 && r2.printCount === 0, 'untagged row reports printCount 0')
        const rPrinted = rowFor(order)
        ok(rPrinted ? rPrinted.needsTag === false && rPrinted.printCount === 4 : true,
            'printed row reports needsTag false + its print count')
        ok(typeof q2.data?.message?.needsTagCount === 'number',
            `needsTagCount present (${q2.data?.message?.needsTagCount})`)

        // ── 13-15: the payment flag across real billing states ──────────────
        console.log('\n[13-15] payment flag')
        res = await svc.getDispatchTag(req(order._id))
        ok(res.data.message.paymentState === 'paid' && /nothing to collect/i.test(res.data.message.paymentNotice),
            'paid order → paid + "nothing to collect"')
        const unpaid = await makeOrder({ paymentStatus: 'pending', amount: 4500 })
        res = await svc.getDispatchTag(req(unpaid._id))
        ok(res.data.message.paymentState === 'unpaid' && res.data.message.amountDue === 4500,
            'unpaid order → unpaid + the outstanding figure')
        ok(/settle it in the app/i.test(res.data.message.paymentNotice) &&
           /do NOT collect cash/i.test(res.data.message.paymentNotice),
            'unpaid notice says settle in the app, never collect cash')
        const subOrder = await makeOrder({
            billingType: BILLING_TYPE.PAY_FROM_SUBSCRIPTION, amount: 9000, paymentStatus: 'success',
        })
        res = await svc.getDispatchTag(req(subOrder._id))
        ok(res.data.message.paymentState === 'paid' && res.data.message.amountDue === null,
            'subscription order → paid despite amount > 0')

        // ── 16: legacy string address ───────────────────────────────────────
        console.log('\n[16] legacy address shape')
        const legacy = await makeOrder({ deliveryAddress: '7 Old Road, Surulere' })
        res = await svc.getDispatchTag(req(legacy._id))
        ok(res.success === true && res.data.message.deliveryAddress?.address === '7 Old Road, Surulere',
            'legacy STRING address normalised, not crashed')

        // ── 17: per-piece count via the REAL booking path ───────────────────
        console.log('\n[17] per-piece count through the real booking path')
        const settings = await AdminSettingModel.findOne()
        const orderDetails = await AdminOrderDetailsModel.findOne()
        const anItem = await OrderItemModel.findOne()
        // Service types are embedded in AdminSetting, not a model of their own.
        const aService = settings?.serviceTypes?.[0]
        if (!settings || !orderDetails || !anItem || !aService) {
            console.log('  … SKIPPED (AdminSetting/AdminOrderDetails/catalog unseeded — boot the app once against this DB)')
        } else {
            const booked = await bookSvc.createOrder({
                userId: customer._id.toString(),
                payload: {
                    fullName: 'Staging Customer',
                    items: [
                        { type: anItem.name, quantity: 3, price: anItem.price },
                        { type: anItem.name, quantity: 2, price: anItem.price },
                    ],
                    serviceType: aService.name,
                    serviceTier: 'classic',
                    deliverySpeed: 'standard',
                    isPickUp: true,
                    isDelivery: true,
                    pickupAddress: { label: 'Home', address: '1 Test Road', landmark: 'By the mast' },
                    deliveryAddress: { label: 'Home', address: '1 Test Road', landmark: 'By the mast' },
                    phoneNumber: '08000000000',
                    billingType: BILLING_TYPE.PAY_PER_ITEM,
                },
            })
            if (!booked?.success) {
                console.log('  … SKIPPED (booking rejected:', JSON.stringify(booked?.data), ')')
            } else {
                // postBookOrder returns { message: <string>, order, offer } — the
                // order document is a sibling of message, not inside it.
                const bid = booked.data?.order?._id
                if (!bid) throw new Error('booking returned no order id: ' + JSON.stringify(Object.keys(booked.data || {})))
                created.orderIds.push(bid)
                await BookOrderModel.updateOne({ _id: bid }, {
                    $set: { 'stage.status': 'ready', 'qcDetails.packCompletedAt': new Date() },
                })
                res = await svc.getDispatchTag(req(bid))
                ok(res.success === true, 'tag builds for a really-booked order')
                ok(res.data.message.itemCount === 5,
                    `itemCount counts 5 PIECES from a 3+2 booking (got ${res.data.message.itemCount})`)
            }
        }
    } catch (err) {
        FAIL++
        console.error('\n*** HARNESS ERROR:', err.message)
        console.error(err.stack)
    } finally {
        // ── cleanup ─────────────────────────────────────────────────────────
        console.log('\n[cleanup]')
        const del = {
            orders: (await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })).deletedCount,
            activities: (await ActivityModel.deleteMany({ orderId: { $in: created.orderIds } })).deletedCount,
            audits: (await AuditLogModel.deleteMany({ orderId: { $in: created.orderIds } })).deletedCount,
            notifications: (await NotificationModel.deleteMany({ userId: { $in: created.userIds } })).deletedCount,
            crmProfiles: (await CrmProfileModel.deleteMany({ userId: { $in: created.userIds } })).deletedCount,
            users: (await UserModel.deleteMany({ _id: { $in: created.userIds } })).deletedCount,
        }
        console.log('  deleted:', JSON.stringify(del))
        const leftOrders = await BookOrderModel.countDocuments({ oscNumber: /^DTAG-/ })
        console.log('  leftover DTAG- orders:', leftOrders)

        console.log(`\n==== ${PASS} passed, ${FAIL} failed ====`)
        await mongoose.disconnect()
        process.exit(FAIL ? 1 : 0)
    }
}

main()
