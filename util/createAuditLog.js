
const AuditLogModel = require("../models/audit.log.model");


async function createAuditLog({
    userId,
    action,
    category,
    orderId=null,
  }) {
    try {
      const auditLog = await AuditLogModel.create({
        userId,
        action,
        category,
        ...(orderId ? { orderId } : {}),
      });
  
      return auditLog;
    } catch (error) {
      console.error("Failed to create auditLog:", error);
      throw error;
    }
  }

module.exports = createAuditLog