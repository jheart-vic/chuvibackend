// Sign-up rules, V1 launch batch 1 (client 15 Oct 2026, "three small additions"):
//
// 1. "Accept only a real Nigerian mobile number (11 digits starting 070, 080,
//    081, 090 or 091, or the same number with +234). Refuse anything else with
//    a clear message."
// 2. "One phone number, one account, the same as email. Refuse a phone number or
//    email already in use, and show admin the attempt with the referral code
//    that was used." (Reverses the 13 Oct "shared phones allowed".)
const { normalizePhone } = require('./helper')

const INVALID_PHONE =
    'Enter a Nigerian mobile number: 11 digits starting 070, 080, 081, 090 or 091 (or the same number with +234).'
const PHONE_IN_USE = 'This phone number is already used by another account. Log in to that account, or use a different number.'

/** The stored form ("08031234567") of a real Nigerian mobile, or null. */
function nigerianMobile(raw) {
    const phone = normalizePhone(raw)
    return /^0(70|80|81|90|91)\d{8}$/.test(phone) ? phone : null
}

// Accounts made before phones were stored in one form may hold "+234…",
// "234…" or "803…", so the lookup checks every written form of the number.
function phoneVariants(phone) {
    const local = phone.slice(1)
    return [phone, `+234${local}`, `234${local}`, local, `+234 ${local}`]
}

/** The other account already holding this phone, or null. */
async function accountWithPhone(phone, { excludeUserId = null } = {}) {
    const UserModel = require('../models/user.model')
    const q = { phoneNumber: { $in: phoneVariants(phone) } }
    if (excludeUserId) q._id = { $ne: excludeUserId }
    return UserModel.findOne(q).select('_id email phoneNumber userType').lean()
}

/** Record a refused sign-up for admin. Never throws. */
async function logAttempt(fields) {
    try {
        const SignupAttemptModel = require('../models/signupAttempt.model')
        await SignupAttemptModel.create({
            ...fields,
            referralCode: fields.referralCode ? String(fields.referralCode).trim().toUpperCase() : undefined,
        })
    } catch (err) {
        console.error('sign-up attempt log failed:', err?.message)
    }
}

module.exports = { INVALID_PHONE, PHONE_IN_USE, nigerianMobile, phoneVariants, accountWithPhone, logAttempt }
