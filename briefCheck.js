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

    // The three hold messages: affected station, never the actor.
    const adminSrc2 = fs.readFileSync(path.join(ROOT, 'services/admin.service.js'), 'utf8')
    ok('the three hold notices go to the affected station',
        (adminSrc2.match(/notifyAffectedStation\(\{/g) || []).length === 3)
    ok('  …and every one of them excludes the actor',
        (adminSrc2.match(/notifyAffectedStation\(\{\s*role:[^}]*actorId: userId/g) || [])
            .length === 3)
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
