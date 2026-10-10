const BookOrderModel = require('../models/bookOrder.model')
const { buildTimelineOrderView } = require('../util/orderTimeline')
const UserModel = require('../models/user.model')
const NotificationModel = require('../models/notification.model')
const {
    PICKUP_STATUS,
    DELIVERY_STATUS,
    ORDER_STATUS,
    NOTIFICATION_TYPE,
    STATION_STATUS,
    PICKUP_DURATION_MINUTES,
    DELIVERY_DURATION_MINUTES,
    ORDER_SERVICE_TYPE,
    ROLE,
} = require('../util/constants')
const paginate = require('../util/paginate')
const { notifyRoles } = require('../util/notifyRoles')
// FE report 2026-10-09: "the rider list sends no delivery date or promise".
// `deliveryPromise` is derived in the one outward shape (`util/orderView.js`) so
// that no read path has to assemble it — but this service never called into it,
// and the selects below did not even fetch `deliveryDate`. We use
// `addDeliveryPromise` rather than the full `presentOrder` deliberately: a rider
// row has no need of `pricing`, and `presentOrder` would FABRICATE a pricing
// fallback from fields these selects do not load.
const {
    normalizeOrderAddresses,
    addDeliveryPromise,
    presentOrder,
} = require('../util/orderView')

// `deliveryDate` is the deadline and `scheduling` carries the confirmed window —
// `addDeliveryPromise` needs both. Added to every rider select.
const PROMISE_FIELDS = 'deliveryDate scheduling'

const BaseService = require('./base.service')
const createNotification = require('../util/createNotification')
const { notifyOperator, notifyAffectedStation, notifyAdminEvent, ADMIN_EVENT } = require('../util/notifyPolicy')
const {
    buildStageUpdate,
    normalizePhone,
    getObjectId,
} = require('../util/helper')
const createAuditLog = require('../util/createAuditLog')
const { crmOnOrderDelivered } = require('../util/crmHooks')
const { offerOnOrderDelivered } = require('../util/offerHooks')
const { referralOnOrderDelivered } = require('../util/referralHooks')
const { recoveryOnOrderDelivered } = require('../util/recoveryHooks')
const { markProductionClearedIfReady } = require('../util/productionClock')
// N1 Phase 3: the rider records the TRUE count at the door.
const sendSms = require('../util/sendSms')
const { countPieces } = require('../util/itemSummary')

