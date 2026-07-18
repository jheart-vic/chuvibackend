// CHUVI CRM engine — the "smart customer notebook".
// Owns: profiles (customer cards), stage transitions, automatic tags, the
// three workflows (lead nurture, post-delivery, reactivation), the scheduled
// message queue, and broadcasts. Order/auth services call in through
// util/crmHooks.js (fire-and-forget) so CRM failures can never break orders.
const BaseService = require('./base.service')
const CrmProfileModel = require('../models/crmProfile.model')
const CrmScheduledMessageModel = require('../models/crmScheduledMessage.model')
const CrmMessageLogModel = require('../models/crmMessageLog.model')
const CrmSettingModel = require('../models/crmSetting.model')
const BookOrderModel = require('../models/bookOrder.model')
const { sendCrmMessage, getCrmSettings } = require('./crmMessenger.service')
const createAuditLog = require('../util/createAuditLog')
const paginate = require('../util/paginate')
const { normalizePhone, getObjectId } = require('../util/helper')
const {
    CRM_STAGE,
    CRM_TAG,
    CRM_TAG_GROUPS,
    CRM_MANUAL_TAGS,
    CRM_WORKFLOW,
    CRM_MESSAGE_TYPE,
    CRM_INTERNAL_ACTIONS,
    CRM_MESSAGE_STATUS,
    CRM_BROADCAST_LIST,
    ORDER_CHANNEL,
    DELIVERY_SPEED,
    AUDIT_LOG_CATEGORIES,
} = require('../util/constants')

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// ─── Pure helpers ────────────────────────────────────────────────────────────

// order-count based stage (used when the customer is not dormant/reactivating)
const countStage = (totalOrders) => {
    if (totalOrders >= 5) return CRM_STAGE.LOYAL
    if (totalOrders >= 2) return CRM_STAGE.ACTIVE
    if (totalOrders === 1) return CRM_STAGE.FIRST_ORDER
    return CRM_STAGE.LEAD
}

// replace whatever tag from `group` is on the profile with `newTag` (or none)
const replaceGroupTags = (tags, group, newTag) => {
    const kept = tags.filter((t) => !group.includes(t))
    if (newTag) kept.push(newTag)
    return kept
}

const channelToTag = (channel) => {
    if (channel === ORDER_CHANNEL.WHATSAPP) return CRM_TAG.WHATSAPP
    if (channel === ORDER_CHANNEL.OFFICE) return CRM_TAG.WALK_IN
    if (channel === ORDER_CHANNEL.WEBSITE) return CRM_TAG.WEBSITE
    return null
}

const isExpressSpeed = (speed) =>
    speed === DELIVERY_SPEED.EXPRESS || speed === DELIVERY_SPEED.SAME_DAY

class CrmService {
    // ─── Profile resolution ──────────────────────────────────────────────────

    // Find a profile by phone first, then userId. Creates one when missing.
    // Always back-fills identity fields (userId link, name, email) so a
    // WhatsApp lead who later registers keeps one card.
    async findOrCreateProfile({ userId, fullName, phoneNumber, email, channel }) {
        const normalized = phoneNumber ? normalizePhone(phoneNumber) : null

        let profile = null
        if (normalized) {
            profile = await CrmProfileModel.findOne({
                normalizedPhone: normalized,
            })
        }
        if (!profile && userId) {
            profile = await CrmProfileModel.findOne({ userId })
        }

        if (!profile) {
            profile = await CrmProfileModel.create({
                userId: userId || undefined,
                fullName,
                phoneNumber,
                normalizedPhone: normalized || undefined,
                email,
                channel,
                stage: CRM_STAGE.LEAD,
                tags: [
                    ...(channelToTag(channel) ? [channelToTag(channel)] : []),
                    CRM_TAG.FRESH_LEAD,
                ],
            })
            return { profile, created: true }
        }

        // link/refresh identity without overwriting existing data
        let dirty = false
        if (userId && !profile.userId) {
            profile.userId = userId
            dirty = true
        }
        if (fullName && !profile.fullName) {
            profile.fullName = fullName
            dirty = true
        }
        if (email && !profile.email) {
            profile.email = email
            dirty = true
        }
        if (phoneNumber && !profile.phoneNumber) {
            profile.phoneNumber = phoneNumber
            profile.normalizedPhone = normalized
            dirty = true
        }
        if (channel && !profile.channel) {
            profile.channel = channel
            const tag = channelToTag(channel)
            if (tag && !profile.tags.includes(tag)) profile.tags.push(tag)
            dirty = true
        }
        if (dirty) await profile.save()

        return { profile, created: false }
    }

