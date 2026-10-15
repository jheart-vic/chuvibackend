/**
 * CLEAR THE TEST DATA — client step B41 (V1 launch, after the Sunday floor test).
 *
 * "Clear the database: delete orders, holds, wallet balances, reward credit,
 *  test offers, test chats, test plans and subscriptions, and rep links on test
 *  sign ups. Keep staff accounts, the price list, settings, and customer
 *  accounts with zero balances. Put the test settings back to the real values."
 *
 * KEPT (never touched): users (staff AND customer accounts), prices and items
 * (orderitems, itemsets), every settings document (adminsettings,
 * adminorderdetails, crmsettings, rewardsettings, holdtypes, bookingwindows,
 * complainttypes, templates), offers (the client removes the test offer
 * "Drffg" themselves on Monday), plans, hubs, expenses / supplies.
 *
 * EMPTIED: orders and everything hanging off them (holds live on the order),
 * payments, wallet transactions, reward credit, customer-held offers, referrals
 * (rep links on sign-ups) and referral stats, subscriptions, chats and support
 * conversations, complaints, feedback, CRM cards and their message queues and
 * logs, communication logs, notifications, staff activity and audit logs,
 * cancellation requests, wallet adjustment requests, customer experience tasks,
 * queued SMS, refused sign-ups, window deflections, top-up proofs.
 *
 * RESET: every wallet to balance 0; on every customer account the per-customer
 * counters this launch added (notAvailableCount, recountMismatches).
 *
 * CRM: B41 does not list the CRM, and a card can be a real lead a rep entered
 * (no account yet). So by DEFAULT every card is KEPT with its order history
 * reset (no orders, stage back to lead, not dormant) and only the queued
 * messages that point at test orders (post-delivery, reactivation) are
 * deleted; lead and registered-not-booked follow-ups stay. Pass --empty-crm to
 * delete every card and every queued message instead.
 *
 * The TEST SETTINGS go back to their real values by hand in admin (the client
 * does that on Monday) — this script prints the values to check.
 *
 * SAFETY:
 *   * Dry run by default: counts what WOULD go, changes nothing.
 *   * --execute deletes. On the live database (laundrydb) it also needs
 *     CLEAR_LIVE="CLEAR CHUVI LIVE DATA", and only ever with the user's go-ahead
 *     in the chat, after the client's Sunday test.
 *   * The database URI is never printed, only its name.
 *
 * Add --empty-crm to delete the CRM cards too (default: keep and reset).
 * Run (dry):     node clearTestData.js
 * Run (testing): MONGODB_URL=<testing uri> node clearTestData.js --execute
 * Run (live):    CLEAR_LIVE="CLEAR CHUVI LIVE DATA" node clearTestData.js --execute
 */
require('dotenv').config()
const mongoose = require('mongoose')

const EMPTY = [
    'bookorders',
    'orders',
    'payments',
    'wallettransactions',
    'walletcredits',
    'customeroffers',
    'referrals',
    'referralstats',
    'subscriptions',
    'freeplans',
    'conversations',
    'chatmessages',
    'complaintcases',
    'feedbacks',
    // CRM cards: see CRM below (kept and reset by default; --empty-crm empties).
    'crmmessagelogs',
    'communicationlogs',
    'notifications',
    'activities',
    'auditlogs',
    'cancellationrequests',
    'walletadjustmentrequests',
    'caretasks',
    'queuedsms',
    'signupattempts',
    'windowdeflections',
    'updatefunds',
]
const KEEP = [
    'users',
    'staffs',
    'orderitems',
    'itemsets',
    'adminsettings',
    'adminorderdetails',
    'crmsettings',
    'rewardsettings',
    'holdtypes',
    'bookingwindows',
    'complainttypes',
    'templates',
    'offers',
    'plans',
    'hubs',
    'expenses',
    'expensecategories',
    'supplies',
]

