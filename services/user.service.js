const { OAuth2Client } = require("google-auth-library");
const sendEmail = require("../util/emailService");
const BaseService = require("./base.service");
const UserModel = require("../models/user.model");
const { empty } = require("../util");
const jwt = require('jsonwebtoken')
const validateData = require("../util/validate");
const {
  generateOTP,
  verifyRefreshToken,
  signAccessToken,
  formatNotificationTime,
  getWeightImprovementTipsByWeight,
} = require("../util/helper");
const { EXPIRES_AT } = require("../util/constants");
const NotificationModel = require("../models/notification.model");


class UserService extends BaseService {
  async getUser(req) {
    try {
      const userId = req.user.id;

      let userDetails = {};
      userDetails = await UserModel.findById(userId).select("-password");

      if (empty(userDetails)) {
        return BaseService.sendFailedResponse({
          error: "Something went wrong trying to fetch your account.",
        });
      }

      return BaseService.sendSuccessResponse({ message: userDetails });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
  async updateUserProfile(req) {
    try {
      const post = req.body;
      const userId = req.user.id;

      const updatedUser = await UserModel.findByIdAndUpdate(userId, post, {
        new: true,
      });

      return BaseService.sendSuccessResponse({
        message: "User profile updated successfully",
        data: updatedUser,
      });
    } catch (err) {
      console.error(err);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }
  async profileImageUpload(req) {
    try {
      let post = req.body;

      if (empty(post) || empty(post.image) || empty(post.image.imageUrl)) {
        return BaseService.sendFailedResponse({
          error: "Please provide your profile image",
        });
      }

      const userExists = await UserModel.findById(req.user.id);
      if (empty(userExists)) {
        return BaseService.sendFailedResponse({
          error: "User does not exist. Please register!",
        });
      }

      if (!empty(userExists.image) && !empty(userExists.image.publicId)) {
        await deleteImage(userExists.image.publicId);
      }

      userExists.image = post.image;
      await userExists.save();

      return BaseService.sendSuccessResponse({
        message: "Profile image uploaded successfully",
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
  async getUserNotifications(req) {
    try {
      const userId = req.user.id

      const notifications = await NotificationModel.find({userId}).sort({createdAt: -1})

      return BaseService.sendSuccessResponse({
        message: notifications,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({
        error: this.server_error_message,
      });
    }
  }
}

module.exports = UserService;
