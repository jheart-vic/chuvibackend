const express = require('express')
const router = express.Router()
const authRouter = require('./auth')
const userRouter = require('./users')
const adminRouter = require('./admin')
const bookOrderRouter = require('./bookOrder')
const walletRouter = require('./wallet')
const subscriptionRouter = require('./subscription')
const utilsRouter = require('./utils')
const intakeUserRouter = require('./intake-user')
const seedRouter = require('./seed')


router.use('/admin', adminRouter)
router.use('/users', userRouter)
router.use('/auth', authRouter)
router.use('/bookOrder', bookOrderRouter)
router.use('/wallet', walletRouter)
router.use('/subscription', subscriptionRouter)
router.use('/utils', utilsRouter)
router.use('/intake-user', intakeUserRouter)
router.use('/seeds', seedRouter)

module.exports = router