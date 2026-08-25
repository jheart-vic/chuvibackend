// Phase B read-only answers — order status, wallet balance, offers, referral
// info, pricing, turnaround, service info, policy, payment status, reward status.
// Every reply is built ONLY from approved data (never invents); policy returns
// null → the router hands off. Extracted verbatim from botOrchestrator.service.js
// and mixed onto its prototype, so the internal cross-calls (this.bookingGuide,
// this._readinessAndDispatchLine, this._extractItemName) work unchanged.
const OfferService = require('../offer.service')
const ReferralService = require('../referral.service')
const BookOrderModel = require('../../models/bookOrder.model')
const WalletModel = require('../../models/wallet.model')
const WalletCreditModel = require('../../models/walletCredit.model')
const AdminSettingModel = require('../../models/adminSetting.model')
const OrderItemModel = require('../../models/orderItem.model')
const { roundToNearestHundred } = require('../../util/helper')
const {
    BOT_INTENT,
    CREDIT_STATUS,
    PAYMENT_ORDER_STATUS,
    PICKUP_STATUS,
    DELIVERY_STATUS,
    ORDER_STATUS,
    REFERRAL_REWARD_STATUS,
} = require('../../util/constants')
const { naira, STAGE_EXPLAIN } = require('./format')

module.exports = {
    // Returns { replies, state? }. When the order is overdue or the customer is
    // asking about a delay, it appends an empathetic line + a handoff offer (a
    // "yes" next turn hands off) — it NEVER invents a reason for the delay.
    async orderStatusReply(userId, slots, text, { allowHandoffOffer = true } = {}) {
        const query = { userId }
        if (slots.orderNumber) query.oscNumber = String(slots.orderNumber).trim()
        const order = await BookOrderModel.findOne(query).sort({ createdAt: -1 }).lean()
        if (!order) {
            return {
                replies: [
                    slots.orderNumber
                        ? `I couldn't find an order ${slots.orderNumber} on your account.`
                        : "I couldn't find any orders on your account yet. Ready to place one? " +
                              this.bookingGuide(),
                ],
            }
        }
        const status = order.stage?.status || 'pending'
        const explain = STAGE_EXPLAIN[status]
        const bits = [
            explain
                ? `Order ${order.oscNumber}: your laundry is ${explain} (*${status.replace(/-/g, ' ')}*).`
                : `Order ${order.oscNumber}: *${status.replace(/-/g, ' ')}*`,
            order.serviceType ? `Service: ${order.serviceType}` : null,
            order.amount != null ? `Total: ${naira(order.amount)}` : null,
            order.deliveryDate
                ? `Estimated delivery: ${new Date(order.deliveryDate).toDateString()}`
                : null,
        ].filter(Boolean)
        let reply = bits.join('\n')

        // Answer a specific "are they ready?" / "has the rider left?" sub-question
        // straight from the record — never guess a state the system hasn't set.
        const line = this._readinessAndDispatchLine(order, status, text)
        if (line) reply += `\n${line}`

        const done = ['delivered', 'cancelled'].includes(status)
        const overdue =
            !done &&
            order.deliveryDate &&
            new Date(order.deliveryDate) < new Date()
        const asksAboutDelay =
            /\b(delay|delayed|late|overdue|taking (too |so )?long|still (not|haven'?t|isn'?t)|why.*(not|isn'?t).*(ready|delivered|here|come|arriv))\b/i.test(
                String(text || ''),
            )
        if (allowHandoffOffer && !done && (overdue || asksAboutDelay)) {
            reply +=
                "\n\nI'm sorry it's taking longer than expected. Would you like me to connect you to a Customer Experience officer?"
            return {
                replies: [reply],
                state: { intent: BOT_INTENT.ORDER_STATUS, step: 'offered-handoff', slots: {} },
            }
        }
        return { replies: [reply] }
    },

    // Loose yes-detector for the "connect you to a person?" offer.
    async walletBalance(userId) {
        const wallet = await WalletModel.findOne({ userId }).lean()
        const cash = wallet?.balance || 0
        const credits = await WalletCreditModel.find({
            userId,
            status: CREDIT_STATUS.ACTIVE,
            expiresAt: { $gt: new Date() },
        }).lean()
        const creditTotal = credits.reduce((s, c) => s + (c.remaining || 0), 0)
        const lines = [
            `Wallet balance: ${naira(cash)}`,
            `Reward credit: ${naira(creditTotal)}${credits.length ? ` (${credits.length} active)` : ''}`,
        ]
        return lines.join('\n')
    },

    async viewOffers(userId) {
        const page = await OfferService.getCustomerOffers(userId)
        const rewards = page?.rewards || page?.yourRewards || []
        const promos = page?.promos || page?.currentPromotions || []
        if (!rewards.length && !promos.length) {
            return 'You have no active offers right now. Keep ordering (and referring friends) to unlock rewards!'
        }
        const names = []
        for (const r of rewards) names.push(`• ${r.offerId?.name || r.name || 'Reward'} (yours)`)
        for (const p of promos) names.push(`• ${p.name || 'Promotion'}`)
        return `Here are your current offers:\n${names.join('\n')}`
    },

    async referralInfo(userId) {
        const page = await ReferralService.getReferralPage(userId)
        const lvl = page.level || {}
        const lines = [
            `Your referral code: ${page.referralCode}`,
            `Share link: ${page.referralLink}`,
            lvl.name ? `Level: ${lvl.name} (${lvl.rewardPercent}% reward)` : null,
            `Successful referrals: ${page.totalSuccessfulReferrals}` +
                (lvl.lifetimeReferrals != null ? ` lifetime, ${lvl.monthlyReferrals} this month` : ''),
        ].filter(Boolean)
        if (lvl.nextLevel) {
            lines.push(
                `${lvl.nextLevel.referralsToGo} more referral(s) to reach ${lvl.nextLevel.name}.`,
            )
        }
        return lines.join('\n')
    },

    // ─── Phase B: read-only answers from approved data (never invents) ────────

    // Builds a targeted readiness / dispatch line for order-status when the
    // customer asked "are they ready?" or "has the rider left?". Returns null
    // when neither was asked. Reads only real record fields.
    _readinessAndDispatchLine(order, status, text) {
        const t = String(text || '')
        const asksReady = /\b(ready|done|finished|ready yet|prepared)\b/i.test(t)
        const asksRider =
            /\b(rider|dispatch|dispatched|left|on the way|out for delivery|coming|come|pick(?:ed)?\s*up)\b/i.test(t)
        if (!asksReady && !asksRider) return null

        if (asksRider) {
            const pickup = order.dispatchDetails?.pickup?.status
            const delivery = order.dispatchDetails?.delivery?.status
            if (status === ORDER_STATUS.DELIVERED)
                return 'Your order has already been delivered.'
            if (
                status === ORDER_STATUS.OUT_FOR_DELIVERY ||
                delivery === DELIVERY_STATUS.OUT_FOR_DELIVERY
            )
                return 'Yes — a rider is out delivering your order now.'
            if (
                [PICKUP_STATUS.PICKUP_IN_PROGRESS, PICKUP_STATUS.PICKED_UP].includes(pickup)
            )
                return 'A rider is currently handling your pickup.'
            if (status === ORDER_STATUS.READY)
                return "Not yet — it's ready and waiting to be dispatched for delivery."
            return "Not yet — a rider hasn't been dispatched; your order is still being processed."
        }

        // readiness
        if (status === ORDER_STATUS.READY) return 'Yes — it’s ready. ✅'
        if (status === ORDER_STATUS.OUT_FOR_DELIVERY)
            return 'It’s ready and out for delivery right now.'
        if (status === ORDER_STATUS.DELIVERED) return 'It’s already been delivered.'
        return 'Not yet — it’s still being worked on.'
    },

    // "How much is a trouser?" / "your prices". Per-piece classic price =
    // roundToNearestHundred(item.price × serviceType.pricePerPiece) — exactly the
    // booking math, so the quote can never drift from what they'd be charged.
    async pricingReply(text, slots) {
        const setting = await AdminSettingModel.findOne({}).lean()
        const items = await OrderItemModel.find({}).lean()
        const svc =
            (setting?.serviceTypes || []).find((s) => s.name === 'wash-and-iron') ||
            (setting?.serviceTypes || [])[0] ||
            null
        const perPiece = (item) =>
            svc ? roundToNearestHundred((item.price || 0) * (svc.pricePerPiece || 0)) : null
        const premium = setting?.premiumServiceTierCharge
        const vip = setting?.vipServiceTierCharge
        const tierNote =
            premium || vip
                ? ` Premium${premium ? ` (×${premium})` : ''} and VIP${vip ? ` (×${vip})` : ''} tiers cost more, and express/same-day add a surcharge.`
                : ' Premium/VIP tiers and express/same-day delivery cost a little more.'

        const asked = (slots?.itemName || this._extractItemName(text, items) || '')
            .toLowerCase()
            .trim()
        if (asked && items.length) {
            const match =
                items.find((i) => (i.name || '').toLowerCase() === asked) ||
                items.find(
                    (i) =>
                        asked.includes((i.name || '').toLowerCase()) ||
                        (i.name || '').toLowerCase().includes(asked),
                )
            if (match && perPiece(match) != null) {
                return `A ${match.name} is ${naira(perPiece(match))} per piece (classic${svc ? `, ${svc.name}` : ''}).${tierNote} I can give you the exact total when you book.`
            }
        }

        // general price list
        if (!items.length || !svc) {
            return "I can't load our price list right now — I can connect you to a person, or you can start a booking and you'll see the exact quote before you confirm."
        }
        const sample = items
            .slice(0, 6)
            .map((i) => `• ${i.name}: ${naira(perPiece(i))}`)
        const fees = []
        if (setting?.pickupFee != null) fees.push(`pickup ${naira(setting.pickupFee)}`)
        if (setting?.deliveryFee != null) fees.push(`delivery ${naira(setting.deliveryFee)}`)
        const lines = ['Here are some of our per-piece prices (classic tier):', ...sample]
        if (fees.length) lines.push(`Pickup/delivery: ${fees.join(', ')}.`)
        lines.push(`${tierNote.trim()} Tell me your items and I can work out an exact quote.`)
        return lines.join('\n')
    },

    // "How many days does it take?" — general turnaround, plus the ETA of the
    // customer's active order if they have one.
    async turnaroundReply(userId) {
        const setting = await AdminSettingModel.findOne({}).lean()
        const days = setting?.standardDeliveryPeriod ?? 2
        const lines = [
            `Standard delivery takes about ${days} day${days === 1 ? '' : 's'}.`,
            'Express is faster, and same-day is available if you book before 10am.',
        ]
        try {
            const order = await BookOrderModel.findOne({
                userId,
                'stage.status': { $nin: [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED] },
            })
                .sort({ createdAt: -1 })
                .lean()
            if (order?.deliveryDate) {
                lines.push(
                    `Your current order ${order.oscNumber} is estimated for ${new Date(order.deliveryDate).toDateString()}.`,
                )
            }
        } catch (_) {
            /* best-effort */
        }
        return lines.join('\n')
    },

    // "What do you offer / how does it work?" — services, tiers, speeds.
    async serviceInfoReply() {
        const setting = await AdminSettingModel.findOne({}).lean()
        const services = (setting?.serviceTypes || []).map((s) => s.name).join(', ')
        return [
            `We offer: ${services || 'wash & iron, wash only, iron only, dry clean'}.`,
            'Three service tiers: classic (standard care), premium and VIP (extra care, priced higher).',
            'Delivery speeds: standard, express, and same-day (book before 10am for same-day).',
            'We can pick up and deliver too — I can guide you through booking whenever you’re ready.',
        ].join('\n')
    },

    // Payment / cancellation / pickup policy — answers ONLY from established,
    // approved facts already in the system. Returns null for anything else, so
    // the caller hands off instead of inventing policy.
    async policyReply(text) {
        const t = String(text || '').toLowerCase()
        const setting = await AdminSettingModel.findOne({}).lean()
        if (/\b(pay|payment|method|transfer|card|bank|paystack)\b/.test(t)) {
            return 'You can pay by card or bank transfer in the app, or from your Chuvi wallet. Payment is confirmed automatically once it goes through.'
        }
        if (/\b(cancel|cancellation)\b/.test(t)) {
            const mins = setting?.orderCancellationGraceMinutes ?? 15
            return `You can cancel free of charge within about ${mins} minutes of placing an order, before we start processing. After that, or once your items are with us, reach out and we’ll help. Refunds go back to your Chuvi wallet.`
        }
        if (/\brefund\b/.test(t)) {
            return 'Refunds for cancelled orders go back to your Chuvi wallet. For anything else about a refund, I can connect you to a person.'
        }
        if (/\b(pickup|pick up|delivery|deliver)\b/.test(t)) {
            const p = setting?.pickupFee
            const d = setting?.deliveryFee
            const fee =
                p != null || d != null
                    ? ` (pickup ${naira(p)}, delivery ${naira(d)})`
                    : ''
            return `We can pick up and deliver your laundry${fee}. You choose your address, date and a time slot when you book.`
        }
        return null // not an approved fact we can answer → hand off
    },

    // "I paid already" — read the payment record; never accuse, offer a human
    // when the system hasn't confirmed it.
    async paymentStatusReply(userId, slots) {
        const query = { userId }
        if (slots?.orderNumber) query.oscNumber = String(slots.orderNumber).trim()
        const order = await BookOrderModel.findOne(query).sort({ createdAt: -1 }).lean()
        if (!order) {
            return {
                replies: [
                    "I couldn't find an order to check a payment on. If you just placed one, give it a moment and try again.",
                ],
            }
        }
        if (order.paymentStatus === PAYMENT_ORDER_STATUS.SUCCESS) {
            return {
                replies: [`Payment for order ${order.oscNumber} is confirmed — you’re all set. ✅`],
            }
        }
        return {
            replies: [
                `I don’t see a confirmed payment on order ${order.oscNumber} yet. If you just paid, it can take a short while to reflect. Would you like me to connect you to a person to check?`,
            ],
            state: { intent: BOT_INTENT.PAYMENT_STATUS, step: 'offered-handoff', slots: {} },
        }
    },

    // "My friend used my code — where's my reward?" — read the referral ledger
    // and explain each status. Never releases a reward (the system does that).
    async rewardStatusReply(userId) {
        const page = await ReferralService.getReferralPage(userId)
        const history = page.history || []
        if (!history.length) {
            return `You don’t have any referrals yet. Share your code ${page.referralCode} — when a friend places their first order and it’s delivered, your reward is released automatically.`
        }
        const granted = history.filter(
            (h) => h.rewardStatus === REFERRAL_REWARD_STATUS.GRANTED,
        )
        const deferred = history.filter(
            (h) => h.rewardStatus === REFERRAL_REWARD_STATUS.DEFERRED,
        )
        const waiting = history.filter(
            (h) => h.rewardStatus === REFERRAL_REWARD_STATUS.NONE,
        )
        const lines = [
            `You’ve earned ${naira(page.totalRewardsEarned)} from ${granted.length} successful referral(s).`,
        ]
        if (waiting.length)
            lines.push(
                `${waiting.length} referral(s) still pending — a reward is released once your friend’s first order is delivered.`,
            )
        if (deferred.length)
            lines.push(
                `${deferred.length} reward(s) are on hold while a complaint on your account is being resolved.`,
            )
        lines.push(
            'I never release rewards myself — the system does that automatically once they qualify.',
        )
        return lines.join('\n')
    },
}
