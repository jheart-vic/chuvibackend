const BaseController = require("./base.controller")

class UserController extends BaseController{
async createUser(req, res){
    const userService = new UserService()
    const createUser = await userService.createUser(req, res)
    if(!createUser.success){
        return BaseController.sendFailedResponse(res, createUser.data)
    }
    return BaseController.sendSuccessResponse(res, createUser.data)
}
async googleSignup(req, res){
    const userService = new UserService()
    const googleSignup = await userService.googleSignup(req, res)
    if(!googleSignup.success){
        return BaseController.sendFailedResponse(res, googleSignup.data)
    }
    return BaseController.sendSuccessResponse(res, googleSignup.data)
}
async appleSignup(req, res){
    const userService = new UserService()
    const appleSignup = await userService.appleSignup(req, res)
    if(!appleSignup.success){
        return BaseController.sendFailedResponse(res, appleSignup.data)
    }
    return BaseController.sendSuccessResponse(res, appleSignup.data)
}
async loginUser(req, res){
    const userService = new UserService()
    const loginUser = await userService.loginUser(req, res)
    if(!loginUser.success){
        return BaseController.sendFailedResponse(res, loginUser.data)
    }
    return BaseController.sendSuccessResponse(res, loginUser.data)
}
async getUser(req, res){
    const userService = new UserService()
    const getUser = await userService.getUser(req, res)
    if(!getUser.success){
        return BaseController.sendFailedResponse(res, getUser.data)
    }
    return BaseController.sendSuccessResponse(res, getUser.data)
}
async forgotPassword(req, res){
    const userService = new UserService()
    const forgotPassword = await userService.forgotPassword(req, res)
    if(!forgotPassword.success){
        return BaseController.sendFailedResponse(res, forgotPassword.data)
    }
    return BaseController.sendSuccessResponse(res, forgotPassword.data)
}
async resetPassword(req, res){
    const userService = new UserService()
    const resetPassword = await userService.resetPassword(req, res)
    if(!resetPassword.success){
        return BaseController.sendFailedResponse(res, resetPassword.data)
    }
    return BaseController.sendSuccessResponse(res, resetPassword.data)
}
async verifyEmail(req, res){
    const userService = new UserService()
    const verifyEmail = await userService.verifyEmail(req, res)
    if(!verifyEmail.success){
        return BaseController.sendFailedResponse(res, verifyEmail.data)
    }
    return BaseController.sendSuccessResponse(res, verifyEmail.data)
}
async sendOTP(req, res){
    const userService = new UserService()
    const sendOTP = await userService.sendOTP(req, res)
    if(!sendOTP.success){
        return BaseController.sendFailedResponse(res, sendOTP.data)
    }
    return BaseController.sendSuccessResponse(res, sendOTP.data)
}
async verifyOTP(req, res){
    const userService = new UserService()
    const verifyOTP = await userService.verifyOTP(req, res)
    if(!verifyOTP.success){
        return BaseController.sendFailedResponse(res, verifyOTP.data)
    }
    return BaseController.sendSuccessResponse(res, verifyOTP.data)
}
}