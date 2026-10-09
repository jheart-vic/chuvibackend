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

    // D6: "the promised delivery date must also skip unticked days".
    ok('D6 standard (+2) from Saturday skips the closed Monday → Tuesday',
        BW.deliveryDayForSpeed({ from: satD(9), deliverySpeed: DELIVERY_SPEED.STANDARD, workingDays: WDAYS }).getDate() === 13)
    ok('D6 express (+1) from Sunday skips the closed Monday → Tuesday',
        BW.deliveryDayForSpeed({ from: sunD(9), deliverySpeed: DELIVERY_SPEED.EXPRESS, workingDays: WDAYS }).getDate() === 13)
    ok('  …and same-day on a closed day cannot be promised that day',
        BW.deliveryDayForSpeed({ from: monD(9), deliverySpeed: DELIVERY_SPEED.SAME_DAY, workingDays: WDAYS }).getDate() === 13)

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
    ok('  …and with nothing free anywhere it refuses and points at Anytime',
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
            return !r.ok && /Anytime/.test(r.error)
        })())

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
        /DELIVERY_SPEED\.SAME_DAY &&\s*\n\s*!BookingWindowService\._findMorningWindow/.test(boSrc))
    ok('the chosen timing owns the fee (one override, not five parallel edits)',
        /adminOrderSetting\.pickupFee = resolved\.leg\.fee/.test(boSrc) &&
            /adminOrderSetting\.deliveryFee = scheduling\.delivery\.fee/.test(boSrc))
    ok('`scheduling` is stamped once in the common tail, after the !newOrder guard',
        boSrc.indexOf('if (!newOrder) {') < boSrc.indexOf('{ $set: { scheduling } }'))
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
    const { calculateDueDate } = require(path.join(ROOT, 'util/helper'))
    const { deliveryPromise } = BW
    const { presentOrder } = require(path.join(ROOT, 'util/orderView'))

    // Clock-independent invariant: whatever day the harness runs on, a
    // working-day-aware due date must LAND on a ticked day. A frozen-date test
    // would assert a specific calendar day and rot.
    ok('D6(b) a working-day-aware due date always lands on a WORKING day',
        [DELIVERY_SPEED.STANDARD, DELIVERY_SPEED.EXPRESS].every((speed) => {
            const due = calculateDueDate(speed, WDAYS)
            // null is legitimate past a cutoff; only a returned date is judged.
            return due === null || BW.isWorkingDay(due, WDAYS)
        }))
    ok('  …and it keeps the 19:00 end-of-day sentinel, which is NOT a promise',
        (() => {
            const due = calculateDueDate(DELIVERY_SPEED.STANDARD, WDAYS)
            return due !== null && due.getHours() === 19
        })())
    // Back-compat: the argument is optional, and omitting it must behave
    // exactly as before, or every caller that has no settings to hand changes.
    ok('  …while omitting workingDays keeps the original calendar behaviour',
        (() => {
            const legacy = calculateDueDate(DELIVERY_SPEED.STANDARD)
            const expected = new Date()
            expected.setDate(expected.getDate() + 2)
            return legacy.toDateString() === expected.toDateString()
        })())
    const dueSrc = fs.readFileSync(path.join(ROOT, 'util/helper.js'), 'utf8')
    ok('  …and both booking paths now pass the working days',
        /calculateDueDate\(\s*\n?\s*post\.deliverySpeed,\s*\n?\s*adminOrderSetting\.workingDays,/.test(boSrc) &&
            /calculateDueDate\(\s*\n?\s*post\.deliverySpeed,\s*\n?\s*adminOrderSetting\.workingDays,/.test(
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
        /static async raise\(\{ orderId, actorId, reason = null \}\)/.test(phSrc) &&
            /const amount = Number\(order\.amount \|\| 0\)/.test(phSrc))
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
        /order\.paymentStatus === PAYMENT_ORDER_STATUS\.SUCCESS\s*\n?\s*\? previousTotal\s*\n?\s*: 0/.test(boSrc))
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