    setStage(profile, to, { note = '', changedBy = null } = {}) {
        if (profile.stage === to) return
        profile.stageHistory.push({
            from: profile.stage,
            to,
            note,
            changedBy,
            changedAt: new Date(),
        })
        profile.stage = to
    }

    // ─── Automatic tag engine ────────────────────────────────────────────────

    applyAutoTags(profile, thresholds) {
        let tags = [...profile.tags]

        // channel
        tags = replaceGroupTags(
            tags,
            CRM_TAG_GROUPS.CHANNEL,
            channelToTag(profile.channel),
        )

        if (profile.totalOrders > 0) {
            // converted → lead-status tags no longer apply
            tags = replaceGroupTags(tags, CRM_TAG_GROUPS.LEAD_STATUS, null)

            // relationship (reactivated wins while in that stage)
            const relationshipTag =
                profile.stage === CRM_STAGE.REACTIVATED
                    ? CRM_TAG.REACTIVATED_CUSTOMER
                    : profile.totalOrders >= 5
                      ? CRM_TAG.LOYAL_CUSTOMER
                      : profile.totalOrders >= 2
                        ? CRM_TAG.REPEAT_CUSTOMER
                        : CRM_TAG.NEW_CUSTOMER
            tags = replaceGroupTags(
                tags,
                CRM_TAG_GROUPS.RELATIONSHIP,
                relationshipTag,
            )

            // service preference
            const expressRatio = profile.expressOrders / profile.totalOrders
            tags = replaceGroupTags(
                tags,
                CRM_TAG_GROUPS.SERVICE_PREFERENCE,
                expressRatio >= thresholds.expressUserRatio
                    ? CRM_TAG.EXPRESS_USER
                    : CRM_TAG.STANDARD_USER,
            )

            // volume
            const avgAmount = profile.totalSpent / profile.totalOrders
            tags = replaceGroupTags(
                tags,
                CRM_TAG_GROUPS.ORDER_VOLUME,
                avgAmount >= thresholds.highVolumeAvgAmount
                    ? CRM_TAG.HIGH_VOLUME
                    : CRM_TAG.LOW_VOLUME,
            )

            // frequency
            const monthsActive = Math.max(
                1,
                (Date.now() - new Date(profile.firstOrderAt).getTime()) /
                    (30 * DAY),
            )
            const perMonth = profile.totalOrders / monthsActive
            tags = replaceGroupTags(
                tags,
                CRM_TAG_GROUPS.ORDER_FREQUENCY,
                perMonth >= thresholds.highFrequencyPerMonth
                    ? CRM_TAG.HIGH_FREQUENCY
                    : CRM_TAG.LOW_FREQUENCY,
            )
        }

        profile.tags = tags
    }

    // ─── Scheduled message queue ─────────────────────────────────────────────

    async scheduleMessages(profileId, workflow, entries) {
        if (!entries.length) return
        await CrmScheduledMessageModel.insertMany(
            entries.map((e) => ({
                profileId,
                workflow,
                messageType: e.messageType,
                dueAt: e.dueAt,
                cancelIfOrdered: !!e.cancelIfOrdered,
            })),
        )
    }

    async cancelPendingMessages(profileId, workflows) {
        await CrmScheduledMessageModel.updateMany(
            {
                profileId,
                workflow: { $in: workflows },
                status: CRM_MESSAGE_STATUS.PENDING,
            },
            { status: CRM_MESSAGE_STATUS.CANCELLED },
        )
    }

