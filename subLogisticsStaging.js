/**
 * Feature 1 DB verification — subscriber weekly free pickup/delivery allowance.
 *
 * Books subscription orders through the REAL postBookOrder path and asserts:
 *  - free legs consumed (pickup + delivery counted SEPARATELY),
 *  - overflow fee = configured pickupFee/deliveryFee once the weekly allowance runs out,
 *  - wallet collection (+ rollback when the wallet can't cover),
 *  - card collection (order stays PENDING, Paystack link returned),
 *  - rolling 7-day reset anchored to the subscription.
 * Then deletes everything it created.
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses on NODE_ENV=production unless STAGING_FORCE=1.
 * Run:  STAGING_OK=1 node subLogisticsStaging.js
 */
require('dotenv').config()
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const PlanModel = require('./models/plan.model')
const SubscriptionModel = require('./models/subscription.model')
const WalletModel = require('./models/wallet.model')
const WalletTransactionModel = require('./models/walletTransaction.model')
const PaymentModel = require('./models/payment.model')
const NotificationModel = require('./models/notification.model')
const CrmProfileModel = require('./models/crmProfile.model')
const AdminSettingModel = require('./models/adminSetting.model')
const AdminOrderDetailsModel = require('./models/adminOrderDetails.model')
const { ROLE } = require('./util/constants')
const BookOrderService = require('./services/bookOrder.service')

let PASS = 0,
    FAIL = 0
const ok = (c, m) => {
    if (c) { PASS++; console.log('  ✓', m) }
    else { FAIL++; console.log('  ✗ FAIL:', m) }
}
const ts = Date.now()

