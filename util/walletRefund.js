/**
 * RETURN CASH TO A CUSTOMER'S WALLET — one implementation.
 *
 * This existed inline in `_performCancellation` and was about to be copied for
 * client item #7 ("total down → the difference goes to the wallet"). The repo
 * has paid for that pattern repeatedly: the basket maths was three copies that
 * had already drifted (brief 1.6), the hold-SLA table was three copies that
 * disagreed on screen (4.4), and `admin.service` kept its own wallet add/deduct
 * with the pre-2.3 bugs until it was made to delegate. So: one owner.
 *
 * All THREE writes matter and none is optional:
 *   1. an atomic `$inc` on the balance — never `balance = balance + x`;
 *   2. a `WalletTransaction`, which IS the ledger;
 *   3. a mirrored `Payment` row, because the customer's own history endpoint
 *      (`fetch-user-transactions`) reads Payment — this is exactly the 2.3
 *      complaint, "the money has no record", which stayed true after the write
 *      side was fixed because the read side looked somewhere else.
 *
 * Returns `{ amount, reference, balanceAfter }`. THROWS on failure: the caller
 * is moving money the customer is owed, so it must not be able to believe a
 * refund happened when it did not.
 */

const WalletModel = require('../models/wallet.model')
const WalletTransactionModel = require('../models/walletTransaction.model')
const PaymentModel = require('../models/payment.model')
const { WALLET_TX_TYPE } = require('./constants')
const { generateReferenceId } = require('./helper')

async function refundToWallet({
    userId,
    amount,
    orderId = null,
    description,
    paymentType = 'refund',
}) {
    const value = Math.max(0, Math.round(Number(amount) || 0))
    if (!userId) throw new Error('refundToWallet: userId is required')
    if (value <= 0) return { amount: 0, reference: null, balanceAfter: null }

    const wallet = await WalletModel.findOneAndUpdate(
        { userId },
        {
            $inc: { balance: value },
            $setOnInsert: { currency: 'NGN' },
        },
        { new: true, upsert: true },
    )

    const reference = generateReferenceId()

    await WalletTransactionModel.create({
        userId,
        walletId: wallet._id,
        type: WALLET_TX_TYPE.CREDIT,
        amount: value,
        reference,
        status: 'success',
        description,
        relatedOrderId: orderId || undefined,
        balanceAfter: wallet.balance,
    })

    // The half that the 2.3 fix originally missed.
    await PaymentModel.create({
        userId,
        amount: value,
        reference,
        status: 'success',
        type: paymentType,
        ...(orderId ? { order: orderId } : {}),
        alertType: 'credit',
        paymentMethod: 'wallet',
        adminNote: description,
    })

    return { amount: value, reference, balanceAfter: wallet.balance }
}

module.exports = { refundToWallet }
