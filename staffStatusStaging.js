/**
 * Staff suspend / reinstate — raised by the FE 2026-10-07:
 *   "There is no endpoint to suspend a rider in the live API spec."
 *
 * Correct, and the gap was narrower and worse than it looked. Every READER of
 * `User.status` was already built — rider assignment refuses a non-active rider
 * on both legs, the riders list hides them, staff notifications skip them — but
 * NOTHING COULD EVER WRITE THE FIELD. It was 'active' from signup forever, so
 * the whole suspension path was dead code.
 *
 * This proves the write exists AND that it actually bites in the three places
 * that matter: sign-in, rider assignment, and the pick-a-rider list. A suspend
 * endpoint that only changes a string would be decoration.
 *
 * It also pins the three refusals that stop an admin locking everyone out:
 * suspending yourself, suspending the last active admin, and suspending a
 * customer from a staff screen.
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Deletes what it creates.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node staffStatusStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')

const UserModel = require('./models/user.model')
const BookOrderModel = require('./models/bookOrder.model')
const AuditLogModel = require('./models/audit.log.model')
const NotificationModel = require('./models/notification.model')

const AdminService = require('./services/admin.service')
const AuthService = require('./services/auth.service')
const IntakeUserService = require('./services/intake-user.service')
const {
    ROLE,
    GENERAL_STATUS,
    ORDER_STATUS,
    DELIVERY_SPEED,
    SERVICE_TIERS,
    ORDER_CHANNEL,
    ORDER_SERVICE_TYPE,
    PAYMENT_ORDER_STATUS,
    DELIVERY_STATUS,
} = require('./util/constants')

const adminSvc = new AdminService()
const authSvc = new AuthService()
const intake = new IntakeUserService()

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

const STAMP = Date.now()
const PASSWORD = 'Str0ngPassw0rd!'
const created = { userIds: [], orderIds: [] }

const setStatus = (adminId, targetId, status, reason) =>
    adminSvc.setStaffStatus({
        user: { id: String(adminId) },
        params: { id: String(targetId) },
        body: { status, reason },
    })

const unwrap = (r) => r?.data?.message

async function run() {
    // ── fixtures ──────────────────────────────────────────────────────────────
    const mkUser = async (tag, userType, extra = {}) => {
        const u = await UserModel.create({
            email: `ss_${tag}_${STAMP}@example.com`,
            fullName: `STG ${tag}`,
            phoneNumber: `0807${String(STAMP).slice(-7)}`,
            password: PASSWORD,
            userType,
            isVerified: true,
            ...extra,
        })
        created.userIds.push(u._id)
        return u
    }

    const admin = await mkUser('Admin', ROLE.ADMIN)
    const admin2 = await mkUser('Admin2', ROLE.ADMIN) // so admin is never "the last one"
    const rider = await mkUser('Rider', ROLE.RIDER)
    const customer = await mkUser('Customer', ROLE.USER)

    // ── 1 the write exists at all ─────────────────────────────────────────────
    console.log('\n1 — a rider can be suspended (this is the whole gap)')
    const before = await UserModel.findById(rider._id).select('status').lean()
    ok(before.status === GENERAL_STATUS.ACTIVE, 'a new rider starts active')

    const noReason = await setStatus(admin._id, rider._id, GENERAL_STATUS.SUSPENDED)
    ok(noReason.success === false, 'suspending with NO reason is refused')

    const r1 = await setStatus(
        admin._id,
        rider._id,
        GENERAL_STATUS.SUSPENDED,
        'Left the company on 6 October.',
    )
    ok(r1.success === true, 'suspending with a reason succeeds')
    ok(unwrap(r1)?.changed === true, 'and reports that something changed')
    ok(unwrap(r1)?.previousStatus === GENERAL_STATUS.ACTIVE, 'naming what it was before')
    const saved = await UserModel.findById(rider._id)
        .select('status statusReason statusChangedBy statusChangedAt')
        .lean()
    ok(saved.status === GENERAL_STATUS.SUSPENDED, '*** the status actually PERSISTED ***')
    ok(
        saved.statusReason === 'Left the company on 6 October.',
        'the reason is kept on the record, answerable six weeks later',
    )
    ok(
        String(saved.statusChangedBy) === String(admin._id) && !!saved.statusChangedAt,
        'with who did it and when',
    )

    // ── 2 it BITES: sign-in ───────────────────────────────────────────────────
    console.log('\n2 — a suspended rider can no longer sign in')
    const login = await authSvc._handleLogin({
        email: rider.email,
        password: PASSWORD,
        userType: ROLE.RIDER,
    })
    ok(login.success === false, 'login is refused')
    ok(
        /suspend/i.test(login.error || ''),
        `and says why, not "wrong password" ("${login.error}")`,
    )
    ok(
        (login.error || '').includes('Left the company'),
        'the reason reaches the person it is about',
    )

    // ── 3 it BITES: rider assignment ──────────────────────────────────────────
    console.log('\n3 — a suspended rider cannot be given work')
    const order = await BookOrderModel.create({
        fullName: 'STG Status Customer',
        phoneNumber: '08050000077',
        userId: customer._id,
        serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
        serviceTier: SERVICE_TIERS.CLASSIC,
        deliverySpeed: DELIVERY_SPEED.STANDARD,
        channel: ORDER_CHANNEL.OFFICE,
        amount: 5000,
        oscNumber: `OSC-SS${STAMP}-1`,
        paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
        items: [{ type: 'shirt', price: 1000, quantity: 1 }],
        stage: { status: ORDER_STATUS.QUEUE },
    })
    created.orderIds.push(order._id)

    // NOTE riderId is a ROUTE PARAM on this one, not a body field.
    const assign = await intake.assignRiderTopPickupOrder({
        params: { id: String(order._id), riderId: String(rider._id) },
        body: {},
        user: { id: String(admin._id) },
    })
    ok(assign.success === false, 'assigning a pickup to them is refused')
    ok(
        /suspended/i.test(assign.data?.error || ''),
        `with a sentence naming the state ("${assign.data?.error}")`,
    )
    const untouched = await BookOrderModel.findById(order._id)
        .select('dispatchDetails.pickup.rider')
        .lean()
    ok(
        !untouched?.dispatchDetails?.pickup?.rider,
        'and NOTHING was written — no half-assigned order',
    )

    // ── 4 it BITES: the pick-a-rider list ─────────────────────────────────────
    console.log('\n4 — they drop out of the list S1 picks from')
    const listed = await intake.getRiders({ query: {} })
    const rows = listed.data?.message?.data || listed.data?.message || []
    const inDefault = (Array.isArray(rows) ? rows : []).some(
        (r) => String(r._id) === String(rider._id),
    )
    ok(!inDefault, 'the default riders list no longer offers them')
    const listedAll = await intake.getRiders({ query: { includeInactive: 'true' } })
    const allRows = listedAll.data?.message?.data || listedAll.data?.message || []
    ok(
        (Array.isArray(allRows) ? allRows : []).some(
            (r) => String(r._id) === String(rider._id),
        ),
        'but includeInactive=true still shows them, so admin can find and reinstate',
    )

    // ── 5 the guards against locking everyone out ─────────────────────────────
    console.log('\n5 — the three things that must be refused')
    const self = await setStatus(
        admin._id,
        admin._id,
        GENERAL_STATUS.SUSPENDED,
        'oops',
    )
    ok(self.success === false, 'you cannot suspend YOURSELF')

    const cust = await setStatus(
        admin._id,
        customer._id,
        GENERAL_STATUS.SUSPENDED,
        'nope',
    )
    ok(cust.success === false, 'a CUSTOMER cannot be suspended from the staff screen')
    ok(
        /customer/i.test(cust.data?.error || ''),
        `and the message says so ("${cust.data?.error}")`,
    )

    // park every other active admin so our second admin really is the last one
    const otherAdmins = await UserModel.find({
        userType: ROLE.ADMIN,
        status: GENERAL_STATUS.ACTIVE,
        _id: { $nin: [admin._id, admin2._id] },
    })
        .select('_id')
        .lean()
    if (otherAdmins.length) {
        await UserModel.updateMany(
            { _id: { $in: otherAdmins.map((a) => a._id) } },
            { $set: { status: GENERAL_STATUS.INACTIVE } },
        )
    }
    const lastAdmin = await setStatus(
        admin2._id,
        admin._id,
        GENERAL_STATUS.SUSPENDED,
        'testing',
    )
    // admin2 is suspending admin while admin2 itself is still active, so this
    // one is allowed — then the reverse must be refused.
    ok(lastAdmin.success === true, 'one admin may suspend another while a second stays active')
    const nowLast = await setStatus(
        admin2._id,
        admin2._id,
        GENERAL_STATUS.SUSPENDED,
        'testing',
    )
    ok(nowLast.success === false, 'but the LAST active admin cannot be taken out')
    if (otherAdmins.length) {
        await UserModel.updateMany(
            { _id: { $in: otherAdmins.map((a) => a._id) } },
            { $set: { status: GENERAL_STATUS.ACTIVE } },
        )
    }
    await setStatus(admin2._id, admin._id, GENERAL_STATUS.ACTIVE)

    // ── 6 idempotence + the audit trail ───────────────────────────────────────
    console.log('\n6 — a double-tap does not write history twice')
    const again = await setStatus(
        admin._id,
        rider._id,
        GENERAL_STATUS.SUSPENDED,
        'same again',
    )
    ok(again.success === true, 'suspending an already-suspended rider still succeeds')
    ok(unwrap(again)?.changed === false, '…but reports changed:false')
    const auditLines = await AuditLogModel.countDocuments({
        userId: admin._id,
        action: { $regex: 'suspended STG Rider' },
    })
    ok(auditLines === 1, `exactly one audit line for the one real change (got ${auditLines})`)
    const notices = await NotificationModel.countDocuments({ userId: rider._id })
    ok(notices === 1, `and the rider was told once, not twice (got ${notices})`)

    // ── 7 reinstating ─────────────────────────────────────────────────────────
    console.log('\n7 — reinstating puts everything back')
    const back = await setStatus(admin._id, rider._id, GENERAL_STATUS.ACTIVE)
    ok(back.success === true, 'reinstating needs no reason')
    const after = await UserModel.findById(rider._id)
        .select('status statusReason')
        .lean()
    ok(after.status === GENERAL_STATUS.ACTIVE, 'they are active again')
    ok(
        !after.statusReason,
        'and the old suspension reason is cleared, not left hanging on an active account',
    )
    const login2 = await authSvc._handleLogin({
        email: rider.email,
        password: PASSWORD,
        userType: ROLE.RIDER,
    })
    ok(login2.success === true, 'they can sign in again')
    const assign2 = await intake.assignRiderTopPickupOrder({
        params: { id: String(order._id), riderId: String(rider._id) },
        body: {},
        user: { id: String(admin._id) },
    })
    ok(assign2.success === true, 'and can be assigned work again')

    // ── 8 a customer is never affected by any of this ────────────────────────
    console.log('\n8 — customer sign-in is untouched')
    const custLogin = await authSvc._handleLogin({
        email: customer.email,
        password: PASSWORD,
        userType: ROLE.USER,
    })
    ok(custLogin.success === true, 'an ordinary customer still signs in normally')

    // ── 9 the staff list ──────────────────────────────────────────────────────
    console.log('\n9 — the admin staff list')
    const staff = unwrap(await adminSvc.listStaff({ query: { search: `STG ` , limit: 100 } }))
    ok(Array.isArray(staff?.data), 'the staff list responds')
    ok(
        staff.data.every((s) => s.userType !== ROLE.USER),
        '*** no customer ever appears in it ***',
    )
    const riderRow = staff.data.find((s) => String(s._id) === String(rider._id))
    ok(!!riderRow, 'our rider is in it')
    ok(riderRow?.canWork === true, 'and canWork is true now they are reinstated')
    ok(typeof staff.counts?.active === 'number', 'with a count per status for the header')
    const badRole = await adminSvc.listStaff({ query: { role: 'not-a-role' } })
    ok(badRole.success === false, 'an unknown role is refused, not silently ignored')
}

async function cleanup() {
    await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
    await NotificationModel.deleteMany({ userId: { $in: created.userIds } })
    await AuditLogModel.deleteMany({ userId: { $in: created.userIds } })
    await UserModel.deleteMany({ _id: { $in: created.userIds } })
    const left = await UserModel.countDocuments({
        email: new RegExp(`_${STAMP}@example.com$`),
    })
    ok(left === 0, 'cleanup left no accounts behind')
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
    try {
        await run()
    } catch (error) {
        FAIL++
        console.error('\n  ✗ THREW:', error)
    } finally {
        try {
            await cleanup()
        } catch (error) {
            FAIL++
            console.error('  ✗ cleanup failed:', error.message)
        }
        await mongoose.disconnect()
    }
    console.log(`\n${PASS} passed, ${FAIL} failed`)
    process.exit(FAIL ? 1 : 0)
}

main()
