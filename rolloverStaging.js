/**
 * Subscription item rollover — build-plan feature 21 — DB verification on testingdb.
 *
 * Drives the REAL handlers with synthetic Paystack payloads (the Paystack HTTP
 * client is stubbed, so nothing reaches Paystack):
 *   1  renewal rollover: 20 left → 37, 5 → 30, 0 → 25 (25-item plan, cap 12)
 *   2  failed renewal paid within 7 days keeps the rollover; after 8 days it is forfeited
 *   3  month-3 renewal: rollover first, then the 25% loyalty bonus (20 left → 43)
 *   4  the same renewal webhook twice applies once
 *   5  cancel keeps the record; booking with the plan works until the paid month ends,
 *      is refused after it, and the nightly step expires it with 0 items
 *   6  nightly reconcile maps non-renewing / attention without throwing, and keeps going
 *   7  plan change: cancel a 25-item plan with 10 left, subscribe to a 40-item plan →
 *      one usable plan, 40 items, nothing carried; the old record is expired with 0
 *
 * SMS stubbed. SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node rolloverStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const smsPath = require.resolve('./util/sendSms')
const smsSent = [] // [phone, text] the code tried to send
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: async (phone, text) => { smsSent.push([phone, text]); return { stubbed: true } } }
// Paystack client stub: GET /subscription/<code> answers from `psStatus`; anything else is a harmless "ok".
const psStatus = {}
const psPlan = {} // subscription code → plan code
const psCreated = {} // subscription code → createdAt
const psCustomer = {} // customer code → [subscription codes]
const failDisable = new Set() // codes whose /subscription/disable throws (risk fix C)
const disabled = [] // Paystack subscription codes we asked Paystack to disable
const clientPath = require.resolve('./services/paystack.client.service')
require.cache[clientPath] = {
    id: clientPath, filename: clientPath, loaded: true,
    exports: {
        get: async (url) => {
            const u = String(url)
            const code = u.split('/').pop()
            if (u.startsWith('/customer/')) {
                return { data: { data: { subscriptions: (psCustomer[code] || []).map((c) => ({ subscription_code: c })) } } }
            }
            return {
                data: {
                    data: {
                        status: psStatus[code] || 'unknown-to-staging', email_token: `tok_${code}`,
                        subscription_code: code, plan: { plan_code: psPlan[code] }, createdAt: psCreated[code],
                    },
                },
            }
        },
        post: async (url, body) => {
            if (url === '/subscription/disable') {
                if (failDisable.has(body?.code)) throw new Error('staging: Paystack timeout')
                disabled.push(body?.code)
            }
            return { data: { status: true, data: {} } }
        },
    },
}
const mongoose = require('mongoose')
const UserModel = require('./models/user.model')
const PlanModel = require('./models/plan.model')
const SubscriptionModel = require('./models/subscription.model')
const PaymentModel = require('./models/payment.model')
const BookOrderModel = require('./models/bookOrder.model')
const OrderItemModel = require('./models/orderItem.model')
const AdminSettingModel = require('./models/adminSetting.model')
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
const DAY = 86400000

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
    const WH = require('./util/webhook.handler')
    const { reconcileSubscriptions } = require('./crons/reconcilePaystack')
    const { findUsableSubscription } = require('./util/subscriptionAccess')
    const SubscriptionService = require('./services/subscription.service')
    const BookOrderService = require('./services/bookOrder.service')
    const ts = Date.now()
    const TAG = `ROLL${ts}`
    const created = { users: [], plans: [], orders: [] }
    try {
        const p25 = await PlanModel.create({ title: `${TAG} 25`, description: 's', duration: 'monthly', price: 1000, features: ['x'], monthlyLimits: 25, paystackPlanCode: `PLN_${TAG}_25` })
        const p40 = await PlanModel.create({ title: `${TAG} 40`, description: 's', duration: 'monthly', price: 2000, features: ['x'], monthlyLimits: 40, paystackPlanCode: `PLN_${TAG}_40` })
        created.plans.push(p25._id, p40._id)
        const user = await UserModel.create({ email: `roll${ts}@example.com`, fullName: `${TAG} Customer`, userType: C.ROLE.USER, isVerified: true, phoneNumber: '08030000000' })
        created.users.push(user._id)
        const CODE = `SUB_${TAG}`
        const sub = await SubscriptionModel.create({
            email: user.email, userId: user._id, planId: p25._id, subscriptionCode: CODE, status: 'active',
            remainingItems: 20, consecutiveMonths: 1, currentPeriodEnd: new Date(ts + 5 * DAY), nextPaymentDate: new Date(ts + 5 * DAY),
        })
        let n = 0
        const renew = async ({ paidAt = new Date(), ref } = {}) => {
            const reference = ref || `${TAG}-R${++n}`
            await WH.handleChargeSuccess({
                reference, amount: 100000, paid_at: paidAt.toISOString(), channel: 'card',
                customer: { email: user.email },
                subscription: { subscription_code: CODE, next_payment_date: new Date(paidAt.getTime() + 30 * DAY).toISOString() },
            })
            return SubscriptionModel.findById(sub._id).lean()
        }
        const setSub = (fields) => SubscriptionModel.updateOne({ _id: sub._id }, { $set: fields })

        console.log('\n[1] Renewal rollover (25-item plan, cap 12)')
        let s = await renew()
        ok(s.remainingItems === 37 && s.rolledOverItems === 12, `20 left → ${s.remainingItems} (carried ${s.rolledOverItems})`)
        await setSub({ remainingItems: 5, consecutiveMonths: 0, loyaltyRewardsApplied: [] })
        s = await renew()
        ok(s.remainingItems === 30 && s.rolledOverItems === 5, `5 left → ${s.remainingItems}`)
        await setSub({ remainingItems: 0, consecutiveMonths: 0, loyaltyRewardsApplied: [] })
        s = await renew()
        ok(s.remainingItems === 25 && s.rolledOverItems === 0, `0 left → ${s.remainingItems}`)
        ok(s.currentPeriodEnd && new Date(s.currentPeriodEnd).getTime() === new Date(s.nextPaymentDate).getTime(), 'each renewal moves the paid-until date to the next payment date')

        console.log('\n[2] Failed renewal: the one-week grace')
        await setSub({ remainingItems: 20, consecutiveMonths: 1 })
        await WH.handleInvoiceFailed({ subscription: { subscription_code: CODE }, customer: { email: user.email } })
        let f = await SubscriptionModel.findById(sub._id).lean()
        ok(f.status === 'failed' && f.failedAt, 'the failed payment marks the plan failed and records when')
        const firstFail = f.failedAt
        await WH.handleInvoiceFailed({ subscription: { subscription_code: CODE }, customer: { email: user.email } })
        f = await SubscriptionModel.findById(sub._id).lean()
        ok(new Date(f.failedAt).getTime() === new Date(firstFail).getTime(), 'a second failed retry does not restart the week')
        s = await renew({ paidAt: new Date(new Date(firstFail).getTime() + 3 * DAY) })
        ok(s.status === 'active' && s.remainingItems === 37 && !s.failedAt, `paid 3 days after failing → keeps the rollover (${s.remainingItems})`)
        await setSub({ remainingItems: 20, consecutiveMonths: 0, loyaltyRewardsApplied: [] })
        await WH.handleInvoiceFailed({ subscription: { subscription_code: CODE }, customer: { email: user.email } })
        f = await SubscriptionModel.findById(sub._id).lean()
        s = await renew({ paidAt: new Date(new Date(f.failedAt).getTime() + 8 * DAY) })
        ok(s.remainingItems === 25 && s.rolledOverItems === 0, `paid 8 days after failing → leftovers forfeited (${s.remainingItems})`)

        console.log('\n[3] Month 3: rollover first, then the loyalty bonus')
        await setSub({ remainingItems: 20, consecutiveMonths: 2, loyaltyRewardsApplied: [] })
        s = await renew()
        ok(s.consecutiveMonths === 3 && s.remainingItems === 43, `20 left at month 3 → 25 + 12 + 6 = ${s.remainingItems}`)

        console.log('\n[4] The same webhook twice applies once')
        await setSub({ remainingItems: 10 })
        const once = await renew({ ref: `${TAG}-DUP` })
        const twice = await renew({ ref: `${TAG}-DUP` })
        ok(once.remainingItems === 35 && twice.remainingItems === 35, `applied once (${once.remainingItems} → ${twice.remainingItems})`)

        console.log('\n[5] Cancel keeps the plan until the paid month ends')
        await setSub({ remainingItems: 10, status: 'active', currentPeriodEnd: new Date(ts + 10 * DAY) })
        psStatus[CODE] = 'active'
        const svc = new SubscriptionService()
        const cancel = await svc.cancelSubscription({ user: { id: String(user._id) } })
        const c1 = await SubscriptionModel.findById(sub._id).lean()
        ok(cancel.success && c1 && c1.status === 'cancelled' && c1.cancelledAt, `cancel keeps the record as cancelled ("${String(cancel.data?.message).slice(0, 70)}")`)
        ok(String((await findUsableSubscription(user._id))?._id) === String(sub._id), 'it is still the usable plan before the paid month ends')
        const settings = await AdminSettingModel.findOne()
        const light = await OrderItemModel.findOne({ isHeavy: { $ne: true } })
        const book = new BookOrderService()
        const place = () => book.createOrder({
            userId: String(user._id),
            payload: {
                fullName: user.fullName, items: [{ type: light.name, price: light.price, quantity: 1 }],
                serviceType: settings.serviceTypes[0].name, serviceTier: C.SERVICE_TIERS.CLASSIC, deliverySpeed: 'standard',
                isPickUp: false, isDelivery: false, phoneNumber: '08030000000', billingType: C.BILLING_TYPE.PAY_FROM_SUBSCRIPTION,
                pickupAddress: { label: 'Home', address: '1 Roll Road', landmark: 'mast' },
                deliveryAddress: { label: 'Home', address: '1 Roll Road', landmark: 'mast' },
            },
        })
        const b1 = await place()
        if (b1?.data?.order?._id) created.orders.push(b1.data.order._id)
        ok(b1?.success === true, `booking with the cancelled plan works before the period end (${b1?.success ? 'ok' : JSON.stringify(b1?.data)})`)
        await setSub({ currentPeriodEnd: new Date(Date.now() - 60000) })
        const b2 = await place()
        if (b2?.data?.order?._id) created.orders.push(b2.data.order._id)
        ok(!b2?.success && b2?.data?.error === 'Subscription is not active', `after the period end it is refused ("${b2?.data?.error}")`)
        const sum1 = await reconcileSubscriptions()
        const c2 = await SubscriptionModel.findById(sub._id).lean()
        ok(c2.status === 'expired' && c2.remainingItems === 0, `the nightly step expires it with 0 items (expired ${sum1.expired})`)

        console.log('\n[6] Nightly reconcile maps Paystack statuses and keeps going')
        const a = await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, subscriptionCode: `${CODE}_A`, status: 'active', remainingItems: 5, nextPaymentDate: new Date(ts + 9 * DAY) })
        const b = await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, subscriptionCode: `${CODE}_B`, status: 'active', remainingItems: 5 })
        psStatus[`${CODE}_A`] = 'non-renewing'
        psStatus[`${CODE}_B`] = 'attention'
        const sum2 = await reconcileSubscriptions()
        const ra = await SubscriptionModel.findById(a._id).lean()
        const rb = await SubscriptionModel.findById(b._id).lean()
        ok(ra.status === 'cancelled' && ra.currentPeriodEnd && rb.status === 'failed' && rb.failedAt,
            `non-renewing → cancelled (usable until ${ra.currentPeriodEnd && new Date(ra.currentPeriodEnd).toDateString()}), attention → failed; both processed (${sum2.failed} errors)`)
        await SubscriptionModel.deleteMany({ _id: { $in: [a._id, b._id] } })

        console.log('\n[7] A plan change starts fresh')
        await setSub({ status: 'active', remainingItems: 10, currentPeriodEnd: new Date(ts + 10 * DAY) })
        await svc.cancelSubscription({ user: { id: String(user._id) } })
        const reference = `${TAG}-NEW40`
        await PaymentModel.create({ userId: user._id, amount: 0, reference, status: 'pending', type: 'subscription', metadata: { expectedAmount: 2000, planId: String(p40._id) } })
        await WH.handleChargeSuccess({
            reference, amount: 200000, paid_at: new Date().toISOString(), channel: 'card',
            customer: { email: user.email }, metadata: { transactionType: 'subscription', planId: String(p40._id) },
            plan: { plan_code: p40.paystackPlanCode }, authorization: { authorization_code: `AUTH_${TAG}` },
        })
        const usable = await SubscriptionModel.find({ userId: user._id, status: { $in: ['active', 'cancelled'] } }).lean()
        const old = await SubscriptionModel.findById(sub._id).lean()
        ok(usable.length === 1 && String(usable[0].planId) === String(p40._id) && usable[0].remainingItems === 40 && (usable[0].rolledOverItems || 0) === 0,
            `exactly one usable plan: the 40-item plan with ${usable[0]?.remainingItems} items, nothing carried`)
        ok(old.status === 'expired' && old.remainingItems === 0 && old.expiryReminderSentAt, 'the cancelled 25-item plan is expired with 0 items, and gets no "renew" email (F-91)')

        console.log('\n[8] Review F-90: a failed customer starting a new plan is never billed twice')
        // Start again from one failed 25-item plan on its own Paystack code.
        await SubscriptionModel.deleteMany({ userId: user._id })
        const FCODE = `${CODE}_F`
        const failedSub = await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, subscriptionCode: FCODE, paystackEmailToken: 'tokF', status: 'failed', failedAt: new Date(), remainingItems: 8 })
        psStatus[FCODE] = 'attention'
        const ref2 = `${TAG}-NEW40B`
        await PaymentModel.create({ userId: user._id, amount: 0, reference: ref2, status: 'pending', type: 'subscription', metadata: { expectedAmount: 2000, planId: String(p40._id) } })
        await WH.handleChargeSuccess({
            reference: ref2, amount: 200000, paid_at: new Date().toISOString(), channel: 'card',
            customer: { email: user.email }, metadata: { transactionType: 'subscription', planId: String(p40._id) },
            plan: { plan_code: p40.paystackPlanCode }, authorization: { authorization_code: `AUTH2_${TAG}` },
        })
        const fOld = await SubscriptionModel.findById(failedSub._id).lean()
        ok(disabled.includes(FCODE) && fOld.status === 'expired', 'the old failed plan is stopped ON PAYSTACK and expired here')
        // A late charge on the old Paystack subscription must not revive it.
        await WH.handleChargeSuccess({
            reference: `${TAG}-LATE`, amount: 100000, paid_at: new Date().toISOString(), channel: 'card',
            customer: { email: user.email },
            subscription: { subscription_code: FCODE, next_payment_date: new Date(Date.now() + 30 * DAY).toISOString() },
        })
        const fLate = await SubscriptionModel.findById(failedSub._id).lean()
        const usableNow = await SubscriptionModel.find({ userId: user._id, status: { $in: ['active', 'cancelled'] } }).lean()
        ok(fLate.status === 'expired' && usableNow.length === 1 && String(usableNow[0].planId) === String(p40._id),
            'a late charge on the replaced plan does not revive it — still exactly one usable plan')

        console.log('\n[10] Review F-94: a failed renewal is paid by re-subscribing to the same plan')
        {
            // A fresh customer state: one failed 25-item plan with 20 left.
            await SubscriptionModel.deleteMany({ userId: user._id })
            const G = `${CODE}_G`
            const failedG = await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, subscriptionCode: G, paystackEmailToken: 'tokG', status: 'failed', failedAt: new Date(Date.now() - 2 * DAY), remainingItems: 20 })
            psStatus[G] = 'attention'
            const stop = await svc.cancelSubscription({ user: { id: String(user._id) } })
            const g1 = await SubscriptionModel.findById(failedG._id).lean()
            ok(stop.success && disabled.includes(G) && g1.status === 'failed' && /subscribe to the same plan again by/.test(stop.data?.message || ''),
                `a failed plan can be cancelled: stopped on Paystack, still failed, told how to keep the items ("${String(stop.data?.message).slice(0, 60)}…")`)
            const ref3 = `${TAG}-RESUB25`
            await PaymentModel.create({ userId: user._id, amount: 0, reference: ref3, status: 'pending', type: 'subscription', metadata: { expectedAmount: 1000, planId: String(p25._id) } })
            await WH.handleChargeSuccess({
                reference: ref3, amount: 100000, paid_at: new Date().toISOString(), channel: 'card',
                customer: { email: user.email }, metadata: { transactionType: 'subscription', planId: String(p25._id) },
                plan: { plan_code: p25.paystackPlanCode }, authorization: { authorization_code: `AUTH3_${TAG}` },
            })
            const resub = await findUsableSubscription(user._id)
            ok(resub && resub.remainingItems === 37 && resub.rolledOverItems === 12, `re-subscribing to the same plan 2 days after the failure keeps the rollover (${resub?.remainingItems})`)
            // After the week: no carry.
            await SubscriptionModel.deleteMany({ userId: user._id })
            await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, subscriptionCode: `${G}2`, status: 'failed', failedAt: new Date(Date.now() - 9 * DAY), remainingItems: 20 })
            const ref4 = `${TAG}-RESUB25B`
            await PaymentModel.create({ userId: user._id, amount: 0, reference: ref4, status: 'pending', type: 'subscription', metadata: { expectedAmount: 1000, planId: String(p25._id) } })
            await WH.handleChargeSuccess({
                reference: ref4, amount: 100000, paid_at: new Date().toISOString(), channel: 'card',
                customer: { email: user.email }, metadata: { transactionType: 'subscription', planId: String(p25._id) },
                plan: { plan_code: p25.paystackPlanCode }, authorization: { authorization_code: `AUTH4_${TAG}` },
            })
            const late = await findUsableSubscription(user._id)
            ok(late && late.remainingItems === 25, `9 days after the failure it starts fresh (${late?.remainingItems})`)
            // A different plan never carries.
            await SubscriptionModel.deleteMany({ userId: user._id })
            await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, subscriptionCode: `${G}3`, status: 'failed', failedAt: new Date(Date.now() - 1 * DAY), remainingItems: 20 })
            const ref5 = `${TAG}-RESUB40`
            await PaymentModel.create({ userId: user._id, amount: 0, reference: ref5, status: 'pending', type: 'subscription', metadata: { expectedAmount: 2000, planId: String(p40._id) } })
            await WH.handleChargeSuccess({
                reference: ref5, amount: 200000, paid_at: new Date().toISOString(), channel: 'card',
                customer: { email: user.email }, metadata: { transactionType: 'subscription', planId: String(p40._id) },
                plan: { plan_code: p40.paystackPlanCode }, authorization: { authorization_code: `AUTH5_${TAG}` },
            })
            const other = await findUsableSubscription(user._id)
            ok(other && String(other.planId) === String(p40._id) && other.remainingItems === 40, `a different plan starts fresh (${other?.remainingItems})`)
        }

        console.log('\n[11] Client 2026-10-14: failure SMS, My Plan banner, day-5 reminder')
        {
            const { sendRenewalReminders } = require('./crons/renewalFailedReminder')
            await SubscriptionModel.deleteMany({ userId: user._id })
            const N = `${CODE}_N`
            const s11 = await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, subscriptionCode: N, status: 'active', remainingItems: 20 })
            smsSent.length = 0
            await WH.handleInvoiceFailed({ subscription: { subscription_code: N }, customer: { email: user.email } })
            await WH.handleInvoiceFailed({ subscription: { subscription_code: N }, customer: { email: user.email } })
            const failSms = smsSent.filter(([ph]) => ph === user.phoneNumber)
            ok(failSms.length === 1 && /^Chuvi: Your plan renewal didn't go through\. Subscribe again by \w+ \d+ \w+ to keep your 12 unused items\.$/.test(failSms[0][1]) && !/[–—-]/.test(failSms[0][1]),
                `the customer gets ONE SMS the moment it fails ("${failSms[0]?.[1]}")`)
            const cur = await svc.getCurrentSubscription({ user: { id: String(user._id) } })
            const banner = cur.data?.renewalFailed
            ok(cur.success && cur.data?.subscription === null && banner && banner.unusedItems === 12 && String(banner.planId) === String(p25._id) && /Subscribe again by/.test(banner.message),
                `My Plan gets the banner with the same plan to re-subscribe to ("${banner?.message}")`)
            // A fixed failure time, so the calendar-day rule is tested the same at any hour:
            // failed Mon 19 Oct at 15:00 (after 10:00, the F-96 case) → reminded Sat 24 Oct.
            const failedAt = new Date(2026, 9, 19, 15, 0)
            await SubscriptionModel.updateOne({ _id: s11._id }, { $set: { failedAt } })
            smsSent.length = 0
            const day4 = await sendRenewalReminders(new Date(2026, 9, 23, 10, 0))
            const day5 = await sendRenewalReminders(new Date(2026, 9, 24, 10, 0))
            const again = await sendRenewalReminders(new Date(2026, 9, 25, 10, 0))
            const remind = smsSent.filter(([ph]) => ph === user.phoneNumber)
            ok(day4.sent === 0 && day5.sent === 1 && again.sent === 0 && remind.length === 1 && /^Chuvi reminder: 2 days left\. Subscribe again by Monday 26 October/.test(remind[0][1]) && !/[–—-]/.test(remind[0][1]),
                `the reminder goes once, on calendar day 5 (Saturday) for a 15:00 failure, not day 4 or 6 (F-96) ("${remind[0]?.[1]}")`)
            // F-95: the nightly reconcile leaves a failed plan failed, even when Paystack says cancelled.
            psStatus[N] = 'cancelled'
            await reconcileSubscriptions()
            const s11b = await SubscriptionModel.findById(s11._id).lean()
            ok(s11b.status === 'failed' && s11b.remainingItems === 20, 'the nightly reconcile keeps a failed plan failed with its items (F-95)')
            // F-97: a failed invoice on an expired (replaced) plan changes nothing and sends no SMS.
            await SubscriptionModel.updateOne({ _id: s11._id }, { $set: { status: 'expired', failedAt: null } })
            smsSent.length = 0
            await WH.handleInvoiceFailed({ subscription: { subscription_code: N }, customer: { email: user.email } })
            const s11c = await SubscriptionModel.findById(s11._id).lean()
            ok(s11c.status === 'expired' && smsSent.filter(([ph]) => ph === user.phoneNumber).length === 0, 'a failed invoice on a replaced plan neither revives it nor texts the customer (F-97)')
            await SubscriptionModel.deleteMany({ userId: user._id })
        }

        console.log('\n[9] Review F-93: cancel while Paystack says "attention" still stops it on Paystack')
        const ACODE = `${CODE}_ATT`
        await SubscriptionModel.deleteMany({ userId: user._id })
        await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, subscriptionCode: ACODE, paystackEmailToken: 'tokA', status: 'active', remainingItems: 10, currentPeriodEnd: new Date(Date.now() + 5 * DAY) })
        psStatus[ACODE] = 'attention'
        const c9 = await svc.cancelSubscription({ user: { id: String(user._id) } })
        ok(c9.success && disabled.includes(ACODE), 'the Paystack subscription is disabled even though Paystack said "attention"')

        console.log('\n[13] Risk fixes A, B, C (2026-10-14)')
        {
            // A — the new plan fetches its own Paystack code when subscription.create came first (or never).
            await SubscriptionModel.deleteMany({ userId: user._id })
            const OLDA = `${CODE}_A_OLD`, NEWA = `${CODE}_A_NEW`, CUS = `CUS_${TAG}`
            await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, subscriptionCode: OLDA, status: 'failed', failedAt: new Date(Date.now() - DAY), remainingItems: 4 })
            psCustomer[CUS] = [OLDA, NEWA]
            psStatus[OLDA] = 'attention'; psPlan[OLDA] = p25.paystackPlanCode; psCreated[OLDA] = new Date(Date.now() - 40 * DAY).toISOString()
            psStatus[NEWA] = 'active'; psPlan[NEWA] = p25.paystackPlanCode; psCreated[NEWA] = new Date().toISOString()
            const refA = `${TAG}-RISKA`
            await PaymentModel.create({ userId: user._id, amount: 0, reference: refA, status: 'pending', type: 'subscription', metadata: { expectedAmount: 1000, planId: String(p25._id) } })
            await WH.handleChargeSuccess({
                reference: refA, amount: 100000, paid_at: new Date().toISOString(), channel: 'card',
                customer: { email: user.email, customer_code: CUS }, metadata: { transactionType: 'subscription', planId: String(p25._id) },
                plan: { plan_code: p25.paystackPlanCode }, authorization: { authorization_code: `AUTHA_${TAG}` },
            })
            const a1 = await findUsableSubscription(user._id)
            ok(a1 && a1.subscriptionCode === NEWA && a1.paystackEmailToken === `tok_${NEWA}`,
                `A: the new plan gets its own Paystack code (${a1?.subscriptionCode}) without waiting for subscription.create — never the old one`)

            // B — a renewal with a code we don't know is adopted by the customer's one code-less plan.
            await SubscriptionModel.deleteMany({ userId: user._id })
            const nocode = await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, paystackSubscriptionId: p25.paystackPlanCode, status: 'active', remainingItems: 20, consecutiveMonths: 0 })
            const UNK = `${CODE}_B_UNKNOWN`
            await WH.handleChargeSuccess({
                reference: `${TAG}-RISKB`, amount: 100000, paid_at: new Date().toISOString(), channel: 'card',
                customer: { email: user.email }, plan: { plan_code: p25.paystackPlanCode },
                subscription: { subscription_code: UNK, next_payment_date: new Date(Date.now() + 30 * DAY).toISOString() },
            })
            const b1 = await SubscriptionModel.findById(nocode._id).lean()
            ok(b1.subscriptionCode === UNK && b1.remainingItems === 37,
                `B: the renewal adopts the unknown code and applies the rollover (${b1.remainingItems}) instead of being reported unapplied`)

            // C — a switch-off Paystack refuses is retried by the nightly reconcile until it sticks.
            await SubscriptionModel.deleteMany({ userId: user._id })
            const FX = `${CODE}_C_OLD`
            const oldC = await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, subscriptionCode: FX, paystackEmailToken: 'tokC', status: 'failed', failedAt: new Date(Date.now() - DAY), remainingItems: 4 })
            psStatus[FX] = 'attention'
            failDisable.add(FX)
            const refC = `${TAG}-RISKC`
            await PaymentModel.create({ userId: user._id, amount: 0, reference: refC, status: 'pending', type: 'subscription', metadata: { expectedAmount: 2000, planId: String(p40._id) } })
            await WH.handleChargeSuccess({
                reference: refC, amount: 200000, paid_at: new Date().toISOString(), channel: 'card',
                customer: { email: user.email }, metadata: { transactionType: 'subscription', planId: String(p40._id) },
                plan: { plan_code: p40.paystackPlanCode }, authorization: { authorization_code: `AUTHC_${TAG}` },
            })
            const c1 = await SubscriptionModel.findById(oldC._id).lean()
            ok(c1.status === 'expired' && c1.paystackDisablePending === true && !disabled.includes(FX),
                'C: when Paystack refuses the switch-off, the old plan is closed here and marked "switch-off pending"')
            failDisable.delete(FX)
            const rc = await reconcileSubscriptions()
            const c2 = await SubscriptionModel.findById(oldC._id).lean()
            ok(disabled.includes(FX) && !c2.paystackDisablePending && rc.disableCleared >= 1,
                'C: the nightly reconcile retries the switch-off and clears the flag once it sticks')
        }

        console.log('\n[12] Client correction 2026-10-14: a FAILED new payment leaves the failed plan as it was')
        {
            await SubscriptionModel.deleteMany({ userId: user._id })
            const K = `${CODE}_K`
            // SAME plan and SAME card as the re-subscribe below (the F-90 reuse path).
            const kept = await SubscriptionModel.create({ email: user.email, userId: user._id, planId: p25._id, subscriptionCode: K, paystackEmailToken: 'tokK', status: 'failed', failedAt: new Date(Date.now() - 2 * DAY), remainingItems: 20, paystackSubscriptionId: p25.paystackPlanCode, paystackAuthorizationToken: `AUTHK_${TAG}` })
            psStatus[K] = 'attention'
            disabled.length = 0
            // The customer tries to subscribe again, and that card payment FAILS.
            const refF = `${TAG}-RETRYFAIL`
            await PaymentModel.create({ userId: user._id, amount: 0, reference: refF, status: 'pending', type: 'subscription', metadata: { expectedAmount: 1000, planId: String(p25._id) } })
            await WH.handleChargeFailed({ reference: refF, status: 'failed', gateway_response: 'Declined', amount: 100000, customer: { email: user.email }, metadata: { transactionType: 'subscription', planId: String(p25._id) } })
            const k1 = await SubscriptionModel.findById(kept._id).lean()
            const others = await SubscriptionModel.countDocuments({ userId: user._id, _id: { $ne: kept._id } })
            ok(k1.status === 'failed' && k1.remainingItems === 20 && !disabled.includes(K) && others === 0,
                'the old failed plan is untouched and NOT switched off on Paystack; the customer can try again before the deadline')
            // They try again and it SUCCEEDS: only now is the old one switched off, and the items carry.
            const refS = `${TAG}-RETRYOK`
            await PaymentModel.create({ userId: user._id, amount: 0, reference: refS, status: 'pending', type: 'subscription', metadata: { expectedAmount: 1000, planId: String(p25._id) } })
            await WH.handleChargeSuccess({
                reference: refS, amount: 100000, paid_at: new Date().toISOString(), channel: 'card',
                customer: { email: user.email }, metadata: { transactionType: 'subscription', planId: String(p25._id) },
                plan: { plan_code: p25.paystackPlanCode }, authorization: { authorization_code: `AUTHK_${TAG}` },
            })
            const k2 = await SubscriptionModel.findById(kept._id).lean()
            const now25 = await findUsableSubscription(user._id)
            ok(disabled.includes(K) && k2.status === 'expired' && now25 && now25.remainingItems === 37 && String(now25._id) !== String(kept._id),
                `same plan, same card: a NEW plan is created, the old failed one is switched off on Paystack, the items carry (${now25?.remainingItems}) (F-90)`)
            // Paystack's subscription.create for the new plan lands on the NEW record, never the old failed one.
            await WH.handleSubscriptionCreate({
                customer: { email: user.email, customer_code: 'CUS_x' }, plan: { plan_code: p25.paystackPlanCode },
                authorization: { authorization_code: `AUTHK_${TAG}` }, subscription_code: `${K}_NEW`, email_token: 'etokNEW', status: 'active',
            })
            const fresh = await SubscriptionModel.findById(now25._id).lean()
            const k3 = await SubscriptionModel.findById(kept._id).lean()
            ok(fresh.subscriptionCode === `${K}_NEW` && fresh.paystackEmailToken === 'etokNEW' && k3.subscriptionCode === K && k3.status === 'expired',
                'the new Paystack code and email token go on the new plan; the old record keeps its own code and stays expired')
        }
    } catch (e) {
        FAIL++
        console.error('STAGING ERROR', e)
    } finally {
        const db = mongoose.connection.db
        await SubscriptionModel.deleteMany({ userId: { $in: created.users } })
        await PaymentModel.deleteMany({ userId: { $in: created.users } })
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        for (const coll of ['notifications', 'crmprofiles', 'wallets', 'customeroffers', 'crmscheduledmessages', 'audits', 'auditlogs', 'activities', 'unappliedrenewals']) {
            await db.collection(coll).deleteMany({ $or: [{ userId: { $in: created.users } }, { orderId: { $in: created.orders } }] }).catch(() => {})
        }
        await PlanModel.deleteMany({ _id: { $in: created.plans } })
        await UserModel.deleteMany({ _id: { $in: created.users } })
        console.log(`\nrolloverStaging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
        await mongoose.disconnect()
        process.exit(FAIL ? 1 : 0) // the reconcile module schedules a cron, which would keep the process alive
    }
}

main().catch(async (e) => {
    console.error('STAGING ERROR', e.message)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
})
