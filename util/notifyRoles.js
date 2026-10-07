// Notify every ACTIVE staff member holding any of the given roles.
//
// This existed as three near-identical copies (admin.service's station
// operators, walletAdjustment.service's notifyAdmins, and the dispatch failure
// handlers that needed it next) — the same shape that let the tier-pricing maths
// drift in brief item 1.6. One implementation, used by all of them.
//
// FIRE-AND-FORGET BY DESIGN: it never throws. A notification is a record of
// something that already happened, so it must never be able to fail the action
// it describes (brief items 2.5 and 3.1 were both that bug). Returns how many
// people were notified, 0 on any failure.

const UserModel = require('../models/user.model')
const createNotification = require('./createNotification')
const { GENERAL_STATUS } = require('./constants')

async function notifyRoles({ roles, title, body, subBody, type, page, recordId }) {
    try {
        const wanted = (Array.isArray(roles) ? roles : [roles]).filter(Boolean)
        if (!wanted.length) return 0

        const staff = await UserModel.find({
            userType: { $in: wanted },
            status: GENERAL_STATUS.ACTIVE,
        })
            .select('_id')
            .lean()

        const results = await Promise.allSettled(
            staff.map((s) =>
                createNotification({
                    userId: s._id,
                    title,
                    body,
                    subBody,
                    type,
                    page,
                    recordId,
                }),
            ),
        )
        const sent = results.filter((r) => r.status === 'fulfilled').length
        if (sent !== results.length) {
            console.error(
                `notifyRoles(${wanted.join(',')}): ${results.length - sent} of ${results.length} notifications failed`,
            )
        }
        return sent
    } catch (error) {
        console.error('notifyRoles failed (non-fatal):', error?.message || error)
        return 0
    }
}

module.exports = { notifyRoles }
