// Payment for a booking (Part G) + the standalone "use my balance" apply-payment
// flow. Both settle the customer's OWN order from their OWN wallet (credits first
// when opted in, then cash) via the existing WalletService.payWithWallet, or hand
// a Paystack link the customer authorises — the bot gains NO new money authority
// and never confirms a card payment (the webhook does). Extracted verbatim from
// botOrchestrator.service.js and mixed onto its prototype (this._parsePaymentChoice,
// isAffirmative/isNegative etc. still resolve there). The booking flow calls
// _bookingPaymentStep / _bookingCreditOptinStep; both flows share _settleWalletCharge
// and _walletAvailable.
const WalletService = require('../wallet.service')
const PaystackService = require('../paystack.service')
const WalletCreditService = require('../walletCredit.service')
const WalletModel = require('../../models/wallet.model')
const BookOrderModel = require('../../models/bookOrder.model')
const createAuditLog = require('../../util/createAuditLog')
const {
    BOT_INTENT,
    BILLING_TYPE,
    AUDIT_LOG_CATEGORIES,
    PAYMENT_ORDER_STATUS,
    ORDER_STATUS,
} = require('../../util/constants')
const { naira } = require('./format')

module.exports = {
    async _bookingPaymentStep({ userId, text, slots }) {
        const orderId = slots?.payOrderId
        const amount = Number(slots?.payAmount) || 0
        const osc = slots?.payOsc || ''
        const stay = {
            intent: BOT_INTENT.BOOKING_GUIDE,
            step: 'collect-payment',
            slots: { payOrderId: orderId, payAmount: amount, payOsc: osc },
        }
        if (!orderId) {
            return {
                replies: ['I lost track of that order, sorry. Shall I connect you to a member of staff? (yes/no)'],
                state: { intent: BOT_INTENT.BOOKING_GUIDE, step: 'offered-handoff', slots: {} },
            }
        }

        const choice = this._parsePaymentChoice(text)

        if (choice === 'wallet') {
            const { cash, creditTotal, available } = await this._walletAvailable(userId)
            if (available < amount) {
                return {
                    replies: [
                        `Your wallet has ${naira(available)}, which isn't enough for the ${naira(amount)} total. You can top up in the app, pay by card, or I can connect you to a person.`,
                    ],
                    state: stay,
                }
            }
            // Reward credit present → ASK before spending it (opt-in), rather than
            // silently using it. No credit → go straight to a cash charge.
            if (creditTotal > 0) {
                return {
                    replies: [`You have ${naira(creditTotal)} in reward credit. Use it toward this ${naira(amount)}? (yes/no)`],
                    state: {
                        intent: BOT_INTENT.BOOKING_GUIDE,
                        step: 'confirm-credit',
                        slots: { payOrderId: orderId, payAmount: amount, payOsc: osc, payCash: cash },
                    },
                }
            }
            const r = await this._settleWalletCharge({ userId, orderId, useCredit: false })
            return r.ok
                ? { replies: [this._walletPaidReply(amount, osc, r.creditApplied)] }
                : { replies: [`I couldn't complete the wallet payment — ${r.error}. You can pay by card instead, or I can connect you to a person.`], state: stay }
        }

        if (choice === 'card') {
            let res
            try {
                res = await new PaystackService().initializePayment({
                    body: { transactionType: 'order', orderId },
                    user: { id: userId },
                })
            } catch (e) {
                res = { success: false, data: { error: e.message } }
            }
            const url = res?.success && res.data?.message?.data?.authorization_url
            if (url) {
                return {
                    replies: [
                        `Great — tap here to pay ${naira(amount)} securely for order ${osc}:\n${url}\nYour order is confirmed the moment the payment goes through. You can say "I've paid" or ask for your order status anytime.`,
                    ],
                }
            }
            const cerr = (res && res.data && res.data.error) || 'I could not create the payment link'
            return {
                replies: [`Sorry — ${cerr}. You can pay from your wallet instead, or I can connect you to a person.`],
                state: stay,
            }
        }

        // unclear reply → ask the method again (the loop guard escalates if it repeats)
        return {
            replies: [`Would you like to pay for order ${osc} (${naira(amount)}) from your wallet, or by card?`],
            state: stay,
        }
    },

    // Shared wallet settlement: charge (credit-first ONLY when useCredit), write a
    // WALLET audit, and stamp the order billingType so reporting matches. Returns
    // { ok:true, creditApplied } | { ok:false, error }. Callers phrase their own
    // success line. Used by booking + apply-payment.
    async _settleWalletCharge({ userId, orderId, useCredit }) {
        let result
        try {
            result = await new WalletService().payWithWallet({
                body: { bookOrderId: orderId, useCredit: !!useCredit },
                user: { id: userId },
            })
        } catch (e) {
            result = { success: false, data: { error: e.message } }
        }
        if (!result?.success) {
            return { ok: false, error: (result && result.data && result.data.error) || 'the payment could not be completed' }
        }
        try {
            await createAuditLog({
                userId,
                action: `Bot settled order ${orderId} from wallet (useCredit=${!!useCredit})`,
                category: AUDIT_LOG_CATEGORIES.WALLET,
                orderId,
            })
        } catch (_) {
            /* audit best-effort; the WalletTransaction is the money record */
        }
        try {
            await BookOrderModel.findByIdAndUpdate(orderId, {
                billingType: BILLING_TYPE.PAY_FROM_WALLET,
            })
        } catch (_) {
            /* label only — the WalletTransaction is the money record */
        }
        return { ok: true, creditApplied: (result.data && result.data.creditApplied) || 0 }
    },

    // Booking "Paid ✅" line with an optional reward-credit note.
    _walletPaidReply(amount, osc, creditApplied) {
        const note = creditApplied > 0 ? ` (${naira(creditApplied)} from your reward credit)` : ''
        return `Paid ✅ — order ${osc} is confirmed and your wallet covered ${naira(amount)}${note}. We'll arrange your pickup shortly!`
    },

    // Credit opt-in for a booking wallet payment: yes → spend reward credit first;
    // no → cash only (if cash covers), else route back to choose credit or card.
    async _bookingCreditOptinStep({ userId, text, slots }) {
        const orderId = slots?.payOrderId
        const amount = Number(slots?.payAmount) || 0
        const osc = slots?.payOsc || ''
        const cash = Number(slots?.payCash) || 0
        const backToPay = {
            intent: BOT_INTENT.BOOKING_GUIDE,
            step: 'collect-payment',
            slots: { payOrderId: orderId, payAmount: amount, payOsc: osc },
        }
        const failReply = (err) => ({
            replies: [`I couldn't complete it — ${err}. You can pay by card, or I can connect you to a person.`],
            state: backToPay,
        })
        if (this.isAffirmative(text)) {
            const r = await this._settleWalletCharge({ userId, orderId, useCredit: true })
            return r.ok ? { replies: [this._walletPaidReply(amount, osc, r.creditApplied)] } : failReply(r.error)
        }
        if (this.isNegative(text)) {
            if (cash >= amount) {
                const r = await this._settleWalletCharge({ userId, orderId, useCredit: false })
                return r.ok ? { replies: [this._walletPaidReply(amount, osc, r.creditApplied)] } : failReply(r.error)
            }
            return {
                replies: [`No problem — but your cash balance (${naira(cash)}) alone won't cover ${naira(amount)}. Would you like to use your reward credit after all, or pay by card?`],
                state: backToPay,
            }
        }
        // unclear → re-ask (loop guard escalates if it repeats)
        return {
            replies: [`Use your reward credit toward order ${osc}? (yes/no)`],
            state: {
                intent: BOT_INTENT.BOOKING_GUIDE,
                step: 'confirm-credit',
                slots: { payOrderId: orderId, payAmount: amount, payOsc: osc, payCash: cash },
            },
        }
    },

    // Available wallet value = cash balance + usable reward credit. Uses the
    // CANONICAL credit source (WalletCreditService.getCreditBalances) so this
    // "do you have enough?" check can never drift from what chargeWalletForOrder
    // actually consumes (same ACTIVE / remaining>0 / not-expired filter).
    async _walletAvailable(userId) {
        const wallet = await WalletModel.findOne({ userId }).lean()
        const cash = wallet?.balance || 0
        const { total: creditTotal } = await WalletCreditService.getCreditBalances(userId)
        return { cash, creditTotal, available: cash + creditTotal }
    },

    // "Use my balance / wallet" — settle the customer's latest UNPAID order from
    // their wallet (credits first, then cash), behind an explicit confirm. Goes
    // through the existing WalletService.payWithWallet path (same charge/receipt/
    // notification as the app). The bot never edits balances or adds money — it
    // only spends what's already there, on the customer's own order.
    async applyPaymentFlow({ convo, userId, text, slots, step }) {
        // apply-payment success/failure reply (own wording; shares the charge helper)
        const applyPaidReply = async (orderId, useCredit) => {
            const r = await this._settleWalletCharge({ userId, orderId, useCredit })
            if (r.ok) {
                const note = r.creditApplied > 0 ? ` (${naira(r.creditApplied)} from your reward credit)` : ''
                return { replies: [`Paid ✅ — your wallet covered the order${note}. Thank you!`] }
            }
            return {
                replies: [`I couldn't complete it — ${r.error}. You can top up your wallet in the app, or I can connect you to a person.`],
                state: { intent: BOT_INTENT.APPLY_PAYMENT, step: 'offered-handoff', slots: {} },
            }
        }

        // confirm turn: on yes, ask the credit opt-in first (only if they have credit)
        if (step === 'confirm-pay') {
            const orderId = slots?.payOrderId
            const amount = Number(slots?.payAmount) || 0
            const osc = slots?.payOsc || ''
            if (this.isNegative(text)) {
                return { replies: ["Okay — I won't touch your wallet. Anything else?"] }
            }
            if (this.isAffirmative(text) && orderId) {
                const { cash, creditTotal } = await this._walletAvailable(userId)
                if (creditTotal > 0) {
                    return {
                        replies: [`You have ${naira(creditTotal)} in reward credit. Use it toward this ${naira(amount)}? (yes/no)`],
                        state: { intent: BOT_INTENT.APPLY_PAYMENT, step: 'confirm-pay-credit', slots: { payOrderId: orderId, payAmount: amount, payOsc: osc, payCash: cash } },
                    }
                }
                return await applyPaidReply(orderId, false)
            }
            // unclear reply → fall through and re-summarise
        }

        // credit opt-in turn: yes → credit-first; no → cash only (if it covers)
        if (step === 'confirm-pay-credit') {
            const orderId = slots?.payOrderId
            const amount = Number(slots?.payAmount) || 0
            const cash = Number(slots?.payCash) || 0
            if (this.isAffirmative(text) && orderId) {
                return await applyPaidReply(orderId, true)
            }
            if (this.isNegative(text) && orderId) {
                if (cash >= amount) return await applyPaidReply(orderId, false)
                return {
                    replies: [`Without your reward credit, your ${naira(cash)} cash won't cover ${naira(amount)}. You can top up in the app, or I can connect you to a person.`],
                    state: { intent: BOT_INTENT.APPLY_PAYMENT, step: 'offered-handoff', slots: {} },
                }
            }
            return {
                replies: ['Use your reward credit toward the order? (yes/no)'],
                state: { intent: BOT_INTENT.APPLY_PAYMENT, step: 'confirm-pay-credit', slots: { payOrderId: orderId, payAmount: amount, payOsc: slots?.payOsc || '', payCash: cash } },
            }
        }

        // find the latest unpaid, non-cancelled order
        const order = await BookOrderModel.findOne({
            userId,
            paymentStatus: { $ne: PAYMENT_ORDER_STATUS.SUCCESS },
            'stage.status': { $ne: ORDER_STATUS.CANCELLED },
        })
            .sort({ createdAt: -1 })
            .lean()
        if (!order) {
            return {
                replies: ["You don't have any unpaid orders right now — nothing to pay. Anything else?"],
            }
        }
        if (!order.amount || order.amount <= 0) {
            return {
                replies: [`Order ${order.oscNumber} is already fully covered — there's nothing left to pay.`],
            }
        }

        // available wallet value (cash + active reward credit)
        const { cash, creditTotal, available } = await this._walletAvailable(userId)

        const lines = [
            `Order ${order.oscNumber} comes to ${naira(order.amount)}.`,
            `Your wallet has ${naira(cash)} cash${creditTotal ? ` + ${naira(creditTotal)} reward credit` : ''} (${naira(available)} available).`,
        ]
        if (available < order.amount) {
            lines.push(
                `That's not quite enough to cover it. You can top up in the app${creditTotal ? ' — your reward credit is used first' : ''}. Would you like me to connect you to a person?`,
            )
            return {
                replies: [lines.join('\n')],
                state: { intent: BOT_INTENT.APPLY_PAYMENT, step: 'offered-handoff', slots: {} },
            }
        }
        lines.push('Shall I pay it from your wallet now? (yes/no)')
        return {
            replies: [lines.join('\n')],
            state: {
                intent: BOT_INTENT.APPLY_PAYMENT,
                step: 'confirm-pay',
                slots: { payOrderId: String(order._id), payAmount: order.amount, payOsc: order.oscNumber },
            },
        }
    },
}
