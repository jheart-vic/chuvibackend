const express = require('express')
const router = express.Router()
const authRouter = require('./auth')
const userRouter = require('./users')
const bookOrderRouter = require('./bookOrder')
const walletRouter = require('./wallet')


router.use('/users', userRouter)
router.use('/auth', authRouter)
router.use('/bookOrder', bookOrderRouter)
router.use('/wallet', walletRouter)

module.exports = router