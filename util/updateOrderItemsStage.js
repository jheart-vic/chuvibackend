const BookOrderModel = require('../models/bookOrder.model')

async function updateOrderItemsStage({
    order,
    orderId,
    userId,

    itemIds = [],
    allItems = false,

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

    const targetItems = allItems
        ? order.items.filter(
              (item) => item[statusField] !== completedValue,
          )
        : order.items.filter(
              (item) =>
                  itemIds.includes(item._id.toString()) &&
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

    const allItemsCompleted = updatedOrder.items.every((item) =>
        completionCheck(item),
    )

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