class RiderService extends BaseService {
    async getRiderAssignedDeliveries(req) {
        try {
            const riderId = req.user.id
            const { page = 1, limit = 10 } = req.query

            const query = {
                isDelivery: true,
                'dispatchDetails.delivery.rider': riderId,
                'dispatchDetails.delivery.status': DELIVERY_STATUS.READY,
            }

            // Same gap as the pickup list (3.3): never normalized, so no landmark.
            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                select: `oscNumber fullName phoneNumber pickupAddress deliveryAddress serviceType serviceTier deliverySpeed amount paymentStatus items stage dispatchDetails dispatchTag createdAt ${PROMISE_FIELDS}`,
                lean: true,
            })
            const rows = data.map((order) => {
                normalizeOrderAddresses(order)
                addDeliveryPromise(order)
                return {
                    ...order,
                    itemCount: (order.items || []).length,
                    deliveryLandmark: order.deliveryAddress?.landmark || null,
                }
            })
            return BaseService.sendSuccessResponse({
                message: { data: rows, pagination },
            })
        } catch (error) {
            console.error('Error in getRiderAssignedDeliveries:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getActiveDeliveries(req) {
        try {
            const riderId = req.user.id
            const { page = 1, limit = 10 } = req.query

            const query = {
                isDelivery: true,
                'dispatchDetails.delivery.rider': riderId,
                'dispatchDetails.delivery.status':
                    DELIVERY_STATUS.OUT_FOR_DELIVERY,
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                select: `oscNumber fullName phoneNumber deliveryAddress serviceType serviceTier stage dispatchDetails createdAt ${PROMISE_FIELDS}`,
                lean: true,
            })

            const ordersWithMeta = data.map((order) => {
                normalizeOrderAddresses(order)
                addDeliveryPromise(order)
                const startedAt = order.dispatchDetails?.delivery?.startedAt
                const estimatedDelivery = startedAt
                    ? new Date(
                          new Date(startedAt).getTime() +
                              DELIVERY_DURATION_MINUTES * 60 * 1000,
                      )
                    : null

                return {
                    ...order,
                    deliveryLandmark: order.deliveryAddress?.landmark || null,
                    dispatchDetails: {
                        ...order.dispatchDetails,
                        delivery: {
                            ...order.dispatchDetails?.delivery,
                            estimatedDelivery,
                            durationMinutes: DELIVERY_DURATION_MINUTES,
                        },
                    },
                }
            })

            return BaseService.sendSuccessResponse({
                message: { data: ordersWithMeta, pagination },
            })
        } catch (error) {
            console.error('Error in getActiveDeliveries:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async markOrderAsDelivered(req) {
        try {
            const orderId = req.params.id
            const { phoneNumber } = req.body
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!phoneNumber)
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number is required',
                })

            const order = await BookOrderModel.findById(orderId).populate(
                'userId',
                'phoneNumber',
            )
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            // ✅ fix: check delivery.rider not pickup.rider
            if (order.dispatchDetails.delivery.rider?.toString() !== userId) {
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this delivery',
                })
            }

            if (
                order.dispatchDetails.delivery.status !==
                DELIVERY_STATUS.OUT_FOR_DELIVERY
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Delivery must be out for delivery before it can be marked as delivered',
                })
            }

            const customerPhone = order.phoneNumber
            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (normalizePhone(customerPhone) !== normalizePhone(phoneNumber)) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.delivery.status = DELIVERY_STATUS.DELIVERED
            order.dispatchDetails.delivery.updatedAt = new Date()
            order.markModified('dispatchDetails.delivery')
            await order.save()
            await BookOrderModel.updateOne(
                { _id: orderId },
                buildStageUpdate(
                    ORDER_STATUS.DELIVERED,
                    STATION_STATUS.RIDER_STATION,
                    'Delivery complete',
                ),
            )

            // D2(c): the delivery leg has just been served — settle its Anytime
            // refund if one is owed. Fire-and-forget, like the hooks below.
            try {
                const BookingWindowService = require('./bookingWindow.service')
                await BookingWindowService.settleAnytimeRefund({
                    orderId,
                    leg: 'delivery',
                    servedAt: new Date(),
                })
            } catch (err) {
                console.error('anytime delivery refund failed:', err?.message)
            }

            crmOnOrderDelivered(order)
            offerOnOrderDelivered(order)
            referralOnOrderDelivered(order)
            recoveryOnOrderDelivered(order)

            if (order.userId?._id) {
                await createNotification({
                    userId: order.userId._id,
                    title: 'Your order has been delivered',
                    body: `Order ${order.oscNumber} has been delivered successfully.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.ORDER_DELIVERED,
                })
            }
            await notifyOperator({
                userId,
                title: 'Delivery Completed',
                body: `Delivery for order ${order.oscNumber} has been marked as delivered.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.DELIVERY_STARTED,
            })
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Order ${order.oscNumber} marked as delivered by rider`,
            })

            return BaseService.sendSuccessResponse({
                message: 'Order marked as delivered successfully',
            })
        } catch (error) {
            console.error('Error in markOrderAsDelivered:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async markOrderDeliveryAsFailed(req) {
        try {
            const orderId = req.params.id
            const { phoneNumber, note = '' } = req.body
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!phoneNumber)
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number is required',
                })

            const order = await BookOrderModel.findById(orderId).populate(
                'userId',
                'phoneNumber',
            )

            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            if (order.dispatchDetails.delivery.rider?.toString() !== userId) {
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this delivery',
                })
            }

            if (
                order.dispatchDetails.delivery.status !==
                DELIVERY_STATUS.OUT_FOR_DELIVERY
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Delivery must be out for delivery before it can be marked as failed',
                })
            }

            const customerPhone = order.phoneNumber
            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (normalizePhone(customerPhone) !== normalizePhone(phoneNumber)) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.delivery.status = DELIVERY_STATUS.FAILED
            order.dispatchDetails.delivery.updatedAt = new Date()
            // Was overwriting `delivery.note` — the customer's special delivery
            // instruction, and the line the dispatch tag PRINTS. A failed delivery
            // would therefore put "customer not at home" on the reprinted tag as
            // an instruction to the next rider.
            order.dispatchDetails.delivery.failureNote = note
            order.markModified('dispatchDetails.delivery')
            // Back to READY, the stage before dispatch, as a failed pickup stays
            // PENDING. Left at OUT_FOR_DELIVERY the order dropped out of the
            // delivery queue (which reads READY) so the office could not find it
            // to reassign, and the bot told the customer a rider was on the way.
            // Only from OUT_FOR_DELIVERY: an admin can cancel an order mid-run
            // (the delivery leg is left as it was), and failing that run must not
            // put a cancelled, refunded order back in the queue.
            if (order.stage?.status === ORDER_STATUS.OUT_FOR_DELIVERY) {
                const failedAt = new Date()
                order.stage.status = ORDER_STATUS.READY
                order.stage.updatedAt = failedAt
                order.stageHistory.push({
                    status: ORDER_STATUS.READY,
                    note: note ? `Delivery failed: ${note}` : 'Delivery failed',
                    updatedAt: failedAt,
                })
            }
            await order.save()

            // Same as the pickup case: the rider was notifying themselves, and
            // the office heard nothing. (This one also had no `type` at all, so
            // every failed delivery was filed under the default `system`.)
            await notifyRoles({
                roles: [ROLE.INTAKE_AND_TAG, ROLE.CUSTOMER_EXPERIENCE, ROLE.ADMIN],
                title: 'Delivery Failed',
                body: `Delivery for order ${order.oscNumber} was marked as failed${note ? `. Note: ${note}` : ''}`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.DELIVERY_FAILED,
            })
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Order ${order.oscNumber} marked as delivery failed by rider. Note: ${note}`,
            })

            return BaseService.sendSuccessResponse({
                message: 'Delivery marked as failed successfully',
            })
        } catch (error) {
            console.error('Error in markOrderDeliveryAsFailed:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getRiderAssignedPickups(req) {
        try {
            const riderId = req.user.id
            const { page = 1, limit = 10 } = req.query

            const query = {
                isPickUp: true,
                'dispatchDetails.pickup.rider': riderId,
                'dispatchDetails.pickup.status': PICKUP_STATUS.SCHEDULED,
            }

            // Brief 3.3 — the landmark was missing from the one screen that needs
            // it most. This list (the runs a rider is about to go out on) was the
            // only dispatch list that never ran the addresses through
            // normalizeOrderAddresses, so an older order's address came back as a
            // bare string with no `landmark` key at all, while Active Pickups —
            // the same order, one tap later — showed it. Nothing was missing from
            // the data; this list just wasn't shaping it.
            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                select: `oscNumber fullName phoneNumber pickupAddress deliveryAddress serviceType serviceTier deliverySpeed amount paymentStatus items stage dispatchDetails createdAt ${PROMISE_FIELDS}`,
                lean: true,
            })
            const rows = data.map((order) => {
                normalizeOrderAddresses(order)
                addDeliveryPromise(order)
                return {
                    ...order,
                    itemCount: (order.items || []).length,
                    // Lifted out of the address object so a list row can show the
                    // "how do I find the door" line without digging.
                    pickupLandmark: order.pickupAddress?.landmark || null,
                }
            })
            return BaseService.sendSuccessResponse({
                message: { data: rows, pagination },
            })
        } catch (error) {
            console.error('Error in getRiderAssignedPickups:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getActivePickups(req) {
        try {
            const riderId = req.user.id
            const { page = 1, limit = 10 } = req.query

            const query = {
                isPickUp: true,
                'dispatchDetails.pickup.rider': riderId,
                'dispatchDetails.pickup.status':
                    PICKUP_STATUS.PICKUP_IN_PROGRESS,
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                select: `oscNumber fullName phoneNumber pickupAddress serviceType serviceTier stage dispatchDetails createdAt ${PROMISE_FIELDS}`,
                lean: true,
            })

            const ordersWithMeta = data.map((order) => {
                normalizeOrderAddresses(order)
                addDeliveryPromise(order)
                const startedAt = order.dispatchDetails?.pickup?.updatedAt
                const estimatedArrival = startedAt
                    ? new Date(
                          new Date(startedAt).getTime() +
                              PICKUP_DURATION_MINUTES * 60 * 1000,
                      )
                    : null

                return {
                    ...order,
                    pickupLandmark: order.pickupAddress?.landmark || null,
                    dispatchDetails: {
                        ...order.dispatchDetails,
                        pickup: {
                            ...order.dispatchDetails?.pickup,
                            estimatedArrival,
                            durationMinutes: PICKUP_DURATION_MINUTES,
                        },
                    },
                }
            })

            return BaseService.sendSuccessResponse({
                message: { data: ordersWithMeta, pagination },
            })
        } catch (error) {
            console.error('Error in getActivePickups:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async startPickup(req) {
        try {
            const orderId = req.params.id
            const { phoneNumber } = req.body
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!phoneNumber)
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number is required',
                })

            const order = await BookOrderModel.findById(orderId).populate(
                'userId',
                'phoneNumber',
            )
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            if (!order.isPickUp) {
                return BaseService.sendFailedResponse({
                    error: 'This order does not require pickup',
                })
            }

            if (
                order.dispatchDetails.pickup.status !== PICKUP_STATUS.SCHEDULED
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Pickup is not in a scheduled state',
                })
            }

            if (order.dispatchDetails.pickup.rider?.toString() !== userId) {
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this pickup',
                })
            }

            if (
                order.dispatchDetails.pickup.status === PICKUP_STATUS.PICKED_UP
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Order has already been picked up',
                })
            }

            const customerPhone = order.phoneNumber
            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (normalizePhone(customerPhone) !== normalizePhone(phoneNumber)) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.pickup.status =
                PICKUP_STATUS.PICKUP_IN_PROGRESS
            order.dispatchDetails.pickup.updatedAt = new Date()
            order.dispatchDetails.pickup.isVerified = true
            await order.save()

            if (order.userId?._id) {
                await createNotification({
                    userId: order.userId._id,
                    title: 'Your order has been picked up',
                    body: `Order ${order.oscNumber} has been picked up successfully.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.PICKUP_STARTED,
                })
            }

            await notifyOperator({
                userId: userId,
                title: 'Pickup Started',
                body: `Pickup for order ${order.oscNumber} has been started.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.PICKUP_STARTED,
            })
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Pickup for order ${order.oscNumber} started by rider`,
            })

            return BaseService.sendSuccessResponse({
                message: 'Pickup started successfully',
            })
        } catch (error) {
            console.error('Error in startPickup:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async markAsPickedUp(req) {
        try {
            const orderId = req.params.id
            const { phoneNumber } = req.body
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!phoneNumber)
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number is required',
                })

            const order = await BookOrderModel.findById(orderId).populate(
                'userId',
                'phoneNumber',
            )
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            if (!order.isPickUp)
                return BaseService.sendFailedResponse({
                    error: 'This order does not require pickup',
                })

            if (order.dispatchDetails.pickup.rider?.toString() !== userId)
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this pickup',
                })

            if (
                order.dispatchDetails.pickup.status !==
                PICKUP_STATUS.PICKUP_IN_PROGRESS
            )
                return BaseService.sendFailedResponse({
                    error: 'Pickup must be in progress before it can be marked as picked up',
                })

            const customerPhone = order.phoneNumber
            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (normalizePhone(customerPhone) !== normalizePhone(phoneNumber)) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }
            // ── N1 Phase 3: the rider records the TRUE count ────────────────
            //
            // Client spec: "No rider photo. The rider RECORDS the count; if it
            // differs from the customer's he must change it and give a reason →
            // flag 'count changed at pickup', does NOT stop the order, customer
            // gets an SMS with the rider's count."
            //
            // So the ONLY hard rule here is that a DIFFERENT count needs a
            // reason. Everything else is recorded and reported, never refused:
            // the rider is standing at a customer's door and must not be stuck.
            const reportedCount =
                req.body?.itemCount === undefined || req.body?.itemCount === null
                    ? null
                    : Number(req.body.itemCount)
            if (reportedCount !== null) {
                if (!Number.isFinite(reportedCount) || reportedCount < 0) {
                    return BaseService.sendFailedResponse({
                        error: 'itemCount must be a whole number of pieces.',
                    })
                }
                const customerCount =
                    order.counts?.customer ?? countPieces(order.items || [])
                const differs =
                    customerCount !== null &&
                    customerCount !== undefined &&
                    Number(customerCount) !== reportedCount
                const reason = String(req.body?.countReason || '').trim()
                if (differs && !reason) {
                    return BaseService.sendFailedResponse({
                        error: `You have entered ${reportedCount} piece(s) but the customer booked ${customerCount}. Please give a reason for the change.`,
                        requiresCountReason: true,
                        customerCount,
                        riderCount: reportedCount,
                    })
                }
                order.counts = {
                    ...(order.counts ? order.counts.toObject?.() ?? order.counts : {}),
                    customer: customerCount,
                    rider: reportedCount,
                    riderReason: differs ? reason : undefined,
                    riderRecordedAt: new Date(),
                    riderRecordedBy: userId,
                    changedAtPickup: Boolean(differs),
                }
                order.markModified('counts')
                if (differs) {
                    // A flag, NOT a hold — the client was explicit that this
                    // does not stop the order. The hold only appears later, if
                    // INTAKE disagrees with the rider.
                    order.flaggedForReview = true
                    order.flagMessage = `Count changed at pickup: customer booked ${customerCount}, rider collected ${reportedCount}. Reason: ${reason}`
                }
            }

            order.dispatchDetails.pickup.status = PICKUP_STATUS.PICKED_UP
            order.dispatchDetails.pickup.updatedAt = new Date()
            order.dispatchDetails.pickup.isVerified = true
            order.markModified('dispatchDetails.pickup')
            await order.save()

            // D2(c): the pickup has just been SERVED, so settle the Anytime
            // refund if one is owed — paid for speed, served inside a window.
            // Fire-and-forget: a refund calculation must never undo a recorded
            // pickup, and the order keeps the unpaid state for a retry.
            try {
                const BookingWindowService = require('./bookingWindow.service')
                await BookingWindowService.settleAnytimeRefund({
                    orderId: order._id,
                    leg: 'pickup',
                    servedAt: new Date(),
                })
            } catch (err) {
                console.error('anytime pickup refund failed:', err?.message)
            }

            // The customer is told the rider's count — their clothes, their
            // bill. Non-fatal: a message must never undo a recorded pickup.
            if (order.counts?.changedAtPickup) {
                try {
                    await sendSms(
                        order.phoneNumber,
                        `Chuvi: we collected ${order.counts.rider} item(s) for order ${order.oscNumber} (you booked ${order.counts.customer}). Your bill will be confirmed once we check them in.`,
                    )
                } catch (err) {
                    console.error('pickup count SMS failed:', err?.message)
                }
                try {
                    await notifyRoles({
                        roles: [ROLE.INTAKE_AND_TAG, ROLE.ADMIN],
                        title: 'Count changed at pickup',
                        body: `Order ${order.oscNumber}: rider collected ${order.counts.rider}, customer booked ${order.counts.customer}.`,
                        subBody: order.counts.riderReason,
                        type: NOTIFICATION_TYPE.ORDER_UPDATED,
                    })
                } catch (err) {
                    console.error('pickup count notify failed:', err?.message)
                }
            }

            // Processing clock (client correction 2026-10-08): the clothes are
            // now with us. If the order was already paid this is the LATER of
            // the two events, so the clock starts here — their case (a), paid
            // in the app. Non-fatal: a measurement must never fail a pickup.
            try {
                await markProductionClearedIfReady(order._id)
            } catch (err) {
                console.error('production clock (pickup) failed:', err?.message)
            }

            if (order.userId?._id) {
                await createNotification({
                    userId: order.userId._id,
                    title: 'Order Picked Up',
                    body: `Your order ${order.oscNumber} has been picked up and is on its way to us.`,
                    subBody: `Order ID: ${order.oscNumber}`,
                    type: NOTIFICATION_TYPE.PICKUP_STARTED,
                })
            }

            await notifyOperator({
                userId: userId,
                title: 'Pickup Completed',
                body: `Pickup for order ${order.oscNumber} has been marked as picked up.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.PICKUP_STARTED,
            })
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Order ${order.oscNumber} marked as picked up by rider`,
            })

            return BaseService.sendSuccessResponse({
                message: 'Order marked as picked up successfully',
            })
        } catch (error) {
            console.error('Error in markAsPickedUp:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async markPickupAsFailed(req) {
        try {
            const orderId = req.params.id
            const { phoneNumber, note = '' } = req.body
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })
            if (!phoneNumber)
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number is required',
                })

            const order = await BookOrderModel.findById(orderId).populate(
                'userId',
                'phoneNumber',
            )
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            if (order.dispatchDetails.pickup.rider?.toString() !== userId) {
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this pickup',
                })
            }

            const failableStatuses = [
                PICKUP_STATUS.SCHEDULED,
                PICKUP_STATUS.PICKUP_IN_PROGRESS,
            ]
            if (
                !failableStatuses.includes(order.dispatchDetails.pickup.status)
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Only scheduled or in-progress pickups can be marked as failed',
                })
            }
            const customerPhone = order.phoneNumber

            if (!customerPhone) {
                return BaseService.sendFailedResponse({
                    error: 'Customer phone number not found on order',
                })
            }

            if (normalizePhone(customerPhone) !== normalizePhone(phoneNumber)) {
                return BaseService.sendFailedResponse({
                    error: "Provided phone number does not match customer's phone number",
                })
            }

            order.dispatchDetails.pickup.status = PICKUP_STATUS.FAILED
            order.dispatchDetails.pickup.updatedAt = new Date()
            // `pickup.note` was not a schema path, so this reason was silently
            // discarded on every failed pickup (3.2). It has its own field now.
            order.dispatchDetails.pickup.failureNote = note
            order.markModified('dispatchDetails.pickup')
            await order.save()

            // Brief 3.2 — this used to notify `userId`, i.e. the RIDER who just
            // pressed the button, and nobody in the office. A failed pickup also
            // keeps its stage and its rider, so the order looked like a healthy
            // assigned run: nothing on any screen said it had failed and nobody
            // was told. The staff who have to re-book it get the message now.
            await notifyRoles({
                roles: [ROLE.INTAKE_AND_TAG, ROLE.CUSTOMER_EXPERIENCE, ROLE.ADMIN],
                title: 'Pickup Failed',
                body: `Pickup for order ${order.oscNumber} was marked as failed${note ? `. Note: ${note}` : ''}`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.PICKUP_FAILED,
            })
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Order ${order.oscNumber} marked as pickup failed by rider. Note: ${note}`,
            })

            return BaseService.sendSuccessResponse({
                message: 'Pickup marked as failed successfully',
            })
        } catch (error) {
            console.error('Error in markPickupAsFailed:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async startDelivery(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })

            const order = await BookOrderModel.findById(orderId)
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            if (order.dispatchDetails.delivery.rider?.toString() !== userId) {
                return BaseService.sendFailedResponse({
                    error: 'You are not assigned to this delivery',
                })
            }

            if (
                order.isDelivery &&
                order.dispatchDetails.delivery.status !== DELIVERY_STATUS.READY
            ) {
                return BaseService.sendFailedResponse({
                    error: 'Order is not ready for delivery',
                })
            }

            order.dispatchDetails.delivery.status =
                DELIVERY_STATUS.OUT_FOR_DELIVERY
            order.dispatchDetails.delivery.updatedAt = new Date()
            order.dispatchDetails.delivery.startedAt = new Date()
            await order.save()

            await BookOrderModel.updateOne(
                { _id: orderId },
                {
                    $set: {
                        'stage.status': ORDER_STATUS.OUT_FOR_DELIVERY,
                        'stage.updatedAt': new Date(),
                    },
                    $push: {
                        stageHistory: {
                            status: ORDER_STATUS.OUT_FOR_DELIVERY,
                            note: 'Out for delivery',
                            updatedAt: new Date(),
                        },
                    },
                },
            )

            await notifyOperator({
                userId: userId,
                title: 'Delivery Started',
                body: `Delivery for order ${order.oscNumber} has been started.`,
                subBody: `Order ID: ${order.oscNumber}`,
                type: NOTIFICATION_TYPE.DELIVERY_STARTED,
            })
            await createAuditLog({
                userId: getObjectId(userId),
                orderId,
                category: 'rider',
                action: `Delivery for order ${order.oscNumber} started by rider`,
            })

            return BaseService.sendSuccessResponse({
                message: 'Delivery started successfully',
            })
        } catch (error) {
            console.error('Error in startDelivery:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getHistoryList(req) {
        try {
            const riderId = req.user.id
            const user = await UserModel.findById(riderId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const {
                page = 1,
                limit = 20,
                search = '',
                startDate,
                endDate,
            } = req.query

            const query = {
                $or: [
                    {
                        'dispatchDetails.pickup.rider': riderId,
                        'dispatchDetails.pickup.status': {
                            $in: [
                                PICKUP_STATUS.PICKED_UP,
                                PICKUP_STATUS.FAILED,
                            ],
                        },
                    },
                    {
                        'dispatchDetails.delivery.rider': riderId,
                        'dispatchDetails.delivery.status': {
                            $in: [
                                DELIVERY_STATUS.DELIVERED,
                                DELIVERY_STATUS.FAILED,
                            ],
                        },
                    },
                ],
            }

            if (search) {
                query.$and = [
                    {
                        $or: [
                            { oscNumber: { $regex: search, $options: 'i' } },
                            { fullName: { $regex: search, $options: 'i' } },
                            { phoneNumber: { $regex: search, $options: 'i' } },
                        ],
                    },
                ]
            }

            if (startDate || endDate) {
                query['updatedAt'] = {}
                if (startDate)
                    query['updatedAt'].$gte = new Date(
                        new Date(startDate).setHours(0, 0, 0, 0),
                    )
                if (endDate)
                    query['updatedAt'].$lte = new Date(
                        new Date(endDate).setHours(23, 59, 59, 999),
                    )
            }

            const { data, pagination } = await paginate(BookOrderModel, query, {
                page,
                limit,
                sort: { updatedAt: -1 },
                select: 'oscNumber fullName phoneNumber serviceType serviceTier amount pickupAddress stage dispatchDetails createdAt updatedAt',
                lean: true,
            })

            const startOfToday = new Date()
            startOfToday.setHours(0, 0, 0, 0)

            const today = []
            const earlier = []

            for (const order of data) {
                normalizeOrderAddresses(order)
                // use the most recent dispatch action as anchor
                const deliveryUpdatedAt =
                    order.dispatchDetails?.delivery?.updatedAt
                const pickupUpdatedAt = order.dispatchDetails?.pickup?.updatedAt
                const completedAt =
                    deliveryUpdatedAt || pickupUpdatedAt || order.updatedAt

                if (new Date(completedAt) >= startOfToday) {
                    today.push(order)
                } else {
                    earlier.push(order)
                }
            }

            return BaseService.sendSuccessResponse({
                message: { today, earlier, pagination },
            })
        } catch (error) {
            console.error('Error in getHistoryList:', error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch history',
            })
        }
    }

    async getOrderDetails(req) {
        try {
            const orderId = req.params.id
            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })

            // `.lean()` is required, not cosmetic: `presentOrder` attaches
            // `deliveryPromise`, which is NOT a declared schema path, and
            // Mongoose silently drops an undeclared path on a hydrated document —
            // the field would simply never reach the rider.
            const order = await BookOrderModel.findById(orderId)
                .populate('userId', 'fullName email phoneNumber')
                .lean()
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            return BaseService.sendSuccessResponse({
                message: presentOrder(order),
            })
        } catch (error) {
            console.log('Error in getOrderDetails:', error)
            return BaseService.sendFailedResponse({
                error: 'Something went wrong. Please try again later',
            })
        }
    }

    async getOrderTimeline(req) {
        try {
            const orderId = req.params.id
            const userId = req.user.id

            if (!orderId)
                return BaseService.sendFailedResponse({
                    error: 'Order ID is required',
                })

            const user = await UserModel.findById(userId)
            if (!user)
                return BaseService.sendFailedResponse({
                    error: 'User not found',
                })

            const order = await BookOrderModel.findById(orderId).lean()
            if (!order)
                return BaseService.sendFailedResponse({
                    error: 'Order not found',
                })

            const skipWashingTypes = [
                'iron-only',
                'ironing-only',
                ORDER_SERVICE_TYPE.IRONING_ONLY,
            ]
            const skipIroningTypes = [
                'wash-only',
                'washing-only',
                ORDER_SERVICE_TYPE.WASHING_ONLY,
            ]

            const isIronOnly = skipWashingTypes.includes(order.serviceType)
            const isWashOnly = skipIroningTypes.includes(order.serviceType)

            const PIPELINE = [
                {
                    key: 'intake',
                    label: 'Intake',
                    completedBy: ORDER_STATUS.QUEUE,
                },
                {
                    key: 'tagged',
                    label: 'Tagged',
                    completedBy: ORDER_STATUS.SORT_AND_PRETREAT,
                },
                {
                    key: 'pretreated',
                    label: 'Pretreated',
                    completedBy: [ORDER_STATUS.WASHING, ORDER_STATUS.IRONING],
                },
                // washed — only show for non iron-only orders
                ...(!isIronOnly
                    ? [
                          {
                              key: 'washed',
                              label: 'Washed',
                              completedBy: [
                                  ORDER_STATUS.IRONING,
                                  ORDER_STATUS.READY,
                              ],
                          },
                      ]
                    : []),
                // ironing — only show for non wash-only orders
                ...(!isWashOnly
                    ? [
                          {
                              key: 'ironing',
                              label: 'Ironing',
                              completedBy: [
                                  ORDER_STATUS.QC,
                                  ORDER_STATUS.READY,
                              ],
                          },
                      ]
                    : []),
                {
                    key: 'qc_passed',
                    label: 'QC Passed',
                    completedBy: ORDER_STATUS.READY,
                },
                {
                    key: 'ready',
                    label: 'Ready',
                    completedBy: [
                        ORDER_STATUS.OUT_FOR_DELIVERY,
                        ORDER_STATUS.DELIVERED,
                    ],
                },
                {
                    key: 'delivered',
                    label: 'Delivered',
                    completedBy: ORDER_STATUS.DELIVERED,
                },
            ]

            const pipeline = PIPELINE.map((step) => {
                const completedByStatuses = Array.isArray(step.completedBy)
                    ? step.completedBy
                    : [step.completedBy]

                const matchingEntry = order.stageHistory?.find((h) =>
                    completedByStatuses.includes(h.status),
                )

                return {
                    key: step.key,
                    label: step.label,
                    completed: !!matchingEntry,
                    timestamp: matchingEntry?.updatedAt || null,
                }
            })

            const itemTimeline = []
            for (const item of order.items || []) {
                for (const log of item.actionLog || []) {
                    itemTimeline.push({
                        itemId: item._id,
                        itemType: item.type,
                        tagId: item.tagId,
                        action: log.action,
                        note: log.note || '',
                        timestamp: log.timestamp,
                    })
                }
            }
            itemTimeline.sort(
                (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
            )

            const trackingStatus =
                order.dispatchDetails?.delivery?.status ===
                DELIVERY_STATUS.DELIVERED
                    ? 'completed'
                    : order.dispatchDetails?.delivery?.status ===
                        DELIVERY_STATUS.FAILED
                      ? 'delivery_failed'
                      : order.dispatchDetails?.pickup?.status ===
                          PICKUP_STATUS.FAILED
                        ? 'pickup_failed'
                        : 'in_progress'

            return BaseService.sendSuccessResponse({
                message: {
                    order: buildTimelineOrderView(order, trackingStatus),
                    pipeline,
                    itemTimeline,
                },
            })
        } catch (error) {
            console.log(error)
            return BaseService.sendFailedResponse({
                error: 'Failed to fetch order timeline',
            })
        }
    }
}

module.exports = RiderService
