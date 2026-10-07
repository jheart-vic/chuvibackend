/**
 * Wallet adjustment limits + approval — client brief 6 Oct 2026, item 2.4
 * (and the ledger half of 2.3).
 *
 * Runs the client's OWN test:
 *   "With the limit at ₦5,000, adjust a test wallet by ₦3,000. It goes through.
 *    Then try ₦10,000. It becomes a request, and the wallet changes only after
 *    the admin approves. Then raise the limit to ₦10,000 in settings, and the
 *    same ₦10,000 adjustment goes through."
 *
 * Scenarios:
 *   1  ₦3,000 within the ₦5,000 limit   → applied, ledger line written
 *   2  ₦10,000 over the limit           → request created, WALLET UNCHANGED
 *   3  admin approves                   → money moves, identical ledger shape
 *   4  approving twice                  → refused, pays only once
 *   5  raise the limit in SETTINGS      → the same ₦10,000 now goes straight
 *   6  reject a request                 → no money, operator told why
 *   7  reject with no note              → refused (the operator needs a reason)
 *   8  a role with NO limit configured  → everything becomes a request
 *   9  balance == sum of its ledger lines (the 2.3 invariant)
 *  10  a debit over the balance         → refused, nothing moved
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Restores the settings
 * it changes and deletes everything it creates.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node walletLimitStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const UserModel = require('./models/user.model')
const WalletModel = require('./models/wallet.model')
const WalletTransactionModel = require('./models/walletTransaction.model')
const WalletAdjustmentRequestModel = require('./models/walletAdjustmentRequest.model')
const BookOrderModel = require('./models/bookOrder.model')
const AdminSettingModel = require('./models/adminSetting.model')
const ActivityModel = require('./models/activity.model')
const AuditLogModel = require('./models/audit.log.model')
const NotificationModel = require('./models/notification.model')
const IntakeUserService = require('./services/intake-user.service')
const AdminService = require('./services/admin.service')
const WalletAdjustmentService = require('./services/walletAdjustment.service')
const { ROLE, WALLET_ADJUSTMENT_REQUEST_STATUS, WALLET_TX_TYPE } = require('./util/constants')

const intake = new IntakeUserService()
const adminSvc = new AdminService()
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

    const created = { userIds: [], orderIds: [], requestIds: [] }
    let settingsDoc = null
    let originalLimits = null
    try {
        settingsDoc = await AdminSettingModel.findOne()
        if (!settingsDoc) {
            console.log('SKIPPED — AdminSetting unseeded; boot the app once against this DB.')
            return
        }
        // Remember the live limits so the run leaves settings exactly as found.
        originalLimits = settingsDoc.walletAdjustmentLimits
            ? Object.fromEntries(settingsDoc.walletAdjustmentLimits)
            : undefined

        const setLimits = async (obj) => {
            await AdminSettingModel.updateOne(
                { _id: settingsDoc._id },
                { $set: { walletAdjustmentLimits: obj } },
            )
        }
        await setLimits({ [ROLE.INTAKE_AND_TAG]: 5000, [ROLE.CUSTOMER_EXPERIENCE]: 10000 })

        const stamp = Date.now()
        const customer = await UserModel.create({
            email: `wl_cust_${stamp}@example.com`,
            fullName: 'Wallet Limit Customer',
            userType: ROLE.USER,
        })
        const operator = await UserModel.create({
            email: `wl_op_${stamp}@example.com`,
            fullName: 'Ada Operator',
            userType: ROLE.INTAKE_AND_TAG,
        })
        const admin = await UserModel.create({
            email: `wl_admin_${stamp}@example.com`,
            fullName: 'The Admin',
            userType: ROLE.ADMIN,
        })
        const qcStaff = await UserModel.create({
            email: `wl_qc_${stamp}@example.com`,
            fullName: 'QC Person',
            userType: ROLE.QC, // deliberately has NO configured limit
        })
        created.userIds.push(customer._id, operator._id, admin._id, qcStaff._id)
        await WalletModel.create({ userId: customer._id, balance: 0 })

        const order = await BookOrderModel.create({
            userId: customer._id,
            fullName: 'Wallet Limit Customer',
            phoneNumber: '08000000000',
            serviceType: 'wash-and-iron',
            serviceTier: 'classic',
            deliverySpeed: 'standard',
            channel: 'website',
            amount: 4500,
            oscNumber: 'WLIM-' + stamp,
            paymentStatus: 'success',
            isPickUp: true,
            isDelivery: true,
            stage: { status: 'queue' },
            items: [{ type: 'shirt', price: 1, quantity: 1 }],
        })
        created.orderIds.push(order._id)

        const adjust = (amount, type, staff, msg = 'Refund for a damaged shirt') =>
            intake.adjustWallet({
                params: { id: String(order._id), userId: String(customer._id) },
                user: { id: String(staff._id) },
                body: { amount, type, message: msg },
            })
        const balance = async () =>
            (await WalletModel.findOne({ userId: customer._id }).lean()).balance

        // ── 1 ── within the limit ───────────────────────────────────────────
        console.log('\n[1] ₦3,000 with the limit at ₦5,000 → goes straight through')
        let r = await adjust(3000, 'credit', operator)
        ok(r.success === true, `accepted (${r.success ? 'ok' : r.data?.error})`)
        ok(unwrap(r)?.requiresApproval === false, 'no approval needed')
        ok((await balance()) === 3000, `wallet is ₦${await balance()}`)
        ok(!!unwrap(r)?.transaction?.id, 'a ledger line was written')
        ok(unwrap(r)?.transaction?.balanceAfter === 3000,
            'the ledger line records the balance after')

        // ── 2 ── over the limit ─────────────────────────────────────────────
        console.log('\n[2] ₦10,000 over the ₦5,000 limit → becomes a request, nothing moves')
        r = await adjust(10000, 'credit', operator)
        ok(r.success === true, 'the operator is told it was sent, not that it failed')
        ok(unwrap(r)?.requiresApproval === true, 'flagged as needing approval')
        ok(unwrap(r)?.roleLimit === 5000, `their limit is reported (₦${unwrap(r)?.roleLimit})`)
        const reqId = unwrap(r)?.requestId
        created.requestIds.push(reqId)
        ok(!!reqId, 'a request id came back')
        ok((await balance()) === 3000, `THE WALLET IS UNCHANGED at ₦${await balance()}`)
        const pending = await WalletAdjustmentRequestModel.findById(reqId).lean()
        ok(pending?.status === WALLET_ADJUSTMENT_REQUEST_STATUS.PENDING, 'the request is pending')
        ok(pending?.roleLimitAtRequest === 5000,
            'the limit at the time is stored on the request')
        ok(String(pending?.requestedBy) === String(operator._id) && !!pending?.reason,
            'who asked and why are recorded (item 2.4.5)')

        // it shows on the admin dashboard
        const queue = unwrap(await adminSvc.getWalletAdjustmentRequests({ query: {}, user: { id: String(admin._id) } }))
        ok((queue?.data || []).some((x) => String(x._id) === String(reqId)),
            'it appears in the admin queue')

        // ── 3 ── approve ────────────────────────────────────────────────────
        console.log('\n[3] the admin approves → the money moves')
        r = await adminSvc.approveWalletAdjustment({
            params: { id: String(reqId) },
            user: { id: String(admin._id) },
            body: { note: 'Checked against the complaint' },
        })
        ok(r.success === true, `approved (${r.success ? 'ok' : r.data?.error})`)
        ok((await balance()) === 13000, `wallet is now ₦${await balance()}`)
        const approved = await WalletAdjustmentRequestModel.findById(reqId).lean()
        ok(approved?.status === WALLET_ADJUSTMENT_REQUEST_STATUS.APPROVED, 'marked approved')
        ok(!!approved?.walletTransactionId,
            'the request points at the ledger line it produced')
        ok(approved?.balanceAfter === 13000, 'and records the resulting balance')
        const approvedTx = await WalletTransactionModel.findById(approved.walletTransactionId).lean()
        ok(approvedTx?.type === WALLET_TX_TYPE.MANUAL_ADJUSTMENT && approvedTx?.amount === 10000,
            'the approved adjustment has the SAME ledger shape as a within-limit one')

        // ── 4 ── no double pay ──────────────────────────────────────────────
        console.log('\n[4] approving the same request again')
        r = await adminSvc.approveWalletAdjustment({
            params: { id: String(reqId) },
            user: { id: String(admin._id) },
            body: {},
        })
        ok(r.success === false, `refused ("${r.data?.error}")`)
        ok((await balance()) === 13000, 'the customer was NOT paid twice')

        // ── 5 ── raise the limit in settings ────────────────────────────────
        console.log('\n[5] raise the limit to ₦10,000 in SETTINGS → the same adjustment goes straight')
        await setLimits({ [ROLE.INTAKE_AND_TAG]: 10000, [ROLE.CUSTOMER_EXPERIENCE]: 10000 })
        ok((await WalletAdjustmentService.getRoleLimit(ROLE.INTAKE_AND_TAG)) === 10000,
            'the new limit is read from settings, not from code')
        r = await adjust(10000, 'credit', operator)
        ok(r.success === true && unwrap(r)?.requiresApproval === false,
            'the same ₦10,000 now needs no approval')
        ok((await balance()) === 23000, `wallet is ₦${await balance()}`)

        // ── 6-7 ── rejection ────────────────────────────────────────────────
        console.log('\n[6-7] rejecting a request')
        await setLimits({ [ROLE.INTAKE_AND_TAG]: 5000 })
        r = await adjust(9000, 'credit', operator)
        const rejectId = unwrap(r)?.requestId
        created.requestIds.push(rejectId)
        const beforeReject = await balance()
        let rr = await adminSvc.rejectWalletAdjustment({
            params: { id: String(rejectId) },
            user: { id: String(admin._id) },
            body: {},
        })
        ok(rr.success === false && /note is required/i.test(rr.data?.error || ''),
            'rejecting with no note is refused — the operator needs a reason')
        rr = await adminSvc.rejectWalletAdjustment({
            params: { id: String(rejectId) },
            user: { id: String(admin._id) },
            body: { note: 'Ask for proof of payment first' },
        })
        ok(rr.success === true, 'rejected with a note')
        ok((await balance()) === beforeReject, 'no money moved on rejection')
        const rejected = await WalletAdjustmentRequestModel.findById(rejectId).lean()
        ok(rejected?.status === WALLET_ADJUSTMENT_REQUEST_STATUS.REJECTED, 'marked rejected')
        ok(rejected?.decisionNote === 'Ask for proof of payment first',
            'the reason is stored for the operator')

        // ── 8 ── a role with no configured limit ────────────────────────────
        console.log('\n[8] a role with NO limit in settings')
        ok((await WalletAdjustmentService.getRoleLimit(ROLE.QC)) === 0,
            'gets no self-service allowance (0), rather than an invented default')
        r = await adjust(100, 'credit', qcStaff)
        ok(unwrap(r)?.requiresApproval === true,
            'so even a small adjustment becomes a request')
        if (unwrap(r)?.requestId) created.requestIds.push(unwrap(r).requestId)
        ok((await WalletAdjustmentService.getRoleLimit(ROLE.ADMIN)) === Infinity,
            'while an admin is never limited')

        // ── 9 ── the 2.3 invariant ──────────────────────────────────────────
        console.log('\n[9] the balance equals the sum of its ledger lines')
        const lines = await WalletTransactionModel.find({ userId: customer._id }).lean()
        const sum = lines.reduce((t, l) => t + (l.amount || 0), 0)
        ok(sum === (await balance()),
            `₦${sum} of ledger lines == ₦${await balance()} balance, across ${lines.length} lines`)
        ok(lines.every((l) => !!l.reason && !!l.performedBy),
            'every adjustment line names a reason and who did it')

        // ── 10 ── an over-balance debit ─────────────────────────────────────
        console.log('\n[10] a debit larger than the balance')
        const before10 = await balance()
        r = await adjust(before10 + 5000, 'debit', operator)
        // over the limit → it becomes a request rather than failing outright
        ok(unwrap(r)?.requiresApproval === true, 'over the limit, so it is a request first')
        const bigDebitId = unwrap(r)?.requestId
        created.requestIds.push(bigDebitId)
        r = await adminSvc.approveWalletAdjustment({
            params: { id: String(bigDebitId) },
            user: { id: String(admin._id) },
            body: {},
        })
        ok(r.success === false && /insufficient/i.test(r.data?.error || ''),
            `approving it is refused ("${r.data?.error}")`)
        ok((await balance()) === before10, 'nothing moved')
        const backToPending = await WalletAdjustmentRequestModel.findById(bigDebitId).lean()
        ok(backToPending?.status === WALLET_ADJUSTMENT_REQUEST_STATUS.PENDING,
            'and the request returned to pending rather than reading as approved')
    } catch (e) {
        FAIL++
        console.log('\n  ✗ THREW:', e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)
    } finally {
        console.log('\nCleaning up…')
        if (settingsDoc) {
            // Put the settings back exactly as they were found.
            if (originalLimits === undefined) {
                await AdminSettingModel.updateOne(
                    { _id: settingsDoc._id },
                    { $unset: { walletAdjustmentLimits: '' } },
                )
            } else {
                await AdminSettingModel.updateOne(
                    { _id: settingsDoc._id },
                    { $set: { walletAdjustmentLimits: originalLimits } },
                )
            }
        }
        await WalletAdjustmentRequestModel.deleteMany({ userId: { $in: created.userIds } })
        await WalletTransactionModel.deleteMany({ userId: { $in: created.userIds } })
        await WalletModel.deleteMany({ userId: { $in: created.userIds } })
        await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        await ActivityModel.deleteMany({ orderId: { $in: created.orderIds } })
        await AuditLogModel.deleteMany({ userId: { $in: created.userIds } })
        await NotificationModel.deleteMany({ userId: { $in: created.userIds } })
        await UserModel.deleteMany({ _id: { $in: created.userIds } })
        const leftReq = await WalletAdjustmentRequestModel.countDocuments({
            userId: { $in: created.userIds },
        })
        const leftTx = await WalletTransactionModel.countDocuments({
            userId: { $in: created.userIds },
        })
        console.log(`  leftover requests: ${leftReq}, leftover ledger lines: ${leftTx}`)
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed\n`)
        process.exit(FAIL ? 1 : 0)
    }
}

main()
