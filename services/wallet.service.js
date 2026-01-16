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

      // await WalletTransactionModel.create({
      //   walletId: walletUpdate._id,
      //   type: "credit",
      //   amount,
      //   reference,
      //   status: "success",
      //   description: "Wallet Top-up",
      // });

      return BaseService.sendSuccessResponse({
        message: response.data,
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async payWithWallet(req, res) {
    try {
      const post = req.body;
      const userId = req.user.id

      const validateRule = {
        // amount: "integer|required",
        // userId: "string|required",
        // reference: "string|required",
        bookOrderId: "string|required",
      };

      const validateMessage = {
        required: ":attribute is required",
      };

      const validateResult = validateData(post, validateRule, validateMessage);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const description = req.body.description || "Order Payment";

      const user = await UserModel.findById(userId);
      const bookOrder = await BookOrderModel.findById(post.bookOrderId);

      if (!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }
      if (!bookOrder) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }

      const wallet = await WalletModel.findOne({ userId });

      if (!wallet) {
        return BaseService.sendFailedResponse({
          error: "Encountered error accessing your wallet",
        });
      }

      if(wallet.balance < bookOrder.amount){
        return BaseService.sendFailedResponse({error: 'Opps! Insufficient balance.'})
      }

      wallet.balance -= bookOrder.amount;
      bookOrder.paymentStatus = 'success'

      await wallet.save()
      bookOrder.save()
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
      console.log(error);
      return BaseService.sendFailedResponse({ error });
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
      const userId = req.user.id;

      const wallet = await WalletModel.findOne({ userId });
      if (!wallet) {
        return BaseService.sendFailedResponse({ error: "Wallet not found" });
      }
      return BaseService.sendSuccessResponse({
        message: {
          balance: wallet.balance
        }
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      return BaseService.sendFailedResponse({ error: "Error fetching transactions"});
    }
  }
}

module.exports = WalletService;
