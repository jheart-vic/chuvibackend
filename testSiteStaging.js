/**
 * Test site guards (TEST_SITE=1, client 16 Oct) — on testingdb.
 *   staff and @chuvitest.com customers log in; other customers and new customer sign-ups are refused;
 *   no SMS / email leaves; noindex header + robots.txt. With TEST_SITE unset (live) nothing changes.
 * SAFETY: refuses unless STAGING_OK=1; hard-refuses laundrydb. Cleans up.
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node testSiteStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')

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
        console.error('Refusing to run: set STAGING_OK=1.')
        process.exit(2)
    }
    const url = process.env.MONGODB_URL
    if (/laundrydb/i.test(url)) {
        console.error('*** LIVE database. Refusing. ***')
        process.exit(2)
    }
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })
    const UserModel = require('./models/user.model')
    const AuthService = require('./services/auth.service')
    const stamp = Date.now()
    const created = []
    const prev = process.env.TEST_SITE
    try {
        const mk = async (email, userType) => {
            const u = new UserModel({ email, fullName: 'TS ' + userType, userType, password: 'Pass-1234!x', isVerified: true, phoneNumber: '0800' + String(stamp).slice(-7) })
            await u.save()
            created.push(u._id)
            return u
        }
        const realCust = await mk(`ts_real_${stamp}@gmail.com`, 'user')
        const testCust = await mk(`ts_${stamp}@chuvitest.com`, 'user')
        const staff = await mk(`ts_staff_${stamp}@example.com`, 'intake-and-tag')
        const auth = new AuthService()
        const login = (u) => auth._handleLogin({ email: u.email, password: 'Pass-1234!x', userType: u.userType })

        console.log('\n1. TEST_SITE unset (live): nothing changes')
        delete process.env.TEST_SITE
        ok((await login(realCust)).success, 'a real customer logs in')
        const { testSiteRefusal, noIndex } = require('./util/testSite')
        ok(testSiteRefusal({ email: 'a@gmail.com', userType: 'user' }) === null, 'no refusal')
        let hdr = null
        noIndex({ path: '/' }, { setHeader: (k, v) => (hdr = v) }, () => {})
        ok(hdr === null, 'no noindex header')

        console.log('\n2. TEST_SITE=1')
        process.env.TEST_SITE = '1'
        let r = await login(realCust)
        ok(!r.success && /test site/.test(r.error), `a real customer is refused: "${r.error}"`)
        ok((await login(testCust)).success, 'a @chuvitest.com dummy customer logs in')
        ok((await login(staff)).success, 'staff log in')
        r = await auth.createUser({ body: { email: `new_${stamp}@gmail.com`, password: 'Pass-1234!x', fullName: 'New Person', phoneNumber: '08031110000', userType: 'user' } })
        ok(!r.success && r.data?.testSite, 'a new real customer cannot sign up')
        const prevKey = process.env.TERMII_API_KEY
        process.env.TERMII_API_KEY = 'would-be-real'
        const sms = await require('./util/sendSms')('08031234567', 'hello')
        process.env.TERMII_API_KEY = prevKey
        ok(sms && sms.testSite === true && sms.sent === false, 'no SMS leaves, even with an SMS key set')
        const em = await require('./util/emailService')({ to: 'x@gmail.com', subject: 'Hi', html: 'x' })
        ok(em && em.testSite === true, 'no email leaves')
        hdr = null
        noIndex({ path: '/' }, { setHeader: (k, v) => (hdr = `${k}: ${v}`) }, () => {})
        ok(hdr === 'X-Robots-Tag: noindex, nofollow', 'noindex header on every response')
        let body = null
        noIndex({ path: '/robots.txt' }, { setHeader: () => {}, type() { return this }, send: (b) => (body = b) }, () => {})
        ok(body && /Disallow: \//.test(body), 'robots.txt disallows everything')
    } catch (e) {
        FAIL++
        console.error('  ✗ CRASH:', e)
    } finally {
        if (prev === undefined) delete process.env.TEST_SITE
        else process.env.TEST_SITE = prev
        await UserModel.deleteMany({ _id: { $in: created } })
        await UserModel.deleteMany({ email: `new_${stamp}@gmail.com` })
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed`)
        process.exit(FAIL ? 1 : 0)
    }
}
main()
