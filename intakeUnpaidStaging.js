/**
 * Intake sees a picked-up UNPAID order — DB verification on testingdb.
 *
 * Before: Intake's pending list required payment, so a bag a rider brought in
 * for an unpaid order sat in no Intake list and could never move.
 *
 * Scenarios:
 *   1  picked-up unpaid order   → on Intake's pending list, flagged awaitingPayment
 *   2  the dashboard card       → equals the list total
 *   3  paid online order, not yet picked up → still listed (unchanged)
 *   4  unpaid online order, not yet picked up → not listed (the bag isn't here)
 *   5  Quick Booking still to count → not listed (it has its own queue)
 *   6  receive it               → moves to the tagging queue
 *   7  tag it                   → refused until paid (payment checked AT tagging)
 *   8  raise the payment hold   → hold raised with a payment link
 *   9  once paid                → tagging opens
 *
 * SMS / Paystack stubbed. SAFETY: refuses unless STAGING_OK=1; refuses
 * NODE_ENV=production without STAGING_FORCE=1; hard-refuses laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node intakeUnpaidStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: async () => ({ stubbed: true }) }
const paystackClientPath = require.resolve('./services/paystack.client.service')
require.cache[paystackClientPath] = {
    id: paystackClientPath, filename: paystackClientPath, loaded: true,
    exports: { post: async (url, body) => ({ data: { status: true, data: { authorization_url: 'https://checkout.paystack.com/stub', reference: body?.reference } } }), get: async () => ({ data: {} }) },
}
const mongoose = require('mongoose')
const UserModel = require('./models/user.model')
const BookOrderModel = require('./models/bookOrder.model')
const IntakeUserService = require('./services/intake-user.service')
const PaymentHoldService = require('./services/paymentHold.service')
const { itemTagGate } = require('./util/paymentGate')
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
    const users = []
    const orderIds = []
    try {
        const customer = await UserModel.create({ email: `iu${ts}@example.com`, fullName: 'Unpaid Customer', phoneNumber: `0803${String(ts).slice(-7)}`, userType: C.ROLE.USER, status: 'active', isVerified: true })
        const staff = await UserModel.create({ email: `iustaff${ts}@example.com`, fullName: 'Intake Staff', phoneNumber: `0805${String(ts).slice(-7)}`, userType: C.ROLE.INTAKE_AND_TAG, status: 'active', isVerified: true })
        users.push(customer._id, staff._id)
        const intake = new IntakeUserService()
        const base = (tag, extra) => ({
            fullName: 'Unpaid Customer', phoneNumber: customer.phoneNumber, userId: customer._id,
            serviceType: C.ORDER_SERVICE_TYPE.WASH_AND_IRON, serviceTier: C.SERVICE_TIERS.CLASSIC, deliverySpeed: C.DELIVERY_SPEED.STANDARD,
            channel: C.ORDER_CHANNEL.WEBSITE, amount: 4500, oscNumber: `OSC-IU${ts}-${tag}`, isPickUp: true, isDelivery: true,
            pickupAddress: { label: 'Home', address: '7 Marine Road', landmark: 'Opposite the blue mosque' },
            deliveryAddress: { label: 'Home', address: '7 Marine Road', landmark: 'Opposite the blue mosque' },
            stage: { status: C.ORDER_STATUS.PENDING },
            items: [1, 2, 3].map(() => ({ type: 'shirts-/-tops-/-blouses', quantity: 1, price: 1500 })),
            ...extra,
        })
        const mk = async (tag, extra) => {
            const o = await BookOrderModel.create(base(tag, extra))
            orderIds.push(o._id)
            return o
        }
        const unpaidHere = await mk('A', { paymentStatus: C.PAYMENT_ORDER_STATUS.PENDING, dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP } } })
        const paidComing = await mk('B', { paymentStatus: C.PAYMENT_ORDER_STATUS.SUCCESS, dispatchDetails: { pickup: { status: C.PICKUP_STATUS.SCHEDULED } } })
        const unpaidComing = await mk('C', { paymentStatus: C.PAYMENT_ORDER_STATUS.PENDING, dispatchDetails: { pickup: { status: C.PICKUP_STATUS.SCHEDULED } } })
        const qbHere = await mk('D', { paymentStatus: C.PAYMENT_ORDER_STATUS.PENDING, quickBooking: true, itemsPending: true, amount: 0, dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP } } })

        const list = async () => (await intake.getPendingOrders({ query: { page: 1, limit: 1000 } })).data.message
        const L = await list()
        const has = (o) => L.data.find((x) => String(x._id) === String(o._id))

        console.log('\n[1–5] Who is on Intake\'s pending list')
        ok(!!has(unpaidHere) && has(unpaidHere).awaitingPayment === true && has(unpaidHere).paymentHoldRaised === false, 'a picked-up UNPAID order is listed, flagged awaitingPayment (no hold yet)')
        const dash = (await intake.intakeDashboard({ user: { id: String(staff._id) } })).data.message
        ok(dash.pendingOrders === L.pagination.total, `the dashboard card equals the list (${dash.pendingOrders} = ${L.pagination.total})`)
        ok(!!has(paidComing) && has(paidComing).awaitingPayment === false, 'a paid online order not yet picked up is still listed')
        ok(!has(unpaidComing), 'an unpaid online order not yet picked up is not listed (the bag isn\'t here)')
        ok(!has(qbHere), 'a Quick Booking still to be counted is not listed (its own queue)')
        const qbQueue = (await intake.getQuickBookingQueue({ query: { page: 1, limit: 1000 } })).data.message
        ok((qbQueue.data || []).some((x) => String(x._id) === String(qbHere._id)), '…and it is on the Quick Booking queue')

        console.log('\n[6–9] Receive, tag, payment hold, pay')
        const recv = await intake.proceedToTag({ params: { id: String(unpaidHere._id) }, user: { id: String(staff._id) }, body: {} })
        ok(recv.success && (await BookOrderModel.findById(unpaidHere._id).lean()).stage.status === C.ORDER_STATUS.QUEUE, `received into the tagging queue (${recv.data?.error || 'ok'})`)
        const tag = await intake.generateAllTags({ params: { id: String(unpaidHere._id) }, user: { id: String(staff._id) }, body: {}, query: {} })
        ok(!tag.success && tag.data?.requiresPayment === true, `tagging is refused until paid ("${String(tag.data?.error || '').slice(0, 60)}…")`)
        const hold = await PaymentHoldService.raise({ orderId: String(unpaidHere._id), actorId: String(staff._id) })
        const afterHold = await BookOrderModel.findById(unpaidHere._id).lean()
        ok(hold.success && afterHold.paymentHold?.raisedAt, `the payment hold is raised${afterHold.paymentHold?.paymentUrl ? ' with a payment link' : ''} (${hold.data?.error || 'ok'})`)
        const L2 = await list()
        ok(!L2.data.some((x) => String(x._id) === String(unpaidHere._id)), 'once received it leaves the pending list (it is in the tagging queue)')
        await BookOrderModel.updateOne({ _id: unpaidHere._id }, { $set: { paymentStatus: C.PAYMENT_ORDER_STATUS.SUCCESS } })
        ok(itemTagGate(await BookOrderModel.findById(unpaidHere._id).lean()).ok === true, 'once paid, the tagging gate opens')
    } finally {
        await BookOrderModel.deleteMany({ _id: { $in: orderIds } })
        await UserModel.deleteMany({ _id: { $in: users } })
        console.log(`\nintakeUnpaidStaging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
        await mongoose.disconnect()
    }
}

main().catch(async (e) => {
    console.error('STAGING ERROR', e.message)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
})
