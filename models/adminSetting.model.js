const mongoose = require('mongoose')

const ServiceTypeSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        pricePerPiece: { type: Number, required: true, default: 700 },
    },
    { _id: false },
)

const adminSettingSchema = new mongoose.Schema(
    {
        // ✅ serviceType now owns its own price — name and charge both editable
        serviceTypes: {
            type: [ServiceTypeSchema],
            default: [
                { name: 'wash-and-iron', pricePerPiece: 700 },
                { name: 'washing-only', pricePerPiece: 700 },
                { name: 'ironing-only', pricePerPiece: 700},
                { name: 'dry-clean', pricePerPiece: 700},
            ],
        },
        sameDayCharge: { type: Number, default: 300 },
        expressCharge: { type: Number, default: 100 },
        premiumServiceTierCharge: { type: Number, default: 1.5 },
        vipServiceTierCharge: { type: Number, default: 2 },
        pickupTimeSlots: {
            type: [String],
            default: ['10am-12pm', '4pm-6pm'],
        },
        standardCapacity: { type: Number, default: 100 },
        sameDayCapacity: { type: Number, default: 50 },
        expressCapacity: { type: Number, default: 30 },
        standardDeliveryPeriod: { type: Number, default: 2 },
    },
    { timestamps: true },
)

const AdminSettingModel = mongoose.model('AdminSetting', adminSettingSchema)
module.exports = AdminSettingModel