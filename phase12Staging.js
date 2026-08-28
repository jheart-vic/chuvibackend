/**
 * Phase 1 (Structured Addresses) + Phase 2 (Set Items) DB verification.
 * Safety-gated like handoffStaging.js. Run:
 *   STAGING_OK=1 node phase12Staging.js
 */
require('dotenv').config()
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const ItemSetModel = require('./models/itemSet.model')
const UserModel = require('./models/user.model')
const { ROLE } = require('./util/constants')
const AdminService = require('./services/admin.service')
const IntakeUserService = require('./services/intake-user.service')
const BookOrderService = require('./services/bookOrder.service')

let PASS = 0, FAIL = 0
const ok = (c, m) => { if (c) { PASS++; console.log('  ✓', m) } else { FAIL++; console.log('  ✗ FAIL:', m) } }
const gen = () => 'P12-' + Date.now() + '-' + Math.floor(Math.random() * 1e4)

async function main() {
    if (process.env.STAGING_OK !== '1') { console.error('Set STAGING_OK=1.'); process.exit(2) }
    if (process.env.NODE_ENV === 'production' && process.env.STAGING_FORCE !== '1') {
        console.error('NODE_ENV=production — refusing without STAGING_FORCE=1.'); process.exit(2)
    }
    const url = process.env.MONGODB_URL
    if (!url) { console.error('MONGODB_URL not set.'); process.exit(2) }
    console.log('Target DB host:', url.replace(/\/\/[^@]*@/, '//***:***@').replace(/\/[^/?]+(\?|$)/, '/<db>$1'))
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000, connectTimeoutMS: 60000, retryWrites: true, retryReads: true })

    const created = { orderIds: [], userIds: [], setIds: [] }
    const staff = await UserModel.create({ email: `p12staff_${Date.now()}@ex.com`, fullName: 'P12 Staff', userType: ROLE.ADMIN })
    const cust = await UserModel.create({ email: `p12cust_${Date.now()}@ex.com`, fullName: 'P12 Customer', userType: ROLE.USER })
    created.userIds.push(staff._id, cust._id)

    const admin = new AdminService()
    const intake = new IntakeUserService()
    const book = new BookOrderService()
    const items = [{ type: 'shirt', price: 1, quantity: 1 }]

    try {
        // ── PHASE 1: STRUCTURED ADDRESSES ──────────────────────────────
        console.log('\n[P1] structured addresses')

        // staff intake REQUIRES label+landmark
        let r = await intake.createBookOrder({
            user: { id: staff._id.toString() },
            body: {
                fullName: 'P12 Customer', phoneNumber: '08000000000',
                serviceType: 'wash-and-iron', serviceTier: 'classic',
                isPickUp: true, isDelivery: false, deliverySpeed: 'standard',
                items, pickupAddress: { label: 'Home', address: '12 St' }, // no landmark
            },
        })
        ok(!r.success && /landmark is required/i.test(JSON.stringify(r.data)), 'staff intake rejects address missing landmark')

        // customer path REQUIRES an address be PRESENT when isPickUp
        r = await book.postBookOrder({
            user: { id: cust._id.toString() },
            body: {
                fullName: 'P12 Customer', phoneNumber: '08000000000',
                serviceType: 'wash-and-iron', serviceTier: 'classic',
                billingType: 'pay-per-item', deliverySpeed: 'standard',
                isPickUp: true, isDelivery: false, items, // no pickupAddress
            },
        })
        ok(!r.success && /pickupAddress is required/i.test(JSON.stringify(r.data)), 'customer booking rejects missing address when isPickUp')

        // model round-trip: structured object stored + legacy string tolerated
        const o = await BookOrderModel.create({
            userId: cust._id, fullName: 'x', phoneNumber: '1',
            serviceType: 'wash-and-iron', serviceTier: 'classic', deliverySpeed: 'standard',
            channel: 'website', amount: 1, oscNumber: gen(), paymentStatus: 'success',
            stage: { status: 'queue' },
            pickupAddress: { label: 'Home', address: '12 Lagos St', landmark: 'by GTB' },
            deliveryAddress: '5 Ademola St, VI', // legacy string
            items,
        })
        created.orderIds.push(o._id)
        const back = await BookOrderModel.findById(o._id).lean()
        ok(back.pickupAddress && back.pickupAddress.label === 'Home' && back.pickupAddress.landmark === 'by GTB', 'structured pickupAddress round-trips as an object')
        ok(typeof back.deliveryAddress === 'string', 'legacy string deliveryAddress tolerated (no cast error)')

        // ── PHASE 2: SET ITEMS ─────────────────────────────────────────
        console.log('\n[P2] set items')
        const setName = 'P12 Agbada ' + Date.now()
        r = await admin.addOrderSet({ body: { name: setName, pieces: [
            { type: undefined, name: 'Agbada', price: 3500, isHeavy: true },
            { name: 'Cap', price: 1000 },
        ] } })
        ok(r.success, 'addOrderSet (valid) succeeds')

        r = await admin.getOrderSets({})
        const mine = (r.data.message || []).find((s) => s.name === setName)
        ok(!!mine, 'getOrderSets includes the new set')
        if (mine) created.setIds.push(mine._id)
        ok(mine && mine.pieces.length === 2 && mine.pieces[0].price === 3500, 'set pieces stored with prices')

        r = await admin.getItems({})
        const arr = r.data.message || []
        const setEntry = arr.find((x) => x.kind === 'set' && x.name === setName)
        const anyItem = arr.find((x) => x.kind === 'item')
        ok(!!setEntry, 'get-order-items includes the set tagged kind:set')
        ok(!!anyItem || arr.every((x) => x.kind), 'catalog entries carry a kind tag')

        r = await admin.updateOrderSet({ params: { id: mine._id }, body: { pieces: [{ name: 'Agbada', price: 4000 }] } })
        ok(r.success, 'updateOrderSet replaces pieces')
        const upd = await ItemSetModel.findById(mine._id).lean()
        ok(upd.pieces.length === 1 && upd.pieces[0].price === 4000, 'updated set has 1 piece @4000')

        r = await admin.addOrderSet({ body: { name: 'bad', pieces: [] } })
        ok(!r.success, 'addOrderSet with no pieces rejected')

        r = await admin.deleteOrderSet({ params: { id: mine._id } })
        ok(r.success, 'deleteOrderSet succeeds')
        const gone = await ItemSetModel.findById(mine._id)
        ok(!gone, 'set removed from DB')
        created.setIds = created.setIds.filter((x) => String(x) !== String(mine._id))
    } finally {
        console.log('\n[cleanup]')
        const a = await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        const b = await ItemSetModel.deleteMany({ _id: { $in: created.setIds } })
        const c = await UserModel.deleteMany({ _id: { $in: created.userIds } })
        console.log(`  removed ${a.deletedCount} orders, ${b.deletedCount} sets, ${c.deletedCount} users`)
        await mongoose.disconnect()
    }

    console.log(`\n${PASS} passed, ${FAIL} failed`)
    process.exit(FAIL ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
