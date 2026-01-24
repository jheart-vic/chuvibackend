const BaseService = require("./base.service");
const validateData = require("../util/validate");
const { generateOscNumber } = require("../util/helper");
const WalletModel = require("../models/wallet.model");
const WalletTransactionModel = require("../models/walletTransaction.model");
const UserModel = require("../models/user.model");
const BookOrderModel = require("../models/bookOrder.model");
const { v4: uuidv4 } = require("uuid");
const paystackAxios = require("./paystack.client.service");


class WalletService extends BaseService {
  async walletTopUp(req, res) {
    try {
      const post = req.body;

      const validateRule = {
        amount: "integer|required",
        // userId: "string|required",
        email: "string|required",
        // reference: "string|required",
      };

      const validateMessage = {
        required: ":attribute is required",
      };

      const validateResult = validateData(post, validateRule, validateMessage);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const userId = req.user.id;
      const user = await UserModel.findById(userId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const paymentMethod = "paystack";
      const { email, amount } = post;
      const response = await paystackAxios.post(
        "/transaction/initialize",
        {
          email,
          amount, // e.g. 4500000 for ₦45,000.00
          metadata: {
            userId,
            type: "wallet_topup",
            // orderId: post.orderId,
            paymentMethod,
          }, // VERY helpful for mapping webhooks -> user
          // callback_url: 'https://yourapp.com/pay/callback' // optional
        }
      );

      // const walletUpdate = await WalletModel.findOneAndUpdate(
      //   { userId },
      //   { $inc: { balance: amount } },
      //   { new: true, upsert: true }
      // );

      // if (!walletUpdate._id) {
      //   return BaseService.sendFailedResponse({
      //     error: "Encountered error topping up your wallet",
      //   });
      // }

      return BaseService.sendSuccessResponse({
        message: response.data,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async payWithWallet(req) {
    try {
      const { bookOrderId, description = "Order Payment" } = req.body;
      const userId = req.user.id;
  
      const validateRule = {
        bookOrderId: "string|required",
      };
  
      const validateResult = validateData(req.body, validateRule);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }
  
      const user = await UserModel.findById(userId);
      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }
  
      const bookOrder = await BookOrderModel.findById(bookOrderId);
      if (!bookOrder) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }
  
      if (bookOrder.paymentStatus === "success") {
        return BaseService.sendFailedResponse({
          error: "Order has already been paid for",
        });
      }
  
      // Ensure wallet exists
      await WalletModel.findOneAndUpdate(
        { userId },
        { $setOnInsert: { balance: 0 } },
        { upsert: true }
      );
  
      // 🔐 ATOMIC DEBIT (only succeeds if balance >= amount)
      const wallet = await WalletModel.findOneAndUpdate(
        {
          userId,
          balance: { $gte: bookOrder.amount },
        },
        {
          $inc: { balance: -bookOrder.amount },
        },
        { new: true }
      );
  
      if (!wallet) {
        return BaseService.sendFailedResponse({
          error: "Oops! Insufficient wallet balance.",
        });
      }
  
      // Update order status
      bookOrder.paymentStatus = "success";
      await bookOrder.save();
  
      const reference = uuidv4();
  
      await WalletTransactionModel.create({
        walletId: wallet._id,
        type: "debit",
        amount: bookOrder.amount,
        reference,
        status: "success",
        description,
      });
  
      return BaseService.sendSuccessResponse({
        message: "Payment made successfully from wallet.",
      });
    } catch (error) {
      console.error(error);
      return BaseService.sendFailedResponse({ error: error.message });
    }
  }
  

  async fetchUserTransactions(req) {
    try {
      const page = parseInt(req.query.page) || 1; 
      const limit = parseInt(req.query.limit) || 10
      const skip = (page - 1) * limit;
      const userId = req.user.id;

      const wallet = await WalletModel.findOne({ userId });
      if (!wallet) {
        return BaseService.sendFailedResponse({ error: "Wallet not found" });
      }

  
      const transactions = await WalletTransactionModel.find({ walletId: wallet._id })
        .sort({ createdAt: -1 }) 
        .skip(skip)
        .limit(limit);
  
      const total = await WalletTransactionModel.countDocuments({ walletId: wallet._id });
  
      return BaseService.sendSuccessResponse({
        message: {
          data: transactions,
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
          },
        }
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      return BaseService.sendFailedResponse({ error: "Error fetching transactions"});
    }
  }
  async getWalletBalance(req) {
    try {
      const userId = req?.user?.id;
      if (!userId) {
        return BaseService.sendFailedResponse({ error: "Invalid user" });
      }
  
      const wallet = await WalletModel.findOneAndUpdate(
        { userId },
        { $setOnInsert: { balance: 0 } }, // create wallet if missing
        {
          new: true,        // return updated / created doc
          upsert: true,     // create if not exists
          lean: true        // return plain JS object (safer & faster)
        }
      );
  
      return BaseService.sendSuccessResponse({
        message: {
          balance: wallet.balance
        }
      });
  
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
      return BaseService.sendFailedResponse({
        error: "Unable to fetch wallet balance"
      });
    }
  }  
}

module.exports = WalletService;
