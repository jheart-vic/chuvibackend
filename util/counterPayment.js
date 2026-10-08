// Counter / walk-in order payment (client item #8, 2026-10-08).
//
// WHAT WAS WRONG: `intake-user.createBookOrder` stamped every counter order
// `paymentStatus: SUCCESS` + `billingType: pay-per-item` and wrote ONE Payment
// row with the default method `paystack` — the one method a counter order can
// never be — attributed to the STAFF member, not the customer. Nothing touched
// the wallet, so a walk-in who wanted to pay from their balance could not: the
// order read paid while their balance was untouched. The client will not mark
// any counter order as wallet-paid until this exists.
//
// DESIGN NOTES
//  * Wallet movement is NOT reimplemented here. `WalletService.chargeWalletForOrder`
//    is the single owner of "charge this order against this wallet" (it applies
//    reward credits oldest-expiry-first when opted in, debits cash with a guarded
//    atomic $inc so there is no overdraw race, rolls the credits back if the cash
//    leg fails, and writes the WalletTransaction ledger line). Same lesson as
//    2.4: a second copy of the money code quietly undoes the first.
//  * Affordability is checked BEFORE the order is created (`planCounterPayment`),
//    so staff get "the wallet covers ₦3,500 of ₦5,000 — how is the rest paid?"
//    instead of an order that exists but is unpaid.
//  * Reward credit is OPT-IN (`useCredit`), exactly as the bot and the customer
//    app treat it. Staff must not silently spend a customer's reward.
//  * A short wallet is settled with a SECOND tender; both are recorded, so the
//    order carries the full story of how the money arrived.

const {
    PAYMENT_METHOD,
    COUNTER_PAYMENT_METHODS,
    COUNTER_PAYMENT_ALIASES,
    PAYMENT_ORDER_STATUS,
    BILLING_TYPE,
} = require('./constants')
const WalletModel = require('../models/wallet.model')
const PaymentModel = require('../models/payment.model')
const WalletCreditService = require('../services/walletCredit.service')
const { generateReferenceId } = require('./helper')

