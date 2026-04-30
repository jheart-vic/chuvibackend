const cors = require('cors')

const corsOptions = {
    origin: [
        'http://localhost:5550',
        'http://localhost:4000',
        'http://localhost:3000',
        'http://localhost:5000',
        'http://localhost:5173',
        'https://www.chuvilaundry.com',
        'https://chuvi-v1.vercel.app',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    exposedHeaders: ['Authorization', 'refresh_token'],
}

module.exports = cors(corsOptions)
