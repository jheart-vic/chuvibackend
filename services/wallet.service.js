const BaseService = require("./base.service");
const validateData = require("../util/validate");
const WalletModel = require("../models/wallet.model");
const WalletTransactionModel = require("../models/walletTransaction.model");
const UserModel = require("../models/user.model");
const BookOrderModel = require("../models/bookOrder.model");
const { v4: uuidv4 } = require("uuid");
const paystackAxios = require("./paystack.client.service");
const PaymentModel = require("../models/payment.model");
const  mongoose = require("mongoose");
const paginate = require("../util/paginate");

class WalletService extends BaseService {
  async walletTopUp(req, res) {
    try {
      const post = req.body;

      const validateRule = {
        amount: "integer|required",
        // userId: "string|required",
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
      const email = user.email;

      let { amount } = post;
      amount = amount * 100;

      const response = await paystackAxios.post("/transaction/initialize", {
        email,
        amount, // e.g. 4500000 for ₦45,000.00
        metadata: {
          userId,
          transactionType: "wallet-top-up",
          amount,
          paymentMethod,
        },
      });

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
      const limit = parseInt(req.query.limit) || 10;
      const alertType = req.query.alertType || "";
      const period = req.query.period || "all"; // '7d', '30d', 'all'
      const skip = (page - 1) * limit;
      const userId = req.user.id;

      const wallet = await WalletModel.findOne({ userId });
      if (!wallet) {
        return BaseService.sendFailedResponse({ error: "Wallet not found" });
      }

      // Build date filter
      let dateFilter = {};
      const now = new Date();
      if (period === "7d") {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        dateFilter = { createdAt: { $gte: sevenDaysAgo, $lte: now } };
      } else if (period === "30d") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        dateFilter = { createdAt: { $gte: thirtyDaysAgo, $lte: now } };
      }
      // if 'all', leave dateFilter empty

      const filter = {
        userId,
        ...(alertType ? { alertType } : {}),
        ...dateFilter,
      };

      const transactions = await PaymentModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await PaymentModel.countDocuments(filter);

      return BaseService.sendSuccessResponse({
        message: {
          data: transactions,
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      return BaseService.sendFailedResponse({
        error: "Error fetching transactions",
      });
    }
  }
  async getMonthlyTransaction(req, res) {
    try {
      const userId = req.user.id;

      let { page, limit } = req.query;

      // 📅 Monthly filter
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date();
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);
      endOfMonth.setDate(0);
      endOfMonth.setHours(23, 59, 59, 999);

      const query = {
        userId,
        status: "success",
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      };

      const { data, pagination } = await paginate(PaymentModel, query, {
        page,
        limit,
      });

      // 🧮 Totals
      const [result] = await WalletTransactionModel.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            status: "success",
            createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            credit: {
              $sum: {
                $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0],
              },
            },
            debit: {
              $sum: {
                $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0],
              },
            },
          },
        },
      ]);
      
      const credit = result?.credit || 0;
      const debit = result?.debit || 0;

      return BaseService.sendSuccessResponse({
        message: {
          data,
          totals: { credit, debit },
          pagination,
        },
      });
    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
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
          new: true, // return updated / created doc
          upsert: true, // create if not exists
          lean: true, // return plain JS object (safer & faster)
        }
      );

      return BaseService.sendSuccessResponse({
        message: {
          balance: wallet.balance,
        },
      });
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
      return BaseService.sendFailedResponse({
        error: "Unable to fetch wallet balance",
      });
    }
  }
  async uploadPaymentProof(req){
    try {
      const userId = req.user.id
      if(!userId) {
        return BaseService.sendFailedResponse({ error: "Invalid user" });
      }
      const user = await UserModel.findById(userId);

      const post = req.body;

      const validateRule = {
        amount: "integer|required",
        proofOfPayment: "string|required"
      };

      const validateMessage = {
        required: ":attribute is required",
      };

      const validateResult = validateData(post, validateRule, validateMessage);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const {amount, proofOfPayment} = post;

      if(!user) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const reference = `BT-${Date.now()}`;


      const newPayment = await PaymentModel.create({
        reference,
        userId,
        amount,
        status: "pending",
        type: "wallet-top-up",
        alertType: "credit",
        paymentMethod: "bank-transfer",
        proofOfPayment
      })

      return BaseService.sendSuccessResponse({message: 'Payment proof uploaded successfully. Awaiting verification.'})

    } catch (error) {
      console.error("Error uploading payment proof:", error);
      return BaseService.sendFailedResponse({
        error: "Unable to upload payment proof",
      });
    }
  }
}

module.exports = WalletService;
