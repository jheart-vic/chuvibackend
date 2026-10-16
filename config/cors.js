const cors = require('cors')

const corsOptions = {
    origin: [
        'http://localhost:5550',
        'http://localhost:4000',
        'http://localhost:3000',
        'http://localhost:5000',
        'http://localhost:5173',
        'https://chuvilaundry.com',
        'https://www.chuvilaundry.com',
        'https://chuvi-v1.vercel.app',
        // Test site only (set on the test server, never on live), comma separated,
        // e.g. EXTRA_CORS_ORIGINS=https://test.chuvilaundry.com,https://chuvi-test.vercel.app
        ...String(process.env.EXTRA_CORS_ORIGINS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    exposedHeaders: ['Authorization', 'refresh_token'],
}

module.exports = cors(corsOptions)
