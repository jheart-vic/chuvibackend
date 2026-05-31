const { empty } = require('../util')
const BaseService = require('./base.service')

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
}

module.exports = UtilService
