// V1 batch 3 part 2: damage case (R6) and Iron Only "looks dirty" (R8) — each
// behind its own switch (util/switches.js).
const BaseController = require('./base.controller')

const reply = (res, result) =>
    result.success ? BaseController.sendSuccessResponse(res, result.data) : BaseController.sendFailedResponse(res, result.data)
const actor = (req) => ({ id: req.user?.id, userType: req.user?.userType })

class FloorCaseController extends BaseController {
    async reportDamage(req, res) {
        const D = require('../util/damageCase')
        return reply(res, await D.reportDamage({ orderId: req.params.id, itemId: req.params.itemId, note: req.body?.note, user: actor(req) }))
    }
    async customerInformed(req, res) {
        const D = require('../util/damageCase')
        return reply(res, await D.customerInformed({ orderId: req.params.id, itemId: req.params.itemId, note: req.body?.note, user: actor(req) }))
    }
    async partialDelivery(req, res) {
        const D = require('../util/damageCase')
        return reply(res, await D.approvePartialDelivery({ orderId: req.params.id, reason: req.body?.reason, ourFault: req.body?.ourFault, user: actor(req) }))
    }
}

FloorCaseController.prototype.looksDirty = async function (req, res) {
    const U = require('../util/ironOnlyUpgrade')
    return reply(res, await U.markLooksDirty({ orderId: req.params.id, itemId: req.params.itemId, note: req.body?.note, user: actor(req) }))
}
FloorCaseController.prototype.looksDirtyList = async function (req, res) {
    try {
        const rows = await require('../util/ironOnlyUpgrade').listSuggestions()
        return BaseController.sendSuccessResponse(res, { message: { count: rows.length, data: rows } })
    } catch (error) {
        console.error('looks dirty list failed:', error)
        return BaseController.sendFailedResponse(res, { error: 'Could not load the list.' })
    }
}
FloorCaseController.prototype.upgradeService = async function (req, res) {
    const U = require('../util/ironOnlyUpgrade')
    return reply(res, await U.upgradeService({ orderId: req.params.id, itemId: req.params.itemId, user: actor(req) }))
}
FloorCaseController.prototype.declineLooksDirty = async function (req, res) {
    const U = require('../util/ironOnlyUpgrade')
    return reply(res, await U.declineSuggestion({ orderId: req.params.id, itemId: req.params.itemId, note: req.body?.note, user: actor(req) }))
}

module.exports = FloorCaseController
