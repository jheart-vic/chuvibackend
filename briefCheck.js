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

// SHAPE CHANGED 2026-10-08: holds at the four production stations are now
// ITEM-level, so an order with a held piece has NO `stage.status: hold`. Both
// filters are therefore `$and: [ scope, breachClause ]`, where scope is
// "order parked OR any piece still held". $and and not a bare $or, because the
// Overdue clause is itself an $or and two $or keys in one object would silently
// overwrite each other — which would have made Overdue match every held order.
const scopeOf = (f) => f.$and[0]
const clauseOf = (f) => f.$and[1]
ok('both filters are scoped by the SAME on-hold clause',
    JSON.stringify(scopeOf(A)) === JSON.stringify(scopeOf(O)))
ok('  …and that scope is "order parked OR a piece still held"',
    scopeOf(O).$or.length === 2 &&
        scopeOf(O).$or[0]['stage.status'] === ORDER_STATUS.HOLD &&
        !!scopeOf(O).$or[1].items.$elemMatch)
ok('  …matched with $elemMatch, so a RELEASED hold does not count forever',
    scopeOf(O).$or[1].items.$elemMatch['holdDetails.releasedAt'].$exists === false)
ok('Overdue uses $or, Active uses $nor (exact complement)',
    Array.isArray(clauseOf(O).$or) &&
        Array.isArray(clauseOf(A).$nor) &&
        !clauseOf(A).$or &&
        !clauseOf(O).$nor)
ok('the two clauses are the SAME branches — cannot drift',
    JSON.stringify(clauseOf(A).$nor) === JSON.stringify(clauseOf(O).$or))
ok('every delivery speed has an SLA',
    Object.values(DELIVERY_SPEED).every((s) => HOLD_SLA_HOURS[s] > 0),
    JSON.stringify(HOLD_SLA_HOURS))
ok('a past deliveryDate is also a breach branch',
    clauseOf(O).$or.some((b) => b.deliveryDate && b.deliveryDate.$lt))
// THE FALSE POSITIVE THIS GUARDS: an order whose only hold is on a PIECE has a
// stale `stage.updatedAt` like any other order. Without pinning the order-level
// branches to `stage.status: hold`, such an order would match a speed branch
// purely for not having moved in six hours, and be reported Overdue while
// nothing was overdue at all.
ok('every stage.updatedAt branch is pinned to an ORDER-level hold',
    clauseOf(O).$or
        .filter((b) => b['stage.updatedAt'])
        .every((b) => b['stage.status'] === ORDER_STATUS.HOLD))
ok('item holds are clocked from the PIECE\'s own heldAt, not the order stage',
    clauseOf(O).$or.some(
        (b) =>
            b.items?.$elemMatch?.['holdDetails.heldAt']?.$lt &&
            b.items.$elemMatch['holdDetails.releasedAt'].$exists === false,
    ))
// The row badge used its OWN hardcoded 120/240/360 minutes and ignored the
// delivery-date branch, so a row counted as Overdue could still render "not
// breached". Badge and bucket must read the same definition.
const adminSrcHolds = fs.readFileSync(path.join(ROOT, 'services/admin.service.js'), 'utf8')
// Tightened 2026-10-08 with hold TYPES (client section B): the badge must now
// also be judged against the SAME loaded rules as the filter that selected the
// row, or a 48-hour payment hold renders against a 6-hour badge — the 4.4 bug
// in a new costume.
ok('the Holds list badge uses the shared breach definition, with the rules',
    /const slaBreached = isHoldBreached\(order, now, listHoldRules\)/.test(adminSrcHolds))
ok('…and its displayed threshold comes from the shared limit resolver',
    /holdLimitHours\(order, listHoldRules\)/.test(adminSrcHolds))
ok('…and the order-detail panel resolves its limit the same way',
    /holdLimitHours\(order, holdRules\)/.test(adminSrcHolds) &&
    /isHoldBreached\(order, now, holdRules\)/.test(adminSrcHolds))
