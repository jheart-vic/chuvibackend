// ROUTES BY SERVICE (V1 batch 3 part 2, R4; switch `routesByService`):
// "Wash and Iron goes S2, S3, S4, QC. Wash Only goes S2, S3, QC. Iron Only goes
// S2, S4, QC. Each piece follows its own route, and each queue shows only pieces
// routed to it."
//
// A piece's service is its own (`item.serviceType`, set by an Iron Only upgrade)
// or the order's. The next stop is the first station on the route AFTER the
// station the piece is at — so a piece that is somewhere off its route (it was
// moved before the switch went on) still has a sensible next stop and is never
// stuck. With the switch off nothing here is enforced.
const { STATION_STATUS: S, ORDER_SERVICE_TYPE: T } = require('./constants')

const SEQ = [S.INTAKE_AND_TAG_STATION, S.SORT_AND_PRETREAT_STATION, S.WASH_AND_DRY_STATION, S.PRESSING_AND_IRONING_STATION, S.QC_STATION]
const ROUTES = {
    [T.WASH_AND_IRON]: [S.INTAKE_AND_TAG_STATION, S.SORT_AND_PRETREAT_STATION, S.WASH_AND_DRY_STATION, S.PRESSING_AND_IRONING_STATION, S.QC_STATION],
    [T.WASHING_ONLY]: [S.INTAKE_AND_TAG_STATION, S.SORT_AND_PRETREAT_STATION, S.WASH_AND_DRY_STATION, S.QC_STATION],
    [T.IRONING_ONLY]: [S.INTAKE_AND_TAG_STATION, S.SORT_AND_PRETREAT_STATION, S.PRESSING_AND_IRONING_STATION, S.QC_STATION],
}
const SERVICE_WORDS = {
    [T.WASH_AND_IRON]: 'Wash and Iron',
    [T.WASHING_ONLY]: 'Wash Only',
    [T.IRONING_ONLY]: 'Iron Only',
}

const serviceOf = (item, order) => item?.serviceType || order?.serviceType || null
const routeOf = (item, order) => ROUTES[serviceOf(item, order)] || null

/** The next station on this piece's route after `from`, or null if unknown. */
function nextStationFor(item, order, from) {
    const route = routeOf(item, order)
    if (!route) return null
    const at = SEQ.indexOf(from || item?.currentStation || SEQ[0])
    return route.find((st) => SEQ.indexOf(st) > at) || null
}

/**
 * Refusal for a push that sends a piece off its route, or null. Every target
 * must have `toStation` as its next stop.
 */
function offRouteRefusal({ order, targets, fromStation, toStation }) {
    const { stationLabel } = require('./displayName')
    const wrong = []
    for (const item of targets || []) {
        const next = nextStationFor(item, order, fromStation)
        if (next && next !== toStation) wrong.push({ item, next })
    }
    if (!wrong.length) return null
    const first = wrong[0]
    const svc = SERVICE_WORDS[serviceOf(first.item, order)] || 'This service'
    const tag = first.item.tagId || first.item.type || 'A piece'
    const more = wrong.length > 1 ? ` (and ${wrong.length - 1} more)` : ''
    return {
        error: `${tag} is ${svc}: it goes to ${stationLabel(first.next)} next, not ${stationLabel(toStation)}${more}.`,
        offRoute: true,
        pieces: wrong.map((w) => ({ itemId: w.item._id, tagId: w.item.tagId || null, nextStation: w.next })),
    }
}

module.exports = { ROUTES, SERVICE_WORDS, serviceOf, routeOf, nextStationFor, offRouteRefusal }
