require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

// adjust path to match your project structure
const UserModel = require('./models/user.model')

const MONGODB_URL = process.env.MONGODB_URL || process.env.DATABASE_URL

const seedAdmin = async () => {
    try {
        console.log('🔌 Connecting to database...')
        await mongoose.connect(MONGODB_URL)
        console.log('✅ Connected')

        const adminEmail = 'admin@chuvi.com'

        const adminExists = await UserModel.findOne({
            email: adminEmail,
            userType: 'admin',
        })

        if (adminExists) {
            console.log('⚠️  Admin already exists. Skipping seed.')
            process.exit(0)
        }

        const admin = new UserModel({
            email: adminEmail,
            password: 'Admin@1234',
            fullName: 'Super Admin',
            phoneNumber: '08000000000',
            userType: 'admin',
            servicePlatform: 'local',
            isVerified: true,
        })

        await admin.save()

        console.log('🎉 Admin seeded successfully')
        console.log('   Email:    admin@chuvi.com')
        console.log('   Password: Admin@1234')
        console.log('   ⚠️  Change the password after first login')

        process.exit(0)
    } catch (error) {
        console.error('❌ Seed failed:', error.message)
        process.exit(1)
    }
}

seedAdmin()