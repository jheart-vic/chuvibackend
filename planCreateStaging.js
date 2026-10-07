/**
 * Subscription plan create/update/delete — client brief 6 Oct 2026, item 2.5
 * ("the screen says it cannot create the plan").
 *
 * THE BUG: the plan WAS created. `createAuditLog` rethrows, every plan write
 * logs AFTER the data is saved, and `category: 'subscription'` was not in
 * AUDIT_LOG_CATEGORIES — so Mongoose rejected the audit row, the catch returned
 * "Something went wrong. Please try again later", and the admin's retry then hit
 * "Plan title already exists". Same shape in updatePlan, deletePlan and
 * cancelSubscription.
 *
 * Scenarios:
 *   1  'subscription' is a valid audit category at all (the trigger is gone)
 *   2  the client's test: create a plan → success, plan readable back, audited
 *   3  an audit-log failure can NEVER report a saved plan as failed
 *   4  missing paystackPlanCode → the message NAMES the field, nothing created
 *   5  itemPerMonth omitted → still creates (the model does not store it)
 *   6  negative freePickupDeliveryPerWeek → named rejection, nothing created
 *   7  duplicate title (and a different-case duplicate) → one plan, clear message
 *   8  update returns the saved plan; a bad edit is named; audit cannot undo it
 *   9  renaming a plan onto an existing title → clear duplicate message
 *  10  delete really deletes, and an audit failure cannot report otherwise
 *  11  update/delete of an unknown id → "Plan not found"
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Deletes everything it
 * creates.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node planCreateStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const PlanModel = require('./models/plan.model')
const AuditLogModel = require('./models/audit.log.model')
const SubscriptionService = require('./services/subscription.service')
const { AUDIT_LOG_CATEGORIES } = require('./util/constants')

const svc = new SubscriptionService()
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
const errOf = (r) => r?.data?.error
const msgOf = (r) => r?.data?.message
const planOf = (r) => r?.data?.data

const STAMP = Date.now()
const ADMIN = new mongoose.Types.ObjectId()
const asReq = (body, params = {}) => ({ body, params, user: { id: ADMIN } })

const validBody = (suffix, extra = {}) => ({
    title: `STG Plan ${STAMP} ${suffix}`,
    description: 'Staging plan for brief item 2.5',
    duration: 'monthly',
    price: 5000,
    monthlyLimits: 45,
    features: ['Free pickup & delivery', 'Ironing included'],
    paystackPlanCode: `PLN_stg${STAMP}${suffix}`,
    ...extra,
})

// Force the audit write to fail, exactly as the missing enum value used to.
const withBrokenAudit = async (fn) => {
    const real = AuditLogModel.create
    AuditLogModel.create = () =>
        Promise.reject(new Error('simulated audit-log failure'))
    try {
        return await fn()
    } finally {
        AuditLogModel.create = real
    }
}

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

    try {
        // ── 1 the trigger itself ──────────────────────────────────────────────
        console.log('\n1 — the audit category that broke plan creation')
        ok(
            AUDIT_LOG_CATEGORIES.SUBSCRIPTION === 'subscription',
            "AUDIT_LOG_CATEGORIES now contains 'subscription'",
        )
        const probe = new AuditLogModel({
            userId: ADMIN,
            action: 'probe',
            category: 'subscription',
        })
        ok(
            !probe.validateSync(),
            "an audit row with category 'subscription' now validates (it used to throw)",
        )

        // ── 2 the client's own test ───────────────────────────────────────────
        console.log('\n2 — create a plan (the client\'s test)')
        const created = await svc.createPlan(asReq(validBody('A')))
        ok(created.success === true, 'createPlan reports SUCCESS')
        ok(msgOf(created) === 'Plan created successfully', 'the message says so')
        const planA = planOf(created)
        ok(!!planA?._id, 'the created plan is returned to the FE')
        const readBackA = planA && (await PlanModel.findById(planA._id))
        ok(!!readBackA, 'the plan is really in the database')
        ok(
            readBackA?.monthlyLimits === 45 &&
                readBackA?.freePickupDeliveryPerWeek === 0,
            'the stored plan carries its limits (free legs defaulting to 0)',
        )
        const auditA = await AuditLogModel.findOne({
            userId: ADMIN,
            category: 'subscription',
            action: { $regex: 'Created a new plan' },
        })
        ok(!!auditA, 'the creation is AUDITED (the row that used to be rejected)')

        // ── 3 an audit failure must not reverse a saved plan ──────────────────
        console.log('\n3 — a broken audit log can no longer fail a saved plan')
        const bodyB = validBody('B')
        const createdB = await withBrokenAudit(() => svc.createPlan(asReq(bodyB)))
        ok(createdB.success === true, 'createPlan still reports SUCCESS')
        const planB = await PlanModel.findOne({ title: bodyB.title })
        ok(!!planB, 'the plan exists, and the operator was told the truth')
        ok(
            planOf(createdB)?._id?.toString() === planB?._id?.toString(),
            'the response names the plan that was actually written',
        )

        // ── 4 the required field is named ─────────────────────────────────────
        console.log('\n4 — a missing paystackPlanCode names the field')
        const noCode = validBody('C')
        delete noCode.paystackPlanCode
        const resNoCode = await svc.createPlan(asReq(noCode))
        ok(resNoCode.success === false, 'refused')
        ok(
            /paystackPlanCode/i.test(errOf(resNoCode) || ''),
            `the message NAMES the field: ${JSON.stringify(errOf(resNoCode))}`,
        )
        ok(
            !/Something went wrong/i.test(errOf(resNoCode) || ''),
            'it is not the generic server error any more',
        )
        ok(
            !(await PlanModel.findOne({ title: noCode.title })),
            'nothing was created',
        )

        // ── 5 the phantom required field ──────────────────────────────────────
        console.log('\n5 — itemPerMonth is not demanded (the model does not store it)')
        const noItems = validBody('D')
        const resNoItems = await svc.createPlan(asReq(noItems))
        ok(resNoItems.success === true, 'a plan with no itemPerMonth creates fine')
        ok(
            !('itemPerMonth' in (planOf(resNoItems)?.toObject?.() || {})),
            'and the field is not stored (so requiring it was meaningless)',
        )

        // ── 6 negative free legs ──────────────────────────────────────────────
        console.log('\n6 — a negative weekly allowance is refused by name')
        const neg = validBody('E', { freePickupDeliveryPerWeek: -2 })
        const resNeg = await svc.createPlan(asReq(neg))
        ok(resNeg.success === false, 'refused')
        ok(
            /freePickupDeliveryPerWeek/i.test(errOf(resNeg) || ''),
            `the message names the field: ${JSON.stringify(errOf(resNeg))}`,
        )
        ok(!(await PlanModel.findOne({ title: neg.title })), 'nothing was created')

        // ── 7 duplicates ──────────────────────────────────────────────────────
        console.log('\n7 — a duplicate title is refused clearly, and only once exists')
        const dup = await svc.createPlan(
            asReq(validBody('A', { paystackPlanCode: `PLN_stg${STAMP}A2` })),
        )
        ok(dup.success === false, 'the same title is refused')
        ok(errOf(dup) === 'Plan title already exists', `clear message: ${errOf(dup)}`)
        const dupCase = await svc.createPlan(
            asReq({
                ...validBody('A'),
                title: validBody('A').title.toUpperCase(),
                paystackPlanCode: `PLN_stg${STAMP}A3`,
            }),
        )
        ok(dupCase.success === false, 'a different-case duplicate is refused too')
        ok(
            (await PlanModel.countDocuments({ title: validBody('A').title })) === 1,
            'exactly one plan with that title exists (no double-create)',
        )

        // ── 8 update ──────────────────────────────────────────────────────────
        console.log('\n8 — update returns the saved plan and cannot be undone by the log')
        const upd = await svc.updatePlan(
            asReq({ price: 7500, monthlyLimits: 60 }, { id: planA._id.toString() }),
        )
        ok(upd.success === true, 'updatePlan reports SUCCESS')
        ok(planOf(upd)?.price === 7500, 'the saved plan comes back with the new price')
        const freshA = await PlanModel.findById(planA._id)
        ok(freshA?.price === 7500 && freshA?.monthlyLimits === 60, 'the edit persisted')
        const updBroken = await withBrokenAudit(() =>
            svc.updatePlan(asReq({ price: 8100 }, { id: planA._id.toString() })),
        )
        ok(updBroken.success === true, 'an audit failure does not fail a saved edit')
        ok(
            (await PlanModel.findById(planA._id))?.price === 8100,
            'and the edit is there',
        )
        const badEdit = await svc.updatePlan(
            asReq({ price: 'not-a-number' }, { id: planA._id.toString() }),
        )
        ok(badEdit.success === false, 'a non-numeric price is refused')
        ok(
            /price/i.test(errOf(badEdit) || ''),
            `the message names the field: ${JSON.stringify(errOf(badEdit))}`,
        )
        ok(
            (await PlanModel.findById(planA._id))?.price === 8100,
            'and the stored price is untouched',
        )

        // ── 9 rename onto an existing title ───────────────────────────────────
        console.log('\n9 — renaming a plan onto an existing title')
        const clash = await svc.updatePlan(
            asReq({ title: validBody('A').title }, { id: planB._id.toString() }),
        )
        ok(clash.success === false, 'refused')
        ok(
            /already exists/i.test(errOf(clash) || ''),
            `the message explains the clash: ${JSON.stringify(errOf(clash))}`,
        )

        // ── 10 delete ─────────────────────────────────────────────────────────
        console.log('\n10 — delete, including with a broken audit log')
        const del = await withBrokenAudit(() =>
            svc.deletePlan(asReq({}, { id: planB._id.toString() })),
        )
        ok(del.success === true, 'deletePlan reports SUCCESS despite the log failing')
        ok(!(await PlanModel.findById(planB._id)), 'the plan is really gone')

        // ── 11 unknown ids ────────────────────────────────────────────────────
        console.log('\n11 — unknown plan ids')
        const ghost = new mongoose.Types.ObjectId().toString()
        const updGhost = await svc.updatePlan(asReq({ price: 100 }, { id: ghost }))
        ok(
            updGhost.success === false && errOf(updGhost) === 'Plan not found',
            'updating an unknown plan says "Plan not found"',
        )
        const delGhost = await svc.deletePlan(asReq({}, { id: ghost }))
        ok(
            delGhost.success === false && errOf(delGhost) === 'Plan not found',
            'deleting an unknown plan says "Plan not found"',
        )
    } finally {
        const plans = await PlanModel.deleteMany({
            title: { $regex: `STG Plan ${STAMP}`, $options: 'i' },
        })
        const logs = await AuditLogModel.deleteMany({ userId: ADMIN })
        console.log(
            `\ncleanup: ${plans.deletedCount} plans, ${logs.deletedCount} audit rows removed`,
        )
        const leftover = await PlanModel.countDocuments({
            title: { $regex: `STG Plan ${STAMP}`, $options: 'i' },
        })
        ok(leftover === 0, 'no staging plans left behind')
        await mongoose.disconnect()
    }
    console.log(`\n${PASS} passed, ${FAIL} failed\n`)
    process.exit(FAIL ? 1 : 0)
}

main().catch(async (e) => {
    console.error('HARNESS ERROR:', e)
    try {
        await mongoose.disconnect()
    } catch (_) {}
    process.exit(1)
})
