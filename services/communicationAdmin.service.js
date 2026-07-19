const BaseService = require('./base.service')
const validateData = require('../util/validate')
const TemplateModel = require('../models/template.model')
const CommunicationService = require('./communication.service')
const createAuditLog = require('../util/createAuditLog')
const { getObjectId } = require('../util/helper')
const { COMM_CHANNEL, AUDIT_LOG_CATEGORIES } = require('../util/constants')

// Admin dashboard surface of the communication layer: template management and
// the delivery ledger. The delivery engine itself lives in
// communication.service.js and is called by the other systems directly.
class CommunicationAdminService extends BaseService {
    async listTemplates(req) {
        try {
            const { active } = req.query
            const filter = {}
            if (active === 'true') filter.active = true
            if (active === 'false') filter.active = false
            const templates = await TemplateModel.find(filter)
                .sort({ key: 1 })
                .lean()
            return BaseService.sendSuccessResponse({ message: templates })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to list templates' })
        }
    }

    async createTemplate(req) {
        try {
            const post = req.body
            const validateRule = {
                key: 'string|required',
                name: 'string|required',
                title: 'string|required',
                body: 'string|required',
            }
            const validateResult = validateData(post, validateRule, {
                required: ':attribute is required',
            })
            if (!validateResult.success) {
                return BaseService.sendFailedResponse({ error: validateResult.data })
            }

            const key = String(post.key).trim().toLowerCase()
            const existing = await TemplateModel.findOne({ key })
            if (existing) {
                return BaseService.sendFailedResponse({
                    error: `A template with key "${key}" already exists`,
                })
            }

            if (post.channels) {
                const bad = post.channels.filter(
                    (c) => !Object.values(COMM_CHANNEL).includes(c),
                )
                if (bad.length) {
                    return BaseService.sendFailedResponse({
                        error: `Unknown channel(s): ${bad.join(', ')}`,
                    })
                }
            }

            const template = await TemplateModel.create({
                key,
                name: post.name,
                title: post.title,
                body: post.body,
                smsBody: post.smsBody,
                channels: post.channels,
                page: post.page,
                active: post.active !== false,
                updatedBy: getObjectId(req.user.id),
            })

            await createAuditLog({
                userId: getObjectId(req.user.id),
                action: `Created communication template "${key}"`,
                category: AUDIT_LOG_CATEGORIES.COMMUNICATION,
            })

            return BaseService.sendSuccessResponse({ message: template })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to create template' })
        }
    }

    async updateTemplate(req) {
        try {
            const { id } = req.params
            const post = req.body

            const template = await TemplateModel.findById(id)
            if (!template) {
                return BaseService.sendFailedResponse({ error: 'Template not found' })
            }

            if (post.channels) {
                const bad = post.channels.filter(
                    (c) => !Object.values(COMM_CHANNEL).includes(c),
                )
                if (bad.length) {
                    return BaseService.sendFailedResponse({
                        error: `Unknown channel(s): ${bad.join(', ')}`,
                    })
                }
            }

            // key is immutable — it's the identifier other systems send by
            const editable = ['name', 'title', 'body', 'smsBody', 'channels', 'page', 'active']
            for (const field of editable) {
                if (post[field] !== undefined) template[field] = post[field]
            }
            template.updatedBy = getObjectId(req.user.id)
            await template.save()

            await createAuditLog({
                userId: getObjectId(req.user.id),
                action: `Updated communication template "${template.key}"`,
                category: AUDIT_LOG_CATEGORIES.COMMUNICATION,
            })

            return BaseService.sendSuccessResponse({ message: template })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to update template' })
        }
    }

    async getLogs(req) {
        try {
            const result = await CommunicationService.getLogs(req.query)
            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to fetch communication logs' })
        }
    }

    async retryFailed(req) {
        try {
            const result = await CommunicationService.retryFailed({})
            await createAuditLog({
                userId: getObjectId(req.user.id),
                action: `Retried failed communications (${result.succeeded}/${result.attempted} succeeded)`,
                category: AUDIT_LOG_CATEGORIES.COMMUNICATION,
            })
            return BaseService.sendSuccessResponse({ message: result })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to retry communications' })
        }
    }
}

module.exports = CommunicationAdminService
