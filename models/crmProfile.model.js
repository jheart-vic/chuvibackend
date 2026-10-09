const mongoose = require('mongoose')
const {
    CRM_STAGE,
    CRM_TAG,
    CRM_LEAD_SOURCE,
    ORDER_CHANNEL,
} = require('../util/constants')

// One CRM "customer card" per person. userId is optional so that leads coming
// from WhatsApp chats or walk-ins (no account) still get a card; identity is
// linked later by normalized phone number.
const crmProfileSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true,
            sparse: true,
        },
        fullName: { type: String, trim: true },
        phoneNumber: { type: String, trim: true },
        normalizedPhone: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        },
        email: { type: String, trim: true, lowercase: true },

        stage: {
            type: String,
            enum: Object.values(CRM_STAGE),
            default: CRM_STAGE.LEAD,
        },
        tags: {
            type: [String],
            enum: Object.values(CRM_TAG),
            default: [],
        },
        channel: {
            type: String,
            enum: Object.values(ORDER_CHANNEL),
        },

        // How this card came to exist, and when the lead actually entered.
        // `createdAt` can't answer either: a card is also auto-created by an
        // incoming order, and crmBackfill.js dated a whole batch to its run day.
        leadSource: {
            type: String,
            enum: Object.values(CRM_LEAD_SOURCE),
            default: CRM_LEAD_SOURCE.LEAD,
            index: true,
        },
        leadEnteredAt: { type: Date },

        totalOrders: { type: Number, default: 0 },
        // delivered orders NOT covered by a subscription — drives the every-5
        // loyalty offer (client 2026-08-28: subscribers earn loyalty by renewed
        // months, not order count, so their bundle draws don't count here).
        nonSubscriptionOrders: { type: Number, default: 0 },
        expressOrders: { type: Number, default: 0 },
        totalSpent: { type: Number, default: 0 },
        firstOrderAt: { type: Date },
        lastOrderAt: { type: Date },
        nextFollowUpAt: { type: Date },

        wasDormant: { type: Boolean, default: false },
        dormantSince: { type: Date },

        // §2 N2: last time this customer was SHOWN the NPS (0-10 recommend)
        // question. Lives here, not only on Feedback, because a prompt the
        // customer ignores creates no Feedback record to stamp — without it the
        // "at most once in 30 days" rule would only throttle people who answer.
        lastNpsAskedAt: { type: Date },

        // referral eligibility is paused while an unresolved complaint is open
        // (Feedback & Recovery sets this; Phase 5 Referral reads it)
        referralPaused: { type: Boolean, default: false },

        broadcastLists: {
            prospect: {
                active: { type: Boolean, default: false },
                joinedAt: { type: Date },
                lastSentAt: { type: Date },
                // rotates the 3 broadcast variants (A→B→C→A); ++ after each send
                cycleIndex: { type: Number, default: 0 },
            },
            churn: {
                active: { type: Boolean, default: false },
                joinedAt: { type: Date },
                lastSentAt: { type: Date },
                cycleIndex: { type: Number, default: 0 },
            },
        },

        // ── Merge bookkeeping (client item #9, ruling 2026-10-08) ───────────
        // An absorbed duplicate card is ARCHIVED, not deleted: "phone numbers
        // get shared and recycled here, so a wrong merge must be reversible."
        // `archived: true` hides it from every list and count; `mergedInto`
        // points at the card that now holds the history, which is what makes an
        // undo possible. Absent on every normal card.
        archived: { type: Boolean, default: false, index: true },
        mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'CrmProfile' },
        mergedAt: { type: Date },
        mergedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        stageHistory: [
            {
                from: { type: String },
                to: { type: String },
                note: { type: String, default: '' },
                changedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                }, // null = automatic
                changedAt: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true },
)

crmProfileSchema.index({ stage: 1 })
crmProfileSchema.index({ tags: 1 })
crmProfileSchema.index({ lastOrderAt: 1 })

// ── Archived cards are hidden EVERYWHERE by default ─────────────────────────
// Client ruling 2026-10-08: an absorbed duplicate is archived and must be
// hidden "from lists and counts".
//
// Done as query middleware rather than by editing the ~13 places that read
// profiles, for one reason: a filter added at 13 call sites is a filter the
// 14th will forget, and the symptom — a merged-away duplicate reappearing in a
// count — is the exact bug this feature exists to remove. One definition here
// covers every current and future reader.
//
// `/^find/` so findOne/findById are included too, not just find(); `aggregate`
// needs its own hook because it does not pass through the find hooks at all,
// and the CRM metrics are aggregations.
//
// Opt back in with `.setOptions({ includeArchived: true })` — needed by the
// merge report and by any future restore, which must be able to see them.
const hideArchived = function (next) {
    if (!this.getOptions?.().includeArchived) {
        const filter = this.getFilter()
        if (filter.archived === undefined && filter._id === undefined) {
            this.where({ archived: { $ne: true } })
        }
    }
    next()
}
crmProfileSchema.pre(/^find/, hideArchived)
crmProfileSchema.pre(/^count/, hideArchived)
crmProfileSchema.pre('distinct', hideArchived)

// A lookup BY ID is deliberately exempt above (an explicit id is an explicit
// request for that card), so an admin can still open an archived one.
crmProfileSchema.pre('aggregate', function (next) {
    if (this.options?.includeArchived) return next()
    this.pipeline().unshift({ $match: { archived: { $ne: true } } })
    next()
})

const CrmProfileModel = mongoose.model('CrmProfile', crmProfileSchema)
module.exports = CrmProfileModel
