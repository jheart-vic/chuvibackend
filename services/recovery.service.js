const ComplaintCaseModel = require('../models/complaintCase.model')
const ComplaintTypeModel = require('../models/complaintType.model')
const FeedbackModel = require('../models/feedback.model')
const UserModel = require('../models/user.model')
const CrmService = require('./crm.service')
const ConversationService = require('./conversation.service')
const CommunicationService = require('./communication.service')
const WalletCreditService = require('./walletCredit.service')
const createNotification = require('../util/createNotification')
const { offerOnTrigger } = require('../util/offerHooks')
const { referralOnEligibilityRestored } = require('../util/referralHooks')
const {
    COMPLAINT_STATUS,
    COMPLAINT_TRANSITIONS,
    RECOVERY_ACTION,
    RECOVERY_CREDIT_STATUS,
    ESCALATION_REASON,
    CREDIT_TYPE,
    CREDIT_SOURCE,
    COMM_SOURCE_SYSTEM,
    NOTIFICATION_TYPE,
    OFFER_TRIGGER,
    ROLE,
} = require('../util/constants')

const HOUR = 60 * 60 * 1000

// The recovery engine: opens complaint cases, runs the status machine to a
// customer-confirmed resolution, manages recovery actions, gates compensation
// approval by amount, escalates, and enforces SLA. Owns the CRM tag/referral
// coupling and the Offer System recovery trigger.
class RecoveryService {
    async getSettings() {
        return WalletCreditService.getSettings()
    }

    // notify all staff of the given roles (fire-and-forget)
    async notifyStaff(roles, { title, body, page, recordId }) {
        try {
            const staff = await UserModel.find({ userType: { $in: roles } }, { _id: 1 }).lean()
            for (const s of staff) {
                await createNotification({
                    userId: s._id,
                    title,
                    body,
                    type: NOTIFICATION_TYPE.COMPLAINT,
                    page,
                    recordId,
                })
            }
        } catch (err) {
            console.warn('Staff notify failed (non-fatal):', err.message)
        }
    }

    recordStatus(complaint, to, note, changedBy) {
        complaint.statusHistory.push({
            from: complaint.status,
            to,
            note,
            changedBy,
            changedAt: new Date(),
        })
        complaint.status = to
    }

    // ─── open a case (called by feedback.service when type = complaint) ──────

    async openCase({
        userId,
        orderId,
        feedbackId,
        complaintTypeId,
        affectedItems = [],
        description,
        photos = [],
    }) {
        if (!complaintTypeId) throw new Error('complaintTypeId is required')
        const complaintType = await ComplaintTypeModel.findOne({
            _id: complaintTypeId,
            active: true,
        })
        if (!complaintType) throw new Error('Complaint type not found or inactive')
        if (!description || !String(description).trim()) {
            throw new Error('A complaint description is required')
        }

        const settings = await this.getSettings()
        const now = Date.now()

        const complaint = await ComplaintCaseModel.create({
            userId,
            orderId,
            feedbackId,
            complaintTypeId,
            affectedItems,
            description,
            photos,
            status: COMPLAINT_STATUS.SUBMITTED,
            firstReviewDueAt: new Date(now + settings.complaintReviewHours * HOUR),
            resolutionDueAt: new Date(now + settings.complaintResolutionHours * HOUR),
            statusHistory: [{ to: COMPLAINT_STATUS.SUBMITTED, note: 'Complaint submitted' }],
        })

        // CRM: apply Complaint + Recovery-Required tags, pause referral
        try {
            await CrmService.applyRecoveryTags(userId)
        } catch (err) {
            console.warn('Recovery tag apply failed (non-fatal):', err.message)
        }

        // in-app complaint conversation
        const convo = await ConversationService.getOrCreateForComplaint({
            userId,
            complaintCaseId: complaint._id,
            orderId,
        })
        complaint.conversationId = convo._id
        await complaint.save()
        await ConversationService.postSystemMessage(
            convo._id,
            `Complaint received: ${complaintType.name}. Our Customer Experience team will review it shortly.`,
        )

        // notify Customer Experience (owns all cases) + admins
        await this.notifyStaff([ROLE.CUSTOMER_EXPERIENCE, ROLE.ADMIN], {
            title: 'New complaint submitted',
            body: `A ${complaintType.name} complaint was opened and needs review.`,
            page: 'complaint',
            recordId: String(complaint._id),
        })

        return complaint
    }

