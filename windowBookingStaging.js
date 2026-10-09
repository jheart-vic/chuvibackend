/**
 * WINDOW BOOKING — DB harness (client decisions D1–D8, 2026-10-08).
 *
 * The RULES all live in `util/bookingWindow.js`, are pure, and are asserted
 * offline in `briefCheck.js`. This harness exists for the things that can only
 * be proved against a real database:
 *
 *   * the per-window-per-day aggregation in `getBookedCounts` — a `$project`
 *     of a two-element array, `$unwind`, then `$group`, which no offline test
 *     can execute;
 *   * that a CANCELLED order RELEASES its window slot (the `isCancelled` field
 *     does not exist, and the filter that looked right matched every document);
 *   * the settings MIGRATION onto an existing AdminSetting document, which is
 *     the trap this repo has paid for three times (seeding is not migrating);
 *   * the admin CRUD, including "a window in use is switched off, not deleted";
 *   * that the deflection rows are actually written, and the report separates
 *     "shown" from "distinct customers moved".
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node windowBookingStaging.js
 */

const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const BookingWindowModel = require('./models/bookingWindow.model')
const WindowDeflectionModel = require('./models/windowDeflection.model')
const AdminSettingModel = require('./models/adminSetting.model')
const BookingWindowService = require('./services/bookingWindow.service')
const setupApp = require('./config/setup')
const W = require('./util/bookingWindow')
const {
    ORDER_SERVICE_TYPE,
    SERVICE_TIERS,
    DELIVERY_SPEED,
    BILLING_TYPE,
} = require('./util/constants')

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) {
        pass++
        console.log(`  ✓ ${name}`)
    } else {
        fail++
        console.log(`  ✗ ${name} ${extra}`)
    }
}

