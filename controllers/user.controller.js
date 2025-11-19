const UserService = require("../services/user.service");
const  BaseController = require("./base.controller");

class UserController extends BaseController{
    async getUser(req, res){
        const userService = new UserService()
        const getUser = await userService.getUser(req, res)
        if(!getUser.success){
            return BaseController.sendFailedResponse(res, getUser.data)
        }
        return BaseController.sendSuccessResponse(res, getUser.data)
    }
    async updateUserProfile(req, res){
        const userService = new UserService()
        const updateUserProfile = await userService.updateUserProfile(req, res)
        if(!updateUserProfile.success){
            return BaseController.sendFailedResponse(res, updateUserProfile.data)
        }
        return BaseController.sendSuccessResponse(res, updateUserProfile.data)
    }
}

module.exports = UserController