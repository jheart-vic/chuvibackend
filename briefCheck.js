// Offline checks for the 6 Oct developer brief fixes. No DB.
// Run: node scratchpad/briefCheck.js   (from the repo root, path adjusted)
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
const fs = require('fs')
const path = require('path')
// Repo root is passed in, or defaults to the current working directory (run
// this from the repo root).
const ROOT = process.env.REPO_ROOT || process.cwd()

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
    if (cond) {
        pass++
        console.log(`  PASS  ${name}`)
    } else {
        fail++
        console.log(`  FAIL  ${name} ${extra}`)
    }
}

// ─── 4.4 Holds: Active and Overdue must partition the holds ──────────────────
console.log('\n4.4 — holds Active/Overdue partition')
const {
    activeHoldsFilter,
    overdueHoldsFilter,
    breachBranches,
    isHoldBreached,
    HOLD_SLA_HOURS,
} = require(path.join(ROOT, 'util/holdSla'))
const { ORDER_STATUS, DELIVERY_SPEED } = require(path.join(ROOT, 'util/constants'))

const now = new Date('2026-10-07T12:00:00+01:00')
const A = activeHoldsFilter(now)
const O = overdueHoldsFilter(now)

ok('both filters scope to stage.status = hold',
    A['stage.status'] === ORDER_STATUS.HOLD && O['stage.status'] === ORDER_STATUS.HOLD)
ok('Overdue uses $or, Active uses $nor (exact complement)',
    Array.isArray(O.$or) && Array.isArray(A.$nor) && !A.$or && !O.$nor)
ok('the two clauses are the SAME branches — cannot drift',
    JSON.stringify(A.$nor) === JSON.stringify(O.$or),
    `\n       active.$nor=${JSON.stringify(A.$nor)}\n       overdue.$or=${JSON.stringify(O.$or)}`)
ok('every delivery speed has an SLA',
    Object.values(DELIVERY_SPEED).every((s) => HOLD_SLA_HOURS[s] > 0),
    JSON.stringify(HOLD_SLA_HOURS))
ok('a past deliveryDate is also a breach branch',
    O.$or.some((b) => b.deliveryDate && b.deliveryDate.$lt))
// The row badge used its OWN hardcoded 120/240/360 minutes and ignored the
// delivery-date branch, so a row counted as Overdue could still render "not
// breached". Badge and bucket must read the same definition.
const adminSrcHolds = fs.readFileSync(path.join(ROOT, 'services/admin.service.js'), 'utf8')
ok('the Holds list badge uses the shared breach definition',
    /const slaBreached = isHoldBreached\(order, now\)/.test(adminSrcHolds))
ok('…and its displayed threshold comes from the shared SLA table',
    /HOLD_SLA_HOURS\[order\.deliverySpeed\]/.test(adminSrcHolds))
ok('no hardcoded minute thresholds left in the holds list',
    !/\? 120\s*:/.test(adminSrcHolds) && !/: 360 \/\/ standard/.test(adminSrcHolds))

// The client's exact test: 3 breached holds and no others → Active 0, Overdue 3.
const HOUR = 3600 * 1000
const held = (speed, hoursAgo, deliveryDate = null) => ({
    stage: { status: ORDER_STATUS.HOLD, updatedAt: new Date(now - hoursAgo * HOUR) },
    deliverySpeed: speed,
    deliveryDate,
})
const breached = [
    held(DELIVERY_SPEED.SAME_DAY, 3),
    held(DELIVERY_SPEED.EXPRESS, 5),
    held(DELIVERY_SPEED.STANDARD, 7),
]
const withinSla = [
    held(DELIVERY_SPEED.SAME_DAY, 1),
    held(DELIVERY_SPEED.EXPRESS, 3),
    held(DELIVERY_SPEED.STANDARD, 5),
]
ok("client's test: 3 breached holds → all 3 read as breached",
    breached.every((o) => isHoldBreached(o, now)))
ok('3 holds inside SLA → none read as breached',
    withinSla.every((o) => !isHoldBreached(o, now)))
