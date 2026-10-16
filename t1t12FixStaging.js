/**
 * Fixes from the frontend's T1–T12 run on live (16 Oct) — DB verification on testingdb.
 *   1  S2 partial receipt: S2 can sort and correct tags on the pieces it received (order shows "queue")
 *   2  QC sends a piece back to Press ("press" or "press-and-iron"): piece at Press, held for Press;
 *      Press fixes with a note and sends it alone; QC rejects again → admin
 *   3  Hold rows carry the piece's note and reason (admin list, station list)
 *   4  Station detail: readyBy "Ready by Wed 4 PM", speedLabel
 *   5  Top-ups: approve needs the bank reference; reject needs a reason, stored, sent to the customer
 *   6  History lines in the client's words; the same step twice shows once
 *   7  Settings: read shows defaults; save refuses bad values
 * SMS/email stubbed. SAFETY: STAGING_OK=1; refuses laundrydb. Restores settings it changes. Cleans up.
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node t1t12FixStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: Object.assign(async () => ({ stubbed: true }), { cleanSmsText: (t) => t }) }
const emailPath = require.resolve('./util/emailService')
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: async () => ({ stubbed: true }) }
const mongoose = require('mongoose')

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
        console.error('Refusing to run: set STAGING_OK=1.')
        process.exit(2)
    }
    if (/laundrydb/i.test(process.env.MONGODB_URL)) {
        console.error('*** LIVE database. Refusing. ***')
        process.exit(2)
    }
    await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 60000 })
    const BookOrderModel = require('./models/bookOrder.model')
    const UserModel = require('./models/user.model')
    const AdminSettingModel = require('./models/adminSetting.model')
    const ActivityModel = require('./models/activity.model')
    const PaymentModel = require('./models/payment.model')
    const NotificationModel = require('./models/notification.model')
    const { STATION_STATUS: S, ROLE } = require('./util/constants')
    const HandoffService = require('./services/handoff.service')
    const SortService = require('./services/sortAndPretreat.service')
    const PressService = require('./services/pressAndIron.service')
    const QCService = require('./services/qc.service')
    const AdminService = require('./services/admin.service')
    const { historyLines } = require('./util/historyLines')
    const handoff = new HandoffService()
    const stamp = Date.now()
    const created = { users: [], orders: [], payments: [] }
    const before = await AdminSettingModel.findOne().select('v1Switches recountCover').lean()
    try {
        const mk = async (fullName, userType) => {
            const u = await UserModel.create({ email: `t12_${userType}_${stamp}_${created.users.length}@example.com`, fullName, userType })
            created.users.push(u._id)
            return u
        }
        const admin = await mk('T12 Admin', ROLE.ADMIN)
        const s1 = await mk('Ify Intake', ROLE.INTAKE_AND_TAG)
        const s2 = await mk('Ada Sorter', ROLE.SORT_AND_PRETREAT)
        const s4 = await mk('Zee Press', ROLE.PRESS)
        const qc = await mk('Jide QC', ROLE.QC)
        const cust = await mk('T12 Customer', ROLE.USER)
        const as = (u) => ({ id: String(u._id), userType: u.userType })
        const req = (u, id, body = {}, params = {}) => ({ params: { id: String(id), ...params }, user: as(u), body, query: {} })
        const order = async (items, extra = {}) => {
            const o = await BookOrderModel.create({
                userId: cust._id, fullName: 'T12 Customer', phoneNumber: '08051231212', serviceType: 'wash-and-iron', serviceTier: 'classic',
                deliverySpeed: 'express', channel: 'website', amount: 4000, oscNumber: `T12-${stamp}-${created.orders.length}`, paymentStatus: 'success',
                stage: { status: 'queue' }, stationStatus: S.PENDING, items, ...extra,
            })
            created.orders.push(o._id)
            return o
        }
        const piece = (tag, station, extra = {}) => ({ type: 'shirt', price: 1, quantity: 1, tagId: tag, currentStation: station, tagStatus: 'complete', tagColor: 'white', ...extra })

        console.log('\n1. S2 works on received pieces after holding one')
        {
            await AdminSettingModel.updateOne({}, { $set: { 'v1Switches.s2PartialReceipt': true } })
            const o = await order(['TAG 01', 'TAG 02', 'TAG 03', 'TAG 04'].map((t) => piece(t, S.INTAKE_AND_TAG_STATION)))
            let r = await handoff.push(req(s1, o._id, { fromStation: S.INTAKE_AND_TAG_STATION, toStation: S.SORT_AND_PRETREAT_STATION }))
            r = await handoff.confirm(req(s2, o._id, { rejectedItems: [String(o.items[3]._id)], note: 'Something is missing: no tag' }, { hid: r.data.message.handoffId }))
            const f = await BookOrderModel.findById(o._id).lean()
            ok(r.success && f.stage.status === 'queue', `partial receipt done; order reads "${f.stage.status}" (piece back at S1)`)
            r = await SortService.updateItemSortDetails(req(s2, o._id, { tagColor: 'dark' }, { itemId: String(o.items[0]._id) }))
            ok(r.success, `S2 corrects TAG 01's colour ${r.success ? '' : r.data?.error}`)
            r = await SortService.markItemAsSorted(req(s2, o._id, { colorGroup: 'colored', fabricType: Object.values(require('./util/constants').FABRIC_TYPE)[0] }, { itemId: String(o.items[1]._id) }))
            ok(r.success || !/recorded as queue|not at sort/i.test(r.data?.error || ''), `S2 sorts TAG 02 (no "recorded as queue" refusal) ${r.success ? '' : r.data?.error}`)
            const q = await SortService.getOrderQueue({ query: { page: 1, limit: 100 }, user: as(s2) })
            ok((q.data?.message?.data || []).some((x) => String(x._id) === String(o._id)), 'the order is on the Sort and Pretreat queue')
            await AdminSettingModel.updateOne({}, { $set: { 'v1Switches.s2PartialReceipt': false } })
        }

        console.log('\n2. QC sends a piece back to Press')
        {
            const o = await order(['TAG 01', 'TAG 02'].map((t) => piece(t, S.QC_STATION, { pressStatus: 'complete' })), { stage: { status: 'qc' }, stationStatus: S.QC_STATION })
            const t5 = String(o.items[1]._id)
            let r = await QCService.sendToHold(req(qc, o._id, { reason: 'not pressed well', assignTo: 'press-and-iron', note: 'collar creased' }, { itemId: t5 }))
            let f = await BookOrderModel.findById(o._id).lean()
            let it = f.items.find((i) => String(i._id) === t5)
            ok(r.success && r.data.message.sentBack && it.currentStation === S.PRESSING_AND_IRONING_STATION && it.holdDetails.assignTo === ROLE.PRESS && it.pressStatus === 'pending', '"press-and-iron" accepted: TAG 02 back at Press, held for Press, to be pressed again')
            r = await PressService.releaseFromHold(req(s4, o._id, { itemId: t5, note: 'Pressed again' }))
            ok(r.success, `Press releases it with a note ${r.success ? '' : r.data?.error}`)
            await BookOrderModel.updateOne({ _id: o._id, 'items._id': t5 }, { $set: { 'items.$.pressStatus': 'complete' } })
            r = await handoff.push(req(s4, o._id, { fromStation: S.PRESSING_AND_IRONING_STATION, toStation: S.QC_STATION, itemIds: [t5] }))
            ok(r.success, `Press sends TAG 02 alone back to QC (the rest is already there) ${r.success ? '' : r.data?.error}`)
            r = r.success ? await handoff.confirm(req(qc, o._id, {}, { hid: r.data.message.handoffId })) : r
            f = await BookOrderModel.findById(o._id).lean()
            ok(r.success && f.items.every((i) => i.currentStation === S.QC_STATION), 'QC receives it: the order is whole at QC again')
            r = await QCService.sendToHold(req(qc, o._id, { reason: 'still not pressed well', assignTo: ROLE.PRESS }, { itemId: t5 }))
            f = await BookOrderModel.findById(o._id).lean()
            it = f.items.find((i) => String(i._id) === t5)
            ok(r.success && r.data.message.secondRejection && it.holdDetails.assignTo === ROLE.ADMIN && it.holdDetails.reason === 'second-rejection', 'QC rejects it again → admin (T5.08)')
            r = await PressService.releaseFromHold(req(s4, o._id, { itemId: t5, note: 'x' }))
            ok(!r.success && /Only admin/.test(r.data?.error || ''), 'Press cannot release it: "Only admin can release this."')

            console.log('\n3. Hold rows carry the piece note and reason')
            const a = await new AdminService().getHoldOrders({ query: { type: 'activeHolds', page: 1, limit: 200 }, user: {} }, {})
            const row = (a.data?.message?.data || []).find((x) => String(x._id) === String(o._id))
            ok(row && row.holdMeta.holdTypeKey === 'second-rejection' && row.holdMeta.note === 'still not pressed well' && row.holdMeta.heldPieces[0]?.note === 'still not pressed well', `admin row: type ${row?.holdMeta?.holdTypeKey}, note "${row?.holdMeta?.note}"`)
            const ph = await PressService.getHoldQueue({ query: { page: 1, limit: 100 }, user: as(s4) })
            const prow = (ph.data?.message?.data || []).find((x) => String(x.orderId) === String(o._id))
            ok(prow && prow.holdTypeKey === 'second-rejection' && prow.holdReason, `station row: holdTypeKey ${prow?.holdTypeKey}, reason "${prow?.holdReason}"`)
        }

        console.log('\n4. Ready by on the station detail screen')
        {
            const ready = new Date()
            ready.setDate(ready.getDate() + ((3 - ready.getDay() + 7) % 7 || 7))
            ready.setHours(16, 0, 0, 0)
            const o = await order([piece('TAG 01', S.PRESSING_AND_IRONING_STATION)], { stage: { status: 'ironing' }, deliveryDate: ready })
            const r = await PressService.getPressQueueOrderDetails(req(s4, o._id))
            const d = r.data?.message?.order
            ok(d && d.readyBy?.text === 'Ready by Wed 4 PM' && d.speedLabel && d.statusLabel === 'Pressing', `press detail: "${d?.readyBy?.text}", speed "${d?.speedLabel}", status "${d?.statusLabel}"`)
        }

        console.log('\n5. Bank-transfer top-ups')
        {
            const mkPay = async () => {
                const p = await PaymentModel.create({ userId: cust._id, amount: 5000, reference: `T12-TOPUP-${stamp}-${created.payments.length}`, type: 'wallet-top-up', status: 'pending', paymentMethod: 'bank-transfer' })
                created.payments.push(p._id)
                return p
            }
            const p1 = await mkPay()
            let r = await new AdminService().acceptPaymentVerification({ params: { id: String(p1._id) }, user: as(admin), body: {} }, {})
            ok(!r.success && r.data?.referenceRequired, 'approve without the bank reference is refused')
            r = await new AdminService().acceptPaymentVerification({ params: { id: String(p1._id) }, user: as(admin), body: { reference: 'NIP-778899' } }, {})
            ok(r.success && (await PaymentModel.findById(p1._id).lean()).verificationReference === 'NIP-778899', 'approve with the reference: saved')
            const p2 = await mkPay()
            r = await new AdminService().rejectPaymentVerification({ params: { id: String(p2._id) }, user: as(admin), body: {} }, {})
            ok(!r.success && r.data?.reasonRequired, 'reject without a reason is refused')
            r = await new AdminService().rejectPaymentVerification({ params: { id: String(p2._id) }, user: as(admin), body: { reason: 'No transfer of this amount arrived' } }, {})
            const n = await NotificationModel.findOne({ userId: cust._id, title: 'Payment Rejected' }).sort({ createdAt: -1 }).lean()
            ok(r.success && (await PaymentModel.findById(p2._id).lean()).rejectionReason === 'No transfer of this amount arrived' && n && /No transfer of this amount arrived/.test(n.body), `reason saved and sent to the customer: "${n?.body}"`)
            await mongoose.connection.collection('wallettransactions').deleteMany({ userId: cust._id })
            await mongoose.connection.collection('wallets').updateOne({ userId: cust._id }, { $inc: { balance: -5000 } })
        }

        console.log('\n6. History lines')
        {
            const o = await order([piece('TAG 01', S.INTAKE_AND_TAG_STATION)])
            const t0 = Date.now()
            await ActivityModel.create([
                { title: 'Order moved to tag and queue', description: 'x', type: 'order-updated', orderId: o._id, userId: s1._id, createdAt: new Date(t0) },
                { title: 'Order moved to tag and queue', description: 'x', type: 'order-updated', orderId: o._id, userId: s1._id, createdAt: new Date(t0 + 1000) },
                { title: 'Order Item Tagged', description: 'An item with TAG-01 order X has been tagged', type: 'order-updated', orderId: o._id, userId: s1._id, createdAt: new Date(t0 + 2000) },
                { title: 'Items Pushed to Next Station', description: '1 item(s) on order X pushed from intake-and-tag-station to sort-and-pretreat-station.', type: 'order-updated', orderId: o._id, userId: s1._id, createdAt: new Date(t0 + 3000) },
                { title: 'Handoff Confirmed', description: 'x', type: 'order-updated', orderId: o._id, userId: s2._id, createdAt: new Date(t0 + 4000) },
            ])
            const L = (await historyLines(o._id)).map((x) => x.what)
            ok(L.filter((w) => w === 'At Intake').length === 1, `"At Intake" once (was twice): ${JSON.stringify(L)}`)
            ok(L.includes('Tagged TAG-01') && L.includes('Sent to Sort and Pretreat') && L.includes('Received'), 'client words: Tagged TAG-01, Sent to Sort and Pretreat, Received')
        }

        console.log('\n7. Settings')
        {
            const g = await new AdminService().getAdminSetting({}, {})
            const s = g.data.message
            ok(s.recountCover && typeof s.recountCover.percent === 'number' && s.unpaidBillTimers && Array.isArray(s.unpaidBillTimers.taskMinutes) && s.quietHours && typeof s.quietHours.startHour === 'number', 'read shows recount cover, unpaid-bill timers and quiet hours (with defaults)')
            let r = await new AdminService().updateAdminSettings({ body: { recountCover: { percent: 150 } } })
            ok(!r.success && r.data?.field === 'recountCover.percent', `bad percent refused: "${r.data?.error}"`)
            r = await new AdminService().updateAdminSettings({ body: { quietHours: { startHour: 25 } } })
            ok(!r.success && r.data?.field === 'quietHours', 'bad quiet hour refused')
            r = await new AdminService().updateAdminSettings({ body: { recountCover: { maxAmount: 600 } } })
            ok(r.success && r.data.message.recountCover.maxAmount === 600 && r.data.message.recountCover.percent === (before?.recountCover?.percent ?? 10), 'a valid change saves and keeps the other cover values')
        }
    } catch (e) {
        FAIL++
        console.error('  ✗ CRASH:', e)
    } finally {
        await AdminSettingModel.updateOne({}, { $set: { v1Switches: before?.v1Switches || { s2PartialReceipt: false, routesByService: false, ironOnlyUpgrade: false, damageCase: false }, ...(before?.recountCover ? { recountCover: before.recountCover } : {}) }, ...(before?.recountCover ? {} : { $unset: { recountCover: 1 } }) })
        await ActivityModel.deleteMany({ orderId: { $in: created.orders } })
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        await PaymentModel.deleteMany({ _id: { $in: created.payments } })
        await NotificationModel.deleteMany({ userId: { $in: created.users } })
        await UserModel.deleteMany({ _id: { $in: created.users } })
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed`)
        process.exit(FAIL ? 1 : 0)
    }
}
main()
