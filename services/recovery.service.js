const ComplaintCaseModel = require('../models/complaintCase.model')
const ComplaintTypeModel = require('../models/complaintType.model')
const FeedbackModel = require('../models/feedback.model')
const UserModel = require('../models/user.model')
const BookOrderModel = require('../models/bookOrder.model')
const ChatMessageModel = require('../models/chatMessage.model')
const { generateOscNumber } = require('../util/helper')
const { explodeItemsToPieces } = require('../util/explodeItems')
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
    RECOVERY_COMPENSATION_TYPE,
    ESCALATION_REASON,
    CREDIT_TYPE,
    CREDIT_SOURCE,
    COMM_SOURCE_SYSTEM,
    NOTIFICATION_TYPE,
    OFFER_TRIGGER,
    ROLE,
    ORDER_STATUS,
    STATION_STATUS,
    ORDER_CHANNEL,
    BILLING_TYPE,
    PAYMENT_ORDER_STATUS,
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
        complaintTypeIds,
        affectedItems = [],
        description,
        photos = [],
    }) {
        // §5: accept one or many complaint types. Normalise to a de-duped array;
        // the first is stored as the primary complaintTypeId (back-compat).
        const rawTypes = (
            Array.isArray(complaintTypeIds) && complaintTypeIds.length
                ? complaintTypeIds
                : [complaintTypeId]
        ).filter(Boolean)
        const typeIds = [...new Set(rawTypes.map(String))]
        if (!typeIds.length) throw new Error('At least one complaint type is required')

        const types = await ComplaintTypeModel.find({
            _id: { $in: typeIds },
            active: true,
        })
        if (types.length !== typeIds.length) {
            throw new Error('One or more complaint types were not found or are inactive')
        }
        if (!description || !String(description).trim()) {
            throw new Error('A complaint description is required')
        }

        const settings = await this.getSettings()
        const now = Date.now()

        const complaint = await ComplaintCaseModel.create({
            userId,
            orderId,
            feedbackId,
            complaintTypeId: typeIds[0],
            complaintTypeIds: typeIds,
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
        const typeNames = types.map((t) => t.name).join(', ')
        await ConversationService.postSystemMessage(
            convo._id,
            `Complaint received: ${typeNames}. Our Customer Experience team will review it shortly.`,
        )

        // notify Customer Experience (owns all cases) + admins
        await this.notifyStaff([ROLE.CUSTOMER_EXPERIENCE, ROLE.ADMIN], {
            title: 'New complaint submitted',
            body: `A ${typeNames} complaint was opened and needs review.`,
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
            const settings = await this.getSettings()
            const windowHours = settings.complaintConfirmWindowHours ?? 48
            complaint.resolvedAt = new Date()
            // §5: start the customer confirmation window (48h default). Reset the
            // reminder flag so a re-resolve (after reopen) re-arms the reminder.
            complaint.confirmationDueAt = new Date(Date.now() + windowHours * HOUR)
            complaint.confirmationReminderSentAt = null
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

    // ─── §6 recovery orders (free, flow through the normal pipeline) ──────────

    // CX creates a FREE recovery order (rewash/rework/repair/replace) linked to
    // the complaint + original order + affected items. It enters Intake & Tag and
    // then follows the normal pipeline; CX cannot change its operational stages
    // (they have no station role). On delivery the complaint auto-advances.
    async createRecoveryOrder(caseId, { action, note, items, createdBy } = {}) {
        const physicalActions = [
            RECOVERY_ACTION.REWASH,
            RECOVERY_ACTION.REWORK,
            RECOVERY_ACTION.REPAIR,
            RECOVERY_ACTION.REPLACE,
        ]
        if (!physicalActions.includes(action)) {
            throw new Error(
                'A recovery order needs a physical action: rewash, rework, repair or replace',
            )
        }
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')

        const original = await BookOrderModel.findById(complaint.orderId)
        if (!original) throw new Error('Original order not found')

        // Items to redo: explicit list → affected items → original order items.
        // Recovery orders are free, so every line is priced at 0.
        let orderItems
        if (Array.isArray(items) && items.length) {
            orderItems = items.map((i) => ({
                type: i.type || i,
                price: 0,
                quantity: Number(i.quantity) || 1,
            }))
        } else if (complaint.affectedItems && complaint.affectedItems.length) {
            orderItems = complaint.affectedItems.map((label) => ({
                type: label,
                price: 0,
                quantity: 1,
            }))
        } else {
            orderItems = (original.items || []).map((i) => ({
                type: i.type,
                price: 0,
                quantity: i.quantity || 1,
            }))
        }
        if (!orderItems.length) {
            throw new Error('No items to include in the recovery order')
        }
        // per-piece: recovery items are tagged/tracked individually too
        orderItems = explodeItemsToPieces(orderItems)

        const recoveryOrder = await BookOrderModel.create({
            userId: complaint.userId,
            fullName: original.fullName,
            phoneNumber: original.phoneNumber,
            pickupAddress: original.pickupAddress,
            deliveryAddress: original.deliveryAddress,
            serviceType: original.serviceType,
            serviceTier: original.serviceTier,
            deliverySpeed: original.deliverySpeed,
            channel: ORDER_CHANNEL.OFFICE,
            amount: 0,
            deliveryAmount: 0,
            billingType: BILLING_TYPE.PAY_PER_ITEM,
            paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
            paymentDate: new Date(),
            oscNumber: generateOscNumber(),
            items: orderItems,
            extraNote: `Recovery (${action}) for complaint ${complaint._id}${note ? ` — ${note}` : ''}`,
            stage: { status: ORDER_STATUS.QUEUE, note: 'Recovery order created', updatedAt: new Date() },
            stageHistory: [{ status: ORDER_STATUS.QUEUE, note: 'Recovery order created', updatedAt: new Date() }],
            stationStatus: STATION_STATUS.INTAKE_AND_TAG_STATION,
            isRecoveryOrder: true,
            recoveryForComplaintId: complaint._id,
            recoveryForOrderId: complaint.orderId,
            recoveryActionType: action,
        })

        // record on the case + move it into recovery. Creating a recovery order
        // is a system action, so it moves any PRE-recovery state straight to
        // recovery-in-progress (bypasses the CX-only transition map). Terminal
        // states (resolved/confirmed/closed) are left as-is.
        complaint.recoveryOrderIds.push(recoveryOrder._id)
        complaint.recoveryActions.push({ action, note, addedBy: createdBy })
        const preRecovery = [
            COMPLAINT_STATUS.SUBMITTED,
            COMPLAINT_STATUS.UNDER_REVIEW,
            COMPLAINT_STATUS.AWAITING_ITEM,
            COMPLAINT_STATUS.ITEM_RECEIVED,
            COMPLAINT_STATUS.REOPENED,
        ]
        if (preRecovery.includes(complaint.status)) {
            this.recordStatus(
                complaint,
                COMPLAINT_STATUS.RECOVERY_IN_PROGRESS,
                `Recovery order created (${action})`,
                createdBy,
            )
        }
        await complaint.save()

        await ConversationService.postSystemMessage(
            complaint.conversationId,
            `We've started a ${this.humanize(action)} on your items. We'll keep you posted as it moves through our process.`,
        )
        // notify Intake & Tag (the recovery order enters their station first)
        await this.notifyStaff([ROLE.INTAKE_AND_TAG, ROLE.ADMIN], {
            title: 'Recovery order to intake',
            body: `A free ${action} recovery order (${recoveryOrder.oscNumber}) was created for complaint ${complaint._id}.`,
            page: 'complaint',
            recordId: String(complaint._id),
        })
        return { complaint, order: recoveryOrder }
    }

    // Called (via recoveryHooks) when ANY order is delivered. Only acts on
    // recovery orders: auto-advances the linked complaint to resolved (awaiting
    // customer confirmation) — CX never touched a stage. Non-fatal.
    async onRecoveryOrderDelivered(order) {
        if (!order?.isRecoveryOrder || !order.recoveryForComplaintId) return null
        const complaint = await ComplaintCaseModel.findById(order.recoveryForComplaintId)
        if (!complaint) return null
        // don't re-resolve a case already resolved/closed/confirmed
        const done = [
            COMPLAINT_STATUS.RESOLVED,
            COMPLAINT_STATUS.CUSTOMER_CONFIRMED,
            COMPLAINT_STATUS.CLOSED,
        ]
        if (done.includes(complaint.status)) return complaint

        // recovery-in-progress → ready → resolved (system-driven; bypasses the
        // CX transition guard since operations, not CX, moved it here)
        if (complaint.status !== COMPLAINT_STATUS.READY) {
            this.recordStatus(complaint, COMPLAINT_STATUS.READY, `Recovery order ${order.oscNumber} delivered`)
        }
        this.recordStatus(complaint, COMPLAINT_STATUS.RESOLVED, 'Recovery completed and delivered')
        const settings = await this.getSettings()
        const windowHours = settings.complaintConfirmWindowHours ?? 48
        complaint.resolvedAt = new Date()
        complaint.confirmationDueAt = new Date(Date.now() + windowHours * HOUR)
        complaint.confirmationReminderSentAt = null
        await complaint.save()

        await ConversationService.postSystemMessage(
            complaint.conversationId,
            'Your items are on the way back / ready. Please confirm once everything is good — you can also leave a rating.',
        )
        await CommunicationService.send({
            userId: complaint.userId,
            templateKey: 'complaint-update',
            data: { update: 'your recovery is complete — please confirm and rate' },
            sourceSystem: COMM_SOURCE_SYSTEM.RECOVERY,
            messageType: 'recovery-delivered',
            relatedRef: complaint._id,
            relatedModel: 'ComplaintCase',
            page: 'complaint',
            recordId: String(complaint._id),
        })
        return complaint
    }

    // §6 admin/CX dashboard: the full picture for one case — evidence, chats,
    // escalation, recovery orders (with live stages), compensations/approvals and
    // computed SLA-breach flags.
    async caseDashboard(caseId) {
        const complaint = await ComplaintCaseModel.findById(caseId)
            .populate('complaintTypeIds')
            .populate('complaintTypeId')
            .populate('assignedTo', 'fullName userType')
            .lean()
        if (!complaint) throw new Error('Complaint not found')

        const recoveryOrders = await BookOrderModel.find({
            _id: { $in: complaint.recoveryOrderIds || [] },
        })
            .select('oscNumber stage stationStatus recoveryActionType items createdAt updatedAt')
            .lean()

        const messages = complaint.conversationId
            ? await ChatMessageModel.find({ conversationId: complaint.conversationId })
                  .sort({ createdAt: 1 })
                  .lean()
            : []

        const now = new Date()
        const isOpen = ![
            COMPLAINT_STATUS.CLOSED,
            COMPLAINT_STATUS.CUSTOMER_CONFIRMED,
        ].includes(complaint.status)
        const slaBreaches = {
            reviewOverdue:
                isOpen &&
                !complaint.reviewedAt &&
                complaint.firstReviewDueAt &&
                new Date(complaint.firstReviewDueAt) < now,
            resolutionOverdue:
                isOpen &&
                !complaint.resolvedAt &&
                complaint.resolutionDueAt &&
                new Date(complaint.resolutionDueAt) < now,
            escalated: !!complaint.escalated,
        }

        // §7: cumulative approved compensation on the case (drives the ₦threshold
        // gate) + a per-type split, exposed so the frontend doesn't re-sum the
        // array or re-implement the approval math.
        const cumulativeApproved = this.cumulativeApprovedComp(complaint)
        const byType = (complaint.compensations || [])
            .filter((c) => c.status === RECOVERY_CREDIT_STATUS.APPROVED)
            .reduce((acc, c) => {
                acc[c.type] = (acc[c.type] || 0) + (c.amount || 0)
                return acc
            }, {})
        const settings = await this.getSettings()
        const approvalThreshold = settings.recoveryApprovalThreshold ?? 10000

        return {
            complaint,
            evidence: { photos: complaint.photos || [], affectedItems: complaint.affectedItems || [] },
            compensations: complaint.compensations || [],
            compensationSummary: {
                cumulativeApproved,
                byType,
                approvalThreshold,
            },
            recoveryActions: complaint.recoveryActions || [],
            recoveryOrders,
            escalation: {
                escalated: !!complaint.escalated,
                reason: complaint.escalationReason || null,
                escalatedAt: complaint.escalatedAt || null,
            },
            slaBreaches,
            messages,
        }
    }

    // ─── recovery credit (compensation) with approval gate ───────────────────

    // Sum of already-APPROVED compensation on a case (drives the cumulative gate).
    cumulativeApprovedComp(complaint) {
        return (complaint.compensations || [])
            .filter((c) => c.status === RECOVERY_CREDIT_STATUS.APPROVED)
            .reduce((sum, c) => sum + (c.amount || 0), 0)
    }

    // §7: mark an APPROVED CASH compensation as manually transferred/paid. Cash
    // has no in-system payout, so "approved" ≠ "paid" — this records that the
    // external bank transfer actually happened (who / when / reference). Only
    // valid on an approved cash compensation; idempotent (a second call no-ops).
    // With no compensationId, targets the single approved-but-unpaid cash comp.
    async markCompensationPaid(caseId, { compensationId, paidBy, reference }) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')

        const comp = compensationId
            ? complaint.compensations.id(compensationId)
            : complaint.compensations.find(
                  (c) =>
                      c.type === RECOVERY_COMPENSATION_TYPE.CASH &&
                      c.status === RECOVERY_CREDIT_STATUS.APPROVED &&
                      !c.paidOut,
              )
        if (!comp) throw new Error('Compensation not found')
        if (comp.type !== RECOVERY_COMPENSATION_TYPE.CASH) {
            throw new Error(
                'Only cash compensation is settled manually — wallet credits are already applied',
            )
        }
        if (comp.status !== RECOVERY_CREDIT_STATUS.APPROVED) {
            throw new Error('Only an approved cash compensation can be marked paid')
        }
        if (comp.paidOut) return complaint // idempotent

        comp.paidOut = true
        comp.paidOutAt = new Date()
        comp.paidOutBy = paidBy
        if (reference) comp.paidOutReference = reference
        await complaint.save()
        return complaint
    }

    // §7: request a compensation (a separate action each time). type is
    // wallet-credit (default) or cash; cash requires the customer's bank details.
    async requestCompensation(caseId, { type, amount, reason, evidence, bankDetails, requestedBy }) {
        amount = Math.round(Number(amount))
        if (!amount || amount <= 0) throw new Error('Amount must be positive')
        if (!reason || !String(reason).trim()) {
            throw new Error('A reason is required')
        }
        const compType = Object.values(RECOVERY_COMPENSATION_TYPE).includes(type)
            ? type
            : RECOVERY_COMPENSATION_TYPE.WALLET_CREDIT
        if (compType === RECOVERY_COMPENSATION_TYPE.CASH) {
            const b = bankDetails || {}
            if (!b.accountName || !b.accountNumber || !b.bankName) {
                throw new Error(
                    'Cash compensation requires the customer’s account name, account number and bank',
                )
            }
        }
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')

        complaint.compensations.push({
            type: compType,
            amount,
            reason,
            evidence: Array.isArray(evidence) ? evidence : evidence ? [evidence] : [],
            status: RECOVERY_CREDIT_STATUS.PENDING_APPROVAL,
            requestedBy,
            bankDetails: compType === RECOVERY_COMPENSATION_TYPE.CASH ? bankDetails : undefined,
        })
        await complaint.save()
        return complaint
    }

    // §7 approval gate: CASH always needs Admin/Founder; a single amount over the
    // threshold needs Admin; and once CUMULATIVE approved on the case would exceed
    // the threshold, further approvals move to Admin. Otherwise CX may approve.
    // A confirmation step (confirmed:true) is required before completing.
    async approveCompensation(caseId, { compensationId, approvedBy, approverRole, confirmed }) {
        if (confirmed !== true) {
            throw new Error('Approval must be confirmed')
        }
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')

        const comp = compensationId
            ? complaint.compensations.id(compensationId)
            : complaint.compensations.find(
                  (c) => c.status === RECOVERY_CREDIT_STATUS.PENDING_APPROVAL,
              )
        if (!comp || comp.status !== RECOVERY_CREDIT_STATUS.PENDING_APPROVAL) {
            throw new Error('No matching compensation is pending approval')
        }

        const settings = await this.getSettings()
        const threshold = settings.recoveryApprovalThreshold
        const cumulative = this.cumulativeApprovedComp(complaint)
        const isCash = comp.type === RECOVERY_COMPENSATION_TYPE.CASH
        const needsAdmin =
            isCash ||
            comp.amount > threshold ||
            cumulative + comp.amount > threshold
        if (needsAdmin && approverRole !== ROLE.ADMIN) {
            const why = isCash
                ? 'Cash compensation'
                : comp.amount > threshold
                  ? `Amounts above ₦${threshold.toLocaleString('en-NG')}`
                  : `This would take total compensation on the case above ₦${threshold.toLocaleString('en-NG')}`
            throw new Error(`${why} requires Operations Manager or Founder approval`)
        }

        const now = new Date()
        if (isCash) {
            // recorded/approved for MANUAL transfer — no in-system payout, no
            // wallet transaction (the money leaves outside the wallet).
            comp.status = RECOVERY_CREDIT_STATUS.APPROVED
            comp.approvedBy = approvedBy
            comp.decidedAt = now
        } else {
            // wallet credit — grantCredit creates the visible wallet transaction.
            const { credit } = await WalletCreditService.grantCredit({
                userId: complaint.userId,
                type: CREDIT_TYPE.RECOVERY,
                amount: comp.amount,
                sourceSystem: CREDIT_SOURCE.RECOVERY,
                sourceRef: `complaint-${complaint._id}-comp-${comp._id}`,
                relatedComplaintId: complaint._id,
                note: `Recovery compensation: ${comp.reason}`,
                grantedBy: approvedBy,
            })
            comp.status = RECOVERY_CREDIT_STATUS.APPROVED
            comp.approvedBy = approvedBy
            comp.decidedAt = now
            comp.walletCreditId = credit._id
        }

        // approved compensation may also link the configured Recovery Offer (once)
        if (!complaint.recoveryOfferTriggered) {
            offerOnTrigger(OFFER_TRIGGER.RECOVERY, { userId: complaint.userId })
            complaint.recoveryOfferTriggered = true
        }
        await complaint.save()

        const naira = `₦${comp.amount.toLocaleString('en-NG')}`
        await ConversationService.postSystemMessage(
            complaint.conversationId,
            isCash
                ? `Cash compensation of ${naira} has been approved and will be transferred to your account.`
                : `Compensation of ${naira} has been approved and added to your wallet as recovery credit.`,
        )
        await CommunicationService.send({
            userId: complaint.userId,
            templateKey: 'complaint-update',
            data: {
                update: isCash
                    ? `${naira} cash compensation approved — transfer to your account is being processed`
                    : `${naira} recovery credit added to your wallet`,
            },
            sourceSystem: COMM_SOURCE_SYSTEM.RECOVERY,
            messageType: isCash ? 'recovery-cash-approved' : 'recovery-credit-approved',
            relatedRef: complaint._id,
            relatedModel: 'ComplaintCase',
            page: isCash ? 'complaint' : 'wallet',
            recordId: String(complaint._id),
        })
        return complaint
    }

    async rejectCompensation(caseId, { compensationId, approvedBy, reason }) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')
        const comp = compensationId
            ? complaint.compensations.id(compensationId)
            : complaint.compensations.find(
                  (c) => c.status === RECOVERY_CREDIT_STATUS.PENDING_APPROVAL,
              )
        if (!comp || comp.status !== RECOVERY_CREDIT_STATUS.PENDING_APPROVAL) {
            throw new Error('No matching compensation is pending approval')
        }
        comp.status = RECOVERY_CREDIT_STATUS.REJECTED
        comp.approvedBy = approvedBy
        comp.decidedAt = new Date()
        if (reason) comp.rejectionReason = reason
        await complaint.save()
        return complaint
    }

    // ─── customer confirmation ───────────────────────────────────────────────

    async confirmResolution(caseId, userId, { rating, comment } = {}) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')
        if (String(complaint.userId) !== String(userId)) {
            throw new Error('Not your complaint')
        }
        if (complaint.status !== COMPLAINT_STATUS.RESOLVED) {
            throw new Error('This complaint is not awaiting your confirmation')
        }

        // §5: capture the post-recovery 1–5★ rating (+ optional comment).
        if (rating !== undefined && rating !== null && rating !== '') {
            const r = Number(rating)
            if (!Number.isInteger(r) || r < 1 || r > 5) {
                throw new Error('Rating must be a whole number from 1 to 5')
            }
            complaint.recoveryRating = r
            if (comment) complaint.recoveryRatingComment = String(comment)
        }

        // §5: customer confirmation is the final close (confirmed = true).
        this.recordStatus(complaint, COMPLAINT_STATUS.CUSTOMER_CONFIRMED, 'Customer confirmed resolution', userId)
        this.recordStatus(complaint, COMPLAINT_STATUS.CLOSED, 'Closed on customer confirmation', userId)
        const now = new Date()
        complaint.confirmedAt = now
        complaint.confirmed = true
        complaint.closedAt = now
        await complaint.save()

        await this.afterClose(complaint, 'Thank you for confirming. This complaint is now closed. 🙏')
        return complaint
    }

    // §5: CX closes a resolved complaint the customer never confirmed. Only
    // allowed once the 48h confirmation window has elapsed.
    async closeCase(caseId, { closedBy, reason } = {}) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')
        if (complaint.status !== COMPLAINT_STATUS.RESOLVED) {
            throw new Error('Only a resolved complaint awaiting confirmation can be closed')
        }
        if (complaint.confirmationDueAt && complaint.confirmationDueAt > new Date()) {
            throw new Error(
                'The customer still has time to confirm — you can close this once the confirmation window has passed',
            )
        }

        this.recordStatus(
            complaint,
            COMPLAINT_STATUS.CLOSED,
            reason || 'Closed by Customer Experience (no customer response)',
            closedBy,
        )
        complaint.confirmed = false
        complaint.closedAt = new Date()
        complaint.closedBy = closedBy
        if (reason) complaint.closeReason = reason
        await complaint.save()

        await this.afterClose(
            complaint,
            'This complaint has been closed by our team. If you still need help, you can reopen it.',
        )
        return complaint
    }

    // Shared close side-effects (§5): drop recovery tags, restore referral
    // eligibility, and post a closing note. Never throws into the caller.
    async afterClose(complaint, note) {
        try {
            await CrmService.clearRecoveryTags(complaint.userId)
        } catch (err) {
            console.warn('Recovery tag clear failed (non-fatal):', err.message)
        }
        referralOnEligibilityRestored(complaint.userId)
        await ConversationService.postSystemMessage(complaint.conversationId, note)
    }

    // §5: customer reopens a closed complaint within the admin-configurable
    // window (default 7 days). Puts it back into review and re-applies tags.
    async reopenCase(caseId, userId, { note } = {}) {
        const complaint = await ComplaintCaseModel.findById(caseId)
        if (!complaint) throw new Error('Complaint not found')
        if (String(complaint.userId) !== String(userId)) {
            throw new Error('Not your complaint')
        }
        const terminal = [
            COMPLAINT_STATUS.CLOSED,
            COMPLAINT_STATUS.CUSTOMER_CONFIRMED,
        ]
        if (!terminal.includes(complaint.status)) {
            throw new Error('Only a closed complaint can be reopened')
        }
        const settings = await this.getSettings()
        const reopenDays = settings.complaintReopenDays ?? 7
        const closedAt = complaint.closedAt || complaint.confirmedAt
        if (
            closedAt &&
            Date.now() - new Date(closedAt).getTime() > reopenDays * 24 * HOUR
        ) {
            throw new Error(
                `The reopening window (${reopenDays} days) for this complaint has passed`,
            )
        }

        this.recordStatus(complaint, COMPLAINT_STATUS.REOPENED, note || 'Customer reopened the complaint', userId)
        this.recordStatus(complaint, COMPLAINT_STATUS.UNDER_REVIEW, 'Reopened for review', userId)
        complaint.reopenedAt = new Date()
        complaint.reopenCount = (complaint.reopenCount || 0) + 1
        // clear terminal markers so it flows through the pipeline again
        complaint.resolvedAt = null
        complaint.confirmedAt = null
        complaint.confirmed = false
        complaint.closedAt = null
        complaint.confirmationDueAt = null
        complaint.confirmationReminderSentAt = null
        await complaint.save()

        // re-pause referral + re-tag while the reopened case is worked
        try {
            await CrmService.applyRecoveryTags(complaint.userId)
        } catch (err) {
            console.warn('Recovery tag re-apply failed (non-fatal):', err.message)
        }
        await ConversationService.postSystemMessage(
            complaint.conversationId,
            'Your complaint has been reopened. Our Customer Experience team will take another look.',
        )
        await this.notifyStaff([ROLE.CUSTOMER_EXPERIENCE, ROLE.ADMIN], {
            title: 'Complaint reopened',
            body: `Complaint ${complaint._id} was reopened by the customer.`,
            page: 'complaint',
            recordId: String(complaint._id),
        })
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

        // resolution overdue: not yet resolved/confirmed/closed past resolutionDueAt
        const resolutionOverdue = await ComplaintCaseModel.find({
            status: {
                $nin: [
                    COMPLAINT_STATUS.RESOLVED,
                    COMPLAINT_STATUS.CUSTOMER_CONFIRMED,
                    COMPLAINT_STATUS.CLOSED,
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

        // §5: confirmation window elapsed — remind the customer one last time and
        // let CX know they may now close the case. Fires once per resolved case.
        const awaitingConfirm = await ComplaintCaseModel.find({
            status: COMPLAINT_STATUS.RESOLVED,
            confirmationDueAt: { $lte: now },
            confirmationReminderSentAt: null,
        })
        for (const c of awaitingConfirm) {
            c.confirmationReminderSentAt = now
            await c.save()
            // final nudge to the customer
            await CommunicationService.send({
                userId: c.userId,
                templateKey: 'complaint-update',
                data: { update: 'please confirm your resolved complaint or it will be closed' },
                sourceSystem: COMM_SOURCE_SYSTEM.RECOVERY,
                messageType: 'complaint-confirm-reminder',
                relatedRef: c._id,
                relatedModel: 'ComplaintCase',
                page: 'complaint',
                recordId: String(c._id),
            })
            // tell CX they may close it now
            await this.notifyStaff([ROLE.CUSTOMER_EXPERIENCE, ROLE.ADMIN], {
                title: 'Complaint awaiting close',
                body: `Complaint ${c._id} was not confirmed within the window — you may close it.`,
                page: 'complaint',
                recordId: String(c._id),
            })
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