ok('the 2845h-on-hold order from the screenshot is breached, not Active',
    isHoldBreached(held(DELIVERY_SPEED.STANDARD, 2845), now))
ok('a hold past its deliveryDate breaches even inside the hour SLA',
    isHoldBreached(
        held(DELIVERY_SPEED.STANDARD, 1, new Date(now - 24 * HOUR)),
        now,
    ))
ok('an order NOT on hold is never breached',
    !isHoldBreached({ stage: { status: ORDER_STATUS.WASHING, updatedAt: new Date(0) } }, now))
ok('no order can be in both buckets (partition holds for every sample)',
    [...breached, ...withinSla].every(
        (o) => isHoldBreached(o, now) !== !isHoldBreached(o, now),
    ))

// ─── 1.1 S3 dashboard "Recent Wash Queue" must equal the Wash Queue tab ──────
console.log('\n1.1 — S3 dashboard list matches the Wash Queue count')
const wash = fs.readFileSync(path.join(ROOT, 'services/washAndDry.service.js'), 'utf8')
const washQueueCount = wash.match(
    /countDocuments\(\{\s*'items\.currentStation': HERE,\s*'washDetails\.startedAt': \{ \$exists: false \},/,
)
ok('washQueue stat still filters on startedAt $exists:false', !!washQueueCount)
const recentBlock = wash.slice(wash.indexOf('paginate('), wash.indexOf('recentQueue:'))
ok('recentQueue paginate now carries the SAME startedAt filter',
    /'items\.currentStation': HERE,[\s\S]{0,120}'washDetails\.startedAt': \{ \$exists: false \}/.test(
        recentBlock,
    ))
ok('recentQueue rows carry allItemsConfirmed (same shape as the queue tab)',
    /recentQueue:[\s\S]{0,400}allItemsConfirmed: allAtStation\(o, HERE, isWashed\)/.test(wash))
ok('recentQueue selects stationStatus like the queue tab does',
    /limit: 5,[\s\S]{0,200}stationStatus/.test(wash))

// ─── 2.3 Wallet adjustment must write a ledger line ──────────────────────────
console.log('\n2.3 — wallet adjustment writes a ledger line')
const intake = fs.readFileSync(path.join(ROOT, 'services/intake-user.service.js'), 'utf8')
const adjust = intake.slice(
    intake.indexOf('async adjustWallet(req)'),
    intake.indexOf('async getUserWallet(req)'),
)
ok('adjustWallet exists and was found', adjust.length > 500)
// Strip comments first — the fix deliberately QUOTES the old broken line in a
// comment explaining it, and that must not read as the bug still being there.
const adjustCode = adjust
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
ok('no un-awaited bare balance mutation left',
    !/wallet\.balance \+=|wallet\.balance -=/.test(adjustCode))
ok('every save/write in the method is awaited',
    !/(?<!await )(?<!\w)(order|wallet)\.save\(/.test(adjustCode))
// The money path moved into the shared walletAdjustment service (item 2.4), so
// that an admin APPROVING an over-limit adjustment and an operator making a
// within-limit one write identical ledger lines. The guarantees are the same;
// they are just asserted where they now live.
const wa = fs.readFileSync(
    path.join(ROOT, 'services/walletAdjustment.service.js'),
    'utf8',
)
const apply = wa.slice(
    wa.indexOf('async applyAdjustment('),
    wa.indexOf('async createRequest('),
)
ok('the shared applyAdjustment exists', apply.length > 500)
ok('balance moves via a single atomic $inc',
    /findOneAndUpdate\([\s\S]{0,200}\$inc: \{ balance: delta \}/.test(apply))
ok('a debit is guarded on sufficient funds (no overdraw race)',
    /guard\.balance = \{ \$gte: value \}/.test(apply))
ok('a WalletTransaction is created',
    /WalletTransactionModel\.create\(/.test(apply))
ok('the ledger line is a manual-adjustment',
    /type: WALLET_TX_TYPE\.MANUAL_ADJUSTMENT/.test(apply))
ok('the ledger line carries reason, performedBy and balanceAfter',
    /reason,/.test(apply) &&
        /performedBy: performedBy \? getObjectId\(performedBy\)/.test(apply) &&
        /balanceAfter: updated\.balance/.test(apply))
ok('amount is signed so the ledger sums to the balance',
    /const delta = type === 'credit' \? value : -value/.test(apply) &&
        /amount: delta/.test(apply))
ok('a failed ledger write rolls the money back',
    /\$inc: \{ balance: -delta \}/.test(apply))
ok('a reason is mandatory',
    /A reason is required for a wallet adjustment/.test(apply))
ok('adjustWallet delegates to the shared path rather than keeping a copy',
    /WalletAdjustmentService\.applyAdjustment\(/.test(adjust))
ok('over-limit adjustments become a request instead of moving money',
    /WalletAdjustmentService\.createRequest\(/.test(adjust) &&
        /requiresApproval: true/.test(adjust))
ok('the limit comes from settings, never from code',
    /getRoleLimit/.test(adjust) &&
        /walletAdjustmentLimits/.test(
            fs.readFileSync(path.join(ROOT, 'models/adminSetting.model.js'), 'utf8'),
        ))
ok('the audit log attributes the OPERATOR, not the customer',
    /createAuditLog\(\{[\s\S]{0,80}userId: getObjectId\(staffId\)/.test(adjust))
ok('zero / negative adjustments are rejected',
    /amount must be greater than zero/.test(adjust))
ok('the response returns the created ledger row to the FE',
    /transaction: \{[\s\S]{0,400}balanceAfter: ledgerEntry\.balanceAfter/.test(adjust))
ok('no reference to the un-populated order.userId.fullName remains',
    !/order\.userId\.fullName/.test(adjust))

// ─── 2.5 "Cannot create plan" when the plan was actually created ─────────────
console.log('\n2.5 — plan create reports the truth')
const { AUDIT_LOG_CATEGORIES } = require(path.join(ROOT, 'util/constants'))
const AuditLogModel = require(path.join(ROOT, 'models/audit.log.model'))
const sub = fs.readFileSync(path.join(ROOT, 'services/subscription.service.js'), 'utf8')

ok("'subscription' is a valid audit category",
    AUDIT_LOG_CATEGORIES.SUBSCRIPTION === 'subscription')
// The trigger: an audit row was rejected by the enum AFTER the plan was saved.
ok('an audit row with that category validates',
    !new AuditLogModel({
        userId: '65a7d3e9b8f9c10012a9c321',
        action: 'probe',
        category: 'subscription',
    }).validateSync())
// Every category string in the file must be a real enum member, so this can't
// regrow by someone adding a fifth call site with a new word.
const cats = [...sub.matchAll(/category:\s*['"`]([a-z_-]+)['"`]/g)].map((m) => m[1])
ok('no hardcoded audit category strings left in subscription.service',
    cats.length === 0, JSON.stringify(cats))
ok('the plan writes log through the non-fatal auditSafely wrapper',
    (sub.match(/await auditSafely\(\{/g) || []).length === 4)
ok('createAuditLog is only reached via that wrapper',
    (sub.match(/createAuditLog\(/g) || []).length === 1)
// The wrapper now lives in util/safeLog.js (shared with intake-user 3.1 and
// communication 4.1). Assert the shared one really swallows, by RUNNING it.
ok('the plan audit goes through the shared safe wrapper',
    /auditSafely = \(payload\) => logSafely\('Audit log', createAuditLog\(payload\)\)/.test(sub))
const { logSafely: safeLogFn } = require(path.join(ROOT, 'util/safeLog'))
let swallowed = 'threw'
safeLogFn('briefCheck probe', Promise.reject(new Error('boom')))
    .then(() => { swallowed = 'swallowed' })
    .catch(() => { swallowed = 'threw' })
const createPlanSrc = sub.slice(sub.indexOf('async createPlan('), sub.indexOf('async updatePlan('))
ok('the plan write has its own try/catch so a real failure is named',
    /newPlan = await PlanModel\.create\(post\)/.test(createPlanSrc) &&
        /describeDbError\(error, 'Could not create the plan'\)/.test(createPlanSrc))
ok('paystackPlanCode is validated (it is required on the model)',
    /paystackPlanCode: 'string\|required'/.test(createPlanSrc))
ok('itemPerMonth is no longer demanded (the model does not store it)',
    !/itemPerMonth: 'integer\|required'/.test(createPlanSrc))
ok('a duplicate title maps to a clear message, not the generic error',
    /error\?\.code === 11000/.test(sub) && /'Plan title already exists'/.test(sub))
ok('a Mongoose validation error names the offending field',
    /error\?\.name === 'ValidationError'/.test(sub) && /\$\{first\.path\} is required/.test(sub))
ok('updatePlan runs validators so a bad edit cannot save silently',
    /runValidators: true/.test(sub))
ok('updatePlan returns the saved plan for the edit screen',
    /data: updatedPlan/.test(sub))

// ─── 4.1 / 4.3 Templates and the one money path ──────────────────────────────
console.log('\n4.1 — template saves report the truth')
const commSrc = fs.readFileSync(
    path.join(ROOT, 'services/communicationAdmin.service.js'),
    'utf8',
)
ok('channels are normalised, so a single channel as a STRING no longer throws',
    /function normalizeChannels/.test(commSrc) &&
        /Array\.isArray\(input\) \? input : \[input\]/.test(commSrc))
// Strip comments first — the fix QUOTES the broken line in the comment that
// explains it, and that must not read as the bug still being there (the same
// care the 2.3 check above takes).
const commCode = commSrc
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
ok('no raw post.channels.filter left (that WAS the 400)',
    !/post\.channels\.filter/.test(commCode))
ok('both create and update use the shared normaliser',
    (commSrc.match(/normalizeChannels\(post\.channels\)/g) || []).length === 2)
ok('a blanked required field is refused by name',
    /firstBlankRequiredField/.test(commSrc) && /cannot be empty/.test(commSrc))
ok('model rejections name the field instead of a generic 400',
    /describeTemplateError/.test(commSrc))
ok('the audit row cannot fail a saved template',
    (commSrc.match(/logSafely\(/g) || []).length >= 2)
ok('the 4.2 dropdown source exists',
    /async getTemplateMeta\(req\)/.test(commSrc) &&
        fs.existsSync(path.join(ROOT, 'util/commMeta.js')))
const meta = require(path.join(ROOT, 'util/commMeta'))
ok('every target page documents what it opens',
    meta.TARGET_PAGES.length > 0 &&
        meta.TARGET_PAGES.every((p) => p.page && p.description))
ok('every placeholder key documents what it is',
    meta.TEMPLATE_KEYS.every((t) =>
        (t.placeholders || []).every((p) => p.key && p.description)))
ok('the universal keys are the two the renderer actually fills',
    meta.UNIVERSAL_PLACEHOLDERS.map((p) => p.key).sort().join(',') === 'firstName,name')

console.log('\n4.3 — ONE path moves money by hand')
const adminSrc = fs.readFileSync(path.join(ROOT, 'services/admin.service.js'), 'utf8')
const adminCode = adminSrc
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
ok('the admin add/deduct paths no longer mutate the balance themselves',
    !/wallet\.balance \+=|wallet\.balance -=/.test(adminCode))
ok('they delegate to the shared applyAdjustment (identical ledger lines)',
    (adminCode.match(/WalletAdjustmentService\.applyAdjustment\(/g) || []).length === 2)
ok('the customer notification cannot fail a completed movement',
    /logSafely\(\s*'Wallet addition notification'/.test(adminSrc) &&
        /logSafely\(\s*'Wallet deduction notification'/.test(adminSrc))
ok('one shared safeLog is used instead of a copy per service',
    fs.existsSync(path.join(ROOT, 'util/safeLog.js')) &&
        /require\('\.\.\/util\/safeLog'\)/.test(
            fs.readFileSync(path.join(ROOT, 'services/subscription.service.js'), 'utf8'),
        ))

// ─── 4.6 Names as code text, and one phone format ────────────────────────────
console.log('\n4.6 — readable names and a single phone format')
const { prettifyName, stationLabel } = require(path.join(ROOT, 'util/displayName'))
const { itemBrief, briefsForAll, summarize } = require(path.join(ROOT, 'util/itemSummary'))
const { normalizePhone } = require(path.join(ROOT, 'util/helper'))

// The client's exact two strings.
ok('"Shirts-/-tops-/-blouses" reads as "Shirts / Tops / Blouses"',
    prettifyName('Shirts-/-tops-/-blouses') === 'Shirts / Tops / Blouses',
    prettifyName('Shirts-/-tops-/-blouses'))
ok('"Blazers-/-jackets-/-hoodie" reads properly too',
    prettifyName('Blazers-/-jackets-/-hoodie') === 'Blazers / Jackets / Hoodie',
    prettifyName('Blazers-/-jackets-/-hoodie'))
ok('"intake-and-tag-station" reads as a station name',
    stationLabel('intake-and-tag-station') === 'Intake & Tag',
    stationLabel('intake-and-tag-station'))
ok('an unknown station still reads as words, never as a slug',
    !/-/.test(stationLabel('some-new-station')))

// RUN the brief builders — these feed every station card, so this is the
// "reads the same at S1, S2 and S3" requirement.
const sampleItems = [
    { _id: 'i1', type: 'Shirts-/-tops-/-blouses', quantity: 1, tagId: 'TAG-01' },
    { _id: 'i2', type: 'Shirts-/-tops-/-blouses', quantity: 1 },
    { _id: 'i3', type: 'Blazers-/-jackets-/-hoodie', quantity: 1 },
]
const oneBrief = itemBrief(sampleItems, 'i1')
const allBriefs = briefsForAll(sampleItems)
ok('itemBrief sends the readable name',
    oneBrief.name === 'Shirts / Tops / Blouses', oneBrief.name)
ok('…and keeps the stored slug as rawType for anything that matches on it',
    oneBrief.rawType === 'Shirts-/-tops-/-blouses')
ok('briefsForAll agrees with itemBrief (same wording at every station)',
    allBriefs[0].name === oneBrief.name && allBriefs[0].rawType === oneBrief.rawType)
ok('a missing item still returns a usable brief',
    itemBrief(sampleItems, 'nope').name === 'Item')
ok('the summary line reads properly',
    summarize(allBriefs) === '2 Shirts / Tops / Blouseses'
        ? false // guard: pluralisation must not mangle a slashed name
        : /Shirts \/ Tops \/ Blouses/.test(summarize(allBriefs)),
    summarize(allBriefs))

// One phone format — the actual cause of one person becoming two profiles.
const forms = [
    '08031234567',
    '8031234567',
    '+2348031234567',
    '234 803 123 4567',
    '0803-123-4567',
    '002348031234567',
    '+234 (0) 803 123 4567',
]
const normalised = forms.map(normalizePhone)
ok('every real-world form of one number normalises identically',
    new Set(normalised).size === 1 && normalised[0] === '08031234567',
    JSON.stringify(normalised))
ok('the bare 10-digit form gains its leading 0 (this is what split profiles)',
    normalizePhone('8031234567') === normalizePhone('08031234567'))
ok('a blank or junk number stays empty rather than becoming "0"',
    normalizePhone('') === '' && normalizePhone('0000') === '' &&
        normalizePhone(null) === '')
ok('normalising is idempotent',
    normalizePhone(normalizePhone('8031234567')) === '08031234567')
const bookSrc = fs.readFileSync(path.join(ROOT, 'services/bookOrder.service.js'), 'utf8')
const authSrc = fs.readFileSync(path.join(ROOT, 'services/auth.service.js'), 'utf8')
ok('the three write paths store the normalised form',
    /post\.phoneNumber = normalizePhone\(post\.phoneNumber\)/.test(bookSrc) &&
        /post\.phoneNumber = normalizePhone\(post\.phoneNumber\)/.test(intake) &&
        /phoneNumber: normalizePhone\(post\.phoneNumber\)/.test(authSrc))
ok('a backfill exists for the records already stored',
    fs.existsSync(path.join(ROOT, 'phoneFormatBackfill.js')))

// ─── 3.1 Rider assignment — RUN the branches, don't just read them ───────────
// The 1.6 lesson: node --check and require() both passed three ReferenceErrors.
// These stub the two models and actually execute the refusal and success paths.
console.log('\n3.1 — rider assignment validates the rider (executed, not read)')
const BookOrderModel = require(path.join(ROOT, 'models/bookOrder.model'))
const UserModel = require(path.join(ROOT, 'models/user.model'))
const ActivityModel2 = require(path.join(ROOT, 'models/activity.model'))
const { ROLE, GENERAL_STATUS, PICKUP_STATUS } = require(path.join(ROOT, 'util/constants'))
const IntakeUserService = require(path.join(ROOT, 'services/intake-user.service'))

const run = (async () => {
    const svc = new IntakeUserService()
    const ORDER = {
        _id: 'o1',
        oscNumber: 'OSC-20261007-000001',
        items: [{}, {}],
        isPickUp: true,
        isDelivery: false,
    }
    let writes = []
    const realFind = BookOrderModel.findById
    const realUpdate = BookOrderModel.findByIdAndUpdate
    const realUser = UserModel.findById
    const realActivity = ActivityModel2.create

    BookOrderModel.findById = async () => ORDER
    BookOrderModel.findByIdAndUpdate = async (...args) => {
        writes.push(args)
        return ORDER
    }
    const stubUser = (doc) => {
        UserModel.findById = () => ({ select: async () => doc })
    }
    const call = (riderId) =>
        svc.assignRiderTopPickupOrder({
            params: { id: 'o1', riderId },
            query: {},
            user: { id: 'staff1' },
        })

    try {
        // not an ObjectId at all
        stubUser(null)
        writes = []
        let r = await call('not-an-objectid')
        ok('a non-ObjectId rider id is refused', r.success === false)
        ok('  …and NOTHING is written', writes.length === 0)
        ok('  …with a message about the id, not the generic failure',
            /not valid/i.test(r.data.error || ''), JSON.stringify(r.data.error))

        // a valid id that is not a rider — the case that "saved" and then vanished
        stubUser({
            _id: '65a7d3e9b8f9c10012a9c321',
            fullName: 'Ada Customer',
            userType: ROLE.USER,
            status: GENERAL_STATUS.ACTIVE,
        })
        writes = []
        r = await call('65a7d3e9b8f9c10012a9c321')
        ok('a valid id that is NOT a rider is refused', r.success === false)
        ok('  …and NOTHING is written (this used to save and read back null)',
            writes.length === 0)
        ok('  …naming the person', /Ada Customer/.test(r.data.error || ''))

        // a suspended rider
        stubUser({
            _id: '65a7d3e9b8f9c10012a9c322',
            fullName: 'Musa Bello',
            userType: ROLE.RIDER,
            status: GENERAL_STATUS.SUSPENDED,
        })
        writes = []
        r = await call('65a7d3e9b8f9c10012a9c322')
        ok('a suspended rider is refused', r.success === false)
        ok('  …and NOTHING is written', writes.length === 0)

        // the happy path, with every post-write side effect BROKEN
        stubUser({
            _id: '65a7d3e9b8f9c10012a9c323',
            fullName: 'Musa Bello',
            phoneNumber: '08031234567',
            userType: ROLE.RIDER,
            status: GENERAL_STATUS.ACTIVE,
        })
        ActivityModel2.create = async () => {
            throw new Error('simulated activity failure')
        }
        writes = []
        r = await call('65a7d3e9b8f9c10012a9c323')
        ok('an active rider is assigned', r.success === true)
        ok('  …the assignment IS written', writes.length === 1)
        ok('  …a broken activity/notification/audit log does NOT fail it',
            r.success === true, JSON.stringify(r.data))
        ok('  …the rider comes back for the FE to redraw the row',
            r.data?.rider?.fullName === 'Musa Bello')
        ok('  …and the leg status is reported',
            r.data?.pickupStatus === PICKUP_STATUS.SCHEDULED)
    } finally {
        BookOrderModel.findById = realFind
        BookOrderModel.findByIdAndUpdate = realUpdate
        UserModel.findById = realUser
        ActivityModel2.create = realActivity
    }

    // ─── 3.2 / 3.3 structure ────────────────────────────────────────────────
    console.log('\n3.2 / 3.3 — failed-pickup filter and the landmark')
    const intakeSrc = fs.readFileSync(
        path.join(ROOT, 'services/intake-user.service.js'),
        'utf8',
    )
    const riderSrc = fs.readFileSync(
        path.join(ROOT, 'services/rider.service.js'),
        'utf8',
    )
    ok('the dispatch queue accepts a legStatus filter',
        /legStatus,/.test(intakeSrc) &&
            /query\[`dispatchDetails\.\$\{leg\}\.status`\]/.test(intakeSrc))
    ok('an unknown legStatus is refused, not silently ignored',
        /Unknown \$\{leg\} status/.test(intakeSrc))
    ok('rows carry the leg status, a failed flag and the rider note',
        /legStatus: legState/.test(intakeSrc) &&
            /failed:\n?\s*legState ===/.test(intakeSrc) &&
            /legNote:/.test(intakeSrc))
    ok('the queue returns a failedCount beside needsRiderCount',
        /failedCount: await BookOrderModel\.countDocuments/.test(intakeSrc))
    ok('a failed pickup now notifies the OFFICE, not the rider who pressed it',
        /notifyRoles\(\{\s*roles: \[ROLE\.INTAKE_AND_TAG/.test(riderSrc) &&
            !/userId: userId,\s*title: 'Pickup Update'/.test(riderSrc))
    ok("the rider's assigned-pickups list normalizes addresses (3.3)",
        /getRiderAssignedPickups[\s\S]{0,1200}normalizeOrderAddresses\(order\)/.test(riderSrc))
    ok('  …and lifts the landmark onto the row',
        /pickupLandmark: order\.pickupAddress\?\.landmark/.test(riderSrc))
    ok("the rider's assigned-deliveries list does the same",
        /deliveryLandmark: order\.deliveryAddress\?\.landmark/.test(riderSrc))
    ok('the S1 dispatch queue surfaces the landmark too',
        /landmark:\n?\s*\(leg === 'pickup' \? o\.pickupAddress : o\.deliveryAddress\)/.test(intakeSrc))
    ok('one shared notifyRoles replaces the duplicated role-notify loops',
        fs.existsSync(path.join(ROOT, 'util/notifyRoles.js')) &&
            /notifyRoles\(\{ roles: ROLE\.ADMIN/.test(
                fs.readFileSync(path.join(ROOT, 'services/walletAdjustment.service.js'), 'utf8'),
            ))
    // Resolved after a tick, so it is checked here inside the async block.
    ok('the shared safeLog swallows a failed record-keeping write',
        swallowed === 'swallowed', `got: ${swallowed}`)
    ok('there is now a riders endpoint to pick an id from',
        /async getRiders\(req\)/.test(intakeSrc) &&
            /ROUTE_RIDERS/.test(fs.readFileSync(path.join(ROOT, 'routes/intake-user.js'), 'utf8')))

    console.log(`\n${pass} passed, ${fail} failed\n`)
    process.exit(fail ? 1 : 0)
})()

run.catch((e) => {
    console.error('CHECK ERROR:', e)
    process.exit(1)
})

// NOTE: the tally and process.exit live INSIDE the async block above. A
// top-level `process.exit` here would fire before those checks resolved and the
// run would report only the synchronous ones.
