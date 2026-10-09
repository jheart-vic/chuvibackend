// Hold SLA — ONE definition of "this hold has breached its SLA", shared by the
// Active card, the Overdue card and the Holds Management list.
//
// Client brief 6 Oct 2026, item 4.4: Active and Overdue showed the SAME three
// orders. The cause was that Active counted EVERY hold while Overdue counted the
// breached ones — a strict SUBSET of Active, so a breached hold was always in
// both, and Active + Overdue never equalled the number of orders on hold.
//
// The rule the client asked for: Active = on hold and still inside its SLA,
// Overdue = on hold and past it, no order in both, and the two add up to all
// holds. That only stays true if both cards read the SAME clause, which is why
// it lives here instead of being spelled out at each call site (it was
// previously duplicated in two places in admin.service.js and could drift).

// ── Hold TYPES (client brief reply, section B, 2026-10-07) ──────────────────
// "The limit should depend on the kind of hold, not on the speed of the order."
// Quick Booking creates PAYMENT holds that legitimately last a day or more, and
// under the speed table every one of them would read Overdue within hours.
//
// So a hold now resolves its limit in this order:
//   1. its hold type's own `slaHours`, if the admin has set one;
//   2. otherwise the delivery-speed table below — today's behaviour, unchanged.
// Every operational type is seeded with slaHours = null, so NOTHING changes for
// the stations until the admin sets a limit. Only `payment` ships with its own
// (48h) and with judgeByOwnLimitOnly, which keeps the delivery-date rule off it.
//
// The partition property from 4.4 still holds: Overdue is an $or of branches and
// Active is the $nor of the SAME branches, so every hold matches exactly one.

const { ORDER_STATUS, DELIVERY_SPEED } = require('./constants')

// How long an order may sit on hold before it has breached, by delivery speed.
// Still the DEFAULT, now only the fallback when the hold's type has no limit.
const HOLD_SLA_HOURS = {
    [DELIVERY_SPEED.SAME_DAY]: 2,
    [DELIVERY_SPEED.EXPRESS]: 4,
    [DELIVERY_SPEED.STANDARD]: 6,
}

const HOUR = 60 * 60 * 1000

// Load the admin-configured types into a plain lookup. Kept OUT of the pure
// functions below so a query builder never has to await a database read in the
// middle of composing a filter, and so the whole module stays testable offline.
async function loadHoldRules() {
    // required lazily: util/ must not pull a model in at require time, or the
    // offline harnesses that only want the pure maths would need a connection
    const HoldTypeModel = require('../models/holdType.model')
    const AdminSettingModel = require('../models/adminSetting.model')
    const [types, setting] = await Promise.all([
        HoldTypeModel.find({ active: true })
            .select('key name slaHours judgeByOwnLimitOnly escalateToAdmin')
            .lean(),
        AdminSettingModel.findOne().select('holdSlaHoursBySpeed').lean(),
    ])
    const byKey = {}
    for (const t of types) byKey[t.key] = t

    // Client 2026-10-08: the three speed limits became admin-editable. Anything
    // the admin has not set falls back to the code default, so a partial or
    // absent setting can never leave a speed with no limit at all.
    const raw = setting?.holdSlaHoursBySpeed
    const configured = raw instanceof Map ? Object.fromEntries(raw) : raw || {}
    const speedHours = { ...HOLD_SLA_HOURS }
    for (const [speed, hours] of Object.entries(configured)) {
        const n = Number(hours)
        if (Object.prototype.hasOwnProperty.call(speedHours, speed) && n > 0) {
            speedHours[speed] = n
        }
    }

    return { byKey, types, speedHours }
}

