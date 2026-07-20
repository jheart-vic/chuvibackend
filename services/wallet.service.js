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
const { generateReferenceId, getObjectId } = require("../util/helper");
const createNotification = require("../util/createNotification");
const { NOTIFICATION_TYPE } = require("../util/constants");
const createAuditLog = require("../util/createAuditLog");
const WalletCreditService = require("./walletCredit.service");

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
      // amount = amount * 100;
      const reference = generateReferenceId();

      const newPayment = await PaymentModel.create({
        userId: userId,
        amount: 0,
        reference,
        status: 'pending',
        type: 'wallet-top-up',
        alertType: 'credit',
    })
      const response = await paystackAxios.post("/transaction/initialize", {
        email,
        amount: amount * 100, // e.g. 4500000 for ₦45,000.00
        reference,
        metadata: {
          userId,
          transactionType: "wallet-top-up",
          amount,
          paymentMethod,
          reference
        },
       callback_url: "https://www.chuvilaundry.com/user/payment/callback",
      });

      // await createNotification({
      //   userId,
      //   title: "Wallet Top-Up Initiated",
      //   body: `Your wallet top-up of ₦${amount / 100} has been initiated. Please complete the payment to add funds to your wallet.`,
      //   type: NOTIFICATION_TYPE.TOP_UP_REQUEST,
      // })
      await createAuditLog({userId: getObjectId(userId), action: `Initiated wallet top-up of ₦${amount} with reference ${reference}`, category: 'wallet'})

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

      // 1️⃣ Spend reward credits first (oldest expiry first) — service value
      // credits (laundry/referral/recovery/promo) always apply before cash.
      const creditResult = await WalletCreditService.applyCreditsToAmount(
        userId,
        bookOrder._id,
        bookOrder.amount,
        description
      );
      const cashNeeded = bookOrder.amount - creditResult.applied;

      // 2️⃣ ATOMIC cash debit for the remainder (only succeeds if balance >= cashNeeded)
      let wallet = null;
      if (cashNeeded > 0) {
        wallet = await WalletModel.findOneAndUpdate(
          {
            userId,
            balance: { $gte: cashNeeded },
          },
          {
            $inc: { balance: -cashNeeded },
          },
          { new: true }
        );

        if (!wallet) {
          // put the credits back — the payment did not happen
          await WalletCreditService.rollbackApplications(
            creditResult.breakdown,
            bookOrder._id,
            "Payment failed — insufficient cash balance"
          );
          return BaseService.sendFailedResponse({
            error: "Oops! Insufficient wallet balance.",
          });
        }
      } else {
        wallet = await WalletModel.findOne({ userId });
      }

      // Update order status
      bookOrder.paymentStatus = "success";
      await bookOrder.save();

      const reference = uuidv4();

      if (cashNeeded > 0) {
        await WalletTransactionModel.create({
          userId,
          walletId: wallet._id,
          type: "debit",
          amount: cashNeeded,
          reference,
          status: "success",
          description,
          relatedOrderId: bookOrder._id,
          balanceAfter: wallet.balance,
        });
      }

      const creditNote =
        creditResult.applied > 0
          ? ` (₦${creditResult.applied.toLocaleString("en-NG")} covered by wallet credit)`
          : "";
      await createNotification({
        userId,
        title: "Payment Successful",
        body: `Your payment of ₦${bookOrder.amount} for Order #${bookOrder._id} was successful${creditNote}. Thank you for using your wallet!`,
        type: NOTIFICATION_TYPE.PAYMENT_APPROVED,
      })

      return BaseService.sendSuccessResponse({
        message: "Payment made successfully from wallet.",
        creditApplied: creditResult.applied,
        cashPaid: cashNeeded,
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
    // Accept both 'type' (frontend) and 'alertType' (backwards compat)
    const alertType = req.query.type || req.query.alertType;
    const period = req.query.period || "all";
    const skip = (page - 1) * limit;
    const userId = req.user.id;

    const wallet = await WalletModel.findOne({ userId });
    if (!wallet) {
      return BaseService.sendFailedResponse({ error: "Wallet not found" });
    }

    // Date filter
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

    // Build filter – only apply alertType if it's 'credit' or 'debit'
    const filter = { userId, ...dateFilter };
    if (alertType === "credit") filter.alertType = "credit";
    if (alertType === "debit")  filter.alertType = "debit";

    const transactions = await PaymentModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await PaymentModel.countDocuments(filter);

    return BaseService.sendSuccessResponse({
      transactions,           // ✅ direct array, no nested 'message'
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return BaseService.sendFailedResponse({ error: "Error fetching transactions" });
  }
}

  async getMonthlyTransaction(req, res) {
    try {
      const userId = req.user.id;

      let { page, limit } = req.query;
      const alertType = req.query.alertType || "";


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
        ...(alertType ? { alertType } : {}),
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

      const credits = await WalletCreditService.getCreditBalances(userId);

      return BaseService.sendSuccessResponse({
        message: {
          balance: wallet.balance, // cash
          cashBalance: wallet.balance, // alias — same value, kept consistent with /wallet-credits
          creditTotal: credits.total,
          totalAvailable: wallet.balance + credits.total,
          creditsByType: credits.byType,
          expiringSoon: credits.expiringSoon,
        },
      });
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
      return BaseService.sendFailedResponse({
        error: "Unable to fetch wallet balance",
      });
    }
  }
  // Wallet page: cash + credit sub-balances + every active credit with its
  // source and expiry, plus credit-related transaction history.
  async getWalletCredits(req) {
    try {
      const userId = req?.user?.id;
      if (!userId) {
        return BaseService.sendFailedResponse({ error: "Invalid user" });
      }

      const wallet = await WalletModel.findOneAndUpdate(
        { userId },
        { $setOnInsert: { balance: 0 } },
        { new: true, upsert: true, lean: true }
      );
      const credits = await WalletCreditService.getCreditBalances(userId);

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const txFilter = {
        userId,
        creditType: { $exists: true, $ne: null },
      };
      const transactions = await WalletTransactionModel.find(txFilter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      const total = await WalletTransactionModel.countDocuments(txFilter);

      return BaseService.sendSuccessResponse({
        message: {
          cashBalance: wallet.balance, // cash
          balance: wallet.balance, // alias — same value, kept consistent with /wallet-balance
          creditTotal: credits.total,
          totalAvailable: wallet.balance + credits.total,
          creditsByType: credits.byType,
          expiringSoon: credits.expiringSoon,
          credits: credits.credits,
          transactions,
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error("Error fetching wallet credits:", error);
      return BaseService.sendFailedResponse({
        error: "Unable to fetch wallet credits",
      });
    }
  }

  // Admin: view a specific customer's wallet credits so staff can pick the
  // exact creditId to remove from via /admin/adjust-credit. Mirrors the
  // customer getWalletCredits shape but targets an arbitrary userId.
  async adminGetUserCredits(req) {
    try {
      const userId = req.query?.userId || req.params?.userId;
      if (!userId) {
        return BaseService.sendFailedResponse({ error: "userId is required" });
      }

      const targetUser = await UserModel.findById(userId)
        .select("firstName lastName email phone")
        .lean();
      if (!targetUser) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const wallet = await WalletModel.findOne({ userId }).lean();
      const credits = await WalletCreditService.getCreditBalances(userId);

      // Surface an explicit `creditId` on each credit — this is the value the
      // admin passes back as `creditId` when removing value.
      const creditList = (credits.credits || []).map((c) => ({
        creditId: c._id,
        type: c.type,
        amount: c.amount,
        remaining: c.remaining,
        status: c.status,
        sourceSystem: c.sourceSystem,
        note: c.note,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
      }));

      return BaseService.sendSuccessResponse({
        message: {
          user: {
            id: targetUser._id,
            name: `${targetUser.firstName || ""} ${targetUser.lastName || ""}`.trim(),
            email: targetUser.email,
            phone: targetUser.phone,
          },
          cashBalance: wallet?.balance || 0,
          creditTotal: credits.total,
          totalAvailable: (wallet?.balance || 0) + credits.total,
          creditsByType: credits.byType,
          expiringSoon: credits.expiringSoon,
          credits: creditList,
        },
      });
    } catch (error) {
      console.error("Error fetching user wallet credits (admin):", error);
      return BaseService.sendFailedResponse({
        error: "Unable to fetch user wallet credits",
      });
    }
  }

  // Admin: grant or remove credit value with a mandatory reason.
  async adminAdjustCredit(req) {
    try {
      const post = req.body;
      const validateRule = {
        userId: "string|required",
        amount: "integer|required",
        direction: "string|required", // add | remove
        reason: "string|required",
      };
      const validateResult = validateData(post, validateRule, {
        required: ":attribute is required",
      });
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const { userId, amount, direction, reason, type, creditId } = post;
      const targetUser = await UserModel.findById(userId);
      if (!targetUser) {
        return BaseService.sendFailedResponse({ error: "User not found" });
      }

      const result = await WalletCreditService.manualAdjust({
        userId,
        creditId,
        type,
        amount,
        direction,
        reason,
        performedBy: getObjectId(req.user.id),
      });

      await createAuditLog({
        userId: getObjectId(req.user.id),
        action: `Manual wallet credit adjustment (${direction} ₦${amount}) for user ${userId}: ${reason}`,
        category: "wallet",
      });

      return BaseService.sendSuccessResponse({
        message: {
          adjusted: result.adjusted,
          credit: result.credit,
        },
      });
    } catch (error) {
      console.error("Error adjusting wallet credit:", error);
      return BaseService.sendFailedResponse({
        error: error.message || "Unable to adjust wallet credit",
      });
    }
  }

  // Admin: return every credit an order consumed (order cancelled / correction).
  async adminReverseOrderCredits(req) {
    try {
      const post = req.body;
      const validateRule = {
        bookOrderId: "string|required",
        reason: "string|required",
      };
      const validateResult = validateData(post, validateRule, {
        required: ":attribute is required",
      });
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const { bookOrderId, reason } = post;
      const bookOrder = await BookOrderModel.findById(bookOrderId);
      if (!bookOrder) {
        return BaseService.sendFailedResponse({ error: "Order not found" });
      }

      const result = await WalletCreditService.reverseOrderCredits(bookOrderId, {
        reason,
        performedBy: getObjectId(req.user.id),
      });

      await createAuditLog({
        userId: getObjectId(req.user.id),
        action: `Reversed ₦${result.restored} wallet credit for order ${bookOrderId}: ${reason}`,
        category: "wallet",
      });

      return BaseService.sendSuccessResponse({
        message: {
          restored: result.restored,
          creditsTouched: result.creditsTouched,
        },
      });
    } catch (error) {
      console.error("Error reversing order credits:", error);
      return BaseService.sendFailedResponse({
        error: error.message || "Unable to reverse order credits",
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

      await createNotification({
        userId,
        title: "Payment Proof Uploaded",
        body: `Your payment proof for ₦${amount} has been uploaded successfully. Our team will verify it shortly.`,
        type: NOTIFICATION_TYPE.TOP_UP_REQUEST,
      })
      await createAuditLog({userId: getObjectId(userId), action: `Uploaded payment proof for ₦${amount} with reference ${reference}`, category: 'wallet'})

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
