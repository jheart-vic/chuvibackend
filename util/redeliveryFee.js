// "The first redelivery is free, later ones are charged" (V1 launch batch 2,
// client 15 Oct, R22). Called after the second and every later "Customer not
// available" at delivery. The fee is its own line on the order (R19), the order
// owes it (balanceDue), and the delivery cannot be dispatched again until it is
// paid (util/paymentGate.dispatchPaymentGate). The customer pays it like any
// balance: Pay in the app (a fresh Paystack link for the balance), or S1 records
// a POS / transfer payment.
const BookOrderModel = require('../models/bookOrder.model')
const AdminSettingModel = require('../models/adminSetting.model')

async function redeliveryFeeAmount() {
    const s = (await AdminSettingModel.findOne().select('redeliveryFee deliveryFee').lean()) || {}
    const fee = s.redeliveryFee != null ? Number(s.redeliveryFee) : Number(s.deliveryFee || 0)
    return Math.max(0, Math.round(fee) || 0)
}

async function chargeRedelivery(orderId) {
    const fee = await redeliveryFeeAmount()
    if (fee <= 0) return null
    const order = await BookOrderModel.findById(orderId).select('amount balanceDue paymentStatus oscNumber userId').lean()
    if (!order) return null
    const owed = order.paymentStatus === 'success' ? 0 : Number(order.balanceDue || 0)
    await BookOrderModel.updateOne(
        { _id: orderId },
        {
            $inc: { amount: fee },
            $set: { balanceDue: owed + fee, paymentStatus: 'pending' },
            $push: { 'dispatchDetails.delivery.redeliveryFees': { amount: fee, at: new Date() } },
        },
        { runValidators: false },
    )
    try {
        const createNotification = require('./createNotification')
        if (order.userId) {
            await createNotification({
                userId: order.userId,
                title: 'Redelivery fee',
                body: `We could not reach you twice for order ${order.oscNumber}. The next delivery costs N${fee.toLocaleString('en-NG')}. Open Orders and tap Pay to book it.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: 'order-updated',
            })
        }
    } catch (err) {
        console.error('redelivery fee notice failed:', err?.message)
    }
    return fee
}

/** Mark every unpaid redelivery fee paid (called when the order's balance is paid). */
async function markRedeliveryFeesPaid(orderId) {
    await BookOrderModel.updateOne(
        { _id: orderId },
        { $set: { 'dispatchDetails.delivery.redeliveryFees.$[f].paidAt': new Date() } },
        { arrayFilters: [{ 'f.paidAt': { $exists: false } }] },
    )
}

module.exports = { redeliveryFeeAmount, chargeRedelivery, markRedeliveryFeesPaid }