    // keep the card's "next follow-up date" in sync with the queue
    async refreshNextFollowUp(profileId) {
        const next = await CrmScheduledMessageModel.findOne({
            profileId,
            status: CRM_MESSAGE_STATUS.PENDING,
        }).sort({ dueAt: 1 })
        await CrmProfileModel.updateOne(
            { _id: profileId },
            { nextFollowUpAt: next ? next.dueAt : null },
        )
    }

    // ─── Lead workflow ───────────────────────────────────────────────────────

    // Welcome/Qualify/Offer/Close immediately → Reminder 1 after 24h →
    // Reminder 2 after 3 days → tagged Prospect 3 days later if still no order.
    async startLeadWorkflow(profile) {
        const now = Date.now()
        await this.scheduleMessages(profile._id, CRM_WORKFLOW.LEAD, [
            { messageType: CRM_MESSAGE_TYPE.LEAD_WELCOME, dueAt: new Date(now), cancelIfOrdered: true },
            { messageType: CRM_MESSAGE_TYPE.LEAD_QUALIFY, dueAt: new Date(now + 1000), cancelIfOrdered: true },
            { messageType: CRM_MESSAGE_TYPE.LEAD_OFFER, dueAt: new Date(now + 2000), cancelIfOrdered: true },
            { messageType: CRM_MESSAGE_TYPE.LEAD_CLOSE, dueAt: new Date(now + 3000), cancelIfOrdered: true },
            { messageType: CRM_MESSAGE_TYPE.LEAD_REMINDER_1, dueAt: new Date(now + DAY), cancelIfOrdered: true },
            { messageType: CRM_MESSAGE_TYPE.LEAD_REMINDER_2, dueAt: new Date(now + 3 * DAY), cancelIfOrdered: true },
            { messageType: CRM_MESSAGE_TYPE.LEAD_MARK_PROSPECT, dueAt: new Date(now + 6 * DAY), cancelIfOrdered: true },
        ])
        await this.refreshNextFollowUp(profile._id)
    }

    async createLead({ userId, fullName, phoneNumber, email, channel }) {
        const { profile, created } = await this.findOrCreateProfile({
            userId,
            fullName,
            phoneNumber,
            email,
            channel,
        })
        if (created) {
            await this.startLeadWorkflow(profile)
        }
        return { profile, created }
    }

    // ─── Post-delivery workflow ──────────────────────────────────────────────

    // 1h confirmation → 24h quality-check/feedback → 14d reorder prompt.
    // Restarted from scratch on every delivered order.
    async startPostDeliveryWorkflow(profile) {
        const now = Date.now()
        await this.cancelPendingMessages(profile._id, [
            CRM_WORKFLOW.POST_DELIVERY,
        ])
        await this.scheduleMessages(profile._id, CRM_WORKFLOW.POST_DELIVERY, [
            { messageType: CRM_MESSAGE_TYPE.DELIVERY_CONFIRMATION, dueAt: new Date(now + HOUR) },
            { messageType: CRM_MESSAGE_TYPE.FEEDBACK_REQUEST, dueAt: new Date(now + DAY) },
            { messageType: CRM_MESSAGE_TYPE.REORDER_PROMPT, dueAt: new Date(now + 14 * DAY), cancelIfOrdered: true },
        ])
    }

    // ─── Reactivation workflow ───────────────────────────────────────────────

    // Message 1 immediately when dormant → message 2 after 14d → message 3
    // after another 28d → tagged Churned 14d later if still no order.
    async startReactivationWorkflow(profile) {
        const now = Date.now()
        await this.cancelPendingMessages(profile._id, [
            CRM_WORKFLOW.REACTIVATION,
        ])
        await this.scheduleMessages(profile._id, CRM_WORKFLOW.REACTIVATION, [
            { messageType: CRM_MESSAGE_TYPE.REACTIVATION_1, dueAt: new Date(now), cancelIfOrdered: true },
            { messageType: CRM_MESSAGE_TYPE.REACTIVATION_2, dueAt: new Date(now + 14 * DAY), cancelIfOrdered: true },
            { messageType: CRM_MESSAGE_TYPE.REACTIVATION_3, dueAt: new Date(now + 42 * DAY), cancelIfOrdered: true },
            { messageType: CRM_MESSAGE_TYPE.REACTIVATION_MARK_CHURNED, dueAt: new Date(now + 56 * DAY), cancelIfOrdered: true },
        ])
        await this.refreshNextFollowUp(profile._id)
    }

