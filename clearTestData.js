/**
 * THE SUNDAY DATA CLEAR — client instructions of 15 Oct 2026 (they supersede B41).
 * Written plan: blueprint/context/SUNDAY-DATA-CLEAR-PLAN.md. Run ONLY after the
 * client says "go" on Sunday evening AND the user confirms in the chat.
 *
 * "CLEAR EVERYTHING that is test data: all customers, staff and rep accounts,
 *  orders, payments, holds, wallets and credit, subscriptions, referral codes and
 *  records, leads and CRM message queues, complaints, feedback, notifications and
 *  the reports built from them. KEEP ONLY: my own admin login, and the settings
 *  (items and prices, offers, plans, windows, hold types, display names, limits,
 *  message templates)."  Admin: Ijeomahikechukwup@gmail.com ("only I will have
 *  the password"). Expenses and supplies: clear. Order numbers start again at 001.
 *
 * STEPS (all printed; dry run changes nothing):
 *   1. Requires a VERIFIED backup of this database from today (backupDb.js) —
 *      pass its folder with --backup <folder>.
 *   2. Paystack: every subscription still active on Paystack is switched off
 *      (the client's Student Plan test included), before the records go.
 *   3. Deletes every user except the client's admin, and that account becomes
 *      the admin (it keeps the password they chose; "Forgot password" works too).
 *   4. Empties every test-data collection (list below); keeps the settings.
 *   5. Sets the order serial back to 0, so the next order is OSC-<date>-001.
 *
 *   node clearTestData.js --backup <folder>                       dry run
 *   node clearTestData.js --backup <folder> --execute             testing DB
 *   CLEAR_LIVE="CLEAR CHUVI LIVE DATA" node clearTestData.js --backup <folder> --execute    LIVE
 *
 * The database URI is never printed, only its name.
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

const KEEP_ADMIN_EMAIL = (process.env.CLEAR_KEEP_ADMIN || 'ijeomahikechukwup@gmail.com').toLowerCase()

const EMPTY = [
    'bookorders', 'orders', 'payments', 'wallets', 'wallettransactions', 'walletcredits',
    'walletadjustmentrequests', 'updatefunds', 'customeroffers', 'referrals', 'referralstats',
    'subscriptions', 'freeplans', 'conversations', 'chatmessages', 'complaintcases', 'feedbacks',
    'crmprofiles', 'crmscheduledmessages', 'crmmessagelogs', 'communicationlogs', 'notifications',
    'activities', 'auditlogs', 'cancellationrequests', 'caretasks', 'queuedsms', 'signupattempts',
    'windowdeflections', 'staffs', 'expenses', 'supplies',
]
const KEEP = [
    'orderitems', 'itemsets', 'offers', 'plans', 'bookingwindows', 'holdtypes', 'complainttypes',
    'adminsettings', 'adminorderdetails', 'crmsettings', 'rewardsettings', 'templates', 'hubs',
    'expensecategories',
]

const arg = (name) => {
    const i = process.argv.indexOf(name)
    return i > -1 ? process.argv[i + 1] : null
}

async function main() {
    const execute = process.argv.includes('--execute')
    const url = process.env.MONGODB_URL
    if (!url) throw new Error('MONGODB_URL is not set')
    const dbName = (url.match(/\/([A-Za-z0-9_-]+)(\?|$)/) || [])[1] || '<unknown>'
    const live = /laundrydb/i.test(dbName)
    console.log(`Database: ${dbName}${live ? '  (LIVE)' : ''}`)
    console.log(execute ? 'Mode: EXECUTE' : 'Mode: dry run (counts only, nothing changes)')
    if (execute && live && process.env.CLEAR_LIVE !== 'CLEAR CHUVI LIVE DATA') {
        console.error('Refusing to clear the LIVE database without CLEAR_LIVE="CLEAR CHUVI LIVE DATA".')
        process.exit(2)
    }

    // 1. A verified backup of THIS database, taken today.
    const backup = arg('--backup')
    if (execute) {
        const mf = backup && path.join(backup, 'manifest.json')
        if (!mf || !fs.existsSync(mf)) {
            console.error('Refusing: pass --backup <folder> with a backup made by backupDb.js.')
            process.exit(2)
        }
        const m = JSON.parse(fs.readFileSync(mf, 'utf8'))
        const ageH = (Date.now() - new Date(m.at).getTime()) / 3600000
        if (m.db !== dbName || ageH > 12) {
            console.error(`Refusing: the backup is of "${m.db}" from ${m.at}; it must be of "${dbName}" and less than 12 hours old.`)
            process.exit(2)
        }
        console.log(`Backup: ${backup} (${m.db}, ${m.at})`)
    }

    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })
    const db = mongoose.connection.db
    const existing = new Set((await db.listCollections().toArray()).map((c) => c.name))
    const users = db.collection('users')

    // The client's admin must exist before anything else goes.
    const admin = await users.findOne({ email: KEEP_ADMIN_EMAIL })
    console.log(`\nAdmin to keep: ${KEEP_ADMIN_EMAIL} → ${admin ? `found (now ${admin.userType})` : 'NOT FOUND'}`)
    if (!admin) {
        console.error('Refusing: the admin account to keep does not exist. Nothing changed.')
        await mongoose.disconnect()
        process.exit(2)
    }

    // 2. Paystack: switch off every subscription still running there.
    console.log('\nPaystack subscriptions:')
    // A rehearsal on a copy sets CLEAR_SKIP_PAYSTACK=1 so Paystack is never touched.
    const skipPaystack = process.env.CLEAR_SKIP_PAYSTACK === '1'
    if (skipPaystack) console.log('  skipped (CLEAR_SKIP_PAYSTACK=1)')
    const subs = skipPaystack ? [] : existing.has('subscriptions') ? await db.collection('subscriptions').find({ subscriptionCode: { $exists: true, $ne: null } }).toArray() : []
    if (!subs.length) console.log('  none on record')
    const paystack = require('./services/paystack.client.service')
    for (const s of subs) {
        let state = 'unknown'
        try {
            const r = await paystack.get(`/subscription/${s.subscriptionCode}`, { timeout: 15000 })
            const ps = r.data?.data
            state = ps?.status || 'unknown'
            const running = ps && !['cancelled', 'complete', 'completed', 'non-renewing'].includes(ps.status)
            if (running && execute) {
                await paystack.post('/subscription/disable', { code: s.subscriptionCode, token: s.paystackEmailToken || ps.email_token }, { timeout: 15000 })
                state = `${ps.status} → disabled`
            } else if (running) {
                state = `${ps.status} → would disable`
            }
        } catch (e) {
            state = `could not check (${e?.response?.data?.message || e.message})`
        }
        console.log(`  ${s.subscriptionCode}  ${state}`)
    }

    // 3. Users: only the client's admin stays.
    const toDelete = await users.countDocuments({ _id: { $ne: admin._id } })
    console.log(`\nUsers: ${toDelete} ${execute ? 'deleted' : 'would be deleted'}; ${KEEP_ADMIN_EMAIL} kept as admin`)
    if (execute) {
        await users.deleteMany({ _id: { $ne: admin._id } })
        await users.updateOne(
            { _id: admin._id },
            {
                $set: { userType: 'admin', status: 'active', isVerified: true, notAvailableCount: 0 },
                $unset: { recountMismatches: '', statusReason: '', otp: '', otpExpiresAt: '' },
            },
        )
    }

    // 4. Test data.
    console.log('\nTo EMPTY:')
    let total = toDelete
    for (const name of EMPTY) {
        if (!existing.has(name)) continue
        const n = await db.collection(name).countDocuments()
        total += n
        if (execute) await db.collection(name).deleteMany({})
        console.log(`  ${name.padEnd(26)} ${String(n).padStart(7)}${execute ? '  deleted' : ''}`)
    }

    // 5. Order serial back to 0.
    if (execute) await db.collection('counters').updateOne({ _id: 'orderSerial' }, { $set: { seq: 0 } }, { upsert: true })
    const today = new Date()
    const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
    console.log(`\nOrder serial: ${execute ? 'set to 0' : 'would be set to 0'} → next order OSC-${ymd}-001 (the date is the order's own day)`)

    console.log('\nKEPT (untouched):')
    for (const name of KEEP) {
        if (!existing.has(name)) continue
        console.log(`  ${name.padEnd(26)} ${String(await db.collection(name).countDocuments()).padStart(7)}`)
    }
    const unlisted = [...existing].filter((n) => !EMPTY.includes(n) && !KEEP.includes(n) && !['users', 'counters'].includes(n) && !n.startsWith('system.'))
    if (unlisted.length) console.log(`\nNOT LISTED (left untouched, check them): ${unlisted.join(', ')}`)

    console.log(`\n${execute ? 'Cleared' : 'Would clear'} ${total} records. Settings and ${KEEP_ADMIN_EMAIL} kept.`)
    await mongoose.disconnect()
}

main().then(
    () => process.exit(0),
    (e) => {
        console.error('clear failed:', e.message)
        process.exit(1)
    },
)
