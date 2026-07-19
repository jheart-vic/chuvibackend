const OfferApiService = require('../services/offerApi.service')
const BaseController = require('./base.controller')

const handle = (method) => async (req, res) => {
    const service = new OfferApiService()
    const result = await service[method](req)
    return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data)
}

class OfferController extends BaseController {
    listOffers = handle('listOffers')
    createOffer = handle('createOffer')
    updateOffer = handle('updateOffer')
    getOfferPerformance = handle('getOfferPerformance')
    assignOffer = handle('assignOffer')
    cancelLinkage = handle('cancelLinkage')
    myOffers = handle('myOffers')
    viewOffer = handle('viewOffer')
    validateOffer = handle('validateOffer')
    attachOffer = handle('attachOffer')
}

module.exports = OfferController
