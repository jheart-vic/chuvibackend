const TemplateModel = require('../models/template.model')
const CommunicationLogModel = require('../models/communicationLog.model')
const UserModel = require('../models/user.model')
const createNotification = require('../util/createNotification')
const sendSms = require('../util/sendSms')
const {
    COMM_CHANNEL,
    COMM_STATUS,
    COMM_SOURCE_SYSTEM,
    NOTIFICATION_TYPE,
} = require('../util/constants')

// The "smart messenger". Other systems decide WHO should hear WHAT and WHEN;
// this facade renders an approved template, delivers through the right
// channels (in-app notification, SMS — WhatsApp later), and records every
// delivery in CommunicationLog. Same philosophy as util/crmHooks.js: a
// delivery failure is logged, never thrown into the calling flow.
class CommunicationService {
    renderTemplate(text, user, data = {}) {
        if (!text) return ''
        const name = user?.fullName || data.name || 'there'
        const vars = {
            name,
            firstName: name.split(' ')[0],
            ...data,
        }
        return text.replace(/{{\s*(\w+)\s*}}/g, (match, key) =>
            vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : match,
        )
    }

    // Main entry point. Either pass templateKey (+data) or explicit title/body.
    // Returns { logs } — one CommunicationLog per attempted channel. Never throws.
    async send({
        userId,
        templateKey,
        title,
        body,
        smsBody,
        data = {},
        sourceSystem = COMM_SOURCE_SYSTEM.SYSTEM,
        messageType,
        relatedRef,
        relatedModel,
        page,
        recordId,
        channels,
        notificationType = NOTIFICATION_TYPE.SYSTEM,
    }) {
        const logs = []
        try {
            if (!userId) throw new Error('userId is required')

            const user = await UserModel.findById(userId).lean()

            let template = null
            if (templateKey) {
                template = await TemplateModel.findOne({
                    key: templateKey,
                    active: true,
                }).lean()
                if (!template) {
                    throw new Error(`No active template "${templateKey}"`)
                }
            }
            if (!template && (!title || !body)) {
                throw new Error('Either templateKey or title+body is required')
            }

            const renderedTitle = this.renderTemplate(
                template ? template.title : title,
                user,
                data,
            )
            const renderedBody = this.renderTemplate(
                template ? template.body : body,
                user,
                data,
            )
            const renderedSms = this.renderTemplate(
                (template ? template.smsBody : smsBody) ||
                    (template ? template.body : body),
                user,
                data,
            )

            const targetChannels =
                channels && channels.length
                    ? channels
                    : template?.channels?.length
                      ? template.channels
                      : [COMM_CHANNEL.IN_APP]
            const targetPage = page || template?.page
            const type = messageType || templateKey || 'general'

            for (const channel of targetChannels) {
                const log = await CommunicationLogModel.create({
                    userId,
                    messageType: type,
                    sourceSystem,
                    templateKey: template?.key,
                    relatedRef,
                    relatedModel,
                    channel,
                    status: COMM_STATUS.PENDING,
                    content: { title: renderedTitle, body: renderedBody },
                })

                try {
                    if (channel === COMM_CHANNEL.IN_APP) {
                        const notification = await createNotification({
                            userId,
                            title: renderedTitle,
                            body: renderedBody,
                            type: notificationType,
                            page: targetPage,
                            recordId:
                                recordId || (relatedRef ? String(relatedRef) : undefined),
                        })
                        log.notificationId = notification._id
                        // in-app: creation in the user's feed counts as delivered
                        log.status = COMM_STATUS.DELIVERED
                        log.sentAt = new Date()
                    } else if (channel === COMM_CHANNEL.SMS) {
                        if (!user?.phoneNumber) {
                            throw new Error('User has no phone number')
                        }
                        await sendSms(user.phoneNumber, renderedSms)
                        // no delivery report wired yet — "sent" is as far as we know
                        log.status = COMM_STATUS.SENT
                        log.sentAt = new Date()
                    } else {
                        throw new Error(`Unsupported channel "${channel}"`)
                    }
                } catch (channelErr) {
                    log.status = COMM_STATUS.FAILED
                    log.error = channelErr.message
                }
                await log.save()
                logs.push(log)
            }
        } catch (err) {
            console.warn('Communication send failed (non-fatal):', err.message)
            if (userId) {
                try {
                    const failedLog = await CommunicationLogModel.create({
                        userId,
                        messageType: messageType || templateKey || 'general',
                        sourceSystem,
                        templateKey,
                        relatedRef,
                        relatedModel,
                        channel: COMM_CHANNEL.IN_APP,
                        status: COMM_STATUS.FAILED,
                        content: { title: title || '', body: body || '' },
                        error: err.message,
                    })
                    logs.push(failedLog)
                } catch (_) {
                    /* logging must never throw */
                }
            }
        }
        return { logs }
    }

    // Re-attempts failed SMS deliveries (in-app failures are configuration
    // errors, not transient). Capped retries so a dead number doesn't loop.
    async retryFailed({ maxRetries = 3, limit = 50 } = {}) {
        const failed = await CommunicationLogModel.find({
            status: COMM_STATUS.FAILED,
            channel: COMM_CHANNEL.SMS,
            retryCount: { $lt: maxRetries },
        })
            .sort({ createdAt: 1 })
            .limit(limit)

        let retried = 0
        for (const log of failed) {
            log.retryCount += 1
            try {
                const user = await UserModel.findById(log.userId).lean()
                if (!user?.phoneNumber) throw new Error('User has no phone number')
                await sendSms(user.phoneNumber, log.content?.body || '')
                log.status = COMM_STATUS.SENT
                log.sentAt = new Date()
                log.error = undefined
                retried += 1
            } catch (err) {
                log.error = err.message
            }
            await log.save()
        }
        return { attempted: failed.length, succeeded: retried }
    }

    // Read receipt — called from notification.service when a notification is
    // opened/marked read.
    async markReadByNotification(notificationId) {
        if (!notificationId) return
        try {
            await CommunicationLogModel.updateMany(
                { notificationId, status: { $ne: COMM_STATUS.READ } },
                { $set: { status: COMM_STATUS.READ, readAt: new Date() } },
            )
        } catch (err) {
            console.warn('Comm read-receipt update failed (non-fatal):', err.message)
        }
    }

    async getLogs({
        userId,
        sourceSystem,
        status,
        channel,
        from,
        to,
        page = 1,
        limit = 20,
    }) {
        const filter = {}
        if (userId) filter.userId = userId
        if (sourceSystem) filter.sourceSystem = sourceSystem
        if (status) filter.status = status
        if (channel) filter.channel = channel
        if (from || to) {
            filter.createdAt = {}
            if (from) filter.createdAt.$gte = new Date(from)
            if (to) filter.createdAt.$lte = new Date(to)
        }

        page = parseInt(page) || 1
        limit = parseInt(limit) || 20
        const data = await CommunicationLogModel.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean()
        const total = await CommunicationLogModel.countDocuments(filter)

        return {
            data,
            pagination: { total, page, limit, pages: Math.ceil(total / limit) },
        }
    }
}

module.exports = new CommunicationService()
