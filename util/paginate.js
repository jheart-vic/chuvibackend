const paginate = async (model, query = {}, options = {}) => {
    let { page = 1, limit = 10, sort = { createdAt: -1 }, populate = "", select = "", lean = false } = options;

    page = parseInt(page);
    limit = parseInt(limit);

    const skip = (page - 1) * limit;

    let queryBuilder = model.find(query).sort(sort).skip(skip).limit(limit).populate(populate);
    if (select) queryBuilder = queryBuilder.select(select);
    if (lean) queryBuilder = queryBuilder.lean();

    const [data, total] = await Promise.all([
      queryBuilder,
      model.countDocuments(query),
    ]);

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