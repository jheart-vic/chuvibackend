class BaseController {
  constructor() {
    this.server_error_message = "Something went wrong. Please try again later";
  }

  static sendSuccessResponse(res, data) {
    res.status(200).json({ success: true, data });
  }

  static sendFailedResponse(res, data) {
    const statusCode = data.statusCode || 400;
    delete data.statusCode;
    res.status(statusCode).json({ success: false, data });
  }
}

module.exports = BaseController;