    // ─── Event handlers (called via util/crmHooks.js) ────────────────────────

    async handleUserRegistered(user) {
        await this.createLead({
            userId: user._id,
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            email: user.email,
            channel: ORDER_CHANNEL.WEBSITE,
        })
    }

    // Order placed: the lead has converted out of the sales sequence.
    async handleOrderCreated(order) {
        const { profile } = await this.findOrCreateProfile({
            userId: order.userId,
            fullName: order.fullName,
            phoneNumber: order.phoneNumber,
            email: undefined,
            channel: order.channel,
        })

        await this.cancelPendingMessages(profile._id, [CRM_WORKFLOW.LEAD])

        profile.tags = replaceGroupTags(
            profile.tags,
            CRM_TAG_GROUPS.LEAD_STATUS,
            null,
        )
        if (profile.broadcastLists?.prospect?.active) {
            profile.broadcastLists.prospect.active = false
        }
        await profile.save()
        await this.refreshNextFollowUp(profile._id)
    }

    // Order delivered: update counters, move stage, retag, restart follow-ups.
    async handleOrderDelivered(order) {
        const { profile } = await this.findOrCreateProfile({
            userId: order.userId,
            fullName: order.fullName,
            phoneNumber: order.phoneNumber,
            email: undefined,
            channel: order.channel,
        })
        const settings = await getCrmSettings()

        const now = new Date()
        profile.totalOrders += 1
        profile.totalSpent += order.amount || 0
        if (isExpressSpeed(order.deliverySpeed)) profile.expressOrders += 1
        if (!profile.firstOrderAt) profile.firstOrderAt = now
        profile.lastOrderAt = now

        // stage transition
        if (profile.stage === CRM_STAGE.DORMANT) {
            profile.wasDormant = true
            this.setStage(profile, CRM_STAGE.REACTIVATED, {
                note: 'Ordered again after becoming dormant',
            })
        } else {
            this.setStage(profile, countStage(profile.totalOrders), {
                note: 'Order delivered',
            })
        }
        profile.dormantSince = null

        // a returning customer is no longer churned or a broadcast target
        profile.tags = profile.tags.filter((t) => t !== CRM_TAG.CHURNED)
        if (profile.broadcastLists?.churn?.active) {
            profile.broadcastLists.churn.active = false
        }
        if (profile.broadcastLists?.prospect?.active) {
            profile.broadcastLists.prospect.active = false
        }

        this.applyAutoTags(profile, settings.thresholds)
        await profile.save()

        // stop any sequences waiting on an order; restart post-delivery
        await this.cancelPendingMessages(profile._id, [
            CRM_WORKFLOW.LEAD,
            CRM_WORKFLOW.REACTIVATION,
        ])
        await this.startPostDeliveryWorkflow(profile)
        await this.refreshNextFollowUp(profile._id)
    }

    // ─── Internal actions (executed by the dispatcher) ───────────────────────

    async markProspect(profile) {
        profile.tags = replaceGroupTags(
            profile.tags,
            CRM_TAG_GROUPS.LEAD_STATUS,
            CRM_TAG.PROSPECT,
        )
        profile.broadcastLists.prospect.active = true
        profile.broadcastLists.prospect.joinedAt = new Date()
        await profile.save()
    }

    async markChurned(profile) {
        if (!profile.tags.includes(CRM_TAG.CHURNED)) {
            profile.tags.push(CRM_TAG.CHURNED)
        }
        // stage remains Dormant per spec
        profile.broadcastLists.churn.active = true
        profile.broadcastLists.churn.joinedAt = new Date()
        await profile.save()
    }

    // ─── Cron entry points ───────────────────────────────────────────────────

