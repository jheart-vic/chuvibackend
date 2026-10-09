// Phone-split CRM profiles — client reply #2 (8 Oct 2026), item #9.
//
// WHY THESE EXIST: until brief 4.6, `normalizePhone` only stripped a leading
// `234`. A bare 10-digit number (`8031234567`) came back unchanged and never
// matched the same person stored as `08031234567`. The CRM links identity by
// the normalised phone, so one human became two cards — one often a WhatsApp /
// walk-in LEAD with no account, the other their real account.
//
// THE CLIENT'S INSTRUCTIONS, in their order:
//   1. send the REPORT first (nothing is merged on a scan);
//   2. merge into the OLDER card;
//   3. bring orders, wallet balance and messages from BOTH;
//   4. keep the referral code from the ACCOUNT card;
//   5. flag anything that cannot be combined BEFORE merging.
//
// (4) is the subtle one. A referral code is not stored on the card — it belongs
// to the USER account. So "keep the referral code from the account card" means
// the surviving (older) card must ADOPT the account's `userId`, which carries
// the code, the wallet and the order history with it. That is what `_plan` does.
//
// WHAT IS NEVER DONE SILENTLY: if BOTH cards have accounts, that is two logins
// and two wallets — a user merge, not a card merge, and a different blast
// radius. It is reported as a blocker and refused.

const mongoose = require('mongoose')
const CrmProfileModel = require('../models/crmProfile.model')
const CrmScheduledMessageModel = require('../models/crmScheduledMessage.model')
const CrmMessageLogModel = require('../models/crmMessageLog.model')
const UserModel = require('../models/user.model')
const WalletModel = require('../models/wallet.model')
const BookOrderModel = require('../models/bookOrder.model')
const BaseService = require('./base.service')
const createAuditLog = require('../util/createAuditLog')
const { normalizePhone, getObjectId } = require('../util/helper')
const { CRM_STAGE, AUDIT_LOG_CATEGORIES } = require('../util/constants')
// The CRM engine's OWN stage rule, not a second copy of the thresholds.
const { countStage } = require('./crm.service')
// Matches CrmSetting.thresholds.dormantDays' default; the dormancy scan is the
// authority and reconciles anything this gets wrong on its next pass.
const DORMANT_DAYS = 30

// CLIENT RULING 2026-10-08: "Please do not just keep the furthest stage. Work
// out the stage again from the combined orders, using the normal stage rules,
// and let the card follow the follow up messages for that stage."
//
// So STAGE_RANK is no longer how the survivor's stage is decided — it is kept
// only to describe what WAS there, because the rank is still the honest way to
// report which of two cards was further along. The decision now goes through
// `countStage` from crm.service (the CRM engine's own rule) plus the dormancy
// window, so a merged card cannot end up in a stage its order history does not
// support. Keeping the furthest stage could do exactly that: a lead card with
// zero orders absorbing a dormant card would have been called "dormant" while
// the combined history said "lead".
const STAGE_RANK = {
    [CRM_STAGE.LEAD]: 0,
    [CRM_STAGE.FIRST_ORDER]: 1,
    [CRM_STAGE.DORMANT]: 2,
    [CRM_STAGE.REACTIVATED]: 3,
    [CRM_STAGE.ACTIVE]: 4,
    [CRM_STAGE.LOYAL]: 5,
}

const earliest = (...ds) => {
    const v = ds.filter(Boolean).map((d) => new Date(d).getTime())
    return v.length ? new Date(Math.min(...v)) : undefined
}
const latest = (...ds) => {
    const v = ds.filter(Boolean).map((d) => new Date(d).getTime())
    return v.length ? new Date(Math.max(...v)) : undefined
}

