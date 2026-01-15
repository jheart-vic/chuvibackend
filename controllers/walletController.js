const WalletService = require("../services/wallet.service");
const BaseController = require("./base.controller");

class WalletController extends BaseController {

    async walletTopUp(req, res) {
      const walletService = new WalletService();
      const result = await walletService.walletTopUp(req);
  
      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async payWithWallet(req, res) {
      const walletService = new WalletService();
      const result = await walletService.payWithWallet(req);
  
      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
    async fetchUserTransactions(req, res) {
      const walletService = new WalletService();
      const result = await walletService.fetchUserTransactions(req);
  
      return result.success
        ? BaseController.sendSuccessResponse(res, result.data)
        : BaseController.sendFailedResponse(res, result.data);
    }
  }

module.exports = WalletController;