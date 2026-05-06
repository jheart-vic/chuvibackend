const { OAuth2Client } = require('google-auth-library')
const sendEmail = require('../util/emailService')
const BaseService = require('./base.service')
const UserModel = require('../models/user.model')
const { empty } = require('../util')
const jwt = require('jsonwebtoken')
const validateData = require('../util/validate')
const {
    generateOTP,
    verifyRefreshToken,
    signAccessToken,
    formatNotificationTime,
    getWeightImprovementTipsByWeight,
} = require('../util/helper')
const { deleteImage } = require('../util/imageUpload')
const {
    EXPIRES_AT,
    ORDER_STATUS,
    ROLE,
    GENERAL_STATUS,
} = require('../util/constants')
const NotificationModel = require('../models/notification.model')
const WalletModel = require('../models/wallet.model')
const BookOrderModel = require('../models/bookOrder.model')
const SubscriptionModel = require('../models/subscription.model')

class UserService extends BaseService {
    async getDashboard(req) {
        try {
            const userId = req.user.id

            const [
                wallet,
                pastOrdersCount,
                unreadNotificationsCount,
                ongoingOrder,
                subscription,
            ] = await Promise.all([
                WalletModel.findOneAndUpdate(
                    { userId },
                    { $setOnInsert: { balance: 0 } },
                    { upsert: true, new: true, lean: true },
                ),

                BookOrderModel.countDocuments({
                    userId,
                    paymentStatus: 'success',
                    'stage.status': ORDER_STATUS.DELIVERED,
                }),

                NotificationModel.countDocuments({ userId, isRead: false }),

                BookOrderModel.findOne({
                    $or: [
                        { userId },
                        { phoneNumber: req.user.phoneNumber }, // fallback if no userId linked
                    ],
                    'stage.status': {
                        $nin: [
                            ORDER_STATUS.DELIVERED,
                            ORDER_STATUS.PENDING,
                            ORDER_STATUS.HOLD,
                        ],
                    },
                })
                    .sort({ createdAt: -1 })
                    .lean(),

                SubscriptionModel.findOne({ userId, status: 'active' })
                    .populate('planId')
                    .lean(),
            ])

            return BaseService.sendSuccessResponse({
                message: {
                    walletBalance: wallet?.balance ?? 0,
                    pastOrdersCount,
                    unreadNotificationsCount,
                    ongoingOrder: ongoingOrder
                        ? {
                              id: ongoingOrder._id,
                              status: ongoingOrder.stage.status,
                              amount: ongoingOrder.amount,
                              createdAt: ongoingOrder.createdAt,
                          }
                        : null,
                    subscription: subscription
                        ? {
                              status: subscription.status,
                              nextBillingDate: subscription.nextPaymentDate,
                              plan: subscription.planId
                                  ? {
                                        name: subscription.planId.name,
                                        monthlyLimits:
                                            subscription.planId.monthlyLimits,
                                    }
                                  : null,
                              remainingItems:
                                  subscription.remainingItems ?? null,
                          }
                        : null,
                },
            })
        } catch (error) {
            console.error('Error fetching dashboard:', error)
            return BaseService.sendFailedResponse({
                error: 'Unable to fetch dashboard data',
            })
        }
    }
    async getUser(req) {
        try {
            const userId = req.user.id

            let userDetails = {}
            userDetails = await UserModel.findById(userId).select('-password')

            if (empty(userDetails)) {
                return BaseService.sendFailedResponse({
                    error: 'Something went wrong trying to fetch your account.',
                })
            }

            return BaseService.sendSuccessResponse({ message: userDetails })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: this.server_error_message,
            })
        }
    }
    async updateUserProfile(req) {
        try {
            const { fullName, email, phoneNumber } = req.body
            const userId = req.user.id

            if (!fullName && !email && !phoneNumber) {
                return BaseService.sendFailedResponse({
                    error: 'Nothing to update',
                })
            }

            // Optional: check email uniqueness
            if (email) {
                const emailExists = await UserModel.findOne({
                    email,
                    _id: { $ne: userId },
                })

                if (emailExists) {
                    return BaseService.sendFailedResponse({
                        error: 'Email already in use',
                    })
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

            const updateData = {}

            if (fullName !== undefined) updateData.fullName = fullName
            if (email !== undefined) updateData.email = email
            if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber

            const updatedUser = await UserModel.findByIdAndUpdate(
                userId,
                updateData,
                { new: true },
            )

            return BaseService.sendSuccessResponse({
                message: 'User profile updated successfully',
                data: updatedUser,
            })
        } catch (err) {
            console.error(err)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }

    async profileImageUpload(req) {
        try {
            if (!req.file) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide your profile image',
                })
            }

            const user = await UserModel.findById(req.user.id)
            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User does not exist. Please register!',
                })
            }

            // Delete old image if exists
            if (user.image?.publicId) {
                await deleteImage(user.image.publicId, 'image')
            }

            // Upload new image to Cloudinary
            const updatedUser = await UserModel.findByIdAndUpdate(
                req.user.id,
                {
                    $set: {
                        'image.imageUrl': req.file.path,
                        'image.publicId': req.file.filename,
                    },
                },
                { new: true },
            )

            // // Save new image details
            // user.image = {
            //     imageUrl: result.secure_url,
            //     publicId: result.public_id,
            // }

            await user.save()

            return BaseService.sendSuccessResponse({
                message: 'Profile image uploaded successfully',
                data: user.image,
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }

    async addAddress(req) {
        try {
            const { label, address } = req.body

            if (!label || !address) {
                return BaseService.sendFailedResponse({
                    error: 'Label and address are required',
                })
            }

            const user = await UserModel.findById(req.user.id)
            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const exists = user.addresses.some(
                (addr) => addr.label === label && addr.address === address,
            )
            if (exists) {
                return BaseService.sendFailedResponse({
                    error: 'This address already exists',
                })
            }

            // ✅ use $push instead of push + save
            const updatedUser = await UserModel.findByIdAndUpdate(
                req.user.id,
                { $push: { addresses: { label, address } } },
                { new: true },
            )

            return BaseService.sendSuccessResponse({
                message: 'Address added successfully',
                data: updatedUser.addresses[updatedUser.addresses.length - 1],
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }

    async updateAddress(req) {
        try {
            const { addressId } = req.params
            const { label, address } = req.body

            if (label === undefined && address === undefined) {
                return BaseService.sendFailedResponse({
                    error: 'Nothing to update',
                })
            }

            const user = await UserModel.findById(req.user.id)
            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            const addr = user.addresses.id(addressId)
            if (!addr) {
                return BaseService.sendFailedResponse({
                    error: 'Address not found',
                })
            }

            // ✅ build $set dynamically with positional operator
            const updateFields = {}
            if (label !== undefined) updateFields['addresses.$.label'] = label
            if (address !== undefined)
                updateFields['addresses.$.address'] = address

            const updatedUser = await UserModel.findOneAndUpdate(
                { _id: req.user.id, 'addresses._id': addressId },
                { $set: updateFields },
                { new: true },
            )

            const updatedAddr = updatedUser.addresses.id(addressId)

            return BaseService.sendSuccessResponse({
                message: 'Address updated successfully',
                data: updatedAddr,
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }
    async deleteAddress(req) {
        try {
            const userId = req?.user?.id
            const { addressId } = req.params

            const updatedUser = await UserModel.findByIdAndUpdate(
                userId,
                { $pull: { addresses: { _id: addressId } } },
                { new: true },
            )

            if (!updatedUser) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            return BaseService.sendSuccessResponse({
                message: 'Address deleted successfully',
                data: updatedUser.addresses,
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }

    async getAddresses(req) {
        try {
            const userId = req?.user?.id
            const user = await UserModel.findById(userId).select('addresses')
            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            return BaseService.sendSuccessResponse({
                message: 'Addresses fetched successfully',
                data: user.addresses,
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later.',
            })
        }
    }

    async updateNotificationPreferences(req, res) {
        try {
            const userId = req.user.id

            const { whatsappNotification, emailNotification } = req.body

            // Only update fields that are provided
            const update = {}
            if (typeof whatsappNotification === 'boolean') {
                update.whatsappNotification = whatsappNotification
            }
            if (typeof emailNotification === 'boolean') {
                update.emailNotification = emailNotification
            }

            const user = await UserModel.findByIdAndUpdate(
                userId,
                { $set: update },
                { new: true },
            ).select('whatsappNotification emailNotification')

            return BaseService.sendSuccessResponse({
                success: true,
                message: 'Notification preference updated',
                data: user,
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to update notification preference',
            })
        }
    }

    async deleteUser(req, res) {
        try {
            const userId = req.user.id

            const deletedUser = await UserModel.findByIdAndDelete(
                userId,
            ).select('-password -refreshToken')

            if (!deletedUser) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            return BaseService.sendSuccessResponse({
                message: 'User profile deleted successfully',
                data: deletedUser,
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to delete user profile',
            })
        }
    }
    async getUserNotifications(req) {
        try {
            const userId = req.user.id

            const notifications = await NotificationModel.find({ userId }).sort(
                { createdAt: -1 },
            )

            return BaseService.sendSuccessResponse({
                data: notifications,
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: this.server_error_message,
            })
        }
    }

    async resetPasswordInProfilePage(req, res) {
        try {
            const userId = req.user.id
            const { currentPassword, newPassword } = req.body

            // Basic validation
            if (!currentPassword || !newPassword) {
                return BaseService.sendFailedResponse({
                    error: 'Current password and new password are required',
                })
            }

            const user = await UserModel.findById(userId).select('+password')
            if (!user) {
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })
            }

            // Verify current password
            const isMatch = await user.comparePassword(currentPassword)
            if (!isMatch) {
                return BaseService.sendFailedResponse({
                    error: 'Current password is incorrect',
                })
            }

            // Prevent reuse
            const isSamePassword = await user.comparePassword(newPassword)
            if (isSamePassword) {
                return BaseService.sendFailedResponse({
                    error: 'New password cannot be the same as the old password',
                })
            }

            // Update password
            user.password = newPassword
            user.lastChangedPassword = new Date()
            await user.save()

            return BaseService.sendSuccessResponse({
                message: 'Password changed successfully',
            })
        } catch (error) {
            console.error(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to change password',
            })
        }
    }
    async getUsersByType(req) {
        try {
            const { userType } = req.query

            if (!userType) {
                return BaseService.sendFailedResponse({
                    error: 'userType is required',
                })
            }

            if (!Object.values(ROLE).includes(userType)) {
                return BaseService.sendFailedResponse({
                    error: `userType must be one of: ${Object.values(ROLE).join(', ')}`,
                })
            }

            const users = await UserModel.find({
                userType,
                status: GENERAL_STATUS.ACTIVE,
            })
                .select('_id fullName phoneNumber image email userType')
                .lean()

            return BaseService.sendSuccessResponse({ message: users })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch users',
            })
        }
    }
}

module.exports = UserService
