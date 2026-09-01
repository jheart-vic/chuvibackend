/**
 * Split-flow (Phase 3) DB verification harness.
 *
 * Drives the REAL HandoffService + the REAL station queue services against a
 * throwaway order, covering the scenario matrix in context/feature.md, then
 * deletes everything it created.
 *
 * Scenarios 13–14 book through the REAL customer path (postBookOrder) to verify
 * PER-PIECE explosion (a qty-N line → N tagged piece records) and the readable
 * handoff payloads (name + count + "5 Shirts, 3 Trousers" summary). Those two
 * need AdminOrderDetails + AdminSetting seeded (boot the app once against this
 * DB first); they self-skip if the settings are missing.
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
const AdminSettingModel = require('./models/adminSetting.model')
const AdminOrderDetailsModel = require('./models/adminOrderDetails.model')
const CrmProfileModel = require('./models/crmProfile.model')
const { STATION_STATUS: S, ROLE } = require('./util/constants')
const HandoffService = require('./services/handoff.service')
const SortService = require('./services/sortAndPretreat.service')
const WashService = require('./services/washAndDry.service')
const PressService = require('./services/pressAndIron.service')
const BookOrderService = require('./services/bookOrder.service')

const svc = new HandoffService()
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
    // Book through the REAL customer path (postBookOrder) so per-piece explosion
    // runs. Returns the created order doc, or null if settings are missing / the
    // booking failed (the caller then skips the per-piece scenarios gracefully).
    async function bookReal(items) {
        // Seed the two singleton settings docs if this DB has none (create-only,
        // never overwrites) — same defaults the app seeds on boot.
        let details = await AdminOrderDetailsModel.findOne({})
        if (!details) {
            details = await AdminOrderDetailsModel.create({})
            console.log('  (seeded AdminOrderDetails)')
        }
        let setting = await AdminSettingModel.findOne({})
        if (!setting) {
            setting = await AdminSettingModel.create({
                washAndIronPerKg: 3000,
                washOnlyPerKg: 1500,
                ironOnlyPerPiece: 1300,
                dryCleanPerPiece: 8000,
                sameDayCharge: 500,
                expressCharge: 200,
                premiumServiceTierCharge: 2,
                vipServiceTierCharge: 1.5,
            })
            console.log('  (seeded AdminSetting)')
        }
        const serviceType =
            (setting.serviceTypes && setting.serviceTypes[0]?.name) ||
            'wash-and-iron'
        const payload = {
            fullName: 'Staging Customer',
            phoneNumber: '08000000000',
            serviceType,
            serviceTier: 'classic',
            billingType: 'pay-per-item',
            deliverySpeed: 'standard',
            isPickUp: false,
            isDelivery: false,
            items,
        }
        const res = await bookSvc.createOrder({
            userId: customer._id.toString(),
            payload,
        })
        if (!res.success) {
            console.log('  ⚠ SKIP: real booking failed →', JSON.stringify(res.data))
            return null
        }
        const order = await BookOrderModel.findOne({ userId: customer._id }).sort({
            createdAt: -1,
        })
        if (order) created.orderIds.push(order._id)
        return order
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

        // ── 13: PER-PIECE explosion via the REAL booking path ──────────
        console.log('\n[13] per-piece explosion (real postBookOrder path)')
        const pp = await bookReal([
            { type: 'shirt', price: 1, quantity: 3 },
            { type: 'trouser', price: 1, quantity: 2 },
        ])
        if (pp) {
            ok(pp.items.length === 5, `qty 3+2 exploded into 5 piece records (got ${pp.items.length})`)
            ok(
                pp.items.every((i) => (i.quantity || 1) === 1),
                'every stored piece has quantity 1',
            )
            ok(
                pp.items.filter((i) => i.type === 'shirt').length === 3 &&
                    pp.items.filter((i) => i.type === 'trouser').length === 2,
                '3 shirt pieces + 2 trouser pieces',
            )
            ok(
                pp.items.every((i) => i.currentStation === S.INTAKE_AND_TAG_STATION),
                'all pieces start at intake (S1)',
            )

            // ── 14: readable handoff payload (name + count + summary) ───
            console.log('\n[14] handoff readable payload (name + count + summary)')
            // tag every piece so the S1→S2 whole-order gate passes
            const setTags = {}
            pp.items.forEach((i, idx) => {
                setTags[`items.${idx}.tagStatus`] = 'complete'
                setTags[`items.${idx}.tagId`] = `TAG-${String(idx + 1).padStart(2, '0')}`
            })
            await mark(pp._id, setTags)
            let rr = await svc.push(
                req(pp._id, {
                    fromStation: S.INTAKE_AND_TAG_STATION,
                    toStation: S.SORT_AND_PRETREAT_STATION,
                }),
            )
            ok(rr.success, 'per-piece whole S1→S2 push accepted')
            ok(
                rr.data.message.items && rr.data.message.items.length === 5,
                `push returns 5 readable items (got ${rr.data.message.items?.length})`,
            )
            ok(
                rr.data.message.summary === '3 Shirts, 2 Trousers',
                `push summary = "3 Shirts, 2 Trousers" (got "${rr.data.message.summary}")`,
            )
            ok(
                (rr.data.message.items[0].name && rr.data.message.items[0].tagId) !== undefined,
                'each item carries name + tagId + itemId',
            )
            const cc = await svc.confirm(req(pp._id, {}, { hid: rr.data.message.handoffId }))
            ok(
                cc.success && cc.data.message.accepted?.length === 5,
                'confirm returns 5 accepted readable items',
            )
            ok(
                cc.data.message.summary === '3 Shirts, 2 Trousers',
                'confirm summary reads by piece name + count',
            )
            const ss2 = await svc.splitState(req(pp._id))
            const sortStation = ss2.data.message.stations.find(
                (s) => s.station === S.SORT_AND_PRETREAT_STATION,
            )
            ok(
                sortStation && sortStation.count === 5 && sortStation.summary === '3 Shirts, 2 Trousers',
                'split-state counts pieces (5) + summary per station',
            )
        }
        // ══ STATION-SCOPING FIX (2026-09-01) ═══════════════════════════
        // The FE bug: pushing ONE item S2→S3 made the WHOLE order render at
        // wash. Scenarios 15-19 cover the scoped reads, the scoped writes and
        // the confirm-side hard gate.

        // ── 15: a station sees ONLY its own items ──────────────────────
        console.log('\n[15] station-scoped reads (the reported bug)')
        let sp = await makeOrder([
            { type: 'shirt', price: 1, quantity: 1, tagStatus: 'complete' },
            { type: 'shirt', price: 1, quantity: 1, tagStatus: 'complete' },
            { type: 'trouser', price: 1, quantity: 1, tagStatus: 'complete' },
            { type: 'trouser', price: 1, quantity: 1, tagStatus: 'complete' },
        ])
        r = await svc.push(
            req(sp._id, {
                fromStation: S.INTAKE_AND_TAG_STATION,
                toStation: S.SORT_AND_PRETREAT_STATION,
            }),
        )
        await svc.confirm(req(sp._id, {}, { hid: r.data.message.handoffId }))
        await mark(sp._id, {
            'items.0.sortStatus': 'complete', 'items.0.pretreatStatus': 'complete',
            'items.1.sortStatus': 'complete', 'items.1.pretreatStatus': 'complete',
            'items.2.sortStatus': 'complete', 'items.2.pretreatStatus': 'complete',
            'items.3.sortStatus': 'complete', 'items.3.pretreatStatus': 'complete',
        })
        sp = await reload(sp._id)
        // push 1 of 4 to wash
        r = await svc.push(
            req(sp._id, {
                fromStation: S.SORT_AND_PRETREAT_STATION,
                toStation: S.WASH_AND_DRY_STATION,
                itemIds: [sp.items[0]._id.toString()],
            }),
        )
        await svc.confirm(req(sp._id, {}, { hid: r.data.message.handoffId }))

        const wq = await WashService.getWashQueue(req(null, {}, {}, { search: sp.oscNumber, limit: 100 }))
        const wRow = wq.data.message.data.find((x) => x.oscNumber === sp.oscNumber)
        ok(!!wRow, 'split order appears in the wash queue')
        ok(wRow && wRow.items.length === 1, `wash queue shows 1 item, NOT the whole order (got ${wRow?.items.length})`)
        ok(wRow && wRow.totalItemCount === 4, 'wash row reports totalItemCount 4 for context')
        ok(
            wRow && wRow.itemsElsewhere[S.SORT_AND_PRETREAT_STATION] === 3,
            'wash row reports 3 items still at sort',
        )
        const sq = await SortService.getOrderQueue(req(null, {}, {}, { search: sp.oscNumber, limit: 100 }))
        const sRow = sq.data.message.data.find((x) => x.oscNumber === sp.oscNumber)
        ok(sRow && sRow.items.length === 3, `sort queue shows the remaining 3 items (got ${sRow?.items.length})`)
        const wIds = wRow.items.map((i) => String(i._id))
        const sIds = sRow.items.map((i) => String(i._id))
        ok(!wIds.some((id) => sIds.includes(id)), 'NO item appears at both stations')

        const wd = await WashService.getWashQueueOrderDetails(req(sp._id))
        ok(wd.data.message.order.items.length === 1, 'wash order-details is scoped to 1 item')
        const sd = await SortService.getOrderDetails(req(sp._id))
        ok(sd.data.message.order.items.length === 3, 'sort order-details is scoped to 3 items')
        ok(sd.data.message.readyToSend === true, 'sort readyToSend true (its 3 are done) — not blocked by the item at wash')

        // ── 16: writes are scoped too (the silent corruption) ──────────
        console.log('\n[16] station-scoped writes')
        let cw = await WashService.confirmItemForWashing(req(sp._id, { allItems: true }))
        ok(cw.success && /1 item/.test(cw.data.message.message), `allItems:true confirmed only the 1 wash item (got "${cw.data.message.message}")`)
        sp = await reload(sp._id)
        ok(
            sp.items.filter((i) => i.washStatus === 'complete').length === 1,
            'the 3 items still at sort were NOT stamped washStatus complete',
        )
        ok(cw.data.message.allItemsConfirmed === true, 'allItemsConfirmed true for the partial batch (opens the S3→S4 push)')
        sp = await reload(sp._id)
        ok(!!sp.washDetails?.startedAt, 'washDetails.startedAt stamped on a partial batch')

        // ── 17: stray itemIds refused ─────────────────────────────────
        console.log('\n[17] cross-station itemIds refused')
        const atSort = sp.items.find((i) => i.currentStation === S.SORT_AND_PRETREAT_STATION)
        const bad = await WashService.confirmItemForWashing(
            req(sp._id, { itemIds: [atSort._id.toString()] }),
        )
        ok(!bad.success, 'wash refuses to confirm an item still sitting at sort')
        const badSort = await SortService.markItemAsSorted(
            req(sp._id, {}, { itemId: sp.items[0]._id.toString() }),
        )
        ok(!badSort.success, 'sort refuses to act on an item already handed to wash')

        // ── 18: S4→S5 hard gate on CONFIRM (the new rule) ─────────────
        console.log('\n[18] S4→S5 partial CONFIRM refused')
        let g = await makeOrder([
            { type: 'shirt', price: 1, quantity: 1, tagStatus: 'complete', pressStatus: 'complete', currentStation: S.PRESSING_AND_IRONING_STATION },
            { type: 'shirt', price: 1, quantity: 1, tagStatus: 'complete', pressStatus: 'complete', currentStation: S.PRESSING_AND_IRONING_STATION },
            { type: 'trouser', price: 1, quantity: 1, tagStatus: 'complete', pressStatus: 'complete', currentStation: S.PRESSING_AND_IRONING_STATION },
        ])
        r = await svc.push(
            req(g._id, {
                fromStation: S.PRESSING_AND_IRONING_STATION,
                toStation: S.QC_STATION,
            }),
        )
        ok(r.success && r.data.message.count === 3, 'S4→S5 whole push accepted')
        const gh = r.data.message.handoffId
        let pc = await svc.confirm(
            req(g._id, { rejectedItems: [g.items[0]._id.toString()], note: 'creased' }, { hid: gh }),
        )
        ok(!pc.success, 'partial confirm (2 of 3) REFUSED — nothing partial reaches QC')
        g = await reload(g._id)
        ok(
            g.items.every((i) => i.currentStation === S.PRESSING_AND_IRONING_STATION),
            'refused confirm moved NOTHING (all 3 still at press)',
        )
        ok(
            g.handoffs.id(gh).status === 'pending',
            'the handoff is still pending after the refusal (not consumed)',
        )
        // reject-all IS allowed — the whole order goes back
        pc = await svc.confirm(
            req(g._id, { rejectedItems: g.items.map((i) => i._id.toString()), note: 'all creased' }, { hid: gh }),
        )
        ok(pc.success && pc.data.message.status === 'rejected', 'reject-ALL accepted (whole order sent back)')
        g = await reload(g._id)
        ok(
            g.items.every((i) => i.currentStation === S.PRESSING_AND_IRONING_STATION && i.flaggedForReview),
            'all 3 held at press',
        )
        // accept-all IS allowed
        let g2 = await makeOrder([
            { type: 'shirt', price: 1, quantity: 1, pressStatus: 'complete', currentStation: S.PRESSING_AND_IRONING_STATION },
            { type: 'trouser', price: 1, quantity: 1, pressStatus: 'complete', currentStation: S.PRESSING_AND_IRONING_STATION },
        ])
        r = await svc.push(
            req(g2._id, { fromStation: S.PRESSING_AND_IRONING_STATION, toStation: S.QC_STATION }),
        )
        pc = await svc.confirm(req(g2._id, {}, { hid: r.data.message.handoffId }))
        g2 = await reload(g2._id)
        ok(
            pc.success && g2.items.every((i) => i.currentStation === S.QC_STATION),
            'accept-ALL still works — whole order reaches QC together',
        )

        // ── 19: stretch-zone partial confirm still allowed ────────────
        console.log('\n[19] stretch zone unaffected by the new gate')
        let st = await makeOrder([
            { type: 'shirt', price: 1, quantity: 1, sortStatus: 'complete', pretreatStatus: 'complete', currentStation: S.SORT_AND_PRETREAT_STATION },
            { type: 'trouser', price: 1, quantity: 1, sortStatus: 'complete', pretreatStatus: 'complete', currentStation: S.SORT_AND_PRETREAT_STATION },
        ])
        r = await svc.push(
            req(st._id, { fromStation: S.SORT_AND_PRETREAT_STATION, toStation: S.WASH_AND_DRY_STATION }),
        )
        pc = await svc.confirm(
            req(st._id, { rejectedItems: [st.items[0]._id.toString()], note: 'stain left' }, { hid: r.data.message.handoffId }),
        )
        ok(pc.success, 'S2→S3 PARTIAL confirm still allowed (stretch zone)')

        // ── 20: legacy items with no currentStation (backfill case) ───
        console.log('\n[20] legacy order missing currentStation')
        let lg = await makeOrder([
            { type: 'shirt', price: 1, quantity: 1, currentStation: S.WASH_AND_DRY_STATION },
            { type: 'trouser', price: 1, quantity: 1, currentStation: S.WASH_AND_DRY_STATION },
        ])
        await BookOrderModel.updateOne(
            { _id: lg._id },
            { $unset: { 'items.0.currentStation': '', 'items.1.currentStation': '' }, $set: { 'stage.status': 'washing' } },
        )
        const missing = await BookOrderModel.countDocuments({
            _id: lg._id,
            items: { $elemMatch: { currentStation: { $exists: false } } },
        })
        ok(missing === 1, 'legacy order (no currentStation) is detectable by the backfill query')
        const wqL = await WashService.getWashQueue(req(null, {}, {}, { search: lg.oscNumber, limit: 100 }))
        ok(
            !JSON.stringify(wqL.data.message.data).includes(lg.oscNumber),
            'confirms the gap: a legacy order is INVISIBLE to the wash queue until backfilled',
        )
    } finally {
        // ── cleanup ────────────────────────────────────────────────────
        console.log('\n[cleanup]')
        const delOrders = await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        const delNotifs = await NotificationModel.deleteMany({ userId: customer._id })
        // the real booking path creates a CRM profile (fire-and-forget hook)
        const delCrm = await CrmProfileModel.deleteMany({
            $or: [{ userId: customer._id }, { phoneNumber: '08000000000' }],
        })
        const delUsers = await UserModel.deleteMany({ _id: { $in: created.userIds } })
        console.log(`  removed ${delOrders.deletedCount} orders, ${delNotifs.deletedCount} notifications, ${delCrm.deletedCount} crm profiles, ${delUsers.deletedCount} users`)
        await mongoose.disconnect()
    }

    console.log(`\n${PASS} passed, ${FAIL} failed`)
    process.exit(FAIL ? 1 : 0)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
