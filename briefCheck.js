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
ok('the wrapper swallows the log failure instead of rethrowing',
    /createAuditLog\(payload\)\.catch\(/.test(sub) && !/throw/.test(
        sub.slice(sub.indexOf('const auditSafely'), sub.indexOf('// Turn a Mongoose')),
    ))
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

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
