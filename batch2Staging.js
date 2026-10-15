/**
 * V1 launch batch 2 (client 15 Oct 2026) — DB verification on testingdb.
 *
 *   1  Riders: failed pickup → needs rider, counted, task after 2; a collected
 *      order cannot get a pickup rider; failed deliveries → waiting redelivery,
 *      fee from the 2nd, dispatch blocked until paid; "Collected"; a delivered
 *      order's cancel tier is "none"; "Possible missing item"
 *   2  Cancel: only admin; S1 escalates; unpaid after pickup → the bill is the
 *      trips with a link; no return until paid; "Returned unwashed"
 *   3  Unpaid-bill timers from settings (test values 10 / 30 / 45 / 60 min),
 *      tasks close on payment
 *   4  Quick Booking ready date: count > 2× → worked out again; paid after the
 *      pay-by time → worked out again from the payment time
 *   5  Recount cover: within both limits → "Covered by CHUVI", no hold;
 *      mismatch recorded; old/new items + staff name saved; after the repeat
 *      limit → no cover, "Repeat mismatch"
 *   6  Quiet hours: SMS queued; CRM dispatch paused
 *   7  Assistant: "talk to someone" opens a complaint; reward credit is used by
 *      default at Pay
 *   8  FE fixes: hasComplaint in the feedback list; held pieces in the assigned
 *      station's Hold list; QC's Hold list is QC's
 *
 * SMS, email and Paystack are stubbed. testingdb settings that a check changes
 * are restored. SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production
 * without STAGING_FORCE=1; hard-refuses laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node batch2Staging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const SENT = []
const smsPath = require.resolve('./util/sendSms')
const realSms = require('./util/sendSms')
const stubSms = Object.assign(async (to, text) => SENT.push({ to, text: realSms.cleanSmsText(text) }), { cleanSmsText: realSms.cleanSmsText })
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: stubSms }
const emailPath = require.resolve('./util/emailService')
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: async () => ({ stubbed: true }) }
const clientPath = require.resolve('./services/paystack.client.service')
const PAYSTACK = { posts: 0, verify: { status: 'abandoned' } }
require.cache[clientPath] = {
    id: clientPath,
    filename: clientPath,
    loaded: true,
    exports: {
        post: async () => (PAYSTACK.posts++, { data: { status: true, data: { authorization_url: 'https://pay.stub/x', reference: 'r' } } }),
        get: async () => ({ data: { status: true, data: PAYSTACK.verify } }),
    },
}

const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const WalletModel = require('./models/wallet.model')
const AdminSettingModel = require('./models/adminSetting.model')
const CareTaskModel = require('./models/careTask.model')
const CancellationRequestModel = require('./models/cancellationRequest.model')
const QueuedSmsModel = require('./models/queuedSms.model')
const ComplaintCaseModel = require('./models/complaintCase.model')
const FeedbackModel = require('./models/feedback.model')
const NotificationModel = require('./models/notification.model')
const PaymentModel = require('./models/payment.model')
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
    const tail = String(ts).slice(-6)
    const created = { orders: [], users: [], cases: [], feedback: [], queued: [] }
    const settingsBefore = await AdminSettingModel.findOne().lean()
    const setSettings = (patch) => AdminSettingModel.updateOne({ _id: settingsBefore._id }, { $set: patch })

    const BookOrderService = require('./services/bookOrder.service')
    const RiderService = require('./services/rider.service')
    const IntakeUserService = require('./services/intake-user.service')
    const PaymentHoldService = require('./services/paymentHold.service')
    const book = new BookOrderService()
    const rider = new RiderService()
    const intake = new IntakeUserService()
    try {
        const svc = settingsBefore?.serviceTypes?.[0]
        if (!svc) {
            console.log('SKIPPED (settings unseeded).')
            return
        }
        let pn = 0
        const phone = () => `0805${tail}${++pn}`.slice(0, 11)
        const mkUser = async (userType, extra = {}) => {
            const u = await UserModel.collection.insertOne({
                fullName: `STG B2 ${userType} ${pn}`,
                email: `stg-b2-${++pn}-${ts}@example.com`,
                phoneNumber: phone(),
                userType,
                status: 'active',
                isVerified: true,
                createdAt: new Date(),
                ...extra,
            })
            created.users.push(u.insertedId)
            return { _id: u.insertedId, id: String(u.insertedId) }
        }
        const s1 = await mkUser(C.ROLE.INTAKE_AND_TAG)
        const admin = await mkUser(C.ROLE.ADMIN)
        const rd = await mkUser(C.ROLE.RIDER)
        const cust = await mkUser(C.ROLE.USER)
        const custDoc = await UserModel.findById(cust._id).lean()
        let on = 0
        const mkOrder = async (extra = {}) => {
            on++
            const r = await BookOrderModel.collection.insertOne({
                userId: cust._id,
                fullName: 'Obinna Eze',
                phoneNumber: custDoc.phoneNumber,
                amount: 8000,
                oscNumber: `STGB2-${ts}-${on}`,
                serviceType: svc.name,
                serviceTier: 'classic',
                deliverySpeed: 'standard',
                billingType: C.BILLING_TYPE.PAY_PER_ITEM,
                isPickUp: true,
                isDelivery: true,
                items: Array.from({ length: 4 }, () => ({ _id: new mongoose.Types.ObjectId(), type: 'Shirt', price: 600, quantity: 1, actionLog: [] })),
                stage: { status: C.ORDER_STATUS.PENDING, note: '', updatedAt: new Date() },
                stageHistory: [],
                stationStatus: C.STATION_STATUS.INTAKE_AND_TAG_STATION,
                paymentStatus: C.PAYMENT_ORDER_STATUS.SUCCESS,
                dispatchDetails: { pickup: { status: C.PICKUP_STATUS.SCHEDULED, rider: rd._id }, delivery: {} },
                handoffs: [],
                createdAt: new Date(),
                ...extra,
            })
            created.orders.push(r.insertedId)
            return r.insertedId
        }
        const asRider = (id, body = {}) => ({ params: { id: String(id) }, body, user: { id: rd.id } })
        const asStaff = (u, role, params = {}, body = {}, query = {}) => ({ params, body, query, user: { id: u.id, userType: role } })

        // ── 1 riders ───────────────────────────────────────────────────────
        console.log('\n1. Riders')
        const o1 = await mkOrder()
        const f1 = await rider.markPickupAsFailed(asRider(o1, { note: 'not home' }))
        let d1 = await BookOrderModel.findById(o1).lean()
        ok(f1.success && d1.dispatchDetails.pickup.status === 'failed' && !d1.dispatchDetails.pickup.rider && d1.dispatchDetails.pickup.failedAttempts === 1,
            'failed pickup → no rider (needs rider), status failed, 1 attempt counted')
        ok((await UserModel.findById(cust._id).lean()).notAvailableCount === 1, 'the failure is recorded against the customer')
        await BookOrderModel.updateOne({ _id: o1 }, { $set: { 'dispatchDetails.pickup.rider': rd._id, 'dispatchDetails.pickup.status': 'scheduled' } })
        await rider.markPickupAsFailed(asRider(o1, { note: 'not home again' }))
        const task = await CareTaskModel.findOne({ orderId: o1, type: 'failed-pickups' }).lean()
        ok(task?.status === 'open' && task.title === '2 failed pickups: call customer', 'after 2 failures a "2 failed pickups: call customer" task is open')
        const o2 = await mkOrder({ dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP, rider: rd._id }, delivery: {} } })
        const a2 = await intake.assignRiderTopPickupOrder(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o2), riderId: rd.id }))
        const d2 = await BookOrderModel.findById(o2).lean()
        ok(!a2.success && d2.dispatchDetails.pickup.status === 'picked-up', `a collected order cannot get a pickup rider (${a2.data?.error})`)

        const outForDelivery = (extra = {}) => mkOrder({
            stage: { status: C.ORDER_STATUS.OUT_FOR_DELIVERY, updatedAt: new Date() },
            dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP }, delivery: { status: C.DELIVERY_STATUS.OUT_FOR_DELIVERY, rider: rd._id } },
            ...extra,
        })
        const o3 = await outForDelivery()
        await rider.markOrderDeliveryAsFailed(asRider(o3, { note: 'not home' }))
        let d3 = await BookOrderModel.findById(o3).lean()
        ok(d3.stage.status === 'ready' && d3.dispatchDetails.delivery.status === 'failed' && !d3.dispatchDetails.delivery.rider && !(d3.dispatchDetails.delivery.redeliveryFees || []).length,
            '1st failed delivery → Ready, waiting redelivery (no rider), no fee: the first redelivery is free')
        await BookOrderModel.updateOne({ _id: o3 }, { $set: { 'stage.status': 'out-for-delivery', 'dispatchDetails.delivery.status': 'out-for-delivery', 'dispatchDetails.delivery.rider': rd._id } })
        await rider.markOrderDeliveryAsFailed(asRider(o3, { note: 'not home again' }))
        d3 = await BookOrderModel.findById(o3).lean()
        const fee = d3.dispatchDetails.delivery.redeliveryFees?.[0]?.amount
        ok(fee > 0 && d3.balanceDue === fee && d3.paymentStatus === 'pending' && d3.amount === 8000 + fee,
            `2nd failed delivery → a redelivery fee of N${fee} owed as its own line`)
        const { dispatchPaymentGate } = require('./util/paymentGate')
        ok(dispatchPaymentGate(d3).ok === false && dispatchPaymentGate(d3).redeliveryFee === true, 'the order cannot go out again until the fee is paid')
        await BookOrderModel.updateOne({ _id: o3 }, { $set: { paymentStatus: 'success' }, $unset: { balanceDue: '' } })
        await require('./util/redeliveryFee').markRedeliveryFeesPaid(o3)
        ok(dispatchPaymentGate(await BookOrderModel.findById(o3).lean()).ok === true, 'once paid it can go out')

        const o4 = await mkOrder({ isDelivery: false, stage: { status: C.ORDER_STATUS.READY, updatedAt: new Date() } })
        const c4 = await intake.markOrderAsDelivered(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o4) }, { selfPickup: true }))
        ok(c4.success && (await BookOrderModel.findById(o4).lean()).stage.status === 'collected', 'self collection ends as "Collected", not Delivered')
        const tier = book._cancelTier({ stage: { status: 'delivered' }, items: [] }, 15)
        ok(tier.tier === 'none', 'a delivered order\'s cancellation tier is "none" (FE report)')

        const notes = []
        const { raiseCountMismatchHold } = require('./util/countMismatchHold')
        const o5 = await mkOrder()
        await raiseCountMismatchHold({ order: { _id: o5, oscNumber: 'X' }, riderCount: 5, intakeCount: 4, actorId: s1.id, notifyRoles: async (n) => notes.push(n.title) })
        ok(notes.includes('Count dispute') && notes.includes('Possible missing item'), `S1 fewer than the rider → "Count dispute" and "Possible missing item" (${notes.join(', ')})`)

        // ── 2 cancel ───────────────────────────────────────────────────────
        console.log('\n2. Cancellation')
        const o6 = await mkOrder({
            quickBooking: true,
            paymentStatus: 'pending',
            amount: 5800,
            stage: { status: C.ORDER_STATUS.HOLD, updatedAt: new Date() },
            dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP }, delivery: {} },
        })
        const sc = await book.staffCancelOrder(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o6) }, { reason: 'Customer rejected bill' }))
        ok(!sc.success && sc.data?.requiresAdmin === true && sc.data?.canEscalate === true, `S1 cannot cancel (${sc.data?.error})`)
        const esc = await book.escalateCancellation(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o6) }, { reason: 'Customer rejected bill' }))
        const req6 = await CancellationRequestModel.findOne({ orderId: o6 }).lean()
        ok(esc.success && req6?.source === 'staff' && req6.status === 'pending', 'S1 escalates: the order is on admin\'s cancellation list')
        const cxApprove = await book.approveCancellationRequest(asStaff(s1, C.ROLE.CUSTOMER_EXPERIENCE, { id: String(req6._id) }, {}))
        ok(!cxApprove.success && cxApprove.data?.requiresAdmin, 'customer experience cannot approve it')
        SENT.length = 0
        const ap = await book.approveCancellationRequest(asStaff(admin, C.ROLE.ADMIN, { id: String(req6._id) }, { note: 'ok' }))
        const d6 = await BookOrderModel.findById(o6).lean()
        ok(ap.success && d6.stage.status === 'cancelled' && d6.cancellation.returnFeeDue === 2000 && d6.amount === 2000 && d6.cancellation.originalAmount === 5800,
            `admin cancels: the bill becomes the trips (N${d6.cancellation?.returnFeeDue}), the old amount kept`)
        ok(SENT.some((s) => /is cancelled\. Please pay N2,000 for pickup and delivery/.test(s.text)), 'the customer gets the N2,000 payment link by SMS')
        await BookOrderModel.updateOne({ _id: o6 }, { $set: { isDelivery: true } })
        const r6 = await intake.assignRiderTopDeliveryOrder(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o6), riderId: rd.id }))
        ok(!r6.success && r6.data?.requiresPayment, `the return cannot be scheduled before she pays (${r6.data?.error})`)
        await BookOrderModel.updateOne({ _id: o6 }, { $set: { paymentStatus: 'success' } })
        const r6b = await intake.assignRiderTopDeliveryOrder(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o6), riderId: rd.id }))
        const st6 = await rider.startDelivery(asRider(o6))
        ok(r6b.success && st6.success && (await BookOrderModel.findById(o6).lean()).stage.status === 'cancelled', 'paid → the return is assigned and started; the order stays cancelled')
        const dl6 = await rider.markOrderAsDelivered(asRider(o6))
        const e6 = await BookOrderModel.findById(o6).lean()
        ok(dl6.success && e6.stage.status === 'returned-unwashed' && e6.cancellation.returnedAt, 'handed back → "Returned unwashed"')

        // ── 3 unpaid-bill timers ───────────────────────────────────────────
        console.log('\n3. Unpaid-bill timers')
        await setSettings({ unpaidBillTimers: { firstReminderMinutes: 10, nextDayReminderHour: 9, taskMinutes: [30, 45], adminFlagMinutes: 60 } })
        const raisedAt = new Date(Date.now() - 61 * 60 * 1000)
        const o7 = await mkOrder({
            paymentStatus: 'pending',
            stage: { status: C.ORDER_STATUS.HOLD, updatedAt: raisedAt },
            orderHold: { holdTypeKey: 'payment' },
            paymentHold: { raisedAt, amount: 5000, paymentUrl: 'https://pay.stub/x', remindersSent: [] },
        })
        SENT.length = 0
        await PaymentHoldService.runReminderSweep()
        const h7 = (await BookOrderModel.findById(o7).lean()).paymentHold.remindersSent
        const tasks7 = await CareTaskModel.find({ orderId: o7 }).lean()
        ok(h7.includes('reminder-1') && h7.includes('task-1') && h7.includes('task-2') && h7.includes('admin-flag') && !h7.includes('reminder-next-day'),
            `at 61 minutes: reminder, both tasks and the admin flag; not yet the 9 AM one (${h7.join(', ')})`)
        ok(tasks7.length === 2 && tasks7.every((t) => t.title === 'Call: unpaid bill'), 'two "Call: unpaid bill" tasks for customer experience')
        ok(SENT.some((s) => /is waiting for payment of N5,000\. Pay by 12 noon/.test(s.text)), 'the reminder SMS is the client\'s text')
        await PaymentHoldService.clear({ orderId: o7, source: 'paystack' })
        ok((await CareTaskModel.countDocuments({ orderId: o7, status: 'open' })) === 0, 'paid → the tasks close by themselves')
        await setSettings({ unpaidBillTimers: settingsBefore.unpaidBillTimers || { firstReminderMinutes: 180, nextDayReminderHour: 9, taskMinutes: [1440, 4320], adminFlagMinutes: 10080 } })

        // ── 4 ready date ───────────────────────────────────────────────────
        console.log('\n4. Quick Booking ready date')
        const { recalcReadyDate, afterQuickBookingPaid } = require('./util/readyDateRecalc')
        const old = new Date('2026-01-01T19:00:00+01:00')
        const o8 = await mkOrder({ quickBooking: true, deliveryDate: old, counts: { customer: 3 }, paymentStatus: 'pending', dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP }, delivery: {} } })
        const e8 = await book.applyItemEdit(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o8) }, { items: [{ type: 'Shirt', price: 1, quantity: 7 }], reason: 'count' }))
        const d8 = await BookOrderModel.findById(o8).lean()
        ok(e8.success && d8.readyDateRecalc?.from === 'pickup' && String(d8.deliveryDate) !== String(old), 'counted 7 on a booking of 3 (more than 2×) → the ready date is worked out again')
        const o9 = await mkOrder({ quickBooking: true, deliveryDate: old, paymentHold: { raisedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000), amount: 1000 } })
        const late = await afterQuickBookingPaid(o9, new Date())
        ok(late && (await BookOrderModel.findById(o9).lean()).readyDateRecalc?.from === 'payment', 'paid after the pay-by time → worked out again from the payment time')
        const o10 = await mkOrder({ quickBooking: true, deliveryDate: old, paymentHold: { raisedAt: new Date(), amount: 1000 } })
        ok((await afterQuickBookingPaid(o10, new Date())) === null && !(await BookOrderModel.findById(o10).lean()).readyDateRecalc, 'paid before the pay-by time → the ready date is kept')
        void recalcReadyDate

        // ── 5 recount cover ────────────────────────────────────────────────
        console.log('\n5. Recount cover')
        const { roundToNearestHundred } = require('./util/helper')
        const unit = roundToNearestHundred(1 * (svc.pricePerPiece || 1))
        await setSettings({ recountCover: { percent: 100, maxAmount: unit, repeatLimit: 3, repeatDays: 60 } })
        const picked = { dispatchDetails: { pickup: { status: C.PICKUP_STATUS.PICKED_UP }, delivery: {} }, isPickUp: true }
        const o11 = await mkOrder({ ...picked, items: Array.from({ length: 10 }, () => ({ _id: new mongoose.Types.ObjectId(), type: 'Shirt', price: 1, quantity: 1, actionLog: [] })) })
        const shirts = (n) => [{ type: 'Shirt', price: 1, quantity: n }]
        await book.applyItemEdit(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o11) }, { items: shirts(10), reason: 'baseline' }))
        await BookOrderModel.updateOne({ _id: o11 }, { $set: { paymentStatus: 'success' } })
        const base = (await BookOrderModel.findById(o11).lean()).amount
        SENT.length = 0
        const e11 = await book.applyItemEdit(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o11) }, { items: shirts(11), reason: 'one more shirt' }))
        const d11 = await BookOrderModel.findById(o11).lean()
        const last = d11.itemEdits[d11.itemEdits.length - 1]
        ok(e11.success && e11.data?.message?.recountCover === unit && d11.amount === base && d11.pricing?.recountCover === unit && !d11.paymentHold?.raisedAt,
            `one more shirt within the cover → "Covered by CHUVI N${unit}", nothing to pay, no hold`)
        ok(SENT.length === 0, 'no SMS for a covered recount')
        ok(last.byName && last.previousItems?.[0]?.quantity === 10 && last.newItems?.[0]?.quantity === 11, 'the change saves the staff name, old items and new items')
        const mm = (await UserModel.findById(cust._id).lean()).recountMismatches || []
        ok(mm.length >= 1 && mm[mm.length - 1].covered === unit, 'the mismatch is recorded against the customer')
        await UserModel.updateOne({ _id: cust._id }, { $push: { recountMismatches: { $each: [{ at: new Date() }, { at: new Date() }, { at: new Date() }] } } })
        const e12 = await book.applyItemEdit(asStaff(s1, C.ROLE.INTAKE_AND_TAG, { id: String(o11) }, { items: shirts(12), reason: 'another' }))
        const d12 = await BookOrderModel.findById(o11).lean()
        ok(e12.success && e12.data?.message?.coverReason === 'repeat-limit' && d12.paymentHold?.raisedAt, 'past the repeat limit → no cover, a payment link')
        ok(await NotificationModel.exists({ title: 'Repeat mismatch', body: new RegExp(d12.oscNumber) }), 'admin alert "Repeat mismatch"')
        await setSettings({ recountCover: settingsBefore.recountCover || { percent: 10, maxAmount: 200, repeatLimit: 3, repeatDays: 60 } })

        // ── 6 quiet hours ──────────────────────────────────────────────────
        console.log('\n6. Quiet hours')
        const Q = require('./util/quietHours')
        ok(Q.isQuiet(new Date('2026-10-15T22:30:00+01:00')) && Q.isQuiet(new Date('2026-10-16T06:59:00+01:00')) && !Q.isQuiet(new Date('2026-10-16T07:00:00+01:00')),
            '9 PM to 7 AM is quiet, 7 AM is not')
        const h = new Date().getHours()
        await setSettings({ quietHours: { startHour: h, endHour: (h + 1) % 24 } })
        Q._resetCache()
        delete require.cache[smsPath]
        const sendSmsReal = require('./util/sendSms')
        const q = await sendSmsReal('08050000000', 'STG B2 quiet test — ₦100')
        require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: stubSms }
        const queued = await QueuedSmsModel.findOne({ to: '08050000000', message: /STG B2 quiet test/ }).lean()
        if (queued) created.queued.push(queued._id)
        ok(q?.queued === true && queued && queued.sendAfter > new Date() && queued.message === 'STG B2 quiet test, N100', 'an SMS in quiet hours is queued (cleaned) for when they end')
        const CrmService = require('./services/crm.service')
        ok((await CrmService.dispatchDueMessages()) === 0, 'the CRM dispatcher (feedback request included) waits in quiet hours')
        await setSettings({ quietHours: settingsBefore.quietHours || { startHour: 21, endHour: 7 } })
        Q._resetCache()

        // ── 7 assistant + reward credit ────────────────────────────────────
        console.log('\n7. Assistant and reward credit')
        const Bot = require('./services/botOrchestrator.service')
        const kase = await Bot._openHandoffCase({ _id: new mongoose.Types.ObjectId() }, cust._id)
        if (kase?._id) created.cases.push(kase._id)
        ok(kase && String(kase.userId) === cust.id, '"talk to someone" opens a complaint for customer experience, linked to the customer')
        const again = await Bot._openHandoffCase({ _id: new mongoose.Types.ObjectId() }, cust._id)
        ok(String(again?._id) === String(kase?._id), '…once, not on every request')
        const WalletCreditService = require('./services/walletCredit.service')
        await WalletCreditService.grantCredit({ userId: cust._id, type: 'promotional', amount: 300, sourceSystem: 'admin', sourceRef: `stg-b2-${ts}`, note: 'STG' })
        const o13 = await mkOrder({ paymentStatus: 'pending', amount: 1000 })
        const PaystackService = require('./services/paystack.service')
        const before = PAYSTACK.posts
        const pay = await new PaystackService().initializePayment({ body: { transactionType: 'order', orderId: String(o13) }, user: { id: cust.id } })
        const d13 = await BookOrderModel.findById(o13).lean()
        ok(pay.success && d13.balanceDue === 700 && PAYSTACK.posts === before + 1, 'Pay uses reward credit by default: N300 credit, the link asks for N700')
        const o14 = await mkOrder({ paymentStatus: 'pending', amount: 1000 })
        await new PaystackService().initializePayment({ body: { transactionType: 'order', orderId: String(o14), useCredit: false }, user: { id: cust.id } })
        ok(!(await BookOrderModel.findById(o14).lean()).balanceDue, 'switched off → no credit used')

        // ── 8 FE fixes ─────────────────────────────────────────────────────
        console.log('\n8. Frontend fixes')
        const o15 = await mkOrder({ stage: { status: 'delivered', updatedAt: new Date() } })
        const fb = await FeedbackModel.create({ userId: cust._id, orderId: o15, rating: 2, comment: 'late', type: 'complaint' }).catch(async () =>
            FeedbackModel.create({ userId: cust._id, orderId: o15, rating: 2, comment: 'late' }),
        )
        created.feedback.push(fb._id)
        const kase2 = await ComplaintCaseModel.create({ userId: cust._id, orderId: o15, complaintTypeId: kase?.complaintTypeId, description: 'late', status: 'submitted' })
        created.cases.push(kase2._id)
        const FeedbackService = require('./services/feedback.service')
        const fs1 = new FeedbackService()
        const list = await fs1.listFeedback({ query: { rating: '2', limit: 50 } })
        const row = list.data?.message?.data?.find((r) => String(r._id) === String(fb._id))
        ok(row?.hasComplaint === true, 'the feedback list shows hasComplaint for an order with a complaint')
        const o16 = await mkOrder({
            stage: { status: 'ironing', updatedAt: new Date() },
            stationStatus: C.STATION_STATUS.QC_STATION,
            items: [{ _id: new mongoose.Types.ObjectId(), type: 'Shirt', price: 1, quantity: 1, tagId: 'T5', currentStation: C.STATION_STATUS.PRESSING_AND_IRONING_STATION, actionLog: [],
                flaggedForReview: true, holdDetails: { reason: 'quality_not_met', note: 'not pressed well', assignTo: C.ROLE.PRESS, heldAt: new Date(), heldByStation: C.STATION_STATUS.QC_STATION } }],
        })
        const press = require('./services/pressAndIron.service')
        const pressList = await press.getHoldQueue({ user: { id: s1.id }, query: { limit: 100 } })
        const pressRows = JSON.stringify(pressList.data?.message || {})
        ok(pressList.success && pressRows.includes(String(o16)), 'a piece QC sent back to S4 shows in S4\'s Hold list')
        const pressSearch = await press.getHoldQueue({ user: { id: s1.id }, query: { limit: 100, search: 'STGB2' } })
        ok(pressSearch.success && JSON.stringify(pressSearch.data?.message || {}).includes(String(o16)) && !JSON.stringify(pressSearch.data?.message || {}).includes(String(o4)),
            'a search keeps the hold filter (a finished order is not listed)')
        void PaymentModel
    } finally {
        await AdminSettingModel.updateOne(
            { _id: settingsBefore._id },
            {
                $set: {
                    unpaidBillTimers: settingsBefore.unpaidBillTimers,
                    recountCover: settingsBefore.recountCover,
                    quietHours: settingsBefore.quietHours,
                },
            },
        ).catch(() => {})
        const tidy = ['activity.model', 'audit.log.model', 'payment.model', 'walletTransaction.model', 'walletCredit.model']
        for (const m of tidy) {
            try {
                const M = require(`./models/${m}`)
                await M.deleteMany({ $or: [{ orderId: { $in: created.orders } }, { order: { $in: created.orders } }, { userId: { $in: created.users } }, { relatedOrderId: { $in: created.orders } }] })
            } catch {}
        }
        await NotificationModel.deleteMany({ $or: [{ userId: { $in: created.users } }, { body: new RegExp(`STGB2-${ts}`) }] }).catch(() => {})
        await CareTaskModel.deleteMany({ orderId: { $in: created.orders } })
        await CancellationRequestModel.deleteMany({ orderId: { $in: created.orders } })
        await ComplaintCaseModel.deleteMany({ $or: [{ _id: { $in: created.cases } }, { userId: { $in: created.users } }] })
        try {
            await require('./models/conversation.model').deleteMany({ userId: { $in: created.users } })
        } catch {}
        await FeedbackModel.deleteMany({ _id: { $in: created.feedback } })
        await QueuedSmsModel.deleteMany({ $or: [{ _id: { $in: created.queued } }, { message: /STG B2/ }] })
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        await WalletModel.deleteMany({ userId: { $in: created.users } })
        await UserModel.deleteMany({ _id: { $in: created.users } })
        await mongoose.disconnect()
        console.log(`batch2Staging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
    }
}

main().then(
    () => process.exit(FAIL ? 1 : 0),
    (e) => {
        console.error(e)
        process.exit(1)
    },
)
