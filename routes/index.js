const express = require('express')
const router = express.Router()
const authRouter = require('./auth')
const userRouter = require('./users')


router.use('/users', userRouter)
router.use('/auth', authRouter)

module.exports = router