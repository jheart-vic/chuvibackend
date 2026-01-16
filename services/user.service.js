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
const { uploadImage, deleteImage } = require("../util/imageUpload");
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
    const { fullName, email, phoneNumber } = req.body;
    const userId = req.user.id;

    if (!fullName && !email && !phoneNumber) {
      return BaseService.sendFailedResponse({
        error: "Nothing to update",
      });
    }

    // Optional: check email uniqueness
    if (email) {
      const emailExists = await UserModel.findOne({
        email,
        _id: { $ne: userId },
      });

      if (emailExists) {
        return BaseService.sendFailedResponse({
          error: "Email already in use",
        });
      }
    }

    // const updatedUser = await UserModel.findByIdAndUpdate(
    //   userId,
    //   {
    //     ...(fullName && { fullName }),
    //     ...(email && { email }),
    //     ...(phoneNumber && { phoneNumber }),
    //   },
    //   { new: true }
    // );

      const updateData = {};

      if (fullName !== undefined) updateData.fullName = fullName;
      if (email !== undefined) updateData.email = email;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;

      const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        updateData,
        { new: true }
      );

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
    if (!req.file) {
      return BaseService.sendFailedResponse({
        error: "Please provide your profile image",
      });
    }

    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return BaseService.sendFailedResponse({
        error: "User does not exist. Please register!",
      });
    }

    // Delete old image if exists
    if (user.image?.publicId) {
      await deleteImage(user.image.publicId, "image");
    }

    // Upload new image to Cloudinary
    const result = await uploadImage(req.file);

    // Save new image details
    user.image = {
      imageUrl: result.secure_url,
      publicId: result.public_id,
    };

    await user.save();

    return BaseService.sendSuccessResponse({
      message: "Profile image uploaded successfully",
      data: user.image,
    });
  } catch (error) {
    console.error(error);
    return BaseService.sendFailedResponse({
      error: "Something went wrong. Please try again later.",
    });
  }
}


 async addAddress(req) {
    try {
      const { label, address } = req.body;

      if (!label || !address) {
        return BaseService.sendFailedResponse({
          error: "Label and address are required",
        });
      }

      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return BaseService.sendFailedResponse({
          error: "User not found",
        });
      }

      const exists = user.addresses.some(
        addr => addr.label === label && addr.address === address
      );

      if (exists) {
        return BaseService.sendFailedResponse({
          error: "This address already exists",
        });
      }

      user.addresses.push({ label, address });
      await user.save();

      return BaseService.sendSuccessResponse({
        message: "Address added successfully",
        data: user.addresses[user.addresses.length - 1],
      });
    } catch (error) {
      console.error(error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }

  async updateAddress(req) {
    try {
      const { addressId } = req.params;
      const { label, address } = req.body;

      if (label === undefined && address === undefined) {
        return BaseService.sendFailedResponse({
          error: "Nothing to update",
        });
      }

      const user = await UserModel.findById(req.user.id);
      if (!user) {
        return BaseService.sendFailedResponse({
          error: "User not found",
        });
      }

      const addr = user.addresses.id(addressId);
      if (!addr) {
        return BaseService.sendFailedResponse({
          error: "Address not found",
        });
      }

      if (label !== undefined) addr.label = label;
      if (address !== undefined) addr.address = address;

      await user.save();

      return BaseService.sendSuccessResponse({
        message: "Address updated successfully",
        data: addr,
      });
    } catch (error) {
      console.error(error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }
  async deleteAddress(req) {
    try {
      const userId = req?.user?.id;
      const { addressId } = req.params;

      const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        { $pull: { addresses: { _id: addressId } } },
        { new: true }
      );

      if (!updatedUser) {
        return BaseService.sendFailedResponse({
          error: "User not found",
        });
      }

      return BaseService.sendSuccessResponse({
        message: "Address deleted successfully",
        data: updatedUser.addresses,
      });
    } catch (error) {
      console.error(error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }

  async getAddresses(req) {
    try {
      const userId = req?.user?.id;
      const user = await UserModel.findById(userId).select("addresses");
      if (!user) {
        return BaseService.sendFailedResponse({
          error: "User not found",
        });
      }

      return BaseService.sendSuccessResponse({
        message: "Addresses fetched successfully",
        data: user.addresses,
      });
    } catch (error) {
      console.error(error);
      return BaseService.sendFailedResponse({
        error: "Something went wrong. Please try again later.",
      });
    }
  }

 async updateNotificationPreferences(req, res) {
  try {
    const userId = req.user.id;

    const { whatsappNotification, emailNotification } = req.body;

    // Only update fields that are provided
    const update = {};
    if (typeof whatsappNotification === "boolean") {
      update.whatsappNotification = whatsappNotification;
    }
    if (typeof emailNotification === "boolean") {
      update.emailNotification = emailNotification;
    }

    const user = await UserModel.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true }
    ).select("whatsappNotification emailNotification");

     return BaseService.sendSuccessResponse({
      success: true,
      message: "Notification preference updated",
      data: user,
      });
  } catch (error) {
    console.error(error);
      return BaseService.sendFailedResponse({
        error: "Failed to update notification preference",
      });
  }
};

async deleteUser(req, res) {
  try {
    const userId = req.user.id;


    const deletedUser = await UserModel.findByIdAndDelete(userId).select(
      "-password -refreshToken"
    );


    if (!deletedUser) {
      return BaseService.sendFailedResponse({
        error: "User not found",
      });
    }

    return BaseService.sendSuccessResponse({
      message: "User profile deleted successfully",
      data: deletedUser,
    });
  } catch (error) {
    console.error(error);
    return BaseService.sendFailedResponse({
      error: "Failed to delete user profile",
    });
  }
}
  async getUserNotifications(req) {
    try {
      const userId = req.user.id

      const notifications = await NotificationModel.find({userId}).sort({createdAt: -1})

      return BaseService.sendSuccessResponse({
        data: notifications,
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