const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`

// The tender the counter screen should PRE-SELECT (client decision 2026-10-08:
// "make it mandatory" + "make cash the default"). Those two only coexist as a
// required field with a pre-selected choice — a server-side default would be
// the silent assumption that "mandatory" exists to prevent. Exported so the
// screen and the docs take it from one place.
const DEFAULT_COUNTER_METHOD = PAYMENT_METHOD.CASH

// Accepts what the counter screen is likely to send ("transfer", "Cash",
// "POS", "card") and returns the stored value, or null if it isn't a tender a
// counter order can use (e.g. `paystack` — that is the customer's own app).
function normalizeCounterMethod(raw) {
    if (!raw || typeof raw !== 'string') return null
    const key = raw.trim().toLowerCase()
    const mapped = COUNTER_PAYMENT_ALIASES[key] || key
    return COUNTER_PAYMENT_METHODS.includes(mapped) ? mapped : null
}

function methodLabel(method) {
    if (method === PAYMENT_METHOD.POS) return 'POS'
    if (method === PAYMENT_METHOD.BANK_TRANFER) return 'bank transfer'
    if (method === PAYMENT_METHOD.WALLET) return 'wallet'
    return 'cash'
}

const methodList = () =>
    COUNTER_PAYMENT_METHODS.map((m) => methodLabel(m)).join(', ')

// What the wallet can actually put towards this bill right now. Credits are
// only counted when the customer opted in, because they are only SPENT then —
// counting them otherwise would promise money the charge will not use.
async function walletCoverage({ customerId, useCredit }) {
    const wallet = await WalletModel.findOne({ userId: customerId }).lean()
    const cash = Math.max(0, wallet?.balance || 0)
    let credit = 0
    if (useCredit) {
        // walletCredit.service exports an INSTANCE, not the class.
        const balances = await WalletCreditService.getCreditBalances(customerId)
        credit = Math.max(0, balances?.total || 0)
    }
    return { cash, credit, usable: cash + credit }
}

// Decide (without moving anything) how `total` will be tendered.
// Returns { ok: false, error } with a sentence naming the real numbers, or
// { ok: true, plan } where plan.tenders is what settle() will record.
async function planCounterPayment({
    customerId,
    total,
    method,
    secondaryMethod,
    useCredit = false,
}) {
    const primary = normalizeCounterMethod(method)
    if (!primary) {
        return {
            ok: false,
            error: `"${method}" is not a counter payment method. Pick one of: ${methodList()}.`,
        }
    }

    const amount = Math.max(0, Number(total) || 0)
    if (amount <= 0) {
        // Nothing to collect (a fully discounted order). Record the choice but
        // never charge a wallet ₦0 — chargeWalletForOrder would write no line.
        return {
            ok: true,
            plan: { tenders: [], walletAmount: 0, creditOptIn: false, primary },
        }
    }

    if (primary !== PAYMENT_METHOD.WALLET) {
        return {
            ok: true,
            plan: {
                tenders: [{ method: primary, amount }],
                walletAmount: 0,
                creditOptIn: false,
                primary,
            },
        }
    }

    // ── wallet ───────────────────────────────────────────────────────────────
    if (!customerId) {
        return {
            ok: false,
            error:
                'This order has no customer account on file, so there is no wallet to charge. ' +
                `Take ${methodLabel(PAYMENT_METHOD.CASH)}, POS or a transfer, or register the customer first.`,
        }
    }

    const cover = await walletCoverage({ customerId, useCredit })
    const walletAmount = Math.min(cover.usable, amount)
    const shortfall = amount - walletAmount

    if (walletAmount <= 0) {
        return {
            ok: false,
            error: `That wallet has nothing available to spend on this ${naira(amount)} order${
                !useCredit && cover.cash === 0
                    ? ' (reward credit is not being used — tick "use reward credit" if they want it spent)'
                    : ''
            }. Take another payment method.`,
        }
    }

    const second = secondaryMethod ? normalizeCounterMethod(secondaryMethod) : null
    if (shortfall > 0) {
        if (!second) {
            return {
                ok: false,
                error: `The wallet covers ${naira(walletAmount)} of this ${naira(
                    amount,
                )} order. Choose how the remaining ${naira(
                    shortfall,
                )} is paid (cash, POS or transfer) and send it as secondaryPaymentMethod.`,
            }
        }
        if (second === PAYMENT_METHOD.WALLET) {
            return {
                ok: false,
                error: 'The remaining balance cannot be taken from the wallet again — it is already short. Use cash, POS or a transfer.',
            }
        }
    }

    const tenders = [{ method: PAYMENT_METHOD.WALLET, amount: walletAmount }]
    if (shortfall > 0) tenders.push({ method: second, amount: shortfall })

    return {
        ok: true,
        plan: {
            tenders,
            walletAmount,
            shortfall,
            creditOptIn: !!useCredit,
            primary,
            coverage: cover,
        },
    }
}

// Execute a plan against a SAVED order. Mutates nothing it does not own: the
// caller saves the order. Returns { ok, error, settlement }.
async function settleCounterPayment({ order, plan, customerId, staffId }) {
    const WalletService = require('../services/wallet.service')

    let creditApplied = 0
    let cashPaid = 0

    if (plan.walletAmount > 0) {
        const charge = await WalletService.chargeWalletForOrder({
            userId: customerId,
            orderId: order._id,
            amount: plan.walletAmount,
            description: `Counter order ${order.oscNumber}`,
            useCredit: plan.creditOptIn,
        })
        if (!charge.success) {
            // The guarded $inc refused, so NOTHING moved — the balance changed
            // between the plan and here. The order exists and is unpaid; say so
            // plainly rather than leaving staff to guess.
            return {
                ok: false,
                error: `${charge.error} Order ${order.oscNumber} has been created but is NOT paid — take payment another way.`,
            }
        }
        creditApplied = charge.creditApplied || 0
        cashPaid = charge.cashPaid || 0
    }

    // One Payment row per tender, so the money page shows how it actually
    // arrived. The row belongs to the CUSTOMER when we know them — it used to
    // be filed under the staff member, which is why a walk-in's payment never
    // appeared in their own history (the 2.3 complaint, on the counter path).
    const payments = []
    for (const tender of plan.tenders) {
        payments.push(
            await PaymentModel.create({
                userId: customerId || staffId,
                amount: tender.amount,
                reference: generateReferenceId(),
                status: 'success',
                order: order._id,
                type: 'order',
                paymentMethod: tender.method,
                alertType: 'debit',
                metadata: {
                    counter: true,
                    collectedBy: staffId,
                    ...(tender.method === PAYMENT_METHOD.WALLET && {
                        creditApplied,
                        cashFromBalance: cashPaid,
                    }),
                },
            }),
        )
    }

    const walletOnly =
        plan.tenders.length === 1 &&
        plan.tenders[0].method === PAYMENT_METHOD.WALLET

    order.paymentStatus = PAYMENT_ORDER_STATUS.SUCCESS
    order.paymentDate = new Date()
    order.paymentMethod = plan.tenders[0]?.method || PAYMENT_METHOD.CASH
    // Reporting splits on billingType, so a wallet-settled order is stamped
    // pay-from-wallet — the same stamp the bot applies. A SPLIT order is not
    // wallet-billed (the wallet only part-paid it), so it stays pay-per-item.
    order.billingType = walletOnly
        ? BILLING_TYPE.PAY_FROM_WALLET
        : BILLING_TYPE.PAY_PER_ITEM
    order.counterPayment = {
        tenders: plan.tenders,
        creditApplied,
        cashFromWallet: cashPaid,
        collectedBy: staffId,
        collectedAt: new Date(),
    }

    return {
        ok: true,
        settlement: {
            tenders: plan.tenders,
            creditApplied,
            cashFromWallet: cashPaid,
            paymentIds: payments.map((p) => p._id),
            summary: plan.tenders
                .map((t) => `${naira(t.amount)} by ${methodLabel(t.method)}`)
                .join(' + '),
        },
    }
}

module.exports = {
    DEFAULT_COUNTER_METHOD,
    normalizeCounterMethod,
    methodLabel,
    methodList,
    walletCoverage,
    planCounterPayment,
    settleCounterPayment,
}
