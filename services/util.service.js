const { empty } = require('../util')
const BaseService = require('./base.service')
const {ROLE} = require('../util/constants')
const UserModel = require('../models/user.model')
const BookOrderModel = require('../models/bookOrder.model')
const ActivityModel = require('../models/activity.model')
const { createNotification } = require('../util/createNotification')
const { NOTIFICATION_TYPE, PICKUP_STATUS, DELIVERY_STATUS, ACTIVITY_TYPE } = require('../util/constants')

class UtilService extends BaseService {
    async uploadSingleImage(req) {
        try {
            let image = {}
            if (empty(req.file)) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide an image',
                })
            }

            image = {
                imageUrl: req.file.path,
                publicId: req.file.filename,
            }

            return BaseService.sendSuccessResponse({ message: image })
        } catch (error) {
            console.log(error, 'the error')
            BaseService.sendFailedResponse(this.server_error_message)
        }
    }
    async uploadMultipleImage(req) {
        try {
            let images = []
            if (req.files) {
                return BaseService.sendFailedResponse({
                    error: 'Please provide multiple images',
                })
            }
            images = req.files.map((file) => {
                return {
                    imageUrl: file.path,
                    publicId: file.filename,
                }
            })

            return BaseService.sendSuccessResponse({ message: images })
        } catch (error) {
            BaseService.sendFailedResponse(this.server_error_message)
        }
    }

    async getHoldReasons(req) {
        try {
            const { role } = req.query

            if (!role)
                return BaseService.sendFailedResponse({
                    error: 'Role is required',
                })

            const HOLD_REASONS = {
                [ROLE.INTAKE_AND_TAG]: [
                    'item_missing',
                    'item_mismatched',
                    'wrong_label',
                    'damaged_on_arrival',
                    'other',
                ],
                [ROLE.SORT_AND_PRETREAT]: [
                    'fabric_incompatible',
                    'item_missing',
                    'item_mismatched',
                    'stain_requires_special_treatment',
                    'color_bleed_risk',
                    'other',
                ],
                [ROLE.WASH_AND_DRY]: [
                    'item_missing',
                    'item_mismatched',
                    'color_bleed_risk',
                    'fabric_damage_risk',
                    'other',
                ],
                [ROLE.PRESS]: [
                    'item_missing',
                    'item_mismatched',
                    'fabric_damage_risk',
                    'delicate_requires_attention',
                    'other',
                ],
                [ROLE.QC]: [
                    'item_missing',
                    'item_mismatched',
                    'quality_not_met',
                    'wrong_item_returned',
                    'packaging_issue',
                    'other',
                ],
            }

            const reasons = HOLD_REASONS[role]

            if (!reasons)
                return BaseService.sendFailedResponse({
                    error: `Invalid role. Must be one of: ${Object.keys(HOLD_REASONS).join(', ')}`,
                })

            return BaseService.sendSuccessResponse({
                message: {
                    role,
                    reasons,
                    note: 'You may type a custom reason if yours is not listed.',
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch hold reasons',
            })
        }
    }

    async reportDeliveryIssue(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id
            const { issueType, note = '' } = req.body


            const allowedIssueTypes = [
                'pickup_problem',
                'delivery_problem',
                'walkin_problem',
            ]

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!issueType || !allowedIssueTypes.includes(issueType))
                return BaseService.sendFailedResponse({
                    error: `issueType must be one of: ${allowedIssueTypes.join(', ')}`,
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findById(orderId)
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            const now = new Date()

            // set the appropriate dispatch failure status
            if (issueType === 'pickup_problem') {
                await BookOrderModel.findByIdAndUpdate(
                    orderId,
                    {
                        $set: {
                            'dispatchDetails.pickup.status':
                                PICKUP_STATUS.FAILED,
                            'dispatchDetails.pickup.note': note,
                            'dispatchDetails.pickup.updatedAt': now,
                        },
                    },
                    { runValidators: false },
                )
            } else if (issueType === 'delivery_problem') {
                await BookOrderModel.findByIdAndUpdate(
                    orderId,
                    {
                        $set: {
                            'dispatchDetails.delivery.status':
                                DELIVERY_STATUS.FAILED,
                            'dispatchDetails.delivery.note': note,
                            'dispatchDetails.delivery.updatedAt': now,
                        },
                    },
                    { runValidators: false },
                )
            } else if (issueType === 'walkin_problem') {
                // walk-in collection failed — log it but keep stage as READY
                await BookOrderModel.findByIdAndUpdate(
                    orderId,
                    {
                        $set: {
                            'dispatchDetails.delivery.status':
                                DELIVERY_STATUS.FAILED,
                            'dispatchDetails.delivery.note': `Walk-in collection failed: ${note}`,
                            'dispatchDetails.delivery.updatedAt': now,
                        },
                    },
                    { runValidators: false },
                )
            }

            await ActivityModel.create({
                title: 'Delivery Issue Reported',
                description: `${issueType.replace(/_/g, ' ')} reported for order ${order.oscNumber} by ${user.fullName}.${note ? ` Note: ${note}` : ''}`,
                type: ACTIVITY_TYPE.ORDER_DELIVERED,
                orderId: order._id,
                userId,
                reference: order.oscNumber,
            })

            if (order.userId) {
                await createNotification({
                    userId: order.userId,
                    title: 'Delivery Update',
                    body: `There was an issue with your order ${order.oscNumber}. Our team has been notified and will follow up.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.ORDER_UPDATED,
                })
            }

            return BaseService.sendSuccessResponse({
                message: 'Delivery issue reported successfully',
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to report delivery issue',
            })
        }
    }
}

module.exports = UtilService
