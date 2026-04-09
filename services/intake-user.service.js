const BookOrderModel = require("../models/bookOrder.model");
const IntakeUserModel = require("../models/intakeUser.model");
const { PAYMENT_ORDER_STATUS, BILLING_TYPE, ORDER_CHANNEL } = require("../util/constants");
const BaseService = require("./base.service");

class IntakeUserService extends BaseService {
    async createBookOrder(req, res) {
        try {
          const post = req.body;
          const userId = req.user.id;
    
          const user = await IntakeUserModel.findById(userId);
    
          if (!user) {
            return BaseService.sendFailedResponse({ error: "User not found" });
          }
    
          const validateRule = {
            fullName: "string|required",
            phoneNumber: "string|required",
            pickupAddress: "string|required",
            serviceType: "string|required",
            serviceTier: "string|required",
            isPickUpOnly: "boolean|required",
            isPickUpAndDelivery: "boolean|required",
            deliverySpeed: "string|required",
            items: "array|required",
            "items.*.type": "string|required",
            "items.*.price": "integer|required",
            "items.*.quantity": "integer|required",
          };
    
          const validateMessage = {
            required: ":attribute is required",
            int: ":attribute must be an integer.",
            array: ":attribute must be an array.",
          };
    
          const validateResult = validateData(post, validateRule, validateMessage);
          if (!validateResult.success) {
            return BaseService.sendFailedResponse({ error: validateResult.data });
          }
    
          let totalPrice = post.items.reduce((sum, item) => {
            const price = Number(item.price);
            const quantity = Number(item.quantity);
    
            return sum + price * quantity;
          }, 0);

          let extraDeliveryCost = 0

          if(post.deliverySpeend == DELIVERY_SPEED.EXPRESS){
            extraDeliveryCost = 300
          }else if(post.deliverySpeed == DELIVERY_SPEED.SAME_DAY){
            extraDeliveryCost = 500
          }
    
          totalPrice += extraDeliveryCost * post.items.length;
    
          const oscNumber = generateOscNumber();
          const newOrderItem = {
            oscNumber,
            amount: totalPrice,
            paymentStatus: PAYMENT_ORDER_STATUS.SUCCESS,
            billingType: BILLING_TYPE.PAY_PER_ITEM,
            staffId: userId,
            channel: ORDER_CHANNEL.OFFICE,
            ...post,
          };
          const newOrder = new BookOrderModel(newOrderItem);
          await newOrder.save();
    
          await NotificationModel.create({
            userId: userId,
            title: "Order Created Successfully",
            body: `Your have successfully created an order for ${post.fullName}.`,
            subBody: `Order ID: ${oscNumber}.`,
            type: NOTIFICATION_TYPE.ORDER_CREATED,
          });
    
          return BaseService.sendSuccessResponse({
            message: newOrder,
          });
        } catch (error) {
          console.log(error);
          return BaseService.sendFailedResponse({ error });
        }
      }
}

module.exports = IntakeUserService;
