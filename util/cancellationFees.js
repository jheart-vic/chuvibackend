/**
 * CANCELLATION FEES — N1 Phase 3 (client spec, locked 2026-10-07).
 *
 * Their rules, verbatim in substance:
 *
 *   * "Customer or admin, any time **before tagging begins**; once tagged,
 *     never."
 *   * "Before pickup = free."
 *   * "After pickup, before payment = the customer pays **₦1,000 + ₦1,000**
 *     before the clothes go back, **even if a free-pickup offer applied**."
 *   * "After payment, before tagging = the laundry fee returns to the wallet,
 *     **both logistics fees are kept**."
 *
 * PURE. `now` is not read and no database is touched, so every tier can be
 * asserted offline — the same reason `util/bookingWindow.js` is pure.
 *
 * ⚠️ THE "EVEN IF A FREE-PICKUP OFFER APPLIED" CLAUSE IS THE WHOLE POINT OF
 * THIS FILE. The intuitive implementation charges what the customer was
 * originally billed for logistics, which for an offer-covered order is ₦0 — so
 * a cancelled free-pickup order would cost them nothing, and the rider's trip
 * would be absorbed. The client was explicit that the trip is real work and is
 * charged whatever the offer said. So these fees are their own settings and are
 * deliberately NOT derived from `order.pricing`.
 */

/**
 * Has tagging begun? Once it has, nothing may be cancelled — the garments have
 * been labelled and entered the production system.
 *
 * Checked on the ITEMS rather than on `stage.status`, because a tag can be
 * generated while the order still sits in the tagging queue: by the time the
 * stage moves, tagging is long finished. A `tagId` is enough — it means a label
 * exists, printed or not.
 */
function taggingBegun(order) {
    return (order?.items || []).some(
        (item) => Boolean(item?.tagId) || item?.tagStatus === 'complete',
    )
}

/** The two flat cancellation charges, admin-editable, ₦1,000 each by default. */
function cancellationCharges(settings) {
    const s = settings || {}
    return {
        pickupFee: Number(s.cancellationPickupFee ?? 1000),
        returnFee: Number(s.cancellationReturnFee ?? 1000),
    }
}

/**
 * What cancelling this order costs, and what goes back.
 *
 * Returns:
 *   allowed      — false once tagging has begun
 *   tier         — 'free' | 'logistics' | 'post-payment' | 'refused'
 *   feeApplied   — what the customer is charged
 *   refundToWallet — what returns to their wallet
 *   reason/explanation — written for the customer
 *
 * `amountPaid` is what the customer actually paid (0 for an unpaid order), kept
 * as a parameter rather than read from the order so a caller that knows better
 * — a partial payment, a wallet settlement — can pass the real figure.
 */
function cancellationOutcome({ order, settings, amountPaid = null }) {
    const { pickupFee, returnFee } = cancellationCharges(settings)

    if (taggingBegun(order)) {
        return {
            allowed: false,
            tier: 'refused',
            feeApplied: 0,
            refundToWallet: 0,
            reason:
                'Tagging has already started on this order, so it can no longer be cancelled. Please contact support.',
        }
    }

    const pickupStatus = order?.dispatchDetails?.pickup?.status
    const collected = pickupStatus === 'picked-up'
    const paid =
        order?.paymentStatus === 'success' || Boolean(order?.paymentWaivedAt)
    const paidAmount =
        amountPaid === null || amountPaid === undefined
            ? paid
                ? Number(order?.amount || 0)
                : 0
            : Number(amountPaid)

    // BEFORE PICKUP = FREE. Nothing has been collected, so no trip was made.
    if (!collected) {
        return {
            allowed: true,
            tier: 'free',
            feeApplied: 0,
            // Anything already paid comes straight back.
            refundToWallet: Math.max(0, paidAmount),
            explanation:
                paidAmount > 0
                    ? `Cancelled before pickup — ₦${paidAmount.toLocaleString('en-NG')} returns to your wallet in full.`
                    : 'Cancelled before pickup — there is nothing to pay.',
        }
    }

    // COLLECTED AND PAID: the laundry fee returns to the wallet, both logistics
    // fees are kept. The clothes still have to be driven back, which is the
    // second fee.
    if (paid) {
        const keep = pickupFee + returnFee
        const refund = Math.max(0, paidAmount - keep)
        return {
            allowed: true,
            tier: 'post-payment',
            feeApplied: Math.min(keep, Math.max(0, paidAmount)),
            refundToWallet: refund,
            pickupFee,
            returnFee,
            explanation:
                `Your items have already been collected. ₦${keep.toLocaleString('en-NG')} covers the pickup and the return trip; ` +
                `₦${refund.toLocaleString('en-NG')} returns to your wallet.`,
        }
    }

    // COLLECTED, NOT PAID: the customer owes both trips before the clothes go
    // back. Charged at the flat rate regardless of any free-pickup offer — the
    // trip happened.
    return {
        allowed: true,
        tier: 'logistics',
        feeApplied: pickupFee + returnFee,
        refundToWallet: 0,
        pickupFee,
        returnFee,
        payableBeforeReturn: true,
        explanation:
            `Your items have already been collected. ₦${(pickupFee + returnFee).toLocaleString('en-NG')} ` +
            `(₦${pickupFee.toLocaleString('en-NG')} pickup + ₦${returnFee.toLocaleString('en-NG')} return) is due before they are brought back. ` +
            'This applies even if your order had free pickup, because the trip was still made.',
    }
}

module.exports = {
    taggingBegun,
    cancellationCharges,
    cancellationOutcome,
}
