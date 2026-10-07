const BaseService = require('./base.service')
const validateData = require('../util/validate')
const TemplateModel = require('../models/template.model')
const CommunicationService = require('./communication.service')
const createAuditLog = require('../util/createAuditLog')
const { getObjectId } = require('../util/helper')
const { COMM_CHANNEL, AUDIT_LOG_CATEGORIES } = require('../util/constants')
const { logSafely } = require('../util/safeLog')
const {
    TARGET_PAGES,
    UNIVERSAL_PLACEHOLDERS,
    TEMPLATE_KEYS,
} = require('../util/commMeta')

// Fields the model requires. Mongoose `required` is satisfied by "   ", so a
// whitespace-only value used to save and leave the template rendering blank.
const REQUIRED_TEXT = ['name', 'title', 'body']

const firstBlankRequiredField = (post) =>
    REQUIRED_TEXT.find(
        (f) => post[f] !== undefined && !String(post[f] ?? '').trim(),
    ) || null

// Accept one channel as a string OR a list. THE 4.1 BUG: a single-select
// dropdown sending `channels: "sms"` hit `post.channels.filter(...)`, which threw
// `channels.filter is not a function`, and the catch-all reported it as a generic
// 400 — "saving a template always fails".
function normalizeChannels(input) {
    if (input === undefined || input === null) return { value: null }
    const list = (Array.isArray(input) ? input : [input])
        .map((c) => (typeof c === 'string' ? c.trim() : c))
        .filter((c) => c !== '' && c !== null && c !== undefined)
    const valid = Object.values(COMM_CHANNEL)
    const bad = list.filter((c) => typeof c !== 'string' || !valid.includes(c))
    if (bad.length) {
        return {
            error: `Unknown channel(s): ${bad.join(', ')}. Valid channels: ${valid.join(', ')}.`,
        }
    }
    if (!list.length) {
        return { error: `Pick at least one channel (${valid.join(' or ')}).` }
    }
    return { value: [...new Set(list)] }
}

