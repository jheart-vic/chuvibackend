const { empty } = require("../util");

class BaseController {

	constructor(){
		this.server_error_message = 'Something went wrong. Please try again later'
	}
    static sendSuccessResponse(res, data) {
		res.status(200).send({success: true, data});
	}

    static sendFailedResponse(res, data) {
		const statusCode = data.statusCode
		delete data.statusCode
		res.status(statusCode || 400).send({success: false, data});
	}
}

module.exports = BaseController;
