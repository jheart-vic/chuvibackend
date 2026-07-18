// One-off CRM backfill: builds a CRM profile for every existing customer and
// lead from users + delivered order history, computing stage, tags and
// counters. Deliberately schedules NO messages — existing customers should
// not get welcome/reactivation blasts for old history; the daily crons take
// over from the state this script leaves behind.
//
// Run with: node crmBackfill.js
require('dotenv').config()
const mongoose = require('mongoose')
const connectToMongoDB = require('./config/db')
const UserModel = require('./models/user.model')
const BookOrderModel = require('./models/bookOrder.model')
const CrmProfileModel = require('./models/crmProfile.model')
const CrmService = require('./services/crm.service')
const { getCrmSettings } = require('./services/crmMessenger.service')
const { normalizePhone } = require('./util/helper')
const {
    ROLE,
    ORDER_STATUS,
    CRM_STAGE,
    DELIVERY_SPEED,
    ORDER_CHANNEL,
} = require('./util/constants')

const DAY = 24 * 60 * 60 * 1000

const isExpressSpeed = (speed) =>
    speed === DELIVERY_SPEED.EXPRESS || speed === DELIVERY_SPEED.SAME_DAY

const countStage = (totalOrders) => {
    if (totalOrders >= 5) return CRM_STAGE.LOYAL
    if (totalOrders >= 2) return CRM_STAGE.ACTIVE
    if (totalOrders === 1) return CRM_STAGE.FIRST_ORDER
    return CRM_STAGE.LEAD
}

async function backfill() {
    await connectToMongoDB(process.env.MONGODB_URL)
    const settings = await getCrmSettings()

    // 1. profiles for every registered customer (leads until proven otherwise)
    const users = await UserModel.find({ userType: ROLE.USER }).lean()
    for (const user of users) {
        await CrmService.findOrCreateProfile({
            userId: user._id,
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            email: user.email,
            channel: ORDER_CHANNEL.WEBSITE,
        })
    }
    console.log(`Profiles ensured for ${users.length} registered user(s)`)

    // 2. replay delivered orders into counters (guest orders resolve by phone)
    const deliveredOrders = await BookOrderModel.find({
        'stage.status': ORDER_STATUS.DELIVERED,
    })
        .sort({ createdAt: 1 })
        .lean()

    const stats = new Map() // profileId -> aggregate
    for (const order of deliveredOrders) {
        const { profile } = await CrmService.findOrCreateProfile({
            userId: order.userId,
            fullName: order.fullName,
            phoneNumber: order.phoneNumber,
            channel: order.channel,
        })
        const key = String(profile._id)
        const s = stats.get(key) || {
            totalOrders: 0,
            totalSpent: 0,
            expressOrders: 0,
            firstOrderAt: null,
            lastOrderAt: null,
        }
        s.totalOrders += 1
        s.totalSpent += order.amount || 0
        if (isExpressSpeed(order.deliverySpeed)) s.expressOrders += 1
        if (!s.firstOrderAt) s.firstOrderAt = order.createdAt
        s.lastOrderAt = order.updatedAt || order.createdAt
        stats.set(key, s)
    }
    console.log(
        `Replayed ${deliveredOrders.length} delivered order(s) across ${stats.size} profile(s)`,
    )

    // 3. compute stage + automatic tags per profile
    const dormantCutoff = Date.now() - settings.thresholds.dormantDays * DAY
    let dormantCount = 0
    for (const [profileId, s] of stats) {
        const profile = await CrmProfileModel.findById(profileId)
        if (!profile) continue

        profile.totalOrders = s.totalOrders
        profile.totalSpent = s.totalSpent
        profile.expressOrders = s.expressOrders
        profile.firstOrderAt = s.firstOrderAt
        profile.lastOrderAt = s.lastOrderAt

        const isDormant = new Date(s.lastOrderAt).getTime() <= dormantCutoff
        const target = isDormant
            ? CRM_STAGE.DORMANT
            : countStage(s.totalOrders)
        if (isDormant) {
            profile.wasDormant = true
            profile.dormantSince = new Date(
                new Date(s.lastOrderAt).getTime() +
                    settings.thresholds.dormantDays * DAY,
            )
            dormantCount += 1
        }
        CrmService.setStage(profile, target, { note: 'CRM backfill' })
        CrmService.applyAutoTags(profile, settings.thresholds)
        await profile.save()
    }

    const total = await CrmProfileModel.countDocuments({})
    console.log(
        `✅ Backfill complete: ${total} profile(s), ${stats.size} with orders, ${dormantCount} dormant`,
    )
    await mongoose.disconnect()
}

backfill().catch((err) => {
    console.error('CRM backfill failed:', err)
    process.exit(1)
})
