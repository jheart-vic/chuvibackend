/**
 * One-off: stamp `leadSource` + `leadEnteredAt` on CRM profiles written before
 * those fields existed.
 *
 * `createdAt` alone cannot say how a card came to exist, and three different
 * things create one:
 *   - crmBackfill.js  → a whole batch dated to the day the script ran
 *   - an incoming order from someone with no card → they never were a lead
 *   - a genuine lead (walk-in / WhatsApp / signup)
 * Monthly lead reporting counts only the third, so each existing profile is
 * classified here:
 *   BACKFILL  profile created on a day that looks like a crmBackfill run
 *             (>= BATCH_MIN profiles shared that day)
 *   ORDER     the profile's own first order landed within ORDER_WINDOW_MIN of
 *             the card being created — the order created the card
 *   LEAD      everything else
 *
 * `leadEnteredAt` = createdAt for LEAD; left null for the other two, because
 * nobody generated them and there is no honest date to give.
 *
 * Idempotent: profiles that already carry a leadSource are skipped.
 *
 * Run:  node crmLeadSourceBackfill.js --dry     (report only)
 *       node crmLeadSourceBackfill.js           (apply)
 */
require('dotenv').config()
const mongoose = require('mongoose')
const connectToMongoDB = require('./config/db')
const CrmProfileModel = require('./models/crmProfile.model')
const BookOrderModel = require('./models/bookOrder.model')
const { normalizePhone } = require('./util/helper')
const { CRM_LEAD_SOURCE } = require('./util/constants')

const DRY = process.argv.includes('--dry')
const BATCH_MIN = 10 // profiles created on one day before it reads as a script run
const ORDER_WINDOW_MIN = 5 // minutes between card creation and its own first order

const dayOf = (d) => new Date(d).toISOString().slice(0, 10)

async function main() {
    await connectToMongoDB(process.env.MONGODB_URL)

    const profiles = await CrmProfileModel.find({
        leadSource: { $exists: false },
    })
        .select('fullName userId normalizedPhone createdAt')
        .lean()

    console.log(
        `${profiles.length} profile(s) without leadSource${DRY ? '  (DRY RUN — no writes)' : ''}`,
    )
    if (!profiles.length) {
        await mongoose.connection.close()
        return
    }

    // Days that look like a script run rather than organic sign-ups.
    const perDay = {}
    for (const p of profiles) {
        const d = dayOf(p.createdAt)
        perDay[d] = (perDay[d] || 0) + 1
    }
    const batchDays = Object.entries(perDay)
        .filter(([, n]) => n >= BATCH_MIN)
        .map(([d]) => d)
    if (batchDays.length) {
        console.log(
            `  batch day(s) detected → BACKFILL: ${batchDays.map((d) => `${d} (${perDay[d]})`).join(', ')}`,
        )
    }

    // Each person's earliest order, keyed the same way profiles are matched.
    const orders = await BookOrderModel.find({})
        .select('userId phoneNumber createdAt')
        .sort({ createdAt: 1 })
        .lean()
    // Indexed under BOTH keys: an order can carry a userId while its profile was
    // matched by phone (or the reverse), so keying on one alone misses them.
    const firstOrder = new Map()
    const remember = (key, at) => {
        if (key && !firstOrder.has(key)) firstOrder.set(key, at)
    }
    for (const o of orders) {
        if (o.userId) remember(`u:${o.userId}`, o.createdAt)
        if (o.phoneNumber) {
            remember(`p:${normalizePhone(o.phoneNumber)}`, o.createdAt)
        }
    }

    const ops = []
    const counts = { lead: 0, order: 0, backfill: 0 }
    for (const p of profiles) {
        const fo =
            (p.userId && firstOrder.get(`u:${p.userId}`)) ||
            (p.normalizedPhone && firstOrder.get(`p:${p.normalizedPhone}`)) ||
            null
        const gapMin = fo
            ? (new Date(fo).getTime() - new Date(p.createdAt).getTime()) / 60000
            : null

        let source
        if (batchDays.includes(dayOf(p.createdAt))) {
            source = CRM_LEAD_SOURCE.BACKFILL
        } else if (gapMin !== null && gapMin < ORDER_WINDOW_MIN) {
            source = CRM_LEAD_SOURCE.ORDER
        } else {
            source = CRM_LEAD_SOURCE.LEAD
        }
        counts[source] += 1

        ops.push({
            updateOne: {
                filter: { _id: p._id },
                update: {
                    $set: {
                        leadSource: source,
                        leadEnteredAt:
                            source === CRM_LEAD_SOURCE.LEAD
                                ? p.createdAt
                                : null,
                    },
                },
            },
        })
    }

    console.log(
        `  classified → lead: ${counts.lead}  order: ${counts.order}  backfill: ${counts.backfill}`,
    )

    if (DRY) {
        console.log('DRY RUN — nothing written. Re-run without --dry to apply.')
        await mongoose.connection.close()
        return
    }

    let written = 0
    for (let i = 0; i < ops.length; i += 1000) {
        const res = await CrmProfileModel.bulkWrite(ops.slice(i, i + 1000))
        written += res.modifiedCount || 0
    }
    const remaining = await CrmProfileModel.countDocuments({
        leadSource: { $exists: false },
    })
    console.log(`Stamped ${written} profile(s). Still missing: ${remaining}`)

    await mongoose.connection.close()
}

main().catch(async (err) => {
    console.error(err)
    await mongoose.connection.close()
    process.exit(1)
})