    // ─── status machine ──────────────────────────────────────────────────────

    async transitionStatus(caseId, to, { note, changedBy } = {}) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')

        const allowed = COMPLAINT_TRANSITIONS[complaint.status] || []
        if (!allowed.includes(to)) {
            throw new Error(
                `Cannot move a complaint from "${complaint.status}" to "${to}"`,
            )
        }

        this.recordStatus(complaint, to, note, changedBy)
        if (to === COMPLAINT_STATUS.UNDER_REVIEW && !complaint.reviewedAt) {
            complaint.reviewedAt = new Date()
        }
        if (to === COMPLAINT_STATUS.RESOLVED) {
            complaint.resolvedAt = new Date()
        }
        await complaint.save()

        await ConversationService.postSystemMessage(
            complaint.conversationId,
            `Status update: ${this.humanize(to)}.${note ? ` ${note}` : ''}`,
        )
        // out-of-app nudge for the big moments
        if (to === COMPLAINT_STATUS.RESOLVED) {
            await CommunicationService.send({
                userId: complaint.userId,
                templateKey: 'complaint-update',
                data: { update: 'your issue has been resolved — please confirm' },
                sourceSystem: COMM_SOURCE_SYSTEM.RECOVERY,
                messageType: 'complaint-resolved',
                relatedRef: complaint._id,
                relatedModel: 'ComplaintCase',
                page: 'complaint',
                recordId: String(complaint._id),
            })
        }
        return complaint
    }

    humanize(status) {
        return String(status)
            .split('-')
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join(' ')
    }

    // ─── recovery actions ────────────────────────────────────────────────────

    async addRecoveryAction(caseId, { action, note, addedBy }) {
        if (!Object.values(RECOVERY_ACTION).includes(action)) {
            throw new Error(`Invalid recovery action "${action}"`)
        }
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')

        complaint.recoveryActions.push({ action, note, addedBy })

        // spec: replacement/compensation auto-escalate to a manager
        if (
            action === RECOVERY_ACTION.REPLACE ||
            action === RECOVERY_ACTION.COMPENSATE
        ) {
            this.flagEscalation(
                complaint,
                action === RECOVERY_ACTION.REPLACE
                    ? ESCALATION_REASON.REPLACEMENT_REQUIRED
                    : ESCALATION_REASON.COMPENSATION_REQUIRED,
            )
        }
        await complaint.save()

        await ConversationService.postSystemMessage(
            complaint.conversationId,
            `Recovery action set: ${this.humanize(action)}.`,
        )
        if (complaint.escalated) await this.notifyEscalation(complaint)
        return complaint
    }

    async completeRecoveryAction(caseId, actionIndex) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')
        const item = complaint.recoveryActions[actionIndex]
        if (!item) throw new Error('Recovery action not found')
        item.completed = true
        item.completedAt = new Date()
        await complaint.save()
        return complaint
    }

    // ─── recovery credit (compensation) with approval gate ───────────────────

    async requestRecoveryCredit(caseId, { amount, reason, requestedBy }) {
        amount = Math.round(Number(amount))
        if (!amount || amount <= 0) throw new Error('Amount must be positive')
        if (!reason || !String(reason).trim()) {
            throw new Error('Supporting reason/evidence is required')
        }
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')
        if (complaint.recoveryCredit && complaint.recoveryCredit.status === RECOVERY_CREDIT_STATUS.APPROVED) {
            throw new Error('A recovery credit was already approved for this case')
        }

        complaint.recoveryCredit = {
            amount,
            reason,
            status: RECOVERY_CREDIT_STATUS.PENDING_APPROVAL,
            requestedBy,
        }
        await complaint.save()
        return complaint
    }

    // approverRole must satisfy the amount gate: ≤ threshold → CX or admin;
    // above → admin (Ops Manager / Founder) only.
    async approveRecoveryCredit(caseId, { approvedBy, approverRole }) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')
        const rc = complaint.recoveryCredit
        if (!rc || rc.status !== RECOVERY_CREDIT_STATUS.PENDING_APPROVAL) {
            throw new Error('No recovery credit is pending approval on this case')
        }

        const settings = await this.getSettings()
        if (rc.amount > settings.recoveryApprovalThreshold && approverRole !== ROLE.ADMIN) {
            throw new Error(
                `Amounts above ₦${settings.recoveryApprovalThreshold} require Operations Manager or Founder approval`,
            )
        }

        // grant the wallet recovery credit (90d default)
        const { credit } = await WalletCreditService.grantCredit({
            userId: complaint.userId,
            type: CREDIT_TYPE.RECOVERY,
            amount: rc.amount,
            sourceSystem: CREDIT_SOURCE.RECOVERY,
            sourceRef: `complaint-${complaint._id}`,
            relatedComplaintId: complaint._id,
            note: `Recovery compensation: ${rc.reason}`,
            grantedBy: approvedBy,
        })

        rc.status = RECOVERY_CREDIT_STATUS.APPROVED
        rc.approvedBy = approvedBy
        rc.decidedAt = new Date()
        rc.walletCreditId = credit._id

        // approved compensation may also link the configured Recovery Offer
        if (!complaint.recoveryOfferTriggered) {
            offerOnTrigger(OFFER_TRIGGER.RECOVERY, { userId: complaint.userId })
            complaint.recoveryOfferTriggered = true
        }
        await complaint.save()

        await ConversationService.postSystemMessage(
            complaint.conversationId,
            `Compensation of ₦${rc.amount.toLocaleString('en-NG')} has been approved and added to your wallet as recovery credit.`,
        )
        await CommunicationService.send({
            userId: complaint.userId,
            templateKey: 'complaint-update',
            data: { update: `₦${rc.amount.toLocaleString('en-NG')} recovery credit added to your wallet` },
            sourceSystem: COMM_SOURCE_SYSTEM.RECOVERY,
            messageType: 'recovery-credit-approved',
            relatedRef: complaint._id,
            relatedModel: 'ComplaintCase',
            page: 'wallet',
        })
        return complaint
    }

    async rejectRecoveryCredit(caseId, { approvedBy }) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')
        const rc = complaint.recoveryCredit
        if (!rc || rc.status !== RECOVERY_CREDIT_STATUS.PENDING_APPROVAL) {
            throw new Error('No recovery credit is pending approval on this case')
        }
        rc.status = RECOVERY_CREDIT_STATUS.REJECTED
        rc.approvedBy = approvedBy
        rc.decidedAt = new Date()
        await complaint.save()
        return complaint
    }

    // ─── customer confirmation ───────────────────────────────────────────────

    async confirmResolution(caseId, userId) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')
        if (String(complaint.userId) !== String(userId)) {
            throw new Error('Not your complaint')
        }
        if (complaint.status !== COMPLAINT_STATUS.RESOLVED) {
            throw new Error('This complaint is not awaiting your confirmation')
        }

        this.recordStatus(complaint, COMPLAINT_STATUS.CUSTOMER_CONFIRMED, 'Customer confirmed resolution', userId)
        complaint.confirmedAt = new Date()
        await complaint.save()

        // CRM: remove recovery tags, restore referral eligibility
        try {
            await CrmService.clearRecoveryTags(complaint.userId)
        } catch (err) {
            console.warn('Recovery tag clear failed (non-fatal):', err.message)
        }
        // release any referral rewards deferred while this customer was paused
        referralOnEligibilityRestored(complaint.userId)
        await ConversationService.postSystemMessage(
            complaint.conversationId,
            'Thank you for confirming. This complaint is now closed. 🙏',
        )
        await ConversationService.closeConversation(complaint.conversationId)
        return complaint
    }

    async rejectResolution(caseId, userId, { note } = {}) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')
        if (String(complaint.userId) !== String(userId)) {
            throw new Error('Not your complaint')
        }
        if (complaint.status !== COMPLAINT_STATUS.RESOLVED) {
            throw new Error('This complaint is not awaiting your confirmation')
        }

        // resolved → reopened → under-review, and escalate
        this.recordStatus(complaint, COMPLAINT_STATUS.REOPENED, note || 'Customer rejected the resolution', userId)
        this.recordStatus(complaint, COMPLAINT_STATUS.UNDER_REVIEW, 'Reopened for review', userId)
        complaint.resolvedAt = null
        this.flagEscalation(complaint, ESCALATION_REASON.CUSTOMER_REJECTED)
        await complaint.save()

        await ConversationService.postSystemMessage(
            complaint.conversationId,
            'We’re sorry the issue isn’t fully resolved. Your complaint has been reopened and escalated.',
        )
        await this.notifyEscalation(complaint)
        return complaint
    }

    // ─── escalation ──────────────────────────────────────────────────────────

    flagEscalation(complaint, reason) {
        complaint.escalated = true
        complaint.escalationReason = reason
        complaint.escalatedAt = new Date()
    }

    async escalate(caseId, reason, { changedBy } = {}) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')
        this.flagEscalation(complaint, reason)
        await complaint.save()
        await this.notifyEscalation(complaint)
        return complaint
    }

    async notifyEscalation(complaint) {
        await this.notifyStaff([ROLE.ADMIN], {
            title: 'Complaint escalated',
            body: `Complaint ${complaint._id} escalated: ${this.humanize(complaint.escalationReason || 'review needed')}.`,
            page: 'complaint',
            recordId: String(complaint._id),
        })
    }

    // ─── SLA sweep (cron) ────────────────────────────────────────────────────

    async checkSla() {
        const now = new Date()
        let escalated = 0

        // first review overdue: still submitted past firstReviewDueAt
        const reviewOverdue = await ComplaintCaseModel.find({
            status: COMPLAINT_STATUS.SUBMITTED,
            firstReviewDueAt: { $lte: now },
            escalated: false,
        })
        for (const c of reviewOverdue) {
            this.flagEscalation(c, ESCALATION_REASON.REVIEW_OVERDUE)
            await c.save()
            await this.notifyEscalation(c)
            escalated += 1
        }

        // resolution overdue: not yet resolved/confirmed past resolutionDueAt
        const resolutionOverdue = await ComplaintCaseModel.find({
            status: {
                $nin: [
                    COMPLAINT_STATUS.RESOLVED,
                    COMPLAINT_STATUS.CUSTOMER_CONFIRMED,
                ],
            },
            resolutionDueAt: { $lte: now },
            escalated: false,
        })
        for (const c of resolutionOverdue) {
            this.flagEscalation(c, ESCALATION_REASON.RESOLUTION_OVERDUE)
            await c.save()
            await this.notifyEscalation(c)
            escalated += 1
        }

        return escalated
    }

    // ─── queries ─────────────────────────────────────────────────────────────

    async getCase(caseId) {
        return ComplaintCaseModel.findById(caseId)
            .populate('complaintTypeId')
            .lean()
    }

    async listCustomerComplaints(userId) {
        return ComplaintCaseModel.find({ userId })
            .sort({ createdAt: -1 })
            .populate('complaintTypeId')
            .lean()
    }
}

module.exports = new RecoveryService()