    // Runs every few minutes: send/execute everything due.
    async dispatchDueMessages() {
        const due = await CrmScheduledMessageModel.find({
            status: CRM_MESSAGE_STATUS.PENDING,
            dueAt: { $lte: new Date() },
        })
            .sort({ dueAt: 1 })
            .limit(100)

        const touchedProfiles = new Set()

        for (const msg of due) {
            try {
                const profile = await CrmProfileModel.findById(msg.profileId)
                if (!profile) {
                    msg.status = CRM_MESSAGE_STATUS.CANCELLED
                    await msg.save()
                    continue
                }

                // customer ordered since this was scheduled → sequence is over
                if (
                    msg.cancelIfOrdered &&
                    profile.lastOrderAt &&
                    profile.lastOrderAt > msg.createdAt
                ) {
                    msg.status = CRM_MESSAGE_STATUS.CANCELLED
                    await msg.save()
                    touchedProfiles.add(String(profile._id))
                    continue
                }

                if (CRM_INTERNAL_ACTIONS.includes(msg.messageType)) {
                    if (
                        msg.messageType === CRM_MESSAGE_TYPE.LEAD_MARK_PROSPECT
                    ) {
                        await this.markProspect(profile)
                    } else if (
                        msg.messageType ===
                        CRM_MESSAGE_TYPE.REACTIVATION_MARK_CHURNED
                    ) {
                        await this.markChurned(profile)
                    }
                    msg.status = CRM_MESSAGE_STATUS.SENT
                    msg.sentAt = new Date()
                    msg.channelUsed = 'internal'
                } else {
                    const result = await sendCrmMessage(profile, {
                        workflow: msg.workflow,
                        messageType: msg.messageType,
                    })
                    msg.status = result.success
                        ? CRM_MESSAGE_STATUS.SENT
                        : CRM_MESSAGE_STATUS.FAILED
                    msg.sentAt = result.success ? new Date() : undefined
                    msg.channelUsed = result.channel || undefined
                    if (!result.success) {
                        msg.error = 'No delivery channel succeeded'
                    }
                }
                await msg.save()
                touchedProfiles.add(String(profile._id))
            } catch (err) {
                console.error('CRM dispatch error for message', msg._id, err)
                msg.status = CRM_MESSAGE_STATUS.FAILED
                msg.error = err.message
                await msg.save().catch(() => {})
            }
        }

        for (const profileId of touchedProfiles) {
            await this.refreshNextFollowUp(profileId)
        }

        return due.length
    }

    // Runs daily: customers with no order for `dormantDays` become Dormant
    // and enter the reactivation sequence.
    async runDormancyScan() {
        const settings = await getCrmSettings()
        const cutoff = new Date(
            Date.now() - settings.thresholds.dormantDays * DAY,
        )

        const candidates = await CrmProfileModel.find({
            totalOrders: { $gt: 0 },
            stage: {
                $in: [
                    CRM_STAGE.FIRST_ORDER,
                    CRM_STAGE.ACTIVE,
                    CRM_STAGE.LOYAL,
                    CRM_STAGE.REACTIVATED,
                ],
            },
            lastOrderAt: { $lte: cutoff },
        })

        for (const profile of candidates) {
            try {
                this.setStage(profile, CRM_STAGE.DORMANT, {
                    note: `No order in ${settings.thresholds.dormantDays} days`,
                })
                profile.dormantSince = new Date()
                profile.wasDormant = true
                await profile.save()
                await this.startReactivationWorkflow(profile)
            } catch (err) {
                console.error('CRM dormancy error for', profile._id, err)
            }
        }

        return candidates.length
    }

