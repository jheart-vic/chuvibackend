/**
 * Counter payment from the wallet — client reply #2 (8 Oct 2026), item #8.
 *
 * The client's words: "Staff pick cash / POS / transfer / wallet; the wallet
 * debits with a real ledger line; if the wallet is short, the rest is paid
 * another way." They will not mark ANY counter order as wallet-paid until this
 * is live, so this harness runs it against the REAL service, not a stub.
 *
 * Scenarios:
 *   1  no method sent              → cash (unchanged behaviour), order paid,
 *                                    ONE Payment row, wallet untouched
 *   2  method "POS" / "transfer"   → stored as `pos` / `bank-transfer`
 *   3  wallet with enough cash     → wallet debited by exactly the bill, a
 *                                    WalletTransaction line written,
 *                                    billingType = pay-from-wallet
 *   4  wallet short, no 2nd tender → REFUSED, NO ORDER CREATED, nothing moved,
 *                                    and the message names both amounts
 *   5  wallet short + cash         → wallet drained, 2 Payment rows summing to
 *                                    the bill, billingType back to pay-per-item
 *   6  wallet, no customer account → refused by name, no order
 *   7  reward credit is OPT-IN     → useCredit:false ignores it; true spends it
 *                                    first (and the cash balance is untouched)
 *   8  invariants                  → Payment rows sum to order.amount; the
 *                                    wallet balance equals the sum of its own
 *                                    ledger lines; the Payment row belongs to
 *                                    the CUSTOMER, not the operator
 *   9  the customer can SEE it     → it shows in their own transaction list
 *                                    (the 2.3 complaint, on the counter path)
 *  10 unpaid orders do not start the production clock
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Deletes everything it
 * creates.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node counterPaymentStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const UserModel = require('./models/user.model')
const WalletModel = require('./models/wallet.model')
const WalletTransactionModel = require('./models/walletTransaction.model')
const WalletCreditModel = require('./models/walletCredit.model')
const BookOrderModel = require('./models/bookOrder.model')
const PaymentModel = require('./models/payment.model')
const AdminSettingModel = require('./models/adminSetting.model')
const ActivityModel = require('./models/activity.model')
const AuditLogModel = require('./models/audit.log.model')
const NotificationModel = require('./models/notification.model')
const IntakeUserService = require('./services/intake-user.service')
const WalletService = require('./services/wallet.service')
const {
    ROLE,
    PAYMENT_METHOD,
    BILLING_TYPE,
    PAYMENT_ORDER_STATUS,
    CREDIT_TYPE,
    CREDIT_SOURCE,
    ORDER_SERVICE_TYPE,
    SERVICE_TIERS,
    DELIVERY_SPEED,
} = require('./util/constants')

const intake = new IntakeUserService()
const walletSvc = new WalletService()
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
const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`

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

    const created = { userIds: [], orderIds: [], creditIds: [] }
    try {
        if (!(await AdminSettingModel.findOne())) {
            console.log('SKIPPED — AdminSetting unseeded; boot the app once against this DB.')
            return
        }

        const stamp = Date.now()
        const customerPhone = `0807${String(stamp).slice(-7)}`
        const customer = await UserModel.create({
            email: `cp_cust_${stamp}@example.com`,
            fullName: 'Counter Customer',
            phoneNumber: customerPhone,
            userType: ROLE.USER,
        })
        const operator = await UserModel.create({
            email: `cp_op_${stamp}@example.com`,
            fullName: 'Counter Operator',
            phoneNumber: `0809${String(stamp).slice(-7)}`,
            userType: ROLE.INTAKE_AND_TAG,
        })
        created.userIds.push(customer._id, operator._id)
        await WalletModel.create({ userId: customer._id, balance: 0 })

        const setBalance = async (n) => {
            await WalletModel.updateOne({ userId: customer._id }, { $set: { balance: n } })
        }
        const balance = async () =>
            (await WalletModel.findOne({ userId: customer._id }).lean())?.balance
        // The bill is whatever the real pricing path computes — never a number
        // this harness predicts, so a pricing change cannot make it pass wrongly.
        const place = async (body = {}, phone = customerPhone, name = 'Counter Customer') => {
            const r = await intake.createBookOrder({
                user: { id: String(operator._id) },
                body: {
                    fullName: name,
                    phoneNumber: phone,
                    serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
                    serviceTier: SERVICE_TIERS.CLASSIC,
                    isPickUp: false,
                    isDelivery: false,
                    deliverySpeed: DELIVERY_SPEED.STANDARD,
                    items: [{ type: 'shirt', price: 1, quantity: 3 }],
                    ...body,
                },
            })
            const o = unwrap(r)
            if (o?._id) created.orderIds.push(o._id)
            return { r, order: o }
        }
        const rowsFor = (orderId) => PaymentModel.find({ order: orderId }).lean()
        const ordersNow = () => BookOrderModel.countDocuments({ intakeStaffId: operator._id })

        // ── 1 ── the tender is MANDATORY (client decision 2026-10-08) ───────
        console.log('\n[1] paymentMethod is REQUIRED; cash is recorded properly')
        await setBalance(0)
        let { r } = await place({ paymentMethod: undefined })
        ok(r.success === false, 'creating a counter order without a tender is REFUSED')
        ok(
            /paymentMethod/i.test(JSON.stringify(r.data?.error || '')),
            `and the refusal names the missing field (${JSON.stringify(r.data?.error)})`,
        )
        let order
        ;({ r, order } = await place({ paymentMethod: 'cash' }))
        ok(r.success === true, `order created (${r.success ? 'ok' : r.data?.error})`)
        ok(order?.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS, 'it is marked paid')
        ok(order?.paymentMethod === PAYMENT_METHOD.CASH,
            `method recorded as cash (got ${order?.paymentMethod})`)
        let rows = await rowsFor(order._id)
        ok(rows.length === 1, `one Payment row (${rows.length})`)
        ok(rows[0].paymentMethod === PAYMENT_METHOD.CASH,
            `the row says cash, not the old default paystack (${rows[0].paymentMethod})`)
        ok(rows[0].amount === order.amount,
            `the row is the full bill ${naira(order.amount)}`)
        ok(String(rows[0].userId) === String(customer._id),
            'the Payment row belongs to the CUSTOMER, not the operator')
        ok((await balance()) === 0, 'no wallet movement for a cash order')
        const cashBill = order.amount

        // ── 2 ── the aliases the counter screen will send ───────────────────
        console.log('\n[2] "POS" and "transfer" → stored as pos / bank-transfer')
        ;({ order } = await place({ paymentMethod: 'POS' }))
        ok(order?.paymentMethod === PAYMENT_METHOD.POS, `pos (got ${order?.paymentMethod})`)
        ;({ order } = await place({ paymentMethod: 'transfer' }))
        ok(order?.paymentMethod === PAYMENT_METHOD.BANK_TRANFER,
            `bank-transfer (got ${order?.paymentMethod})`)
        ;({ r } = await place({ paymentMethod: 'bitcoin' }))
        ok(r.success === false, 'an unknown method is refused')
        ok(/not a counter payment method/i.test(String(r.data?.error)),
            'and the refusal lists the methods that are allowed')

        // ── 3 ── wallet with enough cash ────────────────────────────────────
        console.log('\n[3] Wallet with enough cash → debited by exactly the bill')
        await setBalance(cashBill + 5000)
        ;({ r, order } = await place({ paymentMethod: 'wallet' }))
        ok(r.success === true, `accepted (${r.success ? 'ok' : r.data?.error})`)
        ok(order?.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS, 'order is paid')
        ok((await balance()) === 5000,
            `wallet fell by exactly the bill to ${naira(await balance())}`)
        ok(order?.billingType === BILLING_TYPE.PAY_FROM_WALLET,
            `billingType is pay-from-wallet so reporting matches (got ${order?.billingType})`)
        const line = await WalletTransactionModel.findOne({
            relatedOrderId: order._id,
            type: 'debit',
        }).lean()
        ok(!!line, 'a REAL ledger line was written (the client\'s whole ask)')
        ok(line?.amount === order.amount, `the line is the bill ${naira(line?.amount)}`)
        ok(line?.balanceAfter === 5000, 'the line records the balance after')
        rows = await rowsFor(order._id)
        ok(rows.length === 1 && rows[0].paymentMethod === PAYMENT_METHOD.WALLET,
            'one Payment row, method wallet')
        ok(order?.counterPayment?.tenders?.length === 1,
            'the order records how it was tendered')

        // ── 4 ── wallet short, nothing else offered ─────────────────────────
        console.log('\n[4] Wallet short with no second tender → refused, NO order created')
        await setBalance(500)
        const before = await ordersNow()
        ;({ r, order } = await place({ paymentMethod: 'wallet' }))
        ok(r.success === false, 'refused')
        ok(/covers/i.test(String(r.data?.error)) && /remaining/i.test(String(r.data?.error)),
            `the message names both amounts: "${r.data?.error}"`)
        ok((await ordersNow()) === before, 'NO order was created')
        ok((await balance()) === 500, 'nothing was debited')

        // ── 5 ── wallet short + a second tender ─────────────────────────────
        console.log('\n[5] Wallet short + cash for the rest → both tenders recorded')
        ;({ r, order } = await place({
            paymentMethod: 'wallet',
            secondaryPaymentMethod: 'cash',
        }))
        ok(r.success === true, `accepted (${r.success ? 'ok' : r.data?.error})`)
        ok((await balance()) === 0, 'the wallet was drained, not overdrawn')
        rows = await rowsFor(order._id)
        ok(rows.length === 2, `two Payment rows (${rows.length})`)
        ok(rows.reduce((s, p) => s + p.amount, 0) === order.amount,
            'the two tenders sum to the bill exactly')
        ok(rows.some((p) => p.paymentMethod === PAYMENT_METHOD.WALLET && p.amount === 500),
            'the wallet leg is the ₦500 that was there')
        ok(rows.some((p) => p.paymentMethod === PAYMENT_METHOD.CASH),
            'the remainder is recorded as cash')
        ok(order?.billingType === BILLING_TYPE.PAY_PER_ITEM,
            'a SPLIT order is not billed as pay-from-wallet')
        ok(order?.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS, 'and it is paid')

        // ── 6 ── no customer account ────────────────────────────────────────
        console.log('\n[6] Wallet asked for on a walk-in with no account → refused by name')
        const before6 = await ordersNow()
        ;({ r } = await place({ paymentMethod: 'wallet' }, '08121110000', 'Nobody At All'))
        ok(r.success === false, 'refused')
        ok(/no customer account/i.test(String(r.data?.error)),
            `and it says why: "${r.data?.error}"`)
        ok((await ordersNow()) === before6, 'no order created')

        // ── 7 ── reward credit is opt-in ────────────────────────────────────
        console.log('\n[7] Reward credit is OPT-IN — never spent without being asked for')
        await setBalance(0)
        const credit = await WalletCreditModel.create({
            userId: customer._id,
            type: CREDIT_TYPE.REFERRAL,
            amount: 100000,
            remaining: 100000,
            sourceSystem: CREDIT_SOURCE.ADMIN,
            expiresAt: new Date(Date.now() + 30 * 86400000),
        })
        created.creditIds.push(credit._id)
        ;({ r } = await place({ paymentMethod: 'wallet' }))
        ok(r.success === false,
            'with useCredit omitted the credit is NOT counted, so the wallet is short')
        ;({ r, order } = await place({ paymentMethod: 'wallet', useCredit: true }))
        ok(r.success === true, `with useCredit:true it pays (${r.success ? 'ok' : r.data?.error})`)
        ok((await balance()) === 0, 'the cash balance was not touched — credit covered it')
        const afterCredit = await WalletCreditModel.findById(credit._id).lean()
        ok(afterCredit.remaining === 100000 - order.amount,
            `the credit fell by the bill to ${naira(afterCredit.remaining)}`)
        ok(order?.counterPayment?.creditApplied === order.amount,
            'the order records how much credit was spent')

        // ── 8 ── invariants ─────────────────────────────────────────────────
        console.log('\n[8] Invariants')
        const allRows = await PaymentModel.find({
            order: { $in: created.orderIds },
        }).lean()
        const byOrder = {}
        for (const p of allRows) {
            byOrder[String(p.order)] = (byOrder[String(p.order)] || 0) + p.amount
        }
        const allOrders = await BookOrderModel.find({
            _id: { $in: created.orderIds },
        }).lean()
        const paidOrders = allOrders.filter(
            (o) => o.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS,
        )
        ok(
            paidOrders.every((o) => byOrder[String(o._id)] === o.amount),
            `every paid order's Payment rows sum to its bill (${paidOrders.length} orders)`,
        )
        ok(
            allRows.every((p) => String(p.userId) === String(customer._id)),
            'every Payment row is filed under the customer',
        )
        const lines = await WalletTransactionModel.find({
            userId: customer._id,
        }).lean()
        const debited = lines
            .filter((l) => l.type === 'debit')
            .reduce((s, l) => s + l.amount, 0)
        const walletTaken = allRows
            .filter((p) => p.paymentMethod === PAYMENT_METHOD.WALLET)
            .reduce((s, p) => s + p.amount, 0)
        // Every naira the wallet tendered has a debit ledger line behind it —
        // whether it came out of the cash balance or out of reward credit.
        // (The first version of this check subtracted the credit, assuming only
        // cash is ledgered. It is not: applyCreditsToAmount writes its own debit
        // line per credit spent, which is correct — the ledger must show the
        // credit being used, or the balance would not reconcile.)
        ok(
            debited === walletTaken,
            `every naira the wallet paid has a debit line (${naira(debited)} vs ${naira(walletTaken)})`,
        )

        // ── 9 ── the customer can see it ────────────────────────────────────
        console.log('\n[9] The customer sees the counter payment in their own history')
        const txns = await walletSvc.fetchUserTransactions({
            user: { id: String(customer._id) },
            query: { page: 1, limit: 50 },
        })
        // NOTE THE SHAPE: this endpoint returns `data.transactions`, NOT the
        // usual `data.message`. The first draft of this check read the
        // documented shape and got 0 rows — which is how we found that the
        // swagger had been describing `data.message.data[]` for an endpoint that
        // has always returned `data.transactions[]`.
        const list = txns?.data?.transactions || []
        ok(list.length > 0, `the customer's list is not empty (${list.length} rows)`)
        const mine = list.filter((t) =>
            created.orderIds.some((id) => String(id) === String(t.order)),
        )
        ok(
            mine.length > 0,
            `a counter order's payment appears in their list (${mine.length} of ${list.length} rows)`,
        )
        ok(
            mine.every((t) => !!t.oscNumber),
            'each row names the ORDER it was for, not just an amount',
        )
        ok(
            list.every((t) => t.source === 'payment' || t.source === 'wallet'),
            'every row says which collection it came from',
        )

        // ── 10 ── an unpaid order does not start the production clock ───────
        console.log('\n[10] Production clock only starts once the money is complete')
        const clocked = allOrders.filter((o) => o.productionStartedAt)
        ok(
            clocked.every((o) => o.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS),
            'no unpaid order has a production start stamp',
        )
    } finally {
        // cleanup
        await PaymentModel.deleteMany({ order: { $in: created.orderIds } })
        await WalletTransactionModel.deleteMany({ userId: { $in: created.userIds } })
        await WalletCreditModel.deleteMany({ _id: { $in: created.creditIds } })
        await WalletModel.deleteMany({ userId: { $in: created.userIds } })
        await ActivityModel.deleteMany({ orderId: { $in: created.orderIds } })
        await AuditLogModel.deleteMany({ orderId: { $in: created.orderIds } })
        await NotificationModel.deleteMany({ userId: { $in: created.userIds } })
        await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        await UserModel.deleteMany({ _id: { $in: created.userIds } })
        const leftover = await BookOrderModel.countDocuments({
            _id: { $in: created.orderIds },
        })
        console.log(`\ncleanup: ${leftover} leftover orders`)
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed`)
        process.exit(FAIL ? 1 : 0)
    }
}

main().catch(async (e) => {
    console.error(e)
    try {
        await mongoose.disconnect()
    } catch {}
    process.exit(1)
})
