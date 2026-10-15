/**
 * V1 launch batch 3, low-risk half (client 15 Oct 2026) — DB verification on testingdb.
 *
 *   1  A whole-order move that is short names the piece and where it is
 *      ("TAG 03 is at Wash & Dry")
 *   2  A second rejection of the same piece goes to admin; station staff are
 *      refused with "Only admin can release this."; a first rejection still
 *      goes back to the sending station
 *   3  S2 corrects S1's colour (White, Light, Dark) and stain tag, with S2's
 *      name on each correction
 *   4  The due-today check lists orders due today not yet at QC and alerts
 *      admin once a day at the set hour
 *   5  A booking window can carry its own pickup and delivery price; blank
 *      falls back to the general window price; Urgent is unchanged
 *
 * SMS and email stubbed. SAFETY: refuses unless STAGING_OK=1; refuses
 * NODE_ENV=production without STAGING_FORCE=1; hard-refuses laundrydb.
 * Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node batch3aStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: Object.assign(async () => ({ stubbed: true }), { cleanSmsText: (t) => t }) }
const emailPath = require.resolve('./util/emailService')
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: async () => ({ stubbed: true }) }

const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const AdminSettingModel = require('./models/adminSetting.model')
const BookingWindowModel = require('./models/bookingWindow.model')
const { STATION_STATUS: S, ROLE, BOOKING_TIMING, DISPATCH_LEG } = require('./util/constants')

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
const gen = () => 'B3A-' + Date.now() + '-' + Math.floor(Math.random() * 1e4)

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
    const SortService = require('./services/sortAndPretreat.service')
    const WashService = require('./services/washAndDry.service')
    const BookingWindowService = require('./services/bookingWindow.service')
    const W = require('./util/bookingWindow')
    const { dueTodayNotAtQc, runDueTodayAlert } = require('./util/dueTodayCheck')
    const { adminAssignedRefusal } = require('./util/releaseItemHold')

    const created = { orderIds: [], userIds: [], windowIds: [] }
    const stamp = Date.now()
    const admin = await UserModel.create({ email: `b3a_admin_${stamp}@example.com`, fullName: 'B3A Admin', userType: ROLE.ADMIN })
    const sorter = await UserModel.create({ email: `b3a_sort_${stamp}@example.com`, fullName: 'Ada Sorter', userType: ROLE.SORT_AND_PRETREAT })
    const washer = await UserModel.create({ email: `b3a_wash_${stamp}@example.com`, fullName: 'Wale Washer', userType: ROLE.WASH_AND_DRY })
    const customer = await UserModel.create({ email: `b3a_cust_${stamp}@example.com`, fullName: 'B3A Customer', userType: ROLE.USER })
    created.userIds.push(admin._id, sorter._id, washer._id, customer._id)

    const req = (user, id, body = {}, params = {}) => ({
        params: { id: String(id), ...params },
        user: { id: String(user._id), userType: user.userType },
        body,
        query: {},
    })
    async function makeOrder(items, extra = {}) {
        const o = await BookOrderModel.create({
            userId: customer._id,
            fullName: 'B3A Customer',
            phoneNumber: '08000000000',
            serviceType: 'wash-and-iron',
            serviceTier: 'classic',
            deliverySpeed: 'standard',
            channel: 'website',
            amount: 1000,
            oscNumber: gen(),
            paymentStatus: 'success',
            stage: { status: 'queue' },
            stationStatus: S.PENDING,
            items,
            ...extra,
        })
        created.orderIds.push(o._id)
        return o
    }
    const handoff = new HandoffService()

    let savedLatch
    try {
        console.log('\n1. Missing piece names the tag and the station')
        {
            const o = await makeOrder([
                { type: 'shirt', price: 1, quantity: 1, tagId: 'TAG 01', currentStation: S.PRESSING_AND_IRONING_STATION, pressStatus: 'complete' },
                { type: 'trouser', price: 1, quantity: 1, tagId: 'TAG 03', currentStation: S.WASH_AND_DRY_STATION },
            ], { stage: { status: 'ironing' }, stationStatus: S.WASH_AND_DRY_STATION })
            const r = await handoff.push(req(admin, o._id, { fromStation: S.PRESSING_AND_IRONING_STATION, toStation: S.QC_STATION }))
            const err = r.data?.error || ''
            ok(!r.success, 'S4 → S5 refused while a piece is still at Wash & Dry')
            ok(/whole order must be here/i.test(err) && /TAG 03 is at Wash/i.test(err), `message names the piece: "${err}"`)
            ok(!/TAG 01/.test(err), 'the piece already here is not listed')
        }

        console.log('\n2. Second rejection goes to admin')
        {
            const o = await makeOrder([
                { type: 'shirt', price: 1, quantity: 1, tagId: 'TAG 05', currentStation: S.WASH_AND_DRY_STATION, washStatus: 'complete' },
                { type: 'shirt', price: 1, quantity: 1, tagId: 'TAG 06', currentStation: S.WASH_AND_DRY_STATION, washStatus: 'complete',
                    actionLog: [{ action: 'handoff_rejected', note: 'still wet', timestamp: new Date(Date.now() - 3600e3) }] },
            ], { stage: { status: 'washing' }, stationStatus: S.WASH_AND_DRY_STATION })
            const [first, second] = o.items.map((i) => String(i._id))
            let r = await handoff.push(req(admin, o._id, { fromStation: S.WASH_AND_DRY_STATION, toStation: S.PRESSING_AND_IRONING_STATION }))
            ok(r.success, 'W&D → P&I push accepted (pending)')
            r = await handoff.confirm(req(admin, o._id, { rejectedItems: [first, second], note: 'still damp' }, { hid: r.data.message.handoffId }))
            ok(r.success, 'P&I rejects both pieces')
            const after = await BookOrderModel.findById(o._id).lean()
            const a = after.items.find((i) => String(i._id) === first)
            const b = after.items.find((i) => String(i._id) === second)
            ok(a.holdDetails?.assignTo === ROLE.WASH_AND_DRY && a.holdDetails?.reason === 'handoff-rejected', 'first rejection goes back to Wash & Dry')
            ok(b.holdDetails?.assignTo === ROLE.ADMIN && b.holdDetails?.reason === 'second-rejection', 'second rejection of TAG 06 goes to admin')

            r = await WashService.releaseFromHold(req(washer, o._id, { itemId: second }))
            ok(!r.success && /only admin can release this/i.test(r.data?.error || ''), `W&D cannot release the admin piece: "${r.data?.error}"`)
            r = await WashService.releaseFromHold(req(washer, o._id, { itemId: first, note: 'Re-dried' }))
            ok(r.success, 'W&D can still release its own first-rejection piece')
            ok(adminAssignedRefusal({ order: after, itemId: second, role: ROLE.ADMIN }) === null, 'admin is never refused')
        }

        console.log('\n3. S2 corrects colour and stain tags')
        {
            const o = await makeOrder([
                { type: 'shirt', price: 1, quantity: 1, tagId: 'TAG 07', currentStation: S.SORT_AND_PRETREAT_STATION, tagColor: 'white', colorGroup: 'white' },
            ], { stage: { status: 'sort-and-pretreat' }, stationStatus: S.SORT_AND_PRETREAT_STATION })
            const itemId = String(o.items[0]._id)
            const sort = SortService
            let r = await sort.updateItemSortDetails(req(sorter, o._id, { tagColor: 'purple' }, { itemId }))
            ok(!r.success && /White, Light or Dark/.test(r.data?.error || ''), 'an unknown colour is refused')
            r = await sort.updateItemSortDetails(req(sorter, o._id, { tagColor: 'dark', stained: true }, { itemId }))
            ok(r.success, 'S2 corrects White → Dark and adds the stain tag')
            const it = (await BookOrderModel.findById(o._id).lean()).items[0]
            ok(it.tagColor === 'dark' && it.colorGroup === 'colored', 'colour is Dark and the wash group follows (coloured)')
            ok((it.tagState || []).includes('stained'), 'stain tag added')
            const c = it.tagCorrections || []
            ok(c.length === 2 && c.every((x) => x.byName === 'Ada Sorter'), 'two corrections recorded with S2\'s name')
            ok(c.some((x) => x.field === 'tagColor' && x.from === 'white' && x.to === 'dark'), 'colour correction shows from and to')
        }

        console.log('\n4. Due-today check')
        {
            const s = await AdminSettingModel.findOne().select('dueTodayCheckHour dueTodayCheckLastRun').lean()
            savedLatch = { id: s._id, value: s.dueTodayCheckLastRun }
            const hour = Number.isInteger(s.dueTodayCheckHour) ? s.dueTodayCheckHour : 15
            const now = new Date()
            now.setHours(hour, 5, 0, 0)
            const due = new Date(now)
            due.setHours(19, 0, 0, 0)
            const late = await makeOrder([
                { type: 'shirt', price: 1, quantity: 1, currentStation: S.WASH_AND_DRY_STATION },
            ], { stage: { status: 'washing' }, deliveryDate: due })
            const fine = await makeOrder([
                { type: 'shirt', price: 1, quantity: 1, currentStation: S.QC_STATION },
            ], { stage: { status: 'qc' }, deliveryDate: due })
            const rows = await dueTodayNotAtQc(now)
            const ids = rows.map((r) => String(r.orderId))
            ok(ids.includes(String(late._id)), 'an order due today still at Wash & Dry is listed')
            ok(!ids.includes(String(fine._id)), 'an order already at QC is not listed')
            const row = rows.find((r) => String(r.orderId) === String(late._id))
            ok(row && Object.values(row.piecesAt || {})[0] === 1, `piecesAt shows where the pieces are: ${JSON.stringify(row?.piecesAt)}`)

            await AdminSettingModel.updateOne({ _id: s._id }, { $unset: { dueTodayCheckLastRun: 1 } })
            const off = new Date(now)
            off.setHours((hour + 1) % 24)
            ok((await runDueTodayAlert(off)).ran === false, 'no alert outside the set hour')
            const r1 = await runDueTodayAlert(now)
            ok(r1.ran === true && r1.count >= 1, `alert runs at the set hour (${r1.count} order(s))`)
            ok((await runDueTodayAlert(now)).ran === false, 'only once a day')
        }

        console.log('\n5. Per-window prices')
        {
            const settings = { pickupFee: 500, deliveryFee: 500, anytimePickupFee: 1000, anytimeDeliveryFee: 1000 }
            const priced = { pickupFee: 700, deliveryFee: 300 }
            const plain = { pickupFee: null, deliveryFee: null }
            ok(W.legFee({ timing: BOOKING_TIMING.WINDOW, leg: DISPATCH_LEG.PICKUP, settings, window: priced }) === 700, 'window with its own pickup price charges 700')
            ok(W.legFee({ timing: BOOKING_TIMING.WINDOW, leg: DISPATCH_LEG.DELIVERY, settings, window: priced }) === 300, 'and its own delivery price 300')
            ok(W.legFee({ timing: BOOKING_TIMING.WINDOW, leg: DISPATCH_LEG.PICKUP, settings, window: plain }) === 500, 'blank window price falls back to the general 500')
            ok(W.legFee({ timing: BOOKING_TIMING.WINDOW, leg: DISPATCH_LEG.PICKUP, settings, window: { pickupFee: 0 } }) === 0, 'a free window (0) is honoured')
            ok(W.legFee({ timing: BOOKING_TIMING.ANYTIME, leg: DISPATCH_LEG.PICKUP, settings, window: priced }) === 1000, 'Urgent price unchanged')
            ok(W.anytimeRefundAmount({ leg: DISPATCH_LEG.PICKUP, settings, window: priced }) === 300, 'Urgent refund measured against the window\'s own price')

            const allDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
            const wset = { ...settings, workingDays: allDays }
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)
            const base = { startTime: '15:00', endTime: '18:00', days: allDays, cutoffMinutes: 60, isActive: true }
            const w1 = { _id: 'w1', name: 'Evening', limit: null, ...base, ...priced }
            let leg = BookingWindowService.resolveLeg({
                leg: DISPATCH_LEG.PICKUP, timing: BOOKING_TIMING.WINDOW, windowId: 'w1', date: tomorrow, windows: [w1], settings: wset,
            })
            ok(leg.ok && leg.leg.fee === 700, `resolveLeg charges the chosen window's own price (${leg.leg?.fee ?? leg.error})`)
            const full = { ...w1, limit: 1 }
            const w2 = { _id: 'w2', name: 'Late', limit: null, ...base, startTime: '18:30', endTime: '20:00', pickupFee: 900 }
            const key = `${W.dateKey(tomorrow)}::w1`
            leg = BookingWindowService.resolveLeg({
                leg: DISPATCH_LEG.PICKUP, timing: BOOKING_TIMING.WINDOW, windowId: 'w1', date: tomorrow, windows: [full, w2], settings: wset, bookedCounts: { [key]: 1 },
            })
            ok(leg.ok && leg.leg.forcedMove && leg.leg.fee === 900, `a full window moves to the next one at THAT window's price (${leg.leg?.fee ?? leg.error})`)

            let r = await BookingWindowService.createWindow({
                payload: { name: `B3A Window ${stamp}`, startTime: '09:00', endTime: '11:00', pickupFee: 700, deliveryFee: '' },
                actorId: admin._id,
            })
            ok(r.success && r.data.message.pickupFee === 700 && r.data.message.deliveryFee === null, 'admin creates a window with its own pickup price (delivery blank)')
            if (r.success) created.windowIds.push(r.data.message._id)
            r = await BookingWindowService.createWindow({
                payload: { name: `B3A Bad ${stamp}`, startTime: '12:00', endTime: '13:00', pickupFee: -5 },
                actorId: admin._id,
            })
            ok(!r.success && /pickupFee must be 0 or more/.test(r.data?.error || ''), 'a negative price is refused')
        }
    } catch (e) {
        FAIL++
        console.error('  ✗ CRASH:', e)
    } finally {
        if (savedLatch) {
            const upd = savedLatch.value ? { $set: { dueTodayCheckLastRun: savedLatch.value } } : { $unset: { dueTodayCheckLastRun: 1 } }
            await AdminSettingModel.updateOne({ _id: savedLatch.id }, upd)
        }
        await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        await UserModel.deleteMany({ _id: { $in: created.userIds } })
        await BookingWindowModel.deleteMany({ _id: { $in: created.windowIds } })
        await mongoose.connection.collection('notifications').deleteMany({ createdAt: { $gte: new Date(stamp) }, title: /due today not at QC|Rejected twice/ })
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed`)
        process.exit(FAIL ? 1 : 0)
    }
}
main()
