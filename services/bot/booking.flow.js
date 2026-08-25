// Phase C guided booking — multi-turn slot-fill → estimate → explicit confirm →
// place through the EXACT existing path (BookOrderService.createOrder →
// postBookOrder), so pricing/validation/credit/notifications are identical to the
// app. Billing precedence in _placeBooking: active subscription first (a rejected
// plan attempt creates NO order), else pay-per-item → collect payment. Extracted
// verbatim and mixed onto the orchestrator prototype, so its many cross-calls
// (parsers, copy, and the payment flow's _bookingPaymentStep/_bookingCreditOptinStep)
// resolve there unchanged. The bot NEVER places an order without a "yes".
const BookOrderService = require('../bookOrder.service')
const BotContextService = require('../botContext.service')
const AdminSettingModel = require('../../models/adminSetting.model')
const OrderItemModel = require('../../models/orderItem.model')
const SubscriptionModel = require('../../models/subscription.model')
const { BOT_INTENT, BILLING_TYPE, DELIVERY_SPEED } = require('../../util/constants')
const { naira } = require('./format')

module.exports = {
    async bookingFlow({ convo, userId, text, slots, step }) {
        // Payment step (after the order is placed) — handled FIRST so a
        // "wallet"/"card" reply is never mis-parsed as items/service, and so we
        // skip the catalog/settings reads the slot-fill needs.
        if (step === 'collect-payment') {
            return await this._bookingPaymentStep({ userId, text, slots })
        }
        if (step === 'confirm-credit') {
            return await this._bookingCreditOptinStep({ userId, text, slots })
        }

        const setting = await AdminSettingModel.findOne({}).lean()
        const catalog = await OrderItemModel.find({}).lean()
        const memory = BotContextService.loadMemory(convo)
        const ref = BotContextService.detectReferent(text)

        // Accumulated booking data persisted under distinct b* keys (so the
        // per-turn classifier slots never overwrite them with blanks).
        let bItems = slots.bItems || null
        let bServiceType = slots.bServiceType || null
        let bAddress = slots.bPickupAddress || null
        let bDate = slots.bDatePhrase || null
        let bTime = slots.bTime || null
        let bTimeAuto = slots.bTimeAuto || false
        let bPhone = slots.bPhone || null
        let bQtyConfirmed = slots.bQtyConfirmed || false
        let bSpeed = slots.bSpeed || null
        let unmatched = []

        // ── ingest anything this turn provided ──────────────────────────────
        const rawItems =
            slots.items && slots.items.length
                ? slots.items
                : this._parseItemsFromText(text, catalog)
        if (rawItems && rawItems.length) {
            const resolved = this._resolveBookingItems(rawItems, catalog)
            if (resolved.priced.length) bItems = resolved.priced
            unmatched = resolved.unmatched
        }
        if (!bServiceType) bServiceType = this._matchServiceType(text, setting)
        if (!bAddress) {
            bAddress =
                slots.address ||
                (step === 'collect-address'
                    ? this.cleanDetailValue('pickupAddress', text)
                    : null)
        }
        // Date/time (Part A): prefer the LLM's structured slots, then a keyword
        // parse of the raw text — NEVER dump the whole message as the date (that
        // was the "When should we come?" loop). Parsed every turn so a multi-slot
        // answer ("tomorrow morning, same address") fills date + time at once.
        const dt = this._parseDateTimeFromText(text)
        if (!bDate) bDate = slots.pickupDate || dt.datePhrase || null
        if (!bTime) bTime = slots.pickupTime || dt.timePhrase || null
        if (!bPhone && step === 'collect-phone') {
            const m = String(text || '').match(/(\+?\d[\d\s-]{6,}\d)/)
            if (m) bPhone = m[1].replace(/\s+/g, '')
        }

        // "the usual" / "same as last time" → prefill from the remembered order
        if ((ref.theUsual || ref.sameAsLast) && memory.lastOrder) {
            if ((!bItems || !bItems.length) && memory.lastOrder.items?.length) {
                const r = this._resolveBookingItems(memory.lastOrder.items, catalog)
                if (r.priced.length) bItems = r.priced
            }
            if (!bServiceType) bServiceType = memory.lastOrder.serviceType || null
            if (!bAddress) bAddress = memory.lastOrder.pickupAddress || null
        }

        const persist = (nextStep) => ({
            intent: BOT_INTENT.BOOKING_GUIDE,
            step: nextStep,
            slots: {
                bItems,
                bServiceType,
                bPickupAddress: bAddress,
                bDatePhrase: bDate,
                bTime,
                bTimeAuto,
                bPhone,
                bQtyConfirmed,
                bSpeed,
            },
        })

        // Human-readable item list, e.g. "50 shirts, 3 trousers".
        const describeItems = () =>
            (bItems || [])
                .map((i) => `${i.quantity} ${i.type}${i.quantity > 1 ? 's' : ''}`)
                .join(', ')

        // Large-quantity sanity confirm (guards typos like 50 vs 5). Asked once,
        // right after items are captured, before we price/continue.
        const LARGE_QTY = 30
        if (step === 'confirm-qty') {
            if (this.isNegative(text)) {
                bItems = null
                bQtyConfirmed = false
                return {
                    replies: ['No problem — tell me the items and how many again, e.g. "6 shirts, 3 trousers".'],
                    state: persist('collect-items'),
                }
            }
            if (this.isAffirmative(text)) {
                bQtyConfirmed = true // fall through and continue the flow
            } else {
                return {
                    replies: [`Just to confirm the quantities — ${describeItems()}? (yes/no)`],
                    state: persist('confirm-qty'),
                }
            }
        }
        if (bItems && bItems.length && !bQtyConfirmed && bItems.some((i) => i.quantity > LARGE_QTY)) {
            return {
                replies: [`Just to confirm — that's ${describeItems()}. That's a large order, so I want to be sure before I price it. (yes/no)`],
                state: persist('confirm-qty'),
            }
        }

        // ── confirm step: yes places it, no cancels, anything else re-checks ──
        if (step === 'confirm') {
            if (this.isNegative(text)) {
                return {
                    replies: ["No problem — I've cancelled that. Tell me what you'd like to change or add."],
                }
            }
            if (this.isAffirmative(text)) {
                return await this._placeBooking({
                    userId, bItems, bServiceType, bAddress, bDate, bTime, bTimeAuto, bPhone, bSpeed,
                })
            }
            // otherwise treat it as a correction and fall through to re-summarise
        }

        // ── ask for the first missing piece ─────────────────────────────────
        if (!bItems || !bItems.length) {
            const lead = step ? '' : `${this.bookingGuide()}\n\n`
            const note = unmatched.length
                ? `I can't price "${unmatched.join(', ')}" here. `
                : ''
            return {
                replies: [
                    `${lead}${note}What would you like cleaned? Tell me the items and how many — e.g. "6 shirts, 3 trousers".`,
                ],
                state: persist('collect-items'),
            }
        }
        if (!bServiceType) {
            const opts = (setting?.serviceTypes || []).map((s) => s.name).join(', ') || 'wash-and-iron, washing-only, ironing-only, dry-clean'
            return {
                replies: [`Great. Which service would you like — ${opts}?`],
                state: persist('collect-service'),
            }
        }
        if (!bAddress) {
            return {
                replies: ['Where should we pick it up? Please send the pickup address.'],
                state: persist('collect-address'),
            }
        }
        // Part B — a DAY is enough; if no time is given we default a pickup window
        // (and say so at confirm) rather than trapping the customer on this step.
        if (!bDate) {
            return {
                replies: ['When should we come? A day is fine — e.g. "tomorrow" or "Saturday" — and add a rough time (morning/afternoon) if you have one.'],
                state: persist('collect-datetime'),
            }
        }
        if (!bTime) {
            bTime = this._defaultPickupWindow(setting)
            bTimeAuto = true
        }
        // Delivery speed — offer only what's available at THIS clock time (uses the
        // backend cutoff rule as the single source), with charge + ETA. Parses the
        // reply here so a multi-slot "tomorrow express" is caught too.
        if (!bSpeed) {
            const avail = this._availableSpeeds(setting)
            const availSpeeds = avail.map((s) => s.speed)
            const candidate = this._parseDeliverySpeed(text)
            if (candidate && availSpeeds.includes(candidate)) {
                bSpeed = candidate
            } else {
                const note =
                    candidate && !availSpeeds.includes(candidate)
                        ? `Sorry, ${candidate} isn't available right now (past today's cut-off). `
                        : ''
                return {
                    replies: [`${note}${this._speedOfferText(avail)}`],
                    state: persist('collect-speed'),
                }
            }
        }
        const defaults = await BotContextService.savedDefaults(userId)
        if (!bPhone && !defaults.phoneNumber) {
            return {
                replies: ['Lastly, what phone number should the rider call?'],
                state: persist('collect-phone'),
            }
        }

        // ── everything gathered → show summary + estimate, ask to confirm ────
        const estimate = this._bookingEstimate(bItems, bServiceType, setting, bSpeed)
        const itemsLine = bItems
            .map((i) => `${i.quantity} ${i.type}${i.quantity > 1 ? 's' : ''}`)
            .join(', ')
        const summary = [
            "Here's your booking:",
            `• Items: ${itemsLine}`,
            `• Service: ${bServiceType} (classic tier)`,
            `• Pickup: ${bAddress}${bDate ? `, ${bDate}` : ''}${bTime ? ` ${bTime}${bTimeAuto ? ' (default window — tell me if you’d prefer another time)' : ''}` : ''}`,
            `• Delivery: ${this._describeSpeed(bSpeed, setting)}`,
            `Estimated total: about ${naira(estimate)} — you'll see the exact amount once it's placed.`,
            'Shall I place it? (yes/no)',
        ].join('\n')
        return { replies: [summary], state: persist('confirm') }
    },

    // Build the payload and place the order through the shared booking path.
    // Billing precedence: (1) if the customer has an ACTIVE subscription, try to
    // cover it with their plan (reuses postBookOrder's own limit/heavy-item
    // validation — a rejected attempt creates NO order); (2) otherwise / on plan
    // rejection, place pay-per-item and collect payment (wallet or card).
    async _placeBooking({ userId, bItems, bServiceType, bAddress, bDate, bTime, bTimeAuto, bPhone, bSpeed }) {
        const defaults = await BotContextService.savedDefaults(userId)
        const phone = bPhone || defaults.phoneNumber
        const basePayload = {
            fullName: defaults.fullName || 'Customer',
            phoneNumber: phone,
            serviceType: bServiceType,
            serviceTier: 'classic',
            deliverySpeed: bSpeed || DELIVERY_SPEED.STANDARD,
            isDelivery: true,
            isPickUp: true,
            items: (bItems || []).map((i) => ({
                type: i.type,
                price: Math.round(i.price) || 0,
                quantity: Math.max(1, Math.round(i.quantity) || 1),
            })),
            pickupAddress: bAddress,
        }
        if (bTime) basePayload.pickupTime = bTime
        const day = this._resolvePickupDate(bDate)
        if (day) basePayload.pickupDate = day

        // (1) Subscriber → try the plan first.
        let subLead = ''
        const sub = await SubscriptionModel.findOne({ userId, status: 'active' }).lean()
        if (sub) {
            const subRes = await this._createOrderSafe(userId, {
                ...basePayload,
                billingType: BILLING_TYPE.PAY_FROM_SUBSCRIPTION,
            })
            if (subRes?.success) {
                const order = subRes.data?.order
                return {
                    replies: [
                        `Done! Order ${order?.oscNumber || ''} is placed and covered by your subscription ✅. We'll arrange your pickup shortly!`,
                    ],
                }
            }
            // Plan can't cover it (over monthly limit / heavy items / etc.) → fall
            // back to pay-per-item, telling the customer why in plain language.
            subLead = this._subFallbackLead(subRes?.data?.error)
        }

        // (2) Pay-per-item (default / fallback) → then collect payment.
        const result = await this._createOrderSafe(userId, {
            ...basePayload,
            billingType: BILLING_TYPE.PAY_PER_ITEM,
        })
        if (result?.success) {
            const order = result.data?.order
            const amount = Number(order?.amount) || 0
            const osc = order?.oscNumber || ''
            // Fully covered at creation (offer/credit) → nothing to collect.
            if (amount <= 0) {
                return {
                    replies: [
                        `${subLead}Done! Order ${osc} is placed and fully covered — nothing to pay ✅. We'll arrange your pickup shortly!`,
                    ],
                }
            }
            // Order exists but is UNPAID — drive payment instead of ending here,
            // and DON'T call it "done" until money is actually collected.
            return {
                replies: [
                    `${subLead}Your order ${osc} is placed and awaiting payment — total ${naira(amount)}. How would you like to pay — from your wallet, or by card?`,
                ],
                state: {
                    intent: BOT_INTENT.BOOKING_GUIDE,
                    step: 'collect-payment',
                    slots: {
                        payOrderId: String(order?._id || ''),
                        payAmount: amount,
                        payOsc: osc,
                    },
                },
            }
        }
        const err = result?.data?.error
        const msg = typeof err === 'string' ? err : 'something went wrong on our side'
        // Delivery-speed cutoff passed mid-chat (before 2pm/10am) or the speed is
        // at capacity → don't dead-end: send them back to pick another speed
        // (the offer will now exclude the unavailable one). Keeps all other slots.
        if (/before 10am|before 2pm|full capacity/i.test(msg)) {
            return {
                replies: [`${msg} Let's choose another delivery speed.`],
                state: {
                    intent: BOT_INTENT.BOOKING_GUIDE,
                    step: 'collect-speed',
                    slots: {
                        bItems,
                        bServiceType,
                        bPickupAddress: bAddress,
                        bDatePhrase: bDate,
                        bTime,
                        bTimeAuto: !!bTimeAuto,
                        bPhone,
                        bQtyConfirmed: true,
                        bSpeed: null,
                    },
                },
            }
        }
        return {
            replies: [
                `I couldn't place the order — ${msg}. Would you like me to connect you to a person?`,
            ],
            state: { intent: BOT_INTENT.BOOKING_GUIDE, step: 'offered-handoff', slots: {} },
        }
    },

    // Place an order through the exact production path, never throwing.
    async _createOrderSafe(userId, payload) {
        try {
            return await new BookOrderService().createOrder({ userId, payload })
        } catch (e) {
            return { success: false, data: { error: e.message } }
        }
    },

    // Friendly one-liner explaining why a subscriber's order fell back to
    // pay-as-you-go (from postBookOrder's own rejection reason).
    _subFallbackLead(error) {
        const e = String(error || '').toLowerCase()
        if (/heavy/.test(e)) return "Your plan doesn't cover heavy items, so this one is pay-as-you-go. "
        if (/limit|exceed/.test(e)) return "That's over your plan's items for this period, so this one is pay-as-you-go. "
        return 'This one is pay-as-you-go. '
    },
}
