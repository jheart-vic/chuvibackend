// Apply a referral code + update phone / pickup address (phone requires OTP
// verification before any write; address change is no-OTP). Extracted verbatim
// and mixed onto the orchestrator prototype (this.extractCode, cleanDetailValue,
// parseDetail, isAffirmative/isNegative, and this._startPhoneOtp resolve there).
const ReferralService = require('../referral.service')
const UserModel = require('../../models/user.model')
const createAuditLog = require('../../util/createAuditLog')
const { generateOTP } = require('../../util/helper')
const sendSmsOtp = require('../../util/sendOtp')
const { BOT_INTENT, AUDIT_LOG_CATEGORIES } = require('../../util/constants')

module.exports = {
    async applyReferralCode(userId, text, slots) {
        const code = slots.code || this.extractCode(text)
        if (!code) {
            return {
                replies: ['Sure — what referral code would you like to apply?'],
                state: { intent: BOT_INTENT.APPLY_REFERRAL_CODE, step: 'awaiting-code', slots: {} },
            }
        }
        const referral = await ReferralService.captureReferral({ referredUserId: userId, code })
        if (!referral) {
            return {
                replies: [
                    `I couldn't apply "${code}". It may be unknown, your own code, or you already have a referrer.`,
                ],
            }
        }
        return { replies: [`Done! Code "${code}" applied. 🎉`] }
    },

    // Multi-turn: (1) figure out the field, (2) capture the value, (3) confirm,
    // (4) write. `step` is the PENDING step from botState so we know which turn
    // this is — on `awaiting-value` the WHOLE message is the answer (no keyword
    // re-parsing), which is what stops the "What's the new pickup address?" loop.
    async updateDetails(userId, text, slots, step) {
        const label = (f) => (f === 'phone' ? 'phone number' : 'pickup address')

        // (4) Phone OTP verification turn — the pending number is only written once
        // the customer proves they own it by entering the code we texted. The code
        // is parsed from THIS message (not slots), and the pending number lives
        // under `pendingPhone` so the classifier can't clobber it.
        if (step === 'verify-phone-otp' && slots.field === 'phone') {
            if (this.isNegative(text)) {
                return { replies: ["Okay, I've left your phone number unchanged."] }
            }
            const code = (String(text || '').match(/\d{3,8}/) || [])[0]
            const expired = !slots.otpExpires || Date.now() > Number(slots.otpExpires)
            if (expired) {
                return {
                    replies: ["That code has expired. Tell me the new number again and I'll send a fresh code."],
                    state: {
                        intent: BOT_INTENT.UPDATE_DETAILS,
                        step: 'awaiting-value',
                        slots: { field: 'phone' },
                    },
                }
            }
            if (!code || code !== String(slots.otp)) {
                return {
                    replies: ["That code doesn't match. Please enter the code I sent (or say cancel)."],
                    state: { intent: BOT_INTENT.UPDATE_DETAILS, step: 'verify-phone-otp', slots },
                }
            }
            await UserModel.updateOne({ _id: userId }, { $set: { phoneNumber: slots.pendingPhone } })
            try {
                await createAuditLog({
                    userId,
                    action: 'Bot updated phone number after OTP verification',
                    category: AUDIT_LOG_CATEGORIES.USER,
                })
            } catch (_) {
                /* best-effort */
            }
            return { replies: [`Verified ✅ — your phone number is now "${slots.pendingPhone}".`] }
        }

        // (3) Confirmation turn — we already have field + value, awaiting yes/no.
        if (step === 'awaiting-confirm' && slots.field && slots.value) {
            if (this.isAffirmative(text)) {
                // Phone changes require OTP verification before we write anything.
                if (slots.field === 'phone') {
                    return await this._startPhoneOtp(slots.value)
                }
                await UserModel.updateOne(
                    { _id: userId },
                    { $set: { defaultPickupAddress: slots.value } },
                )
                return { replies: [`Done — your ${label(slots.field)} is now "${slots.value}".`] }
            }
            if (this.isNegative(text)) {
                return {
                    replies: [`No problem — I've left it unchanged. What's the correct ${label(slots.field)}?`],
                    state: {
                        intent: BOT_INTENT.UPDATE_DETAILS,
                        step: 'awaiting-value',
                        slots: { field: slots.field },
                    },
                }
            }
            // Unclear reply → re-ask the confirmation, keep the pending value.
            return {
                replies: [`Just to confirm — set your ${label(slots.field)} to "${slots.value}"? (yes/no)`],
                state: {
                    intent: BOT_INTENT.UPDATE_DETAILS,
                    step: 'awaiting-confirm',
                    slots: { field: slots.field, value: slots.value },
                },
            }
        }

        // (2) Value turn — the field is known, so the whole message IS the value.
        if (step === 'awaiting-value' && slots.field) {
            const value = this.cleanDetailValue(slots.field, text)
            if (!value) {
                return {
                    replies: [
                        slots.field === 'phone'
                            ? "That doesn't look like a phone number — please send just the digits, e.g. 08031234567."
                            : "I didn't catch an address there — please type your pickup address, e.g. 12 Marina, Lagos.",
                    ],
                    state: {
                        intent: BOT_INTENT.UPDATE_DETAILS,
                        step: 'awaiting-value',
                        slots: { field: slots.field },
                    },
                }
            }
            return {
                replies: [`Set your ${label(slots.field)} to "${value}"? (yes/no)`],
                state: {
                    intent: BOT_INTENT.UPDATE_DETAILS,
                    step: 'awaiting-confirm',
                    slots: { field: slots.field, value },
                },
            }
        }

        // (1) First turn — parse what we can from the message.
        const parsed = this.parseDetail(text, slots)
        if (!parsed.field) {
            return {
                replies: [
                    'I can update your phone number or pickup address. Reply like "phone 0803..." or "address 12 Marina, Lagos".',
                ],
                state: { intent: BOT_INTENT.UPDATE_DETAILS, step: 'awaiting-detail', slots: {} },
            }
        }
        if (!parsed.value) {
            return {
                replies: [`What's the new ${label(parsed.field)}?`],
                state: {
                    intent: BOT_INTENT.UPDATE_DETAILS,
                    step: 'awaiting-value',
                    slots: { field: parsed.field },
                },
            }
        }
        // Got both in one message → confirm before writing.
        return {
            replies: [`Set your ${label(parsed.field)} to "${parsed.value}"? (yes/no)`],
            state: {
                intent: BOT_INTENT.UPDATE_DETAILS,
                step: 'awaiting-confirm',
                slots: { field: parsed.field, value: parsed.value },
            },
        }
    },

    // Send a one-time code to the NEW number and await it. If the SMS can't be
    // delivered we do NOT change the number — we hand off so a human can verify
    // it safely. The code lives on botState only for the flow (short-lived).
    async _startPhoneOtp(newPhone) {
        const otp = generateOTP()
        const otpExpires = Date.now() + 5 * 60 * 1000 // 5 minutes
        try {
            await sendSmsOtp(newPhone, otp)
        } catch (e) {
            return {
                replies: [
                    "I couldn't send a verification code to that number right now, so I won't change it. Let me connect you to a person to update it safely.",
                ],
                handoff: true,
            }
        }
        return {
            replies: [`To confirm it's really your number, I've sent a code to ${newPhone}. What's the code?`],
            state: {
                intent: BOT_INTENT.UPDATE_DETAILS,
                step: 'verify-phone-otp',
                slots: { field: 'phone', pendingPhone: newPhone, otp: String(otp), otpExpires },
            },
        }
    },
}