// Say what the model rejected, by field, instead of a blanket failure.
function describeTemplateError(error, fallback) {
    if (error?.code === 11000) {
        const field = Object.keys(error.keyPattern || error.keyValue || {})[0]
        return field === 'key'
            ? 'A template with that key already exists.'
            : `That ${field || 'value'} is already in use.`
    }
    if (error?.name === 'ValidationError') {
        const first = Object.values(error.errors || {})[0]
        if (first) {
            return first.kind === 'required'
                ? `${first.path} is required.`
                : first.message
        }
    }
    if (error?.name === 'CastError' && error.path) {
        return `${error.path} must be a valid ${error.kind}.`
    }
    return fallback
}

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

            // Same normalisation as the update path — a single channel may arrive
            // as a string (4.1).
            const channels = normalizeChannels(post.channels)
            if (channels.error) {
                return BaseService.sendFailedResponse({
                    error: channels.error,
                    field: 'channels',
                })
            }
            const blank = firstBlankRequiredField(post)
            if (blank) {
                return BaseService.sendFailedResponse({
                    error: `${blank} cannot be empty.`,
                    field: blank,
                })
            }

            let template
            try {
                template = await TemplateModel.create({
                    key,
                    name: post.name,
                    title: post.title,
                    body: post.body,
                    smsBody: post.smsBody,
                    ...(channels.value ? { channels: channels.value } : {}),
                    page: post.page,
                    active: post.active !== false,
                    updatedBy: getObjectId(req.user.id),
                })
            } catch (error) {
                console.error('Template create rejected:', error)
                return BaseService.sendFailedResponse({
                    error: describeTemplateError(error, 'Could not create the template'),
                })
            }

            // The template exists past this point — the audit row must not be able
            // to report otherwise.
            await logSafely(
                'Template create audit',
                createAuditLog({
                    userId: getObjectId(req.user.id),
                    action: `Created communication template "${key}"`,
                    category: AUDIT_LOG_CATEGORIES.COMMUNICATION,
                }),
            )

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

            // Brief 4.1 — THE "always 400". `post.channels.filter(...)` threw
            // `channels.filter is not a function` whenever the editor sent a
            // single channel as a STRING ("sms") instead of an array, and the
            // catch-all turned that TypeError into "Failed to update template".
            // A string is now accepted and normalised.
            const channels = normalizeChannels(post.channels)
            if (channels.error) {
                return BaseService.sendFailedResponse({
                    error: channels.error,
                    field: 'channels',
                })
            }

            // Required text must not be BLANKED either. Mongoose `required` passes
            // on "   ", so a whitespace-only body saved happily and the template
            // then rendered empty for every customer it was sent to.
            const blank = firstBlankRequiredField(post)
            if (blank) {
                return BaseService.sendFailedResponse({
                    error: `${blank} cannot be empty.`,
                    field: blank,
                })
            }

            // key is immutable — it's the identifier other systems send by
            const editable = ['name', 'title', 'body', 'smsBody', 'page', 'active']
            for (const field of editable) {
                if (post[field] !== undefined) template[field] = post[field]
            }
            if (channels.value) template.channels = channels.value
            template.updatedBy = getObjectId(req.user.id)

            try {
                await template.save()
            } catch (error) {
                // Name what the model rejected instead of the generic 400 — this
                // is exactly what the client asked to be told.
                console.error('Template save rejected:', error)
                return BaseService.sendFailedResponse({
                    error: describeTemplateError(error, 'Could not save the template'),
                })
            }

            // The template IS saved past this point — the audit row must not be
            // able to report otherwise (brief 2.5 / 3.1, same shape).
            await logSafely(
                'Template update audit',
                createAuditLog({
                    userId: getObjectId(req.user.id),
                    action: `Updated communication template "${template.key}"`,
                    category: AUDIT_LOG_CATEGORIES.COMMUNICATION,
                }),
            )

            return BaseService.sendSuccessResponse({ message: template })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({ error: 'Failed to update template' })
        }
    }

    // Brief 4.2 — the editor had no way to know which placeholder keys and which
    // target pages exist, so they had to be guessed. Everything here is derived
    // from what the code ACTUALLY sends (util/commMeta.js), not from a wish list:
    // `templates` are the keys other systems render by, each one listing the
    // placeholders ITS caller supplies.
    async getTemplateMeta(req) {
        try {
            const existing = await TemplateModel.find({})
                .select('key name channels page active')
                .sort({ key: 1 })
                .lean()

            // Any {{placeholder}} an admin has already typed into a template, so
            // a key added by hand still appears in the dropdown.
            const used = new Set()
            for (const t of existing) {
                for (const src of [t.title, t.body, t.smsBody]) {
                    for (const m of String(src || '').matchAll(/{{\s*(\w+)\s*}}/g)) {
                        used.add(m[1])
                    }
                }
            }

            const known = new Set([
                ...UNIVERSAL_PLACEHOLDERS.map((p) => p.key),
                ...TEMPLATE_KEYS.flatMap((t) => (t.placeholders || []).map((p) => p.key)),
            ])

            return BaseService.sendSuccessResponse({
                message: {
                    pages: TARGET_PAGES,
                    placeholders: [
                        ...UNIVERSAL_PLACEHOLDERS,
                        ...TEMPLATE_KEYS.flatMap((t) =>
                            (t.placeholders || []).map((p) => ({
                                ...p,
                                onlyFor: t.key,
                            })),
                        ),
                        // Typed by an admin but supplied by nothing — surfaced so
                        // the editor can warn rather than silently print "{{x}}".
                        ...[...used]
                            .filter((k) => !known.has(k))
                            .map((k) => ({
                                key: k,
                                description:
                                    'Used in a template but not supplied by any system — it will print as-is.',
                                unresolved: true,
                            })),
                    ],
                    templates: TEMPLATE_KEYS.map((t) => ({
                        key: t.key,
                        description: t.description,
                        sentBy: t.sentBy,
                        exists: existing.some((e) => e.key === t.key),
                    })),
                    channels: Object.values(COMM_CHANNEL),
                    // Everything currently stored, so the editor can show which
                    // keys are already taken.
                    existing,
                },
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to load template options',
            })
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
