const BaseService = require('./base.service')
const validateData = require('../util/validate')
const ComplaintCaseModel = require('../models/complaintCase.model')
const ComplaintTypeModel = require('../models/complaintType.model')
const RecoveryService = require('./recovery.service')
const ConversationService = require('./conversation.service')
const createAuditLog = require('../util/createAuditLog')
const paginate = require('../util/paginate')
const { getObjectId } = require('../util/helper')
const {
    CHAT_SENDER,
    ESCALATION_REASON,
    AUDIT_LOG_CATEGORIES,
    ROLE,
} = require('../util/constants')

// Request-facing surface for the recovery module: CX/staff case management,
// admin complaint-type CRUD, and the shared complaint chat. The state machine
// and business rules live in recovery.service / conversation.service.
class RecoveryApiService extends BaseService {
    // ─── complaint types (admin) ─────────────────────────────────────────────

    async listComplaintTypes(req) {
        try {
            const filter = {}
            if (req.query.active === 'true') filter.active = true
            if (req.query.active === 'false') filter.active = false
            const types = await ComplaintTypeModel.find(filter).sort({ name: 1 }).lean()
            return BaseService.sendSuccessResponse({ message: types })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to list complaint types' })
        }
    }

    async createComplaintType(req) {
        try {
            const validateResult = validateData(
                req.body,
                { name: 'string|required' },
                { required: ':attribute is required' },
            )
            if (!validateResult.success) {
                return BaseService.sendFailedResponse({ error: validateResult.data })
            }
            const exists = await ComplaintTypeModel.findOne({ name: req.body.name })
            if (exists) {
                return BaseService.sendFailedResponse({
                    error: 'A complaint type with this name already exists',
                })
            }
            const type = await ComplaintTypeModel.create({
                name: req.body.name,
                description: req.body.description,
                active: req.body.active !== false,
                createdBy: getObjectId(req.user.id),
            })
            return BaseService.sendSuccessResponse({ message: type })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to create complaint type' })
        }
    }

    async updateComplaintType(req) {
        try {
            const type = await ComplaintTypeModel.findById(req.params.id)
            if (!type) return BaseService.sendFailedResponse({ error: 'Complaint type not found' })
            for (const f of ['name', 'description', 'active']) {
                if (req.body[f] !== undefined) type[f] = req.body[f]
            }
            await type.save()
            return BaseService.sendSuccessResponse({ message: type })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to update complaint type' })
        }
    }

    // ─── CX queue + case management ──────────────────────────────────────────

    async listCases(req) {
        try {
            const { status, escalated, page, limit } = req.query
            const query = {}
            if (status) query.status = status
            if (escalated === 'true') query.escalated = true
            const { data, pagination } = await paginate(ComplaintCaseModel, query, {
                page,
                limit,
                sort: { createdAt: -1 },
                lean: true,
            })
            return BaseService.sendSuccessResponse({ message: { data, pagination } })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to list complaints' })
        }
    }

    async getCase(req) {
        try {
            const complaint = await RecoveryService.getCase(req.params.id)
            if (!complaint) return BaseService.sendFailedResponse({ error: 'Complaint not found' })
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load complaint' })
        }
    }

    async assignCase(req) {
        try {
            const complaint = await ComplaintCaseModel.findById(req.params.id)
            if (!complaint) return BaseService.sendFailedResponse({ error: 'Complaint not found' })
            complaint.assignedTo = req.body.assignedTo
                ? getObjectId(req.body.assignedTo)
                : getObjectId(req.user.id)
            await complaint.save()
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to assign complaint' })
        }
    }

