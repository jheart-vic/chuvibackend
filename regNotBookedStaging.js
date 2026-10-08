/**
 * "Registered but never booked" follow-up sequence — client item #1,
 * texts and timings supplied 2026-10-08. GOES LIVE BEFORE WINDOW BOOKING; the
 * client's reps start registering people the next day, so this runs the whole
 * thing against the real services rather than trusting the unit maths.
 *
 * Scenarios:
 *   1  registering schedules the sequence, anchored to the OFFER's expiry
 *   2  the client's OWN worked example — Ada registers Fri 15:00, offer ends
 *      Mon 15:00 → msg1 Sat evening, msg2 Sun evening, msg3 Mon morning
 *   3  every scheduled message sits INSIDE a send window (06-08 or 18-20)
 *   4  the three texts are the client's VERBATIM copy
 *   5  booking cancels the whole sequence (their "stops the moment they book")
 *   6  no offer configured → the sequence still runs msg1 + day-7, never crashes
 *   7  a LONGER offer moves messages 2 and 3 with it (nothing hardcodes 3 days)
 *   8  registering twice does not double-schedule
 *   9  the day-7 step is an internal action, not a message, and is NOT held
 *      back by the send windows
 *  10  order-ready/feedback are EXEMPT from the windows (they go at once)
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Cleans up after itself.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node regNotBookedStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const UserModel = require('./models/user.model')
const CrmProfileModel = require('./models/crmProfile.model')
const CrmScheduledMessageModel = require('./models/crmScheduledMessage.model')
const CrmSettingModel = require('./models/crmSetting.model')
const OfferModel = require('./models/offer.model')
const CustomerOfferModel = require('./models/customerOffer.model')
const BookOrderModel = require('./models/bookOrder.model')
const CrmService = require('./services/crm.service')
const {
    CRM_WORKFLOW,
    CRM_MESSAGE_TYPE,
    CRM_MESSAGE_STATUS,
    CRM_SEND_SLOT,
    OFFER_TYPE,
    OFFER_STATUS,
    OFFER_TRIGGER,
    ROLE,
} = require('./util/constants')
const { isInSendWindow, offerEndSchedule } = require('./util/crmSendWindow')

const setupApp = require('./config/setup')
const crm = CrmService instanceof Function ? new CrmService() : CrmService
// one distinct trailing digit per test account
const TAG_DIGIT = { one: 1, two: 2, three: 3 }
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
const fmt = (d) =>
    new Date(d).toLocaleString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })

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

    const created = { userIds: [], profileIds: [], offerIds: [], linkageIds: [], orderIds: [] }
    let offer = null
    try {
        // ── 0 ── THE MIGRATION ITSELF ───────────────────────────────────────
        // Mongoose applies schema defaults on CREATION, not on read, and the
        // live CrmSetting document predates all of this — so the new schedule,
        // the send windows and the three texts only exist if config/setup.js
        // backfills them. Running setup here is not scaffolding: it is the
        // assertion. Without it the sequence works on a fresh DB and silently
        // schedules nothing in production (the `walletAdjustmentLimits` trap).
        console.log('\n[0] The settings migration backfills an EXISTING document')
        const before = await CrmSettingModel.findOne({}).lean()
        if (!before) {
            console.log('SKIPPED — CrmSetting unseeded; boot the app once against this DB.')
            return
        }
        // Strip the new fields to simulate the live doc as it is today.
        await CrmSettingModel.updateOne(
            { _id: before._id },
            {
                $unset: {
                    registeredNotBookedSchedule: '',
                    sendWindows: '',
                    'templates.reg-not-booked-1': '',
                    'templates.reg-not-booked-2': '',
                    'templates.reg-not-booked-3': '',
                },
            },
        )
        const stripped = await CrmSettingModel.findOne({}).lean()
        ok(
            !stripped.registeredNotBookedSchedule?.length,
            'simulated the live doc: the new schedule is absent',
        )
        await setupApp()
        const setting = await CrmSettingModel.findOne({})
        ok(
            Array.isArray(setting.registeredNotBookedSchedule) &&
                setting.registeredNotBookedSchedule.length === 4,
            `*** the migration put the 4-step schedule onto the existing doc (${setting.registeredNotBookedSchedule?.length}) ***`,
        )
        ok(
            setting.sendWindows?.morningEndHour === 8 &&
                setting.sendWindows?.eveningStartHour === 18,
            'and the send windows',
        )
        ok(
            !!setting.templates.get(CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1),
            'and the three texts',
        )

        const stamp = Date.now()
        // A First Experience offer with a 3-day customer window.
        offer = await OfferModel.create({
            name: `STG First Experience ${stamp}`,
            headline: 'Free pickup and delivery on your first order',
            type: OFFER_TYPE.PERSONAL,
            status: OFFER_STATUS.ACTIVE,
            triggers: [OFFER_TRIGGER.FIRST_EXPERIENCE],
            customerWindowDays: 3,
            rules: { firstOrderOnly: true, minOrderValue: 4000, oneUsePerCustomer: true },
            benefits: [{ benefitType: 'free-pickup' }, { benefitType: 'free-delivery' }],
        })
        created.offerIds.push(offer._id)

        const register = async (tag) => {
            const user = await UserModel.create({
                email: `rnb_${tag}_${stamp}@example.com`,
                fullName: `Ada ${tag}`,
                // A DISTINCT number per account. The first draft used tag.length, and "one"
                // and "two" are both 3 letters — so both users got the SAME phone and
                // findOrCreateProfile matched the first profile by phone, leaving the
                // second with none. Identity is linked by normalised phone (brief 4.6).
                phoneNumber: `0806${String(stamp).slice(-6)}${TAG_DIGIT[tag]}`,
                userType: ROLE.USER,
            })
            created.userIds.push(user._id)
            await crm.handleUserRegistered(user)
            const profile = await CrmProfileModel.findOne({ userId: user._id })
            if (profile) created.profileIds.push(profile._id)
            return { user, profile }
        }
        const queued = (profileId) =>
            CrmScheduledMessageModel.find({
                profileId,
                workflow: CRM_WORKFLOW.REGISTERED_NOT_BOOKED,
                status: CRM_MESSAGE_STATUS.PENDING,
            })
                .sort({ dueAt: 1 })
                .lean()

        // ── 1 ── registration schedules the sequence ────────────────────────
        console.log('\n[1] Registering schedules the sequence, anchored to the offer')
        const { user: u1, profile: p1 } = await register('one')
        ok(!!p1, 'a CRM profile exists for the new account')
        const linkage = await CustomerOfferModel.findOne({
            userId: u1._id,
            offerId: offer._id,
        })
        if (linkage) created.linkageIds.push(linkage._id)
        ok(!!linkage, 'the First Experience offer was granted AT REGISTRATION')
        ok(!!linkage?.expiresAt, 'and the linkage carries an expiry to anchor to')
        let q = await queued(p1._id)
        ok(q.length === 4, `four steps queued (${q.length})`)
        const types = q.map((m) => m.messageType)
        ok(
            types.includes(CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1) &&
                types.includes(CRM_MESSAGE_TYPE.REG_NOT_BOOKED_2) &&
                types.includes(CRM_MESSAGE_TYPE.REG_NOT_BOOKED_3) &&
                types.includes(CRM_MESSAGE_TYPE.REG_NOT_BOOKED_MARK_PROSPECT),
            'all three messages plus the day-7 prospect move',
        )
        ok(
            !!(await CrmProfileModel.findById(p1._id)).nextFollowUpAt,
            "the card's next follow-up date is set",
        )

        // ── 2 ── their own worked example ───────────────────────────────────
        console.log("\n[2] The client's worked example: registers Fri 15:00, offer ends Mon 15:00")
        const end = new Date('2026-10-12T15:00:00+01:00') // Monday
        const pair = offerEndSchedule(end, setting.sendWindows)
        ok(
            new Date(pair.second).getDay() === 0 &&
                new Date(pair.second).getHours() === 18,
            `message 2 → Sunday evening (${fmt(pair.second)})`,
        )
        ok(
            new Date(pair.third).getDay() === 1 &&
                new Date(pair.third).getHours() === 6,
            `message 3 → Monday morning (${fmt(pair.third)})`,
        )
        ok(pair.shifted === false, 'no shift needed for a 15:00 expiry')
        // the edge case they specified
        const earlyPair = offerEndSchedule(
            new Date('2026-10-12T07:00:00+01:00'),
            setting.sendWindows,
        )
        ok(
            earlyPair.shifted === true &&
                new Date(earlyPair.third).getDay() === 0 &&
                new Date(earlyPair.third).getHours() === 18,
            `an offer ending 07:00 shifts msg3 to the evening before (${fmt(earlyPair.third)})`,
        )
        ok(
            new Date(earlyPair.second).getDay() === 0 &&
                new Date(earlyPair.second).getHours() === 6,
            `…and msg2 to the morning before that (${fmt(earlyPair.second)})`,
        )

        // ── 3 ── everything lands inside a send window ──────────────────────
        console.log('\n[3] Every queued MESSAGE sits inside a send window')
        const msgsOnly = q.filter(
            (m) => m.messageType !== CRM_MESSAGE_TYPE.REG_NOT_BOOKED_MARK_PROSPECT,
        )
        for (const m of msgsOnly) {
            ok(
                isInSendWindow(m.dueAt, setting.sendWindows),
                `${m.messageType} at ${fmt(m.dueAt)} is inside a window`,
            )
        }
        const msg1 = q.find((m) => m.messageType === CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1)
        ok(
            new Date(msg1.dueAt).getTime() >= Date.now() + 23.5 * 3600 * 1000,
            `message 1 is at least 24h out (${fmt(msg1.dueAt)})`,
        )

        // ── 4 ── the texts are verbatim ─────────────────────────────────────
        console.log("\n[4] The three texts are the client's exact copy")
        const t = setting.templates
        ok(
            t.get(CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1)?.startsWith(
                'Hello {{firstName}}, this is CHUVI. Your first order offer is still open: book any order from ₦4,000 and we pick up and deliver for free.',
            ),
            'message 1 opens exactly as supplied',
        )
        ok(
            t.get(CRM_MESSAGE_TYPE.REG_NOT_BOOKED_2)?.startsWith(
                'Hello {{firstName}}, your free pickup and delivery ends tomorrow.',
            ),
            'message 2 opens exactly as supplied',
        )
        ok(
            t.get(CRM_MESSAGE_TYPE.REG_NOT_BOOKED_3)?.includes(
                'After today, pickup and delivery are free only on orders from ₦8,000.',
            ),
            'message 3 keeps the ₦8,000 line',
        )
        ok(
            !/pickup window/i.test(
                [1, 2, 3]
                    .map((n) => t.get(`reg-not-booked-${n}`) || '')
                    .join(' '),
            ),
            '*** no text mentions "pickup window" — they ship before window booking ***',
        )

        // ── 5 ── booking stops the sequence ─────────────────────────────────
        console.log('\n[5] Booking stops the sequence dead')
        const order = await BookOrderModel.create({
            userId: u1._id,
            fullName: u1.fullName,
            phoneNumber: u1.phoneNumber,
            serviceType: 'wash-and-iron',
            serviceTier: 'classic',
            deliverySpeed: 'standard',
            channel: 'website',
            amount: 4000,
            oscNumber: 'RNB-' + stamp,
            paymentStatus: 'success',
            isPickUp: true,
            isDelivery: true,
            stage: { status: 'queue' },
            items: [{ type: 'shirt', price: 1, quantity: 1 }],
        })
        created.orderIds.push(order._id)
        await crm.handleOrderCreated(order)
        q = await queued(p1._id)
        ok(q.length === 0, `nothing is still pending after they book (${q.length})`)

        // ── 6 ── no offer configured ────────────────────────────────────────
        console.log('\n[6] With no offer available the sequence still runs, never crashes')
        await OfferModel.updateOne({ _id: offer._id }, { $set: { status: OFFER_STATUS.ARCHIVED } })
        const { profile: p2 } = await register('two')
        const q2 = await queued(p2._id)
        ok(q2.length === 2, `only msg1 + day-7 are queued (${q2.length})`)
        ok(
            q2.every(
                (m) =>
                    m.messageType === CRM_MESSAGE_TYPE.REG_NOT_BOOKED_1 ||
                    m.messageType === CRM_MESSAGE_TYPE.REG_NOT_BOOKED_MARK_PROSPECT,
            ),
            'the two offer-anchored messages are skipped, not mis-scheduled',
        )
        await OfferModel.updateOne({ _id: offer._id }, { $set: { status: OFFER_STATUS.ACTIVE } })

        // ── 7 ── a longer offer moves the messages ──────────────────────────
        console.log('\n[7] Changing the offer length moves messages 2 and 3 (nothing hardcodes 3 days)')
        await OfferModel.updateOne({ _id: offer._id }, { $set: { customerWindowDays: 7 } })
        const { user: u3, profile: p3 } = await register('three')
        const l3 = await CustomerOfferModel.findOne({ userId: u3._id, offerId: offer._id })
        if (l3) created.linkageIds.push(l3._id)
        const q3 = await queued(p3._id)
        const m3 = q3.find((m) => m.messageType === CRM_MESSAGE_TYPE.REG_NOT_BOOKED_3)
        ok(!!l3 && !!m3, 'a 7-day offer still schedules message 3')
        const daysOut = (new Date(m3.dueAt) - Date.now()) / 86400000
        ok(
            daysOut > 5,
            `*** message 3 is ~${daysOut.toFixed(1)} days out, following the 7-day offer, not a fixed 3 ***`,
        )
        await OfferModel.updateOne({ _id: offer._id }, { $set: { customerWindowDays: 3 } })

        // ── 8 ── registering twice does not double up ───────────────────────
        console.log('\n[8] A repeated registration hook does not double-schedule')
        const beforeCount = (await queued(p3._id)).length
        await crm.startRegisteredNotBookedWorkflow(
            await CrmProfileModel.findById(p3._id),
            l3?.expiresAt,
        )
        const afterCount = (await queued(p3._id)).length
        ok(
            afterCount === beforeCount,
            `still ${afterCount} pending, not ${beforeCount * 2} (old ones cancelled first)`,
        )

        // ── 9 ── the day-7 step is an action, not a message ─────────────────
        console.log('\n[9] The day-7 prospect move is an internal action')
        const { CRM_INTERNAL_ACTIONS } = require('./util/constants')
        ok(
            CRM_INTERNAL_ACTIONS.includes(
                CRM_MESSAGE_TYPE.REG_NOT_BOOKED_MARK_PROSPECT,
            ),
            'so the dispatcher runs it instead of rendering a template it has none of',
        )
        const markStep = q3.find(
            (m) => m.messageType === CRM_MESSAGE_TYPE.REG_NOT_BOOKED_MARK_PROSPECT,
        )
        const days7 = (new Date(markStep.dueAt) - Date.now()) / 86400000
        ok(days7 > 6.5 && days7 < 7.6, `and it is on day 7 (${days7.toFixed(1)})`)

        // ── 10 ── order messages are exempt from the windows ────────────────
        console.log('\n[10] Order/feedback messages are EXEMPT from the send windows')
        const { CRM_WINDOWED_WORKFLOWS } = require('./util/constants')
        ok(
            !CRM_WINDOWED_WORKFLOWS.includes(CRM_WORKFLOW.POST_DELIVERY),
            'post-delivery is not windowed — "order and payment messages still go out at once"',
        )
        ok(
            CRM_WINDOWED_WORKFLOWS.includes(CRM_WORKFLOW.LEAD) &&
                CRM_WINDOWED_WORKFLOWS.includes(CRM_WORKFLOW.REACTIVATION) &&
                CRM_WINDOWED_WORKFLOWS.includes(CRM_WORKFLOW.BROADCAST) &&
                CRM_WINDOWED_WORKFLOWS.includes(CRM_WORKFLOW.REGISTERED_NOT_BOOKED),
            'the four the client named ARE windowed',
        )
    } catch (e) {
        FAIL++
        console.log('\n  ✗ THREW:', e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e)
    } finally {
        console.log('\nCleaning up…')
        await CrmScheduledMessageModel.deleteMany({ profileId: { $in: created.profileIds } })
        await CustomerOfferModel.deleteMany({ _id: { $in: created.linkageIds } })
        await CustomerOfferModel.deleteMany({ offerId: { $in: created.offerIds } })
        await OfferModel.deleteMany({ _id: { $in: created.offerIds } })
        await BookOrderModel.deleteMany({ _id: { $in: created.orderIds } })
        await CrmProfileModel.deleteMany({ _id: { $in: created.profileIds } })
        await UserModel.deleteMany({ _id: { $in: created.userIds } })
        const left = await CrmProfileModel.countDocuments({
            _id: { $in: created.profileIds },
        })
        console.log(`  leftover profiles: ${left}`)
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed\n`)
        process.exit(FAIL ? 1 : 0)
    }
}

main().catch(async (e) => {
    console.error(e)
    try {
        await mongoose.disconnect()
    } catch {}
    process.exit(1)
})