async function main() {
    const execute = process.argv.includes('--execute')
    const url = process.env.MONGODB_URL
    if (!url) throw new Error('MONGODB_URL is not set')
    const dbName = (url.match(/\/([A-Za-z0-9_-]+)(\?|$)/) || [])[1] || '<unknown>'
    const live = /laundrydb/i.test(dbName)
    console.log(`Database: ${dbName}${live ? '  (LIVE)' : ''}`)
    console.log(execute ? 'Mode: EXECUTE (deletes)' : 'Mode: dry run (counts only, nothing changes)')
    if (execute && live && process.env.CLEAR_LIVE !== 'CLEAR CHUVI LIVE DATA') {
        console.error('Refusing to clear the LIVE database without CLEAR_LIVE="CLEAR CHUVI LIVE DATA".')
        process.exit(2)
    }

    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })
    const db = mongoose.connection.db
    const existing = new Set((await db.listCollections().toArray()).map((c) => c.name))

    console.log('\nTo EMPTY:')
    let total = 0
    for (const name of EMPTY) {
        if (!existing.has(name)) {
            console.log(`  ${name.padEnd(26)} (no collection)`)
            continue
        }
        const n = await db.collection(name).countDocuments()
        total += n
        if (execute) {
            const r = await db.collection(name).deleteMany({})
            console.log(`  ${name.padEnd(26)} ${String(n).padStart(7)}  deleted ${r.deletedCount}`)
        } else {
            console.log(`  ${name.padEnd(26)} ${String(n).padStart(7)}`)
        }
    }

    // ── CRM ──
    const emptyCrm = process.argv.includes('--empty-crm')
    console.log(`\nCRM (${emptyCrm ? 'EMPTY, --empty-crm' : 'keep cards, reset order history'}):`)
    if (existing.has('crmprofiles')) {
        const sched = existing.has('crmscheduledmessages') ? db.collection('crmscheduledmessages') : null
        const cards = await db.collection('crmprofiles').countDocuments()
        const queued = sched ? await sched.countDocuments() : 0
        const orderQueued = sched ? await sched.countDocuments({ workflow: { $in: ['post-delivery', 'reactivation'] } }) : 0
        const verb = execute ? 'deleted' : 'would delete'
        if (emptyCrm) {
            console.log(`  crmprofiles                ${String(cards).padStart(7)}  ${verb}`)
            console.log(`  crmscheduledmessages       ${String(queued).padStart(7)}  ${verb}`)
            if (execute) {
                await db.collection('crmprofiles').deleteMany({})
                if (sched) await sched.deleteMany({})
            }
            total += cards + queued
        } else {
            console.log(`  crmprofiles                ${String(cards).padStart(7)}  kept, order history reset`)
            console.log(`  crmscheduledmessages       ${String(orderQueued).padStart(7)}  post-delivery / reactivation ${verb} (${queued - orderQueued} lead follow-ups kept)`)
            if (execute) {
                await db.collection('crmprofiles').updateMany({}, {
                    $set: { totalOrders: 0, nonSubscriptionOrders: 0, expressOrders: 0, totalSpent: 0, stage: 'lead', wasDormant: false, referralPaused: false },
                    $unset: { firstOrderAt: '', lastOrderAt: '', dormantSince: '', nextFollowUpAt: '' },
                })
                if (sched) await sched.deleteMany({ workflow: { $in: ['post-delivery', 'reactivation'] } })
            }
            total += orderQueued
        }
    }

    console.log('\nTo RESET:')
    const wallets = existing.has('wallets') ? await db.collection('wallets').countDocuments({ balance: { $ne: 0 } }) : 0
    const customers = existing.has('users') ? await db.collection('users').countDocuments({ userType: 'user' }) : 0
    const flagged = existing.has('users')
        ? await db.collection('users').countDocuments({
              userType: 'user',
              $or: [{ notAvailableCount: { $gt: 0 } }, { 'recountMismatches.0': { $exists: true } }],
          })
        : 0
    if (execute) {
        if (existing.has('wallets')) await db.collection('wallets').updateMany({}, { $set: { balance: 0 } })
        if (existing.has('users')) {
            await db
                .collection('users')
                .updateMany({ userType: 'user' }, { $set: { notAvailableCount: 0 }, $unset: { recountMismatches: '' } })
        }
    }
    console.log(`  wallets with money          ${String(wallets).padStart(7)}  → balance 0`)
    console.log(`  customers with counters     ${String(flagged).padStart(7)}  → counters cleared`)

    console.log('\nKEPT (untouched):')
    for (const name of KEEP) {
        if (!existing.has(name)) continue
        const n = await db.collection(name).countDocuments()
        const extra = name === 'users' ? `  (${customers} customers, ${n - customers} staff/admin)` : ''
        console.log(`  ${name.padEnd(26)} ${String(n).padStart(7)}${extra}`)
    }
    const unlisted = [...existing].filter((n) => !EMPTY.includes(n) && !KEEP.includes(n) && !['wallets', 'crmprofiles', 'crmscheduledmessages'].includes(n) && !n.startsWith('system.'))
    if (unlisted.length) console.log(`\nNOT LISTED (left untouched, check them): ${unlisted.join(', ')}`)

    // The test settings the client changes back on Monday (printed to check).
    if (existing.has('adminsettings')) {
        const s = (await db.collection('adminsettings').findOne({})) || {}
        console.log('\nSettings to check (test values go back to the real ones):')
        console.log('  unpaidBillTimers  ', JSON.stringify(s.unpaidBillTimers || '(defaults: 180 min, 9 AM, [1440, 4320], 10080)'))
        console.log('  recountCover      ', JSON.stringify(s.recountCover || '(defaults: 10%, N200, 3 in 60 days)'))
        console.log('  quietHours        ', JSON.stringify(s.quietHours || '(defaults: 21 to 7)'))
    }

    console.log(`\n${execute ? 'Cleared' : 'Would clear'} ${total} documents.`)
    await mongoose.disconnect()
}

main().then(
    () => process.exit(0),
    (e) => {
        console.error('clear failed:', e.message)
        process.exit(1)
    },
)
