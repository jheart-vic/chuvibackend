// Shared "order" view for the 6 station timeline endpoints (intake, sort &
// pretreat, wash & dry, press, qc, rider). These endpoints each returned a
// hand-picked subset that dropped items[] / addresses / notes; this single
// builder is the source of truth so the shape can't drift between stations.
//
// The full order is already loaded (findById(...).lean()) at every call site,
// so including items/addresses/notes here costs no extra query. `trackingStatus`
// stays computed at the call site (per-station) and is passed in.
function buildTimelineOrderView(order, trackingStatus) {
    return {
        _id: order._id,
        oscNumber: order.oscNumber,
        fullName: order.fullName,
        serviceType: order.serviceType,
        serviceTier: order.serviceTier,
        amount: order.amount,
        stage: order.stage,
        stationStatus: order.stationStatus,
        trackingStatus,
        qcDetails: order.qcDetails,
        dispatchDetails: order.dispatchDetails,
        // previously omitted — full per-item detail (type, price, quantity,
        // tagStatus/washStatus/ironStatus/qcStatus, itemNote), matching
        // /admin/orders/:id, plus pickup/delivery address and the order note.
        items: order.items || [],
        pickupAddress: order.pickupAddress,
        deliveryAddress: order.deliveryAddress,
        extraNote: order.extraNote,
        createdAt: order.createdAt,
    }
}

module.exports = { buildTimelineOrderView }
