/**
 * Holds: Active vs Overdue — client brief 6 Oct 2026, item 4.4.
 *
 * "Active shows 3 orders 'within SLA'. Overdue shows 3 orders 'SLA breached'.
 *  They are the same 3 orders. One of them, OSC-20260609-931296, is marked SLA
 *  Breached at 2845h 4m on hold and is still counted as Active."
 *
 * THEIR TEST, verbatim: "With 3 breached holds and no others, Active shows 0 and
 * Overdue shows 3."
 *
 * The fix (util/holdSla.js) was verified structurally offline — the two filters
 * are exact complements. This runs the REAL admin endpoints against real rows,
 * because a structural check cannot prove the dashboard card and the list behind
 * it agree (the 1.1 lesson: a count must equal the length of its own list).
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Deletes what it creates.
 * It also PARKS any pre-existing holds in the target DB (moving them out of the
 * hold stage for the duration) so "and no others" is literally true, then puts
 * every one of them back.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node holdsStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const AdminService = require('./services/admin.service')
const {
    ORDER_STATUS,
    DELIVERY_SPEED,
    SERVICE_TIERS,
    ORDER_CHANNEL,
    ORDER_SERVICE_TYPE,
    PAYMENT_ORDER_STATUS,
    ROLE,
} = require('./util/constants')
const { HOLD_SLA_HOURS } = require('./util/holdSla')
const HoldTypeModel = require('./models/holdType.model')

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

// NOTE both of these are declared `(req, res)` but they RETURN a BaseService
// envelope and never touch `res` — so drive them like the other services and read
// the return value. (A res-capturing wrapper silently produced `undefined` for
// every figure, and two assertions then "passed" against empty arrays: green for
// the wrong reason.)
const call = async (fn, query = {}) => {
    const result = await fn({
        query,
        params: {},
        user: { id: new mongoose.Types.ObjectId().toString() },
    })
    if (!result?.success) {
        throw new Error(
            `endpoint refused: ${JSON.stringify(result?.data || result)}`,
        )
    }
    return result.data?.message ?? result.data
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

    const createdIds = []
    const createdTypeIds = []
    let parked = []
    try {
        // ── park any existing holds so "and no others" is true ────────────────
        parked = await BookOrderModel.find({ 'stage.status': ORDER_STATUS.HOLD })
            .select('_id')
            .lean()
        if (parked.length) {
            console.log(`  (parking ${parked.length} pre-existing hold(s) for the run)`)
            await BookOrderModel.updateMany(
                { _id: { $in: parked.map((p) => p._id) } },
                { $set: { 'stage.status': ORDER_STATUS.QUEUE } },
            )
        }

        const now = new Date()
        const mkHold = async (tag, speed, hoursOnHold, deliveryDate = null) => {
            const o = await BookOrderModel.create({
                fullName: 'STG Hold Customer',
                phoneNumber: '08050000001',
                serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
                serviceTier: SERVICE_TIERS.CLASSIC,
                deliverySpeed: speed,
                channel: ORDER_CHANNEL.OFFICE,
                amount: 5000,
                oscNumber: `OSC-HOLD${STAMP}-${tag}`,
                paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                items: [{ type: 'shirt', price: 1000, quantity: 1 }],
                stage: { status: ORDER_STATUS.HOLD },
                ...(deliveryDate ? { deliveryDate } : {}),
            })
            // stage.updatedAt is what the SLA measures from; set it directly so
            // the row is exactly N hours into its hold.
            await BookOrderModel.updateOne(
                { _id: o._id },
                { $set: { 'stage.updatedAt': new Date(now - hoursOnHold * HOUR) } },
            )
            createdIds.push(o._id)
            return o
        }

        console.log('\nSLA hours per delivery speed:', JSON.stringify(HOLD_SLA_HOURS))

        // ── 1 THE CLIENT'S TEST: 3 breached holds and no others ───────────────
        console.log("\n1 — the client's test: 3 breached holds, nothing else on hold")
        // Each one comfortably past its own SLA, including a 2845h row like the
        // OSC-20260609-931296 they quoted.
        await mkHold('B1', DELIVERY_SPEED.SAME_DAY, HOLD_SLA_HOURS[DELIVERY_SPEED.SAME_DAY] + 2)
        await mkHold('B2', DELIVERY_SPEED.EXPRESS, HOLD_SLA_HOURS[DELIVERY_SPEED.EXPRESS] + 2)
        await mkHold('B3', DELIVERY_SPEED.STANDARD, 2845) // their 2845h 4m order

        const dash1 = await call(admin.getDashboardStats.bind(admin))
        ok(!!dash1, `dashboard responds`)
        const stats1 = dash1 || {}
        ok(
            stats1.overdueHolds === 3,
            `Overdue shows 3 (got ${stats1.overdueHolds})`,
        )
        ok(
            stats1.activeHolds === 0,
            `*** Active shows 0 — the client's exact test *** (got ${stats1.activeHolds})`,
        )

        // ── 2 the lists behind the two cards ──────────────────────────────────
        console.log('\n2 — the list behind each card matches the number on it')
        const listOf = (type) =>
            call(admin.getHoldOrders.bind(admin), { type, page: 1, limit: 100 })
        const overdueList = await listOf('overdueHolds')
        const activeList = await listOf('activeHolds')
        const rows = (r) => r?.data || []
        ok(
            rows(overdueList).length === 3,
            `Overdue list holds 3 rows (got ${rows(overdueList).length})`,
        )
        ok(
            rows(activeList).length === 0,
            `Active list is empty (got ${rows(activeList).length})`,
        )
        const overdueRefs = rows(overdueList).map((o) => o.oscNumber)
        ok(
            overdueRefs.includes(`OSC-HOLD${STAMP}-B3`),
            'the 2845h order IS in Overdue',
        )
        ok(
            !rows(activeList).some((o) => o.oscNumber === `OSC-HOLD${STAMP}-B3`),
            'the 2845h order is NOT also in Active (the reported bug)',
        )

        // ── 3 add holds that are still inside SLA ─────────────────────────────
        console.log('\n3 — add 2 holds inside their SLA: Active 2, Overdue 3, no overlap')
        await mkHold('A1', DELIVERY_SPEED.STANDARD, 1)
        await mkHold('A2', DELIVERY_SPEED.EXPRESS, 1)

        const dash2 = await call(admin.getDashboardStats.bind(admin))
        const stats2 = dash2 || {}
        ok(stats2.activeHolds === 2, `Active shows 2 (got ${stats2.activeHolds})`)
        ok(stats2.overdueHolds === 3, `Overdue still shows 3 (got ${stats2.overdueHolds})`)

        const totalHolds = await BookOrderModel.countDocuments({
            'stage.status': ORDER_STATUS.HOLD,
        })
        ok(
            stats2.activeHolds + stats2.overdueHolds === totalHolds,
            `Active + Overdue == every order on hold (${stats2.activeHolds}+${stats2.overdueHolds}==${totalHolds})`,
        )

        const activeList2 = await listOf('activeHolds')
        const overdueList2 = await listOf('overdueHolds')
        ok(
            rows(activeList2).length === stats2.activeHolds,
            `Active list length equals its card (${rows(activeList2).length} vs ${stats2.activeHolds})`,
        )
        ok(
            rows(overdueList2).length === stats2.overdueHolds,
            `Overdue list length equals its card (${rows(overdueList2).length} vs ${stats2.overdueHolds})`,
        )
        const aRefs = new Set(rows(activeList2).map((o) => o.oscNumber))
        const oRefs = new Set(rows(overdueList2).map((o) => o.oscNumber))
        ok(
            [...aRefs].every((r) => !oRefs.has(r)),
            'NO order appears in both lists',
        )

        // The reported symptom was a row BADGED "SLA Breached" sitting in Active.
        // The badge used to be computed from its own hardcoded copy of the SLA, so
        // it could disagree with the bucket the row was in. It must now agree.
        ok(
            rows(overdueList2).every((o) => o.holdMeta?.slaBreached === true),
            'every row in Overdue is badged SLA Breached',
        )
        ok(
            rows(activeList2).every((o) => o.holdMeta?.slaBreached === false),
            'NO row in Active is badged SLA Breached (the client\'s screenshot)',
        )
        ok(
            rows(overdueList2).every(
                (o) => o.holdMeta?.slaThresholdMinutes ===
                    (HOLD_SLA_HOURS[o.deliverySpeed] || 6) * 60,
            ),
            'the threshold shown on the row comes from the shared SLA table',
        )

        // ── 4 a hold past its deliveryDate breaches even inside the hour SLA ───
        console.log('\n4 — a hold past its promised delivery date is Overdue')
        await mkHold('D1', DELIVERY_SPEED.STANDARD, 1, new Date(now - 24 * HOUR))
        const dash3 = await call(admin.getDashboardStats.bind(admin))
        const stats3 = dash3 || {}
        ok(
            stats3.overdueHolds === 4,
            `Overdue picks it up (got ${stats3.overdueHolds})`,
        )
        ok(
            stats3.activeHolds === 2,
            `and Active does NOT (got ${stats3.activeHolds})`,
        )
        const totalHolds2 = await BookOrderModel.countDocuments({
            'stage.status': ORDER_STATUS.HOLD,
        })
        ok(
            stats3.activeHolds + stats3.overdueHolds === totalHolds2,
            `still partitions every hold (${stats3.activeHolds}+${stats3.overdueHolds}==${totalHolds2})`,
        )

        // ── 5 an order NOT on hold is in neither ──────────────────────────────
        const notHeld = await BookOrderModel.create({
            fullName: 'STG Not Held',
            phoneNumber: '08050000002',
            serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
            serviceTier: SERVICE_TIERS.CLASSIC,
            deliverySpeed: DELIVERY_SPEED.STANDARD,
            channel: ORDER_CHANNEL.OFFICE,
            amount: 1000,
            oscNumber: `OSC-HOLD${STAMP}-N1`,
            paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
            items: [{ type: 'shirt', price: 1000, quantity: 1 }],
            stage: { status: ORDER_STATUS.WASHING },
        })
        createdIds.push(notHeld._id)
        const dash4 = await call(admin.getDashboardStats.bind(admin))
        ok(
            (dash4 || {}).activeHolds === 2 &&
                (dash4 || {}).overdueHolds === 4,
            'an order that is not on hold changes neither count',
        )

        // ── 6 HOLD TYPES (client section B, 2026-10-07) ──────────────────────
        // "The limit should depend on the kind of hold, not on the speed of the
        // order." The whole point: a PAYMENT hold legitimately lasts a day or
        // more, and under the 2/4/6-hour speed table every one of them would be
        // Overdue within hours — turning the card 4.4 just fixed back into noise.
        console.log('\n6 — a payment hold is judged by its own 48-hour limit')
        const payType = await HoldTypeModel.findOneAndUpdate(
            { key: HoldTypeModel.PAYMENT_HOLD_KEY },
            {
                $setOnInsert: {
                    key: HoldTypeModel.PAYMENT_HOLD_KEY,
                    name: 'Awaiting payment',
                    slaHours: 48,
                    judgeByOwnLimitOnly: true,
                    isSystem: true,
                },
            },
            { upsert: true, new: true },
        )
        createdTypeIds.push(payType._id)

        // 10 hours on hold: far past every operational limit, nowhere near 48.
        const payHold = await mkHold('PAY1', DELIVERY_SPEED.STANDARD, 10)
        await BookOrderModel.updateOne(
            { _id: payHold._id },
            { $set: { 'orderHold.holdTypeKey': HoldTypeModel.PAYMENT_HOLD_KEY } },
        )

        const dash5 = await call(admin.getDashboardStats.bind(admin))
        ok(
            (dash5 || {}).activeHolds === 3,
            `*** a 10-hour payment hold counts as ACTIVE, not overdue *** (active ${(dash5 || {}).activeHolds}, want 3)`,
        )
        ok(
            (dash5 || {}).overdueHolds === 4,
            `and Overdue is unchanged at 4 (got ${(dash5 || {}).overdueHolds})`,
        )

        // the row badge must agree with the card it sits under — the exact
        // failure 4.4's follow-up had to fix, now re-testable per type
        const activeRows = rows(await listOf("activeHolds"))
        const payRow = activeRows.find(
            (r) => r.oscNumber === `OSC-HOLD${STAMP}-PAY1`,
        )
        ok(!!payRow, 'and it appears in the Active list, not the Overdue one')
        ok(
            payRow?.holdMeta?.slaBreached === false,
            'its row badge reads NOT breached, agreeing with its card',
        )
        ok(
            payRow?.holdMeta?.slaThresholdMinutes === 48 * 60,
            `and the badge shows the 48-hour limit, not 6 (got ${payRow?.holdMeta?.slaThresholdMinutes} minutes)`,
        )
        ok(
            payRow?.holdMeta?.holdTypeName === 'Awaiting payment',
            'the row names the hold type so staff can see why the clock is longer',
        )

        // past 48 hours it DOES breach
        const oldPay = await mkHold('PAY2', DELIVERY_SPEED.STANDARD, 50)
        await BookOrderModel.updateOne(
            { _id: oldPay._id },
            { $set: { 'orderHold.holdTypeKey': HoldTypeModel.PAYMENT_HOLD_KEY } },
        )
        const dash6 = await call(admin.getDashboardStats.bind(admin))
        ok(
            (dash6 || {}).overdueHolds === 5 && (dash6 || {}).activeHolds === 3,
            `a 50-hour payment hold IS overdue (active ${(dash6 || {}).activeHolds} want 3, overdue ${(dash6 || {}).overdueHolds} want 5)`,
        )
        ok(
            (dash6 || {}).activeHolds + (dash6 || {}).overdueHolds ===
                (await BookOrderModel.countDocuments({
                    'stage.status': ORDER_STATUS.HOLD,
                })),
            '*** Active + Overdue still equals every hold — the 4.4 property survives types ***',
        )

        // "judged only by its own limit": a passed delivery date must NOT drag a
        // payment hold into Overdue. On a Quick Booking that date does not even
        // exist yet, because the clock starts when payment is confirmed.
        await BookOrderModel.updateOne(
            { _id: payHold._id },
            { $set: { deliveryDate: new Date(Date.now() - 24 * HOUR) } },
        )
        const dash7 = await call(admin.getDashboardStats.bind(admin))
        ok(
            (dash7 || {}).activeHolds === 3,
            `*** a past delivery date does NOT overdue a payment hold *** (active ${(dash7 || {}).activeHolds}, want 3)`,
        )

        // ── 7 escalation fires once, not every sweep ─────────────────────────
        console.log('\n7 — an overdue hold escalates to an admin exactly once')
        const first = await admin.escalateOverdueHolds()
        ok(first >= 1, `the sweep escalated ${first} overdue hold(s)`)
        const second = await admin.escalateOverdueHolds()
        ok(
            second === 0,
            `a second sweep escalates nothing (got ${second}) — the latch holds`,
        )

        // ── 8 an operational type with no limit set still follows the speed ──
        console.log('\n8 — an operational type with no limit is unchanged')
        const opType = await HoldTypeModel.findOneAndUpdate(
            { key: `stg_op_${STAMP}` },
            {
                $setOnInsert: {
                    key: `stg_op_${STAMP}`,
                    name: 'STG operational',
                    slaHours: null, // follows the order's delivery speed
                },
            },
            { upsert: true, new: true },
        )
        createdTypeIds.push(opType._id)
        const opHold = await mkHold('OP1', DELIVERY_SPEED.STANDARD, 10)
        await BookOrderModel.updateOne(
            { _id: opHold._id },
            { $set: { 'orderHold.holdTypeKey': opType.key } },
        )
        const dash8 = await call(admin.getDashboardStats.bind(admin))
        ok(
            (dash8 || {}).overdueHolds === 6,
            `*** a type with no limit still breaches on the 6-hour standard clock *** (overdue ${(dash8 || {}).overdueHolds}, want 6)`,
        )

        // ── 9 the hold-type CRUD endpoints ───────────────────────────────────
        // The SLA maths was covered from the start; the four endpoints an admin
        // actually uses were not, which is the gap this closes.
        console.log('\n[9] the hold-type admin endpoints')
        const adminReq = (body = {}, params = {}, query = {}) => ({
            body,
            params,
            query,
            user: { id: new mongoose.Types.ObjectId().toString() },
        })

        let r = await admin.createHoldType(
            adminReq({
                name: `STG Awaiting customer reply ${STAMP}`,
                slaHours: 24,
                stations: [ROLE.INTAKE_AND_TAG],
                escalateToAdmin: true,
            }),
        )
        const made = r?.data?.message
        if (made?._id) createdTypeIds.push(made._id)
        ok(r.success === true, `create works (${r.success ? 'ok' : r.data?.error})`)
        ok(!!made?.key, `and derives a permanent key (${made?.key})`)
        ok(made?.slaHours === 24, 'with the limit the admin set')

        // The key is permanent because ORDERS STORE IT — a rename must not
        // orphan every hold already carrying it.
        r = await admin.updateHoldType(
            adminReq({ name: `STG Renamed ${STAMP}`, slaHours: 36 }, { id: String(made._id) }),
        )
        ok(r.success === true, `update works (${r.success ? 'ok' : r.data?.error})`)
        const afterRename = await HoldTypeModel.findById(made._id).lean()
        ok(afterRename.key === made.key, '*** the key survives a rename ***')
        ok(afterRename.slaHours === 36, 'and the new limit stuck')

        r = await admin.createHoldType(adminReq({ name: `STG Renamed ${STAMP}` }))
        ok(r.success === false, 'a duplicate name is refused')
        r = await admin.createHoldType(adminReq({}))
        ok(r.success === false, 'a missing name is refused')
        r = await admin.createHoldType(
            adminReq({ name: `STG Bad station ${STAMP}`, stations: ['not-a-station'] }),
        )
        ok(r.success === false, 'an unknown station is refused')

        const listed = (await admin.listHoldTypes(adminReq({}, {}, {})))?.data?.message || []
        ok(
            listed.some((t) => String(t._id) === String(made._id)),
            `the list returns it (${listed.length} types)`,
        )

        // Deleting a type that orders are SITTING ON must deactivate, not
        // delete: a real delete would drop those holds back onto the speed
        // clock and read as instantly overdue.
        await BookOrderModel.updateOne(
            { _id: opHold._id },
            { $set: { 'orderHold.holdTypeKey': afterRename.key } },
        )
        r = await admin.deleteHoldType(adminReq({}, { id: String(made._id) }))
        ok(r.success === true, `delete accepted (${r.success ? 'ok' : r.data?.error})`)
        const afterDelete = await HoldTypeModel.findById(made._id).lean()
        ok(
            !!afterDelete && afterDelete.active === false,
            '*** a type in use is DEACTIVATED, not removed ***',
        )

        // The payment hold is system-owned and must survive both.
        const payTypeNow = await HoldTypeModel.findOne({
            key: HoldTypeModel.PAYMENT_HOLD_KEY,
        }).lean()
        if (payTypeNow) {
            r = await admin.deleteHoldType(adminReq({}, { id: String(payTypeNow._id) }))
            ok(r.success === false, 'the payment hold type cannot be deleted')
            r = await admin.updateHoldType(
                adminReq({ name: 'Renamed payment hold' }, { id: String(payTypeNow._id) }),
            )
            ok(r.success === false, 'nor renamed — the payment flow looks it up by key')
        }
    } finally {
        if (createdTypeIds.length) {
            // Only the types this run created. A real seeded payment type in the
            // target DB would have been upserted rather than created, so this
            // removes the staging ones without touching real configuration.
            await require('./models/holdType.model').deleteMany({
                _id: { $in: createdTypeIds },
                key: { $regex: `^stg_|^${require('./models/holdType.model').PAYMENT_HOLD_KEY}$` },
            })
        }
        const d = await BookOrderModel.deleteMany({ _id: { $in: createdIds } })
        if (parked.length) {
            await BookOrderModel.updateMany(
                { _id: { $in: parked.map((p) => p._id) } },
                { $set: { 'stage.status': ORDER_STATUS.HOLD } },
            )
        }
        const back = await BookOrderModel.countDocuments({
            'stage.status': ORDER_STATUS.HOLD,
        })
        console.log(
            `\ncleanup: ${d.deletedCount} staging orders removed; ${parked.length} pre-existing hold(s) restored (now ${back} on hold)`,
        )
        ok(back === parked.length, 'the DB is back to the holds it started with')
        ok(
            (await BookOrderModel.countDocuments({
                oscNumber: { $regex: `OSC-HOLD${STAMP}` },
            })) === 0,
            'no staging orders left behind',
        )
        await mongoose.disconnect()
    }
    console.log(`\n${PASS} passed, ${FAIL} failed\n`)
    process.exit(FAIL ? 1 : 0)
}

main().catch(async (e) => {
    console.error('HARNESS ERROR:', e)
    try {
        await mongoose.disconnect()
    } catch (_) {}
    process.exit(1)
})
