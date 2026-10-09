/**
 * §2 N2 — Recovery, Complaints and Feedback dashboard (client brief 6 Oct 2026).
 *
 * THEIR TEST, verbatim:
 *   "In a test month, 20 orders are delivered and 10 of them get feedback. The
 *    stars are five 5s, three 4s and two 3s. The recommend answers are six of
 *    9 or 10, two of 7 or 8, and two of 0 to 6. The dashboard shows Average
 *    rating 4.3, NPS score 40, and Feedback received 10, which is 50%."
 *
 * Everything is built inside ONE far-future Lagos month that no real data can
 * occupy, so the figures are exact without parking or deleting anything the DB
 * already holds.
 *
 * It also pins the things their example cannot reach:
 *   - a score of 0 counts as a detractor and is never read as "not asked"
 *   - the 30-day throttle stops a second ask AND a second stored score
 *   - npsResponses is NOT feedbackReceived (the whole reason the throttle bites)
 *   - "delivered in the month" comes off the DELIVERED stageHistory entry, not
 *     the order's updatedAt (the §3 Q1 flaw we told them about — not repeated)
 *   - the month boundary is LAGOS, not UTC
 *
 * SAFETY: refuses unless STAGING_OK=1; refuses NODE_ENV=production without
 * STAGING_FORCE=1; hard-refuses any DB named laundrydb. Deletes what it creates.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node recoveryReportStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const mongoose = require('mongoose')
const moment = require('moment-timezone')

const BookOrderModel = require('./models/bookOrder.model')
const FeedbackModel = require('./models/feedback.model')
const ComplaintCaseModel = require('./models/complaintCase.model')
const ComplaintTypeModel = require('./models/complaintType.model')
const OfferModel = require('./models/offer.model')
const CustomerOfferModel = require('./models/customerOffer.model')
const CrmProfileModel = require('./models/crmProfile.model')

const RecoveryReportService = require('./services/recoveryReport.service')
const FeedbackService = require('./services/feedback.service')
const {
    ORDER_STATUS,
    DELIVERY_SPEED,
    SERVICE_TIERS,
    ORDER_CHANNEL,
    ORDER_SERVICE_TYPE,
    PAYMENT_ORDER_STATUS,
    FEEDBACK_TYPE,
    OFFER_TRIGGER,
    OFFER_TYPE,
    RECOVERY_CREDIT_STATUS,
    RECOVERY_COMPENSATION_TYPE,
    COMPLAINT_STATUS,
} = require('./util/constants')

const report = new RecoveryReportService()
const feedbackSvc = new FeedbackService()

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

const STAMP = Date.now()
const LAGOS = 'Africa/Lagos'
// A month far enough out that nothing real can be in it. 2031 is also a leap-
// free, ordinary month — no calendar edge cases smuggled into the assertions.
const MONTH = '2031-03'
const MSTART = moment.tz(MONTH, 'YYYY-MM', true, LAGOS)
// mid-month, so nothing drifts across a boundary by accident
const at = (day, hour = 12) =>
    MSTART.clone().date(day).hour(hour).minute(0).second(0).millisecond(0).toDate()

const oid = () => new mongoose.Types.ObjectId()

// Backdating a record is harder than it looks: Mongoose marks `createdAt`
// IMMUTABLE when timestamps are on, so `Model.updateOne({$set:{createdAt}})`
// is silently DROPPED — no error, no write. The first run of this harness did
// exactly that and every fixture stayed in the real month, which is why the
// report honestly returned 0. Go through the raw driver, which has no idea what
// a Mongoose immutable path is.
const forceCreatedAt = (Model, _id, createdAt) =>
    Model.collection.updateOne({ _id }, { $set: { createdAt } })

const created = { orders: [], feedback: [], cases: [], types: [], offers: [], customerOffers: [], profiles: [] }

async function makeDeliveredOrder(tag, deliveredAt, userId) {
    const o = await BookOrderModel.create({
        fullName: `STG N2 Customer ${tag}`,
        phoneNumber: '08050000042',
        userId,
        serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
        serviceTier: SERVICE_TIERS.CLASSIC,
        deliverySpeed: DELIVERY_SPEED.STANDARD,
        channel: ORDER_CHANNEL.OFFICE,
        amount: 5000,
        oscNumber: `OSC-N2${STAMP}-${tag}`,
        paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
        items: [{ type: 'shirt', price: 1000, quantity: 1 }],
        stage: { status: ORDER_STATUS.DELIVERED, updatedAt: deliveredAt },
        stageHistory: [{ status: ORDER_STATUS.DELIVERED, updatedAt: deliveredAt }],
    })
    created.orders.push(o._id)
    return o
}

async function makeFeedback({ order, userId, rating, nps, when, comment }) {
    const type =
        rating >= 4
            ? FEEDBACK_TYPE.SATISFIED
            : rating === 3
              ? FEEDBACK_TYPE.NEUTRAL
              : FEEDBACK_TYPE.COMPLAINT
    const f = await FeedbackModel.create({
        userId,
        orderId: order._id,
        type,
        rating,
        comment,
        ...(nps == null
            ? {}
            : { npsScore: nps, npsAskedAt: when, npsAnsweredAt: when }),
    })
    created.feedback.push(f._id)
    await forceCreatedAt(FeedbackModel, f._id, when)
    return f
}

async function run() {
    // ── 1 THE CLIENT'S OWN TEST ───────────────────────────────────────────────
    console.log("\n1 — the client's worked example, verbatim")
    // 20 delivered orders in the month; the first 10 get feedback.
    const orders = []
    for (let i = 0; i < 20; i++) {
        orders.push(await makeDeliveredOrder(`D${i}`, at(5 + (i % 20)), oid()))
    }

    //                     five 5s        three 4s     two 3s
    const stars = [5, 5, 5, 5, 5, 4, 4, 4, 3, 3]
    //  six promoters (9/10), two passives (7/8), two detractors (one 0, one 6)
    const scores = [9, 10, 9, 10, 9, 10, 7, 8, 0, 6]
    for (let i = 0; i < 10; i++) {
        await makeFeedback({
            order: orders[i],
            userId: orders[i].userId,
            rating: stars[i],
            nps: scores[i],
            when: at(10 + i, 9),
        })
    }

    const r1 = (await report.monthlyReport({ query: { month: MONTH } })).data
        ?.message
    ok(!!r1, 'the report responds')
    const fb = r1.feedback
    ok(fb.deliveredOrders === 20, `20 orders delivered (got ${fb.deliveredOrders})`)
    ok(fb.feedbackReceived === 10, `Feedback received 10 (got ${fb.feedbackReceived})`)
    ok(
        fb.feedbackSharePct === 50,
        `*** which is 50% — their number *** (got ${fb.feedbackSharePct})`,
    )
    ok(
        fb.averageRating === 4.3,
        `*** Average rating 4.3 — their number *** (got ${fb.averageRating})`,
    )
    ok(
        fb.npsScore === 40,
        `*** NPS score 40 — their number *** (got ${fb.npsScore})`,
    )
    ok(
        fb.npsBreakdown.promoters === 6 &&
            fb.npsBreakdown.passives === 2 &&
            fb.npsBreakdown.detractors === 2,
        `breakdown 6 / 2 / 2 (got ${JSON.stringify(fb.npsBreakdown)})`,
    )
    ok(
        fb.npsResponses === 10,
        `10 recommend answers counted (got ${fb.npsResponses})`,
    )

    // ── 2 a score of 0 is an ANSWER, not an absence ───────────────────────────
    console.log('\n2 — 0 is the angriest detractor, never "not asked"')
    const zeroes = await FeedbackModel.countDocuments({
        _id: { $in: created.feedback },
        npsScore: 0,
    })
    ok(zeroes === 1, 'the 0 survived the write (a falsiness test would drop it)')
    ok(
        fb.npsBreakdown.detractors === 2,
        'and it is counted among the detractors, not ignored',
    )

    // ── 3 delivered is read off stageHistory, not updatedAt ───────────────────
    console.log('\n3 — "delivered in the month" ignores a later edit (§3 Q1 flaw)')
    await BookOrderModel.updateOne(
        { _id: orders[0]._id },
        { $set: { amount: 5001 } },
    ) // touches updatedAt to "now", years after the test month
    const r3 = (await report.monthlyReport({ query: { month: MONTH } })).data
        ?.message
    ok(
        r3.feedback.deliveredOrders === 20,
        `still 20 after editing a delivered order (got ${r3.feedback.deliveredOrders})`,
    )

    // ── 4 the Lagos month boundary ────────────────────────────────────────────
    console.log('\n4 — the month boundary is Lagos, not UTC')
    // 23:30 UTC on the last day of February 2031 is 00:30 on 1 March in Lagos,
    // so this feedback belongs to MARCH. Under a UTC boundary it would land in
    // February and the month's count would be one short.
    const edgeOrder = await makeDeliveredOrder('EDGE', at(15), oid())
    const edgeAt = moment.utc('2031-02-28T23:30:00Z').toDate()
    await makeFeedback({
        order: edgeOrder,
        userId: edgeOrder.userId,
        rating: 5,
        nps: null,
        when: edgeAt,
    })
    const r4 = (await report.monthlyReport({ query: { month: MONTH } })).data
        ?.message
    ok(
        r4.feedback.feedbackReceived === 11,
        `a 23:30 UTC Feb 28 response counts in March Lagos (got ${r4.feedback.feedbackReceived})`,
    )
    ok(
        r4.feedback.npsResponses === 10,
        `and it adds no recommend answer — npsResponses is still 10 (got ${r4.feedback.npsResponses})`,
    )
    ok(
        r4.feedback.feedbackReceived !== r4.feedback.npsResponses,
        '*** feedback received and NPS answers are genuinely different numbers ***',
    )

    // ── 5 the 30-day throttle ─────────────────────────────────────────────────
    console.log('\n5 — the NPS question is throttled to once per customer')
    const throttleUser = oid()
    const profile = await CrmProfileModel.create({
        userId: throttleUser,
        phoneNumber: `0805${String(STAMP).slice(-7)}`,
        fullName: 'STG N2 Throttle',
    })
    created.profiles.push(profile._id)

    const o1 = await makeDeliveredOrder('T1', new Date(), throttleUser)
    const o2 = await makeDeliveredOrder('T2', new Date(), throttleUser)

    const p1 = (
        await feedbackSvc.getFeedbackPrompt({
            user: { id: String(throttleUser) },
            params: { bookOrderId: String(o1._id) },
        })
    ).data?.message
    ok(p1?.askRating === true, 'the stars are always asked')
    ok(p1?.askNps === true, 'the first prompt includes the recommend question')
    ok(
        p1?.npsQuestion === 'How likely are you to recommend CHUVI to a friend?',
        'with the exact wording from the brief',
    )

    const p2 = (
        await feedbackSvc.getFeedbackPrompt({
            user: { id: String(throttleUser) },
            params: { bookOrderId: String(o2._id) },
        })
    ).data?.message
    ok(
        p2?.askNps === false,
        'the second prompt inside the window does NOT ask again',
    )
    ok(p2?.askRating === true, '…but still asks for the stars')
    ok(
        typeof p2?.npsSkippedReason === 'string',
        'and says why, so the FE need not guess',
    )

    // a prompt that is never answered still consumes the window — the stamp
    // lives on the CRM profile precisely because no Feedback record exists yet
    const stamped = await CrmProfileModel.findById(profile._id)
        .select('lastNpsAskedAt')
        .lean()
    ok(
        !!stamped?.lastNpsAskedAt,
        'an UNANSWERED prompt still consumes the window (stamped on the profile)',
    )

    // ── 6 a second score inside the window is dropped, not fatal ──────────────
    console.log('\n6 — a second score is dropped; the stars still save')
    const sub1 = await feedbackSvc.submitFeedback({
        user: { id: String(throttleUser) },
        body: {
            bookOrderId: String(o1._id),
            type: FEEDBACK_TYPE.SATISFIED,
            rating: 5,
            npsScore: 9,
        },
    })
    ok(sub1.success === true, 'the first submission with a score succeeds')
    ok(sub1.data?.message?.feedback?.npsScore === 9, 'and the score is stored')
    ok(sub1.data?.message?.npsThrottled === false, 'not flagged as throttled')

    const sub2 = await feedbackSvc.submitFeedback({
        user: { id: String(throttleUser) },
        body: {
            bookOrderId: String(o2._id),
            type: FEEDBACK_TYPE.SATISFIED,
            rating: 4,
            npsScore: 2,
        },
    })
    ok(sub2.success === true, 'the second submission still SUCCEEDS')
    ok(
        sub2.data?.message?.feedback?.rating === 4,
        '…and the stars are saved (never lost over a throttled extra answer)',
    )
    ok(
        sub2.data?.message?.feedback?.npsScore == null,
        'but the second score is not stored',
    )
    ok(sub2.data?.message?.npsThrottled === true, 'and the caller is told why')
    for (const f of await FeedbackModel.find({
        orderId: { $in: [o1._id, o2._id] },
    }).select('_id'))
        created.feedback.push(f._id)

    const bad = await feedbackSvc.submitFeedback({
        user: { id: String(throttleUser) },
        body: {
            bookOrderId: String(o1._id),
            type: FEEDBACK_TYPE.SATISFIED,
            npsScore: 11,
        },
    })
    ok(bad.success === false, 'a score of 11 is refused')

    // ── 7 complaints ──────────────────────────────────────────────────────────
    console.log('\n7 — complaints opened / resolved / still open / time to resolve')
    const type1 = await ComplaintTypeModel.create({ name: `STG Stain ${STAMP}` })
    const type2 = await ComplaintTypeModel.create({ name: `STG Missing ${STAMP}` })
    created.types.push(type1._id, type2._id)

    const mkCase = async (tag, typeId, openedAt, closedAt, userId) => {
        const c = await ComplaintCaseModel.create({
            userId: userId || oid(),
            orderId: orders[0]._id,
            complaintTypeId: typeId,
            description: `STG case ${tag}`,
            status: closedAt ? COMPLAINT_STATUS.CLOSED : COMPLAINT_STATUS.SUBMITTED,
            ...(closedAt ? { closedAt } : {}),
        })
        created.cases.push(c._id)
        await forceCreatedAt(ComplaintCaseModel, c._id, openedAt)
        return c
    }
    await mkCase('c1', type1._id, at(2), at(3)) // opened + closed in month: 24h
    await mkCase('c2', type1._id, at(4), at(6)) // opened + closed in month: 48h
    await mkCase('c3', type2._id, at(8), null) // opened, still open

    const r7 = (await report.monthlyReport({ query: { month: MONTH } })).data
        ?.message
    ok(r7.complaints.complaintsOpened === 3, `opened 3 (got ${r7.complaints.complaintsOpened})`)
    ok(r7.complaints.resolved === 2, `closed in the month 2 (got ${r7.complaints.resolved})`)
    ok(r7.complaints.stillOpen === 1, `still open 1 (got ${r7.complaints.stillOpen})`)
    ok(
        r7.complaints.averageTimeToResolveHours === 36,
        `average time to resolve 36h — (24 + 48) / 2 (got ${r7.complaints.averageTimeToResolveHours})`,
    )
    ok(
        r7.complaintsByType.length === 2 &&
            r7.complaintsByType[0].count === 2 &&
            r7.complaintsByType[0].name === type1.name,
        `complaints by type, busiest first (got ${JSON.stringify(r7.complaintsByType)})`,
    )

    // ── 8 recovery: offers, credits, refunds ─────────────────────────────────
    console.log('\n8 — recoveries given, what they cost, and who came back')
    const recoveredUser = oid()
    const comped = await ComplaintCaseModel.create({
        userId: recoveredUser,
        orderId: orders[1]._id,
        complaintTypeId: type1._id,
        description: 'STG compensated case',
        status: COMPLAINT_STATUS.RESOLVED,
        compensations: [
            {
                type: RECOVERY_COMPENSATION_TYPE.WALLET_CREDIT,
                amount: 5000,
                reason: 'STG credit',
                status: RECOVERY_CREDIT_STATUS.APPROVED,
                decidedAt: at(12),
            },
            {
                type: RECOVERY_COMPENSATION_TYPE.CASH,
                amount: 3000,
                reason: 'STG refund',
                status: RECOVERY_CREDIT_STATUS.APPROVED,
                decidedAt: at(12),
            },
            {
                // still waiting for an admin — the customer has been given NOTHING
                type: RECOVERY_COMPENSATION_TYPE.WALLET_CREDIT,
                amount: 9999,
                reason: 'STG pending',
                status: RECOVERY_CREDIT_STATUS.PENDING_APPROVAL,
            },
        ],
    })
    created.cases.push(comped._id)
    await forceCreatedAt(ComplaintCaseModel, comped._id, at(11))

    const recoveryOffer = await OfferModel.create({
        name: `STG Recovery Thank You ${STAMP}`,
        headline: 'Sorry about that',
        type: OFFER_TYPE.PERSONAL,
        triggers: [OFFER_TRIGGER.RECOVERY],
        // an offer with no benefit is refused by the model — and the field is
        // `benefitType`, not `type` (Mongoose reserves `type` inside a subdoc)
        benefits: [{ benefitType: 'order-discount', percent: 10 }],
    })
    created.offers.push(recoveryOffer._id)
    const co = await CustomerOfferModel.create({
        userId: recoveredUser,
        offerId: recoveryOffer._id,
    })
    created.customerOffers.push(co._id)
    await forceCreatedAt(CustomerOfferModel, co._id, at(12))

    const r8 = (await report.monthlyReport({ query: { month: MONTH } })).data
        ?.message
    ok(
        r8.recovery.recoveryBreakdown.credits === 1,
        `1 credit given (got ${r8.recovery.recoveryBreakdown.credits})`,
    )
    ok(
        r8.recovery.recoveryBreakdown.refunds === 1,
        `1 refund given (got ${r8.recovery.recoveryBreakdown.refunds})`,
    )
    ok(
        r8.recovery.recoveryBreakdown.offers === 1,
        `1 recovery offer given (got ${r8.recovery.recoveryBreakdown.offers})`,
    )
    ok(r8.recovery.recoveriesGiven === 3, `3 recoveries in total (got ${r8.recovery.recoveriesGiven})`)
    ok(
        r8.recovery.recoveryCost === 8000,
        `*** cost ₦8,000 — the pending ₦9,999 is NOT counted *** (got ${r8.recovery.recoveryCost})`,
    )

    // they came back: a real order placed AFTER the recovery
    const comeback = await makeDeliveredOrder('BACK', at(20), recoveredUser)
    await forceCreatedAt(BookOrderModel, comeback._id, at(20))
    const r8b = (await report.monthlyReport({ query: { month: MONTH } })).data
        ?.message
    ok(
        r8b.recovery.orderedAgainAfterRecovery === 1,
        `ordered again after recovery = 1 (got ${r8b.recovery.orderedAgainAfterRecovery})`,
    )

    // a recovery ORDER is the recovery itself, not a return
    const freeRewash = await makeDeliveredOrder('REWASH', at(21), recoveredUser)
    await BookOrderModel.collection.updateOne(
        { _id: freeRewash._id },
        { $set: { isRecoveryOrder: true, createdAt: at(21) } },
    )
    const r8c = (await report.monthlyReport({ query: { month: MONTH } })).data
        ?.message
    ok(
        r8c.recovery.orderedAgainAfterRecovery === 1,
        'a free rewash does not count as "ordered again"',
    )

    // ── 8d the 60-day window (CLIENT DECISION 2026-10-08) ─────────────────────
    // We shipped this open-ended and flagged it; they closed it at 60 days. A
    // return LATER than 60 days after the recovery must not be counted, or a
    // past month's figure would keep creeping up forever.
    console.log('\n8d — "ordered again" is capped at 60 days after the recovery')
    ok(
        r8c.recovery.orderedAgainWindowDays === 60,
        `the window travels with the figure (got ${r8c.recovery.orderedAgainWindowDays})`,
    )
    const lateUser = oid()
    const lateOrder = await makeDeliveredOrder('LATEORD', at(5), lateUser)
    // Same shape as the scenario-8 fixture above: `orderId` (not bookOrderId),
    // `description` is required, and compensations is a LIST.
    const lateCase = await ComplaintCaseModel.create({
        userId: lateUser,
        orderId: lateOrder._id,
        complaintTypeId: type1._id,
        description: 'STG late-return case',
        status: COMPLAINT_STATUS.RESOLVED,
        compensations: [
            {
                type: RECOVERY_COMPENSATION_TYPE.WALLET_CREDIT,
                amount: 1000,
                reason: 'STG late credit',
                status: RECOVERY_CREDIT_STATUS.APPROVED,
                decidedAt: at(5),
            },
        ],
    })
    created.cases.push(lateCase._id)
    await forceCreatedAt(ComplaintCaseModel, lateCase._id, at(5))
    // A real order 61 days after the recovery — just outside the window.
    const recoveredOn = at(5)
    const tooLate = new Date(recoveredOn.getTime() + 61 * 24 * 60 * 60 * 1000)
    const lateComeback = await makeDeliveredOrder('TOOLATE', tooLate, lateUser)
    await forceCreatedAt(BookOrderModel, lateComeback._id, tooLate)
    const r8d = (await report.monthlyReport({ query: { month: MONTH } })).data
        ?.message
    ok(
        r8d.recovery.orderedAgainAfterRecovery === 1,
        `*** a return 61 days later is NOT counted *** (still ${r8d.recovery.orderedAgainAfterRecovery}, expected 1)`,
    )
    // Move the same order to 59 days and it counts — proving the cap is the
    // only thing that excluded it, not some unrelated filter.
    const justInTime = new Date(recoveredOn.getTime() + 59 * 24 * 60 * 60 * 1000)
    await forceCreatedAt(BookOrderModel, lateComeback._id, justInTime)
    const r8e = (await report.monthlyReport({ query: { month: MONTH } })).data
        ?.message
    ok(
        r8e.recovery.orderedAgainAfterRecovery === 2,
        `the same order at 59 days DOES count (got ${r8e.recovery.orderedAgainAfterRecovery}, expected 2)`,
    )

    // ── 9 the 1-2 star call list ──────────────────────────────────────────────
    console.log('\n9 — the list of 1 and 2 star orders, with phone numbers')
    const angryOrder = await makeDeliveredOrder('ANGRY', at(18), oid())
    await makeFeedback({
        order: angryOrder,
        userId: angryOrder.userId,
        rating: 1,
        nps: null,
        when: at(18, 15),
        comment: 'Everything came back wet.',
    })
    const r9 = (await report.monthlyReport({ query: { month: MONTH } })).data
        ?.message
    const row = r9.lowRatedOrders.find(
        (l) => l.oscNumber === `OSC-N2${STAMP}-ANGRY`,
    )
    ok(!!row, 'the 1-star order is listed')
    ok(row?.phoneNumber === '08050000042', 'with a phone number to call')
    ok(row?.comment === 'Everything came back wet.', 'and what they said')
    ok(
        r9.lowRatedOrders.every((l) => l.rating <= 2),
        'nothing above 2 stars leaks into the call list',
    )

    // ── 10 month validation + an empty month ─────────────────────────────────
    console.log('\n10 — the month picker')
    const badMonth = await report.monthlyReport({ query: { month: 'April 2031' } })
    ok(badMonth.success === false, '"April 2031" is refused, not silently accepted')
    const empty = (await report.monthlyReport({ query: { month: '2031-05' } }))
        .data?.message
    ok(
        empty.feedback.averageRating === 0 &&
            empty.feedback.npsScore === 0 &&
            empty.feedback.feedbackSharePct === 0,
        'an empty month reports zeroes, never NaN',
    )
    ok(
        empty.lowRatedOrders.length === 0 && empty.complaintsByType.length === 0,
        'and empty lists',
    )
}

async function cleanup() {
    const n = await Promise.all([
        BookOrderModel.deleteMany({ _id: { $in: created.orders } }),
        FeedbackModel.deleteMany({ _id: { $in: created.feedback } }),
        ComplaintCaseModel.deleteMany({ _id: { $in: created.cases } }),
        ComplaintTypeModel.deleteMany({ _id: { $in: created.types } }),
        OfferModel.deleteMany({ _id: { $in: created.offers } }),
        CustomerOfferModel.deleteMany({ _id: { $in: created.customerOffers } }),
        CrmProfileModel.deleteMany({ _id: { $in: created.profiles } }),
    ])
    const left = await BookOrderModel.countDocuments({
        oscNumber: new RegExp(`OSC-N2${STAMP}-`),
    })
    ok(left === 0, `cleanup left nothing behind (${n.length} collections swept)`)
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
    console.log(`Test month: ${MONTH} (Lagos)`)
    try {
        await run()
    } catch (error) {
        FAIL++
        console.error('\n  ✗ THREW:', error)
    } finally {
        try {
            await cleanup()
        } catch (error) {
            FAIL++
            console.error('  ✗ cleanup failed:', error.message)
        }
        await mongoose.disconnect()
    }
    console.log(`\n${PASS} passed, ${FAIL} failed`)
    process.exit(FAIL ? 1 : 0)
}

main()
