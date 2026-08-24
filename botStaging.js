// ---------------------------------------------------------------------------
// Bot V1 / V1.1 controlled STAGING run.
//
// The bot's WRITE actions (booking, apply-payment, complaint, feedback,
// phone-OTP) were only ever stub-verified — they were deliberately NOT run
// against a real DB because they create real orders/cases/feedback, fire
// CRM/referral hooks + staff notifications, change capacity, and send SMS.
// This script exercises each of those paths end-to-end through the REAL
// orchestrator (real DB, real LLM classifier, real Paystack init, real Termii
// OTP) against a THROWAWAY user, prints every reply + step + quick-action,
// inspects the side effects each action left behind, and then deletes
// everything it created.
//
// It drives the bot exactly like the app does — one call to
// BotOrchestratorService.handleCustomerMessage per customer message — so there
// is no test-only code path: what passes here is what a customer gets.
//
//   No staging DB? Spin up a throwaway MongoDB and point MONGODB_URL at it, then
//   pass --seed so the blank DB gets a catalog + settings first:
//     * Docker:  docker run -d -p 27017:27017 --name chuvi-staging mongo:7
//                → MONGODB_URL=mongodb://localhost:27017/chuvi_staging
//     * or a free MongoDB Atlas M0 cluster (fresh, isolated).
//   The LLM/Paystack/Termii calls use your API keys and are independent of which
//   DB you point at. When done: docker rm -f chuvi-staging (or drop the Atlas db).
//
//   Run (Git Bash / POSIX), against a fresh local/Atlas DB:
//     STAGING_OK=1 MONGODB_URL=mongodb://localhost:27017/chuvi_staging node botStaging.js --seed
//   Run (PowerShell):
//     $env:STAGING_OK=1; $env:MONGODB_URL='mongodb://localhost:27017/chuvi_staging'; node botStaging.js --seed
//
//   Flags:
//     --seed                                           seed a BLANK db (catalog + app settings)
//                                                      BEFORE running — use on a fresh local/Atlas DB
//     --only=booking,card,pay,complaint,feedback,otp   run a subset (default: all).
//                                                      booking=wallet pay; card=card link;
//                                                      pay=apply-payment (needs/makes a card order)
//     --credit                                         grant reward credit first
//                                                      (exercises the credit opt-in ask)
//     --keep                                           skip cleanup (inspect the data by hand)
//
//   Safety:
//     * Refuses to run unless STAGING_OK=1 is set.
//     * Refuses if NODE_ENV=production unless STAGING_FORCE=1 is ALSO set.
//     * Prints the target DB host up front — READ IT and confirm it is staging,
//       not production, before you let it run. Card payments are only ever
//       initialised (a link), never completed; the card order stays PENDING.
// ---------------------------------------------------------------------------
require('dotenv').config()
const mongoose = require('mongoose')
const connectToMongoDB = require('./config/db')

const UserModel = require('./models/user.model')
const WalletModel = require('./models/wallet.model')
const WalletCreditModel = require('./models/walletCredit.model')
const WalletTransactionModel = require('./models/walletTransaction.model')
const BookOrderModel = require('./models/bookOrder.model')
const ComplaintCaseModel = require('./models/complaintCase.model')
const FeedbackModel = require('./models/feedback.model')
const ConversationModel = require('./models/conversation.model')
const ChatMessageModel = require('./models/chatMessage.model')
const AuditLogModel = require('./models/audit.log.model')
const CrmProfileModel = require('./models/crmProfile.model')
const NotificationModel = require('./models/notification.model')
const OrderItemModel = require('./models/orderItem.model')
const AdminSettingModel = require('./models/adminSetting.model')

const WalletCreditService = require('./services/walletCredit.service')
const BotOrchestratorService = require('./services/botOrchestrator.service')
const setupApp = require('./config/setup')
const {
    ORDER_STATUS,
    PAYMENT_ORDER_STATUS,
    CREDIT_TYPE,
    CREDIT_SOURCE,
} = require('./util/constants')

