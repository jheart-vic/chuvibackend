// Item pricing — ONE implementation of "what do these items cost".
//
// Client brief 6 Oct 2026, item 1.6: the care tier (Classic / Premium / VIP)
// was chosen once for the WHOLE order. It is now chosen PER ITEM — one stained
// shirt can be VIP while the rest stay Classic — and each item is priced at its
// own tier.
//
// This existed as three near-identical copies (bookOrder.service pay-per-item
// and pay-from-wallet, intake-user.service staff-created), which had ALREADY
// drifted: two defaulted a missing tier charge to `|| 1` and the third to
// `|| 1.5` / `|| 2`, so the same order priced differently depending on which
// screen created it. Per-item tiers would have meant maintaining that divergence
// in three places, so the maths lives here and the three callers share it.
//
// The formula is unchanged for an order whose items carry no tier of their own:
//   line  = roundToNearestHundred(price * serviceTypeMultiplier) * quantity * tierMultiplier
//   total = sum(lines)
// With every item on the order's tier this is byte-identical to the old result,
// which is what makes the change safe for existing flows.

const { SERVICE_TIERS } = require('./constants')
const { roundToNearestHundred } = require('./helper')

// A missing tier charge falls back to 1 — no uplift. Chosen over 1.5/2 because
// an unconfigured setting must never silently CHARGE the customer more; it was
// also what two of the three call sites already did.
const NO_UPLIFT = 1

/**
 * The price multiplier for one care tier.
 * @param {string} tier               classic | premium | vip
 * @param {object} adminOrderSetting  carries premiumServiceTierCharge / vipServiceTierCharge
 */
function tierMultiplier(tier, adminOrderSetting = {}) {
    if (tier === SERVICE_TIERS.PREMIUM) {
        return Number(adminOrderSetting.premiumServiceTierCharge) || NO_UPLIFT
    }
    if (tier === SERVICE_TIERS.VIP) {
        return Number(adminOrderSetting.vipServiceTierCharge) || NO_UPLIFT
    }
    return NO_UPLIFT // classic, unknown, or unset
}

/**
 * The tier an individual piece is priced at: its own if it has one, otherwise
 * the order's. Keeping the order-level tier as the fallback is what makes every
 * existing caller and every existing order behave exactly as before.
 */
function tierOfItem(item, orderTier) {
    return item?.serviceTier || orderTier || SERVICE_TIERS.CLASSIC
}

/**
 * Price a set of items.
 *
 * @param {Array}  items                 [{ price, quantity, serviceTier? }]
 * @param {number} serviceTypeMultiplier pricePerPiece for the chosen service type
 * @param {string} orderTier             the order-level tier (per-item fallback)
 * @param {object} adminOrderSetting     tier charges
 * @returns {{ total:number, itemsBase:number, tierUplift:number, lines:Array,
 *             tiersUsed:string[], isMixedTier:boolean }}
 *   total      — what the customer pays for the items
 *   itemsBase  — the same items at Classic, so a receipt can show the uplift
 *   lines      — per piece, for the receipt and the station cards
 */
function priceItems({
    items = [],
    serviceTypeMultiplier = 1,
    orderTier,
    adminOrderSetting = {},
}) {
    const lines = []
    let total = 0
    let itemsBase = 0
    const tiersUsed = new Set()

    for (const item of items) {
        const price = Number(item.price)
        const quantity = Number(item.quantity)
        const tier = tierOfItem(item, orderTier)
        const multiplier = tierMultiplier(tier, adminOrderSetting)

        // Rounding stays INSIDE the per-piece unit price, before quantity and
        // before the tier multiplier — exactly where it was. Moving it would
        // change existing totals.
        const unit = roundToNearestHundred(price * serviceTypeMultiplier)
        const base = unit * quantity
        const line = base * multiplier

        total += line
        itemsBase += base
        tiersUsed.add(tier)
        lines.push({
            type: item.type,
            quantity,
            serviceTier: tier,
            unitPrice: unit,
            basePrice: base,
            tierMultiplier: multiplier,
            linePrice: line,
        })
    }

    return {
        total,
        itemsBase,
        tierUplift: total - itemsBase,
        lines,
        tiersUsed: [...tiersUsed],
        // True when the order is not all one tier — the receipt should then
        // show the per-item breakdown rather than a single "Premium" badge.
        isMixedTier: tiersUsed.size > 1,
    }
}

module.exports = { tierMultiplier, tierOfItem, priceItems, NO_UPLIFT }
