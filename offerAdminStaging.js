/**
 * Offer builder harness — client brief 6 Oct 2026, item 2.1 ("Offers do not save").
 *
 * Runs the client's OWN test against a real DB: create the three offers they
 * named, re-read them as a fresh page load would, edit each one and check the
 * change survives, then delete a test offer.
 *
 * It also settles what "do not save" actually was. Create and update were
 * already correct and DID persist, so this proves that and pins the two real
 * gaps: a new offer defaults to status `draft` (invisible to a list filtered to
 * active), and there was no delete endpoint and no single-offer read at all.
 *
 * Scenarios:
 *   1  create the three named offers           → all three persist
 *   2  re-list as a fresh page load            → all three are found
 *   3  a default-status list vs status=draft   → why "created" offers vanish
 *   4  edit each one, re-read                  → the change is kept
 *   5  pause                                   → status really changes
 *   6  GET one offer                           → new endpoint, carries linkages
 *   7  delete an unused offer                  → really gone from the DB
 *   8  delete an offer a customer holds        → refused, requiresForce + count
 *   9  the same with force=true                → archived, linkage cancelled
 *  10  delete an offer with only FINISHED      → archived, history preserved
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node offerAdminStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const OfferModel = require('./models/offer.model')
const CustomerOfferModel = require('./models/customerOffer.model')
const UserModel = require('./models/user.model')
const AuditLogModel = require('./models/audit.log.model')
const OfferApiService = require('./services/offerApi.service')
const {
    ROLE,
    OFFER_STATUS,
    OFFER_TYPE,
    OFFER_BENEFIT_TYPE,
    CUSTOMER_OFFER_STATUS,
} = require('./util/constants')

const svc = new OfferApiService()
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

    const created = { offerIds: [], userIds: [], linkageIds: [] }
    try {
        const admin = await UserModel.create({
            email: `offer_admin_${Date.now()}@example.com`,
            fullName: 'Offer Staging Admin',
            userType: ROLE.ADMIN,
        })
        const customer = await UserModel.create({
            email: `offer_cust_${Date.now()}@example.com`,
            fullName: 'Offer Staging Customer',
            userType: ROLE.USER,
        })
        created.userIds.push(admin._id, customer._id)
        const aid = admin._id.toString()
        const req = (body = {}, params = {}, query = {}) => ({
            body,
            params,
            query,
            user: { id: aid },
        })

        const stamp = Date.now()
        // The client says "General" where the code says BASELINE: a permanent
        // policy applied by rule at booking, with no per-customer linkage.
        // "Always Free at ₦8,000" and "First Experience" are both that kind of
        // standing rule; "Recovery Thank You" is handed to one customer after a
        // complaint, so it is PERSONAL.
        const defs = [
            {
                name: `First Experience ${stamp}`,
                headline: 'Your first order is on us',
                type: OFFER_TYPE.BASELINE,
            },
            {
                name: `Always Free at 8000 ${stamp}`,
                headline: 'Free pickup & delivery over ₦8,000',
                type: OFFER_TYPE.BASELINE,
            },
            {
                name: `Recovery Thank You ${stamp}`,
                headline: 'Sorry — here is something back',
                type: OFFER_TYPE.PROMOTIONAL,
            },
        ]

        // ── 1: create the three ─────────────────────────────────────────────
        console.log("\n[1] create the client's three offers")
        const ids = []
        for (const d of defs) {
            const r = await svc.createOffer(
                req({
                    name: d.name,
                    headline: d.headline,
                    description: 'Created by the staging harness',
                    type: d.type,
                    // The field is `benefitType`, not `type` — `type` is
                    // Mongoose's reserved type keyword inside a subdocument.
                    benefits: [
                        { benefitType: OFFER_BENEFIT_TYPE.FREE_DELIVERY },
                        { benefitType: OFFER_BENEFIT_TYPE.FREE_PICKUP },
                    ],
                    rules: {},
                }),
            )
            ok(r.success === true, `created "${d.name}" (${r.success ? 'ok' : r.data?.error})`)
            if (r.success) {
                ids.push(String(unwrap(r)._id))
                created.offerIds.push(unwrap(r)._id)
            }
        }

        // ── 2: a fresh page load finds them ─────────────────────────────────
        console.log('\n[2] re-list, as a fresh page load would')
        if (ids.length !== 3) {
            throw new Error(
                `only ${ids.length}/3 offers were created — later scenarios depend on all three`,
            )
        }
        const listed = unwrap(await svc.listOffers(req({}, {}, { limit: 200 })))
        const listedIds = (listed?.data || []).map((o) => String(o._id))
        ok(ids.every((i) => listedIds.includes(i)),
            `all three are in the list after "leaving the page" (${ids.filter((i) => listedIds.includes(i)).length}/3)`)
        for (const i of ids) {
            const inDb = await OfferModel.findById(i).lean()
            ok(!!inDb, `offer ${inDb?.name} really persisted in Mongo`)
        }

        // ── 3: why a created offer looks missing ────────────────────────────
        console.log('\n[3] the real reason a created offer can look missing')
        const first = await OfferModel.findById(ids[0]).lean()
        ok(first.status === OFFER_STATUS.DRAFT,
            `a new offer defaults to status "${first.status}" — NOT active`)
        const activeOnly = unwrap(
            await svc.listOffers(req({}, {}, { status: OFFER_STATUS.ACTIVE, limit: 200 })),
        )
        const activeIds = (activeOnly?.data || []).map((o) => String(o._id))
        ok(!activeIds.includes(ids[0]),
            'so a list filtered to status=active does NOT show it — this is the "gone after refresh" report')

        // ── 4: edits persist ────────────────────────────────────────────────
        console.log('\n[4] edit each one and re-read')
        for (const i of ids) {
            const r = await svc.updateOffer(
                req({ headline: `EDITED ${stamp}` }, { id: i }),
            )
            ok(r.success === true, `edit accepted (${r.success ? 'ok' : r.data?.error})`)
            const after = await OfferModel.findById(i).lean()
            ok(after.headline === `EDITED ${stamp}`,
                `the edit survived a re-read ("${after.headline}")`)
        }

        // ── 5: pause ────────────────────────────────────────────────────────
        console.log('\n[5] pause')
        await svc.updateOffer(req({ status: OFFER_STATUS.PAUSED }, { id: ids[0] }))
        const paused = await OfferModel.findById(ids[0]).lean()
        ok(paused.status === OFFER_STATUS.PAUSED, `status is now "${paused.status}"`)

        // ── 6: the new single read ──────────────────────────────────────────
        console.log('\n[6] GET one offer (new endpoint)')
        let r = await svc.getOffer(req({}, { id: ids[0] }))
        ok(r.success === true, 'single offer read works')
        ok(unwrap(r)?.linkages?.total === 0, 'it reports 0 customer linkages')
        ok(unwrap(r)?.linkages?.deletable === true, 'and says it is safely deletable')
        r = await svc.getOffer(req({}, { id: new mongoose.Types.ObjectId() }))
        ok(r.success === false, 'a missing offer is reported, not crashed on')

        // ── 7: delete an unused offer ───────────────────────────────────────
        console.log('\n[7] delete a test offer that was never given out')
        r = await svc.deleteOffer(req({}, { id: ids[2] }))
        ok(r.success === true, `delete accepted (${r.success ? 'ok' : r.data?.error})`)
        ok(unwrap(r)?.deleted === true, 'reported as really deleted')
        ok((await OfferModel.findById(ids[2])) === null,
            'and it is genuinely gone from the database')

        // ── 8-9: an offer customers are holding ─────────────────────────────
        console.log('\n[8] delete an offer a customer is currently holding')
        const link = await CustomerOfferModel.create({
            userId: customer._id,
            offerId: ids[1],
            status: CUSTOMER_OFFER_STATUS.ASSIGNED,
        })
        created.linkageIds.push(link._id)
        r = await svc.deleteOffer(req({}, { id: ids[1] }))
        ok(r.success === false, `refused ("${r.data?.error}")`)
        ok(r.data?.requiresForce === true, 'the refusal says it can be forced')
        ok(r.data?.liveLinkages === 1, `and names how many hold it (${r.data?.liveLinkages})`)
        ok(!!(await OfferModel.findById(ids[1])), 'the offer was NOT touched')

        console.log('\n[9] the same delete with force=true')
        r = await svc.deleteOffer(req({}, { id: ids[1] }, { force: 'true' }))
        ok(r.success === true, `accepted (${r.success ? 'ok' : r.data?.error})`)
        ok(unwrap(r)?.archived === true, 'archived rather than deleted (history is kept)')
        ok(unwrap(r)?.cancelledLinkages === 1, "the customer's offer was cancelled")
        const arch = await OfferModel.findById(ids[1]).lean()
        ok(arch?.status === OFFER_STATUS.ARCHIVED, `status is "${arch?.status}"`)
        const relink = await CustomerOfferModel.findById(link._id).lean()
        ok(relink?.status === CUSTOMER_OFFER_STATUS.CANCELLED,
            `the linkage is cancelled, not deleted ("${relink?.status}") — the record survives`)
        ok(!!relink?.cancelledAt,
            `and it is stamped with WHEN it was cancelled (${relink?.cancelledAt?.toISOString?.() || relink?.cancelledAt})`)

        // ── 10: only finished linkages ──────────────────────────────────────
        console.log('\n[10] delete an offer whose linkages are all finished')
        const doneLink = await CustomerOfferModel.create({
            userId: customer._id,
            offerId: ids[0],
            status: CUSTOMER_OFFER_STATUS.REDEEMED,
        })
        created.linkageIds.push(doneLink._id)
        r = await svc.deleteOffer(req({}, { id: ids[0] }))
        ok(r.success === true, `accepted without force (${r.success ? 'ok' : r.data?.error})`)
        ok(unwrap(r)?.archived === true, 'archived, because someone really received it')
        ok(unwrap(r)?.cancelledLinkages === 0, 'nothing live needed cancelling')
        const stillRedeemed = await CustomerOfferModel.findById(doneLink._id).lean()
        ok(stillRedeemed?.status === CUSTOMER_OFFER_STATUS.REDEEMED,
            'the redeemed record is untouched — the benefit given is still on file')
    } catch (e) {
        FAIL++
        console.log('\n  ✗ THREW:', e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)
    } finally {
        console.log('\nCleaning up…')
        await CustomerOfferModel.deleteMany({ _id: { $in: created.linkageIds } })
        await OfferModel.deleteMany({ _id: { $in: created.offerIds } })
        await AuditLogModel.deleteMany({ userId: { $in: created.userIds } })
        await UserModel.deleteMany({ _id: { $in: created.userIds } })
        const leftOffers = await OfferModel.countDocuments({ _id: { $in: created.offerIds } })
        const leftLinks = await CustomerOfferModel.countDocuments({ _id: { $in: created.linkageIds } })
        console.log(`  leftover offers: ${leftOffers}, leftover linkages: ${leftLinks}`)
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed\n`)
        process.exit(FAIL ? 1 : 0)
    }
}

main()
