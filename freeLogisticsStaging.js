/**
 * Free pickup & delivery harness — client brief 6 Oct 2026, item 2.2.
 *
 * "The customer is offered free pickup and delivery and is then still charged
 * ₦2,000, which is ₦1,000 for pickup and ₦1,000 for delivery."
 *
 * ROOT CAUSE this harness pins: `bookOrder.service._priceWithOffers` returned
 * EARLY unless the customer had SELECTED an offer:
 *     if (!post.customerOfferId && !post.promoOfferId) return <no offers>
 * A BASELINE offer — what the client calls a "General" offer — is applied BY
 * RULE and has no linkage and no id for the customer to send, so that early
 * return skipped it entirely. `offer.service.validateAndPrice` evaluated
 * baselines correctly all along; booking simply never asked it.
 *
 * Runs the client's own three test cases:
 *   1  order >= the offer threshold  → NO pickup or delivery fee charged
 *   2  order below the threshold     → BOTH fees charged
 *   3  the waiver is attributable    → the offer NAME is on the receipt
 * plus:
 *   4  no active offer at all        → fees charged (no accidental freebies)
 *   5  a DRAFT offer                 → fees charged (draft must not apply)
 *   6  pickup-only / delivery-only   → only the leg actually taken is waived
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node freeLogisticsStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const OfferModel = require('./models/offer.model')
const CustomerOfferModel = require('./models/customerOffer.model')
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
const {
    ROLE,
    BILLING_TYPE,
    OFFER_TYPE,
    OFFER_STATUS,
    OFFER_BENEFIT_TYPE,
    SERVICE_TIERS,
} = require('./util/constants')

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

    const created = { orderIds: [], userIds: [], offerIds: [] }
    try {
        const settings = await AdminSettingModel.findOne()
        const orderDetails = await AdminOrderDetailsModel.findOne()
        const anItem = await OrderItemModel.findOne()
        const aService = settings?.serviceTypes?.[0]
        if (!settings || !orderDetails || !anItem || !aService) {
            console.log('SKIPPED (AdminSetting/AdminOrderDetails/catalog unseeded).')
            return
        }
        // The fees live on AdminSetting (`adminOrderSetting` in
        // bookOrder.service.js:865), NOT on AdminOrderDetails — reading the
        // wrong one here silently compared every total against ₦0.
        const pickupFee = settings.pickupFee || 0
        const deliveryFee = settings.deliveryFee || 0
        console.log(`  pickupFee ₦${pickupFee} · deliveryFee ₦${deliveryFee}`)
        ok(pickupFee > 0 && deliveryFee > 0,
            'the fees under test are actually configured (otherwise this proves nothing)')

        const stamp = Date.now()
        const customer = await UserModel.create({
            email: `freelog_${stamp}@example.com`,
            fullName: 'Free Logistics Customer',
            userType: ROLE.USER,
        })
        created.userIds.push(customer._id)

        const book = async (qty, { isPickUp = true, isDelivery = true } = {}) => {
            const r = await bookSvc.createOrder({
                userId: customer._id.toString(),
                payload: {
                    fullName: 'Free Logistics Customer',
                    items: [{ type: anItem.name, price: anItem.price, quantity: qty }],
                    serviceType: aService.name,
                    serviceTier: SERVICE_TIERS.CLASSIC,
                    deliverySpeed: 'standard',
                    isPickUp,
                    isDelivery,
                    pickupAddress: { label: 'Home', address: '1 Test Road', landmark: 'By the mast' },
                    deliveryAddress: { label: 'Home', address: '1 Test Road', landmark: 'By the mast' },
                    phoneNumber: '08000000000',
                    billingType: BILLING_TYPE.PAY_PER_ITEM,
                },
            })
            if (r?.data?.order?._id) created.orderIds.push(r.data.order._id)
            return r
        }

        // Price one item so we can size the threshold around a real subtotal.
        console.log('\n[0] baseline measurement with NO offer active')
        let r = await book(1)
        ok(r?.success === true, `booking works (${r?.success ? 'ok' : JSON.stringify(r?.data)})`)
        const one = r.data.order
        const unitSubtotal = one.pricing.itemsSubtotal
        ok(one.amount === unitSubtotal + pickupFee + deliveryFee,
            `with no offer, both fees ARE charged: ₦${one.amount} = ₦${unitSubtotal} + ₦${pickupFee} + ₦${deliveryFee}`)
        ok(one.pricing.freePickupWaived === 0 && one.pricing.freeDeliveryWaived === 0,
            'and nothing is recorded as waived')

        // Threshold sits between a 1-item and a 3-item order.
        const threshold = unitSubtotal * 2

        // ── the client's "Always Free at ₦8,000" General offer ──────────────
        const offer = await OfferModel.create({
            name: `Always Free at ${threshold} ${stamp}`,
            headline: 'Free pickup & delivery on larger orders',
            description: 'Staging harness',
            // The client's "General" offer == BASELINE: a standing policy
            // applied by rule, with nothing for the customer to select.
            type: OFFER_TYPE.BASELINE,
            status: OFFER_STATUS.ACTIVE,
            benefits: [
                { benefitType: OFFER_BENEFIT_TYPE.FREE_PICKUP },
                { benefitType: OFFER_BENEFIT_TYPE.FREE_DELIVERY },
            ],
            rules: { minOrderValue: threshold },
        })
        created.offerIds.push(offer._id)

        // ── 1: at or above the threshold ────────────────────────────────────
        console.log(`\n[1] order at/above the ₦${threshold} threshold → both legs free`)
        r = await book(3)
        ok(r?.success === true, `booking works (${r?.success ? 'ok' : JSON.stringify(r?.data)})`)
        const big = r.data.order
        ok(big.pricing.itemsSubtotal >= threshold,
            `the order qualifies (₦${big.pricing.itemsSubtotal} >= ₦${threshold})`)
        ok(big.amount === big.pricing.itemsSubtotal,
            `NO logistics fee charged: ₦${big.amount} == items ₦${big.pricing.itemsSubtotal} (was items + ₦${pickupFee + deliveryFee})`)
        ok(big.pricing.freePickupWaived === pickupFee,
            `pickup recorded as waived (₦${big.pricing.freePickupWaived})`)
        ok(big.pricing.freeDeliveryWaived === deliveryFee,
            `delivery recorded as waived (₦${big.pricing.freeDeliveryWaived})`)
        ok(big.pricing.youSaved >= pickupFee + deliveryFee,
            `"you saved" reflects it (₦${big.pricing.youSaved})`)

        // ── 3: attributable to a named offer ────────────────────────────────
        console.log('\n[3] the waiver names the offer that caused it')
        const applied = big.pricing.appliedOffers || []
        ok(applied.length > 0, `the receipt lists the offer(s) applied (${applied.length})`)
        ok(applied.some((a) => String(a.offerId) === String(offer._id)),
            'the standing offer is named on the receipt')
        ok(applied.some((a) => a.type === 'baseline'),
            'and is marked as a baseline/General offer')
        ok(applied.some((a) => a.name === offer.name),
            `the summary can print its name ("${applied[0]?.name}")`)

        // ── 2: below the threshold ──────────────────────────────────────────
        console.log(`\n[2] order BELOW the ₦${threshold} threshold → both fees charged`)
        r = await book(1)
        const small = r.data.order
        ok(small.amount === small.pricing.itemsSubtotal + pickupFee + deliveryFee,
            `both fees charged: ₦${small.amount} (items ₦${small.pricing.itemsSubtotal} + ₦${pickupFee + deliveryFee})`)
        ok(small.pricing.freePickupWaived === 0 && small.pricing.freeDeliveryWaived === 0,
            'nothing waived — the threshold is respected')

        // ── 5: a DRAFT offer must not apply ─────────────────────────────────
        console.log('\n[5] a DRAFT offer must not waive anything')
        await OfferModel.updateOne({ _id: offer._id }, { $set: { status: OFFER_STATUS.DRAFT } })
        r = await book(3)
        const draftCase = r.data.order
        ok(draftCase.amount === draftCase.pricing.itemsSubtotal + pickupFee + deliveryFee,
            `a draft offer waives nothing: ₦${draftCase.amount}`)
        await OfferModel.updateOne({ _id: offer._id }, { $set: { status: OFFER_STATUS.ACTIVE } })

        // ── 6: only the leg actually taken is waived ────────────────────────
        console.log('\n[6] only the leg the customer actually takes is waived')
        r = await book(3, { isPickUp: false, isDelivery: true })
        const delOnly = r.data.order
        ok(delOnly.pricing.freePickupWaived === 0,
            'no pickup leg → nothing waived for pickup')
        ok(delOnly.pricing.freeDeliveryWaived === deliveryFee,
            `delivery still waived (₦${delOnly.pricing.freeDeliveryWaived})`)
        ok(delOnly.amount === delOnly.pricing.itemsSubtotal,
            `and the customer pays items only: ₦${delOnly.amount}`)

        r = await book(3, { isPickUp: true, isDelivery: false })
        const pickOnly = r.data.order
        ok(pickOnly.pricing.freeDeliveryWaived === 0,
            'no delivery leg → nothing waived for delivery')
        ok(pickOnly.pricing.freePickupWaived === pickupFee,
            `pickup still waived (₦${pickOnly.pricing.freePickupWaived})`)

        // ── 4: no offers at all ─────────────────────────────────────────────
        console.log('\n[4] with the offer archived, fees come back')
        await OfferModel.updateOne({ _id: offer._id }, { $set: { status: OFFER_STATUS.ARCHIVED } })
        r = await book(3)
        const none = r.data.order
        ok(none.amount === none.pricing.itemsSubtotal + pickupFee + deliveryFee,
            `fees charged again: ₦${none.amount} — no accidental permanent freebie`)
    } catch (e) {
        FAIL++
        console.log('\n  ✗ THREW:', e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)
    } finally {
        console.log('\nCleaning up…')
        await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        await OfferModel.deleteMany({ _id: { $in: created.offerIds } })
        await CustomerOfferModel.deleteMany({ userId: { $in: created.userIds } })
        await ActivityModel.deleteMany({ orderId: { $in: created.orderIds } })
        await AuditLogModel.deleteMany({ orderId: { $in: created.orderIds } })
        await NotificationModel.deleteMany({ userId: { $in: created.userIds } })
        await CrmProfileModel.deleteMany({ userId: { $in: created.userIds } })
        await WalletModel.deleteMany({ userId: { $in: created.userIds } })
        await UserModel.deleteMany({ _id: { $in: created.userIds } })
        const left = await BookOrderModel.countDocuments({ _id: { $in: created.orderIds } })
        const leftOffers = await OfferModel.countDocuments({ _id: { $in: created.offerIds } })
        console.log(`  leftover orders: ${left}, leftover offers: ${leftOffers}`)
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed\n`)
        process.exit(FAIL ? 1 : 0)
    }
}

main()
