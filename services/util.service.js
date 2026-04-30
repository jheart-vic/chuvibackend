const BaseService = require("./base.service");

class UtilService extends BaseService {
    async uploadSingleImage(req) {
      try {
        let image = {};
        if (!req.file) {
          return BaseService.sendFailedResponse({
            error: "Please provide an image",
          });
        }
  
        image = {
          imageUrl: req.file.path,
          publicId: req.file.filename,
        };
  
        return BaseService.sendSuccessResponse({ message: image });
      } catch (error) {
        console.log(error, "the error");
        BaseService.sendFailedResponse(this.server_error_message);
      }
    }
    async uploadMultipleImage(req) {
        try {
          let images = [];
          if (req.files) {
            return BaseService.sendFailedResponse({
              error: "Please provide multiple images",
            });
          }
          images = req.files.map(file=>{
            return {
                  imageUrl: file.path,
                  publicId: file.filename,
                };
          })
    
          return BaseService.sendSuccessResponse({ message: images });
        } catch (error) {
          BaseService.sendFailedResponse(this.server_error_message);
        }
      }
}

module.exports = UtilService;