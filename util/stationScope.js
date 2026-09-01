const { STATION_STATUS } = require('./constants')

// Split-flow: items can sit at different stations at once, so a station's view
// of an order must be scoped to the items IT actually holds. Without this a
// station renders the whole order (all 10 items) when only 3 were handed to it.
const S1 = STATION_STATUS.INTAKE_AND_TAG_STATION

// Legacy items written before `currentStation` existed have no value — treat
// them as S1, the same fallback handoff.service uses wherever it reads the field.
function stationOf(item) {
    return item?.currentStation || S1
}

// The items physically sitting at `station`.
function itemsAtStation(order, station) {
    return (order?.items || []).filter((i) => stationOf(i) === station)
}

// Where the rest of the order is: { station: count }, excluding `station`.
function itemsElsewhere(order, station) {
    const counts = {}
    for (const item of order?.items || []) {
        const s = stationOf(item)
        if (s === station) continue
        counts[s] = (counts[s] || 0) + 1
    }
    return counts
}

// A station's view of an order: `items` holds ONLY that station's items, so the
// station screen renders its own work. Whole-order context moves to the siblings.
function scopeOrderToStation(order, station) {
    const plain =
        typeof order?.toObject === 'function' ? order.toObject() : order
    const mine = itemsAtStation(plain, station)
    return {
        ...plain,
        items: mine,
        itemsAtStationCount: mine.length,
        totalItemCount: (plain?.items || []).length,
        itemsElsewhere: itemsElsewhere(plain, station),
    }
}

// True when every item AT THIS STATION passes `check`. Empty is never "all
// done" — an order with nothing here hasn't finished anything here.
function allAtStation(order, station, check) {
    const mine = itemsAtStation(order, station)
    return mine.length > 0 && mine.every(check)
}

function countAtStation(order, station, check) {
    return itemsAtStation(order, station).filter(check).length
}

module.exports = {
    stationOf,
    itemsAtStation,
    itemsElsewhere,
    scopeOrderToStation,
    allAtStation,
    countAtStation,
}
