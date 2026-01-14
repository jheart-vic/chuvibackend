const PaystackService = require("../services/paystack.service");
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
    async initializePayment(req, res){
        const paystackService = new PaystackService()
        const initializePayment = await paystackService.initializePayment(req)
        if(!initializePayment.success){
            return BaseController.sendFailedResponse(res, initializePayment.data)
        }
        return BaseController.sendSuccessResponse(res, initializePayment.data)
    }
    async getUserNotifications(req, res){
        const userService = new UserService()
        const getUserNotifications = await userService.getUserNotifications(req, res)
        if(!getUserNotifications.success){
            return BaseController.sendFailedResponse(res, getUserNotifications.data)
        }
        return BaseController.sendSuccessResponse(res, getUserNotifications.data)
    }
}

module.exports = UserController