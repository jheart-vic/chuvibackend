/**
 * Create (or report on) the FIRST EXPERIENCE offer — client item #2.
 *
 * Every value here is one the client specified. All of it is configuration: no
 * code was needed, which is what we told them, and this script is the proof plus
 * the convenience.
 *
 *   free pickup + free delivery        → two benefits
 *   first order only                   → rules.firstOrderOnly
 *   minimum order ₦4,000               → rules.minOrderValue (checked ON THE BILL)
 *   ₦1,000 credit for the next order   → an extra-laundry-credit benefit, which
 *                                        pays out on REDEEM, and redeem fires
 *                                        when the order is DELIVERED — exactly
 *                                        the client's "land on delivery"
 *   that credit lasts 30 days          → creditExpiryDays
 *   the offer window is 3 days         → customerWindowDays, which the client
 *                                        changes themselves whenever they like
 *                                        ("a setting I control, not a fixed 3")
 *
 * The offer is granted AT REGISTRATION (services/crm.service.handleUserRegistered
 * fires OFFER_TRIGGER.FIRST_EXPERIENCE), so the 3-day clock starts when the
 * account is opened, for everyone — client answer 1(b).
 *
 * DELIBERATELY NOT seeded in config/setup.js. Every other seed there is plumbing
 * (settings documents, hold types, templates); this one is a live commercial
 * offer that gives money away. It should exist because somebody ran it on
 * purpose, not because a process restarted.
 *
 * Run:  MONGODB_URL="<uri>" node seedFirstExperienceOffer.js --dry
 *       MONGODB_URL="<uri>" node seedFirstExperienceOffer.js
 *
 * IDEMPOTENT: if an ACTIVE offer already carries the first-experience trigger it
 * is left completely alone and reported, never edited — the client may well have
 * tuned it, and overwriting their numbers would be worse than doing nothing.
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const OfferModel = require('./models/offer.model')
const {
    OFFER_TYPE,
    OFFER_STATUS,
    OFFER_TRIGGER,
    OFFER_BENEFIT_TYPE,
} = require('./util/constants')

const DRY = process.argv.includes('--dry')

// The client's figures, in one place.
const SPEC = {
    name: 'First Experience',
    headline: 'Free pickup and delivery on your first order',
    description:
        'Book your first order from ₦4,000 and we pick up and deliver free. After your first wash we add ₦1,000 to your CHUVI wallet for your next order.',
    type: OFFER_TYPE.PERSONAL,
    status: OFFER_STATUS.ACTIVE,
    triggers: [OFFER_TRIGGER.FIRST_EXPERIENCE],
    trigger: OFFER_TRIGGER.FIRST_EXPERIENCE, // legacy mirror, kept in sync
    customerWindowDays: 3,
    creditExpiryDays: 30,
    rules: {
        firstOrderOnly: true,
        minOrderValue: 4000,
        oneUsePerCustomer: true,
    },
    benefits: [
        { benefitType: OFFER_BENEFIT_TYPE.FREE_PICKUP },
        { benefitType: OFFER_BENEFIT_TYPE.FREE_DELIVERY },
        {
            benefitType: OFFER_BENEFIT_TYPE.EXTRA_LAUNDRY_CREDIT,
            creditAmount: 1000,
        },
    ],
}

async function main() {
    const url = process.env.MONGODB_URL
    if (!url) {
        console.error('MONGODB_URL not set.')
        process.exit(2)
    }
    const dbName = (url.match(/\/([A-Za-z0-9_-]+)(\?|$)/) || [])[1] || '<unknown>'
    console.log(`Target DB: ${dbName}${DRY ? '   (DRY RUN — nothing will be written)' : ''}`)
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })

    try {
        const existing = await OfferModel.findOne({
            status: OFFER_STATUS.ACTIVE,
            $or: [
                { triggers: OFFER_TRIGGER.FIRST_EXPERIENCE },
                { trigger: OFFER_TRIGGER.FIRST_EXPERIENCE },
            ],
        }).lean()

        if (existing) {
            console.log('\nAn ACTIVE first-experience offer already exists — LEAVING IT ALONE.')
            console.log(`   name                : ${existing.name}`)
            console.log(`   offer window (days) : ${existing.customerWindowDays ?? '(default 14)'}`)
            console.log(`   first order only    : ${!!existing.rules?.firstOrderOnly}`)
            console.log(`   minimum order value : ₦${existing.rules?.minOrderValue ?? 0}`)
            console.log(`   credit life (days)  : ${existing.creditExpiryDays ?? '(reward default)'}`)
            console.log(
                `   benefits            : ${(existing.benefits || [])
                    .map((b) => b.benefitType + (b.creditAmount ? ` ₦${b.creditAmount}` : ''))
                    .join(', ')}`,
            )

            // Say plainly where it differs from what the client asked for, so a
            // half-configured offer is visible rather than assumed correct.
            const gaps = []
            if (existing.customerWindowDays !== SPEC.customerWindowDays)
                gaps.push(`offer window is ${existing.customerWindowDays}, the client asked for 3`)
            if (!existing.rules?.firstOrderOnly) gaps.push('"first order only" is OFF')
            if (existing.rules?.minOrderValue !== 4000)
                gaps.push(`minimum is ₦${existing.rules?.minOrderValue ?? 0}, not ₦4,000`)
            if (existing.creditExpiryDays !== 30)
                gaps.push(`credit life is ${existing.creditExpiryDays ?? 'the reward default'}, not 30 days`)
            const kinds = (existing.benefits || []).map((b) => b.benefitType)
            for (const needed of [
                OFFER_BENEFIT_TYPE.FREE_PICKUP,
                OFFER_BENEFIT_TYPE.FREE_DELIVERY,
                OFFER_BENEFIT_TYPE.EXTRA_LAUNDRY_CREDIT,
            ]) {
                if (!kinds.includes(needed)) gaps.push(`missing benefit: ${needed}`)
            }
            if (gaps.length) {
                console.log('\n   *** DIFFERS FROM WHAT THE CLIENT ASKED FOR ***')
                gaps.forEach((g) => console.log(`     - ${g}`))
                console.log('   Change these in the admin Offer Builder; this script will not edit a live offer.')
            } else {
                console.log('\n   Matches the client spec exactly. Nothing to do.')
            }
            return
        }

        console.log('\nNo active first-experience offer found. Creating:')
        console.log(`   ${SPEC.name} — ${SPEC.headline}`)
        console.log(`   window ${SPEC.customerWindowDays} days · minimum ₦${SPEC.rules.minOrderValue} · first order only`)
        console.log(`   benefits: free pickup, free delivery, ₦1,000 credit (30-day life, paid on delivery)`)

        if (DRY) {
            console.log('\nDRY RUN — nothing written.')
            return
        }
        const created = await OfferModel.create(SPEC)
        console.log(`\nCreated offer ${created._id}.`)
        console.log('It is ACTIVE, so the next customer to register receives it automatically.')
        console.log(
            'Reminder: message 3 of the follow-up sequence promises free logistics afterwards only\n' +
                'from ₦8,000 — that needs a separate BASELINE offer with an ₦8,000 minimum, which is not\n' +
                'created here.',
        )
    } finally {
        await mongoose.disconnect()
    }
}

main().catch(async (e) => {
    console.error('SEED ERROR:', e)
    try {
        await mongoose.disconnect()
    } catch (_) {}
    process.exit(1)
})
