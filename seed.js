// seeds/fixServiceTier.seed.js
const mongoose = require('mongoose')
require('dotenv').config()

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL)
        console.log('Connected to MongoDB')

        const result = await mongoose.connection
            .collection('bookorders')
            .updateMany(
                { serviceTier: 'standard' },
                { $set: { serviceTier: 'classic' } },
            )

        console.log(`✅ Updated ${result.modifiedCount} orders from 'standard' → 'classic'`)
    } catch (error) {
        console.error('❌ Migration failed:', error)
    } finally {
        await mongoose.disconnect()
        console.log('Disconnected from MongoDB')
        process.exit(0)
    }
}

run()