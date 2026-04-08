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
}

module.exports = UtilController;