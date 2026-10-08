// CLIENT DECISION A5 (2026-10-07): "Sort every production queue by delivery
// deadline, earliest first. If two orders have the same deadline, the older
// order comes first."
//
// Why this exists as one constant rather than a literal at each call site:
// §3 Q6 found the stations DISAGREEING about sort order — Sort & Pretreat showed
// NEWEST first (`updatedAt: -1`) while Wash, Press and the dispatch queues showed
// OLDEST first. The same three orders appeared in opposite order one screen
// apart. Twenty-odd separate sort literals is exactly how that happened, so the
// rule now lives in one place and the stations cannot drift again.
//
// The reasoning the client accepted: the order closest to breaching its promise
// to the customer is the one staff should meet first — which is not necessarily
// the one that has been waiting longest.
//
// `deliveryDate` is set on every booking path (`calculateDueDate` at creation),
// so no order in a production queue is missing one. Note for anything new: a
// missing date would sort FIRST in Mongo, so an order that somehow has no
// deadline would jump the queue rather than fall to the back.
const QUEUE_SORT = Object.freeze({ deliveryDate: 1, createdAt: 1 })

module.exports = { QUEUE_SORT }