class ProfileMergeService extends BaseService {
    // ── the report (client step 1) ───────────────────────────────────────────
    // Every phone number that maps to more than one card, with what a merge
    // WOULD do and what stops it. Writes nothing.
    async findDuplicates(req = {}) {
        try {
            const profiles = await CrmProfileModel.find({})
                .setOptions({ includeArchived: false }) // the report is about LIVE duplicates
                .select(
                    '_id fullName phoneNumber normalizedPhone userId email stage tags ' +
                        'totalOrders totalSpent nonSubscriptionOrders expressOrders ' +
                        'firstOrderAt lastOrderAt leadSource channel createdAt',
                )
                .lean()

            const byPhone = new Map()
            for (const p of profiles) {
                const key = normalizePhone(p.normalizedPhone || p.phoneNumber)
                if (!key) continue
                if (!byPhone.has(key)) byPhone.set(key, [])
                byPhone.get(key).push(p)
            }

            const groups = []
            for (const [phone, cards] of byPhone.entries()) {
                if (cards.length < 2) continue
                groups.push(await this._describeGroup(phone, cards))
            }
            // Worst first: the ones a human must look at before anything else.
            groups.sort((a, b) => b.blockers.length - a.blockers.length)

            return BaseService.sendSuccessResponse({
                message: {
                    totalProfiles: profiles.length,
                    duplicatePhones: groups.length,
                    mergeable: groups.filter((g) => !g.blockers.length).length,
                    blocked: groups.filter((g) => g.blockers.length).length,
                    groups,
                    note:
                        'Nothing has been merged. Merge one phone at a time with ' +
                        'POST /api/admin/profile-duplicates/merge.',
                },
            })
        } catch (error) {
            console.error('findDuplicates failed:', error)
            return BaseService.sendFailedResponse({ error: error.message })
        }
    }

    async _describeGroup(phone, cards) {
        const sorted = [...cards].sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
        )
        const keep = sorted[0] // the OLDER card survives (client step 2)
        const absorb = sorted.slice(1)

        const withAccount = sorted.filter((c) => c.userId)
        const accountIds = [...new Set(withAccount.map((c) => String(c.userId)))]

        const blockers = []
        if (accountIds.length > 1) {
            blockers.push({
                code: 'two-accounts',
                message:
                    'Both cards are linked to DIFFERENT user accounts, so this is two logins ' +
                    'and two wallets, not one person split in two. Merging the accounts ' +
                    '(and deciding which login, wallet balance and referral code survives) ' +
                    'is a separate decision — it is not done here.',
                userIds: accountIds,
            })
        }

        // Message counts, so they can see nothing is being thrown away.
        const ids = sorted.map((c) => c._id)
        const [scheduled, logged] = await Promise.all([
            CrmScheduledMessageModel.countDocuments({ profileId: { $in: ids } }),
            CrmMessageLogModel.countDocuments({ profileId: { $in: ids } }),
        ])

        const account = withAccount[0] || null
        let wallet = null
        let orderCount = null
        if (account) {
            const [w, oc] = await Promise.all([
                WalletModel.findOne({ userId: account.userId }).lean(),
                BookOrderModel.countDocuments({ userId: account.userId }),
            ])
            wallet = w ? { balance: w.balance } : { balance: 0 }
            orderCount = oc
        }

        const plan = this._plan(keep, absorb)

