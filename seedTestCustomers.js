// Create test customer accounts for the offer cases the frontend could not
// reach (the brief's ₦4,000 / ₦3,900 / ₦8,000 thresholds).
//
// WHY A SCRIPT AND NOT A STAFF ENDPOINT: no staff endpoint creates a customer
// account — `new UserModel(` exists ONLY in `auth.service.js` (local/Google/
// Apple), which is asserted by briefCheck. That is deliberate, so this does not
// invent a new door into user creation; it drives the SAME registration path a
// real signup takes, which is also the only way the First Experience offer
// trigger fires (`handleUserRegistered`, not `createLead` — see the 2026-10-08
// correction).
//
// FOUR accounts, which is the number the cases need plus one spare:
//   below   — for the ₦3,900 case (just under the ₦4,000 line)
//   at      — for the ₦4,000 case (exactly on it)
//   above   — for the ₦8,000 case (free-logistics minimum)
//   spare   — for a re-run of whichever case burns its first-order status
// Each is single-use for a FIRST-ORDER offer, which is the whole point: the
// First Experience offer is first-order-only, so a case cannot be retried on an
// account that has already ordered.
//
// USAGE (the URI is passed inline, never written into .env):
//   STAGING_OK=1 MONGODB_URL="<testingdb uri>" node seedTestCustomers.js
//   STAGING_OK=1 MONGODB_URL="<testingdb uri>" node seedTestCustomers.js --clean
//
// Against the LIVE database it additionally requires --i-mean-live, because
// these are real accounts that fire real CRM workflows and real offer grants.

const mongoose = require('mongoose')

const URI = process.env.MONGODB_URL
const CLEAN = process.argv.includes('--clean')
const LIVE_OK = process.argv.includes('--i-mean-live')

// A marker every created account carries, so --clean can find exactly these
// and nothing else. Matching on "test" in a name would eventually delete a real
// customer called Test. It lives in the EMAIL rather than in a spare field,
// because `User` has no free-text field that is safe to borrow — `referredBy`
// does not exist on this model (the referral code lives on the user itself).
const MARKER = 'chuvi-offer-test'
const emailFor = (key) => `${MARKER}-${key}@example.com`

const ACCOUNTS = [
    { key: 'below', fullName: 'Offer Test Below', phoneNumber: '07000000101' },
    { key: 'at', fullName: 'Offer Test At', phoneNumber: '07000000102' },
    { key: 'above', fullName: 'Offer Test Above', phoneNumber: '07000000103' },
    { key: 'spare', fullName: 'Offer Test Spare', phoneNumber: '07000000104' },
]

const PASSWORD = 'OfferTest#2026'

async function main() {
    if (!URI) throw new Error('MONGODB_URL is required (pass it inline).')
    const dbName = (URI.split('/').pop() || '').split('?')[0]
    if (dbName === 'laundrydb' && !LIVE_OK) {
        throw new Error(
            'That is the LIVE database. These are real accounts that fire real ' +
                'CRM workflows and real offer grants. Re-run with --i-mean-live ' +
                'if that is genuinely what you want.',
        )
    }
    if (!process.env.STAGING_OK && !LIVE_OK) {
        throw new Error('Set STAGING_OK=1 to confirm the target database.')
    }

    await mongoose.connect(URI)
    console.log(`connected to ${dbName}\n`)

    const UserModel = require('./models/user.model')
    const AuthService = require('./services/auth.service')
    const { ROLE } = require('./util/constants')

    if (CLEAN) {
        const res = await UserModel.deleteMany({
            email: { $regex: `^${MARKER}-` },
        })
        console.log(`removed ${res.deletedCount} test account(s)`)
        return
    }

    const made = []
    for (const acct of ACCOUNTS) {
        const email = emailFor(acct.key)
        const existing = await UserModel.findOne({ email })
        if (existing) {
            console.log(`· ${acct.key.padEnd(6)} already exists — ${email}`)
            made.push({ ...acct, email, created: false, id: String(existing._id) })
            continue
        }

        // `createUser` is the REAL signup path (the only place `new UserModel(`
        // exists for a customer), so the account is indistinguishable from a
        // genuine registration and `crmOnUserRegistered` /
        // `referralOnUserRegistered` fire — which is what grants the First
        // Experience offer. A hand-rolled insert would skip all of that and the
        // offer cases would have nothing to test.
        const service = new AuthService()
        const result = await service.createUser({
            body: {
                fullName: acct.fullName,
                email,
                phoneNumber: acct.phoneNumber,
                password: PASSWORD,
                userType: ROLE.USER,
            },
        })

        if (!result?.success) {
            console.log(
                `✗ ${acct.key.padEnd(6)} FAILED — ${JSON.stringify(result?.data)}`,
            )
            continue
        }

        // Verify it so the frontend can sign in without an OTP round trip.
        const user = await UserModel.findOne({ email })
        if (user) {
            user.isVerified = true
            await user.save({ validateBeforeSave: false })
        }

        console.log(`✓ ${acct.key.padEnd(6)} created   — ${email}`)
        made.push({ ...acct, email, created: true, id: String(user?._id) })
    }

    // ⚠️ THE HOOKS ARE FIRE-AND-FORGET, AND THE FIRST RUN CUT THEM OFF.
    //
    // `createUser` calls `crmOnUserRegistered` / `referralOnUserRegistered`
    // WITHOUT awaiting them — deliberately, so a CRM failure can never break a
    // signup. A script that disconnects the moment the loop ends therefore
    // kills them mid-write: the first run printed "Operation interrupted
    // because client was closed" and the First Experience offer trigger
    // (`handleUserRegistered` → `OfferService.handleTrigger`) never completed.
    //
    // That is precisely the grant these accounts exist to test, so waiting is
    // not politeness — without it the script produces accounts that LOOK right
    // and have no offer.
    process.stdout.write('\nletting the registration hooks settle… ')
    await new Promise((r) => setTimeout(r, 8000))
    console.log('done')

    // Report what the hooks actually produced, rather than assuming. An empty
    // offer count is not necessarily wrong — it is correct when no offer with a
    // first-order trigger is configured in this database — but it must be
    // VISIBLE, or a run against live would look identical to a run that failed.
    const CustomerOfferModel = require('./models/customerOffer.model')
    const OfferModel = require('./models/offer.model')
    const offersConfigured = await OfferModel.countDocuments({})
    for (const m of made) {
        m.offers = await CustomerOfferModel.countDocuments({ userId: m.id })
    }
    console.log(`offers configured in this database: ${offersConfigured}`)
    if (offersConfigured === 0) {
        console.log(
            '⚠️  No offers exist here, so no account can be granted one. The ' +
                'offer cases can only be exercised where the offers are ' +
                'configured.',
        )
    }

    console.log('\n──────────── sign-in details ────────────')
    console.log(`password for all accounts: ${PASSWORD}\n`)
    for (const m of made) {
        console.log(
            `${m.key.padEnd(6)} ${m.email.padEnd(42)} ${m.phoneNumber}  offers: ${m.offers}`,
        )
    }
    console.log(
        '\nEach is a FIRST-ORDER account. The First Experience offer is ' +
            'first-order-only, so one case per account — use the spare if you ' +
            'need to repeat one.',
    )
}

main()
    .catch((e) => {
        console.error('\n*** RUN ABORTED ***')
        console.error(e.message)
        process.exitCode = 1
    })
    .finally(async () => {
        // Close AFTER the catch, never in a way that can pre-empt a rejection —
        // a `finally` calling process.exit is how a harness here once reported
        // "0 failed" having skipped 20 assertions.
        await mongoose.disconnect().catch(() => {})
    })
