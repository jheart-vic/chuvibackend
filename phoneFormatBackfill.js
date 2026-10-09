/**
 * Phone-format backfill — client brief 6 Oct 2026, item 4.6.
 *
 * "One customer's phone shows with the leading 0 on OSC-20261004-631233 and
 *  without it on OSC-20260804-265387 ... Phone numbers are stored in one format,
 *  so one person is never two profiles."
 *
 * New writes are normalised at the source (auth signup, customer booking, staff
 * intake). This brings the records already stored onto the same form, and — the
 * part that matters — reports any CrmProfile pair that the old normaliser had
 * split into two identities for the same human being.
 *
 * Canonical form: 0 + the 10 local digits, e.g. 08031234567.
 *
 * IDEMPOTENT: a record already in canonical form is skipped, so a second run is a
 * no-op. Run with --dry first; it writes NOTHING in dry mode.
 *
 * SAFETY: refuses unless STAGING_OK=1 (or --dry); refuses NODE_ENV=production
 * without STAGING_FORCE=1. Unlike the staging harnesses this one is MEANT to be
 * able to run against the live database eventually, so it does not refuse
 * laundrydb — it names the target and requires the explicit flags instead.
 *
 * Run: MONGODB_URL="<uri>" node phoneFormatBackfill.js --dry
 *      STAGING_OK=1 MONGODB_URL="<uri>" node phoneFormatBackfill.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const UserModel = require('./models/user.model')
const BookOrderModel = require('./models/bookOrder.model')
const CrmProfileModel = require('./models/crmProfile.model')
const { normalizePhone } = require('./util/helper')

const DRY = process.argv.includes('--dry')

async function main() {
    if (!DRY && process.env.STAGING_OK !== '1') {
        console.error(
            'Refusing to write without STAGING_OK=1. Run with --dry first to see the plan.',
        )
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
    console.log(`Target DB: ${dbName}${DRY ? '   (DRY RUN — nothing will be written)' : ''}`)
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })

    try {
        const report = {}

        // ── the three collections that store a typed phone number ─────────────
        const targets = [
            { label: 'users', model: UserModel, field: 'phoneNumber' },
            { label: 'orders', model: BookOrderModel, field: 'phoneNumber' },
            { label: 'crmProfiles (phoneNumber)', model: CrmProfileModel, field: 'phoneNumber' },
            {
                label: 'crmProfiles (normalizedPhone)',
                model: CrmProfileModel,
                field: 'normalizedPhone',
            },
        ]

        for (const { label, model, field } of targets) {
            const docs = await model
                .find({ [field]: { $nin: [null, ''] } })
                .select(`_id ${field}`)
                .lean()
            let changed = 0
            let blanked = 0
            const examples = []
            const collisions = []
            for (const d of docs) {
                const before = d[field]
                const after = normalizePhone(before)
                if (!after) {
                    // Not a usable number at all (e.g. "0000"). Left ALONE rather
                    // than blanked — deleting data is not this script's job.
                    blanked++
                    continue
                }
                if (after === before) continue
                if (!DRY) {
                    try {
                        await model.updateOne({ _id: d._id }, { $set: { [field]: after } })
                    } catch (err) {
                        // `CrmProfile.normalizedPhone` is unique+sparse. Rewriting
                        // a bare 10-digit number to the canonical form collides
                        // with the SAME person's other card — which is exactly the
                        // split this script exists to report. Without this catch
                        // the whole run aborted on the first such pair, having
                        // already rewritten everything before it. Skip it, name
                        // it, and carry on: the pair must be merged first
                        // (GET /api/admin/profile-duplicates), then re-run.
                        if (err?.code === 11000) {
                            collisions.push(
                                `${label} ${d._id}: ${before} → ${after} BLOCKED — another record already holds that number. Merge the duplicate profiles first.`,
                            )
                            continue
                        }
                        throw err
                    }
                }
                changed++
                if (examples.length < 5) examples.push(`${before} → ${after}`)
            }
            report[label] = {
                scanned: docs.length,
                changed,
                unusable: blanked,
                examples,
                collisions,
            }
        }

        for (const [label, r] of Object.entries(report)) {
            console.log(
                `\n${label}: scanned ${r.scanned}, ${DRY ? 'would change' : 'changed'} ${r.changed}, unusable left alone ${r.unusable}`,
            )
            r.examples.forEach((e) => console.log('   ', e))
            if (r.collisions?.length) {
                console.log(
                    `   *** ${r.collisions.length} row(s) could NOT be rewritten — the canonical number is already taken by the same person's other record. Merge first, then re-run. ***`,
                )
                r.collisions.slice(0, 10).forEach((c) => console.log('   ', c))
            }
        }

        // ── the consequence the client actually cares about ───────────────────
        // Two profiles whose numbers are the SAME human once normalised. The old
        // normaliser left the bare 10-digit form untouched, so these pairs could
        // be created as separate identities.
        console.log('\nChecking for customers split across two CRM profiles…')
        const profiles = await CrmProfileModel.find({})
            .select('_id fullName phoneNumber normalizedPhone userId totalOrders stage')
            .lean()
        const byPhone = new Map()
        for (const p of profiles) {
            const key = normalizePhone(p.normalizedPhone || p.phoneNumber)
            if (!key) continue
            if (!byPhone.has(key)) byPhone.set(key, [])
            byPhone.get(key).push(p)
        }
        const dupes = [...byPhone.entries()].filter(([, v]) => v.length > 1)
        if (!dupes.length) {
            console.log('   none — every phone maps to exactly one profile.')
        } else {
            console.log(
                `   *** ${dupes.length} phone number(s) map to MORE THAN ONE profile. ***`,
            )
            console.log('   These are NOT merged automatically — merging decides which')
            console.log('   history survives, which is a business call, not a script\'s.')
            console.log('   Merge them from the admin API (client item #9):')
            console.log('     GET  /api/admin/profile-duplicates        — the same report, with blockers')
            console.log('     POST /api/admin/profile-duplicates/merge  — one phone number at a time')
            for (const [key, list] of dupes.slice(0, 20)) {
                console.log(`   ${key}:`)
                for (const p of list) {
                    console.log(
                        `      - ${p._id} "${p.fullName || '(no name)'}" stage=${p.stage} orders=${p.totalOrders} userId=${p.userId || 'none'}`,
                    )
                }
            }
        }

        console.log(
            `\n${DRY ? 'DRY RUN complete — nothing was written.' : 'Backfill complete.'}`,
        )
    } finally {
        await mongoose.disconnect()
    }
}

main().catch(async (e) => {
    console.error('BACKFILL ERROR:', e)
    try {
        await mongoose.disconnect()
    } catch (_) {}
    process.exit(1)
})
