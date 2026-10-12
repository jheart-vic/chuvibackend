/**
 * Launch item 6 — the registration welcome (SMS + in-app) and the
 * "Registered, not booked" schedule save, driven through the real services.
 *
 * Scenarios:
 *   0  boot seeds the two welcome templates onto an EXISTING settings document
 *   1  the schedule saves (it was silently dropped), anchor/slot survive, a
 *      same-minute clash is refused, and leadSchedule still saves
 *   2  email sign-up → one in-app notice + one SMS with first name and end day
 *   3  Google sign-up → notice at sign-up, SMS only when the phone is added,
 *      once (a repeat sends nothing)
 *   4  no live Welcome Offer (none, or already ended) → the no-offer text
 *   5  an edited template is what gets sent
 *   6  a failing SMS never breaks sign-up or the phone step
 *
 * SMS is stubbed (nothing is texted). SAFETY: refuses unless STAGING_OK=1;
 * refuses NODE_ENV=production without STAGING_FORCE=1; hard-refuses any DB named
 * laundrydb. Restores the settings it edits and cleans up after itself.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node welcomeStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const sms = { sent: [], fail: false }
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = {
    id: smsPath,
    filename: smsPath,
    loaded: true,
    exports: async (to, message) => {
        if (sms.fail) throw new Error('simulated SMS outage')
        sms.sent.push({ to, message })
        return { stubbed: true }
    },
}
const mongoose = require('mongoose')
const moment = require('moment-timezone')
const UserModel = require('./models/user.model')
const CrmProfileModel = require('./models/crmProfile.model')
const CrmScheduledMessageModel = require('./models/crmScheduledMessage.model')
const CrmMessageLogModel = require('./models/crmMessageLog.model')
const CrmSettingModel = require('./models/crmSetting.model')
const NotificationModel = require('./models/notification.model')
const OfferModel = require('./models/offer.model')
const CustomerOfferModel = require('./models/customerOffer.model')
const CrmService = require('./services/crm.service')
const UserService = require('./services/user.service')
const setupApp = require('./config/setup')
const { CRM_MESSAGE_TYPE, OFFER_TYPE, OFFER_STATUS, OFFER_TRIGGER, ROLE } = require('./util/constants')

const crm = CrmService instanceof Function ? new CrmService() : CrmService
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
const until = async (fn, ms = 8000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
        if (await fn()) return true
        await new Promise((r) => setTimeout(r, 150))
    }
    return false
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

    const stamp = Date.now()
    const created = { userIds: [], offerIds: [] }
    const original = await CrmSettingModel.findOne({}).lean()
    if (!original) {
        console.log('SKIPPED — CrmSetting unseeded; boot the app once against this DB.')
        await mongoose.disconnect()
        return
    }
    // Other active First Experience offers would decide the end day; park
    // them for the run and restore them after.
    const parked = await OfferModel.find({
        status: OFFER_STATUS.ACTIVE,
        $or: [{ triggers: OFFER_TRIGGER.FIRST_EXPERIENCE }, { trigger: OFFER_TRIGGER.FIRST_EXPERIENCE }],
    })
        .select('_id')
        .lean()
    const admin = { id: new mongoose.Types.ObjectId().toString() }
    const update = (body) => crm.updateSettings({ body, user: admin })

    try {
        await OfferModel.updateMany({ _id: { $in: parked.map((o) => o._id) } }, { status: OFFER_STATUS.PAUSED })

        // ── 0 ── boot seeds the new templates onto an existing document ────
        console.log('\n[0] Boot seeds the welcome templates onto the existing settings')
        await CrmSettingModel.updateOne(
            { _id: original._id },
            { $unset: { 'templates.registration-welcome': '', 'templates.registration-welcome-no-offer': '' } },
        )
        await setupApp()
        let setting = await CrmSettingModel.findOne({})
        ok(!!setting.templates.get(CRM_MESSAGE_TYPE.REGISTRATION_WELCOME), 'registration-welcome seeded')
        ok(!!setting.templates.get(CRM_MESSAGE_TYPE.REGISTRATION_WELCOME_NO_OFFER), 'registration-welcome-no-offer seeded')

        // ── 1 ── the schedule save ──────────────────────────────────────────
        console.log('\n[1] The "Registered, not booked" schedule saves')
        const sched = JSON.parse(JSON.stringify(setting.registeredNotBookedSchedule))
        const moved = sched.map((s) => (s.messageType === CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1 ? { ...s, delayMinutes: 2160 } : s))
        let res = await update({ registeredNotBookedSchedule: moved })
        setting = await CrmSettingModel.findOne({}).lean()
        const m1 = setting.registeredNotBookedSchedule.find((s) => s.messageType === CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1)
        const m2 = setting.registeredNotBookedSchedule.find((s) => s.messageType === CRM_MESSAGE_TYPE.REG_NOT_BOOKED_2)
        const m3 = setting.registeredNotBookedSchedule.find((s) => s.messageType === CRM_MESSAGE_TYPE.REG_NOT_BOOKED_3)
        ok(res.success && m1?.delayMinutes === 2160, `message 1 moved to 36 hours and it PERSISTED (${m1?.delayMinutes})`)
        ok(m2?.anchor === 'offer-end' && m2?.preferSlot === 'evening' && m3?.anchor === 'offer-end' && m3?.preferSlot === 'morning',
            'messages 2 and 3 keep their offer-end anchor and their windows')
        res = await update({ registeredNotBookedSchedule: sched })
        setting = await CrmSettingModel.findOne({}).lean()
        ok(res.success && setting.registeredNotBookedSchedule.find((s) => s.messageType === CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1).delayMinutes === sched.find((s) => s.messageType === CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1).delayMinutes,
            'saving the original schedule back works (default round-trips)')
        res = await update({
            registeredNotBookedSchedule: [
                { messageType: CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1, delayMinutes: 60 },
                { messageType: CRM_MESSAGE_TYPE.REG_NOT_BOOKED_MARK_PROSPECT, delayMinutes: 60 },
            ],
        })
        ok(!res.success && /same minute/.test(res.data?.error || ''), `a same-minute clash is refused (${res.data?.error})`)
        res = await update({ registeredNotBookedSchedule: [{ messageType: CRM_MESSAGE_TYPE.LEAD_WELCOME, delayMinutes: 5 }] })
        ok(!res.success, `a lead message in this schedule is refused (${res.data?.error})`)
        res = await update({ leadSchedule: JSON.parse(JSON.stringify(original.leadSchedule)) })
        ok(res.success, 'leadSchedule still saves as before')

        // A First Experience offer with a 3-day window for the sign-ups below.
        const offer = await OfferModel.create({
            name: `STG Welcome ${stamp}`,
            headline: 'Free pickup and delivery on your first order',
            type: OFFER_TYPE.PERSONAL,
            status: OFFER_STATUS.ACTIVE,
            triggers: [OFFER_TRIGGER.FIRST_EXPERIENCE],
            customerWindowDays: 3,
            rules: { firstOrderOnly: true, minOrderValue: 4000, oneUsePerCustomer: true },
            benefits: [{ benefitType: 'free-pickup' }, { benefitType: 'free-delivery' }],
        })
        created.offerIds.push(offer._id)

        let n = 0
        const makeUser = async (name, phone) => {
            n++
            const user = await UserModel.create({
                email: `welcome_${n}_${stamp}@example.com`,
                fullName: name,
                ...(phone && { phoneNumber: `0807${String(stamp).slice(-6)}${n}` }),
                userType: ROLE.USER,
            })
            created.userIds.push(user._id)
            return user
        }
        const notices = (userId) => NotificationModel.find({ userId, title: 'Welcome to Chuvi Laundry' }).lean()
        const smsTo = (user) => sms.sent.filter((s) => user.phoneNumber && s.to === user.phoneNumber)
        const endDayOf = async (user) => {
            const l = await CustomerOfferModel.findOne({ userId: user._id, offerId: offer._id }).lean()
            return l?.expiresAt ? moment(l.expiresAt).tz('Africa/Lagos').format('dddd D MMMM') : null
        }

        // ── 2 ── email sign-up ──────────────────────────────────────────────
        console.log('\n[2] Email sign-up: in-app + SMS at once')
        const ada = await makeUser('Ada Welcome', true)
        await crm.handleUserRegistered(ada)
        const adaDay = await endDayOf(ada)
        const adaNotes = await notices(ada._id)
        ok(!!adaDay, `the Welcome Offer was granted (ends ${adaDay})`)
        ok(adaNotes.length === 1 && /Hello Ada,/.test(adaNotes[0].body) && adaNotes[0].body.includes(`by ${adaDay}`),
            `one in-app notice with first name and end day: "${adaNotes[0]?.body.split('\n')[0]}"`)
        ok(smsTo(ada).length === 1 && smsTo(ada)[0].message === adaNotes[0]?.body, 'one SMS with the same text')
        const adaProfile = await CrmProfileModel.findOne({ userId: ada._id }).lean()
        ok(!!(await CrmMessageLogModel.exists({ profileId: adaProfile?._id, messageType: CRM_MESSAGE_TYPE.REGISTRATION_WELCOME, channel: 'sms', success: true })),
            'logged once in the CRM message log')

        // ── 3 ── Google sign-up ─────────────────────────────────────────────
        console.log('\n[3] Google sign-up: notice now, SMS when the phone is added, once')
        const bola = await makeUser('Bola Google', false)
        await crm.handleUserRegistered(bola)
        ok((await notices(bola._id)).length === 1, 'in-app notice at sign-up')
        const bolaProfile = await CrmProfileModel.findOne({ userId: bola._id }).lean()
        ok(!(await CrmMessageLogModel.exists({ profileId: bolaProfile?._id, messageType: { $in: [CRM_MESSAGE_TYPE.REGISTRATION_WELCOME, CRM_MESSAGE_TYPE.REGISTRATION_WELCOME_NO_OFFER] } })),
            'no SMS attempted yet (no phone)')
        const phone = `0809${String(stamp).slice(-6)}9`
        res = await new UserService().completeProfile({ user: { id: String(bola._id) }, body: { phoneNumber: phone } })
        ok(res.success, 'the phone step succeeds')
        const got = await until(() => sms.sent.some((s) => s.to === phone))
        const bolaSms = sms.sent.filter((s) => s.to === phone)
        const bolaDay = await endDayOf(bola)
        ok(got && bolaSms.length === 1 && bolaSms[0].message.includes(`by ${bolaDay}`), `the SMS went when the phone was added (${bolaSms.length})`)
        await crm.handleProfileCompleted(await UserModel.findById(bola._id).lean())
        ok(sms.sent.filter((s) => s.to === phone).length === 1, 'a repeat sends nothing (once per customer)')

        // ── 4 ── no live Welcome Offer ──────────────────────────────────────
        console.log('\n[4] No live Welcome Offer → the no-offer text')
        await OfferModel.updateOne({ _id: offer._id }, { status: OFFER_STATUS.PAUSED })
        const chidi = await makeUser('Chidi NoOffer', true)
        await crm.handleUserRegistered(chidi)
        const chidiSms = smsTo(chidi)
        ok(chidiSms.length === 1 && /^Hello Chidi, welcome to CHUVI! We pick up/.test(chidiSms[0].message) && !/{{|by\s*$/.test(chidiSms[0].message),
            `no offer → no-offer text: "${chidiSms[0]?.message.split('\n')[0]}"`)
        const dayo = await makeUser('Dayo Ended', true)
        const dayoProfile = (await crm.findOrCreateProfile({ userId: dayo._id, fullName: dayo.fullName, phoneNumber: dayo.phoneNumber })).profile ||
            (await CrmProfileModel.findOne({ userId: dayo._id }))
        await crm.sendRegistrationWelcome({ user: dayo, profile: dayoProfile, offerEndsAt: new Date(Date.now() - 3600e3) })
        ok(smsTo(dayo).length === 1 && /We pick up, clean and deliver/.test(smsTo(dayo)[0].message), 'an offer that already ended → the no-offer text')
        await OfferModel.updateOne({ _id: offer._id }, { status: OFFER_STATUS.ACTIVE })

        // ── 5 ── an edited template is what gets sent ───────────────────────
        console.log('\n[5] An edited template is what gets sent')
        res = await update({ templates: { [CRM_MESSAGE_TYPE.REGISTRATION_WELCOME]: 'Hi {{firstName}}! Your offer runs until {{offerEndDay}}.' } })
        ok(res.success, 'the welcome template is editable in CRM settings')
        const efe = await makeUser('Efe Edited', true)
        await crm.handleUserRegistered(efe)
        const efeDay = await endDayOf(efe)
        ok(smsTo(efe)[0]?.message === `Hi Efe! Your offer runs until ${efeDay}.`, `sent the edited text: "${smsTo(efe)[0]?.message}"`)

        // ── 6 ── a failing SMS never breaks anything ────────────────────────
        console.log('\n[6] A failing SMS never breaks sign-up or the phone step')
        sms.fail = true
        const funke = await makeUser('Funke Outage', true)
        let threw = null
        try {
            await crm.handleUserRegistered(funke)
        } catch (e) {
            threw = e
        }
        ok(!threw, 'sign-up handling completes')
        ok((await notices(funke._id)).length === 1, 'the in-app notice still arrives')
        const funkeProfile = await CrmProfileModel.findOne({ userId: funke._id }).lean()
        ok(!!(await CrmMessageLogModel.exists({ profileId: funkeProfile?._id, messageType: CRM_MESSAGE_TYPE.REGISTRATION_WELCOME, success: false })), 'the failed SMS is logged as failed')
        const gogo = await makeUser('Gogo Outage', false)
        await crm.handleUserRegistered(gogo)
        res = await new UserService().completeProfile({ user: { id: String(gogo._id) }, body: { phoneNumber: `0805${String(stamp).slice(-6)}7` } })
        ok(res.success, 'the phone step still succeeds')
        await new Promise((r) => setTimeout(r, 1500))
        sms.fail = false
    } finally {
        const profiles = await CrmProfileModel.find({ userId: { $in: created.userIds } }).select('_id').lean()
        const profileIds = profiles.map((p) => p._id)
        await CrmMessageLogModel.deleteMany({ profileId: { $in: profileIds } })
        await CrmScheduledMessageModel.deleteMany({ profileId: { $in: profileIds } })
        await CrmProfileModel.deleteMany({ _id: { $in: profileIds } })
        await NotificationModel.deleteMany({ userId: { $in: created.userIds } })
        await CustomerOfferModel.deleteMany({ userId: { $in: created.userIds } })
        await UserModel.deleteMany({ _id: { $in: created.userIds } })
        await OfferModel.deleteMany({ _id: { $in: created.offerIds } })
        await OfferModel.updateMany({ _id: { $in: parked.map((o) => o._id) } }, { status: OFFER_STATUS.ACTIVE })
        await CrmSettingModel.updateOne(
            { _id: original._id },
            {
                $set: {
                    registeredNotBookedSchedule: original.registeredNotBookedSchedule,
                    leadSchedule: original.leadSchedule,
                    templates: { ...original.templates, ...Object.fromEntries(
                        [CRM_MESSAGE_TYPE.REGISTRATION_WELCOME, CRM_MESSAGE_TYPE.REGISTRATION_WELCOME_NO_OFFER]
                            .map((k) => [k, CrmSettingModel.DEFAULT_TEMPLATES[k]]),
                    ) },
                },
            },
        )
        console.log(`\nwelcomeStaging: ${PASS} passed, ${FAIL} failed (cleanup done)`)
        await mongoose.disconnect()
    }
}

main().catch(async (e) => {
    console.error('STAGING ERROR', e.message)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
})
