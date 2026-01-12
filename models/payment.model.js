const { default: mongoose } = require("mongoose");


const PaymentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true }, // in your base currency
    reference: { type: String, required: true, unique: true }, // from Paystack
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    type: { type: String, enum: ['order', 'subscription'], required: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    channel: { type: String }, // card, bank, etc.
    paidAt: { type: Date },
    createdAt: { type: Date, default: Date.now }
  });
  
  const PaymentModel = mongoose.model("Payment", PaymentSchema);
  module.exports = PaymentModel