/**
 * V1 launch batch 3 part 2 (revised test plan R2, R4, R6, R8) — DB verification on testingdb.
 * Each part is checked with its switch OFF (today's behaviour), ON, and switched OFF mid-way
 * (client: "No order may get stuck or lose a piece").
 *
 *   0  Switches: all off by default; admin can flip them
 *   A  Damage case (R6, T3.08–T3.10): holds the piece, care task, admin release only after
 *      "Customer informed"; finishable with the switch off
 *   B  Partial delivery (R6): held piece moves to a follow-on order, free second trip when our fault
 *   C  S2 holds one piece at receipt (R2, T8.04–T8.05); the fixed piece is sent alone, switch on or off
 *   D  Routes by service (R4, T3.07, T4.02)
 *   E  Iron Only "looks dirty" (R8, T4.03–T4.08): suggestion, link for the difference, paid →
 *      Wash and Iron route; unpaid → pressed as booked; declined; finishable with the switch off
 *
 * SMS and email stubbed. testingdb settings it changes are restored. SAFETY: refuses unless
 * STAGING_OK=1; refuses NODE_ENV=production without STAGING_FORCE=1; hard-refuses laundrydb.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node part2Staging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const SMS = []
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: Object.assign(async (to, body) => { SMS.push({ to, body }); return { stubbed: true } }, { cleanSmsText: (t) => t }) }
const emailPath = require.resolve('./util/emailService')
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: async () => ({ stubbed: true }) }

const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const AdminSettingModel = require('./models/adminSetting.model')
const CareTaskModel = require('./models/careTask.model')
const { STATION_STATUS: S, ROLE } = require('./util/constants')

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
const gen = () => 'P2-' + Date.now() + '-' + Math.floor(Math.random() * 1e4)

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
    const dbName = (String(url).match(/\/([A-Za-z0-9_-]+)(\?|$)/) || [])[1] || '<unknown>'
    console.log('Target DB name:', dbName)
    if (/laundrydb/i.test(dbName)) {
        console.error('*** "laundrydb" is the LIVE database. Refusing. ***')
        process.exit(2)
    }
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })

    const HandoffService = require('./services/handoff.service')
    const WashService = require('./services/washAndDry.service')
    const IntakeService = require('./services/intake-user.service')
    const AdminService = require('./services/admin.service')
    const PaymentHoldService = require('./services/paymentHold.service')
    const D = require('./util/damageCase')
    const U = require('./util/ironOnlyUpgrade')
    const { getSwitches } = require('./util/switches')
    const { nextStationFor } = require('./util/routes')
    const handoff = new HandoffService()

    const stamp = Date.now()
    const created = { users: [], orders: [] }
    const before = await AdminSettingModel.findOne().select('v1Switches serviceTypes ironOnlyAnswerMinutes').lean()
    const setSw = (o) => AdminSettingModel.updateOne({}, { $set: Object.fromEntries(Object.entries(o).map(([k, v]) => [`v1Switches.${k}`, v])) })
    try {
        const mk = async (fullName, userType) => {
            const u = await UserModel.create({ email: `p2_${userType}_${stamp}_${created.users.length}@example.com`, fullName, userType })
            created.users.push(u._id)
            return u
        }
        const admin = await mk('P2 Admin', ROLE.ADMIN)
        const s1 = await mk('Ifeanyi Intake', ROLE.INTAKE_AND_TAG)
        const s2 = await mk('Ada Sorter', ROLE.SORT_AND_PRETREAT)
        const s3 = await mk('Wale Washer', ROLE.WASH_AND_DRY)
        const cx = await mk('Chioma Care', ROLE.CUSTOMER_EXPERIENCE)
        const customer = await mk('Emeka Obi', ROLE.USER)
        const as = (u) => ({ id: String(u._id), userType: u.userType })
        const req = (u, id, body = {}, params = {}) => ({ params: { id: String(id), ...params }, user: as(u), body, query: {} })
        const order = async (items, extra = {}) => {
            const o = await BookOrderModel.create({
                userId: customer._id, fullName: 'Emeka Obi', phoneNumber: '08051239999', serviceType: 'wash-and-iron', serviceTier: 'classic',
                deliverySpeed: 'standard', channel: 'website', amount: 4000, oscNumber: gen(), paymentStatus: 'success', isPickUp: true, isDelivery: true,
                stage: { status: 'queue' }, stationStatus: S.PENDING, items, dispatchDetails: { pickup: { status: 'picked-up' } }, ...extra,
            })
            created.orders.push(o._id)
            return o
        }
        const piece = (tag, station, extra = {}) => ({ type: 'shirt', price: 1, quantity: 1, tagId: tag, currentStation: station, tagStatus: 'complete', ...extra })
        const reload = (id) => BookOrderModel.findById(id).lean()
        const itemOf = (o, tag) => o.items.find((i) => i.tagId === tag)

        console.log('\n0. Switches')
        await setSw({ s2PartialReceipt: false, routesByService: false, ironOnlyUpgrade: false, damageCase: false })
        let sw = await getSwitches()
        ok(Object.values(sw).every((v) => v === false), `all four off: ${JSON.stringify(sw)}`)

        console.log('\nA. Damage case (R6)')
        {
            const o = await order(['TAG 01', 'TAG 02', 'TAG 03', 'TAG 04'].map((t) => piece(t, S.WASH_AND_DRY_STATION, { washStatus: 'complete' })), { serviceType: 'washing-only', stage: { status: 'washing' }, stationStatus: S.WASH_AND_DRY_STATION })
            const t2 = String(o.items[1]._id)
            let r = await D.reportDamage({ orderId: o._id, itemId: t2, note: 'machine tore the hem', user: as(s3) })
            ok(!r.success && r.data.switchOff, 'switch off → "Report problem: Damaged" refused (a normal hold is used)')
            await setSw({ damageCase: true })
            r = await D.reportDamage({ orderId: o._id, itemId: t2, note: 'machine tore the hem', user: as(s2) })
            ok(!r.success && /Only that station/.test(r.data.error), 'another station cannot report a piece it does not hold')
            r = await D.reportDamage({ orderId: o._id, itemId: t2, note: 'machine tore the hem', user: as(s3) })
            ok(r.success && r.data.message.held, 'S3 reports TAG 02 damaged → held')
            let f = await reload(o._id)
            const it = itemOf(f, 'TAG 02')
            ok(it.holdDetails.assignTo === ROLE.ADMIN && it.holdDetails.reason === 'damaged' && it.damageCase.status === 'open' && it.tagState.includes('damaged'), 'held for admin, damage case open, marked damaged')
            const task = await CareTaskModel.findOne({ orderId: o._id, type: 'damage' }).lean()
            ok(task && task.status === 'open', 'damage case task for customer care (admin copied)')
            r = await handoff.push(req(s3, o._id, { fromStation: S.WASH_AND_DRY_STATION, toStation: S.QC_STATION, itemIds: f.items.filter((i) => i.tagId !== 'TAG 02').map((i) => String(i._id)) }))
            ok(!r.success, `QC waits while TAG 02 is held ("${r.data?.error}")`)
            r = await new AdminService().releaseItemHold(req(admin, o._id, { itemId: t2 }))
            ok(!r.success && r.data.customerInformedRequired, 'admin release refused before Customer informed')
            r = await WashService.releaseFromHold(req(s3, o._id, { itemId: t2, note: 'x' }))
            ok(!r.success && /Only admin/.test(r.data?.error || ''), 'S3 cannot release it')
            await setSw({ damageCase: false })
            r = await D.customerInformed({ orderId: o._id, itemId: t2, note: 'Called Obinna', user: as(cx) })
            ok(r.success && r.data.message.damageCase.status === 'customer-informed', 'switch turned OFF mid-case: Customer informed still works')
            ok((await CareTaskModel.findOne({ orderId: o._id, type: 'damage' }).lean()).status === 'closed', 'the damage task closes')
            r = await new AdminService().releaseItemHold(req(admin, o._id, { itemId: t2, note: 'customer agreed' }))
            ok(r.success, 'admin releases TAG 02 (switch off — nothing stuck)')
            f = await reload(o._id)
            ok(itemOf(f, 'TAG 02').damageCase.status === 'released', 'damage case released')
            r = await handoff.push(req(s3, o._id, { fromStation: S.WASH_AND_DRY_STATION, toStation: S.QC_STATION }))
            ok(r.success, 'all 4 now go to QC together')
        }

        console.log('\nB. Partial delivery (R6)')
        {
            await setSw({ damageCase: true })
            const o = await order(['TAG 01', 'TAG 02', 'TAG 03', 'TAG 04'].map((t) => piece(t, S.WASH_AND_DRY_STATION, { washStatus: 'complete' })), { serviceType: 'washing-only', stage: { status: 'washing' }, stationStatus: S.WASH_AND_DRY_STATION })
            const t2 = String(o.items[1]._id)
            await D.reportDamage({ orderId: o._id, itemId: t2, note: 'hem needs repair', user: as(s3) })
            let r = await D.approvePartialDelivery({ orderId: o._id, reason: 'Repair takes 3 days', user: as(cx) })
            ok(!r.success && /ourFault/.test(r.data.error), 'ourFault must be said')
            r = await D.approvePartialDelivery({ orderId: o._id, reason: 'Repair takes 3 days', ourFault: true, user: as(cx) })
            ok(r.success && r.data.message.remainingPieces === 3 && r.data.message.secondTripFree, `partial delivery: 3 stay, TAG 02 moves to ${r.data?.message?.followOnOscNumber}, second trip free`)
            if (r.success) created.orders.push(r.data.message.followOnOrderId)
            const child = r.success ? await reload(r.data.message.followOnOrderId) : null
            ok(child && child.items.length === 1 && child.items[0].tagId === 'TAG 02' && child.items[0].damageCase.status === 'open' && child.amount === 0 && child.paymentStatus === 'success' && String(child.parentOrderId) === String(o._id), 'follow-on order: TAG 02 with its hold and case, N0, linked back')
            r = await handoff.push(req(s3, o._id, { fromStation: S.WASH_AND_DRY_STATION, toStation: S.QC_STATION }))
            ok(r.success && r.data.message.count === 3, 'the 3 ready pieces go to QC on the original order')
            // FE 16 Oct: the damage task must follow TAG 02 to the follow-on order.
            const moved = child ? await CareTaskModel.findOne({ type: 'damage', orderId: child._id }).lean() : null
            ok(moved && moved.status === 'open' && moved.oscNumber === child.oscNumber && !(await CareTaskModel.findOne({ type: 'damage', orderId: o._id, status: 'open' })), 'the damage task moves with TAG 02 to the follow-on order')
            if (child) created.orders.push(child._id)
            r = child ? await D.customerInformed({ orderId: child._id, itemId: String(child.items[0]._id), note: 'Called', user: as(cx) }) : { success: false }
            ok(r.success && (await CareTaskModel.findById(moved?._id).lean())?.status === 'closed', 'Customer informed on the follow-on order closes that task')
            const o2 = await order(['TAG 01', 'TAG 02'].map((t) => piece(t, S.WASH_AND_DRY_STATION, { washStatus: 'complete' })), { serviceType: 'washing-only', stage: { status: 'washing' } })
            await D.reportDamage({ orderId: o2._id, itemId: String(o2.items[0]._id), note: 'customer brought it torn', user: as(s3) })
            r = await D.approvePartialDelivery({ orderId: o2._id, reason: 'Waiting for the customer', ourFault: false, user: as(cx) })
            const c2 = r.success ? await reload(r.data.message.followOnOrderId) : null
            if (r.success) created.orders.push(r.data.message.followOnOrderId)
            ok(c2 && c2.amount === 500 && c2.paymentStatus === 'pending', 'not our fault → the second trip carries the delivery fee (N500)')
        }

        console.log('\nC. S2 holds one piece at receipt (R2)')
        {
            const o = await order(['TAG 01', 'TAG 02', 'TAG 03'].map((t) => piece(t, S.INTAKE_AND_TAG_STATION)), { stationStatus: S.INTAKE_AND_TAG_STATION })
            const [a, b, c] = o.items.map((i) => String(i._id))
            let r = await handoff.push(req(s1, o._id, { fromStation: S.INTAKE_AND_TAG_STATION, toStation: S.SORT_AND_PRETREAT_STATION, itemIds: [a] }))
            ok(!r.success && /every piece that is still at Intake/.test(r.data.error), 'S1 cannot send part of a new order')
            r = await handoff.push(req(s1, o._id, { fromStation: S.INTAKE_AND_TAG_STATION, toStation: S.SORT_AND_PRETREAT_STATION }))
            const hid = r.data.message.handoffId
            r = await handoff.confirm(req(s2, o._id, { rejectedItems: [c], note: 'Something is missing: no tag' }, { hid }))
            ok(!r.success && /whole order/.test(r.data.error), 'switch off → S2 must accept all or reject all (today)')
            await setSw({ s2PartialReceipt: true })
            r = await handoff.confirm(req(s2, o._id, { rejectedItems: [c], note: 'Something is missing: no tag' }, { hid }))
            ok(r.success, 'switch on → S2 holds TAG 03 and receives the rest')
            let f = await reload(o._id)
            ok(itemOf(f, 'TAG 01').currentStation === S.SORT_AND_PRETREAT_STATION && itemOf(f, 'TAG 02').currentStation === S.SORT_AND_PRETREAT_STATION, 'TAG 01 and TAG 02 received at S2')
            ok(itemOf(f, 'TAG 03').currentStation === S.INTAKE_AND_TAG_STATION && itemOf(f, 'TAG 03').holdDetails.assignTo === ROLE.INTAKE_AND_TAG, "TAG 03 goes to S1's Holds")
            await setSw({ s2PartialReceipt: false })
            r = await new IntakeService().releaseFromHold(req(s1, o._id, { itemId: c, note: 'Tagged TAG 03' }))
            ok(r.success, `S1 fixes TAG 03 with a note (switch now OFF) ${r.success ? '' : r.data?.error}`)
            r = await handoff.push(req(s1, o._id, { fromStation: S.INTAKE_AND_TAG_STATION, toStation: S.SORT_AND_PRETREAT_STATION, itemIds: [c] }))
            ok(r.success, `S1 sends the one fixed piece alone — works with the switch off ${r.success ? '' : r.data?.error}`)
            r = r.success ? await handoff.confirm(req(s2, o._id, {}, { hid: r.data.message.handoffId })) : r
            f = await reload(o._id)
            ok(r.success && f.items.every((i) => i.currentStation === S.SORT_AND_PRETREAT_STATION), 'TAG 03 arrives at S2: all 3 there')
        }

        console.log('\nD. Routes by service (R4)')
        {
            const wo = await order([piece('TAG 01', S.WASH_AND_DRY_STATION, { washStatus: 'complete' })], { serviceType: 'washing-only', stage: { status: 'washing' } })
            let r = await handoff.push(req(s3, wo._id, { fromStation: S.WASH_AND_DRY_STATION, toStation: S.PRESSING_AND_IRONING_STATION }))
            ok(r.success, 'switch off → Wash Only to Press still allowed (today)')
            const wo2 = await order([piece('TAG 01', S.WASH_AND_DRY_STATION, { washStatus: 'complete' })], { serviceType: 'washing-only', stage: { status: 'washing' } })
            await setSw({ routesByService: true })
            r = await handoff.push(req(s3, wo2._id, { fromStation: S.WASH_AND_DRY_STATION, toStation: S.PRESSING_AND_IRONING_STATION }))
            ok(!r.success && r.data.offRoute && /Wash Only: it goes to Quality Check and Pack next/.test(r.data.error), `switch on → refused: "${r.data?.error}"`)
            r = await handoff.push(req(s3, wo2._id, { fromStation: S.WASH_AND_DRY_STATION, toStation: S.QC_STATION }))
            ok(r.success, 'Wash Only: Wash and Dry → QC (S4 never sees it)')
            const io = await order([piece('TAG 01', S.SORT_AND_PRETREAT_STATION, { sortStatus: 'complete', pretreatStatus: 'not_required' })], { serviceType: 'ironing-only', stage: { status: 'sort-and-pretreat' } })
            r = await handoff.push(req(s2, io._id, { fromStation: S.SORT_AND_PRETREAT_STATION, toStation: S.WASH_AND_DRY_STATION }))
            ok(!r.success && r.data.offRoute, 'Iron Only: S2 → Wash and Dry refused')
            r = await handoff.push(req(s2, io._id, { fromStation: S.SORT_AND_PRETREAT_STATION, toStation: S.PRESSING_AND_IRONING_STATION }))
            ok(r.success, 'Iron Only: S2 → Press')
            const off = (await reload(wo._id)).items[0]
            ok(nextStationFor(off, { serviceType: 'washing-only' }, S.PRESSING_AND_IRONING_STATION) === S.QC_STATION, 'a piece already off its route (Wash Only at Press) still has a next stop: QC — never stuck')
        }

        console.log('\nE. Iron Only "looks dirty" (R8)')
        {
            await AdminSettingModel.updateOne({ 'serviceTypes.name': 'ironing-only' }, { $set: { 'serviceTypes.$.pricePerPiece': 500, ironOnlyAnswerMinutes: 10 } })
            const realBuild = PaymentHoldService._buildPaymentLink
            PaymentHoldService._buildPaymentLink = async () => 'https://pay.stub/upgrade'
            const mkIO = () => order(['TAG 01', 'TAG 02', 'TAG 03', 'TAG 04'].map((t) => piece(t, S.SORT_AND_PRETREAT_STATION, { sortStatus: 'complete', pretreatStatus: 'not_required' })), { serviceType: 'ironing-only', stage: { status: 'sort-and-pretreat' }, amount: 4000 })
            const o = await mkIO()
            const t3 = String(o.items[2]._id)
            let r = await U.markLooksDirty({ orderId: o._id, itemId: t3, note: 'collar stain', user: as(s2) })
            ok(!r.success && r.data.switchOff, 'switch off → "Looks dirty" refused')
            await setSw({ ironOnlyUpgrade: true })
            r = await U.markLooksDirty({ orderId: o._id, itemId: t3, note: 'collar stain', user: as(s2) })
            ok(r.success && r.data.message.dirtySuggestion.status === 'suggested', 'S2 marks TAG 03 looks dirty')
            r = await handoff.push(req(s2, o._id, { fromStation: S.SORT_AND_PRETREAT_STATION, toStation: S.PRESSING_AND_IRONING_STATION, itemIds: [t3] }))
            ok(!r.success && r.data.waitingForCustomer, 'TAG 03 stays at S2 while the customer is asked')
            r = await handoff.push(req(s2, o._id, { fromStation: S.SORT_AND_PRETREAT_STATION, toStation: S.PRESSING_AND_IRONING_STATION, itemIds: o.items.filter((i) => i.tagId !== 'TAG 03').map((i) => String(i._id)) }))
            ok(r.success, 'the other 3 move on to Press')
            ok((await U.listSuggestions()).some((x) => String(x.itemId) === t3), "on S1's list")
            SMS.length = 0
            await setSw({ ironOnlyUpgrade: false })
            r = await U.upgradeService({ orderId: o._id, itemId: t3, user: as(s1) })
            const diff = r.data?.message?.difference
            ok(r.success && diff > 0, `S1 changes TAG 03 to Wash and Iron (switch now OFF — still works): difference N${diff}`)
            let f = await reload(o._id)
            ok(f.amount === 4000 + diff && f.balanceDue === diff && f.paymentStatus === 'pending' && f.pricing?.serviceChange === undefined, 'full difference on the order (amount, balance due); no cover')
            ok(SMS.length === 1 && SMS[0].body.includes('https://pay.stub/upgrade') && SMS[0].body.includes(`N${diff.toLocaleString('en-NG')}`), `payment link SMS: "${SMS[0]?.body}"`)
            await BookOrderModel.updateOne({ _id: o._id }, { $set: { paymentStatus: 'success' }, $unset: { balanceDue: 1 } })
            const n = await U.settleIfPaid(o._id)
            f = await reload(o._id)
            ok(n === 1 && itemOf(f, 'TAG 03').serviceType === 'wash-and-iron' && itemOf(f, 'TAG 03').dirtySuggestion.status === 'paid', 'paid → TAG 03 is Wash and Iron')
            r = await handoff.push(req(s2, o._id, { fromStation: S.SORT_AND_PRETREAT_STATION, toStation: S.PRESSING_AND_IRONING_STATION, itemIds: [t3] }))
            ok(!r.success && r.data.offRoute, "TAG 03's route is now S2, S3, S4, QC: Press refused")
            r = await handoff.push(req(s2, o._id, { fromStation: S.SORT_AND_PRETREAT_STATION, toStation: S.WASH_AND_DRY_STATION, itemIds: [t3] }))
            ok(r.success, 'S2 sends TAG 03 to washing')

            // Unpaid → expires, pressed as booked.
            await setSw({ ironOnlyUpgrade: true })
            const o2 = await mkIO()
            const x = String(o2.items[0]._id)
            await U.markLooksDirty({ orderId: o2._id, itemId: x, note: 'looks grey', user: as(s2) })
            r = await U.upgradeService({ orderId: o2._id, itemId: x, user: as(s1) })
            SMS.length = 0
            const res = await U.expireDue(new Date(Date.now() + 11 * 60000))
            f = await reload(o2._id)
            const ex = f.items[0]
            ok(res.expired >= 1 && ex.dirtySuggestion.status === 'expired', 'not paid in 10 minutes (test value) → link cancelled')
            ok(f.amount === 4000 && f.paymentStatus === 'success' && !f.balanceDue, 'the difference comes off the order')
            ok(ex.actionLog.some((l) => l.action === 'pressed_as_booked' && l.note === 'customer did not pay for washing'), 'note "customer did not pay for washing" saved')
            ok(SMS.some((m) => m.body.includes('we pressed your shirt (TAG 01) as you booked, without washing. The rest of your order carries on.')), "customer messaged in the client's words")
            r = await handoff.push(req(s2, o2._id, { fromStation: S.SORT_AND_PRETREAT_STATION, toStation: S.PRESSING_AND_IRONING_STATION }))
            ok(r.success, 'pressed as booked: all 4 go to Press')

            // Declined.
            const o3 = await mkIO()
            const y = String(o3.items[0]._id)
            await U.markLooksDirty({ orderId: o3._id, itemId: y, note: 'stain', user: as(s2) })
            r = await U.declineSuggestion({ orderId: o3._id, itemId: y, note: 'Customer said no', user: as(s1) })
            ok(r.success && r.data.message.dirtySuggestion.status === 'declined', 'customer says no → pressed as booked')
            PaymentHoldService._buildPaymentLink = realBuild
        }
    } catch (e) {
        FAIL++
        console.error('  ✗ CRASH:', e)
    } finally {
        const restore = { v1Switches: before?.v1Switches || { s2PartialReceipt: false, routesByService: false, ironOnlyUpgrade: false, damageCase: false } }
        if (before?.serviceTypes) restore.serviceTypes = before.serviceTypes
        await AdminSettingModel.updateOne({}, before?.ironOnlyAnswerMinutes ? { $set: { ...restore, ironOnlyAnswerMinutes: before.ironOnlyAnswerMinutes } } : { $set: restore, $unset: { ironOnlyAnswerMinutes: 1 } })
        await CareTaskModel.deleteMany({ orderId: { $in: created.orders } })
        await mongoose.connection.collection('activities').deleteMany({ orderId: { $in: created.orders } })
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        await mongoose.connection.collection('notifications').deleteMany({ userId: { $in: created.users } })
        await UserModel.deleteMany({ _id: { $in: created.users } })
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed`)
        process.exit(FAIL ? 1 : 0)
    }
}
main()
