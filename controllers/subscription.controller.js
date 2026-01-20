const SubscriptionService = require("../services/subscription.service");
const BaseController = require("./base.controller");

class SubscriptionController extends BaseController {
    async createPlans(req, res) {
        const subscriptionService = new SubscriptionService();
        const result = await subscriptionService.createPlan(req);

        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async getPlans(req, res){
        const subscriptionService = new SubscriptionService();
        const result = await subscriptionService.getPlans(req);
        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async getPlan(req, res){
        const subscriptionService = new SubscriptionService();
        const result = await subscriptionService.getPlan(req);
        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async updatePlan(req, res){
        const subscriptionService = new SubscriptionService();
        const result = await subscriptionService.updatePlan(req);
        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async deletePlan(req, res){
        const subscriptionService = new SubscriptionService();
        const result = await subscriptionService.deletePlan(req);
        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async subscribePlan(req, res){
        const subscriptionService = new SubscriptionService();
        const result = await subscriptionService.subscribePlan(req);
        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async cancelSubscription(req, res){
        const subscriptionService = new SubscriptionService();
        const result = await subscriptionService.cancelSubscription(req);
        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
    async getCurrentSubscription(req, res){
        const subscriptionService = new SubscriptionService();
        const result = await subscriptionService.getCurrentubscription(req);
        if (!result.success) {
            return BaseController.sendFailedResponse(res, result.data);
        }
        return BaseController.sendSuccessResponse(res, result.data);
    }
}

module.exports = SubscriptionController;