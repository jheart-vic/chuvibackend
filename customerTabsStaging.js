/**
 * Customer order tabs (FE 17 Oct) — DB verification.
 *
 * GET order history with view=active|completed|cancelled. A cancelled order whose
 * clothes went back ("returned-unwashed") belongs under Cancelled, never Active.
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node customerTabsStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const BookOrderService = require('./services/bookOrder.service')
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
        const u = await UserModel.collection.insertOne({
            fullName: `STG TAB ${ts}`,
            email: `stg-tab-${ts}@example.com`,
            phoneNumber: `0806${String(ts).slice(-7)}`,
            userType: C.ROLE.USER,
            createdAt: new Date(),
        })
        created.users.push(u.insertedId)
        const userId = String(u.insertedId)

        const mk = async (status) => {
            const r = await BookOrderModel.collection.insertOne({
                userId: u.insertedId,
                fullName: 'STG TAB',
                phoneNumber: '08060000000',
                amount: 1000,
                oscNumber: `STGTAB${ts}-${status}`,
                serviceType: C.ORDER_SERVICE_TYPE.WASH_AND_IRON,
                items: [],
                stage: { status, note: '', updatedAt: new Date() },
                stageHistory: [],
                paymentStatus: C.PAYMENT_ORDER_STATUS.SUCCESS,
                createdAt: new Date(),
            })
            created.orders.push(r.insertedId)
        }
        await mk(C.ORDER_STATUS.WASHING)
        await mk(C.ORDER_STATUS.DELIVERED)
        await mk(C.ORDER_STATUS.CANCELLED)
        await mk(C.ORDER_STATUS.RETURNED_UNWASHED)

        const svc = new BookOrderService()
        const tab = async (view) => {
            const r = await svc.getBookOrderHistory({ query: { view, limit: 50 }, user: { id: userId, userType: C.ROLE.USER } })
            return (r?.data?.message?.data || []).map((o) => o.stage?.status).sort()
        }

        const active = await tab('active')
        const cancelled = await tab('cancelled')
        const completed = await tab('completed')
        const all = await tab('all')
        ok(cancelled.includes('returned-unwashed') && cancelled.includes('cancelled') && cancelled.length === 2, `Cancelled tab = cancelled + returned-unwashed (${cancelled.join(', ')})`)
        ok(!active.includes('returned-unwashed') && !active.includes('cancelled'), `Active tab has neither (${active.join(', ')})`)
        ok(active.includes('washing') && active.includes('delivered'), 'Active still shows in-progress and delivered')
        ok(completed.length === 1 && completed[0] === 'delivered', `Completed unchanged (${completed.join(', ')})`)
        ok(all.length === 4, `All shows every order (${all.length})`)
    } finally {
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        await UserModel.deleteMany({ _id: { $in: created.users } })
        await mongoose.disconnect()
        console.log(`customerTabsStaging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
    }
}

main().then(
    () => process.exit(FAIL ? 1 : 0),
    (e) => {
        console.error(e)
        process.exit(1)
    },
)