    // Runs daily: prospect list every `prospectBroadcastDays`, churn list
    // every `churnBroadcastDays`.
    async runBroadcasts() {
        const settings = await getCrmSettings()
        const lists = [
            {
                list: CRM_BROADCAST_LIST.PROSPECT,
                days: settings.thresholds.prospectBroadcastDays,
                messageType: CRM_MESSAGE_TYPE.PROSPECT_BROADCAST,
            },
            {
                list: CRM_BROADCAST_LIST.CHURN,
                days: settings.thresholds.churnBroadcastDays,
                messageType: CRM_MESSAGE_TYPE.CHURN_BROADCAST,
            },
        ]

        let sent = 0
        for (const { list, days, messageType } of lists) {
            const dueBefore = new Date(Date.now() - days * DAY)
            const profiles = await CrmProfileModel.find({
                [`broadcastLists.${list}.active`]: true,
                $or: [
                    { [`broadcastLists.${list}.lastSentAt`]: null },
                    { [`broadcastLists.${list}.lastSentAt`]: { $lte: dueBefore } },
                ],
            }).limit(200)

            for (const profile of profiles) {
                try {
                    const result = await sendCrmMessage(profile, {
                        workflow: CRM_WORKFLOW.BROADCAST,
                        messageType,
                    })
                    if (result.success) {
                        profile.broadcastLists[list].lastSentAt = new Date()
                        await profile.save()
                        sent += 1
                    }
                } catch (err) {
                    console.error('CRM broadcast error for', profile._id, err)
                }
            }
        }

        return sent
    }

    // ─── API: staff tier (intake-and-tag + admin) ────────────────────────────