async function main() {
    if (process.env.STAGING_OK !== '1') {
        console.error('Refusing: set STAGING_OK=1 to confirm this is a staging DB.')
        process.exit(2)
    }
    if (process.env.NODE_ENV === 'production' && process.env.STAGING_FORCE !== '1') {
        console.error('NODE_ENV=production — refusing without STAGING_FORCE=1.')
        process.exit(2)
    }
    const url = process.env.MONGODB_URL
    if (!url) { console.error('MONGODB_URL not set.'); process.exit(2) }
    console.log('Target DB host:', url.replace(/\/\/[^@]*@/, '//***:***@').replace(/\/[^/?]+(\?|$)/, '/<db>$1'))
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000, retryWrites: true, retryReads: true })

    const created = { orderIds: [], userIds: [], planIds: [], subIds: [] }
    const customer = await UserModel.create({
        email: `sublog_${ts}@example.com`,
        fullName: 'SubLog Customer',
        userType: ROLE.USER,
    })
    created.userIds.push(customer._id)

    // settings (self-seed if the DB has none) — need pickupFee/deliveryFee
    let details = await AdminOrderDetailsModel.findOne({})
    if (!details) { details = await AdminOrderDetailsModel.create({}); console.log('  (seeded AdminOrderDetails)') }
    let setting = await AdminSettingModel.findOne({})
    if (!setting) {
        setting = await AdminSettingModel.create({ sameDayCharge: 500, expressCharge: 200 })
        console.log('  (seeded AdminSetting)')
    }
    const serviceType = (setting.serviceTypes && setting.serviceTypes[0]?.name) || 'wash-and-iron'
    const pickupFee = setting.pickupFee || 0
    const deliveryFee = setting.deliveryFee || 0
    const bothFee = pickupFee + deliveryFee

    const plan = await PlanModel.create({
        title: `STG Logistics Plan ${ts}`,
        description: 'staging',
        duration: 'monthly',
        price: 5000,
        features: ['staging'],
        monthlyLimits: 50,
        paystackPlanCode: `STG_${ts}`,
        freePickupDeliveryPerWeek: 2,
    })
    created.planIds.push(plan._id)

    const sub = await SubscriptionModel.create({
        email: customer.email,
        userId: customer._id,
        planId: plan._id,
        status: 'active',
        startDate: new Date(),
        remainingItems: 50,
        remainingPickupDeliveries: 2,
        logisticsWeekStart: new Date(),
    })
    created.subIds.push(sub._id)

    const fundWallet = (balance) =>
        WalletModel.findOneAndUpdate({ userId: customer._id }, { $set: { balance } }, { upsert: true })

    const book = async (overflowPaymentMethod, { isPickUp = true, isDelivery = true } = {}) => {
        const payload = {
            fullName: 'SubLog Customer',
            phoneNumber: '08000000000',
            serviceType,
            serviceTier: 'classic',
            billingType: 'pay-from-subscription',
            deliverySpeed: 'standard',
            isPickUp,
            isDelivery,
            items: [{ type: 'shirt', price: 1, quantity: 1 }],
            pickupAddress: 'Test address, off Aroma',
            deliveryAddress: 'Test address, off Aroma',
            ...(overflowPaymentMethod && { overflowPaymentMethod }),
        }
        const res = await new BookOrderService().createOrder({ userId: customer._id.toString(), payload })
        if (res?.success && res.data?.order?._id) created.orderIds.push(res.data.order._id)
        return res
    }
    const reloadSub = () => SubscriptionModel.findById(sub._id)

    try {
        console.log(`\n(pickupFee ₦${pickupFee}, deliveryFee ₦${deliveryFee}, both-legs fee ₦${bothFee})`)

        // A — allowance 2, order with pickup+delivery → both free (2 legs), no fee
        console.log('\n[A] both legs within allowance → free')
        let r = await book(undefined, { isPickUp: true, isDelivery: true })
        ok(r?.success, 'order placed')
        ok(r?.data?.order?.logisticsFee === 0, 'logisticsFee is 0 (covered)')
        ok(r?.data?.order?.paymentStatus === 'success', 'covered order is SUCCESS')
        let s = await reloadSub()
        ok(s.remainingPickupDeliveries === 0, 'allowance 2 → 0 (both legs consumed separately)')

        // B — allowance 0, no method → fails asking for a method
        console.log('\n[B] allowance used up, no method → needsLogisticsPayment')
        r = await book(undefined, { isPickUp: true, isDelivery: true })
        ok(!r?.success && r?.data?.needsLogisticsPayment, 'rejected with needsLogisticsPayment')
        ok(r?.data?.logisticsFee === bothFee, `logisticsFee = ₦${bothFee} (both legs charged)`)

        // B-wallet — fund the wallet, pay the fee from it
        console.log('\n[C] pay overflow fee from WALLET')
        await fundWallet(bothFee + 1000)
        r = await book('wallet', { isPickUp: true, isDelivery: true })
        ok(r?.success, 'order placed with wallet method')
        ok(r?.data?.order?.logisticsFee === bothFee && r?.data?.order?.deliveryAmount === bothFee, 'fee recorded on order')
        ok(r?.data?.order?.paymentStatus === 'success', 'wallet-paid order is SUCCESS')
        const w = await WalletModel.findOne({ userId: customer._id })
        ok(w.balance === 1000, `wallet debited by ₦${bothFee} (→ ₦${w.balance})`)
        s = await reloadSub()
        ok(s.remainingPickupDeliveries === 0, 'allowance stays 0 (no free legs left)')

        // C-card — pay by card → order PENDING, Paystack link (if configured)
        console.log('\n[D] pay overflow fee by CARD')
        r = await book('card', { isPickUp: true, isDelivery: true })
        ok(r?.success, 'order placed with card method')
        ok(r?.data?.order?.paymentStatus === 'pending', 'card order stays PENDING until webhook')
        ok(r?.data?.order?.logisticsFee === bothFee, 'fee recorded on order')
        if (r?.logisticsPaymentUrl) ok(true, 'Paystack payment link returned')
        else console.log('  ⚠ no logisticsPaymentUrl (Paystack key/network unavailable) — order still PENDING, correct')

        // D — wallet can't cover → rollback (no order, allowance unchanged)
        console.log('\n[E] wallet insufficient → rollback')
        await fundWallet(0)
        const beforeCount = await BookOrderModel.countDocuments({ userId: customer._id })
        r = await book('wallet', { isPickUp: true, isDelivery: true })
        ok(!r?.success && r?.data?.needsLogisticsPayment, 'rejected, offered to try card')
        const afterCount = await BookOrderModel.countDocuments({ userId: customer._id })
        ok(afterCount === beforeCount, 'no order left behind (rolled back)')
        s = await reloadSub()
        ok(s.remainingPickupDeliveries === 0, 'allowance not wrongly decremented on rollback')

        // E — rolling week reset: anchor 8 days ago → next booking resets to grant
        console.log('\n[F] rolling 7-day reset')
        await SubscriptionModel.updateOne(
            { _id: sub._id },
            { $set: { logisticsWeekStart: new Date(Date.now() - 8 * 864e5), remainingPickupDeliveries: 0 } },
        )
        r = await book(undefined, { isPickUp: true, isDelivery: true })
        ok(r?.success && r?.data?.order?.logisticsFee === 0, 'new week → legs free again (fee 0)')
        s = await reloadSub()
        ok(s.remainingPickupDeliveries === 0, 'reset to 2 then consumed 2 → 0')
        const anchorDaysAgo = Math.round((Date.now() - new Date(s.logisticsWeekStart).getTime()) / 864e5)
        ok(anchorDaysAgo >= 0 && anchorDaysAgo < 7, `week anchor advanced to <7 days ago (${anchorDaysAgo}d)`)
    } finally {
        console.log('\n[cleanup]')
        const q = { userId: customer._id }
        const delOrders = await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        const delNotifs = await NotificationModel.deleteMany(q)
        const delWalletTx = await WalletTransactionModel.deleteMany(q)
        const delWallet = await WalletModel.deleteMany(q)
        const delPay = await PaymentModel.deleteMany(q)
        const delCrm = await CrmProfileModel.deleteMany({ $or: [q, { phoneNumber: '08000000000' }] })
        const delSubs = await SubscriptionModel.deleteMany({ _id: { $in: created.subIds } })
        const delPlans = await PlanModel.deleteMany({ _id: { $in: created.planIds } })
        const delUsers = await UserModel.deleteMany({ _id: { $in: created.userIds } })
        console.log(`  removed ${delOrders.deletedCount} orders, ${delNotifs.deletedCount} notifs, ${delWalletTx.deletedCount} wallet-tx, ${delWallet.deletedCount} wallets, ${delPay.deletedCount} payments, ${delCrm.deletedCount} crm, ${delSubs.deletedCount} subs, ${delPlans.deletedCount} plans, ${delUsers.deletedCount} users`)
        await mongoose.disconnect()
    }

    console.log(`\n${PASS} passed, ${FAIL} failed`)
    process.exit(FAIL ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
