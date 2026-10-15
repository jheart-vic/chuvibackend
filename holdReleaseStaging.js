/**
 * Admin-only hold release (R15, client V1 test plan T3.04 / T5.08) — DB verification.
 *
 *   1  Intake cannot release the count-mismatch hold: "Only admin can release
 *      this.", requiresAdmin, and the order stays on hold
 *   2  an admin releases the same hold through the same endpoint
 *   3  Intake cannot release a payment hold (it clears by payment, Mark paid or
 *      an admin waiver); an admin still can
 *   4  an ordinary Intake hold is still released by Intake
 *   5  a station (QC) cannot release a piece held under an admin-only type, but
 *      still releases a piece held under an ordinary type
 *
 * SMS stubbed. SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production
 * without STAGING_FORCE=1; hard-refuses laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node holdReleaseStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: async () => ({ stubbed: true }) }
const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const HoldTypeModel = require('./models/holdType.model')
const IntakeUserService = require('./services/intake-user.service')
const QcService = require('./services/qc.service')
const { raiseCountMismatchHold } = require('./util/countMismatchHold')
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
    const created = { orders: [], users: [] }
    const intake = new IntakeUserService()
    try {
        const countType = await HoldTypeModel.findOne({ key: 'count_differs_from_rider' }).lean()
        if (!countType?.requiresAdminApproval) {
            console.log('SKIPPED (count_differs_from_rider hold type not seeded as admin-only).')
            return
        }

        const mkUser = async (userType, n) => {
            const u = await UserModel.collection.insertOne({
                fullName: `STG HR ${userType} ${ts}`,
                email: `stg-hr-${n}-${ts}@example.com`,
                phoneNumber: `0809${String(ts).slice(-6)}${n}`,
                userType,
                createdAt: new Date(),
            })
            created.users.push(u.insertedId)
            return String(u.insertedId)
        }
        const s1 = await mkUser(C.ROLE.INTAKE_AND_TAG, 1)
        const admin = await mkUser(C.ROLE.ADMIN, 2)
        const qc = await mkUser(C.ROLE.QC, 3)

        let n = 0
        const mkOrder = async (extra = {}, itemExtra = {}) => {
            n++
            const r = await BookOrderModel.collection.insertOne({
                fullName: 'STG HR customer',
                phoneNumber: '08090000000',
                amount: 1200,
                oscNumber: `STGHR${ts}${n}`,
                serviceType: C.ORDER_SERVICE_TYPE.WASH_AND_IRON,
                items: [
                    { _id: new mongoose.Types.ObjectId(), type: 'Shirt', price: 600, quantity: 1, actionLog: [], ...itemExtra },
                    { _id: new mongoose.Types.ObjectId(), type: 'Shirt', price: 600, quantity: 1, actionLog: [] },
                ],
                stage: { status: C.ORDER_STATUS.QUEUE, note: '', updatedAt: new Date() },
                stageHistory: [],
                stationStatus: C.STATION_STATUS.INTAKE_AND_TAG_STATION,
                paymentStatus: C.PAYMENT_ORDER_STATUS.SUCCESS,
                handoffs: [],
                createdAt: new Date(),
                ...extra,
            })
            created.orders.push(r.insertedId)
            return r.insertedId
        }
        const release = (svc, orderId, userId, userType, body = {}) =>
            svc.releaseFromHold({ params: { id: String(orderId) }, user: { id: userId, userType }, body: { note: 'STG fixed', ...body } })
        const stage = async (id) => (await BookOrderModel.findById(id).lean()).stage.status

        console.log('\n1. Intake cannot release the count-mismatch hold')
        const o1 = await mkOrder()
        await raiseCountMismatchHold({ order: { _id: o1, oscNumber: `STGHR${ts}1` }, riderCount: 11, intakeCount: 10, actorId: s1 })
        ok((await stage(o1)) === C.ORDER_STATUS.HOLD, 'order is on the count-mismatch hold')
        const r1 = await release(intake, o1, s1, C.ROLE.INTAKE_AND_TAG)
        ok(!r1.success && r1.data?.error === 'Only admin can release this.', `refused with the client's sentence (${r1.data?.error})`)
        ok(r1.data?.requiresAdmin === true, 'requiresAdmin flag set for the front end')
        ok((await stage(o1)) === C.ORDER_STATUS.HOLD, 'order is still on hold')

        console.log('\n2. An admin releases it')
        const r2 = await release(intake, o1, admin, C.ROLE.ADMIN)
        ok(r2.success, `admin release succeeds (${r2.data?.error || 'ok'})`)
        ok((await stage(o1)) === C.ORDER_STATUS.QUEUE, 'order back in the tagging queue')

        console.log('\n3. Payment hold is not Intake\'s to release')
        const payHold = {
            stage: { status: C.ORDER_STATUS.HOLD, note: 'Awaiting payment', updatedAt: new Date() },
            orderHold: { holdTypeKey: HoldTypeModel.PAYMENT_HOLD_KEY },
            paymentHold: { raisedAt: new Date(), amount: 1200, remindersSent: [] },
            paymentStatus: C.PAYMENT_ORDER_STATUS.PENDING,
        }
        const o3 = await mkOrder(payHold)
        const r3 = await release(intake, o3, s1, C.ROLE.INTAKE_AND_TAG)
        ok(!r3.success && r3.data?.requiresPayment === true, `Intake refused (${r3.data?.error})`)
        ok((await stage(o3)) === C.ORDER_STATUS.HOLD, 'unpaid order stays in Payment holds')
        const r3b = await release(intake, o3, admin, C.ROLE.ADMIN)
        ok(r3b.success, 'admin can still release it')

        console.log('\n4. An ordinary Intake hold is still Intake\'s to release')
        const o4 = await mkOrder({
            stage: { status: C.ORDER_STATUS.HOLD, note: 'flagged', updatedAt: new Date() },
            orderHold: { holdTypeKey: 'other' },
        })
        const r4 = await release(intake, o4, s1, C.ROLE.INTAKE_AND_TAG)
        ok(r4.success, `Intake releases an "other" hold (${r4.data?.error || 'ok'})`)
        ok((await stage(o4)) === C.ORDER_STATUS.QUEUE, 'order back in the tagging queue')

        console.log('\n5. Station piece holds follow the hold type')
        const heldAt = (reason) => ({
            currentStation: C.STATION_STATUS.QC_STATION,
            flaggedForReview: true,
            holdDetails: { reason, note: 'stg', assignTo: C.ROLE.QC, heldAt: new Date(), heldByStation: C.STATION_STATUS.QC_STATION },
        })
        const o5 = await mkOrder({ stationStatus: C.STATION_STATUS.QC_STATION, stage: { status: C.ORDER_STATUS.QC, note: '', updatedAt: new Date() } }, heldAt('count_differs_from_rider'))
        const r5 = await release(QcService, o5, qc, C.ROLE.QC)
        ok(!r5.success && r5.data?.error === 'Only admin can release this.', `QC refused on an admin-only piece hold (${r5.data?.error})`)
        const still = (await BookOrderModel.findById(o5).lean()).items[0].holdDetails
        ok(still?.heldAt && !still?.releasedAt, 'the piece is still held')
        const o6 = await mkOrder({ stationStatus: C.STATION_STATUS.QC_STATION, stage: { status: C.ORDER_STATUS.QC, note: '', updatedAt: new Date() } }, heldAt('quality_not_met'))
        const r6 = await release(QcService, o6, qc, C.ROLE.QC)
        ok(r6.success, `QC releases an ordinary piece hold (${r6.data?.error || 'ok'})`)
        const freed = (await BookOrderModel.findById(o6).lean()).items[0].holdDetails
        ok(!!freed?.releasedAt, 'the piece is released')
    } finally {
        const ActivityModel = require('./models/activity.model')
        const NotificationModel = require('./models/notification.model')
        const AuditModel = require('./models/audit.log.model')
        await ActivityModel.deleteMany({ orderId: { $in: created.orders } }).catch(() => {})
        await AuditModel.deleteMany({ orderId: { $in: created.orders } }).catch(() => {})
        await NotificationModel.deleteMany({ body: new RegExp(`STGHR${ts}`) }).catch(() => {})
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        await UserModel.deleteMany({ _id: { $in: created.users } })
        await mongoose.disconnect()
        console.log(`holdReleaseStaging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
    }
}

main().then(
    () => process.exit(FAIL ? 1 : 0),
    (e) => {
        console.error(e)
        process.exit(1)
    },
)
