const UtilService = require("../services/util.service")
const BaseController = require("./base.controller")

class UtilController extends BaseController{
    async uploadMultipleImage(req, res){
        const utilService = new UtilService()
        const multipleFileUpload = await utilService.uploadMultipleImage(req)
        if(!multipleFileUpload.success){
            return BaseController.sendFailedResponse(res, multipleFileUpload.data)
        }
        return BaseController.sendSuccessResponse(res, multipleFileUpload.data)
    }

    async uploadSingleImage(req, res){
        const utilService = new UtilService()
        const singleFileUpload = await utilService.uploadSingleImage(req)
        if(!singleFileUpload.success){
            return BaseController.sendFailedResponse(res, singleFileUpload.data)
        }
        return BaseController.sendSuccessResponse(res, singleFileUpload.data)
    }
    async getHoldReasons(req, res){
        const utilService = new UtilService()
        const holdReasons = await utilService.getHoldReasons(req)
        if(!holdReasons.success){
            return BaseController.sendFailedResponse(res, holdReasons.data)
        }
        return BaseController.sendSuccessResponse(res, holdReasons.data)
    }
    async reportDeliveryIssue(req, res){
        const utilService = new UtilService()
        const deliveryIssue = await utilService.reportDeliveryIssue(req)
        if(!deliveryIssue.success){
            return BaseController.sendFailedResponse(res, deliveryIssue.data)
        }
        return BaseController.sendSuccessResponse(res, deliveryIssue.data)
    }
}

module.exports = UtilController;