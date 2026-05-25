const mongoose = require('mongoose')

let cached = global.mongoose
if (!cached) {
    cached = global.mongoose = { conn: null, promise: null }
}

const connectToMongoDB = async (mongoURL) => {
    try {
        if (cached.conn) {
            console.log('Reusing existing MongoDB connection')
            return cached.conn
        }

        if (!cached.promise) {
            cached.promise = mongoose.connect(mongoURL, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            })
        }

        cached.conn = await cached.promise
        console.log('Connected to MongoDB')
        return cached.conn
    } catch (error) {
        cached.promise = null // ✅ reset so next call retries instead of hanging
        console.error('MongoDB connection failed:', error)
        process.exit(1)
    }
}

module.exports = connectToMongoDB