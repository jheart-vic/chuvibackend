/**
 * Per-item care tier pricing harness — client brief 6 Oct 2026, item 1.6.
 *
 * The care tier used to be chosen once for the WHOLE order; it is now chosen
 * per item. That moves the pricing path shared by customer booking
 * (pay-per-item and pay-from-wallet), the staff intake path, the bot, offers
 * and subscription draw-down — so this verifies the money end to end against a
 * real DB, not just the arithmetic.
 *
 * Why a DB run and not only unit maths: the three pricing blocks were replaced
 * by one shared helper, and the call sites still referenced a `multiplier`
 * variable that no longer existed. `node --check` passes a ReferenceError
 * inside a method body; only executing the branch catches it.
 *
 * Scenarios:
 *   A  offline: a uniform-tier basket prices EXACTLY as the old formula did
 *   B  offline: mixed tiers price per piece; classic/premium/vip multipliers
 *   C  offline: an unconfigured tier charge never silently uplifts
 *   D  DB: pay-per-item booking, all classic      → amount matches the formula
 *   E  DB: pay-per-item booking, one VIP piece    → costs the VIP uplift more
 *   F  DB: the per-item tier PERSISTS on the stored pieces after explosion
 *   G  DB: pricing receipt carries tierLines / isMixedTier / tiersUsed
 *   H  DB: staff intake path prices a mixed basket identically to booking
 *   I  DB: an invalid per-item tier is rejected
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Cleans up after itself.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node tierPricingStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const WalletModel = require('./models/wallet.model')
const ActivityModel = require('./models/activity.model')
const AuditLogModel = require('./models/audit.log.model')
const NotificationModel = require('./models/notification.model')
const CrmProfileModel = require('./models/crmProfile.model')
const AdminSettingModel = require('./models/adminSetting.model')
const AdminOrderDetailsModel = require('./models/adminOrderDetails.model')
const OrderItemModel = require('./models/orderItem.model')
const BookOrderService = require('./services/bookOrder.service')
const IntakeUserService = require('./services/intake-user.service')
const { priceItems, tierMultiplier } = require('./util/itemPricing')
const { roundToNearestHundred } = require('./util/helper')
const { ROLE, BILLING_TYPE, SERVICE_TIERS } = require('./util/constants')

const bookSvc = new BookOrderService()
const intakeSvc = new IntakeUserService()

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

// The formula EXACTLY as it was before the change, kept here as the oracle.
const legacyTotal = (items, stm, multiplier) =>
    items.reduce(
        (sum, i) =>
            sum +
            roundToNearestHundred(Number(i.price) * stm) *
                Number(i.quantity) *
                multiplier,
        0,
    )

async function main() {
    // ── A-C: offline maths, no DB needed ────────────────────────────────────
    console.log('\n[A] a uniform-tier basket prices exactly as before')
    const setting = { premiumServiceTierCharge: 1.5, vipServiceTierCharge: 2 }
    const basket = [
        { type: 'shirt', price: 1200, quantity: 3 },
        { type: 'trouser', price: 1800, quantity: 2 },
    ]
    for (const [tier, mult] of [
        [SERVICE_TIERS.CLASSIC, 1],
        [SERVICE_TIERS.PREMIUM, 1.5],
        [SERVICE_TIERS.VIP, 2],
    ]) {
        const got = priceItems({
            items: basket,
            serviceTypeMultiplier: 1.5,
            orderTier: tier,
            adminOrderSetting: setting,
        }).total
        const want = legacyTotal(basket, 1.5, mult)
        ok(got === want, `${tier}: ₦${got} matches the old formula (₦${want})`)
    }

    console.log('\n[B] mixed tiers price per piece')
    const mixed = [
        { type: 'shirt', price: 1000, quantity: 2 }, // follows the order tier
        { type: 'suit', price: 1000, quantity: 1, serviceTier: SERVICE_TIERS.VIP },
    ]
    const m = priceItems({
        items: mixed,
        serviceTypeMultiplier: 1,
        orderTier: SERVICE_TIERS.CLASSIC,
        adminOrderSetting: setting,
    })
    ok(m.total === 4000, `2 classic @1000 + 1 VIP @1000x2 = ₦4,000 (got ₦${m.total})`)
    ok(m.itemsBase === 3000, `classic-equivalent base is ₦3,000 (got ₦${m.itemsBase})`)
    ok(m.tierUplift === 1000, `the VIP uplift shows as ₦1,000 (got ₦${m.tierUplift})`)
    ok(m.isMixedTier === true, 'the order is flagged as mixed-tier')
    ok(m.tiersUsed.length === 2, 'both tiers are reported')
    ok(m.lines[0].serviceTier === SERVICE_TIERS.CLASSIC &&
        m.lines[1].serviceTier === SERVICE_TIERS.VIP,
        'each line carries the tier it was priced at')
    ok(m.lines.every((l) => l.linePrice === l.basePrice * l.tierMultiplier),
        'every line is internally consistent')

    console.log('\n[C] an unconfigured tier charge never silently uplifts')
    ok(tierMultiplier(SERVICE_TIERS.PREMIUM, {}) === 1,
        'a missing premium charge falls back to 1, not 1.5')
    ok(tierMultiplier(SERVICE_TIERS.VIP, {}) === 1,
        'a missing VIP charge falls back to 1, not 2')
    ok(tierMultiplier('nonsense', setting) === 1, 'an unknown tier is never uplifted')
    ok(tierMultiplier(undefined, setting) === 1, 'no tier at all is never uplifted')

    // ── D-I need a DB ───────────────────────────────────────────────────────
    if (process.env.STAGING_OK !== '1') {
        console.log('\n[D-I] SKIPPED — set STAGING_OK=1 with a testing MONGODB_URL for the DB run.')
        console.log(`\n${PASS} passed, ${FAIL} failed\n`)
        process.exit(FAIL ? 1 : 0)
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
    console.log('\nTarget DB name:', dbName)
    if (/laundrydb/i.test(dbName)) {
        console.error('*** "laundrydb" is the LIVE database. Refusing. ***')
        process.exit(2)
    }
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })

    const created = { orderIds: [], userIds: [] }
    try {
        const settings = await AdminSettingModel.findOne()
        const orderDetails = await AdminOrderDetailsModel.findOne()
        const anItem = await OrderItemModel.findOne()
        const aService = settings?.serviceTypes?.[0]
        if (!settings || !orderDetails || !anItem || !aService) {
            console.log('\n[D-I] SKIPPED (AdminSetting/AdminOrderDetails/catalog unseeded).')
        } else {
            const stm = aService.pricePerPiece || 1
            const customer = await UserModel.create({
                email: `tier_cust_${Date.now()}@example.com`,
                fullName: 'Tier Staging Customer',
                userType: ROLE.USER,
            })
            const staff = await UserModel.create({
                email: `tier_staff_${Date.now()}@example.com`,
                fullName: 'Tier Staging Staff',
                userType: ROLE.INTAKE_AND_TAG,
            })
            created.userIds.push(customer._id, staff._id)

            const book = async (items, tier = SERVICE_TIERS.CLASSIC) =>
                bookSvc.createOrder({
                    userId: customer._id.toString(),
                    payload: {
                        fullName: 'Tier Staging Customer',
                        items,
                        serviceType: aService.name,
                        serviceTier: tier,
                        deliverySpeed: 'standard',
                        isPickUp: false,
                        isDelivery: false,
                        pickupAddress: { label: 'Home', address: '1 Test Road', landmark: 'By the mast' },
                        deliveryAddress: { label: 'Home', address: '1 Test Road', landmark: 'By the mast' },
                        phoneNumber: '08000000000',
                        billingType: BILLING_TYPE.PAY_PER_ITEM,
                    },
                })

            // ── D: all-classic booking ──────────────────────────────────────
            console.log('\n[D] pay-per-item booking, all classic')
            const plain = [{ type: anItem.name, price: anItem.price, quantity: 2 }]
            let r = await book(plain)
            ok(r?.success === true, `booking succeeded (${r?.success ? 'ok' : JSON.stringify(r?.data)})`)
            if (r?.success) {
                const o = r.data.order
                created.orderIds.push(o._id)
                const expect = legacyTotal(plain, stm, 1)
                ok(o.pricing.itemsSubtotal === expect,
                    `items subtotal ₦${o.pricing.itemsSubtotal} equals the old formula ₦${expect}`)
                ok(o.pricing.isMixedTier === false, 'not flagged mixed-tier')
                ok(o.pricing.tierUplift === 0, 'no tier uplift at classic')
            }

            // ── E: one VIP piece ────────────────────────────────────────────
            console.log('\n[E] the same basket with ONE piece upgraded to VIP')
            const upgraded = [
                { type: anItem.name, price: anItem.price, quantity: 1 },
                { type: anItem.name, price: anItem.price, quantity: 1, serviceTier: SERVICE_TIERS.VIP },
            ]
            r = await book(upgraded)
            ok(r?.success === true, `booking succeeded (${r?.success ? 'ok' : JSON.stringify(r?.data)})`)
            if (r?.success) {
                const o = r.data.order
                created.orderIds.push(o._id)
                const vipMult = tierMultiplier(SERVICE_TIERS.VIP, settings)
                const unit = roundToNearestHundred(anItem.price * stm)
                const expect = unit + unit * vipMult
                ok(o.pricing.itemsSubtotal === expect,
                    `subtotal ₦${o.pricing.itemsSubtotal} = 1 classic + 1 VIP (₦${expect}, VIP x${vipMult})`)
                ok(o.pricing.itemsBase === unit * 2,
                    `classic-equivalent base is ₦${unit * 2} (got ₦${o.pricing.itemsBase})`)
                ok(o.pricing.tierUplift === unit * (vipMult - 1),
                    `the uplift is attributable: ₦${o.pricing.tierUplift}`)

                // ── F: tier persists on the exploded pieces ─────────────────
                console.log('\n[F] the per-item tier survives the per-piece explosion')
                const fresh = await BookOrderModel.findById(o._id).lean()
                const vipPieces = fresh.items.filter((i) => i.serviceTier === SERVICE_TIERS.VIP)
                ok(vipPieces.length === 1, `exactly 1 stored piece is VIP (got ${vipPieces.length})`)
                ok(fresh.items.length === 2, `2 per-piece records stored (got ${fresh.items.length})`)
                ok(fresh.items.some((i) => !i.serviceTier),
                    'the other piece has no tier of its own and follows the order')

                // ── G: the receipt explains itself ──────────────────────────
                console.log('\n[G] the pricing receipt carries the per-item breakdown')
                ok(fresh.pricing.isMixedTier === true, 'flagged as mixed-tier')
                ok(Array.isArray(fresh.pricing.tierLines) && fresh.pricing.tierLines.length === 2,
                    `tierLines has a line per booked line (got ${fresh.pricing.tierLines?.length})`)
                ok(fresh.pricing.tierMultiplier === null,
                    'the single order-level multiplier is null when tiers are mixed')
                ok((fresh.pricing.tiersUsed || []).includes(SERVICE_TIERS.VIP),
                    'tiersUsed names VIP')
            }

            // ── H: the staff intake path agrees ─────────────────────────────
            console.log('\n[H] a staff-created order prices the same basket identically')
            const intakeRes = await intakeSvc.createBookOrder({
                user: { id: staff._id.toString() },
                body: {
                    fullName: 'Tier Staging Customer',
                    phoneNumber: '08000000000',
                    serviceType: aService.name,
                    serviceTier: SERVICE_TIERS.CLASSIC,
                    deliverySpeed: 'standard',
                    isPickUp: false,
                    isDelivery: false,
                    items: upgraded,
                },
            })
            if (!intakeRes?.success) {
                console.log('  … staff path rejected:', JSON.stringify(intakeRes?.data))
                ok(false, 'staff intake booking succeeded')
            } else {
                // createBookOrder returns sendSuccessResponse({ message: newOrder })
                // → the order document itself is at data.message.
                const sid = intakeRes.data?.message?._id
                if (sid) created.orderIds.push(sid)
                const sdoc = sid ? await BookOrderModel.findById(sid).lean() : null
                const vipMult = tierMultiplier(SERVICE_TIERS.VIP, settings)
                const unit = roundToNearestHundred(anItem.price * stm)
                ok(!!sdoc, 'staff order was created')
                if (sdoc) {
                    ok(sdoc.pricing.itemsSubtotal === unit + unit * vipMult,
                        `staff path subtotal ₦${sdoc.pricing.itemsSubtotal} matches the customer path`)
                    ok(sdoc.pricing.isMixedTier === true, 'staff path also reports mixed tiers')
                }
            }

            // ── I: a bad tier is rejected ───────────────────────────────────
            console.log('\n[I] an invalid per-item tier is rejected')
            const bad = await book([
                { type: anItem.name, price: anItem.price, quantity: 1, serviceTier: 'gold' },
            ])
            ok(bad?.success === false, `rejected ("${bad?.data?.error || bad?.data}")`)
            if (bad?.data?.order?._id) created.orderIds.push(bad.data.order._id)
        }
    } catch (e) {
        FAIL++
        console.log('\n  ✗ THREW:', e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)
    } finally {
        console.log('\nCleaning up…')
        await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        await ActivityModel.deleteMany({ orderId: { $in: created.orderIds } })
        await AuditLogModel.deleteMany({ orderId: { $in: created.orderIds } })
        await NotificationModel.deleteMany({ userId: { $in: created.userIds } })
        await CrmProfileModel.deleteMany({ userId: { $in: created.userIds } })
        await WalletModel.deleteMany({ userId: { $in: created.userIds } })
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