    async transition(req) {
        try {
            const validateResult = validateData(
                req.body,
                { status: 'string|required' },
                { required: ':attribute is required' },
            )
            if (!validateResult.success) {
                return BaseService.sendFailedResponse({ error: validateResult.data })
            }
            const complaint = await RecoveryService.transitionStatus(req.params.id, req.body.status, {
                note: req.body.note,
                changedBy: getObjectId(req.user.id),
            })
            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.RECOVERY,
                action: `Complaint ${req.params.id} → ${req.body.status}`,
            })
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to transition' })
        }
    }

    async addAction(req) {
        try {
            const complaint = await RecoveryService.addRecoveryAction(req.params.id, {
                action: req.body.action,
                note: req.body.note,
                addedBy: getObjectId(req.user.id),
            })
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to add action' })
        }
    }

    async completeAction(req) {
        try {
            const complaint = await RecoveryService.completeRecoveryAction(
                req.params.id,
                parseInt(req.params.index),
            )
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to complete action' })
        }
    }

    // §7: request a compensation (wallet credit OR cash). Each call is a separate
    // action with its own amount/reason/evidence.
    async requestCredit(req) {
        try {
            const complaint = await RecoveryService.requestCompensation(req.params.id, {
                type: req.body.type,
                amount: req.body.amount,
                reason: req.body.reason,
                evidence: req.body.evidence,
                bankDetails: req.body.bankDetails,
                requestedBy: getObjectId(req.user.id),
            })
            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.RECOVERY,
                action: `Requested ${req.body.type === 'cash' ? 'cash' : 'wallet-credit'} compensation of ₦${req.body.amount} on complaint ${req.params.id}`,
            })
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to request compensation' })
        }
    }

    // §7: approve a compensation. Requires an explicit confirmation
    // (confirmed:true — the frontend confirmation screen). Approver role is
    // gated by amount + cumulative + cash rules in the service.
    async approveCredit(req) {
        try {
            const complaint = await RecoveryService.approveCompensation(req.params.id, {
                compensationId: req.body.compensationId,
                approvedBy: getObjectId(req.user.id),
                approverRole: req.user.userType,
                confirmed: req.body.confirmed === true || req.body.confirmed === 'true',
            })
            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.RECOVERY,
                action: `Approved compensation ${req.body.compensationId || '(pending)'} on complaint ${req.params.id}`,
            })
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to approve compensation' })
        }
    }

    async rejectCredit(req) {
        try {
            const complaint = await RecoveryService.rejectCompensation(req.params.id, {
                compensationId: req.body.compensationId,
                approvedBy: getObjectId(req.user.id),
                reason: req.body.reason,
            })
            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.RECOVERY,
                action: `Rejected compensation ${req.body.compensationId || '(pending)'} on complaint ${req.params.id}`,
            })
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to reject compensation' })
        }
    }

    // §7: record that an approved CASH compensation was manually transferred (paid).
    async markCompensationPaid(req) {
        try {
            const complaint = await RecoveryService.markCompensationPaid(req.params.id, {
                compensationId: req.body.compensationId,
                paidBy: getObjectId(req.user.id),
                reference: req.body.reference,
            })
            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.RECOVERY,
                action: `Marked cash compensation ${req.body.compensationId || '(pending)'} paid on complaint ${req.params.id}`,
            })
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to mark compensation paid' })
        }
    }

    // §6: CX creates a free recovery order (rewash/rework/repair/replace).
    async createRecoveryOrder(req) {
        try {
            const result = await RecoveryService.createRecoveryOrder(req.params.id, {
                action: req.body.action,
                note: req.body.note,
                items: req.body.items,
                createdBy: getObjectId(req.user.id),
            })
            await createAuditLog({
                userId: getObjectId(req.user.id),
                category: AUDIT_LOG_CATEGORIES.RECOVERY,
                action: `Created ${req.body.action} recovery order ${result.order.oscNumber} for complaint ${req.params.id}`,
            })
            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to create recovery order' })
        }
    }

    // §6: full complaint dashboard (evidence, chats, escalation, recovery orders,
    // compensations/approvals, SLA breaches).
    async caseDashboard(req) {
        try {
            const data = await RecoveryService.caseDashboard(req.params.id)
            return BaseService.sendSuccessResponse({ message: data })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to load dashboard' })
        }
    }

    async escalate(req) {
        try {
            const reason = req.body.reason
            if (reason && !Object.values(ESCALATION_REASON).includes(reason)) {
                return BaseService.sendFailedResponse({
                    error: `reason must be one of: ${Object.values(ESCALATION_REASON).join(', ')}`,
                })
            }
            const complaint = await RecoveryService.escalate(
                req.params.id,
                reason || ESCALATION_REASON.REVIEW_OVERDUE,
                { changedBy: getObjectId(req.user.id) },
            )
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to escalate' })
        }
    }

    // ─── customer-side complaint views + confirmation ────────────────────────

    async myComplaints(req) {
        try {
            const data = await RecoveryService.listCustomerComplaints(req.user.id)
            return BaseService.sendSuccessResponse({ message: data })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load complaints' })
        }
    }

    async getMyComplaint(req) {
        try {
            const complaint = await ComplaintCaseModel.findOne({
                _id: req.params.id,
                userId: req.user.id,
            })
                .populate('complaintTypeId')
                .populate('complaintTypeIds')
                .lean()
            if (!complaint) return BaseService.sendFailedResponse({ error: 'Complaint not found' })
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load complaint' })
        }
    }

    async confirmResolution(req) {
        try {
            const complaint = await RecoveryService.confirmResolution(
                req.params.id,
                req.user.id,
                { rating: req.body.rating, comment: req.body.comment },
            )
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to confirm' })
        }
    }

    async rejectResolution(req) {
        try {
            const complaint = await RecoveryService.rejectResolution(req.params.id, req.user.id, {
                note: req.body.note,
            })
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to reject' })
        }
    }

    // §5: customer reopens their closed complaint (within the admin window).
    async reopenComplaint(req) {
        try {
            const complaint = await RecoveryService.reopenCase(req.params.id, req.user.id, {
                note: req.body.note,
            })
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to reopen' })
        }
    }

    // §5: CX closes a resolved complaint the customer didn't confirm in time.
    async closeCase(req) {
        try {
            const complaint = await RecoveryService.closeCase(req.params.id, {
                closedBy: req.user.id,
                reason: req.body.reason,
            })
            return BaseService.sendSuccessResponse({ message: complaint })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to close' })
        }
    }

    // ─── complaint chat (shared: owner or staff) ─────────────────────────────

    async loadCaseFor(req, { staff }) {
        const query = { _id: req.params.id }
        if (!staff) query.userId = req.user.id
        return ComplaintCaseModel.findOne(query)
    }

    async listMessages(req, { staff }) {
        try {
            const complaint = await this.loadCaseFor(req, { staff })
            if (!complaint) return BaseService.sendFailedResponse({ error: 'Complaint not found' })
            const result = await ConversationService.listMessages({
                conversationId: complaint.conversationId,
                page: req.query.page,
                limit: req.query.limit,
            })
            // reading marks the requester's side read
            await ConversationService.markRead({
                conversationId: complaint.conversationId,
                side: staff ? 'staff' : 'customer',
            })
            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to load messages' })
        }
    }

    async postMessage(req, { staff }) {
        try {
            const complaint = await this.loadCaseFor(req, { staff })
            if (!complaint) return BaseService.sendFailedResponse({ error: 'Complaint not found' })
            const message = await ConversationService.postMessage({
                conversationId: complaint.conversationId,
                senderType: staff ? CHAT_SENDER.STAFF : CHAT_SENDER.CUSTOMER,
                senderId: getObjectId(req.user.id),
                text: req.body.text,
                attachments: req.body.attachments || [],
            })
            return BaseService.sendSuccessResponse({ message })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: error.message || 'Failed to send message' })
        }
    }
}

module.exports = RecoveryApiService
