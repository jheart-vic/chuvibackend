/**
 * Google sign-up phone step (launch item 5) — DB verification on testingdb.
 *
 * PATCH /users/complete-profile → userService.completeProfile:
 *   1  "+234 803 123 4567"          → stored "08031234567" (same format as the email form)
 *   2  an invalid phone             → refused, nothing saved
 *   3  termsAccepted: true          → termsAcceptedAt recorded
 *   4  no termsAccepted             → phone saved, no termsAcceptedAt (recorded, not required)
 *   5  an unknown referral code     → refused, nothing saved
 *   6  the customer's own code      → refused
 *   7  a valid code                 → linked to the referrer (welcome credit when configured)
 *   8  already linked + a code      → phone saved, the existing link stands
 *   9  a second call                → "Profile already completed"
 *  10  email register with termsAccepted → termsAcceptedAt recorded
 *
 * SMS stubbed. SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production
 * without STAGING_FORCE=1; hard-refuses laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node googleProfileStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: async () => ({ stubbed: true }) }
const mongoose = require('mongoose')
const UserModel = require('./models/user.model')
const ReferralModel = require('./models/referral.model')
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
    const UserService = require('./services/user.service')
    const AuthService = require('./services/auth.service')
    const svc = new UserService()
    const ts = Date.now()
    const tag = String(ts).slice(-6)
    const users = []
    try {
        const google = async (n) => {
            const u = await UserModel.create({
                email: `gp${n}${ts}@example.com`, fullName: `Google ${n}`, userType: C.ROLE.USER,
                servicePlatform: 'google', googleId: `gp${n}${ts}`, isVerified: true,
            })
            users.push(u._id)
            return u
        }
        const call = (u, body) => svc.completeProfile({ user: { id: String(u._id) }, body })
        const fresh = (u) => UserModel.findById(u._id).lean()

        const referrer = await UserModel.create({
            email: `gpref${ts}@example.com`, fullName: 'Rep', userType: C.ROLE.USER, phoneNumber: `0802${String(ts).slice(-7)}`,
            isVerified: true, referralCode: `CHUVIGP${tag}`,
        })
        users.push(referrer._id)

        console.log('\n[1–4] Phone and terms')
        const a = await google('a')
        const ra = await call(a, { phoneNumber: '+234 803 123 4567', termsAccepted: true })
        const fa = await fresh(a)
        ok(ra.success && fa.phoneNumber === '08031234567', `"+234 803 123 4567" is stored "${fa.phoneNumber}"`)
        ok(fa.termsAccepted === true && fa.termsAcceptedAt instanceof Date, 'termsAccepted: true records termsAccepted + termsAcceptedAt')
        ok(!!ra.data.accessToken && !!ra.data.refreshToken && ra.data.data?.phoneNumber === '08031234567', 'the response still carries the tokens and the user')

        const b = await google('b')
        const rb = await call(b, { phoneNumber: '12345' })
        ok(!rb.success && /Nigerian mobile number/.test(rb.data.error) && !(await fresh(b)).phoneNumber, `an invalid phone is refused and nothing saved ("${rb.data.error}")`)
        const rb2 = await call(b, { phoneNumber: '0805 111 2233' })
        const fb = await fresh(b)
        ok(rb2.success && fb.phoneNumber === '08051112233' && fb.termsAccepted === false && !fb.termsAcceptedAt, 'without termsAccepted the phone still saves (termsAccepted false, no date)')

        console.log('\n[5–8] Referral code')
        const c = await google('c')
        const rc = await call(c, { phoneNumber: '08061112233', referralCode: 'CHUVINOPE00' })
        ok(!rc.success && /doesn't exist/.test(rc.data.error) && !(await fresh(c)).phoneNumber, `an unknown code is refused and nothing saved ("${rc.data.error.slice(0, 40)}…")`)

        const d = await google('d')
        await UserModel.updateOne({ _id: d._id }, { $set: { referralCode: `CHUVIOWN${tag}` } })
        const rd = await call(d, { phoneNumber: '08071112233', referralCode: `chuviown${tag}` })
        ok(!rd.success && /doesn't exist/.test(rd.data.error), 'the customer\'s own code is refused')

        const rc2 = await call(c, { phoneNumber: '08061112233', referralCode: ` chuvigp${tag} ` })
        const link = await ReferralModel.findOne({ referredUserId: c._id }).lean()
        ok(rc2.success && link && String(link.referrerId) === String(referrer._id) && link.source === 'code', 'a valid code (any case, spaces) links the customer to the referrer')
        console.log(`    (welcome credit ${link?.welcomeCreditId ? 'granted' : 'not granted — referralWelcomeAmount is 0 on this DB'})`)

        const e = await google('e')
        const other = await UserModel.create({ email: `gpoth${ts}@example.com`, fullName: 'Other Rep', userType: C.ROLE.USER, isVerified: true, referralCode: `CHUVIOT${tag}` })
        users.push(other._id)
        await ReferralModel.create({ referrerId: other._id, referredUserId: e._id, code: `CHUVIOT${tag}`, source: 'link', status: C.REFERRAL_STATUS?.REGISTERED || 'registered' })
        const re = await call(e, { phoneNumber: '08091112233', referralCode: `CHUVIGP${tag}` })
        const linkE = await ReferralModel.find({ referredUserId: e._id }).lean()
        ok(re.success && (await fresh(e)).phoneNumber === '08091112233' && linkE.length === 1 && String(linkE[0].referrerId) === String(other._id),
            'already linked from the rep\'s link: the phone saves and the existing link stands')

        console.log('\n[9] Second call')
        const r2 = await call(a, { phoneNumber: '08031234567', termsAccepted: true })
        ok(!r2.success && r2.data.error === 'Profile already completed', 'a second call is refused ("Profile already completed")')

        console.log('\n[10] Email register records terms')
        const auth = new AuthService()
        const regEmail = `gpreg${ts}@example.com`
        const reg = await auth.createUser({ body: { email: regEmail, password: 'Passw0rd!x', fullName: 'Email Customer', phoneNumber: '08011112233', userType: C.ROLE.USER, termsAccepted: true } })
        const ru = await UserModel.findOne({ email: regEmail }).lean()
        if (ru) users.push(ru._id)
        ok(ru && ru.termsAccepted === true && ru.termsAcceptedAt instanceof Date, `email register with termsAccepted records it (${reg.success ? 'ok' : reg.data?.error})`)
        await sleep(2500) // let fire-and-forget CRM/referral hooks finish before cleanup
    } finally {
        const db = mongoose.connection.db
        const byUser = { $in: users }
        for (const coll of ['referrals', 'walletcredits', 'wallettransactions', 'wallets', 'crmprofiles', 'crmscheduledmessages', 'notifications', 'communicationlogs', 'audits', 'auditlogs']) {
            await db.collection(coll).deleteMany({ $or: [{ userId: byUser }, { referredUserId: byUser }, { referrerId: byUser }] }).catch(() => {})
        }
        await UserModel.deleteMany({ _id: byUser })
        console.log(`\ngoogleProfileStaging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
        await mongoose.disconnect()
    }
}

main().catch(async (e) => {
    console.error('STAGING ERROR', e.message)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
})
