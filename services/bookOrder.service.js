const BaseService = require("./base.service");
const UserModel = require("../models/user.model");
const validateData = require("../util/validate");
const BookOrderModel = require("../models/bookOrder.model");
const AdminOrderDetailsModel = require("../models/adminOrderDetails.model");
const { generateOscNumber } = require("../util/helper");


class BookOrderService extends BaseService {
  async postBookOrder(req, res) {
    try {
      const post = req.body;
      const userId = req.user.id

      const user = await UserModel.findById(userId)

      if(!user){
        return BaseService.sendFailedResponse({error: 'User not found'})
      }
      // userId
      // fullName
      // phoneNumber
      // pickupAddress
      // pickupDate
      // pickupTime
      // serviceType
      // serviceTier
      // deliverySpeed
      // amount
      // oscNumber
      // items
      // extraNote
      // paymentStatus

      const validateRule = {
        fullName: "string|required",
        phoneNumber: "string|required",
        pickupAddress: "string|required",
        pickupDate: "date|required",
        pickupTime: "string|required",
        serviceType: "string|required",
        serviceTier: "string|required",
        deliverySpeed: "string|required",
        items: "array|required",
        "items.*.type": "string|required",
        "items.*.price": "integer|required",
        "items.*.quantity": "integer|required",
      };

      const validateMessage = {
        required: ":attribute is required",
        "int": ":attribute must be an integer.",
        "array": ":attribute must be an array.",
      };

      const validateResult = validateData(post, validateRule, validateMessage);
      if (!validateResult.success) {
        return BaseService.sendFailedResponse({ error: validateResult.data });
      }

      const totalPrice = post.items.reduce((sum, item)=>{
        const price = Number(item.price)
        const quantity = Number(item.quantity)

        return sum + (price * quantity)
      },0)

      const oscNumber = generateOscNumber()
      const newOrderItem = {
        oscNumber,
        amount: totalPrice,
        ...post
      }
      const newOrder = new BookOrderModel(newOrderItem)
      await newOrder.save()

      return BaseService.sendSuccessResponse({
        message: "Order booked successfully."
      });

    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async getBookOrderDetails(req, res) {
    try {
      const adminOrderDetails = await AdminOrderDetailsModel.findOne({})

      return BaseService.sendSuccessResponse({
        message: adminOrderDetails
      });

    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
  async updateBookOrderPaymentStatus(req, res) {
    try {
      const status = req.body.paymentStatus
      const bookOrderId = req.params.id

      if(!status){
        return BaseService.sendFailedResponse({error: 'Please provide a payment status for the book order'})
      }

      if(!bookOrderId){
        return BaseService.sendFailedResponse({error: 'Please provide a book order id'})
      }

      const bookOrder = await BookOrderModel.findById(bookOrderId)
      if(!bookOrder){
        return BaseService.sendFailedResponse({error: 'Book order not found!'})
      }
      bookOrder.paymentStatus = status
      await bookOrder.save()

      return BaseService.sendSuccessResponse({
        message: "Book order updated successfully"
      });

    } catch (error) {
      console.log(error);
      return BaseService.sendFailedResponse({ error });
    }
  }
}

module.exports = BookOrderService;
