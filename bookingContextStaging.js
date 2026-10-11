/**
 * Launch fix 1 (client message 11 Oct 2026, items 10, 11, 12, 14, 15): the
 * booking context, My Plan's free-trip count, the referral-code guard, the
 * fees line, and the window-only free-trip rule — against a real database.
 *
 * Scenarios:
 *   1  booking-context for a brand-new customer (no plan, no order, code box open)
 *   2  a plan whose week rolled over WITHOUT a booking shows the fresh weekly count
 *      (the stored counter still says 0) — on booking-context AND the dashboard
 *   3  a live First Experience linkage → welcomeOffer.active, and booking-options
 *      no longer throws for a customer holding a personal offer (OFFER_TRIGGER)
 *   4  feesLine: welcome-offer on a first order, only when the offer is SELECTED (F-09)
 *   5  window-only pricing: an Anytime pickup keeps its fee, a window pickup is free;
 *      a same-day draft is priced with the order's resolved timing (F-10); a paused
 *      Welcome Offer reads inactive (F-14)
 *   6  after the first order: lastOrderChoices filled, code box closed, applyCode,
 *      captureReferral and the bot all refuse (F-11), an attached Welcome Offer
 *      reads inactive (F-14)
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Deletes what it creates.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node bookingContextStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const UserModel = require('./models/user.model')
const WalletModel = require('./models/wallet.model')
const PlanModel = require('./models/plan.model')
const SubscriptionModel = require('./models/subscription.model')
const OfferModel = require('./models/offer.model')
const CustomerOfferModel = require('./models/customerOffer.model')
const BookOrderModel = require('./models/bookOrder.model')
const BookOrderService = require('./services/bookOrder.service')
const UserService = require('./services/user.service')
const ReferralApiService = require('./services/referralApi.service')
const OfferService = require('./services/offer.service')
const BookingWindowService = require('./services/bookingWindow.service')
const ReferralService = require('./services/referral.service')
const ReferralModel = require('./models/referral.model')
const detailsFlow = require('./services/bot/details.flow')
const {
    ROLE,
    GENERAL_STATUS,
    ORDER_STATUS,
    OFFER_TYPE,
    OFFER_STATUS,
    OFFER_TRIGGER,
    OFFER_BENEFIT_TYPE,
    CUSTOMER_OFFER_STATUS,
    ORDER_CHANNEL,
    ORDER_SERVICE_TYPE,
    SERVICE_TIERS,
    DELIVERY_SPEED,
    PAYMENT_ORDER_STATUS,
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
const unwrap = (r) => r?.data?.message
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

    const created = { users: [], plans: [], subs: [], offers: [], linkages: [], orders: [], wallets: [] }
    const book = new BookOrderService()
    const users = new UserService()
    const referrals = new ReferralApiService()
    try {
        const customer = await UserModel.create({
            email: `stgctx${STAMP}@example.com`,
            fullName: 'STG Context Customer',
            phoneNumber: '08031110001',
            userType: ROLE.USER,
            status: GENERAL_STATUS.ACTIVE,
            isVerified: true,
        })
        created.users.push(customer._id)
        const asCustomer = { user: { id: customer._id.toString(), userType: ROLE.USER } }

        // ── 1 a brand-new customer ───────────────────────────────────────────
        console.log('\n1 — booking context for a brand-new customer')
        const fresh = unwrap(await book.getBookingContext(asCustomer))
        ok(!!fresh, 'the context loads')
        ok(fresh?.plan === null && fresh?.suggestedPayment === null, 'no plan, no suggested payment')
        ok(fresh?.lastOrderChoices === null, 'no last order yet')
        ok(fresh?.canEnterReferralCode === true, 'the referral code box is open')
        ok(!!fresh?.displayNames?.deliverySpeeds, 'renamed labels are readable by a customer')

        // ── 2 a plan whose week rolled over without a booking ────────────────
        console.log('\n2 — free pickups left after the week rolled over with no booking')
        const plan = await PlanModel.create({
            title: `STG Plan ${STAMP}`,
            description: 'staging',
            duration: 'monthly',
            price: 1,
            features: ['x'],
            monthlyLimits: 30,
            freePickupDeliveryPerWeek: 2,
            paystackPlanCode: `PLN_stg${STAMP}`,
        })
        created.plans.push(plan._id)
        const sub = await SubscriptionModel.create({
            email: customer.email,
            userId: customer._id,
            planId: plan._id,
            status: 'active',
            startDate: new Date(Date.now() - 10 * DAY),
            remainingItems: 18,
            remainingPickupDeliveries: 0, // last week's count, all used
            logisticsWeekStart: new Date(Date.now() - 10 * DAY),
        })
        created.subs.push(sub._id)
        const wallet = await WalletModel.findOneAndUpdate(
            { userId: customer._id },
            { $set: { balance: 2500 } },
            { upsert: true, new: true },
        )
        created.wallets.push(wallet._id)
        const withPlan = unwrap(await book.getBookingContext(asCustomer))
        ok(withPlan?.plan?.itemsLeft === 18 && withPlan?.plan?.monthlyItems === 30, 'plan items left and monthly items')
        ok(withPlan?.plan?.freePickupDeliveriesLeftThisWeek === 2, 'the NEW week shows 2 free, not the stored 0')
        ok(withPlan?.plan?.freePickupDeliveriesPerWeek === 2, 'and 2 per week')
        ok(withPlan?.suggestedPayment === 'pay-from-subscription', '"My plan" is suggested while items are left')
        ok(withPlan?.wallet?.balance === 2500, 'the wallet balance is returned')
        const storedAfter = await SubscriptionModel.findById(sub._id).lean()
        ok(storedAfter.remainingPickupDeliveries === 0, 'the read did not write to the subscription')
        const dash = unwrap(await users.getDashboard(asCustomer))
        ok(dash?.subscription?.freePickupDeliveriesLeftThisWeek === 2, 'the dashboard (My Plan) shows the same 2')

        // ── 3 a live Welcome Offer, and booking-options no longer throws ─────
        console.log('\n3 — Welcome Offer active, and booking-options works with a personal offer')
        const welcome = await OfferModel.create({
            name: `STG First Experience ${STAMP}`,
            headline: 'Welcome',
            type: OFFER_TYPE.PERSONAL,
            triggers: [OFFER_TRIGGER.FIRST_EXPERIENCE],
            status: OFFER_STATUS.ACTIVE,
            benefits: [
                { benefitType: OFFER_BENEFIT_TYPE.FREE_PICKUP },
                { benefitType: OFFER_BENEFIT_TYPE.FREE_DELIVERY },
            ],
        })
        created.offers.push(welcome._id)
        const linkage = await CustomerOfferModel.create({
            userId: customer._id,
            offerId: welcome._id,
            status: CUSTOMER_OFFER_STATUS.ASSIGNED,
            expiresAt: new Date(Date.now() + 3 * DAY),
        })
        created.linkages.push(linkage._id)
        const withOffer = unwrap(await book.getBookingContext(asCustomer))
        ok(withOffer?.welcomeOffer?.active === true, 'welcomeOffer.active is true')
        ok(String(withOffer?.welcomeOffer?.endsAt) === String(linkage.expiresAt), 'with its end date')

        const draftBase = {
            amount: 5000,
            pickupAmount: 1000,
            deliveryAmount: 1000,
            pickupTiming: 'window',
            deliveryTiming: 'window',
        }
        let unselected = null
        let threw = null
        try {
            unselected = await OfferService.getBookingOptions(customer._id, draftBase)
        } catch (e) {
            threw = e
        }
        ok(!threw, `booking-options does not throw for a customer holding a personal offer${threw ? ': ' + threw.message : ''}`)

        // ── 4 feesLine on a first order ──────────────────────────────────────
        console.log('\n4 — the fees line on a first order')
        // F-09: nothing is auto-applied on a normal booking, so an offer the
        // customer has not selected is not on the bill and earns no line.
        ok(unselected?.feesLine?.type !== 'welcome-offer' && unselected?.checkoutPrompt?.show === true,
            `not selected: no Welcome line, the checkout prompt shows instead (got ${unselected?.feesLine?.type})`)
        const options = await OfferService.getBookingOptions(customer._id, {
            ...draftBase,
            customerOfferId: linkage._id.toString(),
        })
        ok(options?.feesLine?.type === 'welcome-offer', `selected: feesLine is welcome-offer (got ${options?.feesLine?.type})`)
        ok(options?.feesLine?.amount === 2000, 'worth the two waived trips')

        // ── 5 window-only pricing through the real booking pricing ───────────
        console.log('\n5 — free trips are for window bookings only')
        const price = (timing) =>
            book._priceWithOffers({
                userId: customer._id,
                post: { isPickUp: true, isDelivery: true, customerOfferId: linkage._id.toString() },
                itemsSubtotal: 5000,
                extraDeliveryCost: 2000,
                adminOrderSetting: { pickupFee: 1000, deliveryFee: 1000 },
                scheduling: { pickup: { timing }, delivery: { timing: 'window' } },
            })
        const windowPrice = await price('window')
        const anytimePrice = await price('anytime')
        ok(windowPrice.finalTotal === 5000, `window pickup + delivery are both free (total ${windowPrice.finalTotal})`)
        ok(anytimePrice.finalTotal === 6000, `an Anytime pickup keeps its ₦1,000 fee (total ${anytimePrice.finalTotal})`)
        const anytimeOptions = await OfferService.getBookingOptions(customer._id, {
            ...draftBase,
            pickupTiming: 'anytime',
            customerOfferId: linkage._id.toString(),
        })
        ok(anytimeOptions?.feesLine?.type === 'welcome-offer' && anytimeOptions.feesLine.amount === 1000,
            'on a first order the Welcome line now counts only the window delivery')

        // F-10: a same-day draft sent as `window` is priced the way the order
        // will be — Anytime when there is no morning window.
        const hasMorning = !!BookingWindowService._findMorningWindow(
            await BookingWindowService.getActiveWindows(),
        )
        const sameDay = await OfferService.getBookingOptions(customer._id, {
            ...draftBase,
            deliverySpeed: DELIVERY_SPEED.SAME_DAY,
            customerOfferId: linkage._id.toString(),
        })
        const expectSameDay = hasMorning ? 2000 : 1000
        ok(sameDay?.feesLine?.amount === expectSameDay && sameDay?.selected?.freePickup === hasMorning,
            `same-day sent as window: the screen matches the order (morning window ${hasMorning ? 'exists' : 'missing'}, line ₦${sameDay?.feesLine?.amount})`)

        // F-14: a paused Welcome Offer is not active.
        await OfferModel.updateOne({ _id: welcome._id }, { $set: { status: OFFER_STATUS.PAUSED } })
        const paused = unwrap(await book.getBookingContext(asCustomer))
        ok(paused?.welcomeOffer?.active === false, 'a paused Welcome Offer reads inactive')
        await OfferModel.updateOne({ _id: welcome._id }, { $set: { status: OFFER_STATUS.ACTIVE } })

        // ── 6 after the first order ──────────────────────────────────────────
        console.log('\n6 — after the first order')
        const order = await BookOrderModel.create({
            fullName: 'STG Context Customer',
            phoneNumber: '08031110001',
            userId: customer._id,
            serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
            serviceTier: SERVICE_TIERS.CLASSIC,
            deliverySpeed: DELIVERY_SPEED.STANDARD,
            channel: ORDER_CHANNEL.WEBSITE,
            amount: 5000,
            oscNumber: `OSC-STGCTX${STAMP}`,
            paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
            items: [{ type: 'Shirt', quantity: 1, price: 1000 }],
            stage: { status: ORDER_STATUS.PENDING },
            scheduling: { pickup: { timing: 'window' } },
        })
        created.orders.push(order._id)
        const after = unwrap(await book.getBookingContext(asCustomer))
        ok(after?.lastOrderChoices?.serviceType === ORDER_SERVICE_TYPE.WASH_AND_IRON &&
            after?.lastOrderChoices?.deliverySpeed === DELIVERY_SPEED.STANDARD &&
            after?.lastOrderChoices?.pickupTiming === 'window', 'the last order\'s choices are returned')
        ok(after?.canEnterReferralCode === false, 'the referral code box is closed')
        const apply = await referrals.applyCode({ body: { code: 'ANYCODE' }, user: { id: customer._id.toString() } })
        ok(apply.success === false && /before your first order/.test(apply.data?.error || ''),
            `applyCode refuses after the first order (${apply.data?.error})`)

        // F-11: the bot and every other caller of captureReferral refuse too.
        // A real referrer's code, so only the order rule can reject it.
        const referrer = await UserModel.create({
            fullName: 'STG Context Referrer',
            email: `stg-ctx-ref-${STAMP}@example.com`,
            phoneNumber: `0803222${String(STAMP).slice(-4)}`,
            userType: ROLE.USER,
            status: GENERAL_STATUS.ACTIVE,
            isVerified: true,
            referralCode: `STGREF${STAMP}`,
        })
        created.users.push(referrer._id)
        const captured = await ReferralService.captureReferral({
            referredUserId: customer._id,
            code: referrer.referralCode,
        })
        ok(captured === null, 'captureReferral refuses a real code after the first order')
        const botReply = await detailsFlow.applyReferralCode.call({}, customer._id, '', {
            code: referrer.referralCode,
        })
        ok(/before your first order/.test(botReply?.replies?.[0] || ''),
            `the bot refuses with the same message (${botReply?.replies?.[0]})`)

        // F-14: once the Welcome Offer is attached to the placed order, it is
        // no longer usable on a booking, so it no longer reads active.
        await CustomerOfferModel.updateOne(
            { _id: linkage._id },
            { $set: { status: CUSTOMER_OFFER_STATUS.ATTACHED } },
        )
        const attached = unwrap(await book.getBookingContext(asCustomer))
        ok(attached?.welcomeOffer?.active === false, 'an attached Welcome Offer reads inactive')
    } finally {
        await Promise.all([
            BookOrderModel.deleteMany({ _id: { $in: created.orders } }),
            CustomerOfferModel.deleteMany({ _id: { $in: created.linkages } }),
            OfferModel.deleteMany({ _id: { $in: created.offers } }),
            SubscriptionModel.deleteMany({ _id: { $in: created.subs } }),
            PlanModel.deleteMany({ _id: { $in: created.plans } }),
            WalletModel.deleteMany({ _id: { $in: created.wallets } }),
            UserModel.deleteMany({ _id: { $in: created.users } }),
            ReferralModel.deleteMany({ referredUserId: { $in: created.users } }),
        ])
        const left = await UserModel.countDocuments({ _id: { $in: created.users } })
        ok(left === 0, 'cleanup: nothing left behind')
        await mongoose.disconnect()
    }
    console.log(`\n${PASS} passed, ${FAIL} failed`)
    process.exit(FAIL ? 1 : 0)
}

main().catch(async (e) => {
    console.error('STAGING ERROR:', e)
    try {
        await mongoose.disconnect()
    } catch (_) {}
    process.exit(1)
})
