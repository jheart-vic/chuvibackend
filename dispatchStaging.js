/**
 * Rider assignment, failed pickups and the pickup landmark —
 * client brief 6 Oct 2026, items 3.1, 3.2 and 3.3.
 *
 * 3.1 "assigning a rider does not save": nothing checked that the id in the URL
 *     was a rider. A valid ObjectId that was not a rider SAVED, then populated
 *     back as null, so the queue row read "needs a rider" again. And the activity
 *     row / notification / audit line all run AFTER the write and each rethrows,
 *     so any of them failing reported a completed assignment as failed.
 *     NOTE the deployed `main` has no dispatch-tag gate — the client tested code
 *     without it, so the gate cannot be what they saw.
 * 3.2 a failed pickup keeps its PENDING stage and its rider, so it sat in the
 *     pickup queue looking like a healthy assigned run, with nothing to filter
 *     on, no count, and a notification that went to the rider who pressed the
 *     button instead of to the office.
 * 3.3 the rider's assigned-pickups list was the one dispatch list that never
 *     normalized addresses, so a legacy string address carried no landmark.
 *
 * Scenarios:
 *   1  GET riders returns active riders with their current load
 *   2  assign a real rider to a pickup → saved, and the queue row proves it
 *   3  assign a NON-rider id → refused, nothing written
 *   4  assign a suspended rider → refused, nothing written
 *   5  assign an unprinted delivery → still refused with needsDispatchTag
 *   6  a failed pickup → failedCount, legStatus=failed, failed/legNote on the row
 *   7  legStatus=bogus → refused with the valid values
 *   8  the office is notified of the failure, the rider is NOT
 *   9  the rider's assigned-pickups list returns a landmark from a LEGACY string
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Deletes what it creates.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node dispatchStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const ActivityModel = require('./models/activity.model')
const AuditLogModel = require('./models/audit.log.model')
const NotificationModel = require('./models/notification.model')
const IntakeUserService = require('./services/intake-user.service')
const RiderService = require('./services/rider.service')
const {
    ROLE,
    GENERAL_STATUS,
    ORDER_STATUS,
    PICKUP_STATUS,
    DELIVERY_STATUS,
    ORDER_CHANNEL,
    SERVICE_TIERS,
    DELIVERY_SPEED,
    ORDER_SERVICE_TYPE,
    PAYMENT_ORDER_STATUS,
    NOTIFICATION_TYPE,
} = require('./util/constants')

const intake = new IntakeUserService()
const riderSvc = new RiderService()
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

    const created = { userIds: [], orderIds: [] }
    try {
        // ── people ────────────────────────────────────────────────────────────
        const mk = (fields) => ({
            email: `stg${STAMP}${fields.tag}@example.com`,
            fullName: fields.fullName,
            phoneNumber: fields.phone,
            userType: fields.userType,
            status: fields.status || GENERAL_STATUS.ACTIVE,
            isVerified: true,
        })
        const [rider, suspendedRider, customer, officeStaff] = await Promise.all([
            UserModel.create(mk({ tag: 'rider', fullName: 'STG Rider Active', phone: '08030000001', userType: ROLE.RIDER })),
            UserModel.create(mk({ tag: 'susp', fullName: 'STG Rider Suspended', phone: '08030000002', userType: ROLE.RIDER, status: GENERAL_STATUS.SUSPENDED })),
            UserModel.create(mk({ tag: 'cust', fullName: 'STG Customer', phone: '08030000003', userType: ROLE.USER })),
            UserModel.create(mk({ tag: 'office', fullName: 'STG Intake Staff', phone: '08030000004', userType: ROLE.INTAKE_AND_TAG })),
        ])
        created.userIds.push(rider._id, suspendedRider._id, customer._id, officeStaff._id)

        // ── orders ────────────────────────────────────────────────────────────
        // The pickup address is deliberately a LEGACY STRING, which is the shape
        // that lost the landmark on the rider's list (3.3).
        const baseOrder = (tag, extra = {}) => ({
            fullName: 'STG Customer',
            phoneNumber: '08030000003',
            userId: customer._id,
            serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
            serviceTier: SERVICE_TIERS.CLASSIC,
            deliverySpeed: DELIVERY_SPEED.STANDARD,
            // ORDER_CHANNEL is whatsapp | website | office — there is no "walk-in".
            channel: ORDER_CHANNEL.OFFICE,
            amount: 5000,
            oscNumber: `OSC-STG${STAMP}-${tag}`,
            paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
            // An order item's required fields are type/price/quantity — NOT `name`.
            items: [{ type: 'Shirt', quantity: 1, price: 1000 }],
            ...extra,
        })

        const pickupOrder = await BookOrderModel.create(
            baseOrder('P1', {
                isPickUp: true,
                isDelivery: false,
                stage: { status: ORDER_STATUS.PENDING },
                pickupAddress: '14 Allen Avenue, Ikeja — gate beside the pharmacy',
                dispatchDetails: { pickup: { status: PICKUP_STATUS.PENDING, rider: null } },
            }),
        )
        const failOrder = await BookOrderModel.create(
            baseOrder('P2', {
                isPickUp: true,
                isDelivery: false,
                stage: { status: ORDER_STATUS.PENDING },
                pickupAddress: { label: 'Home', address: '7 Marine Road', landmark: 'Opposite the blue mosque' },
                dispatchDetails: { pickup: { status: PICKUP_STATUS.PENDING, rider: null } },
            }),
        )
        const deliveryOrder = await BookOrderModel.create(
            baseOrder('D1', {
                isPickUp: false,
                isDelivery: true,
                stage: { status: ORDER_STATUS.READY },
                deliveryAddress: { label: 'Home', address: '7 Marine Road', landmark: 'Opposite the blue mosque' },
                dispatchDetails: { delivery: { rider: null } },
            }),
        )
        created.orderIds.push(pickupOrder._id, failOrder._id, deliveryOrder._id)

        const asStaff = (params, query = {}) => ({
            params,
            query,
            user: { id: officeStaff._id.toString() },
        })

        // ── 1 the riders list ─────────────────────────────────────────────────
        console.log('\n1 — the riders endpoint that did not exist')
        const riders = unwrap(await intake.getRiders({ query: { search: 'STG Rider' } }))
        ok(Array.isArray(riders), 'getRiders returns a list')
        const mine = (riders || []).find((r) => String(r._id) === String(rider._id))
        ok(!!mine, 'the active rider is listed')
        ok(
            !(riders || []).some((r) => String(r._id) === String(suspendedRider._id)),
            'the suspended rider is NOT offered by default',
        )
        ok(
            mine && typeof mine.activeRuns === 'number',
            'each rider carries their current load',
        )

        // ── 2 assign a real rider ─────────────────────────────────────────────
        console.log('\n2 — assigning a real rider')
        const good = await intake.assignRiderTopPickupOrder(
            asStaff({ id: pickupOrder._id.toString(), riderId: rider._id.toString() }),
        )
        ok(good.success === true, 'the assignment succeeds')
        ok(good.data?.rider?.fullName === 'STG Rider Active', 'the rider comes back in the response')
        const afterAssign = await BookOrderModel.findById(pickupOrder._id).lean()
        ok(
            String(afterAssign.dispatchDetails.pickup.rider) === String(rider._id),
            'the rider is really stored',
        )
        ok(
            afterAssign.dispatchDetails.pickup.status === PICKUP_STATUS.SCHEDULED,
            'the leg is scheduled',
        )
        const q1 = unwrap(await intake.getPickableOrders({ query: { search: `OSC-STG${STAMP}-P1` } }))
        const row1 = (q1?.data || [])[0]
        ok(!!row1, 'the order is in the pickup queue')
        ok(
            row1 && row1.needsRider === false && row1.rider?.fullName === 'STG Rider Active',
            'THE QUEUE ROW SHOWS THE RIDER — this is the "it did not save" symptom, gone',
        )

        // ── 3 / 4 the refusals ────────────────────────────────────────────────
        console.log('\n3 / 4 — ids that are not an active rider')
        const notRider = await intake.assignRiderTopPickupOrder(
            asStaff({ id: failOrder._id.toString(), riderId: customer._id.toString() }),
        )
        ok(notRider.success === false, 'a customer id is refused')
        ok(/is not a rider/i.test(notRider.data?.error || ''), `named: ${notRider.data?.error}`)
        let untouched = await BookOrderModel.findById(failOrder._id).lean()
        ok(!untouched.dispatchDetails?.pickup?.rider, 'nothing was written')

        const susp = await intake.assignRiderTopPickupOrder(
            asStaff({ id: failOrder._id.toString(), riderId: suspendedRider._id.toString() }),
        )
        ok(susp.success === false, 'a suspended rider is refused')
        untouched = await BookOrderModel.findById(failOrder._id).lean()
        ok(!untouched.dispatchDetails?.pickup?.rider, 'nothing was written')

        const bogus = await intake.assignRiderTopPickupOrder(
            asStaff({ id: failOrder._id.toString(), riderId: 'definitely-not-an-id' }),
        )
        ok(bogus.success === false, 'a non-ObjectId is refused')
        ok(
            !/Something went wrong|Failed to assign/i.test(bogus.data?.error || ''),
            'and not with the old generic message',
        )

        // ── 5 the dispatch-tag gate still holds ───────────────────────────────
        console.log('\n5 — the delivery tag gate is unchanged')
        const untagged = await intake.assignRiderTopDeliveryOrder(
            asStaff({ id: deliveryOrder._id.toString(), riderId: rider._id.toString() }),
        )
        ok(untagged.success === false, 'an untagged delivery is still refused')
        ok(untagged.data?.needsDispatchTag === true, 'with needsDispatchTag')
        const delAfter = await BookOrderModel.findById(deliveryOrder._id).lean()
        ok(!delAfter.dispatchDetails?.delivery?.rider, 'and nothing written')

        // ── 6 / 7 / 8 the failed pickup ───────────────────────────────────────
        console.log('\n6 / 7 / 8 — a failed pickup becomes visible')
        await intake.assignRiderTopPickupOrder(
            asStaff({ id: failOrder._id.toString(), riderId: rider._id.toString() }),
        )
        const notifBefore = await NotificationModel.countDocuments({ userId: officeStaff._id })
        const riderNotifBefore = await NotificationModel.countDocuments({ userId: rider._id })
        const failed = await riderSvc.markPickupAsFailed({
            params: { id: failOrder._id.toString() },
            body: { phoneNumber: '08030000003', note: 'Customer not at home' },
            user: { id: rider._id.toString() },
        })
        ok(failed.success === true, 'the rider can mark the pickup failed')
        const q2 = unwrap(await intake.getPickableOrders({ query: { legStatus: 'failed' } }))
        ok(
            (q2?.data || []).some((o) => o.oscNumber === `OSC-STG${STAMP}-P2`),
            'legStatus=failed RETURNS the failed pickup (the filter the brief asks for)',
        )
        const failedRow = (q2?.data || []).find((o) => o.oscNumber === `OSC-STG${STAMP}-P2`)
        ok(failedRow?.failed === true, 'the row is flagged failed')
        ok(
            failedRow?.legStatus === PICKUP_STATUS.FAILED,
            'the row carries the leg status',
        )
        ok(
            /not at home/i.test(failedRow?.legNote || ''),
            "the rider's reason is on the row",
        )
        ok((q2?.failedCount || 0) >= 1, 'failedCount counts it')
        ok(
            !(q2?.data || []).some((o) => o.oscNumber === `OSC-STG${STAMP}-P1`),
            'the healthy assigned pickup is NOT in the failed view',
        )

        const bad = await intake.getPickableOrders({ query: { legStatus: 'not-a-status' } })
        ok(bad.success === false, 'an unknown legStatus is refused')
        ok(
            /Valid values/i.test(bad.data?.error || ''),
            `and lists the valid ones: ${bad.data?.error}`,
        )

        const notifAfter = await NotificationModel.countDocuments({ userId: officeStaff._id })
        const riderNotifAfter = await NotificationModel.countDocuments({ userId: rider._id })
        ok(notifAfter > notifBefore, 'THE OFFICE is notified of the failed pickup')
        ok(
            riderNotifAfter === riderNotifBefore,
            'the rider who pressed the button is NOT notified about their own action',
        )

        // ── 9 the landmark ────────────────────────────────────────────────────
        console.log('\n9 — the landmark on the rider\'s own pickup list')
        const assigned = unwrap(
            await riderSvc.getRiderAssignedPickups({
                query: {},
                user: { id: rider._id.toString() },
            }),
        )
        const mineRow = (assigned?.data || []).find(
            (o) => o.oscNumber === `OSC-STG${STAMP}-P1`,
        )
        ok(!!mineRow, "the scheduled pickup is on the rider's list")
        ok(
            mineRow && typeof mineRow.pickupAddress === 'object',
            'a LEGACY STRING address comes back as the structured object (it used to stay a string)',
        )
        ok(
            mineRow && 'landmark' in (mineRow.pickupAddress || {}),
            'so the landmark field exists at all',
        )
        ok(
            mineRow && mineRow.pickupLandmark !== undefined,
            'and is lifted onto the row as pickupLandmark',
        )
        const structured = unwrap(
            await riderSvc.getRiderAssignedPickups({
                query: {},
                user: { id: rider._id.toString() },
            }),
        )
        ok(!!structured, 'the list is repeatable')

        // ── 10 the landmark is now REQUIRED when a customer books ─────────────
        // Client decision 2026-10-07: the rider navigates by the landmark, so it
        // is mandatory on both legs. A customer reusing a SAVED address must not
        // be asked twice — the landmark is borrowed from the saved one.
        console.log('\n10 — landmark required on the customer booking path')
        const BookOrderService = require('./services/bookOrder.service')
        const book = new BookOrderService()
        const bookBody = (addr, extra = {}) => ({
            fullName: 'STG Customer',
            phoneNumber: '08030000003',
            serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
            serviceTier: SERVICE_TIERS.CLASSIC,
            billingType: 'pay-per-item',
            deliverySpeed: DELIVERY_SPEED.STANDARD,
            isPickUp: true,
            isDelivery: false,
            items: [{ type: 'shirt', price: 1, quantity: 1 }],
            pickupAddress: addr,
            ...extra,
        })
        const ordersBefore = await BookOrderModel.countDocuments({ userId: customer._id })

        const noLandmark = await book.postBookOrder({
            user: { id: customer._id.toString() },
            body: bookBody({ label: 'Home', address: '99 Brand New Street' }),
        })
        ok(noLandmark.success === false, 'a booking with no landmark is refused')
        ok(
            /landmark is required/i.test(noLandmark.data?.error || ''),
            `and says why: ${noLandmark.data?.error}`,
        )
        ok(
            noLandmark.data?.field === 'pickupAddress.landmark',
            'naming the field so the app can focus the input',
        )
        const stringOnly = await book.postBookOrder({
            user: { id: customer._id.toString() },
            body: bookBody('99 Brand New Street'),
        })
        ok(stringOnly.success === false, 'a bare STRING address is refused too')
        ok(
            (await BookOrderModel.countDocuments({ userId: customer._id })) === ordersBefore,
            'neither refusal created an order',
        )

        // now give the customer a saved address and book against it WITHOUT a landmark
        await UserModel.findByIdAndUpdate(customer._id, {
            $set: {
                addresses: [
                    {
                        label: 'Home',
                        address: '31 Saved Street, Yaba',
                        landmark: 'Beside the water tank',
                    },
                ],
            },
        })
        const borrowed = await book.postBookOrder({
            user: { id: customer._id.toString() },
            body: bookBody('31 saved street yaba'),
        })
        ok(
            borrowed.success === true,
            `a SAVED address books with no landmark typed: ${borrowed.data?.error || 'ok'}`,
        )
        const borrowedOrder = borrowed.data?.order
        if (borrowedOrder?._id) created.orderIds.push(borrowedOrder._id)
        ok(
            borrowedOrder?.pickupAddress?.landmark === 'Beside the water tank',
            'the landmark was borrowed from the saved address, not invented',
        )

        const typed = await book.postBookOrder({
            user: { id: customer._id.toString() },
            body: bookBody({
                label: 'Office',
                address: '12 Another Road',
                landmark: 'Opposite the filling station',
            }),
        })
        ok(typed.success === true, 'a booking WITH a landmark goes through')
        if (typed.data?.order?._id) created.orderIds.push(typed.data.order._id)
        ok(
            typed.data?.order?.pickupAddress?.landmark ===
                'Opposite the filling station',
            'and the typed landmark is stored for the rider',
        )

        // ── 11 a failed DELIVERY goes back to the delivery queue ──────────────
        // It used to keep OUT_FOR_DELIVERY, so the queue (which reads READY)
        // never showed it: failedCount stayed 0 and the office could not find it.
        console.log('\n11 — a failed delivery is visible and can be re-run')
        const failDelivery = await BookOrderModel.create(
            baseOrder('D2', {
                isPickUp: false,
                isDelivery: true,
                stage: { status: ORDER_STATUS.READY },
                deliveryAddress: { label: 'Home', address: '7 Marine Road', landmark: 'Opposite the blue mosque' },
                dispatchTag: { printedAt: new Date(), printCount: 1 },
                dispatchDetails: { delivery: { rider: null } },
            }),
        )
        created.orderIds.push(failDelivery._id)
        const asRider = (extra = {}) => ({
            params: { id: failDelivery._id.toString() },
            user: { id: rider._id.toString() },
            ...extra,
        })
        const assignD = await intake.assignRiderTopDeliveryOrder(
            asStaff({ id: failDelivery._id.toString(), riderId: rider._id.toString() }),
        )
        ok(assignD.success === true, 'the printed delivery is assigned')
        ok((await riderSvc.startDelivery(asRider())).success === true, 'the rider starts it')
        const failedD = await riderSvc.markOrderDeliveryAsFailed(
            asRider({ body: { phoneNumber: '08030000003', note: 'Gate locked' } }),
        )
        ok(failedD.success === true, 'the rider marks it failed')
        const afterFail = await BookOrderModel.findById(failDelivery._id).lean()
        ok(afterFail.stage.status === ORDER_STATUS.READY, 'the order is back at READY')
        ok(
            afterFail.dispatchDetails.delivery.status === DELIVERY_STATUS.FAILED,
            'the leg still says failed',
        )
        ok(
            afterFail.stageHistory.at(-1)?.note === 'Delivery failed: Gate locked',
            'the history records why it went back',
        )
        const qd = unwrap(await intake.getDeliverableOrders({ query: { legStatus: 'failed' } }))
        const dRow = (qd?.data || []).find((o) => o.oscNumber === `OSC-STG${STAMP}-D2`)
        ok(!!dRow, 'legStatus=failed on the DELIVERY queue returns it')
        ok(dRow?.failed === true && /Gate locked/.test(dRow?.legNote || ''), 'flagged, with the reason')
        ok((qd?.failedCount || 0) >= 1, 'the delivery failedCount counts it')

        const reassign = await intake.assignRiderTopDeliveryOrder(
            asStaff({ id: failDelivery._id.toString(), riderId: rider._id.toString() }),
        )
        ok(reassign.success === true, 'the office can reassign it')
        ok((await riderSvc.startDelivery(asRider())).success === true, 'and the rider can run it again')
        const rerun = await BookOrderModel.findById(failDelivery._id).lean()
        ok(rerun.stage.status === ORDER_STATUS.OUT_FOR_DELIVERY, 'which puts it back out for delivery')

        // F-04: an admin can cancel mid-run, leaving the delivery leg as it was.
        // Failing that run must not put the cancelled order back in the queue.
        await BookOrderModel.updateOne(
            { _id: failDelivery._id },
            { $set: { 'stage.status': ORDER_STATUS.CANCELLED } },
        )
        const failCancelled = await riderSvc.markOrderDeliveryAsFailed(
            asRider({ body: { phoneNumber: '08030000003', note: 'Returning cancelled bag' } }),
        )
        ok(failCancelled.success === true, 'the rider can still fail the run of a cancelled order')
        const stillCancelled = await BookOrderModel.findById(failDelivery._id).lean()
        ok(
            stillCancelled.stage.status === ORDER_STATUS.CANCELLED,
            'and the order STAYS cancelled, not back at READY',
        )

        // ── 12 the migration for deliveries that failed before the fix ────────
        console.log('\n12 — failed deliveries recorded before the fix are migrated')
        const stuck = await BookOrderModel.create(
            baseOrder('D3', {
                isPickUp: false,
                isDelivery: true,
                stage: { status: ORDER_STATUS.OUT_FOR_DELIVERY },
                deliveryAddress: { label: 'Home', address: '7 Marine Road', landmark: 'Opposite the blue mosque' },
                dispatchDetails: { delivery: { rider: rider._id, status: DELIVERY_STATUS.FAILED } },
            }),
        )
        created.orderIds.push(stuck._id)
        const setupApp = require('./config/setup')
        await setupApp()
        const migrated = await BookOrderModel.findById(stuck._id).lean()
        ok(migrated.stage.status === ORDER_STATUS.READY, 'the stuck order is moved to READY')
        const historyLen = migrated.stageHistory.length
        await setupApp()
        const again = await BookOrderModel.findById(stuck._id).lean()
        ok(again.stageHistory.length === historyLen, 'a second boot changes nothing')

        // ── 13 the staff "delivery problem" report follows the same rule ──────
        // Review finding F-02: the second way to fail a delivery left the stage.
        console.log('\n13 — a staff-reported delivery problem also returns to READY')
        const problem = await BookOrderModel.create(
            baseOrder('D4', {
                isPickUp: false,
                isDelivery: true,
                stage: { status: ORDER_STATUS.OUT_FOR_DELIVERY },
                deliveryAddress: { label: 'Home', address: '7 Marine Road', landmark: 'Opposite the blue mosque' },
                dispatchDetails: { delivery: { rider: rider._id, status: DELIVERY_STATUS.OUT_FOR_DELIVERY } },
            }),
        )
        created.orderIds.push(problem._id)
        const UtilService = require('./services/util.service')
        const reported = await new UtilService().reportDeliveryIssue({
            params: { id: problem._id.toString() },
            body: { issueType: 'delivery_problem', note: 'Wrong address' },
            user: { id: officeStaff._id.toString() },
        })
        ok(reported.success === true, 'the issue is reported')
        const afterProblem = await BookOrderModel.findById(problem._id).lean()
        ok(afterProblem.stage.status === ORDER_STATUS.READY, 'the order is back at READY')
        ok(
            afterProblem.stageHistory.at(-1)?.note === 'Delivery failed: Wrong address',
            'with the reason in the history',
        )
        const qp = unwrap(await intake.getDeliverableOrders({ query: { legStatus: 'failed' } }))
        ok(
            (qp?.data || []).some((o) => o.oscNumber === `OSC-STG${STAMP}-D4`),
            'and it is in the failed-deliveries view',
        )

        // ── 14 the cancel verdict on real order reads ─────────────────────────
        // F-01: the verdict must not hide the stored cancellation record.
        // F-03: a pending request must stop "request cancellation" being offered.
        console.log('\n14 — the cancel verdict on the customer order reads')
        const CancellationRequestModel = require('./models/cancellationRequest.model')
        const books = book
        const cancelled = await BookOrderModel.create(
            baseOrder('C1', {
                stage: { status: ORDER_STATUS.CANCELLED },
                cancellation: { cancelledAt: new Date(), reason: 'Changed my mind', tier: 'green', cashRefunded: 5000 },
            }),
        )
        const amberOrder = await BookOrderModel.create(
            baseOrder('C2', {
                stage: { status: ORDER_STATUS.QUEUE },
                dispatchDetails: { pickup: { status: PICKUP_STATUS.PICKED_UP } },
            }),
        )
        created.orderIds.push(cancelled._id, amberOrder._id)
        // Outside the free-cancel grace window, or a fresh order reads green.
        await BookOrderModel.collection.updateOne(
            { _id: amberOrder._id },
            { $set: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
        )
        const readOne = async (id) =>
            unwrap(await books.getBookOrder({ params: { id: id.toString() }, user: { id: customer._id.toString() } }))
        const c1 = await readOne(cancelled._id)
        ok(c1?.cancellation?.cashRefunded === 5000, 'the stored cancellation record is still returned')
        ok(c1?.cancellationVerdict?.tier === 'none', 'beside the verdict, which says nothing more can be done')
        const before = await readOne(amberOrder._id)
        ok(before?.cancellationVerdict?.canRequest === true, 'an amber order offers a request')
        const req = await CancellationRequestModel.create({
            orderId: amberOrder._id,
            userId: customer._id,
            reason: 'STG pending request',
        })
        try {
            const single = await readOne(amberOrder._id)
            ok(
                single?.cancellationVerdict?.canRequest === false &&
                    single?.cancellationVerdict?.requestPending === true,
                'once a request is pending, the single read stops offering another',
            )
            const hist = unwrap(
                await books.getBookOrderHistory({
                    query: { limit: 50 },
                    user: { id: customer._id.toString(), userType: ROLE.USER },
                }),
            )
            const histRow = (hist?.data || []).find((o) => String(o._id) === String(amberOrder._id))
            ok(
                histRow?.cancellationVerdict?.requestPending === true &&
                    histRow?.cancellationVerdict?.canRequest === false,
                'and so does the history list',
            )
            const histCancelled = (hist?.data || []).find((o) => String(o._id) === String(cancelled._id))
            ok(histCancelled?.cancellation?.cashRefunded === 5000, 'the history list keeps the stored record too')
        } finally {
            await CancellationRequestModel.deleteOne({ _id: req._id })
        }
    } finally {
        const o = await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        const u = await UserModel.deleteMany({ _id: { $in: created.userIds } })
        const n = await NotificationModel.deleteMany({ userId: { $in: created.userIds } })
        const a = await ActivityModel.deleteMany({ reference: { $regex: `OSC-STG${STAMP}` } })
        const al = await AuditLogModel.deleteMany({ userId: { $in: created.userIds } })
        console.log(
            `\ncleanup: ${o.deletedCount} orders, ${u.deletedCount} users, ${n.deletedCount} notifications, ${a.deletedCount} activities, ${al.deletedCount} audit rows`,
        )
        const leftover = await BookOrderModel.countDocuments({
            oscNumber: { $regex: `OSC-STG${STAMP}` },
        })
        ok(leftover === 0, 'no staging orders left behind')
        await mongoose.disconnect()
    }
    console.log(`\n${PASS} passed, ${FAIL} failed\n`)
    process.exit(FAIL ? 1 : 0)
}

main().catch(async (e) => {
    console.error('HARNESS ERROR:', e)
    try {
        await mongoose.disconnect()
    } catch (_) {}
    process.exit(1)
})