// The breach clause, as $or branches. Without `rules` this is byte-identical to
// what 4.4 shipped, which is why every existing caller keeps working.
const breachBranches = (now = new Date(), rules = null) => {
    // admin-edited limits when present, code defaults otherwise
    const speedTable = rules?.speedHours || HOLD_SLA_HOURS
    const cutoffFor = (hours) => new Date(now.getTime() - hours * HOUR)

    // ORDER-LEVEL holds are clocked from `stage.updatedAt` (when the order was
    // parked). Each branch is pinned to `stage.status: hold` — WITHOUT that, an
    // order whose only hold is on a PIECE would match purely because its stage
    // had not changed in six hours, and would be reported Overdue while nothing
    // was overdue at all. That bug appeared the moment the scope widened to
    // include item holds.
    const speedBranches = Object.entries(speedTable).map(([speed, hours]) => ({
        'stage.status': ORDER_STATUS.HOLD,
        deliverySpeed: speed,
        'stage.updatedAt': { $lt: cutoffFor(hours) },
    }))

    // ITEM-LEVEL holds are clocked from the piece's own `holdDetails.heldAt`,
    // because the order's stage never moved. $elemMatch so "held long enough"
    // and "not yet released" are true of the SAME piece (a released hold keeps
    // its heldAt — see util/itemHold.js).
    const itemBranches = Object.entries(speedTable).map(([speed, hours]) => ({
        deliverySpeed: speed,
        items: {
            $elemMatch: {
                'holdDetails.heldAt': { $lt: cutoffFor(hours) },
                'holdDetails.releasedAt': { $exists: false },
            },
        },
    }))

    if (!rules || !rules.types?.length) {
        return [...speedBranches, ...itemBranches, { deliveryDate: { $lt: now } }]
    }

    const typed = rules.types.filter((t) => t.slaHours > 0)
    const typedKeys = typed.map((t) => t.key)
    // Types with their own limit get their own branch…
    const typedBranches = typed.map((t) => ({
        'stage.status': ORDER_STATUS.HOLD,
        'orderHold.holdTypeKey': t.key,
        'stage.updatedAt': {
            $lt: new Date(now.getTime() - t.slaHours * HOUR),
        },
    }))
    // …and everything else (no type, or a type with no limit) falls back to the
    // speed table. Scoped with $nin so a typed hold is judged ONCE, by its own
    // limit, and can never also be caught by the speed branch.
    const fallbackBranches = typedKeys.length
        ? speedBranches.map((b) => ({
              ...b,
              'orderHold.holdTypeKey': { $nin: typedKeys },
          }))
        : speedBranches

    // The promised delivery date still overrides — except for types the admin
    // marked "judged only by its own limit" (the payment hold), where on a Quick
    // Booking there is no real delivery date yet at all.
    const ownLimitOnly = rules.types
        .filter((t) => t.judgeByOwnLimitOnly)
        .map((t) => t.key)
    const dateBranch = ownLimitOnly.length
        ? {
              deliveryDate: { $lt: now },
              'orderHold.holdTypeKey': { $nin: ownLimitOnly },
          }
        : { deliveryDate: { $lt: now } }

    // Item holds carry no hold TYPE (a station picks a reason, not a type), so
    // they are always judged by the speed table and are unaffected by the typed
    // branches above.
    return [...typedBranches, ...fallbackBranches, ...itemBranches, dateBranch]
}

// ── What counts as "on hold" ────────────────────────────────────────────────
// CLIENT RULING 2026-10-08: the four production stations hold a PIECE, not the
// order, so an order with a held piece no longer has `stage.status: hold`. Holds
// Management must still list it, so the scope widens to "the order is parked OR
// any piece is still held" (util/itemHold.onHoldScope).
//
// Both filters below take this clause through `scopeAnd`, which merges it into
// an $and rather than assigning $or directly — Overdue already uses $or for its
// breach branches, and two $or keys in one object would silently overwrite each
// other. That overwrite would have made Overdue match EVERY held order.
const { onHoldScope, heldItems } = require('./itemHold')

const scopeAnd = (extra) => {
    const scope = onHoldScope(ORDER_STATUS.HOLD)
    return { $and: [scope, extra] }
}

// Holds that have breached their SLA.
const overdueHoldsFilter = (now = new Date(), rules = null) =>
    scopeAnd({ $or: breachBranches(now, rules) })

// Holds that have NOT breached. $nor is the exact complement of the $or above,
// so activeHoldsFilter and overdueHoldsFilter partition the holds between them:
// every order on hold matches exactly one, and the two counts always sum to the
// total. That is the property item 4.4 asks for, and it survives the widened
// scope because BOTH filters are scoped by the identical clause.
const activeHoldsFilter = (now = new Date(), rules = null) =>
    scopeAnd({ $nor: breachBranches(now, rules) })

