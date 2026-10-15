const paginate = async (model, query = {}, options = {}) => {
    let { page = 1, limit = 10, sort = { createdAt: -1 }, populate = "", select = "", lean = false, withPromise = false } = options;

    page = parseInt(page);
    limit = parseInt(limit);

    const skip = (page - 1) * limit;

    // V1 batch 3b (FE "Ready by"): station lists also carry the delivery date
    // and the customer's promise text (lean order rows only).
    if (withPromise && select) select = `${select} deliveryDate scheduling quickBooking`;

    let queryBuilder = model.find(query).sort(sort).skip(skip).limit(limit).populate(populate);
    if (select) queryBuilder = queryBuilder.select(select);
    if (lean) queryBuilder = queryBuilder.lean();

    const [data, total] = await Promise.all([
      queryBuilder,
      model.countDocuments(query),
    ]);
    if (withPromise && lean) {
      const { addDeliveryPromise } = require("./orderView");
      for (const row of data) addDeliveryPromise(row);
    }

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  };
  
  module.exports = paginate;