const TAG = 'STGWIN'
// `AuditLog.userId` is REQUIRED, so passing null makes every audit write throw.
// The service catches it and still reports the window saved — which is the
// designed behaviour ("a record of the work must never reverse the work") and
// is worth knowing — but a real call always carries `req.user.id`, so use an id
// here and keep the run quiet.
const ACTOR = new mongoose.Types.ObjectId()

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

    const createdOrders = []
    const createdWindows = []
    // ⚠️ The error has to be captured HERE rather than left to `main().catch`.
    // The `finally` below calls `process.exit`, which runs BEFORE a rejection
    // reaches the outer catch — so a throw mid-run would be INVISIBLE and the
    // harness would print "0 failed" having silently skipped every remaining
    // assertion. That is exactly the green-for-the-wrong-reason shape this file
    // is meant to catch, and it bit this harness on its first run.
    let thrown = null
    // The live settings values are restored in `finally` — this harness edits
    // the real AdminSetting document to prove the migration, so it must put
    // every field back even if an assertion throws.
    let settingsBefore = null

    try {
        settingsBefore = await AdminSettingModel.findOne({}).lean()

        // ─── 1. the MIGRATION onto an EXISTING settings document ──────────
        // Mongoose applies a `default` on CREATION only, and the live document
        // predates all of this. Strip the fields and re-run setup: without the
        // backfill, window booking works on a fresh DB and silently has no
        // working days in production.
        console.log('\n1. scheduling settings migrate onto the existing doc')
        await AdminSettingModel.updateOne(
            {},
            {
                $unset: {
                    workingDays: '',
                    anytimeOpenFrom: '',
                    anytimeOpenTo: '',
                    anytimePickupFee: '',
                    anytimeDeliveryFee: '',
                },
            },
        )
        const stripped = await AdminSettingModel.findOne({}).lean()
        ok('the fields really are absent before setup runs',
            stripped.workingDays === undefined &&
                stripped.anytimePickupFee === undefined)

        await setupApp()

        const migrated = await AdminSettingModel.findOne({}).lean()
        ok('workingDays backfilled to Tue–Sun',
            Array.isArray(migrated.workingDays) &&
                migrated.workingDays.length === 6 &&
                !migrated.workingDays.includes('mon'),
            JSON.stringify(migrated.workingDays))
        ok('Anytime hours backfilled 08:00–17:00',
            migrated.anytimeOpenFrom === '08:00' && migrated.anytimeOpenTo === '17:00')
        ok('Anytime fees backfilled to ₦1,000 each',
            migrated.anytimePickupFee === 1000 && migrated.anytimeDeliveryFee === 1000)
        // The window price must stay the EXISTING fee — there is no second pair
        // of settings, and nobody should pay more for a window than they do now.
        ok('the WINDOW price is still the existing pickup/delivery fee',
            migrated.pickupFee === (settingsBefore.pickupFee ?? 500) &&
                migrated.deliveryFee === (settingsBefore.deliveryFee ?? 500))

        // Idempotence: a second run must not overwrite an admin's own choice.
        await AdminSettingModel.updateOne({}, { $set: { anytimePickupFee: 1250 } })
        await setupApp()
        const second = await AdminSettingModel.findOne({}).lean()
        ok('re-running setup does NOT overwrite an admin’s edited value',
            second.anytimePickupFee === 1250, String(second.anytimePickupFee))
        await AdminSettingModel.updateOne({}, { $set: { anytimePickupFee: 1000 } })

        // ─── 2. the default window seed ───────────────────────────────────
        console.log('\n2. the default window')
        const seeded = await BookingWindowModel.findOne({ name: /^Evening$/i }).lean()
        ok('a window exists after setup (the client’s Evening 15:00–18:30)', !!seeded)
        if (seeded) {
            ok('  …with a 60 minute cutoff and limit 10',
                seeded.cutoffMinutes === 60 && seeded.limit === 10,
                `cutoff=${seeded.cutoffMinutes} limit=${seeded.limit}`)
            ok('  …running Tue–Sun, Monday excluded',
                !seeded.days.includes('mon') && seeded.days.length === 6)
        }
        const countBefore = await BookingWindowModel.estimatedDocumentCount()
        await setupApp()
        ok('setup does not seed a SECOND window when one already exists',
            (await BookingWindowModel.estimatedDocumentCount()) === countBefore)

        // ─── 3. admin CRUD ────────────────────────────────────────────────
        console.log('\n3. admin CRUD')
        const created = await BookingWindowService.createWindow({
            payload: {
                name: `${TAG} Morning`,
                startTime: '09:00',
                endTime: '12:00',
                // ALL seven days on purpose. The first run of this harness gave
                // it ['tue','wed'] and then asserted against tomorrow — a
                // Saturday — so the slot correctly read
                // "does-not-run-that-day" and three assertions failed against
                // working code. The window's own day list is a second gate on
                // top of the working-days setting, so a fixture that is meant
                // to test the LIMIT must not also be testing the calendar.
                days: W.DAY_KEYS,
                cutoffMinutes: 30,
                limit: null,
            },
            actorId: ACTOR,
        })
        ok('create returns the window', created.success, JSON.stringify(created.data))
        const winId = created.data?.message?._id
        if (winId) createdWindows.push(winId)
        ok('  …a blank limit is stored as null (no limit), not 0',
            created.data?.message?.limit === null,
            String(created.data?.message?.limit))

        const dupe = await BookingWindowService.createWindow({
            payload: { name: `${TAG} morning`, startTime: '09:00', endTime: '12:00' },
            actorId: ACTOR,
        })
        ok('a duplicate NAME is refused case-insensitively',
            !dupe.success && /already exists/i.test(dupe.data?.error || ''),
            JSON.stringify(dupe.data))

        const badTime = await BookingWindowService.createWindow({
            payload: { name: `${TAG} Bad`, startTime: '9am', endTime: '12:00' },
            actorId: ACTOR,
        })
        ok('"9am" is refused — a time must be HH:mm', !badTime.success)

        // The interesting update case: moving ONE end past the SAVED other end.
        const crossed = await BookingWindowService.updateWindow({
            id: winId,
            payload: { endTime: '08:00' },
            actorId: ACTOR,
        })
        ok('an endTime sent alone is checked against the SAVED startTime',
            !crossed.success && /after startTime/i.test(crossed.data?.error || ''),
            JSON.stringify(crossed.data))

        const upd = await BookingWindowService.updateWindow({
            id: winId,
            payload: { limit: 2 },
            actorId: ACTOR,
        })
        ok('a partial update of one field works', upd.success && upd.data.message.limit === 2)

        // ─── 4. getBookedCounts — the aggregation ─────────────────────────
        console.log('\n4. per-window-per-day counts (the aggregation)')
        const day = W.startOfDay(W.addDays(new Date(), 1))
        const mkOrder = async (extra = {}) => {
            const o = await BookOrderModel.create({
                // `oscNumber` is REQUIRED on BookOrder — a top-level scan of
                // the fields a harness "obviously" needs misses it.
                oscNumber: `${TAG}-${Date.now()}-${createdOrders.length}`,
                fullName: `${TAG} Customer`,
                phoneNumber: '08050000911',
                serviceType: ORDER_SERVICE_TYPE.WASH_AND_IRON,
                serviceTier: SERVICE_TIERS.CLASSIC,
                deliverySpeed: DELIVERY_SPEED.STANDARD,
                billingType: BILLING_TYPE.PAY_PER_ITEM,
                isPickUp: true,
                isDelivery: true,
                amount: 1000,
                items: [{ type: 'shirt', price: 700, quantity: 1 }],
                ...extra,
            })
            createdOrders.push(o._id)
            return o
        }

        // One order with BOTH legs in the same window on the same day must
        // occupy TWO places — one window covers both legs (D1) and that is two
        // separate trips.
        await mkOrder({
            scheduling: {
                pickup: { timing: 'window', windowId: winId, date: day },
                delivery: { timing: 'window', windowId: winId, date: day },
            },
        })
        let counts = await BookingWindowService.getBookedCounts({
            from: W.startOfDay(new Date()),
            to: W.addDays(W.startOfDay(new Date()), 10),
        })
        const key = `${W.dateKey(day)}::${String(winId)}`
        ok('both legs of one order count as TWO places in the window',
            counts[key] === 2, `got ${counts[key]}`)

        // THE BUG THIS HARNESS EXISTS FOR: a cancelled order must RELEASE its
        // slot. `isCancelled: {$ne:true}` looked right and matched every
        // document, because $ne also matches an absent field — so a cancelled
        // booking would have held a place forever and deflected real customers.
        const cancelled = await mkOrder({
            scheduling: {
                pickup: { timing: 'window', windowId: winId, date: day },
            },
            cancellation: { cancelledAt: new Date(), reason: 'staging' },
        })
        counts = await BookingWindowService.getBookedCounts({
            from: W.startOfDay(new Date()),
            to: W.addDays(W.startOfDay(new Date()), 10),
        })
        ok('a CANCELLED order releases its window slot (still 2, not 3)',
            counts[key] === 2, `got ${counts[key]}`)
        await BookOrderModel.deleteOne({ _id: cancelled._id })

        // An order with no scheduling at all must not appear anywhere.
        await mkOrder({})
        counts = await BookingWindowService.getBookedCounts({
            from: W.startOfDay(new Date()),
            to: W.addDays(W.startOfDay(new Date()), 10),
        })
        ok('an order with no window is counted nowhere',
            counts[key] === 2, `got ${counts[key]}`)

        // ─── 5. availability + the D5 limit ───────────────────────────────
        console.log('\n5. availability honours the limit')
        // limit 2, and 2 places are taken → the window must read full.
        const avail = await BookingWindowService.getAvailability({
            userId: null,
            leg: 'pickup',
            horizonDays: 3,
            now: new Date(),
        })
        ok('availability returns a payload', avail.success)
        const slot = (avail.data?.message?.slots || []).find(
            (s) => String(s.windowId) === String(winId) && s.date === W.dateKey(day),
        )
        ok('the window at its limit is reported FULL, not available',
            slot && slot.available === false && slot.unavailableReason === 'full',
            JSON.stringify(slot))
        ok('the Anytime option is always offered, with its own fee',
            avail.data?.message?.anytime?.fee === 1000)
        ok('an unknown leg is refused rather than priced as a delivery',
            !(await BookingWindowService.getAvailability({ leg: 'elbow' })).success)

        // ─── 6. deflections are actually written ──────────────────────────
        console.log('\n6. deflection rows')
        // The write is fire-and-forget so the screen is never delayed; give it
        // a moment before reading, rather than asserting a race.
        await new Promise((r) => setTimeout(r, 800))
        const defl = await WindowDeflectionModel.find({ windowId: winId }).lean()
        ok('a full bookable window wrote a deflection row', defl.length >= 1,
            `got ${defl.length}`)
        if (defl.length) {
            ok('  …recording the limit in force at the time', defl[0].limit === 2,
                String(defl[0].limit))
        }

        const report = await BookingWindowService.getDeflectionReport({})
        const row = (report.data?.message?.rows || []).find(
            (r) => String(r.windowId) === String(winId),
        )
        ok('the report groups by window and day', !!row, JSON.stringify(report.data?.message))
        if (row) {
            // An anonymous browse has no userId. $addToSet collapses them to a
            // single null, so counting the set would report "1 customer moved"
            // when nobody signed in was turned away.
            ok('  …and an anonymous browse counts as 0 customers moved, not 1',
                row.customersMoved === 0 && row.shown >= 1,
                `shown=${row.shown} moved=${row.customersMoved}`)
        }

        // ─── 7. working days endpoint ─────────────────────────────────────
        console.log('\n7. working days (D6)')
        ok('an unknown day is refused',
            !(await BookingWindowService.updateWorkingDays({ workingDays: ['funday'], actorId: ACTOR })).success)
        ok('an EMPTY week is refused out loud, not silently ignored',
            !(await BookingWindowService.updateWorkingDays({ workingDays: [], actorId: ACTOR })).success)
        const wdObj = await BookingWindowService.updateWorkingDays({
            workingDays: { mon: true, tue: true, wed: false },
            actorId: ACTOR,
        })
        ok('a {day: true/false} tick-box object is accepted',
            wdObj.success &&
                JSON.stringify(wdObj.data.message.workingDays) === JSON.stringify(['mon', 'tue']),
            JSON.stringify(wdObj.data))

        // ─── 8. delete in use → switched off, not deleted ─────────────────
        console.log('\n8. a window in use is switched off, not deleted')
        const del = await BookingWindowService.deleteWindow({ id: winId, actorId: ACTOR })
        ok('delete succeeds but reports a DEACTIVATION',
            del.success && del.data.message.deactivated === true &&
                del.data.message.deleted === false,
            JSON.stringify(del.data?.message))
        ok('  …naming how many orders still reference it',
            del.data?.message?.ordersReferencing >= 1,
            String(del.data?.message?.ordersReferencing))
        ok('  …and the window really is still there, switched off',
            (await BookingWindowModel.findById(winId)).isActive === false)

        // An unused window really is deleted.
        const spare = await BookingWindowService.createWindow({
            payload: { name: `${TAG} Spare`, startTime: '13:00', endTime: '14:00' },
            actorId: ACTOR,
        })
        const spareId = spare.data.message._id
        const delSpare = await BookingWindowService.deleteWindow({ id: spareId, actorId: ACTOR })
        ok('an UNUSED window is really deleted',
            delSpare.success && delSpare.data.message.deleted === true &&
                (await BookingWindowModel.findById(spareId)) === null)
    } catch (error) {
        thrown = error
        fail++
    } finally {
        // ── cleanup ──────────────────────────────────────────────────────
        console.log('\ncleanup')
        if (createdOrders.length) {
            await BookOrderModel.deleteMany({ _id: { $in: createdOrders } })
        }
        await WindowDeflectionModel.deleteMany({ windowName: new RegExp(`^${TAG}`) })
        await BookingWindowModel.deleteMany({ name: new RegExp(`^${TAG}`) })
        // Put the real settings back exactly as they were, including fields
        // this run added — otherwise the harness permanently edits the DB it
        // is only supposed to observe.
        if (settingsBefore) {
            await AdminSettingModel.updateOne(
                { _id: settingsBefore._id },
                {
                    $set: {
                        workingDays: settingsBefore.workingDays ?? [
                            'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
                        ],
                        anytimeOpenFrom: settingsBefore.anytimeOpenFrom ?? '08:00',
                        anytimeOpenTo: settingsBefore.anytimeOpenTo ?? '17:00',
                        anytimePickupFee: settingsBefore.anytimePickupFee ?? 1000,
                        anytimeDeliveryFee: settingsBefore.anytimeDeliveryFee ?? 1000,
                    },
                },
            )
        }
        const leftoverOrders = await BookOrderModel.countDocuments({
            fullName: new RegExp(`^${TAG}`),
        })
        const leftoverWindows = await BookingWindowModel.countDocuments({
            name: new RegExp(`^${TAG}`),
        })
        ok('cleanup left nothing behind',
            leftoverOrders === 0 && leftoverWindows === 0,
            `orders=${leftoverOrders} windows=${leftoverWindows}`)

        if (thrown) {
            console.error('\n*** RUN ABORTED — remaining assertions never ran ***')
            console.error(thrown)
        }
        console.log(`\n${pass} passed, ${fail} failed\n`)
        await mongoose.disconnect()
        process.exit(fail ? 1 : 0)
    }
}

main().catch(async (e) => {
    console.error('HARNESS ERROR:', e)
    try {
        await mongoose.disconnect()
    } catch {}
    process.exit(1)
})
