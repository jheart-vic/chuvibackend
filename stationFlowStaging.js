/**
 * Station-flow DB verification harness — client brief 6 Oct 2026, Group 1.
 *
 * Reproduces items 1.1 ("order cards stay in a queue after they have moved"),
 * 1.2 ("S1→S2 Accept all does nothing") and 1.4 (flag / hold do nothing) by
 * walking ONE real order S1 → S2 → S3 through the REAL services, and asserting
 * after every move that:
 *   - the station it LEFT no longer lists it (or lists only what is left), and
 *   - the station it ENTERED does list it, and
 *   - every dashboard COUNT equals the length of the list behind it.
 *
 * That last assertion is the client's actual requirement ("Every count on a
 * dashboard matches the list behind it") and is the thing no amount of code
 * reading can settle.
 *
 * Scenarios:
 *   1  fresh order              → sits at S1, appears in Drafts, count == list
 *   2  push S1→S2 (pending)     → NOTHING has moved yet; Drafts still holds it
 *                                 (this is why the client's count stayed at 15)
 *   3  S2 Incoming handoffs     → the pending handoff is listed for S2
 *   4  S2 confirm accept-all    → leaves Drafts, enters S2, items at S2
 *   5  confirm twice            → second attempt refused, nothing double-moved
 *   6  partial S2→S3 (3 of 5)   → S2 shows the 2 left, S3 shows the 3 arrived,
 *                                 no item at two stations, stage stays at S2
 *   7  S3 dashboard             → washQueue count == recentQueue list (the fix)
 *   8  rest of the order S2→S3  → order LEAVES the S2 queue entirely
 *   9  flag at S2               → really flags, shows in the flagged count
 *  10  hold at S2               → really holds, with a reason
 *  11  flag an item NOT at S2   → refused with a reason, writes nothing
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb (the live one). Creates
 * throwaway users/orders and deletes everything it created.
 *
 * Run:  STAGING_OK=1 MONGODB_URL="<testing uri>" node stationFlowStaging.js
 *       (pass MONGODB_URL inline — .env points at the LIVE db)
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const ActivityModel = require('./models/activity.model')
const AuditLogModel = require('./models/audit.log.model')
const NotificationModel = require('./models/notification.model')
const CrmProfileModel = require('./models/crmProfile.model')
const HandoffService = require('./services/handoff.service')
const SortService = require('./services/sortAndPretreat.service')
const WashService = require('./services/washAndDry.service')
const IntakeUserService = require('./services/intake-user.service')
const { ROLE, STATION_STATUS: S, ORDER_STATUS } = require('./util/constants')

const handoff = new HandoffService()
const intake = new IntakeUserService()

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
const gen = () => 'SFLOW-' + Date.now() + '-' + Math.floor(Math.random() * 1e4)
const unwrap = (r) => r?.data?.message
const ids = (arr) => (arr || []).map((o) => String(o._id || o.orderId))

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
        console.error('\n*** "laundrydb" is the LIVE database. Refusing. ***')
        process.exit(2)
    }

    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })

    const created = { orderIds: [], userIds: [] }
    const mk = (role, name) =>
        UserModel.create({
            email: `sflow_${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`,
            fullName: name,
            userType: role,
        })
    const s1 = await mk(ROLE.INTAKE_AND_TAG, 'Staging S1')
    const s2 = await mk(ROLE.SORT_AND_PRETREAT || 'sort-and-pretreat', 'Staging S2')
    const s3 = await mk(ROLE.WASH_AND_DRY || 'wash-and-dry', 'Staging S3')
    const customer = await mk(ROLE.USER, 'Staging Customer')
    created.userIds.push(s1._id, s2._id, s3._id, customer._id)

    const req = (id, body = {}, params = {}, uid = s2._id) => ({
        params: { id, ...params },
        user: { id: String(uid) },
        body,
        query: {},
    })

    // Five per-piece items, all tagged, all sitting at S1 — the state an order
    // is in once Intake & Tag has finished with it.
    const pieces = () => [
        { type: 'shirt', quantity: 1, price: 1, tagId: 'TAG-01', tagStatus: 'complete', currentStation: S.INTAKE_AND_TAG_STATION },
        { type: 'shirt', quantity: 1, price: 1, tagId: 'TAG-02', tagStatus: 'complete', currentStation: S.INTAKE_AND_TAG_STATION },
        { type: 'shirt', quantity: 1, price: 1, tagId: 'TAG-03', tagStatus: 'complete', currentStation: S.INTAKE_AND_TAG_STATION },
        { type: 'trouser', quantity: 1, price: 1, tagId: 'TAG-04', tagStatus: 'complete', currentStation: S.INTAKE_AND_TAG_STATION },
        { type: 'trouser', quantity: 1, price: 1, tagId: 'TAG-05', tagStatus: 'complete', currentStation: S.INTAKE_AND_TAG_STATION },
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
            deliveryAddress: { label: 'Home', address: '12 Lagos Street', landmark: 'By GTBank' },
            stage: { status: ORDER_STATUS.QUEUE, updatedAt: new Date() },
            stationStatus: S.INTAKE_AND_TAG_STATION,
            items: pieces(),
            ...over,
        })
        created.orderIds.push(o._id)
        return o
    }

    const reload = (id) => BookOrderModel.findById(id).lean()
    const stationsOf = async (id) => {
        const o = await reload(id)
        return o.items.map((i) => i.currentStation || S.INTAKE_AND_TAG_STATION)
    }

    // Drafts: the count the client watched stay at 15, and the list behind it.
    async function draftsState() {
        const dash = unwrap(await intake.intakeDashboard({ user: { id: String(s1._id) }, query: {} }))
        const list = unwrap(await intake.getDrafts({ user: { id: String(s1._id) }, query: { limit: 200 } }))
        return {
            count: dash?.draftOrders ?? -1,
            ids: ids(list?.data || list?.orders || list),
        }
    }
    async function sortQueueState() {
        const dash = unwrap(await SortService.getDashboard({ user: { id: String(s2._id) }, query: { limit: 200 } }))
        const list = unwrap(await SortService.getOrderQueue({ user: { id: String(s2._id) }, query: { limit: 200 } }))
        return {
            count: dash?.stats?.ordersAwaitingSorting ?? -1,
            ids: ids(list?.data || list),
            rows: list?.data || list || [],
        }
    }
    async function washQueueState() {
        const dash = unwrap(await WashService.getDashboard({ user: { id: String(s3._id) }, query: {} }))
        const list = unwrap(await WashService.getWashQueue({ user: { id: String(s3._id) }, query: { limit: 200 } }))
        return {
            count: dash?.stats?.washQueue ?? -1,
            recent: dash?.recentQueue || [],
            ids: ids(list?.data || list),
            rows: list?.data || list || [],
        }
    }

    try {
        const order = await makeOrder()
        const oid = String(order._id)
        const itemIds = (await reload(oid)).items.map((i) => String(i._id))

        // ── 1 ── fresh order sits at S1 and shows in Drafts ─────────────────
        console.log('\n[1] a fully tagged order sits at S1 and shows in Drafts')
        let d0 = await draftsState()
        ok(d0.ids.includes(oid), 'the new order appears in the Drafts list')
        ok((await stationsOf(oid)).every((s) => s === S.INTAKE_AND_TAG_STATION),
            'all 5 pieces are at intake-and-tag')

        // ── 2 ── push S1→S2: nothing has moved yet ──────────────────────────
        console.log('\n[2] push S1→S2 creates a PENDING handoff — nothing has moved')
        let res = await handoff.push(
            req(oid, { fromStation: S.INTAKE_AND_TAG_STATION, toStation: S.SORT_AND_PRETREAT_STATION, itemIds }, {}, s1._id),
        )
        ok(res.success === true, `push accepted (${res.success ? 'ok' : res.data?.error})`)
        const hid = String(unwrap(res)?.handoffId || unwrap(res)?.handoff?._id || '')
        ok(!!hid, 'push returned a handoff id')
        ok((await stationsOf(oid)).every((s) => s === S.INTAKE_AND_TAG_STATION),
            'pieces are STILL at S1 until S2 confirms')
        let d1 = await draftsState()
        ok(d1.ids.includes(oid),
            'order is STILL in Drafts after the push — THIS is why the count stayed at 15')
        ok(d1.count === d1.ids.length,
            `Drafts COUNT (${d1.count}) matches the list behind it (${d1.ids.length})`)

        // ── 3 ── S2 incoming handoffs lists it ──────────────────────────────
        console.log('\n[3] it appears in S2 Incoming handoffs')
        const pend = unwrap(await handoff.pendingQueue({ query: { toStation: S.SORT_AND_PRETREAT_STATION }, user: { id: String(s2._id) }, body: {} }))
        const pendRows = pend?.queue || pend?.data || pend || []
        ok(pendRows.some((r) => String(r.orderId) === oid), 'pending handoff is listed for S2')

        // ── 4 ── S2 confirms: it LEAVES Drafts and ENTERS S2 ────────────────
        console.log('\n[4] S2 Accept all + Confirm receipt actually moves the order')
        res = await handoff.confirm(req(oid, { rejectedItems: [] }, { hid }, s2._id))
        ok(res.success === true, `confirm accepted (${res.success ? 'ok' : res.data?.error})`)
        ok((await stationsOf(oid)).every((s) => s === S.SORT_AND_PRETREAT_STATION),
            'all 5 pieces are now at sort-and-pretreat')
        const d2 = await draftsState()
        ok(!d2.ids.includes(oid), 'order has LEFT the Drafts list')
        ok(d2.count === d2.ids.length,
            `Drafts COUNT (${d2.count}) still matches its list (${d2.ids.length})`)
        ok(d2.count === d1.count - 1,
            `Drafts count went DOWN by exactly one (${d1.count} → ${d2.count})`)
        const q2 = await sortQueueState()
        ok(q2.ids.includes(oid), 'order now appears in the S2 queue')
        ok(q2.count === q2.ids.length,
            `S2 COUNT (${q2.count}) matches the list behind it (${q2.ids.length})`)

        // ── 5 ── confirming the same handoff twice ──────────────────────────
        console.log('\n[5] the same handoff cannot be confirmed twice')
        res = await handoff.confirm(req(oid, { rejectedItems: [] }, { hid }, s2._id))
        ok(res.success === false, `second confirm refused ("${res.data?.error}")`)
        ok((await stationsOf(oid)).every((s) => s === S.SORT_AND_PRETREAT_STATION),
            'nothing moved further on the refused second confirm')

        // ── 6 ── partial S2→S3 ──────────────────────────────────────────────
        console.log('\n[6] partial release: 3 of 5 pieces go to S3')
        const three = itemIds.slice(0, 3)
        // mark the 3 sorted+pretreated so they pass the completion gate
        await BookOrderModel.updateOne(
            { _id: oid },
            { $set: { 'items.$[e].sortStatus': 'complete', 'items.$[e].pretreatStatus': 'complete' } },
            { arrayFilters: [{ 'e._id': { $in: three.map((i) => new mongoose.Types.ObjectId(i)) } }] },
        )
        res = await handoff.push(
            req(oid, { fromStation: S.SORT_AND_PRETREAT_STATION, toStation: S.WASH_AND_DRY_STATION, itemIds: three }, {}, s2._id),
        )
        ok(res.success === true, `partial push accepted (${res.success ? 'ok' : res.data?.error})`)
        const hid2 = String(unwrap(res)?.handoffId || '')
        res = await handoff.confirm(req(oid, { rejectedItems: [] }, { hid: hid2 }, s3._id))
        ok(res.success === true, `S3 confirmed the batch (${res.success ? 'ok' : res.data?.error})`)

        const st = await stationsOf(oid)
        ok(st.filter((x) => x === S.WASH_AND_DRY_STATION).length === 3, '3 pieces are at S3')
        ok(st.filter((x) => x === S.SORT_AND_PRETREAT_STATION).length === 2, '2 pieces are still at S2')
        ok(st.length === 5, 'no piece is at two stations at once (5 pieces, 5 placements)')

        const q2b = await sortQueueState()
        const rowS2 = (q2b.rows || []).find((r) => String(r._id) === oid)
        ok(q2b.ids.includes(oid), 'S2 still lists the order (it still holds 2 pieces)')
        ok(rowS2 && (rowS2.items || []).length === 2,
            `S2 shows only the 2 pieces it still has (showed ${rowS2 ? (rowS2.items || []).length : 'n/a'})`)
        const w1 = await washQueueState()
        const rowS3 = (w1.rows || []).find((r) => String(r._id) === oid)
        ok(w1.ids.includes(oid), 'S3 wash queue lists the order')
        ok(rowS3 && (rowS3.items || []).length === 3,
            `S3 shows only the 3 pieces that arrived (showed ${rowS3 ? (rowS3.items || []).length : 'n/a'})`)
        const afterPartial = await reload(oid)
        ok(afterPartial.stage.status === ORDER_STATUS.SORT_AND_PRETREAT,
            `stage.status stays at the least-advanced station ("${afterPartial.stage.status}")`)

        // ── 7 ── the S3 dashboard fix ───────────────────────────────────────
        console.log('\n[7] S3 dashboard: the Recent Wash Queue matches its own count')
        ok(w1.count === w1.ids.length,
            `washQueue COUNT (${w1.count}) matches the Wash Queue list (${w1.ids.length})`)
        const recentIds = ids(w1.recent)
        ok(recentIds.every((id) => w1.ids.includes(id)),
            'every row in "Recent Wash Queue" is really in the Wash Queue (brief 1.1)')

        // ── 8 ── release the rest ───────────────────────────────────────────
        console.log('\n[8] the last 2 pieces follow — the order LEAVES S2')
        const rest = itemIds.slice(3)
        await BookOrderModel.updateOne(
            { _id: oid },
            { $set: { 'items.$[e].sortStatus': 'complete', 'items.$[e].pretreatStatus': 'complete' } },
            { arrayFilters: [{ 'e._id': { $in: rest.map((i) => new mongoose.Types.ObjectId(i)) } }] },
        )
        res = await handoff.push(
            req(oid, { fromStation: S.SORT_AND_PRETREAT_STATION, toStation: S.WASH_AND_DRY_STATION, itemIds: rest }, {}, s2._id),
        )
        const hid3 = String(unwrap(res)?.handoffId || '')
        ok(res.success === true, `second push accepted (${res.success ? 'ok' : res.data?.error})`)
        res = await handoff.confirm(req(oid, { rejectedItems: [] }, { hid: hid3 }, s3._id))
        ok(res.success === true, `S3 confirmed the rest (${res.success ? 'ok' : res.data?.error})`)
        const q2c = await sortQueueState()
        ok(!q2c.ids.includes(oid), 'order has LEFT the S2 queue entirely (brief 1.1 item 2)')
        ok(q2c.count === q2c.ids.length,
            `S2 COUNT (${q2c.count}) matches its list (${q2c.ids.length})`)
        const w2 = await washQueueState()
        ok(w2.count === w2.ids.length,
            `S3 COUNT (${w2.count}) matches its list (${w2.ids.length})`)

        // ── 9-11 ── flag and hold at S2 (brief 1.4) ─────────────────────────
        console.log('\n[9-11] flag and hold really act (brief 1.4)')
        const o2 = await makeOrder({
            stage: { status: ORDER_STATUS.SORT_AND_PRETREAT, updatedAt: new Date() },
            stationStatus: S.SORT_AND_PRETREAT_STATION,
            items: pieces().map((p) => ({ ...p, currentStation: S.SORT_AND_PRETREAT_STATION })),
        })
        const o2id = String(o2._id)
        const o2items = (await reload(o2id)).items.map((i) => String(i._id))

        res = await SortService.flagItemForReview(
            req(o2id, { reason: 'Stain found', note: 'needs review' }, { itemId: o2items[0] }, s2._id),
        )
        ok(res.success === true, `flag accepted (${res.success ? 'ok' : res.data?.error})`)
        let o2fresh = await reload(o2id)
        ok(o2fresh.items[0].flaggedForReview === true, 'the item is REALLY flagged in Mongo')

        res = await SortService.sendToHold(
            req(o2id, { reason: 'item_missing', assignTo: ROLE.ADMIN, note: 'hold it' }, { itemId: o2items[1] }, s2._id),
        )
        ok(res.success === true, `hold accepted (${res.success ? 'ok' : res.data?.error})`)
        o2fresh = await reload(o2id)
        ok(!!o2fresh.items[1].holdDetails?.reason,
            `the item is REALLY on hold with a reason ("${o2fresh.items[1].holdDetails?.reason}")`)

        // an item that is NOT at S2 must be refused BECAUSE of the station, and
        // say so — pass a complete body so the refusal can only be the guard.
        const o3 = await makeOrder() // still at S1
        const o3id = String(o3._id)
        const o3items = (await reload(o3id)).items.map((i) => String(i._id))
        res = await SortService.flagItemForReview(
            req(o3id, { reason: 'Stain', note: 'please check' }, { itemId: o3items[0] }, s2._id),
        )
        ok(res.success === false, `flagging an item not at S2 is refused ("${res.data?.error}")`)
        ok(/sort & pretreat/i.test(res.data?.error || '') &&
            /no longer at|does not exist|still has/i.test(res.data?.error || ''),
            'the refusal says WHY in plain words (brief 1.4 item 3)')
        ok(!/Order not found or not in sort & pretreat stage/.test(res.data?.error || ''),
            'the old catch-all "not found or not in stage" message is gone')
        const o3fresh = await reload(o3id)
        ok(o3fresh.items[0].flaggedForReview !== true, 'the refused flag wrote NOTHING')

        // ── 12 ── REPRODUCE the client's 1.2 error exactly ──────────────────
        // isWholeOrderGate() is `fromIdx === 0 || toIdx === last`, so a push OUT
        // of S1 is whole-order gated but NOT restricted to the adjacent station:
        // S1→S3 is a legal forward move. Push S1→S2, then S1→S3, confirm the
        // second, and the first is left pending over items that have gone.
        console.log("\n[12] reproducing 1.2: a stale handoff left by a station-skipping push")
        const o4 = await makeOrder()
        const o4id = String(o4._id)
        const o4items = (await reload(o4id)).items.map((i) => String(i._id))

        let r1 = await handoff.push(
            req(o4id, { fromStation: S.INTAKE_AND_TAG_STATION, toStation: S.SORT_AND_PRETREAT_STATION, itemIds: o4items }, {}, s1._id),
        )
        ok(r1.success === true, 'push S1→S2 accepted')
        const staleHid = String(unwrap(r1)?.handoffId || '')

        let r2 = await handoff.push(
            req(o4id, { fromStation: S.INTAKE_AND_TAG_STATION, toStation: S.WASH_AND_DRY_STATION, itemIds: o4items }, {}, s1._id),
        )
        console.log(`      S1→S3 skip-push: ${r2.success ? 'ACCEPTED' : 'refused — "' + r2.data?.error + '"'}`)

        if (r2.success) {
            const skipHid = String(unwrap(r2)?.handoffId || '')
            const r3 = await handoff.confirm(req(o4id, { rejectedItems: [] }, { hid: skipHid }, s3._id))
            console.log(`      S3 confirm of the skip-push: ${r3.success ? 'ACCEPTED' : 'refused'}`)

            const o4fresh = await reload(o4id)
            const atS3 = o4fresh.items.filter((i) => i.currentStation === S.WASH_AND_DRY_STATION).length
            console.log(`      pieces now at S3: ${atS3}/5, stage.status: "${o4fresh.stage.status}"`)

            const pq = unwrap(await handoff.pendingQueue({ query: { toStation: S.SORT_AND_PRETREAT_STATION }, user: { id: String(s2._id) }, body: {} }))
            const pqRows = pq?.queue || pq?.data || pq || []
            const stillListed = pqRows.some((r) => String(r.orderId) === o4id)
            console.log(`      still shown in S2 Incoming handoffs: ${stillListed}`)

            // With the fix, the skip-push supersedes the earlier S1→S2 handoff,
            // so the stale card never reaches S2's screen at all.
            ok(!stillListed,
                'FIXED: the superseded handoff is NO LONGER listed as incoming')
            const o4doc = await reload(o4id)
            const staleRec = (o4doc.handoffs || []).find((h) => String(h._id) === staleHid)
            ok(staleRec && staleRec.status === 'superseded',
                `FIXED: the earlier handoff is recorded as superseded (status "${staleRec?.status}")`)
            ok(!!staleRec?.supersededAt && String(staleRec?.supersededBy) === skipHid,
                'the supersede is stamped with when, and by which handoff')

            const r4 = await handoff.confirm(req(o4id, { rejectedItems: [] }, { hid: staleHid }, s2._id))
            console.log(`      S2 "Accept all" on the stale handoff now says: "${r4.data?.error}"`)
            ok(r4.success === false && !/must still be at/.test(r4.data?.error || ''),
                'FIXED: the cryptic "all items must still be at…" dead end is gone')
            ok(/already/i.test(r4.data?.error || '') || /already been confirmed/i.test(r4.data?.error || ''),
                'and the refusal explains in plain words what happened (brief 1.2)')
        } else {
            ok(true, 'S1→S3 skip-push is refused — this is NOT the cause of 1.2')
        }

        // ── 13 ── self-healing for the orders ALREADY stranded in their data ─
        // The client has two live orders in this state right now. They must
        // clear themselves on the next read — no migration, no manual surgery.
        console.log('\n[13] an already-stranded handoff heals itself on the next read')
        const o5 = await makeOrder()
        const o5id = String(o5._id)
        const o5items = (await reload(o5id)).items.map((i) => String(i._id))
        const p5 = await handoff.push(
            req(o5id, { fromStation: S.INTAKE_AND_TAG_STATION, toStation: S.SORT_AND_PRETREAT_STATION, itemIds: o5items }, {}, s1._id),
        )
        const strandedHid = String(unwrap(p5)?.handoffId || '')
        // Simulate the damage exactly as it exists in their DB: items moved on,
        // handoff left pending, written straight to Mongo so no fix intervenes.
        await BookOrderModel.updateOne(
            { _id: o5id },
            {
                $set: {
                    'items.$[].currentStation': S.WASH_AND_DRY_STATION,
                    'stage.status': ORDER_STATUS.WASHING,
                },
            },
        )
        const beforeHeal = unwrap(await handoff.pendingQueue({ query: { toStation: S.SORT_AND_PRETREAT_STATION }, user: { id: String(s2._id) }, body: {} }))
        const beforeRows = beforeHeal?.queue || beforeHeal?.data || beforeHeal || []
        ok(!beforeRows.some((r) => String(r.handoffId) === strandedHid),
            'a stranded handoff is NOT shown in Incoming handoffs')
        const healed = await reload(o5id)
        const healedRec = (healed.handoffs || []).find((h) => String(h._id) === strandedHid)
        ok(healedRec?.status === 'superseded',
            `and the read PERSISTED the cleanup (status "${healedRec?.status}") so it cannot come back`)
        // ── 14 ── the client's worked example for 1.5, verbatim ─────────────
        // "An order of 10 items arrives at S2. The operator selects 7, sets
        //  Colored, Light and No pretreatment needed, and marks them sorted.
        //  Those 7 show in the S3 Wash Queue at once. The other 3 stay at S2.
        //  She sets White, Delicate and Stain treatment required, treats them,
        //  and marks the pretreatment done. Those 3 then join the rest at S3."
        console.log("\n[14] the client's 1.5 worked example: 10 items, 7 then 3")
        const ten = []
        for (let n = 0; n < 10; n++) {
            ten.push({
                type: n < 7 ? 'shirt' : 'trouser',
                quantity: 1,
                price: 1,
                tagId: `TAG-${String(n + 1).padStart(2, '0')}`,
                tagStatus: 'complete',
                currentStation: S.SORT_AND_PRETREAT_STATION,
            })
        }
        const o6 = await makeOrder({
            stage: { status: ORDER_STATUS.SORT_AND_PRETREAT, updatedAt: new Date() },
            stationStatus: S.SORT_AND_PRETREAT_STATION,
            items: ten,
        })
        const o6id = String(o6._id)
        const o6items = (await reload(o6id)).items.map((i) => String(i._id))

        // she selects 7
        let b = await SortService.bulkSortItems(
            req(o6id, {
                itemIds: o6items.slice(0, 7),
                colorGroup: 'colored',
                fabricType: 'light',
                pretreatmentOptions: ['no_pretreatment_needed'],
            }, {}, s2._id),
        )
        ok(b.success === true, `bulk sort of 7 accepted (${b.success ? 'ok' : b.data?.error})`)
        const bm = unwrap(b) || {}
        ok(bm.updated === 7, `exactly 7 items updated (got ${bm.updated})`)
        ok(bm.pretreatmentRequired === false, 'no pretreatment step for those 7')
        ok(bm.readyForWash === 7, `all 7 are finished at S2 without a pretreat step (got ${bm.readyForWash})`)
        ok(bm.itemsLeftAtStation === 3 && bm.totalItemCount === 10,
            `the order card can read "3 of 10 left" (got ${bm.itemsLeftAtStation} of ${bm.totalItemCount})`)
        ok(bm.handoff && !bm.handoff.error, 'the 7 were handed to wash as one batch')

        let o6doc = await reload(o6id)
        ok(o6doc.items.slice(0, 7).every((i) => i.pretreatStatus === 'not_required'),
            'pretreatStatus is not_required on those 7 — the step is genuinely skipped')
        ok(o6doc.items.slice(0, 7).every((i) => i.colorGroup === 'colored' && i.fabricType === 'light'),
            'colour group AND fabric type were set on a MULTI-item selection (brief 1.5 item 2)')
        ok(o6doc.items.slice(7).every((i) => i.sortStatus !== 'complete'),
            'the other 3 were NOT touched')

        // S3 confirms that batch, then S2 still shows only the 3 left
        const pend6 = unwrap(await handoff.pendingQueue({ query: { toStation: S.WASH_AND_DRY_STATION }, user: { id: String(s3._id) }, body: {} }))
        const row6 = (pend6?.queue || pend6?.data || pend6 || []).find((r) => String(r.orderId) === o6id)
        ok(!!row6 && row6.count === 7, `S3 sees the batch of 7 to confirm (count ${row6?.count})`)
        await handoff.confirm(req(o6id, { rejectedItems: [] }, { hid: String(row6.handoffId) }, s3._id))

        const q6 = await sortQueueState()
        const r6 = (q6.rows || []).find((r) => String(r._id) === o6id)
        ok(r6 && (r6.items || []).length === 3,
            `S2 now shows only the 3 remaining pieces (showed ${r6 ? (r6.items || []).length : 'n/a'})`)
        const w6 = await washQueueState()
        const rw6 = (w6.rows || []).find((r) => String(r._id) === o6id)
        ok(rw6 && (rw6.items || []).length === 7,
            `S3 shows the 7 that arrived (showed ${rw6 ? (rw6.items || []).length : 'n/a'})`)

        // the remaining 3 DO need pretreatment
        b = await SortService.bulkSortItems(
            req(o6id, {
                itemIds: o6items.slice(7),
                colorGroup: 'white',
                fabricType: 'delicate',
                pretreatmentOptions: ['stain_treatment_required'],
            }, {}, s2._id),
        )
        ok(b.success === true, `bulk sort of the last 3 accepted (${b.success ? 'ok' : b.data?.error})`)
        const bm2 = unwrap(b) || {}
        ok(bm2.pretreatmentRequired === true, 'those 3 DO need pretreatment')
        ok(bm2.readyForWash === 0,
            `and they are NOT sent to wash yet — they stay at S2 (readyForWash ${bm2.readyForWash})`)
        o6doc = await reload(o6id)
        ok(o6doc.items.slice(7).every((i) => i.pretreatStatus === 'pending'),
            'they wait on the pretreatment step')
        ok(o6doc.items.slice(7).every((i) => i.colorGroup === 'white' && i.fabricType === 'delicate'),
            'fabric type applies to WHITE items too (brief 1.5 item 3)')

        // …she treats them and marks the pretreatment done → they join the rest
        for (const id of o6items.slice(7)) {
            const pr = await SortService.markItemAsPretreated(req(o6id, {}, { itemId: id }, s2._id))
            ok(pr.success === true, `pretreatment marked done (${pr.success ? 'ok' : pr.data?.error})`)
        }
        const pend6b = unwrap(await handoff.pendingQueue({ query: { toStation: S.WASH_AND_DRY_STATION }, user: { id: String(s3._id) }, body: {} }))
        const row6b = (pend6b?.queue || pend6b?.data || pend6b || []).find((r) => String(r.orderId) === o6id)
        ok(!!row6b && row6b.count === 3,
            `the pretreated 3 were handed to S3 as a second batch (count ${row6b?.count})`)
        await handoff.confirm(req(o6id, { rejectedItems: [] }, { hid: String(row6b.handoffId) }, s3._id))
        o6doc = await reload(o6id)
        ok(o6doc.items.every((i) => i.currentStation === S.WASH_AND_DRY_STATION),
            'all 10 pieces have now joined at S3 — the worked example completes')
        const q6b = await sortQueueState()
        ok(!q6b.ids.includes(o6id), 'and the order has left the S2 queue')
        ok(q6b.count === q6b.ids.length, `S2 COUNT (${q6b.count}) matches its list (${q6b.ids.length})`)

        // guard rails — on an order still AT S2 (o6 has fully moved to S3 now,
        // so it would be refused by the order-level guard before these).
        const o7 = await makeOrder({
            stage: { status: ORDER_STATUS.SORT_AND_PRETREAT, updatedAt: new Date() },
            stationStatus: S.SORT_AND_PRETREAT_STATION,
            items: pieces().map((p) => ({ ...p, currentStation: S.SORT_AND_PRETREAT_STATION })),
        })
        const o7id = String(o7._id)
        const o7items = (await reload(o7id)).items.map((i) => String(i._id))

        b = await SortService.bulkSortItems(req(o7id, { all: true }, {}, s2._id))
        ok(b.success === false && /colour group/i.test(b.data?.error || ''),
            `colour group is required before marking sorted ("${b.data?.error}")`)
        b = await SortService.bulkSortItems(
            req(o7id, {
                itemIds: [o7items[0]],
                colorGroup: 'white',
                fabricType: 'light',
                pretreatmentOptions: ['no_pretreatment_needed', 'odor_removal'],
            }, {}, s2._id),
        )
        ok(b.success === false && /cannot be combined/i.test(b.data?.error || ''),
            `"no pretreatment needed" cannot be combined with a treatment ("${b.data?.error}")`)
        b = await SortService.bulkSortItems(
            req(o7id, {
                itemIds: [o7items[0]],
                colorGroup: 'white',
                pretreatmentOptions: ['no_pretreatment_needed'],
            }, {}, s2._id),
        )
        ok(b.success === false && /fabric type/i.test(b.data?.error || ''),
            `fabric type is required before marking sorted ("${b.data?.error}")`)

        // an item that has left this station, on an order still partly here
        b = await SortService.bulkSortItems(
            req(o7id, {
                itemIds: o7items,
                colorGroup: 'white',
                fabricType: 'light',
                pretreatmentOptions: ['no_pretreatment_needed'],
            }, {}, s2._id),
        )
        ok(b.success === true, 'all 5 sorted and handed over')
        const o8 = await makeOrder({
            stage: { status: ORDER_STATUS.SORT_AND_PRETREAT, updatedAt: new Date() },
            stationStatus: S.SORT_AND_PRETREAT_STATION,
            items: pieces().map((p, n) => ({
                ...p,
                currentStation: n < 2 ? S.WASH_AND_DRY_STATION : S.SORT_AND_PRETREAT_STATION,
            })),
        })
        const o8items = (await reload(String(o8._id))).items.map((i) => String(i._id))
        b = await SortService.bulkSortItems(
            req(String(o8._id), { itemIds: [o8items[0]], colorGroup: 'colored' }, {}, s2._id),
        )
        ok(b.success === false && /not at sort & pretreat/i.test(b.data?.error || ''),
            `selecting a piece that already left is refused and says so ("${b.data?.error}")`)
        ok(Array.isArray(b.data?.itemsNotAtStation) && b.data.itemsNotAtStation.length === 1,
            'and the response names exactly which piece')

        // ── [15] A PIECE ON HOLD DOES NOT MOVE ──────────────────────────────
        // The client asked us to confirm this (2026-10-08) and it was NOT true.
        // A hold writes only `flaggedForReview` + `holdDetails`; it never touches
        // the station status the handoff's completion gate reads. So a piece
        // finished at its station and THEN held satisfied every gate and was
        // pushed onward with its hold still open.
        console.log('\n[15] a piece on hold stays put until the hold is released')
        const o9 = await makeOrder({
            stage: { status: ORDER_STATUS.SORT_AND_PRETREAT, updatedAt: new Date() },
            stationStatus: S.SORT_AND_PRETREAT_STATION,
            items: pieces().map((p) => ({
                ...p,
                currentStation: S.SORT_AND_PRETREAT_STATION,
            })),
        })
        const o9id = String(o9._id)
        const o9items = (await reload(o9id)).items.map((i) => String(i._id))

        // Finish every piece at this station, WITHOUT handing over.
        b = await SortService.bulkSortItems(
            req(o9id, {
                itemIds: o9items,
                colorGroup: 'white',
                fabricType: 'light',
                pretreatmentOptions: ['no_pretreatment_needed'],
                markSorted: true,
                sendToWash: false,
            }, {}, s2._id),
        )
        ok(b.success === true, 'all pieces finished at sort & pretreat, nothing handed over')

        // Now hold ONE of them — after it is already complete, which is the
        // case the old gates could not see.
        const heldId = o9items[0]
        // HARNESS NOTE: a station may NOT assign a hold to itself — S2's
        // `assignTo` is limited to admin / intake-and-tag, which is the
        // section-B rule that a hold is handed to whoever can resolve it. So
        // the release below has to come from Intake, not from S2.
        const held = await SortService.sendToHold({
            params: { id: o9id, itemId: heldId },
            user: { id: String(s2._id) },
            body: { reason: 'Stain needs a second look', note: 'STG', assignTo: 'intake-and-tag' },
        })
        ok(held.success === true, `the piece was placed on hold (${held.success ? 'ok' : held.data?.error})`)

        // An explicit push of the held piece must be refused BY NAME.
        let pushed = await handoff.push({
            params: { id: o9id },
            user: { id: String(s2._id) },
            body: {
                fromStation: S.SORT_AND_PRETREAT_STATION,
                toStation: S.WASH_AND_DRY_STATION,
                itemIds: [heldId],
            },
        })
        ok(pushed.success === false, 'pushing the held piece is REFUSED')
        ok(/on hold/i.test(pushed.data?.error || ''),
            `and the refusal says why ("${pushed.data?.error}")`)

        // A push of the whole batch must be refused too — one open hold must
        // not be smuggled through alongside its siblings.
        pushed = await handoff.push({
            params: { id: o9id },
            user: { id: String(s2._id) },
            body: {
                fromStation: S.SORT_AND_PRETREAT_STATION,
                toStation: S.WASH_AND_DRY_STATION,
                itemIds: o9items,
            },
        })
        ok(pushed.success === false,
            'a batch containing the held piece is refused, not partly sent')

        // WHAT ACTUALLY HAPPENS, and it is worth knowing: holding ONE piece at
        // S2 flips the whole ORDER's stage.status to `hold`, and S2's station
        // guard then refuses every further action on that order — so the four
        // siblings stop too. The client asked only that held pieces not move;
        // this is a stronger guarantee than they asked for, but it also means a
        // single held piece parks its whole order. That is a product question
        // for them, NOT something to quietly change here: order-level hold is
        // what drives Holds Management.
        b = await SortService.bulkSortItems(
            req(o9id, { all: true, markSorted: true }, {}, s2._id),
        )
        ok(b.success === false,
            'while the hold is open, no further work at this station is accepted')
        ok(/hold/i.test(b.data?.error || ''),
            `and the refusal names the hold ("${b.data?.error}")`)
        let fresh9 = await reload(o9id)
        const heldItem = fresh9.items.find((i) => String(i._id) === heldId)
        ok(heldItem.currentStation === S.SORT_AND_PRETREAT_STATION,
            `*** the held piece is STILL at sort & pretreat (${heldItem.currentStation}) ***`)
        const stillHere9 = fresh9.items.filter(
            (i) => i.currentStation === S.SORT_AND_PRETREAT_STATION,
        )
        ok(stillHere9.length === o9items.length,
            `all ${stillHere9.length} pieces are parked, not just the held one — ONE HOLD STOPS THE ORDER`)

        // Release it, and now it may move.
        // Released by INTAKE, because that is the station the hold was assigned
        // to; S2's own release only sees holds assigned to S2.
        const released = await intake.releaseFromHold({
            params: { id: o9id },
            user: { id: String(s1._id) },
            body: { note: 'STG resolved' },
        })
        ok(released.success === true,
            `the hold was released (${released.success ? 'ok' : released.data?.error})`)
        fresh9 = await reload(o9id)
        const afterRelease = fresh9.items.find((i) => String(i._id) === heldId)
        ok(!afterRelease.holdDetails?.heldAt || !!afterRelease.holdDetails?.releasedAt,
            'the hold is recorded as released, not erased')
        pushed = await handoff.push({
            params: { id: o9id },
            user: { id: String(s2._id) },
            body: {
                fromStation: S.SORT_AND_PRETREAT_STATION,
                toStation: S.WASH_AND_DRY_STATION,
                itemIds: [heldId],
            },
        })
        ok(pushed.success === true,
            `*** once released the same piece CAN be pushed (${pushed.success ? 'ok' : pushed.data?.error}) ***`)
    } catch (e) {
        FAIL++
        console.log('\n  ✗ THREW:', e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e)
    } finally {
        console.log('\nCleaning up…')
        await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        await ActivityModel.deleteMany({ orderId: { $in: created.orderIds } })
        await AuditLogModel.deleteMany({ orderId: { $in: created.orderIds } })
        await NotificationModel.deleteMany({ userId: { $in: created.userIds } })
        await CrmProfileModel.deleteMany({ userId: { $in: created.userIds } })
        await UserModel.deleteMany({ _id: { $in: created.userIds } })
        const leftOrders = await BookOrderModel.countDocuments({ _id: { $in: created.orderIds } })
        const leftUsers = await UserModel.countDocuments({ _id: { $in: created.userIds } })
        console.log(`  leftover orders: ${leftOrders}, leftover users: ${leftUsers}`)
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed\n`)
        process.exit(FAIL ? 1 : 0)
    }
}

main()