// --- args ------------------------------------------------------------------
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const opt = (name, def) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.split('=')[1] : def
}
const ONLY = opt('only', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
const wants = (scenario) => ONLY.length === 0 || ONLY.includes(scenario)
const GRANT_CREDIT = flag('credit')
const KEEP = flag('keep')
const SEED = flag('seed') // seed a BLANK db (catalog + settings) before running

// --- pretty printing -------------------------------------------------------
const line = (c = '─') => console.log(c.repeat(72))
const head = (t) => {
    console.log('')
    line('═')
    console.log(`  ${t}`)
    line('═')
}
const ok = (m) => console.log(`  ✅ ${m}`)
const warn = (m) => console.log(`  ⚠️  ${m}`)
const info = (m) => console.log(`  · ${m}`)

let USER = null // the throwaway user doc
const findings = [] // { scenario, ok, note }
const record = (scenario, pass, note) => {
    findings.push({ scenario, ok: pass, note })
    ;(pass ? ok : warn)(`[${scenario}] ${note}`)
}

// ---------------------------------------------------------------------------
// send one customer message through the real orchestrator, print the turn,
// and hand back the result (with a freshly-reloaded conversation so botState
// is current — the OTP step reads its code from there).
// ---------------------------------------------------------------------------
async function send(text, { attachments, crmContext } = {}) {
    const res = await BotOrchestratorService.handleCustomerMessage({
        userId: USER._id,
        text,
        attachments: attachments || [],
        crmContext: crmContext || null,
    })
    const convo = await ConversationModel.findById(res.conversation._id).lean()
    const step = convo?.botState?.step || '(none)'
    const replies = (res.replies || []).map((r) => r?.text).filter(Boolean)
    const chips = (res.quickActions || []).map((q) => q.label).join(' | ')
    console.log('')
    console.log(`  🧑 > ${text}`)
    for (const r of replies) console.log(`  🤖 ${r.replace(/\n/g, '\n     ')}`)
    console.log(`     [handledBy: ${res.handledBy} · intent: ${res.intent || '?'} · step: ${step}]`)
    if (chips) console.log(`     [chips: ${chips}]`)
    return { res, convo, step, replies }
}

// A terminal turn is one where the flow ended or bailed to a human.
const TERMINAL = new Set(['(none)', 'offered-handoff'])

// Adaptive driver: keep answering whatever step the flow is on until it ends,
// bails to a human, or we hit the turn cap. `answers` maps step → reply text
// (or a function (convo) => text for dynamic answers like the OTP code).
async function drive(opener, answers, { maxTurns = 12, openerOpts } = {}) {
    let turn = await send(opener, openerOpts)
    let n = 0
    while (!TERMINAL.has(turn.step) && n < maxTurns) {
        if (turn.convo?.mode === 'human') break
        const answer = answers[turn.step]
        if (answer === undefined) {
            warn(`no scripted answer for step "${turn.step}" — stopping this flow`)
            break
        }
        const text = typeof answer === 'function' ? answer(turn.convo) : answer
        turn = await send(text)
        n += 1
    }
    return turn
}

// --- inspection helpers (query the real side effects by userId) -------------
const ordersFor = () => BookOrderModel.find({ userId: USER._id }).sort({ createdAt: 1 }).lean()
const walletTxFor = () => WalletTransactionModel.find({ userId: USER._id }).sort({ createdAt: 1 }).lean()
const auditsFor = () => AuditLogModel.find({ userId: USER._id }).sort({ createdAt: 1 }).lean()

// ---------------------------------------------------------------------------
// SETUP
// ---------------------------------------------------------------------------
// Minimal item catalog for a BLANK db — booking prices real OrderItem docs, so
// an empty DB can't book anything. Idempotent (only creates missing names).
// NOTE: OrderItem.price is a per-piece MULTIPLIER, not a naira amount — the real
// booking math is roundToNearestHundred(price × serviceType.pricePerPiece) × qty
// (bookOrder.service.js:1021, the var is literally `serviceTypeMultiplier`), and
// the seeded pricePerPiece is 700. So price ≈ 1 gives ~₦700/piece; a heavy item
// carries a higher multiplier. (Seeding price as naira makes 700×700 = ₦490k/piece.)
const SEED_ITEMS = [
    { name: 'shirt', price: 1 },
    { name: 'trouser', price: 1.2 },
    { name: 'short', price: 1 },
    { name: 'dress', price: 1.5 },
    { name: 'duvet', price: 4, isHeavy: true },
]
async function seedBlankDb() {
    info('--seed: running the app seeder (AdminSetting/serviceTypes/ComplaintTypes/Templates…)')
    await setupApp()
    for (const it of SEED_ITEMS) {
        // $set (not $setOnInsert) so a re-seed CORRECTS a previously-seeded item
        // (e.g. one seeded with a wrong price) instead of leaving it stale.
        await OrderItemModel.updateOne({ name: it.name }, { $set: it }, { upsert: true })
    }
    ok(`--seed: ensured ${SEED_ITEMS.length} catalog item(s)`)
}

async function setup() {
    head('SETUP — throwaway user + funded wallet')

    if (SEED) await seedBlankDb()

    // Catalog precheck: booking prices real items × the serviceType rate, so an
    // empty catalog would make every booking fail for reasons unrelated to the
    // bot. Surface it loudly rather than letting the run look "broken".
    const itemCount = await OrderItemModel.countDocuments()
    const setting = await AdminSettingModel.findOne().lean()
    const svcTypes = (setting?.serviceTypes || []).map((s) => s.name)
    info(`OrderItem catalog: ${itemCount} item(s)`)
    info(`serviceTypes: ${svcTypes.join(', ') || '(none)'}`)
    if (itemCount === 0 || svcTypes.length === 0) {
        warn('Catalog/serviceTypes are empty — booking cannot price items. Seed the')
        warn('staging DB (OrderItem docs + AdminSetting.serviceTypes) before running.')
    }
    // Pick a real catalog item name so the LLM/offline parser can match it.
    const sample = await OrderItemModel.findOne().lean()
    const itemName = (sample?.name || 'shirt').toLowerCase()
    const serviceName = svcTypes[0] || 'wash-and-iron'

    const stamp = Date.now()
    USER = await UserModel.create({
        email: `bot-staging-${stamp}@example.com`,
        fullName: 'Bot Staging User',
        // A real phone lets phone-OTP send an actual SMS; set it to a number you
        // control if you want to receive the code. Booking uses it so the flow
        // never has to ask for a phone.
        phoneNumber: process.env.STAGING_PHONE || '08000000000',
        isVerified: true,
        defaultPickupAddress: '12 Aroma Street, off Ziks Avenue, Awka',
    })
    ok(`created user ${USER._id} <${USER.email}>`)

    // Fund cash so wallet settlement can actually clear an order.
    await WalletModel.findOneAndUpdate(
        { userId: USER._id },
        { $set: { balance: 500000 } },
        { upsert: true, new: true },
    )
    ok('funded wallet cash balance ₦500,000')

    if (GRANT_CREDIT) {
        await WalletCreditService.grantCredit({
            userId: USER._id,
            type: CREDIT_TYPE.REFERRAL,
            amount: 2000,
            sourceSystem: CREDIT_SOURCE?.ADMIN,
            sourceRef: `staging-${stamp}`,
            note: 'staging reward credit (opt-in test)',
            notify: false,
        })
        ok('granted ₦2,000 reward credit (credit opt-in will be exercised)')
    }

    return { itemName, serviceName }
}

// ---------------------------------------------------------------------------
// SCENARIOS
// ---------------------------------------------------------------------------

// 1) Booking → wallet payment (the happy money path).
async function scenarioBookingWallet({ itemName, serviceName }) {
    head('SCENARIO — booking + WALLET payment')
    const before = (await ordersFor()).length
    const answers = {
        'collect-items': `5 ${itemName}s`,
        'collect-service': serviceName,
        'collect-address': '12 Aroma Street, off Ziks Avenue, Awka',
        'collect-datetime': 'tomorrow morning',
        'collect-speed': 'standard',
        'confirm-qty': 'yes',
        'confirm': 'yes',
        'collect-payment': 'from my wallet',
        'confirm-credit': GRANT_CREDIT ? 'no' : 'yes', // cash-only if we granted credit, to keep it deterministic
        'confirm-pay-credit': 'no',
    }
    await drive('I would like to book a laundry pickup', answers)

    const orders = await ordersFor()
    const created = orders.length > before
    record('booking', created, created ? `order created (${orders.at(-1)?.oscNumber})` : 'NO order was created')
    if (!created) return null
    const order = orders.at(-1)
    const paid = order.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS
    record('booking', paid, `paymentStatus=${order.paymentStatus} · billingType=${order.billingType} · amount=₦${order.amount}`)
    const walletTx = await walletTxFor()
    record('booking', walletTx.some((t) => t.type === 'debit'), `wallet transactions: ${walletTx.length}`)
    const audits = await auditsFor()
    record('booking', audits.length > 0, `audit logs so far: ${audits.length}`)
    return order
}

// 2) Booking → CARD payment (order stays PENDING; we only get a link).
async function scenarioBookingCard({ itemName, serviceName }) {
    head('SCENARIO — booking + CARD payment (stays PENDING; link only)')
    const before = (await ordersFor()).length
    const answers = {
        'collect-items': `3 ${itemName}s`,
        'collect-service': serviceName,
        'collect-address': '12 Aroma Street, off Ziks Avenue, Awka',
        'collect-datetime': 'tomorrow afternoon',
        'collect-speed': 'standard',
        'confirm-qty': 'yes',
        'confirm': 'yes',
        'collect-payment': 'by card',
    }
    const last = await drive('Book another pickup for me please', answers)
    const orders = await ordersFor()
    const created = orders.length > before
    record('card', created, created ? `order created (${orders.at(-1)?.oscNumber})` : 'NO order created')
    if (!created) return null
    const order = orders.at(-1)
    const gotLink = last.replies.some((r) => /https?:\/\//.test(r))
    record('card', gotLink, gotLink ? 'Paystack checkout link returned' : 'NO checkout link in reply')
    const stillPending = order.paymentStatus === PAYMENT_ORDER_STATUS.PENDING
    record('card', stillPending, `paymentStatus=${order.paymentStatus} (expected pending — bot never confirms card)`)
    return order
}

// 3) Apply-payment ("use my balance") against a still-unpaid order.
async function scenarioApplyPayment(pendingOrder) {
    head('SCENARIO — apply-payment ("use my balance")')
    if (!pendingOrder) {
        record('pay', false, 'no unpaid order to settle — skipped')
        return
    }
    const answers = {
        'confirm-pay': 'yes',
        'confirm-pay-credit': GRANT_CREDIT ? 'yes' : 'no',
    }
    await drive('Please use my wallet balance to pay', answers)
    const order = await BookOrderModel.findById(pendingOrder._id).lean()
    const paid = order?.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS
    record('pay', paid, `order ${order?.oscNumber} paymentStatus=${order?.paymentStatus}`)
}

// 4) Complaint — needs a DELIVERED order. We mark the wallet-paid order
//    delivered so the case has a real order to attach to.
async function scenarioComplaint(anchorOrder) {
    head('SCENARIO — file a complaint')
    if (!anchorOrder) {
        record('complaint', false, 'no order to complain about — skipped')
        return
    }
    await BookOrderModel.updateOne(
        { _id: anchorOrder._id },
        { $set: { 'stage.status': ORDER_STATUS.DELIVERED } },
    )
    info(`marked order ${anchorOrder.oscNumber} as delivered (so a complaint can attach)`)
    const before = await ComplaintCaseModel.countDocuments({ userId: USER._id })
    const answers = {
        'collect-type': 'the clothes came back with a stain',
        'collect-photo': 'skip',
        'confirm': 'yes',
    }
    await drive("I want to file a complaint — my order came back with a stain", answers)
    const cases = await ComplaintCaseModel.find({ userId: USER._id }).lean()
    const opened = cases.length > before
    record('complaint', opened, opened ? `case opened (status=${cases.at(-1)?.status})` : 'NO case opened')
}

// 5) Feedback — rate a delivered order.
async function scenarioFeedback(anchorOrder) {
    head('SCENARIO — submit feedback (rating)')
    if (!anchorOrder) {
        record('feedback', false, 'no delivered order to rate — skipped')
        return
    }
    // Ensure a delivered order exists (reuse the complaint anchor if already delivered).
    await BookOrderModel.updateOne(
        { _id: anchorOrder._id },
        { $set: { 'stage.status': ORDER_STATUS.DELIVERED } },
    )
    const before = await FeedbackModel.countDocuments({ userId: USER._id })
    const answers = {
        'collect-rating': '5',
        'offer-complaint': 'no',
        'confirm': 'yes',
    }
    await drive("I'd like to leave feedback on my last order", answers)
    const fb = await FeedbackModel.find({ userId: USER._id }).lean()
    const saved = fb.length > before
    record('feedback', saved, saved ? `feedback saved (type=${fb.at(-1)?.type}, rating=${fb.at(-1)?.rating})` : 'NO feedback saved (may already exist for that order — unique per order)')
}

// 6) Phone change with OTP — reads the code straight off botState (staging
//    can't read the SMS), so this proves the write happens ONLY on a match.
async function scenarioPhoneOtp() {
    head('SCENARIO — change phone (OTP)')
    if (!process.env.TERMII_API_KEY) {
        warn('TERMII_API_KEY not set — the SMS send will fail and the flow will')
        warn('hand off instead of writing. That is the correct guardrail, but set')
        warn('TERMII_API_KEY to actually exercise the verify-and-write path.')
    }
    const newPhone = '08123456789'
    const answers = {
        'awaiting-value': newPhone,
        'awaiting-confirm': 'yes',
        // Read the OTP the bot generated straight off the conversation state.
        'verify-phone-otp': (convo) => String(convo?.botState?.slots?.otp || ''),
    }
    await drive('I want to change my phone number', answers)
    const user = await UserModel.findById(USER._id).lean()
    const changed = user.phoneNumber === newPhone
    record('otp', changed, changed ? `phone updated to ${user.phoneNumber}` : `phone still ${user.phoneNumber} (expected if SMS/OTP guardrail blocked it)`)
}

// ---------------------------------------------------------------------------
// CLEANUP — deletes ONLY this throwaway user's data. Guarded on USER._id so it
// can never touch another customer's records.
// ---------------------------------------------------------------------------
async function cleanup() {
    head('CLEANUP')
    if (!USER) return
    const uid = USER._id
    const convos = await ConversationModel.find({ userId: uid }).select('_id').lean()
    const convoIds = convos.map((c) => c._id)

    const results = {
        chatMessages: (await ChatMessageModel.deleteMany({ conversationId: { $in: convoIds } })).deletedCount,
        conversations: (await ConversationModel.deleteMany({ userId: uid })).deletedCount,
        orders: (await BookOrderModel.deleteMany({ userId: uid })).deletedCount,
        complaints: (await ComplaintCaseModel.deleteMany({ userId: uid })).deletedCount,
        feedback: (await FeedbackModel.deleteMany({ userId: uid })).deletedCount,
        walletTx: (await WalletTransactionModel.deleteMany({ userId: uid })).deletedCount,
        walletCredits: (await WalletCreditModel.deleteMany({ userId: uid })).deletedCount,
        wallet: (await WalletModel.deleteMany({ userId: uid })).deletedCount,
        audits: (await AuditLogModel.deleteMany({ userId: uid })).deletedCount,
        crmProfiles: (await CrmProfileModel.deleteMany({ userId: uid })).deletedCount,
        notifications: (await NotificationModel.deleteMany({ userId: uid })).deletedCount,
        user: (await UserModel.deleteMany({ _id: uid })).deletedCount,
    }
    for (const [k, v] of Object.entries(results)) info(`deleted ${v} ${k}`)
    ok('throwaway data removed')
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
    const mongoURL = process.env.MONGODB_URL
    const host = (mongoURL || '').replace(/\/\/[^@]*@/, '//<credentials>@')
    console.log('Target DB:', host || '(MONGODB_URL not set)')

    if (process.env.STAGING_OK !== '1') {
        console.error('\nRefusing to run: set STAGING_OK=1 to confirm this is a staging DB.')
        console.error('This script creates REAL orders/cases/feedback and may send SMS.')
        process.exit(1)
    }
    if (process.env.NODE_ENV === 'production' && process.env.STAGING_FORCE !== '1') {
        console.error('\nRefusing to run against NODE_ENV=production (set STAGING_FORCE=1 to override).')
        process.exit(1)
    }

    await connectToMongoDB(mongoURL)

    let hadError = false
    try {
        const cat = await setup()

        // Booking → WALLET pay (primary happy path): places + settles from wallet.
        let walletOrder = null
        if (wants('booking')) walletOrder = await scenarioBookingWallet(cat)

        // Booking → CARD pay leaves an UNPAID order (link only) — also the order
        // apply-payment then settles, so make one whenever either is wanted.
        let cardOrder = null
        if (wants('card') || wants('pay')) cardOrder = await scenarioBookingCard(cat)
        if (wants('pay')) await scenarioApplyPayment(cardOrder)

        const anchor = walletOrder || cardOrder
        if (wants('complaint')) await scenarioComplaint(anchor)
        if (wants('feedback')) await scenarioFeedback(anchor)
        if (wants('otp')) await scenarioPhoneOtp()
    } catch (e) {
        hadError = true
        console.error('\n💥 Staging run threw:', e)
    } finally {
        if (KEEP) {
            warn(`--keep set: leaving throwaway user ${USER?._id} and its data in place.`)
        } else if (USER) {
            try {
                await cleanup()
            } catch (e) {
                console.error('Cleanup failed — MANUALLY remove user', USER?._id, e)
            }
        }
    }

    // Summary
    head('SUMMARY')
    for (const f of findings) console.log(`  ${f.ok ? '✅' : '⚠️ '} [${f.scenario}] ${f.note}`)
    const failed = findings.filter((f) => !f.ok)
    line()
    console.log(`  ${findings.length - failed.length}/${findings.length} checks passed`)
    if (failed.length) console.log('  Review the ⚠️  lines above — some are expected guardrails (e.g. no TERMII key).')

    await mongoose.disconnect()
    process.exit(hadError || failed.length ? 1 : 0)
}

main()
