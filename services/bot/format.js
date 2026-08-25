// Shared display helpers for the in-app bot modules — a single naira formatter
// and the plain-language stage-explanation map, so the router and the extracted
// flow/answer modules all format money and stages the same way.
const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`

// Plain-language explanation of each pipeline stage, so the assistant can say
// what is happening instead of a bare status code. Descriptive only.
const STAGE_EXPLAIN = {
    pending: 'received and waiting to be picked up',
    queue: 'in the queue to start',
    received: 'picked up and now with us',
    'picked-up': 'picked up and on its way to us',
    'sort-and-pretreat': 'being sorted and pre-treated',
    washing: 'being washed',
    drying: 'drying',
    ironing: 'being pressed and ironed',
    qc: 'in final quality check',
    ready: 'cleaned, passed QC, and ready',
    'out-for-delivery': 'out for delivery',
    delivered: 'delivered',
    hold: 'on hold while we sort something out',
    cancelled: 'cancelled',
}

module.exports = { naira, STAGE_EXPLAIN }
