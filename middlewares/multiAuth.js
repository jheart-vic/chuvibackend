const auth = require('./auth')

const multiAuth = (...roles) => (req, res, next) => {
    auth(req, res, () => {
        if (roles.includes(req.user.userType)) {
            return next()
        }

        return res.status(403).json({
            success: false,
            data: {
                error: 'Access denied. Insufficient permissions.',
            },
        })
    })
}

module.exports = multiAuth