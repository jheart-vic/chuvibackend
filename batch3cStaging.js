/**
 * V1 launch batch 3c (client answers 15 Oct) — DB verification on testingdb.
 *
 *   1  Customer care gives recovery credit in one step: within N5,000 per case it is
 *      granted now, lasts 90 days, and the customer gets the client's one SMS
 *   2  Above the per-case limit it waits for admin (notified); admin's approval
 *      grants it and sends the same SMS
 *   3  The client's status words (statusLabel) and station names
 *   4  History lines: "[time] [station]: [what happened] by [staff name]"
 *
 * SMS and email stubbed. SAFETY: refuses unless STAGING_OK=1; refuses
 * NODE_ENV=production without STAGING_FORCE=1; hard-refuses laundrydb. Cleans up.
 *
 * Run: STAGING_OK=1 MONGODB_URL="<testing uri>" node batch3cStaging.js
 */
process.env.TZ = process.env.TZ_OVERRIDE || 'Africa/Lagos'
require('dotenv').config()
const SMS = []
const smsPath = require.resolve('./util/sendSms')
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true, exports: Object.assign(async (to, body) => { SMS.push({ to, body }); return { stubbed: true } }, { cleanSmsText: (t) => t }) }
const emailPath = require.resolve('./util/emailService')
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: async () => ({ stubbed: true }) }

const mongoose = require('mongoose')
const BookOrderModel = require('./models/bookOrder.model')
const UserModel = require('./models/user.model')
const ComplaintCaseModel = require('./models/complaintCase.model')
const ComplaintTypeModel = require('./models/complaintType.model')
const WalletCreditModel = require('./models/walletCredit.model')
const RewardSettingModel = require('./models/rewardSetting.model')
const ActivityModel = require('./models/activity.model')
const { ROLE } = require('./util/constants')

let PASS = 0,
    FAIL = 0
const ok = (c, m) => {
    if (c) {
        PASS++
        console.log('  ✓', m)
    } else {
        FAIL++
        console.log('  ✗ FAIL:', m)
    }
}

