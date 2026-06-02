
const { Schema, model } = require("mongoose");
const { AUDIT_LOG_CATEGORIES } = require("../util/constants");

const AuditLogSchema = new Schema({
    userId: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    orderId: { type: String, index: true },
    category: { 
      type: String, 
      enum: Object.values(AUDIT_LOG_CATEGORIES), 
      required: true, 
      index: true 
    },
    metadata: { type: Schema.Types.Mixed, default: {} }
  }, {
    timestamps: true,
  });
  
  const AuditLogModel = model('AuditLog', AuditLogSchema)
  module.exports = AuditLogModel