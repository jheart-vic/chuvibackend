const BaseController = require('./base.controller')
const WalletCreditService = require('../services/walletCredit.service')

// Admin read/write of the singleton RewardSetting doc (complaint SLA / reopen
// window, recovery approval threshold, credit expiry, referral economy). The
// document is auto-created with defaults on first read, so GET never 404s.
class RewardSettingController extends BaseController {
    async getSettings(req, res) {
        try {
            const settings = await WalletCreditService.getSettings()
            return BaseController.sendSuccessResponse(res, settings)
        } catch (error) {
            console.error(error)
            return BaseController.sendFailedResponse(res, {
                error: 'Failed to load reward settings',
            })
        }
    }

    async updateSettings(req, res) {
        try {
            const settings = await WalletCreditService.updateSettings(req.body || {})
            return BaseController.sendSuccessResponse(res, settings)
        } catch (error) {
            if (error.statusCode === 400) {
                return BaseController.sendFailedResponse(res, { error: error.message })
            }
            console.error(error)
            return BaseController.sendFailedResponse(res, {
                error: 'Failed to update reward settings',
            })
        }
    }
}

module.exports = RewardSettingController