async function main() {
    if (process.env.STAGING_OK !== '1') {
        console.error('Refusing to run: set STAGING_OK=1 to confirm this is a staging DB.')
        process.exit(2)
    }
    if (process.env.NODE_ENV === 'production' && process.env.STAGING_FORCE !== '1') {
        console.error('NODE_ENV=production — refusing without STAGING_FORCE=1.')
        process.exit(2)
    }
    const url = process.env.MONGODB_URL
    const dbName = (String(url).match(/\/([A-Za-z0-9_-]+)(\?|$)/) || [])[1] || '<unknown>'
    console.log('Target DB name:', dbName)
    if (/laundrydb/i.test(dbName)) {
        console.error('*** "laundrydb" is the LIVE database. Refusing. ***')
        process.exit(2)
    }
    await mongoose.connect(url, { serverSelectionTimeoutMS: 60000 })

    const RecoveryService = require('./services/recovery.service')
    const { orderStatusLabel } = require('./util/statusLabel')
    const { stationLabel } = require('./util/displayName')
    const { historyLines } = require('./util/historyLines')

    const stamp = Date.now()
    const created = { users: [], orders: [], cases: [], types: [] }
    const rs = await RewardSettingModel.findOne().lean()
    const savedThreshold = rs ? rs.recoveryApprovalThreshold : undefined
    try {
        await RewardSettingModel.updateOne({}, { $set: { recoveryApprovalThreshold: 5000 } }, { upsert: true })
        const cx = await UserModel.create({ email: `b3c_cx_${stamp}@example.com`, fullName: 'Kemi Care', userType: ROLE.CUSTOMER_EXPERIENCE })
        const admin = await UserModel.create({ email: `b3c_admin_${stamp}@example.com`, fullName: 'B3C Admin', userType: ROLE.ADMIN })
        const intake = await UserModel.create({ email: `b3c_s1_${stamp}@example.com`, fullName: 'Chioma Obi', userType: ROLE.INTAKE_AND_TAG })
        const customer = await UserModel.create({ email: `b3c_cust_${stamp}@example.com`, fullName: 'Ngozi Eze', userType: ROLE.USER, phoneNumber: '08051230099' })
        created.users.push(cx._id, admin._id, intake._id, customer._id)
        const order = await BookOrderModel.create({
            userId: customer._id, fullName: 'Ngozi Eze', phoneNumber: '08051230099', serviceType: 'wash-and-iron', serviceTier: 'classic',
            deliverySpeed: 'standard', channel: 'website', amount: 6000, oscNumber: `OSC-B3C-${stamp}`, paymentStatus: 'success',
            stage: { status: 'delivered' }, items: [{ type: 'shirt', price: 1, quantity: 1 }],
        })
        created.orders.push(order._id)
        const type = await ComplaintTypeModel.create({ name: `B3C Stain ${stamp}`, key: `b3c_stain_${stamp}` }).catch(async () => ComplaintTypeModel.findOne())
        if (type && String(type.name).startsWith('B3C')) created.types.push(type._id)
        const mkCase = async () => {
            const c = await ComplaintCaseModel.create({ userId: customer._id, orderId: order._id, complaintTypeId: type._id, description: 'Stain on shirt' })
            created.cases.push(c._id)
            return c
        }

        console.log('\n1. Give credit within the limit')
        {
            const c = await mkCase()
            SMS.length = 0
            const r = await RecoveryService.giveCredit(c._id, { amount: 3000, reason: 'Shirt came back stained', givenBy: cx._id, giverRole: ROLE.CUSTOMER_EXPERIENCE })
            ok(r.granted === true && r.pendingApproval === false, 'granted at once (N3,000 is within N5,000)')
            const credit = await WalletCreditModel.findOne({ relatedComplaintId: c._id }).lean()
            const days = credit ? Math.round((new Date(credit.expiresAt) - new Date(credit.createdAt)) / 86400000) : null
            ok(credit && credit.type === 'recovery' && credit.amount === 3000, 'a N3,000 recovery credit is in the wallet')
            ok(days === 90, `it lasts 90 days (${days})`)
            const want = `Ngozi, we are sorry about your order ${order.oscNumber}. We have added N3,000 credit to your CHUVI wallet for your next order. It is valid for 90 days.`
            ok(SMS.length === 1 && SMS[0].body === want, `one SMS, the client's words: "${SMS[0]?.body}"`)
            const r2 = await RecoveryService.giveCredit(c._id, { amount: 2500, reason: 'More', givenBy: cx._id, giverRole: ROLE.CUSTOMER_EXPERIENCE })
            ok(r2.granted === false && r2.pendingApproval === true && r2.alreadyGiven === 3000, 'a second N2,500 on the same case would pass N5,000 → waits for admin')
        }

        console.log('\n2. Above the limit → admin')
        {
            const c = await mkCase()
            SMS.length = 0
            const r = await RecoveryService.giveCredit(c._id, { amount: 8000, reason: 'Ruined dress', givenBy: cx._id, giverRole: ROLE.CUSTOMER_EXPERIENCE })
            ok(r.granted === false && r.pendingApproval === true && r.limit === 5000, 'N8,000 waits for admin')
            ok(!(await WalletCreditModel.findOne({ relatedComplaintId: c._id })), 'no credit yet')
            ok(SMS.length === 0, 'no SMS yet')
            let refused = null
            try {
                await RecoveryService.approveCompensation(c._id, { compensationId: r.compensationId, approvedBy: cx._id, approverRole: ROLE.CUSTOMER_EXPERIENCE, confirmed: true })
            } catch (e) {
                refused = e.message
            }
            ok(!!refused, `customer care cannot approve it themselves ("${refused}")`)
            await RecoveryService.approveCompensation(c._id, { compensationId: r.compensationId, approvedBy: admin._id, approverRole: ROLE.ADMIN, confirmed: true })
            const credit = await WalletCreditModel.findOne({ relatedComplaintId: c._id }).lean()
            ok(credit && credit.amount === 8000, 'admin approves → N8,000 credit granted')
            ok(SMS.length === 1 && SMS[0].body.includes('N8,000') && SMS[0].body.includes('valid for 90 days'), 'and the same SMS goes out once')
        }

        console.log('\n3. Status words and station names')
        {
            const L = (o) => orderStatusLabel(o)
            ok(L({ stage: { status: 'pending' }, isPickUp: true, dispatchDetails: { pickup: {} } }) === 'Needs rider', 'no rider yet → Needs rider')
            ok(L({ stage: { status: 'pending' }, isPickUp: true, dispatchDetails: { pickup: { rider: 'x', status: 'scheduled' } } }) === 'Booked', 'rider assigned → Booked')
            ok(L({ stage: { status: 'pending' }, isPickUp: true, dispatchDetails: { pickup: { rider: 'x', status: 'pickup-in-progress' } } }) === 'Rider on the way', 'on the way → Rider on the way')
            ok(L({ stage: { status: 'queue' }, isPickUp: true, dispatchDetails: { pickup: { status: 'picked-up' } } }) === 'At Intake', 'in the Intake queue → At Intake')
            ok(L({ stage: { status: 'hold' }, paymentHold: { raisedAt: new Date() } }) === 'Waiting for payment', 'payment hold → Waiting for payment')
            ok(L({ stage: { status: 'hold' }, orderHold: { holdTypeKey: 'count_differs_from_rider' } }) === 'Waiting for admin', 'count dispute → Waiting for admin')
            ok(L({ stage: { status: 'ironing' } }) === 'Pressing' && L({ stage: { status: 'qc' } }) === 'Quality check' && L({ stage: { status: 'sort-and-pretreat' } }) === 'Sorting', 'Pressing, Quality check, Sorting')
            ok(L({ stage: { status: 'ready' }, dispatchDetails: { delivery: { status: 'failed' } } }) === 'Ready waiting redelivery', 'failed delivery → Ready waiting redelivery')
            ok(L({ stage: { status: 'returned-unwashed' } }) === 'Returned unwashed' && L({ stage: { status: 'collected' } }) === 'Collected', 'Returned unwashed, Collected')
            ok(stationLabel('qc-station') === 'Quality Check and Pack' && stationLabel('pressing-and-ironing-station') === 'Press' && stationLabel('customer-experience') === 'Customer Care', 'station names: Quality Check and Pack, Press, Customer Care')
        }

        console.log('\n4. History lines')
        {
            await ActivityModel.create({ title: '6 pieces counted', description: 'Intake counted 6 pieces', type: 'order-updated', orderId: order._id, userId: intake._id })
            const lines = await historyLines(order._id)
            const l = lines.find((x) => x.what === '6 pieces counted')
            ok(l && /^\d{2}:\d{2} Intake and Tag: 6 pieces counted by Chioma$/.test(l.line), `"${l?.line}"`)
        }
    } catch (e) {
        FAIL++
        console.error('  ✗ CRASH:', e)
    } finally {
        await RewardSettingModel.updateOne({}, savedThreshold === undefined ? { $unset: { recoveryApprovalThreshold: 1 } } : { $set: { recoveryApprovalThreshold: savedThreshold } })
        await WalletCreditModel.deleteMany({ relatedComplaintId: { $in: created.cases } })
        await mongoose.connection.collection('wallettransactions').deleteMany({ userId: { $in: created.users } })
        await ComplaintCaseModel.deleteMany({ _id: { $in: created.cases } })
        await ComplaintTypeModel.deleteMany({ _id: { $in: created.types } })
        await ActivityModel.deleteMany({ orderId: { $in: created.orders } })
        await BookOrderModel.deleteMany({ _id: { $in: created.orders } })
        await mongoose.connection.collection('wallets').deleteMany({ userId: { $in: created.users } })
        await mongoose.connection.collection('notifications').deleteMany({ userId: { $in: created.users } })
        await mongoose.connection.collection('communicationlogs').deleteMany({ userId: { $in: created.users } })
        await UserModel.deleteMany({ _id: { $in: created.users } })
        await mongoose.disconnect()
        console.log(`\n${PASS} passed, ${FAIL} failed`)
        process.exit(FAIL ? 1 : 0)
    }
}
main()
