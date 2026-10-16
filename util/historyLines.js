// HISTORY LINES (V1 launch batch 3c, client word list 15 Oct): "[time] [station]:
// [what happened] by [staff name]". Example: "10:42 Intake and Tag: 6 pieces
// counted by Chioma". Built from the order's Activity records, which carry the
// staff member; the station is the staff member's role in the client's words.
//
// FE 16 Oct: the step names are the client's words (Booked, Tagged, Sent to …,
// Received, Sorted …), and the same step logged twice in a row shows once.
const ActivityModel = require('../models/activity.model')
require('../models/user.model') // populate('userId') needs it registered
const { stationLabel } = require('./displayName')

const two = (n) => String(n).padStart(2, '0')
const clock = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`

// Stored activity title → the client's words. Anything not listed keeps its title.
const WORDS = {
    'New Order Registered': 'Booked',
    'Unassigned pickup alert': 'Needs rider',
    'Dispach Run Created': 'Rider assigned',
    'Pickup Rider Unassigned': 'Rider removed',
    'Delivery Rider Unassigned': 'Rider removed',
    'Unassigned delivery alert': 'Needs rider',
    'Order moved to tag and queue': 'At Intake',
    'Order Item Tagged': 'Tagged',
    'Order Item Tag Undone': 'Tag undone',
    'All Tags Generated': 'Tags printed',
    'Tagging Completed': 'Tagging finished',
    'Items Pushed to Next Station': 'Sent',
    'Handoff Confirmed': 'Received',
    'Order moved to sort and pretreat': 'Sorting',
    'Item Sorted': 'Sorted',
    'Items Sorted': 'Sorted',
    'All Items Sorted': 'Sorted',
    'Item Sort Details Updated': 'Sorted',
    'Item Sort Undone': 'Sort undone',
    'Item Pretreated': 'Pretreated',
    'Item Pretreat Undone': 'Pretreat undone',
    'Item(s) Confirmed for Washing': 'Washing',
    'Moved to Drying': 'Drying',
    'Wash & Dry Completed': 'Washed',
    'Item(s) Confirmed for Pressing': 'Pressing',
    'Pressing Completed': 'Pressed',
    'Item(s) QC Passed': 'Quality check passed',
    'Item(s) QC Undone': 'Quality check undone',
    'Order Passed QC': 'Quality check passed',
    'Order Packed & Sealed': 'Ready (packed)',
    'Dispatch Tag Printed': 'Dispatch tag printed',
    'Dispatch Tag Reprinted': 'Dispatch tag printed again',
    'Payment hold': 'Waiting for payment',
    'Item Placed on Hold': 'On hold',
    'Order Placed on Hold by Admin': 'On hold',
    'Order Flagged': 'Report problem',
    'Item Flagged for Review': 'Report problem',
    'Delivery Issue Reported': 'Report problem',
    'Order Released from Hold': 'Hold released',
    'Item Hold Released': 'Hold released',
    'Hold Resolved': 'Hold released',
    'Hold Reassigned': 'Hold reassigned',
    'Order held — count differs from rider': 'Waiting for admin: count dispute',
    'Order held: count dispute': 'Waiting for admin: count dispute',
    'Order Moved to Next Stage': 'Moved on',
    'Order Collected In Person': 'Customer collected',
}
const STATION_IN = /\bto ([a-z-]+-station)\b/

function wordsFor(a) {
    const title = String(a.title || a.description || '').trim()
    const base = WORDS[title] || title
    const desc = String(a.description || '')
    if (title === 'Items Pushed to Next Station') {
        const m = desc.match(STATION_IN)
        return m ? `Sent to ${stationLabel(m[1])}` : 'Sent'
    }
    if (title === 'Order Item Tagged') {
        const m = desc.match(/with (\S+) order/)
        return m && m[1] !== 'undefined' ? `Tagged ${m[1]}` : 'Tagged'
    }
    return base
}

async function historyLines(orderId) {
    if (!orderId) return []
    const rows = await ActivityModel.find({ orderId })
        .sort({ createdAt: 1 })
        .limit(300)
        .populate({ path: 'userId', select: 'fullName userType' })
        .lean()
    const out = []
    for (const a of rows) {
        const at = new Date(a.createdAt)
        const user = a.userId && typeof a.userId === 'object' ? a.userId : null
        const station = user?.userType ? stationLabel(user.userType) : 'System'
        const what = wordsFor(a)
        const by = user?.fullName ? String(user.fullName).trim().split(/\s+/)[0] : null
        // The same step by the same station logged twice within 5 minutes shows once.
        const prev = out[out.length - 1]
        if (prev && prev.what === what && prev.station === station && at - new Date(prev.at) < 5 * 60000) continue
        out.push({
            at,
            station,
            what,
            by,
            detail: a.description || null,
            line: `${clock(at)} ${station}: ${what}${by ? ` by ${by}` : ''}`,
        })
    }
    return out
}

module.exports = { historyLines, WORDS }
