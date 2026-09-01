/**
 * Split-flow backfill — stamps `items[].currentStation` where it is missing.
 *
 * `currentStation` arrived with the split-flow engine (2026-08-28). Orders
 * written before that have no such field, and Mongo does NOT match a missing
 * field — so `{ 'items.currentStation': X }` silently skips them and those
 * orders never appear in a station queue again.
 *
 * The mapping is lossless because legacy orders were WHOLE-ORDER moved: every
 * item in one sits at exactly one station, so `stage.status` inverts cleanly
 * through STATION_TO_ORDER_STATUS.
 *
 * Writes ONLY `items[].currentStation` — never `stage.status` — so nothing else
 * shifts. Idempotent: items that already have the field are left alone, so it is
 * safe to re-run.
 *
 * Run:  node stationBackfill.js --dry     (report only, no writes)
 *       node stationBackfill.js           (apply)
 */
require('dotenv').config()
const mongoose = require('mongoose')
const connectToMongoDB = require('./config/db')
const BookOrderModel = require('./models/bookOrder.model')
const { ORDER_STATUS, STATION_STATUS } = require('./util/constants')

const DRY = process.argv.includes('--dry')

const S = STATION_STATUS

// stage.status → the station every item of that legacy order was sitting at.
// Post-pipeline states land on QC so they stay out of every station queue.
const STAGE_TO_STATION = {
    [ORDER_STATUS.PENDING]: S.INTAKE_AND_TAG_STATION,
    [ORDER_STATUS.QUEUE]: S.INTAKE_AND_TAG_STATION,
    [ORDER_STATUS.RECEIVED]: S.INTAKE_AND_TAG_STATION,
    [ORDER_STATUS.PICKED_UP]: S.INTAKE_AND_TAG_STATION,
    [ORDER_STATUS.SORT_AND_PRETREAT]: S.SORT_AND_PRETREAT_STATION,
    [ORDER_STATUS.WASHING]: S.WASH_AND_DRY_STATION,
    [ORDER_STATUS.DRYING]: S.WASH_AND_DRY_STATION,
    [ORDER_STATUS.IRONING]: S.PRESSING_AND_IRONING_STATION,
    [ORDER_STATUS.QC]: S.QC_STATION,
    [ORDER_STATUS.READY]: S.QC_STATION,
    [ORDER_STATUS.OUT_FOR_DELIVERY]: S.QC_STATION,
    [ORDER_STATUS.DELIVERED]: S.QC_STATION,
    [ORDER_STATUS.CANCELLED]: S.QC_STATION,
}

// Real pipeline stations only — `stationStatus` can also hold admin/rider/pending.
const PIPELINE = new Set(BookOrderModel.STATION_SEQUENCE)

// HOLD has no station of its own: prefer the order's stationStatus, else the
// last non-hold stage it passed through, else intake.
function resolveHeldStation(order) {
    if (PIPELINE.has(order.stationStatus)) return order.stationStatus
    const history = [...(order.stageHistory || [])].reverse()
    for (const h of history) {
        if (h.status === ORDER_STATUS.HOLD) continue
        const mapped = STAGE_TO_STATION[h.status]
        if (mapped) return mapped
    }
    return S.INTAKE_AND_TAG_STATION
}

function resolveStation(order) {
    if (order.stage?.status === ORDER_STATUS.HOLD) return resolveHeldStation(order)
    return STAGE_TO_STATION[order.stage?.status] || S.INTAKE_AND_TAG_STATION
}

async function main() {
    await connectToMongoDB(process.env.MONGODB_URL)

    // Only orders with at least one item missing the field.
    const orders = await BookOrderModel.find({
        items: { $elemMatch: { currentStation: { $exists: false } } },
    })
        .select('oscNumber stage stageHistory stationStatus items')
        .lean()

    console.log(
        `${orders.length} order(s) have items without currentStation${DRY ? ' (DRY RUN — no writes)' : ''}`,
    )
    if (!orders.length) {
        await mongoose.connection.close()
        return
    }

    const byStation = {}
    const ops = []

    for (const order of orders) {
        const station = resolveStation(order)
        byStation[station] = (byStation[station] || 0) + 1

        for (const item of order.items || []) {
            if (item.currentStation) continue // idempotent: never overwrite
            ops.push({
                updateOne: {
                    filter: { _id: order._id, 'items._id': item._id },
                    update: { $set: { 'items.$.currentStation': station } },
                },
            })
        }
    }

    console.log(`  ${ops.length} item(s) to stamp`)
    for (const [station, count] of Object.entries(byStation)) {
        console.log(`  ${station}: ${count} order(s)`)
    }

    if (DRY) {
        console.log('DRY RUN — nothing written. Re-run without --dry to apply.')
        await mongoose.connection.close()
        return
    }

    // Chunked: one bulkWrite per 1000 ops keeps the payload well inside limits.
    let written = 0
    for (let i = 0; i < ops.length; i += 1000) {
        const res = await BookOrderModel.bulkWrite(ops.slice(i, i + 1000))
        written += res.modifiedCount || 0
    }

    const remaining = await BookOrderModel.countDocuments({
        items: { $elemMatch: { currentStation: { $exists: false } } },
    })
    console.log(`Stamped ${written} item(s). Orders still missing: ${remaining}`)

    await mongoose.connection.close()
}

main().catch(async (err) => {
    console.error(err)
    await mongoose.connection.close()
    process.exit(1)
})
