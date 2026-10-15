const mongoose = require('mongoose')

// A refused sign-up (V1 launch batch 1, client 15 Oct): "Refuse a phone number
// or email already in use, and show admin the attempt with the referral code
// that was used." One row per refusal, so admin can see who tried, on which
// rep link, and which existing account the details belong to.
const signupAttemptSchema = new mongoose.Schema(
    {
        reason: { type: String, enum: ['phone-in-use', 'email-in-use'], required: true },
        method: { type: String, enum: ['email', 'google'], required: true },
        email: { type: String },
        phoneNumber: { type: String },
        fullName: { type: String },
        referralCode: { type: String },
        // the account that already holds the phone or email
        existingUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        // the half-made Google account that was refused at the phone step
        attemptUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
)
signupAttemptSchema.index({ createdAt: -1 })

module.exports = mongoose.model('SignupAttempt', signupAttemptSchema)
