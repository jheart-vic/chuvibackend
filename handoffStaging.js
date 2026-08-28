/**
 * Split-flow (Phase 3) DB verification harness.
 *
 * Drives the REAL HandoffService + the REAL station queue services against a
 * throwaway order, covering the 12-scenario matrix in context/feature.md, then
 * deletes everything it created.
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses on NODE_ENV=production unless
 * STAGING_FORCE=1. Prints the target DB host (masked) up front — confirm it is
 * a staging/throwaway DB, NOT prod. It creates real orders + notifications.
 *
 * Run:  STAGING_OK=1 node handoffStaging.js
 */
require('dotenv').config()
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const NotificationModel = require('./models/notification.model')
const { STATION_STATUS: S, ROLE } = require('./util/constants')
const HandoffService = require('./services/handoff.service')
const SortService = require('./services/sortAndPretreat.service')
const WashService = require('./services/washAndDry.service')
const PressService = require('./services/pressAndIron.service')

const svc = new HandoffService()
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
const gen = () => 'HSTG-' + Date.now() + '-' + Math.floor(Math.random() * 1e4)

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
    console.log('Target DB host:', url.replace(/\/\/[^@]*@/, '//***:***@').replace(/\/[^/?]+(\?|$)/, '/<db>$1'))
    await mongoose.connect(url, {
        serverSelectionTimeoutMS: 60000, // ride out brief free-tier failovers
        retryWrites: true,
        retryReads: true,
    })

    const created = { orderIds: [], userIds: [] }
    const staff = await UserModel.create({
        email: `hstg_${Date.now()}@example.com`,
        fullName: 'Staging Staff',
        userType: ROLE.ADMIN,
    })
    const customer = await UserModel.create({
        email: `hstg_cust_${Date.now()}@example.com`,
        fullName: 'Staging Customer',
        userType: ROLE.USER,
    })
    created.userIds.push(staff._id, customer._id)
    const sid = staff._id.toString()

    const req = (id, body = {}, params = {}, query = {}) => ({
        params: { id, ...params },
        user: { id: sid },
        body,
        query,
    })

    async function makeOrder(itemsSpec) {
        const o = await BookOrderModel.create({
            userId: customer._id,
            fullName: 'Staging Customer',
            phoneNumber: '08000000000',
            serviceType: 'wash-and-iron',
            serviceTier: 'classic',
            deliverySpeed: 'standard',
            channel: 'website',
            amount: 1000,
            oscNumber: gen(),
            paymentStatus: 'success',
            stage: { status: 'queue' },
            stationStatus: S.PENDING,
            items: itemsSpec,
        })
        created.orderIds.push(o._id)
        return o
    }
    const reload = (id) => BookOrderModel.findById(id)
    // simulate a station's per-item completion marking
    const mark = (id, patch) =>
        BookOrderModel.updateOne({ _id: id }, { $set: patch })

    try {
        // ── 1 + 3: S1→S2 whole-order gate + happy advance ──────────────
        console.log('\n[1/3] intake→sort whole-order gate + advance')
        let o = await makeOrder([
            { type: 'shirt', price: 1, quantity: 1, tagStatus: 'complete' },
            { type: 'trouser', price: 1, quantity: 1, tagStatus: 'complete' },
        ])
        // partial S1→S2 rejected
        let r = await svc.push(
            req(o._id, {
                fromStation: S.INTAKE_AND_TAG_STATION,
                toStation: S.SORT_AND_PRETREAT_STATION,
                itemIds: [o.items[0]._id.toString()],
            }),
        )
        ok(!r.success, 'S1→S2 partial rejected (whole-order gate)')
        // whole push + confirm
        r = await svc.push(
            req(o._id, {
                fromStation: S.INTAKE_AND_TAG_STATION,
                toStation: S.SORT_AND_PRETREAT_STATION,
            }),
        )
        ok(r.success, 'S1→S2 whole push accepted (pending)')
        let hid = r.data.message.handoffId
        r = await svc.confirm(req(o._id, {}, { hid }))
        o = await reload(o._id)
        ok(
            o.items.every((i) => i.currentStation === S.SORT_AND_PRETREAT_STATION),
            'both items now at sort',
        )
        ok(o.stage.status === 'sort-and-pretreat', 'stage.status = sort-and-pretreat')

        // ── 2: sort queue returns the order ────────────────────────────
        console.log('\n[2] sort queue shows the order')
        let q = await SortService.getOrderQueue(req(null, {}, {}, { search: o.oscNumber, limit: 100 }))
        const inSort = JSON.stringify(q.data.message).includes(o.oscNumber)
        ok(q.success && inSort, 'order appears in sort queue')

        // ── 4: partial stretch S2→S3, order in BOTH wash + sort views ──
        console.log('\n[4] partial S2→S3 (split order)')
        await mark(o._id, {
            'items.0.sortStatus': 'complete',
            'items.0.pretreatStatus': 'complete',
            'items.1.sortStatus': 'complete',
            'items.1.pretreatStatus': 'complete',
        })
        o = await reload(o._id)
        r = await svc.push(
            req(o._id, {
                fromStation: S.SORT_AND_PRETREAT_STATION,
                toStation: S.WASH_AND_DRY_STATION,
                itemIds: [o.items[0]._id.toString()],
            }),
        )
        ok(r.success && r.data.message.count === 1, 'partial push of 1 item accepted')
        r = await svc.confirm(req(o._id, {}, { hid: r.data.message.handoffId }))
        o = await reload(o._id)
        ok(
            o.items[0].currentStation === S.WASH_AND_DRY_STATION &&
                o.items[1].currentStation === S.SORT_AND_PRETREAT_STATION,
            'item0 at wash, item1 still at sort',
        )
        ok(o.stage.status === 'sort-and-pretreat', 'summary = least-advanced (sort)')
        const washQ = await WashService.getWashQueue(req(null, {}, {}, { search: o.oscNumber, limit: 100 }))
        const sortQ = await SortService.getOrderQueue(req(null, {}, {}, { search: o.oscNumber, limit: 100 }))
        ok(
            JSON.stringify(washQ.data.message).includes(o.oscNumber),
            'split order appears in WASH queue',
        )
        ok(
            JSON.stringify(sortQ.data.message).includes(o.oscNumber),
            'split order STILL appears in SORT queue',
        )

        // move item1 to wash too so the whole order is at wash
        await mark(o._id, { 'items.1.sortStatus': 'complete', 'items.1.pretreatStatus': 'complete' })
        o = await reload(o._id)
        r = await svc.push(
            req(o._id, {
                fromStation: S.SORT_AND_PRETREAT_STATION,
                toStation: S.WASH_AND_DRY_STATION,
                itemIds: [o.items[1]._id.toString()],
            }),
        )
        await svc.confirm(req(o._id, {}, { hid: r.data.message.handoffId }))
        o = await reload(o._id)
        ok(o.stage.status === 'washing', 'whole order at wash → stage.status = washing')

        // ── 6: customer notification fired on entering washing ─────────
        console.log('\n[6] stage-entry notification')
        const notif = await NotificationModel.findOne({
            userId: customer._id,
            type: 'order-washing',
        })
        ok(!!notif, 'customer got a being-washed notification')

        // ── 5: reject on confirm → Hold ────────────────────────────────
        console.log('\n[5] reject on confirm → Hold')
        await mark(o._id, { 'items.0.washStatus': 'complete', 'items.1.washStatus': 'complete' })
        o = await reload(o._id)
        r = await svc.push(
            req(o._id, {
                fromStation: S.WASH_AND_DRY_STATION,
                toStation: S.PRESSING_AND_IRONING_STATION,
            }),
        )
        r = await svc.confirm(
            req(o._id, { rejectedItems: [o.items[1]._id.toString()], note: 'still wet' }, { hid: r.data.message.handoffId }),
        )
        o = await reload(o._id)
        ok(
            o.items[0].currentStation === S.PRESSING_AND_IRONING_STATION,
            'accepted item advanced to press',
        )
        ok(
            o.items[1].currentStation === S.WASH_AND_DRY_STATION &&
                o.items[1].flaggedForReview,
            'rejected item held + stays at wash',
        )

        // ── 3b: S4→S5 whole-order gate ─────────────────────────────────
        console.log('\n[3b] S4→S5 whole-order gate')
        r = await svc.push(
            req(o._id, {
                fromStation: S.PRESSING_AND_IRONING_STATION,
                toStation: S.QC_STATION,
                itemIds: [o.items[0]._id.toString()],
            }),
        )
        ok(!r.success, 'S4→S5 partial rejected (whole-order gate)')

        // ── 8: recovery order starts all items at S1 ───────────────────
        console.log('\n[8] recovery order default station')
        const rec = await makeOrder([
            { type: 'shirt', price: 0, quantity: 1 },
            { type: 'trouser', price: 0, quantity: 1 },
        ])
        ok(
            rec.items.every((i) => i.currentStation === S.INTAKE_AND_TAG_STATION),
            'recovery-style order items default to intake (S1)',
        )

        // ── 10: concurrency — double confirm is idempotent ─────────────
        console.log('\n[10] double-confirm safety')
        let o2 = await makeOrder([
            { type: 'shirt', price: 1, quantity: 1, tagStatus: 'complete' },
        ])
        r = await svc.push(
            req(o2._id, {
                fromStation: S.INTAKE_AND_TAG_STATION,
                toStation: S.SORT_AND_PRETREAT_STATION,
            }),
        )
        const hid2 = r.data.message.handoffId
        const [c1, c2] = await Promise.all([
            svc.confirm(req(o2._id, {}, { hid: hid2 })),
            svc.confirm(req(o2._id, {}, { hid: hid2 })),
        ])
        ok(
            (c1.success && !c2.success) || (!c1.success && c2.success),
            'exactly one of two concurrent confirms succeeds',
        )

        // ── 11: split-state endpoint ───────────────────────────────────
        console.log('\n[11] split-state breakdown')
        const ss = await svc.splitState(req(o._id))
        ok(ss.success && ss.data.message.countByStation, 'split-state returns per-station counts')
    } finally {
        // ── cleanup ────────────────────────────────────────────────────
        console.log('\n[cleanup]')
        const delOrders = await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        const delNotifs = await NotificationModel.deleteMany({ userId: customer._id })
        const delUsers = await UserModel.deleteMany({ _id: { $in: created.userIds } })
        console.log(`  removed ${delOrders.deletedCount} orders, ${delNotifs.deletedCount} notifications, ${delUsers.deletedCount} users`)
        await mongoose.disconnect()
    }

    console.log(`\n${PASS} passed, ${FAIL} failed`)
    process.exit(FAIL ? 1 : 0)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
