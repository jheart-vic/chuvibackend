// Phase C complaint flow — identify the order → dedupe against an open case →
// pick a complaint type (auto-match or ask from the active catalog) → optional
// photo → confirm → RecoveryService.openCase. The bot NEVER resolves,
// compensates, or judges — it opens the case and routes it to Customer
// Experience. Extracted verbatim and mixed onto the orchestrator prototype (the
// matcher/summary helpers this._matchComplaintType/_pickComplaintType/
// _complaintSummary and isAffirmative/isNegative resolve there).
const RecoveryService = require('../recovery.service')
const BookOrderModel = require('../../models/bookOrder.model')
const ComplaintCaseModel = require('../../models/complaintCase.model')
const ComplaintTypeModel = require('../../models/complaintType.model')
const createAuditLog = require('../../util/createAuditLog')
const { BOT_INTENT, COMPLAINT_STATUS, AUDIT_LOG_CATEGORIES } = require('../../util/constants')

module.exports = {
    async complaintFlow({ convo, userId, text, slots, attachments = [], step }) {
        let description = slots.cDescription || null
        let typeId = slots.cTypeId || null
        let typeName = slots.cTypeName || null
        let orderId = slots.cOrderId || null
        let oscNumber = slots.cOsc || null
        let photos = Array.isArray(slots.cPhotos) ? slots.cPhotos : []

        // fold in any photo(s) attached this turn
        const newPhotos = (attachments || []).filter((u) => typeof u === 'string' && u.trim())
        if (newPhotos.length) photos = [...photos, ...newPhotos]

        const persist = (nextStep) => ({
            intent: BOT_INTENT.FILE_COMPLAINT,
            step: nextStep,
            slots: {
                cDescription: description,
                cTypeId: typeId,
                cTypeName: typeName,
                cOrderId: orderId,
                cOsc: oscNumber,
                cPhotos: photos,
            },
        })

        // ── first entry: capture description, find order, dedupe, match type ──
        if (!step) {
            description = String(text || '').trim()
            const order = await BookOrderModel.findOne({ userId }).sort({ createdAt: -1 }).lean()
            if (!order) {
                return {
                    replies: [
                        "I'm sorry there's a problem. I couldn't find an order on your account to attach this to — let me connect you to a person who can help.",
                    ],
                    handoff: true,
                }
            }
            orderId = String(order._id)
            oscNumber = order.oscNumber

            const open = await ComplaintCaseModel.findOne({
                userId,
                status: {
                    $nin: [COMPLAINT_STATUS.CLOSED, COMPLAINT_STATUS.CUSTOMER_CONFIRMED],
                },
            })
                .sort({ createdAt: -1 })
                .lean()
            if (open) {
                return {
                    replies: [
                        "I can see you already have a complaint with us that's still being handled, so I won't open a duplicate — our Customer Experience team is on it. Would you like me to connect you to a person for an update?",
                    ],
                    state: { intent: BOT_INTENT.FILE_COMPLAINT, step: 'offered-handoff', slots: {} },
                }
            }

            const types = await ComplaintTypeModel.find({ active: true }).lean()
            if (!types.length) {
                return {
                    replies: [
                        "I'm sorry about that. Let me connect you to a person who can log this properly.",
                    ],
                    handoff: true,
                }
            }
            const matched = this._matchComplaintType(description, types)
            if (matched) {
                typeId = String(matched._id)
                typeName = matched.name
                return {
                    replies: [
                        `I'm sorry about that. I'll log a "${typeName}" complaint for order ${oscNumber}. If you have a photo of the issue, send it now — or say "skip".`,
                    ],
                    state: persist('collect-photo'),
                }
            }
            const list = types.map((t, i) => `${i + 1}. ${t.name}`).join('\n')
            return {
                replies: [
                    `I'm sorry to hear that — I'll log a complaint for order ${oscNumber}. Which best describes the issue?\n${list}\n(reply with the number or the name)`,
                ],
                state: persist('collect-type'),
            }
        }

        // ── pick a type from the catalog ──
        if (step === 'collect-type') {
            const types = await ComplaintTypeModel.find({ active: true }).lean()
            const picked = this._pickComplaintType(text, types)
            if (!picked) {
                const list = types.map((t, i) => `${i + 1}. ${t.name}`).join('\n')
                return {
                    replies: [`Sorry, I didn't catch which one. Please reply with the number or name:\n${list}`],
                    state: persist('collect-type'),
                }
            }
            typeId = String(picked._id)
            typeName = picked.name
            return {
                replies: ['Thanks. If you have a photo of the issue, send it now — or say "skip".'],
                state: persist('collect-photo'),
            }
        }

        // ── optional photo → move to confirm ──
        if (step === 'collect-photo') {
            return {
                replies: [this._complaintSummary({ oscNumber, typeName, description, photos })],
                state: persist('confirm'),
            }
        }

        // ── confirm → open the case ──
        if (step === 'confirm') {
            if (this.isNegative(text)) {
                return { replies: ["Okay, I haven't logged it. Tell me if you'd like to change anything."] }
            }
            if (this.isAffirmative(text)) {
                let complaint
                try {
                    complaint = await RecoveryService.openCase({
                        userId,
                        orderId,
                        complaintTypeIds: [typeId],
                        description: description || 'Complaint raised via assistant',
                        photos,
                    })
                } catch (e) {
                    return {
                        replies: [
                            `I couldn't log the complaint just now (${e.message}). Let me connect you to a person.`,
                        ],
                        handoff: true,
                    }
                }
                try {
                    await createAuditLog({
                        userId,
                        action: `Bot opened complaint ${complaint._id} for order ${oscNumber} on customer request`,
                        category: AUDIT_LOG_CATEGORIES.RECOVERY,
                        orderId,
                    })
                } catch (_) {
                    /* audit best-effort; the case + statusHistory + notifications are the trail */
                }
                return {
                    replies: [
                        `Done — I've logged your complaint for order ${oscNumber}. Our Customer Experience team will review it and reach out to you. I'm sorry again for the trouble.`,
                    ],
                }
            }
            return {
                replies: [this._complaintSummary({ oscNumber, typeName, description, photos })],
                state: persist('confirm'),
            }
        }

        return {
            replies: ["I'm sorry about that — let me connect you to a person."],
            handoff: true,
        }
    },
}
