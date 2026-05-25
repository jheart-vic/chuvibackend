// seeds/fixAdminSetting.seed.js
const mongoose = require('mongoose')
require('dotenv').config()

const AdminSettingModel = require('./models/adminSetting.model')

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL)
        console.log('Connected to MongoDB')

        // ✅ delete the old document entirely and insert a fresh one
        await AdminSettingModel.deleteMany({})
        console.log('🗑️ Old AdminSetting deleted')

        await AdminSettingModel.create({
            serviceTypes: [
                { name: 'wash-and-iron', pricePerPiece: 700 },
                { name: 'washing-only', pricePerPiece: 700 },
                { name: 'ironing-only', pricePerPiece: 700 },
                { name: 'dry-clean', pricePerPiece: 700 },
            ],
            sameDayCharge: 300,
            expressCharge: 100,
            premiumServiceTierCharge: 1.5,
            vipServiceTierCharge: 2,
            pickupTimeSlots: ['10am-12pm', '4pm-6pm'],
            standardCapacity: 100,
            sameDayCapacity: 50,
            expressCapacity: 30,
            standardDeliveryPeriod: 2,
        })

        console.log('✅ AdminSetting seeded successfully')
    } catch (error) {
        console.error('❌ Seed failed:', error)
    } finally {
        await mongoose.disconnect()
        process.exit(0)
    }
}

run()