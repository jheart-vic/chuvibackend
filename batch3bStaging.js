/**
 * V1 launch batch 3b (FE asks + client answers, 15 Oct 2026) — DB verification on testingdb.
 *
 *   1  Station lists carry deliveryDate + deliveryPromise ("Ready by") and quickBooking
 *   2  Rider lists: itemCount, speedLabel, Urgent flags, Urgent jobs first
 *   3  A waiting Quick Booking carries payBy (12 noon the day after the bill)
 *   4  Hold lists: holdTypeKey + counts on a count dispute, rejectionCount per piece
 *   5  GET /admin/alerts: count disputes, possible missing items, repeat-mismatch customers
 *   6  Resend payment link: fresh link + reminder SMS; double tap refused; not on hold refused
 *   7  Station release needs a note (saved on the piece); admin needs none
 *   8  Soak and Brush off are pretreatment options
 *   9  Each applied offer carries its own discount
 *  10  Change Items: same items → nothing changed; a real change returns the pricing lines
 *
 * SMS, email and Paystack stubbed. SAFETY: refuses unless STAGING_OK=1; refuses
 * NODE_ENV=production without STAGING_FORCE=1; hard-refuses laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node batch3bStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const SMS = []
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: Object.assign(async (to, body) => { SMS.push({ to, body }); return { stubbed: true } }, { cleanSmsText: (t) => t }) }
const emailPath = require.resolve('./util/emailService')
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: async () => ({ stubbed: true }) }
const clientPath = require.resolve('./services/paystack.client.service')
let linkN = 0
require.cache[clientPath] = {
    id: clientPath,
    filename: clientPath,
    loaded: true,
    exports: {
        post: async () => ({ data: { status: true, data: { authorization_url: `https://pay.stub/${++linkN}`, reference: 'r' + linkN } } }),
        get: async () => ({ data: { status: true, data: { status: 'abandoned' } } }),
    },
}

const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const AdminSettingModel = require('./models/adminSetting.model')
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
const gen = () => 'B3B-' + Date.now() + '-' + Math.floor(Math.random() * 1e4)

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

    const WashService = require('./services/washAndDry.service')
    const RiderService = require('./services/rider.service')
    const AdminService = require('./services/admin.service')
    const PaymentHoldService = require('./services/paymentHold.service')
    const SortService = require('./services/sortAndPretreat.service')
    const BookOrderService = require('./services/bookOrder.service')
    const { presentOrder } = require('./util/orderView')
    const { adminAlerts } = require('./util/adminAlerts')

    const created = { orderIds: [], userIds: [] }
    const stamp = Date.now()
    const mk = async (u) => {
        const x = await UserModel.create({ email: `b3b_${u.userType}_${stamp}_${created.userIds.length}@example.com`, fullName: u.fullName, userType: u.userType, phoneNumber: u.phoneNumber })
        created.userIds.push(x._id)
        return x
    }
    const admin = await mk({ fullName: 'B3B Admin', userType: ROLE.ADMIN })
    const washer = await mk({ fullName: 'Wale Washer', userType: ROLE.WASH_AND_DRY })
    const rider = await mk({ fullName: 'Rita Rider', userType: ROLE.RIDER })
    const sorter = await mk({ fullName: 'Ada Sorter', userType: ROLE.SORT_AND_PRETREAT })
    const customer = await mk({ fullName: 'B3B Customer', userType: ROLE.USER, phoneNumber: '08051230001' })

    const req = (user, id, body = {}, params = {}, query = {}) => ({
        params: { id: id ? String(id) : undefined, ...params },
        user: { id: String(user._id), userType: user.userType },
        body,
        query,
    })
    async function makeOrder(items, extra = {}) {
        const o = await BookOrderModel.create({
            userId: customer._id,
            fullName: 'B3B Customer',
            phoneNumber: '08051230001',
            serviceType: 'wash-and-iron',
            serviceTier: 'classic',
            deliverySpeed: 'standard',
            channel: 'website',
            amount: 5000,
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
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(19, 0, 0, 0)

    const setting = await AdminSettingModel.findOne().select('displayNames recountCover').lean()
    const savedDisplay = setting?.displayNames
    try {
        console.log('\n1. Station lists: Ready by')
        {
            const o = await makeOrder([{ type: 'shirt', price: 1, quantity: 1, currentStation: S.WASH_AND_DRY_STATION }], {
                stage: { status: 'washing' },
                deliveryDate: tomorrow,
                quickBooking: true,
                fullName: 'B3B Ready By ' + stamp,
            })
            const r = await WashService.getWashQueue(req(washer, null, {}, {}, { search: 'B3B Ready By ' + stamp, page: 1, limit: 10 }))
            const row = (r.data?.message?.data || []).find((x) => String(x._id) === String(o._id))
            ok(!!row, 'the order is on the Wash Queue')
            ok(row && row.deliveryDate && row.deliveryPromise && typeof row.deliveryPromise.text === 'string', `row carries deliveryDate and deliveryPromise ("${row?.deliveryPromise?.text}")`)
            ok(row && row.quickBooking === true, 'row carries quickBooking')
        }

        console.log('\n2. Rider lists: count, speed name, Urgent first')
        {
            await AdminSettingModel.updateOne({}, { $set: { 'displayNames.deliverySpeeds.express': 'Ready in 24 hours' } })
            const base = { stage: { status: 'pending' }, isPickUp: true }
            const normal = await makeOrder([{ type: 'shirt', price: 1, quantity: 1 }, { type: 'shirt', price: 1, quantity: 1 }], {
                ...base,
                deliverySpeed: 'express',
                dispatchDetails: { pickup: { rider: rider._id, status: 'scheduled' } },
                scheduling: { pickup: { timing: 'window' } },
            })
            const urgent = await makeOrder([{ type: 'shirt', price: 1, quantity: 1 }], {
                ...base,
                dispatchDetails: { pickup: { rider: rider._id, status: 'scheduled' } },
                scheduling: { pickup: { timing: 'anytime' } },
            })
            const r = await new RiderService().getRiderAssignedPickups(req(rider, null, {}, {}, { page: 1, limit: 50 }))
            const rows = (r.data?.message?.data || []).filter((x) => [String(normal._id), String(urgent._id)].includes(String(x._id)))
            ok(rows.length === 2, `both pickups listed (${rows.length}) ${r.success ? '' : JSON.stringify(r.data)}`)
            const n = rows.find((x) => String(x._id) === String(normal._id))
            const u = rows.find((x) => String(x._id) === String(urgent._id))
            ok(n && n.itemCount === 2, `itemCount on the row (${n?.itemCount})`)
            ok(n && n.speedLabel === 'Ready in 24 hours', `speed by its display name (${n?.speedLabel})`)
            ok(u && u.urgentPickup === true && u.urgent === true && n && n.urgentPickup === false, 'Urgent pickup flagged')
            ok(rows[0] && String(rows[0]._id) === String(urgent._id), 'the Urgent job comes first')
        }

        console.log('\n3. payBy on a waiting Quick Booking')
        {
            const billAt = new Date()
            const o = presentOrder({ quickBooking: true, paymentHold: { raisedAt: billAt }, items: [] })
            const want = new Date(billAt)
            want.setDate(want.getDate() + 1)
            want.setHours(12, 0, 0, 0)
            ok(o.payBy && new Date(o.payBy).getTime() === want.getTime(), `payBy is 12 noon the next day (${o.payBy?.toISOString?.()})`)
            ok(presentOrder({ quickBooking: true, paymentHold: { raisedAt: billAt, clearedAt: new Date() } }).payBy === null, 'no payBy once paid')
            ok(presentOrder({ quickBooking: false, paymentHold: { raisedAt: billAt } }).payBy === null, 'no payBy on an ordinary order')
        }

        console.log('\n4. Hold data: type, counts, rejections')
        let disputeId
        {
            const o = await makeOrder([
                { type: 'shirt', price: 1, quantity: 1, currentStation: S.WASH_AND_DRY_STATION, tagId: 'TAG 01', flaggedForReview: true,
                    holdDetails: { reason: 'second-rejection', assignTo: ROLE.ADMIN, heldAt: new Date(), heldByStation: S.PRESSING_AND_IRONING_STATION },
                    actionLog: [{ action: 'handoff_rejected', note: 'damp' }, { action: 'handoff_rejected', note: 'still damp' }] },
            ], { stage: { status: 'washing' }, stationStatus: S.WASH_AND_DRY_STATION })
            const r = await WashService.getHoldQueue(req(washer, null, {}, {}, { page: 1, limit: 50 }))
            const row = (r.data?.message?.data || []).find((x) => String(x.orderId) === String(o._id))
            const piece = row?.flaggedItems?.[0]
            ok(piece && piece.rejectionCount === 2, `station hold list: rejectionCount 2 (${piece?.rejectionCount})`)
            ok(row && 'holdTypeKey' in row && 'counts' in row, 'station hold row carries holdTypeKey and counts')

            const d = await makeOrder([{ type: 'shirt', price: 1, quantity: 1 }], {
                stage: { status: 'hold', updatedAt: new Date() },
                stationStatus: S.INTAKE_AND_TAG_STATION,
                orderHold: { holdTypeKey: 'count_differs_from_rider' },
                counts: { customer: 10, rider: 10, intake: 9 },
            })
            disputeId = String(d._id)
            const a = await new AdminService().getHoldOrders(req(admin, null, {}, {}, { type: 'activeHolds', page: 1, limit: 100 }))
            const all = a.data?.message?.data || []
            const arow = all.find((x) => String(x._id) === disputeId)
            ok(arow && arow.holdMeta?.holdTypeKey === 'count_differs_from_rider', `admin holds: holdTypeKey (${arow ? arow.holdMeta?.holdTypeKey : 'row not on this page'})`)
            ok(arow && arow.holdMeta?.counts?.booked === 10 && arow.holdMeta.counts.rider === 10 && arow.holdMeta.counts.intake === 9, `admin holds: booked/rider/Intake counts ${JSON.stringify(arow?.holdMeta?.counts)}`)
        }

        console.log('\n5. Admin alerts')
        {
            await UserModel.updateOne({ _id: customer._id }, { $set: { recountMismatches: [1, 2, 3].map((k) => ({ at: new Date(Date.now() - k * 86400000), previousPieces: 5, newPieces: 7 })) } })
            const al = await adminAlerts()
            ok(al.countDisputes.some((x) => String(x.orderId) === disputeId), 'the count dispute is listed')
            const pm = al.possibleMissing.find((x) => String(x.orderId) === disputeId)
            ok(pm && pm.missing === 1, `possible missing item: 1 missing (${pm?.missing})`)
            const rm = al.repeatMismatch.find((x) => String(x.userId) === String(customer._id))
            ok(rm && rm.mismatches === 3 && rm.coverStopped === true, `repeat-mismatch customer listed (${rm?.mismatches} in ${al.repeatDays} days)`)
        }

        console.log('\n6. Resend payment link')
        {
            const o = await makeOrder([{ type: 'shirt', price: 1, quantity: 1 }], { paymentStatus: 'pending', amount: 7900, stage: { status: 'hold' } })
            const raised = await PaymentHoldService.raise({ orderId: o._id, actorId: admin._id })
            ok(raised.success, 'payment hold raised')
            SMS.length = 0
            // The link builder is Paystack's; stub it so the test can see the fresh link travel.
            const realBuild = PaymentHoldService._buildPaymentLink
            PaymentHoldService._buildPaymentLink = async () => `https://pay.stub/fresh-${++linkN}`
            let r = await PaymentHoldService.resendLink({ orderId: o._id, actorId: admin._id })
            PaymentHoldService._buildPaymentLink = realBuild
            ok(r.success && r.data.message.resent && /pay\.stub/.test(r.data.message.paymentUrl || ''), `resent with a fresh link (${r.data?.message?.paymentUrl || r.data?.error})`)
            ok(SMS.length === 1 && /waiting for payment/.test(SMS[0].body) && SMS[0].body.includes(r.data?.message?.paymentUrl || '###'), 'the payment reminder SMS carries the new link')
            r = await PaymentHoldService.resendLink({ orderId: o._id, actorId: admin._id })
            ok(!r.success && /less than a minute/.test(r.data?.error || ''), 'a second tap within a minute is refused')
            const paid = await makeOrder([{ type: 'shirt', price: 1, quantity: 1 }], { paymentStatus: 'pending', amount: 1000 })
            r = await PaymentHoldService.resendLink({ orderId: paid._id, actorId: admin._id })
            ok(!r.success && /not waiting for payment/.test(r.data?.error || ''), 'an order not on a payment hold is refused')
        }

        console.log('\n7. Release needs a note')
        {
            const o = await makeOrder([
                { type: 'shirt', price: 1, quantity: 1, currentStation: S.WASH_AND_DRY_STATION, tagId: 'TAG 09', flaggedForReview: true, washStatus: 'complete',
                    holdDetails: { reason: 'handoff-rejected', assignTo: ROLE.WASH_AND_DRY, heldAt: new Date(), heldByStation: S.PRESSING_AND_IRONING_STATION } },
            ], { stage: { status: 'washing' }, stationStatus: S.WASH_AND_DRY_STATION })
            const itemId = String(o.items[0]._id)
            let r = await WashService.releaseFromHold(req(washer, o._id, { itemId }))
            ok(!r.success && r.data?.noteRequired === true, `no note → refused: "${r.data?.error}"`)
            r = await WashService.releaseFromHold(req(washer, o._id, { itemId, note: 'Re-dried, now fully dry' }))
            ok(r.success, 'with a note → released')
            const it = (await BookOrderModel.findById(o._id).lean()).items[0]
            ok(it.holdDetails?.releaseNote === 'Re-dried, now fully dry', 'note saved on the hold')
            ok((it.actionLog || []).some((a) => a.action === 'hold_released' && a.note === 'Re-dried, now fully dry'), 'note in the piece history')
            const o2 = await makeOrder([
                { type: 'shirt', price: 1, quantity: 1, currentStation: S.WASH_AND_DRY_STATION, flaggedForReview: true,
                    holdDetails: { reason: 'stain', assignTo: ROLE.WASH_AND_DRY, heldAt: new Date() } },
            ], { stage: { status: 'washing' }, stationStatus: S.WASH_AND_DRY_STATION })
            r = await WashService.releaseFromHold(req(admin, o2._id, { itemId: String(o2.items[0]._id) }))
            ok(r.success, 'admin releases without a note')
        }

        console.log('\n8. Soak and Brush off')
        {
            const o = await makeOrder([{ type: 'shirt', price: 1, quantity: 1, currentStation: S.SORT_AND_PRETREAT_STATION, colorGroup: 'white' }], {
                stage: { status: 'sort-and-pretreat' }, stationStatus: S.SORT_AND_PRETREAT_STATION,
            })
            const r = await SortService.updateItemSortDetails(req(sorter, o._id, { pretreatmentOptions: ['soak', 'brush_off'] }, { itemId: String(o.items[0]._id) }))
            const it = (await BookOrderModel.findById(o._id).lean()).items[0]
            ok(r.success && it.pretreatmentOptions.includes('soak') && it.pretreatmentOptions.includes('brush_off'), `Soak and Brush off saved ${r.success ? '' : r.data?.error}`)
        }

        console.log('\n9. Discount per offer')
        {
            const svc = new BookOrderService()
            const p = svc._buildPricing({
                itemsBase: 10000, serviceTier: 'classic', tierMultiplier: 1, itemsSubtotal: 10000, pickupFee: 500, deliveryFee: 500,
                breakdown: { totalDiscount: 1500, baseline: [{ offerId: new mongoose.Types.ObjectId(), name: 'General 5%', discount: 500 }], promotion: { offerId: new mongoose.Types.ObjectId(), name: 'Weekend', discount: 1000 } },
                orderTotal: 9500,
            })
            const d = (p.appliedOffers || []).map((x) => x.discount)
            ok(d.length === 2 && d[0] === 500 && d[1] === 1000, `each offer's own discount (${d.join(', ')})`)
        }

        console.log('\n10. Change Items')
        {
            const settings = await AdminSettingModel.findOne({})
            const svc = new BookOrderService()
            const o = await makeOrder([{ type: 'shirt', price: 700, quantity: 1 }, { type: 'shirt', price: 700, quantity: 1 }], {
                billingType: 'pay-per-item', isPickUp: true, isDelivery: true, paymentStatus: 'pending', amount: 0,
                dispatchDetails: { pickup: { status: 'picked-up' } },
            })
            const priced = await svc._repriceForItems({ order: o, items: [{ type: 'shirt', price: 700, quantity: 2 }], adminOrderSetting: settings })
            await BookOrderModel.updateOne({ _id: o._id }, { $set: { amount: priced.newTotal } })
            const ireq = (body) => ({ params: { id: String(o._id) }, body, user: { id: String(admin._id), userType: ROLE.ADMIN } })
            let r = await svc.applyItemEdit(ireq({ items: [{ type: 'shirt', price: 700, quantity: 2 }], reason: 'same again' }))
            ok(!r.success && r.data?.noChange === true, `same items → nothing changed: "${r.data?.error}"`)
            ok((await BookOrderModel.findById(o._id).lean()).amount === priced.newTotal, 'the total did not move')
            r = await svc.applyItemEdit(ireq({ items: [{ type: 'shirt', price: 700, quantity: 3 }], reason: 'one more shirt' }))
            const pl = r.data?.message?.pricing
            ok(r.success && pl && typeof pl.tierUplift === 'number' && typeof pl.pickupFee === 'number' && typeof pl.itemsBase === 'number', `a real change returns the pricing lines ${r.success ? JSON.stringify({ itemsBase: pl?.itemsBase, tierUplift: pl?.tierUplift, pickupFee: pl?.pickupFee }) : r.data?.error}`)
        }
    } catch (e) {
        FAIL++
        console.error('  ✗ CRASH:', e)
    } finally {
        await AdminSettingModel.updateOne({}, savedDisplay ? { $set: { displayNames: savedDisplay } } : { $unset: { displayNames: 1 } })
        await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        await UserModel.deleteMany({ _id: { $in: created.userIds } })
        await mongoose.connection.collection('notifications').deleteMany({ userId: { $in: created.userIds } })
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed`)
        process.exit(FAIL ? 1 : 0)
    }
}
main()
