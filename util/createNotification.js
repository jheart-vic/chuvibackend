const NotificationModel = require("../models/notification.model");


async function createNotification({
    userId,
    title,
    body,
    subBody,
    type,
  }) {
    try {
      const notification = await NotificationModel.create({
        userId,
        title,
        body,
        subBody,
        type,
      });
  
      return notification;
    } catch (error) {
      console.error("Failed to create notification:", error);
      throw error;
    }
  }

module.exports = createNotification