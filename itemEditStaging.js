/**
 * ITEM EDIT + RE-PRICING — DB harness (client item #7 / N1 Phase 4).
 *
 * The client's rule is "the bill is RECALCULATED through the same pricing +
 * offers", which is a claim about CODE PATHS, not about a number — so the thing
 * worth proving is that an edited order prices exactly as the SAME basket would
 * have priced at booking. That needs a real order, real settings and the real
 * offer evaluation, so it cannot be asserted offline.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node itemEditStaging.js
 */

const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const AdminSettingModel = require('./models/adminSetting.model')
const WalletModel = require('./models/wallet.model')
const WalletTransactionModel = require('./models/walletTransaction.model')
const PaymentModel = require('./models/payment.model')
const UserModel = require('./models/user.model')
const BookOrderService = require('./services/bookOrder.service')
const { countPieces } = require('./util/itemSummary')
const {
    ORDER_SERVICE_TYPE,
    SERVICE_TIERS,
    DELIVERY_SPEED,
    BILLING_TYPE,
    PAYMENT_ORDER_STATUS,
    ROLE,
} = require('./util/constants')

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) {
        pass++
        console.log(`  ✓ ${name}`)
    } else {
        fail++
        console.log(`  ✗ ${name} ${extra}`)
    }
}

const TAG = 'STGEDIT'

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

    const createdOrders = []
    const createdUsers = []
    // Captured here, not left to `main().catch` — the `finally` calls
    // process.exit, which runs BEFORE a rejection reaches the outer catch, so a
    // throw would otherwise be invisible and the run would print "0 failed"
    // having skipped everything after it. (windowBookingStaging shipped with
    // exactly that bug on its first run.)
    let thrown = null

    try {
        const svc = new BookOrderService()
        const settings = await AdminSettingModel.findOne({})
        if (!settings) throw new Error('AdminSetting missing — run setup first')

        const customer = await UserModel.create({
            fullName: `${TAG} Customer`,
            email: `${TAG.toLowerCase()}_${Date.now()}@example.com`,
            phoneNumber: '08050000912',
            password: 'x'.repeat(12),
            userType: ROLE.CUSTOMER,
        })
        createdUsers.push(customer._id)

        const mkOrder = async (items, extra = {}) => {
            const o = await BookOrderModel.create({
                oscNumber: `${TAG}-${Date.now()}-${createdOrders.length}`,
                userId: customer._id,
                fullName: customer.fullName,
                phoneNumber: customer.phoneNumber,
                serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
                serviceTier: SERVICE_TIERS.CLASSIC,
                deliverySpeed: DELIVERY_SPEED.STANDARD,
                billingType: BILLING_TYPE.PAY_PER_ITEM,
                isPickUp: true,
                isDelivery: true,
                amount: 0,
                items,
                ...extra,
            })
            createdOrders.push(o._id)
            return o
        }

        const req = (orderId, body, user) => ({
            params: { id: String(orderId) },
            body,
            user: user || { id: String(customer._id), userType: ROLE.INTAKE_AND_TAG },
        })

        // ── 1. the re-price matches the SAME basket priced from scratch ─────
        console.log('\n1. re-pricing uses the same pricing path')
        const twoShirts = [{ type: 'shirt', price: 700, quantity: 2 }]
        const fourShirts = [{ type: 'shirt', price: 700, quantity: 4 }]

        const baseline = await mkOrder(twoShirts)
        const priced2 = await svc._repriceForItems({
            order: baseline,
            items: twoShirts,
            adminOrderSetting: settings,
        })
        const priced4 = await svc._repriceForItems({
            order: baseline,
            items: fourShirts,
            adminOrderSetting: settings,
        })
        ok('re-pricing returns a total and a full receipt',
            priced2.newTotal > 0 && !!priced2.pricing && priced2.pricing.orderTotal === priced2.newTotal,
            JSON.stringify({ total: priced2.newTotal }))
        ok('doubling the pieces raises the item subtotal, fees unchanged',
            priced4.pricing.itemsSubtotal === priced2.pricing.itemsSubtotal * 2 &&
                priced4.pricing.feesTotal === priced2.pricing.feesTotal,
            `2=${priced2.pricing.itemsSubtotal}/${priced2.pricing.feesTotal} 4=${priced4.pricing.itemsSubtotal}/${priced4.pricing.feesTotal}`)
        ok('the receipt is a real one, not the reconstructed fallback',
            priced4.pricing.reconstructed !== true)

        // ── 2. total UP → a payment hold for what is outstanding ───────────
        console.log('\n2. total up → payment hold')
        const up = await mkOrder(twoShirts, { amount: priced2.newTotal })
        let res = await svc.applyItemEdit(
            req(up._id, { items: fourShirts, reason: 'Two extra shirts in the bag' }),
        )
        ok('the edit succeeds', res.success, JSON.stringify(res.data))
        const upMsg = res.data?.message || {}
        ok('  …the new total is higher and the difference is reported',
            upMsg.newTotal === priced4.newTotal &&
                upMsg.previousTotal === priced2.newTotal &&
                upMsg.difference === priced4.newTotal - priced2.newTotal,
            JSON.stringify(upMsg))
        const upFresh = await BookOrderModel.findById(up._id)
        ok('  …the order carries the new amount and the new pieces',
            upFresh.amount === priced4.newTotal && countPieces(upFresh.items) === 4,
            `amount=${upFresh.amount} pieces=${countPieces(upFresh.items)}`)
        ok('  …a payment hold was raised for it',
            upFresh.stage.status === 'hold' &&
                upFresh.orderHold?.holdTypeKey === 'payment' &&
                upFresh.paymentHold?.amount === priced4.newTotal,
            `stage=${upFresh.stage.status} key=${upFresh.orderHold?.holdTypeKey} amt=${upFresh.paymentHold?.amount}`)
        ok('  …and the change is recorded with who and why',
            (upFresh.itemEdits || []).length === 1 &&
                /extra shirts/i.test(upFresh.itemEdits[0].reason) &&
                upFresh.itemEdits[0].previousTotal === priced2.newTotal,
            JSON.stringify(upFresh.itemEdits?.[0]))

        // ── 3. total DOWN on a PAID order → the difference to the wallet ────
        console.log('\n3. total down on a paid order → wallet')
        const down = await mkOrder(fourShirts, {
            amount: priced4.newTotal,
            paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
        })
        const walletBefore =
            (await WalletModel.findOne({ userId: customer._id }))?.balance || 0
        res = await svc.applyItemEdit(
            req(down._id, { items: twoShirts, reason: 'Two shirts belonged to another order' }),
        )
        ok('the edit succeeds', res.success, JSON.stringify(res.data))
        const downMsg = res.data?.message || {}
        const expectedRefund = priced4.newTotal - priced2.newTotal
        ok('  …the refund equals the reduction', downMsg.walletRefund === expectedRefund,
            `got ${JSON.stringify(downMsg.walletRefund)} want ${expectedRefund}`)
        const walletAfter =
            (await WalletModel.findOne({ userId: customer._id }))?.balance || 0
        ok('  …and the wallet balance actually moved',
            walletAfter === walletBefore + expectedRefund,
            `${walletBefore} → ${walletAfter}`)
        // The 2.3 lesson: the customer's own history reads Payment, so a
        // WalletTransaction alone leaves the money with "no record".
        ok('  …with BOTH a ledger line and a Payment row (2.3)',
            (await WalletTransactionModel.countDocuments({
                relatedOrderId: down._id,
                type: 'credit',
            })) === 1 &&
                (await PaymentModel.countDocuments({
                    order: down._id,
                    alertType: 'credit',
                })) === 1)
        const downFresh = await BookOrderModel.findById(down._id)
        ok('  …and NO payment hold was raised (nothing is owed)',
            downFresh.stage.status !== 'hold')

        // ── 4. the guards ──────────────────────────────────────────────────
        console.log('\n4. guards')
        const guard = await mkOrder(twoShirts, { amount: priced2.newTotal })
        res = await svc.applyItemEdit(req(guard._id, { items: fourShirts }))
        ok('a reason is REQUIRED', !res.success && /reason is required/i.test(res.data?.error || ''))
        res = await svc.applyItemEdit(req(guard._id, { items: [], reason: 'x' }))
        ok('empty items refused', !res.success)
        res = await svc.applyItemEdit(
            req(guard._id, { items: [{ type: 'shirt', price: 700, quantity: 0 }], reason: 'x' }),
        )
        ok('a zero quantity is refused', !res.success)

        // "After tagging only an ADMIN may edit." Detected from the ITEMS,
        // because a tag exists while the order is still in the tagging queue.
        const tagged = await mkOrder(
            [{ type: 'shirt', price: 700, quantity: 2, tagId: 'TAG-01' }],
            { amount: priced2.newTotal },
        )
        res = await svc.applyItemEdit(
            req(tagged._id, { items: fourShirts, reason: 'late change' }),
        )
        ok('Intake is REFUSED once tagging has begun',
            !res.success && res.data?.requiresAdmin === true,
            JSON.stringify(res.data))
        res = await svc.applyItemEdit(
            req(tagged._id, { items: fourShirts, reason: 'admin override' }, {
                id: String(customer._id),
                userType: ROLE.ADMIN,
            }),
        )
        ok('  …but an ADMIN may still edit it', res.success, JSON.stringify(res.data))

        // A waiver is permission to proceed, NOT money received — so reducing a
        // waived order's bill must not refund cash that never arrived.
        const waived = await mkOrder(fourShirts, {
            amount: priced4.newTotal,
            paymentWaivedAt: new Date(),
            paymentWaiverReason: 'staging',
        })
        const wBefore =
            (await WalletModel.findOne({ userId: customer._id }))?.balance || 0
        res = await svc.applyItemEdit(
            req(waived._id, { items: twoShirts, reason: 'fewer items than recorded' }),
        )
        const wAfter =
            (await WalletModel.findOne({ userId: customer._id }))?.balance || 0
        ok('a WAIVED order is not treated as paid, so nothing is refunded',
            res.success && !res.data?.message?.walletRefund && wAfter === wBefore,
            `refund=${JSON.stringify(res.data?.message?.walletRefund)} wallet ${wBefore}→${wAfter}`)
    } catch (error) {
        thrown = error
        fail++
    } finally {
        console.log('\ncleanup')
        if (createdOrders.length) {
            await WalletTransactionModel.deleteMany({
                relatedOrderId: { $in: createdOrders },
            })
            await PaymentModel.deleteMany({ order: { $in: createdOrders } })
            await BookOrderModel.deleteMany({ _id: { $in: createdOrders } })
        }
        if (createdUsers.length) {
            await WalletModel.deleteMany({ userId: { $in: createdUsers } })
            await UserModel.deleteMany({ _id: { $in: createdUsers } })
        }
        const left = await BookOrderModel.countDocuments({
            fullName: new RegExp(`^${TAG}`),
        })
        ok('cleanup left nothing behind', left === 0, `orders=${left}`)

        if (thrown) {
            console.error('\n*** RUN ABORTED — remaining assertions never ran ***')
            console.error(thrown)
        }
        console.log(`\n${pass} passed, ${fail} failed\n`)
        await mongoose.disconnect()
        process.exit(fail ? 1 : 0)
    }
}

main().catch(async (e) => {
    console.error('HARNESS ERROR:', e)
    try {
        await mongoose.disconnect()
    } catch {}
    process.exit(1)
})