// How many hours THIS hold is allowed, and why. Also what the Holds screen
// should print beside the countdown.
const holdLimitHours = (order, rules = null) => {
    const key = order?.orderHold?.holdTypeKey
    const type = key && rules?.byKey?.[key]
    if (type && type.slaHours > 0) {
        return { hours: type.slaHours, source: 'type', typeName: type.name }
    }
    const speedTable = rules?.speedHours || HOLD_SLA_HOURS
    return {
        hours:
            speedTable[order?.deliverySpeed] ??
            speedTable[DELIVERY_SPEED.STANDARD],
        source: 'delivery-speed',
        typeName: type?.name || null,
    }
}

// Is this already-loaded order a breached hold? Used where a document is in
// hand rather than a query (list rows flagging "SLA Breached"). MUST agree with
// the filters above — a row contradicting its own card is what 4.4's follow-up
// had to fix, so the limit comes from the same resolver either way.
const isHoldBreached = (order, now = new Date(), rules = null) => {
    if (!order) return false

    // ITEM-LEVEL hold (client ruling 2026-10-08): the order's stage never moved,
    // so the clock is the piece's own heldAt against the speed limit. Checked
    // FIRST, because an order can have a held piece without being parked, and
    // the order-level test below would simply return false for it — which is how
    // a breached piece would have shown "not breached" on its own row while the
    // card above it counted it as Overdue. That exact contradiction is what
    // 4.4's follow-up had to fix once already.
    const held = heldItems(order.items || [])
    if (held.length) {
        const speedTable = rules?.speedHours || HOLD_SLA_HOURS
        const hours =
            speedTable[order.deliverySpeed] ??
            speedTable[DELIVERY_SPEED.STANDARD]
        const cutoff = new Date(now.getTime() - hours * HOUR)
        if (held.some((i) => new Date(i.holdDetails.heldAt) < cutoff)) return true
    }

    if (order.stage?.status !== ORDER_STATUS.HOLD) return false
    const key = order?.orderHold?.holdTypeKey
    const type = key && rules?.byKey?.[key]
    // a payment hold is judged ONLY by its own clock
    if (!type?.judgeByOwnLimitOnly) {
        if (order.deliveryDate && new Date(order.deliveryDate) < now) return true
    }
    const { hours } = holdLimitHours(order, rules)
    if (!hours || !order.stage?.updatedAt) return false
    return new Date(order.stage.updatedAt) < new Date(now.getTime() - hours * HOUR)
}

// May this station raise this hold type? Client 2026-10-08 §3.4: "Each station
// can only raise the reasons on its own list. For a new problem, the station
// chooses Other and writes the details in the note."
//
// Returns null when it is allowed, or the sentence to refuse with.
async function checkStationMayRaise(holdTypeKey, role) {
    if (!holdTypeKey) return null // untyped hold: nothing to check (legacy path)
    const HoldTypeModel = require('../models/holdType.model')
    const type = await HoldTypeModel.findOne({ key: holdTypeKey }).lean()
    if (!type) {
        return `"${holdTypeKey}" is not a hold reason. Pick one from the list, or use "Other" and explain in the note.`
    }
    if (!type.active) {
        return `"${type.name}" is no longer in use. Pick another reason, or use "Other" and explain in the note.`
    }
    // Admin is never restricted — they are the escalation path.
    const { ROLE } = require('./constants')
    if (role === ROLE.ADMIN) return null
    if (type.systemRaisedOnly) {
        return `"${type.name}" is raised by the system, not by a person.`
    }
    // An empty station list means "any station", per the model.
    if (type.stations?.length && !type.stations.includes(role)) {
        return `"${type.name}" is not one of your station's reasons. Use "Other" and describe the problem in the note.`
    }
    return null
}

module.exports = {
    HOLD_SLA_HOURS,
    loadHoldRules,
    checkStationMayRaise,
    breachBranches,
    overdueHoldsFilter,
    activeHoldsFilter,
    holdLimitHours,
    isHoldBreached,
}
