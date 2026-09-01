const BookOrderModel = require('../models/bookOrder.model')
const { stationOf } = require('./stationScope')

async function updateOrderItemsStage({
    order,
    orderId,
    userId,

    itemIds = [],
    allItems = false,

    // Split-flow: the CALLING station. Scopes every read/write below to the
    // items actually sitting there, so `allItems` means "all items at MY
    // station" — otherwise confirming "all" at wash would stamp items still
    // waiting at sort, letting them pass a station gate they never reached.
    station = null,

    statusField,
    completedValue,

    timestampField,
    operatorField,

    actionName,
    actionNote,

    orderStartedAtField,
    orderOperatorField,

    stationStatus,

    completionCheck,
}) {
    const now = new Date()

    const atMyStation = (item) => !station || stationOf(item) === station

    const targetItems = allItems
        ? order.items.filter(
              (item) =>
                  atMyStation(item) && item[statusField] !== completedValue,
          )
        : order.items.filter(
              (item) =>
                  itemIds.includes(item._id.toString()) &&
                  atMyStation(item) &&
                  item[statusField] !== completedValue,
          )

    if (!targetItems.length) {
        throw new Error('No valid items found')
    }

    await BookOrderModel.bulkWrite(
        targetItems.map((item) => ({
            updateOne: {
                filter: {
                    _id: orderId,
                    'items._id': item._id,
                },

                update: {
                    $set: {
                        [`items.$.${statusField}`]: completedValue,
                        [`items.$.${timestampField}`]: now,
                        [`items.$.${operatorField}`]: userId,
                    },

                    $push: {
                        'items.$.actionLog': {
                            action: actionName,
                            note: actionNote,
                            timestamp: now,
                        },
                    },
                },
            },
        })),
    )

    const updatedOrder = await BookOrderModel.findById(orderId).lean()

    // "All done" is scoped to this station too: a partial batch can finish here
    // while the rest of the order is still upstream. Order-wide, this never went
    // true for a split order, so the start timestamps below never got stamped.
    const scoped = station
        ? updatedOrder.items.filter((i) => stationOf(i) === station)
        : updatedOrder.items

    const allItemsCompleted =
        scoped.length > 0 && scoped.every((item) => completionCheck(item))

    if (
        allItemsCompleted &&
        orderStartedAtField &&
        orderOperatorField
    ) {
        await BookOrderModel.updateOne(
            { _id: orderId },
            {
                $set: {
                    [orderStartedAtField]: now,
                    [orderOperatorField]: userId,

                    ...(stationStatus && {
                        stationStatus,
                    }),
                },
            },
        )
    }

    return {
        updatedCount: targetItems.length,
        allItemsCompleted,
    }
}

module.exports = updateOrderItemsStage