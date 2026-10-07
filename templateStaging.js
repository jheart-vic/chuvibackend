/**
 * Communication templates — client brief 6 Oct 2026, items 4.1 and 4.2.
 *
 * 4.1 "Saving a change to a template always returns an error with status 400."
 *     Reproduces the client's own test (edit an SMS template's text, save, reopen)
 *     against the payload shapes a real admin UI actually sends — above all the
 *     common one: PUT the WHOLE object that GET returned, with one field changed.
 * 4.2 the keys/target-pages list endpoint the editor needs for its dropdowns.
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Restores every template
 * it touches and deletes what it creates.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node templateStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const TemplateModel = require('./models/template.model')
const UserModel = require('./models/user.model')
const AuditLogModel = require('./models/audit.log.model')
const CommunicationAdminService = require('./services/communicationAdmin.service')
const { ROLE, GENERAL_STATUS, COMM_CHANNEL } = require('./util/constants')

const svc = new CommunicationAdminService()
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
const errOf = (r) => r?.data?.error
const STAMP = Date.now()

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

    const created = { userIds: [], templateIds: [] }
    let original = null
    let target = null
    try {
        const admin = await UserModel.create({
            email: `stgtpl${STAMP}@example.com`,
            fullName: 'STG Admin',
            phoneNumber: '08040000001',
            userType: ROLE.ADMIN,
            status: GENERAL_STATUS.ACTIVE,
            isVerified: true,
        })
        created.userIds.push(admin._id)
        const asAdmin = (body, id) => ({
            body,
            params: id ? { id: String(id) } : {},
            query: {},
            user: { id: admin._id.toString() },
        })

        // Work on a template of our own so a failed edit can never damage a real
        // one, but shaped exactly like the seeded SMS-bearing templates.
        target = await TemplateModel.create({
            key: `stg-template-${STAMP}`,
            name: 'STG Offer Available',
            title: 'A new reward is waiting for you',
            body: 'Hello {{firstName}}! You have a new offer: {{offerName}}.',
            smsBody: 'Hello {{firstName}}! A new CHUVI offer is waiting.',
            channels: [COMM_CHANNEL.IN_APP],
            page: 'offers',
        })
        created.templateIds.push(target._id)
        original = target.toObject()

        // ── 1 the client's test, the way an admin UI actually sends it ─────────
        // A form that loaded the template from GET and PUTs the whole object back,
        // including _id / key / timestamps / __v. This is the shape most likely to
        // be behind "saving ALWAYS returns 400".
        console.log("\n1 — the client's test: edit the SMS text and save")
        const loaded = unwrap(await svc.listTemplates(asAdmin({})))
        const list = Array.isArray(loaded) ? loaded : loaded?.data || []
        ok(Array.isArray(list) && list.length > 0, `GET templates returns a list (${list.length})`)

        const fromList = list.find((t) => String(t._id) === String(target._id))
        ok(!!fromList, 'our template is in the list the editor would load')

        const wholeObject = {
            ...(fromList || original),
            smsBody: 'EDITED by the staging harness — SMS text v2.',
        }
        const r1 = await svc.updateTemplate(asAdmin(wholeObject, target._id))
        ok(
            r1.success === true,
            `PUT of the WHOLE object saves${r1.success ? '' : ` — got: ${JSON.stringify(errOf(r1))}`}`,
        )
        const reopened = await TemplateModel.findById(target._id).lean()
        ok(
            reopened?.smsBody === 'EDITED by the staging harness — SMS text v2.',
            'reopening shows the edit (the brief\'s "reopen it" step)',
        )

        // ── 2 a minimal patch ─────────────────────────────────────────────────
        console.log('\n2 — a minimal patch of one field')
        const r2 = await svc.updateTemplate(
            asAdmin({ smsBody: 'Minimal patch v3.' }, target._id),
        )
        ok(r2.success === true, `one-field patch saves${r2.success ? '' : ` — ${errOf(r2)}`}`)
        ok(
            (await TemplateModel.findById(target._id).lean())?.smsBody === 'Minimal patch v3.',
            'and persists',
        )

        // ── 3 channels as a bare STRING (a single-select dropdown) ─────────────
        console.log('\n3 — channels sent as a string instead of an array')
        const r3 = await svc.updateTemplate(asAdmin({ channels: 'sms' }, target._id))
        ok(
            r3.success === true,
            `a single channel as a string is accepted${r3.success ? '' : ` — ${errOf(r3)}`}`,
        )
        const afterStr = await TemplateModel.findById(target._id).lean()
        ok(
            Array.isArray(afterStr?.channels) && afterStr.channels.includes('sms'),
            `stored as an array: ${JSON.stringify(afterStr?.channels)}`,
        )

        // ── 4 an unknown channel must be NAMED, never generic ─────────────────
        console.log('\n4 — rejections have to name the problem')
        const r4 = await svc.updateTemplate(
            asAdmin({ channels: ['sms', 'carrier-pigeon'] }, target._id),
        )
        ok(r4.success === false, 'an unknown channel is refused')
        ok(
            /carrier-pigeon/.test(errOf(r4) || ''),
            `naming the bad value: ${errOf(r4)}`,
        )
        ok(
            !/Failed to update template/i.test(errOf(r4) || ''),
            'and not with the generic message',
        )

        // ── 5 emptying a required field ────────────────────────────────────────
        const r5 = await svc.updateTemplate(asAdmin({ body: '   ' }, target._id))
        ok(r5.success === false, 'blanking the body is refused')
        ok(
            /body/i.test(errOf(r5) || '') && !/Failed to update template/i.test(errOf(r5) || ''),
            `naming the field: ${errOf(r5)}`,
        )
        ok(
            (await TemplateModel.findById(target._id).lean())?.body?.trim().length > 0,
            'and the stored body is untouched',
        )

        // ── 6 unknown template / unknown page ─────────────────────────────────
        const ghost = await svc.updateTemplate(
            asAdmin({ smsBody: 'x' }, new mongoose.Types.ObjectId()),
        )
        ok(
            ghost.success === false && /not found/i.test(errOf(ghost) || ''),
            'an unknown template id says "Template not found"',
        )

        // ── 7 the key is immutable ────────────────────────────────────────────
        console.log('\n7 — the key stays immutable')
        await svc.updateTemplate(asAdmin({ key: 'hijacked-key' }, target._id))
        ok(
            (await TemplateModel.findById(target._id).lean())?.key === `stg-template-${STAMP}`,
            'the key cannot be changed through an edit',
        )

        // ── 8 the audit trail cannot fail the save (the 2.5 class) ─────────────
        console.log('\n8 — a broken audit log cannot fail a saved template')
        const realAudit = AuditLogModel.create
        AuditLogModel.create = () => Promise.reject(new Error('simulated audit failure'))
        let r8
        try {
            r8 = await svc.updateTemplate(asAdmin({ smsBody: 'Saved v8.' }, target._id))
        } finally {
            AuditLogModel.create = realAudit
        }
        ok(r8.success === true, 'the save still reports success')
        ok(
            (await TemplateModel.findById(target._id).lean())?.smsBody === 'Saved v8.',
            'and the edit is there',
        )

        // ── 9 the 4.2 dropdown source ─────────────────────────────────────────
        console.log('\n9 — the keys / target-pages lists the editor needs (4.2)')
        const meta = unwrap(await svc.getTemplateMeta(asAdmin({})))
        ok(!!meta, 'getTemplateMeta returns something')
        ok(
            Array.isArray(meta?.pages) && meta.pages.length > 0,
            `target pages are listed (${meta?.pages?.length})`,
        )
        ok(
            meta?.pages?.every((p) => p.page && p.description),
            'every page carries a one-line description (the client asked for this)',
        )
        ok(
            Array.isArray(meta?.placeholders) && meta.placeholders.length > 0,
            `placeholder keys are listed (${meta?.placeholders?.length})`,
        )
        ok(
            meta?.placeholders?.every((k) => k.key && k.description),
            'every key carries a one-line description',
        )
        ok(
            meta?.placeholders?.some((k) => k.key === 'firstName'),
            'the universal {{firstName}} key is included',
        )
        const offerKeys = (meta?.templates || []).find((t) => t.key?.includes('offer'))
        ok(
            Array.isArray(meta?.templates) && meta.templates.length > 0,
            `the template keys other systems send by are listed (${meta?.templates?.length})`,
        )
        ok(
            Array.isArray(meta?.channels) && meta.channels.includes('sms'),
            'channels are listed too',
        )
    } finally {
        if (original && target) {
            await TemplateModel.findByIdAndUpdate(target._id, { $set: original })
        }
        const t = await TemplateModel.deleteMany({ _id: { $in: created.templateIds } })
        const u = await UserModel.deleteMany({ _id: { $in: created.userIds } })
        const a = await AuditLogModel.deleteMany({ userId: { $in: created.userIds } })
        console.log(
            `\ncleanup: ${t.deletedCount} templates, ${u.deletedCount} users, ${a.deletedCount} audit rows`,
        )
        ok(
            (await TemplateModel.countDocuments({ key: { $regex: `stg-template-${STAMP}` } })) === 0,
            'no staging templates left behind',
        )
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