    async getCustomers(req) {
        try {
            const { stage, tag, channel, search, page, limit } = req.query

            const query = {}
            if (stage) query.stage = stage
            if (tag) query.tags = tag
            if (channel) query.channel = channel
            if (search) {
                const rx = new RegExp(
                    search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                    'i',
                )
                query.$or = [
                    { fullName: rx },
                    { phoneNumber: rx },
                    { email: rx },
                    { normalizedPhone: rx },
                ]
            }

            const result = await paginate(CrmProfileModel, query, {
                page,
                limit,
                sort: { updatedAt: -1 },
                lean: true,
            })

            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch CRM customers',
            })
        }
    }

    async getCustomerCard(req) {
        try {
            const profile = await CrmProfileModel.findById(req.params.id).lean()
            if (!profile) {
                return BaseService.sendFailedResponse(
                    { error: 'Customer profile not found' },
                    404,
                )
            }

            const orderQuery = profile.userId
                ? { userId: profile.userId }
                : { phoneNumber: profile.phoneNumber }

            const [orders, messages, pendingFollowUps] = await Promise.all([
                BookOrderModel.find(orderQuery)
                    .sort({ createdAt: -1 })
                    .limit(20)
                    .select(
                        'oscNumber amount serviceType serviceTier deliverySpeed channel stage paymentStatus createdAt',
                    )
                    .lean(),
                CrmMessageLogModel.find({ profileId: profile._id })
                    .sort({ createdAt: -1 })
                    .limit(50)
                    .lean(),
                CrmScheduledMessageModel.find({
                    profileId: profile._id,
                    status: CRM_MESSAGE_STATUS.PENDING,
                })
                    .sort({ dueAt: 1 })
                    .lean(),
            ])

            return BaseService.sendSuccessResponse({
                message: { profile, orders, messages, pendingFollowUps },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch customer card',
            })
        }
    }

    async addManualTag(req) {
        try {
            const { tag } = req.body
            if (!CRM_MANUAL_TAGS.includes(tag)) {
                return BaseService.sendFailedResponse({
                    error: `Only manual tags can be applied by staff: ${CRM_MANUAL_TAGS.join(', ')}`,
                })
            }

            const profile = await CrmProfileModel.findById(req.params.id)
            if (!profile) {
                return BaseService.sendFailedResponse(
                    { error: 'Customer profile not found' },
                    404,
                )
            }

            if (!profile.tags.includes(tag)) {
                profile.tags.push(tag)
                await profile.save()
            }

            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.CRM,
                action: `Applied CRM tag "${tag}" to ${profile.fullName || profile.phoneNumber}`,
            })

            return BaseService.sendSuccessResponse({ message: profile })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to apply tag',
            })
        }
    }

    async removeManualTag(req) {
        try {
            const { tag } = req.params
            if (!CRM_MANUAL_TAGS.includes(tag)) {
                return BaseService.sendFailedResponse({
                    error: `Only manual tags can be removed by staff: ${CRM_MANUAL_TAGS.join(', ')}`,
                })
            }

            const profile = await CrmProfileModel.findById(req.params.id)
            if (!profile) {
                return BaseService.sendFailedResponse(
                    { error: 'Customer profile not found' },
                    404,
                )
            }

            profile.tags = profile.tags.filter((t) => t !== tag)
            await profile.save()

            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.CRM,
                action: `Removed CRM tag "${tag}" from ${profile.fullName || profile.phoneNumber}`,
            })

            return BaseService.sendSuccessResponse({ message: profile })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to remove tag',
            })
        }
    }

    async correctStage(req) {
        try {
            const { stage, note } = req.body
            if (!Object.values(CRM_STAGE).includes(stage)) {
                return BaseService.sendFailedResponse({
                    error: `Invalid stage. Valid stages: ${Object.values(CRM_STAGE).join(', ')}`,
                })
            }

            const profile = await CrmProfileModel.findById(req.params.id)
            if (!profile) {
                return BaseService.sendFailedResponse(
                    { error: 'Customer profile not found' },
                    404,
                )
            }

            const from = profile.stage
            this.setStage(profile, stage, {
                note: note || 'Manual correction by staff',
                changedBy: getObjectId(req.user.id),
            })
            await profile.save()

            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.CRM,
                action: `Corrected CRM stage of ${profile.fullName || profile.phoneNumber} from "${from}" to "${stage}"`,
            })

            return BaseService.sendSuccessResponse({ message: profile })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to correct stage',
            })
        }
    }

    async createWalkInLead(req) {
        try {
            const { fullName, phoneNumber, email } = req.body
            if (!fullName || !phoneNumber) {
                return BaseService.sendFailedResponse({
                    error: 'fullName and phoneNumber are required',
                })
            }

            const { profile, created } = await this.createLead({
                fullName,
                phoneNumber,
                email,
                channel: ORDER_CHANNEL.OFFICE,
            })

            if (!created) {
                return BaseService.sendFailedResponse({
                    error: 'A CRM profile with this phone number already exists',
                })
            }

            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.CRM,
                action: `Created walk-in CRM lead ${fullName} (${phoneNumber})`,
            })

            return BaseService.sendSuccessResponse({ message: profile })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to create walk-in lead',
            })
        }
    }

    // reschedule ({ dueAt }) or cancel ({ cancel: true }) one pending follow-up
    async updateFollowUp(req) {
        try {
            const { dueAt, cancel } = req.body
            const msg = await CrmScheduledMessageModel.findById(req.params.id)
            if (!msg || msg.status !== CRM_MESSAGE_STATUS.PENDING) {
                return BaseService.sendFailedResponse(
                    { error: 'Pending follow-up not found' },
                    404,
                )
            }

            if (cancel) {
                msg.status = CRM_MESSAGE_STATUS.CANCELLED
            } else if (dueAt) {
                const newDate = new Date(dueAt)
                if (isNaN(newDate.getTime())) {
                    return BaseService.sendFailedResponse({
                        error: 'Invalid dueAt date',
                    })
                }
                msg.dueAt = newDate
            } else {
                return BaseService.sendFailedResponse({
                    error: 'Provide either dueAt (reschedule) or cancel: true',
                })
            }
            await msg.save()
            await this.refreshNextFollowUp(msg.profileId)

            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.CRM,
                action: cancel
                    ? `Cancelled CRM follow-up "${msg.messageType}"`
                    : `Rescheduled CRM follow-up "${msg.messageType}" to ${msg.dueAt.toISOString()}`,
            })

            return BaseService.sendSuccessResponse({ message: msg })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to update follow-up',
            })
        }
    }

    // Internal endpoint for the WhatsApp bot (separate repo) to register leads.
    async registerBotLead(req) {
        try {
            const { fullName, phoneNumber, email } = req.body
            if (!phoneNumber) {
                return BaseService.sendFailedResponse({
                    error: 'phoneNumber is required',
                })
            }

            const { profile, created } = await this.createLead({
                fullName,
                phoneNumber,
                email,
                channel: ORDER_CHANNEL.WHATSAPP,
            })

            return BaseService.sendSuccessResponse({
                message: { profileId: profile._id, created },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to register lead',
            })
        }
    }

    // ─── API: admin tier ─────────────────────────────────────────────────────

    async getMetrics(req) {
        try {
            const [
                totalProfiles,
                converted,
                repeat,
                dormant,
                everDormant,
                reactivated,
                revenueAgg,
                stageCounts,
            ] = await Promise.all([
                CrmProfileModel.countDocuments({}),
                CrmProfileModel.countDocuments({ totalOrders: { $gte: 1 } }),
                CrmProfileModel.countDocuments({ totalOrders: { $gte: 2 } }),
                CrmProfileModel.countDocuments({ stage: CRM_STAGE.DORMANT }),
                CrmProfileModel.countDocuments({ wasDormant: true }),
                CrmProfileModel.countDocuments({
                    wasDormant: true,
                    totalOrders: { $gte: 1 },
                    stage: { $ne: CRM_STAGE.DORMANT },
                }),
                CrmProfileModel.aggregate([
                    { $match: { totalOrders: { $gte: 1 } } },
                    { $group: { _id: null, total: { $sum: '$totalSpent' } } },
                ]),
                CrmProfileModel.aggregate([
                    { $group: { _id: '$stage', count: { $sum: 1 } } },
                ]),
            ])

            const pct = (part, whole) =>
                whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0
            const totalRevenue = revenueAgg[0]?.total || 0

            return BaseService.sendSuccessResponse({
                message: {
                    totalProfiles,
                    customers: converted,
                    leadConversionRate: pct(converted, totalProfiles),
                    repeatCustomerRate: pct(repeat, converted),
                    dormantRate: pct(dormant, converted),
                    reactivatedRate: pct(reactivated, everDormant),
                    revenuePerCustomer:
                        converted > 0
                            ? Math.round(totalRevenue / converted)
                            : 0,
                    totalRevenue,
                    stages: stageCounts.reduce(
                        (acc, s) => ({ ...acc, [s._id]: s.count }),
                        {},
                    ),
                },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to compute CRM metrics',
            })
        }
    }

    async getBroadcastList(req) {
        try {
            const { list } = req.params
            if (!Object.values(CRM_BROADCAST_LIST).includes(list)) {
                return BaseService.sendFailedResponse({
                    error: `Invalid list. Valid lists: ${Object.values(CRM_BROADCAST_LIST).join(', ')}`,
                })
            }

            const result = await paginate(
                CrmProfileModel,
                { [`broadcastLists.${list}.active`]: true },
                {
                    page: req.query.page,
                    limit: req.query.limit,
                    sort: { [`broadcastLists.${list}.joinedAt`]: -1 },
                    lean: true,
                },
            )

            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch broadcast list',
            })
        }
    }

    async getSettings(req) {
        try {
            const settings = await getCrmSettings()
            return BaseService.sendSuccessResponse({ message: settings })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch CRM settings',
            })
        }
    }

    async updateSettings(req) {
        try {
            const { templates, thresholds } = req.body
            const settings = await getCrmSettings()

            if (templates && typeof templates === 'object') {
                const validTypes = Object.values(CRM_MESSAGE_TYPE)
                for (const [key, value] of Object.entries(templates)) {
                    if (!validTypes.includes(key)) {
                        return BaseService.sendFailedResponse({
                            error: `Unknown message type: ${key}`,
                        })
                    }
                    if (typeof value !== 'string' || !value.trim()) {
                        return BaseService.sendFailedResponse({
                            error: `Template for ${key} must be a non-empty string`,
                        })
                    }
                    settings.templates.set(key, value)
                }
            }

            if (thresholds && typeof thresholds === 'object') {
                for (const [key, value] of Object.entries(thresholds)) {
                    if (
                        settings.thresholds[key] === undefined ||
                        typeof value !== 'number' ||
                        value < 0
                    ) {
                        return BaseService.sendFailedResponse({
                            error: `Invalid threshold: ${key}`,
                        })
                    }
                    settings.thresholds[key] = value
                }
            }

            await settings.save()

            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.CRM,
                action: 'Updated CRM settings',
            })

            return BaseService.sendSuccessResponse({ message: settings })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to update CRM settings',
            })
        }
    }
}

module.exports = new CrmService()
