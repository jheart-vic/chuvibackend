// BATCH 3 PART 2 SWITCHES (client 15 Oct): "One switch for each part, not one for
// all ... If one fails our test, I can leave only that one off." All OFF by default.
//
//   s2PartialReceipt  S2 holds one piece at receipt ("Something is missing") and
//                     receives the rest (R2, T8.04)
//   routesByService   each piece follows its service's route; a push off the
//                     route is refused (R4, T3.07, T4.02)
//   ironOnlyUpgrade   Iron Only "Looks dirty, suggest washing" → per-piece
//                     service change with a payment link (R8, T4.03–T4.08)
//   damageCase        "Report problem: Damaged" holds the piece and opens a
//                     damage case; admin releases only after "Customer informed";
//                     partial delivery (R6, T3.08–T3.10)
//
// RULE FOR EVERY SWITCH (client: "No order may get stuck or lose a piece"): a
// switch only decides whether a NEW action of its kind may START. Anything a
// switch already started can always be finished with the switch off (release,
// resend, pay, expire, deliver). Read at the moment of action, never stored on
// the order.
const SWITCH_KEYS = ['s2PartialReceipt', 'routesByService', 'ironOnlyUpgrade', 'damageCase']

async function getSwitches() {
    const AdminSettingModel = require('../models/adminSetting.model')
    const s = await AdminSettingModel.findOne().select('v1Switches').lean()
    const out = {}
    for (const k of SWITCH_KEYS) out[k] = s?.v1Switches?.[k] === true
    return out
}

async function isOn(key) {
    return (await getSwitches())[key] === true
}

const OFF_MESSAGE = 'This is switched off in admin settings.'

module.exports = { SWITCH_KEYS, getSwitches, isOn, OFF_MESSAGE }