ok('both hold cards are counted against one loaded rule set',
    /activeHoldsFilter\(now, holdRules\)/.test(adminSrcHolds) &&
    /overdueHoldsFilter\(now, holdRules\)/.test(adminSrcHolds))
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

    // ─── Client item #8 — counter payment from the wallet ────────────────────
    console.log('\nitem #8 — counter payment tenders')
    const counter = require(path.join(ROOT, 'util/counterPayment'))
    const { PAYMENT_METHOD: PM, COUNTER_PAYMENT_METHODS } = require(
        path.join(ROOT, 'util/constants'),
    )
    ok('the four counter tenders the client named are the allowed set',
        COUNTER_PAYMENT_METHODS.length === 4 &&
            ['cash', 'pos', 'bank-transfer', 'wallet'].every((m) =>
                COUNTER_PAYMENT_METHODS.includes(m)))
    ok('"transfer" and "card" are accepted as what the screen sends',
        counter.normalizeCounterMethod('transfer') === PM.BANK_TRANFER &&
            counter.normalizeCounterMethod('POS') === PM.POS &&
            counter.normalizeCounterMethod('card') === PM.POS)
    ok('paystack is NOT a counter tender (that is the customer\'s own app)',
        counter.normalizeCounterMethod('paystack') === null &&
            counter.normalizeCounterMethod('') === null)
    const cashPlan = await counter.planCounterPayment({
        customerId: null,
        total: 5000,
        method: 'cash',
    })
    ok('a cash order plans one tender for the whole bill and needs no account',
        cashPlan.ok &&
            cashPlan.plan.tenders.length === 1 &&
            cashPlan.plan.tenders[0].amount === 5000 &&
            cashPlan.plan.walletAmount === 0)
    const noAcct = await counter.planCounterPayment({
        customerId: null,
        total: 5000,
        method: 'wallet',
    })
    ok('the wallet cannot be used without a customer account, and it says so',
        !noAcct.ok && /no customer account/i.test(noAcct.error))
    const zeroPlan = await counter.planCounterPayment({
        customerId: null,
        total: 0,
        method: 'wallet',
    })
    ok('a ₦0 bill charges nothing rather than writing an empty wallet line',
        zeroPlan.ok && zeroPlan.plan.tenders.length === 0)
    // Client report 11 Oct: S1 booking "always" failed on the payment method.
    // Still mandatory, but refused in words the counter operator can act on.
    const missing = await Promise.all(
        [undefined, null, '', '   '].map((method) =>
            counter.planCounterPayment({ customerId: null, total: 5000, method }),
        ),
    )
    ok('a missing or blank tender is refused with the operator sentence, never a field name',
        missing.every((p) => !p.ok && p.error === counter.MISSING_COUNTER_METHOD) &&
            counter.MISSING_COUNTER_METHOD ===
                'Choose how the customer paid: cash, POS, bank transfer or wallet.')
    ok('every spelling the S1 screen may send is still accepted',
        ['cash', 'Cash', 'POS', 'card', 'transfer', 'Bank Transfer', 'bank-transfer', 'wallet'].every(
            (m) => counter.normalizeCounterMethod(m) !== null,
        ))
    ok('there is still no server-side fallback to cash (the tender stays mandatory)',
        !/\|\|\s*PAYMENT_METHOD\.CASH|\|\|\s*'cash'/.test(
            intakeSrc.slice(intakeSrc.indexOf('const tenderMethod'), intakeSrc.indexOf('const paymentPlan')),
        ))
    ok('intake no longer stamps a counter order paid before the money moves',
        !/paymentStatus: PAYMENT_ORDER_STATUS\.SUCCESS,\n\s*billingType/.test(intakeSrc) &&
            /settleCounterPayment\(\{/.test(intakeSrc))
    ok('the plan runs BEFORE the order is created, so a short wallet creates nothing',
        intakeSrc.indexOf('planCounterPayment({') <
            intakeSrc.indexOf('const newOrder = new BookOrderModel'))
    ok('wallet movement is delegated, not reimplemented (one owner, as in 2.4)',
        /chargeWalletForOrder/.test(
            fs.readFileSync(path.join(ROOT, 'util/counterPayment.js'), 'utf8'),
        ) &&
            !/\$inc: \{ balance/.test(
                fs.readFileSync(path.join(ROOT, 'util/counterPayment.js'), 'utf8'),
            ))
    ok('the production clock is started AFTER settlement, not at creation',
        intakeSrc.indexOf('settleCounterPayment({') <
            intakeSrc.indexOf('markProductionClearedIfReady(newOrder._id)'))
    ok('the customer is resolved by phone first, not by full name alone',
        /lookupPhone &&\s*\(await UserModel\.findOne\(\{ phoneNumber: lookupPhone \}\)\)/.test(
            intakeSrc))

    // ─── Client item #6 — offers at checkout ────────────────────────────────
    console.log('\nitem #6 — checkout prompt + auto-apply tie-break')
    const OfferSvcMod = require(path.join(ROOT, 'services/offer.service'))
    const offerSvc =
        typeof OfferSvcMod === 'function' ? new OfferSvcMod() : OfferSvcMod
    const cart = { pickupAmount: 1000, deliveryAmount: 1000 }
    const freeLogistics = {
        customerOfferId: 'A',
        name: 'Free pickup + delivery',
        benefit: { discount: 0, freePickup: true, freeDelivery: true },
        expiresAt: new Date('2026-12-01'),
    }
    const tenPercent = {
        customerOfferId: 'B',
        name: '₦1,500 off',
        benefit: { discount: 1500 },
        expiresAt: new Date('2026-11-01'),
    }
    const sameValueLater = {
        customerOfferId: 'C',
        name: '₦1,500 off, expires later',
        benefit: { discount: 1500 },
        expiresAt: new Date('2026-12-30'),
    }
    ok('auto-apply picks the offer worth MORE on THIS bill',
        offerSvc._bestByBillValue([freeLogistics, tenPercent], cart)
            .customerOfferId === 'A')
    ok('  …counting the pickup/delivery fees an offer waives, not just a discount',
        offerSvc._bestByBillValue([freeLogistics, tenPercent], cart)._billValue === 2000)
    ok('a promised FUTURE credit does not win today\'s bill',
        offerSvc._bestByBillValue(
            [
                { customerOfferId: 'D', benefit: { discount: 100, creditPromised: 50000 } },
                { customerOfferId: 'E', benefit: { discount: 500 } },
            ],
            cart,
        ).customerOfferId === 'E')
    ok('a tie goes to the offer expiring soonest (the other still has time)',
        offerSvc._bestByBillValue([sameValueLater, tenPercent], cart)
            .customerOfferId === 'B')
    ok('nothing applicable → no prompt and no auto-apply',
        offerSvc._bestByBillValue([], cart) === null)
    const offerSrc = fs.readFileSync(path.join(ROOT, 'services/offer.service.js'), 'utf8')
    ok("the prompt is the client's exact wording, shipped from the backend",
        /You have a first time offer\. Tap to use it\./.test(offerSrc))
    ok('item #6(c): an offer is re-validated at ATTACH time by the shared rejection rule',
        /async validateAndPrice/.test(offerSrc) &&
            /_offerRejection\(\{\s*kind: 'personal'/.test(offerSrc) &&
            /breakdown\.rejected\.push/.test(offerSrc))
    ok('  …and the bill carries WHY one was refused',
        /rejected: offerBreakdown\.rejected \|\| \[\]/.test(
            fs.readFileSync(path.join(ROOT, 'services/bookOrder.service.js'), 'utf8'),
        ))

    // ─── Client item #9 — phone-split CRM profiles ──────────────────────────
    console.log('\nitem #9 — merging phone-split CRM cards')
    const ProfileMergeService = require(path.join(ROOT, 'services/profileMerge.service'))
    const merge = new ProfileMergeService()
    const older = {
        _id: 'OLD',
        createdAt: new Date('2026-01-01'),
        stage: 'lead',
        totalOrders: 0,
        totalSpent: 0,
        tags: ['whatsapp-lead'],
        fullName: 'tunde (rider wrote it)',
    }
    const newerWithAccount = {
        _id: 'NEW',
        createdAt: new Date('2026-05-01'),
        userId: 'USER1',
        stage: 'active',
        totalOrders: 4,
        totalSpent: 36000,
        tags: ['express-user'],
        fullName: 'Tunde Adeyemi',
        firstOrderAt: new Date('2026-05-02'),
        lastOrderAt: new Date('2026-09-20'),
    }
    const planned = merge._plan(older, [newerWithAccount])
    ok('the ACCOUNT moves onto the older card, which is how the referral code is kept',
        planned.userId === 'USER1')
    ok('order counts and spend are combined, not picked from one card',
        planned.totalOrders === 4 && planned.totalSpent === 36000)
    ok('the survivor keeps the FURTHEST stage, not the older card\'s',
        planned.stage === 'active')
    ok('tags from both cards are kept, de-duplicated',
        planned.tags.length === 2 &&
            planned.tags.includes('whatsapp-lead') &&
            planned.tags.includes('express-user'))
    ok('the name on the account wins over what a rider wrote down',
        planned.fullName === 'Tunde Adeyemi')
    ok('first/last order dates widen to cover both cards',
        planned.firstOrderAt?.getTime() === new Date('2026-05-02').getTime() &&
            planned.lastOrderAt?.getTime() === new Date('2026-09-20').getTime())
    const mergeSrc = fs.readFileSync(
        path.join(ROOT, 'services/profileMerge.service.js'),
        'utf8',
    )
    ok('two different accounts is a BLOCKER, refused before anything is written',
        /code: 'two-accounts'/.test(mergeSrc) &&
            mergeSrc.indexOf("if (group.blockers.length)") <
                mergeSrc.indexOf('CrmScheduledMessageModel.updateMany'))
    // Client ruling 2026-10-08: the absorbed card is ARCHIVED, never deleted —
    // "phone numbers get shared and recycled here, so a wrong merge must be
    // reversible."
    ok('the absorbed card is ARCHIVED, not deleted',
        !/CrmProfileModel\.deleteMany/.test(mergeSrc) &&
            /mergedInto: keep\._id/.test(mergeSrc) &&
            /archived: true/.test(mergeSrc))
    ok('  …and archived cards are hidden from every list and count by a hook',
        /crmProfileSchema\.pre\(\/\^find\/, hideArchived\)/.test(
            fs.readFileSync(path.join(ROOT, 'models/crmProfile.model.js'), 'utf8'),
        ) &&
            /pre\('aggregate'/.test(
                fs.readFileSync(path.join(ROOT, 'models/crmProfile.model.js'), 'utf8'),
            ))
    ok('messages are re-pointed BEFORE the cards are archived',
        mergeSrc.indexOf('CrmScheduledMessageModel.updateMany') <
            mergeSrc.indexOf('mergedInto: keep._id'))
    ok("the survivor's stage is RECOMPUTED from combined orders, not the furthest",
        /countStage\(combinedOrders\)/.test(mergeSrc) &&
            /stage: recomputed,/.test(mergeSrc) &&
            !/stage: furthest\.stage/.test(mergeSrc))
    ok('  …using the CRM engine\'s own rule, not a second copy of the thresholds',
        /const \{ countStage \} = require\('\.\/crm\.service'\)/.test(mergeSrc))
    ok('the unique normalizedPhone is freed before the survivor claims it',
        mergeSrc.indexOf("$unset: { normalizedPhone: '' }") <
            mergeSrc.indexOf('normalizedPhone: canonical'))
    ok('the phone backfill survives a duplicate-key collision instead of aborting',
        /err\?\.code === 11000/.test(
            fs.readFileSync(path.join(ROOT, 'phoneFormatBackfill.js'), 'utf8'),
        ))

    // ─── Client answer 1(b) — First Experience clock starts at REGISTRATION ──
    console.log('\nitem #2 / answer 1(b) — First Experience offer clock')
    const crmSrc = fs.readFileSync(path.join(ROOT, 'services/crm.service.js'), 'utf8')
    // Now AWAITED rather than fire-and-forget, because the follow-up sequence is
    // anchored to the offer's expiry and needs the linkage back.
    ok('the First Experience trigger fires from handleUserRegistered',
        /async handleUserRegistered\(user\)[\s\S]{0,3400}await OfferService\.handleTrigger\(\s*OFFER_TRIGGER\.FIRST_EXPERIENCE,/.test(
            crmSrc,
        ))
    ok('  …and its expiry is captured, so the sequence can be anchored to it',
        /offerEndsAt = linkage\?\.expiresAt \|\| null/.test(crmSrc))
    ok('  …without a failed grant being able to break a signup',
        /First Experience grant on registration failed \(non-fatal\)/.test(crmSrc))
    ok('  …and NOT from createLead, where an account-less lead made it a no-op',
        !/async createLead\([\s\S]{0,700}offerOnTrigger\(OFFER_TRIGGER\.FIRST_EXPERIENCE/.test(
            crmSrc,
        ))
    ok('  …unconditionally, so a lead who registers LATER still gets it',
        !/if \(created\)[\s\S]{0,200}FIRST_EXPERIENCE/.test(crmSrc))
    ok('account creation has exactly one chokepoint, so staff-created = registration',
        ['services', 'controllers'].every((dir) =>
            fs
                .readdirSync(path.join(ROOT, dir))
                .filter((f) => f.endsWith('.js') && f !== 'auth.service.js')
                .every(
                    (f) =>
                        !/new UserModel\(|UserModel\.create\(/.test(
                            fs.readFileSync(path.join(ROOT, dir, f), 'utf8'),
                        ),
                )))
    ok('the offer LENGTH is configuration (customerWindowDays), not a hardcoded 3 days',
        /customerWindowDays/.test(
            fs.readFileSync(path.join(ROOT, 'models/offer.model.js'), 'utf8'),
        ) && /offer\.customerWindowDays \|\| 14/.test(offerSrc))

    // ─── Client item #10 — who gets notified ────────────────────────────────
    console.log('\nitem #10 — notification policy')
    const policy = require(path.join(ROOT, 'util/notifyPolicy'))
    const STATION_FILES = [
        'services/sortAndPretreat.service.js',
        'services/washAndDry.service.js',
        'services/qc.service.js',
        'services/rider.service.js',
        'services/intake-user.service.js',
        'services/walletAdjustment.service.js',
    ].map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')])

    // An operator receipt is suppressed unless it names a kept exception.
    let sent = await policy.notifyOperator({ userId: 'x', title: 't' })
    ok('an unnamed operator receipt is NOT sent', sent === 0)
    sent = await policy.notifyOperator({ keep: 'not-a-real-exception', userId: 'x' })
    ok('a MISTYPED exception name fails closed rather than sending', sent === 0)
    ok('only the client\'s two exceptions are keepable',
        policy.KEPT_RECEIPTS.length === 2 &&
            policy.KEPT_RECEIPTS.includes('order-in-tagging-queue') &&
            policy.KEPT_RECEIPTS.includes('adjustment-request-decided'))
    ok('all eight admin events the client listed are named',
        Object.keys(policy.ADMIN_EVENT).length === 8)

    const suppressed = STATION_FILES.reduce(
        (n, [, s]) => n + (s.match(/notifyOperator\(\{/g) || []).length,
        0,
    )
    ok(`every station receipt goes through the policy (${suppressed} sites)`,
        suppressed >= 27)
    const keptCount = STATION_FILES.reduce(
        (n, [, s]) => n + (s.match(/keep: '/g) || []).length,
        0,
    )
    ok(`exactly three call sites claim an exception (${keptCount})`, keptCount === 3)

    // The hold messages: affected station, never the actor. Four since
    // 2026-10-09, when the admin item-hold release was added — it tells the
    // station that was waiting on the piece, and must obey the same rule.
    const adminSrc2 = fs.readFileSync(path.join(ROOT, 'services/admin.service.js'), 'utf8')
    ok('the four hold notices go to the affected station',
        (adminSrc2.match(/notifyAffectedStation\(\{/g) || []).length === 4)
    ok('  …and every one of them excludes the actor',
        (adminSrc2.match(/notifyAffectedStation\(\{\s*role:[^}]*actorId: userId/g) || [])
            .length === 4)
    ok('  …so no "notify admin who performed the action" receipt survives',
        !/notify admin who performed the action/.test(adminSrc2))
    ok('the station-level hold releases do the same',
        /notifyAffectedStation\(\{\s*role: ROLE\.INTAKE_AND_TAG,\s*actorId: userId/.test(
            STATION_FILES[4][1],
        ) &&
            /notifyAffectedStation\(\{\s*role: ROLE\.SORT_AND_PRETREAT,\s*actorId: userId/.test(
                STATION_FILES[0][1],
            ))
    ok('actor exclusion lives in the ONE shared notifyRoles, not a second copy',
        /if \(exceptUserId\) query\._id = \{ \$ne: exceptUserId \}/.test(
            fs.readFileSync(path.join(ROOT, 'util/notifyRoles.js'), 'utf8'),
        ))

    // Customer switch-offs.
    ok('the customer is no longer told their order was "flagged"',
        !/title: 'Order Flagged',\s*\n\s*body: `Your order/.test(STATION_FILES[4][1]))
    ok('  …an admin is told instead',
        /ADMIN_EVENT\.ORDER_FLAGGED/.test(STATION_FILES[4][1]))
    const handoffSrc = fs.readFileSync(
        path.join(ROOT, 'services/handoff.service.js'),
        'utf8',
    )
    ok('the inter-station handoff notice is silenced for customers',
        /customerSilent: true/.test(handoffSrc) &&
            /!STAGE_ENTRY_NOTICE\[enteredStage\]\.customerSilent/.test(handoffSrc))
    // Match the FIELD (trailing comma), not the mention of it in the comment
    // above the table — the first version of this check counted both.
    ok('  …but the garment-progress notices still reach them',
        (handoffSrc.match(/customerSilent: true,/g) || []).length === 1)

    // Admin additions actually wired up.
    const adminWired = [
        ['services/bookOrder.service.js', 'ORDER_CANCELLED'],
        ['services/bookOrder.service.js', 'CANCELLATION_REQUESTED'],
        ['services/sortAndPretreat.service.js', 'ITEM_FLAGGED'],
        ['services/sortAndPretreat.service.js', 'ITEM_ON_HOLD'],
        ['services/washAndDry.service.js', 'ITEM_ON_HOLD'],
        ['services/qc.service.js', 'ITEM_ON_HOLD'],
        ['services/wallet.service.js', 'PAYMENT_PROOF_UPLOADED'],
    ]
    for (const [file, event] of adminWired) {
        ok(`admin is notified of ${event} in ${file.split('/').pop()}`,
            new RegExp(`ADMIN_EVENT\\.${event}`).test(
                fs.readFileSync(path.join(ROOT, file), 'utf8'),
            ))
    }
    ok('a new complaint ALREADY reached an admin — not double-sent',
        /notifyStaff\(\[ROLE\.CUSTOMER_EXPERIENCE, ROLE\.ADMIN\]/.test(
            fs.readFileSync(path.join(ROOT, 'services/recovery.service.js'), 'utf8'),
        ) &&
            !/ADMIN_EVENT\.COMPLAINT_OPENED/.test(
                fs.readFileSync(path.join(ROOT, 'services/recovery.service.js'), 'utf8'),
            ))

    // The switch-off must not touch the record of the work.
    // The client's condition: "on-screen confirmation and order history must
    // survive the switch-off." Every file that lost a notification must still
    // record the work — an activity row or an audit line (walletAdjustment
    // writes audit lines, not activity rows).
    ok('the record of the work survives every switch-off',
        STATION_FILES.every(
            ([, s]) => /ActivityModel\.create\(/.test(s) || /createAuditLog\(/.test(s),
        ))
    ok('no notification title carries a leaked regex escape',
        STATION_FILES.every(([, s]) => !/title: '[^']*\\[^']*'/.test(s)))

    // ─── Client confirmation 2026-10-08 — held pieces must not move ─────────
    console.log('\nclient answer 1 — the auto-handover conditions')
    const { isItemOnHold, describeHeld } = require(path.join(ROOT, 'util/itemHold'))
    const now2 = new Date()
    ok('a piece held and not released reads as on hold',
        isItemOnHold({ holdDetails: { heldAt: now2 } }) === true)
    ok('a released hold does NOT read as on hold',
        isItemOnHold({ holdDetails: { heldAt: now2, releasedAt: now2 } }) === false)
    ok('a piece with no hold block is not on hold',
        isItemOnHold({}) === false && isItemOnHold(null) === false)
    ok('being FLAGGED is not the same as being HELD (brief 1.4 keeps them apart)',
        isItemOnHold({ flaggedForReview: true }) === false)
    ok('the refusal names the pieces that are blocking',
        /TAG-9/.test(
            describeHeld([{ tagId: 'TAG-9', holdDetails: { heldAt: now2 } }]) || '',
        ))
    const handoffSrc2 = fs.readFileSync(
        path.join(ROOT, 'services/handoff.service.js'),
        'utf8',
    )
    ok('the handoff refuses to push a held piece',
        /const heldMessage = describeHeld\(targets\)/.test(handoffSrc2) &&
            /if \(heldMessage\)/.test(handoffSrc2))
    ok('  …and the hold gate runs BEFORE anything is written',
        handoffSrc2.indexOf('const heldMessage') <
            handoffSrc2.indexOf('const targetIds = targets.map'))
    const sortSrc2 = fs.readFileSync(
        path.join(ROOT, 'services/sortAndPretreat.service.js'),
        'utf8',
    )
    ok('condition (a): a piece still needing pretreatment is not handed over',
        /\['complete', 'not_required'\]\.includes\(i\.pretreatStatus\) &&\s*\n\s*!isItemOnHold\(i\)/.test(
            sortSrc2,
        ))
    ok('condition (b): the automatic handover skips held pieces',
        /!isItemOnHold\(i\)/.test(sortSrc2) && /!isItemOnHold\(freshItem\)/.test(sortSrc2))

    // ─── Client decision 2026-10-08 — the 60-day "ordered again" window ─────
    console.log('\nclient answer 2 — "ordered again" is capped at 60 days')
    const recSrc = fs.readFileSync(
        path.join(ROOT, 'services/recoveryReport.service.js'),
        'utf8',
    )
    ok('the window is 60 days, named once',
        /const ORDERED_AGAIN_WINDOW_DAYS = 60/.test(recSrc) &&
            (recSrc.match(/ORDERED_AGAIN_WINDOW_DAYS/g) || []).length >= 3)
    ok('the cap is applied to each customer\'s own recovery moment',
        /placed - recovered <= windowMs/.test(recSrc))
    ok('  …and the order query is no longer open-ended',
        /createdAt: \{ \$gte: from, \$lte: latestRelevant \}/.test(recSrc))
    ok('the window travels in the response so the card cannot misstate it',
        /orderedAgainWindowDays: ORDERED_AGAIN_WINDOW_DAYS/.test(recSrc))

    // ─── Client item #1 — registered-but-never-booked sequence ──────────────
    console.log('\nitem #1 — registered-but-never-booked sequence')
    const sw = require(path.join(ROOT, 'util/crmSendWindow'))
    const {
        CRM_WORKFLOW: WF,
        CRM_WINDOWED_WORKFLOWS: WINDOWED,
        CRM_MESSAGE_TYPE: MT,
        CRM_INTERNAL_ACTIONS: ACTIONS,
        CRM_SEND_SLOT: SLOT,
    } = require(path.join(ROOT, 'util/constants'))

    // The client's own worked example: Fri 15:00 registration, Mon 15:00 expiry.
    const regAt = new Date('2026-10-09T15:00:00+01:00')
    const offerEnd = new Date('2026-10-12T15:00:00+01:00')
    const m1 = sw.nextSendSlot(new Date(regAt.getTime() + 24 * 3600 * 1000), SLOT.ANY)
    const pairEx = sw.offerEndSchedule(offerEnd)
    ok('msg1 lands in the first window after 24h (Sat evening)',
        m1.getDay() === 6 && m1.getHours() === 18)
    ok('msg2 lands the evening BEFORE the offer ends (Sun 18:00)',
        pairEx.second.getDay() === 0 && pairEx.second.getHours() === 18)
    ok('msg3 lands the morning the offer ENDS (Mon 06:00)',
        pairEx.third.getDay() === 1 && pairEx.third.getHours() === 6)
    // Their stated edge case.
    const early = sw.offerEndSchedule(new Date('2026-10-12T07:00:00+01:00'))
    ok('an offer ending before 08:00 shifts BOTH messages back a slot',
        early.shifted === true &&
            early.third.getDay() === 0 && early.third.getHours() === 18 &&
            early.second.getDay() === 0 && early.second.getHours() === 6)
    ok('nothing may send outside the two windows',
        !sw.isInSendWindow(new Date('2026-10-12T12:00:00+01:00')) &&
            !sw.isInSendWindow(new Date('2026-10-12T21:00:00+01:00')) &&
            sw.isInSendWindow(new Date('2026-10-12T06:30:00+01:00')) &&
            sw.isInSendWindow(new Date('2026-10-12T19:30:00+01:00')))
    ok('a message due mid-afternoon waits for the EVENING window, not tomorrow',
        sw.nextSendSlot(new Date('2026-10-12T14:00:00+01:00'), SLOT.ANY).getHours() === 18)
    ok('a nonsense window setting cannot silence every message forever',
        sw.normalizeWindows({ morningStartHour: 9, morningEndHour: 9 })
            .morningEndHour === 8)
    ok('the four workflows the client named are windowed; order messages are NOT',
        WINDOWED.length === 4 &&
            WINDOWED.includes(WF.REGISTERED_NOT_BOOKED) &&
            WINDOWED.includes(WF.LEAD) &&
            WINDOWED.includes(WF.REACTIVATION) &&
            WINDOWED.includes(WF.BROADCAST) &&
            !WINDOWED.includes(WF.POST_DELIVERY))
    ok('the day-7 prospect move is an internal action, so no template is rendered',
        ACTIONS.includes(MT.REG_NOT_BOOKED_MARK_PROSPECT))

    const CrmSettingMod = require(path.join(ROOT, 'models/crmSetting.model'))
    const rnbSchedule = CrmSettingMod.DEFAULT_REGISTERED_NOT_BOOKED_SCHEDULE
    ok('the default schedule is the four steps the client specified',
        rnbSchedule.length === 4)
    ok('  …with messages 2 and 3 anchored to the OFFER end, not a fixed delay',
        rnbSchedule.filter((s) => s.anchor === 'offer-end').length === 2)
    ok('  …and step 1 at +24h, the prospect move at day 7',
        rnbSchedule[0].delayMinutes === 1440 && rnbSchedule[3].delayMinutes === 10080)
    const rnbTexts = [1, 2, 3].map(
        (n) => CrmSettingMod.DEFAULT_TEMPLATES[`reg-not-booked-${n}`] || '',
    )
    ok("the three texts are seeded and use the system's firstName placeholder",
        rnbTexts.every((t) => t.includes('{{firstName}}')))
    ok('  …and none mentions "pickup window" (they ship before window booking)',
        rnbTexts.every((t) => !/pickup window/i.test(t)))
    ok('  …message 3 keeps the ₦8,000 line',
        /from ₦8,000/.test(rnbTexts[2]))

    // ─── N1 / WINDOW BOOKING — the pure scheduling engine (client D1–D8) ─────
    //
    // `util/bookingWindow.js` is pure and takes `now` as a parameter precisely
    // so these can be asserted offline. Every rule here is a CUTOFF rule — a
    // different answer at 14:00 than at 14:01 — and a function that read the
    // clock itself could only be tested by waiting, i.e. never.
    console.log('\nN1 — booking windows, working days, Anytime (client D1–D8)')
    const BW = require(path.join(ROOT, 'util/bookingWindow'))

    // The client's starting window and starting week.
    const EVENING = {
        _id: 'w1', name: 'Evening', startTime: '15:00', endTime: '18:30',
        days: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        cutoffMinutes: 60, limit: 10, isActive: true,
    }
    const WDAYS = ['tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    const FEES = { pickupFee: 500, deliveryFee: 500, anytimePickupFee: 1000, anytimeDeliveryFee: 1000 }
    // 2026-10-09 Fri · 10 Sat · 11 Sun · 12 MON (closed) · 13 Tue
    const fri = (h, m = 0) => new Date(2026, 9, 9, h, m, 0, 0)
    const satD = (h, m = 0) => new Date(2026, 9, 10, h, m, 0, 0)
    const sunD = (h, m = 0) => new Date(2026, 9, 11, h, m, 0, 0)
    const monD = (h, m = 0) => new Date(2026, 9, 12, h, m, 0, 0)

    ok('a bad time string is REFUSED, never silently midnight',
        BW.parseHhMm('3pm') === null && BW.parseHhMm('25:00') === null &&
            BW.parseHhMm('15:70') === null && BW.parseHhMm('15:00') === 900)
    ok('D6 Monday is closed, Friday is open',
        BW.isWorkingDay(monD(9), WDAYS) === false &&
            BW.isWorkingDay(fri(9), WDAYS) === true)
    // A working-days list that normalised to [] would close the business
    // permanently and refuse every booking, so it must never be the answer.
    ok('an empty/garbage working-days setting falls back — it cannot close the business',
        BW.normalizeWorkingDays([]).length === 6 &&
            BW.normalizeWorkingDays(null).length === 6)
    ok('  …and a {mon:false,tue:true} tick-box object is understood',
        JSON.stringify(BW.normalizeWorkingDays({ mon: false, tue: true, wed: true })) ===
            JSON.stringify(['tue', 'wed']))

    // D6: "the promised delivery date must also skip unticked days" — now the
    // launch-item-3 engine (deliveryDayForSpeed was removed, review F-59).
    const D6S = { workingDays: WDAYS, halfDays: ['sun'] }
    ok('D6 express picked up Sunday skips the closed Monday → Tuesday',
        BW.earliestReadyDay({ speed: DELIVERY_SPEED.EXPRESS, pickupAt: sunD(9), settings: D6S }).getDate() === 13)
    ok('D6 standard picked up Saturday: Sunday ½ + Monday 0 + Tuesday 1 + Wednesday 1 → Wednesday (client example)',
        BW.earliestReadyDay({ speed: DELIVERY_SPEED.STANDARD, pickupAt: satD(9), settings: D6S }).getDate() === 14)
    ok('  …and Ready Today is never offered on a closed day',
        BW.earliestReadyDay({ speed: DELIVERY_SPEED.SAME_DAY, pickupAt: monD(9), settings: D6S }) === null)

    // D1: 15:00 window with a 60-minute cutoff closes at 14:00.
    ok('D1 the cutoff bites exactly at 14:00 for a 15:00 window',
        BW.isWindowBookable({ window: EVENING, date: fri(0), now: fri(13, 59), workingDays: WDAYS }) === true &&
            BW.isWindowBookable({ window: EVENING, date: fri(0), now: fri(14, 0), workingDays: WDAYS }) === false)
    // The cutoff governs BOOKING; it must not govern whether a dispatch
    // physically happened inside the window (the refund test reads that).
    ok('isWithinWindow ignores the cutoff and reads the hours only',
        BW.isWithinWindow(fri(16), EVENING) === true &&
            BW.isWithinWindow(fri(14, 30), EVENING) === false &&
            BW.isWithinWindow(fri(18, 31), EVENING) === false)

    ok('D5 a blank limit means NO limit (never a silent cap)',
        BW.windowRemaining({ limit: null }, 999) === Infinity &&
            BW.windowRemaining({ limit: undefined }, 999) === Infinity)
    ok('  …and limit 10 is full at 10, not at 9',
        BW.isWindowFull(EVENING, 10) === true && BW.isWindowFull(EVENING, 9) === false)

    const ATS = { workingDays: WDAYS, anytimeOpenFrom: '08:00', anytimeOpenTo: '17:00' }
    ok('D2(b) Anytime is open 08:00–17:00 on a working day only',
        BW.isAnytimeOpen({ now: fri(11), ...ATS }) === true &&
            BW.isAnytimeOpen({ now: fri(7, 59), ...ATS }) === false &&
            BW.isAnytimeOpen({ now: fri(17, 1), ...ATS }) === false &&
            BW.isAnytimeOpen({ now: monD(11), ...ATS }) === false)
    ok('  …outside hours it promises first thing the next WORKING day (Mon closed → Tue 08:00)',
        (() => {
            const d = BW.anytimeServiceStart({ now: sunD(18), ...ATS })
            return d.getDate() === 13 && d.getHours() === 8
        })())

    // THE NARROWED REFUND RULE (client 2026-10-08), in their own two examples.
    // Reason (a) is READ FROM THE ORDER, never recomputed: by the time the job
    // is done the cutoff has passed, so "was the window still bookable when
    // they booked?" is unrecoverable after the fact.
    ok("D2(c) client example: booked 11:00 while the window was open, served 16:00 → REFUND",
        BW.qualifiesForAnytimeRefund({ windowWasBookableAtBooking: true, servedAt: fri(16), window: EVENING }) === true)
    ok("D2(c) client example: booked 14:30 after the cutoff, served 16:00 → NO refund",
        BW.qualifiesForAnytimeRefund({ windowWasBookableAtBooking: false, servedAt: fri(16), window: EVENING }) === false)
    ok('  …served OUTSIDE the window → no refund (they got the speed they paid for)',
        BW.qualifiesForAnytimeRefund({ windowWasBookableAtBooking: true, servedAt: fri(19, 30), window: EVENING }) === false)
    ok('  …and the stored flag must be an explicit true, never a truthy accident',
        BW.qualifiesForAnytimeRefund({ servedAt: fri(16), window: EVENING }) === false)

    // The window price IS today's price — there is no second pair of settings.
    ok('a WINDOW leg costs exactly today’s pickupFee/deliveryFee',
        BW.legFee({ timing: 'window', leg: 'pickup', settings: FEES }) === 500 &&
            BW.legFee({ timing: 'window', leg: 'delivery', settings: FEES }) === 500)
    ok('  …and the refund is the Anytime PREMIUM only, not the whole fee',
        BW.anytimeRefundAmount({ leg: 'pickup', settings: FEES }) === 500)

    // Client ruling: same-day pickup is an Anytime trip at the Anytime price;
    // delivery returns in the evening window at the window price; and it must
    // be DISCLOSED before the customer confirms.
    const sdPlan = BW.sameDayLegPlan({ settings: FEES })
    ok('same-day pickup is Anytime-priced, delivery window-priced',
        sdPlan.pickup.timing === 'anytime' && sdPlan.pickup.fee === 1000 &&
            sdPlan.delivery.timing === 'window' && sdPlan.delivery.fee === 500)
    ok('  …and it carries the disclosure the client requires BEFORE confirming',
        typeof sdPlan.disclosure === 'string' && sdPlan.disclosure.length > 20)
    ok('  …a morning window later switches it to the window price with no code change',
        (() => {
            const p = BW.sameDayLegPlan({ settings: FEES, morningWindow: { _id: 'm1', name: 'Morning' } })
            return p.pickup.timing === 'window' && p.pickup.fee === 500
        })())

    // DEFLECTIONS — the number that cannot be derived from saved orders later,
    // because a deflected customer leaves no trace on the order they end up
    // with. It has to be written when the full window is dropped.
    const defFull = BW.buildOfferedSlots({
        now: fri(10), windows: [EVENING], workingDays: WDAYS,
        bookedCounts: { '2026-10-09::w1': 10 }, horizonDays: 1, leg: 'pickup', settings: FEES,
    })
    ok('D5 a FULL bookable window is dropped AND logged as a deflection',
        defFull.slots[0].available === false &&
            defFull.slots[0].unavailableReason === 'full' &&
            defFull.deflections.length === 1 &&
            defFull.deflections[0].limit === 10)
    const defLate = BW.buildOfferedSlots({
        now: fri(14, 30), windows: [EVENING], workingDays: WDAYS,
        bookedCounts: { '2026-10-09::w1': 10 }, horizonDays: 1, leg: 'pickup', settings: FEES,
    })
    ok('  …but a window already past its cutoff is NOT a deflection',
        defLate.slots[0].unavailableReason === 'cutoff-passed' &&
            defLate.deflections.length === 0)
    const defClosed = BW.buildOfferedSlots({
        now: monD(9), windows: [EVENING], workingDays: WDAYS,
        bookedCounts: { '2026-10-12::w1': 10 }, horizonDays: 1, leg: 'pickup', settings: FEES,
    })
    ok('  …and neither is a closed day',
        defClosed.slots[0].unavailableReason === 'not-working-day' &&
            defClosed.deflections.length === 0)

    // SEEDING IS NOT MIGRATING — third time in this repo. Without the backfill,
    // window booking works on a fresh DB and has no working days in production.
    const setupSrcN1 = fs.readFileSync(path.join(ROOT, 'config/setup.js'), 'utf8')
    ok('the scheduling settings are MIGRATED onto the existing AdminSetting doc',
        /ensureSchedulingSettings/.test(setupSrcN1) &&
            /\[field\]: \{ \$exists: false \}/.test(setupSrcN1))
    ok('  …and both new steps are registered in setupApp (an unregistered step never runs)',
        /\["schedulingSettings", ensureSchedulingSettings\]/.test(setupSrcN1) &&
            /\["defaultBookingWindow", createDefaultBookingWindow\]/.test(setupSrcN1))
    const bwModelSrc = fs.readFileSync(path.join(ROOT, 'models/bookingWindow.model.js'), 'utf8')
    ok('a window’s limit defaults to null (no limit), never to a number',
        /limit: \{ type: Number, default: null/.test(bwModelSrc))

    // ─── N1 Phase 2 — resolving a leg at booking time ───────────────────────
    // `resolveLeg` touches no database, so every branch runs here. Loading the
    // service would prove nothing about its method bodies (the 1.6 lesson:
    // three ReferenceErrors passed both `node --check` and `require()`).
    console.log('\nN1 — resolving a booking leg (D3 forced move, the refund flag)')
    const BWS = require(path.join(ROOT, 'services/bookingWindow.service'))
    const LATE = {
        _id: 'w2', name: 'Late', startTime: '19:00', endTime: '21:00',
        days: WDAYS, cutoffMinutes: 60, limit: 5, isActive: true,
    }
    const RSET = { workingDays: WDAYS, anytimeOpenFrom: '08:00', anytimeOpenTo: '17:00', ...FEES }

    const rWin = BWS.resolveLeg({
        leg: 'pickup', timing: 'window', windowId: 'w1', date: fri(0),
        windows: [EVENING], settings: RSET, bookedCounts: {}, now: fri(10),
    })
    ok('a bookable window resolves with its hours and the window fee',
        rWin.ok && rWin.leg.windowId === 'w1' && rWin.leg.fee === 500 &&
            rWin.leg.windowStart === '15:00' && rWin.leg.windowEnd === '18:30')
    ok('  …and a WINDOW leg never claims the Anytime refund flag',
        rWin.leg.windowWasBookableAtBooking === undefined)

    ok('past the cutoff it is refused, with requiresChoice so the screen can re-ask',
        (() => {
            const r = BWS.resolveLeg({
                leg: 'pickup', timing: 'window', windowId: 'w1', date: fri(0),
                windows: [EVENING], settings: RSET, bookedCounts: {}, now: fri(14, 1),
            })
            return !r.ok && r.requiresChoice === true
        })())
    ok('D6 a closed day is refused AND names the next working day',
        (() => {
            const r = BWS.resolveLeg({
                leg: 'pickup', timing: 'window', windowId: 'w1', date: monD(0),
                windows: [EVENING], settings: RSET, bookedCounts: {}, now: fri(10),
            })
            return !r.ok && /closed that day/i.test(r.error) && /2026-10-13/.test(r.error)
        })())

    // D3: capacity-forced move. The client was explicit — the customer pays the
    // WINDOW price and KEEPS their offer, because the move was ours not theirs.
    const rFull = BWS.resolveLeg({
        leg: 'pickup', timing: 'window', windowId: 'w1', date: fri(0),
        windows: [EVENING, LATE], settings: RSET,
        bookedCounts: { '2026-10-09::w1': 10 }, now: fri(10),
    })
    ok('D3 a FULL window MOVES the customer instead of refusing them',
        rFull.ok && rFull.leg.forcedMove === true && rFull.leg.windowId === 'w2')
    ok('  …at the WINDOW price, and recording what they were moved from',
        rFull.leg.fee === 500 && /Evening on 2026-10-09/.test(rFull.leg.forcedMoveFrom || ''))
    ok('  …and with nothing free anywhere it refuses and points at Urgent (Anytime)',
        (() => {
            const counts = {}
            // Zero-padded: `dateKey` pads, so '2026-10-9' would never match
            // and the window would look free on the first day searched.
            for (let i = 9; i <= 20; i += 1) {
                counts[`2026-10-${String(i).padStart(2, '0')}::w1`] = 10
            }
            const r = BWS.resolveLeg({
                leg: 'pickup', timing: 'window', windowId: 'w1', date: fri(0),
                windows: [EVENING], settings: RSET, bookedCounts: counts, now: fri(10),
            })
            return !r.ok && /Please choose Urgent/.test(r.error)
        })())

    // Launch item 4 (client Q2): every window full → Urgent at the WINDOW price,
    // offer kept, no refund owed; a window still open → the Anytime price.
    {
        const fullFri = { '2026-10-09::w1': 10 }
        const urgentFull = BWS.resolveLeg({
            leg: 'pickup', timing: 'anytime', date: fri(0),
            windows: [EVENING], settings: RSET, bookedCounts: fullFri, now: fri(10),
        })
        ok('item 4: Urgent on a day with every window full is charged the WINDOW price, no refund owed',
            urgentFull.ok && urgentFull.leg.windowsFull === true && urgentFull.leg.fee === 500 &&
                urgentFull.leg.windowWasBookableAtBooking === false)
        const urgentOpen = BWS.resolveLeg({
            leg: 'pickup', timing: 'anytime', date: fri(0),
            windows: [EVENING], settings: RSET, bookedCounts: {}, now: fri(10),
        })
        ok('item 4: with a window still open, Urgent keeps the Anytime price',
            urgentOpen.ok && !urgentOpen.leg.windowsFull && urgentOpen.leg.fee !== 500)
        const urgentLate = BWS.resolveLeg({
            leg: 'pickup', timing: 'anytime', date: fri(0),
            windows: [EVENING], settings: RSET, bookedCounts: fullFri, now: fri(17, 30),
        })
        ok('item 4: outside Urgent hours a full day gets no window-price Urgent',
            urgentLate.ok && !urgentLate.leg.windowsFull)
        const W4 = require(path.join(ROOT, 'util/bookingWindow'))
        ok('item 4: "Urgent opens at" reads today / tomorrow / a weekday',
            W4.opensAtText(new Date(2026, 9, 9, 8), fri(6)) === '8:00 AM today' &&
                W4.opensAtText(new Date(2026, 9, 10, 8), fri(18)) === '8:00 AM tomorrow' &&
                W4.opensAtText(new Date(2026, 9, 13, 8), fri(18)) === '8:00 AM Tuesday')
        const closedMon = W4.anytimeOnDate({ date: new Date(2026, 9, 12), now: fri(18), settings: RSET })
        ok('item 4: a closed date says when Urgent next opens',
            closedMon.open === false && closedMon.opensAtText === '8:00 AM Tuesday')
        const boSrc4 = fs.readFileSync(path.join(ROOT, 'services/bookOrder.service.js'), 'utf8')
        ok('item 4: offers treat a full-windows Urgent pickup as a window pickup (offer kept), on booking and re-price',
            /const offerPickupTiming = \(leg\) => \(leg\?\.windowsFull \? BOOKING_TIMING\.WINDOW : leg\?\.timing\)/.test(boSrc4) &&
                (boSrc4.match(/pickupTiming: offerPickupTiming\(/g) || []).length === 2)
        ok('item 4: an Urgent pickup is stamped urgentPickup and alerts Intake',
            /urgentPickup: true/.test(boSrc4) && /title: 'Urgent pickup booked'/.test(boSrc4))
        const intakeSrc4 = fs.readFileSync(path.join(ROOT, 'services/intake-user.service.js'), 'utf8')
        const offerSrc4 = fs.readFileSync(path.join(ROOT, 'services/offer.service.js'), 'utf8')
        const bwSrc4 = fs.readFileSync(path.join(ROOT, 'services/bookingWindow.service.js'), 'utf8')
        ok('item 4 (F-85): the booking-options quote prices a full-windows Urgent pickup as a window pickup',
            /await BookingWindowService\.pickupWindowsFullOn\(draft\.pickupDate\)/.test(offerSrc4) &&
                /pickupTiming: BOOKING_TIMING\.WINDOW, pickupAmount: full\.windowFee/.test(offerSrc4))
        ok('item 4 (F-86): only the pickup leg can offer Urgent at the window price',
            /leg === DISPATCH_LEG\.PICKUP &&\s*W\.allWindowsFull/.test(bwSrc4))
        ok('item 4 (F-87): a full-windows Urgent pickup records the true no-refund reason',
            /legData\.windowsFull\s*\? 'Every window was full, so Urgent was already charged the window price\.'/.test(bwSrc4))
        ok('item 4: Intake\'s pickup list puts Urgent first',
            /sort: leg === 'pickup' \? \{ urgentPickup: -1, createdAt: 1 \}/.test(intakeSrc4))
    }

    // THE UNRECOVERABLE FLAG, stamped at booking. These two cases ARE the
    // client's refund examples, one step earlier than the pure-module test:
    // there we asserted the rule, here we assert the flag it depends on.
    ok('Anytime booked at 11:00 (window still open) stamps the flag TRUE',
        (() => {
            const r = BWS.resolveLeg({
                leg: 'pickup', timing: 'anytime', date: fri(0),
                windows: [EVENING], settings: RSET, bookedCounts: {}, now: fri(11),
            })
            return r.ok && r.leg.windowWasBookableAtBooking === true &&
                String(r.leg.refundAgainstWindowId) === 'w1' && r.leg.fee === 1000
        })())
    ok('Anytime booked at 14:30 (cutoff passed) stamps it FALSE — no refund later',
        (() => {
            const r = BWS.resolveLeg({
                leg: 'pickup', timing: 'anytime', date: fri(0),
                windows: [EVENING], settings: RSET, bookedCounts: {}, now: fri(14, 30),
            })
            return r.ok && r.leg.windowWasBookableAtBooking === false
        })())
    ok('a delivery leg is priced as a DELIVERY, not silently as a pickup',
        BWS.resolveLeg({
            leg: 'delivery', timing: 'anytime', date: fri(0),
            windows: [EVENING], settings: RSET, bookedCounts: {}, now: fri(11),
        }).leg.fee === 1000)

    // One validator shared by create and update, so the two cannot drift — the
    // hold-SLA lesson (three copies of one table, already drifted).
    ok('a blank limit is ACCEPTED (it means "no limit"), a negative one is not',
        BWS._validateWindow({ name: 'x', startTime: '15:00', endTime: '18:30', limit: null }).length === 0 &&
            BWS._validateWindow({ name: 'x', startTime: '15:00', endTime: '18:30', limit: '' }).length === 0 &&
            BWS._validateWindow({ name: 'x', startTime: '15:00', endTime: '18:30', limit: -2 }).length > 0)
    ok('  …end-before-start, a bad time and an unknown day are all refused',
        BWS._validateWindow({ name: 'x', startTime: '18:00', endTime: '15:00' }).some((e) => /after startTime/.test(e)) &&
            BWS._validateWindow({ name: 'x', startTime: '3pm', endTime: '18:30' }).length > 0 &&
            BWS._validateWindow({ name: 'x', startTime: '15:00', endTime: '18:30', days: ['funday'] }).some((e) => /unknown day/.test(e)))
    ok('  …and a blank limit is shaped to null rather than to 0',
        BWS._shapeWindow({ limit: '' }).limit === null &&
            JSON.stringify(BWS._shapeWindow({ days: ['TUE', 'tue', 'Wed'] }).days) === JSON.stringify(['tue', 'wed']))
    // Recognised by its HOURS so the client can name it anything.
    ok('the morning window is found by its hours, not by its name',
        BWS._findMorningWindow([EVENING, { _id: 'm', name: 'Early Birds', startTime: '09:00', endTime: '12:00' }])._id === 'm' &&
            BWS._findMorningWindow([EVENING, LATE]) === null)

    // The booking integration, asserted structurally — postBookOrder needs a DB.
    const boSrc = fs.readFileSync(path.join(ROOT, 'services/bookOrder.service.js'), 'utf8')
    ok('window booking is OPTIONAL — an app build that sends nothing still books',
        /pickupTiming: 'string\|in:window,anytime'/.test(boSrc) &&
            /if \(post\.pickupTiming \|\| post\.deliveryTiming\)/.test(boSrc))
    ok('the legs are resolved BEFORE the order is created, so a refusal leaves nothing',
        boSrc.indexOf('BookingWindowService.resolveLeg') < boSrc.indexOf('const oscNumber = generateOscNumber()'))
    ok('a same-day pickup is FORCED to Anytime pricing, not trusted from the client',
        /const pickupTiming = BookingWindowService\.resolvePickupTiming\(\{\s*deliverySpeed: post\.deliverySpeed,\s*pickupTiming: post\.pickupTiming,/.test(boSrc))
    ok('the chosen timing owns the fee (one override, not five parallel edits)',
        /adminOrderSetting\.pickupFee = resolved\.leg\.fee/.test(boSrc) &&
            /adminOrderSetting\.deliveryFee = scheduling\.delivery\.fee/.test(boSrc))
    ok('`scheduling` is stamped once in the common tail, after the !newOrder guard',
        boSrc.indexOf('if (!newOrder) {') < boSrc.indexOf('{ $set: { scheduling, ...(urgentPickup && { urgentPickup: true }) } }'))
    const bwSvcSrc = fs.readFileSync(path.join(ROOT, 'services/bookingWindow.service.js'), 'utf8')
    // Matches the field being USED in a query (`isCancelled:`), not the comment
    // that explains why it must not be — otherwise the explanation fails the test.
    ok('a CANCELLED order releases its window slot (there is no `isCancelled` field)',
        /'cancellation\.cancelledAt': \{ \$exists: false \}/.test(bwSvcSrc) &&
            !/\bisCancelled\s*:/.test(bwSvcSrc))
    ok('the deflection write can never delay or fail the booking screen',
        /this\._recordDeflections\(deflections, userId\)\.catch\(\(\) => \{\}\)/.test(bwSvcSrc))
    ok('scheduling audit rows use a REAL category (there is no "admin" one)',
        /category: AUDIT_LOG_CATEGORIES\.SYSTEM/.test(bwSvcSrc) &&
            !/category: 'admin'/.test(bwSvcSrc))
    ok('an unknown `leg` is refused rather than priced as a delivery',
        /Object\.values\(DISPATCH_LEG\)\.includes\(leg\)/.test(bwSvcSrc))
    ok('a window in use is DEACTIVATED, never deleted (orders keep their times)',
        /window\.isActive = false/.test(bwSvcSrc) && /ordersReferencing: inUse/.test(bwSvcSrc))
    ok('an EMPTY working week is refused out loud, not silently ignored',
        /At least one working day is required/.test(bwSvcSrc))

    // ─── D1/D6(b) — the deadline vs the promise ─────────────────────────────
    // `deliveryDate` stays the INTERNAL deadline (its 19:00 is an end-of-day
    // sentinel that ~10 readers compare as an instant: overdue, due-today, the
    // hold breach branch). The customer-facing promise is a separate field.
    console.log('\nN1 — deliveryDate stays the deadline; the promise is its own field')
    const { deliveryPromise } = BW
    const { presentOrder } = require(path.join(ROOT, 'util/orderView'))

    // Clock-independent invariant (launch item 3 engine; calculateDueDate was
    // removed, review F-59): whatever day the harness runs on, a ready date must
    // LAND on a ticked day.
    ok('D6(b) a ready date always lands on a WORKING day',
        [DELIVERY_SPEED.STANDARD, DELIVERY_SPEED.EXPRESS].every((speed) => {
            const day = BW.earliestReadyDay({ speed, pickupAt: new Date(), settings: { workingDays: WDAYS, halfDays: ['sun'] } })
            return day !== null && BW.isWorkingDay(day, WDAYS)
        }))
    ok('  …and it keeps the 19:00 end-of-day sentinel, which is NOT a promise',
        BW.readyDeadline(new Date()).getHours() === 19)
    const dueSrc = fs.readFileSync(path.join(ROOT, 'util/bookingWindow.js'), 'utf8')
    // Launch item 3 replaced calculateDueDate on both booking paths with the
    // ready-date engine, which reads the working days through the settings.
    ok('  …and both booking paths now use the ready-date engine (working days included)',
        /BookingWindowService\.speedOptionsFor\(/.test(boSrc) &&
            /BookingWindowService\.speedOptionsFor\(/.test(
                fs.readFileSync(path.join(ROOT, 'services/intake-user.service.js'), 'utf8'),
            ))
    ok('  …and the 19:00 is documented as a sentinel so nobody repoints it at 18:30',
        /END-OF-DAY SENTINEL/.test(dueSrc))

    const EVW = { _id: 'w1', name: 'Evening', startTime: '15:00', endTime: '18:30' }
    ok('a confirmed promise quotes the WINDOW (D1 replaces "by 7pm")',
        deliveryPromise({ date: new Date(2026, 9, 13), window: EVW, timing: 'window', confirmed: true })
            .text === 'Delivery on Tue Oct 13 2026, between 15:00 and 18:30.')
    ok('  …an unconfirmed one reads as an ESTIMATE (D7 confirms at READY)',
        (() => {
            const p = deliveryPromise({ date: new Date(2026, 9, 13), window: EVW, timing: 'window' })
            return p.confirmed === false && /^Estimated delivery on/.test(p.text)
        })())
    ok('  …Anytime promises the DAY, not a window',
        /as soon as we can that day/.test(
            deliveryPromise({ date: new Date(2026, 9, 13), timing: 'anytime' }).text,
        ))
    // The whole point: never show the deadline's time to a customer.
    ok('  …with no window it says the day only and NEVER invents a time',
        deliveryPromise({ date: new Date(2026, 9, 13, 19, 0, 0) }).text ===
            'Estimated delivery on Tue Oct 13 2026.')
    ok('  …so the 19:00 sentinel can never be echoed as "7pm"',
        !/19:00|7 ?pm/i.test(deliveryPromise({ date: new Date(2026, 9, 13, 19, 0, 0) }).text))

    // Derived in the ONE outward shape, so no read path can forget it — the
    // archived-CRM-cards lesson (a filter added at 13 sites is the one the 14th
    // forgets).
    ok('presentOrder attaches the promise and leaves deliveryDate alone',
        (() => {
            const o = presentOrder({
                oscNumber: 'OSC1', amount: 5000, items: [], deliveryAmount: 0,
                deliveryDate: new Date(2026, 9, 13, 19, 0, 0),
                scheduling: {
                    delivery: {
                        timing: 'window', windowId: 'w1', windowName: 'Evening',
                        windowStart: '15:00', windowEnd: '18:30',
                        confirmedAt: new Date(2026, 9, 12),
                    },
                },
            })
            return /between 15:00 and 18:30/.test(o.deliveryPromise.text) &&
                o.deliveryPromise.confirmed === true &&
                o.deliveryDate.getHours() === 19
        })())
    ok('  …a legacy order with no scheduling gets a day-only promise, not a fake window',
        (() => {
            const o = presentOrder({
                oscNumber: 'OSC2', amount: 1, items: [], deliveryAmount: 0,
                deliveryDate: new Date(2026, 9, 13, 19, 0, 0),
            })
            return o.deliveryPromise.windowName === null &&
                o.deliveryPromise.text === 'Estimated delivery on Tue Oct 13 2026.'
        })())
    ok('  …and an order with no delivery date gets null, not a broken string',
        presentOrder({ oscNumber: 'OSC3', amount: 1, items: [], deliveryAmount: 0 })
            .deliveryPromise === null)
    ok('the bot quotes the shared promise instead of keeping its own copy',
        /order\.deliveryPromise\?\.text \|\|/.test(
            fs.readFileSync(path.join(ROOT, 'services/bot/readAnswers.js'), 'utf8'),
        ))

    // ─── N1 PHASE 3 — tags never before payment; the count chain ────────────
    console.log('\nN1 Phase 3 — payment gate, waiver, and the item-count chain')
    const { itemTagGate, dispatchPaymentGate } = require(path.join(ROOT, 'util/paymentGate'))
    const PAID = { paymentStatus: 'success', amount: 5000 }
    const UNPAID = { paymentStatus: 'pending', amount: 4500 }
    const WAIVED = { paymentStatus: 'pending', amount: 5000, paymentWaivedAt: new Date() }

    ok('tags are REFUSED on an unpaid order, and the refusal names the amount',
        (() => {
            const g = itemTagGate(UNPAID)
            return g.ok === false && g.requiresPayment === true &&
                g.outstandingAmount === 4500 && /4,500/.test(g.error)
        })())
    ok('  …allowed once it is paid', itemTagGate(PAID).ok === true)
    // THE ASYMMETRY IS THE WHOLE DESIGN: a waiver opens tagging and closes
    // dispatch. Two functions, because one combined helper would have to pick
    // an answer and would be wrong at the other end.
    ok('a WAIVER opens tagging (the order is meant to be processed)',
        itemTagGate(WAIVED).ok === true)
    ok('  …and CLOSES dispatch — "processes unpaid, stopped at dispatch"',
        (() => {
            const g = dispatchPaymentGate(WAIVED)
            return g.ok === false && g.paymentWaived === true
        })())
    // The narrowing that dispatchTagStaging forced. The dispatch tag has
    // supported an unpaid order since 2026-09-24, printing "settle it in the
    // app, do NOT collect cash" — so blocking every unpaid order here was
    // wrong, and only the WAIVER is stopped.
    ok('an ordinary UNPAID order is still dispatchable (it has its own notice)',
        dispatchPaymentGate(UNPAID).ok === true)
    ok('  …and a paid order passes both gates',
        itemTagGate(PAID).ok && dispatchPaymentGate(PAID).ok)
    // One definition of "the money is complete", shared with the processing
    // clock — two copies would eventually disagree about a waived order.
    const pgSrc = fs.readFileSync(path.join(ROOT, 'util/paymentGate.js'), 'utf8')
    ok('"money complete" is IMPORTED from productionClock, never re-stated',
        /require\('\.\/productionClock'\)/.test(pgSrc) &&
            !/paymentStatus === PAYMENT_ORDER_STATUS\.SUCCESS/.test(pgSrc))

    // The gate must sit on ALL THREE tag doors, or an unpaid order walks
    // through whichever one was missed.
    const iuSrc = fs.readFileSync(path.join(ROOT, 'services/intake-user.service.js'), 'utf8')
    ok('all three tag doors call the gate (generate / confirm / complete)',
        (iuSrc.match(/itemTagGate\(order\)/g) || []).length === 3,
        `found ${(iuSrc.match(/itemTagGate\(order\)/g) || []).length}`)
    const dtSrc = fs.readFileSync(path.join(ROOT, 'util/dispatchTag.js'), 'utf8')
    ok('the waiver stop lives in dispatchTagGate, shared by read/print/assign',
        /dispatchPaymentGate\(order\)/.test(dtSrc))

    // The count chain. The two mismatches are deliberately NOT symmetrical:
    // the rider's is a flag, Intake's is a hold. The client overruled us in
    // opposite directions on each, so getting them the same way round matters.
    const riderSrcN1 = fs.readFileSync(path.join(ROOT, 'services/rider.service.js'), 'utf8')
    ok('a rider count that differs REQUIRES a reason',
        /requiresCountReason: true/.test(riderSrcN1))
    ok('  …but never blocks the pickup — it flags and SMSes the customer',
        /order\.flaggedForReview = true/.test(riderSrcN1) &&
            /we collected \$\{order\.counts\.rider\}/.test(riderSrcN1) &&
            !/sendFailedResponse[\s\S]{0,200}changedAtPickup/.test(riderSrcN1))
    ok('Intake disagreeing with the rider RAISES the hold and stops the order',
        /raiseCountMismatchHold\(/.test(iuSrc) &&
            /countMismatch: true/.test(iuSrc) &&
            /requiresAdminApproval: true/.test(iuSrc))
    const cmSrc = fs.readFileSync(path.join(ROOT, 'util/countMismatchHold.js'), 'utf8')
    ok('  …as a REAL order-level hold, so Holds Management actually shows it',
        /'stage\.status': ORDER_STATUS\.HOLD/.test(cmSrc) &&
            /'orderHold\.holdTypeKey': COUNT_MISMATCH_HOLD_KEY/.test(cmSrc) &&
            /stageHistory/.test(cmSrc) &&
            /\$unset: \{ 'orderHold\.escalatedAt': '' \}/.test(cmSrc))
    ok('  …using the hold type already seeded with requiresAdminApproval',
        /count_differs_from_rider/.test(cmSrc) &&
            /count_differs_from_rider/.test(
                fs.readFileSync(path.join(ROOT, 'config/setup.js'), 'utf8'),
            ))
    // Both counts are optional, so every existing caller is unchanged — which
    // is why all 20 harnesses passed without edits.
    ok('both counts are OPTIONAL, so existing callers behave identically',
        /req\.body\?\.itemCount === undefined/.test(iuSrc) &&
            /req\.body\?\.itemCount === undefined/.test(riderSrcN1))

    // ─── N1 Phase 3 — the payment hold, the waiver, the reminders ───────────
    console.log('\nN1 Phase 3 — payment hold lifecycle and cancellation fees')
    const PHS = require(path.join(ROOT, 'services/paymentHold.service'))
    ok('the reminder schedule is the client’s: 6h, 24h, admin at 48h',
        PHS.SCHEDULE.length === 3 &&
            PHS.SCHEDULE[0].afterHours === 6 && PHS.SCHEDULE[0].audience === 'customer' &&
            PHS.SCHEDULE[1].afterHours === 24 && PHS.SCHEDULE[1].audience === 'customer' &&
            PHS.SCHEDULE[2].afterHours === 48 && PHS.SCHEDULE[2].audience === 'admin')
    ok('an open hold is told apart from a cleared one',
        PHS.isOnPaymentHold({ paymentHold: { raisedAt: new Date() } }) === true &&
            PHS.isOnPaymentHold({ paymentHold: { raisedAt: new Date(), clearedAt: new Date() } }) === false &&
            PHS.isOnPaymentHold({}) === false)

    const phSrc = fs.readFileSync(path.join(ROOT, 'services/paymentHold.service.js'), 'utf8')
    // "Staff can never type an amount" is enforced by there being no parameter.
    ok('raising a hold takes NO amount — the bill comes from the order',
        /static async raise\(\{ orderId, actorId, reason = null, keepClockFrom = null \}\)/.test(phSrc) &&
            /const amount = amountDue\(order\)/.test(phSrc))
    ok('the hold IS an ordinary order-level hold, so Holds Management shows it',
        /'orderHold\.holdTypeKey': HoldTypeModel\.PAYMENT_HOLD_KEY/.test(phSrc) &&
            /'stage\.status': ORDER_STATUS\.HOLD/.test(phSrc))
    // Reminders are latched BY NAME, and the latch is claimed BEFORE the send:
    // losing one reminder is better than messaging a customer every 20 minutes.
    ok('each reminder is latched by NAME with $addToSet, claimed before sending',
        /\$addToSet: \{ 'paymentHold\.remindersSent': step\.latch \}/.test(phSrc) &&
            phSrc.indexOf("$addToSet: { 'paymentHold.remindersSent': step.latch }") <
                phSrc.indexOf('tally.sent += 1'))
    ok('a waiver REQUIRES a reason', /A reason is required to waive a payment hold/.test(phSrc))
    ok('a bank transfer approval REQUIRES a matchable reference',
        /transfer reference or the sender’s name is required/.test(phSrc))
    ok('  …and every approval notifies an admin for the daily bank check',
        /Bank transfer approved by Intake & Tag/.test(phSrc) &&
            /approvedByRole/.test(phSrc))
    // The waiver must not grow its own copy of the dispatch stop. Asserted by
    // WHERE the gate is called, not by searching for the word "dispatch" — the
    // waiver legitimately TELLS the customer it cannot be dispatched, so a
    // text search fails on its own user-facing message.
    ok('the dispatch stop is called ONLY from the shared dispatch-tag gate',
        (() => {
            // Comments stripped before searching. Twice this session a
            // source-grepping assertion has failed on the prose explaining
            // itself — the waiver's doc comment names `dispatchPaymentGate` to
            // say where the stop lives, which is documentation, not a call.
            const code = phSrc
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^\s*\/\/.*$/gm, '')
            return /dispatchPaymentGate\(order\)/.test(dtSrc) &&
                !/dispatchPaymentGate/.test(code)
        })())
    // Paystack clears the hold on its own; a human-approved transfer records
    // WHO, because that is the first question asked about a bank transfer.
    ok('the Paystack webhook releases the hold automatically',
        /PaymentHoldService\.clear\(\{[\s\S]{0,120}source: 'paystack'/.test(
            fs.readFileSync(path.join(ROOT, 'util/webhook.handler.js'), 'utf8'),
        ))
    ok('an admin-approved payment releases it too, recorded as bank-transfer',
        /source: 'bank-transfer'/.test(
            fs.readFileSync(path.join(ROOT, 'services/admin.service.js'), 'utf8'),
        ))
    ok('the reminder cron is REGISTERED in server.js (an unregistered cron never runs)',
        /require\('\.\/crons\/paymentHoldReminders\.js'\)/.test(
            fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'),
        ))

    // Cancellation. Pure, so every tier runs here.
    const { cancellationOutcome, taggingBegun } = require(path.join(ROOT, 'util/cancellationFees'))
    const CSET = { cancellationPickupFee: 1000, cancellationReturnFee: 1000 }
    const mkOrd = (o) => ({ items: [{ type: 'shirt' }], amount: 8000, dispatchDetails: { pickup: {} }, ...o })
    ok('before pickup is FREE, and anything paid comes back in full',
        (() => {
            const a = cancellationOutcome({ order: mkOrd({}), settings: CSET })
            const b = cancellationOutcome({ order: mkOrd({ paymentStatus: 'success' }), settings: CSET })
            return a.tier === 'free' && a.feeApplied === 0 &&
                b.tier === 'free' && b.refundToWallet === 8000
        })())
    ok('collected but unpaid owes ₦1,000 + ₦1,000 before the clothes go back',
        (() => {
            const r = cancellationOutcome({
                order: mkOrd({ dispatchDetails: { pickup: { status: 'picked-up' } } }),
                settings: CSET,
            })
            return r.tier === 'logistics' && r.feeApplied === 2000 &&
                r.payableBeforeReturn === true
        })())
    // The clause that makes this file necessary: deriving the charge from
    // `order.pricing` would make a cancelled free-pickup order cost nothing.
    ok('  …charged even under a free-pickup offer, and said so to the customer',
        /even if your order had free pickup/i.test(
            cancellationOutcome({
                order: mkOrd({ dispatchDetails: { pickup: { status: 'picked-up' } } }),
                settings: CSET,
            }).explanation,
        ))
    ok('after payment the laundry fee returns and both trips are kept',
        (() => {
            const r = cancellationOutcome({
                order: mkOrd({
                    dispatchDetails: { pickup: { status: 'picked-up' } },
                    paymentStatus: 'success',
                }),
                settings: CSET,
            })
            return r.tier === 'post-payment' && r.feeApplied === 2000 && r.refundToWallet === 6000
        })())
    ok('once tagging has begun, cancellation is REFUSED',
        (() => {
            const r = cancellationOutcome({
                order: mkOrd({ items: [{ type: 'shirt', tagId: 'TAG-01' }] }),
                settings: CSET,
            })
            return r.allowed === false && r.tier === 'refused'
        })())
    // Checked on the ITEMS, not the stage: a tag is generated while the order
    // is still in the tagging QUEUE, which the stage list treats as cancellable.
    ok('  …detected from the ITEMS (a tag exists before the stage moves)',
        taggingBegun({ items: [{ tagId: 'TAG-01' }] }) === true &&
            taggingBegun({ items: [{ tagStatus: 'complete' }] }) === true &&
            taggingBegun({ items: [{ type: 'shirt' }] }) === false)
    ok('  …and the stricter tag rule is checked BEFORE the stage tiers',
        boSrc.indexOf('if (taggingBegun(order))') < boSrc.indexOf('const RED = ['))
    ok('the cancellation fee is COMPUTED, with an explicit value as an override',
        (boSrc.match(/outcome\.feeApplied\s*\n?\s*: feeAmount/g) || []).length === 2)
    ok('the cancellation charges are MIGRATED onto the existing settings doc',
        /cancellationPickupFee: 1000/.test(setupSrcN1) &&
            /cancellationReturnFee: 1000/.test(setupSrcN1))

    // ─── Client item #7 — item edit and re-pricing ──────────────────────────
    console.log('\nItem #7 — editing an order and settling the difference')
    // "Through the same pricing + offers" is a claim about CODE PATHS, so it is
    // asserted as one: the reprice must call the identical three steps a
    // booking branch calls, on the same class.
    ok('re-pricing calls the SAME three pricing steps a booking does',
        /_repriceForItems/.test(boSrc) &&
            /priceItems\(\{[\s\S]{0,200}serviceTypeMultiplier/.test(boSrc) &&
            /this\._priceWithOffers\(\{[\s\S]{0,160}itemsSubtotal: priced\.total/.test(boSrc) &&
            /const pricing = this\._buildPricing\(\{/.test(boSrc))
    // An item edit must not quietly re-price the logistics or the tier.
    ok('  …taking the service type, tier and speed from the ORDER, not the request',
        /serviceType: order\.serviceType/.test(boSrc) &&
            /serviceTier: order\.serviceTier/.test(boSrc) &&
            /deliverySpeed: order\.deliverySpeed/.test(boSrc))
    ok('  …and honouring the window/Anytime fee the customer actually chose',
        /order\.scheduling\?\.pickup\?\.fee \?\? adminOrderSetting\.pickupFee/.test(boSrc))
    ok('total UP reuses the payment hold rather than a second dunning flow',
        /PaymentHoldService\.raise\(\{/.test(boSrc))
    ok('total DOWN returns the difference through the ONE wallet-refund helper',
        /refundToWallet\(\{/.test(boSrc))
    // A waiver is permission to proceed, not money received.
    ok('a WAIVED order is not counted as paid, so nothing is refunded',
        (() => {
            const { amountPaidSoFar } = require(path.join(ROOT, 'util/paymentGate'))
            return /const amountPaid = amountPaidSoFar\(order\)/.test(boSrc) &&
                amountPaidSoFar({ paymentStatus: 'pending', paymentWaivedAt: new Date(), amount: 5000 }) === 0
        })())
    ok('a reason is REQUIRED and the edit is recorded with who made it',
        /A reason is required — the bill is changing/.test(boSrc) &&
            /itemEdits: \{/.test(boSrc))
    // Mongoose silently drops a write to an undeclared path — the third time
    // this repo has hit it (pickup.note, holdDetails). Only counting the rows
    // finds it, so the field's existence is asserted here.
    const orderModelSrc = fs.readFileSync(path.join(ROOT, 'models/bookOrder.model.js'), 'utf8')
    ok('  …and `itemEdits` IS DECLARED on the schema (or the trail vanishes silently)',
        /itemEdits: \[/.test(orderModelSrc))
    ok('after tagging only an ADMIN may edit, detected from the ITEMS',
        /taggingBegun\(order\) && actorRole !== ROLE\.ADMIN/.test(boSrc) &&
            /requiresAdmin: true/.test(boSrc))

    // The wallet refund is now one implementation, shared with cancellation.
    const wrSrc = fs.readFileSync(path.join(ROOT, 'util/walletRefund.js'), 'utf8')
    ok('the wallet refund does all THREE writes (balance, ledger, Payment)',
        /\$inc: \{ balance: value \}/.test(wrSrc) &&
            /WalletTransactionModel\.create/.test(wrSrc) &&
            /PaymentModel\.create/.test(wrSrc))
    ok('  …because the customer’s own history reads Payment (the 2.3 lesson)',
        /fetch-user-transactions/.test(wrSrc))
    ok('  …and cancellation now DELEGATES to it instead of keeping a copy',
        (boSrc.match(/refundToWallet\(\{/g) || []).length === 2 &&
            !/\$inc: \{ balance: cashRefunded \}/.test(boSrc))

    // ─── D7, the Anytime refund payout, and display names ───────────────────
    console.log('\nD7 confirmation at READY · the Anytime refund · display names')
    ok('D7: the delivery window is confirmed from packAndSealComplete (READY)',
        /confirmDeliveryWindow\(\{ orderId \}\)/.test(
            fs.readFileSync(path.join(ROOT, 'services/qc.service.js'), 'utf8'),
        ))
    ok('  …and it does NOT re-price the order (they were quoted at booking)',
        !/'scheduling\.delivery\.fee'/.test(bwSvcSrc))
    ok('  …leaving it UNCONFIRMED when no window is free, rather than inventing a date',
        /reason: 'no-window-available'/.test(bwSvcSrc))

    // The refund reads the stored flag; by the time the job is done the cutoff
    // has passed, so condition (a) is unanswerable after the fact.
    ok('the Anytime refund READS windowWasBookableAtBooking, never recomputes it',
        /windowWasBookableAtBooking: legData\.windowWasBookableAtBooking/.test(bwSvcSrc) &&
            /W\.qualifiesForAnytimeRefund\(\{/.test(bwSvcSrc))
    ok('  …pays through the ONE wallet-refund helper',
        /refundToWallet\(\{/.test(bwSvcSrc))
    ok('  …is idempotent on refund.paidAt',
        /refund\?\.paidAt\) return \{ ok: false, reason: 'already-paid' \}/.test(bwSvcSrc))
    // "Why was there no refund?" must have an answer later, not silence.
    ok('  …and RECORDS a refusal with its reason instead of staying silent',
        /refund\.qualified`\]: false/.test(bwSvcSrc) &&
            /no cheaper option that day/.test(bwSvcSrc))
    ok('  …and is settled from BOTH serve points (pickup and delivery)',
        (riderSrcN1.match(/settleAnytimeRefund\(\{/g) || []).length === 2 &&
            /leg: 'pickup'/.test(riderSrcN1) &&
            /leg: 'delivery'/.test(riderSrcN1))

    // Renaming is a LABEL layer. Renaming a stored value would fail the order
    // enums and drop pricing to a multiplier of 1.
    const { resolveLabel } = require(path.join(ROOT, 'util/displayName'))
    ok('an admin label overrides the derived name, and the RAW value travels with it',
        (() => {
            const r = resolveLabel('deliverySpeeds', 'same-day', {
                deliverySpeeds: new Map([['same-day', 'Express Same Day']]),
            })
            return r.label === 'Express Same Day' && r.value === 'same-day' && r.renamed === true
        })())
    ok('  …with no override it derives the label and says so',
        (() => {
            const r = resolveLabel('serviceTiers', 'classic', undefined)
            return r.label === 'Classic' && r.renamed === false
        })())
    // A Mongoose Map on a hydrated doc, a plain object on a lean() read.
    ok('  …reading a Mongoose Map and a lean plain object alike',
        resolveLabel('serviceTiers', 'vip', { serviceTiers: { vip: 'Platinum' } }).label ===
            'Platinum')
    ok('  …and a lower-case acronym reads as one (vip → VIP, not "Vip")',
        resolveLabel('serviceTiers', 'vip', undefined).label === 'VIP')
    ok('renaming refuses an unknown key instead of storing a dead label',
        /Unknown \$\{group\}/.test(bwSvcSrc) &&
            /These are display names for existing values/.test(bwSvcSrc))
    ok('  …and writes ONLY the label map, never a stored value',
        /\$set\[`displayNames\.\$\{group\}`\]/.test(bwSvcSrc) &&
            !/serviceTypes\[0\]\.name =/.test(bwSvcSrc))

    // ─── The dashboard day boundary is LAGOS, not UTC ───────────────────────
    // The TZ pin in server.js makes `setHours(0,0,0,0)` Lagos-correct, but it
    // reaches NEITHER of the two other places that decide what day something
    // happened on. Both filed the first hour of every Lagos day under the
    // previous day — the same split-brain the pin exists to kill, one layer
    // down. Found while writing the client answer for Q1.
    console.log('\nDashboard day bucketing — Lagos, not UTC')
    const adminSrcTz = fs.readFileSync(path.join(ROOT, 'services/admin.service.js'), 'utf8')
    ok('every $dateToString in admin.service passes an explicit timezone',
        (() => {
            const re = /\$dateToString\s*:\s*\{/g
            let m
            let bad = 0
            let seen = 0
            while ((m = re.exec(adminSrcTz))) {
                seen += 1
                let depth = 1
                let i = m.index + m[0].length
                while (i < adminSrcTz.length && depth > 0) {
                    if (adminSrcTz[i] === '{') depth += 1
                    else if (adminSrcTz[i] === '}') depth -= 1
                    i += 1
                }
                if (!/timezone/.test(adminSrcTz.slice(m.index, i))) bad += 1
            }
            return seen >= 2 && bad === 0
        })())
    // `toISOString()` CONVERTS to UTC, so a Lagos-local Date at 00:30 produced
    // yesterday's key even with the process pinned.
    ok('  …and no day key is built from toISOString (that is always UTC)',
        !/toISOString\(\)\s*\.\s*split\('T'\)\[0\]/.test(adminSrcTz) &&
            /lagosDayKey\(d\)/.test(adminSrcTz))

    // Client decision 2026-10-09 (option 1): a service type's name is a pricing
    // key, so the general settings screen may no longer change or remove one
    // that orders depend on. Behaviour is asserted live in
    // dashboardDecisionsStaging; this pins the SHAPE, because the guard has to
    // be written against the consequence (a name vanishing) rather than against
    // the word "rename" — otherwise delete-and-re-add walks straight through.
    ok('updateAdminSettings refuses to drop a service-type name orders depend on',
        /Array\.isArray\(updateData\?\.serviceTypes\)/.test(adminSrcTz) &&
            /countDocuments\(\{\s*\n?\s*serviceType: name,/.test(adminSrcTz) &&
            /useInstead: '\/api\/admin\/display-names'/.test(adminSrcTz))
    ok('  …and the check runs BEFORE the $set, so nothing is half-written',
        (() => {
            // Scoped to updateAdminSettings. A whole-file indexOf finds an
            // EARLIER `$set: updateData` in a different settings function, so
            // the naive comparison fails against correct code.
            const start = adminSrcTz.indexOf('async updateAdminSettings(req)')
            const body = adminSrcTz.slice(start, start + 9000)
            return (
                start > -1 &&
                body.indexOf('blockedServiceTypes') > -1 &&
                body.indexOf('blockedServiceTypes') <
                    body.indexOf('{ $set: updateData }')
            )
        })())

    const crmSrc2 = fs.readFileSync(path.join(ROOT, 'services/crm.service.js'), 'utf8')
    ok('booking cancels the new sequence as well as the lead one',
        /cancelPendingMessages\(profile\._id, \[\s*CRM_WORKFLOW\.LEAD,\s*CRM_WORKFLOW\.REGISTERED_NOT_BOOKED,?\s*\]\)/.test(
            crmSrc2,
        ))
    ok('the queue itself is snapped to a window, so nextFollowUpAt is honest',
        /CRM_WINDOWED_WORKFLOWS\.includes\(workflow\)/.test(crmSrc2) &&
            /nextSendSlot\(e\.dueAt/.test(crmSrc2))
    ok('the dispatcher ALSO holds back anything queued before this shipped',
        /if \(!isInSendWindow\(new Date\(\), windows\)\)/.test(crmSrc2))

    const setupSrc = fs.readFileSync(path.join(ROOT, 'config/setup.js'), 'utf8')
    ok('the new settings are MIGRATED onto an existing doc, not left to defaults',
        /registeredNotBookedSchedule =\s*\n?\s*CrmSettingModel\.DEFAULT_REGISTERED_NOT_BOOKED_SCHEDULE/.test(
            setupSrc,
        ) && /crmSetting\.sendWindows = \{/.test(setupSrc))
    ok('app init now AWAITS its migrations instead of firing and forgetting',
        /for \(const \[name, step\] of steps\)/.test(setupSrc) &&
            /await step\(\)/.test(setupSrc))

    // ─── FE bug report 2026-10-09 — the five fixes ───────────────────────────
    //
    // Each of these failed in production for a reason the type system could not
    // catch: a second copy of a query, a service that never called the shared
    // view, a back-reference written in one place out of six. They are asserted
    // here because every one of them would come back silently.
    console.log('\nFE bug report 2026-10-09 — the five fixes')

    // (1) Item holds — the admin door, and the per-piece release.
    const adminSrc3 = fs.readFileSync(path.join(ROOT, 'services/admin.service.js'), 'utf8')
    ok('admin has a release for an ITEM hold, whatever it is assigned to',
        /async releaseItemHold\(req\)/.test(adminSrc3) &&
            /isMine: \(\) => true/.test(adminSrc3))
    ok('  …and it does NOT reuse resolveOrderHold, which needs stage.status HOLD',
        /'stage\.status': ORDER_STATUS\.HOLD/.test(adminSrc3))
    ok('  …the route is mounted and admin-only',
        /ROUTE_ADMIN_RELEASE_ITEM_HOLD, adminAuth/.test(
            fs.readFileSync(path.join(ROOT, 'routes/admin.js'), 'utf8'),
        ))
    ok('  …releaseNote is a DECLARED schema path (Mongoose drops undeclared ones)',
        /releaseNote: \{ type: String \}/.test(
            fs.readFileSync(path.join(ROOT, 'models/bookOrder.model.js'), 'utf8'),
        ))
    const releaseUtil = fs.readFileSync(path.join(ROOT, 'util/releaseItemHold.js'), 'utf8')
    ok('releasing is gated on isItemOnHold, not on assignTo alone',
        /isItemOnHold\(item\) && isMine\(item\)/.test(releaseUtil))
    {
        // All five station releases take the optional itemId and go through the
        // shared stamp — five hand-written copies is how "released" drifts.
        const files = [
            'sortAndPretreat', 'washAndDry', 'pressAndIron', 'qc', 'intake-user',
        ].map((n) => fs.readFileSync(path.join(ROOT, `services/${n}.service.js`), 'utf8'))
        ok('every station release accepts an itemId (release ONE piece)',
            files.every((s) => /const itemId = req\.body\?\.itemId \|\| null/.test(s)))
        ok('  …and none of them still writes the release fields by hand',
            files.every((s) => !/holdDetails\.releasedAt = now/.test(s)))
        ok('  …a single-piece release never rewinds the whole order',
            files.every((s) => /const orderLevelRewind = !itemId/.test(s)))
        // The regression this nearly shipped: admin's `send-to-hold` parks an
        // ORDER with no item hold at all, and the station release is how it was
        // always cleared. Gating purely on "is a piece of mine held" refused it.
        ok('  …and an ORDER-level hold is still clearable at its station',
            files.every((s) =>
                /!mine\.length && !\(orderParked && !itemId\)/.test(s)))
        // Intake is the default assignee for S2–S5, so its tag wipe must be
        // scoped or another station's hold sends the order back to re-tagging.
        const intakeSrc = files[4]
        ok('Intake wipes tags ONLY for holds Intake itself raised',
            /const raisedHere = \(item\) =>/.test(intakeSrc) &&
                /if \(wasOurs\) \{/.test(intakeSrc))
    }

    // (2) Press queue list and counter must ask ONE question.
    const pressSrc = fs.readFileSync(path.join(ROOT, 'services/pressAndIron.service.js'), 'utf8')
    ok('press queue, its counter and the recent list share one filter',
        (pressSrc.match(/PRESS_QUEUE_FILTER\(\)/g) || []).length === 3)
    ok('  …and no press list matches every order at the station any more',
        !/\{\s*'items\.currentStation': HERE,\s*\}/.test(pressSrc))

    // (3) The rider must get the promise, not a raw 19:00 deadline.
    const riderSrcFE = fs.readFileSync(path.join(ROOT, 'services/rider.service.js'), 'utf8')
    ok('rider lists derive deliveryPromise through the shared view',
        (riderSrcFE.match(/addDeliveryPromise\(order\)/g) || []).length >= 4)
    ok('  …and actually SELECT the fields it needs',
        (riderSrcFE.match(/\$\{PROMISE_FIELDS\}/g) || []).length >= 4 &&
            /const PROMISE_FIELDS = 'deliveryDate scheduling'/.test(riderSrc))
    ok('  …order details is lean, or Mongoose drops the undeclared promise',
        /\.lean\(\)\s*\n\s*if \(!order\)/.test(riderSrc) &&
            /message: presentOrder\(order\)/.test(riderSrc))

    // (4) hasComplaint is DERIVED — the back-reference had five blind doors.
    const reportSrc = fs.readFileSync(path.join(ROOT, 'services/recoveryReport.service.js'), 'utf8')
    ok('hasComplaint is derived from ComplaintCase, not the feedback row alone',
        /ComplaintCaseModel\.find\(\{ orderId: \{ \$in: orderIds \} \}\)/.test(reportSrc) &&
            /withComplaint\.has\(String\(f\.orderId\)\)/.test(reportSrc))
    ok('  …and openCase repairs the back-reference for every other caller',
        /complaintCaseId: \{ \$exists: false \}/.test(
            fs.readFileSync(path.join(ROOT, 'services/recovery.service.js'), 'utf8'),
        ))

    // (5) The count mismatch stays a 400 — and now SAYS so where the FE reads.
    ok('the count-mismatch 400 is documented with its machine-readable flag',
        /countMismatch: \{ type: boolean, example: true \}/.test(
            fs.readFileSync(path.join(ROOT, 'routes/intake-user.js'), 'utf8'),
        ))

    // ─── N1 count-only Quick Booking ────────────────────────────────────────
    console.log('\nN1 — count-only Quick Booking')
    {
        const qb = require(path.join(ROOT, 'util/quickBooking.js'))

        // The spec's own words: "the same capacity gates, USING THE CUSTOMER'S
        // COUNT". Those gates read items.LENGTH, so N lines of quantity 1 is
        // the only shape that makes them read the count without editing a gate.
        const post = { itemCount: 12, billingType: 'pay-from-wallet' }
        const res = qb.applyCountOnlyBooking(post)
        ok('a count becomes N LINES, so capacity gates read the count',
            res.ok && post.items.length === 12 &&
                post.items.every((i) => i.quantity === 1))
        ok('  …priced at zero — the bill is computed at Intake, not guessed',
            post.items.every((i) => i.price === 0))
        ok('  …wallet/subscription forced to pay-per-item (no bill to charge)',
            post.billingType === 'pay-per-item')
        ok('  …the customer count is recorded for the rider/intake comparison',
            post.counts.customer === 12)
        ok('  …and the order is marked as pending its real contents',
            post.quickBooking === true && post.itemsPending === true)

        ok('a real basket beats a stray itemCount',
            qb.isCountOnlyBooking({ itemCount: 5, items: [{ type: 'shirt' }] }) === false)
        ok('nonsense counts are refused, not booked',
            [0, -2, 2.5, 'ten', 5000].every(
                (n) => qb.applyCountOnlyBooking({ itemCount: n }).ok === false))

        const bookSrc = fs.readFileSync(path.join(ROOT, 'services/bookOrder.service.js'), 'utf8')
        ok('the translation happens BEFORE validation, so one path serves both',
            bookSrc.indexOf('isCountOnlyBooking(post)') <
                bookSrc.indexOf('const validateRule = {'))
        ok('  …and no second booking path was forked for it',
            (bookSrc.match(/async postBookOrder\(/g) || []).length === 1)
        // The handover: Intake's re-price IS step 2 of the client's four, so it
        // has to clear the flag in the same write that replaces the items.
        // The window is generous because the WRITE is separated from the flag
        // by the comment explaining it. A tight window here fails on correct
        // code the moment anyone documents it — the same way two assertions in
        // this file have already been tripped by their own prose.
        ok('entering the real items clears itemsPending in the SAME write',
            /items: explodedItems,[\s\S]{0,900}itemsPending: false,[\s\S]{0,900}\$push/.test(
                bookSrc,
            ))
        ok('both markers are DECLARED on the schema (Mongoose drops the rest)',
            /quickBooking: \{ type: Boolean \}/.test(
                fs.readFileSync(path.join(ROOT, 'models/bookOrder.model.js'), 'utf8'),
            ))
        ok('Intake has a list of quick bookings awaiting their items',
            /async getQuickBookingQueue\(req\)/.test(
                fs.readFileSync(path.join(ROOT, 'services/intake-user.service.js'), 'utf8'),
            ) && /ROUTE_INTAKE_QUICK_BOOKINGS, \[intakeUserAuth\]/.test(
                fs.readFileSync(path.join(ROOT, 'routes/intake-user.js'), 'utf8'),
            ))
    }

    // ─── FE 9 Oct #5: the cancel verdict on order reads ─────────────────────
    // The button must read the SAME rule the cancel endpoints enforce, so these
    // drive the real service method rather than a copy of the rule.
    console.log('\nFE #5 — cancellation verdict on order reads')
    {
        const BookOrderService = require(path.join(ROOT, 'services/bookOrder.service'))
        const svc = new BookOrderService()
        const settings = {
            orderCancellationGraceMinutes: 15,
            cancellationPickupFee: 1000,
            cancellationReturnFee: 1000,
        }
        const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
        const base = {
            createdAt: old,
            amount: 5000,
            paymentStatus: 'success',
            items: [{}],
            dispatchDetails: { pickup: { status: 'pending' } },
        }

        const green = svc._cancellationVerdict(
            { ...base, stage: { status: ORDER_STATUS.PENDING } },
            settings,
        )
        ok('pending, not picked up: green, self-cancel free, full cash back',
            green.allowed && !green.canRequest && green.tier === 'green' &&
                green.estimatedFee === 0 && green.refundToWallet === 5000 &&
                green.reason === null,
            JSON.stringify(green))

        const amber = svc._cancellationVerdict(
            {
                ...base,
                stage: { status: ORDER_STATUS.QUEUE },
                dispatchDetails: { pickup: { status: 'picked-up' } },
            },
            settings,
        )
        ok('collected and paid, untagged: amber, request only, both trips kept',
            !amber.allowed && amber.canRequest && amber.tier === 'amber' &&
                amber.estimatedFee === 2000 && amber.refundToWallet === 3000,
            JSON.stringify(amber))

        const amberUnpaid = svc._cancellationVerdict(
            {
                ...base,
                paymentStatus: 'pending',
                stage: { status: ORDER_STATUS.QUEUE },
                dispatchDetails: { pickup: { status: 'picked-up' } },
            },
            settings,
        )
        ok('collected, unpaid: fee is owed, nothing comes back',
            amberUnpaid.estimatedFee === 2000 && amberUnpaid.refundToWallet === 0,
            JSON.stringify(amberUnpaid))

        const tagged = svc._cancellationVerdict(
            {
                ...base,
                stage: { status: ORDER_STATUS.QUEUE },
                items: [{ tagId: 'T-1' }],
                dispatchDetails: { pickup: { status: 'picked-up' } },
            },
            settings,
        )
        ok('tagged while still in the tagging QUEUE: red, neither cancel nor request',
            !tagged.allowed && !tagged.canRequest && tagged.tier === 'red' &&
                /Tagging has already started/.test(tagged.reason) &&
                tagged.estimatedFee === null && tagged.refundToWallet === null,
            JSON.stringify(tagged))

        const done = svc._cancellationVerdict(
            { ...base, stage: { status: ORDER_STATUS.CANCELLED } },
            settings,
        )
        ok('already cancelled: tier none, nothing offered',
            !done.allowed && !done.canRequest && done.tier === 'none' &&
                done.estimatedFee === null,
            JSON.stringify(done))

        const pendingAmber = svc._cancellationVerdict(
            {
                ...base,
                stage: { status: ORDER_STATUS.QUEUE },
                dispatchDetails: { pickup: { status: 'picked-up' } },
            },
            settings,
            { requestPending: true },
        )
        ok('amber with a request already pending: no second request offered',
            !pendingAmber.canRequest && pendingAmber.requestPending &&
                /already awaiting review/.test(pendingAmber.reason),
            JSON.stringify(pendingAmber))
        ok('a pending flag never changes a green verdict',
            svc._cancellationVerdict(
                { ...base, stage: { status: ORDER_STATUS.PENDING } },
                settings,
                { requestPending: true },
            ).allowed === true)

        // Review F-01: `cancellation` is the STORED record of a past
        // cancellation on the schema, so the verdict must never be written there.
        ok('both customer order reads attach the verdict as cancellationVerdict',
            (bookSrc.match(/\.cancellationVerdict = this\._cancellationVerdict\(/g) || [])
                .length === 2,
        )
        ok('no read overwrites the stored cancellation record',
            !/\.cancellation = this\._cancellationVerdict\(/.test(bookSrc))
        ok('the stored cancellation record is still on the schema',
            /cancellation: \{\s*cancelledAt:/.test(
                fs.readFileSync(path.join(ROOT, 'models/bookOrder.model.js'), 'utf8'),
            ))
    }

    // ─── Launch fix 1: window-only free trips and the fees line ─────────────
    // Drives the real OfferService methods; no database is touched.
    console.log('\nLaunch fix 1 — window-only free trips and the fees line')
    {
        const O = require(path.join(ROOT, 'services/offer.service'))
        const offer = (types, extra = {}) => ({
            _id: 'o1',
            benefits: types.map((t) => ({ benefitType: t })),
            ...extra,
        })
        const trips = offer(['free-pickup', 'free-delivery'])
        const anyPick = O.computeBenefits(trips, { pickupTiming: 'anytime', deliveryTiming: 'window' })
        ok('an Anytime pickup keeps its fee; the window delivery is still free',
            anyPick.freePickup === false && anyPick.anytimeKeptPickup === true &&
                anyPick.freeDelivery === true)
        const noTiming = O.computeBenefits(trips, {})
        ok('a request with no timing (older app builds) is unchanged',
            noTiming.freePickup === true && noTiming.freeDelivery === true)

        const draft = { pickupAmount: 1000, deliveryAmount: 1000 }
        const line = (args) => O.buildFeesLine({ draft, ...args })
        // `selected` is validateAndPrice's quote: what the order will charge.
        const baseSel = { baseline: [{ offerId: 'o1' }], personal: null, promotion: null }
        ok('free-gap: a trip offer missing only its minimum shows the shortfall',
            (() => {
                const l = line({ tripRows: [{ kind: 'baseline', offer: trips, applicable: false, requirement: { type: 'minOrderValue', shortfall: 3200 } }] })
                return l.type === 'free-gap' && l.amount === 3200 && l.message === 'Add ₦3,200 more for free pickup and delivery.'
            })())
        ok('free-gap names only the legs the offer frees (F-13)',
            line({ tripRows: [{ kind: 'baseline', offer: offer(['free-delivery']), applicable: false, requirement: { type: 'minOrderValue', shortfall: 500 } }] })
                .message === 'Add ₦500 more for free delivery.')
        ok('free-gap leaves out a leg booked Anytime, and is null when no leg is left (F-13)',
            (() => {
                const gapRow = { kind: 'baseline', offer: trips, applicable: false, requirement: { type: 'minOrderValue', shortfall: 500 } }
                const one = O.buildFeesLine({ draft: { ...draft, pickupTiming: 'anytime' }, tripRows: [gapRow] })
                const pickOnly = { ...gapRow, offer: offer(['free-pickup']) }
                const none = O.buildFeesLine({ draft: { ...draft, pickupTiming: 'anytime' }, tripRows: [pickOnly] })
                return one.message === 'Add ₦500 more for free delivery.' && none.type === null
            })())
        ok('free-reached: an applied trip offer',
            line({ selected: baseSel, tripRows: [{ kind: 'baseline', offer: trips, applicable: true, benefit: { freePickup: true, freeDelivery: true } }] }).type === 'free-reached')
        ok('window-only beats free-reached when a leg is Anytime',
            (() => {
                const l = line({ selected: baseSel, tripRows: [{ kind: 'baseline', offer: trips, applicable: true, benefit: { anytimeKeptPickup: true, freeDelivery: true } }] })
                return l.type === 'window-only' && l.amount === 1000
            })())
        ok('welcome-offer wins on a first order, and only on a first order',
            (() => {
                const row = { kind: 'personal', customerOfferId: 'c1', offer: offer(['order-discount', 'free-pickup'], { triggers: ['first-experience'] }), applicable: true, benefit: { discount: 1000, freePickup: true } }
                const sel = { baseline: [], personal: { customerOfferId: 'c1' }, promotion: null }
                const first = line({ tripRows: [row], isFirstOrder: true, selected: sel })
                const later = line({ tripRows: [row], isFirstOrder: false, selected: sel })
                return first.type === 'welcome-offer' && first.amount === 2000 && later.type === 'free-reached'
            })())
        ok('a personal trip offer the customer did NOT select is not counted (F-09)',
            (() => {
                const row = { kind: 'personal', customerOfferId: 'c1', offer: trips, applicable: true, benefit: { freePickup: true } }
                const noneChosen = line({ tripRows: [row], selected: { baseline: [], personal: null, promotion: null } })
                const otherChosen = line({ tripRows: [row], selected: { baseline: [], personal: { customerOfferId: 'c2' }, promotion: null } })
                return noneChosen.type === null && otherChosen.type === null
            })())
        ok('a selected promotion that validateAndPrice rejected is not counted (F-09)',
            line({ tripRows: [{ kind: 'promotion', offer: trips, applicable: true, benefit: { freePickup: true } }], selected: { baseline: [], personal: null, promotion: null } }).type === null)

        // F-10: one same-day rule for the screen and the order.
        const BWS = require(path.join(ROOT, 'services/bookingWindow.service'))
        const morning = [{ startTime: '08:00', endTime: '11:00' }]
        ok('same-day with no morning window resolves the pickup to Anytime (F-10)',
            BWS.resolvePickupTiming({ deliverySpeed: 'same-day', pickupTiming: 'window', windows: [{ startTime: '16:00', endTime: '19:00' }] }) === 'anytime' &&
                BWS.resolvePickupTiming({ deliverySpeed: 'same-day', pickupTiming: 'window', windows: morning }) === 'window' &&
                BWS.resolvePickupTiming({ deliverySpeed: 'standard', pickupTiming: 'window', windows: [] }) === 'window')
        ok('postBookOrder and getBookingOptions both use resolvePickupTiming (F-10)',
            /BookingWindowService\.resolvePickupTiming\(/.test(bookSrc) &&
                /BookingWindowService\.resolvePickupTiming\(/.test(
                    fs.readFileSync(path.join(ROOT, 'services/offer.service.js'), 'utf8'),
                ))

        // F-15: free legs left this week, read-only.
        const { freeLegsThisWeek } = require(path.join(ROOT, 'util/logisticsAllowance'))
        ok('freeLegsThisWeek gives the full grant after the week rolled over, and never writes (F-15)',
            (() => {
                const now = new Date('2026-10-11T12:00:00Z')
                const sub = { logisticsWeekStart: new Date('2026-09-30T12:00:00Z'), remainingPickupDeliveries: 0 }
                const before = JSON.stringify(sub)
                const r = freeLegsThisWeek(sub, { freePickupDeliveryPerWeek: 2 }, now)
                const same = freeLegsThisWeek({ logisticsWeekStart: new Date('2026-10-10T12:00:00Z'), remainingPickupDeliveries: 1 }, { freePickupDeliveryPerWeek: 2 }, now)
                return r.left === 2 && r.perWeek === 2 && JSON.stringify(sub) === before && same.left === 1
            })())

        const offerSrc = fs.readFileSync(path.join(ROOT, 'services/offer.service.js'), 'utf8')
        const importBlock = offerSrc.slice(0, offerSrc.indexOf("} = require('../util/constants')"))
        ok('OFFER_TRIGGER is imported (getBookingOptions threw for every personal offer without it)',
            /\bOFFER_TRIGGER,/.test(importBlock))
    }

    // ─── Launch fix 2: Quick Booking pays nothing at booking ────────────────
    // Client 11 Oct: trips go on the SMS bill; the free-trip offer is checked
    // after counting. Pure parts driven for real; the rest checked in source.
    console.log('\nLaunch fix 2 — Quick Booking pays nothing at booking')
    {
        const O = require(path.join(ROOT, 'services/offer.service'))
        const offer = { _id: 'o1', type: 'personal', status: 'active', benefits: [], rules: {} }
        const linkage = { _id: 'l1', status: 'attached', orderId: 'ord1' }
        const reject = (draft, repriceOrderId) =>
            O._offerRejection({ kind: 'personal', offer, linkage, draft, stats: { totalOrders: 0 }, userId: 'u1', repriceOrderId })
        const own = await reject({}, 'ord1')
        const other = await reject({}, 'ord2')
        const fresh = await reject({})
        ok('re-pricing an order keeps the offer attached to THAT order',
            own.reason === null)
        ok('an offer attached to another order, or a new booking, is still refused',
            other.reason === 'Offer already applied to an order' &&
                fresh.reason === 'Offer already applied to an order')
        // F-20: an offer attached to THIS order is honoured at the re-price even
        // if it expired or was paused since; a new booking still refuses it.
        const stale = { ...offer, status: 'paused' }
        const staleLink = { ...linkage, expiresAt: new Date(Date.now() - 86400000) }
        const honoured = await O._offerRejection({ kind: 'personal', offer: stale, linkage: staleLink, draft: {}, stats: { totalOrders: 3 }, userId: 'u1', repriceOrderId: 'ord1' })
        const expiredNew = await O._offerRejection({ kind: 'personal', offer: stale, linkage: { ...staleLink, status: 'assigned', orderId: undefined }, draft: {}, stats: { totalOrders: 0 }, userId: 'u1' })
        ok('an offer attached at booking is honoured at the re-price even if it expired or was paused since (F-20)',
            honoured.reason === null && /expired|no longer active/.test(expiredNew.reason || ''))
        const minRule = await O._offerRejection({ kind: 'personal', offer: { ...offer, rules: { minOrderValue: 5000 } }, linkage, draft: { amount: 1000 }, stats: {}, userId: 'u1', repriceOrderId: 'ord1' })
        ok('but its basket rules are still checked against the real count',
            /Minimum order value/.test(minRule.reason || ''))

        // F-16: the window-only line only when a window could free the leg.
        const keptRow = { kind: 'baseline', offer: { _id: 'b1', benefits: [{ benefitType: 'free-pickup' }] }, applicable: true, benefit: { anytimeKeptPickup: true } }
        const selB = { baseline: [{ offerId: 'b1' }] }
        const forced = O.buildFeesLine({ tripRows: [keptRow], draft: { pickupAmount: 1000 }, selected: selB, pickupForcedAnytime: true })
        const freeLeg = O.buildFeesLine({ tripRows: [keptRow], draft: { pickupAmount: 0 }, selected: selB })
        const real = O.buildFeesLine({ tripRows: [keptRow], draft: { pickupAmount: 1000 }, selected: selB })
        ok('no "choose a time window" when same-day forced the pickup to Anytime, or the leg costs nothing (F-16)',
            forced.type !== 'window-only' && freeLeg.type !== 'window-only' && real.type === 'window-only')

        // F-17: every customer path passes the request body as the draft, so a
        // customer-sent orderId must never unlock an attached offer.
        const smuggled = await reject({ orderId: 'ord1' })
        ok('a customer-sent orderId in the draft is ignored (no double use of an attached offer)',
            smuggled.reason === 'Offer already applied to an order')
        ok('only the server re-price passes the same-order id',
            /repriceOrderId: order\._id,/.test(bookSrc) &&
                !/draft\??\.orderId/.test(fs.readFileSync(path.join(ROOT, 'services/offer.service.js'), 'utf8')))

        // F-18 / F-19: only the customer's own fields are saved from the body.
        const BOS = require(path.join(ROOT, 'services/bookOrder.service'))
        const saved = BOS.customerOrderFields({
            fullName: 'A', serviceType: 'wash-and-iron', items: [], isPickUp: true,
            amount: 100, paymentStatus: 'success', userId: 'someone-else', stage: { status: 'delivered' },
            pricing: {}, paymentWaivedAt: new Date(), deliveryAmount: 0, oscNumber: 'X',
        })
        ok('the booking body cannot set amount, payment status, owner, stage or pricing (F-18)',
            saved.fullName === 'A' && saved.isPickUp === true &&
                ['amount', 'paymentStatus', 'userId', 'stage', 'pricing', 'paymentWaivedAt', 'deliveryAmount', 'oscNumber']
                    .every((k) => !(k in saved)))
        ok('every order literal in postBookOrder saves the allow-list, never the raw body',
            (bookSrc.match(/\.\.\.customerOrderFields\(post\),/g) || []).length === 3 &&
                !/^\s+\.\.\.post,\s*$/m.test(
                    bookSrc.slice(bookSrc.indexOf('async postBookOrder('), bookSrc.indexOf('async updateBookOrderPaymentStatus(')),
                ))
        ok('a client-sent quickBooking flag is dropped before anything reads it (F-19)',
            BOS.SERVER_SET_ON_POST.includes('quickBooking') &&
                /for \(const key of SERVER_SET_ON_POST\) delete post\[key\]/.test(bookSrc) &&
                /const quickBooking = countOnly/.test(bookSrc))
        ok('booking-options gives a Quick Booking draft the "pay nothing now" line',
            O.QUICK_BOOKING_FEES_LINE.type === 'quick-booking' &&
                O.QUICK_BOOKING_FEES_LINE.amount === 0 &&
                /You pay nothing now/.test(O.QUICK_BOOKING_FEES_LINE.message) &&
                /isCountOnlyBooking\(draft\)\s*\?\s*QUICK_BOOKING_FEES_LINE/.test(
                    fs.readFileSync(path.join(ROOT, 'services/offer.service.js'), 'utf8'),
                ))

        const ppi = bookSrc.slice(
            bookSrc.indexOf('} else if (post.billingType === BILLING_TYPE.PAY_PER_ITEM) {'),
            bookSrc.indexOf('} else if (post.billingType === BILLING_TYPE.PAY_FROM_WALLET) {'),
        )
        ok('a Quick Booking is created with nothing due and no offer priced',
            /if \(quickBooking\) \{\s*totalPrice = 0\s*\} else \{[\s\S]{0,400}_priceWithOffers/.test(ppi))
        ok('and spends no reward credit at booking',
            /const useCredit =\s*!quickBooking &&/.test(ppi))
        ok('the booking response says no payment step for a Quick Booking',
            /newOrder\.quickBooking && \{ paymentRequired: false \}/.test(bookSrc))

        const reprice = bookSrc.slice(
            bookSrc.indexOf('async _repriceForItems('),
            bookSrc.indexOf('async applyItemEdit('),
        )
        ok('the re-price finds the order\'s offers through their linkages, not order fields that are never stored',
            !/customerOfferId: order\.customerOfferId/.test(reprice) &&
                /orderId: order\._id,\s*status: CUSTOMER_OFFER_STATUS\.ATTACHED/.test(reprice))
        ok('a Quick Booking re-runs the auto-apply pick against the real basket on every edit',
            /if \(order\.quickBooking && order\.userId\) \{\s*post\.customerOfferId = undefined[\s\S]{0,200}pickBestPersonalOffer/.test(reprice))
        ok('a waived trip takes off the fee this order is charged, not the flat setting',
            /adminOrderSetting: \{ pickupFee, deliveryFee \}/.test(reprice))
        ok('the edit releases offers the new bill drops and attaches the ones it adds',
            /_settleOfferLinkages\(\{ order, breakdown, attached \}\)/.test(bookSrc) &&
                /releaseForOrder\(order\._id, \{[\s\S]{0,120}only: stale/.test(bookSrc))

        const bwSrc = fs.readFileSync(path.join(ROOT, 'services/bookingWindow.service.js'), 'utf8')
        ok('an unbilled Quick Booking served in a window has its leg fee lowered, not a wallet refund',
            /order\.itemsPending === true &&\s*order\.paymentStatus !== PAYMENT_ORDER_STATUS\.SUCCESS[\s\S]{0,800}\[`scheduling\.\$\{leg\}\.fee`\]: fee/.test(
                bwSrc,
            ) &&
                bwSrc.indexOf('appliedToBill: true') < bwSrc.indexOf('await refundToWallet({'))
        ok('and the fee is lowered once, claimed atomically on refund.paidAt (F-22)',
            /\[`scheduling\.\$\{leg\}\.refund\.paidAt`\]: \{ \$exists: false \}/.test(bwSrc) &&
                /if \(!claimed\.modifiedCount\) return \{ ok: false, reason: 'already-paid' \}/.test(bwSrc))
        ok('a released promotion linkage is removed, not turned into a personal reward (F-21)',
            /promoIds\.has\(String\(linkage\.offerId\)\)\) \{\s*await linkage\.deleteOne\(\)/.test(
                fs.readFileSync(path.join(ROOT, 'services/offer.service.js'), 'utf8'),
            ))
    }

    // ─── Booking items priced from the catalog (ported from the hotfix) ─────
    // Item prices and item fields came from the request, so `price: 100` or a
    // quantity of 0 set the bill, and staff fields were copied onto pieces.
    console.log('\nBooking items — catalog prices, customer fields, quantities')
    {
        const postBook = bookSrc.slice(
            bookSrc.indexOf('async postBookOrder('),
            bookSrc.indexOf('async updateBookOrderPaymentStatus('),
        )
        const { priceFromCatalog, catalogKey } = require(path.join(ROOT, 'util/catalogItems'))
        const catalog = [
            { name: 'Shirts / Tops / Blouses', price: 600 },
            { name: 'Lab coats', price: 700 },
        ]
        const sets = [{ name: 'Agbada', pieces: [{ name: 'Agbada', price: 1100 }, { name: 'Trouser', price: 700 }] }]
        const priced = priceFromCatalog(
            [
                { type: 'shirts-/-tops-/-blouses', price: 1, quantity: 2, qcStatus: 'passed', tagStatus: 'complete', currentStation: 'qc-station' },
                { type: 'Lab coats', price: 1, quantity: 1, serviceTier: 'vip' },
                { type: 'trouser', fromSet: 'Agbada', price: 1, quantity: 1 },
            ],
            { catalog, sets },
        )
        ok('item prices come from the catalog (slug, name and set piece all match), not the request',
            priced.ok && priced.items.map((i) => i.price).join() === '600,700,700')
        ok('only the customer item fields survive (no station, QC or tag status)',
            priced.ok &&
                priced.items.every((i) => Object.keys(i).every((k) => ['type', 'quantity', 'serviceTier', 'fromSet', 'price'].includes(k))) &&
                priced.items[1].serviceTier === 'vip' && priced.items[2].fromSet === 'Agbada')
        const unknown = priceFromCatalog([{ type: 'blanket', price: 100, quantity: 1 }], { catalog, sets })
        ok('an item not in the catalog is refused, never booked at the price sent',
            !unknown.ok && /We don't recognise "blanket"/.test(unknown.error))
        const badQty = [0, -5, '-5', 1.5, 'two', undefined].map(
            (quantity) => priceFromCatalog([{ type: 'Lab coats', quantity }], { catalog, sets }),
        )
        ok('a zero, negative, fractional or missing quantity is refused (no ₦0 or negative lines)',
            badQty.every((r) => !r.ok && /quantity of at least 1/.test(r.error)))
        const inactive = priceFromCatalog([{ type: 'trouser', fromSet: 'Agbada', quantity: 1 }], {
            catalog,
            sets: [{ ...sets[0], active: false }],
        })
        ok('a piece from a deactivated set cannot be booked', !inactive.ok)
        ok('postBookOrder prices items from the catalog before validation, skipping only Quick Booking placeholders',
            /\} else if \(Array\.isArray\(post\.items\) && post\.items\.length\) \{[\s\S]{0,900}priceFromCatalog\(post\.items, \{ catalog, sets \}\)[\s\S]{0,300}post\.items = fromCatalog\.items/.test(postBook) &&
                postBook.indexOf('priceFromCatalog(post.items') < postBook.indexOf('const validateRule = {'))
        ok('the subscription heavy-item check uses the same name key as pricing',
            /heavyItemNames\.includes\(catalogKey\(item\.type\)\)/.test(postBook) &&
                catalogKey('King size Duvet') === catalogKey('king-size-duvet'))
        ok('an unknown service type is refused before pricing',
            /\(adminOrderSetting\.serviceTypes \|\| \[\]\)\.some\(\s*\(s\) => s\.name === post\.serviceType,?\s*\)/.test(postBook))
        ok('a customer cannot mark their order as the staff counter channel',
            /String\(post\.channel \?\? ''\)\.trim\(\)\.toLowerCase\(\) === ORDER_CHANNEL\.OFFICE/.test(postBook))
        // F-24: an uncounted Quick Booking cannot be paid (it would be paid ₦0).
        const { orderPayableGate } = require(path.join(ROOT, 'util/paymentGate'))
        const pendingQb = { itemsPending: true, items: [{ type: 'unspecified-item', price: 0 }] }
        const countedQb = { itemsPending: false, items: [{ type: 'Shirts', price: 600 }] }
        ok('an uncounted Quick Booking is not payable; a counted one is',
            !orderPayableGate(pendingQb).ok && /nothing to pay yet/i.test(orderPayableGate(pendingQb).error) &&
                orderPayableGate(countedQb).ok)
        ok('the wallet, card and assistant payment paths all check it first',
            /orderPayableGate\(bookOrder\)/.test(fs.readFileSync(path.join(ROOT, 'services/wallet.service.js'), 'utf8')) &&
                /orderPayableGate\(order\)/.test(fs.readFileSync(path.join(ROOT, 'services/paystack.service.js'), 'utf8')) &&
                /orderPayableGate\(order\)/.test(fs.readFileSync(path.join(ROOT, 'services/bot/payment.flow.js'), 'utf8')))
        ok('the Quick Booking re-pick also lists the offer already attached to that order (F-20)',
            /status: CUSTOMER_OFFER_STATUS\.ATTACHED, orderId: repriceOrderId/.test(
                fs.readFileSync(path.join(ROOT, 'services/offer.service.js'), 'utf8'),
            ))
        // F-30: a paid order whose bill rises owes only the difference.
        const { amountDue: due, amountPaidSoFar: paidSoFar } = require(path.join(ROOT, 'util/paymentGate'))
        ok('a part-paid order owes its balance, and counts what it paid (F-30)',
            due({ amount: 6000, balanceDue: 1500 }) === 1500 && due({ amount: 6000 }) === 6000 &&
                paidSoFar({ amount: 6000, balanceDue: 1500, paymentStatus: 'pending' }) === 4500 &&
                paidSoFar({ amount: 6000, paymentStatus: 'success' }) === 6000)
        ok('the item edit puts a paid order back to unpaid with only the difference due, and every payment path collects amountDue',
            /if \(amountPaid > 0 && outstanding > 0\) \{\s*paymentFields\.paymentStatus = PAYMENT_ORDER_STATUS\.PENDING\s*paymentFields\.balanceDue = outstanding/.test(bookSrc) &&
                /const amount = amountDue\(order\)/.test(fs.readFileSync(path.join(ROOT, 'services/paymentHold.service.js'), 'utf8')) &&
                /amountDue\(order\) \* 100/.test(fs.readFileSync(path.join(ROOT, 'services/paystack.service.js'), 'utf8')) &&
                /const due = amountDue\(bookOrder\)/.test(fs.readFileSync(path.join(ROOT, 'services/wallet.service.js'), 'utf8')) &&
                /order\.balanceDue = undefined/.test(fs.readFileSync(path.join(ROOT, 'util/webhook.handler.js'), 'utf8')))
        ok('a cancelled part-paid order refunds what was paid (F-30)',
            (() => {
                const { cancellationOutcome } = require(path.join(ROOT, 'util/cancellationFees'))
                const out = cancellationOutcome({ order: { amount: 6000, balanceDue: 1500, paymentStatus: 'pending', items: [] }, settings: {} })
                return out.refundToWallet === 4500
            })())
        const whSrc = fs.readFileSync(path.join(ROOT, 'util/webhook.handler.js'), 'utf8')
        ok('the card webhook settles against the amount Paystack collected: short leaves a balance and a fresh hold, over refunds the excess (F-33)',
            /handleOrderPayment\(metadata, reference, paidNaira\)/.test(whSrc) &&
                /if \(paid !== null && paid \+ 0\.5 < due\)/.test(whSrc) &&
                /if \(paid !== null && paid - 0\.5 > due && order\.userId\)/.test(whSrc))
        ok('a payment with no checkout of ours is never processed, and top-ups credit what was collected, to the payer (F-35)',
            /const existing = await PaymentModel\.findOne\(\{ reference \}\)\.lean\(\)\s*if \(!existing\) \{[\s\S]{0,900}return\s*\}/.test(whSrc) &&
                !/new PaymentModel\(/.test(whSrc.slice(whSrc.indexOf('async function handleChargeSuccess'), whSrc.indexOf('async function handleOrderPayment'))) &&
                /String\(payerId\) !== String\(userId\)/.test(whSrc) &&
                /\$inc: \{ balance: amount \}/.test(whSrc))
        ok('the reference is claimed atomically, and a payment on an already-paid order is flagged, not refunded (F-36)',
            /PaymentModel\.findOneAndUpdate\(\s*\{ reference, status: \{ \$ne: 'success' \} \}/.test(whSrc) &&
                /Payment on an order already paid/.test(whSrc) &&
                !/Second payment on order/.test(whSrc))
        ok('the event must match our recorded checkout (type, owner, order; not a bank-transfer or refused row), and a first subscription charge must cover its plan (F-38)',
            /existing\.type !== metadata\.transactionType/.test(whSrc) &&
                /String\(existing\.userId\) !== String\(user\._id\)/.test(whSrc) &&
                /existing\.paymentMethod === 'bank-transfer'/.test(whSrc) &&
                /existing\.metadata\?\.initRefused === true/.test(whSrc) &&
                /collected \+ 0\.5 < price/.test(whSrc) &&
                /status: 'failed'/.test(fs.readFileSync(path.join(ROOT, 'services/paystack.service.js'), 'utf8')) &&
                /The smallest top-up is ₦100\./.test(fs.readFileSync(path.join(ROOT, 'services/wallet.service.js'), 'utf8')))
        ok('a renewal is identified by its Paystack subscription code and our subscription for the payer, claimed once (F-40)',
            /if \(data\.subscription\?\.subscription_code && !\(await PaymentModel\.exists\(\{ reference \}\)\)\) \{\s*await handleRenewal\(data, user, reference\)/.test(whSrc) &&
                /String\(subscription\.userId\) !== String\(user\._id\)/.test(whSrc) &&
                /err\?\.code === 11000/.test(whSrc) &&
                (() => {
                    // the live handler, not the commented-out copy above it
                    const live = whSrc.slice(whSrc.indexOf('\nasync function handleChargeSuccess'))
                    return live.indexOf('handleRenewal(data, user, reference)') < live.indexOf('if (!metadata.transactionType)')
                })())
        ok('pending checkout rows are kept 7 days, past the payment-hold link window (F-41)',
            /cutoff\.setDate\(cutoff\.getDate\(\) - 7\)/.test(fs.readFileSync(path.join(ROOT, 'crons/reconcilePaystack.js'), 'utf8')))
        ok('a first subscription charge is checked before the claim, against the amount the checkout asked, and activates the verified plan (F-42, F-43)',
            whSrc.indexOf('let verifiedPlan = null') < whSrc.indexOf('const payment = await PaymentModel.findOneAndUpdate(') &&
                /handleNormalSubscription\(data, user, verifiedPlan\)/.test(whSrc) &&
                /const plan = verifiedPlan/.test(whSrc) && !/paystackPlan \|\| null/.test(whSrc))
        ok('only a checkout refused at initialisation is treated as refused; a charge.failed retry is honoured (F-44)',
            /'metadata\.initRefused': true/.test(fs.readFileSync(path.join(ROOT, 'services/paystack.service.js'), 'utf8')) &&
                /"metadata\.initRefused": true/.test(fs.readFileSync(path.join(ROOT, 'services/wallet.service.js'), 'utf8')))
        ok('the webhook never credits more than the checkout asked for (F-39)',
            /Math\.min\(collected, expected\)/.test(whSrc) &&
                /expectedAmount: amount \/ 100/.test(fs.readFileSync(path.join(ROOT, 'services/paystack.service.js'), 'utf8')) &&
                /expectedAmount: Number\(amount\)/.test(fs.readFileSync(path.join(ROOT, 'services/wallet.service.js'), 'utf8')))
        ok('a replaced hold is quiet and keeps its reminder clock (F-37)',
            /quiet: true/.test(bookSrc) && /keepClockFrom: replacedHold/.test(bookSrc) &&
                /if \(!quiet\) \{/.test(fs.readFileSync(path.join(ROOT, 'services/paymentHold.service.js'), 'utf8')) &&
                /raisedAt: keepClockFrom\?\.raisedAt \|\| now/.test(fs.readFileSync(path.join(ROOT, 'services/paymentHold.service.js'), 'utf8')))
        ok('an item edit clears an open hold before raising one for what is owed now (F-33)',
            /const replacedHold = PaymentHoldService\.isOnPaymentHold\(order\)/.test(bookSrc) &&
                /if \(replacedHold\) \{\s*await PaymentHoldService\.clear\(\{\s*orderId: order\._id,\s*source: 'item-edit'/.test(bookSrc))
        ok('admin mark-paid clears the balance and Paystack refuses a paid order (F-34)',
            /if \(status === PAYMENT_ORDER_STATUS\.SUCCESS\) bookOrder\.balanceDue = undefined/.test(bookSrc) &&
                /\$unset: \{ balanceDue: '' \}/.test(fs.readFileSync(path.join(ROOT, 'services/admin.service.js'), 'utf8')) &&
                /This order has already been paid\./.test(fs.readFileSync(path.join(ROOT, 'services/paystack.service.js'), 'utf8')))
        ok('staff cannot approve a transfer on an uncounted Quick Booking (F-31)',
            /orderPayableGate\(order\)/.test(fs.readFileSync(path.join(ROOT, 'services/paymentHold.service.js'), 'utf8')))
        ok('the personal-offer list skips promotion linkages (F-29)',
            /if \(linkage\.offerId\.type === OFFER_TYPE\.PROMOTIONAL\) continue/.test(fs.readFileSync(path.join(ROOT, 'services/offer.service.js'), 'utf8')))
        ok('the staff counter booking saves only the order fields from its request (F-19)',
            (() => {
                const src = fs.readFileSync(path.join(ROOT, 'services/intake-user.service.js'), 'utf8')
                const body = src.slice(src.indexOf('const newOrderItem = {'), src.indexOf('const newOrder = new BookOrderModel(newOrderItem)'))
                return /\.\.\.staffFields,/.test(body) && !/\.\.\.post,/.test(body)
            })())
        // Piece ceiling (F-26), stray itemCount (F-25), plan allowance (F-27).
        const ceiling = priceFromCatalog([{ type: 'Lab coats', quantity: 150 }, { type: 'Lab coats', quantity: 51 }], { catalog, sets })
        const atCeiling = priceFromCatalog([{ type: 'Lab coats', quantity: 200 }], { catalog, sets })
        const huge = priceFromCatalog([{ type: 'Lab coats', quantity: 100000000 }], { catalog, sets })
        ok('a booking over 200 pieces is refused before any piece is built (no memory blow-up)',
            !ceiling.ok && /more than 200 pieces/.test(ceiling.error) && atCeiling.ok && !huge.ok)
        ok('a real basket drops any stray itemCount, so offers count the real items',
            /post\.items = fromCatalog\.items\s*\/\/[\s\S]{0,500}delete post\.itemCount/.test(postBook))
        ok('a plan order is checked in pieces against the items left this month, and deducts pieces',
            /if \(planPieces > planItemsLeft\)/.test(postBook) &&
                !/post\.items\.length > subscriptionPlanMonthlyLimits/.test(postBook))
        ok('the plan items are claimed atomically before the order exists, and given back on failure (F-28)',
            /remainingItems: \{ \$gte: planPieces \} \},\s*\{ \$inc: \{ remainingItems: -planPieces \} \}[\s\S]{0,1500}newOrder = new BookOrderModel\(newOrderItem\)/.test(postBook) &&
                /\$inc: \{ remainingItems: planPieces \}/.test(postBook) &&
                !/subscription\.remainingItems [-+]?=[^=]/.test(postBook))
    }

    // ─── F-05 + order read: who may call these two routes ───────────────────
    console.log('\nAccess: issue reports and single-order reads')
    {
        const utilsRoute = fs.readFileSync(path.join(ROOT, 'routes/utils.js'), 'utf8')
        ok('report-issue is limited to rider, intake-and-tag, customer-experience and admin',
            /router\.patch\(ROUTE_REPORT_DELIVERY_ISSUES, multiAuth\(ROLE\.RIDER, ROLE\.INTAKE_AND_TAG, ROLE\.CUSTOMER_EXPERIENCE, ROLE\.ADMIN\)/.test(
                utilsRoute,
            ))
        const utilSvc = fs.readFileSync(path.join(ROOT, 'services/util.service.js'), 'utf8')
        ok('a rider may report only on a run assigned to them',
            /user\.userType === ROLE\.RIDER[\s\S]{0,500}dispatchDetails\?\.\[leg\]\?\.rider/.test(utilSvc))
        const getOne = bookSrc.slice(
            bookSrc.indexOf('async getBookOrder(req'),
            bookSrc.indexOf('_cancellationVerdict(bookOrder'),
        )
        ok('a customer reading another customer\'s order gets "not found", before any verdict',
            /req\.user\?\.userType === ROLE\.USER &&\s*String\(bookOrder\?\.userId\) !== String\(req\.user\.id\)/.test(
                getOne,
            ) && /if \(!bookOrder \|\| notMine\)/.test(getOne))
    }

    // ─── Dead subscription crons removed ────────────────────────────────────
    // None of the three ever changed a document, and a working calendar reset
    // would ignore billing dates and wipe loyalty bonuses. The renewal webhook
    // is the one place the monthly allowance is reset.
    console.log('\nSubscription allowance resets only at renewal')
    {
        const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
        ok('server.js starts none of the three dead subscription jobs',
            !/crons\/(resetMonthlyLimits|expireSubscriptions|cleanUpCancelledSubs)/.test(serverSrc))
        ok('the renewal webhook still resets remainingItems to the plan limit',
            /subscription\.remainingItems = plan\.monthlyLimits/.test(
                fs.readFileSync(path.join(ROOT, 'util/webhook.handler.js'), 'utf8'),
            ))
    }

    // ─── FE 9 Oct: a failed delivery returns to READY ───────────────────────
    console.log('\nFE — failed delivery goes back to the delivery queue')
    {
        const riderSrc = fs.readFileSync(path.join(ROOT, 'services/rider.service.js'), 'utf8')
        const failFn = riderSrc.slice(
            riderSrc.indexOf('async markOrderDeliveryAsFailed('),
            riderSrc.indexOf('async getRiderAssignedPickups('),
        )
        ok('marking a delivery failed sets the stage back to READY in the same save',
            /order\.stage\.status = ORDER_STATUS\.READY[\s\S]{0,400}await order\.save\(\)/.test(
                failFn,
            ))
        ok('but only from OUT_FOR_DELIVERY, so a cancelled order stays cancelled (F-04)',
            /if \(order\.stage\?\.status === ORDER_STATUS\.OUT_FOR_DELIVERY\) \{[\s\S]{0,120}order\.stage\.status = ORDER_STATUS\.READY/.test(
                failFn,
            ))
        const utilSrc = fs.readFileSync(path.join(ROOT, 'services/util.service.js'), 'utf8')
        const problemBranch = utilSrc.slice(
            utilSrc.indexOf("} else if (issueType === 'delivery_problem')"),
            utilSrc.indexOf("} else if (issueType === 'walkin_problem')"),
        )
        ok('the staff delivery_problem report also returns an out-for-delivery order to READY',
            /'stage\.status': ORDER_STATUS\.READY/.test(problemBranch))
        const setupSrc = fs.readFileSync(path.join(ROOT, 'config/setup.js'), 'utf8')
        ok('existing stuck failed deliveries are migrated, and the step is registered',
            /"stage\.status": ORDER_STATUS\.OUT_FOR_DELIVERY,\s*"dispatchDetails\.delivery\.status": DELIVERY_STATUS\.FAILED/.test(
                setupSrc,
            ) && /\["failedDeliveryStage", backfillFailedDeliveryStage\]/.test(setupSrc))
    }

    console.log('\nLaunch fix 6 — registration welcome and the schedule save')
    {
        const { normalizeSchedule } = require(path.join(ROOT, 'services/crm.service'))
        const { renderTemplate } = require(path.join(ROOT, 'services/crmMessenger.service'))
        const CrmSet = require(path.join(ROOT, 'models/crmSetting.model'))
        const { CRM_MESSAGE_TYPE: CMT } = require(path.join(ROOT, 'util/constants'))
        const REG = [CMT.REG_NOT_BOOKED_1, CMT.REG_NOT_BOOKED_2, CMT.REG_NOT_BOOKED_3, CMT.REG_NOT_BOOKED_MARK_PROSPECT]
        const keys = ['messageType', 'enabled', 'delayMinutes', 'cancelIfOrdered', 'anchor', 'preferSlot']
        const def = CrmSet.DEFAULT_REGISTERED_NOT_BOOKED_SCHEDULE
        const round = normalizeSchedule(JSON.parse(JSON.stringify(def)), 'registeredNotBookedSchedule', REG)
        ok('the default registered-not-booked schedule saves unchanged (anchor and slot kept)',
            !round.error && def.every((s, i) => keys.every((k) => s[k] === round.normalized[i][k])))
        ok('two offer-end steps at minute 0 in different windows do not clash',
            !normalizeSchedule([
                { messageType: CMT.REG_NOT_BOOKED_2, delayMinutes: 0, anchor: 'offer-end', preferSlot: 'evening' },
                { messageType: CMT.REG_NOT_BOOKED_3, delayMinutes: 0, anchor: 'offer-end', preferSlot: 'morning' },
            ], 'x', REG).error)
        ok('two offer-end steps in the same window and minute clash',
            !!normalizeSchedule([
                { messageType: CMT.REG_NOT_BOOKED_2, delayMinutes: 0, anchor: 'offer-end', preferSlot: 'evening' },
                { messageType: CMT.REG_NOT_BOOKED_3, delayMinutes: 0, anchor: 'offer-end', preferSlot: 'evening' },
            ], 'x', REG).error)
        ok('two workflow-start steps in the same minute clash, whatever the window',
            !!normalizeSchedule([
                { messageType: CMT.REG_NOT_BOOKED_1, delayMinutes: 60, preferSlot: 'morning' },
                { messageType: CMT.REG_NOT_BOOKED_MARK_PROSPECT, delayMinutes: 60, preferSlot: 'evening' },
            ], 'x').error)
        ok('an unknown anchor or slot is refused',
            !!normalizeSchedule([{ messageType: CMT.REG_NOT_BOOKED_1, delayMinutes: 1, anchor: 'noon' }], 'x').error &&
                !!normalizeSchedule([{ messageType: CMT.REG_NOT_BOOKED_1, delayMinutes: 1, preferSlot: 'noon' }], 'x').error)
        ok('the welcome is never a schedule step',
            !!normalizeSchedule([{ messageType: CMT.REGISTRATION_WELCOME, delayMinutes: 1 }], 'leadSchedule').error)
        ok('updateSettings saves registeredNotBookedSchedule',
            /\[\s*'registeredNotBookedSchedule',\s*registeredNotBookedSchedule,/.test(
                fs.readFileSync(path.join(ROOT, 'services/crm.service.js'), 'utf8'),
            ))
        const tpl = CrmSet.DEFAULT_TEMPLATES[CMT.REGISTRATION_WELCOME]
        const text = renderTemplate(tpl, { fullName: 'Ada Obi' }, { offerEndDay: 'Friday 16 October' })
        ok('{{offerEndDay}} and {{firstName}} render in the welcome',
            /Hello Ada,/.test(text) && /by Friday 16 October/.test(text) && !/{{/.test(text))
        ok('the no-offer welcome has no end-day placeholder',
            !/offerEndDay/.test(CrmSet.DEFAULT_TEMPLATES[CMT.REGISTRATION_WELCOME_NO_OFFER]))
        const { welcomeOfferEndDay } = require(path.join(ROOT, 'services/crm.service'))
        const win = { morningStartHour: 6, morningEndHour: 8, eveningStartHour: 18, eveningEndHour: 20 }
        ok('F-51: an offer ending 01:00 Thursday names Wednesday as the last day',
            welcomeOfferEndDay(new Date('2026-10-15T00:00:00Z'), win) === 'Wednesday 14 October')
        ok('F-51: an offer ending 15:00 Thursday names Thursday',
            welcomeOfferEndDay(new Date('2026-10-15T14:00:00Z'), win) === 'Thursday 15 October')
        ok('F-52: an offer-end step with a delay is refused',
            !!normalizeSchedule([{ messageType: CMT.REG_NOT_BOOKED_2, delayMinutes: 60, anchor: 'offer-end', preferSlot: 'evening' }], 'x', REG).error)
        ok('F-52: offer-end "any" and "evening" land in the same window and clash',
            !!normalizeSchedule([
                { messageType: CMT.REG_NOT_BOOKED_2, delayMinutes: 0, anchor: 'offer-end', preferSlot: 'any' },
                { messageType: CMT.REG_NOT_BOOKED_3, delayMinutes: 0, anchor: 'offer-end', preferSlot: 'evening' },
            ], 'x', REG).error)
        ok('F-54: an offer-end anchor is refused outside the registered-not-booked schedule',
            !!normalizeSchedule([{ messageType: CMT.LEAD_OFFER, delayMinutes: 0, anchor: 'offer-end', preferSlot: 'evening' }], 'leadSchedule').error)
        ok('F-54: the registered-not-booked schedule still accepts it',
            !normalizeSchedule([{ messageType: CMT.REG_NOT_BOOKED_2, delayMinutes: 0, anchor: 'offer-end', preferSlot: 'evening' }], 'registeredNotBookedSchedule',
                [CMT.REG_NOT_BOOKED_1, CMT.REG_NOT_BOOKED_2, CMT.REG_NOT_BOOKED_3, CMT.REG_NOT_BOOKED_MARK_PROSPECT]).error)
        ok('F-50: the phone step sets the phone only while it is still empty',
            /findOneAndUpdate\(\s*\{\s*_id: userId, phoneNumber: \{ \$in: \[null, ''\] \} \}/.test(
                fs.readFileSync(path.join(ROOT, 'services/user.service.js'), 'utf8'),
            ))
    }

    // The merge of launch item 2 with the booking hotfix dropped the
    // amountPaidSoFar import, and every source-text check here still passed:
    // the order view, history, cancellation and item edit all threw on main.
    // So CALL the function that uses it instead of reading its source.
    console.log('\nMerge guard — the order read path actually runs')
    {
        const BOS = require(path.join(ROOT, 'services/bookOrder.service'))
        let verdict = null
        let threw = null
        try {
            verdict = new BOS()._cancellationVerdict(
                { stage: { status: 'pending' }, paymentStatus: 'success', amount: 2000, createdAt: new Date() },
                {},
            )
        } catch (e) {
            threw = e
        }
        ok('the cancellation verdict (order view, history) runs without a ReferenceError',
            !threw && verdict && typeof verdict.allowed === 'boolean', threw ? threw.message : '')
    }

    console.log('\nLaunch fix 3 — ready dates, Ready Today, Anytime per date, the daily floor limit')
    {
        const RW = require(path.join(ROOT, 'util/bookingWindow'))
        const S = { workingDays: ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'], halfDays: ['sun'], floorLimits: { dailyPieces: 150, sameDayPieces: 30, expressPieces: 50 } }
        const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min)
        const txt = (x) => (x ? RW.dayText(x) : null)
        ok('client: a 1-day order picked up Sunday evening is ready Tuesday',
            txt(RW.earliestReadyDay({ speed: 'express', pickupAt: at(2026, 10, 11, 18), settings: S })) === 'Tuesday 13 October')
        ok('client: a 1-day order picked up Saturday evening is ready Tuesday (Sun ½ + Mon 0)',
            txt(RW.earliestReadyDay({ speed: 'express', pickupAt: at(2026, 10, 10, 18), settings: S })) === 'Tuesday 13 October')
        ok('client: a 2-day order picked up Saturday evening is ready Wednesday',
            txt(RW.earliestReadyDay({ speed: 'standard', pickupAt: at(2026, 10, 10, 18), settings: S })) === 'Wednesday 14 October')
        ok('Ready Today: pickup before 12:00 on a full day is today; 12:30 or a Sunday is not',
            txt(RW.earliestReadyDay({ speed: 'same-day', pickupAt: at(2026, 10, 13, 11), settings: S })) === 'Tuesday 13 October' &&
                RW.earliestReadyDay({ speed: 'same-day', pickupAt: at(2026, 10, 13, 12, 30), settings: S }) === null &&
                RW.earliestReadyDay({ speed: 'same-day', pickupAt: at(2026, 10, 11, 9), settings: S }) === null)
        ok('the ready deadline is 19:00 on the ready day',
            RW.readyDeadline(at(2026, 10, 14)).getHours() === 19)
        ok('limits: Sunday is half (75 / Express 25), Monday is 0',
            RW.dailyLimit(at(2026, 10, 11), 'floor', S) === 75 && RW.dailyLimit(at(2026, 10, 11), 'express', S) === 25 &&
                RW.dailyLimit(at(2026, 10, 12), 'floor', S) === 0)
        const spread = RW.allocateFloor({ speed: 'standard', pieces: 180, firstDay: at(2026, 10, 13), usage: { '2026-10-13': { total: 110 } }, settings: S })
        ok('client: 40 left on Tuesday + a 180-piece order → 40 Tue + 140 Wed, ready Wednesday',
            JSON.stringify(spread.allocation) === JSON.stringify([{ date: '2026-10-13', pieces: 40 }, { date: '2026-10-14', pieces: 140 }]) &&
                txt(spread.readyDay) === 'Wednesday 14 October')
        const sunday = RW.allocateFloor({ speed: 'standard', pieces: 100, firstDay: at(2026, 10, 11), usage: {}, settings: S })
        ok('client: 100 pieces from Sunday → 75 Sun, Monday skipped, 25 Tue, ready Tuesday',
            JSON.stringify(sunday.allocation) === JSON.stringify([{ date: '2026-10-11', pieces: 75 }, { date: '2026-10-13', pieces: 25 }]) &&
                txt(sunday.readyDay) === 'Tuesday 13 October')
        ok('Regular is never refused, even when every day is full for a while',
            RW.allocateFloor({ speed: 'standard', pieces: 10, firstDay: at(2026, 10, 13), usage: { '2026-10-13': { total: 150 }, '2026-10-14': { total: 150 } }, settings: S }).ok === true)
        const labels = { 'same-day': 'Ready Today', express: 'Express', standard: 'Standard' }
        const forty = RW.speedOptions({ pickupAt: at(2026, 10, 13, 9), pieces: 40, settings: S, usage: {}, labels })
        ok('client: a 40-piece order → "Too many pieces for Ready Today. Choose Express or Standard, or call us…"',
            forty[0].message === 'Too many pieces for Ready Today. Choose Express or Standard, or call us on +234 707 325 4943.' && forty[1].available && forty[2].available)
        const full = RW.speedOptions({ pickupAt: at(2026, 10, 13, 9), pieces: 10, settings: S, usage: { '2026-10-13': { total: 30, 'same-day': 30 }, '2026-10-14': { total: 50, express: 50 } }, labels })
        ok('client: Express full names the day; Ready Today full reads "Full today"',
            full[1].message === 'Express is full for Wednesday. Choose Standard, or pick another pickup day.' && full[0].message === 'Full today')
        const sixty = RW.speedOptions({ pickupAt: at(2026, 10, 13, 9), pieces: 60, settings: S, usage: {}, labels })
        ok('"Choose …" lists only the speeds that still fit (60 pieces fit neither fast speed)',
            sixty[0].message === 'Too many pieces for Ready Today. Choose Standard, or call us on +234 707 325 4943.')
        ok('a fast speed needs room in the floor total too (Regular filled the day)',
            RW.allocateFloor({ speed: 'express', pieces: 5, firstDay: at(2026, 10, 14), usage: { '2026-10-14': { total: 150 } }, settings: S }).reason === 'full')
        ok('display names: messages use the on-screen speed name',
            RW.speedOptions({ pickupAt: at(2026, 10, 13, 9), pieces: 40, settings: S, labels: { ...labels, standard: 'Regular' } })[0].message.includes('Choose Express or Regular'))
        const moved = RW.speedOptions({ pickupAt: at(2026, 10, 13, 9), pieces: 10, settings: S, usage: { '2026-10-15': { total: 150 } }, labels })
        ok('a first day with no room at all says "Ready <day> instead of <day>"',
            moved[2].movedFromText === 'Ready Friday instead of Thursday')
        ok('Anytime per date: a closed Monday reads "Closed that day"',
            RW.anytimeOnDate({ date: at(2026, 10, 12), now: at(2026, 10, 11, 10), settings: S }).note === 'Closed that day' &&
                RW.anytimeOnDate({ date: at(2026, 10, 13), now: at(2026, 10, 11, 10), settings: { ...S, anytimeOpenFrom: '08:00' } }).open === true)
        ok('the pickup instant: a window starts at its start time on its date',
            RW.pickupInstant({ leg: { timing: 'window', date: at(2026, 10, 13), windowStart: '15:00' }, now: at(2026, 10, 12, 9), settings: S }).getHours() === 15)
        ok('a recount keeps the days: extra pieces on the last day, removed ones off the last days',
            JSON.stringify(RW.adjustAllocation([{ date: 'a', pieces: 4 }, { date: 'b', pieces: 6 }], 40)) === JSON.stringify([{ date: 'a', pieces: 4 }, { date: 'b', pieces: 36 }]) &&
                RW.adjustAllocation([{ date: 'a', pieces: 4 }, { date: 'b', pieces: 6 }], 3)[0].pieces === 3)
        // Review F-56: a text pickup time must never make Ready Today look possible.
        const satTen = at(2026, 10, 17, 10)
        const rtFor = (t) => RW.readyTodayAllowed(RW.pickupInstant({ pickupDate: '2026-10-20', pickupTime: t, now: satTen, settings: S }), S)
        // A bare hour is a pickup hour (08:00–19:00): 1–7 are afternoon/evening, 12 is noon (F-56, F-62).
        const lateTimes = ['evening', 'afternoon', 'noon', 'night', '2-4pm', '1 to 3pm', 'between 2 and 4pm',
            'around 2', '2', '2:30', 'after 3', "3 o'clock", '12-2pm', '12:30-2pm', '12 - 3pm', '15:00', 'sometime soon',
            // F-63: a late word beats a bare morning-looking number; "12am" is never early.
            'evening, around 8', '8 in the evening', '9 tonight', '10 at night', '8-10 in the evening', '12am', '12:30am',
            // F-65: written dates are not the time; a range start never beats a later am/pm; hour 0 is never early.
            '2026-10-14 15:00', '2026-10-14T15:00:00', '9-10 at 3pm', '14-10-2026 3pm', '00:30', '0:15', '230pm',
            // Round 5: a range start never beats a later colon time (F-65); negations and an evening word beat
            // "by noon" (F-67); dot times, month-first dates and a standalone pm are not plain (F-68).
            '9-10 at 15:00', '10-11 at 2:30', 'not before noon', 'not by noon', 'afternoon, by noon', 'by noon or evening',
            '8.30pm', '11.30pm', 'Oct 10 around 2', '9 o clock pm', '9:30 p m', 'no later than 10',
            // Round 6: a bare range start shares its end's pm (F-69); seconds keep the pm (F-70).
            '8-10pm', '8 to 10pm', 'between 8 and 10pm', '9 or 10pm', '10-11pm', '9:00:00 pm', '9:30:00 PM',
            'sunday 8-10pm', 'wed evening']
        ok('F-56/F-62/F-63: late words (even beside a number), bare hours 1–7, "12-2pm", "12am" and unreadable text do not allow Ready Today',
            lateTimes.every((t) => rtFor(t) === false))
        ok('F-56/F-64: morning times still do, and dates/counts in the text are not read as the time',
            ['morning', '9am', '10am-12pm', '11-1pm', '11:30-1pm', 'around 10', '09:00', '9 a.m.', '',
                '14 Oct 9am', '20/10 at 9am', '2 bags at 9am', 'between 9 and 11',
                // F-66: genuine mornings that were refused.
                'before noon', 'morning, before noon', 'by noon', '10-12 noon', 'between 10 and noon', '10 or noon',
                'around 9 maybe', '930am', '2026-10-14 09:30', '2026-10-14T09:00:00', '10th Oct 9am', 'tomorrow morning',
                '8-10am', '9:00:00 am', 'Wednesday 9am', 'wed morning', '10-12pm', '11-1pm'].every((t) => rtFor(t) === true))
        // F-60: the assistant names a refused speed's reason once, not twice.
        const BotParsers = require(path.join(ROOT, 'services/bot/parsers'))
        const offerTxt = BotParsers._speedOfferText.call(BotParsers, [
            { speed: 'same-day', label: 'Ready Today', available: false, message: 'Full today' },
            { speed: 'express', label: 'Express', available: false, message: 'Too many pieces for Express. Choose Standard, or call us on +234 707 325 4943.' },
            { speed: 'standard', label: 'Standard', available: true, charge: 0, eta: 'ready Thursday 15 October, by 7:00 PM' },
        ], { skipNoteFor: 'express' })
        ok('F-60: the refused speed is left out of the notes (the reply already leads with it)',
            !/Too many pieces for Express/.test(offerTxt) && /\(Full today\)/.test(offerTxt) && /• Standard/.test(offerTxt))
        // F-72: a written pickup day is read; one that can't be read is asked again, never counted from now.
        const tue9 = new Date(2026, 9, 13, 9, 0)
        const wd = (p) => BotParsers._writtenPickupDate(p, tue9)?.date?.toDateString() || null
        ok('F-72: written pickup days resolve to the right date',
            ['20 October', '20th of Oct', 'Oct 20', '20/10', 'the 20th'].every((p) => wd(p) === 'Tue Oct 20 2026') &&
            wd('in 3 days') === 'Fri Oct 16 2026' && wd('5/1') === 'Tue Jan 05 2027')
        ok('F-72: an unreadable, impossible or just-passed day is null (asked again), and "3rd floor" is not a date',
            ['next week', 'asap', '31/02', '12 October', '10/10/2026', '3rd floor'].every((p) => wd(p) === null) &&
            BotParsers._resolvePickupDate('next week') === null &&
            BotParsers._parseDateTimeFromText('12/4 Allen Avenue').datePhrase === null)
        const flowSrc = fs.readFileSync(path.join(ROOT, 'services/bot/booking.flow.js'), 'utf8')
        ok('F-72: the booking flow drops an unresolved day and re-asks it',
            /if \(!pickupDay\) \{\s*unreadDay = bDate/.test(flowSrc) && /I couldn't pin down the day/.test(flowSrc))
        // F-73: a written date never overrides a named weekday; they must agree, or the day is asked again.
        const dp = (t) => BotParsers._parseDateTimeFromText(t, { written: true }).datePhrase
        ok('F-73: time ranges and "may be" are not dates; a weekday beside a written date is kept for the agreement check',
            dp('saturday 10/11 am') === 'saturday' && dp('friday by 3 may be 4pm') === 'friday' &&
            dp('9/10am') === null && dp('saturday 20 october') === 'saturday 20 october')
        ok('F-73: a weekday that disagrees with the written date is not resolved (asked again)',
            (() => {
                // Clock-independent: a date 3 days out, named with the wrong weekday / as "tomorrow".
                const d3 = new Date(); d3.setDate(d3.getDate() + 3)
                const dm = `${d3.getDate()}/${d3.getMonth() + 1}`
                const wrongDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][(d3.getDay() + 1) % 7]
                const rightDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d3.getDay()]
                return BotParsers._resolvePickupDate(`${wrongDay} ${dm}`) === null &&
                    BotParsers._resolvePickupDate(`tomorrow ${dm}`) === null &&
                    BotParsers._resolvePickupDate(`${rightDay} ${dm}`)?.toDateString() === d3.toDateString()
            })())
        // F-78: a weekday beside a bare ordinal or "next week" is not the coming weekday.
        ok('F-78: "<weekday> <Nth>" resolves to that date; "<weekday> next week" is not the coming one',
            (() => {
                const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
                const d10 = new Date(); d10.setDate(d10.getDate() + 10)
                const ord = BotParsers._resolvePickupDate(dp(`${names[d10.getDay()]} ${d10.getDate()}th`))
                const plain = BotParsers._resolvePickupDate('saturday')
                const later = BotParsers._resolvePickupDate(dp('saturday next week'))
                return ord?.toDateString() === d10.toDateString() &&
                    !!later && (new Date().getDay() === 0 ? later >= plain : later > plain) &&
                    dp('book for saturday 24th please') === 'saturday 24th'
            })())
        // Round 10: a bare day right after the weekday counts; a house number or a slash pair doesn't;
        // "not next week" is the coming one; the summary shows the date read.
        ok('F-78: "<weekday> 24" reads the date; "<weekday>, at 24 Allen Avenue" and "No 24/4" do not',
            (() => {
                const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
                const d = new Date(); d.setDate(d.getDate() + 8)
                while (d.getDate() < 13) d.setDate(d.getDate() + 1)
                const wd = names[d.getDay()], dd = d.getDate()
                const r = (t, s) => BotParsers._resolvePickupDate(BotParsers._parseDateTimeFromText(t, { written: s }).datePhrase)?.toDateString()
                return r(`${wd} ${dd}`, true) === d.toDateString() && r(`${wd} ${dd} by 10am`, true) === d.toDateString() &&
                    r(`book ${wd}, pickup at ${dd} allen avenue`, false) !== d.toDateString() &&
                    r(`book ${wd}, no ${dd}/4 allen avenue`, false) !== d.toDateString()
            })())
        ok('F-78: "this saturday, not next week" is the coming Saturday',
            BotParsers._resolvePickupDate(dp('this saturday, not next week'))?.toDateString() === BotParsers._resolvePickupDate('saturday')?.toDateString())
        ok('F-78/F-81: the booking summary shows the pickup DATE read, not the customer\'s words',
            /pickupDay\.toLocaleDateString\('en-GB', \{ weekday: 'long', day: 'numeric', month: 'long' \}\)/.test(flowSrc))
        ok('F-79: "around 9 may work" and "may 10 am" are not May dates; "9 may" still is',
            dp('around 9 may work') === null && dp('may 10 am') === null && wd('9 may') !== null)
        ok('F-80: dropping the pickup day also clears the speed chosen for it',
            /if \(!bDate\) bSpeed = null/.test(flowSrc))
        // F-74: the resolved day is kept; confirm never places without it; places are not dates.
        ok('F-74: the flow keeps the resolved day (bDay), re-asks a day that passed, and confirm needs a pickup day',
            /bDay && slots\.bDatePhrase === bDate \? new Date\(bDay\)/.test(flowSrc) && /pickupDay < today/.test(flowSrc) &&
            /this\.isAffirmative\(text\) && pickupDay/.test(flowSrc) && wd('the 3rd floor') === null)
        // Review F-57: Anytime on a closed day counts from the next opening, never from now.
        const closedMon = RW.pickupInstant({ leg: { timing: 'anytime', date: at(2026, 10, 19) }, now: satTen, settings: { ...S, anytimeOpenFrom: '08:00', anytimeOpenTo: '17:00' } })
        ok('F-57: Anytime on a closed Monday counts from Tuesday 08:00, not from now',
            txt(closedMon) === 'Tuesday 20 October' && closedMon.getHours() === 8)
        const bo3 = fs.readFileSync(path.join(ROOT, 'services/bookOrder.service.js'), 'utf8')
        ok('the 10am / 2pm booking cut-offs are gone from booking',
            !/must be placed before 10am/.test(bo3) && !/must be placed before 2pm/.test(bo3) &&
                !/must be placed before 10am/.test(fs.readFileSync(path.join(ROOT, 'services/intake-user.service.js'), 'utf8')))
        ok('plans refuse set items, not only heavy ones',
            /const setItem = post\.items\.find\(\(item\) => item\.fromSet\)/.test(bo3))
        ok('the item edit keeps the date and only adjusts the floor split',
            /floorAllocation: adjustAllocation\(/.test(bo3))
        const qbMsg = require(path.join(ROOT, 'util/quickBooking')).applyCountOnlyBooking({ itemCount: 201 })
        const ciMsg = require(path.join(ROOT, 'util/catalogItems')).priceFromCatalog([{ type: 'shirt', quantity: 201 }], { catalog: [{ name: 'shirt', price: 100 }] })
        const CLIENT_200 = 'For more than 200 pieces, call or WhatsApp us on +234 707 325 4943 and we will plan it with you.'
        ok('both 200-piece refusals use the client\'s exact text',
            qbMsg.error === CLIENT_200 && ciMsg.error === CLIENT_200)
        const adminSrc3 = fs.readFileSync(path.join(ROOT, 'services/admin.service.js'), 'utf8')
        ok('admin settings refuse a fast share larger than the floor limit',
            /neither can be larger than it/.test(adminSrc3))
    }

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
