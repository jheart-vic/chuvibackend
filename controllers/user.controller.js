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
    async addAddress(req, res) {
        const userService = new UserService();
        const result = await userService.addAddress(req);

        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async updateAddress(req, res) {
        const userService = new UserService();
        const result = await userService.updateAddress(req);

        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async deleteAddress(req, res) {
        const userService = new UserService();
        const result = await userService.deleteAddress(req);

        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async getAddress(req, res) {
        const userService = new UserService();
        const result = await userService.getAddresses(req);

        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async notificationPreference(req, res) {
        const userService = new UserService();
        const result = await userService.updateNotificationPreferences(req, res);

        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async uploadProfileImage(req, res) {
        const userService = new UserService();
        const upload = await userService.profileImageUpload(req, res);

        if (!upload.success) {
        return BaseController.sendFailedResponse(res, upload.data);
        }
        return BaseController.sendSuccessResponse(res, upload.data);
    }

    async deleteUser(req, res) {
        const userService = new UserService();
        const result = await userService.deleteUser(req);

        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
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