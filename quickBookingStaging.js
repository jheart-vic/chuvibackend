/**
 * Launch fix 2 (client message 11 Oct 2026, item 3): a Quick Booking pays
 * NOTHING at booking; the trips go on the SMS bill and the free pickup and
 * delivery offer is checked after Intake counts — against a real database.
 *
 * Scenarios:
 *   1  a Quick Booking is created with nothing due: amount 0, payment pending,
 *      paymentRequired false, no credit spent, no offer attached
 *   2  Intake enters items BELOW the offer's minimum: trips charged, offer not
 *      attached, payment hold raised for the full bill
 *   3  Intake corrects to items ABOVE the minimum: the First Experience offer is
 *      auto-applied (beating a bigger discount, first order) and attached, and
 *      both trips are waived on the bill
 *   4  a normal order booked with an offer keeps it when its items are edited
 *   5  an unbilled Quick Booking's Anytime pickup served inside a window lowers
 *      the leg fee instead of crediting the wallet
 *
 * SMS and Paystack are STUBBED (this would otherwise text a phone number and
 * open a real Paystack transaction).
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Deletes what it creates.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node quickBookingStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()

// Stubs FIRST, before any service captures the real modules.
const smsPath = require.resolve('./util/sendSms')
const smsSent = []
require.cache[smsPath] = {
    id: smsPath,
    filename: smsPath,
    loaded: true,
    exports: async (to, body) => {
        smsSent.push({ to, body })
        return { stubbed: true }
    },
}
const PaystackService = require('./services/paystack.service')
// Kept so scenario 9 can prove the payment gate refuses BEFORE Paystack is
// called (the refusal returns before any network request).
const realInitializePayment = PaystackService.prototype.initializePayment
PaystackService.prototype.initializePayment = async () => ({
    success: true,
    data: { message: { authorization_url: 'https://stub.paystack/pay' } },
})

const mongoose = require('mongoose')
const UserModel = require('./models/user.model')
const OfferModel = require('./models/offer.model')
const CustomerOfferModel = require('./models/customerOffer.model')
const BookOrderModel = require('./models/bookOrder.model')
const AdminSettingModel = require('./models/adminSetting.model')
const OrderItemModel = require('./models/orderItem.model')
const BookingWindowModel = require('./models/bookingWindow.model')
const WalletCreditModel = require('./models/walletCredit.model')
const PaymentModel = require('./models/payment.model')
const BookOrderService = require('./services/bookOrder.service')
const BookingWindowService = require('./services/bookingWindow.service')
const WalletCreditService = require('./services/walletCredit.service')
const W = require('./util/bookingWindow')
const { roundToNearestHundred } = require('./util/helper')
const {
    ROLE,
    GENERAL_STATUS,
    OFFER_TYPE,
    OFFER_STATUS,
    OFFER_TRIGGER,
    OFFER_BENEFIT_TYPE,
    CUSTOMER_OFFER_STATUS,
    SERVICE_TIERS,
    BILLING_TYPE,
    PAYMENT_ORDER_STATUS,
    CREDIT_TYPE,
    CREDIT_SOURCE,
} = require('./util/constants')

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
const DAY = 24 * 60 * 60 * 1000

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

    const created = { users: [], offers: [], orders: [], windows: [] }
    const book = new BookOrderService()
    let thrown = null
    try {
        const settings = await AdminSettingModel.findOne()
        // Pay-per-item prices from the item's own price; the catalog is only
        // read for subscription heavy items, so a plain item is enough.
        const anItem = (await OrderItemModel.findOne().lean()) || { name: 'Shirt', price: 1000 }
        const aService = settings?.serviceTypes?.[0]
        if (!settings || !aService) {
            console.log('SKIPPED (AdminSetting unseeded; boot the app once against this DB).')
            return
        }
        const pickupFee = settings.pickupFee || 0
        const deliveryFee = settings.deliveryFee || 0
        console.log(`  pickupFee ₦${pickupFee} · deliveryFee ₦${deliveryFee} · item "${anItem.name}" ₦${anItem.price}`)
        ok(pickupFee > 0 && deliveryFee > 0, 'trip fees are configured (otherwise this proves nothing)')

        const mkUser = async (tag) => {
            const u = await UserModel.create({
                email: `stgqb${tag}${STAMP}@example.com`,
                fullName: `STG QB ${tag}`,
                phoneNumber: `0803444${String(STAMP).slice(-3)}${tag.length}`,
                userType: ROLE.USER,
                status: GENERAL_STATUS.ACTIVE,
                isVerified: true,
            })
            created.users.push(u._id)
            return u
        }
        const mkOffer = async (name, benefits, extra = {}) => {
            const o = await OfferModel.create({
                name: `STG QB ${name} ${STAMP}`,
                headline: name,
                type: OFFER_TYPE.PERSONAL,
                status: OFFER_STATUS.ACTIVE,
                benefits,
                ...extra,
            })
            created.offers.push(o._id)
            return o
        }
        const link = (userId, offerId) =>
            CustomerOfferModel.create({
                userId,
                offerId,
                status: CUSTOMER_OFFER_STATUS.ASSIGNED,
                expiresAt: new Date(Date.now() + 7 * DAY),
            })
        const address = { label: 'Home', address: '1 Test Road', landmark: 'By the mast' }
        const payload = (extra) => ({
            fullName: 'STG QB Customer',
            phoneNumber: '08034440001',
            serviceType: aService.name,
            serviceTier: SERVICE_TIERS.CLASSIC,
            deliverySpeed: 'standard',
            isPickUp: true,
            isDelivery: true,
            pickupAddress: address,
            deliveryAddress: address,
            billingType: BILLING_TYPE.PAY_PER_ITEM,
            ...extra,
        })
        const intake = (orderId, items, reason) =>
            book.applyItemEdit({
                params: { id: String(orderId) },
                body: { items, reason },
                user: { id: String(created.users[0]), userType: ROLE.INTAKE_AND_TAG },
            })

        // ── 1 booking pays nothing ───────────────────────────────────────────
        console.log('\n1 — a Quick Booking pays nothing at booking')
        const customer = await mkUser('a')
        // The free-trip Welcome Offer only applies from a minimum worth 3 pieces.
        const unit = roundToNearestHundred(anItem.price * (aService.pricePerPiece || 1))
        const minimum = unit * 3
        const welcome = await mkOffer(
            'Welcome',
            [
                { benefitType: OFFER_BENEFIT_TYPE.FREE_PICKUP },
                { benefitType: OFFER_BENEFIT_TYPE.FREE_DELIVERY },
            ],
            { triggers: [OFFER_TRIGGER.FIRST_EXPERIENCE], rules: { minOrderValue: minimum } },
        )
        // A bigger discount that would win on bill value alone.
        const bigger = await mkOffer('Big discount', [
            { benefitType: OFFER_BENEFIT_TYPE.ORDER_DISCOUNT, amount: pickupFee + deliveryFee + 1000 },
        ])
        const welcomeLink = await link(customer._id, welcome._id)
        const biggerLink = await link(customer._id, bigger._id)
        await WalletCreditService.grantCredit({
            userId: customer._id,
            type: CREDIT_TYPE.PROMOTIONAL,
            amount: 700,
            sourceSystem: CREDIT_SOURCE.REFERRAL,
            sourceRef: `stg-qb-${STAMP}`,
            note: 'STG quick booking credit',
        })
        const creditBefore = (await WalletCreditService.getCreditBalances(customer._id)).total

        const booked = await book.createOrder({
            userId: customer._id.toString(),
            payload: payload({ itemCount: 4, useCredit: true, customerOfferId: welcomeLink._id.toString() }),
        })
        ok(booked.success === true, `the booking succeeds (${booked.success ? 'ok' : JSON.stringify(booked.data)})`)
        const qb = booked.data?.order
        if (qb?._id) created.orders.push(qb._id)
        ok(booked.data?.paymentRequired === false, 'the response says no payment step (paymentRequired: false)')
        ok(qb?.amount === 0, `nothing is due (amount ₦${qb?.amount})`)
        ok(qb?.paymentStatus !== PAYMENT_ORDER_STATUS.SUCCESS, 'and it is not marked paid')
        ok(qb?.deliveryAmount === pickupFee + deliveryFee, `deliveryAmount keeps the trip fees for Intake (₦${qb?.deliveryAmount})`)
        const creditAfterBooking = (await WalletCreditService.getCreditBalances(customer._id)).total
        ok(creditAfterBooking === creditBefore, `no reward credit was spent (₦${creditBefore} → ₦${creditAfterBooking})`)
        const afterBookLinks = await CustomerOfferModel.find({ _id: { $in: [welcomeLink._id, biggerLink._id] } }).lean()
        ok(afterBookLinks.every((l) => l.status === CUSTOMER_OFFER_STATUS.ASSIGNED),
            'no offer was attached to the ₦0 booking')

        // ── 2 Intake enters items below the minimum ──────────────────────────
        console.log('\n2 — items below the offer minimum: trips charged, offer kept for later')
        const small = [{ type: anItem.name, price: anItem.price, quantity: 1 }]
        let res = await intake(qb._id, small, 'Counted 1 piece')
        ok(res.success === true, `the edit succeeds (${res.success ? 'ok' : JSON.stringify(res.data)})`)
        let fresh = await BookOrderModel.findById(qb._id).lean()
        ok(fresh.pricing?.pickupFee === pickupFee && fresh.pricing?.deliveryFee === deliveryFee,
            'the bill now carries pickup and delivery')
        const welcomeNow = await CustomerOfferModel.findById(welcomeLink._id).lean()
        ok(welcomeNow.status === CUSTOMER_OFFER_STATUS.ASSIGNED, 'the Welcome Offer is not spent below its minimum')
        ok(!!res.data?.message?.paymentHold && !res.data.message.paymentHold.error,
            'a payment hold is raised for the bill')
        ok(smsSent.some((s) => /comes to|bill/i.test(s.body)), 'and the customer is sent the bill by SMS (stubbed)')
        // Below its minimum the Welcome Offer cannot apply, so the auto-apply
        // takes the other offer (the existing bill-value rule).
        const bigNow = await CustomerOfferModel.findById(biggerLink._id).lean()
        ok(bigNow.status === CUSTOMER_OFFER_STATUS.ATTACHED && String(bigNow.orderId) === String(qb._id),
            'the only applicable offer (the discount) is applied and attached')

        // ── 3 corrected to above the minimum ─────────────────────────────────
        console.log('\n3 — Intake corrects the count: the Welcome Offer replaces the earlier pick')
        const enough = [{ type: anItem.name, price: anItem.price, quantity: 4 }]
        res = await intake(qb._id, enough, 'Recounted: 4 pieces')
        ok(res.success === true, `the edit succeeds (${res.success ? 'ok' : JSON.stringify(res.data)})`)
        fresh = await BookOrderModel.findById(qb._id).lean()
        const w3 = await CustomerOfferModel.findById(welcomeLink._id).lean()
        const b3 = await CustomerOfferModel.findById(biggerLink._id).lean()
        ok(w3.status === CUSTOMER_OFFER_STATUS.ATTACHED && String(w3.orderId) === String(qb._id),
            'the Welcome Offer is attached to this order')
        ok(b3.status === CUSTOMER_OFFER_STATUS.ASSIGNED && !b3.orderId,
            'the bigger discount is released back to the customer (First Experience always wins)')
        ok(fresh.pricing?.freePickupWaived === pickupFee && fresh.pricing?.freeDeliveryWaived === deliveryFee,
            `both trips are waived on the bill (${fresh.pricing?.freePickupWaived} + ${fresh.pricing?.freeDeliveryWaived})`)
        ok(fresh.amount === fresh.pricing?.orderTotal && fresh.amount === fresh.pricing?.itemsSubtotal,
            `the bill is the laundry only (₦${fresh.amount})`)

        // ── 4 a normal order keeps its offer on edit ─────────────────────────
        console.log('\n4 — a normal order keeps its offer when items are edited')
        const second = await mkUser('bb')
        const freePick = await mkOffer('Free pickup', [{ benefitType: OFFER_BENEFIT_TYPE.FREE_PICKUP }])
        const freePickLink = await link(second._id, freePick._id)
        const normal = await book.createOrder({
            userId: second._id.toString(),
            payload: payload({
                fullName: 'STG QB Second',
                phoneNumber: '08034440002',
                items: [{ type: anItem.name, price: anItem.price, quantity: 2 }],
                customerOfferId: freePickLink._id.toString(),
            }),
        })
        ok(normal.success === true, `normal booking succeeds (${normal.success ? 'ok' : JSON.stringify(normal.data)})`)
        const n = normal.data?.order
        if (n?._id) created.orders.push(n._id)
        ok(n?.pricing?.freePickupWaived === pickupFee, 'the offer waives pickup at booking')
        res = await intake(n._id, [{ type: anItem.name, price: anItem.price, quantity: 3 }], 'One more piece')
        ok(res.success === true, `the edit succeeds (${res.success ? 'ok' : JSON.stringify(res.data)})`)
        const nFresh = await BookOrderModel.findById(n._id).lean()
        const fp = await CustomerOfferModel.findById(freePickLink._id).lean()
        ok(nFresh.pricing?.freePickupWaived === pickupFee, 'after the edit the pickup is still free')
        ok(fp.status === CUSTOMER_OFFER_STATUS.ATTACHED && String(fp.orderId) === String(n._id),
            'and the offer is still attached to the same order')
        // F-20: paused (and past its expiry) after booking, still honoured.
        await OfferModel.updateOne({ _id: freePick._id }, { $set: { status: OFFER_STATUS.PAUSED } })
        await CustomerOfferModel.updateOne({ _id: freePickLink._id }, { $set: { expiresAt: new Date(Date.now() - DAY) } })
        res = await intake(n._id, [{ type: anItem.name, price: anItem.price, quantity: 2 }], 'Back to two pieces')
        const n20 = await BookOrderModel.findById(n._id).lean()
        ok(res.success === true && n20.pricing?.freePickupWaived === pickupFee,
            'an offer paused and expired after booking is still honoured on the next edit (F-20)')
        await OfferModel.updateOne({ _id: freePick._id }, { $set: { status: OFFER_STATUS.ACTIVE } })
        await CustomerOfferModel.updateOne({ _id: freePickLink._id }, { $set: { expiresAt: new Date(Date.now() + 7 * DAY) } })

        // ── 5 Anytime refund on an unbilled Quick Booking ────────────────────
        console.log('\n5 — Anytime pickup served in a window, before the bill exists')
        const sched = await BookingWindowService.getSchedulingSettings()
        const refund = W.anytimeRefundAmount({ leg: 'pickup', settings: sched })
        if (refund <= 0) {
            console.log('  (skipped: Anytime and window pickup cost the same on this DB)')
        } else {
            const win = await BookingWindowModel.create({
                name: `STG QB all day ${STAMP}`,
                startTime: '00:00',
                endTime: '23:59',
                isActive: false,
            })
            created.windows.push(win._id)
            const anytimeFee = W.legFee({ timing: 'anytime', leg: 'pickup', settings: sched })
            const unbilled = await BookOrderModel.create({
                oscNumber: `OSC-STGQB${STAMP}`,
                userId: customer._id,
                fullName: 'STG QB Customer',
                phoneNumber: '08034440001',
                serviceType: aService.name,
                serviceTier: SERVICE_TIERS.CLASSIC,
                deliverySpeed: 'standard',
                billingType: BILLING_TYPE.PAY_PER_ITEM,
                isPickUp: true,
                isDelivery: true,
                amount: 0,
                quickBooking: true,
                itemsPending: true,
                items: [{ type: 'unspecified-item', price: 0, quantity: 1 }],
                scheduling: {
                    pickup: {
                        timing: 'anytime',
                        fee: anytimeFee,
                        windowWasBookableAtBooking: true,
                        refundAgainstWindowId: win._id,
                    },
                },
            })
            created.orders.push(unbilled._id)
            const r5 = await BookingWindowService.settleAnytimeRefund({
                orderId: unbilled._id,
                leg: 'pickup',
                servedAt: new Date(),
            })
            const u5 = await BookOrderModel.findById(unbilled._id).lean()
            ok(r5.ok === true && r5.appliedToBill === true, 'the refund is applied to the bill, not the wallet')
            ok(u5.scheduling.pickup.fee === anytimeFee - refund,
                `the pickup fee drops to the window price (₦${anytimeFee} → ₦${u5.scheduling.pickup.fee})`)
            const walletRefunds = await PaymentModel.countDocuments({ order: unbilled._id })
            ok(walletRefunds === 0, 'no wallet refund was written')
            const again = await BookingWindowService.settleAnytimeRefund({
                orderId: unbilled._id,
                leg: 'pickup',
                servedAt: new Date(),
            })
            const u5b = await BookOrderModel.findById(unbilled._id).lean()
            ok(again.ok === false && u5b.scheduling.pickup.fee === anytimeFee - refund,
                'a second settle does not lower the fee again (F-22)')
        }

        // ── 6 the booking body cannot set server fields (F-18, F-19) ─────────
        console.log('\n6 — the booking body cannot set amount, payment status, owner or quickBooking')
        const third = await mkUser('ccc')
        const sneaky = await book.createOrder({
            userId: third._id.toString(),
            payload: payload({
                fullName: 'STG QB Third',
                phoneNumber: '08034440003',
                items: [{ type: anItem.name, price: anItem.price, quantity: 1 }],
                amount: 100,
                paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
                userId: customer._id.toString(),
                quickBooking: true,
                itemsPending: true,
            }),
        })
        ok(sneaky.success === true, `the booking itself still works (${sneaky.success ? 'ok' : JSON.stringify(sneaky.data)})`)
        const s6 = sneaky.data?.order
        if (s6?._id) created.orders.push(s6._id)
        ok(s6?.amount === unit + pickupFee + deliveryFee,
            `amount is the server's (₦${s6?.amount}), not the ₦100 sent`)
        ok(s6?.paymentStatus !== PAYMENT_ORDER_STATUS.SUCCESS, 'it is not marked paid')
        ok(String(s6?.userId) === String(third._id), 'it belongs to the caller, not the userId sent')
        ok(!s6?.quickBooking && !s6?.itemsPending && sneaky.data?.paymentRequired === undefined,
            'a client-sent quickBooking flag does not zero a normal booking (F-19)')

        // ── 7 a smuggled orderId cannot reuse an attached offer (F-17) ───────
        console.log('\n7 — an offer attached to one order cannot be spent again on another')
        const replay = await book.createOrder({
            userId: second._id.toString(),
            payload: payload({
                fullName: 'STG QB Second',
                phoneNumber: '08034440002',
                items: [{ type: anItem.name, price: anItem.price, quantity: 1 }],
                customerOfferId: freePickLink._id.toString(),
                orderId: String(n._id),
            }),
        })
        const r7 = replay.data?.order
        if (r7?._id) created.orders.push(r7._id)
        ok(replay.success === true && r7?.pricing?.freePickupWaived === 0,
            `the second order pays the pickup (waived ₦${r7?.pricing?.freePickupWaived})`)
        ok((replay.data?.offer?.rejected || []).some((x) => /already applied/i.test(x.reason)),
            'and the offer is reported as already applied')

        // ── 8 a released promotion is removed, not made personal (F-21) ──────
        console.log('\n8 — a released promotion does not become a personal reward')
        const promo = await OfferModel.create({
            name: `STG QB Promo ${STAMP}`,
            headline: 'Promo',
            type: OFFER_TYPE.PROMOTIONAL,
            status: OFFER_STATUS.ACTIVE,
            stackableWithPersonal: true,
            benefits: [{ benefitType: OFFER_BENEFIT_TYPE.ORDER_DISCOUNT, amount: 100 }],
        })
        created.offers.push(promo._id)
        const withPromo = await book.createOrder({
            userId: third._id.toString(),
            payload: payload({
                fullName: 'STG QB Third',
                phoneNumber: '08034440003',
                items: [{ type: anItem.name, price: anItem.price, quantity: 1 }],
                promoOfferId: String(promo._id),
            }),
        })
        const p8 = withPromo.data?.order
        if (p8?._id) created.orders.push(p8._id)
        const attachedPromo = await CustomerOfferModel.findOne({ orderId: p8?._id, offerId: promo._id }).lean()
        ok(!!attachedPromo, 'the promotion is attached at booking')
        const OfferService = require('./services/offer.service')
        await OfferService.releaseForOrder(p8._id, { reason: 'STG release' })
        const leftover = await CustomerOfferModel.countDocuments({ userId: third._id, offerId: promo._id })
        const promoAfter = await OfferModel.findById(promo._id).lean()
        ok(leftover === 0, 'its linkage is removed, not reset to an assigned personal reward')
        ok((promoAfter.usedCount || 0) === 0, 'and its usage slot is given back')

        // ── 9 an unbilled Quick Booking cannot be paid (F-24) ───────────────
        console.log('\n9 — an uncounted Quick Booking cannot be paid at ₦0')
        const fourth = await mkUser('dddd')
        const qb9 = await book.createOrder({
            userId: fourth._id.toString(),
            payload: payload({ fullName: 'STG QB Fourth', phoneNumber: '08034440004', itemCount: 3 }),
        })
        const o9 = qb9.data?.order
        if (o9?._id) created.orders.push(o9._id)
        const WalletService = require('./services/wallet.service')
        const walletPay = await new WalletService().payWithWallet({
            body: { bookOrderId: String(o9._id), description: 'STG' },
            user: { id: String(fourth._id) },
        })
        const cardPay = await realInitializePayment.call(new PaystackService(), {
            body: { transactionType: 'order', orderId: String(o9._id) },
            user: { id: String(fourth._id) },
        })
        const after9 = await BookOrderModel.findById(o9._id).lean()
        ok(walletPay.success === false && /nothing to pay yet/i.test(walletPay.data?.error || ''),
            `a ₦0 wallet payment is refused (${walletPay.data?.error})`)
        ok(cardPay.success === false && /nothing to pay yet/i.test(cardPay.data?.error || ''),
            `a card payment link is refused before Paystack is called (${cardPay.data?.error})`)
        ok(after9.paymentStatus !== PAYMENT_ORDER_STATUS.SUCCESS, 'and the order is still unpaid')

        // ── 10 the QB re-pick keeps an attached offer after its expiry (F-20) ─
        console.log('\n10 — a Quick Booking keeps its Welcome Offer after the linkage expires')
        await CustomerOfferModel.updateOne({ _id: welcomeLink._id }, { $set: { expiresAt: new Date(Date.now() - DAY) } })
        res = await intake(qb._id, [{ type: anItem.name, price: anItem.price, quantity: 5 }], 'One more piece found')
        const w10 = await CustomerOfferModel.findById(welcomeLink._id).lean()
        const qb10 = await BookOrderModel.findById(qb._id).lean()
        ok(res.success === true && w10.status === CUSTOMER_OFFER_STATUS.ATTACHED && String(w10.orderId) === String(qb._id),
            'the Welcome Offer stays attached on the next edit')
        ok(qb10.pricing?.freePickupWaived === pickupFee && qb10.pricing?.freeDeliveryWaived === deliveryFee,
            'and still waives both trips')

        // ── 11 a paid order whose bill rises owes only the difference (F-30) ─
        console.log('\n11 — a paid order edited upward owes only the difference')
        const fifth = await mkUser('eeeee')
        const WalletModel11 = require('./models/wallet.model')
        await WalletModel11.updateOne({ userId: fifth._id }, { $set: { balance: 10000000 } }, { upsert: true })
        const paidBooking = await book.createOrder({
            userId: fifth._id.toString(),
            payload: payload({
                fullName: 'STG QB Fifth',
                phoneNumber: '08034440005',
                items: [{ type: anItem.name, price: anItem.price, quantity: 1 }],
            }),
        })
        const o11 = paidBooking.data?.order
        if (o11?._id) created.orders.push(o11._id)
        const WalletService11 = require('./services/wallet.service')
        const firstPay = await new WalletService11().payWithWallet({ body: { bookOrderId: String(o11._id) }, user: { id: String(fifth._id) } })
        const paidOrder = await BookOrderModel.findById(o11._id).lean()
        ok(firstPay.success === true && paidOrder.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS,
            `the order is paid in full first (₦${paidOrder.amount})`)
        res = await intake(o11._id, [{ type: anItem.name, price: anItem.price, quantity: 3 }], 'Two more pieces in the bag')
        const up11 = await BookOrderModel.findById(o11._id).lean()
        const expectedBalance = up11.amount - paidOrder.amount
        ok(res.success === true && up11.paymentStatus !== PAYMENT_ORDER_STATUS.SUCCESS && up11.balanceDue === expectedBalance,
            `it goes back to unpaid with only the difference due (₦${up11.balanceDue} of ₦${up11.amount})`)
        ok(up11.paymentHold?.raisedAt && up11.paymentHold.amount === expectedBalance,
            `the payment hold asks for the difference only (₦${up11.paymentHold?.amount})`)
        // F-33: a second edit while that hold is open refreshes it.
        res = await intake(o11._id, [{ type: anItem.name, price: anItem.price, quantity: 4 }], 'One more piece')
        const up11b = await BookOrderModel.findById(o11._id).lean()
        const expectedBalance2 = up11b.amount - paidOrder.amount
        ok(res.success === true && up11b.balanceDue === expectedBalance2 && up11b.paymentHold?.amount === expectedBalance2,
            `a second edit refreshes the hold to the new balance (₦${up11b.paymentHold?.amount}), not the old ₦${expectedBalance}`)
        // F-37: the replaced hold keeps its clock and tells the customer nothing about "payment received".
        const NotificationModel11 = require('./models/notification.model')
        const falseReceipts = await NotificationModel11.countDocuments({ userId: fifth._id, title: 'Payment received' })
        ok(String(up11b.paymentHold?.raisedAt) === String(up11.paymentHold?.raisedAt) && falseReceipts === 0,
            'the replaced hold keeps its reminder clock and sends no "payment received"')
        const balancePay = await new WalletService11().payWithWallet({ body: { bookOrderId: String(o11._id) }, user: { id: String(fifth._id) } })
        const settled11 = await BookOrderModel.findById(o11._id).lean()
        const walletAfter = await WalletModel11.findOne({ userId: fifth._id }).lean()
        ok(balancePay.success === true && settled11.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS && !settled11.balanceDue,
            'paying the balance from the wallet settles the order')
        ok(walletAfter.balance === 10000000 - up11b.amount,
            `the wallet paid the bill exactly once in total (₦${10000000 - walletAfter.balance} = ₦${up11b.amount})`)
        ok(settled11.paymentHold?.clearedAt, 'and the payment hold is cleared')
        await WalletModel11.deleteOne({ userId: fifth._id })

        // ── 12 staff cannot approve a transfer on an uncounted QB (F-31) ─────
        console.log('\n12 — staff cannot approve a transfer on an uncounted Quick Booking')
        const PaymentHoldService12 = require('./services/paymentHold.service')
        const approve = await PaymentHoldService12.approveTransfer({
            orderId: o9._id,
            reference: 'STG-REF',
            note: 'staging',
            actor: { id: String(fifth._id), userType: ROLE.INTAKE_AND_TAG },
        })
        const after12 = await BookOrderModel.findById(o9._id).lean()
        ok(approve.success === false && after12.paymentStatus !== PAYMENT_ORDER_STATUS.SUCCESS,
            `refused, the order stays unpaid (${approve.data?.error})`)

        // ── 13 the card webhook settles against the money received (F-33) ───
        console.log('\n13 — the card webhook settles against what was actually paid')
        const sixth = await mkUser('ffffff')
        const { handleChargeSuccess } = require('./util/webhook.handler')
        const cardBooking = await book.createOrder({
            userId: sixth._id.toString(),
            payload: payload({ fullName: 'STG QB Sixth', phoneNumber: '08034440006', items: [{ type: anItem.name, price: anItem.price, quantity: 1 }] }),
        })
        const o13 = cardBooking.data?.order
        if (o13?._id) created.orders.push(o13._id)
        // A real checkout writes a pending Payment row before Paystack is
        // called; the webhook only acts on references it started (F-35).
        const startCheckout = (ref, userId, type, order) =>
            PaymentModel.create({
                userId,
                amount: 0,
                reference: `STGQB-${STAMP}-${ref}`,
                status: 'pending',
                type,
                ...(order && { order }),
            })
        const charge = (ref, naira, { email = sixth.email, metadata } = {}) =>
            handleChargeSuccess({
                reference: `STGQB-${STAMP}-${ref}`,
                amount: naira * 100,
                paid_at: new Date().toISOString(),
                channel: 'card',
                customer: { email },
                metadata: metadata || { transactionType: 'order', orderId: String(o13._id), amount: naira },
            })
        await startCheckout('a', sixth._id, 'order', o13._id)
        await charge('a', o13.amount - 1000)
        const short = await BookOrderModel.findById(o13._id).lean()
        ok(short.paymentStatus !== PAYMENT_ORDER_STATUS.SUCCESS && short.balanceDue === 1000 && short.paymentHold?.amount === 1000,
            `paying ₦1,000 short leaves it unpaid with ₦${short.balanceDue} due and a hold for it`)
        await startCheckout('b', sixth._id, 'order', o13._id)
        await charge('b', 1000)
        await charge('b', 1000) // the same event delivered twice
        const full = await BookOrderModel.findById(o13._id).lean()
        ok(full.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS && !full.balanceDue && full.paymentHold?.clearedAt,
            'paying the remainder settles it and clears the hold (a repeated event changes nothing)')
        await startCheckout('c', sixth._id, 'order', o13._id)
        await charge('c', 500)
        const WalletModel13 = require('./models/wallet.model')
        const w13 = await WalletModel13.findOne({ userId: sixth._id }).lean()
        ok((w13?.balance || 0) === 0, `a payment on an already-paid order is flagged for an admin, not auto-refunded (wallet ₦${w13?.balance || 0}) (F-36)`)

        // ── 14 forged and mismatched top-ups are never credited (F-35) ──────
        console.log('\n14 — a wallet top-up credits what was collected, to the payer only')
        const seventh = await mkUser('ggggggg')
        await charge('forged', 100, {
            email: seventh.email,
            metadata: { transactionType: 'wallet-top-up', userId: String(sixth._id), amount: 1000000 },
        })
        await startCheckout('other', seventh._id, 'wallet-top-up')
        await charge('other', 100, {
            email: seventh.email,
            metadata: { transactionType: 'wallet-top-up', userId: String(sixth._id), amount: 1000000 },
        })
        const victim = await WalletModel13.findOne({ userId: sixth._id }).lean()
        ok((victim?.balance || 0) === 0, 'a top-up with no checkout of ours, or naming someone else, credits nothing')
        await startCheckout('own', seventh._id, 'wallet-top-up')
        await charge('own', 2000, {
            email: seventh.email,
            metadata: { transactionType: 'wallet-top-up', userId: String(seventh._id), amount: 999999 },
        })
        const own = await WalletModel13.findOne({ userId: seventh._id }).lean()
        ok((own?.balance || 0) === 2000, `a genuine top-up credits what Paystack collected, ₦${own?.balance || 0}, not the metadata's ₦999,999`)
        // ── 15 the event must match our checkout (F-38, F-39) ────────────────
        console.log('\n15 — a payment must match the checkout we recorded')
        const PlanModel15 = require('./models/plan.model')
        const SubscriptionModel15 = require('./models/subscription.model')
        const plan15 = await PlanModel15.create({ title: `STG QB Plan ${STAMP}`, description: 'stg', duration: 'monthly', price: 50000, features: ['stg'], monthlyLimits: 30, paystackPlanCode: `STGQB_${STAMP}` })
        // a bank-transfer proof row, reused for a subscription
        await PaymentModel.create({ userId: seventh._id, amount: 5000, reference: `STGQB-${STAMP}-bt`, status: 'pending', type: 'wallet-top-up', paymentMethod: 'bank-transfer' })
        await charge('bt', 100, { email: seventh.email, metadata: { transactionType: 'subscription', planId: String(plan15._id), userId: String(seventh._id) } })
        // a top-up checkout of the same customer, reused as a subscription
        await startCheckout('topup2sub', seventh._id, 'wallet-top-up')
        await charge('topup2sub', 100, { email: seventh.email, metadata: { transactionType: 'subscription', planId: String(plan15._id), userId: String(seventh._id) } })
        // a real subscription checkout paid ₦100 for a ₦50,000 plan
        await PaymentModel.create({ userId: seventh._id, amount: 0, reference: `STGQB-${STAMP}-sub`, status: 'pending', type: 'subscription', metadata: { expectedAmount: 50000, planId: String(plan15._id) } })
        await charge('sub', 100, { email: seventh.email, metadata: { transactionType: 'subscription', planId: String(plan15._id), userId: String(seventh._id) } })
        const subs15 = await SubscriptionModel15.countDocuments({ $or: [{ userId: seventh._id }, { user: seventh._id }] })
        ok(subs15 === 0, `no plan is activated by a reused or underpaid checkout (${subs15} subscriptions)`)
        // a top-up where the customer also paid Paystack's fee: credit what was asked for
        await PaymentModel.create({ userId: seventh._id, amount: 0, reference: `STGQB-${STAMP}-fee`, status: 'pending', type: 'wallet-top-up', metadata: { expectedAmount: 1000 } })
        const before15 = (await WalletModel13.findOne({ userId: seventh._id }).lean())?.balance || 0
        await charge('fee', 1015, { email: seventh.email, metadata: { transactionType: 'wallet-top-up', userId: String(seventh._id), amount: 1000 } })
        const after15 = (await WalletModel13.findOne({ userId: seventh._id }).lean())?.balance || 0
        ok(after15 - before15 === 1000, `a ₦1,015 charge for a ₦1,000 top-up credits ₦${after15 - before15}`)
        // ── 16 renewals, price changes, retries (F-40, F-42, F-44) ──────────
        console.log('\n16 — renewals refresh the plan; a price edit or a retry does not lose a payment')
        const renewal = (ref, code, email) =>
            handleChargeSuccess({
                reference: `STGQB-${STAMP}-${ref}`,
                amount: 5000000,
                paid_at: new Date().toISOString(),
                channel: 'card',
                customer: { email },
                subscription: { subscription_code: code, next_payment_date: new Date(Date.now() + 30 * DAY).toISOString() },
                metadata: {},
            })
        const sub16 = await SubscriptionModel15.create({
            email: seventh.email, userId: seventh._id, planId: plan15._id, status: 'active',
            startDate: new Date(), remainingItems: 0, subscriptionCode: `SUB_STGQB_${STAMP}`, consecutiveMonths: 1,
        })
        await renewal('ren1', sub16.subscriptionCode, seventh.email)
        const r1 = await SubscriptionModel15.findById(sub16._id).lean()
        ok(r1.remainingItems === 30 && r1.consecutiveMonths === 2,
            `a Paystack renewal (no checkout row of ours) refreshes the allowance (${r1.remainingItems} items, month ${r1.consecutiveMonths})`)
        await renewal('ren1', sub16.subscriptionCode, seventh.email)
        const r2 = await SubscriptionModel15.findById(sub16._id).lean()
        ok(r2.consecutiveMonths === 2, 'the same renewal event twice renews once')
        await renewal('ren2', sub16.subscriptionCode, sixth.email)
        const r3 = await SubscriptionModel15.findById(sub16._id).lean()
        ok(r3.consecutiveMonths === 2, "a renewal paid by someone else does not touch this customer's plan")
        await SubscriptionModel15.deleteOne({ _id: sub16._id })

        // F-42: the admin raises the price after the checkout opened.
        await PaymentModel.create({ userId: seventh._id, amount: 0, reference: `STGQB-${STAMP}-sub2`, status: 'pending', type: 'subscription', metadata: { expectedAmount: 50000, planId: String(plan15._id) } })
        await PlanModel15.updateOne({ _id: plan15._id }, { $set: { price: 60000 } })
        await charge('sub2', 50000, { email: seventh.email, metadata: { transactionType: 'subscription', planId: String(plan15._id), userId: String(seventh._id) } })
        const activated = await SubscriptionModel15.findOne({ userId: seventh._id, planId: plan15._id }).lean()
        ok(!!activated && activated.status === 'active', 'a plan paid at the price its checkout asked for activates after a later price edit')
        const underRow = await PaymentModel.findOne({ reference: `STGQB-${STAMP}-sub` }).lean()
        ok(underRow?.status === 'pending', 'an underpaid plan payment leaves its checkout pending for an admin, not recorded against nothing')
        await SubscriptionModel15.deleteMany({ userId: seventh._id })

        // F-44: charge.failed, then the customer retries the same checkout.
        const { handleChargeFailed } = require('./util/webhook.handler')
        await PaymentModel.create({ userId: seventh._id, amount: 0, reference: `STGQB-${STAMP}-retry`, status: 'pending', type: 'wallet-top-up', metadata: { expectedAmount: 700 } })
        await handleChargeFailed({ reference: `STGQB-${STAMP}-retry`, customer: { email: seventh.email }, metadata: {} })
        const beforeRetry = (await WalletModel13.findOne({ userId: seventh._id }).lean())?.balance || 0
        await charge('retry', 700, { email: seventh.email, metadata: { transactionType: 'wallet-top-up', userId: String(seventh._id), amount: 700 } })
        const afterRetry = (await WalletModel13.findOne({ userId: seventh._id }).lean())?.balance || 0
        ok(afterRetry - beforeRetry === 700, `a payment that failed and was retried on the same checkout is credited (₦${afterRetry - beforeRetry})`)

        await PlanModel15.deleteOne({ _id: plan15._id })
        await PaymentModel.deleteMany({ reference: { $regex: `^STGQB-${STAMP}-` } })
    } catch (e) {
        thrown = e
    } finally {
        await Promise.all([
            BookOrderModel.deleteMany({ _id: { $in: created.orders } }),
            CustomerOfferModel.deleteMany({ userId: { $in: created.users } }),
            OfferModel.deleteMany({ _id: { $in: created.offers } }),
            BookingWindowModel.deleteMany({ _id: { $in: created.windows } }),
            WalletCreditModel.deleteMany({ userId: { $in: created.users } }),
            PaymentModel.deleteMany({ order: { $in: created.orders } }),
            require('./models/walletTransaction.model').deleteMany({ userId: { $in: created.users } }),
            require('./models/wallet.model').deleteMany({ userId: { $in: created.users } }),
            UserModel.deleteMany({ _id: { $in: created.users } }),
        ])
        const left = await UserModel.countDocuments({ _id: { $in: created.users } })
        ok(left === 0, 'cleanup: nothing left behind')
        await mongoose.disconnect()
    }
    if (thrown) {
        FAIL++
        console.log('  ✗ FAIL: threw:', thrown.stack || thrown)
    }
    console.log(`\n${PASS} passed, ${FAIL} failed`)
    process.exit(FAIL ? 1 : 0)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