        return {
            phone,
            cards: sorted.map((c) => ({
                _id: c._id,
                fullName: c.fullName || null,
                phoneNumber: c.phoneNumber,
                normalizedPhone: c.normalizedPhone,
                userId: c.userId || null,
                hasAccount: !!c.userId,
                stage: c.stage,
                totalOrders: c.totalOrders,
                totalSpent: c.totalSpent,
                leadSource: c.leadSource,
                createdAt: c.createdAt,
                role: String(c._id) === String(keep._id) ? 'survives' : 'absorbed',
            })),
            keepId: keep._id,
            absorbIds: absorb.map((c) => c._id),
            // What the survivor would look like afterwards.
            willBecome: {
                userId: plan.userId || null,
                referralCodeComesFrom: plan.userId
                    ? 'the account card'
                    : 'neither card has an account',
                stage: plan.stage,
                totalOrders: plan.totalOrders,
                totalSpent: plan.totalSpent,
                tags: plan.tags,
                firstOrderAt: plan.firstOrderAt || null,
                lastOrderAt: plan.lastOrderAt || null,
            },
            carriesOver: {
                scheduledMessages: scheduled,
                messageLogs: logged,
                walletBalance: wallet ? wallet.balance : null,
                ordersOnTheAccount: orderCount,
                walletNote: account
                    ? 'The wallet belongs to the account, and the account moves to the surviving card, so the balance follows untouched.'
                    : 'Neither card has an account, so there is no wallet.',
            },
            blockers,
            mergeable: blockers.length === 0,
        }
    }

    // Pure: what the survivor's fields become. No writes, so the report and the
    // merge can never describe different outcomes.
    _plan(keep, absorb) {
        const all = [keep, ...absorb]
        const account = all.find((c) => c.userId)
        const sum = (f) => all.reduce((s, c) => s + (c[f] || 0), 0)
        const furthest = all.reduce(
            (best, c) =>
                (STAGE_RANK[c.stage] ?? -1) > (STAGE_RANK[best.stage] ?? -1) ? c : best,
            all[0],
        )

        // Recomputed from the COMBINED order history with the CRM engine's own
        // rule, then the dormancy window applied the way the dormancy scan does
        // — so the merged card lands where its real history puts it and then
        // follows that stage's follow-up messages.
        const combinedOrders = sum('totalOrders')
        const lastOrder = latest(...all.map((c) => c.lastOrderAt))
        let recomputed = countStage(combinedOrders)
        if (
            combinedOrders > 0 &&
            lastOrder &&
            Date.now() - new Date(lastOrder).getTime() > DORMANT_DAYS * 86400000
        ) {
            // Quiet longer than the dormancy window — the scan would call them
            // dormant on its next pass, so the merge should not hand back a card
            // that is about to flip anyway.
            recomputed = CRM_STAGE.DORMANT
        }

        return {
            // The account (and with it the referral code, wallet and orders)
            // moves ONTO the older card — client step 4.
            userId: account ? account.userId : undefined,
            // Prefer the name on the account; a lead card's name is often what
            // a rider wrote down.
            fullName: account?.fullName || all.find((c) => c.fullName)?.fullName,
            email: all.find((c) => c.email)?.email,
            stage: recomputed,
            // What WAS there, so the report and the audit line can show the move
            // rather than just the result.
            stageWas: furthest.stage,
            stageRecomputedFrom: combinedOrders,
            totalOrders: sum('totalOrders'),
            totalSpent: sum('totalSpent'),
            nonSubscriptionOrders: sum('nonSubscriptionOrders'),
            expressOrders: sum('expressOrders'),
            firstOrderAt: earliest(...all.map((c) => c.firstOrderAt)),
            lastOrderAt: latest(...all.map((c) => c.lastOrderAt)),
            tags: [...new Set(all.flatMap((c) => c.tags || []))],
        }
    }

    // ── the merge (client steps 2-5) ─────────────────────────────────────────
    async mergeDuplicate(req) {
        try {
            const performedBy = req.user?.id
            const { phone, keepId, note } = req.body || {}

            if (!phone && !keepId) {
                return BaseService.sendFailedResponse({
                    error: 'Send the phone number to merge (or keepId to name the surviving card explicitly).',
                })
            }

            let cards
            if (phone) {
                const key = normalizePhone(phone)
                if (!key) {
                    return BaseService.sendFailedResponse({
                        error: `"${phone}" is not a usable Nigerian phone number.`,
                    })
                }
                const all = await CrmProfileModel.find({}).lean()
                cards = all.filter(
                    (p) => normalizePhone(p.normalizedPhone || p.phoneNumber) === key,
                )
            } else {
                if (!mongoose.Types.ObjectId.isValid(keepId)) {
                    return BaseService.sendFailedResponse({
                        error: 'That profile id is not valid.',
                    })
                }
                const anchor = await CrmProfileModel.findById(keepId).lean()
                if (!anchor) {
                    return BaseService.sendFailedResponse({
                        error: 'That profile no longer exists.',
                    })
                }
                const key = normalizePhone(anchor.normalizedPhone || anchor.phoneNumber)
                const all = await CrmProfileModel.find({}).lean()
                cards = all.filter(
                    (p) => normalizePhone(p.normalizedPhone || p.phoneNumber) === key,
                )
            }

            if (!cards || cards.length < 2) {
                return BaseService.sendFailedResponse({
                    error: 'There is only one card for that number — nothing to merge.',
                })
            }

            const group = await this._describeGroup(
                normalizePhone(cards[0].normalizedPhone || cards[0].phoneNumber),
                cards,
            )

            // Client step 5 — refuse, with the reason, BEFORE touching anything.
            if (group.blockers.length) {
                return BaseService.sendFailedResponse({
                    error: group.blockers.map((b) => b.message).join(' '),
                })
            }

            const sorted = [...cards].sort(
                (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
            )
            const keep = sorted[0]
            const absorb = sorted.slice(1)
            const plan = this._plan(keep, absorb)
            const absorbIds = absorb.map((c) => c._id)

            // 1. Move the messages first. If the profile write failed after this
            //    the messages would simply point at the surviving card, which is
            //    where we want them anyway — whereas deleting the absorbed cards
            //    first would orphan them.
            const [schedMoved, logMoved] = await Promise.all([
                CrmScheduledMessageModel.updateMany(
                    { profileId: { $in: absorbIds } },
                    { $set: { profileId: keep._id } },
                ),
                CrmMessageLogModel.updateMany(
                    { profileId: { $in: absorbIds } },
                    { $set: { profileId: keep._id } },
                ),
            ])

            // 2. Free the unique normalizedPhone on the absorbed cards BEFORE
            //    the survivor claims the canonical value, or the unique+sparse
            //    index rejects the write. This is the same index that makes the
            //    phone backfill fail on a split pair.
            await CrmProfileModel.updateMany(
                { _id: { $in: absorbIds } },
                { $unset: { normalizedPhone: '' } },
            )

            // 3. The survivor takes the merged picture.
            const canonical = normalizePhone(
                keep.normalizedPhone || keep.phoneNumber,
            )
            const stageNote = `Merged ${absorbIds.length} duplicate profile(s) for ${canonical}${
                note ? ` — ${note}` : ''
            }`
            await CrmProfileModel.updateOne(
                { _id: keep._id },
                {
                    $set: {
                        ...(plan.userId && { userId: plan.userId }),
                        ...(plan.fullName && { fullName: plan.fullName }),
                        ...(plan.email && { email: plan.email }),
                        phoneNumber: canonical,
                        normalizedPhone: canonical,
                        stage: plan.stage,
                        totalOrders: plan.totalOrders,
                        totalSpent: plan.totalSpent,
                        nonSubscriptionOrders: plan.nonSubscriptionOrders,
                        expressOrders: plan.expressOrders,
                        ...(plan.firstOrderAt && { firstOrderAt: plan.firstOrderAt }),
                        ...(plan.lastOrderAt && { lastOrderAt: plan.lastOrderAt }),
                        tags: plan.tags,
                    },
                    $push: {
                        stageHistory: {
                            from: keep.stage,
                            to: plan.stage,
                            note: stageNote,
                            changedBy: performedBy ? getObjectId(performedBy) : undefined,
                            changedAt: new Date(),
                        },
                    },
                },
            )

            // 4. The absorbed cards are ARCHIVED, never deleted — client ruling
            //    2026-10-08, and their reason is a good one: "phone numbers get
            //    shared and recycled here, so a wrong merge must be reversible."
            //    Hidden from lists and counts, marked with what they merged
            //    into, and restorable by an admin.
            //
            //    `normalizedPhone` was already unset in step 2, which is what
            //    lets the survivor hold the canonical number while these cards
            //    keep their history — the unique index allows only one.
            const removed = await CrmProfileModel.updateMany(
                { _id: { $in: absorbIds } },
                {
                    $set: {
                        mergedInto: keep._id,
                        mergedAt: new Date(),
                        mergedBy: performedBy ? getObjectId(performedBy) : undefined,
                        archived: true,
                    },
                },
            )

            await createAuditLog({
                userId: performedBy ? getObjectId(performedBy) : undefined,
                action:
                    `Merged duplicate CRM profiles for ${canonical}: kept ${keep._id}, ` +
                    `archived ${absorbIds.join(', ')}. Result: stage ${plan.stage} (recomputed from ${plan.stageRecomputedFrom} combined orders; the cards read ${plan.stageWas}), ` +
                    `${plan.totalOrders} orders, ₦${plan.totalSpent}` +
                    (plan.userId ? `, account ${plan.userId}` : ', no account') +
                    `. Moved ${schedMoved.modifiedCount} scheduled + ${logMoved.modifiedCount} logged messages.` +
                    (note ? ` Note: ${note}` : ''),
                // Never a bare string — a category not in the enum is what made
                // every "cannot create plan" report in brief 2.5 a false failure.
                category: AUDIT_LOG_CATEGORIES.CRM,
            })

            const survivor = await CrmProfileModel.findById(keep._id).lean()

            return BaseService.sendSuccessResponse({
                message: {
                    merged: true,
                    phone: canonical,
                    keptProfileId: keep._id,
                    archivedProfileIds: absorbIds,
                    archivedCount: removed.modifiedCount,
                    movedScheduledMessages: schedMoved.modifiedCount,
                    movedMessageLogs: logMoved.modifiedCount,
                    profile: survivor,
                },
            })
        } catch (error) {
            console.error('mergeDuplicate failed:', error)
            return BaseService.sendFailedResponse({ error: error.message })
        }
    }
}

module.exports = ProfileMergeService
module.exports.STAGE_RANK = STAGE_RANK
